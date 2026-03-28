<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Fix 2: ExamEditor.tsx</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0F172A; color: #E2E8F0; min-height: 100vh; }
  .header { background: #1D4ED8; padding: 16px 20px; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 12px rgba(0,0,0,.4); }
  .header-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  .fix-badge { background: rgba(255,255,255,.2); border: 1px solid rgba(255,255,255,.3); border-radius: 20px; padding: 3px 12px; font-size: 11px; font-weight: 800; letter-spacing: 1px; color: #fff; }
  .filename { font-size: 17px; font-weight: 800; color: #fff; }
  .fix-desc { font-size: 12px; color: rgba(255,255,255,.75); }
  .meta { display: flex; gap: 14px; font-size: 11px; color: rgba(255,255,255,.55); margin-top: 6px; }
  .copy-btn { background: #fff; color: #1D4ED8; border: none; border-radius: 12px; padding: 11px 22px; font-size: 14px; font-weight: 800; cursor: pointer; flex-shrink: 0; transition: transform .1s; }
  .copy-btn:active { transform: scale(.96); }
  .copy-btn.copied { background: #22C55E; color: #fff; }
  .path-bar { background: #1E293B; padding: 10px 20px; font-size: 11px; color: #64748B; font-family: monospace; border-bottom: 1px solid #334155; }
  .path-bar span { color: #94A3B8; }
  .code-wrap { padding: 20px; overflow-x: auto; }
  pre { font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.7; color: #CBD5E1; white-space: pre-wrap; word-break: break-all; }
  .bottom-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #1E293B; border-top: 1px solid #334155; padding: 12px 20px; display: flex; justify-content: center; }
  .bottom-copy { background: #1D4ED8; color: #fff; border: none; border-radius: 14px; padding: 14px 40px; font-size: 16px; font-weight: 800; cursor: pointer; width: 100%; max-width: 480px; transition: opacity .15s; }
  .bottom-copy:active { opacity: .8; }
  .bottom-copy.copied { background: #22C55E; }
  .code-wrap { padding-bottom: 80px; }
</style>
</head>
<body>

<div class="header">
  <div class="header-top">
    <div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span class="fix-badge">Fix 2</span>
        <span class="filename">ExamEditor.tsx</span>
      </div>
      <div class="fix-desc">ExamEditor — edit saves as new (verification + updated_at)</div>
    </div>
    <button class="copy-btn" id="topBtn" onclick="copyCode(this)">📋 Copy</button>
  </div>
  <div class="meta">
    <span>📁 78.1 KB</span>
    <span>📝 1418 lines</span>
  </div>
</div>

<div class="path-bar">Place at: <span>src/pages/admin/ExamEditor.tsx</span></div>

<div class="code-wrap">
  <pre id="codeBlock">import { useEffect, useState, useRef } from &quot;react&quot;;
import * as XLSX from &quot;xlsx&quot;;
import { useParams, useNavigate } from &quot;react-router-dom&quot;;
import { Button } from &quot;@/components/ui/button&quot;;
import { Input } from &quot;@/components/ui/input&quot;;
import { Textarea } from &quot;@/components/ui/textarea&quot;;
import { Card, CardContent, CardHeader, CardTitle } from &quot;@/components/ui/card&quot;;
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from &quot;@/components/ui/select&quot;;
import { Switch } from &quot;@/components/ui/switch&quot;;
import { Label } from &quot;@/components/ui/label&quot;;
import { Badge } from &quot;@/components/ui/badge&quot;;
import { Tabs, TabsContent, TabsList, TabsTrigger } from &quot;@/components/ui/tabs&quot;;
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from &quot;@/components/ui/dialog&quot;;
import { useLanguage } from &quot;@/contexts/LanguageContext&quot;;
import { useAuth } from &quot;@/contexts/AuthContext&quot;;
import { supabase } from &quot;@/integrations/supabase/client&quot;;
import { cn } from &quot;@/lib/utils&quot;;
import { useToast } from &quot;@/hooks/use-toast&quot;;
import { Plus, Trash2, Save, GripVertical, Music, FileText, Calendar, Settings2, Upload, Download, Image, Loader2, Eye, Library } from &quot;lucide-react&quot;;
import { Checkbox } from &quot;@/components/ui/checkbox&quot;;
import RichTextEditor from &quot;@/components/exam/RichTextEditor&quot;;
import { sanitizeHtml } from &quot;@/lib/sanitize&quot;;
import BulkQuestionFormatter, { DEFAULT_FORMAT, type ExamFormatSettings } from &quot;@/components/exam/BulkQuestionFormatter&quot;;

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
  audio_response_type: &quot;text&quot; | &quot;audio&quot;;
}

const emptyQuestion = (): QuestionForm =&gt; ({
  question_type: &quot;mcq&quot;,
  question_text: &quot;&quot;,
  question_text_ar: &quot;&quot;,
  options: [
    { id: &quot;a&quot;, text: &quot;&quot;, text_ar: &quot;&quot;, is_correct: false, image_url: &quot;&quot; },
    { id: &quot;b&quot;, text: &quot;&quot;, text_ar: &quot;&quot;, is_correct: false, image_url: &quot;&quot; },
    { id: &quot;c&quot;, text: &quot;&quot;, text_ar: &quot;&quot;, is_correct: false, image_url: &quot;&quot; },
    { id: &quot;d&quot;, text: &quot;&quot;, text_ar: &quot;&quot;, is_correct: false, image_url: &quot;&quot; },
  ],
  correct_answer: &quot;&quot;,
  accepted_answers: [&quot;&quot;],
  points: 1,
  difficulty: &quot;medium&quot;,
  sort_order: 0,
  explanation: &quot;&quot;,
  explanation_ar: &quot;&quot;,
  feedback_incorrect: &quot;&quot;,
  media_url: &quot;&quot;,
  matching_pairs: [{ left: &quot;&quot;, right: &quot;&quot; }, { left: &quot;&quot;, right: &quot;&quot; }],
  ordering_items: [&quot;&quot;, &quot;&quot;, &quot;&quot;],
  partial_credit: false,
  case_sensitive: false,
  min_words: 0,
  max_words: 0,
  question_timer_seconds: 0,
  background_image: &quot;&quot;,
  audio_response_type: &quot;text&quot; as &quot;text&quot; | &quot;audio&quot;,
});

const questionTypes = [
  // ── Standard ───────────────────────────────────────────────────
  { value: &quot;mcq&quot;,          label: &quot;Multiple Choice&quot;,    label_ar: &quot;اختيار من متعدد&quot;,      icon: &quot;📝&quot;, cat: &quot;Standard&quot; },
  { value: &quot;multi_select&quot;, label: &quot;Multi-Select&quot;,       label_ar: &quot;اختيار متعدد&quot;,          icon: &quot;☑️&quot;, cat: &quot;Standard&quot; },
  { value: &quot;true_false&quot;,   label: &quot;True / False&quot;,       label_ar: &quot;صح / خطأ&quot;,              icon: &quot;✓✗&quot;, cat: &quot;Standard&quot; },
  { value: &quot;short_answer&quot;, label: &quot;Short Answer&quot;,       label_ar: &quot;إجابة قصيرة&quot;,           icon: &quot;💬&quot;, cat: &quot;Standard&quot; },
  { value: &quot;essay&quot;,        label: &quot;Essay&quot;,              label_ar: &quot;مقال&quot;,                  icon: &quot;📄&quot;, cat: &quot;Standard&quot; },
  { value: &quot;fill_blank&quot;,   label: &quot;Fill in the Blank&quot;,  label_ar: &quot;ملء الفراغ&quot;,            icon: &quot;___&quot;, cat: &quot;Standard&quot; },
  // ── Media ──────────────────────────────────────────────────────
  { value: &quot;image_mcq&quot;,   label: &quot;Image Choice&quot;,        label_ar: &quot;اختيار بالصور&quot;,         icon: &quot;🖼️&quot;, cat: &quot;Media&quot; },
  { value: &quot;audio&quot;,        label: &quot;Audio / Dictation&quot;,  label_ar: &quot;صوت / إملاء&quot;,           icon: &quot;🎧&quot;, cat: &quot;Media&quot; },
  { value: &quot;drawing&quot;,      label: &quot;Drawing / Whiteboard&quot;,label_ar:&quot;رسم / لوحة بيضاء&quot;,     icon: &quot;✏️&quot;, cat: &quot;Media&quot; },
  // ── Interactive ────────────────────────────────────────────────
  { value: &quot;matching&quot;,     label: &quot;Matching (Drag &amp; Drop)&quot;, label_ar: &quot;مطابقة (سحب وإفلات)&quot;, icon: &quot;🔗&quot;, cat: &quot;Interactive&quot; },
  { value: &quot;ordering&quot;,     label: &quot;Ordering / Sequence&quot;,   label_ar: &quot;ترتيب / تسلسل&quot;,      icon: &quot;📋&quot;, cat: &quot;Interactive&quot; },
];

// Convert a Date to local datetime-local input format (YYYY-MM-DDTHH:MM)
const toLocalDatetimeString = (date: Date): string =&gt; {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, &quot;0&quot;);
  const d = String(date.getDate()).padStart(2, &quot;0&quot;);
  const h = String(date.getHours()).padStart(2, &quot;0&quot;);
  const min = String(date.getMinutes()).padStart(2, &quot;0&quot;);
  return `${y}-${m}-${d}T${h}:${min}`;
};

const ExamEditor = () =&gt; {
  const { examId } = useParams&lt;{ examId: string }&gt;();
  const isEdit = !!examId;
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef&lt;HTMLInputElement&gt;(null);
  const bulkFileInputRef = useRef&lt;HTMLInputElement&gt;(null);

  const [examForm, setExamForm] = useState({
    title: &quot;&quot;, title_ar: &quot;&quot;, description: &quot;&quot;, description_ar: &quot;&quot;,
    time_limit_minutes: 60, passing_score: 50, max_attempts: 1,
    randomize_questions: false, randomize_answers: false,
    show_results_immediately: true, allow_review: true,
    display_mode: &quot;one_at_a_time&quot;,
    guidelines: &quot;&quot;, guidelines_ar: &quot;&quot;,
    start_date: &quot;&quot;, end_date: &quot;&quot;,
    proctoring_enabled: false, fullscreen_required: false,
    tab_switch_limit: 3, max_warnings: 3,
    auto_submit_on_violation: false,
    screenshot_interval_seconds: 0,
    term: &quot;first&quot;,
    max_review_views: 1,
    type: &quot;exam&quot; as &quot;exam&quot; | &quot;test&quot;,
    level: &quot;&quot; as string,
  });
  const [questions, setQuestions] = useState&lt;QuestionForm[]&gt;([emptyQuestion()]);
  const [formatSettings, setFormatSettings] = useState&lt;ExamFormatSettings&gt;({ ...DEFAULT_FORMAT });
  const [saving, setSaving] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState&lt;number | null&gt;(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [bankQuestions, setBankQuestions] = useState&lt;any[]&gt;([]);
  const [bankSelected, setBankSelected] = useState&lt;Set&lt;string&gt;&gt;(new Set());
  const [bankSearch, setBankSearch] = useState(&quot;&quot;);
  const [bankLoading, setBankLoading] = useState(false);

  const openQuestionBank = async () =&gt; {
    setBankOpen(true);
    setBankLoading(true);
    setBankSelected(new Set());
    setBankSearch(&quot;&quot;);
    const { data } = await supabase.from(&quot;exam_questions&quot;).select(&quot;*, exams(title, title_ar)&quot;).order(&quot;created_at&quot;, { ascending: false });
    setBankQuestions(data || []);
    setBankLoading(false);
  };

  const importFromBank = () =&gt; {
    const selected = bankQuestions.filter((q) =&gt; bankSelected.has(q.id));
    const newQs: QuestionForm[] = selected.map((q, i) =&gt; ({
      question_type: q.question_type,
      question_text: q.question_text,
      question_text_ar: q.question_text_ar || &quot;&quot;,
      options: (q.options as any[]) || [],
      correct_answer: q.correct_answer || &quot;&quot;,
      points: q.points || 1,
      difficulty: q.difficulty || &quot;medium&quot;,
      sort_order: questions.length + i,
      explanation: q.explanation || &quot;&quot;,
      explanation_ar: q.explanation_ar || &quot;&quot;,
      media_url: q.media_url || &quot;&quot;,
    }));
    setQuestions((prev) =&gt; [...prev, ...newQs]);
    setBankOpen(false);
    toast({ title: t(`✅ Imported ${newQs.length} questions from bank!`, `✅ تم استيراد ${newQs.length} سؤال من البنك!`) });
  };

  useEffect(() =&gt; {
    if (!isEdit) return;
    const load = async () =&gt; {
      const { data: exam } = await supabase.from(&quot;exams&quot;).select(&quot;*&quot;).eq(&quot;id&quot;, examId).maybeSingle();
      if (exam) {
        setExamForm({
          title: exam.title || &quot;&quot;, title_ar: exam.title_ar || &quot;&quot;,
          description: exam.description || &quot;&quot;, description_ar: exam.description_ar || &quot;&quot;,
          time_limit_minutes: exam.time_limit_minutes || 60,
          passing_score: exam.passing_score || 50,
          max_attempts: exam.max_attempts || 1,
          randomize_questions: exam.randomize_questions || false,
          randomize_answers: exam.randomize_answers || false,
          show_results_immediately: exam.show_results_immediately ?? true,
          allow_review: exam.allow_review ?? true,
          display_mode: exam.display_mode || &quot;one_at_a_time&quot;,
          guidelines: exam.guidelines || &quot;&quot;, guidelines_ar: exam.guidelines_ar || &quot;&quot;,
          start_date: exam.start_date ? toLocalDatetimeString(new Date(exam.start_date)) : &quot;&quot;,
          end_date: exam.end_date ? toLocalDatetimeString(new Date(exam.end_date)) : &quot;&quot;,
          proctoring_enabled: (exam as any).proctoring_enabled || false,
          fullscreen_required: (exam as any).fullscreen_required || false,
          tab_switch_limit: (exam as any).tab_switch_limit || 3,
          max_warnings: (exam as any).max_warnings || 3,
          auto_submit_on_violation: (exam as any).auto_submit_on_violation || false,
          screenshot_interval_seconds: (exam as any).screenshot_interval_seconds || 0,
          term: (exam as any).term || &quot;first&quot;,
          max_review_views: (exam as any).max_review_views ?? 1,
          type: (exam as any).type || &quot;exam&quot;,
          level: (exam as any).level || &quot;&quot;,
        });
        // Load formatting settings
        setFormatSettings({
          question_font_size: (exam as any).question_font_size ?? 16,
          question_font_family: (exam as any).question_font_family ?? &quot;Cairo&quot;,
          question_alignment: (exam as any).question_alignment ?? &quot;left&quot;,
          question_bold: (exam as any).question_bold ?? false,
          question_italic: (exam as any).question_italic ?? false,
          options_font_size: (exam as any).options_font_size ?? 14,
          options_bold: (exam as any).options_bold ?? false,
          options_alignment: (exam as any).options_alignment ?? &quot;left&quot;,
          question_color: (exam as any).question_color ?? &quot;#1a1a1a&quot;,
          question_line_height: (exam as any).question_line_height ?? 1.7,
          question_padding: (exam as any).question_padding ?? 16,
          show_question_numbers: (exam as any).show_question_numbers ?? true,
          show_marks_per_question: (exam as any).show_marks_per_question ?? true,
          rtl_mode: (exam as any).rtl_mode ?? false,
        });
      }
      const { data: qs, error: qErr } = await supabase
        .from(&quot;exam_questions&quot;)
        .select(&quot;*&quot;)
        .eq(&quot;exam_id&quot;, examId)
        .order(&quot;sort_order&quot;);
      if (qErr) console.error(&quot;ExamEditor: failed to load questions&quot;, qErr);
      // Always set — removes the qs?.length guard that was hiding questions
      setQuestions((qs || []).map((q: any) =&gt; ({
        id: q.id,
        question_type: q.question_type || &quot;mcq&quot;,
        question_text: q.question_text || &quot;&quot;,
        question_text_ar: q.question_text_ar || &quot;&quot;,
        options: Array.isArray(q.options) ? q.options : [],
        correct_answer: q.correct_answer || &quot;&quot;,
        accepted_answers: Array.isArray(q.accepted_answers) ? q.accepted_answers : [&quot;&quot;],
        points: q.points || 10,
        difficulty: q.difficulty || &quot;medium&quot;,
        sort_order: q.sort_order ?? 0,
        explanation: q.explanation || &quot;&quot;,
        explanation_ar: q.explanation_ar || &quot;&quot;,
        feedback_incorrect: q.feedback_incorrect || &quot;&quot;,
        media_url: q.media_url || &quot;&quot;,
        matching_pairs: Array.isArray(q.matching_pairs) ? q.matching_pairs : [{ left: &quot;&quot;, right: &quot;&quot; }, { left: &quot;&quot;, right: &quot;&quot; }],
        ordering_items: Array.isArray(q.ordering_items) ? q.ordering_items : [&quot;&quot;, &quot;&quot;, &quot;&quot;],
        partial_credit: q.partial_credit || false,
        case_sensitive: q.case_sensitive || false,
        min_words: q.min_words || 0,
        max_words: q.max_words || 0,
        question_timer_seconds: q.question_timer_seconds || 0,
        background_image: q.background_image || &quot;&quot;,
        audio_response_type: q.audio_response_type || &quot;text&quot;,
      })));
    };
    load();
  }, [examId]);

  const handleSave = async () =&gt; {
    if (!examForm.title) {
      toast({ title: t(&quot;Error&quot;, &quot;خطأ&quot;), description: t(&quot;Title is required&quot;, &quot;العنوان مطلوب&quot;), variant: &quot;destructive&quot; });
      return;
    }
    setSaving(true);

    try {
      let eid = examId;
      if (isEdit) {
        const { error } = await supabase.from(&quot;exams&quot;).update({
          ...examForm,
          ...formatSettings,
          updated_at: new Date().toISOString(),   // FIX: explicit timestamp so DB reflects change
          start_date: examForm.start_date ? new Date(examForm.start_date).toISOString() : null,
          end_date: examForm.end_date ? new Date(examForm.end_date).toISOString() : null,
        } as any).eq(&quot;id&quot;, examId);
        if (error) throw error;
        // FIX: verify the update actually matched a row (catches silent RLS blocks)
        const { data: verify } = await supabase.from(&quot;exams&quot;).select(&quot;id&quot;).eq(&quot;id&quot;, examId).maybeSingle();
        if (!verify) throw new Error(&quot;Exam update failed — row not found. Check RLS permissions.&quot;);
      } else {
        const { data, error } = await supabase.from(&quot;exams&quot;).insert({
          ...examForm,
          ...formatSettings,
          created_by: user!.id,
          start_date: examForm.start_date ? new Date(examForm.start_date).toISOString() : null,
          end_date: examForm.end_date ? new Date(examForm.end_date).toISOString() : null,
        } as any).select(&quot;id&quot;).single();
        if (error) throw error;
        eid = data?.id;
      }

      if (eid) {
        if (isEdit) await supabase.from(&quot;exam_questions&quot;).delete().eq(&quot;exam_id&quot;, eid);
        const qInserts = questions.map((q, i) =&gt; ({
          exam_id: eid!,
          question_type: q.question_type,
          question_text: sanitizeHtml(q.question_text),
          question_text_ar: q.question_text_ar ? sanitizeHtml(q.question_text_ar) : null,
          options: [&quot;mcq&quot;, &quot;image_mcq&quot;, &quot;multi_select&quot;].includes(q.question_type) ? q.options : null,
          correct_answer: q.correct_answer || null,
          accepted_answers: q.accepted_answers?.filter(Boolean) || null,
          points: q.points,
          difficulty: q.difficulty,
          sort_order: i,
          explanation: q.explanation || null,
          explanation_ar: q.explanation_ar || null,
          feedback_incorrect: q.feedback_incorrect || null,
          media_url: q.media_url || null,
          matching_pairs: q.matching_pairs?.filter((p: any) =&gt; p.left || p.right) || null,
          ordering_items: q.ordering_items?.filter(Boolean) || null,
          partial_credit: q.partial_credit || false,
          case_sensitive: q.case_sensitive || false,
          min_words: q.min_words || 0,
          max_words: q.max_words || 0,
          question_timer_seconds: q.question_timer_seconds || 0,
          background_image: q.background_image || null,
          audio_response_type: q.audio_response_type || &quot;text&quot;,
        }));
        const { error } = await supabase.from(&quot;exam_questions&quot;).insert(qInserts);
        if (error) throw error;
      }

      toast({ title: t(&quot;✅ Exam saved!&quot;, &quot;✅ تم حفظ الامتحان!&quot;) });
      navigate(&quot;/admin/exams&quot;);
    } catch (err: any) {
      toast({ title: t(&quot;Error saving exam&quot;, &quot;خطأ في حفظ الامتحان&quot;), description: err.message, variant: &quot;destructive&quot; });
    } finally {
      setSaving(false);
    }
  };

  const addQuestion = () =&gt; setQuestions([...questions, { ...emptyQuestion(), sort_order: questions.length }]);
  const removeQuestion = (idx: number) =&gt; setQuestions(questions.filter((_, i) =&gt; i !== idx));
  const updateQuestion = (idx: number, updates: Partial&lt;QuestionForm&gt;) =&gt; {
    const copy = [...questions];
    copy[idx] = { ...copy[idx], ...updates };
    setQuestions(copy);
  };

  // Media upload handler
  const uploadMedia = async (file: File, questionIdx: number) =&gt; {
    setUploadingMedia(questionIdx);
    const ext = file.name.split(&quot;.&quot;).pop();
    const path = `questions/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { data, error } = await supabase.storage.from(&quot;exam-media&quot;).upload(path, file);
    if (error) {
      toast({ title: t(&quot;Upload failed&quot;, &quot;فشل الرفع&quot;), description: error.message, variant: &quot;destructive&quot; });
      setUploadingMedia(null);
      return;
    }

    const { data: urlData } = await supabase.storage.from(&quot;exam-media&quot;).createSignedUrl(path, 3600);
    updateQuestion(questionIdx, { media_url: urlData?.signedUrl || &#x27;&#x27; });
    toast({ title: t(&quot;✅ File uploaded!&quot;, &quot;✅ تم رفع الملف!&quot;) });
    setUploadingMedia(null);
  };

  // Upload image for an MCQ/image_mcq option
  const [uploadingOptionImage, setUploadingOptionImage] = useState&lt;string | null&gt;(null);
  const uploadOptionImage = async (file: File, questionIdx: number, optionIdx: number) =&gt; {
    const key = `${questionIdx}-${optionIdx}`;
    setUploadingOptionImage(key);
    const ext = file.name.split(&quot;.&quot;).pop();
    const path = `questions/options/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { data, error } = await supabase.storage.from(&quot;exam-media&quot;).upload(path, file);
    if (error) {
      toast({ title: t(&quot;Upload failed&quot;, &quot;فشل الرفع&quot;), description: error.message, variant: &quot;destructive&quot; });
      setUploadingOptionImage(null);
      return;
    }

    const { data: urlData } = await supabase.storage.from(&quot;exam-media&quot;).createSignedUrl(path, 3600);
    const newOpts = [...questions[questionIdx].options];
    newOpts[optionIdx] = { ...newOpts[optionIdx], image_url: urlData?.signedUrl || &#x27;&#x27; };
    updateQuestion(questionIdx, { options: newOpts });
    toast({ title: t(&quot;✅ Image uploaded!&quot;, &quot;✅ تم رفع الصورة!&quot;) });
    setUploadingOptionImage(null);
  };

  // Parse CSV line handling quoted fields (supports commas and Arabic inside quotes)
  const parseCSVLine = (line: string): string[] =&gt; {
    const result: string[] = [];
    let current = &quot;&quot;;
    let inQuotes = false;
    for (let i = 0; i &lt; line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === &#x27;&quot;&#x27;) {
          if (i + 1 &lt; line.length &amp;&amp; line[i + 1] === &#x27;&quot;&#x27;) {
            current += &#x27;&quot;&#x27;;
            i++; // skip escaped quote
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === &#x27;&quot;&#x27;) {
          inQuotes = true;
        } else if (ch === &#x27;,&#x27;) {
          result.push(current.trim());
          current = &quot;&quot;;
        } else {
          current += ch;
        }
      }
    }
    result.push(current.trim());
    return result;
  };

  // Map the QuestionType string from XLSX to our internal type
  const mapQuestionType = (raw: string): string =&gt; {
    if (!raw) return &quot;mcq&quot;;
    const lower = raw.toLowerCase().trim();
    if (lower.includes(&quot;multiple choice&quot;) || lower.includes(&quot;radiobutton&quot;) || lower.includes(&quot;dropdown&quot;)) return &quot;mcq&quot;;
    if (lower.includes(&quot;multiple correct&quot;) || lower.includes(&quot;all correct&quot;)) return &quot;mcq&quot;;
    if (lower.includes(&quot;true&quot;) || lower.includes(&quot;false&quot;) || lower.includes(&quot;yes/no&quot;)) return &quot;true_false&quot;;
    if (lower.includes(&quot;fill in&quot;) || lower.includes(&quot;fill_blank&quot;)) return &quot;fill_blank&quot;;
    if (lower.includes(&quot;essay&quot;)) return &quot;essay&quot;;
    if (lower.includes(&quot;audio&quot;)) return &quot;audio&quot;;
    if (lower.includes(&quot;short&quot;) || lower.includes(&quot;matching&quot;) || lower.includes(&quot;drag&quot;)) return &quot;short_answer&quot;;
    return &quot;mcq&quot;;
  };

  // Map DifficultyLevel number to string
  const mapDifficulty = (raw: any): string =&gt; {
    const val = String(raw).trim();
    if (val === &quot;1&quot;) return &quot;easy&quot;;
    if (val === &quot;2&quot;) return &quot;medium&quot;;
    if (val === &quot;3&quot;) return &quot;hard&quot;;
    if ([&quot;easy&quot;, &quot;medium&quot;, &quot;hard&quot;].includes(val)) return val;
    return &quot;medium&quot;;
  };

  // Convert XLSX row (Question.xlsx format) to QuestionForm
  const mapXlsxRow = (item: any, index: number): QuestionForm =&gt; {
    const q = emptyQuestion();
    // Map question type from XLSX column names
    const qType = item[&quot;QuestionType&quot;] || item[&quot;question_type&quot;] || item[&quot;type&quot;] || &quot;&quot;;
    q.question_type = mapQuestionType(qType);
    q.question_text = item[&quot;Question&quot;] || item[&quot;question_text&quot;] || item[&quot;question&quot;] || &quot;&quot;;
    q.question_text_ar = item[&quot;Question_ar&quot;] || item[&quot;question_text_ar&quot;] || item[&quot;question_ar&quot;] || &quot;&quot;;
    q.explanation = item[&quot;Explanation&quot;] || item[&quot;explanation&quot;] || &quot;&quot;;
    q.explanation_ar = item[&quot;Explanation_ar&quot;] || item[&quot;explanation_ar&quot;] || &quot;&quot;;
    q.points = Number(item[&quot;Marks&quot;] || item[&quot;points&quot;] || 1) || 1;
    q.difficulty = mapDifficulty(item[&quot;DifficultyLevel&quot;] || item[&quot;difficulty&quot;]);
    q.sort_order = index;

    // Collect answers from Answer1..Answer8 columns
    const answers: string[] = [];
    for (let i = 1; i &lt;= 8; i++) {
      const val = item[`Answer${i}`] || item[`answer${i}`] || &quot;&quot;;
      if (String(val).trim()) answers.push(String(val).trim());
    }

    // Parse correct answer index(es) — &quot;1&quot; means Answer1, &quot;1, 3&quot; means multiple
    const correctRaw = String(item[&quot;correctanswer&quot;] || item[&quot;correct_answer&quot;] || item[&quot;answer&quot;] || &quot;&quot;).trim();

    if (q.question_type === &quot;mcq&quot; &amp;&amp; answers.length &gt; 0) {
      const opts = answers.map((text, ai) =&gt; ({
        id: String.fromCharCode(97 + ai), // a, b, c, d...
        text,
        text_ar: item[`Answer${ai + 1}_ar`] || &quot;&quot;,
        is_correct: false,
      }));
      // Mark correct answers
      const correctIndices = correctRaw.split(&quot;,&quot;).map(s =&gt; parseInt(s.trim())).filter(n =&gt; !isNaN(n));
      correctIndices.forEach(ci =&gt; {
        if (ci &gt;= 1 &amp;&amp; ci &lt;= opts.length) opts[ci - 1].is_correct = true;
      });
      q.options = opts;
      // Set correct_answer letter for first correct
      const firstCorrect = opts.findIndex(o =&gt; o.is_correct);
      q.correct_answer = firstCorrect &gt;= 0 ? opts[firstCorrect].id : &quot;&quot;;
    } else if (q.question_type === &quot;true_false&quot;) {
      // Answer1 = TRUE, Answer2 = FALSE; correctanswer = 1 means TRUE
      const ci = parseInt(correctRaw);
      if (ci === 1) q.correct_answer = &quot;true&quot;;
      else if (ci === 2) q.correct_answer = &quot;false&quot;;
      else q.correct_answer = correctRaw.toLowerCase();
    } else if (q.question_type === &quot;fill_blank&quot; || q.question_type === &quot;short_answer&quot;) {
      // For fill in the blank, Answer1 is the correct answer
      q.correct_answer = answers[0] || correctRaw || &quot;&quot;;
    }

    return q;
  };

  // Bulk question import
  const handleBulkImport = (e: React.ChangeEvent&lt;HTMLInputElement&gt;) =&gt; {
    const file = e.target.files?.[0];
    if (!file) return;

    const isExcel = file.name.match(/\.xlsx?$/i);

    if (isExcel) {
      // XLSX import using SheetJS
      const reader = new FileReader();
      reader.onload = (ev) =&gt; {
        try {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: &quot;array&quot; });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows: any[] = XLSX.utils.sheet_to_json(firstSheet, { defval: &quot;&quot; });

          // Filter out empty rows (no Question text)
          const validRows = rows.filter(r =&gt; r[&quot;Question&quot;] || r[&quot;question_text&quot;] || r[&quot;question&quot;]);
          const newQuestions = validRows.map((row, i) =&gt; mapXlsxRow(row, questions.length + i));

          if (newQuestions.length === 0) {
            toast({ title: t(&quot;No questions found&quot;, &quot;لم يتم العثور على أسئلة&quot;), description: t(&quot;Make sure your file has a &#x27;Question&#x27; column&quot;, &quot;تأكد أن الملف يحتوي على عمود &#x27;Question&#x27;&quot;), variant: &quot;destructive&quot; });
            return;
          }

          setQuestions(prev =&gt; [...prev, ...newQuestions]);
          toast({ title: t(`✅ Imported ${newQuestions.length} questions!`, `✅ تم استيراد ${newQuestions.length} سؤال!`) });
        } catch (err: any) {
          console.error(&quot;XLSX import error:&quot;, err);
          toast({ title: t(&quot;Import failed&quot;, &quot;فشل الاستيراد&quot;), description: err.message, variant: &quot;destructive&quot; });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // CSV / JSON import
      const reader = new FileReader();
      reader.onload = (ev) =&gt; {
        try {
          const text = ev.target?.result as string;
          let imported: any[];

          if (file.name.endsWith(&quot;.json&quot;)) {
            imported = JSON.parse(text);
          } else {
            const lines = text.split(&quot;\n&quot;).map(l =&gt; l.trim()).filter(Boolean);
            const headers = parseCSVLine(lines[0]);
            imported = lines.slice(1).map(line =&gt; {
              const vals = parseCSVLine(line);
              const obj: any = {};
              headers.forEach((h, i) =&gt; { obj[h] = vals[i] || &quot;&quot;; });
              return obj;
            });
          }

          const newQuestions: QuestionForm[] = imported.map((item: any, i: number) =&gt; mapXlsxRow(item, questions.length + i));

          setQuestions(prev =&gt; [...prev, ...newQuestions]);
          toast({ title: t(`✅ Imported ${newQuestions.length} questions!`, `✅ تم استيراد ${newQuestions.length} سؤال!`) });
        } catch (err: any) {
          console.error(&quot;Bulk import error:&quot;, err);
          toast({ title: t(&quot;Import failed&quot;, &quot;فشل الاستيراد&quot;), description: err.message || t(&quot;Invalid file format&quot;, &quot;تنسيق الملف غير صالح&quot;), variant: &quot;destructive&quot; });
        }
      };
      reader.readAsText(file, &quot;UTF-8&quot;);
    }
    e.target.value = &quot;&quot;;
  };

  // Download template
  const downloadTemplate = (format: &quot;csv&quot; | &quot;json&quot;) =&gt; {
    if (format === &quot;json&quot;) {
      const template = [
        {
          question_type: &quot;mcq&quot;,
          question_text: &quot;What is the Arabic word for &#x27;book&#x27;?&quot;,
          question_text_ar: &quot;ما هي الكلمة العربية لـ &#x27;كتاب&#x27;؟&quot;,
          option_a: &quot;كِتَاب&quot;, option_a_ar: &quot;كِتَاب&quot;,
          option_b: &quot;قَلَم&quot;, option_b_ar: &quot;قَلَم&quot;,
          option_c: &quot;بَاب&quot;, option_c_ar: &quot;بَاب&quot;,
          option_d: &quot;مَاء&quot;, option_d_ar: &quot;مَاء&quot;,
          correct_answer: &quot;a&quot;,
          points: 1, difficulty: &quot;easy&quot;,
          explanation: &quot;كِتَاب means book&quot;, explanation_ar: &quot;كِتَاب تعني كتاب&quot;
        },
        {
          question_type: &quot;true_false&quot;,
          question_text: &quot;The Arabic alphabet has 28 letters.&quot;,
          question_text_ar: &quot;الأبجدية العربية تتكون من 28 حرفًا.&quot;,
          correct_answer: &quot;true&quot;,
          points: 1, difficulty: &quot;easy&quot;,
          explanation: &quot;&quot;, explanation_ar: &quot;&quot;
        },
        {
          question_type: &quot;fill_blank&quot;,
          question_text: &quot;The word for &#x27;peace&#x27; in Arabic is ___.&quot;,
          question_text_ar: &quot;كلمة &#x27;سلام&#x27; بالعربية هي ___.&quot;,
          correct_answer: &quot;سَلَام&quot;,
          points: 2, difficulty: &quot;medium&quot;,
          explanation: &quot;&quot;, explanation_ar: &quot;&quot;
        },
        {
          question_type: &quot;short_answer&quot;,
          question_text: &quot;Write a sentence using the word &#x27;مَدْرَسَة&#x27;.&quot;,
          question_text_ar: &quot;اكتب جملة باستخدام كلمة &#x27;مَدْرَسَة&#x27;.&quot;,
          correct_answer: &quot;&quot;,
          points: 3, difficulty: &quot;medium&quot;,
          explanation: &quot;&quot;, explanation_ar: &quot;&quot;
        }
      ];
      const blob = new Blob([JSON.stringify(template, null, 2)], { type: &quot;application/json&quot; });
      const url = URL.createObjectURL(blob);
      const a = document.createElement(&quot;a&quot;); a.href = url; a.download = &quot;questions_template.json&quot;; a.click();
    } else {
      const csv = `question_type,question_text,question_text_ar,option_a,option_a_ar,option_b,option_b_ar,option_c,option_c_ar,option_d,option_d_ar,correct_answer,points,difficulty,explanation,explanation_ar
mcq,&quot;What is &#x27;book&#x27; in Arabic?&quot;,&quot;ما هي كلمة &#x27;كتاب&#x27; بالعربية؟&quot;,&quot;كِتَاب&quot;,&quot;كِتَاب&quot;,&quot;قَلَم&quot;,&quot;قَلَم&quot;,&quot;بَاب&quot;,&quot;بَاب&quot;,&quot;مَاء&quot;,&quot;مَاء&quot;,a,1,easy,&quot;كِتَاب means book&quot;,&quot;كِتَاب تعني كتاب&quot;
true_false,&quot;Arabic is written right to left.&quot;,&quot;العربية تُكتب من اليمين لليسار.&quot;,,,,,,,,,,true,1,easy,&quot;&quot;,&quot;&quot;
fill_blank,&quot;The word for &#x27;water&#x27; is ___.&quot;,&quot;كلمة &#x27;ماء&#x27; هي ___.&quot;,,,,,,,,,,مَاء,2,medium,&quot;&quot;,&quot;&quot;`;
      const bom = &quot;\uFEFF&quot;; // UTF-8 BOM for Excel Arabic support
      const blob = new Blob([bom + csv], { type: &quot;text/csv;charset=utf-8&quot; });
      const url = URL.createObjectURL(blob);
      const a = document.createElement(&quot;a&quot;); a.href = url; a.download = &quot;questions_template.csv&quot;; a.click();
    }
  };

  return (
    &lt;div className=&quot;container mx-auto px-4 py-8&quot;&gt;
      &lt;div className=&quot;mb-6 flex items-center justify-between flex-wrap gap-3&quot;&gt;
        &lt;h1 className=&quot;text-3xl font-bold&quot;&gt;{isEdit ? t(&quot;Edit Exam&quot;, &quot;تعديل الامتحان&quot;) : t(&quot;Create Exam&quot;, &quot;إنشاء امتحان&quot;)}&lt;/h1&gt;
        &lt;Button onClick={handleSave} disabled={saving} size=&quot;lg&quot;&gt;
          {saving ? &lt;Loader2 className=&quot;mr-2 h-4 w-4 animate-spin&quot; /&gt; : &lt;Save className=&quot;mr-2 h-4 w-4&quot; /&gt;}
          {examForm.type === &quot;test&quot; ? t(&quot;Save Test&quot;, &quot;حفظ التمرين&quot;) : t(&quot;Save Exam&quot;, &quot;حفظ الامتحان&quot;)}
        &lt;/Button&gt;
      &lt;/div&gt;

      &lt;Tabs defaultValue=&quot;settings&quot; className=&quot;space-y-6&quot;&gt;
        &lt;TabsList className=&quot;w-full grid grid-cols-4&quot;&gt;
          &lt;TabsTrigger value=&quot;settings&quot; className=&quot;gap-2&quot;&gt;&lt;Settings2 className=&quot;h-4 w-4&quot; /&gt;{t(&quot;Settings&quot;, &quot;الإعدادات&quot;)}&lt;/TabsTrigger&gt;
          &lt;TabsTrigger value=&quot;proctoring&quot; className=&quot;gap-2&quot;&gt;🛡️ {t(&quot;Proctoring&quot;, &quot;المراقبة&quot;)}&lt;/TabsTrigger&gt;
          &lt;TabsTrigger value=&quot;schedule&quot; className=&quot;gap-2&quot;&gt;&lt;Calendar className=&quot;h-4 w-4&quot; /&gt;{t(&quot;Schedule&quot;, &quot;الجدولة&quot;)}&lt;/TabsTrigger&gt;
          &lt;TabsTrigger value=&quot;questions&quot; className=&quot;gap-2&quot;&gt;&lt;FileText className=&quot;h-4 w-4&quot; /&gt;{t(&quot;Questions&quot;, &quot;الأسئلة&quot;)} ({questions.length})&lt;/TabsTrigger&gt;
        &lt;/TabsList&gt;

        {/* Settings Tab */}
        &lt;TabsContent value=&quot;settings&quot;&gt;
          &lt;Card&gt;
            &lt;CardHeader&gt;&lt;CardTitle&gt;{t(&quot;Exam Details&quot;, &quot;تفاصيل الامتحان&quot;)}&lt;/CardTitle&gt;&lt;/CardHeader&gt;
            &lt;CardContent className=&quot;space-y-4&quot;&gt;
              {/* Type Selector */}
              &lt;div className=&quot;rounded-lg border-2 border-dashed p-4&quot;&gt;
                &lt;Label className=&quot;text-base font-semibold mb-3 block&quot;&gt;{t(&quot;Type&quot;, &quot;النوع&quot;)}&lt;/Label&gt;
                &lt;div className=&quot;grid grid-cols-2 gap-3&quot;&gt;
                  {[
                    { value: &quot;exam&quot; as const, label: t(&quot;Exam / امتحان&quot;, &quot;امتحان / Exam&quot;), marks: 70, color: &quot;border-primary bg-primary/5&quot; },
                    { value: &quot;test&quot; as const, label: t(&quot;Test / تمرين&quot;, &quot;تمرين / Test&quot;), marks: 30, color: &quot;border-amber-500 bg-amber-500/5&quot; },
                  ].map((opt) =&gt; (
                    &lt;button
                      key={opt.value}
                      type=&quot;button&quot;
                      onClick={() =&gt; setExamForm({ ...examForm, type: opt.value })}
                      className={`rounded-lg border-2 p-4 text-start transition-all ${examForm.type === opt.value ? opt.color : &quot;border-border hover:border-muted-foreground/30&quot;}`}
                    &gt;
                      &lt;p className=&quot;font-semibold text-sm&quot;&gt;{opt.label}&lt;/p&gt;
                      &lt;p className=&quot;text-xs text-muted-foreground mt-1&quot;&gt;{t(`Max ${opt.marks} marks`, `${opt.marks} درجة كحد أقصى`)}&lt;/p&gt;
                    &lt;/button&gt;
                  ))}
                &lt;/div&gt;
              &lt;/div&gt;

              {/* Level Selector */}
              &lt;div&gt;
                &lt;Label&gt;{t(&quot;Level&quot;, &quot;المستوى&quot;)}&lt;/Label&gt;
                &lt;Select value={examForm.level || &quot;none&quot;} onValueChange={(v) =&gt; setExamForm({ ...examForm, level: v === &quot;none&quot; ? &quot;&quot; : v })}&gt;
                  &lt;SelectTrigger className=&quot;mt-1&quot;&gt;&lt;SelectValue placeholder={t(&quot;Select level&quot;, &quot;اختر المستوى&quot;)} /&gt;&lt;/SelectTrigger&gt;
                  &lt;SelectContent&gt;
                    &lt;SelectItem value=&quot;none&quot;&gt;{t(&quot;All Levels&quot;, &quot;جميع المستويات&quot;)}&lt;/SelectItem&gt;
                    &lt;SelectItem value=&quot;beginner&quot;&gt;{t(&quot;Beginner / مبتدئ&quot;, &quot;مبتدئ / Beginner&quot;)}&lt;/SelectItem&gt;
                    &lt;SelectItem value=&quot;intermediate&quot;&gt;{t(&quot;Intermediate / متوسط&quot;, &quot;متوسط / Intermediate&quot;)}&lt;/SelectItem&gt;
                    &lt;SelectItem value=&quot;advanced&quot;&gt;{t(&quot;Advanced / متقدم&quot;, &quot;متقدم / Advanced&quot;)}&lt;/SelectItem&gt;
                  &lt;/SelectContent&gt;
                &lt;/Select&gt;
              &lt;/div&gt;

              &lt;div className=&quot;grid gap-4 md:grid-cols-2&quot;&gt;
                &lt;div&gt;
                  &lt;Label&gt;{t(&quot;Title (English)&quot;, &quot;العنوان (إنجليزي)&quot;)}&lt;/Label&gt;
                  &lt;Input value={examForm.title} onChange={(e) =&gt; setExamForm({ ...examForm, title: e.target.value })} className=&quot;mt-1&quot; /&gt;
                &lt;/div&gt;
                &lt;div&gt;
                  &lt;Label&gt;{t(&quot;Title (Arabic)&quot;, &quot;العنوان (عربي)&quot;)}&lt;/Label&gt;
                  &lt;Input value={examForm.title_ar} onChange={(e) =&gt; setExamForm({ ...examForm, title_ar: e.target.value })} dir=&quot;rtl&quot; className=&quot;mt-1&quot; /&gt;
                &lt;/div&gt;
              &lt;/div&gt;
              &lt;div className=&quot;grid gap-4 md:grid-cols-2&quot;&gt;
                &lt;div&gt;
                  &lt;Label&gt;{t(&quot;Description&quot;, &quot;الوصف&quot;)}&lt;/Label&gt;
                  &lt;Textarea value={examForm.description} onChange={(e) =&gt; setExamForm({ ...examForm, description: e.target.value })} className=&quot;mt-1&quot; /&gt;
                &lt;/div&gt;
                &lt;div&gt;
                  &lt;Label&gt;{t(&quot;Description (Arabic)&quot;, &quot;الوصف (عربي)&quot;)}&lt;/Label&gt;
                  &lt;Textarea value={examForm.description_ar} onChange={(e) =&gt; setExamForm({ ...examForm, description_ar: e.target.value })} dir=&quot;rtl&quot; className=&quot;mt-1&quot; /&gt;
                &lt;/div&gt;
              &lt;/div&gt;
              &lt;div className=&quot;grid gap-4 md:grid-cols-5&quot;&gt;
                &lt;div&gt;
                  &lt;Label&gt;{t(&quot;Time Limit (min)&quot;, &quot;الحد الزمني (دقيقة)&quot;)}&lt;/Label&gt;
                  &lt;Input type=&quot;number&quot; value={examForm.time_limit_minutes} onChange={(e) =&gt; setExamForm({ ...examForm, time_limit_minutes: +e.target.value })} className=&quot;mt-1&quot; /&gt;
                &lt;/div&gt;
                &lt;div&gt;
                  &lt;Label&gt;{t(&quot;Passing Score (%)&quot;, &quot;درجة النجاح (%)&quot;)}&lt;/Label&gt;
                  &lt;Input type=&quot;number&quot; value={examForm.passing_score} onChange={(e) =&gt; setExamForm({ ...examForm, passing_score: +e.target.value })} className=&quot;mt-1&quot; /&gt;
                &lt;/div&gt;
                &lt;div&gt;
                  &lt;Label&gt;{t(&quot;Max Attempts&quot;, &quot;أقصى محاولات&quot;)}&lt;/Label&gt;
                  &lt;Input type=&quot;number&quot; value={examForm.max_attempts} onChange={(e) =&gt; setExamForm({ ...examForm, max_attempts: +e.target.value })} className=&quot;mt-1&quot; min={1} /&gt;
                &lt;/div&gt;
                &lt;div&gt;
                  &lt;Label&gt;{t(&quot;Display Mode&quot;, &quot;وضع العرض&quot;)}&lt;/Label&gt;
                  &lt;Select value={examForm.display_mode} onValueChange={(v) =&gt; setExamForm({ ...examForm, display_mode: v })}&gt;
                    &lt;SelectTrigger className=&quot;mt-1&quot;&gt;&lt;SelectValue /&gt;&lt;/SelectTrigger&gt;
                    &lt;SelectContent&gt;
                      &lt;SelectItem value=&quot;one_at_a_time&quot;&gt;{t(&quot;One at a time&quot;, &quot;واحد في كل مرة&quot;)}&lt;/SelectItem&gt;
                      &lt;SelectItem value=&quot;all_at_once&quot;&gt;{t(&quot;All at once&quot;, &quot;الكل مرة واحدة&quot;)}&lt;/SelectItem&gt;
                    &lt;/SelectContent&gt;
                  &lt;/Select&gt;
                &lt;/div&gt;
                &lt;div&gt;
                  &lt;Label&gt;{t(&quot;Term&quot;, &quot;الفصل الدراسي&quot;)}&lt;/Label&gt;
                  &lt;Select value={examForm.term} onValueChange={(v) =&gt; setExamForm({ ...examForm, term: v })}&gt;
                    &lt;SelectTrigger className=&quot;mt-1&quot;&gt;&lt;SelectValue /&gt;&lt;/SelectTrigger&gt;
                    &lt;SelectContent&gt;
                      &lt;SelectItem value=&quot;first&quot;&gt;{t(&quot;First Term / الفصل الأول&quot;, &quot;الفصل الأول / First Term&quot;)}&lt;/SelectItem&gt;
                      &lt;SelectItem value=&quot;second&quot;&gt;{t(&quot;Second Term / الفصل الثاني&quot;, &quot;الفصل الثاني / Second Term&quot;)}&lt;/SelectItem&gt;
                      &lt;SelectItem value=&quot;third&quot;&gt;{t(&quot;Third Term / الفصل الثالث&quot;, &quot;الفصل الثالث / Third Term&quot;)}&lt;/SelectItem&gt;
                    &lt;/SelectContent&gt;
                  &lt;/Select&gt;
                &lt;/div&gt;
              &lt;/div&gt;
              &lt;div className=&quot;grid gap-4 md:grid-cols-2&quot;&gt;
                &lt;div&gt;
                  &lt;Label&gt;{t(&quot;Guidelines (English)&quot;, &quot;الإرشادات (إنجليزي)&quot;)}&lt;/Label&gt;
                  &lt;Textarea value={examForm.guidelines} onChange={(e) =&gt; setExamForm({ ...examForm, guidelines: e.target.value })} className=&quot;mt-1&quot; /&gt;
                &lt;/div&gt;
                &lt;div&gt;
                  &lt;Label&gt;{t(&quot;Guidelines (Arabic)&quot;, &quot;الإرشادات (عربي)&quot;)}&lt;/Label&gt;
                  &lt;Textarea value={examForm.guidelines_ar} onChange={(e) =&gt; setExamForm({ ...examForm, guidelines_ar: e.target.value })} dir=&quot;rtl&quot; className=&quot;mt-1&quot; /&gt;
                &lt;/div&gt;
              &lt;/div&gt;
              &lt;div className=&quot;flex flex-wrap gap-6 pt-2&quot;&gt;
                {[
                  { key: &quot;randomize_questions&quot;, label: t(&quot;Randomize Questions&quot;, &quot;ترتيب عشوائي للأسئلة&quot;) },
                  { key: &quot;randomize_answers&quot;, label: t(&quot;Randomize Answers&quot;, &quot;ترتيب عشوائي للإجابات&quot;) },
                  { key: &quot;show_results_immediately&quot;, label: t(&quot;Show Results Immediately&quot;, &quot;عرض النتائج فورًا&quot;) },
                  { key: &quot;allow_review&quot;, label: t(&quot;Allow Review&quot;, &quot;السماح بالمراجعة&quot;) },
                ].map((s) =&gt; (
                  &lt;div key={s.key} className=&quot;flex items-center gap-2&quot;&gt;
                    &lt;Switch checked={(examForm as any)[s.key]} onCheckedChange={(v) =&gt; setExamForm({ ...examForm, [s.key]: v })} /&gt;
                    &lt;Label className=&quot;text-sm&quot;&gt;{s.label}&lt;/Label&gt;
                  &lt;/div&gt;
                ))}
              &lt;/div&gt;
              {examForm.allow_review &amp;&amp; (
                &lt;div className=&quot;flex items-center gap-3 pt-2&quot;&gt;
                  &lt;Label className=&quot;text-sm whitespace-nowrap&quot;&gt;{t(&quot;Max Review Views&quot;, &quot;الحد الأقصى لمرات المراجعة&quot;)}&lt;/Label&gt;
                  &lt;Input
                    type=&quot;number&quot;
                    min={1}
                    max={100}
                    className=&quot;w-24&quot;
                    value={examForm.max_review_views}
                    onChange={(e) =&gt; setExamForm({ ...examForm, max_review_views: parseInt(e.target.value) || 1 })}
                  /&gt;
                  &lt;span className=&quot;text-xs text-muted-foreground&quot;&gt;{t(&quot;times&quot;, &quot;مرات&quot;)}&lt;/span&gt;
                &lt;/div&gt;
              )}
            &lt;/CardContent&gt;
          &lt;/Card&gt;
        &lt;/TabsContent&gt;

        {/* Proctoring Tab */}
        &lt;TabsContent value=&quot;proctoring&quot;&gt;
          &lt;Card&gt;
            &lt;CardHeader&gt;&lt;CardTitle&gt;🛡️ {t(&quot;Proctoring Settings&quot;, &quot;إعدادات المراقبة&quot;)}&lt;/CardTitle&gt;&lt;/CardHeader&gt;
            &lt;CardContent className=&quot;space-y-4&quot;&gt;
              &lt;div className=&quot;flex flex-wrap gap-6&quot;&gt;
                {[
                  { key: &quot;proctoring_enabled&quot;, label: t(&quot;Enable Proctoring&quot;, &quot;تفعيل المراقبة&quot;) },
                  { key: &quot;fullscreen_required&quot;, label: t(&quot;Require Fullscreen&quot;, &quot;إلزام ملء الشاشة&quot;) },
                  { key: &quot;auto_submit_on_violation&quot;, label: t(&quot;Auto-Submit on Max Violations&quot;, &quot;تقديم تلقائي عند الحد الأقصى&quot;) },
                ].map((s) =&gt; (
                  &lt;div key={s.key} className=&quot;flex items-center gap-2&quot;&gt;
                    &lt;Switch checked={(examForm as any)[s.key]} onCheckedChange={(v) =&gt; setExamForm({ ...examForm, [s.key]: v })} /&gt;
                    &lt;Label className=&quot;text-sm&quot;&gt;{s.label}&lt;/Label&gt;
                  &lt;/div&gt;
                ))}
              &lt;/div&gt;
              &lt;div className=&quot;grid gap-4 md:grid-cols-3&quot;&gt;
                &lt;div&gt;
                  &lt;Label&gt;{t(&quot;Tab Switch Limit&quot;, &quot;حد تبديل النوافذ&quot;)}&lt;/Label&gt;
                  &lt;Input type=&quot;number&quot; value={examForm.tab_switch_limit} onChange={(e) =&gt; setExamForm({ ...examForm, tab_switch_limit: +e.target.value })} className=&quot;mt-1&quot; min={1} /&gt;
                &lt;/div&gt;
                &lt;div&gt;
                  &lt;Label&gt;{t(&quot;Max Warnings&quot;, &quot;أقصى تحذيرات&quot;)}&lt;/Label&gt;
                  &lt;Input type=&quot;number&quot; value={examForm.max_warnings} onChange={(e) =&gt; setExamForm({ ...examForm, max_warnings: +e.target.value })} className=&quot;mt-1&quot; min={1} /&gt;
                &lt;/div&gt;
                &lt;div&gt;
                  &lt;Label&gt;{t(&quot;Screenshot Interval (sec, 0=off)&quot;, &quot;فترة لقطة الشاشة (ثانية، 0=إيقاف)&quot;)}&lt;/Label&gt;
                  &lt;Input type=&quot;number&quot; value={examForm.screenshot_interval_seconds} onChange={(e) =&gt; setExamForm({ ...examForm, screenshot_interval_seconds: +e.target.value })} className=&quot;mt-1&quot; min={0} /&gt;
                &lt;/div&gt;
              &lt;/div&gt;
              &lt;p className=&quot;text-sm text-muted-foreground&quot;&gt;
                {t(
                  &quot;When proctoring is enabled, students will be monitored for tab switches, fullscreen exits, copy/paste, right-click, and developer tools usage. All violations are logged with timestamps.&quot;,
                  &quot;عند تفعيل المراقبة، ستتم مراقبة الطلاب لتبديل النوافذ، الخروج من ملء الشاشة، النسخ/اللصق، النقر بزر الماوس الأيمن، واستخدام أدوات المطور. يتم تسجيل جميع المخالفات مع الطوابع الزمنية.&quot;
                )}
              &lt;/p&gt;
            &lt;/CardContent&gt;
          &lt;/Card&gt;
        &lt;/TabsContent&gt;

        {/* Schedule Tab */}
        &lt;TabsContent value=&quot;schedule&quot;&gt;
          &lt;Card&gt;
            &lt;CardHeader&gt;&lt;CardTitle&gt;{t(&quot;Exam Schedule&quot;, &quot;جدول الامتحان&quot;)}&lt;/CardTitle&gt;&lt;/CardHeader&gt;
            &lt;CardContent className=&quot;space-y-4&quot;&gt;
              &lt;div className=&quot;grid gap-4 md:grid-cols-2&quot;&gt;
                &lt;div&gt;
                  &lt;Label&gt;{t(&quot;Start Date &amp; Time&quot;, &quot;تاريخ ووقت البدء&quot;)}&lt;/Label&gt;
                  &lt;Input type=&quot;datetime-local&quot; value={examForm.start_date} onChange={(e) =&gt; setExamForm({ ...examForm, start_date: e.target.value })} className=&quot;mt-1&quot; /&gt;
                &lt;/div&gt;
                &lt;div&gt;
                  &lt;Label&gt;{t(&quot;End Date &amp; Time&quot;, &quot;تاريخ ووقت الانتهاء&quot;)}&lt;/Label&gt;
                  &lt;Input type=&quot;datetime-local&quot; value={examForm.end_date} onChange={(e) =&gt; setExamForm({ ...examForm, end_date: e.target.value })} className=&quot;mt-1&quot; /&gt;
                &lt;/div&gt;
              &lt;/div&gt;
              &lt;p className=&quot;text-sm text-muted-foreground&quot;&gt;
                {t(
                  &quot;Set the window during which students can take this exam. Leave blank for no restrictions. Times are in your local timezone.&quot;,
                  &quot;حدد النافذة الزمنية التي يمكن للطلاب فيها أداء هذا الامتحان. اتركها فارغة بدون قيود. الأوقات بتوقيتك المحلي.&quot;
                )}
              &lt;/p&gt;
              {(examForm.start_date || examForm.end_date) &amp;&amp; (
                &lt;div className=&quot;rounded-lg border bg-accent/30 p-3 text-sm space-y-1&quot;&gt;
                  &lt;p className=&quot;font-medium text-xs text-muted-foreground&quot;&gt;{t(&quot;Student visibility preview:&quot;, &quot;معاينة ظهور الامتحان للطلاب:&quot;)}&lt;/p&gt;
                  {examForm.start_date &amp;&amp; (
                    &lt;p&gt;✅ {t(&quot;Opens&quot;, &quot;يفتح&quot;)}: &lt;strong&gt;{new Date(examForm.start_date).toLocaleString()}&lt;/strong&gt; ({t(&quot;your local time&quot;, &quot;توقيتك المحلي&quot;)})&lt;/p&gt;
                  )}
                  {examForm.end_date &amp;&amp; (
                    &lt;p&gt;🔒 {t(&quot;Closes&quot;, &quot;يغلق&quot;)}: &lt;strong&gt;{new Date(examForm.end_date).toLocaleString()}&lt;/strong&gt;&lt;/p&gt;
                  )}
                  {examForm.start_date &amp;&amp; new Date(examForm.start_date).getTime() &gt; Date.now() &amp;&amp; (
                    &lt;p className=&quot;text-xs text-muted-foreground&quot;&gt;{t(&quot;⏳ Exam is not yet open for students&quot;, &quot;⏳ الامتحان لم يفتح للطلاب بعد&quot;)}&lt;/p&gt;
                  )}
                  {examForm.start_date &amp;&amp; examForm.end_date &amp;&amp; new Date(examForm.start_date).getTime() &lt;= Date.now() &amp;&amp; new Date(examForm.end_date).getTime() &gt;= Date.now() &amp;&amp; (
                    &lt;p className=&quot;text-xs text-primary font-medium&quot;&gt;{t(&quot;🟢 Exam is currently open for students&quot;, &quot;🟢 الامتحان مفتوح حاليًا للطلاب&quot;)}&lt;/p&gt;
                  )}
                  {examForm.end_date &amp;&amp; new Date(examForm.end_date).getTime() &lt; Date.now() &amp;&amp; (
                    &lt;p className=&quot;text-xs text-destructive font-medium&quot;&gt;{t(&quot;🔴 Exam window has passed&quot;, &quot;🔴 انتهت فترة الامتحان&quot;)}&lt;/p&gt;
                  )}
                &lt;/div&gt;
              )}
            &lt;/CardContent&gt;
          &lt;/Card&gt;
        &lt;/TabsContent&gt;

        {/* Questions Tab */}
        &lt;TabsContent value=&quot;questions&quot;&gt;
          &lt;div className=&quot;space-y-4&quot;&gt;
            &lt;div className=&quot;flex items-center justify-between flex-wrap gap-2&quot;&gt;
              &lt;h2 className=&quot;text-xl font-semibold&quot;&gt;{t(&quot;Questions&quot;, &quot;الأسئلة&quot;)} ({questions.length})&lt;/h2&gt;
              &lt;div className=&quot;flex items-center gap-2 flex-wrap&quot;&gt;
                {/* Bulk import */}
                &lt;input ref={bulkFileInputRef} type=&quot;file&quot; accept=&quot;.csv,.json,.xlsx,.xls&quot; className=&quot;hidden&quot; onChange={handleBulkImport} /&gt;
                &lt;Dialog&gt;
                  &lt;DialogTrigger asChild&gt;
                    &lt;Button variant=&quot;outline&quot; size=&quot;sm&quot; className=&quot;gap-1&quot;&gt;
                      &lt;Upload className=&quot;h-3 w-3&quot; /&gt;{t(&quot;Bulk Import&quot;, &quot;استيراد جماعي&quot;)}
                    &lt;/Button&gt;
                  &lt;/DialogTrigger&gt;
                  &lt;DialogContent&gt;
                    &lt;DialogHeader&gt;
                      &lt;DialogTitle&gt;{t(&quot;Bulk Import Questions&quot;, &quot;استيراد أسئلة جماعي&quot;)}&lt;/DialogTitle&gt;
                    &lt;/DialogHeader&gt;
                    &lt;div className=&quot;space-y-4&quot;&gt;
                      &lt;p className=&quot;text-sm text-muted-foreground&quot;&gt;
                        {t(
                          &quot;Upload your questions file. Supports Excel (.xlsx), CSV, and JSON formats. Use the exact column format: QuestionType, Question, Answer1-Answer8, correctanswer, Marks, DifficultyLevel, Explanation, Tags.&quot;,
                          &quot;ارفع ملف الأسئلة. يدعم صيغ Excel (.xlsx) و CSV و JSON. استخدم تنسيق الأعمدة: QuestionType, Question, Answer1-Answer8, correctanswer, Marks, DifficultyLevel, Explanation, Tags.&quot;
                        )}
                      &lt;/p&gt;
                      &lt;div className=&quot;flex gap-2&quot;&gt;
                        &lt;Button variant=&quot;outline&quot; size=&quot;sm&quot; onClick={() =&gt; downloadTemplate(&quot;csv&quot;)} className=&quot;gap-1&quot;&gt;
                          &lt;Download className=&quot;h-3 w-3&quot; /&gt; CSV {t(&quot;Template&quot;, &quot;قالب&quot;)}
                        &lt;/Button&gt;
                        &lt;Button variant=&quot;outline&quot; size=&quot;sm&quot; onClick={() =&gt; downloadTemplate(&quot;json&quot;)} className=&quot;gap-1&quot;&gt;
                          &lt;Download className=&quot;h-3 w-3&quot; /&gt; JSON {t(&quot;Template&quot;, &quot;قالب&quot;)}
                        &lt;/Button&gt;
                      &lt;/div&gt;
                      &lt;Button onClick={() =&gt; bulkFileInputRef.current?.click()} className=&quot;w-full gap-1&quot;&gt;
                        &lt;Upload className=&quot;h-4 w-4&quot; /&gt; {t(&quot;Upload Questions File&quot;, &quot;رفع ملف الأسئلة&quot;)}
                      &lt;/Button&gt;
                    &lt;/div&gt;
                  &lt;/DialogContent&gt;
                &lt;/Dialog&gt;

                &lt;Button variant=&quot;outline&quot; onClick={openQuestionBank} className=&quot;gap-1&quot;&gt;
                  &lt;Library className=&quot;h-4 w-4&quot; /&gt;{t(&quot;Import from Bank&quot;, &quot;استيراد من البنك&quot;)}
                &lt;/Button&gt;
                &lt;Button variant=&quot;outline&quot; onClick={() =&gt; setPreviewOpen(true)} className=&quot;gap-1&quot;&gt;
                  &lt;Eye className=&quot;h-4 w-4&quot; /&gt;{t(&quot;Preview&quot;, &quot;معاينة&quot;)}
                &lt;/Button&gt;
                &lt;Button variant=&quot;outline&quot; onClick={addQuestion} className=&quot;gap-1&quot;&gt;
                  &lt;Plus className=&quot;h-4 w-4&quot; /&gt;{t(&quot;Add Question&quot;, &quot;إضافة سؤال&quot;)}
                &lt;/Button&gt;
              &lt;/div&gt;
            &lt;/div&gt;

            {/* Bulk Question Formatter */}
            &lt;BulkQuestionFormatter
              format={formatSettings}
              onChange={setFormatSettings}
              onApply={() =&gt; {
                toast({ title: t(`✅ Formatting applied to all ${questions.length} questions`, `✅ تم تطبيق التنسيق على كل ${questions.length} سؤال`) });
              }}
              questions={questions}
              examTitle={examForm.title}
              examTitleAr={examForm.title_ar}
            /&gt;

            {questions.map((q, idx) =&gt; (
              &lt;Card key={idx} className=&quot;border-2&quot;&gt;
                &lt;CardContent className=&quot;p-4&quot;&gt;
                  &lt;div className=&quot;mb-4 flex items-center justify-between flex-wrap gap-2&quot;&gt;
                    &lt;div className=&quot;flex items-center gap-2&quot;&gt;
                      &lt;GripVertical className=&quot;h-4 w-4 text-muted-foreground&quot; /&gt;
                      &lt;Badge variant=&quot;outline&quot;&gt;{t(&quot;Question&quot;, &quot;سؤال&quot;)} {idx + 1}&lt;/Badge&gt;
                    &lt;/div&gt;
                    &lt;div className=&quot;flex items-center gap-2 flex-wrap&quot;&gt;
                      &lt;Select value={q.question_type} onValueChange={(v) =&gt; updateQuestion(idx, { question_type: v })}&gt;
                        &lt;SelectTrigger className=&quot;w-44&quot;&gt;&lt;SelectValue /&gt;&lt;/SelectTrigger&gt;
                        &lt;SelectContent&gt;
                          {questionTypes.map((type) =&gt; (
                            &lt;SelectItem key={type.value} value={type.value}&gt;
                              {type.icon} {language === &quot;ar&quot; ? type.label_ar : type.label}
                            &lt;/SelectItem&gt;
                          ))}
                        &lt;/SelectContent&gt;
                      &lt;/Select&gt;
                      &lt;Select value={q.difficulty} onValueChange={(v) =&gt; updateQuestion(idx, { difficulty: v })}&gt;
                        &lt;SelectTrigger className=&quot;w-28&quot;&gt;&lt;SelectValue /&gt;&lt;/SelectTrigger&gt;
                        &lt;SelectContent&gt;
                          &lt;SelectItem value=&quot;easy&quot;&gt;{t(&quot;Easy&quot;, &quot;سهل&quot;)}&lt;/SelectItem&gt;
                          &lt;SelectItem value=&quot;medium&quot;&gt;{t(&quot;Medium&quot;, &quot;متوسط&quot;)}&lt;/SelectItem&gt;
                          &lt;SelectItem value=&quot;hard&quot;&gt;{t(&quot;Hard&quot;, &quot;صعب&quot;)}&lt;/SelectItem&gt;
                        &lt;/SelectContent&gt;
                      &lt;/Select&gt;
                      &lt;Input type=&quot;number&quot; className=&quot;w-20&quot; placeholder={t(&quot;Points&quot;, &quot;نقاط&quot;)} value={q.points} onChange={(e) =&gt; updateQuestion(idx, { points: +e.target.value })} /&gt;
                      &lt;Button variant=&quot;ghost&quot; size=&quot;icon&quot; onClick={() =&gt; removeQuestion(idx)}&gt;
                        &lt;Trash2 className=&quot;h-4 w-4 text-destructive&quot; /&gt;
                      &lt;/Button&gt;
                    &lt;/div&gt;
                  &lt;/div&gt;

                  &lt;div className=&quot;space-y-3&quot;&gt;
                    &lt;div&gt;
                      &lt;Label className=&quot;text-sm mb-1 block&quot;&gt;{t(&quot;Question Text (supports mixed English &amp; Arabic)&quot;, &quot;نص السؤال (يدعم الإنجليزية والعربية معاً)&quot;)}&lt;/Label&gt;
                      &lt;RichTextEditor
                        placeholder={t(&quot;Type your question here in any language...&quot;, &quot;اكتب سؤالك هنا بأي لغة...&quot;)}
                        value={q.question_text}
                        onChange={(val) =&gt; updateQuestion(idx, { question_text: val })}
                        dir=&quot;auto&quot;
                      /&gt;
                    &lt;/div&gt;

                    {/* Media upload section */}
                    &lt;div className=&quot;rounded-lg border border-dashed border-primary/30 bg-accent/30 p-3&quot;&gt;
                      &lt;Label className=&quot;flex items-center gap-2 mb-2 text-sm&quot;&gt;
                        {q.question_type === &quot;audio&quot; ? &lt;Music className=&quot;h-4 w-4 text-primary&quot; /&gt; : &lt;Image className=&quot;h-4 w-4 text-primary&quot; /&gt;}
                        {t(&quot;Media (Audio/Image)&quot;, &quot;وسائط (صوت/صورة)&quot;)}
                      &lt;/Label&gt;

                      {q.media_url ? (
                        &lt;div className=&quot;space-y-2&quot;&gt;
                          &lt;div className=&quot;flex items-center gap-2 text-sm text-muted-foreground&quot;&gt;
                            &lt;span className=&quot;truncate flex-1&quot;&gt;{q.media_url.split(&quot;/&quot;).pop()}&lt;/span&gt;
                            &lt;Button variant=&quot;ghost&quot; size=&quot;sm&quot; className=&quot;text-destructive&quot; onClick={() =&gt; updateQuestion(idx, { media_url: &quot;&quot; })}&gt;
                              {t(&quot;Remove&quot;, &quot;إزالة&quot;)}
                            &lt;/Button&gt;
                          &lt;/div&gt;
                          {q.media_url.match(/\.(mp3|wav|ogg|webm|m4a)$/i) ? (
                            &lt;audio controls src={q.media_url} className=&quot;w-full&quot; /&gt;
                          ) : q.media_url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) ? (
                            &lt;img src={q.media_url} alt=&quot;Question media&quot; className=&quot;max-h-40 rounded-lg&quot; /&gt;
                          ) : null}
                        &lt;/div&gt;
                      ) : (
                        &lt;div className=&quot;flex items-center gap-2 flex-wrap&quot;&gt;
                          &lt;Button
                            variant=&quot;outline&quot;
                            size=&quot;sm&quot;
                            className=&quot;gap-1&quot;
                            disabled={uploadingMedia === idx}
                            onClick={() =&gt; {
                              const input = document.createElement(&quot;input&quot;);
                              input.type = &quot;file&quot;;
                              input.accept = &quot;audio/*,image/*&quot;;
                              input.onchange = (e: any) =&gt; {
                                const file = e.target.files?.[0];
                                if (file) uploadMedia(file, idx);
                              };
                              input.click();
                            }}
                          &gt;
                            {uploadingMedia === idx ? (
                              &lt;Loader2 className=&quot;h-3 w-3 animate-spin&quot; /&gt;
                            ) : (
                              &lt;Upload className=&quot;h-3 w-3&quot; /&gt;
                            )}
                            {t(&quot;Upload File&quot;, &quot;رفع ملف&quot;)}
                          &lt;/Button&gt;
                          &lt;span className=&quot;text-xs text-muted-foreground&quot;&gt;{t(&quot;or paste URL:&quot;, &quot;أو الصق الرابط:&quot;)}&lt;/span&gt;
                          &lt;Input
                            placeholder=&quot;https://example.com/audio.mp3&quot;
                            value={q.media_url}
                            onChange={(e) =&gt; updateQuestion(idx, { media_url: e.target.value })}
                            className=&quot;flex-1 min-w-[200px]&quot;
                          /&gt;
                        &lt;/div&gt;
                      )}
                    &lt;/div&gt;

                    {/* MCQ / Image Choice options */}
                    {(q.question_type === &quot;mcq&quot; || q.question_type === &quot;image_mcq&quot;) &amp;&amp; (
                      &lt;div className=&quot;space-y-2&quot;&gt;
                        {q.options.map((opt: any, oi: number) =&gt; (
                          &lt;div key={opt.id} className=&quot;flex items-start gap-2 rounded-lg border p-2&quot;&gt;
                            &lt;input
                              type=&quot;radio&quot;
                              name={`correct-${idx}`}
                              checked={opt.is_correct}
                              onChange={() =&gt; {
                                const newOpts = q.options.map((o: any, j: number) =&gt; ({ ...o, is_correct: j === oi }));
                                updateQuestion(idx, { options: newOpts });
                              }}
                              className=&quot;accent-primary mt-2.5&quot;
                            /&gt;
                            &lt;div className=&quot;flex-1 space-y-2&quot;&gt;
                              &lt;div className=&quot;flex items-center gap-2&quot;&gt;
                                &lt;Input
                                  className=&quot;flex-1&quot;
                                  placeholder={`${t(&quot;Option&quot;, &quot;خيار&quot;)} ${String.fromCharCode(65 + oi)} ${t(&quot;(any language)&quot;, &quot;(أي لغة)&quot;)}`}
                                  value={opt.text}
                                  dir=&quot;auto&quot;
                                  onChange={(e) =&gt; {
                                    const newOpts = [...q.options];
                                    newOpts[oi] = { ...newOpts[oi], text: e.target.value };
                                    updateQuestion(idx, { options: newOpts });
                                  }}
                                /&gt;
                              &lt;/div&gt;
                              {/* Option image */}
                              &lt;div className=&quot;flex items-center gap-2&quot;&gt;
                                {opt.image_url ? (
                                  &lt;div className=&quot;flex items-center gap-2&quot;&gt;
                                    &lt;img src={opt.image_url} alt={`Option ${String.fromCharCode(65 + oi)}`} className=&quot;h-16 w-16 object-cover rounded-md border&quot; /&gt;
                                    &lt;Button variant=&quot;ghost&quot; size=&quot;sm&quot; className=&quot;text-destructive text-xs&quot; onClick={() =&gt; {
                                      const newOpts = [...q.options];
                                      newOpts[oi] = { ...newOpts[oi], image_url: &quot;&quot; };
                                      updateQuestion(idx, { options: newOpts });
                                    }}&gt;
                                      {t(&quot;Remove&quot;, &quot;إزالة&quot;)}
                                    &lt;/Button&gt;
                                  &lt;/div&gt;
                                ) : (
                                  &lt;Button
                                    variant=&quot;outline&quot;
                                    size=&quot;sm&quot;
                                    className=&quot;gap-1 text-xs&quot;
                                    disabled={uploadingOptionImage === `${idx}-${oi}`}
                                    onClick={() =&gt; {
                                      const input = document.createElement(&quot;input&quot;);
                                      input.type = &quot;file&quot;;
                                      input.accept = &quot;image/*&quot;;
                                      input.onchange = (e: any) =&gt; {
                                        const file = e.target.files?.[0];
                                        if (file) uploadOptionImage(file, idx, oi);
                                      };
                                      input.click();
                                    }}
                                  &gt;
                                    {uploadingOptionImage === `${idx}-${oi}` ? (
                                      &lt;Loader2 className=&quot;h-3 w-3 animate-spin&quot; /&gt;
                                    ) : (
                                      &lt;Image className=&quot;h-3 w-3&quot; /&gt;
                                    )}
                                    {t(&quot;Add Image&quot;, &quot;إضافة صورة&quot;)}
                                  &lt;/Button&gt;
                                )}
                              &lt;/div&gt;
                            &lt;/div&gt;
                          &lt;/div&gt;
                        ))}
                      &lt;/div&gt;
                    )}

                    {/* Correct answer for true_false, fill_blank, short_answer */}
                    {(q.question_type === &quot;true_false&quot; || q.question_type === &quot;fill_blank&quot; || q.question_type === &quot;short_answer&quot;) &amp;&amp; (
                      &lt;div&gt;
                        &lt;Label className=&quot;text-sm&quot;&gt;{t(&quot;Correct Answer (for auto-grading)&quot;, &quot;الإجابة الصحيحة (للتصحيح التلقائي)&quot;)}&lt;/Label&gt;
                        {q.question_type === &quot;true_false&quot; ? (
                          &lt;Select value={q.correct_answer} onValueChange={(v) =&gt; updateQuestion(idx, { correct_answer: v })}&gt;
                            &lt;SelectTrigger className=&quot;mt-1&quot;&gt;&lt;SelectValue placeholder={t(&quot;Select&quot;, &quot;اختر&quot;)} /&gt;&lt;/SelectTrigger&gt;
                            &lt;SelectContent&gt;
                              &lt;SelectItem value=&quot;true&quot;&gt;{t(&quot;True&quot;, &quot;صح&quot;)}&lt;/SelectItem&gt;
                              &lt;SelectItem value=&quot;false&quot;&gt;{t(&quot;False&quot;, &quot;خطأ&quot;)}&lt;/SelectItem&gt;
                            &lt;/SelectContent&gt;
                          &lt;/Select&gt;
                        ) : (
                          &lt;Input
                            className=&quot;mt-1&quot;
                            placeholder={t(&quot;Correct Answer&quot;, &quot;الإجابة الصحيحة&quot;)}
                            value={q.correct_answer}
                            onChange={(e) =&gt; updateQuestion(idx, { correct_answer: e.target.value })}
                            dir=&quot;auto&quot;
                          /&gt;
                        )}
                      &lt;/div&gt;
                    )}

                    {/* Multi-Select */}
                    {q.question_type === &quot;multi_select&quot; &amp;&amp; (
                      &lt;div className=&quot;space-y-2&quot;&gt;
                        &lt;Label className=&quot;text-sm&quot;&gt;☑️ {t(&quot;Options — check all correct answers&quot;, &quot;الخيارات — حدد كل الإجابات الصحيحة&quot;)}&lt;/Label&gt;
                        {q.options.map((opt: any, oi: number) =&gt; (
                          &lt;div key={opt.id} className=&quot;flex items-center gap-2 rounded-lg border p-2&quot; style={{ borderColor: opt.is_correct ? &quot;#064E3B&quot; : undefined, background: opt.is_correct ? &quot;#F0FDF4&quot; : undefined }}&gt;
                            &lt;input type=&quot;checkbox&quot; checked={opt.is_correct} onChange={e =&gt; { const o = [...q.options]; o[oi] = { ...o[oi], is_correct: e.target.checked }; updateQuestion(idx, { options: o }); }} className=&quot;accent-primary w-4 h-4&quot; /&gt;
                            &lt;Input className=&quot;flex-1&quot; placeholder={`${t(&quot;Option&quot;,&quot;خيار&quot;)} ${String.fromCharCode(65+oi)}`} value={opt.text} dir=&quot;auto&quot; onChange={e =&gt; { const o = [...q.options]; o[oi] = { ...o[oi], text: e.target.value }; updateQuestion(idx, { options: o }); }} /&gt;
                            &lt;Input className=&quot;w-36&quot; placeholder=&quot;بالعربية&quot; dir=&quot;rtl&quot; value={opt.text_ar||&quot;&quot;} onChange={e =&gt; { const o = [...q.options]; o[oi] = { ...o[oi], text_ar: e.target.value }; updateQuestion(idx, { options: o }); }} /&gt;
                            &lt;Button variant=&quot;ghost&quot; size=&quot;icon&quot; onClick={() =&gt; updateQuestion(idx, { options: q.options.filter((_:any,j:number)=&gt;j!==oi) })}&gt;&lt;Trash2 className=&quot;h-4 w-4 text-destructive&quot; /&gt;&lt;/Button&gt;
                          &lt;/div&gt;
                        ))}
                        &lt;Button variant=&quot;outline&quot; size=&quot;sm&quot; className=&quot;gap-1&quot; onClick={() =&gt; updateQuestion(idx, { options: [...q.options, { id: Math.random().toString(36).slice(2), text:&quot;&quot;, text_ar:&quot;&quot;, is_correct:false }] })}&gt;&lt;Plus className=&quot;h-3 w-3&quot; /&gt;{t(&quot;Add Option&quot;,&quot;إضافة خيار&quot;)}&lt;/Button&gt;
                        &lt;div className=&quot;flex gap-2 mt-1&quot;&gt;
                          &lt;Badge variant=&quot;outline&quot; className=&quot;text-xs&quot;&gt;{t(&quot;Allow Partial Credit&quot;,&quot;سماح بالتصحيح الجزئي&quot;)}&lt;/Badge&gt;
                          &lt;input type=&quot;checkbox&quot; checked={q.partial_credit||false} onChange={e=&gt;updateQuestion(idx,{partial_credit:e.target.checked})} /&gt;
                        &lt;/div&gt;
                      &lt;/div&gt;
                    )}

                    {/* Short Answer — accepted answers list */}
                    {q.question_type === &quot;short_answer&quot; &amp;&amp; (
                      &lt;div className=&quot;space-y-2&quot;&gt;
                        &lt;Label className=&quot;text-sm&quot;&gt;💬 {t(&quot;Accepted Answers (all valid variations)&quot;,&quot;الإجابات المقبولة (كل الأشكال الصحيحة)&quot;)}&lt;/Label&gt;
                        {(q.accepted_answers||[&quot;&quot;]).map((ans:string, ai:number) =&gt; (
                          &lt;div key={ai} className=&quot;flex gap-2&quot;&gt;
                            &lt;Input value={ans} placeholder={`${t(&quot;Accepted answer&quot;,&quot;إجابة مقبولة&quot;)} ${ai+1}`} dir=&quot;auto&quot; onChange={e=&gt;{ const a=[...(q.accepted_answers||[&quot;&quot;])]; a[ai]=e.target.value; updateQuestion(idx,{accepted_answers:a,correct_answer:a[0]}); }} /&gt;
                            {ai&gt;0&amp;&amp;&lt;Button variant=&quot;ghost&quot; size=&quot;icon&quot; onClick={()=&gt;updateQuestion(idx,{accepted_answers:(q.accepted_answers||[]).filter((_:any,j:number)=&gt;j!==ai)})}&gt;&lt;Trash2 className=&quot;h-4 w-4 text-destructive&quot;/&gt;&lt;/Button&gt;}
                          &lt;/div&gt;
                        ))}
                        &lt;Button variant=&quot;outline&quot; size=&quot;sm&quot; className=&quot;gap-1&quot; onClick={()=&gt;updateQuestion(idx,{accepted_answers:[...(q.accepted_answers||[&quot;&quot;]),&quot;&quot;]})}&gt;&lt;Plus className=&quot;h-3 w-3&quot;/&gt;{t(&quot;Add Variation&quot;,&quot;إضافة صيغة&quot;)}&lt;/Button&gt;
                        &lt;div className=&quot;flex items-center gap-2 text-sm text-muted-foreground&quot;&gt;
                          &lt;input type=&quot;checkbox&quot; checked={q.case_sensitive||false} onChange={e=&gt;updateQuestion(idx,{case_sensitive:e.target.checked})} /&gt;
                          &lt;span&gt;{t(&quot;Case Sensitive&quot;,&quot;حساس لحالة الأحرف&quot;)}&lt;/span&gt;
                        &lt;/div&gt;
                      &lt;/div&gt;
                    )}

                    {/* Essay */}
                    {q.question_type === &quot;essay&quot; &amp;&amp; (
                      &lt;div className=&quot;rounded-lg border bg-accent/20 p-3 text-sm text-muted-foreground space-y-2&quot;&gt;
                        &lt;p&gt;📄 {t(&quot;Essay — student types a long response. Requires manual grading.&quot;,&quot;مقال — الطالب يكتب إجابة مطولة. يتطلب تصحيحاً يدوياً.&quot;)}&lt;/p&gt;
                        &lt;div className=&quot;grid grid-cols-2 gap-2&quot;&gt;
                          &lt;div&gt;&lt;Label className=&quot;text-xs&quot;&gt;{t(&quot;Min Words&quot;,&quot;الحد الأدنى للكلمات&quot;)}&lt;/Label&gt;&lt;Input type=&quot;number&quot; min={0} value={q.min_words||0} onChange={e=&gt;updateQuestion(idx,{min_words:+e.target.value})} className=&quot;mt-1&quot;/&gt;&lt;/div&gt;
                          &lt;div&gt;&lt;Label className=&quot;text-xs&quot;&gt;{t(&quot;Max Words&quot;,&quot;الحد الأقصى للكلمات&quot;)}&lt;/Label&gt;&lt;Input type=&quot;number&quot; min={0} value={q.max_words||0} onChange={e=&gt;updateQuestion(idx,{max_words:+e.target.value})} className=&quot;mt-1&quot;/&gt;&lt;/div&gt;
                        &lt;/div&gt;
                      &lt;/div&gt;
                    )}

                    {/* Matching */}
                    {q.question_type === &quot;matching&quot; &amp;&amp; (
                      &lt;div className=&quot;space-y-2&quot;&gt;
                        &lt;Label className=&quot;text-sm&quot;&gt;🔗 {t(&quot;Matching Pairs — Left (Prompt) / Right (Target)&quot;,&quot;أزواج المطابقة — يسار (السؤال) / يمين (الإجابة)&quot;)}&lt;/Label&gt;
                        {(q.matching_pairs||[]).map((pair:any,pi:number)=&gt;(
                          &lt;div key={pi} className=&quot;grid grid-cols-2 gap-2 items-center&quot;&gt;
                            &lt;Input placeholder={`${t(&quot;Left&quot;,&quot;يسار&quot;)} ${pi+1}`} value={pair.left} onChange={e=&gt;{const p=[...(q.matching_pairs||[])];p[pi]={...p[pi],left:e.target.value};updateQuestion(idx,{matching_pairs:p});}} style={{borderColor:&quot;#93C5FD&quot;}}/&gt;
                            &lt;div className=&quot;flex gap-2&quot;&gt;
                              &lt;Input placeholder={`${t(&quot;Right&quot;,&quot;يمين&quot;)} ${pi+1}`} value={pair.right} onChange={e=&gt;{const p=[...(q.matching_pairs||[])];p[pi]={...p[pi],right:e.target.value};updateQuestion(idx,{matching_pairs:p});}} style={{borderColor:&quot;#C4B5FD&quot;}}/&gt;
                              &lt;Button variant=&quot;ghost&quot; size=&quot;icon&quot; onClick={()=&gt;updateQuestion(idx,{matching_pairs:(q.matching_pairs||[]).filter((_:any,j:number)=&gt;j!==pi)})}&gt;&lt;Trash2 className=&quot;h-4 w-4 text-destructive&quot;/&gt;&lt;/Button&gt;
                            &lt;/div&gt;
                          &lt;/div&gt;
                        ))}
                        &lt;Button variant=&quot;outline&quot; size=&quot;sm&quot; className=&quot;gap-1&quot; onClick={()=&gt;updateQuestion(idx,{matching_pairs:[...(q.matching_pairs||[]),{left:&quot;&quot;,right:&quot;&quot;}]})}&gt;&lt;Plus className=&quot;h-3 w-3&quot;/&gt;{t(&quot;Add Pair&quot;,&quot;إضافة زوج&quot;)}&lt;/Button&gt;
                      &lt;/div&gt;
                    )}

                    {/* Ordering */}
                    {q.question_type === &quot;ordering&quot; &amp;&amp; (
                      &lt;div className=&quot;space-y-2&quot;&gt;
                        &lt;Label className=&quot;text-sm&quot;&gt;📋 {t(&quot;Items in Correct Order (will be shuffled for student)&quot;,&quot;العناصر بالترتيب الصحيح (ستُخلط للطالب)&quot;)}&lt;/Label&gt;
                        {(q.ordering_items||[]).map((item:string,oi:number)=&gt;(
                          &lt;div key={oi} className=&quot;flex gap-2 items-center&quot;&gt;
                            &lt;div className=&quot;w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0&quot;&gt;{oi+1}&lt;/div&gt;
                            &lt;Input value={item} placeholder={`${t(&quot;Item&quot;,&quot;عنصر&quot;)} ${oi+1}`} dir=&quot;auto&quot; onChange={e=&gt;{const it=[...(q.ordering_items||[])];it[oi]=e.target.value;updateQuestion(idx,{ordering_items:it,correct_answer:it.join(&quot;|&quot;)});}}/&gt;
                            &lt;Button variant=&quot;ghost&quot; size=&quot;icon&quot; onClick={()=&gt;{const it=(q.ordering_items||[]).filter((_:any,j:number)=&gt;j!==oi);updateQuestion(idx,{ordering_items:it,correct_answer:it.join(&quot;|&quot;)});}}&gt;&lt;Trash2 className=&quot;h-4 w-4 text-destructive&quot;/&gt;&lt;/Button&gt;
                          &lt;/div&gt;
                        ))}
                        &lt;Button variant=&quot;outline&quot; size=&quot;sm&quot; className=&quot;gap-1&quot; onClick={()=&gt;updateQuestion(idx,{ordering_items:[...(q.ordering_items||[]),&quot;&quot;]})}&gt;  &lt;Plus className=&quot;h-3 w-3&quot;/&gt;{t(&quot;Add Item&quot;,&quot;إضافة عنصر&quot;)}&lt;/Button&gt;
                      &lt;/div&gt;
                    )}

                    {/* Drawing */}
                    {q.question_type === &quot;drawing&quot; &amp;&amp; (
                      &lt;div className=&quot;rounded-lg border border-dashed p-3 space-y-2&quot;&gt;
                        &lt;Label className=&quot;text-sm&quot;&gt;✏️ {t(&quot;Drawing / Whiteboard&quot;,&quot;رسم / لوحة بيضاء&quot;)}&lt;/Label&gt;
                        &lt;p className=&quot;text-xs text-muted-foreground&quot;&gt;{t(&quot;Student draws on a canvas. Saved as image for manual grading.&quot;,&quot;الطالب يرسم على لوحة. يحفظ كصورة للتصحيح اليدوي.&quot;)}&lt;/p&gt;
                        {q.background_image
                          ? &lt;div className=&quot;flex gap-2 items-center&quot;&gt;&lt;img src={q.background_image} className=&quot;h-20 rounded border&quot; alt=&quot;bg&quot;/&gt;&lt;Button variant=&quot;ghost&quot; size=&quot;sm&quot; className=&quot;text-destructive&quot; onClick={()=&gt;updateQuestion(idx,{background_image:&quot;&quot;})}&gt;{t(&quot;Remove&quot;,&quot;حذف&quot;)}&lt;/Button&gt;&lt;/div&gt;
                          : &lt;Button variant=&quot;outline&quot; size=&quot;sm&quot; className=&quot;gap-1&quot; onClick={()=&gt;{const el=document.createElement(&quot;input&quot;);el.type=&quot;file&quot;;el.accept=&quot;image/*&quot;;el.onchange=(e:any)=&gt;{ const f=e.target.files?.[0]; if(f) uploadMedia(f,idx); };el.click();}}&gt;&lt;Image className=&quot;h-3 w-3&quot;/&gt;{t(&quot;Upload Background (optional)&quot;,&quot;رفع خلفية (اختياري)&quot;)}&lt;/Button&gt;}
                      &lt;/div&gt;
                    )}

                    {/* Per-question settings row */}
                    &lt;div className=&quot;grid grid-cols-2 gap-2 pt-1&quot;&gt;
                      &lt;div&gt;
                        &lt;Label className=&quot;text-xs text-muted-foreground&quot;&gt;✅ {t(&quot;Correct Feedback&quot;,&quot;تغذية راجعة صحيحة&quot;)}&lt;/Label&gt;
                        &lt;Input className=&quot;mt-1 text-xs&quot; placeholder={t(&quot;Message when correct...&quot;,&quot;رسالة عند الإجابة الصحيحة...&quot;)} value={q.explanation||&quot;&quot;} onChange={e=&gt;updateQuestion(idx,{explanation:e.target.value})} dir=&quot;auto&quot;/&gt;
                      &lt;/div&gt;
                      &lt;div&gt;
                        &lt;Label className=&quot;text-xs text-muted-foreground&quot;&gt;❌ {t(&quot;Wrong Feedback&quot;,&quot;تغذية راجعة خاطئة&quot;)}&lt;/Label&gt;
                        &lt;Input className=&quot;mt-1 text-xs&quot; placeholder={t(&quot;Hint when wrong...&quot;,&quot;تلميح عند الخطأ...&quot;)} value={q.feedback_incorrect||&quot;&quot;} onChange={e=&gt;updateQuestion(idx,{feedback_incorrect:e.target.value})} dir=&quot;auto&quot;/&gt;
                      &lt;/div&gt;
                    &lt;/div&gt;
                    &lt;div className=&quot;flex items-center gap-2 text-xs text-muted-foreground&quot;&gt;
                      &lt;span&gt;⏱️ {t(&quot;Question Timer (0 = use exam timer)&quot;,&quot;مؤقت السؤال (0 = استخدام مؤقت الامتحان)&quot;)}&lt;/span&gt;
                      &lt;Input type=&quot;number&quot; min={0} step={30} className=&quot;w-24 h-7 text-xs&quot; value={q.question_timer_seconds||0} onChange={e=&gt;updateQuestion(idx,{question_timer_seconds:+e.target.value})}/&gt;
                      &lt;span&gt;{t(&quot;seconds&quot;,&quot;ثانية&quot;)}&lt;/span&gt;
                    &lt;/div&gt;
                  &lt;/div&gt;
                &lt;/CardContent&gt;
              &lt;/Card&gt;
            ))}
          &lt;/div&gt;
        &lt;/TabsContent&gt;
      &lt;/Tabs&gt;

      {/* Preview Dialog */}
      &lt;Dialog open={previewOpen} onOpenChange={setPreviewOpen}&gt;
        &lt;DialogContent className=&quot;max-w-3xl max-h-[80vh] overflow-y-auto&quot;&gt;
          &lt;DialogHeader&gt;
            &lt;DialogTitle&gt;{t(&quot;Exam Preview&quot;, &quot;معاينة الامتحان&quot;)}&lt;/DialogTitle&gt;
          &lt;/DialogHeader&gt;
          &lt;div className=&quot;space-y-6&quot;&gt;
            {examForm.title &amp;&amp; (
              &lt;div className=&quot;text-center border-b pb-4&quot;&gt;
                &lt;h2 className=&quot;text-2xl font-bold&quot;&gt;{examForm.title}&lt;/h2&gt;
                {examForm.title_ar &amp;&amp; &lt;p className=&quot;text-lg text-muted-foreground mt-1&quot; dir=&quot;rtl&quot;&gt;{examForm.title_ar}&lt;/p&gt;}
                {examForm.description &amp;&amp; &lt;p className=&quot;text-sm text-muted-foreground mt-2&quot;&gt;{examForm.description}&lt;/p&gt;}
              &lt;/div&gt;
            )}
            {questions.map((q, idx) =&gt; (
              &lt;div key={idx} className=&quot;border rounded-lg p-4 space-y-3&quot;&gt;
                &lt;div className=&quot;flex items-start gap-3&quot;&gt;
                  &lt;span className=&quot;flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold&quot;&gt;
                    {idx + 1}
                  &lt;/span&gt;
                  &lt;div className=&quot;flex-1 space-y-2&quot;&gt;
                    &lt;div className=&quot;flex items-center gap-2 flex-wrap&quot;&gt;
                      &lt;Badge variant=&quot;secondary&quot;&gt;{questionTypes.find(t =&gt; t.value === q.question_type)?.label || q.question_type}&lt;/Badge&gt;
                      &lt;Badge variant=&quot;outline&quot;&gt;{q.points} {t(&quot;pts&quot;, &quot;نقطة&quot;)}&lt;/Badge&gt;
                      &lt;Badge variant={q.difficulty === &quot;easy&quot; ? &quot;default&quot; : q.difficulty === &quot;hard&quot; ? &quot;destructive&quot; : &quot;secondary&quot;}&gt;
                        {q.difficulty}
                      &lt;/Badge&gt;
                    &lt;/div&gt;
                    &lt;div
                      className=&quot;text-base prose prose-sm max-w-none&quot;
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text) || `&lt;span class=&quot;text-muted-foreground italic&quot;&gt;${t(&quot;No question text&quot;, &quot;لا يوجد نص&quot;)}&lt;/span&gt;` }}
                    /&gt;
                    {q.question_text_ar &amp;&amp; (
                      &lt;div
                        className=&quot;text-base prose prose-sm max-w-none text-muted-foreground&quot;
                        dir=&quot;rtl&quot;
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text_ar) }}
                      /&gt;
                    )}

                    {/* Media preview */}
                    {q.media_url &amp;&amp; (
                      &lt;div className=&quot;mt-2&quot;&gt;
                        {q.media_url.match(/\.(mp3|wav|ogg|webm|m4a)$/i) ? (
                          &lt;audio controls src={q.media_url} className=&quot;w-full&quot; /&gt;
                        ) : q.media_url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) ? (
                          &lt;img src={q.media_url} alt=&quot;Question media&quot; className=&quot;max-h-40 rounded-lg&quot; /&gt;
                        ) : null}
                      &lt;/div&gt;
                    )}

                    {/* MCQ / Image Choice options preview */}
                    {(q.question_type === &quot;mcq&quot; || q.question_type === &quot;image_mcq&quot;) &amp;&amp; (
                      &lt;div className={q.question_type === &quot;image_mcq&quot; ? &quot;grid grid-cols-2 gap-2 mt-2&quot; : &quot;space-y-1.5 mt-2&quot;}&gt;
                        {q.options.map((opt: any, oi: number) =&gt; (
                          &lt;div
                            key={opt.id}
                            className={cn(
                              &quot;flex items-center gap-2 rounded-md border px-3 py-2 text-sm&quot;,
                              opt.is_correct ? &quot;border-primary bg-primary/10 font-medium&quot; : &quot;border-input&quot;
                            )}
                          &gt;
                            &lt;span className=&quot;font-mono text-xs w-5&quot;&gt;{String.fromCharCode(65 + oi)}.&lt;/span&gt;
                            &lt;div className=&quot;flex-1&quot;&gt;
                              {opt.image_url &amp;&amp; (
                                &lt;img src={opt.image_url} alt={`Option ${String.fromCharCode(65 + oi)}`} className=&quot;h-20 w-full object-contain rounded mb-1&quot; /&gt;
                              )}
                              {opt.text &amp;&amp; &lt;span&gt;{opt.text}&lt;/span&gt;}
                              {opt.text_ar &amp;&amp; &lt;span className=&quot;text-muted-foreground ml-2&quot; dir=&quot;rtl&quot;&gt;{opt.text_ar}&lt;/span&gt;}
                            &lt;/div&gt;
                            {opt.is_correct &amp;&amp; &lt;Badge className=&quot;ml-2 text-xs&quot; variant=&quot;default&quot;&gt;✓&lt;/Badge&gt;}
                          &lt;/div&gt;
                        ))}
                      &lt;/div&gt;
                    )}

                    {/* True/False preview */}
                    {q.question_type === &quot;true_false&quot; &amp;&amp; q.correct_answer &amp;&amp; (
                      &lt;p className=&quot;text-sm&quot;&gt;&lt;strong&gt;{t(&quot;Answer&quot;, &quot;الإجابة&quot;)}:&lt;/strong&gt; {q.correct_answer === &quot;true&quot; ? t(&quot;True&quot;, &quot;صح&quot;) : t(&quot;False&quot;, &quot;خطأ&quot;)}&lt;/p&gt;
                    )}

                    {/* Fill blank / short answer preview */}
                    {(q.question_type === &quot;fill_blank&quot; || q.question_type === &quot;short_answer&quot;) &amp;&amp; q.correct_answer &amp;&amp; (
                      &lt;p className=&quot;text-sm&quot;&gt;&lt;strong&gt;{t(&quot;Answer&quot;, &quot;الإجابة&quot;)}:&lt;/strong&gt; {q.correct_answer}&lt;/p&gt;
                    )}

                    {/* Explanation */}
                    {q.explanation &amp;&amp; (
                      &lt;p className=&quot;text-xs text-muted-foreground mt-2&quot;&gt;💡 {q.explanation}&lt;/p&gt;
                    )}
                  &lt;/div&gt;
                &lt;/div&gt;
              &lt;/div&gt;
            ))}
          &lt;/div&gt;
        &lt;/DialogContent&gt;
      &lt;/Dialog&gt;

      {/* Question Bank Import Dialog */}
      &lt;Dialog open={bankOpen} onOpenChange={setBankOpen}&gt;
        &lt;DialogContent className=&quot;max-w-3xl max-h-[80vh] overflow-y-auto&quot;&gt;
          &lt;DialogHeader&gt;
            &lt;DialogTitle className=&quot;flex items-center gap-2&quot;&gt;
              &lt;Library className=&quot;h-5 w-5&quot; /&gt;
              {t(&quot;Import from Question Bank&quot;, &quot;استيراد من بنك الأسئلة&quot;)}
            &lt;/DialogTitle&gt;
          &lt;/DialogHeader&gt;
          &lt;div className=&quot;space-y-4&quot;&gt;
            &lt;Input
              placeholder={t(&quot;Search questions...&quot;, &quot;البحث في الأسئلة...&quot;)}
              value={bankSearch}
              onChange={(e) =&gt; setBankSearch(e.target.value)}
            /&gt;
            {bankLoading ? (
              &lt;div className=&quot;flex justify-center py-8&quot;&gt;
                &lt;Loader2 className=&quot;h-8 w-8 animate-spin text-primary&quot; /&gt;
              &lt;/div&gt;
            ) : (
              &lt;&gt;
                &lt;div className=&quot;text-xs text-muted-foreground&quot;&gt;
                  {bankSelected.size} {t(&quot;selected&quot;, &quot;محدد&quot;)} • {bankQuestions.filter((q) =&gt; {
                    if (!bankSearch) return true;
                    const s = bankSearch.toLowerCase();
                    return (q.question_text || &quot;&quot;).toLowerCase().includes(s) || (q.question_text_ar || &quot;&quot;).toLowerCase().includes(s);
                  }).length} {t(&quot;questions&quot;, &quot;سؤال&quot;)}
                &lt;/div&gt;
                &lt;div className=&quot;max-h-[400px] overflow-y-auto space-y-1.5&quot;&gt;
                  {bankQuestions.filter((q) =&gt; {
                    if (!bankSearch) return true;
                    const s = bankSearch.toLowerCase();
                    return (q.question_text || &quot;&quot;).toLowerCase().includes(s) || (q.question_text_ar || &quot;&quot;).toLowerCase().includes(s);
                  }).map((q) =&gt; {
                    const strip = (html: string) =&gt; {
                      const doc = new DOMParser().parseFromString(html || &quot;&quot;, &quot;text/html&quot;);
                      return doc.body.textContent || &quot;&quot;;
                    };
                    return (
                      &lt;div
                        key={q.id}
                        className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${bankSelected.has(q.id) ? &quot;border-primary bg-primary/5&quot; : &quot;hover:bg-accent/50&quot;}`}
                        onClick={() =&gt; {
                          setBankSelected((prev) =&gt; {
                            const next = new Set(prev);
                            next.has(q.id) ? next.delete(q.id) : next.add(q.id);
                            return next;
                          });
                        }}
                      &gt;
                        &lt;Checkbox checked={bankSelected.has(q.id)} className=&quot;mt-0.5&quot; /&gt;
                        &lt;div className=&quot;flex-1 min-w-0&quot;&gt;
                          &lt;div className=&quot;flex gap-1.5 flex-wrap mb-1&quot;&gt;
                            &lt;Badge variant=&quot;secondary&quot; className=&quot;text-[10px]&quot;&gt;{q.question_type?.replace(&quot;_&quot;, &quot; &quot;)}&lt;/Badge&gt;
                            &lt;Badge variant=&quot;outline&quot; className=&quot;text-[10px]&quot;&gt;{q.difficulty}&lt;/Badge&gt;
                            &lt;Badge variant=&quot;outline&quot; className=&quot;text-[10px]&quot;&gt;{q.points} pts&lt;/Badge&gt;
                            {q.exams?.title &amp;&amp; (
                              &lt;span className=&quot;text-[10px] text-muted-foreground&quot;&gt;
                                {language === &quot;ar&quot; ? q.exams?.title_ar || q.exams?.title : q.exams?.title}
                              &lt;/span&gt;
                            )}
                          &lt;/div&gt;
                          &lt;p className=&quot;text-sm truncate&quot; dir=&quot;auto&quot;&gt;{strip(q.question_text)}&lt;/p&gt;
                        &lt;/div&gt;
                      &lt;/div&gt;
                    );
                  })}
                &lt;/div&gt;
                &lt;Button onClick={importFromBank} disabled={bankSelected.size === 0} className=&quot;w-full gap-2&quot;&gt;
                  &lt;Plus className=&quot;h-4 w-4&quot; /&gt;
                  {t(`Import ${bankSelected.size} Questions`, `استيراد ${bankSelected.size} سؤال`)}
                &lt;/Button&gt;
              &lt;/&gt;
            )}
          &lt;/div&gt;
        &lt;/DialogContent&gt;
      &lt;/Dialog&gt;
    &lt;/div&gt;
  );
};

export default ExamEditor;</pre>
</div>

<div class="bottom-bar">
  <button class="bottom-copy" id="botBtn" onclick="copyCode(this)">📋 Tap to Copy All Code</button>
</div>

<script>
const CODE = document.getElementById('codeBlock').textContent;
function copyCode(btn) {
  navigator.clipboard.writeText(CODE).then(() => {
    document.getElementById('topBtn').textContent = '✅ Copied!';
    document.getElementById('topBtn').classList.add('copied');
    document.getElementById('botBtn').textContent = '✅ Copied! Paste into your editor';
    document.getElementById('botBtn').classList.add('copied');
    setTimeout(() => {
      document.getElementById('topBtn').textContent = '📋 Copy';
      document.getElementById('topBtn').classList.remove('copied');
      document.getElementById('botBtn').textContent = '📋 Tap to Copy All Code';
      document.getElementById('botBtn').classList.remove('copied');
    }, 3000);
  });
}
</script>
</body>
</html>