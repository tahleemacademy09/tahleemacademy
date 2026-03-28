<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Fix 4: StudentExams.tsx</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0F172A; color: #E2E8F0; min-height: 100vh; }
  .header { background: #0F766E; padding: 16px 20px; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 12px rgba(0,0,0,.4); }
  .header-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  .fix-badge { background: rgba(255,255,255,.2); border: 1px solid rgba(255,255,255,.3); border-radius: 20px; padding: 3px 12px; font-size: 11px; font-weight: 800; letter-spacing: 1px; color: #fff; }
  .filename { font-size: 17px; font-weight: 800; color: #fff; }
  .fix-desc { font-size: 12px; color: rgba(255,255,255,.75); }
  .meta { display: flex; gap: 14px; font-size: 11px; color: rgba(255,255,255,.55); margin-top: 6px; }
  .copy-btn { background: #fff; color: #0F766E; border: none; border-radius: 12px; padding: 11px 22px; font-size: 14px; font-weight: 800; cursor: pointer; flex-shrink: 0; transition: transform .1s; }
  .copy-btn:active { transform: scale(.96); }
  .copy-btn.copied { background: #22C55E; color: #fff; }
  .path-bar { background: #1E293B; padding: 10px 20px; font-size: 11px; color: #64748B; font-family: monospace; border-bottom: 1px solid #334155; }
  .path-bar span { color: #94A3B8; }
  .code-wrap { padding: 20px; overflow-x: auto; }
  pre { font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.7; color: #CBD5E1; white-space: pre-wrap; word-break: break-all; }
  .bottom-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #1E293B; border-top: 1px solid #334155; padding: 12px 20px; display: flex; justify-content: center; }
  .bottom-copy { background: #0F766E; color: #fff; border: none; border-radius: 14px; padding: 14px 40px; font-size: 16px; font-weight: 800; cursor: pointer; width: 100%; max-width: 480px; transition: opacity .15s; }
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
        <span class="fix-badge">Fix 4</span>
        <span class="filename">StudentExams.tsx</span>
      </div>
      <div class="fix-desc">StudentExams — filter/display by student level</div>
    </div>
    <button class="copy-btn" id="topBtn" onclick="copyCode(this)">📋 Copy</button>
  </div>
  <div class="meta">
    <span>📁 24.6 KB</span>
    <span>📝 465 lines</span>
  </div>
</div>

<div class="path-bar">Place at: <span>src/pages/student/StudentExams.tsx</span></div>

<div class="code-wrap">
  <pre id="codeBlock">import { useEffect, useState } from &quot;react&quot;;
import { useNavigate } from &quot;react-router-dom&quot;;
import { useLanguage } from &quot;@/contexts/LanguageContext&quot;;
import { useAuth } from &quot;@/contexts/AuthContext&quot;;
import { supabase } from &quot;@/integrations/supabase/client&quot;;
import { useToast } from &quot;@/hooks/use-toast&quot;;
import {
  Clock, CheckCircle, XCircle, PlayCircle,
  BookOpen, History, Star,
  Shield, Zap, Trophy, RotateCcw, Eye, ChevronRight,
} from &quot;lucide-react&quot;;

/* ── Brand tokens ────────────────────────────────────── */
const G      = &quot;#0f2d1f&quot;;
const GM     = &quot;#1a4731&quot;;
const GOLD   = &quot;#c9a84c&quot;;
const CREAM  = &quot;#faf6ee&quot;;
const BORDER = &quot;rgba(15,45,31,0.1)&quot;;
const TL     = &quot;#7a9e88&quot;;

type Tab        = &quot;available&quot; | &quot;completed&quot; | &quot;history&quot;;
type TermFilter = &quot;all&quot; | &quot;first&quot; | &quot;second&quot; | &quot;third&quot;;
type TypeFilter = &quot;all&quot; | &quot;exam&quot; | &quot;test&quot;;

const StudentExams = () =&gt; {
  const { t, language } = useLanguage();
  const { user }        = useAuth();
  const { toast }       = useToast();
  const navigate        = useNavigate();

  const [assignedExams, setAssignedExams] = useState&lt;any[]&gt;([]);
  const [pastAttempts,  setPastAttempts]  = useState&lt;any[]&gt;([]);
  const [attemptCounts, setAttemptCounts] = useState&lt;Record&lt;string, number&gt;&gt;({});
  const [loading,       setLoading]       = useState(true);
  const [studentLevel,  setStudentLevel]  = useState&lt;string | null&gt;(null);
  const [tab,           setTab]           = useState&lt;Tab&gt;(&quot;available&quot;);
  const [termFilter,    setTermFilter]    = useState&lt;TermFilter&gt;(&quot;all&quot;);
  const [typeFilter,    setTypeFilter]    = useState&lt;TypeFilter&gt;(&quot;all&quot;);

  useEffect(() =&gt; {
    if (!user) return;
    load();
    const iv = setInterval(load, 30000);
    return () =&gt; clearInterval(iv);
  }, [user]);

  const load = async () =&gt; {
    try {
      // Fetch student&#x27;s level from profile
      const { data: profile } = await supabase
        .from(&quot;profiles&quot;).select(&quot;level&quot;).eq(&quot;user_id&quot;, user!.id).maybeSingle();
      if (profile?.level) setStudentLevel(profile.level);

      const { data: asn } = await supabase
        .from(&quot;exam_assignments&quot;).select(&quot;exam_id, exams(*)&quot;)
        .eq(&quot;user_id&quot;, user!.id);
      const list = (asn || []).map((a: any) =&gt; a.exams).filter((e: any) =&gt; e?.is_published);
      setAssignedExams(list);

      const { data: att } = await supabase
        .from(&quot;exam_attempts&quot;).select(&quot;*, exams(title,title_ar,max_attempts,type)&quot;)
        .eq(&quot;user_id&quot;, user!.id).order(&quot;created_at&quot;, { ascending: false });
      setPastAttempts(att || []);

      const counts: Record&lt;string, number&gt; = {};
      (att || []).forEach((a: any) =&gt; { if (a.status !== &quot;in_progress&quot;) counts[a.exam_id] = (counts[a.exam_id] || 0) + 1; });
      setAttemptCounts(counts);
    } finally {
      setLoading(false);
    }
  };

  const getStatus = (exam: any) =&gt; {
    const max  = exam.max_attempts || 1;
    const done = attemptCounts[exam.id] || 0;
    if (pastAttempts.some(a =&gt; a.exam_id === exam.id &amp;&amp; a.status === &quot;in_progress&quot;)) return &quot;in_progress&quot;;
    if (done &gt;= max) return &quot;exhausted&quot;;
    const now = Date.now();
    if (exam.start_date &amp;&amp; new Date(exam.start_date).getTime() &gt; now) return &quot;not_started&quot;;
    if (exam.end_date   &amp;&amp; new Date(exam.end_date).getTime()   &lt; now) return &quot;expired&quot;;
    return &quot;available&quot;;
  };

  const handleStart = async (exam: any) =&gt; {
    const max  = exam.max_attempts || 1;
    const done = attemptCounts[exam.id] || 0;
    if (done &gt;= max) { toast({ title: t(&quot;No attempts left&quot;,&quot;لا محاولات متبقية&quot;), variant:&quot;destructive&quot; }); return; }
    const now = new Date();
    if (exam.start_date &amp;&amp; new Date(exam.start_date) &gt; now) { toast({ title: t(&quot;Not started yet&quot;,&quot;لم يبدأ بعد&quot;), variant:&quot;destructive&quot; }); return; }
    if (exam.end_date   &amp;&amp; new Date(exam.end_date)   &lt; now) { toast({ title: t(&quot;Expired&quot;,&quot;منتهي&quot;), variant:&quot;destructive&quot; }); return; }
    const { data: existing } = await supabase.from(&quot;exam_attempts&quot;).select(&quot;id&quot;)
      .eq(&quot;exam_id&quot;, exam.id).eq(&quot;user_id&quot;, user!.id).eq(&quot;status&quot;,&quot;in_progress&quot;).maybeSingle();
    if (existing) { navigate(`/student/exam/${existing.id}`); return; }
    navigate(`/student/exam-verify/${exam.id}`);
  };

  const applyFilters = (list: any[]) =&gt; list.filter(e =&gt; {
    if (typeFilter !== &quot;all&quot; &amp;&amp; (e.type || &quot;exam&quot;) !== typeFilter) return false;
    if (termFilter !== &quot;all&quot; &amp;&amp; (e.term || &quot;first&quot;) !== termFilter) return false;
    return true;
  });

  const available = applyFilters(assignedExams.filter(e =&gt; ![&quot;exhausted&quot;,&quot;expired&quot;].includes(getStatus(e))));
  const completed = applyFilters(assignedExams.filter(e =&gt; getStatus(e) === &quot;exhausted&quot;));
  const counts    = { available: available.length, completed: completed.length, history: pastAttempts.length };

  const totalDone      = assignedExams.filter(e =&gt; getStatus(e) === &quot;exhausted&quot;).length;
  const gradedAttempts = pastAttempts.filter(a =&gt; a.status === &quot;graded&quot;);
  const avgPct         = gradedAttempts.length ? Math.round(gradedAttempts.reduce((s,a) =&gt; s + (a.percentage||0), 0) / gradedAttempts.length) : 0;
  const passedCount    = gradedAttempts.filter(a =&gt; a.passed).length;

  const Chip = ({ active, onClick, label }: { active: boolean; onClick: () =&gt; void; label: string }) =&gt; (
    &lt;button onClick={onClick} style={{
      padding:&quot;7px 15px&quot;, borderRadius:20, fontSize:12, fontWeight:700,
      cursor:&quot;pointer&quot;, transition:&quot;all .2s&quot;,
      background: active ? G : &quot;#fff&quot;,
      color: active ? &quot;#fff&quot; : G,
      border: `1.5px solid ${active ? G : BORDER}`,
      boxShadow: active ? &quot;0 2px 8px rgba(15,45,31,.2)&quot; : &quot;none&quot;,
    }}&gt;{label}&lt;/button&gt;
  );

  const ExamCard = ({ exam }: { exam: any }) =&gt; {
    const status  = getStatus(exam);
    const done    = attemptCounts[exam.id] || 0;
    const max     = exam.max_attempts || 1;
    const isTest  = (exam.type || &quot;exam&quot;) === &quot;test&quot;;
    const latest  = pastAttempts.find(a =&gt; a.exam_id === exam.id &amp;&amp; a.status !== &quot;in_progress&quot;);
    const title   = language === &quot;ar&quot; ? exam.title_ar || exam.title : exam.title;

    const SM: Record&lt;string,{icon:string;color:string;bg:string;label:string}&gt; = {
      available:   { icon:&quot;▶&quot;,  color:&quot;#22c55e&quot;, bg:&quot;#f0fff4&quot;, label:t(&quot;Available&quot;,&quot;متاح&quot;) },
      in_progress: { icon:&quot;⚡&quot;, color:&quot;#f59e0b&quot;, bg:&quot;#fffbeb&quot;, label:t(&quot;In Progress&quot;,&quot;جارٍ&quot;) },
      exhausted:   { icon:&quot;✓&quot;,  color:&quot;#6366f1&quot;, bg:&quot;#eef2ff&quot;, label:t(&quot;Completed&quot;,&quot;مكتمل&quot;) },
      not_started: { icon:&quot;🔒&quot;, color:&quot;#9ca3af&quot;, bg:&quot;#f9fafb&quot;, label:t(&quot;Upcoming&quot;,&quot;قادم&quot;) },
      expired:     { icon:&quot;✗&quot;,  color:&quot;#ef4444&quot;, bg:&quot;#fff5f5&quot;, label:t(&quot;Expired&quot;,&quot;منتهي&quot;) },
    };
    const sm = SM[status] || SM.available;

    return (
      &lt;div style={{
        background:&quot;#fff&quot;, borderRadius:18, overflow:&quot;hidden&quot;,
        border:`1.5px solid ${BORDER}`, boxShadow:&quot;0 2px 12px rgba(15,45,31,.07)&quot;,
        marginBottom:12,
      }}&gt;
        &lt;div style={{ height:4, background: isTest ? &quot;linear-gradient(90deg,#f59e0b,#fbbf24)&quot; : `linear-gradient(90deg,${G},${GM})` }}/&gt;
        &lt;div style={{ padding:&quot;16px 16px 14px&quot; }}&gt;

          {/* Header */}
          &lt;div style={{ display:&quot;flex&quot;, alignItems:&quot;flex-start&quot;, justifyContent:&quot;space-between&quot;, gap:10, marginBottom:10 }}&gt;
            &lt;div style={{ flex:1, minWidth:0 }}&gt;
              &lt;div style={{ display:&quot;flex&quot;, alignItems:&quot;center&quot;, gap:6, marginBottom:5, flexWrap:&quot;wrap&quot; as const }}&gt;
                &lt;span style={{
                  fontSize:10, fontWeight:800, letterSpacing:.8, padding:&quot;3px 9px&quot;, borderRadius:10,
                  background: isTest ? &quot;#fffbeb&quot; : &quot;#f0fff4&quot;,
                  color: isTest ? &quot;#92400e&quot; : &quot;#065f46&quot;,
                  border:`1px solid ${isTest ? &quot;#fde68a&quot; : &quot;#86efac&quot;}`,
                }}&gt;
                  {isTest ? t(&quot;TEST&quot;,&quot;تمرين&quot;) : t(&quot;EXAM&quot;,&quot;امتحان&quot;)}
                &lt;/span&gt;
                {exam.term &amp;&amp; (
                  &lt;span style={{ fontSize:10, color:TL, fontWeight:600 }}&gt;
                    {exam.term === &quot;first&quot; ? t(&quot;Term 1&quot;,&quot;ف١&quot;) : exam.term === &quot;second&quot; ? t(&quot;Term 2&quot;,&quot;ف٢&quot;) : t(&quot;Term 3&quot;,&quot;ف٣&quot;)}
                  &lt;/span&gt;
                )}
                {exam.level &amp;&amp; (
                  &lt;span style={{
                    fontSize:10, fontWeight:700, padding:&quot;3px 9px&quot;, borderRadius:10,
                    background: exam.level === &quot;beginner&quot; ? &quot;#FFF7ED&quot; : exam.level === &quot;intermediate&quot; ? &quot;#F0FDF4&quot; : &quot;#EFF6FF&quot;,
                    color:      exam.level === &quot;beginner&quot; ? &quot;#C2410C&quot; : exam.level === &quot;intermediate&quot; ? &quot;#065F46&quot;  : &quot;#1D4ED8&quot;,
                    border:`1px solid ${exam.level === &quot;beginner&quot; ? &quot;#FDE68A&quot; : exam.level === &quot;intermediate&quot; ? &quot;#86EFAC&quot; : &quot;#BFDBFE&quot;}`,
                  }}&gt;
                    {exam.level === &quot;beginner&quot; ? &quot;🟢&quot; : exam.level === &quot;intermediate&quot; ? &quot;🟡&quot; : &quot;🔵&quot;} {exam.level}
                  &lt;/span&gt;
                )}
              &lt;/div&gt;
              &lt;h3 style={{ fontSize:15, fontWeight:800, color:G, lineHeight:1.4, margin:0 }}&gt;{title}&lt;/h3&gt;
            &lt;/div&gt;
            &lt;div style={{
              display:&quot;flex&quot;, alignItems:&quot;center&quot;, gap:5, padding:&quot;5px 10px&quot;, borderRadius:12, flexShrink:0,
              background:sm.bg, border:`1px solid ${sm.color}33`,
            }}&gt;
              &lt;span style={{ fontSize:11 }}&gt;{sm.icon}&lt;/span&gt;
              &lt;span style={{ fontSize:11, fontWeight:700, color:sm.color }}&gt;{sm.label}&lt;/span&gt;
            &lt;/div&gt;
          &lt;/div&gt;

          {/* Meta */}
          &lt;div style={{ display:&quot;flex&quot;, gap:14, flexWrap:&quot;wrap&quot; as const, marginBottom:12 }}&gt;
            {[
              [&lt;Clock style={{width:11,height:11}}/&gt;,  `${exam.time_limit_minutes} ${t(&quot;min&quot;,&quot;دق&quot;)}`],
              [&lt;Shield style={{width:11,height:11}}/&gt;, `${t(&quot;Pass&quot;,&quot;نجاح&quot;)} ${exam.passing_score}%`],
              [&lt;RotateCcw style={{width:11,height:11}}/&gt;, `${done}/${max} ${t(&quot;attempts&quot;,&quot;محاولات&quot;)}`],
              ...(exam.question_count ? [[&lt;BookOpen style={{width:11,height:11}}/&gt;, `${exam.question_count} ${t(&quot;Qs&quot;,&quot;سؤال&quot;)}`]] : []),
            ].map(([icon, text], i) =&gt; (
              &lt;div key={i} style={{ display:&quot;flex&quot;, alignItems:&quot;center&quot;, gap:4, fontSize:12, color:TL }}&gt;
                {icon as React.ReactNode}&lt;span&gt;{text as string}&lt;/span&gt;
              &lt;/div&gt;
            ))}
          &lt;/div&gt;

          {/* Dates */}
          {(exam.start_date || exam.end_date) &amp;&amp; (
            &lt;div style={{ display:&quot;flex&quot;, gap:12, marginBottom:12, padding:&quot;8px 10px&quot;, background:&quot;#f8fafb&quot;, borderRadius:10 }}&gt;
              {exam.start_date &amp;&amp; (
                &lt;div style={{ fontSize:11, color:TL }}&gt;
                  &lt;span style={{ fontWeight:700, color:G }}&gt;{t(&quot;Opens&quot;,&quot;يفتح&quot;)}: &lt;/span&gt;
                  {new Date(exam.start_date).toLocaleDateString(language===&quot;ar&quot;?&quot;ar-SA&quot;:&quot;en-US&quot;,{month:&quot;short&quot;,day:&quot;numeric&quot;,hour:&quot;2-digit&quot;,minute:&quot;2-digit&quot;})}
                &lt;/div&gt;
              )}
              {exam.end_date &amp;&amp; (
                &lt;div style={{ fontSize:11, color:TL }}&gt;
                  &lt;span style={{ fontWeight:700, color:&quot;#ef4444&quot; }}&gt;{t(&quot;Due&quot;,&quot;آخر&quot;)}: &lt;/span&gt;
                  {new Date(exam.end_date).toLocaleDateString(language===&quot;ar&quot;?&quot;ar-SA&quot;:&quot;en-US&quot;,{month:&quot;short&quot;,day:&quot;numeric&quot;})}
                &lt;/div&gt;
              )}
            &lt;/div&gt;
          )}

          {/* Score */}
          {status === &quot;exhausted&quot; &amp;&amp; latest?.status === &quot;graded&quot; &amp;&amp; (
            &lt;div style={{
              display:&quot;flex&quot;, alignItems:&quot;center&quot;, gap:10, padding:&quot;10px 12px&quot;, borderRadius:12, marginBottom:12,
              background: latest.passed ? &quot;#f0fff4&quot; : &quot;#fff5f5&quot;,
              border:`1px solid ${latest.passed ? &quot;#86efac&quot; : &quot;#fca5a5&quot;}`,
            }}&gt;
              {latest.passed
                ? &lt;CheckCircle style={{width:17,height:17,color:&quot;#22c55e&quot;,flexShrink:0}}/&gt;
                : &lt;XCircle    style={{width:17,height:17,color:&quot;#ef4444&quot;,flexShrink:0}}/&gt;}
              &lt;div style={{ flex:1 }}&gt;
                &lt;div style={{ fontSize:13, fontWeight:800, color:latest.passed ? &quot;#065f46&quot; : &quot;#991b1b&quot; }}&gt;
                  {Math.round(latest.percentage||0)}% — {latest.passed ? t(&quot;Passed&quot;,&quot;ناجح&quot;) : t(&quot;Failed&quot;,&quot;راسب&quot;)}
                &lt;/div&gt;
                &lt;div style={{ fontSize:11, color:TL }}&gt;{latest.score}/{latest.total_points} {t(&quot;points&quot;,&quot;نقطة&quot;)}&lt;/div&gt;
              &lt;/div&gt;
            &lt;/div&gt;
          )}
          {status === &quot;exhausted&quot; &amp;&amp; latest?.status === &quot;submitted&quot; &amp;&amp; (
            &lt;div style={{ padding:&quot;9px 12px&quot;, borderRadius:10, background:&quot;#fffbeb&quot;, border:&quot;1px solid #fde68a&quot;, marginBottom:12, fontSize:12, color:&quot;#92400e&quot;, fontWeight:600 }}&gt;
              ⏳ {t(&quot;Awaiting grading&quot;,&quot;بانتظار التصحيح&quot;)}
            &lt;/div&gt;
          )}

          {/* CTA */}
          {status === &quot;available&quot; &amp;&amp; (
            &lt;button onClick={() =&gt; handleStart(exam)} style={{
              width:&quot;100%&quot;, padding:&quot;13px&quot;, borderRadius:13, border:&quot;none&quot;, color:&quot;#fff&quot;, fontSize:14, fontWeight:800,
              cursor:&quot;pointer&quot;, display:&quot;flex&quot;, alignItems:&quot;center&quot;, justifyContent:&quot;center&quot;, gap:8,
              background:`linear-gradient(135deg,${G},${GM})`, boxShadow:&quot;0 4px 14px rgba(15,45,31,.3)&quot;,
            }}&gt;
              &lt;PlayCircle style={{width:16,height:16}}/&gt; {isTest ? t(&quot;Start Test&quot;,&quot;بدء التمرين&quot;) : t(&quot;Start Exam&quot;,&quot;بدء الامتحان&quot;)}
            &lt;/button&gt;
          )}
          {status === &quot;in_progress&quot; &amp;&amp; (
            &lt;button onClick={() =&gt; handleStart(exam)} style={{
              width:&quot;100%&quot;, padding:&quot;13px&quot;, borderRadius:13, border:&quot;none&quot;, color:&quot;#fff&quot;, fontSize:14, fontWeight:800,
              cursor:&quot;pointer&quot;, display:&quot;flex&quot;, alignItems:&quot;center&quot;, justifyContent:&quot;center&quot;, gap:8,
              background:&quot;linear-gradient(135deg,#f59e0b,#d97706)&quot;,
            }}&gt;
              &lt;Zap style={{width:16,height:16}}/&gt; {t(&quot;Continue&quot;,&quot;متابعة&quot;)}
            &lt;/button&gt;
          )}
          {status === &quot;exhausted&quot; &amp;&amp; latest &amp;&amp; (
            &lt;button onClick={() =&gt; navigate(`/student/results/${latest.id}`)} style={{
              width:&quot;100%&quot;, padding:&quot;12px&quot;, borderRadius:13, cursor:&quot;pointer&quot;,
              background:&quot;#fff&quot;, border:`2px solid ${G}`, color:G,
              fontSize:14, fontWeight:700, display:&quot;flex&quot;, alignItems:&quot;center&quot;, justifyContent:&quot;center&quot;, gap:8,
            }}&gt;
              &lt;Eye style={{width:15,height:15}}/&gt; {t(&quot;View Results&quot;,&quot;عرض النتائج&quot;)}
            &lt;/button&gt;
          )}
          {status === &quot;not_started&quot; &amp;&amp; (
            &lt;div style={{ padding:&quot;11px 14px&quot;, borderRadius:12, background:&quot;#f9fafb&quot;, border:&quot;1px solid #e5e7eb&quot;, textAlign:&quot;center&quot;, fontSize:12, color:TL, fontWeight:600 }}&gt;
              🔒 {t(&quot;Opens&quot;,&quot;يفتح&quot;)} {exam.start_date ? new Date(exam.start_date).toLocaleDateString(language===&quot;ar&quot;?&quot;ar-SA&quot;:&quot;en-US&quot;,{month:&quot;short&quot;,day:&quot;numeric&quot;,hour:&quot;2-digit&quot;,minute:&quot;2-digit&quot;}) : &quot;&quot;}
            &lt;/div&gt;
          )}
          {status === &quot;expired&quot; &amp;&amp; (
            &lt;div style={{ padding:&quot;11px 14px&quot;, borderRadius:12, background:&quot;#fff5f5&quot;, border:&quot;1px solid #fca5a5&quot;, textAlign:&quot;center&quot;, fontSize:12, color:&quot;#ef4444&quot;, fontWeight:600 }}&gt;
              ✗ {t(&quot;This exam has expired&quot;,&quot;انتهت صلاحية هذا الامتحان&quot;)}
            &lt;/div&gt;
          )}
        &lt;/div&gt;
      &lt;/div&gt;
    );
  };

  const HistoryRow = ({ attempt }: { attempt: any }) =&gt; {
    const title  = language === &quot;ar&quot; ? attempt.exams?.title_ar || attempt.exams?.title : attempt.exams?.title;
    const isTest = (attempt.exams?.type || &quot;exam&quot;) === &quot;test&quot;;
    const graded = attempt.status === &quot;graded&quot;;
    const inProg = attempt.status === &quot;in_progress&quot;;
    return (
      &lt;div onClick={() =&gt; !inProg &amp;&amp; navigate(`/student/results/${attempt.id}`)} style={{
        background:&quot;#fff&quot;, borderRadius:14, border:`1px solid ${BORDER}`,
        padding:&quot;13px 14px&quot;, marginBottom:8, cursor: inProg ? &quot;default&quot; : &quot;pointer&quot;,
        display:&quot;flex&quot;, alignItems:&quot;center&quot;, gap:12,
        boxShadow:&quot;0 1px 6px rgba(15,45,31,.06)&quot;,
      }}&gt;
        &lt;div style={{
          width:38, height:38, borderRadius:10, flexShrink:0,
          background: graded ? (attempt.passed ? &quot;#f0fff4&quot; : &quot;#fff5f5&quot;) : &quot;#f8fafb&quot;,
          display:&quot;flex&quot;, alignItems:&quot;center&quot;, justifyContent:&quot;center&quot;,
          border:`1.5px solid ${graded ? (attempt.passed ? &quot;#86efac&quot; : &quot;#fca5a5&quot;) : BORDER}`,
        }}&gt;
          {graded
            ? (attempt.passed ? &lt;CheckCircle style={{width:16,height:16,color:&quot;#22c55e&quot;}}/&gt; : &lt;XCircle style={{width:16,height:16,color:&quot;#ef4444&quot;}}/&gt;)
            : attempt.status === &quot;submitted&quot;
            ? &lt;Clock style={{width:16,height:16,color:&quot;#f59e0b&quot;}}/&gt;
            : &lt;PlayCircle style={{width:16,height:16,color:&quot;#6366f1&quot;}}/&gt;}
        &lt;/div&gt;
        &lt;div style={{ flex:1, minWidth:0 }}&gt;
          &lt;div style={{ fontSize:13, fontWeight:700, color:G, overflow:&quot;hidden&quot;, textOverflow:&quot;ellipsis&quot;, whiteSpace:&quot;nowrap&quot; as const }}&gt;
            {title || t(&quot;Unknown exam&quot;,&quot;امتحان غير معروف&quot;)}
          &lt;/div&gt;
          &lt;div style={{ fontSize:11, color:TL, marginTop:2 }}&gt;
            {new Date(attempt.created_at).toLocaleDateString(language===&quot;ar&quot;?&quot;ar-SA&quot;:&quot;en-US&quot;,{month:&quot;short&quot;,day:&quot;numeric&quot;,year:&quot;numeric&quot;})}
            &lt;span style={{ marginLeft:8, padding:&quot;1px 7px&quot;, borderRadius:8, fontSize:10, fontWeight:700, background: isTest ? &quot;#fffbeb&quot; : &quot;#f0fff4&quot;, color: isTest ? &quot;#92400e&quot; : &quot;#065f46&quot; }}&gt;
              {isTest ? t(&quot;Test&quot;,&quot;تمرين&quot;) : t(&quot;Exam&quot;,&quot;امتحان&quot;)}
            &lt;/span&gt;
          &lt;/div&gt;
        &lt;/div&gt;
        &lt;div style={{ textAlign:&quot;right&quot;, flexShrink:0 }}&gt;
          {graded &amp;&amp; (
            &lt;&gt;
              &lt;div style={{ fontSize:16, fontWeight:900, color: attempt.passed ? &quot;#22c55e&quot; : &quot;#ef4444&quot; }}&gt;{Math.round(attempt.percentage||0)}%&lt;/div&gt;
              &lt;div style={{ fontSize:10, color:TL }}&gt;{attempt.score}/{attempt.total_points}&lt;/div&gt;
            &lt;/&gt;
          )}
          {attempt.status === &quot;submitted&quot; &amp;&amp; &lt;div style={{ fontSize:11, fontWeight:600, color:&quot;#f59e0b&quot; }}&gt;⏳ {t(&quot;Pending&quot;,&quot;قيد التصحيح&quot;)}&lt;/div&gt;}
          {inProg &amp;&amp; &lt;div style={{ fontSize:11, fontWeight:600, color:&quot;#6366f1&quot; }}&gt;▶ {t(&quot;In Progress&quot;,&quot;جارٍ&quot;)}&lt;/div&gt;}
          {graded &amp;&amp; &lt;ChevronRight style={{width:14,height:14,color:TL,marginTop:2}}/&gt;}
        &lt;/div&gt;
      &lt;/div&gt;
    );
  };

  const Empty = ({ msg }: { msg: string }) =&gt; (
    &lt;div style={{ textAlign:&quot;center&quot;, padding:&quot;48px 20px&quot;, background:&quot;#fff&quot;, borderRadius:18, border:`1px dashed ${BORDER}` }}&gt;
      &lt;div style={{ fontSize:40, marginBottom:12, opacity:.4 }}&gt;📋&lt;/div&gt;
      &lt;p style={{ fontSize:14, color:TL, margin:0 }}&gt;{msg}&lt;/p&gt;
    &lt;/div&gt;
  );

  if (loading) return (
    &lt;div style={{ minHeight:&quot;100vh&quot;, display:&quot;flex&quot;, alignItems:&quot;center&quot;, justifyContent:&quot;center&quot;, background:CREAM }}&gt;
      &lt;div style={{ textAlign:&quot;center&quot; }}&gt;
        &lt;div style={{ width:44,height:44,border:`4px solid ${G}`,borderTopColor:&quot;transparent&quot;,borderRadius:&quot;50%&quot;,animation:&quot;spin .8s linear infinite&quot;,margin:&quot;0 auto 14px&quot; }}/&gt;
        &lt;p style={{ color:TL, fontSize:14 }}&gt;{t(&quot;Loading…&quot;,&quot;جارٍ التحميل…&quot;)}&lt;/p&gt;
      &lt;/div&gt;
      &lt;style&gt;{&quot;@keyframes spin{to{transform:rotate(360deg)}}&quot;}&lt;/style&gt;
    &lt;/div&gt;
  );

  return (
    &lt;div style={{ background:CREAM, minHeight:&quot;100vh&quot;, fontFamily:&quot;&#x27;Cairo&#x27;,sans-serif&quot; }}&gt;
      &lt;style&gt;{&quot;@import url(&#x27;https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&amp;family=Playfair+Display:wght@700&amp;display=swap&#x27;);&quot;}&lt;/style&gt;
      &lt;div style={{ maxWidth:680, margin:&quot;0 auto&quot;, padding:&quot;20px 16px 48px&quot; }}&gt;

        {/* Hero */}
        &lt;div style={{
          background:`linear-gradient(135deg,${G} 0%,${GM} 100%)`,
          borderRadius:22, padding:&quot;24px 22px 20px&quot;, marginBottom:20,
          boxShadow:&quot;0 8px 32px rgba(15,45,31,.25)&quot;, position:&quot;relative&quot;, overflow:&quot;hidden&quot;,
        }}&gt;
          &lt;div style={{ position:&quot;absolute&quot;,top:-40,right:-40,width:140,height:140,borderRadius:&quot;50%&quot;,background:&quot;rgba(255,255,255,.03)&quot;,pointerEvents:&quot;none&quot;}}/&gt;
          &lt;div style={{ position:&quot;relative&quot;, zIndex:1 }}&gt;
            &lt;p style={{ fontSize:11,color:&quot;rgba(255,255,255,.6)&quot;,fontWeight:700,letterSpacing:1,textTransform:&quot;uppercase&quot; as const,margin:&quot;0 0 6px&quot; }}&gt;
              {t(&quot;My Learning&quot;,&quot;تعلمي&quot;)}
            &lt;/p&gt;
            &lt;h1 style={{ fontFamily:&quot;&#x27;Playfair Display&#x27;,serif&quot;,fontSize:26,fontWeight:700,color:&quot;#fff&quot;,margin:&quot;0 0 18px&quot;,lineHeight:1.3 }}&gt;
              {t(&quot;Exams &amp; Tests&quot;,&quot;الامتحانات والتمرينات&quot;)}
            &lt;/h1&gt;
            {studentLevel &amp;&amp; (
              &lt;div style={{ marginBottom:14, display:&quot;inline-flex&quot;, alignItems:&quot;center&quot;, gap:6, padding:&quot;5px 14px&quot;, borderRadius:20, background:&quot;rgba(255,255,255,.12)&quot;, border:&quot;1px solid rgba(255,255,255,.2)&quot; }}&gt;
                &lt;span style={{ fontSize:13 }}&gt;{studentLevel === &quot;beginner&quot; ? &quot;🟢&quot; : studentLevel === &quot;intermediate&quot; ? &quot;🟡&quot; : &quot;🔵&quot;}&lt;/span&gt;
                &lt;span style={{ fontSize:11, fontWeight:700, color:&quot;rgba(255,255,255,.9)&quot;, textTransform:&quot;capitalize&quot; as const }}&gt;{studentLevel} {t(&quot;Level&quot;,&quot;المستوى&quot;)}&lt;/span&gt;
              &lt;/div&gt;
            )}
            &lt;div style={{ display:&quot;grid&quot;, gridTemplateColumns:&quot;repeat(4,1fr)&quot;, gap:8 }}&gt;
              {[
                [&lt;BookOpen style={{width:13,height:13}}/&gt;, String(assignedExams.length), t(&quot;Total&quot;,&quot;إجمالي&quot;)],
                [&lt;CheckCircle style={{width:13,height:13}}/&gt;, String(totalDone), t(&quot;Done&quot;,&quot;منجز&quot;)],
                [&lt;Trophy style={{width:13,height:13}}/&gt;, String(passedCount), t(&quot;Passed&quot;,&quot;ناجح&quot;)],
                [&lt;Star style={{width:13,height:13}}/&gt;, gradedAttempts.length ? `${avgPct}%` : &quot;—&quot;, t(&quot;Avg&quot;,&quot;معدل&quot;)],
              ].map(([icon, val, lbl], i) =&gt; (
                &lt;div key={i} style={{ textAlign:&quot;center&quot;,background:&quot;rgba(255,255,255,.1)&quot;,borderRadius:12,padding:&quot;10px 4px&quot; }}&gt;
                  &lt;div style={{ display:&quot;flex&quot;,justifyContent:&quot;center&quot;,color:&quot;rgba(255,255,255,.6)&quot;,marginBottom:3 }}&gt;{icon as React.ReactNode}&lt;/div&gt;
                  &lt;div style={{ fontSize:18,fontWeight:900,color:&quot;#fff&quot;,lineHeight:1 }}&gt;{val as string}&lt;/div&gt;
                  &lt;div style={{ fontSize:9,color:&quot;rgba(255,255,255,.5)&quot;,fontWeight:600,marginTop:2 }}&gt;{lbl as string}&lt;/div&gt;
                &lt;/div&gt;
              ))}
            &lt;/div&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        {/* Filters */}
        &lt;div style={{ marginBottom:16 }}&gt;
          &lt;div style={{ display:&quot;flex&quot;, gap:8, flexWrap:&quot;wrap&quot; as const, marginBottom:9 }}&gt;
            {([[&quot;all&quot;,t(&quot;All&quot;,&quot;الكل&quot;)],[&quot;exam&quot;,t(&quot;Exams&quot;,&quot;امتحانات&quot;)],[&quot;test&quot;,t(&quot;Tests&quot;,&quot;تمرينات&quot;)]] as [TypeFilter,string][]).map(([v,l]) =&gt; (
              &lt;Chip key={v} active={typeFilter===v} onClick={()=&gt;setTypeFilter(v)} label={l}/&gt;
            ))}
          &lt;/div&gt;
          &lt;div style={{ display:&quot;flex&quot;, gap:8, flexWrap:&quot;wrap&quot; as const }}&gt;
            {([[&quot;all&quot;,t(&quot;All Terms&quot;,&quot;كل الفصول&quot;)],[&quot;first&quot;,t(&quot;Term 1&quot;,&quot;الفصل 1&quot;)],[&quot;second&quot;,t(&quot;Term 2&quot;,&quot;الفصل 2&quot;)],[&quot;third&quot;,t(&quot;Term 3&quot;,&quot;الفصل 3&quot;)]] as [TermFilter,string][]).map(([v,l]) =&gt; (
              &lt;Chip key={v} active={termFilter===v} onClick={()=&gt;setTermFilter(v)} label={l}/&gt;
            ))}
          &lt;/div&gt;
        &lt;/div&gt;

        {/* Tab bar */}
        &lt;div style={{
          display:&quot;grid&quot;, gridTemplateColumns:&quot;1fr 1fr 1fr&quot;,
          background:&quot;#fff&quot;, borderRadius:16, padding:4, gap:4,
          border:`1px solid ${BORDER}`, marginBottom:18,
          boxShadow:&quot;0 2px 8px rgba(15,45,31,.06)&quot;,
        }}&gt;
          {([
            [&quot;available&quot;, &lt;PlayCircle style={{width:14,height:14}}/&gt;, t(&quot;Available&quot;,&quot;المتاحة&quot;), counts.available],
            [&quot;completed&quot;, &lt;CheckCircle style={{width:14,height:14}}/&gt;, t(&quot;Completed&quot;,&quot;المكتملة&quot;), counts.completed],
            [&quot;history&quot;,   &lt;History style={{width:14,height:14}}/&gt;, t(&quot;History&quot;,&quot;السجل&quot;), counts.history],
          ] as [Tab,React.ReactNode,string,number][]).map(([key,icon,label,cnt]) =&gt; (
            &lt;button key={key} onClick={() =&gt; setTab(key)} style={{
              display:&quot;flex&quot;, flexDirection:&quot;column&quot; as const, alignItems:&quot;center&quot;,
              padding:&quot;10px 6px&quot;, borderRadius:12, border:&quot;none&quot;, cursor:&quot;pointer&quot;, transition:&quot;all .2s&quot;,
              background: tab===key ? G : &quot;transparent&quot;,
              color: tab===key ? &quot;#fff&quot; : TL,
            }}&gt;
              &lt;div style={{ display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:5,marginBottom:2 }}&gt;
                {icon}
                {cnt &gt; 0 &amp;&amp; (
                  &lt;span style={{
                    fontSize:10, fontWeight:900, padding:&quot;1px 6px&quot;, borderRadius:8,
                    background: tab===key ? &quot;rgba(255,255,255,.25)&quot; : `${G}18`,
                    color: tab===key ? &quot;#fff&quot; : G,
                  }}&gt;{cnt}&lt;/span&gt;
                )}
              &lt;/div&gt;
              &lt;span style={{ fontSize:11, fontWeight:700 }}&gt;{label}&lt;/span&gt;
            &lt;/button&gt;
          ))}
        &lt;/div&gt;

        {/* Content */}
        {tab === &quot;available&quot; &amp;&amp; (
          available.length === 0
            ? &lt;Empty msg={t(&quot;No available exams at the moment.&quot;,&quot;لا توجد امتحانات متاحة الآن.&quot;)}/&gt;
            : available.map(e =&gt; &lt;ExamCard key={e.id} exam={e}/&gt;)
        )}
        {tab === &quot;completed&quot; &amp;&amp; (
          completed.length === 0
            ? &lt;Empty msg={t(&quot;No completed exams yet.&quot;,&quot;لا توجد امتحانات مكتملة بعد.&quot;)}/&gt;
            : completed.map(e =&gt; &lt;ExamCard key={e.id} exam={e}/&gt;)
        )}
        {tab === &quot;history&quot; &amp;&amp; (
          pastAttempts.length === 0
            ? &lt;Empty msg={t(&quot;No exam history yet.&quot;,&quot;لا يوجد سجل امتحانات بعد.&quot;)}/&gt;
            : pastAttempts.map(a =&gt; &lt;HistoryRow key={a.id} attempt={a}/&gt;)
        )}

      &lt;/div&gt;
    &lt;/div&gt;
  );
};

export default StudentExams;
</pre>
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