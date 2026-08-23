/* src/pages/admin/GradingPage.tsx
   Enhanced grading dashboard:
   - NEW: "Imported" tab shows in_progress attempts (SpeedExam imports etc.)
   - NEW: "Fix Status" button moves stuck attempts into proper workflow
   - NEW: admin_grade_attempt RPC fallback when RLS blocks direct update
   - Batch release, individual release, lock until released
*/
import { useEffect, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  CheckCircle, XCircle, Search, FileText, Download,
  Send, Unlock, Loader2, Eye, BarChart2, AlertTriangle,
  ArrowRight, RefreshCw, Wrench,
} from "lucide-react";
import AdminAudioPlayer from "@/components/exam/AdminAudioPlayer";

const G = "#064E3B";

function splitBilingual(text: string) {
  if (!text) return null;
  const lines = text.trim().split(/\n+/);
  if (lines.length >= 2) {
    const arParts: string[] = [], enParts: string[] = [];
    for (const l of lines) {
      const s = l.replace(/[()]/g, "").trim(); if (!s) continue;
      if (/[\u0600-\u06FF]/.test(s)) arParts.push(s);
      else if (/[a-zA-Z]/.test(s)) enParts.push(s);
    }
    if (arParts.length && enParts.length) return { ar: arParts.join(" "), en: enParts.join(" ") };
  }
  return null;
}

type GradingTab = "pending" | "graded" | "released" | "imported";

const GradingPage = () => {
  const { t, language } = useLanguage();
  const { toast }       = useToast();
  const { user }        = useAuth();

  const [allAttempts,    setAllAttempts]    = useState<any[]>([]);
  const [selectedAttempt,setSelectedAttempt]= useState<any>(null);
  const [answers,        setAnswers]        = useState<any[]>([]);
  const [questions,      setQuestions]      = useState<any[]>([]);
  const [gradingTab,     setGradingTab]     = useState<GradingTab>("pending");
  const [examFilter,     setExamFilter]     = useState("all");
  const [studentFilter,  setStudentFilter]  = useState("");
  const [examsList,      setExamsList]      = useState<any[]>([]);
  const [saving,         setSaving]         = useState(false);
  const [fixing,         setFixing]         = useState<string | null>(null);

  // Batch release
  const [batchExamId,     setBatchExamId]     = useState("");
  const [batchReleaseOpen,setBatchReleaseOpen]= useState(false);
  const [batchReleasing,  setBatchReleasing]  = useState(false);
  const [batchAttempts,   setBatchAttempts]   = useState<any[]>([]);

  const scoreRefs = useRef<Record<string, Record<number, number>>>({});

  // ── Fetch ALL attempts including in_progress (imported ones) ─────────────
  const fetchAttempts = async () => {
    const [attemptsRes, profilesRes, examsRes] = await Promise.all([
      supabase
        .from("exam_attempts")
        .select("*")
        // Include in_progress so we can catch imported SpeedExam attempts
        .in("status", ["in_progress", "submitted", "graded", "released"])
        .order("submitted_at", { ascending: false, nullsFirst: false }),
      supabase.from("profiles").select("user_id, full_name, email, avatar_url"),
      supabase.from("exams").select("id, title, title_ar, passing_score, term, type"),
    ]);
    const profiles = profilesRes.data || [];
    const exams    = examsRes.data    || [];
    setExamsList(exams);
    const merged = (attemptsRes.data || []).map((a: any) => ({
      ...a,
      profiles: profiles.find(p => p.user_id === a.user_id) || {},
      exams:    exams.find(e => e.id === a.exam_id) || {},
    }));
    setAllAttempts(merged);
  };

  useEffect(() => { fetchAttempts(); }, []);

  const tabCounts = {
    pending:  allAttempts.filter(a => a.status === "submitted").length,
    graded:   allAttempts.filter(a => a.status === "graded").length,
    released: allAttempts.filter(a => a.status === "released").length,
    imported: allAttempts.filter(a => a.status === "in_progress").length,
  };

  const filtered = allAttempts.filter(a => {
    if (gradingTab === "pending"   && a.status !== "submitted")   return false;
    if (gradingTab === "graded"    && a.status !== "graded")      return false;
    if (gradingTab === "released"  && a.status !== "released")    return false;
    if (gradingTab === "imported"  && a.status !== "in_progress") return false;
    if (examFilter !== "all" && a.exam_id !== examFilter) return false;
    if (studentFilter) {
      const name = (a.profiles?.full_name || "").toLowerCase();
      if (!name.includes(studentFilter.toLowerCase())) return false;
    }
    return true;
  });

  // ── Open attempt for grading ─────────────────────────────────────────────
  const openAttempt = async (attempt: any) => {
    setSelectedAttempt(attempt);
    const [qRes, aRes] = await Promise.all([
      supabase.from("exam_questions").select("*").eq("exam_id", attempt.exam_id).order("sort_order"),
      supabase.from("exam_answers").select("*").eq("attempt_id", attempt.id),
    ]);
    const qs  = qRes.data || [];
    const ans = aRes.data || [];
    setQuestions(qs); setAnswers(ans);
    if (!scoreRefs.current[attempt.id]) {
      const init: Record<number, number> = {};
      qs.forEach((q: any, i: number) => {
        const a = ans.find((a: any) => a.question_id === q.id);
        init[i] = a?.points_awarded ?? 0;
      });
      scoreRefs.current[attempt.id] = init;
    }
  };

  // ── Save grading ─────────────────────────────────────────────────────────
  const saveGrading = async () => {
    if (!selectedAttempt) return;
    setSaving(true);
    try {
      const scores      = scoreRefs.current[selectedAttempt.id] || {};
      const totalPoints = questions.reduce((s, q) => s + (q.points || 1), 0);
      let earned        = 0;

      for (let i = 0; i < questions.length; i++) {
        const q   = questions[i];
        const ans = answers.find((a: any) => a.question_id === q.id);
        const pts = scores[i] ?? ans?.points_awarded ?? 0;
        earned += Number(pts);
        if (ans?.id) {
          await supabase.from("exam_answers")
            .update({ points_awarded: pts, is_correct: pts > 0 })
            .eq("id", ans.id);
        }
      }

      const pct     = totalPoints > 0 ? Math.round((earned / totalPoints) * 100) : 0;
      const passing = selectedAttempt.exams?.passing_score || 60;
      // Exam is always scored out of 30, regardless of how many raw points the
      // questions add up to — scale the earned total proportionally.
      const scaledTotal = 30;
      const scaledEarned = totalPoints > 0 ? Number(((earned / totalPoints) * 30).toFixed(2)) : 0;

      // Primary: direct update (works when RLS is patched via SQL step 9)
      const { error: attemptErr } = await supabase.from("exam_attempts").update({
        status: "graded", score: scaledEarned, total_points: scaledTotal,
        percentage: pct, passed: pct >= passing,
      }).eq("id", selectedAttempt.id);

      if (attemptErr) {
        // Fallback: use admin_grade_attempt RPC (SECURITY DEFINER — bypasses RLS)
        const { error: rpcErr } = await supabase.rpc("admin_grade_attempt" as any, {
          _attempt_id: selectedAttempt.id,
          _score:      scaledEarned,
          _total:      scaledTotal,
          _passing:    passing,
        });
        if (rpcErr) throw new Error(`Grading failed: ${rpcErr.message}`);
      }

      toast({ title: `✅ Graded! ${scaledEarned}/${scaledTotal} (${pct}%)` });
      setSelectedAttempt(null);
      fetchAttempts();
    } catch (e: any) {
      toast({ title: "Error saving grades", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Fix a stuck imported attempt ─────────────────────────────────────────
  // Moves in_progress → submitted (if no score) OR → graded (if score already set)
  const fixAttempt = async (attempt: any) => {
    setFixing(attempt.id);
    try {
      const passing = attempt.exams?.passing_score || 60;

      if (attempt.score != null && attempt.total_points != null && attempt.percentage != null) {
        // Grades already exist — move straight to graded
        const { error } = await supabase.from("exam_attempts").update({
          status:       "graded",
          submitted_at: attempt.submitted_at || new Date().toISOString(),
          passed:       attempt.percentage >= passing,
        }).eq("id", attempt.id);

        if (error) {
          // RPC fallback
          await supabase.rpc("admin_grade_attempt" as any, {
            _attempt_id: attempt.id,
            _score:      attempt.score,
            _total:      attempt.total_points,
            _passing:    passing,
          });
        }
        toast({ title: `✅ Moved to Graded tab — ${Math.round(attempt.percentage)}%` });
      } else {
        // No grades yet — move to submitted so admin can grade in UI
        const { error } = await supabase.from("exam_attempts").update({
          status:       "submitted",
          submitted_at: attempt.submitted_at || new Date().toISOString(),
        }).eq("id", attempt.id);

        if (error) throw new Error(error.message);
        toast({ title: "✅ Moved to Pending tab — open to grade manually" });
      }
      fetchAttempts();
    } catch (e: any) {
      toast({ title: "Fix failed", description: e.message, variant: "destructive" });
    } finally {
      setFixing(null);
    }
  };

  // ── Fix ALL imported at once ──────────────────────────────────────────────
  const fixAllImported = async () => {
    const imported = allAttempts.filter(a => a.status === "in_progress");
    if (!imported.length) return;
    setFixing("all");
    try {
      // Those with scores → graded
      const withScores    = imported.filter(a => a.score != null && a.percentage != null);
      const withoutScores = imported.filter(a => a.score == null || a.percentage == null);

      if (withScores.length) {
        await supabase.from("exam_attempts")
          .update({ status: "graded", submitted_at: new Date().toISOString() })
          .in("id", withScores.map(a => a.id));
      }
      if (withoutScores.length) {
        await supabase.from("exam_attempts")
          .update({ status: "submitted", submitted_at: new Date().toISOString() })
          .in("id", withoutScores.map(a => a.id));
      }
      toast({ title: `✅ Fixed ${imported.length} imported attempt${imported.length !== 1 ? "s" : ""}` });
      fetchAttempts();
    } catch (e: any) {
      toast({ title: "Fix all failed", description: e.message, variant: "destructive" });
    } finally {
      setFixing(null);
    }
  };

  // ── Release individual ────────────────────────────────────────────────────
  const releaseResult = async (attemptId: string, studentId: string, examTitle: string) => {
    const { error } = await supabase.from("exam_attempts")
      .update({ status: "released", results_released_at: new Date().toISOString() })
      .eq("id", attemptId);
    if (error) { toast({ title: "Release failed", description: error.message, variant: "destructive" }); return; }
    const { error: notifErr } = await (supabase as any).from("notifications").insert({
      user_id: studentId, title: "Exam results available",
      message: `Your results for "${examTitle}" are now available.`,
      type: "result_released", link: `/student/results/${attemptId}`,
    });
    if (notifErr) {
      toast({ title: "Released, but notification failed", description: notifErr.message, variant: "destructive" });
      fetchAttempts();
      return;
    }
    toast({ title: "✅ Result released to student" });
    fetchAttempts();
  };

  // ── Batch release ─────────────────────────────────────────────────────────
  const openBatchRelease = async (examId: string) => {
    setBatchExamId(examId);
    if (!examId) { setBatchAttempts([]); return; }
    const [attemptsRes, profilesRes] = await Promise.all([
      supabase.from("exam_attempts").select("*").eq("exam_id", examId).eq("status", "graded"),
      supabase.from("profiles").select("user_id, full_name, email"),
    ]);
    const profileMap = Object.fromEntries((profilesRes.data || []).map(p => [p.user_id, p]));
    setBatchAttempts((attemptsRes.data || []).map((a: any) => ({ ...a, profiles: profileMap[a.user_id] || {} })));
  };

  const executeBatchRelease = async () => {
    if (!batchAttempts.length) return;
    setBatchReleasing(true);
    try {
      const ids  = batchAttempts.map(a => a.id);
      const exam = examsList.find(e => e.id === batchExamId);
      await supabase.from("exam_attempts")
        .update({ status: "released", results_released_at: new Date().toISOString() })
        .in("id", ids);
      const { error: notifErr } = await (supabase as any).from("notifications").insert(
        batchAttempts.map(a => ({
          user_id: a.user_id, title: "Exam results available",
          message: `Your results for "${exam?.title || "exam"}" are now available.`,
          type: "result_released", link: `/student/results/${a.id}`,
        }))
      );
      if (notifErr) {
        toast({ title: "Released, but notifications failed", description: notifErr.message, variant: "destructive" });
        setBatchReleaseOpen(false); fetchAttempts();
        return;
      }
      toast({ title: `✅ Released ${ids.length} results!` });
      setBatchReleaseOpen(false); fetchAttempts();
    } finally { setBatchReleasing(false); }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // GRADING VIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (selectedAttempt) {
    return (
      <div style={{ minHeight: "100vh", background: "#F8F9FA" }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ background: G, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setSelectedAttempt(null)}
            style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 8, padding: "7px 12px", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
            ← Back
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 800, fontSize: 15, color: "#fff", margin: 0 }}>{selectedAttempt.profiles?.full_name || "Student"}</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,.65)", margin: 0 }}>
              {language === "ar" ? selectedAttempt.exams?.title_ar || selectedAttempt.exams?.title : selectedAttempt.exams?.title}
              {selectedAttempt.status === "in_progress" && <span style={{ marginLeft: 8, background: "#f59e0b", color: "#fff", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700 }}>⚠ IMPORTED — status will be updated on save</span>}
            </p>
          </div>
          <Button onClick={saveGrading} disabled={saving}
            style={{ background: "#fff", color: G, borderRadius: 10, fontWeight: 800, gap: 6, fontSize: 13 }}>
            {saving ? <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> Saving…</> : <><CheckCircle size={14} /> Save Grades</>}
          </Button>
        </div>

        <div style={{ padding: "16px", maxWidth: 800, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
          {questions.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 24px", background: "#fff", borderRadius: 16, border: "2px dashed #E5E7EB" }}>
              <p style={{ fontWeight: 700, color: "#9CA3AF", fontSize: 13 }}>No questions found for this exam. The exam may have been deleted or questions removed after import.</p>
            </div>
          )}

          {questions.map((q, i) => {
            const ans = answers.find((a: any) => a.question_id === q.id) || {
              id: null, answer_text: null, points_awarded: 0, is_correct: false,
            };
            const isSubjective = ["essay", "short_answer", "audio"].includes(q.question_type);
            const bi           = splitBilingual(q.question_text || "");
            const opts         = Array.isArray(q.options) ? q.options : (typeof q.options === "string" ? JSON.parse(q.options || "[]") : []);
            const rawAns       = (ans as any).answer_text || (ans as any).selected_option || "";
            // MCQ/true-false answers are stored as an option id (e.g. "a") — resolve to its display text.
            const selectedOpt  = opts.find((o: any) => o.id === rawAns);
            const ansText      = selectedOpt ? (language === "ar" ? selectedOpt.text_ar || selectedOpt.text : selectedOpt.text) : rawAns;
            const correctOpt   = opts.find((o: any) => o.is_correct);
            const correctText  = correctOpt ? (language === "ar" ? correctOpt.text_ar || correctOpt.text : correctOpt.text) : q.correct_answer;
            // Imported (legacy SpeedExam) attempts often have a score but no per-question
            // answer rows at all — that's missing historical data, not a real "skip".
            const noAnswerDataAvailable = !(ans as any).id;
            const notAnswered  = !rawAns && !(ans as any).answer_data?.audioUrl && !(ans as any).audio_url;

            return (
              <div key={q.id} style={{ background: "#fff", borderRadius: 16, border: `1.5px solid ${notAnswered ? "#FDE68A" : "#E5E7EB"}`, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 8, background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#6B7280" }}>{i + 1}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#EFF6FF", color: "#1D4ED8" }}>
                    {q.question_type?.replace("_", " ")} · {q.points || 1} pt
                  </span>
                </div>

                <div style={{ fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 8, lineHeight: 1.6 }}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(bi ? `${bi.ar}<br/><span style="font-size:12px;color:#6B7280">${bi.en}</span>` : q.question_text || "") }} />

                <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", marginBottom: isSubjective ? 10 : 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", margin: "0 0 4px" }}>Student Answer:</p>
                  {notAnswered && (
                    <div style={{ padding: "6px 10px", background: "#FFF7ED", borderRadius: 8, border: "1px solid #FDE68A", fontSize: 11, color: "#92400E", fontWeight: 700, marginBottom: 6 }}>
                      {noAnswerDataAvailable
                        ? "⚠️ No answer data available (imported attempt — original selections weren't migrated)"
                        : "⚠️ Not answered — grade as 0 or skip"}
                    </div>
                  )}
                  {(() => {
                    const audioSrc = (ans as any).answer_data?.audioUrl || (ans as any).audio_url || null;
                    return q.question_type === "audio" && audioSrc ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <AdminAudioPlayer src={audioSrc} label="▶  Play student recording" />
                        <audio controls preload="metadata" src={audioSrc} crossOrigin="anonymous" style={{ width: "100%", borderRadius: 8 }} />
                      </div>
                    ) : (
                      <p style={{ fontSize: 13, color: "#374151", margin: 0, lineHeight: 1.6 }} dir="auto">{ansText || "(No answer)"}</p>
                    );
                  })()}
                </div>

                {/* MCQ auto-grade display */}
                {!isSubjective && q.correct_answer && (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    {(ans as any).is_correct
                      ? <span style={{ fontSize: 12, color: "#16A34A", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}><CheckCircle size={14} /> Correct</span>
                      : <span style={{ fontSize: 12, color: "#DC2626", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}><XCircle size={14} /> Incorrect · Correct: {correctText}</span>
                    }
                  </div>
                )}

                {/* Manual scoring */}
                {isSubjective && (
                  <div style={{ marginTop: 12, background: "#F0FDF4", borderRadius: 12, padding: "14px 16px", border: "1.5px solid #BBDDC8" }}>
                    <p style={{ fontSize: 12, fontWeight: 800, color: G, margin: "0 0 10px" }}>
                      ✏️ Grade this answer <span style={{ fontSize: 11, fontWeight: 600, color: "#6B7280" }}>({q.points || 1} pts max)</span>
                    </p>
                    {(q.points || 1) <= 10 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                        {Array.from({ length: (q.points || 1) + 1 }, (_, n) => (
                          <button key={n} onClick={() => {
                            if (!scoreRefs.current[selectedAttempt.id]) scoreRefs.current[selectedAttempt.id] = {};
                            scoreRefs.current[selectedAttempt.id][i] = n;
                            setAnswers(prev => prev.map((a: any) => a.question_id === q.id ? { ...a, points_awarded: n } : a));
                          }} style={{
                            width: 40, height: 40, borderRadius: 10,
                            border: `2px solid ${(scoreRefs.current[selectedAttempt.id] || {})[i] === n ? G : "#D1D5DB"}`,
                            background: (scoreRefs.current[selectedAttempt.id] || {})[i] === n ? G : "#fff",
                            cursor: "pointer", fontSize: 14, fontWeight: 800,
                            color: (scoreRefs.current[selectedAttempt.id] || {})[i] === n ? "#fff" : "#374151",
                          }}>{n}</button>
                        ))}
                        <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: 4 }}>/ {q.points || 1}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", borderRadius: 10, padding: "10px 12px", border: "1.5px solid #BBDDC8" }}>
                      <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 700, whiteSpace: "nowrap" as const }}>Score:</span>
                      <input type="number" min={0} max={q.points || 1} step={0.5}
                        value={(scoreRefs.current[selectedAttempt.id] || {})[i] ?? (ans as any).points_awarded ?? 0}
                        onChange={e => {
                          const val = Math.min(q.points || 1, Math.max(0, Number(e.target.value)));
                          if (!scoreRefs.current[selectedAttempt.id]) scoreRefs.current[selectedAttempt.id] = {};
                          scoreRefs.current[selectedAttempt.id][i] = val;
                          setAnswers(prev => prev.map((a: any) => a.question_id === q.id ? { ...a, points_awarded: val } : a));
                        }}
                        style={{ width: 72, padding: "6px 10px", borderRadius: 8, border: "1.5px solid #D1D5DB", fontSize: 16, fontWeight: 800, color: G, textAlign: "center", outline: "none" }} />
                      <span style={{ fontSize: 13, color: "#6B7280" }}>/ {q.points || 1} pts</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LIST VIEW
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: "100vh", background: "#F8F9FA" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BarChart2 size={20} color={G} />
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: "#111", margin: 0 }}>Grading Dashboard</h1>
              <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>
                {tabCounts.pending} pending · {tabCounts.graded} graded · {tabCounts.released} released
                {tabCounts.imported > 0 && <span style={{ color: "#f59e0b", fontWeight: 700 }}> · {tabCounts.imported} imported (stuck)</span>}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {tabCounts.imported > 0 && (
              <button onClick={fixAllImported} disabled={fixing === "all"}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 12, border: "none", background: "#f59e0b", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                {fixing === "all" ? <Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> : <Wrench size={14} />}
                Fix All {tabCounts.imported} Imported
              </button>
            )}
            <button onClick={fetchAttempts}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 12px", borderRadius: 12, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer" }}>
              <RefreshCw size={14} color="#6B7280" />
            </button>
            <Button onClick={() => { setBatchExamId(""); setBatchAttempts([]); setBatchReleaseOpen(true); }}
              style={{ background: "#16A34A", borderRadius: 12, gap: 8, fontWeight: 700 }}>
              <Unlock size={16} /> Batch Release
            </Button>
          </div>
        </div>
      </div>

      <div style={{ padding: "16px", maxWidth: 900, margin: "0 auto" }}>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "#fff", borderRadius: 14, padding: 4, border: "1px solid #E5E7EB", overflowX: "auto" }}>
          {([
            { key: "pending",  label: "Pending",  count: tabCounts.pending,  color: "#1D4ED8" },
            { key: "graded",   label: "Graded",   count: tabCounts.graded,   color: G         },
            { key: "released", label: "Released", count: tabCounts.released, color: "#16A34A" },
            { key: "imported", label: "⚠ Imported / Stuck", count: tabCounts.imported, color: "#f59e0b" },
          ] as const).map(tab => (
            <button key={tab.key} onClick={() => setGradingTab(tab.key as GradingTab)}
              style={{ flex: 1, padding: "9px 6px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap",
                background: gradingTab === tab.key ? G : "transparent",
                color:      gradingTab === tab.key ? "#fff" : "#6B7280" }}>
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Import explanation banner */}
        {gradingTab === "imported" && tabCounts.imported > 0 && (
          <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 14, padding: "14px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ fontWeight: 800, fontSize: 13, color: "#92400E", margin: "0 0 4px" }}>These attempts were imported (e.g. from SpeedExam) and are stuck at in_progress</p>
              <p style={{ fontSize: 12, color: "#78350F", margin: 0, lineHeight: 1.5 }}>
                Click <strong>Fix</strong> on each row to move it to the correct tab, OR click <strong>Fix All Imported</strong> above to fix them all at once.<br/>
                If the score is already set, it moves to <em>Graded</em>. If not, it moves to <em>Pending</em> for manual grading.
              </p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
            <input value={studentFilter} onChange={e => setStudentFilter(e.target.value)} placeholder="Search student…"
              style={{ width: "100%", padding: "8px 10px 8px 30px", borderRadius: 9, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none", boxSizing: "border-box" as const }} />
          </div>
          <select value={examFilter} onChange={e => setExamFilter(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 9, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none", minWidth: 160 }}>
            <option value="all">All Exams</option>
            {examsList.map(e => (
              <option key={e.id} value={e.id}>{language === "ar" ? e.title_ar || e.title : e.title}</option>
            ))}
          </select>
        </div>

        {/* Attempt cards */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 24px", background: "#fff", borderRadius: 16, border: "2px dashed #E5E7EB" }}>
            <p style={{ fontWeight: 700, color: "#374151" }}>No {gradingTab} submissions</p>
            {gradingTab === "imported" && (
              <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 8 }}>
                All imported attempts have been fixed. Check the Pending or Graded tabs.
              </p>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map(attempt => {
              const pct     = Math.round(attempt.percentage || 0);
              const passing = attempt.exams?.passing_score || 60;
              const hasScore = attempt.score != null && attempt.percentage != null;

              return (
                <div key={attempt.id} style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${attempt.status === "in_progress" ? "#FDE68A" : "#E5E7EB"}`, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <p style={{ fontWeight: 700, fontSize: 14, color: "#111", margin: 0 }}>{attempt.profiles?.full_name || "Student"}</p>
                    <p style={{ fontSize: 12, color: "#9CA3AF", margin: "2px 0 0" }}>
                      {language === "ar" ? attempt.exams?.title_ar || attempt.exams?.title : attempt.exams?.title}
                    </p>
                    {attempt.status === "in_progress" && (
                      <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "#FEF3C7", color: "#92400E", fontWeight: 700 }}>
                          ⚠ IMPORTED — needs fixing
                        </span>
                        {hasScore && (
                          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "#DCFCE7", color: "#166534", fontWeight: 700 }}>
                            Score: {pct}% already set
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {attempt.status !== "submitted" && hasScore && (
                    <div style={{ textAlign: "center", flexShrink: 0 }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: pct >= passing ? "#16A34A" : "#DC2626" }}>{pct}%</div>
                      <div style={{ fontSize: 10, color: "#9CA3AF" }}>{attempt.passed ? "Pass" : "Fail"}</div>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
                    {/* IMPORTED: show Fix button */}
                    {attempt.status === "in_progress" && (
                      <>
                        <button onClick={() => fixAttempt(attempt)} disabled={fixing === attempt.id}
                          style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 9, border: "none", background: "#f59e0b", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                          {fixing === attempt.id ? <Loader2 size={12} style={{ animation: "spin .8s linear infinite" }} /> : <Wrench size={12} />}
                          {hasScore ? "Fix → Graded" : "Fix → Pending"}
                        </button>
                        <button onClick={() => openAttempt(attempt)}
                          style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#374151" }}>
                          <Eye size={12} /> Grade Now
                        </button>
                      </>
                    )}

                    {/* PENDING: grade button */}
                    {attempt.status === "submitted" && (
                      <button onClick={() => openAttempt(attempt)}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 9, border: "none", background: G, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                        <FileText size={12} /> Grade
                      </button>
                    )}

                    {/* GRADED: review + release */}
                    {attempt.status === "graded" && (
                      <>
                        <button onClick={() => openAttempt(attempt)}
                          style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#374151" }}>
                          <Eye size={12} /> Review
                        </button>
                        <button onClick={() => releaseResult(attempt.id, attempt.user_id, attempt.exams?.title || "")}
                          style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 9, border: "none", background: "#16A34A", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                          <Unlock size={12} /> Release
                        </button>
                      </>
                    )}

                    {/* RELEASED */}
                    {attempt.status === "released" && (
                      <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: "#DCFCE7", color: "#166534", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                        <CheckCircle size={11} /> Released
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Batch Release Dialog */}
      <Dialog open={batchReleaseOpen} onOpenChange={v => { if (!v) { setBatchReleaseOpen(false); setBatchAttempts([]); setBatchExamId(""); } }}>
        <DialogContent style={{ maxWidth: 480, borderRadius: 20, padding: 0 }}>
          <div style={{ background: "#16A34A", padding: "18px 20px", borderRadius: "20px 20px 0 0", display: "flex", alignItems: "center", gap: 10 }}>
            <Unlock size={20} color="#fff" />
            <h2 style={{ fontWeight: 800, fontSize: 16, color: "#fff", margin: 0 }}>Batch Release Results</h2>
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 8 }}>Select Exam</label>
              <select value={batchExamId} onChange={e => openBatchRelease(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none" }}>
                <option value="">Select an exam…</option>
                {examsList.map(e => <option key={e.id} value={e.id}>{language === "ar" ? e.title_ar || e.title : e.title}</option>)}
              </select>
            </div>

            {batchAttempts.length > 0 && (
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
                  {batchAttempts.length} graded student{batchAttempts.length !== 1 ? "s" : ""} will be notified:
                </p>
                <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid #E5E7EB", borderRadius: 10 }}>
                  {batchAttempts.map((a, i) => (
                    <div key={a.id} style={{ padding: "8px 12px", borderBottom: i < batchAttempts.length - 1 ? "1px solid #F3F4F6" : "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{(a.profiles as any)?.full_name || a.user_id.slice(0, 8)}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: a.passed ? "#16A34A" : "#DC2626" }}>{Math.round(a.percentage || 0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {batchExamId && batchAttempts.length === 0 && (
              <p style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center" }}>No graded attempts for this exam</p>
            )}

            <button onClick={executeBatchRelease} disabled={batchReleasing || !batchAttempts.length}
              style={{ padding: "13px", borderRadius: 12, border: "none", background: "#16A34A", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: (batchReleasing || !batchAttempts.length) ? .5 : 1 }}>
              {batchReleasing ? <><Loader2 size={16} style={{ animation: "spin .8s linear infinite" }} /> Releasing…</> : <><Send size={16} /> Release All & Notify</>}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GradingPage;
