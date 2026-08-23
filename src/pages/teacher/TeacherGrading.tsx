// src/pages/teacher/TeacherGrading.tsx
// Teacher exam grading page — mirrors admin GradingPage, filtered to teacher's subjects

import { useEffect, useState, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeHtml } from "@/lib/sanitize";
import AdminAudioPlayer from "@/components/exam/AdminAudioPlayer";
import {
  CheckCircle, XCircle, Search, FileText, Download,
  Send, Unlock, Loader2, Eye, BarChart2, AlertTriangle,
  ArrowRight, RefreshCw, ClipboardList, Users, ChevronLeft,
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#C9A84C";

type GradingTab = "pending" | "graded" | "released";

const TeacherGrading = () => {
  const { t, language } = useLanguage();
  const { toast }       = useToast();
  const { user }        = useAuth();

  const [allAttempts,    setAllAttempts]    = useState<any[]>([]);
  const [selectedAttempt,setSelectedAttempt]= useState<any>(null);
  const [answers,        setAnswers]        = useState<any[]>([]);
  const [scores,         setScores]         = useState<Record<string, string>>({});
  const [feedbacks,      setFeedbacks]      = useState<Record<string, string>>({});
  const [examFeedback,   setExamFeedback]   = useState("");
  const [submitting,     setSubmitting]     = useState(false);
  const [examIds,        setExamIds]        = useState<string[]>([]);
  const [gradingTab,     setGradingTab]     = useState<GradingTab>("pending");
  const [search,         setSearch]         = useState("");
  const [typeFilter,     setTypeFilter]     = useState<"all"|"exam"|"test">("all");
  const [loading,        setLoading]        = useState(true);

  const tabCounts = {
    pending:  allAttempts.filter(a => a.status === "submitted").length,
    graded:   allAttempts.filter(a => a.status === "graded").length,
    released: allAttempts.filter(a => a.status === "released").length,
  };

  // ── Load teacher's exam IDs ────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: subs } = await supabase.from("subjects").select("id").eq("teacher_id", user.id);
      const subjectIds = (subs || []).map(s => s.id);
      if (!subjectIds.length) { setLoading(false); return; }
      const { data: courses } = await supabase.from("courses").select("id").in("subject_id", subjectIds);
      const courseIds = (courses || []).map(c => c.id);
      if (!courseIds.length) { setLoading(false); return; }
      const { data: exams } = await supabase.from("exams").select("id").in("course_id", courseIds);
      const ids = (exams || []).map(e => e.id);
      setExamIds(ids);
      setLoading(false);
    };
    load();
  }, [user]);

  useEffect(() => {
    if (examIds.length > 0) loadAttempts();
  }, [examIds]);

  const loadAttempts = async () => {
    if (!examIds.length) return;
    const { data } = await supabase.from("exam_attempts")
      .select(`*,
        profiles!exam_attempts_user_id_fkey(full_name, email, student_id),
        exams(id, title, title_ar, type, passing_score, allow_review, term,
              courses(title, subject_id, subjects(title)))`)
      .in("exam_id", examIds)
      .in("status", ["submitted", "graded", "released"])
      .order("submitted_at", { ascending: false });
    setAllAttempts(data || []);
  };

  const openAttempt = async (attempt: any) => {
    setSelectedAttempt(attempt);
    setExamFeedback(attempt.feedback || "");
    const { data } = await supabase.from("exam_answers")
      .select(`*, exam_questions(id, question_type, question_text, question_text_ar, options, correct_answer, points, media_url, explanation)`)
      .eq("attempt_id", attempt.id)
      .order("created_at");
    setAnswers(data || []);
    const sc: Record<string, string> = {};
    const fb: Record<string, string> = {};
    (data || []).forEach(a => {
      sc[a.question_id] = String(a.points_awarded ?? "");
      fb[a.question_id] = a.feedback || "";
    });
    setScores(sc);
    setFeedbacks(fb);
  };

  const submitGrade = async () => {
    if (!selectedAttempt) return;
    setSubmitting(true);
    try {
      let totalEarned = 0, totalPossible = 0;
      for (const ans of answers) {
        const pts = parseFloat(scores[ans.question_id] ?? "0") || 0;
        const maxPts = ans.exam_questions?.points || 1;
        totalEarned += pts;
        totalPossible += maxPts;
        await supabase.from("exam_answers").update({
          points_awarded: pts,
          feedback: feedbacks[ans.question_id] || null,
          is_correct: pts >= maxPts,
          graded_by: user?.id,
          graded_at: new Date().toISOString(),
        }).eq("id", ans.id);
      }
      const pct = totalPossible > 0 ? (totalEarned / totalPossible) * 100 : 0;
      // Exam is always scored out of 30, regardless of how many raw points the
      // questions add up to — scale the earned total proportionally.
      const scaledTotal = 30;
      const scaledEarned = totalPossible > 0 ? Number(((totalEarned / totalPossible) * 30).toFixed(2)) : 0;
      const passing = selectedAttempt.exams?.passing_score || 50;
      await supabase.from("exam_attempts").update({
        status: "graded",
        score: scaledEarned,
        total_points: scaledTotal,
        percentage: pct,
        passed: pct >= passing,
        feedback: examFeedback || null,
      }).eq("id", selectedAttempt.id);
      toast({ title: t("✅ Graded successfully", "✅ تم التصحيح بنجاح") });
      setSelectedAttempt(null);
      loadAttempts();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  const releaseResult = async (attemptId: string, studentId: string, examTitle: string) => {
    const { error } = await supabase.from("exam_attempts")
      .update({ status: "released", results_released_at: new Date().toISOString() })
      .eq("id", attemptId);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await (supabase as any).from("notifications").insert({
      user_id: studentId, title: "Exam results available",
      message: `Your results for "${examTitle}" are now available.`,
      type: "result_released", reference_id: attemptId,
    });
    toast({ title: t("Result released to student", "تم إرسال النتيجة للطالب") });
    loadAttempts();
  };

  const filtered = allAttempts.filter(a => {
    if (gradingTab === "pending"  && a.status !== "submitted") return false;
    if (gradingTab === "graded"   && a.status !== "graded") return false;
    if (gradingTab === "released" && a.status !== "released") return false;
    if (typeFilter !== "all" && (a.exams?.type || "exam") !== typeFilter) return false;
    if (search && !(a.profiles?.full_name || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 12px", borderRadius: 10,
    border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none",
    background: "#FAFAFA", boxSizing: "border-box" as const,
  };

  // ── Loading ───────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
      <Loader2 size={32} style={{ animation: "spin .8s linear infinite", color: GOLD }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ── Attempt detail view ───────────────────────────────────────
  if (selectedAttempt) {
    const isAlreadyGraded = selectedAttempt.status === "graded";
    const totalPossible = answers.reduce((s, a) => s + (a.exam_questions?.points || 1), 0);
    const totalEntered  = answers.reduce((s, a) => s + (parseFloat(scores[a.question_id] || "0") || 0), 0);

    return (
      <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "system-ui, sans-serif" }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

        {/* Header */}
        <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 10 }}>
          <button onClick={() => setSelectedAttempt(null)} style={{ width: 34, height: 34, borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ChevronLeft size={16} color="#6B7280" />
          </button>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: G, margin: 0 }}>
              {selectedAttempt.profiles?.full_name} — {selectedAttempt.exams?.title}
            </h2>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>
              {selectedAttempt.exams?.type === "test" ? t("Test", "تمرين") : t("Exam", "امتحان")} •{" "}
              {selectedAttempt.submitted_at ? new Date(selectedAttempt.submitted_at).toLocaleString() : "—"}
            </p>
          </div>
          {!isAlreadyGraded && (
            <div style={{ fontSize: 13, fontWeight: 700, color: G }}>
              {totalEntered} / {totalPossible}
            </div>
          )}
        </div>

        <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px" }}>
          {/* Already graded banner */}
          {isAlreadyGraded && (
            <div style={{
              padding: "12px 16px", borderRadius: 12, marginBottom: 16,
              background: "#F0FDF4", border: "1px solid #BBF7D0",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <CheckCircle size={16} color="#16A34A" />
              <span style={{ fontSize: 13, color: "#16A34A", fontWeight: 700 }}>
                {t("Already graded", "تم التصحيح مسبقاً")} • {Math.round(selectedAttempt.percentage || 0)}% •{" "}
                {selectedAttempt.passed ? t("Passed", "ناجح") : t("Failed", "راسب")}
              </span>
            </div>
          )}

          {/* Questions */}
          {answers.map((ans, i) => {
            const q = ans.exam_questions;
            if (!q) return null;
            const isMCQ      = q.question_type === "mcq" || q.question_type === "image_mcq";
            const isTF       = q.question_type === "true_false";
            const isSubjective = ["short_answer", "essay", "audio", "dictation"].includes(q.question_type);
            const opts = Array.isArray(q.options) ? q.options : (typeof q.options === "string" ? JSON.parse(q.options) : []);
            const correct = isMCQ ? opts.find((o: any) => o.is_correct)?.text : q.correct_answer;
            const studentAns = ans.answer_text || "";
            const autoCorrect = isMCQ
              ? opts.find((o: any) => o.id === studentAns)?.text
              : isTF ? studentAns : studentAns;

            return (
              <div key={ans.id} style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 20, marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
                {/* Q header */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: G, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "#fff", flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{ fontSize: 14, color: G, lineHeight: 1.6, fontWeight: 500 }}
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(language === "ar" && q.question_text_ar ? q.question_text_ar : q.question_text) }}
                    />
                    <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>
                      {q.question_type} • {q.points || 1} {t("pts", "نقطة")}
                    </div>
                  </div>
                </div>

                {/* Media */}
                {q.media_url && <AdminAudioPlayer src={q.media_url} />}

                {/* MCQ options */}
                {isMCQ && opts.length > 0 && (
                  <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                    {opts.map((o: any) => {
                      const isStudentChoice = o.id === studentAns || o.text === studentAns;
                      const isCorrectOpt    = o.is_correct;
                      return (
                        <div key={o.id} style={{
                          padding: "8px 12px", borderRadius: 10, fontSize: 13,
                          background: isCorrectOpt ? "#F0FDF4" : isStudentChoice && !isCorrectOpt ? "#FEF2F2" : "#F9FAFB",
                          border: `1px solid ${isCorrectOpt ? "#86EFAC" : isStudentChoice && !isCorrectOpt ? "#FECACA" : "#E5E7EB"}`,
                          display: "flex", alignItems: "center", gap: 8,
                          color: isCorrectOpt ? "#16A34A" : isStudentChoice && !isCorrectOpt ? "#DC2626" : "#374151",
                        }}>
                          {isCorrectOpt ? <CheckCircle size={13} color="#16A34A" /> : isStudentChoice && !isCorrectOpt ? <XCircle size={13} color="#DC2626" /> : <div style={{ width: 13 }} />}
                          {language === "ar" && o.text_ar ? o.text_ar : o.text}
                          {isStudentChoice && <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700 }}>{t("Student's answer", "إجابة الطالب")}</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Text / audio answer */}
                {!isMCQ && studentAns && (
                  <div style={{ padding: "10px 14px", borderRadius: 10, background: "#F9FAFB", border: "1px solid #E5E7EB", marginBottom: 12 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", margin: "0 0 4px" }}>{t("Student's Answer", "إجابة الطالب")}:</p>
                    {q.question_type === "audio" && studentAns.startsWith("http") ? (
                      <AdminAudioPlayer src={studentAns} />
                    ) : (
                      <p style={{ fontSize: 13, color: G, margin: 0, lineHeight: 1.6 }}>{studentAns}</p>
                    )}
                  </div>
                )}

                {/* Correct answer for TF/fill */}
                {(isTF || q.question_type === "fill_blank") && correct && (
                  <div style={{ padding: "8px 12px", borderRadius: 10, background: "#F0FDF4", border: "1px solid #86EFAC", marginBottom: 12, fontSize: 12, color: "#16A34A" }}>
                    {t("Correct answer", "الإجابة الصحيحة")}: <strong>{correct}</strong>
                  </div>
                )}

                {/* Grading — subjective only if not already graded */}
                {isSubjective && !isAlreadyGraded && (
                  <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>
                        {t("Score", "الدرجة")} (/{q.points || 1})
                      </label>
                      <input
                        type="number" min={0} max={q.points || 1} step={0.5}
                        value={scores[ans.question_id] ?? ""}
                        onChange={e => setScores(s => ({ ...s, [ans.question_id]: e.target.value }))}
                        style={inp}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>
                        {t("Feedback", "ملاحظة")}
                      </label>
                      <input
                        value={feedbacks[ans.question_id] ?? ""}
                        onChange={e => setFeedbacks(f => ({ ...f, [ans.question_id]: e.target.value }))}
                        placeholder={t("Optional feedback…", "ملاحظة اختيارية…")}
                        style={inp}
                      />
                    </div>
                  </div>
                )}

                {/* Already graded score */}
                {isAlreadyGraded && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
                    {ans.is_correct ? <CheckCircle size={14} color="#16A34A" /> : <XCircle size={14} color="#DC2626" />}
                    <span style={{ color: G }}>{ans.points_awarded ?? 0} / {q.points || 1} {t("pts", "نقطة")}</span>
                    {ans.feedback && <span style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 400 }}>— {ans.feedback}</span>}
                  </div>
                )}
              </div>
            );
          })}

          {/* Overall feedback & submit */}
          {!isAlreadyGraded && (
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 20, marginTop: 4 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: G, display: "block", marginBottom: 8 }}>
                {t("Overall Feedback (Optional)", "ملاحظة عامة (اختياري)")}
              </label>
              <textarea
                value={examFeedback} rows={3}
                onChange={e => setExamFeedback(e.target.value)}
                placeholder={t("Write feedback for the student…", "اكتب ملاحظتك للطالب…")}
                style={{ ...inp, resize: "vertical" as const }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: G }}>
                  {t("Total", "المجموع")}: {totalEntered} / {totalPossible}
                  {" "}({totalPossible > 0 ? Math.round((totalEntered / totalPossible) * 100) : 0}%)
                </div>
                <button
                  onClick={submitGrade} disabled={submitting}
                  style={{
                    padding: "11px 24px", borderRadius: 12, border: "none",
                    background: submitting ? "#E5E7EB" : `linear-gradient(135deg, ${G}, ${GM})`,
                    color: submitting ? "#9CA3AF" : "#fff",
                    fontSize: 14, fontWeight: 800, cursor: submitting ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", gap: 8,
                  }}
                >
                  {submitting ? <Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> : <Send size={14} />}
                  {submitting ? t("Saving…", "جاري الحفظ…") : t("Submit Grade", "إرسال الدرجة")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Attempt list ──────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "system-ui, sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: G, margin: 0 }}>{t("Grading", "التصحيح")}</h1>
            <p style={{ fontSize: 13, color: "#9CA3AF", margin: "2px 0 0" }}>
              {tabCounts.pending} {t("pending", "بانتظار التصحيح")}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {/* Type filter */}
            {(["all", "exam", "test"] as const).map(tp => (
              <button key={tp} onClick={() => setTypeFilter(tp)} style={{
                padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                border: `1.5px solid ${typeFilter === tp ? G : "#E5E7EB"}`,
                background: typeFilter === tp ? G : "#fff",
                color: typeFilter === tp ? "#fff" : "#6B7280",
                cursor: "pointer",
              }}>
                {tp === "all" ? t("All", "الكل") : tp === "exam" ? t("Exams", "امتحانات") : t("Tests", "تمرينات")}
              </button>
            ))}
            {/* Search */}
            <div style={{ position: "relative" }}>
              <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder={t("Search student…", "ابحث بالاسم…")}
                style={{ ...inp, paddingLeft: 30, width: 180 }}
              />
            </div>
            <button onClick={loadAttempts} style={{ width: 36, height: 36, borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <RefreshCw size={14} color="#6B7280" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, marginTop: 12 }}>
          {(["pending", "graded", "released"] as GradingTab[]).map(tab => (
            <button key={tab} onClick={() => setGradingTab(tab)} style={{
              padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
              fontSize: 13, fontWeight: gradingTab === tab ? 800 : 500,
              color: gradingTab === tab ? G : "#6B7280",
              borderBottom: gradingTab === tab ? `3px solid ${GOLD}` : "3px solid transparent",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              {tab === "pending" ? t("Pending", "بانتظار التصحيح") : tab === "graded" ? t("Graded", "تم التصحيح") : t("Released", "تم الإرسال")}
              {tabCounts[tab] > 0 && (
                <span style={{
                  padding: "1px 6px", borderRadius: 20, fontSize: 10, fontWeight: 900,
                  background: tab === "pending" ? "#FEF2F2" : "#F0FDF4",
                  color: tab === "pending" ? "#DC2626" : "#16A34A",
                }}>
                  {tabCounts[tab]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ maxWidth: 800, margin: "20px auto", padding: "0 20px 40px", display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 24px", borderRadius: 20, border: "2px dashed #E5E7EB", background: "#FAFAFA" }}>
            <CheckCircle size={48} style={{ margin: "0 auto 16px", display: "block", opacity: 0.2, color: "#16A34A" }} />
            <p style={{ fontWeight: 700, fontSize: 16, color: "#374151", margin: "0 0 4px" }}>
              {gradingTab === "pending" ? t("All caught up! 🎉", "أحسنت! لا يوجد ما ينتظر 🎉") : t("Nothing here yet", "لا يوجد شيء بعد")}
            </p>
            <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>
              {gradingTab === "pending" ? t("No pending exams to grade", "لا توجد امتحانات بانتظار التصحيح") : ""}
            </p>
          </div>
        ) : filtered.map(attempt => {
          const examType = attempt.exams?.type || "exam";
          const isTest   = examType === "test";
          const subject  = attempt.exams?.courses?.subjects?.title || "";
          return (
            <div key={attempt.id} style={{
              background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB",
              padding: 18, display: "flex", alignItems: "center", gap: 14,
              boxShadow: "0 1px 4px rgba(0,0,0,.04)",
            }}>
              {/* Avatar */}
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: G, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: "#fff", flexShrink: 0 }}>
                {(attempt.profiles?.full_name || "S")[0].toUpperCase()}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: G, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {attempt.profiles?.full_name || "Student"}
                </div>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {attempt.exams?.title} {subject && `• ${subject}`}
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
                  {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleDateString() : "—"}
                  {attempt.status === "graded" && ` • ${Math.round(attempt.percentage || 0)}% — ${attempt.passed ? t("Pass", "ناجح") : t("Fail", "راسب")}`}
                </div>
              </div>

              {/* Badge */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <span style={{
                  padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                  background: isTest ? "#EFF6FF" : "#FEF2F2",
                  color: isTest ? "#2563EB" : "#DC2626",
                  border: `1px solid ${isTest ? "#93C5FD" : "#FECACA"}`,
                }}>
                  {isTest ? t("Test", "تمرين") : t("Exam", "امتحان")}
                </span>
                {attempt.status === "graded" && (
                  <span style={{
                    padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700,
                    background: attempt.passed ? "#F0FDF4" : "#FEF2F2",
                    color: attempt.passed ? "#16A34A" : "#DC2626",
                  }}>
                    {Math.round(attempt.percentage || 0)}%
                  </span>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => openAttempt(attempt)} style={{
                  padding: "8px 16px", borderRadius: 10, border: "none",
                  background: gradingTab === "pending"
                    ? `linear-gradient(135deg, ${G}, ${GM})`
                    : "#F3F4F6",
                  color: gradingTab === "pending" ? "#fff" : G,
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  {gradingTab === "pending" ? <><Send size={12} /> {t("Grade", "صحّح")}</> : <><Eye size={12} /> {t("View", "عرض")}</>}
                </button>
                {gradingTab === "graded" && (
                  <button onClick={() => releaseResult(attempt.id, attempt.user_id, (attempt.exams?.title || "exam"))} style={{
                    padding: "8px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB",
                    background: "#fff", color: G, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <Unlock size={12} /> {t("Release", "إرسال")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TeacherGrading;
