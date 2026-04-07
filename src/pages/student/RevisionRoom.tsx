// src/pages/student/RevisionRoom.tsx
// ✅ FIXED: AI flashcard generation with proper error handling, JSON parsing, and insert validation


import { useState, useEffect, useMemo } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Layers, FileText, StickyNote, BarChart3,
  Plus, CheckCircle, XCircle, RotateCcw, Loader2, Sparkles,
  BookOpen, Brain, Zap, ChevronRight, Clock, Trophy,
  Star, Eye, EyeOff, Trash2, Edit, X, Check, AlertCircle, ChevronDown
} from "lucide-react";
import { format } from "date-fns";

interface Flashcard { 
  id: string; 
  front_text: string; 
  front_text_ar?: string; 
  back_text: string; 
  back_text_ar?: string; 
  topic?: string; 
}
interface QuizQ { 
  id: string; 
  question: string; 
  answer: string; 
  options: string[]; 
  explanation?: string; 
  source: "flashcard" | "exam" | "ai"; 
}

const G = "#064E3B", GM = "#065F46", GOLD = "#C9973A";

const RevisionRoom = () => {
  useEffect(() => { console.log("✅ RevisionRoom loaded successfully"); }, []);

  const { subjectId } = useParams();
  const [searchParams] = useSearchParams();
  const { t, language } = useLanguage();
  const { user, hasRole } = useAuth();
  const { toast } = useToast();  const qc = useQueryClient();
  const isPrivileged = hasRole("admin") || hasRole("teacher");

  const [tab, setTab] = useState(searchParams.get("tab") || "flashcards");

  // STATE DECLARATIONS
  const [studyMode, setStudyMode] = useState(false);
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [studyResults, setStudyResults] = useState<Record<string, string>>({});
  const [showAddCard, setShowAddCard] = useState(false);
  const [aiCardTopic, setAiCardTopic] = useState("");
  const [aiCardCount, setAiCardCount] = useState(10);
  const [aiCardLoading, setAiCardLoading] = useState(false);
  const [aiCardError, setAiCardError] = useState<string | null>(null);
  const [showAiCard, setShowAiCard] = useState(false);
  const [cardForm, setCardForm] = useState({ front: "", front_ar: "", back: "", back_ar: "", topic: "" });

  // QUIZ STATE
  const [quizMode, setQuizMode] = useState(false);
  const [quizSource, setQuizSource] = useState<"flashcard" | "exam" | "ai" | null>(null);
  const [quizQs, setQuizQs] = useState<QuizQ[]>([]);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizDone, setQuizDone] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [aiQuizTopic, setAiQuizTopic] = useState("");
  const [aiQuizError, setAiQuizError] = useState<string | null>(null);
  const [showAiQuiz, setShowAiQuiz] = useState(false);
  const [selectedExam, setSelectedExam] = useState("");

  // Material-based AI generation
  const [showMatGen, setShowMatGen] = useState(false);
  const [matGenMode, setMatGenMode] = useState<"flashcard" | "quiz">("quiz");
  const [matGenLoading, setMatGenLoading] = useState(false);
  const [matGenStep, setMatGenStep] = useState<"pick" | "config" | "generating">("pick");
  const [selMaterial, setSelMaterial] = useState<any | null>(null);
  const [pageFrom, setPageFrom] = useState(1);
  const [pageTo, setPageTo] = useState(5);
  const [numQuestions, setNumQuestions] = useState(10);
  const [matGenStatus, setMatGenStatus] = useState("");
  const [matGenError, setMatGenError] = useState<string | null>(null);

  // Notes
  const [showNewNote, setShowNewNote] = useState(false);
  const [noteForm, setNoteForm] = useState({ title: "", content: "" });

  // Level-based subject navigator
  const [expandedLevels, setExpandedLevels] = useState<Record<string, boolean>>({});
  // QUERIES
  const { data: subject } = useQuery({
    queryKey: ["revision-subject", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("*").eq("id", subjectId!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: allSubjects = [] } = useQuery({
    queryKey: ["all-revision-subjects"],
    queryFn: async () => {
      const { data } = await supabase.from("subjects").select("*").eq("is_active", true).order("title");
      return (data || []) as any[];
    },
  });

  const subjectsByLevel = useMemo(() => {
    const grouped: Record<string, any[]> = { beginner: [], intermediate: [], advanced: [] };
    allSubjects.forEach(s => {
      const lvl = (s.level || "beginner").toLowerCase();
      if (grouped[lvl]) grouped[lvl].push(s);
    });
    return grouped;
  }, [allSubjects]);

  const { data: flashcards = [] } = useQuery({
    queryKey: ["revision-flashcards", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("revision_flashcards").select("*").eq("subject_id", subjectId!).order("order_index");
      if (error) throw error;
      return (data || []) as Flashcard[];
    },
  });

  const { data: fcProgress = [] } = useQuery({
    queryKey: ["revision-fc-progress", subjectId, user?.id],
    enabled: !!user && flashcards.length > 0,
    queryFn: async () => {
      const ids = flashcards.map(f => f.id);
      if (!ids.length) return [];
      const { data } = await supabase.from("revision_flashcard_progress").select("*").eq("student_id", user!.id).in("flashcard_id", ids);
      return (data || []) as any[];
    },
  });

  const { data: summaries = [] } = useQuery({
    queryKey: ["revision-summaries", subjectId],
    queryFn: async () => {      const { data } = await supabase.from("revision_summaries").select("*").eq("subject_id", subjectId!).order("created_at", { ascending: false });
      return (data || []) as any[];
    },
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["revision-notes", subjectId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("revision_notes").select("*").eq("student_id", user!.id).eq("subject_id", subjectId!).order("updated_at", { ascending: false });
      return (data || []) as any[];
    },
  });

  const { data: materials = [] } = useQuery({
    queryKey: ["subject-materials-rev", subjectId],
    enabled: !!subjectId,
    queryFn: async () => {
      const { data } = await supabase.from("subject_materials").select("*").eq("subject_id", subjectId!).order("created_at", { ascending: false });
      return (data || []) as any[];
    },
  });

  const { data: quizHistory = [] } = useQuery({
    queryKey: ["revision-quiz-history", subjectId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("revision_quiz_sessions").select("*").eq("student_id", user!.id).eq("subject_id", subjectId!).order("completed_at", { ascending: false });
      return (data || []) as any[];
    },
  });

  const { data: exams = [] } = useQuery({
    queryKey: ["subject-exams-for-quiz", subjectId],
    enabled: !!subjectId,
    queryFn: async () => {
      const { data: courses } = await supabase.from("courses").select("id").eq("subject_id", subjectId!);
      if (!courses?.length) return [];
      const { data } = await supabase.from("exams").select("id,title,title_ar").in("course_id", courses.map(c => c.id)).eq("is_published", true);
      return (data || []) as any[];
    },
  });

  // Derived stats
  const knownCount = fcProgress.filter((p: any) => p.status === "known").length;
  const learningCount = fcProgress.filter((p: any) => p.status === "learning").length;
  const mastery = flashcards.length > 0 ? Math.round((knownCount / flashcards.length) * 100) : 0;
  const quizAvg = quizHistory.length > 0 ? Math.round(quizHistory.reduce((s: number, q: any) => s + Number(q.percentage || 0), 0) / quizHistory.length) : 0;

  // AI Helper  const callClaude = async (prompt: string): Promise<string> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      const { data, error } = await supabase.functions.invoke("tahleem-ai", {
        body: { action: "revision", prompt },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (error) {
        console.error("Edge Function Error:", error);
        throw new Error(error.message || "AI service unavailable. Please check your connection or try again.");
      }
      if (data?.error) throw new Error(data.error);
      return data?.text || "";
    } catch (err: any) {
      if (err.name === "AbortError") throw new Error("Request timed out. The AI is taking too long. Please try again.");
      throw err;
    }
  };

  // PDF.js Loader
  const loadPdfJs = (): Promise<any> => new Promise((resolve, reject) => {
    const CDNBASE = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";
    if ((window as any).pdfjsLib) { resolve((window as any).pdfjsLib); return; }
    const s = document.createElement("script");
    s.src = `${CDNBASE}/pdf.min.js`;
    s.onload = () => {
      const lib = (window as any).pdfjsLib;
      lib.GlobalWorkerOptions.workerSrc = `${CDNBASE}/pdf.worker.min.js`;
      resolve(lib);
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });

  // PDF Text Extractor
  const extractPdfText = async (url: string, fromPage: number, toPage: number): Promise<string> => {
    const lib = await loadPdfJs();
    const pdf = await lib.getDocument({ url, withCredentials: false }).promise;
    const totalPages = pdf.numPages;
    const start = Math.max(1, fromPage);
    const end = Math.min(toPage, totalPages);
    const texts: string[] = [];
    for (let i = start; i <= end; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item: any) => item.str).join(" ").replace(/\s+/g, " ").trim();
      if (text) texts.push(`[Page ${i}] ${text}`);
    }    return texts.join("\n\n");
  };

  // Resolve Material URL
  const resolveMatUrl = async (mat: any): Promise<string> => {
    const url: string = mat.file_url || "";
    if (!url) throw new Error("No file URL");
    if (url.startsWith("http")) return url;
    const { data } = await supabase.storage.from("subject-files").createSignedUrl(url, 3600);
    if (!data?.signedUrl) throw new Error("Could not get file URL");
    return data.signedUrl;
  };

  // ✅ FIXED: Generate Flashcards from Material
  const generateFromMaterial = async () => {
    if (!selMaterial || !user || !subjectId) {
      setMatGenError("Missing material, user, or subject");
      return;
    }
    setMatGenLoading(true);
    setMatGenStep("generating");
    setMatGenError(null);
    
    try {
      setMatGenStatus("Getting file access…");
      const signedUrl = await resolveMatUrl(selMaterial);
      const subjectName = subject?.title || "the subject";
      let contextText = "";
      const fileExt = (selMaterial.file_url || "").split(".").pop()?.toLowerCase();
      const isPdf = selMaterial.material_type === "PDF" || selMaterial.file_type?.includes("pdf") || fileExt === "pdf";

      if (isPdf) {
        setMatGenStatus(`Reading pages ${pageFrom}–${pageTo}…`);
        contextText = await extractPdfText(signedUrl, pageFrom, pageTo);
        if (!contextText.trim()) throw new Error("No readable text found on these pages. The PDF may be scanned/image-based.");
      } else if (selMaterial.content) {
        contextText = selMaterial.content;
      } else {
        throw new Error("This file type cannot be read automatically. Try a text-based PDF or add content manually.");
      }

      setMatGenStatus("Generating with AI…");

      if (matGenMode === "flashcard") {
        const raw = await callClaude(
          `You are an expert educator. Based on the following content from "${selMaterial.title}" (${subjectName}), create ${numQuestions} high-quality educational flashcards.
CONTENT:
${contextText.slice(0, 6000)}
Rules:
- Focus on key concepts, vocabulary, definitions, and facts from the text- Questions should test understanding, not just memorization
- Include Arabic translations where relevant
- Return ONLY valid JSON array, no markdown, no explanations:
[{"front":"<question or term>","front_ar":"<Arabic>","back":"<answer>","back_ar":"<Arabic answer>","topic":"<topic from text>"}]`
        );
        
        const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
        console.log("🤖 Material AI Response:", clean.slice(0, 300) + "...");
        
        let cards: any[];
        try {
          cards = JSON.parse(clean) as any[];
        } catch (parseErr: any) {
          console.error("❌ Material JSON Parse Error:", parseErr);
          throw new Error(`AI response not valid JSON: ${parseErr.message}`);
        }
        
        if (!Array.isArray(cards) || cards.length === 0) {
          throw new Error("AI returned no flashcards from this material");
        }
        
        let inserted = 0;
        let failed = 0;
        
        for (let i = 0; i < cards.length; i++) {
          const card = cards[i];
          if (!card.front || !card.back) { failed++; continue; }
          
          const { error } = await supabase.from("revision_flashcards").insert({
            subject_id: subjectId,
            front_text: card.front,
            front_text_ar: card.front_ar || null,
            back_text: card.back,
            back_text_ar: card.back_ar || null,
            topic: card.topic || selMaterial.title,
            created_by: user.id,
            is_ai_generated: true,
            order_index: flashcards.length + inserted,
            source_material_id: selMaterial.id,
          } as any);
          
          if (error) {
            console.error(`❌ Material card ${i + 1} insert error:`, error);
            failed++;
          } else {
            inserted++;
          }
        }
        
        await qc.invalidateQueries({ queryKey: ["revision-flashcards", subjectId] });        
        if (inserted === 0) {
          throw new Error(`Failed to save any cards${failed > 0 ? ` (${failed} errors)` : ""}`);
        }
        
        toast({ title: `✅ ${inserted} flashcards generated from material!` });
        if (failed > 0) toast({ title: `⚠️ ${failed} cards failed`, variant: "destructive" });
        
      } else {
        // Quiz generation (same pattern)
        const raw = await callClaude(
          `You are an expert educator. Based on the following content from "${selMaterial.title}" (${subjectName}), create ${numQuestions} multiple-choice quiz questions.
CONTENT:
${contextText.slice(0, 6000)}
Rules:
- Questions must be DIRECTLY based on the provided content
- Test comprehension and application, not just recall
- Each question should have 4 clear options with one correct answer
- Include a brief explanation referencing the material
- Return ONLY valid JSON array:
[{"question":"<question>","options":["A","B","C","D"],"answer":"<exact option text>","explanation":"<why this is correct, referencing the text>"}]`
        );
        const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
        const qs = (JSON.parse(clean) as any[]).map((q, i) => ({
          id: `mat-${i}`, question: q.question, answer: q.answer,
          options: q.options, explanation: q.explanation, source: "ai" as const,
        }));
        setQuizQs(qs); setQuizIdx(0); setQuizAnswers({}); setQuizDone(false);
        setQuizSource("ai"); setQuizMode(true);
      }
      
      setShowMatGen(false);
      setSelMaterial(null);
      setMatGenStep("pick");
      
    } catch (e: any) {
      console.error("❌ generateFromMaterial error:", e);
      setMatGenError(e.message);
      setMatGenStep("config");
      toast({ title: "❌ Generation failed", description: e.message, variant: "destructive" });
    } finally {
      setMatGenLoading(false);
      setMatGenStatus("");
    }
  };

  // ✅ FIXED: Generate AI Flashcards (Main Fix)
  const generateAiFlashcards = async () => {
    if (!aiCardTopic.trim() || !user || !subjectId) {
      setAiCardError("Missing topic, user, or subject");      return;
    }
    
    setAiCardLoading(true);
    setAiCardError(null);
    
    try {
      const subjectName = subject 
        ? `${subject.title}${subject.title_ar ? " (" + subject.title_ar + ")" : ""}` 
        : "the subject";
      
      // Generate AI response
      const raw = await callClaude(
        `Create ${aiCardCount} educational flashcards about "${aiCardTopic}" for students studying ${subjectName}.
Return ONLY valid JSON array, no markdown, no explanations:
[{"front":"<question or term>","front_ar":"<Arabic translation>","back":"<answer or definition>","back_ar":"<Arabic answer>","topic":"${aiCardTopic}"}]
Rules:
- front and back are REQUIRED fields
- Include Arabic translations where relevant
- Make questions clear and educational`
      );
      
      // Clean and parse JSON response
      const clean = raw
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();
      
      console.log("🤖 AI Raw Response:", raw.slice(0, 200) + "...");
      console.log("🤖 AI Cleaned Response:", clean.slice(0, 200) + "...");
      
      let cards: any[];
      try {
        cards = JSON.parse(clean) as any[];
      } catch (parseErr: any) {
        console.error("❌ JSON Parse Error:", parseErr);
        console.error("❌ Failed to parse:", clean);
        throw new Error(`AI response is not valid JSON: ${parseErr.message}. Response: ${clean.slice(0, 300)}`);
      }
      
      // Validate cards array
      if (!Array.isArray(cards) || cards.length === 0) {
        console.error("❌ Empty or invalid cards array:", cards);
        throw new Error("AI returned no flashcards. Please try a more specific topic.");
      }
      
      console.log(`✅ Parsed ${cards.length} cards from AI`);
      
      // Insert cards into database
      let inserted = 0;      let failed = 0;
      
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        
        // Validate required fields
        if (!card.front || !card.back) {
          console.warn(`⚠️ Card ${i + 1} missing required fields:`, card);
          failed++;
          continue;
        }
        
        const { data, error } = await supabase
          .from("revision_flashcards")
          .insert({
            subject_id: subjectId,
            front_text: card.front,
            front_text_ar: card.front_ar || null,
            back_text: card.back,
            back_text_ar: card.back_ar || null,
            topic: card.topic || aiCardTopic,
            created_by: user.id,
            is_ai_generated: true,
            order_index: flashcards.length + inserted,
          } as any)
          .select()
          .single();
        
        if (error) {
          console.error(`❌ Insert error for card ${i + 1}:`, error);
          failed++;
        } else {
          console.log(`✅ Inserted card ${i + 1}:`, data?.id);
          inserted++;
        }
      }
      
      // Invalidate cache and show result
      await qc.invalidateQueries({ queryKey: ["revision-flashcards", subjectId] });
      
      if (inserted === 0) {
        setAiCardError(`Failed to insert any cards. ${failed > 0 ? `Errors: ${failed}` : "Check console for details."}`);
        toast({ 
          title: "⚠️ No cards saved", 
          description: failed > 0 ? `${failed} cards failed to save` : "Unknown error",
          variant: "destructive" 
        });
      } else {
        toast({ title: `✅ ${inserted} flashcard${inserted !== 1 ? 's' : ''} generated!` });
        if (failed > 0) {          toast({ 
            title: `⚠️ ${failed} card${failed !== 1 ? 's' : ''} failed`, 
            variant: "destructive" 
          });
        }
        setShowAiCard(false);
        setAiCardTopic("");
      }
      
    } catch (e: any) {
      console.error("❌ generateAiFlashcards error:", e);
      setAiCardError(e.message || "Failed to generate flashcards");
      toast({ 
        title: "❌ Generation failed", 
        description: e.message,
        variant: "destructive" 
      });
    } finally {
      setAiCardLoading(false);
    }
  };

  // Generate AI Quiz
  const generateAiQuiz = async () => {
    if (!aiQuizTopic.trim()) return;
    setQuizLoading(true);
    setAiQuizError(null);
    try {
      const subjectName = subject?.title || "the subject";
      const raw = await callClaude(
        `Create 10 multiple-choice quiz questions about "${aiQuizTopic}" for students studying ${subjectName}.
Return ONLY valid JSON array:
[{"question":"<question>","options":["A","B","C","D"],"answer":"<exact option text>","explanation":"<brief explanation>"}]
Make questions educational and progressively challenging.`
      );
      const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const qs = (JSON.parse(clean) as any[]).map((q, i) => ({
        id: `ai-${i}`, question: q.question, answer: q.answer,
        options: q.options, explanation: q.explanation, source: "ai" as const,
      }));
      setQuizQs(qs); setQuizIdx(0); setQuizAnswers({}); setQuizDone(false);
      setQuizSource("ai"); setQuizMode(true); setShowAiQuiz(false);
    } catch (e: any) {
      setAiQuizError(e.message);
      toast({ title: "❌ Quiz generation failed", description: e.message, variant: "destructive" });
    } finally { setQuizLoading(false); }
  };

  // Start Exam Quiz
  const startExamQuiz = async (examId: string) => {    setQuizLoading(true);
    try {
      const { data: qs, error } = await supabase.from("exam_questions").select("*").eq("exam_id", examId).order("created_at");
      if (error) throw error;
      if (!qs?.length) { toast({ title: "No questions in this exam yet." }); setQuizLoading(false); return; }
      const questions: QuizQ[] = qs
        .filter((q: any) => q.question_type === "mcq" && q.options?.length >= 2)
        .sort(() => Math.random() - 0.5)
        .slice(0, 15)
        .map((q: any) => ({
          id: q.id, source: "exam" as const,
          question: language === "ar" ? q.question_text_ar || q.question_text : q.question_text,
          answer: q.correct_answer,
          options: (q.options as any[]).map((o: any) => typeof o === "string" ? o : o.text || o.value || ""),
          explanation: q.explanation || "",
        }));
      if (!questions.length) { toast({ title: "No MCQ questions found in this exam." }); setQuizLoading(false); return; }
      setQuizQs(questions); setQuizIdx(0); setQuizAnswers({}); setQuizDone(false);
      setQuizSource("exam"); setQuizMode(true);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setQuizLoading(false); }
  };

  // Start Flashcard Quiz
  const startFlashcardQuiz = () => {
    if (flashcards.length < 2) return;
    const shuffled = [...flashcards].sort(() => Math.random() - 0.5).slice(0, Math.min(10, flashcards.length));
    const questions: QuizQ[] = shuffled.map(c => {
      const correct = language === "ar" ? c.back_text_ar || c.back_text : c.back_text;
      const wrongs = flashcards.filter(x => x.id !== c.id).sort(() => Math.random() - 0.5).slice(0, 3).map(x => language === "ar" ? x.back_text_ar || x.back_text : x.back_text);
      return {
        id: c.id, source: "flashcard" as const,
        question: language === "ar" ? c.front_text_ar || c.front_text : c.front_text,
        answer: correct,
        options: [correct, ...wrongs].sort(() => Math.random() - 0.5),
      };
    });
    setQuizQs(questions); setQuizIdx(0); setQuizAnswers({}); setQuizDone(false);
    setQuizSource("flashcard"); setQuizMode(true);
  };

  // Submit Quiz Answer
  const submitAnswer = (answer: string) => {
    const next = { ...quizAnswers, [quizIdx]: answer };
    setQuizAnswers(next);
    if (quizIdx < quizQs.length - 1) {
      setQuizIdx(i => i + 1);
    } else {
      setQuizDone(true);      const score = quizQs.reduce((s, q, i) => s + (next[i] === q.answer ? 1 : 0), 0);
      if (user) {
        supabase.from("revision_quiz_sessions").insert({
          student_id: user.id, subject_id: subjectId, source: quizSource,
          score, total: quizQs.length,
          percentage: Math.round((score / quizQs.length) * 100),
          answers: next, completed_at: new Date().toISOString(),
        } as any).then(() => qc.invalidateQueries({ queryKey: ["revision-quiz-history"] }));
      }
    }
  };

  // Mark Flashcard Status
  const markCard = async (status: "known" | "learning" | "new") => {
    const card = flashcards[cardIdx];
    if (!card || !user) return;
    setStudyResults(p => ({ ...p, [card.id]: status }));
    const ex = fcProgress.find((p: any) => p.flashcard_id === card.id);
    if (ex) {
      await supabase.from("revision_flashcard_progress").update({ status, times_reviewed: (ex.times_reviewed || 0) + 1, last_reviewed_at: new Date().toISOString() } as any).eq("id", ex.id);
    } else {
      await supabase.from("revision_flashcard_progress").insert({ student_id: user.id, flashcard_id: card.id, status, times_reviewed: 1, last_reviewed_at: new Date().toISOString() } as any);
    }
    if (cardIdx < flashcards.length - 1) { setCardIdx(i => i + 1); setFlipped(false); }
    else { setStudyMode(false); qc.invalidateQueries({ queryKey: ["revision-fc-progress"] }); toast({ title: "🎉 Session complete!" }); }
  };

  // Save Manual Flashcard
  const saveFlashcard = async () => {
    if (!user || !cardForm.front || !cardForm.back) return;
    const { error } = await supabase.from("revision_flashcards").insert({
      subject_id: subjectId, front_text: cardForm.front, front_text_ar: cardForm.front_ar || null,
      back_text: cardForm.back, back_text_ar: cardForm.back_ar || null, topic: cardForm.topic || null,
      created_by: user.id, order_index: flashcards.length,
    } as any);
    if (error) {
      toast({ title: "❌ Failed to save", description: error.message, variant: "destructive" });
      return;
    }
    setShowAddCard(false); setCardForm({ front: "", front_ar: "", back: "", back_ar: "", topic: "" });
    qc.invalidateQueries({ queryKey: ["revision-flashcards", subjectId] });
    toast({ title: "✅ Card added!" });
  };

  // Save Note
  const saveNote = async () => {
    if (!user || !noteForm.content) return;
    await supabase.from("revision_notes").insert({ student_id: user.id, subject_id: subjectId, title: noteForm.title || "Untitled", content: noteForm.content, is_private: true } as any);
    setShowNewNote(false); setNoteForm({ title: "", content: "" });
    qc.invalidateQueries({ queryKey: ["revision-notes"] });    toast({ title: "✅ Note saved!" });
  };

  // ── RENDER: Study Mode ─────────────────────────────────────
  if (studyMode && flashcards.length > 0) {
    const card = flashcards[cardIdx];
    const pct = Math.round(((cardIdx + 1) / flashcards.length) * 100);
    return (
      <div style={{ minHeight: "100svh", background: "#F8F9FA", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 16px" }}>
        <div style={{ width: "100%", maxWidth: 500 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <button onClick={() => setStudyMode(false)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#6B7280", fontWeight: 600 }}>
              <ArrowLeft size={16} /> Exit
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#6B7280" }}>{cardIdx + 1} / {flashcards.length}</span>
          </div>
          <div style={{ height: 6, background: "#E5E7EB", borderRadius: 3, marginBottom: 24, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: G, transition: "width .3s", borderRadius: 3 }} />
          </div>
          <div onClick={() => setFlipped(f => !f)}
            style={{ background: "#fff", borderRadius: 20, border: `2px solid ${flipped ? GOLD : G}`, padding: "40px 24px", minHeight: 220, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,.08)", transition: "border-color .2s", marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: flipped ? GOLD : G, marginBottom: 12 }}>
              {flipped ? "Answer" : "Question"}
            </div>
            <p style={{ fontSize: 18, fontWeight: 600, color: "#111", lineHeight: 1.6, fontFamily: "'Amiri',serif" }}>
              {flipped ? (language === "ar" ? card.back_text_ar || card.back_text : card.back_text) : (language === "ar" ? card.front_text_ar || card.front_text : card.front_text)}
            </p>
            {!flipped && <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 16 }}>Tap to reveal answer</p>}
            {card.topic && <span style={{ marginTop: 14, fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#F3F4F6", color: "#6B7280" }}>{card.topic}</span>}
          </div>
          {flipped && (
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              {[
                { label: "Still Learning", icon: "😕", status: "new" as const, bg: "#FEF2F2", border: "#FECACA", text: "#DC2626" },
                { label: "Almost", icon: "🤔", status: "learning" as const, bg: "#FFFBEB", border: "#FDE68A", text: "#D97706" },
                { label: "Know It!", icon: "✅", status: "known" as const, bg: "#F0FDF4", border: "#86EFAC", text: "#16A34A" },
              ].map(b => (
                <button key={b.status} onClick={() => markCard(b.status)}
                  style={{ flex: 1, padding: "12px 8px", borderRadius: 14, border: `1.5px solid ${b.border}`, background: b.bg, cursor: "pointer", fontWeight: 700, fontSize: 12, color: b.text, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 20 }}>{b.icon}</span>{b.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── RENDER: Quiz Mode ─────────────────────────────────────  if (quizMode && quizQs.length > 0) {
    if (quizDone) {
      const score = quizQs.reduce((s, q, i) => s + (quizAnswers[i] === q.answer ? 1 : 0), 0);
      const pct = Math.round((score / quizQs.length) * 100);
      return (
        <div style={{ minHeight: "100svh", background: "#F8F9FA", padding: "24px 16px" }}>
          <div style={{ maxWidth: 540, margin: "0 auto" }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 28, textAlign: "center", marginBottom: 20, boxShadow: "0 4px 20px rgba(0,0,0,.06)" }}>
              <div style={{ fontSize: 56, marginBottom: 12 }}>{pct >= 80 ? "🏆" : pct >= 60 ? "👍" : ""}</div>
              <h2 style={{ fontWeight: 900, fontSize: 24, color: G, margin: "0 0 8px" }}>Quiz Complete!</h2>
              <div style={{ fontSize: 48, fontWeight: 900, color: pct >= 70 ? "#16A34A" : "#DC2626", margin: "12px 0" }}>{score}/{quizQs.length}</div>
              <div style={{ fontSize: 16, color: "#6B7280", marginBottom: 20 }}>{pct}% correct</div>
              <div style={{ height: 8, background: "#E5E7EB", borderRadius: 4, marginBottom: 20, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: pct >= 70 ? "#16A34A" : "#DC2626", borderRadius: 4 }} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setQuizMode(false); setQuizDone(false); }}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                  Done
                </button>
                <button onClick={() => { setQuizIdx(0); setQuizAnswers({}); setQuizDone(false); }}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: G, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <RotateCcw size={14} /> Try Again
                </button>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {quizQs.map((q, i) => {
                const correct = quizAnswers[i] === q.answer;
                return (
                  <div key={i} style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${correct ? "#86EFAC" : "#FECACA"}`, padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{correct ? "✅" : "❌"}</span>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: 0, flex: 1, lineHeight: 1.5 }}>{q.question}</p>
                    </div>
                    {!correct && <p style={{ fontSize: 12, color: "#DC2626", margin: "4px 0", paddingLeft: 28 }}>Your answer: {quizAnswers[i] || "—"}</p>}
                    <p style={{ fontSize: 12, color: "#16A34A", margin: "2px 0", paddingLeft: 28, fontWeight: 600 }}>Correct: {q.answer}</p>
                    {q.explanation && <p style={{ fontSize: 11, color: "#6B7280", marginTop: 4, paddingLeft: 28, fontStyle: "italic" }}>{q.explanation}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }
    const q = quizQs[quizIdx];
    const pct = Math.round(((quizIdx + 1) / quizQs.length) * 100);
    return (
      <div style={{ minHeight: "100svh", background: "#F8F9FA", padding: "20px 16px" }}>        <div style={{ maxWidth: 540, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <button onClick={() => setQuizMode(false)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#6B7280", fontWeight: 600 }}>
              <X size={16} /> Exit Quiz
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#F3F4F6", color: "#6B7280", fontWeight: 700 }}>
                {q.source === "ai" ? "🤖 AI" : q.source === "exam" ? "📋 Exam" : "🃏 Flashcard"}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#6B7280" }}>{quizIdx + 1}/{quizQs.length}</span>
            </div>
          </div>
          <div style={{ height: 6, background: "#E5E7EB", borderRadius: 3, marginBottom: 20, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "#3B82F6", transition: "width .3s", borderRadius: 3 }} />
          </div>
          <div style={{ background: "#fff", borderRadius: 20, padding: "24px 20px", boxShadow: "0 4px 20px rgba(0,0,0,.06)", marginBottom: 12 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#111", lineHeight: 1.6, margin: "0 0 20px", fontFamily: "'Amiri',serif" }}>{q.question}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {q.options.map((opt, oi) => (
                <button key={oi} onClick={() => submitAnswer(opt)}
                  style={{ padding: "14px 16px", borderRadius: 12, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", textAlign: "left", fontSize: 14, fontWeight: 500, color: "#374151", transition: "all .15s" }}
                  onMouseEnter={e => { (e.currentTarget as any).style.borderColor = G; (e.currentTarget as any).style.background = "#F0FDF4"; }}
                  onMouseLeave={e => { (e.currentTarget as any).style.borderColor = "#E5E7EB"; (e.currentTarget as any).style.background = "#fff"; }}>
                  <span style={{ fontWeight: 700, marginRight: 10, color: "#9CA3AF" }}>{String.fromCharCode(65 + oi)}.</span>{opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── RENDER: Main UI ─────────────────────────────────────
  const tabs = [
    { id: "flashcards", icon: "🃏", label: "Flashcards", count: flashcards.length },
    { id: "quiz", icon: "📝", label: "Quiz", count: quizHistory.length },
    { id: "summaries", icon: "📄", label: "Summaries", count: summaries.length },
    { id: "notes", icon: "📓", label: "My Notes", count: notes.length },
    { id: "progress", icon: "📊", label: "Progress", count: null },
  ];

  return (
    <div style={{ minHeight: "100svh", background: "#FAF6EE" }}>
      <div style={{ background: `linear-gradient(135deg,${G},${GM})`, padding: "16px 18px 0" }}>
        <Link to="/student/revision" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,.7)", textDecoration: "none", marginBottom: 10, fontWeight: 600 }}>
          <ArrowLeft size={14} /> Back to Revision Hub
        </Link>
        <h1 style={{ fontWeight: 900, fontSize: 20, color: "#fff", margin: "0 0 4px", fontFamily: "'Playfair Display',serif" }}>
          {language === "ar" ? subject?.title_ar || subject?.title : subject?.title} — Revision        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ height: 6, flex: 1, background: "rgba(255,255,255,.2)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${mastery}%`, height: "100%", background: "#4ADE80", borderRadius: 3 }} />
          </div>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,.8)", fontWeight: 700 }}>{mastery}% mastered</span>
        </div>

        {/* Level-based Subject Navigator */}
        <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 12, padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>📚 Switch Subject by Level</span>
            <ChevronDown size={14} color="rgba(255,255,255,0.6)" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {["beginner", "intermediate", "advanced"].map(lvl => {
              const subs = subjectsByLevel[lvl] || [];
              const isExpanded = expandedLevels[lvl];
              const cfg = {
                beginner: { label: "Beginner", color: "#86EFAC", bg: "rgba(34,197,94,0.15)" },
                intermediate: { label: "Intermediate", color: "#93C5FD", bg: "rgba(59,130,246,0.15)" },
                advanced: { label: "Advanced", color: "#C4B5FD", bg: "rgba(139,92,246,0.15)" },
              }[lvl];
              return (
                <div key={lvl} style={{ background: cfg.bg, borderRadius: 8, overflow: "hidden" }}>
                  <button
                    onClick={() => setExpandedLevels(p => ({ ...p, [lvl]: !p[lvl] }))}
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "transparent", border: "none", cursor: "pointer", color: cfg.color, fontSize: 12, fontWeight: 700 }}
                  >
                    <span>{cfg.label} ({subs.length})</span>
                    <ChevronDown size={12} style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                  </button>
                  {isExpanded && subs.length > 0 && (
                    <div style={{ padding: "4px 8px 8px", display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {subs.map(s => (
                        <Link key={s.id} to={`/student/revision/${s.id}`}
                          style={{
                            fontSize: 11, padding: "4px 8px", borderRadius: 6,
                            background: s.id === subjectId ? cfg.color : "rgba(255,255,255,0.1)",
                            color: s.id === subjectId ? "#064E3B" : cfg.color,
                            textDecoration: "none", fontWeight: s.id === subjectId ? 800 : 500,
                            transition: "all 0.15s"
                          }}
                        >
                          {language === "ar" ? s.title_ar || s.title : s.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>              );
            })}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, overflowX: "auto", paddingBottom: 0 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: "10px 14px", border: "none", background: tab === t.id ? "#fff" : "transparent", color: tab === t.id ? G : "rgba(255,255,255,.7)", borderRadius: "10px 10px 0 0", cursor: "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", transition: "all .15s", display: "flex", alignItems: "center", gap: 6 }}>
              {t.icon} {t.label}
              {t.count !== null && t.count > 0 && (
                <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 20, background: tab === t.id ? "#DCFCE7" : "rgba(255,255,255,.2)", color: tab === t.id ? G : "rgba(255,255,255,.8)" }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "20px 16px", maxWidth: 720, margin: "0 auto" }}>
        {/* Flashcards Tab */}
        {tab === "flashcards" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#374151", margin: 0 }}>{flashcards.length} cards · {mastery}% mastered</p>
                <div style={{ height: 5, width: 120, background: "#E5E7EB", borderRadius: 3, marginTop: 4, overflow: "hidden" }}>
                  <div style={{ width: `${mastery}%`, height: "100%", background: "#22C55E", borderRadius: 3 }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {flashcards.length >= 2 && (
                  <button onClick={() => { setCardIdx(0); setFlipped(false); setStudyResults({}); setStudyMode(true); }}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10, border: "none", background: G, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                    <Layers size={14} /> Study Cards
                  </button>
                )}
                <button onClick={() => { setMatGenMode("flashcard"); setMatGenStep("pick"); setShowMatGen(true); }} disabled={materials.length === 0}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10, border: "none", background: materials.length > 0 ? "#0F766E" : "#E5E7EB", color: materials.length > 0 ? "#fff" : "#9CA3AF", cursor: materials.length > 0 ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 700 }}>
                  📚 From Material
                </button>
                <button onClick={() => setShowAiCard(true)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10, border: "none", background: GOLD, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                  <Sparkles size={14} /> AI Topic
                </button>
                <button onClick={() => setShowAddCard(true)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#374151" }}>
                  <Plus size={14} /> Manual
                </button>
              </div>            </div>
            {flashcards.length === 0 ? (
              <div style={{ textAlign: "center", padding: "56px 24px", background: "#fff", borderRadius: 20, border: "2px dashed #E5E7EB" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🃏</div>
                <p style={{ fontWeight: 700, color: "#374151", marginBottom: 6 }}>No flashcards yet</p>
                <p style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 20 }}>Generate from a topic using AI or add manually</p>
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button onClick={() => setShowAiCard(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 11, border: "none", background: GOLD, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                    <Sparkles size={14} /> Generate with AI
                  </button>
                  <button onClick={() => setShowAddCard(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 11, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13, color: "#374151" }}>
                    <Plus size={14} /> Add Manually
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 10 }}>
                {flashcards.map((card) => {
                  const prog = fcProgress.find((p: any) => p.flashcard_id === card.id);
                  const statusCfg: Record<string, { bg: string; text: string; label: string }> = {
                    known: { bg: "#DCFCE7", text: "#166534", label: "Known" },
                    learning: { bg: "#FEF9C3", text: "#854D0E", label: "Learning" },
                    new: { bg: "#F3F4F6", text: "#6B7280", label: "New" },
                  };
                  const s = statusCfg[prog?.status || "new"];
                  return (
                    <div key={card.id} style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #E5E7EB", padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "#111", flex: 1, margin: 0, fontFamily: "'Amiri',serif", lineHeight: 1.6 }}>
                          {language === "ar" ? card.front_text_ar || card.front_text : card.front_text}
                        </p>
                        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: s.bg, color: s.text, fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>{s.label}</span>
                      </div>
                      <p style={{ fontSize: 12, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
                        {language === "ar" ? card.back_text_ar || card.back_text : card.back_text}
                      </p>
                      {card.topic && <span style={{ display: "inline-block", marginTop: 8, fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#EFF6FF", color: "#1D4ED8" }}>{card.topic}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Quiz Tab */}
        {tab === "quiz" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <h3 style={{ fontWeight: 800, fontSize: 16, color: "#111", margin: 0 }}>Choose Quiz Source</h3>
            <div style={{ display: "grid", gap: 10 }}>              {materials.length > 0 && (
                <div style={{ background: "linear-gradient(135deg,#0F766E,#0D9488)", borderRadius: 16, padding: "18px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 28 }}>📚</span>
                      <div>
                        <p style={{ fontWeight: 800, fontSize: 15, color: "#fff", margin: 0 }}>From Subject Materials</p>
                        <p style={{ fontSize: 12, color: "rgba(255,255,255,.7)", margin: 0 }}>Quiz from uploaded PDFs &amp; docs</p>
                      </div>
                    </div>
                    <button onClick={() => { setMatGenMode("quiz"); setMatGenStep("pick"); setShowMatGen(true); }}
                      style={{ padding: "8px 16px", borderRadius: 9, border: "1px solid rgba(255,255,255,.3)", background: "rgba(255,255,255,.15)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                      Start →
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {materials.filter((m: any) => m.file_url).slice(0, 3).map((m: any) => (
                      <span key={m.id} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "rgba(255,255,255,.15)", color: "rgba(255,255,255,.85)" }}>
                        {m.title.length > 20 ? m.title.slice(0, 20) + "…" : m.title}
                      </span>
                    ))}
                    {materials.filter((m: any) => m.file_url).length > 3 && (
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "rgba(255,255,255,.15)", color: "rgba(255,255,255,.85)" }}>+{materials.filter((m: any) => m.file_url).length - 3} more</span>
                    )}
                  </div>
                </div>
              )}
              <div style={{ background: `linear-gradient(135deg,${GOLD},#A67C1E)`, borderRadius: 16, padding: "18px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 28 }}>🤖</span>
                    <div>
                      <p style={{ fontWeight: 800, fontSize: 15, color: "#fff", margin: 0 }}>AI-Generated Quiz</p>
                      <p style={{ fontSize: 12, color: "rgba(255,255,255,.7)", margin: 0 }}>Practice on any topic instantly</p>
                    </div>
                  </div>
                  <button onClick={() => setShowAiQuiz(true)}
                    style={{ padding: "8px 16px", borderRadius: 9, border: "1px solid rgba(255,255,255,.3)", background: "rgba(255,255,255,.15)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                    Start →
                  </button>
                </div>
              </div>
              <div style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", border: "1.5px solid #E5E7EB" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 24 }}>🃏</span>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: 14, color: "#111", margin: 0 }}>From Flashcards</p>
                      <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>{flashcards.length} cards available</p>
                    </div>                  </div>
                  <button onClick={startFlashcardQuiz} disabled={flashcards.length < 2}
                    style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: flashcards.length >= 2 ? G : "#E5E7EB", color: flashcards.length >= 2 ? "#fff" : "#9CA3AF", cursor: flashcards.length >= 2 ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 700 }}>
                    {flashcards.length < 2 ? "Need 2+ cards" : "Start →"}
                  </button>
                </div>
              </div>
              {exams.length > 0 && (
                <div style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", border: "1.5px solid #E5E7EB" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: 24 }}>📋</span>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: 14, color: "#111", margin: 0 }}>From Past Exams</p>
                      <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>{exams.length} exam{exams.length !== 1 ? "s" : ""} available</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {exams.map((ex: any) => (
                      <button key={ex.id} onClick={() => startExamQuiz(ex.id)}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer", textAlign: "left" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{language === "ar" ? ex.title_ar || ex.title : ex.title}</span>
                        <ChevronRight size={14} color="#9CA3AF" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {quizHistory.length > 0 && (
              <div>
                <h4 style={{ fontWeight: 700, fontSize: 14, color: "#374151", marginBottom: 10 }}>Recent Results</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {quizHistory.slice(0, 5).map((q: any) => (
                    <div key={q.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: "#374151", margin: 0 }}>{q.source} quiz</p>
                        <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{q.completed_at ? format(new Date(q.completed_at), "MMM d, h:mm a") : ""}</p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ fontSize: 16, fontWeight: 800, color: Number(q.percentage) >= 70 ? "#16A34A" : "#DC2626", margin: 0 }}>{q.score}/{q.total}</p>
                        <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{Math.round(q.percentage || 0)}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {/* Summaries Tab */}
        {tab === "summaries" && (
          summaries.length === 0 ? (
            <div style={{ textAlign: "center", padding: "56px 24px", background: "#fff", borderRadius: 20, border: "2px dashed #E5E7EB" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
              <p style={{ fontWeight: 700, color: "#374151" }}>No summaries yet</p>
              <p style={{ fontSize: 13, color: "#9CA3AF" }}>Your teacher will add summaries here</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {summaries.map((s: any) => (
                <div key={s.id} style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB", padding: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <h4 style={{ fontWeight: 700, fontSize: 14, color: "#111", margin: 0 }}>{language === "ar" ? s.title_ar || s.title : s.title}</h4>
                    <div style={{ display: "flex", gap: 6 }}>
                      {s.topic && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#EFF6FF", color: "#1D4ED8" }}>{s.topic}</span>}
                      {s.is_ai_generated && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#FEF3C7", color: GOLD }}>AI</span>}
                    </div>
                  </div>
                  <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.7, margin: 0, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" } as any}>
                    {language === "ar" ? s.content_ar || s.content : s.content}
                  </p>
                  <p style={{ fontSize: 11, color: "#D1D5DB", marginTop: 8 }}>{s.created_at ? format(new Date(s.created_at), "MMM d, yyyy") : ""}</p>
                </div>
              ))}
            </div>
          )
        )}

        {/* Notes Tab */}
        {tab === "notes" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setShowNewNote(true)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10, border: "none", background: G, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                <Plus size={14} /> New Note
              </button>
            </div>
            {notes.length === 0 ? (
              <div style={{ textAlign: "center", padding: "56px 24px", background: "#fff", borderRadius: 20, border: "2px dashed #E5E7EB" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📓</div>
                <p style={{ fontWeight: 700, color: "#374151" }}>No notes yet</p>
                <p style={{ fontSize: 13, color: "#9CA3AF" }}>Write personal notes to reinforce your learning</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {notes.map((n: any) => (
                  <div key={n.id} style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB", padding: "16px" }}>
                    <h4 style={{ fontWeight: 700, fontSize: 14, color: "#111", margin: "0 0 6px" }}>{n.title || "Untitled"}</h4>
                    <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.7, margin: 0 }}>{n.content}</p>                    <p style={{ fontSize: 11, color: "#D1D5DB", marginTop: 8 }}>{n.updated_at ? format(new Date(n.updated_at), "MMM d, yyyy h:mm a") : ""}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Progress Tab */}
        {tab === "progress" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
              {[
                { label: "Cards Mastered", value: `${knownCount}/${flashcards.length}`, icon: "🃏", color: "#F0FDF4", text: "#166534" },
                { label: "Quiz Average", value: `${quizAvg}%`, icon: "📝", color: "#EFF6FF", text: "#1D4ED8" },
                { label: "Quizzes Taken", value: quizHistory.length, icon: "🏆", color: "#FDF4FF", text: GOLD },
                { label: "Notes Written", value: notes.length, icon: "📓", color: "#FFF7ED", text: "#C2410C" },
              ].map((s, i) => (
                <div key={i} style={{ background: s.color, borderRadius: 16, padding: "18px 16px" }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: s.text }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: s.text, opacity: .7, fontWeight: 600 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ background: "#fff", borderRadius: 16, padding: "18px", border: "1px solid #E5E7EB" }}>
              <h4 style={{ fontWeight: 700, fontSize: 14, color: "#111", marginBottom: 14 }}>Flashcard Mastery</h4>
              {[
                { label: "Known", count: knownCount, color: "#22C55E", bg: "#DCFCE7" },
                { label: "Learning", count: learningCount, color: "#EAB308", bg: "#FEF9C3" },
                { label: "New", count: flashcards.length - knownCount - learningCount, color: "#D1D5DB", bg: "#F3F4F6" },
              ].map(r => (
                <div key={r.label} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{r.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#6B7280" }}>{r.count}</span>
                  </div>
                  <div style={{ height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${flashcards.length > 0 ? Math.round((r.count / flashcards.length) * 100) : 0}%`, height: "100%", background: r.color, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
            {quizHistory.length > 0 && (
              <div style={{ background: "#fff", borderRadius: 16, padding: "18px", border: "1px solid #E5E7EB" }}>
                <h4 style={{ fontWeight: 700, fontSize: 14, color: "#111", marginBottom: 14 }}>Quiz History</h4>
                {quizHistory.slice(0, 10).map((q: any) => (
                  <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 11, color: "#9CA3AF", minWidth: 50 }}>{q.completed_at ? format(new Date(q.completed_at), "MMM d") : ""}</span>
                    <div style={{ flex: 1, height: 6, background: "#F3F4F6", borderRadius: 3, overflow: "hidden" }}>                      <div style={{ width: `${q.percentage || 0}%`, height: "100%", background: Number(q.percentage) >= 70 ? "#22C55E" : "#EF4444", borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: Number(q.percentage) >= 70 ? "#16A34A" : "#DC2626", minWidth: 36, textAlign: "right" }}>{Math.round(q.percentage || 0)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MODALS ─────────────────────────────────────────── */}
      
      {/* Material Generator Modal */}
      <Dialog open={showMatGen} onOpenChange={v => { if (!v) { setShowMatGen(false); setSelMaterial(null); setMatGenStep("pick"); setMatGenError(null); } }}>
        <DialogContent style={{ maxWidth: 520, borderRadius: 20, padding: 0, maxHeight: "92vh", overflowY: "auto" }}>
          <div style={{ background: "linear-gradient(135deg,#0F766E,#0D9488)", padding: "18px 20px", borderRadius: "20px 20px 0 0", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>📚</span>
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 16, color: "#fff", margin: 0 }}>
                {matGenMode === "quiz" ? "Generate Quiz from Material" : "Generate Flashcards from Material"}
              </h2>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,.7)", margin: 0 }}>AI reads your uploaded files and creates questions</p>
            </div>
          </div>
          {matGenStep === "pick" && (
            <div style={{ padding: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 14 }}>Choose a material file:</p>
              {materials.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 16px", background: "#F9FAFB", borderRadius: 14, border: "2px dashed #E5E7EB" }}>
                  <p style={{ fontSize: 13, color: "#9CA3AF" }}>No materials uploaded yet. Ask your teacher to upload files.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {materials.map((mat: any) => {
                    const ext = (mat.file_url || "").split(".").pop()?.toLowerCase();
                    const isPdf = mat.material_type === "PDF" || mat.file_type?.includes("pdf") || ext === "pdf";
                    const isText = !!mat.content;
                    const canRead = isPdf || isText;
                    return (
                      <button key={mat.id} onClick={() => { if (!canRead) return; setSelMaterial(mat); setPageFrom(1); setPageTo(5); setMatGenStep("config"); }}
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 14, border: `1.5px solid ${selMaterial?.id === mat.id ? "#0D9488" : "#E5E7EB"}`, background: selMaterial?.id === mat.id ? "#F0FDFA" : "#fff", cursor: canRead ? "pointer" : "not-allowed", textAlign: "left", opacity: canRead ? 1 : .5 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: isPdf ? "#FEF2F2" : isText ? "#FFFBEB" : "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <span style={{ fontSize: 20 }}>{isPdf ? "📄" : isText ? "📝" : ""}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 700, fontSize: 13, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mat.title}</p>
                          <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>
                            {isPdf ? "PDF — select page range" : isText ? "Text content" : "Not readable by AI"}
                            {mat.file_size ? " · " + ((mat.file_size / 1048576).toFixed(1)) + " MB" : ""}                          </p>
                        </div>
                        {canRead && <span style={{ fontSize: 18, color: "#0D9488" }}>→</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {matGenStep === "config" && selMaterial && (
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#F0FDFA", borderRadius: 12, border: "1px solid #99F6E4" }}>
                <span style={{ fontSize: 22 }}>📄</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: "#0F766E", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selMaterial.title}</p>
                </div>
                <button onClick={() => { setSelMaterial(null); setMatGenStep("pick"); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF" }}>✕</button>
              </div>
              {(selMaterial.material_type === "PDF" || selMaterial.file_type?.includes("pdf") || (selMaterial.file_url || "").split(".").pop()?.toLowerCase() === "pdf") && (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 10 }}>📖 Page Range <span style={{ color: "#9CA3AF", fontWeight: 400 }}>(AI will only read these pages)</span></p>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 4 }}>From page</label>
                      <input type="number" min={1} value={pageFrom} onChange={e => setPageFrom(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 18, fontWeight: 800, textAlign: "center", color: "#0F766E", outline: "none", boxSizing: "border-box" as const }} />
                    </div>
                    <div style={{ fontSize: 18, color: "#9CA3AF", paddingTop: 16 }}>→</div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 4 }}>To page</label>
                      <input type="number" min={pageFrom} value={pageTo} onChange={e => setPageTo(Math.max(pageFrom, parseInt(e.target.value) || pageFrom))}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 18, fontWeight: 800, textAlign: "center", color: "#0F766E", outline: "none", boxSizing: "border-box" as const }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {[[1, 5], [1, 10], [6, 15], [11, 20]].map(([f, t]) => (
                      <button key={f + "-" + t} onClick={() => { setPageFrom(f); setPageTo(t); }}
                        style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, border: `1px solid ${pageFrom === f && pageTo === t ? "#0D9488" : "#E5E7EB"}`, background: pageFrom === f && pageTo === t ? "#F0FDFA" : "#fff", color: pageFrom === f && pageTo === t ? "#0F766E" : "#6B7280", cursor: "pointer", fontWeight: 600 }}>
                        p{f}–{t}
                      </button>
                    ))}
                  </div>
                  <div style={{ padding: "10px 12px", background: "#FFF7ED", borderRadius: 10, border: "1px solid #FDE68A", marginTop: 8 }}>
                    <p style={{ fontSize: 11, color: "#A67C1E", margin: 0 }}>⚠️ <strong>Note:</strong> Only text-based PDFs work. Scanned/image PDFs cannot be read. Limit to 10–15 pages for best results.</p>
                  </div>
                </div>
              )}
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Number of {matGenMode === "flashcard" ? "flashcards" : "questions"}</p>                <div style={{ display: "flex", gap: 8 }}>
                  {[5, 10, 15, 20].map(n => (
                    <button key={n} onClick={() => setNumQuestions(n)}
                      style={{ flex: 1, padding: "10px", borderRadius: 10, border: `2px solid ${numQuestions === n ? "#0D9488" : "#E5E7EB"}`, background: numQuestions === n ? "#F0FDFA" : "#fff", color: numQuestions === n ? "#0F766E" : "#374151", cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              {matGenError && (
                <div style={{ padding: "10px 12px", background: "#FEF2F2", borderRadius: 10, border: "1px solid #FECACA", display: "flex", gap: 8, alignItems: "center" }}>
                  <AlertCircle size={16} color="#DC2626" />
                  <p style={{ fontSize: 12, color: "#DC2626", margin: 0 }}>{matGenError}</p>
                </div>
              )}
              <button onClick={generateFromMaterial} disabled={matGenLoading}
                style={{ padding: "14px", borderRadius: 12, border: "none", background: "#0F766E", color: "#fff", cursor: matGenLoading ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {matGenLoading ? <><Loader2 size={16} style={{ animation: "spin .8s linear infinite" }} /> Generating…</> : <><span style={{ fontSize: 18 }}>🤖</span> Generate {numQuestions} {matGenMode === "flashcard" ? "Flashcards" : "Questions"} from Pages {pageFrom}–{pageTo}</>}
              </button>
            </div>
          )}
          {matGenStep === "generating" && (
            <div style={{ padding: "48px 24px", textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#F0FDFA", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <Loader2 size={28} color="#0F766E" style={{ animation: "spin .8s linear infinite" }} />
              </div>
              <p style={{ fontWeight: 700, fontSize: 15, color: "#0F766E", marginBottom: 6 }}>AI is working…</p>
              <p style={{ fontSize: 13, color: "#9CA3AF" }}>{matGenStatus || "Processing material…"}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* AI Flashcard Generator Modal */}
      <Dialog open={showAiCard} onOpenChange={v => { setShowAiCard(v); if (!v) setAiCardError(null); }}>
        <DialogContent style={{ maxWidth: 440, borderRadius: 20, padding: 0 }}>
          <div style={{ background: `linear-gradient(135deg,${GOLD},#A67C1E)`, padding: "18px 20px", borderRadius: "20px 20px 0 0", display: "flex", alignItems: "center", gap: 10 }}>
            <Sparkles size={20} color="#fff" />
            <h2 style={{ fontWeight: 800, fontSize: 16, color: "#fff", margin: 0 }}>AI Flashcard Generator</h2>
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 6 }}>Topic or concept *</label>
              <Input value={aiCardTopic} onChange={e => setAiCardTopic(e.target.value)} placeholder="e.g. Arabic letters, Tajweed rules, Surah Al-Fatiha vocabulary…" style={{ borderRadius: 10 }} />
              <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>AI will generate question-answer flashcard pairs from this topic</p>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 6 }}>Number of cards</label>
              <div style={{ display: "flex", gap: 8 }}>
                {[5, 10, 15, 20].map(n => (                  <button key={n} onClick={() => setAiCardCount(n)}
                    style={{ flex: 1, padding: "9px", borderRadius: 9, border: `2px solid ${aiCardCount === n ? GOLD : "#E5E7EB"}`, background: aiCardCount === n ? "#FEF3C7" : "#fff", color: aiCardCount === n ? GOLD : "#374151", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {aiCardError && (
              <div style={{ padding: "10px 12px", background: "#FEF2F2", borderRadius: 10, border: "1px solid #FECACA", display: "flex", gap: 8, alignItems: "center" }}>
                <AlertCircle size={16} color="#DC2626" />
                <p style={{ fontSize: 12, color: "#DC2626", margin: 0 }}>{aiCardError}</p>
              </div>
            )}
            <button onClick={generateAiFlashcards} disabled={!aiCardTopic.trim() || aiCardLoading}
              style={{ padding: "13px", borderRadius: 12, border: "none", background: aiCardTopic.trim() ? GOLD : "#E5E7EB", color: aiCardTopic.trim() ? "#fff" : "#9CA3AF", cursor: aiCardTopic.trim() ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {aiCardLoading ? <><Loader2 size={16} style={{ animation: "spin .8s linear infinite" }} /> Generating…</> : <><Sparkles size={15} /> Generate {aiCardCount} Flashcards</>}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Add Card Modal */}
      <Dialog open={showAddCard} onOpenChange={setShowAddCard}>
        <DialogContent style={{ maxWidth: 440, borderRadius: 20, padding: 0 }}>
          <div style={{ background: G, padding: "18px 20px", borderRadius: "20px 20px 0 0", display: "flex", alignItems: "center", gap: 10 }}>
            <Plus size={20} color="#fff" />
            <h2 style={{ fontWeight: 800, fontSize: 16, color: "#fff", margin: 0 }}>Add Flashcard</h2>
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 5 }}>Front / Question *</label>
              <Textarea value={cardForm.front} onChange={e => setCardForm(p => ({ ...p, front: e.target.value }))} rows={2} style={{ borderRadius: 10 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 5 }}>Arabic (Front)</label>
              <Textarea dir="rtl" value={cardForm.front_ar} onChange={e => setCardForm(p => ({ ...p, front_ar: e.target.value }))} rows={2} style={{ borderRadius: 10 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 5 }}>Back / Answer *</label>
              <Textarea value={cardForm.back} onChange={e => setCardForm(p => ({ ...p, back: e.target.value }))} rows={2} style={{ borderRadius: 10 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 5 }}>Arabic (Back)</label>
              <Textarea dir="rtl" value={cardForm.back_ar} onChange={e => setCardForm(p => ({ ...p, back_ar: e.target.value }))} rows={2} style={{ borderRadius: 10 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 5 }}>Topic</label>
              <Input value={cardForm.topic} onChange={e => setCardForm(p => ({ ...p, topic: e.target.value }))} style={{ borderRadius: 10 }} placeholder="e.g. Grammar, Vocabulary…" />
            </div>
            <button onClick={saveFlashcard} disabled={!cardForm.front || !cardForm.back}              style={{ padding: "13px", borderRadius: 12, border: "none", background: (cardForm.front && cardForm.back) ? G : "#E5E7EB", color: (cardForm.front && cardForm.back) ? "#fff" : "#9CA3AF", cursor: (cardForm.front && cardForm.back) ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 14 }}>
              Add Card
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Quiz Generator Modal */}
      <Dialog open={showAiQuiz} onOpenChange={v => { setShowAiQuiz(v); if (!v) setAiQuizError(null); }}>
        <DialogContent style={{ maxWidth: 440, borderRadius: 20, padding: 0 }}>
          <div style={{ background: `linear-gradient(135deg,${GOLD},#A67C1E)`, padding: "18px 20px", borderRadius: "20px 20px 0 0", display: "flex", alignItems: "center", gap: 10 }}>
            <Brain size={20} color="#fff" />
            <h2 style={{ fontWeight: 800, fontSize: 16, color: "#fff", margin: 0 }}>AI Quiz Generator</h2>
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 6 }}>Topic to quiz on *</label>
              <Input value={aiQuizTopic} onChange={e => setAiQuizTopic(e.target.value)} placeholder="e.g. Rules of Tajweed, Arabic grammar, Islamic history…" style={{ borderRadius: 10 }} />
              <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>AI generates 10 multiple-choice questions instantly</p>
            </div>
            <div style={{ background: "#FEF3C7", borderRadius: 12, padding: "12px 14px", border: "1px solid #FCD34D" }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#A67C1E", margin: 0 }}>💡 Tips for better questions:</p>
              <ul style={{ fontSize: 11, color: GOLD, margin: "6px 0 0 0", paddingLeft: 16, lineHeight: 1.8 }}>
                <li>Be specific: "Noon Sakin rules" not just "Tajweed"</li>
                <li>Name the level: "beginner Arabic vocabulary"</li>
                <li>Reference the material: "lessons 1-5 topics"</li>
              </ul>
            </div>
            {aiQuizError && (
              <div style={{ padding: "10px 12px", background: "#FEF2F2", borderRadius: 10, border: "1px solid #FECACA", display: "flex", gap: 8, alignItems: "center" }}>
                <AlertCircle size={16} color="#DC2626" />
                <p style={{ fontSize: 12, color: "#DC2626", margin: 0 }}>{aiQuizError}</p>
              </div>
            )}
            <button onClick={generateAiQuiz} disabled={!aiQuizTopic.trim() || quizLoading}
              style={{ padding: "13px", borderRadius: 12, border: "none", background: aiQuizTopic.trim() ? GOLD : "#E5E7EB", color: aiQuizTopic.trim() ? "#fff" : "#9CA3AF", cursor: aiQuizTopic.trim() ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {quizLoading ? <><Loader2 size={16} style={{ animation: "spin .8s linear infinite" }} /> Generating…</> : <><Zap size={15} /> Generate Quiz</>}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Note Modal */}
      <Dialog open={showNewNote} onOpenChange={setShowNewNote}>
        <DialogContent style={{ maxWidth: 440, borderRadius: 20, padding: 0 }}>
          <div style={{ background: G, padding: "18px 20px", borderRadius: "20px 20px 0 0", display: "flex", alignItems: "center", gap: 10 }}>
            <StickyNote size={20} color="#fff" />
            <h2 style={{ fontWeight: 800, fontSize: 16, color: "#fff", margin: 0 }}>New Note</h2>
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 5 }}>Title</label>
              <Input value={noteForm.title} onChange={e => setNoteForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Tajweed summary…" style={{ borderRadius: 10 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 5 }}>Content *</label>
              <Textarea value={noteForm.content} onChange={e => setNoteForm(p => ({ ...p, content: e.target.value }))} rows={6} placeholder="Write your notes here…" style={{ borderRadius: 10 }} />
            </div>
            <button onClick={saveNote} disabled={!noteForm.content}
              style={{ padding: "13px", borderRadius: 12, border: "none", background: noteForm.content ? G : "#E5E7EB", color: noteForm.content ? "#fff" : "#9CA3AF", cursor: noteForm.content ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 14 }}>
              Save Note
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export default RevisionRoom;