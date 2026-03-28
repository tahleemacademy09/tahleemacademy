/* src/pages/admin/GradingPage.tsx — Enhanced with batch release, individual release, lock until released */
import { useEffect, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  CheckCircle, XCircle, Search, FileText, Image, Download,
  Send, Users, Lock, Unlock, Loader2, Eye, ChevronRight, BarChart2
} from "lucide-react";
import AdminAudioPlayer from "@/components/exam/AdminAudioPlayer";

const G = "#064E3B";

function splitBilingual(text: string) {
  if (!text) return null;
  const t = text.trim();
  const lines = t.split(/\n+/);
  if (lines.length >= 2) {
    const arParts: string[] = [], enParts: string[] = [];
    for (const l of lines) {
      const s = l.replace(/[()]/g,"").trim(); if (!s) continue;
      if (/[\u0600-\u06FF]/.test(s)) arParts.push(s); else if (/[a-zA-Z]/.test(s)) enParts.push(s);
    }
    if (arParts.length && enParts.length) return { ar: arParts.join(" "), en: enParts.join(" ") };
  }
  return null;
}

const GradingPage = () => {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();

  const [allAttempts, setAllAttempts] = useState<any[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState<any>(null);
  const [answers, setAnswers]         = useState<any[]>([]);
  const [questions, setQuestions]     = useState<any[]>([]);
  const [gradingTab, setGradingTab]   = useState<"pending"|"graded"|"released">("pending");
  const [examFilter, setExamFilter]   = useState("all");
  const [studentFilter, setStudentFilter] = useState("");
  const [examsList, setExamsList]     = useState<any[]>([]);
  const [saving, setSaving]           = useState(false);

  // Batch release
  const [batchExamId, setBatchExamId] = useState("");
  const [batchReleaseOpen, setBatchReleaseOpen] = useState(false);
  const [batchReleasing, setBatchReleasing] = useState(false);
  const [batchAttempts, setBatchAttempts] = useState<any[]>([]);

  const scoreRefs = useRef<Record<string, Record<number, number>>>({});

  const fetchAttempts = async () => {
    const [attemptsRes, profilesRes, examsRes] = await Promise.all([
      supabase.from("exam_attempts").select("*").in("status", ["submitted","graded","released"]).order("submitted_at", { ascending: false }),
      supabase.from("profiles").select("user_id, full_name, email"),
      supabase.from("exams").select("id, title, title_ar, passing_score, term, type"),
    ]);
    const profiles = profilesRes.data || [];
    const exams = examsRes.data || [];
    setExamsList(exams);
    const merged = (attemptsRes.data || []).map((a: any) => ({
      ...a,
      profiles: profiles.find(p => p.user_id === a.user_id) || {},
      exams: exams.find(e => e.id === a.exam_id) || {},
    }));
    setAllAttempts(merged);
  };

  useEffect(() => { fetchAttempts(); }, []);

  const filtered = allAttempts.filter(a => {
    if (gradingTab === "pending" && a.status !== "submitted") return false;
    if (gradingTab === "graded" && a.status !== "graded") return false;
    if (gradingTab === "released" && a.status !== "released") return false;
    if (examFilter !== "all" && a.exam_id !== examFilter) return false;
    if (studentFilter) {
      const name = (a.profiles?.full_name||"").toLowerCase();
      if (!name.includes(studentFilter.toLowerCase())) return false;
    }
    return true;
  });

  const openAttempt = async (attempt: any) => {
    setSelectedAttempt(attempt);
    const [qRes, aRes] = await Promise.all([
      supabase.from("exam_questions").select("*").eq("exam_id", attempt.exam_id).order("sort_order"),
      supabase.from("exam_answers").select("*").eq("attempt_id", attempt.id),
    ]);
    setQuestions(qRes.data || []);
    setAnswers(aRes.data || []);
    if (!scoreRefs.current[attempt.id]) {
      const init: Record<number, number> = {};
      (aRes.data||[]).forEach((a: any, i: number) => { init[i] = a.points_awarded || 0; });
      scoreRefs.current[attempt.id] = init;
    }
  };

  const saveGrading = async () => {
    if (!selectedAttempt) return;
    setSaving(true);
    try {
      const scores = scoreRefs.current[selectedAttempt.id] || {};
      const totalPoints = questions.reduce((s, q) => s + (q.points || 1), 0);
      let earned = 0;

      for (let i = 0; i < answers.length; i++) {
        const pts = scores[i] ?? answers[i]?.points_awarded ?? 0;
        earned += Number(pts);
        await supabase.from("exam_answers").update({
          points_awarded: pts,
          is_correct: pts > 0,
          graded_by: user?.id,
          graded_at: new Date().toISOString(),
        }).eq("id", answers[i].id);
      }

      const pct = totalPoints > 0 ? Math.round((earned / totalPoints) * 100) : 0;
      const passing = selectedAttempt.exams?.passing_score || 60;
      await supabase.from("exam_attempts").update({
        status: "graded",
        score: earned,
        total_points: totalPoints,
        percentage: pct,
        passed: pct >= passing,
        graded_by: user?.id,
        graded_at: new Date().toISOString(),
      }).eq("id", selectedAttempt.id);

      toast({ title: `✅ Graded! Score: ${earned}/${totalPoints} (${pct}%)` });
      setSelectedAttempt(null);
      fetchAttempts();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Release individual result
  const releaseResult = async (attemptId: string, studentId: string, examTitle: string) => {
    await supabase.from("exam_attempts").update({ status: "released", results_released_at: new Date().toISOString() }).eq("id", attemptId);
    await supabase.from("notifications" as any).insert({
      user_id: studentId, title: "Exam results available",
      message: `Your results for "${examTitle}" are now available.`,
      type: "result_released", reference_id: attemptId,
    });
    toast({ title: "Result released to student" });
    fetchAttempts();
  };

  // Batch release
  const openBatchRelease = async (examId: string) => {
    setBatchExamId(examId);
    const { data } = await supabase.from("exam_attempts")
      .select("*, profiles:user_id(full_name)")
      .eq("exam_id", examId).eq("status", "graded");
    setBatchAttempts(data || []);
    setBatchReleaseOpen(true);
  };

  const executeBatchRelease = async () => {
    if (!batchAttempts.length) return;
    setBatchReleasing(true);
    try {
      const ids = batchAttempts.map(a => a.id);
      await supabase.from("exam_attempts").update({
        status: "released", results_released_at: new Date().toISOString(),
      }).in("id", ids);

      const exam = examsList.find(e => e.id === batchExamId);
      await supabase.from("notifications" as any).insert(
        batchAttempts.map(a => ({
          user_id: a.user_id, title: "Exam results available",
          message: `Your results for "${exam?.title||"exam"}" are now available.`,
          type: "result_released", reference_id: a.id,
        }))
      );

      toast({ title: `✅ Released ${ids.length} results and notified students!` });
      setBatchReleaseOpen(false);
      fetchAttempts();
    } finally {
      setBatchReleasing(false);
    }
  };

  const tabCounts = {
    pending: allAttempts.filter(a => a.status === "submitted").length,
    graded:  allAttempts.filter(a => a.status === "graded").length,
    released:allAttempts.filter(a => a.status === "released").length,
  };

  // === GRADING VIEW ===
  if (selectedAttempt) {
    return (
      <div style={{ minHeight: "100vh", background: "#F8F9FA" }}>
        <div style={{ background: G, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setSelectedAttempt(null)}
            style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 8, padding: "7px 12px", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
            ← Back
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 800, fontSize: 15, color: "#fff", margin: 0 }}>{selectedAttempt.profiles?.full_name || "Student"}</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,.65)", margin: 0 }}>{language === "ar" ? selectedAttempt.exams?.title_ar||selectedAttempt.exams?.title : selectedAttempt.exams?.title}</p>
          </div>
          <Button onClick={saveGrading} disabled={saving}
            style={{ background: "#fff", color: G, borderRadius: 10, fontWeight: 800, gap: 6, fontSize: 13 }}>
            {saving ? <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> Saving…</> : <><CheckCircle size={14} /> Save Grades</>}
          </Button>
        </div>

        <div style={{ padding: "16px", maxWidth: 800, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
          {answers.map((ans, i) => {
            const q = questions.find(q => q.id === ans.question_id) || questions[i] || {};
            const isEssay = q.question_type === "essay" || q.question_type === "short_answer" || q.question_type === "audio";
            const bi = splitBilingual(q.question_text||"");
            const ansText = ans.answer_text || ans.selected_option || "";

            return (
              <div key={ans.id} style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #E5E7EB", padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 8, background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: "#6B7280" }}>
                    {i+1}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#EFF6FF", color: "#1D4ED8" }}>
                    {q.question_type?.replace("_"," ")} · {q.points||1} pt{q.points!==1?"s":""}
                  </span>
                </div>

                <div style={{ fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 8, lineHeight: 1.6 }}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(bi ? `${bi.ar}<br/><span style="font-size:12px;color:#6B7280">${bi.en}</span>` : q.question_text||"") }} />

                {/* Answer */}
                <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "10px 12px", marginBottom: isEssay ? 10 : 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", margin: "0 0 4px" }}>Student Answer:</p>
                  {q.question_type === "audio" && ans.audio_url ? (
                    <div>
                      <AdminAudioPlayer src={ans.audio_url} label="Student Recording" />
                      {/* Fallback native player */}
                      <audio controls preload="metadata" src={ans.audio_url} crossOrigin="anonymous"
                        style={{ width: "100%", marginTop: 6, borderRadius: 8, display: "block" }} />
                    </div>
                  ) : (
                    <p style={{ fontSize: 13, color: "#374151", margin: 0, lineHeight: 1.6 }} dir="auto">{ansText || "(No answer)"}</p>
                  )}
                </div>

                {/* MCQ auto-grade display */}
                {!isEssay && q.correct_answer && (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    {ans.is_correct
                      ? <span style={{ fontSize: 12, color: "#16A34A", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}><CheckCircle size={14}/> Correct</span>
                      : <span style={{ fontSize: 12, color: "#DC2626", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}><XCircle size={14}/> Incorrect — Answer: {q.correct_answer}</span>
                    }
                  </div>
                )}

                {/* Manual scoring for essays */}
                {isEssay && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Score:</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {Array.from({ length: (q.points||1) + 1 }, (_, n) => (
                        <button key={n} onClick={() => {
                          if (!scoreRefs.current[selectedAttempt.id]) scoreRefs.current[selectedAttempt.id] = {};
                          scoreRefs.current[selectedAttempt.id][i] = n;
                          const copy = [...answers];
                          copy[i] = { ...copy[i], points_awarded: n };
                          setAnswers(copy);
                        }}
                          style={{ width: 32, height: 32, borderRadius: 8, border: `2px solid ${(scoreRefs.current[selectedAttempt.id]||{})[i] === n || ans.points_awarded === n ? G : "#E5E7EB"}`, background: (scoreRefs.current[selectedAttempt.id]||{})[i] === n || ans.points_awarded === n ? "#ECFDF5" : "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, color: (scoreRefs.current[selectedAttempt.id]||{})[i] === n ? G : "#374151" }}>
                          {n}
                        </button>
                      ))}
                    </div>
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>/ {q.points||1}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // === LIST VIEW ===
  return (
    <div style={{ minHeight: "100vh", background: "#F8F9FA" }}>
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BarChart2 size={20} color={G} />
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: "#111", margin: 0 }}>Grading Dashboard</h1>
              <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>{tabCounts.pending} pending · {tabCounts.graded} graded · {tabCounts.released} released</p>
            </div>
          </div>
          <Button onClick={() => setBatchReleaseOpen(true)}
            style={{ background: "#16A34A", borderRadius: 12, gap: 8, fontWeight: 700 }}>
            <Unlock size={16} /> Batch Release
          </Button>
        </div>
      </div>

      <div style={{ padding: "16px", maxWidth: 900, margin: "0 auto" }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "#fff", borderRadius: 14, padding: 4, border: "1px solid #E5E7EB" }}>
          {(["pending","graded","released"] as const).map(tab => (
            <button key={tab} onClick={() => setGradingTab(tab)}
              style={{ flex: 1, padding: "9px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13,
                background: gradingTab === tab ? G : "transparent",
                color: gradingTab === tab ? "#fff" : "#6B7280" }}>
              {tab.charAt(0).toUpperCase()+tab.slice(1)} ({tabCounts[tab]})
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
            <input value={studentFilter} onChange={e => setStudentFilter(e.target.value)} placeholder="Search student…"
              style={{ width: "100%", padding: "8px 10px 8px 30px", borderRadius: 9, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none", boxSizing: "border-box" as const }} />
          </div>
          <select value={examFilter} onChange={e => setExamFilter(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 9, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none", minWidth: 150 }}>
            <option value="all">All Exams</option>
            {examsList.map(e => <option key={e.id} value={e.id}>{language==="ar"?e.title_ar||e.title:e.title}</option>)}
          </select>
        </div>

        {/* Attempt cards */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 24px", background: "#fff", borderRadius: 16, border: "2px dashed #E5E7EB" }}>
            <p style={{ fontWeight: 700, color: "#374151" }}>No {gradingTab} submissions</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map(attempt => {
              const pct = Math.round(attempt.percentage || 0);
              const passing = attempt.exams?.passing_score || 60;
              return (
                <div key={attempt.id} style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #E5E7EB", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <p style={{ fontWeight: 700, fontSize: 14, color: "#111", margin: 0 }}>{attempt.profiles?.full_name || "Student"}</p>
                    <p style={{ fontSize: 12, color: "#9CA3AF", margin: "2px 0 0" }}>{language==="ar"?attempt.exams?.title_ar||attempt.exams?.title:attempt.exams?.title}</p>
                  </div>

                  {attempt.status !== "submitted" && (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: pct >= passing ? "#16A34A" : "#DC2626" }}>{pct}%</div>
                      <div style={{ fontSize: 10, color: "#9CA3AF" }}>{attempt.passed ? "Pass" : "Fail"}</div>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {attempt.status === "submitted" && (
                      <button onClick={() => openAttempt(attempt)}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 9, border: "none", background: G, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                        <FileText size={12} /> Grade
                      </button>
                    )}
                    {attempt.status === "graded" && (
                      <>
                        <button onClick={() => openAttempt(attempt)}
                          style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#374151" }}>
                          <Eye size={12} /> Review
                        </button>
                        <button onClick={() => releaseResult(attempt.id, attempt.user_id, attempt.exams?.title||"")}
                          style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 9, border: "none", background: "#16A34A", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                          <Unlock size={12} /> Release
                        </button>
                      </>
                    )}
                    {attempt.status === "released" && (
                      <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: "#DCFCE7", color: "#166534", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                        <CheckCircle size={11}/> Released
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
      <Dialog open={batchReleaseOpen} onOpenChange={v => { if (!v) { setBatchReleaseOpen(false); setBatchAttempts([]); } }}>
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
                {examsList.map(e => <option key={e.id} value={e.id}>{language==="ar"?e.title_ar||e.title:e.title}</option>)}
              </select>
            </div>

            {batchAttempts.length > 0 && (
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
                  {batchAttempts.length} graded student{batchAttempts.length!==1?"s":""} will be notified:
                </p>
                <div style={{ maxHeight: 160, overflowY: "auto", border: "1px solid #E5E7EB", borderRadius: 10 }}>
                  {batchAttempts.map((a, i) => (
                    <div key={a.id} style={{ padding: "8px 12px", borderBottom: i < batchAttempts.length-1 ? "1px solid #F3F4F6" : "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{(a.profiles as any)?.full_name || a.user_id.slice(0,8)}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: a.passed ? "#16A34A" : "#DC2626" }}>{Math.round(a.percentage||0)}%</span>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "10px 14px", background: "#FFF7ED", borderRadius: 10, border: "1px solid #FDE68A", marginTop: 10 }}>
                  <p style={{ fontSize: 12, color: "#92400E", margin: 0 }}>⚠️ Students will receive a notification and can view their results immediately after release.</p>
                </div>
              </div>
            )}

            {batchExamId && batchAttempts.length === 0 && (
              <div style={{ padding: "16px", background: "#F9FAFB", borderRadius: 10, textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>No graded attempts found for this exam</p>
              </div>
            )}

            <button onClick={executeBatchRelease} disabled={batchReleasing || !batchAttempts.length}
              style={{ padding: "13px", borderRadius: 12, border: "none", background: "#16A34A", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: (batchReleasing || !batchAttempts.length) ? .5 : 1 }}>
              {batchReleasing ? <><Loader2 size={16} style={{ animation: "spin .8s linear infinite" }} /> Releasing…</> : <><Send size={16} /> Release All & Notify Students</>}
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export default GradingPage;
