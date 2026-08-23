/*  src/pages/student/ExamResults.tsx
    ENHANCED VERSION — Animated score reveal, performance charts,
    skill breakdown, time analysis, beautiful grade card
*/
import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  CheckCircle, XCircle, ArrowLeft, Clock, FileText, Image,
  Download, AlertTriangle, Eye, EyeOff, TrendingUp, Award,
  Target, Zap, BookOpen, BarChart2, Flag, ThumbsUp, ThumbsDown, Minus
} from "lucide-react";
import AdminAudioPlayer from "@/components/exam/AdminAudioPlayer";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell
} from "recharts";

const G = "#0f2d1f", GM = "#1a4731", GOLD = "#c9a84c";

// ── Animated Number ───────────────────────────────────────────────
const AnimatedNumber = ({ target, duration = 1500, suffix = "" }: { target: number; duration?: number; suffix?: string }) => {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return <>{current}{suffix}</>;
};

// ── Grade Badge ───────────────────────────────────────────────────
const getGrade = (pct: number) => {
  if (pct >= 90) return { grade: "A+", label: "Excellent", color: "#22c55e", bg: "#f0fff4" };
  if (pct >= 80) return { grade: "A", label: "Very Good", color: "#16a34a", bg: "#dcfce7" };
  if (pct >= 70) return { grade: "B", label: "Good", color: "#2563eb", bg: "#eff6ff" };
  if (pct >= 60) return { grade: "C", label: "Satisfactory", color: GOLD, bg: "#fffbeb" };
  if (pct >= 50) return { grade: "D", label: "Pass", color: "#ea580c", bg: "#fff7ed" };
  return { grade: "F", label: "Fail", color: "#ef4444", bg: "#fff5f5" };
};

// ── Circular Progress ─────────────────────────────────────────────
const CircularProgress = ({ pct, color, size = 160 }: { pct: number; color: string; size?: number }) => {
  const r = (size / 2) - 14;
  const circ = 2 * Math.PI * r;
  const [dash, setDash] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setDash((pct / 100) * circ), 100);
    return () => clearTimeout(timer);
  }, [pct, circ]);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0f4f8" strokeWidth={10} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 1.5s cubic-bezier(.4,0,.2,1)" }} />
    </svg>
  );
};

const ExamResults = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState<any>(null);
  const [exam, setExam] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewCount, setViewCount] = useState<number>(0);
  const [maxViews, setMaxViews] = useState<number>(1);
  const [viewLimitReached, setViewLimitReached] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "answers" | "analytics">("overview");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!attemptId || !user) return;
    const load = async () => {
      const { data: attemptData } = await supabase.from("exam_attempts").select("*, exams(*)").eq("id", attemptId).single();
      if (!attemptData || attemptData.user_id !== user.id) { navigate("/student/exams"); return; }
      setAttempt(attemptData); setExam(attemptData.exams);
      const examData = attemptData.exams as any;
      const allowReview = examData?.allow_review !== false;
      const maxReviewViews = (examData as any)?.max_review_views ?? 1;
      setMaxViews(maxReviewViews);
      if (!allowReview) { setLoading(false); return; }
      const { data: existingView } = await supabase.from("exam_review_views" as any).select("view_count").eq("attempt_id", attemptId).eq("user_id", user.id).maybeSingle();
      const currentViews = (existingView as any)?.view_count ?? 0;
      if (currentViews >= maxReviewViews) { setViewCount(currentViews); setViewLimitReached(true); setLoading(false); return; }
      if (existingView) {
        await supabase.from("exam_review_views" as any).update({ view_count: currentViews + 1, viewed_at: new Date().toISOString() } as any).eq("attempt_id", attemptId).eq("user_id", user.id);
      } else {
        await supabase.from("exam_review_views" as any).insert({ attempt_id: attemptId, user_id: user.id, view_count: 1 } as any);
      }
      setViewCount(currentViews + 1);
      const [questionsRes, answersRes] = await Promise.all([
        supabase.rpc("get_exam_questions_for_review", { _attempt_id: attemptId }),
        supabase.from("exam_answers").select("*").eq("attempt_id", attemptId),
      ]);
      setQuestions(questionsRes.data || []);
      setAnswers(answersRes.data || []);
      setLoading(false);
    };
    load();
  }, [attemptId, user]);

  // No early lock screen — graded and released both render the full results page.

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafb" }}>
      <div style={{ textAlign: "center", fontFamily: "'Cairo',sans-serif" }}>
        <div style={{ width: 48, height: 48, border: `4px solid ${G}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin .8s linear infinite", margin: "0 auto 14px" }} />
        <p style={{ color: "#7a9e88", fontSize: 14 }}>Loading results…</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!attempt || !exam) return null;

  const totalPts = questions.reduce((s, q) => s + (q.points || 1), 0);
  const earnedPts = answers.reduce((s, a) => s + (Number(a.points_awarded) || 0), 0);
  const pct = attempt.percentage != null ? Math.round(attempt.percentage) : (totalPts > 0 ? Math.round((earnedPts / totalPts) * 100) : 0);
  const passed = attempt.passed;
  // isGraded = teacher has scored it (graded or released) → internal/status-label use only.
  // Scores, stats, and correctness must stay hidden from the student until isReleased.
  const isGraded = attempt.status === "graded" || attempt.status === "released";
  // isReleased = teacher officially released to student → show scores, correct answers & explanations
  const isReleased = attempt.status === "released";
  const allowReview = exam.allow_review !== false;
  const grade = getGrade(pct);
  const timeTaken = attempt.time_taken_seconds || 0;

  // Analytics
  const byType: Record<string, { correct: number; total: number }> = {};
  const byDiff: Record<string, { correct: number; total: number }> = {};
  const confAnalysis: Record<string, { correct: number; total: number }> = { confident: { correct: 0, total: 0 }, unsure: { correct: 0, total: 0 }, guessing: { correct: 0, total: 0 } };

  questions.forEach(q => {
    const ans = answers.find(a => a.question_id === q.id);
    const type = q.question_type || "other";
    const diff = q.difficulty || "medium";
    if (!byType[type]) byType[type] = { correct: 0, total: 0 };
    if (!byDiff[diff]) byDiff[diff] = { correct: 0, total: 0 };
    byType[type].total++; byDiff[diff].total++;
    if (ans?.is_correct) { byType[type].correct++; byDiff[diff].correct++; }
    const conf = ans?.answer_data?.confidence;
    if (conf && confAnalysis[conf]) {
      confAnalysis[conf].total++;
      if (ans?.is_correct) confAnalysis[conf].correct++;
    }
  });

  const radarData = Object.entries(byType).map(([type, d]) => ({
    subject: type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
    score: d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0,
    fullMark: 100,
  }));

  const diffData = Object.entries(byDiff).map(([diff, d]) => ({
    name: diff.charAt(0).toUpperCase() + diff.slice(1),
    score: d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0,
    correct: d.correct, total: d.total,
  }));

  const diffColors: Record<string, string> = { Easy: "#22c55e", Medium: GOLD, Hard: "#ef4444" };

  const displayedQuestions = showAll ? questions : questions.slice(0, 5);

  return (
    <div style={{ fontFamily: "'Cairo',sans-serif", background: "#f0f4f8", minHeight: "100vh", paddingBottom: 40 }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* HEADER */}
      <div style={{ background: G, padding: "0 16px", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex", alignItems: "center", height: 52, gap: 12 }}>
          <button onClick={() => navigate("/student/exams")} style={{ background: "rgba(255,255,255,.1)", border: "none", color: "#fff", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <ArrowLeft style={{ width: 16, height: 16 }} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {language === "ar" ? exam.title_ar || exam.title : exam.title}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,.55)" }}>
              {isReleased ? t("Released", "مُصدَر") : isGraded ? t("Graded", "مُصحّح") : t("Awaiting Grade", "بانتظار التصحيح")}
              {attempt.submitted_at && ` • ${new Date(attempt.submitted_at).toLocaleDateString()}`}
            </div>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", position: "sticky", top: 52, zIndex: 40 }}>
        <div style={{ maxWidth: 800, margin: "0 auto", display: "flex" }}>
          {[{ id: "overview", label: t("Overview", "نظرة عامة"), icon: <Award style={{ width: 14, height: 14 }} /> }, { id: "answers", label: t("Answers", "الإجابات"), icon: <FileText style={{ width: 14, height: 14 }} /> }, { id: "analytics", label: t("Analytics", "التحليل"), icon: <BarChart2 style={{ width: 14, height: 14 }} /> }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
              style={{ flex: 1, padding: "12px 8px", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 500, color: activeTab === tab.id ? G : "#9ca3af", borderBottom: activeTab === tab.id ? `2px solid ${G}` : "2px solid transparent", fontFamily: "'Cairo',sans-serif" }}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "20px 16px" }}>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeUp .3s ease" }}>

            {/* Score card — hidden until officially released */}
            {isReleased ? (
              <div style={{ background: passed ? `linear-gradient(135deg,${G},${GM})` : "linear-gradient(135deg,#7f1d1d,#991b1b)", borderRadius: 24, padding: "32px 24px", textAlign: "center", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, opacity: .05, backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M30 0l8.66 5v10L30 20l-8.66-5V5z'/%3E%3C/g%3E%3C/svg%3E\")" }} />
                <div style={{ position: "relative", zIndex: 1 }}>
                  <div style={{ marginBottom: 16, display: "flex", justifyContent: "center" }}>
                    <div style={{ position: "relative", width: 160, height: 160 }}>
                      <CircularProgress pct={pct} color={passed ? GOLD : "#fca5a5"} />
                      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ fontSize: 42, fontWeight: 900, color: "#fff", lineHeight: 1 }}>
                          <AnimatedNumber target={pct} suffix="%" />
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: GOLD, marginTop: 2 }}>{grade.grade}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", marginBottom: 4 }}>
                    {passed ? "🎉 " + t("Congratulations!", "تهانينا!") : t("Not Passed", "لم تجتز")}
                  </div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,.7)", marginBottom: 16 }}>{grade.label}</div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 20 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 24, fontWeight: 900, color: GOLD }}>{earnedPts}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,.55)" }}>of {totalPts} points</div>
                    </div>
                    {timeTaken > 0 && (
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 24, fontWeight: 900, color: GOLD }}>{Math.floor(timeTaken / 60)}m</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,.55)" }}>time taken</div>
                      </div>
                    )}
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 24, fontWeight: 900, color: GOLD }}>{exam.passing_score}%</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,.55)" }}>pass mark</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: "#fff", borderRadius: 20, padding: "32px 24px", textAlign: "center", border: `2px solid ${GOLD}44` }}>
                <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#fffbeb", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <Clock style={{ width: 36, height: 36, color: GOLD }} />
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: G, marginBottom: 8 }}>{isGraded ? t("Results Not Released Yet", "لم يتم إصدار النتيجة بعد") : t("Awaiting Grading", "بانتظار التصحيح")}</div>
                <div style={{ fontSize: 14, color: "#7a9e88", lineHeight: 1.7 }}>{isGraded ? t("Your exam has been graded. Your teacher will release your results soon and you'll be notified.", "تم تصحيح امتحانك. سيصدر معلمك النتيجة قريباً وستتلقى إشعاراً.") : t("Your exam has been submitted. Your teacher will grade it soon and you'll be notified.", "تم تقديم امتحانك. سيقوم معلمك بتصحيحه قريباً وستتلقى إشعاراً.")}</div>
              </div>
            )}

            {/* Graded-but-not-released notice */}
            {isGraded && !isReleased && (
              <div style={{ background: "#fffbeb", borderRadius: 14, padding: "14px 16px", border: "1px solid #fde68a", display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>🔒</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#92400e", marginBottom: 3 }}>{t("Results not officially released yet", "لم يُصدر المعلم النتيجة رسمياً بعد")}</div>
                  <div style={{ fontSize: 12, color: "#a16207", lineHeight: 1.6 }}>{t("Your exam has been graded. Your teacher will release the official results soon. You can review your submitted answers below.", "تم تصحيح امتحانك. يمكنك مراجعة إجاباتك أدناه في انتظار إصدار النتيجة الرسمية.")}</div>
                </div>
              </div>
            )}

            {/* Stats grid — hidden until officially released */}
            {isReleased && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                {[
                  { icon: <CheckCircle style={{ width: 20, height: 20 }} />, label: t("Correct", "صح"), value: answers.filter(a => a.is_correct).length, color: "#22c55e", bg: "#f0fff4" },
                  { icon: <XCircle style={{ width: 20, height: 20 }} />, label: t("Incorrect", "خطأ"), value: answers.filter(a => a.is_correct === false).length, color: "#ef4444", bg: "#fff5f5" },
                  { icon: <Flag style={{ width: 20, height: 20 }} />, label: t("Flagged", "معلّم"), value: answers.filter(a => a.is_flagged).length, color: GOLD, bg: "#fffbeb" },
                ].map((stat, i) => (
                  <div key={i} style={{ background: stat.bg, borderRadius: 16, padding: "16px 12px", textAlign: "center", border: `1px solid ${stat.color}22` }}>
                    <div style={{ color: stat.color, marginBottom: 6, display: "flex", justifyContent: "center" }}>{stat.icon}</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: stat.color }}>{stat.value}</div>
                    <div style={{ fontSize: 11, color: "#7a9e88" }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Feedback — hidden until officially released */}
            {isReleased && attempt.feedback && (
              <div style={{ background: "#fff", borderRadius: 16, padding: "20px", border: `1px solid ${GOLD}44` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, marginBottom: 8, letterSpacing: 1, display: "flex", alignItems: "center", gap: 6 }}>
                  <BookOpen style={{ width: 14, height: 14 }} /> TEACHER FEEDBACK
                </div>
                <div style={{ fontSize: 15, color: G, lineHeight: 1.8, fontFamily: "'Amiri',serif" }} dir="auto">{attempt.feedback}</div>
              </div>
            )}

            {/* View limit info */}
            {allowReview && !viewLimitReached && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#9ca3af" }}>
                <Eye style={{ width: 14, height: 14 }} />
                <span>{t(`Review ${viewCount} of ${maxViews}`, `المراجعة ${viewCount} من ${maxViews}`)}</span>
              </div>
            )}
            {allowReview && viewLimitReached && (
              <div style={{ background: "#fffbeb", borderRadius: 14, padding: "16px", border: `1px solid ${GOLD}44`, display: "flex", gap: 12, alignItems: "flex-start" }}>
                <EyeOff style={{ width: 20, height: 20, color: GOLD, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 700, color: G, marginBottom: 4 }}>{t("Review Limit Reached", "تم الوصول إلى حد المراجعة")}</div>
                  <div style={{ fontSize: 13, color: "#7a9e88" }}>{t(`You've used all ${maxViews} allowed review(s). Contact your instructor for access.`, `لقد استخدمت جميع مرات المراجعة المسموحة (${maxViews}). تواصل مع معلمك.`)}</div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => navigate("/student/exams")} style={{ flex: 1, padding: "14px", borderRadius: 14, background: "#f8fafb", border: "1.5px solid #e5e7eb", color: G, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo',sans-serif" }}>
                {t("Back to Exams", "العودة")}
              </button>
              {allowReview && !viewLimitReached && (
                <button onClick={() => setActiveTab("answers")} style={{ flex: 1, padding: "14px", borderRadius: 14, background: G, border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo',sans-serif" }}>
                  {t("View Answers", "عرض الإجابات")}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── ANSWERS TAB ── */}
        {activeTab === "answers" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, animation: "fadeUp .3s ease" }}>
            {!allowReview ? (
              <div style={{ background: "#fff", borderRadius: 16, padding: 24, textAlign: "center" }}>
                <EyeOff style={{ width: 40, height: 40, color: "#9ca3af", margin: "0 auto 12px" }} />
                <p style={{ color: "#7a9e88" }}>{t("Answer review is not available for this exam.", "مراجعة الإجابات غير متاحة لهذا الامتحان.")}</p>
              </div>
            ) : viewLimitReached ? (
              <div style={{ background: "#fffbeb", borderRadius: 16, padding: 24, textAlign: "center" }}>
                <EyeOff style={{ width: 40, height: 40, color: GOLD, margin: "0 auto 12px" }} />
                <p style={{ fontWeight: 700, color: G, marginBottom: 8 }}>{t("Review Limit Reached", "انتهت مرات المراجعة")}</p>
                <p style={{ color: "#7a9e88", fontSize: 13 }}>{t(`You've used all ${maxViews} allowed reviews.`, `استُنفدت ${maxViews} مرة مراجعة.`)}</p>
              </div>
            ) : (
              <>
                {displayedQuestions.map((q, i) => {
                  const ans = answers.find(a => a.question_id === q.id);
                  // Correctness is only revealed to the student once results are officially released.
                  const isCorrect = isReleased && ans?.is_correct;
                  const isWrong = isReleased && ans?.is_correct === false;
                  return (
                    <div key={q.id} style={{ background: "#fff", borderRadius: 18, overflow: "hidden", border: `1.5px solid ${isCorrect ? "#86efac" : isWrong ? "#fca5a5" : "#e5e7eb"}` }}>
                      {/* Q header */}
                      <div style={{ padding: "14px 18px", background: isCorrect ? "#f0fff4" : isWrong ? "#fff5f5" : "#f8fafb", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #e5e7eb" }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: isCorrect ? "#22c55e" : isWrong ? "#ef4444" : "#9ca3af", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {isCorrect ? <CheckCircle style={{ width: 18, height: 18, color: "#fff" }} /> : isWrong ? <XCircle style={{ width: 18, height: 18, color: "#fff" }} /> : <span style={{ color: "#fff", fontSize: 13, fontWeight: 800 }}>{i + 1}</span>}
                        </div>
                        <div style={{ flex: 1, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: G }}>Q{i + 1}</span>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#e5e7eb", color: "#6b7280" }}>{q.question_type?.replace(/_/g, " ")}</span>
                          {q.difficulty && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: q.difficulty === "hard" ? "#fee2e2" : q.difficulty === "easy" ? "#dcfce7" : "#fef9c3", color: q.difficulty === "hard" ? "#ef4444" : q.difficulty === "easy" ? "#22c55e" : GOLD }}>{q.difficulty}</span>}
                          {ans?.answer_data?.confidence && (
                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: ans.answer_data.confidence === "confident" ? "#eef2ff" : "#f8fafb", color: ans.answer_data.confidence === "confident" ? "#6366f1" : "#9ca3af", display: "flex", alignItems: "center", gap: 3 }}>
                              {ans.answer_data.confidence === "confident" ? <ThumbsUp style={{ width: 9, height: 9 }} /> : ans.answer_data.confidence === "unsure" ? <Minus style={{ width: 9, height: 9 }} /> : <ThumbsDown style={{ width: 9, height: 9 }} />}
                              {ans.answer_data.confidence}
                            </span>
                          )}
                          {isReleased && ans && (
                            <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 800, color: isCorrect ? "#22c55e" : isWrong ? "#ef4444" : "#9ca3af" }}>
                              {ans.points_awarded || 0}/{q.points || 1} pts
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ padding: "16px 18px" }}>
                        {q.question_text && <div dir="auto" dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text) }} style={{ fontSize: 16, fontWeight: 600, color: G, lineHeight: 1.9, marginBottom: 8, fontFamily: "'Amiri',serif" }} />}
                        {q.question_text_ar && q.question_text_ar !== q.question_text && <div dir="rtl" dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_text_ar) }} style={{ fontSize: 18, fontFamily: "'Amiri Quran',serif", color: G, lineHeight: 2.2, marginBottom: 8 }} />}

                        {/* Student's answer */}
                        <div style={{ background: "#f8fafb", borderRadius: 12, padding: "12px 16px", marginBottom: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", marginBottom: 6 }}>{t("YOUR ANSWER", "إجابتك")}</div>
                          {(q.question_type === "mcq" || q.question_type === "image_mcq") && q.options ? (
                            <div style={{ fontSize: 14, color: G, fontFamily: "'Amiri',serif" }}>
                              {(() => { const opt = (q.options as any[]).find((o: any) => o.id === ans?.answer_text); return opt ? (language === "ar" ? opt.text_ar || opt.text : opt.text) : <span style={{ color: "#9ca3af", fontStyle: "italic" }}>{t("No answer", "لا إجابة")}</span>; })()}
                            </div>
                          ) : (
                            <div style={{ fontSize: 14, color: ans?.answer_text ? G : "#9ca3af", fontStyle: ans?.answer_text ? "normal" : "italic", fontFamily: "'Amiri',serif" }} dir="auto">
                              {ans?.answer_text || t("No answer", "لا إجابة")}
                            </div>
                          )}
                          {ans?.answer_data?.audioUrl && <MediaPreview src={ans.answer_data.audioUrl} label={t("Your Recording", "تسجيلك")} />}
                          {ans?.answer_data?.fileUrl && <MediaPreview src={ans.answer_data.fileUrl} label={t("Your File", "ملفك")} />}
                          {ans?.answer_data?.timeSpent && <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 6 }}>⏱ {Math.round(ans.answer_data.timeSpent)}s spent on this question</div>}
                        </div>

                        {/* Correct answer — only after official release */}
                        {isReleased && exam.show_results_immediately !== false && (
                          <div style={{ background: "#f0fff4", borderRadius: 12, padding: "12px 16px", marginBottom: 10, border: "1px solid #86efac" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", marginBottom: 6 }}>{t("CORRECT ANSWER", "الإجابة الصحيحة")}</div>
                            {(q.question_type === "mcq" || q.question_type === "image_mcq") && q.options && (
                              <div style={{ fontSize: 14, color: G, fontFamily: "'Amiri',serif" }}>
                                {(q.options as any[]).filter((o: any) => o.is_correct).map((o: any) => language === "ar" ? o.text_ar || o.text : o.text).join(", ")}
                              </div>
                            )}
                            {q.correct_answer && <div style={{ fontSize: 14, color: G, fontFamily: "'Amiri',serif" }}>{q.correct_answer}</div>}
                          </div>
                        )}

                        {/* Explanation — only after official release */}
                        {isReleased && q.explanation && (
                          <div style={{ background: "#fffbeb", borderRadius: 12, padding: "12px 16px", border: `1px solid ${GOLD}33` }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, marginBottom: 6 }}>EXPLANATION</div>
                            <div style={{ fontSize: 13, color: G, lineHeight: 1.8, fontFamily: "'Amiri',serif" }} dir="auto">
                              {language === "ar" ? q.explanation_ar || q.explanation : q.explanation}
                            </div>
                          </div>
                        )}

                        {/* Feedback */}
                        {isReleased && ans?.feedback && (
                          <div style={{ marginTop: 10, background: "#f0f9ff", borderRadius: 12, padding: "12px 16px", border: "1px solid #bae6fd" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#0284c7", marginBottom: 4 }}>TEACHER NOTE</div>
                            <div style={{ fontSize: 13, color: G, lineHeight: 1.7 }} dir="auto">{ans.feedback}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {questions.length > 5 && (
                  <button onClick={() => setShowAll(!showAll)} style={{ padding: "14px", borderRadius: 14, background: "#fff", border: "1.5px solid #e5e7eb", color: G, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo',sans-serif", width: "100%" }}>
                    {showAll ? t("Show Less ↑", "عرض أقل ↑") : t(`Show All ${questions.length} Questions ↓`, `عرض جميع الأسئلة (${questions.length}) ↓`)}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* ── ANALYTICS TAB ── */}
        {activeTab === "analytics" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "fadeUp .3s ease" }}>
            {!isReleased ? (
              <div style={{ background: "#fff", borderRadius: 16, padding: 24, textAlign: "center" }}>
                <BarChart2 style={{ width: 40, height: 40, color: "#9ca3af", margin: "0 auto 12px" }} />
                <p style={{ color: "#7a9e88" }}>{t("Analytics will be available once your results are released.", "ستكون التحليلات متاحة بعد إصدار النتيجة.")}</p>
              </div>
            ) : (
              <>
                {/* Performance by difficulty */}
                {diffData.length > 0 && (
                  <div style={{ background: "#fff", borderRadius: 18, padding: "20px 16px" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: G, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                      <Target style={{ width: 16, height: 16, color: GOLD }} /> {t("Performance by Difficulty", "الأداء حسب الصعوبة")}
                    </div>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={diffData || []} barSize={36}>
                        <XAxis dataKey="name" tick={{ fontSize: 12, fontFamily: "'Cairo',sans-serif" }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                        <Tooltip formatter={(v: any) => `${v}%`} contentStyle={{ borderRadius: 10, fontSize: 12, fontFamily: "'Cairo',sans-serif" }} />
                        <Bar dataKey="score" radius={[8, 8, 0, 0]}>
                          {diffData.map((d, i) => <Cell key={i} fill={diffColors[d.name] || GOLD} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                      {diffData.map(d => (
                        <div key={d.name} style={{ fontSize: 11, color: "#7a9e88" }}>
                          <span style={{ color: diffColors[d.name] || GOLD, fontWeight: 700 }}>■</span> {d.name}: {d.correct}/{d.total}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Radar by question type */}
                {radarData.length > 1 && (
                  <div style={{ background: "#fff", borderRadius: 18, padding: "20px 16px" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: G, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                      <TrendingUp style={{ width: 16, height: 16, color: GOLD }} /> {t("Skills Breakdown", "تحليل المهارات")}
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <RadarChart data={radarData || []}>
                        <PolarGrid stroke="#e5e7eb" />
                        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fontFamily: "'Cairo',sans-serif" }} />
                        <Radar dataKey="score" stroke={G} fill={G} fillOpacity={0.2} strokeWidth={2} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Confidence calibration */}
                {Object.values(confAnalysis).some(c => c.total > 0) && (
                  <div style={{ background: "#fff", borderRadius: 18, padding: "20px 16px" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: G, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                      <Zap style={{ width: 16, height: 16, color: GOLD }} /> {t("Confidence Calibration", "دقة الثقة")}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {[{ key: "confident", label: "Confident", icon: <ThumbsUp style={{ width: 14, height: 14 }} />, color: "#6366f1" }, { key: "unsure", label: "Unsure", icon: <Minus style={{ width: 14, height: 14 }} />, color: GOLD }, { key: "guessing", label: "Guessing", icon: <ThumbsDown style={{ width: 14, height: 14 }} />, color: "#ef4444" }].map(({ key, label, icon, color }) => {
                        const data = confAnalysis[key];
                        if (data.total === 0) return null;
                        const acc = Math.round((data.correct / data.total) * 100);
                        return (
                          <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, width: 90, flexShrink: 0, color, fontSize: 12, fontWeight: 600 }}>{icon}{label}</div>
                            <div style={{ flex: 1, height: 8, background: "#f0f4f8", borderRadius: 4, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${acc}%`, background: color, borderRadius: 4, transition: "width 1s ease" }} />
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color, width: 50, textAlign: "right" }}>{acc}% ({data.correct}/{data.total})</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 12, lineHeight: 1.6 }}>
                      💡 {t("Confidence calibration shows how well your confidence matched your actual performance.", "يُظهر معايرة الثقة مدى توافق ثقتك مع أدائك الفعلي.")}
                    </div>
                  </div>
                )}

                {/* By question type table */}
                {Object.keys(byType).length > 0 && (
                  <div style={{ background: "#fff", borderRadius: 18, overflow: "hidden" }}>
                    <div style={{ padding: "16px 18px", borderBottom: "1px solid #e5e7eb", fontSize: 14, fontWeight: 700, color: G }}>
                      {t("By Question Type", "حسب نوع السؤال")}
                    </div>
                    {Object.entries(byType).map(([type, d]) => (
                      <div key={type} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", borderBottom: "1px solid #f0f4f8" }}>
                        <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: G, textTransform: "capitalize" }}>{type.replace(/_/g, " ")}</div>
                        <div style={{ width: 100, height: 6, background: "#f0f4f8", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${d.total > 0 ? (d.correct / d.total) * 100 : 0}%`, background: GM, borderRadius: 3, transition: "width 1s ease" }} />
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: G, width: 60, textAlign: "right" }}>{d.correct}/{d.total}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const MediaPreview = ({ src, label }: { src: string; label: string }) => {
  const lower = src.toLowerCase().split("?")[0];
  const isImage = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"].some(ext => lower.endsWith(ext));
  const isPdf = lower.endsWith(".pdf");
  if (isImage) return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}><Image style={{ width: 11, height: 11 }} />{label}</div>
      <img src={src} alt={label} style={{ maxHeight: 160, borderRadius: 10, border: "1px solid #e5e7eb", objectFit: "contain" }} />
    </div>
  );
  if (isPdf) return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafb", borderRadius: 10, padding: "10px 12px", marginTop: 8 }}>
      <FileText style={{ width: 16, height: 16, color: "#9ca3af" }} />
      <span style={{ fontSize: 12, flex: 1 }}>{label}</span>
      <a href={src} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#0284c7", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}><Download style={{ width: 11, height: 11 }} />View</a>
    </div>
  );
  return <AdminAudioPlayer src={src} label={label} />;
};

export default ExamResults;
