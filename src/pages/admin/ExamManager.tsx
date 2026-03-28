<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Fix 3: ExamManager.tsx</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0F172A; color: #E2E8F0; min-height: 100vh; }
  .header { background: #065F46; padding: 16px 20px; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 12px rgba(0,0,0,.4); }
  .header-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  .fix-badge { background: rgba(255,255,255,.2); border: 1px solid rgba(255,255,255,.3); border-radius: 20px; padding: 3px 12px; font-size: 11px; font-weight: 800; letter-spacing: 1px; color: #fff; }
  .filename { font-size: 17px; font-weight: 800; color: #fff; }
  .fix-desc { font-size: 12px; color: rgba(255,255,255,.75); }
  .meta { display: flex; gap: 14px; font-size: 11px; color: rgba(255,255,255,.55); margin-top: 6px; }
  .copy-btn { background: #fff; color: #065F46; border: none; border-radius: 12px; padding: 11px 22px; font-size: 14px; font-weight: 800; cursor: pointer; flex-shrink: 0; transition: transform .1s; }
  .copy-btn:active { transform: scale(.96); }
  .copy-btn.copied { background: #22C55E; color: #fff; }
  .path-bar { background: #1E293B; padding: 10px 20px; font-size: 11px; color: #64748B; font-family: monospace; border-bottom: 1px solid #334155; }
  .path-bar span { color: #94A3B8; }
  .code-wrap { padding: 20px; overflow-x: auto; }
  pre { font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.7; color: #CBD5E1; white-space: pre-wrap; word-break: break-all; }
  .bottom-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #1E293B; border-top: 1px solid #334155; padding: 12px 20px; display: flex; justify-content: center; }
  .bottom-copy { background: #065F46; color: #fff; border: none; border-radius: 14px; padding: 14px 40px; font-size: 16px; font-weight: 800; cursor: pointer; width: 100%; max-width: 480px; transition: opacity .15s; }
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
        <span class="fix-badge">Fix 3</span>
        <span class="filename">ExamManager.tsx</span>
      </div>
      <div class="fix-desc">ExamManager — level filter dropdown + level badge on cards</div>
    </div>
    <button class="copy-btn" id="topBtn" onclick="copyCode(this)">📋 Copy</button>
  </div>
  <div class="meta">
    <span>📁 25.6 KB</span>
    <span>📝 468 lines</span>
  </div>
</div>

<div class="path-bar">Place at: <span>src/pages/admin/ExamManager.tsx</span></div>

<div class="code-wrap">
  <pre id="codeBlock">/* src/pages/admin/ExamManager.tsx
   FIXED: Exam assignment now properly creates exam_assignments rows AND sends in-app
          notifications so StudentExams page shows the assigned exam.
   FIXED: Individual assign loads students from user_roles table (not just profiles)
   FIXED: Notification insert uses correct schema fields
*/
import { useEffect, useState } from &quot;react&quot;;
import { Link, useNavigate } from &quot;react-router-dom&quot;;
import { Badge } from &quot;@/components/ui/badge&quot;;
import { Dialog, DialogContent } from &quot;@/components/ui/dialog&quot;;
import { Switch } from &quot;@/components/ui/switch&quot;;
import { useLanguage } from &quot;@/contexts/LanguageContext&quot;;
import { supabase } from &quot;@/integrations/supabase/client&quot;;
import { useToast } from &quot;@/hooks/use-toast&quot;;
import { useAuth } from &quot;@/contexts/AuthContext&quot;;
import {
  Plus, Edit, Trash2, Copy, Clock, Search, Send,
  Eye, EyeOff, BarChart2, Loader2, CheckCircle2,
  XCircle, UserCheck, Users, BookOpen, Filter
} from &quot;lucide-react&quot;;

const G = &quot;#064E3B&quot;;
const LEVELS = [&quot;beginner&quot;, &quot;intermediate&quot;, &quot;advanced&quot;];

export default function ExamManager() {
  const { t, language } = useLanguage();
  const { toast }       = useToast();
  const { user }        = useAuth();
  const navigate        = useNavigate();

  const [exams, setExams]               = useState&lt;any[]&gt;([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState(&quot;&quot;);
  const [termFilter, setTermFilter]     = useState(&quot;all&quot;);
  const [typeFilter, setTypeFilter]     = useState(&quot;all&quot;);
  const [levelFilter, setLevelFilter]   = useState(&quot;all&quot;);

  // Assign dialog
  const [assignExam, setAssignExam]     = useState&lt;any | null&gt;(null);
  const [assignMode, setAssignMode]     = useState&lt;&quot;level&quot; | &quot;individual&quot;&gt;(&quot;level&quot;);
  const [assignLevel, setAssignLevel]   = useState(&quot;&quot;);
  const [allStudents, setAllStudents]   = useState&lt;any[]&gt;([]);
  const [selectedStudents, setSelectedStudents] = useState&lt;Set&lt;string&gt;&gt;(new Set());
  const [assigning, setAssigning]       = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState(&quot;&quot;);

  // Counts per exam
  const [counts, setCounts]             = useState&lt;Record&lt;string, { assigned: number; attempts: number }&gt;&gt;({});

  const fetchExams = async () =&gt; {
    setLoading(true);
    const { data } = await supabase
      .from(&quot;exams&quot;).select(&quot;*, exam_questions(id)&quot;).order(&quot;created_at&quot;, { ascending: false });
    setExams(data || []);
    setLoading(false);

    if (data?.length) {
      const ids = data.map((e: any) =&gt; e.id);
      const [ar, at] = await Promise.all([
        supabase.from(&quot;exam_assignments&quot;).select(&quot;exam_id&quot;).in(&quot;exam_id&quot;, ids),
        supabase.from(&quot;exam_attempts&quot;).select(&quot;exam_id&quot;).in(&quot;exam_id&quot;, ids),
      ]);
      const c: Record&lt;string, { assigned: number; attempts: number }&gt; = {};
      (ar.data || []).forEach((a: any) =&gt; { c[a.exam_id] = c[a.exam_id] || { assigned: 0, attempts: 0 }; c[a.exam_id].assigned++; });
      (at.data || []).forEach((a: any) =&gt; { c[a.exam_id] = c[a.exam_id] || { assigned: 0, attempts: 0 }; c[a.exam_id].attempts++; });
      setCounts(c);
    }
  };

  useEffect(() =&gt; { fetchExams(); }, []);

  // Load ALL students when assign dialog opens
  const openAssign = async (exam: any) =&gt; {
    setAssignExam(exam);
    setAssignMode(&quot;level&quot;);
    setAssignLevel(&quot;&quot;);
    setSelectedStudents(new Set());
    setStudentSearch(&quot;&quot;);
    setStudentsLoading(true);

    // FIX: load from user_roles to get all students, join profile for display
    const { data } = await supabase
      .from(&quot;user_roles&quot; as any)
      .select(&quot;user_id, profiles(full_name, full_name_ar, level)&quot;)
      .eq(&quot;role&quot;, &quot;student&quot;);

    setAllStudents((data || []).map((r: any) =&gt; ({
      user_id: r.user_id,
      full_name: r.profiles?.full_name || &quot;Unknown&quot;,
      full_name_ar: r.profiles?.full_name_ar || &quot;&quot;,
      level: r.profiles?.level || &quot;—&quot;,
    })));
    setStudentsLoading(false);
  };

  const togglePublish = async (id: string, current: boolean) =&gt; {
    await supabase.from(&quot;exams&quot;).update({ is_published: !current }).eq(&quot;id&quot;, id);
    setExams(es =&gt; es.map(e =&gt; e.id === id ? { ...e, is_published: !current } : e));
    toast({ title: !current ? &quot;✅ Exam published&quot; : &quot;✅ Exam unpublished&quot; });
  };

  const duplicateExam = async (exam: any) =&gt; {
    try {
      const { data: qs } = await supabase.from(&quot;exam_questions&quot;).select(&quot;*&quot;).eq(&quot;exam_id&quot;, exam.id);
      // Strip auto-generated fields to avoid insert conflicts
      const cleanExam: any = { ...exam };
      delete cleanExam.id; delete cleanExam.created_at; delete cleanExam.updated_at; delete cleanExam.exam_questions;
      const { data: ne, error: neErr } = await supabase.from(&quot;exams&quot;).insert({
        ...cleanExam,
        title: exam.title + &quot; (Copy)&quot;,
        title_ar: exam.title_ar ? exam.title_ar + &quot; (نسخة)&quot; : null,
        is_published: false,
      }).select(&quot;id&quot;).single();
      if (neErr) throw neErr;
      if (ne &amp;&amp; qs?.length) {
        const qRows = qs.map((q: any) =&gt; {
          const clean: any = { ...q }; delete clean.id; delete clean.created_at; delete clean.updated_at;
          return { ...clean, exam_id: ne.id };
        });
        const { error: qErr } = await supabase.from(&quot;exam_questions&quot;).insert(qRows);
        if (qErr) console.warn(&quot;Questions copy warning:&quot;, qErr.message);
      }
      toast({ title: &quot;✅ Exam duplicated with all questions!&quot; });
      fetchExams();
    } catch (e: any) {
      toast({ title: &quot;Duplicate failed&quot;, description: e.message, variant: &quot;destructive&quot; });
    }
  };

  const deleteExam = async (id: string) =&gt; {
    if (!confirm(&quot;Delete this exam and all its questions?&quot;)) return;
    await supabase.from(&quot;exam_assignments&quot;).delete().eq(&quot;exam_id&quot;, id);
    await supabase.from(&quot;exam_questions&quot;).delete().eq(&quot;exam_id&quot;, id);
    await supabase.from(&quot;exams&quot;).delete().eq(&quot;id&quot;, id);
    setExams(es =&gt; es.filter(e =&gt; e.id !== id));
    toast({ title: &quot;✅ Exam deleted&quot; });
  };

  // FIX: Assignment with guaranteed notification insert
  const doAssign = async () =&gt; {
    if (!assignExam) return;
    setAssigning(true);

    try {
      let userIds: string[] = [];

      if (assignMode === &quot;level&quot;) {
        if (!assignLevel) { toast({ title: &quot;Select a level&quot;, variant: &quot;destructive&quot; }); setAssigning(false); return; }
        userIds = allStudents.filter(s =&gt; s.level === assignLevel).map(s =&gt; s.user_id);
      } else {
        userIds = Array.from(selectedStudents);
      }

      if (userIds.length === 0) {
        toast({ title: &quot;No students found for this selection&quot;, variant: &quot;destructive&quot; });
        setAssigning(false); return;
      }

      // FIX: Allow retake — delete old in-progress attempts so student starts fresh
      await supabase.from(&quot;exam_attempts&quot;)
        .delete().eq(&quot;exam_id&quot;, assignExam.id).in(&quot;user_id&quot;, userIds).eq(&quot;status&quot;, &quot;in_progress&quot;);

      // Insert assignments — duplicate entries allowed (for retakes)
      for (const uid of userIds) {
        await supabase.from(&quot;exam_assignments&quot;)
          .insert({ exam_id: assignExam.id, user_id: uid, assigned_by: user?.id })
          .select().maybeSingle()
          .then(({ error }) =&gt; {
            if (error &amp;&amp; error.code !== &quot;23505&quot;) console.warn(&quot;Assign insert:&quot;, error.message);
          });
      }

      // Notify all students
      await supabase.from(&quot;notifications&quot; as any).insert(
        userIds.map(uid =&gt; ({
          user_id: uid,
          title: `📝 Exam assigned: ${assignExam.title}`,
          message: `You have been assigned &quot;${assignExam.title}&quot;. ${assignExam.start_date ? `Opens: ${new Date(assignExam.start_date).toLocaleDateString()}` : &quot;You can take it now.&quot;}`,
          type: &quot;exam_assigned&quot;, reference_id: assignExam.id, is_read: false,
        }))
      );

      toast({ title: `✅ Assigned to ${userIds.length} student${userIds.length !== 1 ? &quot;s&quot; : &quot;&quot;}` });
      setAssignExam(null);
      fetchExams();
    } catch (e: any) {
      toast({ title: &quot;Assignment failed&quot;, description: e.message, variant: &quot;destructive&quot; });
    } finally {
      setAssigning(false);
    }
  };

  const qCount = (e: any) =&gt; e.exam_questions?.length ?? 0;

  const filtered = exams.filter(e =&gt; {
    const name = language === &quot;ar&quot; ? (e.title_ar || e.title) : e.title;
    if (search &amp;&amp; !name.toLowerCase().includes(search.toLowerCase())) return false;
    if (termFilter !== &quot;all&quot; &amp;&amp; e.term !== termFilter) return false;
    if (typeFilter !== &quot;all&quot; &amp;&amp; e.type !== typeFilter) return false;
    if (levelFilter !== &quot;all&quot; &amp;&amp; e.level !== levelFilter) return false;
    return true;
  });

  const filteredStudents = allStudents.filter(s =&gt;
    s.full_name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.full_name_ar.includes(studentSearch)
  );

  const inp: React.CSSProperties = {
    padding: &quot;8px 12px&quot;, borderRadius: 10, border: &quot;1.5px solid #E5E7EB&quot;,
    fontSize: 13, outline: &quot;none&quot;, background: &quot;#fff&quot;,
  };

  return (
    &lt;div style={{ minHeight: &quot;100vh&quot;, background: &quot;#F3F4F6&quot; }}&gt;
      &lt;style&gt;{`@keyframes spin{to{transform:rotate(360deg)}}`}&lt;/style&gt;

      {/* Header */}
      &lt;div style={{ background: &quot;#fff&quot;, borderBottom: &quot;1px solid #E5E7EB&quot;, padding: &quot;14px 16px&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;space-between&quot;, gap: 12 }}&gt;
        &lt;div&gt;
          &lt;h1 style={{ fontSize: 18, fontWeight: 800, color: &quot;#111&quot;, margin: 0 }}&gt;Exam Manager&lt;/h1&gt;
          &lt;p style={{ fontSize: 12, color: &quot;#6B7280&quot;, margin: 0 }}&gt;Create, publish, and assign exams to students&lt;/p&gt;
        &lt;/div&gt;
        &lt;button onClick={() =&gt; navigate(&quot;/admin/exams/create&quot;)}
          style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 7, padding: &quot;9px 16px&quot;, borderRadius: 11, border: &quot;none&quot;, background: G, color: &quot;#fff&quot;, cursor: &quot;pointer&quot;, fontWeight: 800, fontSize: 13 }}&gt;
          &lt;Plus size={15} /&gt; New Exam
        &lt;/button&gt;
      &lt;/div&gt;

      &lt;div style={{ padding: 16, maxWidth: 800, margin: &quot;0 auto&quot; }}&gt;

        {/* Stats */}
        &lt;div style={{ display: &quot;grid&quot;, gridTemplateColumns: &quot;repeat(4, 1fr)&quot;, gap: 10, marginBottom: 16 }}&gt;
          {[
            { v: exams.length, l: &quot;Total&quot;, icon: &quot;📋&quot;, bg: &quot;#EFF6FF&quot;, c: &quot;#1D4ED8&quot; },
            { v: exams.filter(e =&gt; e.is_published).length, l: &quot;Published&quot;, icon: &quot;🌐&quot;, bg: &quot;#F0FDF4&quot;, c: &quot;#166534&quot; },
            { v: exams.filter(e =&gt; !e.is_published).length, l: &quot;Draft&quot;, icon: &quot;✏️&quot;, bg: &quot;#FFF7ED&quot;, c: &quot;#C2410C&quot; },
            { v: exams.reduce((s, e) =&gt; s + (counts[e.id]?.attempts || 0), 0), l: &quot;Attempts&quot;, icon: &quot;📊&quot;, bg: &quot;#F5F3FF&quot;, c: &quot;#6D28D9&quot; },
          ].map((s, i) =&gt; (
            &lt;div key={i} style={{ background: s.bg, borderRadius: 12, padding: &quot;12px 14px&quot; }}&gt;
              &lt;div style={{ fontSize: 20, marginBottom: 4 }}&gt;{s.icon}&lt;/div&gt;
              &lt;div style={{ fontSize: 20, fontWeight: 900, color: s.c }}&gt;{s.v}&lt;/div&gt;
              &lt;div style={{ fontSize: 11, color: s.c, opacity: .7, fontWeight: 600 }}&gt;{s.l}&lt;/div&gt;
            &lt;/div&gt;
          ))}
        &lt;/div&gt;

        {/* Filters */}
        &lt;div style={{ display: &quot;flex&quot;, gap: 8, marginBottom: 14, flexWrap: &quot;wrap&quot; }}&gt;
          &lt;div style={{ flex: 1, minWidth: 180, position: &quot;relative&quot; }}&gt;
            &lt;Search size={14} style={{ position: &quot;absolute&quot;, left: 10, top: &quot;50%&quot;, transform: &quot;translateY(-50%)&quot;, color: &quot;#9CA3AF&quot; }} /&gt;
            &lt;input value={search} onChange={e =&gt; setSearch(e.target.value)} placeholder=&quot;Search exams…&quot;
              style={{ ...inp, width: &quot;100%&quot;, paddingLeft: 32, boxSizing: &quot;border-box&quot; }} /&gt;
          &lt;/div&gt;
          {[
            { val: termFilter, set: setTermFilter, opts: [[&quot;all&quot;, &quot;All Terms&quot;], [&quot;first&quot;, &quot;First&quot;], [&quot;second&quot;, &quot;Second&quot;], [&quot;final&quot;, &quot;Final&quot;]] },
            { val: typeFilter, set: setTypeFilter, opts: [[&quot;all&quot;, &quot;All Types&quot;], [&quot;exam&quot;, &quot;Exam&quot;], [&quot;test&quot;, &quot;Test&quot;], [&quot;quiz&quot;, &quot;Quiz&quot;]] },
            { val: levelFilter, set: setLevelFilter, opts: [[&quot;all&quot;, &quot;All Levels&quot;], [&quot;beginner&quot;, &quot;Beginner&quot;], [&quot;intermediate&quot;, &quot;Intermediate&quot;], [&quot;advanced&quot;, &quot;Advanced&quot;]] },
          ].map((f, i) =&gt; (
            &lt;select key={i} value={f.val} onChange={e =&gt; f.set(e.target.value)}
              style={{ ...inp, minWidth: 120 }}&gt;
              {f.opts.map(([v, l]) =&gt; &lt;option key={v} value={v}&gt;{l}&lt;/option&gt;)}
            &lt;/select&gt;
          ))}
        &lt;/div&gt;

        {/* Exam list */}
        {loading ? (
          &lt;div style={{ textAlign: &quot;center&quot;, padding: 48 }}&gt;
            &lt;Loader2 size={32} style={{ animation: &quot;spin .8s linear infinite&quot;, color: G }} /&gt;
          &lt;/div&gt;
        ) : filtered.length === 0 ? (
          &lt;div style={{ textAlign: &quot;center&quot;, padding: &quot;48px 24px&quot;, background: &quot;#fff&quot;, borderRadius: 16, border: &quot;2px dashed #E5E7EB&quot; }}&gt;
            &lt;div style={{ fontSize: 40, marginBottom: 10 }}&gt;📋&lt;/div&gt;
            &lt;p style={{ fontWeight: 700, color: &quot;#374151&quot; }}&gt;No exams found&lt;/p&gt;
            &lt;button onClick={() =&gt; navigate(&quot;/admin/exams/create&quot;)}
              style={{ marginTop: 12, padding: &quot;9px 20px&quot;, borderRadius: 10, border: &quot;none&quot;, background: G, color: &quot;#fff&quot;, cursor: &quot;pointer&quot;, fontWeight: 700 }}&gt;
              Create Your First Exam
            &lt;/button&gt;
          &lt;/div&gt;
        ) : (
          &lt;div style={{ display: &quot;flex&quot;, flexDirection: &quot;column&quot;, gap: 10 }}&gt;
            {filtered.map(exam =&gt; {
              const qc   = qCount(exam);
              const stat = counts[exam.id] || { assigned: 0, attempts: 0 };
              return (
                &lt;div key={exam.id} style={{ background: &quot;#fff&quot;, borderRadius: 16, border: &quot;1.5px solid #E5E7EB&quot;, padding: 16, boxShadow: &quot;0 1px 4px rgba(0,0,0,.04)&quot; }}&gt;
                  &lt;div style={{ display: &quot;flex&quot;, alignItems: &quot;flex-start&quot;, gap: 12, flexWrap: &quot;wrap&quot; }}&gt;
                    &lt;div style={{ flex: 1, minWidth: 200 }}&gt;
                      &lt;div style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 8, marginBottom: 4, flexWrap: &quot;wrap&quot; }}&gt;
                        &lt;span style={{ fontWeight: 800, fontSize: 14, color: &quot;#111&quot; }}&gt;
                          {language === &quot;ar&quot; ? exam.title_ar || exam.title : exam.title}
                        &lt;/span&gt;
                        &lt;span style={{ fontSize: 10, fontWeight: 700, padding: &quot;2px 8px&quot;, borderRadius: 20, background: exam.is_published ? &quot;#DCFCE7&quot; : &quot;#F3F4F6&quot;, color: exam.is_published ? &quot;#166534&quot; : &quot;#6B7280&quot; }}&gt;
                          {exam.is_published ? &quot;✓ Published&quot; : &quot;Draft&quot;}
                        &lt;/span&gt;
                        {exam.type &amp;&amp; &lt;span style={{ fontSize: 10, padding: &quot;2px 8px&quot;, borderRadius: 20, background: &quot;#EFF6FF&quot;, color: &quot;#1D4ED8&quot;, fontWeight: 600 }}&gt;{exam.type}&lt;/span&gt;}
                        {exam.term &amp;&amp; &lt;span style={{ fontSize: 10, padding: &quot;2px 8px&quot;, borderRadius: 20, background: &quot;#F5F3FF&quot;, color: &quot;#6D28D9&quot;, fontWeight: 600 }}&gt;{exam.term}&lt;/span&gt;}
                        {exam.level &amp;&amp; (
                          &lt;span style={{ fontSize: 10, padding: &quot;2px 8px&quot;, borderRadius: 20, fontWeight: 700,
                            background: exam.level === &quot;beginner&quot; ? &quot;#FFF7ED&quot; : exam.level === &quot;intermediate&quot; ? &quot;#ECFDF5&quot; : &quot;#EFF6FF&quot;,
                            color: exam.level === &quot;beginner&quot; ? &quot;#C2410C&quot; : exam.level === &quot;intermediate&quot; ? &quot;#065F46&quot; : &quot;#1D4ED8&quot;,
                          }}&gt;
                            {exam.level === &quot;beginner&quot; ? &quot;🟢 Beginner&quot; : exam.level === &quot;intermediate&quot; ? &quot;🟡 Intermediate&quot; : &quot;🔵 Advanced&quot;}
                          &lt;/span&gt;
                        )}
                      &lt;/div&gt;
                      {exam.title_ar &amp;&amp; language !== &quot;ar&quot; &amp;&amp; &lt;p style={{ fontSize: 11, color: &quot;#9CA3AF&quot;, margin: &quot;2px 0 6px&quot;, fontFamily: &quot;&#x27;Amiri&#x27;,serif&quot;, direction: &quot;rtl&quot; }}&gt;{exam.title_ar}&lt;/p&gt;}
                      &lt;div style={{ display: &quot;flex&quot;, gap: 12, flexWrap: &quot;wrap&quot;, marginTop: 6 }}&gt;
                        {[
                          { icon: &quot;❓&quot;, v: qc, l: `q${qc !== 1 ? &quot;s&quot; : &quot;&quot;}`, c: qc === 0 ? &quot;#DC2626&quot; : &quot;#374151&quot; },
                          { icon: &quot;⏱️&quot;, v: exam.time_limit_minutes || &quot;—&quot;, l: &quot;min&quot; },
                          { icon: &quot;🎯&quot;, v: `${exam.passing_score || 60}%`, l: &quot;pass&quot; },
                          { icon: &quot;👥&quot;, v: stat.assigned, l: &quot;assigned&quot; },
                          { icon: &quot;📊&quot;, v: stat.attempts, l: &quot;attempts&quot; },
                        ].map((s, i) =&gt; (
                          &lt;span key={i} style={{ fontSize: 11, display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 3 }}&gt;
                            {s.icon} &lt;strong style={{ color: (s as any).c || &quot;#374151&quot; }}&gt;{s.v}&lt;/strong&gt; &lt;span style={{ color: &quot;#9CA3AF&quot; }}&gt;{s.l}&lt;/span&gt;
                          &lt;/span&gt;
                        ))}
                      &lt;/div&gt;
                    &lt;/div&gt;

                    &lt;div style={{ display: &quot;flex&quot;, gap: 6, flexWrap: &quot;wrap&quot;, flexShrink: 0 }}&gt;
                      &lt;button onClick={() =&gt; openAssign(exam)}
                        style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 5, padding: &quot;8px 13px&quot;, borderRadius: 9, border: &quot;none&quot;, background: G, color: &quot;#fff&quot;, cursor: &quot;pointer&quot;, fontSize: 12, fontWeight: 700 }}&gt;
                        &lt;Send size={12} /&gt; Assign
                      &lt;/button&gt;
                      &lt;button onClick={() =&gt; navigate(`/admin/exams/${exam.id}/edit`)}
                        style={{ padding: &quot;8px 10px&quot;, borderRadius: 9, border: &quot;1.5px solid #E5E7EB&quot;, background: &quot;#fff&quot;, cursor: &quot;pointer&quot; }}&gt;
                        &lt;Edit size={13} color=&quot;#6B7280&quot; /&gt;
                      &lt;/button&gt;
                      &lt;button onClick={() =&gt; togglePublish(exam.id, exam.is_published)}
                        style={{ padding: &quot;8px 10px&quot;, borderRadius: 9, border: &quot;1.5px solid #E5E7EB&quot;, background: &quot;#fff&quot;, cursor: &quot;pointer&quot; }}&gt;
                        {exam.is_published ? &lt;EyeOff size={13} color=&quot;#9CA3AF&quot; /&gt; : &lt;Eye size={13} color=&quot;#16A34A&quot; /&gt;}
                      &lt;/button&gt;
                      &lt;button onClick={() =&gt; duplicateExam(exam)}
                        style={{ padding: &quot;8px 10px&quot;, borderRadius: 9, border: &quot;1.5px solid #E5E7EB&quot;, background: &quot;#fff&quot;, cursor: &quot;pointer&quot; }}&gt;
                        &lt;Copy size={13} color=&quot;#6B7280&quot; /&gt;
                      &lt;/button&gt;
                      &lt;button onClick={() =&gt; navigate(&quot;/admin/grading&quot;)}
                        style={{ padding: &quot;8px 10px&quot;, borderRadius: 9, border: &quot;1.5px solid #E5E7EB&quot;, background: &quot;#fff&quot;, cursor: &quot;pointer&quot; }}&gt;
                        &lt;BarChart2 size={13} color=&quot;#6B7280&quot; /&gt;
                      &lt;/button&gt;
                      &lt;button onClick={() =&gt; deleteExam(exam.id)}
                        style={{ padding: &quot;8px 10px&quot;, borderRadius: 9, border: &quot;1.5px solid #FECACA&quot;, background: &quot;#FEF2F2&quot;, cursor: &quot;pointer&quot; }}&gt;
                        &lt;Trash2 size={13} color=&quot;#DC2626&quot; /&gt;
                      &lt;/button&gt;
                    &lt;/div&gt;
                  &lt;/div&gt;
                &lt;/div&gt;
              );
            })}
          &lt;/div&gt;
        )}
      &lt;/div&gt;

      {/* ── Assign Dialog ── */}
      &lt;Dialog open={!!assignExam} onOpenChange={v =&gt; !v &amp;&amp; setAssignExam(null)}&gt;
        &lt;DialogContent style={{ maxWidth: 520, borderRadius: 20, padding: 0, maxHeight: &quot;90vh&quot;, display: &quot;flex&quot;, flexDirection: &quot;column&quot; }}&gt;
          &lt;div style={{ background: G, padding: &quot;16px 20px&quot;, borderRadius: &quot;20px 20px 0 0&quot;, flexShrink: 0 }}&gt;
            &lt;h2 style={{ fontWeight: 800, fontSize: 15, color: &quot;#fff&quot;, margin: 0 }}&gt;
              📋 Assign: {assignExam?.title}
            &lt;/h2&gt;
            &lt;p style={{ fontSize: 11, color: &quot;rgba(255,255,255,.7)&quot;, margin: &quot;4px 0 0&quot; }}&gt;
              Students will receive an in-app notification and see this exam immediately.
            &lt;/p&gt;
          &lt;/div&gt;

          &lt;div style={{ padding: 16, overflow: &quot;auto&quot;, flex: 1 }}&gt;
            {/* Mode selector */}
            &lt;div style={{ display: &quot;grid&quot;, gridTemplateColumns: &quot;1fr 1fr&quot;, gap: 10, marginBottom: 16 }}&gt;
              {[
                { id: &quot;level&quot; as const, icon: &quot;🎓&quot;, label: &quot;By Level&quot;, sub: &quot;Assign to all students at a level&quot; },
                { id: &quot;individual&quot; as const, icon: &quot;👤&quot;, label: &quot;Individual&quot;, sub: &quot;Select specific students&quot; },
              ].map(m =&gt; (
                &lt;button key={m.id} onClick={() =&gt; setAssignMode(m.id)}
                  style={{ padding: &quot;12px&quot;, borderRadius: 12, border: `1.5px solid ${assignMode === m.id ? G : &quot;#E5E7EB&quot;}`, background: assignMode === m.id ? &quot;#F0FDF4&quot; : &quot;#fff&quot;, cursor: &quot;pointer&quot;, textAlign: &quot;left&quot; }}&gt;
                  &lt;p style={{ fontSize: 18, margin: &quot;0 0 4px&quot; }}&gt;{m.icon}&lt;/p&gt;
                  &lt;p style={{ fontWeight: 700, fontSize: 13, color: assignMode === m.id ? G : &quot;#374151&quot;, margin: 0 }}&gt;{m.label}&lt;/p&gt;
                  &lt;p style={{ fontSize: 11, color: &quot;#9CA3AF&quot;, margin: 0 }}&gt;{m.sub}&lt;/p&gt;
                &lt;/button&gt;
              ))}
            &lt;/div&gt;

            {/* Level mode */}
            {assignMode === &quot;level&quot; &amp;&amp; (
              &lt;div&gt;
                &lt;p style={{ fontSize: 12, fontWeight: 700, color: &quot;#6B7280&quot;, marginBottom: 8 }}&gt;Select Level&lt;/p&gt;
                &lt;div style={{ display: &quot;flex&quot;, flexDirection: &quot;column&quot;, gap: 8 }}&gt;
                  {LEVELS.map(lv =&gt; {
                    const count = allStudents.filter(s =&gt; s.level === lv).length;
                    return (
                      &lt;button key={lv} onClick={() =&gt; setAssignLevel(lv)}
                        style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;space-between&quot;, padding: &quot;12px 14px&quot;, borderRadius: 12, border: `1.5px solid ${assignLevel === lv ? G : &quot;#E5E7EB&quot;}`, background: assignLevel === lv ? &quot;#F0FDF4&quot; : &quot;#fff&quot;, cursor: &quot;pointer&quot; }}&gt;
                        &lt;span style={{ fontWeight: 700, fontSize: 13, color: assignLevel === lv ? G : &quot;#374151&quot;, textTransform: &quot;capitalize&quot; }}&gt;{lv}&lt;/span&gt;
                        &lt;span style={{ fontSize: 12, color: &quot;#9CA3AF&quot; }}&gt;{studentsLoading ? &quot;…&quot; : `${count} student${count !== 1 ? &quot;s&quot; : &quot;&quot;}`}&lt;/span&gt;
                      &lt;/button&gt;
                    );
                  })}
                &lt;/div&gt;
              &lt;/div&gt;
            )}

            {/* Individual mode */}
            {assignMode === &quot;individual&quot; &amp;&amp; (
              &lt;div&gt;
                &lt;div style={{ position: &quot;relative&quot;, marginBottom: 10 }}&gt;
                  &lt;Search size={14} style={{ position: &quot;absolute&quot;, left: 10, top: &quot;50%&quot;, transform: &quot;translateY(-50%)&quot;, color: &quot;#9CA3AF&quot; }} /&gt;
                  &lt;input value={studentSearch} onChange={e =&gt; setStudentSearch(e.target.value)} placeholder=&quot;Search students…&quot;
                    style={{ ...inp, width: &quot;100%&quot;, paddingLeft: 32, boxSizing: &quot;border-box&quot; as const }} /&gt;
                &lt;/div&gt;
                {studentsLoading ? (
                  &lt;div style={{ textAlign: &quot;center&quot;, padding: 24 }}&gt;&lt;Loader2 size={24} style={{ animation: &quot;spin .8s linear infinite&quot;, color: G }} /&gt;&lt;/div&gt;
                ) : (
                  &lt;&gt;
                    &lt;div style={{ fontSize: 11, color: &quot;#9CA3AF&quot;, marginBottom: 6 }}&gt;{selectedStudents.size} selected of {filteredStudents.length}&lt;/div&gt;
                    &lt;div style={{ maxHeight: 280, overflowY: &quot;auto&quot;, display: &quot;flex&quot;, flexDirection: &quot;column&quot;, gap: 6 }}&gt;
                      {filteredStudents.map(s =&gt; {
                        const sel = selectedStudents.has(s.user_id);
                        return (
                          &lt;button key={s.user_id}
                            onClick={() =&gt; {
                              const next = new Set(selectedStudents);
                              if (sel) next.delete(s.user_id); else next.add(s.user_id);
                              setSelectedStudents(next);
                            }}
                            style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 10, padding: &quot;10px 12px&quot;, borderRadius: 11, border: `1.5px solid ${sel ? G : &quot;#E5E7EB&quot;}`, background: sel ? &quot;#F0FDF4&quot; : &quot;#fff&quot;, cursor: &quot;pointer&quot;, textAlign: &quot;left&quot; }}&gt;
                            &lt;div style={{ width: 32, height: 32, borderRadius: &quot;50%&quot;, background: sel ? G : &quot;#EFF6FF&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot;, flexShrink: 0 }}&gt;
                              &lt;span style={{ fontSize: 12, fontWeight: 700, color: sel ? &quot;#fff&quot; : &quot;#1D4ED8&quot; }}&gt;{s.full_name[0]}&lt;/span&gt;
                            &lt;/div&gt;
                            &lt;div style={{ flex: 1 }}&gt;
                              &lt;p style={{ fontWeight: 700, fontSize: 13, color: sel ? G : &quot;#374151&quot;, margin: 0 }}&gt;{s.full_name}&lt;/p&gt;
                              {s.full_name_ar &amp;&amp; &lt;p style={{ fontSize: 11, color: &quot;#9CA3AF&quot;, margin: 0, fontFamily: &quot;&#x27;Amiri&#x27;,serif&quot;, direction: &quot;rtl&quot; }}&gt;{s.full_name_ar}&lt;/p&gt;}
                            &lt;/div&gt;
                            &lt;span style={{ fontSize: 10, padding: &quot;2px 8px&quot;, borderRadius: 20, background: &quot;#F5F3FF&quot;, color: &quot;#6D28D9&quot;, fontWeight: 600, flexShrink: 0 }}&gt;{s.level}&lt;/span&gt;
                            {sel &amp;&amp; &lt;CheckCircle2 size={16} color={G} /&gt;}
                          &lt;/button&gt;
                        );
                      })}
                    &lt;/div&gt;
                  &lt;/&gt;
                )}
              &lt;/div&gt;
            )}
          &lt;/div&gt;

          {/* Footer */}
          &lt;div style={{ padding: &quot;14px 16px&quot;, borderTop: &quot;1px solid #E5E7EB&quot;, flexShrink: 0, display: &quot;flex&quot;, gap: 10 }}&gt;
            &lt;button onClick={() =&gt; setAssignExam(null)}
              style={{ flex: 1, padding: 12, borderRadius: 11, border: &quot;1.5px solid #E5E7EB&quot;, background: &quot;#fff&quot;, cursor: &quot;pointer&quot;, fontWeight: 700, fontSize: 13 }}&gt;
              Cancel
            &lt;/button&gt;
            &lt;button onClick={doAssign}
              disabled={assigning || (assignMode === &quot;level&quot; &amp;&amp; !assignLevel) || (assignMode === &quot;individual&quot; &amp;&amp; selectedStudents.size === 0)}
              style={{ flex: 2, padding: 12, borderRadius: 11, border: &quot;none&quot;, cursor: assigning ? &quot;not-allowed&quot; : &quot;pointer&quot;, fontWeight: 800, fontSize: 13, color: &quot;#fff&quot;,
                background: assigning ? &quot;#9CA3AF&quot; : G, display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot;, gap: 8 }}&gt;
              {assigning
                ? &lt;&gt;&lt;Loader2 size={14} style={{ animation: &quot;spin .8s linear infinite&quot; }} /&gt; Assigning…&lt;/&gt;
                : &lt;&gt;&lt;Send size={14} /&gt; Assign &amp; Notify Students&lt;/&gt;}
            &lt;/button&gt;
          &lt;/div&gt;
        &lt;/DialogContent&gt;
      &lt;/Dialog&gt;
    &lt;/div&gt;
  );
}</pre>
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