<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Fix 5: GradingPage.tsx</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0F172A; color: #E2E8F0; min-height: 100vh; }
  .header { background: #B45309; padding: 16px 20px; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 12px rgba(0,0,0,.4); }
  .header-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  .fix-badge { background: rgba(255,255,255,.2); border: 1px solid rgba(255,255,255,.3); border-radius: 20px; padding: 3px 12px; font-size: 11px; font-weight: 800; letter-spacing: 1px; color: #fff; }
  .filename { font-size: 17px; font-weight: 800; color: #fff; }
  .fix-desc { font-size: 12px; color: rgba(255,255,255,.75); }
  .meta { display: flex; gap: 14px; font-size: 11px; color: rgba(255,255,255,.55); margin-top: 6px; }
  .copy-btn { background: #fff; color: #B45309; border: none; border-radius: 12px; padding: 11px 22px; font-size: 14px; font-weight: 800; cursor: pointer; flex-shrink: 0; transition: transform .1s; }
  .copy-btn:active { transform: scale(.96); }
  .copy-btn.copied { background: #22C55E; color: #fff; }
  .path-bar { background: #1E293B; padding: 10px 20px; font-size: 11px; color: #64748B; font-family: monospace; border-bottom: 1px solid #334155; }
  .path-bar span { color: #94A3B8; }
  .code-wrap { padding: 20px; overflow-x: auto; }
  pre { font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.7; color: #CBD5E1; white-space: pre-wrap; word-break: break-all; }
  .bottom-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #1E293B; border-top: 1px solid #334155; padding: 12px 20px; display: flex; justify-content: center; }
  .bottom-copy { background: #B45309; color: #fff; border: none; border-radius: 14px; padding: 14px 40px; font-size: 16px; font-weight: 800; cursor: pointer; width: 100%; max-width: 480px; transition: opacity .15s; }
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
        <span class="fix-badge">Fix 5</span>
        <span class="filename">GradingPage.tsx</span>
      </div>
      <div class="fix-desc">GradingPage — prominent audio player + comment field</div>
    </div>
    <button class="copy-btn" id="topBtn" onclick="copyCode(this)">📋 Copy</button>
  </div>
  <div class="meta">
    <span>📁 27.9 KB</span>
    <span>📝 511 lines</span>
  </div>
</div>

<div class="path-bar">Place at: <span>src/pages/admin/GradingPage.tsx</span></div>

<div class="code-wrap">
  <pre id="codeBlock">/* src/pages/admin/GradingPage.tsx — Enhanced with batch release, individual release, lock until released */
import { useEffect, useState, useRef } from &quot;react&quot;;
import { Card, CardContent } from &quot;@/components/ui/card&quot;;
import { Button } from &quot;@/components/ui/button&quot;;
import { Badge } from &quot;@/components/ui/badge&quot;;
import { Textarea } from &quot;@/components/ui/textarea&quot;;
import { Input } from &quot;@/components/ui/input&quot;;
import { Dialog, DialogContent, DialogHeader, DialogTitle } from &quot;@/components/ui/dialog&quot;;
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from &quot;@/components/ui/select&quot;;
import { useLanguage } from &quot;@/contexts/LanguageContext&quot;;
import { supabase } from &quot;@/integrations/supabase/client&quot;;
import { useToast } from &quot;@/hooks/use-toast&quot;;
import { useAuth } from &quot;@/contexts/AuthContext&quot;;
import { sanitizeHtml } from &quot;@/lib/sanitize&quot;;
import {
  CheckCircle, XCircle, Search, FileText, Image, Download,
  Send, Users, Lock, Unlock, Loader2, Eye, ChevronRight, BarChart2
} from &quot;lucide-react&quot;;
import AdminAudioPlayer from &quot;@/components/exam/AdminAudioPlayer&quot;;

const G = &quot;#064E3B&quot;;

function splitBilingual(text: string) {
  if (!text) return null;
  const t = text.trim();
  const lines = t.split(/\n+/);
  if (lines.length &gt;= 2) {
    const arParts: string[] = [], enParts: string[] = [];
    for (const l of lines) {
      const s = l.replace(/[()]/g,&quot;&quot;).trim(); if (!s) continue;
      if (/[\u0600-\u06FF]/.test(s)) arParts.push(s); else if (/[a-zA-Z]/.test(s)) enParts.push(s);
    }
    if (arParts.length &amp;&amp; enParts.length) return { ar: arParts.join(&quot; &quot;), en: enParts.join(&quot; &quot;) };
  }
  return null;
}

const GradingPage = () =&gt; {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();

  const [allAttempts, setAllAttempts] = useState&lt;any[]&gt;([]);
  const [selectedAttempt, setSelectedAttempt] = useState&lt;any&gt;(null);
  const [answers, setAnswers]         = useState&lt;any[]&gt;([]);
  const [questions, setQuestions]     = useState&lt;any[]&gt;([]);
  const [gradingTab, setGradingTab]   = useState&lt;&quot;pending&quot;|&quot;graded&quot;|&quot;released&quot;&gt;(&quot;pending&quot;);
  const [examFilter, setExamFilter]   = useState(&quot;all&quot;);
  const [studentFilter, setStudentFilter] = useState(&quot;&quot;);
  const [examsList, setExamsList]     = useState&lt;any[]&gt;([]);
  const [saving, setSaving]           = useState(false);

  // Batch release
  const [batchExamId, setBatchExamId] = useState(&quot;&quot;);
  const [batchReleaseOpen, setBatchReleaseOpen] = useState(false);
  const [batchReleasing, setBatchReleasing] = useState(false);
  const [batchAttempts, setBatchAttempts] = useState&lt;any[]&gt;([]);

  const scoreRefs = useRef&lt;Record&lt;string, Record&lt;number, number&gt;&gt;&gt;({});

  const fetchAttempts = async () =&gt; {
    const [attemptsRes, profilesRes, examsRes] = await Promise.all([
      supabase.from(&quot;exam_attempts&quot;).select(&quot;*&quot;).in(&quot;status&quot;, [&quot;submitted&quot;,&quot;graded&quot;,&quot;released&quot;]).order(&quot;submitted_at&quot;, { ascending: false }),
      supabase.from(&quot;profiles&quot;).select(&quot;user_id, full_name, email&quot;),
      supabase.from(&quot;exams&quot;).select(&quot;id, title, title_ar, passing_score, term, type&quot;),
    ]);
    const profiles = profilesRes.data || [];
    const exams = examsRes.data || [];
    setExamsList(exams);
    const merged = (attemptsRes.data || []).map((a: any) =&gt; ({
      ...a,
      profiles: profiles.find(p =&gt; p.user_id === a.user_id) || {},
      exams: exams.find(e =&gt; e.id === a.exam_id) || {},
    }));
    setAllAttempts(merged);
  };

  useEffect(() =&gt; { fetchAttempts(); }, []);

  const filtered = allAttempts.filter(a =&gt; {
    if (gradingTab === &quot;pending&quot; &amp;&amp; a.status !== &quot;submitted&quot;) return false;
    if (gradingTab === &quot;graded&quot; &amp;&amp; a.status !== &quot;graded&quot;) return false;
    if (gradingTab === &quot;released&quot; &amp;&amp; a.status !== &quot;released&quot;) return false;
    if (examFilter !== &quot;all&quot; &amp;&amp; a.exam_id !== examFilter) return false;
    if (studentFilter) {
      const name = (a.profiles?.full_name||&quot;&quot;).toLowerCase();
      if (!name.includes(studentFilter.toLowerCase())) return false;
    }
    return true;
  });

  const openAttempt = async (attempt: any) =&gt; {
    setSelectedAttempt(attempt);
    const [qRes, aRes] = await Promise.all([
      supabase.from(&quot;exam_questions&quot;).select(&quot;*&quot;).eq(&quot;exam_id&quot;, attempt.exam_id).order(&quot;sort_order&quot;),
      supabase.from(&quot;exam_answers&quot;).select(&quot;*&quot;).eq(&quot;attempt_id&quot;, attempt.id),
    ]);
    setQuestions(qRes.data || []);
    setAnswers(aRes.data || []);
    if (!scoreRefs.current[attempt.id]) {
      const init: Record&lt;number, number&gt; = {};
      (aRes.data||[]).forEach((a: any, i: number) =&gt; { init[i] = a.points_awarded || 0; });
      scoreRefs.current[attempt.id] = init;
    }
  };

  const saveGrading = async () =&gt; {
    if (!selectedAttempt) return;
    setSaving(true);
    try {
      const scores = scoreRefs.current[selectedAttempt.id] || {};
      const totalPoints = questions.reduce((s, q) =&gt; s + (q.points || 1), 0);
      let earned = 0;

      for (let i = 0; i &lt; answers.length; i++) {
        const pts = scores[i] ?? answers[i]?.points_awarded ?? 0;
        earned += Number(pts);
        await supabase.from(&quot;exam_answers&quot;).update({
          points_awarded: pts,
          is_correct: pts &gt; 0,
          graded_by: user?.id,
          graded_at: new Date().toISOString(),
        }).eq(&quot;id&quot;, answers[i].id);
      }

      const pct = totalPoints &gt; 0 ? Math.round((earned / totalPoints) * 100) : 0;
      const passing = selectedAttempt.exams?.passing_score || 60;
      await supabase.from(&quot;exam_attempts&quot;).update({
        status: &quot;graded&quot;,
        score: earned,
        total_points: totalPoints,
        percentage: pct,
        passed: pct &gt;= passing,
        graded_by: user?.id,
        graded_at: new Date().toISOString(),
      }).eq(&quot;id&quot;, selectedAttempt.id);

      toast({ title: `✅ Graded! Score: ${earned}/${totalPoints} (${pct}%)` });
      setSelectedAttempt(null);
      fetchAttempts();
    } catch (e: any) {
      toast({ title: &quot;Error&quot;, description: e.message, variant: &quot;destructive&quot; });
    } finally {
      setSaving(false);
    }
  };

  // Release individual result
  const releaseResult = async (attemptId: string, studentId: string, examTitle: string) =&gt; {
    await supabase.from(&quot;exam_attempts&quot;).update({ status: &quot;released&quot;, results_released_at: new Date().toISOString() }).eq(&quot;id&quot;, attemptId);
    await supabase.from(&quot;notifications&quot; as any).insert({
      user_id: studentId, title: &quot;Exam results available&quot;,
      message: `Your results for &quot;${examTitle}&quot; are now available.`,
      type: &quot;result_released&quot;, reference_id: attemptId,
    });
    toast({ title: &quot;Result released to student&quot; });
    fetchAttempts();
  };

  // Batch release
  const openBatchRelease = async (examId: string) =&gt; {
    setBatchExamId(examId);
    const { data } = await supabase.from(&quot;exam_attempts&quot;)
      .select(&quot;*, profiles:user_id(full_name)&quot;)
      .eq(&quot;exam_id&quot;, examId).eq(&quot;status&quot;, &quot;graded&quot;);
    setBatchAttempts(data || []);
    setBatchReleaseOpen(true);
  };

  const executeBatchRelease = async () =&gt; {
    if (!batchAttempts.length) return;
    setBatchReleasing(true);
    try {
      const ids = batchAttempts.map(a =&gt; a.id);
      await supabase.from(&quot;exam_attempts&quot;).update({
        status: &quot;released&quot;, results_released_at: new Date().toISOString(),
      }).in(&quot;id&quot;, ids);

      const exam = examsList.find(e =&gt; e.id === batchExamId);
      await supabase.from(&quot;notifications&quot; as any).insert(
        batchAttempts.map(a =&gt; ({
          user_id: a.user_id, title: &quot;Exam results available&quot;,
          message: `Your results for &quot;${exam?.title||&quot;exam&quot;}&quot; are now available.`,
          type: &quot;result_released&quot;, reference_id: a.id,
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
    pending: allAttempts.filter(a =&gt; a.status === &quot;submitted&quot;).length,
    graded:  allAttempts.filter(a =&gt; a.status === &quot;graded&quot;).length,
    released:allAttempts.filter(a =&gt; a.status === &quot;released&quot;).length,
  };

  // === GRADING VIEW ===
  if (selectedAttempt) {
    return (
      &lt;div style={{ minHeight: &quot;100vh&quot;, background: &quot;#F8F9FA&quot; }}&gt;
        &lt;div style={{ background: G, padding: &quot;14px 20px&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 12 }}&gt;
          &lt;button onClick={() =&gt; setSelectedAttempt(null)}
            style={{ background: &quot;rgba(255,255,255,.15)&quot;, border: &quot;none&quot;, borderRadius: 8, padding: &quot;7px 12px&quot;, color: &quot;#fff&quot;, cursor: &quot;pointer&quot;, fontSize: 12, fontWeight: 600 }}&gt;
            ← Back
          &lt;/button&gt;
          &lt;div style={{ flex: 1 }}&gt;
            &lt;p style={{ fontWeight: 800, fontSize: 15, color: &quot;#fff&quot;, margin: 0 }}&gt;{selectedAttempt.profiles?.full_name || &quot;Student&quot;}&lt;/p&gt;
            &lt;p style={{ fontSize: 11, color: &quot;rgba(255,255,255,.65)&quot;, margin: 0 }}&gt;{language === &quot;ar&quot; ? selectedAttempt.exams?.title_ar||selectedAttempt.exams?.title : selectedAttempt.exams?.title}&lt;/p&gt;
          &lt;/div&gt;
          &lt;Button onClick={saveGrading} disabled={saving}
            style={{ background: &quot;#fff&quot;, color: G, borderRadius: 10, fontWeight: 800, gap: 6, fontSize: 13 }}&gt;
            {saving ? &lt;&gt;&lt;Loader2 size={14} style={{ animation: &quot;spin .8s linear infinite&quot; }} /&gt; Saving…&lt;/&gt; : &lt;&gt;&lt;CheckCircle size={14} /&gt; Save Grades&lt;/&gt;}
          &lt;/Button&gt;
        &lt;/div&gt;

        &lt;div style={{ padding: &quot;16px&quot;, maxWidth: 800, margin: &quot;0 auto&quot;, display: &quot;flex&quot;, flexDirection: &quot;column&quot;, gap: 14 }}&gt;
          {answers.map((ans, i) =&gt; {
            const q = questions.find(q =&gt; q.id === ans.question_id) || questions[i] || {};
            const isEssay = q.question_type === &quot;essay&quot; || q.question_type === &quot;short_answer&quot; || q.question_type === &quot;audio&quot;;
            const bi = splitBilingual(q.question_text||&quot;&quot;);
            const ansText = ans.answer_text || ans.selected_option || &quot;&quot;;

            return (
              &lt;div key={ans.id} style={{ background: &quot;#fff&quot;, borderRadius: 16, border: &quot;1.5px solid #E5E7EB&quot;, padding: 16 }}&gt;
                &lt;div style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 8, marginBottom: 10 }}&gt;
                  &lt;span style={{ width: 28, height: 28, borderRadius: 8, background: &quot;#F3F4F6&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot;, fontSize: 12, fontWeight: 800, color: &quot;#6B7280&quot; }}&gt;
                    {i+1}
                  &lt;/span&gt;
                  &lt;span style={{ fontSize: 11, fontWeight: 700, padding: &quot;2px 8px&quot;, borderRadius: 20, background: &quot;#EFF6FF&quot;, color: &quot;#1D4ED8&quot; }}&gt;
                    {q.question_type?.replace(&quot;_&quot;,&quot; &quot;)} · {q.points||1} pt{q.points!==1?&quot;s&quot;:&quot;&quot;}
                  &lt;/span&gt;
                &lt;/div&gt;

                &lt;div style={{ fontSize: 14, fontWeight: 600, color: &quot;#111&quot;, marginBottom: 8, lineHeight: 1.6 }}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(bi ? `${bi.ar}&lt;br/&gt;&lt;span style=&quot;font-size:12px;color:#6B7280&quot;&gt;${bi.en}&lt;/span&gt;` : q.question_text||&quot;&quot;) }} /&gt;

                {/* Answer */}
                &lt;div style={{ background: &quot;#F9FAFB&quot;, borderRadius: 10, padding: &quot;10px 12px&quot;, marginBottom: isEssay ? 10 : 0 }}&gt;
                  &lt;p style={{ fontSize: 11, fontWeight: 700, color: &quot;#9CA3AF&quot;, margin: &quot;0 0 4px&quot; }}&gt;Student Answer:&lt;/p&gt;
                  {q.question_type === &quot;audio&quot; &amp;&amp; ans.audio_url ? (
                    &lt;div style={{ display: &quot;flex&quot;, flexDirection: &quot;column&quot;, gap: 10 }}&gt;
                      {/* Prominent audio player */}
                      &lt;div style={{ background: `linear-gradient(135deg, ${G} 0%, #0a7a5a 100%)`, borderRadius: 14, padding: &quot;14px 16px&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 14 }}&gt;
                        &lt;audio id={`audio-${ans.id}`} src={ans.audio_url} crossOrigin=&quot;anonymous&quot; preload=&quot;metadata&quot; style={{ display: &quot;none&quot; }} /&gt;
                        &lt;button
                          onClick={() =&gt; {
                            const el = document.getElementById(`audio-${ans.id}`) as HTMLAudioElement;
                            if (!el) return;
                            if (el.paused) { el.play(); } else { el.pause(); }
                          }}
                          style={{ width: 46, height: 46, borderRadius: &quot;50%&quot;, background: &quot;#fff&quot;, border: &quot;none&quot;, cursor: &quot;pointer&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot;, flexShrink: 0, boxShadow: &quot;0 4px 12px rgba(0,0,0,.2)&quot; }}&gt;
                          &lt;span style={{ fontSize: 18 }}&gt;▶&lt;/span&gt;
                        &lt;/button&gt;
                        &lt;div style={{ flex: 1 }}&gt;
                          &lt;p style={{ fontSize: 12, fontWeight: 700, color: &quot;#fff&quot;, margin: &quot;0 0 2px&quot; }}&gt;🎤 Student Recording&lt;/p&gt;
                          &lt;p style={{ fontSize: 10, color: &quot;rgba(255,255,255,.65)&quot;, margin: 0 }}&gt;Tap ▶ to play • Recitation answer&lt;/p&gt;
                        &lt;/div&gt;
                        &lt;a href={ans.audio_url} download target=&quot;_blank&quot; rel=&quot;noreferrer&quot;
                          style={{ padding: &quot;6px 10px&quot;, borderRadius: 8, background: &quot;rgba(255,255,255,.15)&quot;, color: &quot;#fff&quot;, fontSize: 11, fontWeight: 600, textDecoration: &quot;none&quot;, border: &quot;1px solid rgba(255,255,255,.25)&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 4 }}&gt;
                          &lt;Download size={12} /&gt; DL
                        &lt;/a&gt;
                      &lt;/div&gt;
                      {/* Native fallback */}
                      &lt;audio controls preload=&quot;metadata&quot; src={ans.audio_url} crossOrigin=&quot;anonymous&quot;
                        style={{ width: &quot;100%&quot;, borderRadius: 8, height: 36, display: &quot;block&quot; }} /&gt;
                      &lt;AdminAudioPlayer src={ans.audio_url} label=&quot;Enhanced Player&quot; /&gt;
                    &lt;/div&gt;
                  ) : (
                    &lt;p style={{ fontSize: 13, color: &quot;#374151&quot;, margin: 0, lineHeight: 1.6 }} dir=&quot;auto&quot;&gt;{ansText || &quot;(No answer)&quot;}&lt;/p&gt;
                  )}
                &lt;/div&gt;

                {/* MCQ auto-grade display */}
                {!isEssay &amp;&amp; q.correct_answer &amp;&amp; (
                  &lt;div style={{ marginTop: 8, display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 8 }}&gt;
                    {ans.is_correct
                      ? &lt;span style={{ fontSize: 12, color: &quot;#16A34A&quot;, fontWeight: 700, display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 4 }}&gt;&lt;CheckCircle size={14}/&gt; Correct&lt;/span&gt;
                      : &lt;span style={{ fontSize: 12, color: &quot;#DC2626&quot;, fontWeight: 700, display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 4 }}&gt;&lt;XCircle size={14}/&gt; Incorrect — Answer: {q.correct_answer}&lt;/span&gt;
                    }
                  &lt;/div&gt;
                )}

                {/* Manual scoring for essays — enhanced with comment */}
                {isEssay &amp;&amp; (
                  &lt;div style={{ marginTop: 10, background: &quot;#F0FDF4&quot;, borderRadius: 12, padding: &quot;12px 14px&quot;, border: &quot;1.5px solid #BBF7D0&quot; }}&gt;
                    &lt;div style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 10, marginBottom: 10, flexWrap: &quot;wrap&quot; as const }}&gt;
                      &lt;span style={{ fontSize: 12, fontWeight: 800, color: G }}&gt;Score:&lt;/span&gt;
                      &lt;div style={{ display: &quot;flex&quot;, gap: 5, flexWrap: &quot;wrap&quot; as const }}&gt;
                        {Array.from({ length: (q.points||1) + 1 }, (_, n) =&gt; {
                          const isSelected = (scoreRefs.current[selectedAttempt.id]||{})[i] === n ||
                            (!(selectedAttempt.id in (scoreRefs.current||{})) &amp;&amp; ans.points_awarded === n);
                          return (
                            &lt;button key={n} onClick={() =&gt; {
                              if (!scoreRefs.current[selectedAttempt.id]) scoreRefs.current[selectedAttempt.id] = {};
                              scoreRefs.current[selectedAttempt.id][i] = n;
                              const copy = [...answers];
                              copy[i] = { ...copy[i], points_awarded: n };
                              setAnswers(copy);
                            }}
                              style={{
                                width: 36, height: 36, borderRadius: 10,
                                border: `2px solid ${isSelected ? G : &quot;#D1FAE5&quot;}`,
                                background: isSelected ? G : &quot;#fff&quot;,
                                cursor: &quot;pointer&quot;, fontSize: 14, fontWeight: 800,
                                color: isSelected ? &quot;#fff&quot; : &quot;#374151&quot;,
                                boxShadow: isSelected ? `0 3px 10px rgba(6,78,59,.3)` : &quot;none&quot;,
                                transition: &quot;all .15s&quot;,
                              }}&gt;
                              {n}
                            &lt;/button&gt;
                          );
                        })}
                      &lt;/div&gt;
                      &lt;span style={{ fontSize: 12, fontWeight: 600, color: &quot;#6B7280&quot; }}&gt;/ {q.points||1} pt{(q.points||1) !== 1 ? &quot;s&quot; : &quot;&quot;}&lt;/span&gt;
                    &lt;/div&gt;
                    {/* Comment field */}
                    &lt;div&gt;
                      &lt;label style={{ fontSize: 11, fontWeight: 700, color: &quot;#065F46&quot;, display: &quot;block&quot;, marginBottom: 5 }}&gt;
                        📝 Teacher Note (optional):
                      &lt;/label&gt;
                      &lt;textarea
                        defaultValue={ans.grader_comment || &quot;&quot;}
                        onChange={e =&gt; {
                          const copy = [...answers];
                          copy[i] = { ...copy[i], grader_comment: e.target.value };
                          setAnswers(copy);
                        }}
                        placeholder=&quot;Add feedback for this answer…&quot;
                        rows={2}
                        style={{
                          width: &quot;100%&quot;, padding: &quot;8px 10px&quot;, borderRadius: 9, border: &quot;1.5px solid #86EFAC&quot;,
                          fontSize: 13, outline: &quot;none&quot;, resize: &quot;vertical&quot; as const, fontFamily: &quot;inherit&quot;,
                          background: &quot;#fff&quot;, boxSizing: &quot;border-box&quot; as const, color: &quot;#374151&quot;,
                        }}
                      /&gt;
                    &lt;/div&gt;
                  &lt;/div&gt;
                )}
              &lt;/div&gt;
            );
          })}
        &lt;/div&gt;
        &lt;style&gt;{`@keyframes spin{to{transform:rotate(360deg)}}`}&lt;/style&gt;
      &lt;/div&gt;
    );
  }

  // === LIST VIEW ===
  return (
    &lt;div style={{ minHeight: &quot;100vh&quot;, background: &quot;#F8F9FA&quot; }}&gt;
      &lt;div style={{ background: &quot;#fff&quot;, borderBottom: &quot;1px solid #E5E7EB&quot;, padding: &quot;18px 20px&quot; }}&gt;
        &lt;div style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;space-between&quot;, flexWrap: &quot;wrap&quot;, gap: 12 }}&gt;
          &lt;div style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 12 }}&gt;
            &lt;div style={{ width: 40, height: 40, borderRadius: 12, background: &quot;#F0FDF4&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot; }}&gt;
              &lt;BarChart2 size={20} color={G} /&gt;
            &lt;/div&gt;
            &lt;div&gt;
              &lt;h1 style={{ fontSize: 20, fontWeight: 800, color: &quot;#111&quot;, margin: 0 }}&gt;Grading Dashboard&lt;/h1&gt;
              &lt;p style={{ fontSize: 12, color: &quot;#6B7280&quot;, margin: 0 }}&gt;{tabCounts.pending} pending · {tabCounts.graded} graded · {tabCounts.released} released&lt;/p&gt;
            &lt;/div&gt;
          &lt;/div&gt;
          &lt;Button onClick={() =&gt; setBatchReleaseOpen(true)}
            style={{ background: &quot;#16A34A&quot;, borderRadius: 12, gap: 8, fontWeight: 700 }}&gt;
            &lt;Unlock size={16} /&gt; Batch Release
          &lt;/Button&gt;
        &lt;/div&gt;
      &lt;/div&gt;

      &lt;div style={{ padding: &quot;16px&quot;, maxWidth: 900, margin: &quot;0 auto&quot; }}&gt;
        {/* Tabs */}
        &lt;div style={{ display: &quot;flex&quot;, gap: 4, marginBottom: 16, background: &quot;#fff&quot;, borderRadius: 14, padding: 4, border: &quot;1px solid #E5E7EB&quot; }}&gt;
          {([&quot;pending&quot;,&quot;graded&quot;,&quot;released&quot;] as const).map(tab =&gt; (
            &lt;button key={tab} onClick={() =&gt; setGradingTab(tab)}
              style={{ flex: 1, padding: &quot;9px&quot;, borderRadius: 10, border: &quot;none&quot;, cursor: &quot;pointer&quot;, fontWeight: 700, fontSize: 13,
                background: gradingTab === tab ? G : &quot;transparent&quot;,
                color: gradingTab === tab ? &quot;#fff&quot; : &quot;#6B7280&quot; }}&gt;
              {tab.charAt(0).toUpperCase()+tab.slice(1)} ({tabCounts[tab]})
            &lt;/button&gt;
          ))}
        &lt;/div&gt;

        {/* Filters */}
        &lt;div style={{ display: &quot;flex&quot;, gap: 10, marginBottom: 16, flexWrap: &quot;wrap&quot; }}&gt;
          &lt;div style={{ position: &quot;relative&quot;, flex: 1, minWidth: 160 }}&gt;
            &lt;Search size={13} style={{ position: &quot;absolute&quot;, left: 10, top: &quot;50%&quot;, transform: &quot;translateY(-50%)&quot;, color: &quot;#9CA3AF&quot; }} /&gt;
            &lt;input value={studentFilter} onChange={e =&gt; setStudentFilter(e.target.value)} placeholder=&quot;Search student…&quot;
              style={{ width: &quot;100%&quot;, padding: &quot;8px 10px 8px 30px&quot;, borderRadius: 9, border: &quot;1.5px solid #E5E7EB&quot;, fontSize: 13, outline: &quot;none&quot;, boxSizing: &quot;border-box&quot; as const }} /&gt;
          &lt;/div&gt;
          &lt;select value={examFilter} onChange={e =&gt; setExamFilter(e.target.value)}
            style={{ padding: &quot;8px 12px&quot;, borderRadius: 9, border: &quot;1.5px solid #E5E7EB&quot;, fontSize: 13, outline: &quot;none&quot;, minWidth: 150 }}&gt;
            &lt;option value=&quot;all&quot;&gt;All Exams&lt;/option&gt;
            {examsList.map(e =&gt; &lt;option key={e.id} value={e.id}&gt;{language===&quot;ar&quot;?e.title_ar||e.title:e.title}&lt;/option&gt;)}
          &lt;/select&gt;
        &lt;/div&gt;

        {/* Attempt cards */}
        {filtered.length === 0 ? (
          &lt;div style={{ textAlign: &quot;center&quot;, padding: &quot;48px 24px&quot;, background: &quot;#fff&quot;, borderRadius: 16, border: &quot;2px dashed #E5E7EB&quot; }}&gt;
            &lt;p style={{ fontWeight: 700, color: &quot;#374151&quot; }}&gt;No {gradingTab} submissions&lt;/p&gt;
          &lt;/div&gt;
        ) : (
          &lt;div style={{ display: &quot;flex&quot;, flexDirection: &quot;column&quot;, gap: 8 }}&gt;
            {filtered.map(attempt =&gt; {
              const pct = Math.round(attempt.percentage || 0);
              const passing = attempt.exams?.passing_score || 60;
              return (
                &lt;div key={attempt.id} style={{ background: &quot;#fff&quot;, borderRadius: 14, border: &quot;1.5px solid #E5E7EB&quot;, padding: &quot;14px 16px&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 12, flexWrap: &quot;wrap&quot; }}&gt;
                  &lt;div style={{ flex: 1, minWidth: 150 }}&gt;
                    &lt;p style={{ fontWeight: 700, fontSize: 14, color: &quot;#111&quot;, margin: 0 }}&gt;{attempt.profiles?.full_name || &quot;Student&quot;}&lt;/p&gt;
                    &lt;p style={{ fontSize: 12, color: &quot;#9CA3AF&quot;, margin: &quot;2px 0 0&quot; }}&gt;{language===&quot;ar&quot;?attempt.exams?.title_ar||attempt.exams?.title:attempt.exams?.title}&lt;/p&gt;
                  &lt;/div&gt;

                  {attempt.status !== &quot;submitted&quot; &amp;&amp; (
                    &lt;div style={{ textAlign: &quot;center&quot; }}&gt;
                      &lt;div style={{ fontSize: 18, fontWeight: 900, color: pct &gt;= passing ? &quot;#16A34A&quot; : &quot;#DC2626&quot; }}&gt;{pct}%&lt;/div&gt;
                      &lt;div style={{ fontSize: 10, color: &quot;#9CA3AF&quot; }}&gt;{attempt.passed ? &quot;Pass&quot; : &quot;Fail&quot;}&lt;/div&gt;
                    &lt;/div&gt;
                  )}

                  &lt;div style={{ display: &quot;flex&quot;, gap: 6, flexWrap: &quot;wrap&quot; }}&gt;
                    {attempt.status === &quot;submitted&quot; &amp;&amp; (
                      &lt;button onClick={() =&gt; openAttempt(attempt)}
                        style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 5, padding: &quot;7px 14px&quot;, borderRadius: 9, border: &quot;none&quot;, background: G, color: &quot;#fff&quot;, cursor: &quot;pointer&quot;, fontSize: 12, fontWeight: 700 }}&gt;
                        &lt;FileText size={12} /&gt; Grade
                      &lt;/button&gt;
                    )}
                    {attempt.status === &quot;graded&quot; &amp;&amp; (
                      &lt;&gt;
                        &lt;button onClick={() =&gt; openAttempt(attempt)}
                          style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 5, padding: &quot;7px 12px&quot;, borderRadius: 9, border: &quot;1.5px solid #E5E7EB&quot;, background: &quot;#fff&quot;, cursor: &quot;pointer&quot;, fontSize: 12, fontWeight: 600, color: &quot;#374151&quot; }}&gt;
                          &lt;Eye size={12} /&gt; Review
                        &lt;/button&gt;
                        &lt;button onClick={() =&gt; releaseResult(attempt.id, attempt.user_id, attempt.exams?.title||&quot;&quot;)}
                          style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 5, padding: &quot;7px 12px&quot;, borderRadius: 9, border: &quot;none&quot;, background: &quot;#16A34A&quot;, color: &quot;#fff&quot;, cursor: &quot;pointer&quot;, fontSize: 12, fontWeight: 700 }}&gt;
                          &lt;Unlock size={12} /&gt; Release
                        &lt;/button&gt;
                      &lt;/&gt;
                    )}
                    {attempt.status === &quot;released&quot; &amp;&amp; (
                      &lt;span style={{ fontSize: 11, padding: &quot;4px 10px&quot;, borderRadius: 20, background: &quot;#DCFCE7&quot;, color: &quot;#166534&quot;, fontWeight: 700, display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 4 }}&gt;
                        &lt;CheckCircle size={11}/&gt; Released
                      &lt;/span&gt;
                    )}
                  &lt;/div&gt;
                &lt;/div&gt;
              );
            })}
          &lt;/div&gt;
        )}
      &lt;/div&gt;

      {/* Batch Release Dialog */}
      &lt;Dialog open={batchReleaseOpen} onOpenChange={v =&gt; { if (!v) { setBatchReleaseOpen(false); setBatchAttempts([]); } }}&gt;
        &lt;DialogContent style={{ maxWidth: 480, borderRadius: 20, padding: 0 }}&gt;
          &lt;div style={{ background: &quot;#16A34A&quot;, padding: &quot;18px 20px&quot;, borderRadius: &quot;20px 20px 0 0&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 10 }}&gt;
            &lt;Unlock size={20} color=&quot;#fff&quot; /&gt;
            &lt;h2 style={{ fontWeight: 800, fontSize: 16, color: &quot;#fff&quot;, margin: 0 }}&gt;Batch Release Results&lt;/h2&gt;
          &lt;/div&gt;
          &lt;div style={{ padding: 20, display: &quot;flex&quot;, flexDirection: &quot;column&quot;, gap: 14 }}&gt;
            &lt;div&gt;
              &lt;label style={{ fontSize: 12, fontWeight: 700, color: &quot;#6B7280&quot;, display: &quot;block&quot;, marginBottom: 8 }}&gt;Select Exam&lt;/label&gt;
              &lt;select value={batchExamId} onChange={e =&gt; openBatchRelease(e.target.value)}
                style={{ width: &quot;100%&quot;, padding: &quot;10px 12px&quot;, borderRadius: 10, border: &quot;1.5px solid #E5E7EB&quot;, fontSize: 13, outline: &quot;none&quot; }}&gt;
                &lt;option value=&quot;&quot;&gt;Select an exam…&lt;/option&gt;
                {examsList.map(e =&gt; &lt;option key={e.id} value={e.id}&gt;{language===&quot;ar&quot;?e.title_ar||e.title:e.title}&lt;/option&gt;)}
              &lt;/select&gt;
            &lt;/div&gt;

            {batchAttempts.length &gt; 0 &amp;&amp; (
              &lt;div&gt;
                &lt;p style={{ fontSize: 13, fontWeight: 700, color: &quot;#374151&quot;, marginBottom: 8 }}&gt;
                  {batchAttempts.length} graded student{batchAttempts.length!==1?&quot;s&quot;:&quot;&quot;} will be notified:
                &lt;/p&gt;
                &lt;div style={{ maxHeight: 160, overflowY: &quot;auto&quot;, border: &quot;1px solid #E5E7EB&quot;, borderRadius: 10 }}&gt;
                  {batchAttempts.map((a, i) =&gt; (
                    &lt;div key={a.id} style={{ padding: &quot;8px 12px&quot;, borderBottom: i &lt; batchAttempts.length-1 ? &quot;1px solid #F3F4F6&quot; : &quot;none&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;space-between&quot; }}&gt;
                      &lt;span style={{ fontSize: 13, fontWeight: 600, color: &quot;#374151&quot; }}&gt;{(a.profiles as any)?.full_name || a.user_id.slice(0,8)}&lt;/span&gt;
                      &lt;span style={{ fontSize: 12, fontWeight: 700, color: a.passed ? &quot;#16A34A&quot; : &quot;#DC2626&quot; }}&gt;{Math.round(a.percentage||0)}%&lt;/span&gt;
                    &lt;/div&gt;
                  ))}
                &lt;/div&gt;
                &lt;div style={{ padding: &quot;10px 14px&quot;, background: &quot;#FFF7ED&quot;, borderRadius: 10, border: &quot;1px solid #FDE68A&quot;, marginTop: 10 }}&gt;
                  &lt;p style={{ fontSize: 12, color: &quot;#92400E&quot;, margin: 0 }}&gt;⚠️ Students will receive a notification and can view their results immediately after release.&lt;/p&gt;
                &lt;/div&gt;
              &lt;/div&gt;
            )}

            {batchExamId &amp;&amp; batchAttempts.length === 0 &amp;&amp; (
              &lt;div style={{ padding: &quot;16px&quot;, background: &quot;#F9FAFB&quot;, borderRadius: 10, textAlign: &quot;center&quot; }}&gt;
                &lt;p style={{ fontSize: 13, color: &quot;#9CA3AF&quot;, margin: 0 }}&gt;No graded attempts found for this exam&lt;/p&gt;
              &lt;/div&gt;
            )}

            &lt;button onClick={executeBatchRelease} disabled={batchReleasing || !batchAttempts.length}
              style={{ padding: &quot;13px&quot;, borderRadius: 12, border: &quot;none&quot;, background: &quot;#16A34A&quot;, color: &quot;#fff&quot;, cursor: &quot;pointer&quot;, fontWeight: 700, fontSize: 14, display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot;, gap: 8, opacity: (batchReleasing || !batchAttempts.length) ? .5 : 1 }}&gt;
              {batchReleasing ? &lt;&gt;&lt;Loader2 size={16} style={{ animation: &quot;spin .8s linear infinite&quot; }} /&gt; Releasing…&lt;/&gt; : &lt;&gt;&lt;Send size={16} /&gt; Release All &amp; Notify Students&lt;/&gt;}
            &lt;/button&gt;
          &lt;/div&gt;
        &lt;/DialogContent&gt;
      &lt;/Dialog&gt;
      &lt;style&gt;{`@keyframes spin{to{transform:rotate(360deg)}}`}&lt;/style&gt;
    &lt;/div&gt;
  );
};

export default GradingPage;</pre>
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