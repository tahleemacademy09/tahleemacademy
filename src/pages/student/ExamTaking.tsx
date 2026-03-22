/*
  src/pages/student/ExamTaking.tsx
  ENHANCED VERSION — New question types, confidence indicator,
  keyboard navigation, section support, better mobile UX
*/
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  Clock, Flag, AlertTriangle, BookOpen, CheckCircle2,
  Lock, ChevronLeft, ChevronRight, Save, Eye, Grid, Send,
  Zap, ThumbsUp, ThumbsDown, Minus, RotateCcw, Keyboard
} from "lucide-react";
import AudioPlayer from "@/components/exam/AudioPlayer";
import AudioRecorder from "@/components/exam/AudioRecorder";
import ProctoringOverlay from "@/components/exam/ProctoringOverlay";
import { useProctoring } from "@/hooks/useProctoring";
import { useIsMobile } from "@/hooks/use-mobile";

const G = "#0f2d1f", GM = "#1a4731", GOLD = "#c9a84c", BORDER = "rgba(15,45,31,0.12)";
const CONFIDENT = "#22c55e", UNSURE = "#f59e0b", GUESSING = "#ef4444";

type Confidence = "confident" | "unsure" | "guessing" | null;
type AnswerState = { text: string; data: any; flagged: boolean; confidence: Confidence };

/* ── Bilingual question renderer ────────────────────────────────────
   Splits "Arabic (English)" → Arabic first, English below, no brackets.
─────────────────────────────────────────────────────────────────── */
function splitBilingual(text: string): { ar: string; en: string } | null {
  if (!text) return null;
  const t = text.trim();
  const m1 = t.match(/^([\s\S]*?[؀-ۿ][\s\S]*?)\s*\(([^)]+)\)\s*$/);
  if (m1 && /[a-zA-Z]/.test(m1[2])) return { ar: m1[1].trim(), en: m1[2].trim() };
  const m2 = t.match(/^\(([^)]+)\)\s*([\s\S]*[؀-ۿ][\s\S]*)$/);
  if (m2 && /[a-zA-Z]/.test(m2[1])) return { ar: m2[2].trim(), en: m2[1].trim() };
  const lines = t.split("\n");
  if (lines.length >= 2) {
    const arParts: string[] = [], enParts: string[] = [];
    for (const l of lines) {
      const s = l.replace(/[()]/g, "").trim(); if (!s) continue;
      if (/[؀-ۿ]/.test(s)) arParts.push(s);
      else if (/[a-zA-Z]/.test(s)) enParts.push(s);
    }
    if (arParts.length && enParts.length) return { ar: arParts.join(" "), en: enParts.join(" ") };
  }
  return null;
}

const QText = ({ text, textAr }: { text?: string; textAr?: string }) => {
  const primary = text || textAr || "";
  const secondary = textAr && textAr !== text ? textAr : null;
  const split = !secondary ? splitBilingual(primary) : null;
  const arStyle: React.CSSProperties = {
    fontFamily: "'Scheherazade New','Amiri Quran','Amiri',serif",
    fontSize: 22, fontWeight: 700, lineHeight: 2.3, color: G,
    textAlign: "right", direction: "rtl",
    padding: "10px 14px", background: "#f8fafb",
    borderRadius: 10, borderRight: `4px solid ${GOLD}`, marginBottom: 8,
  };
  const enStyle: React.CSSProperties = {
    fontFamily: "'Cairo',sans-serif", fontSize: 16, fontWeight: 600,
    lineHeight: 1.9, color: G, padding: "8px 14px",
    background: "#f0f4f2", borderRadius: 10, borderLeft: `4px solid ${GOLD}`,
  };
  if (secondary) return (
    <div>
      <div style={arStyle} dir="rtl" dangerouslySetInnerHTML={{ __html: secondary }} />
      <div style={enStyle} dir="ltr" dangerouslySetInnerHTML={{ __html: primary }} />
    </div>
  );
  if (split) return (
    <div>
      {split.ar && <div style={arStyle} dir="rtl">{split.ar}</div>}
      {split.en && <div style={enStyle} dir="ltr">{split.en}</div>}
    </div>
  );
  const isAr = /[؀-ۿ]/.test(primary);
  return (
    <div style={isAr ? arStyle : enStyle} dir={isAr ? "rtl" : "ltr"}
      dangerouslySetInnerHTML={{ __html: primary }} />
  );
};

const logActivity = async (uid: string, a: string, et: string, ei: string, m?: any) => {
  try { await supabase.from("activity_logs").insert({ user_id: uid, action: a, entity_type: et, entity_id: ei, metadata: m || null }); } catch (_) {}
};

function isImageUrl(url: string) {
  return [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"].some(e => url.toLowerCase().split("?")[0].endsWith(e));
}

// ── Confidence Badge ─────────────────────────────────────────────
const ConfidenceSelector = ({ value, onChange }: { value: Confidence; onChange: (v: Confidence) => void }) => (
  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 14, padding: "10px 14px", background: "#f8fafb", borderRadius: 12, border: `1px solid ${BORDER}` }}>
    <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, marginRight: 4 }}>Confidence:</span>
    {([
      { v: "confident" as Confidence, label: "Confident", icon: <ThumbsUp style={{ width: 12, height: 12 }} />, color: CONFIDENT, bg: "#f0fff4" },
      { v: "unsure" as Confidence, label: "Unsure", icon: <Minus style={{ width: 12, height: 12 }} />, color: UNSURE, bg: "#fffbeb" },
      { v: "guessing" as Confidence, label: "Guessing", icon: <ThumbsDown style={{ width: 12, height: 12 }} />, color: GUESSING, bg: "#fff5f5" },
    ]).map(opt => {
      const sel = value === opt.v;
      return (
        <button key={opt.v} onClick={() => onChange(sel ? null : opt.v)}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 20, border: `1.5px solid ${sel ? opt.color : BORDER}`, background: sel ? opt.bg : "transparent", color: sel ? opt.color : "#9ca3af", fontSize: 11, fontWeight: sel ? 700 : 500, cursor: "pointer", transition: "all .15s" }}>
          {opt.icon}{opt.label}
        </button>
      );
    })}
  </div>
);

// ── Matching Question ─────────────────────────────────────────────
const MatchingQuestion = ({ question, answer, onAnswer }: { question: any; answer: AnswerState; onAnswer: (text: string, data: any) => void }) => {
  const pairs: { left: string; right: string; id: string }[] = question.matching_pairs || [];
  const rights = [...pairs.map(p => p.right)].sort(() => Math.random() - 0.5);
  const saved: Record<string, string> = answer?.data?.matches || {};
  const [matches, setMatches] = useState<Record<string, string>>(saved);
  const [dragging, setDragging] = useState<string | null>(null);

  const setMatch = (leftId: string, right: string) => {
    const newM = { ...matches, [leftId]: right };
    setMatches(newM);
    const text = pairs.map(p => `${p.left}=${newM[p.id] || ""}`).join("|");
    onAnswer(text, { matches: newM });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>Match each item on the left with the correct answer on the right.</p>
      {pairs.map((pair, i) => (
        <div key={pair.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, padding: "12px 16px", background: "#f8fafb", borderRadius: 12, border: `1.5px solid ${BORDER}`, fontSize: 15, fontWeight: 600, color: G, fontFamily: "'Amiri',serif" }}>
            {String.fromCharCode(65 + i)}. {pair.left}
          </div>
          <div style={{ fontSize: 18, color: "#d1d5db" }}>→</div>
          <select value={matches[pair.id] || ""} onChange={e => setMatch(pair.id, e.target.value)}
            style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: `1.5px solid ${matches[pair.id] ? GM : BORDER}`, background: matches[pair.id] ? "#f0fff4" : "#f8fafb", fontSize: 15, color: G, outline: "none", cursor: "pointer" }}>
            <option value="">— Select —</option>
            {rights.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
};

// ── Ordering Question ─────────────────────────────────────────────
const OrderingQuestion = ({ question, answer, onAnswer }: { question: any; answer: AnswerState; onAnswer: (text: string, data: any) => void }) => {
  const items: string[] = question.ordering_items || [];
  const savedOrder: string[] = answer?.data?.order || [...items].sort(() => Math.random() - 0.5);
  const [order, setOrder] = useState<string[]>(savedOrder);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    const newOrder = [...order];
    const [item] = newOrder.splice(from, 1);
    newOrder.splice(to, 0, item);
    setOrder(newOrder);
    onAnswer(newOrder.join("|"), { order: newOrder });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>Drag or use arrows to arrange in the correct order.</p>
      {order.map((item, i) => (
        <div key={item} style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", background: "#f8fafb", borderRadius: 12, border: `1.5px solid ${BORDER}`, cursor: "grab" }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: GM, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{i + 1}</div>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: G, fontFamily: "'Amiri',serif" }}>{item}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <button onClick={() => i > 0 && move(i, i - 1)} disabled={i === 0}
              style={{ width: 24, height: 22, borderRadius: 6, border: `1px solid ${BORDER}`, background: "#fff", color: i === 0 ? "#d1d5db" : G, cursor: i === 0 ? "not-allowed" : "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>▲</button>
            <button onClick={() => i < order.length - 1 && move(i, i + 1)} disabled={i === order.length - 1}
              style={{ width: 24, height: 22, borderRadius: 6, border: `1px solid ${BORDER}`, background: "#fff", color: i === order.length - 1 ? "#d1d5db" : G, cursor: i === order.length - 1 ? "not-allowed" : "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>▼</button>
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Multi-Select Question ─────────────────────────────────────────
const MultiSelectQuestion = ({ question, answer, onAnswer }: { question: any; answer: AnswerState; onAnswer: (text: string, data: any) => void }) => {
  const opts: any[] = question.options || [];
  const selected: string[] = answer?.data?.selected || (answer?.text ? answer.text.split(",") : []);
  const [sel, setSel] = useState<string[]>(selected);

  const toggle = (id: string) => {
    const newSel = sel.includes(id) ? sel.filter(s => s !== id) : [...sel, id];
    setSel(newSel);
    onAnswer(newSel.join(","), { selected: newSel });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>Select all that apply. Multiple answers may be correct.</p>
      {opts.map((opt, idx) => {
        const isSel = sel.includes(opt.id);
        return (
          <div key={opt.id} onClick={() => toggle(opt.id)}
            style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderRadius: 14, cursor: "pointer", transition: "all .15s", background: isSel ? "#f0fff4" : "#f8fafb", border: `2px solid ${isSel ? "#22c55e" : BORDER}`, boxShadow: isSel ? "0 2px 12px rgba(34,197,94,.18)" : "none" }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isSel ? "#22c55e" : BORDER}`, background: isSel ? "#22c55e" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {isSel && <span style={{ color: "#fff", fontSize: 13, fontWeight: 900 }}>✓</span>}
            </div>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: isSel ? GM : "rgba(15,45,31,.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: isSel ? "#fff" : G, flexShrink: 0 }}>
              {String.fromCharCode(65 + idx)}
            </div>
            {opt.image_url && <img src={opt.image_url} alt="" style={{ height: 56, borderRadius: 8, objectFit: "contain" }} />}
            <div style={{ flex: 1 }}>
              {opt.text && <div dir="auto" style={{ fontSize: 16, fontWeight: isSel ? 700 : 500, color: isSel ? G : "#374151", fontFamily: "'Amiri',serif", lineHeight: 1.9 }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(opt.text) }} />}
              {opt.text_ar && opt.text_ar !== opt.text && <div dir="rtl" style={{ fontSize: 17, fontFamily: "'Amiri Quran',serif", color: G, lineHeight: 2.1, marginTop: 2 }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(opt.text_ar) }} />}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── Reading Comprehension ─────────────────────────────────────────
const ReadingQuestion = ({ question, answer, onAnswer }: { question: any; answer: AnswerState; onAnswer: (text: string, data: any) => void }) => {
  const passage: string = question.reading_passage || "";
  const [highlighted, setHighlighted] = useState<string>("");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {passage && (
        <div style={{ padding: "16px 20px", background: "#fffbeb", borderRadius: 14, border: `1px solid ${GOLD}44`, borderLeft: `4px solid ${GOLD}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: 1, marginBottom: 8 }}>📖 READING PASSAGE</div>
          <div dir="auto" style={{ fontSize: 16, lineHeight: 2, color: G, fontFamily: "'Amiri',serif" }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(passage) }} />
        </div>
      )}
      <textarea dir="auto" rows={5} placeholder="Write your answer based on the passage above…"
        value={answer?.text || ""} onChange={e => onAnswer(e.target.value, answer?.data)}
        style={{ width: "100%", padding: "15px 16px", borderRadius: 14, border: `2px solid ${BORDER}`, fontSize: 16, outline: "none", color: G, background: "#f8fafb", resize: "vertical", lineHeight: 1.9, fontFamily: "'Amiri',serif", transition: "border .15s" }}
        onFocus={e => (e.target.style.borderColor = GM)} onBlur={e => (e.target.style.borderColor = BORDER)} />
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
const ExamTaking = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [exam, setExam] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [currentIdx, setIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submissionResult, setSR] = useState<any>(null);
  const [tabSwitches, setTabSw] = useState(0);
  const [phase, setPhase] = useState<"exam" | "review">("exam");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const [deductedPoints, setDeducted] = useState(0);
  const [showProcLog, setShowProcLog] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [questionStartTime, setQuestionStartTime] = useState<Record<string, number>>({});
  const [timePerQuestion, setTimePerQuestion] = useState<Record<string, number>>({});

  const submittedRef = useRef(false);
  const answersRef = useRef(answers);
  const questionsRef = useRef(questions);
  const examRef = useRef(exam);
  const submitRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { questionsRef.current = questions; }, [questions]);
  useEffect(() => { examRef.current = exam; }, [exam]);

  // Track time per question
  useEffect(() => {
    if (!questions[currentIdx]) return;
    const qId = questions[currentIdx].id;
    const now = Date.now();
    setQuestionStartTime(p => ({ ...p, [qId]: now }));
    return () => {
      setTimePerQuestion(p => ({
        ...p,
        [qId]: (p[qId] || 0) + Math.round((Date.now() - (questionStartTime[qId] || now)) / 1000)
      }));
    };
  }, [currentIdx]);

  const procEnabled = exam?.proctoring_enabled === true;
  const proc = useProctoring({
    attemptId: attemptId || "", userId: user?.id || "",
    proctoring_enabled: exam?.proctoring_enabled,
    fullscreen_required: exam?.fullscreen_required,
    tab_switch_limit: exam?.tab_switch_limit,
    max_warnings: exam?.max_warnings,
    auto_submit_on_violation: exam?.auto_submit_on_violation,
    screenshot_interval_seconds: exam?.screenshot_interval_seconds,
    webcam_required: exam?.webcam_required,
    record_audio: exam?.record_audio,
  }, procEnabled && !submitted && !loading, () => { if (!submittedRef.current) submitRef.current(); });

  useEffect(() => {
    if (proc.cameraReady && (proc as any).getStream) {
      setTimeout(() => {
        const stream = (proc as any).getStream();
        if (!stream) return;
        const el = document.getElementById("proctor-display-video") as HTMLVideoElement;
        if (el && !el.srcObject) { el.srcObject = stream; el.play().catch(() => {}); }
      }, 600);
    }
  }, [proc.cameraReady]);

  const handlePointDeduction = useCallback((pts: number) => {
    setDeducted(p => p + pts);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    if (submitted || phase === "review") return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); setIdx(p => Math.min(questionsRef.current.length - 1, p + 1)); }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); setIdx(p => Math.max(0, p - 1)); }
      if (e.key === "f" || e.key === "F") {
        const q = questionsRef.current[currentIdx];
        if (q) toggleFlag(q.id);
      }
      if (e.key === "1") setConfidence(questionsRef.current[currentIdx]?.id, "confident");
      if (e.key === "2") setConfidence(questionsRef.current[currentIdx]?.id, "unsure");
      if (e.key === "3") setConfidence(questionsRef.current[currentIdx]?.id, "guessing");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [submitted, phase, currentIdx]);

  // Block right-click & copy
  useEffect(() => {
    if (submitted) return;
    const noRC = (e: MouseEvent) => e.preventDefault();
    const noCP = (e: ClipboardEvent) => e.preventDefault();
    const noKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && ["c", "v", "x", "a"].includes(e.key.toLowerCase())) e.preventDefault(); };
    document.addEventListener("contextmenu", noRC);
    document.addEventListener("copy", noCP); document.addEventListener("cut", noCP); document.addEventListener("paste", noCP);
    document.addEventListener("keydown", noKey);
    return () => {
      document.removeEventListener("contextmenu", noRC); document.removeEventListener("copy", noCP);
      document.removeEventListener("cut", noCP); document.removeEventListener("paste", noCP);
      document.removeEventListener("keydown", noKey);
    };
  }, [submitted]);

  // Load exam
  useEffect(() => {
    if (!attemptId || !user) return;
    (async () => {
      const { data: ad } = await supabase.from("exam_attempts").select("*,exams(*)").eq("id", attemptId).single();
      if (!ad || ad.user_id !== user.id) { navigate("/student/exams"); return; }
      if (ad.status !== "in_progress") {
        setSubmitted(true); setExam(ad.exams);
        setSR({ status: ad.status, score: ad.score, totalPoints: ad.total_points, percentage: ad.percentage, passed: ad.passed });
        setLoading(false); return;
      }
      setExam(ad.exams);
      setTimeLeft(Math.max(0, (ad.exams.time_limit_minutes || 60) * 60 - Math.floor((Date.now() - new Date(ad.started_at).getTime()) / 1000)));
      setTabSw(ad.tab_switches || 0);
      logActivity(user.id, "exam_started", "exam_attempt", attemptId, { exam_id: ad.exam_id });
      const { data: qs } = await supabase.rpc("get_exam_questions_for_student", { _exam_id: ad.exam_id });
      let ql = qs || []; if (ad.exams.randomize_questions) ql = ql.sort(() => Math.random() - 0.5);
      setQuestions(ql);
      const { data: ea } = await supabase.from("exam_answers").select("*").eq("attempt_id", attemptId);
      const am: Record<string, AnswerState> = {};
      (ea || []).forEach((a: any) => { am[a.question_id] = { text: a.answer_text || "", data: a.answer_data, flagged: a.is_flagged || false, confidence: a.answer_data?.confidence || null }; });
      setAnswers(am); setLoading(false);
    })();
  }, [attemptId, user]);

  // Timer
  useEffect(() => {
    if (submitted || loading || !exam) return;
    if (timeLeft <= 0) { if (!submittedRef.current) submitRef.current(); return; }
    const iv = setInterval(() => setTimeLeft(tt => { const n = Math.max(0, tt - 1); if (n === 0 && !submittedRef.current) setTimeout(() => submitRef.current(), 0); return n; }), 1000);
    return () => clearInterval(iv);
  }, [timeLeft, loading, submitted, exam]);

  // Tab switch
  useEffect(() => {
    if (submitted) return;
    const h = () => { if (document.hidden) setTabSw(p => { const n = p + 1; supabase.from("exam_attempts").update({ tab_switches: n }).eq("id", attemptId!); if (n >= 3) toast({ title: "⚠️ Warning!", description: "Tab switching detected!", variant: "destructive" }); return n; }); };
    document.addEventListener("visibilitychange", h); return () => document.removeEventListener("visibilitychange", h);
  }, [attemptId, submitted]);

  // Auto-save every 30s
  useEffect(() => {
    if (submitted) return;
    const iv = setInterval(async () => { await saveAnswers(true); }, 30000); return () => clearInterval(iv);
  }, [answers, submitted]);

  useEffect(() => {
    if (submitted) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [submitted]);

  const saveAnswers = async (silent = false) => {
    if (!attemptId || submittedRef.current) return;
    if (!silent) setSaving(true);
    for (const [qId, ans] of Object.entries(answersRef.current)) {
      const { data: ex } = await supabase.from("exam_answers").select("id").eq("attempt_id", attemptId).eq("question_id", qId).maybeSingle();
      const p: any = { answer_text: ans.text, answer_data: { ...ans.data, confidence: ans.confidence, timeSpent: timePerQuestion[qId] || 0 }, is_flagged: ans.flagged };
      if (ex) await supabase.from("exam_answers").update(p).eq("id", ex.id);
      else await supabase.from("exam_answers").insert({ attempt_id: attemptId, question_id: qId, ...p });
    }
    setLastSaved(new Date()); if (!silent) setSaving(false);
  };

  const setAnswer = (qId: string, text: string, data?: any) => {
    if (submitted) return;
    setAnswers(p => ({ ...p, [qId]: { ...p[qId], text, data: data ?? p[qId]?.data, flagged: p[qId]?.flagged || false, confidence: p[qId]?.confidence || null } }));
  };
  const toggleFlag = (qId: string) => {
    if (submitted) return;
    setAnswers(p => ({ ...p, [qId]: { ...p[qId], text: p[qId]?.text || "", data: p[qId]?.data, flagged: !p[qId]?.flagged, confidence: p[qId]?.confidence || null } }));
  };
  const setConfidence = (qId: string | undefined, c: Confidence) => {
    if (!qId || submitted) return;
    setAnswers(p => ({ ...p, [qId]: { ...p[qId], text: p[qId]?.text || "", data: p[qId]?.data, flagged: p[qId]?.flagged || false, confidence: p[qId]?.confidence === c ? null : c } }));
  };

  const handleSubmit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true; setSubmitting(true); setPhase("exam");
    if (attemptId) {
      for (const [qId, ans] of Object.entries(answersRef.current)) {
        if (!ans.text && !ans.data) continue;
        const { data: ex } = await supabase.from("exam_answers").select("id").eq("attempt_id", attemptId).eq("question_id", qId).maybeSingle();
        const p: any = { answer_text: ans.text || null, answer_data: { ...ans.data, confidence: ans.confidence, timeSpent: timePerQuestion[qId] || 0 } || null, is_flagged: ans.flagged || false };
        if (ex) await supabase.from("exam_answers").update(p).eq("id", ex.id);
        else await supabase.from("exam_answers").insert({ attempt_id: attemptId, question_id: qId, ...p });
      }
    }
    const { data: gr, error: ge } = await supabase.rpc("grade_exam_attempt", { _attempt_id: attemptId! });
    if (ge) { toast({ title: "❌ Submission failed.", variant: "destructive" }); submittedRef.current = false; setSubmitting(false); return; }
    const r = gr as any;
    setSR({ status: r.status, score: r.score, totalPoints: r.total_points, percentage: r.percentage, passed: r.passed });
    setSubmitted(true); setSubmitting(false); toast({ title: "✅ Exam Submitted!" });
    if (user) logActivity(user.id, "exam_submitted", "exam_attempt", attemptId!, { score: r.score, percentage: Math.round(r.percentage) });
  }, [attemptId, user]);

  useEffect(() => { submitRef.current = handleSubmit; }, [handleSubmit]);

  const answeredCount = Object.keys(answers).filter(k => answers[k]?.text).length;
  const flaggedCount = Object.values(answers).filter(a => a?.flagged).length;
  const confidentCount = Object.values(answers).filter(a => a?.confidence === "confident").length;
  const progressPct = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;
  const isTimeCrit = timeLeft < 300;
  const isTimeWarn = timeLeft < 600 && timeLeft >= 300;
  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  const timerColor = isTimeCrit ? "#ef4444" : isTimeWarn ? "#f59e0b" : "#22c55e";
  const timerBg = isTimeCrit ? "rgba(239,68,68,.15)" : isTimeWarn ? "rgba(245,158,11,.15)" : "rgba(34,197,94,.12)";
  const q = questions[currentIdx];

  // ── SUBMITTED ──
  if (submitted && !loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#f8fafb,#f0f4f8)", fontFamily: "'Cairo',sans-serif", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 24, padding: "48px 36px", maxWidth: 480, width: "100%", textAlign: "center", boxShadow: "0 12px 48px rgba(0,0,0,.1)" }}>
        <div style={{ width: 96, height: 96, borderRadius: "50%", background: submissionResult?.passed ? "linear-gradient(135deg,#f0fff4,#dcfce7)" : submissionResult?.status === "submitted" ? "linear-gradient(135deg,#fefce8,#fef9c3)" : "linear-gradient(135deg,#fff5f5,#fee2e2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", boxShadow: submissionResult?.passed ? "0 4px 20px rgba(34,197,94,.25)" : "none" }}>
          {submissionResult?.status === "graded" ? submissionResult?.passed ? <CheckCircle2 style={{ width: 48, height: 48, color: "#22c55e" }} /> : <AlertTriangle style={{ width: 48, height: 48, color: "#ef4444" }} /> : <Lock style={{ width: 48, height: 48, color: GOLD }} />}
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 900, color: G, marginBottom: 8 }}>
          {submissionResult?.status === "graded" ? submissionResult?.passed ? t("Exam Passed! 🎉", "نجحت في الامتحان! 🎉") : t("Not Passed", "لم تجتز الامتحان") : t("Exam Submitted", "تم تقديم الامتحان")}
        </h2>
        {submissionResult?.status === "graded" && (
          <>
            <div style={{ fontSize: 64, fontWeight: 900, color: submissionResult.passed ? "#22c55e" : "#ef4444", marginBottom: 4, lineHeight: 1 }}>{Math.round(submissionResult.percentage || 0)}%</div>
            <div style={{ fontSize: 15, color: "#7a9e88", marginBottom: 20 }}>{submissionResult.score}/{submissionResult.totalPoints} {t("points", "نقاط")}</div>
            {deductedPoints > 0 && <div style={{ fontSize: 13, color: "#ef4444", marginBottom: 16, padding: "8px 16px", background: "#fff5f5", borderRadius: 10 }}>−{deductedPoints} pts deducted for violations</div>}
          </>
        )}
        {submissionResult?.status === "submitted" && (
          <div style={{ background: "#fffbeb", borderRadius: 12, padding: 16, marginBottom: 20, border: `1px solid ${GOLD}44` }}>
            <p style={{ fontSize: 14, color: "#7a9e88", lineHeight: 1.7, margin: 0 }}>{t("Your exam has been submitted and is awaiting grading by your teacher.", "تم تقديم امتحانك وبانتظار تصحيح المعلم.")}</p>
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => navigate("/student/exams")} style={{ flex: 1, padding: "14px 0", borderRadius: 14, background: "#f8fafb", border: `1.5px solid ${BORDER}`, color: G, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo',sans-serif" }}>{t("Back to Exams", "العودة")}</button>
          <button onClick={() => navigate(`/student/results/${attemptId}`)} style={{ flex: 1, padding: "14px 0", borderRadius: 14, background: G, border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo',sans-serif" }}>{t("View Results", "عرض النتيجة")}</button>
        </div>
      </div>
    </div>
  );

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafb" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 52, height: 52, border: `4px solid ${G}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 16px" }} />
        <p style={{ color: "#7a9e88", fontSize: 14, fontFamily: "'Cairo',sans-serif" }}>{t("Loading exam…", "جارٍ تحميل الامتحان…")}</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── REVIEW PHASE ──
  if (phase === "review") return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#f5f7fa", fontFamily: "'Cairo',sans-serif", overflow: "hidden" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {procEnabled && !submitted && (
        <ProctoringOverlay cameraReady={proc.cameraReady} faceDetected={proc.faceDetected}
          integrityScore={proc.integrityScore} suspicionLevel={proc.suspicionLevel}
          strikes={proc.strikes} maxStrikes={proc.maxStrikes} violations={proc.violations}
          lastWarningType={proc.lastWarningType} audioMonitoring={proc.audioMonitoring}
          recentViolations={(proc as any).recentViolations} getStream={(proc as any).getStream}
          attemptId={attemptId || ""} onPointDeduction={handlePointDeduction} />
      )}
      <div style={{ background: G, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button onClick={() => setPhase("exam")} style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff", borderRadius: 10, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "'Cairo',sans-serif" }}>
          <ChevronLeft style={{ width: 14, height: 14 }} />{t("Back", "عودة")}
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{t("Review Your Answers", "مراجعة إجاباتك")}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>{answeredCount}/{questions.length} answered · {flaggedCount} flagged · {confidentCount} confident</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, background: timerBg, borderRadius: 20, padding: "4px 12px" }}>
          <Clock style={{ width: 12, height: 12, color: timerColor }} /><span style={{ fontSize: 13, fontWeight: 900, color: timerColor, fontVariantNumeric: "tabular-nums" }}>{fmt(timeLeft)}</span>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 16 }}>
          {[
            { l: t("Answered", "مُجاب"), v: answeredCount, c: "#22c55e", bg: "#f0fff4" },
            { l: t("Flagged", "مُعلّم"), v: flaggedCount, c: GOLD, bg: "#fffbeb" },
            { l: t("Unanswered", "غير مُجاب"), v: questions.length - answeredCount, c: "#ef4444", bg: "#fff5f5" },
            { l: t("Confident", "واثق"), v: confidentCount, c: "#6366f1", bg: "#eef2ff" },
          ].map((s, i) => (
            <div key={i} style={{ background: s.bg, borderRadius: 12, padding: "12px 8px", textAlign: "center", border: `1px solid ${s.c}22` }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: s.c }}>{s.v}</div>
              <div style={{ fontSize: 10, color: "#7a9e88" }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Question grid */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 16, marginBottom: 14, border: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: G, marginBottom: 12 }}>{t("All Questions", "جميع الأسئلة")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(48px,1fr))", gap: 6 }}>
            {questions.map((qq, i) => {
              const a = answers[qq.id];
              const confColor = a?.confidence === "confident" ? "#6366f1" : a?.confidence === "unsure" ? GOLD : a?.confidence === "guessing" ? "#ef4444" : null;
              return (
                <button key={qq.id} onClick={() => { setIdx(i); setPhase("exam"); }}
                  style={{ height: 48, borderRadius: 10, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", position: "relative", flexDirection: "column", display: "flex", alignItems: "center", justifyContent: "center", gap: 2,
                    background: a?.flagged ? "#fffbeb" : a?.text ? "#f0fff4" : "#f8fafb",
                    color: a?.flagged ? GOLD : a?.text ? "#22c55e" : "#7a9e88",
                    outline: i === currentIdx ? `2px solid ${G}` : "" }}>
                  {i + 1}
                  {confColor && <div style={{ width: 6, height: 6, borderRadius: "50%", background: confColor }} />}
                  {a?.flagged && <span style={{ position: "absolute", top: 2, right: 3, fontSize: 8 }}>🚩</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Warnings */}
        {questions.length - answeredCount > 0 && (
          <div style={{ background: "#fff5f5", borderRadius: 12, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10, border: "1px solid #fca5a5" }}>
            <AlertTriangle style={{ width: 17, height: 17, color: "#ef4444", flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#ef4444" }}>{questions.length - answeredCount} {t("questions unanswered — are you sure you want to submit?", "أسئلة لم تُجب عليها — هل أنت متأكد من التقديم؟")}</span>
          </div>
        )}
        {deductedPoints > 0 && (
          <div style={{ background: "#fff5f5", borderRadius: 12, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10, border: "1px solid #fca5a5" }}>
            <AlertTriangle style={{ width: 17, height: 17, color: "#ef4444", flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#ef4444" }}>−{deductedPoints} {t("points deducted for violations", "نقاط خُصمت بسبب المخالفات")}</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setPhase("exam")} style={{ flex: 1, padding: "14px 0", borderRadius: 12, background: "#f8fafb", border: `1.5px solid ${BORDER}`, color: G, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo',sans-serif" }}>← {t("Continue Exam", "متابعة الامتحان")}</button>
          <button onClick={handleSubmit} disabled={submitting}
            style={{ flex: 1, padding: "14px 0", borderRadius: 12, background: submitting ? "#9ca3af" : "#dc2626", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "'Cairo',sans-serif" }}>
            {submitting ? t("Submitting…", "جارٍ التقديم…") : t("Submit Exam ✓", "تقديم الامتحان ✓")}
          </button>
        </div>
      </div>
    </div>
  );

  // ── MAIN EXAM ──
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#f0f2f5", fontFamily: "'Cairo',sans-serif", userSelect: "none", WebkitUserSelect: "none", overflow: "hidden" }} onContextMenu={e => e.preventDefault()}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulseTimer{0%,100%{opacity:1}50%{opacity:.5}}
        @keyframes slideIn{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:translateX(0)}}
        *{box-sizing:border-box}
        @media print { body { display:none !important; } }
      `}</style>

      {procEnabled && !submitted && (
        <ProctoringOverlay cameraReady={proc.cameraReady} faceDetected={proc.faceDetected}
          integrityScore={proc.integrityScore} suspicionLevel={proc.suspicionLevel}
          strikes={proc.strikes} maxStrikes={proc.maxStrikes} violations={proc.violations}
          lastWarningType={proc.lastWarningType} audioMonitoring={proc.audioMonitoring}
          recentViolations={(proc as any).recentViolations} getStream={(proc as any).getStream}
          attemptId={attemptId || ""} onPointDeduction={handlePointDeduction} />
      )}

      {/* HEADER */}
      <div style={{ height: 56, background: G, display: "flex", alignItems: "center", padding: "0 10px", gap: 8, flexShrink: 0, zIndex: 40, boxShadow: "0 2px 8px rgba(0,0,0,.3)" }}>
        <BookOpen style={{ width: 15, height: 15, color: GOLD, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
          {language === "ar" ? exam?.title_ar || exam?.title : exam?.title}
        </span>
        {/* Timer */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, background: timerBg, border: `1.5px solid ${timerColor}66`, borderRadius: 20, padding: "4px 10px", flexShrink: 0, animation: isTimeCrit ? "pulseTimer 1s infinite" : "none" }}>
          <Clock style={{ width: 12, height: 12, color: timerColor }} />
          <span style={{ fontSize: 14, fontWeight: 900, color: timerColor, fontVariantNumeric: "tabular-nums" }}>{fmt(timeLeft)}</span>
        </div>
        {/* Save indicator */}
        <div style={{ fontSize: 9, color: "rgba(255,255,255,.4)", display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          {saving ? <div style={{ width: 7, height: 7, border: "1px solid rgba(255,255,255,.3)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin .8s linear infinite" }} /> : lastSaved ? <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e" }} /> : null}
        </div>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,.65)", background: "rgba(255,255,255,.1)", borderRadius: 16, padding: "2px 8px", flexShrink: 0, whiteSpace: "nowrap" }}>{answeredCount}/{questions.length}</span>
        {deductedPoints > 0 && <span style={{ fontSize: 10, color: "#fca5a5", fontWeight: 700, flexShrink: 0 }}>−{deductedPoints}pts</span>}

        {/* Proctoring pill */}
        {procEnabled && (
          <div style={{ display: "flex", alignItems: "center", gap: 3, background: "rgba(0,0,0,.3)", borderRadius: 16, padding: "3px 7px", flexShrink: 0, cursor: "pointer" }} onClick={() => setShowProcLog(v => !v)}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: proc.suspicionLevel === "low" ? "#22c55e" : proc.suspicionLevel === "medium" ? "#f59e0b" : "#ef4444" }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.7)" }}>{Math.round(proc.integrityScore)}%</span>
            {proc.violations > 0 && <span style={{ fontSize: 8, background: "#dc2626", color: "#fff", borderRadius: 8, padding: "0 4px", fontWeight: 900 }}>{proc.violations}</span>}
          </div>
        )}

        {/* Keyboard help */}
        {!isMobile && (
          <button onClick={() => setShowKeyboardHelp(v => !v)} title="Keyboard shortcuts" style={{ background: "rgba(255,255,255,.1)", border: "none", color: "rgba(255,255,255,.6)", borderRadius: 8, padding: "5px 7px", cursor: "pointer", flexShrink: 0 }}>
            <Keyboard style={{ width: 12, height: 12 }} />
          </button>
        )}

        <button onClick={() => setShowNav(v => !v)} style={{ background: "rgba(255,255,255,.12)", border: "none", color: "rgba(255,255,255,.8)", borderRadius: 8, padding: "5px 7px", cursor: "pointer", flexShrink: 0 }}>
          <Grid style={{ width: 13, height: 13 }} />
        </button>
        <button onClick={() => { saveAnswers(true); setPhase("review"); }}
          style={{ background: "#dc2626", border: "none", color: "#fff", borderRadius: 9, padding: "6px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "'Cairo',sans-serif", flexShrink: 0 }}>
          <Eye style={{ width: 12, height: 12 }} />{t("Submit", "تقديم")}
        </button>
      </div>

      {/* Keyboard help overlay */}
      {showKeyboardHelp && (
        <div style={{ position: "fixed", top: 64, right: 10, background: "#1a1a2e", borderRadius: 14, padding: "14px 18px", zIndex: 100, boxShadow: "0 8px 32px rgba(0,0,0,.4)", minWidth: 200 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, marginBottom: 10, letterSpacing: 1 }}>KEYBOARD SHORTCUTS</div>
          {[["→ / ↓", "Next question"], ["← / ↑", "Previous question"], ["F", "Flag/unflag"], ["1", "Mark Confident"], ["2", "Mark Unsure"], ["3", "Mark Guessing"]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 5, fontSize: 11 }}>
              <span style={{ color: "#fff", background: "rgba(255,255,255,.1)", padding: "2px 8px", borderRadius: 4, fontFamily: "monospace" }}>{k}</span>
              <span style={{ color: "rgba(255,255,255,.6)" }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {/* Progress bar */}
      <div style={{ height: 4, background: "rgba(0,0,0,.15)", flexShrink: 0 }}>
        <div style={{ height: "100%", width: `${progressPct}%`, background: `linear-gradient(90deg,${GM},${GOLD})`, transition: "width .5s" }} />
      </div>

      {/* BODY */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        {/* LEFT: Question nav (desktop) */}
        {!isMobile && (
          <div style={{ width: 180, background: "#fff", borderRight: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 }}>
            <div style={{ padding: "10px 10px 8px", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: "#7a9e88", letterSpacing: 1.5, marginBottom: 8 }}>QUESTIONS</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, maxHeight: 300, overflowY: "auto" }}>
                {questions.map((qq, i) => {
                  const a = answers[qq.id];
                  const confDot = a?.confidence === "confident" ? "#6366f1" : a?.confidence === "unsure" ? GOLD : a?.confidence === "guessing" ? "#ef4444" : null;
                  return (
                    <button key={qq.id} onClick={() => setIdx(i)} title={`Q${i + 1} — ${a?.text ? "Answered" : "Unanswered"}${a?.flagged ? " · Flagged" : ""}${a?.confidence ? ` · ${a.confidence}` : ""}`}
                      style={{ height: 38, borderRadius: 8, border: "none", fontSize: 11, fontWeight: 800, cursor: "pointer", position: "relative", flexDirection: "column", display: "flex", alignItems: "center", justifyContent: "center", gap: 1.5, transition: "all .12s",
                        background: i === currentIdx ? G : a?.flagged ? "#fffbeb" : a?.text ? "#f0fff4" : "#f8fafb",
                        color: i === currentIdx ? "#fff" : a?.flagged ? GOLD : a?.text ? "#22c55e" : "#7a9e88",
                        outline: i === currentIdx ? `2px solid ${GOLD}` : a?.flagged ? `1px solid ${GOLD}` : a?.text ? `1px solid #86efac` : `1px solid transparent` }}>
                      {i + 1}
                      {confDot && <div style={{ width: 4, height: 4, borderRadius: "50%", background: confDot }} />}
                      {a?.flagged && <span style={{ position: "absolute", top: 1, right: 2, fontSize: 7 }}>🚩</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
              {[["#f0fff4", "#86efac", "#22c55e", `Answered (${answeredCount})`], ["#fffbeb", GOLD, GOLD, `Flagged (${flaggedCount})`], ["#f8fafb", BORDER, "#9ca3af", `Unanswered (${questions.length - answeredCount})`], ["#eef2ff", "#a5b4fc", "#6366f1", `Confident (${confidentCount})`]].map(([bg, bd, c, lb], i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: bg, border: `1px solid ${bd}`, flexShrink: 0 }} />
                  <span style={{ color: "#7a9e88" }}>{lb}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "auto", padding: "8px 10px", borderTop: `1px solid ${BORDER}`, fontSize: 9, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#7a9e88" }}><span>Pass Mark</span><span style={{ fontWeight: 800, color: G }}>{exam?.passing_score}%</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#7a9e88" }}><span>Questions</span><span style={{ fontWeight: 800, color: G }}>{questions.length}</span></div>
              {deductedPoints > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "#ef4444" }}><span>Deducted</span><span style={{ fontWeight: 800 }}>−{deductedPoints}pts</span></div>}
            </div>
          </div>
        )}

        {/* CENTER: QUESTION */}
        <div style={{ flex: 1, overflow: "auto", padding: "12px", display: "flex", flexDirection: "column" }}>
          {q && (
            <div style={{ maxWidth: 720, margin: "0 auto", width: "100%", animation: "slideIn .2s ease" }} key={currentIdx}>
              <div style={{ background: "#fff", borderRadius: 20, boxShadow: "0 4px 24px rgba(0,0,0,.1)", overflow: "hidden" }}>

                {/* Question header */}
                <div style={{ background: `linear-gradient(135deg,${G} 0%,${GM} 100%)`, padding: "16px 20px", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 900, color: "#fff", flexShrink: 0, border: "2px solid rgba(255,255,255,.25)" }}>{currentIdx + 1}</div>
                  <div style={{ flex: 1, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "rgba(255,255,255,.15)", color: "rgba(255,255,255,.9)", fontWeight: 700, textTransform: "capitalize" }}>
                      {q.question_type?.replace(/_/g, " ")}
                    </span>
                    {q.difficulty && (
                      <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: q.difficulty === "hard" ? "rgba(239,68,68,.35)" : q.difficulty === "easy" ? "rgba(34,197,94,.35)" : "rgba(255,255,255,.15)", color: "#fff", fontWeight: 700 }}>{q.difficulty}</span>
                    )}
                    {q.section_title && (
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "rgba(201,168,76,.3)", color: GOLD, fontWeight: 600 }}>§ {q.section_title}</span>
                    )}
                    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "rgba(201,168,76,.3)", color: GOLD, fontWeight: 800, marginLeft: "auto" }}>{q.points || 1} {t("pts", "نقطة")}</span>
                  </div>
                  <button onClick={() => toggleFlag(q.id)}
                    style={{ width: 38, height: 38, borderRadius: 10, border: "none", background: answers[q.id]?.flagged ? "#dc2626" : "rgba(255,255,255,.18)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .15s" }}>
                    <Flag style={{ width: 16, height: 16 }} />
                  </button>
                </div>

                {/* Question body */}
                <div style={{ padding: "22px 22px 10px" }}>
                  {/* Question text — Arabic first, English below, brackets removed */}
                  <div style={{ marginBottom: 20 }}>
                    {(q.question_text || q.question_text_ar)
                      ? <QText text={sanitizeHtml(q.question_text||'')} textAr={sanitizeHtml(q.question_text_ar||'')} />
                      : <p style={{ color: "#9ca3af", fontStyle: "italic", fontSize: 14 }}>Question text missing.</p>
                    }
                    {/* Media */}
                    {q.media_url && (q.question_type === "audio" || q.question_type === "dictation") && <div style={{ marginTop: 12 }}><AudioPlayer src={q.media_url} title={t("Listen carefully", "استمع بعناية")} maxPlays={3} /></div>}
                    {q.media_url && q.question_type === "video" && <div style={{ marginTop: 12, borderRadius: 12, overflow: "hidden" }}><video controls src={q.media_url} style={{ width: "100%", maxHeight: 240, background: "#000" }} /></div>}
                    {q.media_url && isImageUrl(q.media_url) && !["audio", "dictation", "video"].includes(q.question_type) && <img src={q.media_url} alt="" style={{ marginTop: 12, maxHeight: 240, borderRadius: 10, objectFit: "contain", display: "block" }} />}
                    {q.media_url && !isImageUrl(q.media_url) && !["audio", "dictation", "video"].includes(q.question_type) && <div style={{ marginTop: 12 }}><AudioPlayer src={q.media_url} title="Audio" /></div>}
                  </div>

                  {/* MCQ */}
                  {(q.question_type === "mcq" || q.question_type === "image_mcq") && q.options && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                      {(q.options as any[]).map((opt: any, idx: number) => {
                        const sel = answers[q.id]?.text === opt.id;
                        return (
                          <div key={opt.id} onClick={() => setAnswer(q.id, opt.id)}
                            style={{ display: "flex", alignItems: "center", gap: 14, padding: "15px 18px", borderRadius: 14, cursor: "pointer", transition: "all .15s", background: sel ? "#f0fff4" : "#f8fafb", border: `2px solid ${sel ? "#22c55e" : BORDER}`, boxShadow: sel ? "0 2px 12px rgba(34,197,94,.2)" : "0 1px 4px rgba(0,0,0,.04)" }}>
                            <div style={{ width: 36, height: 36, borderRadius: "50%", background: sel ? GM : "rgba(15,45,31,.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: sel ? "#fff" : G, flexShrink: 0, border: `2px solid ${sel ? GM : BORDER}` }}>
                              {String.fromCharCode(65 + idx)}
                            </div>
                            {opt.image_url && <img src={opt.image_url} alt="" style={{ height: 64, borderRadius: 8, objectFit: "contain" }} />}
                            <div style={{ flex: 1 }}>
                              {opt.text && <div dir="auto" style={{ fontSize: 16, fontWeight: sel ? 700 : 500, color: sel ? G : "#374151", fontFamily: "'Amiri',serif", lineHeight: 1.9 }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(opt.text) }} />}
                              {opt.text_ar && opt.text_ar !== opt.text && <div dir="rtl" style={{ fontSize: 18, fontFamily: "'Amiri Quran',serif", color: G, lineHeight: 2.1, marginTop: 3 }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(opt.text_ar) }} />}
                            </div>
                            <div style={{ width: 24, height: 24, borderRadius: "50%", background: sel ? "#22c55e" : "transparent", border: `2px solid ${sel ? "#22c55e" : BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .15s" }}>
                              {sel && <span style={{ color: "#fff", fontSize: 14, fontWeight: 900 }}>✓</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Multi-select */}
                  {q.question_type === "multi_select" && (
                    <MultiSelectQuestion question={q} answer={answers[q.id]} onAnswer={(text, data) => setAnswer(q.id, text, data)} />
                  )}

                  {/* True/False */}
                  {q.question_type === "true_false" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      {[{ v: "true", l: t("True", "صح"), e: "✓", c: "#22c55e" }, { v: "false", l: t("False", "خطأ"), e: "✗", c: "#ef4444" }].map(opt => {
                        const sel = answers[q.id]?.text === opt.v;
                        return (
                          <div key={opt.v} onClick={() => setAnswer(q.id, opt.v)}
                            style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 12px", borderRadius: 16, cursor: "pointer", background: sel ? opt.c + "18" : "#f8fafb", border: `2px solid ${sel ? opt.c : BORDER}`, boxShadow: sel ? `0 2px 12px ${opt.c}33` : "none", transition: "all .15s" }}>
                            <span style={{ fontSize: 38, marginBottom: 8 }}>{opt.e}</span>
                            <span style={{ fontSize: 20, fontWeight: 800, color: sel ? opt.c : G, fontFamily: "'Amiri',serif" }}>{opt.l}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Fill blank */}
                  {q.question_type === "fill_blank" && (
                    <input dir="auto" placeholder={t("Type your answer here…", "اكتب إجابتك هنا…")} value={answers[q.id]?.text || ""} onChange={e => setAnswer(q.id, e.target.value)}
                      style={{ width: "100%", padding: "15px 16px", borderRadius: 14, border: `2px solid ${BORDER}`, fontSize: 17, outline: "none", color: G, background: "#f8fafb", fontFamily: "'Amiri',serif", transition: "border .15s" }}
                      onFocus={e => (e.target.style.borderColor = GM)} onBlur={e => (e.target.style.borderColor = BORDER)} />
                  )}

                  {/* Essay/Short */}
                  {(q.question_type === "short_answer" || q.question_type === "essay") && (
                    <>
                      <textarea dir="auto" rows={q.question_type === "essay" ? 8 : 5} placeholder={t("Write your answer here…", "اكتب إجابتك هنا…")} value={answers[q.id]?.text || ""} onChange={e => setAnswer(q.id, e.target.value)}
                        style={{ width: "100%", padding: "15px 16px", borderRadius: 14, border: `2px solid ${BORDER}`, fontSize: 17, outline: "none", color: G, background: "#f8fafb", resize: "vertical", lineHeight: 1.9, fontFamily: "'Amiri',serif", transition: "border .15s" }}
                        onFocus={e => (e.target.style.borderColor = GM)} onBlur={e => (e.target.style.borderColor = BORDER)} />
                      {q.question_type === "essay" && exam?.word_limit && (
                        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4, textAlign: "right" }}>
                          {(answers[q.id]?.text || "").split(/\s+/).filter(Boolean).length} / {exam.word_limit} words
                        </div>
                      )}
                    </>
                  )}

                  {/* Audio/Dictation */}
                  {(q.question_type === "audio" || q.question_type === "dictation") && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <textarea dir="auto" rows={4} placeholder={t("Write what you heard…", "اكتب ما سمعته…")} value={answers[q.id]?.text || ""} onChange={e => setAnswer(q.id, e.target.value)}
                        style={{ padding: "15px 16px", borderRadius: 14, border: `2px solid ${BORDER}`, fontSize: 17, outline: "none", color: G, background: "#f8fafb", resize: "none", fontFamily: "'Amiri',serif" }} />
                      <p style={{ fontSize: 12, color: "#9ca3af" }}>{t("Or record your answer:", "أو سجّل إجابتك:")}</p>
                      <AudioRecorder onRecordingComplete={async (blob, url) => {
                        if (!blob.size) { toast({ title: "Recording empty.", variant: "destructive" }); return; }
                        const path = `student-answers/${user!.id}/${attemptId}_${q.id}.webm`;
                        const { error } = await supabase.storage.from("exam-media").upload(path, blob, { upsert: true });
                        if (!error) { const { data: ud } = await supabase.storage.from("exam-media").createSignedUrl(path, 3600); setAnswer(q.id, answers[q.id]?.text || "[audio_recorded]", { audioUrl: ud?.signedUrl || url, fileType: "audio" }); }
                        else { toast({ title: "Upload failed.", variant: "destructive" }); setAnswer(q.id, answers[q.id]?.text || "[audio_recorded]", { audioUrl: url, fileType: "audio" }); }
                      }} existingUrl={answers[q.id]?.data?.audioUrl} />
                    </div>
                  )}

                  {/* Matching */}
                  {q.question_type === "matching" && (
                    <MatchingQuestion question={q} answer={answers[q.id]} onAnswer={(text, data) => setAnswer(q.id, text, data)} />
                  )}

                  {/* Ordering */}
                  {q.question_type === "ordering" && (
                    <OrderingQuestion question={q} answer={answers[q.id]} onAnswer={(text, data) => setAnswer(q.id, text, data)} />
                  )}

                  {/* Reading comprehension */}
                  {q.question_type === "reading" && (
                    <ReadingQuestion question={q} answer={answers[q.id]} onAnswer={(text, data) => setAnswer(q.id, text, data)} />
                  )}

                  {/* Confidence selector */}
                  {answers[q.id]?.text && (
                    <ConfidenceSelector value={answers[q.id]?.confidence || null} onChange={c => setConfidence(q.id, c)} />
                  )}
                </div>

                {/* Navigation footer */}
                <div style={{ padding: "14px 20px", borderTop: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10, background: "#fafafa" }}>
                  <button onClick={() => setIdx(p => Math.max(0, p - 1))} disabled={currentIdx === 0}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "11px 18px", borderRadius: 12, background: "#fff", border: `1.5px solid ${BORDER}`, color: currentIdx === 0 ? "#d1d5db" : G, fontSize: 14, fontWeight: 700, cursor: currentIdx === 0 ? "not-allowed" : "pointer", opacity: currentIdx === 0 ? 0.5 : 1, fontFamily: "'Cairo',sans-serif", boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
                    <ChevronLeft style={{ width: 15, height: 15 }} />{t("Previous", "السابق")}
                  </button>
                  <span style={{ flex: 1, textAlign: "center", fontSize: 13, color: "#6b7280", fontWeight: 600 }}>{currentIdx + 1} of {questions.length}</span>
                  {currentIdx === questions.length - 1 ? (
                    <button onClick={() => { saveAnswers(true); setPhase("review"); }}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "11px 18px", borderRadius: 12, background: G, border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo',sans-serif", boxShadow: `0 2px 8px rgba(15,45,31,.3)` }}>
                      <Eye style={{ width: 14, height: 14 }} />{t("Review & Submit", "مراجعة وتقديم")}
                    </button>
                  ) : (
                    <button onClick={() => setIdx(p => Math.min(questions.length - 1, p + 1))}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "11px 18px", borderRadius: 12, background: G, border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo',sans-serif", boxShadow: `0 2px 8px rgba(15,45,31,.3)` }}>
                      {t("Next", "التالي")}<ChevronRight style={{ width: 15, height: 15 }} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Summary + timer (desktop) */}
        {!isMobile && (
          <div style={{ width: 180, background: "#fff", borderLeft: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", flexShrink: 0, padding: 12, gap: 10, overflow: "hidden" }}>
            <div style={{ textAlign: "center", background: timerBg, borderRadius: 12, padding: "12px 8px", border: `1.5px solid ${timerColor}44` }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#9ca3af", letterSpacing: 1.5, marginBottom: 3 }}>TIME LEFT</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: timerColor, fontVariantNumeric: "tabular-nums", animation: isTimeCrit ? "pulseTimer 1s infinite" : "none" }}>{fmt(timeLeft)}</div>
            </div>
            <div style={{ background: "#f8fafb", borderRadius: 12, padding: "10px", display: "flex", flexDirection: "column", gap: 7, border: `1px solid ${BORDER}` }}>
              {[{ l: t("Answered", "مُجاب"), v: answeredCount, c: "#22c55e" }, { l: t("Flagged", "مُعلّم"), v: flaggedCount, c: GOLD }, { l: t("Unanswered", "غير مُجاب"), v: questions.length - answeredCount, c: "#ef4444" }, { l: t("Confident", "واثق"), v: confidentCount, c: "#6366f1" }].map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "#9ca3af" }}>{s.l}</span><span style={{ fontWeight: 800, color: s.c }}>{s.v}</span>
                </div>
              ))}
              <div style={{ height: 5, borderRadius: 3, background: "#f0f4f0", overflow: "hidden", marginTop: 2 }}>
                <div style={{ height: "100%", width: `${progressPct}%`, background: `linear-gradient(90deg,${GM},${GOLD})`, transition: "width .5s", borderRadius: 3 }} />
              </div>
            </div>
            {deductedPoints > 0 && (
              <div style={{ background: "#fff5f5", borderRadius: 10, padding: "8px 10px", border: "1px solid #fca5a5", fontSize: 11, color: "#ef4444", fontWeight: 700, textAlign: "center" }}>
                −{deductedPoints} pts<br /><span style={{ fontWeight: 400, fontSize: 9, color: "#9ca3af" }}>proctoring violations</span>
              </div>
            )}
            <button onClick={() => saveAnswers(false)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px 0", borderRadius: 10, background: "#f8fafb", border: `1px solid ${BORDER}`, color: G, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo',sans-serif" }}>
              <Save style={{ width: 11, height: 11 }} />{saving ? "Saving…" : "Save Now"}
            </button>
            <div style={{ fontSize: 9, color: "#9ca3af", display: "flex", flexDirection: "column", gap: 3, marginTop: "auto", paddingTop: 6, borderTop: `1px solid ${BORDER}` }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Pass Mark</span><span style={{ fontWeight: 700, color: G }}>{exam?.passing_score}%</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Total Qs</span><span style={{ fontWeight: 700, color: G }}>{questions.length}</span></div>
            </div>
          </div>
        )}
      </div>

      {/* MOBILE BOTTOM NAV */}
      {isMobile && (
        <div style={{ background: "#fff", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px 0" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#7a9e88" }}>
              {answeredCount}/{questions.length} answered{flaggedCount > 0 && ` · ${flaggedCount} flagged`}
            </span>
            <button onClick={() => setShowNav(v => !v)} style={{ fontSize: 10, fontWeight: 700, color: G, background: "none", border: "none", cursor: "pointer" }}>
              {showNav ? "▲ Hide" : "▼ All Questions"}
            </button>
          </div>
          {showNav ? (
            <div style={{ padding: "8px 10px 10px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(34px,1fr))", gap: 5 }}>
                {questions.map((qq, i) => {
                  const a = answers[qq.id];
                  return (
                    <button key={qq.id} onClick={() => { setIdx(i); setShowNav(false); }}
                      style={{ height: 34, borderRadius: 8, border: "none", fontSize: 11, fontWeight: 800, cursor: "pointer", background: i === currentIdx ? G : a?.flagged ? "#fffbeb" : a?.text ? "#f0fff4" : "#f8fafb", color: i === currentIdx ? "#fff" : a?.flagged ? GOLD : a?.text ? "#22c55e" : "#7a9e88", outline: i === currentIdx ? `2px solid ${GOLD}` : "" }}>
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px 8px", overflowX: "auto" }}>
              {questions.map((qq, i) => {
                const a = answers[qq.id];
                return (
                  <button key={qq.id} onClick={() => setIdx(i)}
                    style={{ width: 32, height: 32, borderRadius: 8, border: "none", fontSize: 11, fontWeight: 800, cursor: "pointer", flexShrink: 0, background: i === currentIdx ? G : a?.flagged ? "#fffbeb" : a?.text ? "#f0fff4" : "#f8fafb", color: i === currentIdx ? "#fff" : a?.flagged ? GOLD : a?.text ? "#22c55e" : "#7a9e88", transform: i === currentIdx ? "scale(1.1)" : "scale(1)" }}>
                    {i + 1}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ExamTaking;
