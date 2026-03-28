/*
  <!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Build Fix: ExamTaking.tsx</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0F172A; color: #E2E8F0; min-height: 100vh; }
  .header { background: #DC2626; padding: 16px 20px; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 12px rgba(0,0,0,.4); }
  .header-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  .fix-badge { background: rgba(255,255,255,.2); border: 1px solid rgba(255,255,255,.3); border-radius: 20px; padding: 3px 12px; font-size: 11px; font-weight: 800; letter-spacing: 1px; color: #fff; }
  .filename { font-size: 17px; font-weight: 800; color: #fff; }
  .fix-desc { font-size: 12px; color: rgba(255,255,255,.75); }
  .meta { display: flex; gap: 14px; font-size: 11px; color: rgba(255,255,255,.55); margin-top: 6px; }
  .copy-btn { background: #fff; color: #DC2626; border: none; border-radius: 12px; padding: 11px 22px; font-size: 14px; font-weight: 800; cursor: pointer; flex-shrink: 0; }
  .copy-btn.copied { background: #22C55E; color: #fff; }
  .path-bar { background: #1E293B; padding: 10px 20px; font-size: 11px; color: #64748B; font-family: monospace; border-bottom: 1px solid #334155; }
  .path-bar span { color: #94A3B8; }
  pre { font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.7; color: #CBD5E1; white-space: pre-wrap; word-break: break-all; padding: 20px 20px 90px; }
  .bottom-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #1E293B; border-top: 1px solid #334155; padding: 12px 20px; display: flex; justify-content: center; }
  .bottom-copy { background: #DC2626; color: #fff; border: none; border-radius: 14px; padding: 14px 40px; font-size: 16px; font-weight: 800; cursor: pointer; width: 100%; max-width: 480px; }
  .bottom-copy.copied { background: #22C55E; }
</style>
</head>
<body>
<div class="header">
  <div class="header-top">
    <div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span class="fix-badge">Build Fix</span>
        <span class="filename">ExamTaking.tsx</span>
      </div>
      <div class="fix-desc">ExamTaking — bare catch {} → catch (_e) {} (esbuild optional-catch-binding error)</div>
    </div>
    <button class="copy-btn" id="topBtn" onclick="copyCode()">📋 Copy</button>
  </div>
  <div class="meta"><span>📁 68.5 KB</span><span>📝 1011 lines</span></div>
</div>
<div class="path-bar">Place at: <span>src/pages/student/ExamTaking.tsx</span></div>
<pre id="codeBlock">/*
  src/pages/student/ExamTaking.tsx
  ENHANCED VERSION — New question types, confidence indicator,
  keyboard navigation, section support, better mobile UX
*/
import { useEffect, useState, useCallback, useRef } from &quot;react&quot;;
import { useParams, useNavigate } from &quot;react-router-dom&quot;;
import { useLanguage } from &quot;@/contexts/LanguageContext&quot;;
import { useAuth } from &quot;@/contexts/AuthContext&quot;;
import { supabase } from &quot;@/integrations/supabase/client&quot;;
import { useToast } from &quot;@/hooks/use-toast&quot;;
import { logger } from &quot;@/lib/logger&quot;;
import { sanitizeHtml } from &quot;@/lib/sanitize&quot;;
import {
  Clock, Flag, AlertTriangle, BookOpen, CheckCircle2,
  Lock, ChevronLeft, ChevronRight, Save, Eye, Grid, Send,
  Zap, ThumbsUp, ThumbsDown, Minus, RotateCcw, Keyboard
} from &quot;lucide-react&quot;;
import AudioPlayer from &quot;@/components/exam/AudioPlayer&quot;;
import AudioRecorder from &quot;@/components/exam/AudioRecorder&quot;;
import ProctoringOverlay from &quot;@/components/exam/ProctoringOverlay&quot;;
import { useProctoring } from &quot;@/hooks/useProctoring&quot;;
import { useIsMobile } from &quot;@/hooks/use-mobile&quot;;

const G = &quot;#0f2d1f&quot;, GM = &quot;#1a4731&quot;, GOLD = &quot;#c9a84c&quot;, BORDER = &quot;rgba(15,45,31,0.12)&quot;;
const CONFIDENT = &quot;#22c55e&quot;, UNSURE = &quot;#f59e0b&quot;, GUESSING = &quot;#ef4444&quot;;

type Confidence = &quot;confident&quot; | &quot;unsure&quot; | &quot;guessing&quot; | null;
type AnswerState = { text: string; data: any; flagged: boolean; confidence: Confidence };

/* ── Bilingual question renderer ────────────────────────────────────
   Splits &quot;Arabic (English)&quot; → Arabic first, English below, no brackets.
─────────────────────────────────────────────────────────────────── */
function splitBilingual(text: string): { ar: string; en: string } | null {
  if (!text) return null;
  const t = text.trim();
  const m1 = t.match(/^([\s\S]*?[؀-ۿ][\s\S]*?)\s*\(([^)]+)\)\s*$/);
  if (m1 &amp;&amp; /[a-zA-Z]/.test(m1[2])) return { ar: m1[1].trim(), en: m1[2].trim() };
  const m2 = t.match(/^\(([^)]+)\)\s*([\s\S]*[؀-ۿ][\s\S]*)$/);
  if (m2 &amp;&amp; /[a-zA-Z]/.test(m2[1])) return { ar: m2[2].trim(), en: m2[1].trim() };
  const lines = t.split(&quot;\n&quot;);
  if (lines.length &gt;= 2) {
    const arParts: string[] = [], enParts: string[] = [];
    for (const l of lines) {
      const s = l.replace(/[()]/g, &quot;&quot;).trim(); if (!s) continue;
      if (/[؀-ۿ]/.test(s)) arParts.push(s);
      else if (/[a-zA-Z]/.test(s)) enParts.push(s);
    }
    if (arParts.length &amp;&amp; enParts.length) return { ar: arParts.join(&quot; &quot;), en: enParts.join(&quot; &quot;) };
  }
  return null;
}

const QText = ({ text, textAr }: { text?: string; textAr?: string }) =&gt; {
  const primary = text || textAr || &quot;&quot;;
  const secondary = textAr &amp;&amp; textAr !== text ? textAr : null;
  const split = !secondary ? splitBilingual(primary) : null;
  const arStyle: React.CSSProperties = {
    fontFamily: &quot;&#x27;Scheherazade New&#x27;,&#x27;Amiri Quran&#x27;,&#x27;Amiri&#x27;,serif&quot;,
    fontSize: 22, fontWeight: 700, lineHeight: 2.3, color: G,
    textAlign: &quot;right&quot;, direction: &quot;rtl&quot;,
    padding: &quot;10px 14px&quot;, background: &quot;#f8fafb&quot;,
    borderRadius: 10, borderRight: `4px solid ${GOLD}`, marginBottom: 8,
  };
  const enStyle: React.CSSProperties = {
    fontFamily: &quot;&#x27;Cairo&#x27;,sans-serif&quot;, fontSize: 16, fontWeight: 600,
    lineHeight: 1.9, color: G, padding: &quot;8px 14px&quot;,
    background: &quot;#f0f4f2&quot;, borderRadius: 10, borderLeft: `4px solid ${GOLD}`,
  };
  if (secondary) return (
    &lt;div&gt;
      &lt;div style={arStyle} dir=&quot;rtl&quot; dangerouslySetInnerHTML={{ __html: secondary }} /&gt;
      &lt;div style={enStyle} dir=&quot;ltr&quot; dangerouslySetInnerHTML={{ __html: primary }} /&gt;
    &lt;/div&gt;
  );
  if (split) return (
    &lt;div&gt;
      {split.ar &amp;&amp; &lt;div style={arStyle} dir=&quot;rtl&quot;&gt;{split.ar}&lt;/div&gt;}
      {split.en &amp;&amp; &lt;div style={enStyle} dir=&quot;ltr&quot;&gt;{split.en}&lt;/div&gt;}
    &lt;/div&gt;
  );
  const isAr = /[؀-ۿ]/.test(primary);
  return (
    &lt;div style={isAr ? arStyle : enStyle} dir={isAr ? &quot;rtl&quot; : &quot;ltr&quot;}
      dangerouslySetInnerHTML={{ __html: primary }} /&gt;
  );
};

const logActivity = async (uid: string, a: string, et: string, ei: string, m?: any) =&gt; {
  try { await supabase.from(&quot;activity_logs&quot;).insert({ user_id: uid, action: a, entity_type: et, entity_id: ei, metadata: m || null }); } catch (_) {}
};

function isImageUrl(url: string) {
  return [&quot;.jpg&quot;, &quot;.jpeg&quot;, &quot;.png&quot;, &quot;.gif&quot;, &quot;.webp&quot;, &quot;.svg&quot;, &quot;.bmp&quot;].some(e =&gt; url.toLowerCase().split(&quot;?&quot;)[0].endsWith(e));
}

// ── Confidence Badge ─────────────────────────────────────────────
const ConfidenceSelector = ({ value, onChange }: { value: Confidence; onChange: (v: Confidence) =&gt; void }) =&gt; (
  &lt;div style={{ display: &quot;flex&quot;, gap: 6, alignItems: &quot;center&quot;, marginTop: 14, padding: &quot;10px 14px&quot;, background: &quot;#f8fafb&quot;, borderRadius: 12, border: `1px solid ${BORDER}` }}&gt;
    &lt;span style={{ fontSize: 11, color: &quot;#9ca3af&quot;, fontWeight: 600, marginRight: 4 }}&gt;Confidence:&lt;/span&gt;
    {([
      { v: &quot;confident&quot; as Confidence, label: &quot;Confident&quot;, icon: &lt;ThumbsUp style={{ width: 12, height: 12 }} /&gt;, color: CONFIDENT, bg: &quot;#f0fff4&quot; },
      { v: &quot;unsure&quot; as Confidence, label: &quot;Unsure&quot;, icon: &lt;Minus style={{ width: 12, height: 12 }} /&gt;, color: UNSURE, bg: &quot;#fffbeb&quot; },
      { v: &quot;guessing&quot; as Confidence, label: &quot;Guessing&quot;, icon: &lt;ThumbsDown style={{ width: 12, height: 12 }} /&gt;, color: GUESSING, bg: &quot;#fff5f5&quot; },
    ]).map(opt =&gt; {
      const sel = value === opt.v;
      return (
        &lt;button key={opt.v} onClick={() =&gt; onChange(sel ? null : opt.v)}
          style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 4, padding: &quot;5px 10px&quot;, borderRadius: 20, border: `1.5px solid ${sel ? opt.color : BORDER}`, background: sel ? opt.bg : &quot;transparent&quot;, color: sel ? opt.color : &quot;#9ca3af&quot;, fontSize: 11, fontWeight: sel ? 700 : 500, cursor: &quot;pointer&quot;, transition: &quot;all .15s&quot; }}&gt;
          {opt.icon}{opt.label}
        &lt;/button&gt;
      );
    })}
  &lt;/div&gt;
);

// ── Matching Question ─────────────────────────────────────────────
const MatchingQuestion = ({ question, answer, onAnswer }: { question: any; answer: AnswerState; onAnswer: (text: string, data: any) =&gt; void }) =&gt; {
  const pairs: { left: string; right: string; id: string }[] = question.matching_pairs || [];
  const rights = [...pairs.map(p =&gt; p.right)].sort(() =&gt; Math.random() - 0.5);
  const saved: Record&lt;string, string&gt; = answer?.data?.matches || {};
  const [matches, setMatches] = useState&lt;Record&lt;string, string&gt;&gt;(saved);
  const [dragging, setDragging] = useState&lt;string | null&gt;(null);

  const setMatch = (leftId: string, right: string) =&gt; {
    const newM = { ...matches, [leftId]: right };
    setMatches(newM);
    const text = pairs.map(p =&gt; `${p.left}=${newM[p.id] || &quot;&quot;}`).join(&quot;|&quot;);
    onAnswer(text, { matches: newM });
  };

  return (
    &lt;div style={{ display: &quot;flex&quot;, flexDirection: &quot;column&quot;, gap: 10 }}&gt;
      &lt;p style={{ fontSize: 12, color: &quot;#9ca3af&quot;, marginBottom: 4 }}&gt;Match each item on the left with the correct answer on the right.&lt;/p&gt;
      {pairs.map((pair, i) =&gt; (
        &lt;div key={pair.id} style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 10 }}&gt;
          &lt;div style={{ flex: 1, padding: &quot;12px 16px&quot;, background: &quot;#f8fafb&quot;, borderRadius: 12, border: `1.5px solid ${BORDER}`, fontSize: 15, fontWeight: 600, color: G, fontFamily: &quot;&#x27;Amiri&#x27;,serif&quot; }}&gt;
            {String.fromCharCode(65 + i)}. {pair.left}
          &lt;/div&gt;
          &lt;div style={{ fontSize: 18, color: &quot;#d1d5db&quot; }}&gt;→&lt;/div&gt;
          &lt;select value={matches[pair.id] || &quot;&quot;} onChange={e =&gt; setMatch(pair.id, e.target.value)}
            style={{ flex: 1, padding: &quot;12px 16px&quot;, borderRadius: 12, border: `1.5px solid ${matches[pair.id] ? GM : BORDER}`, background: matches[pair.id] ? &quot;#f0fff4&quot; : &quot;#f8fafb&quot;, fontSize: 15, color: G, outline: &quot;none&quot;, cursor: &quot;pointer&quot; }}&gt;
            &lt;option value=&quot;&quot;&gt;— Select —&lt;/option&gt;
            {rights.map(r =&gt; &lt;option key={r} value={r}&gt;{r}&lt;/option&gt;)}
          &lt;/select&gt;
        &lt;/div&gt;
      ))}
    &lt;/div&gt;
  );
};

// ── Ordering Question ─────────────────────────────────────────────
const OrderingQuestion = ({ question, answer, onAnswer }: { question: any; answer: AnswerState; onAnswer: (text: string, data: any) =&gt; void }) =&gt; {
  const items: string[] = question.ordering_items || [];
  const savedOrder: string[] = answer?.data?.order || [...items].sort(() =&gt; Math.random() - 0.5);
  const [order, setOrder] = useState&lt;string[]&gt;(savedOrder);
  const [dragIdx, setDragIdx] = useState&lt;number | null&gt;(null);

  const move = (from: number, to: number) =&gt; {
    const newOrder = [...order];
    const [item] = newOrder.splice(from, 1);
    newOrder.splice(to, 0, item);
    setOrder(newOrder);
    onAnswer(newOrder.join(&quot;|&quot;), { order: newOrder });
  };

  return (
    &lt;div style={{ display: &quot;flex&quot;, flexDirection: &quot;column&quot;, gap: 8 }}&gt;
      &lt;p style={{ fontSize: 12, color: &quot;#9ca3af&quot;, marginBottom: 4 }}&gt;Drag or use arrows to arrange in the correct order.&lt;/p&gt;
      {order.map((item, i) =&gt; (
        &lt;div key={item} style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 8, padding: &quot;12px 16px&quot;, background: &quot;#f8fafb&quot;, borderRadius: 12, border: `1.5px solid ${BORDER}`, cursor: &quot;grab&quot; }}&gt;
          &lt;div style={{ width: 28, height: 28, borderRadius: 8, background: GM, color: &quot;#fff&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot;, fontSize: 13, fontWeight: 800, flexShrink: 0 }}&gt;{i + 1}&lt;/div&gt;
          &lt;div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: G, fontFamily: &quot;&#x27;Amiri&#x27;,serif&quot; }}&gt;{item}&lt;/div&gt;
          &lt;div style={{ display: &quot;flex&quot;, flexDirection: &quot;column&quot;, gap: 2 }}&gt;
            &lt;button onClick={() =&gt; i &gt; 0 &amp;&amp; move(i, i - 1)} disabled={i === 0}
              style={{ width: 24, height: 22, borderRadius: 6, border: `1px solid ${BORDER}`, background: &quot;#fff&quot;, color: i === 0 ? &quot;#d1d5db&quot; : G, cursor: i === 0 ? &quot;not-allowed&quot; : &quot;pointer&quot;, fontSize: 12, display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot; }}&gt;▲&lt;/button&gt;
            &lt;button onClick={() =&gt; i &lt; order.length - 1 &amp;&amp; move(i, i + 1)} disabled={i === order.length - 1}
              style={{ width: 24, height: 22, borderRadius: 6, border: `1px solid ${BORDER}`, background: &quot;#fff&quot;, color: i === order.length - 1 ? &quot;#d1d5db&quot; : G, cursor: i === order.length - 1 ? &quot;not-allowed&quot; : &quot;pointer&quot;, fontSize: 12, display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot; }}&gt;▼&lt;/button&gt;
          &lt;/div&gt;
        &lt;/div&gt;
      ))}
    &lt;/div&gt;
  );
};

// ── Multi-Select Question ─────────────────────────────────────────
const MultiSelectQuestion = ({ question, answer, onAnswer }: { question: any; answer: AnswerState; onAnswer: (text: string, data: any) =&gt; void }) =&gt; {
  const opts: any[] = question.options || [];
  const selected: string[] = answer?.data?.selected || (answer?.text ? answer.text.split(&quot;,&quot;) : []);
  const [sel, setSel] = useState&lt;string[]&gt;(selected);

  const toggle = (id: string) =&gt; {
    const newSel = sel.includes(id) ? sel.filter(s =&gt; s !== id) : [...sel, id];
    setSel(newSel);
    onAnswer(newSel.join(&quot;,&quot;), { selected: newSel });
  };

  return (
    &lt;div style={{ display: &quot;flex&quot;, flexDirection: &quot;column&quot;, gap: 10 }}&gt;
      &lt;p style={{ fontSize: 12, color: &quot;#9ca3af&quot;, marginBottom: 4 }}&gt;Select all that apply. Multiple answers may be correct.&lt;/p&gt;
      {opts.map((opt, idx) =&gt; {
        const isSel = sel.includes(opt.id);
        return (
          &lt;div key={opt.id} onClick={() =&gt; toggle(opt.id)}
            style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 14, padding: &quot;14px 18px&quot;, borderRadius: 14, cursor: &quot;pointer&quot;, transition: &quot;all .15s&quot;, background: isSel ? &quot;#f0fff4&quot; : &quot;#f8fafb&quot;, border: `2px solid ${isSel ? &quot;#22c55e&quot; : BORDER}`, boxShadow: isSel ? &quot;0 2px 12px rgba(34,197,94,.18)&quot; : &quot;none&quot; }}&gt;
            &lt;div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isSel ? &quot;#22c55e&quot; : BORDER}`, background: isSel ? &quot;#22c55e&quot; : &quot;#fff&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot;, flexShrink: 0 }}&gt;
              {isSel &amp;&amp; &lt;span style={{ color: &quot;#fff&quot;, fontSize: 13, fontWeight: 900 }}&gt;✓&lt;/span&gt;}
            &lt;/div&gt;
            &lt;div style={{ width: 32, height: 32, borderRadius: &quot;50%&quot;, background: isSel ? GM : &quot;rgba(15,45,31,.08)&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot;, fontSize: 13, fontWeight: 900, color: isSel ? &quot;#fff&quot; : G, flexShrink: 0 }}&gt;
              {String.fromCharCode(65 + idx)}
            &lt;/div&gt;
            {opt.image_url &amp;&amp; &lt;img src={opt.image_url} alt=&quot;&quot; style={{ height: 56, borderRadius: 8, objectFit: &quot;contain&quot; }} /&gt;}
            &lt;div style={{ flex: 1 }}&gt;
              {opt.text &amp;&amp; &lt;div dir=&quot;auto&quot; style={{ fontSize: 16, fontWeight: isSel ? 700 : 500, color: isSel ? G : &quot;#374151&quot;, fontFamily: &quot;&#x27;Amiri&#x27;,serif&quot;, lineHeight: 1.9 }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(opt.text) }} /&gt;}
              {opt.text_ar &amp;&amp; opt.text_ar !== opt.text &amp;&amp; &lt;div dir=&quot;rtl&quot; style={{ fontSize: 17, fontFamily: &quot;&#x27;Amiri Quran&#x27;,serif&quot;, color: G, lineHeight: 2.1, marginTop: 2 }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(opt.text_ar) }} /&gt;}
            &lt;/div&gt;
          &lt;/div&gt;
        );
      })}
    &lt;/div&gt;
  );
};

// ── Reading Comprehension ─────────────────────────────────────────
const ReadingQuestion = ({ question, answer, onAnswer }: { question: any; answer: AnswerState; onAnswer: (text: string, data: any) =&gt; void }) =&gt; {
  const passage: string = question.reading_passage || &quot;&quot;;
  const [highlighted, setHighlighted] = useState&lt;string&gt;(&quot;&quot;);

  return (
    &lt;div style={{ display: &quot;flex&quot;, flexDirection: &quot;column&quot;, gap: 14 }}&gt;
      {passage &amp;&amp; (
        &lt;div style={{ padding: &quot;16px 20px&quot;, background: &quot;#fffbeb&quot;, borderRadius: 14, border: `1px solid ${GOLD}44`, borderLeft: `4px solid ${GOLD}` }}&gt;
          &lt;div style={{ fontSize: 11, fontWeight: 700, color: GOLD, letterSpacing: 1, marginBottom: 8 }}&gt;📖 READING PASSAGE&lt;/div&gt;
          &lt;div dir=&quot;auto&quot; style={{ fontSize: 16, lineHeight: 2, color: G, fontFamily: &quot;&#x27;Amiri&#x27;,serif&quot; }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(passage) }} /&gt;
        &lt;/div&gt;
      )}
      &lt;textarea dir=&quot;auto&quot; rows={5} placeholder=&quot;Write your answer based on the passage above…&quot;
        value={answer?.text || &quot;&quot;} onChange={e =&gt; onAnswer(e.target.value, answer?.data)}
        style={{ width: &quot;100%&quot;, padding: &quot;15px 16px&quot;, borderRadius: 14, border: `2px solid ${BORDER}`, fontSize: 16, outline: &quot;none&quot;, color: G, background: &quot;#f8fafb&quot;, resize: &quot;vertical&quot;, lineHeight: 1.9, fontFamily: &quot;&#x27;Amiri&#x27;,serif&quot;, transition: &quot;border .15s&quot; }}
        onFocus={e =&gt; (e.target.style.borderColor = GM)} onBlur={e =&gt; (e.target.style.borderColor = BORDER)} /&gt;
    &lt;/div&gt;
  );
};

// ══════════════════════════════════════════════════════════════════
const ExamTaking = () =&gt; {
  const { attemptId } = useParams&lt;{ attemptId: string }&gt;();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [exam, setExam] = useState&lt;any&gt;(null);
  const [questions, setQuestions] = useState&lt;any[]&gt;([]);
  const [answers, setAnswers] = useState&lt;Record&lt;string, AnswerState&gt;&gt;({});
  const [currentIdx, setIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submissionResult, setSR] = useState&lt;any&gt;(null);
  const [tabSwitches, setTabSw] = useState(0);
  const [phase, setPhase] = useState&lt;&quot;exam&quot; | &quot;review&quot;&gt;(&quot;exam&quot;);
  const [lastSaved, setLastSaved] = useState&lt;Date | null&gt;(null);
  const [saving, setSaving] = useState(false);
  const [showNav, setShowNav] = useState(false);
  const [deductedPoints, setDeducted] = useState(0);
  const [showProcLog, setShowProcLog] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [questionStartTime, setQuestionStartTime] = useState&lt;Record&lt;string, number&gt;&gt;({});
  const [timePerQuestion, setTimePerQuestion] = useState&lt;Record&lt;string, number&gt;&gt;({});

  const submittedRef = useRef(false);
  const answersRef = useRef(answers);
  const questionsRef = useRef(questions);
  const examRef = useRef(exam);
  const submitRef = useRef&lt;() =&gt; Promise&lt;void&gt;&gt;(() =&gt; Promise.resolve());

  useEffect(() =&gt; { answersRef.current = answers; }, [answers]);
  useEffect(() =&gt; { questionsRef.current = questions; }, [questions]);
  useEffect(() =&gt; { examRef.current = exam; }, [exam]);

  // Track time per question
  useEffect(() =&gt; {
    if (!questions[currentIdx]) return;
    const qId = questions[currentIdx].id;
    const now = Date.now();
    setQuestionStartTime(p =&gt; ({ ...p, [qId]: now }));
    return () =&gt; {
      setTimePerQuestion(p =&gt; ({
        ...p,
        [qId]: (p[qId] || 0) + Math.round((Date.now() - (questionStartTime[qId] || now)) / 1000)
      }));
    };
  }, [currentIdx]);

  const procEnabled = exam?.proctoring_enabled === true;
  const proc = useProctoring({
    attemptId: attemptId || &quot;&quot;, userId: user?.id || &quot;&quot;,
    proctoring_enabled: exam?.proctoring_enabled,
    fullscreen_required: exam?.fullscreen_required,
    tab_switch_limit: exam?.tab_switch_limit,
    max_warnings: exam?.max_warnings,
    auto_submit_on_violation: exam?.auto_submit_on_violation,
    screenshot_interval_seconds: exam?.screenshot_interval_seconds,
    webcam_required: exam?.webcam_required,
    record_audio: exam?.record_audio,
  }, procEnabled &amp;&amp; !submitted &amp;&amp; !loading, () =&gt; { if (!submittedRef.current) submitRef.current(); });

  useEffect(() =&gt; {
    if (proc.cameraReady &amp;&amp; (proc as any).getStream) {
      setTimeout(() =&gt; {
        const stream = (proc as any).getStream();
        if (!stream) return;
        const el = document.getElementById(&quot;proctor-display-video&quot;) as HTMLVideoElement;
        if (el &amp;&amp; !el.srcObject) { el.srcObject = stream; el.play().catch(() =&gt; {}); }
      }, 600);
    }
  }, [proc.cameraReady]);

  const handlePointDeduction = useCallback((pts: number) =&gt; {
    setDeducted(p =&gt; p + pts);
  }, []);

  // Keyboard shortcuts
  useEffect(() =&gt; {
    if (submitted || phase === &quot;review&quot;) return;
    const handler = (e: KeyboardEvent) =&gt; {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === &quot;ArrowRight&quot; || e.key === &quot;ArrowDown&quot;) { e.preventDefault(); setIdx(p =&gt; Math.min(questionsRef.current.length - 1, p + 1)); }
      if (e.key === &quot;ArrowLeft&quot; || e.key === &quot;ArrowUp&quot;) { e.preventDefault(); setIdx(p =&gt; Math.max(0, p - 1)); }
      if (e.key === &quot;f&quot; || e.key === &quot;F&quot;) {
        const q = questionsRef.current[currentIdx];
        if (q) toggleFlag(q.id);
      }
      if (e.key === &quot;1&quot;) setConfidence(questionsRef.current[currentIdx]?.id, &quot;confident&quot;);
      if (e.key === &quot;2&quot;) setConfidence(questionsRef.current[currentIdx]?.id, &quot;unsure&quot;);
      if (e.key === &quot;3&quot;) setConfidence(questionsRef.current[currentIdx]?.id, &quot;guessing&quot;);
    };
    window.addEventListener(&quot;keydown&quot;, handler);
    return () =&gt; window.removeEventListener(&quot;keydown&quot;, handler);
  }, [submitted, phase, currentIdx]);

  // Block right-click &amp; copy
  useEffect(() =&gt; {
    if (submitted) return;
    const noRC = (e: MouseEvent) =&gt; e.preventDefault();
    const noCP = (e: ClipboardEvent) =&gt; e.preventDefault();
    const noKey = (e: KeyboardEvent) =&gt; { if ((e.ctrlKey || e.metaKey) &amp;&amp; [&quot;c&quot;, &quot;v&quot;, &quot;x&quot;, &quot;a&quot;].includes(e.key.toLowerCase())) e.preventDefault(); };
    document.addEventListener(&quot;contextmenu&quot;, noRC);
    document.addEventListener(&quot;copy&quot;, noCP); document.addEventListener(&quot;cut&quot;, noCP); document.addEventListener(&quot;paste&quot;, noCP);
    document.addEventListener(&quot;keydown&quot;, noKey);
    return () =&gt; {
      document.removeEventListener(&quot;contextmenu&quot;, noRC); document.removeEventListener(&quot;copy&quot;, noCP);
      document.removeEventListener(&quot;cut&quot;, noCP); document.removeEventListener(&quot;paste&quot;, noCP);
      document.removeEventListener(&quot;keydown&quot;, noKey);
    };
  }, [submitted]);

  // Load exam — wrapped in try/catch so loading always clears
  useEffect(() =&gt; {
    if (!attemptId || !user) return;
    (async () =&gt; {
      try {
        const { data: ad, error: ae } = await supabase.from(&quot;exam_attempts&quot;).select(&quot;*,exams(*)&quot;).eq(&quot;id&quot;, attemptId).single();
        if (ae || !ad || ad.user_id !== user.id) { navigate(&quot;/student/exams&quot;); return; }
        if (ad.status !== &quot;in_progress&quot;) {
          setSubmitted(true); setExam(ad.exams);
          setSR({ status: ad.status, score: ad.score, totalPoints: ad.total_points, percentage: ad.percentage, passed: ad.passed });
          setLoading(false); return;
        }
        setExam(ad.exams);
        setTimeLeft(Math.max(0, (ad.exams.time_limit_minutes || 60) * 60 - Math.floor((Date.now() - new Date(ad.started_at).getTime()) / 1000)));
        setTabSw(ad.tab_switches || 0);
        logActivity(user.id, &quot;exam_started&quot;, &quot;exam_attempt&quot;, attemptId, { exam_id: ad.exam_id });

        // Try RPC first, fall back to direct query if it fails
        let ql: any[] = [];
        try {
          const { data: qs } = await supabase.rpc(&quot;get_exam_questions_for_student&quot;, { _exam_id: ad.exam_id });
          ql = qs || [];
        } catch (_e) {
          // RPC failed — fall back to direct query
          const { data: qs2 } = await supabase
            .from(&quot;exam_questions&quot;)
            .select(&quot;*, questions(*)&quot;)
            .eq(&quot;exam_id&quot;, ad.exam_id)
            .order(&quot;order_index&quot;);
          ql = (qs2 || []).map((eq: any) =&gt; ({ ...eq.questions, ...eq, id: eq.question_id || eq.id }));
        }
        // FIX: refresh signed media_url for audio questions (signed URLs expire after 1h)
        ql = await Promise.all(ql.map(async (q: any) =&gt; {
          if (q.media_url &amp;&amp; q.media_url.includes(&quot;/storage/v1/object/sign/&quot;)) {
            // Extract bucket and path from signed URL
            const match = q.media_url.match(/\/storage\/v1\/object\/sign\/([^/]+)\/(.+?)\?/);
            if (match) {
              const [, bucket, path] = match;
              const { data: fresh } = await supabase.storage.from(bucket).createSignedUrl(decodeURIComponent(path), 7200);
              return { ...q, media_url: fresh?.signedUrl || q.media_url };
            }
          }
          return q;
        }));
        if (ad.exams.randomize_questions) ql = ql.sort(() =&gt; Math.random() - 0.5);
        setQuestions(ql);

        const { data: ea } = await supabase.from(&quot;exam_answers&quot;).select(&quot;*&quot;).eq(&quot;attempt_id&quot;, attemptId);
        const am: Record&lt;string, AnswerState&gt; = {};
        (ea || []).forEach((a: any) =&gt; { am[a.question_id] = { text: a.answer_text || &quot;&quot;, data: a.answer_data, flagged: a.is_flagged || false, confidence: a.answer_data?.confidence || null }; });
        setAnswers(am);
      } catch (err) {
        console.error(&quot;Exam load error:&quot;, err);
      } finally {
        setLoading(false); // ALWAYS clear loading
      }
    })();
  }, [attemptId, user]);

  // Timer
  useEffect(() =&gt; {
    if (submitted || loading || !exam) return;
    if (timeLeft &lt;= 0) { if (!submittedRef.current) submitRef.current(); return; }
    const iv = setInterval(() =&gt; setTimeLeft(tt =&gt; { const n = Math.max(0, tt - 1); if (n === 0 &amp;&amp; !submittedRef.current) setTimeout(() =&gt; submitRef.current(), 0); return n; }), 1000);
    return () =&gt; clearInterval(iv);
  }, [timeLeft, loading, submitted, exam]);

  // Tab switch
  useEffect(() =&gt; {
    if (submitted) return;
    const h = () =&gt; { if (document.hidden) setTabSw(p =&gt; { const n = p + 1; supabase.from(&quot;exam_attempts&quot;).update({ tab_switches: n }).eq(&quot;id&quot;, attemptId!); if (n &gt;= 3) toast({ title: &quot;⚠️ Warning!&quot;, description: &quot;Tab switching detected!&quot;, variant: &quot;destructive&quot; }); return n; }); };
    document.addEventListener(&quot;visibilitychange&quot;, h); return () =&gt; document.removeEventListener(&quot;visibilitychange&quot;, h);
  }, [attemptId, submitted]);

  // Auto-save every 30s
  useEffect(() =&gt; {
    if (submitted) return;
    const iv = setInterval(async () =&gt; { await saveAnswers(true); }, 30000); return () =&gt; clearInterval(iv);
  }, [answers, submitted]);

  useEffect(() =&gt; {
    if (submitted) return;
    const h = (e: BeforeUnloadEvent) =&gt; { e.preventDefault(); e.returnValue = &quot;&quot;; };
    window.addEventListener(&quot;beforeunload&quot;, h); return () =&gt; window.removeEventListener(&quot;beforeunload&quot;, h);
  }, [submitted]);

  const saveAnswers = async (silent = false) =&gt; {
    if (!attemptId || submittedRef.current) return;
    if (!silent) setSaving(true);
    for (const [qId, ans] of Object.entries(answersRef.current)) {
      const { data: ex } = await supabase.from(&quot;exam_answers&quot;).select(&quot;id&quot;).eq(&quot;attempt_id&quot;, attemptId).eq(&quot;question_id&quot;, qId).maybeSingle();
      const p: any = { answer_text: ans.text, answer_data: { ...ans.data, confidence: ans.confidence, timeSpent: timePerQuestion[qId] || 0 }, is_flagged: ans.flagged };
      if (ex) await supabase.from(&quot;exam_answers&quot;).update(p).eq(&quot;id&quot;, ex.id);
      else await supabase.from(&quot;exam_answers&quot;).insert({ attempt_id: attemptId, question_id: qId, ...p });
    }
    setLastSaved(new Date()); if (!silent) setSaving(false);
  };

  const setAnswer = (qId: string, text: string, data?: any) =&gt; {
    if (submitted) return;
    setAnswers(p =&gt; ({ ...p, [qId]: { ...p[qId], text, data: data ?? p[qId]?.data, flagged: p[qId]?.flagged || false, confidence: p[qId]?.confidence || null } }));
  };
  const toggleFlag = (qId: string) =&gt; {
    if (submitted) return;
    setAnswers(p =&gt; ({ ...p, [qId]: { ...p[qId], text: p[qId]?.text || &quot;&quot;, data: p[qId]?.data, flagged: !p[qId]?.flagged, confidence: p[qId]?.confidence || null } }));
  };
  const setConfidence = (qId: string | undefined, c: Confidence) =&gt; {
    if (!qId || submitted) return;
    setAnswers(p =&gt; ({ ...p, [qId]: { ...p[qId], text: p[qId]?.text || &quot;&quot;, data: p[qId]?.data, flagged: p[qId]?.flagged || false, confidence: p[qId]?.confidence === c ? null : c } }));
  };

  const handleSubmit = useCallback(async () =&gt; {
    if (submittedRef.current) return;
    submittedRef.current = true; setSubmitting(true); setPhase(&quot;exam&quot;);
    if (attemptId) {
      for (const [qId, ans] of Object.entries(answersRef.current)) {
        if (!ans.text &amp;&amp; !ans.data) continue;
        const { data: ex } = await supabase.from(&quot;exam_answers&quot;).select(&quot;id&quot;).eq(&quot;attempt_id&quot;, attemptId).eq(&quot;question_id&quot;, qId).maybeSingle();
        const p: any = { answer_text: ans.text || null, answer_data: { ...ans.data, confidence: ans.confidence, timeSpent: timePerQuestion[qId] || 0 } || null, is_flagged: ans.flagged || false };
        if (ex) await supabase.from(&quot;exam_answers&quot;).update(p).eq(&quot;id&quot;, ex.id);
        else await supabase.from(&quot;exam_answers&quot;).insert({ attempt_id: attemptId, question_id: qId, ...p });
      }
    }
    const { data: gr, error: ge } = await supabase.rpc(&quot;grade_exam_attempt&quot;, { _attempt_id: attemptId! });
    if (ge) { toast({ title: &quot;❌ Submission failed.&quot;, variant: &quot;destructive&quot; }); submittedRef.current = false; setSubmitting(false); return; }
    const r = gr as any;
    setSR({ status: r.status, score: r.score, totalPoints: r.total_points, percentage: r.percentage, passed: r.passed });
    setSubmitted(true); setSubmitting(false); toast({ title: &quot;✅ Exam Submitted!&quot; });
    if (user) logActivity(user.id, &quot;exam_submitted&quot;, &quot;exam_attempt&quot;, attemptId!, { score: r.score, percentage: Math.round(r.percentage) });
  }, [attemptId, user]);

  useEffect(() =&gt; { submitRef.current = handleSubmit; }, [handleSubmit]);

  const answeredCount = Object.keys(answers).filter(k =&gt; answers[k]?.text).length;
  const flaggedCount = Object.values(answers).filter(a =&gt; a?.flagged).length;
  const confidentCount = Object.values(answers).filter(a =&gt; a?.confidence === &quot;confident&quot;).length;
  const progressPct = questions.length &gt; 0 ? (answeredCount / questions.length) * 100 : 0;
  const isTimeCrit = timeLeft &lt; 300;
  const isTimeWarn = timeLeft &lt; 600 &amp;&amp; timeLeft &gt;= 300;
  const fmt = (s: number) =&gt; `${Math.floor(s / 60).toString().padStart(2, &quot;0&quot;)}:${(s % 60).toString().padStart(2, &quot;0&quot;)}`;
  const timerColor = isTimeCrit ? &quot;#ef4444&quot; : isTimeWarn ? &quot;#f59e0b&quot; : &quot;#22c55e&quot;;
  const timerBg = isTimeCrit ? &quot;rgba(239,68,68,.15)&quot; : isTimeWarn ? &quot;rgba(245,158,11,.15)&quot; : &quot;rgba(34,197,94,.12)&quot;;
  const q = questions[currentIdx];

  // ── SUBMITTED ──
  if (submitted &amp;&amp; !loading) return (
    &lt;div style={{ minHeight: &quot;100vh&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot;, background: &quot;linear-gradient(135deg,#f8fafb,#f0f4f8)&quot;, fontFamily: &quot;&#x27;Cairo&#x27;,sans-serif&quot;, padding: 20 }}&gt;
      &lt;div style={{ background: &quot;#fff&quot;, borderRadius: 24, padding: &quot;48px 36px&quot;, maxWidth: 480, width: &quot;100%&quot;, textAlign: &quot;center&quot;, boxShadow: &quot;0 12px 48px rgba(0,0,0,.1)&quot; }}&gt;
        &lt;div style={{ width: 96, height: 96, borderRadius: &quot;50%&quot;, background: submissionResult?.passed ? &quot;linear-gradient(135deg,#f0fff4,#dcfce7)&quot; : submissionResult?.status === &quot;submitted&quot; ? &quot;linear-gradient(135deg,#fefce8,#fef9c3)&quot; : &quot;linear-gradient(135deg,#fff5f5,#fee2e2)&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot;, margin: &quot;0 auto 24px&quot;, boxShadow: submissionResult?.passed ? &quot;0 4px 20px rgba(34,197,94,.25)&quot; : &quot;none&quot; }}&gt;
          {submissionResult?.status === &quot;graded&quot; ? submissionResult?.passed ? &lt;CheckCircle2 style={{ width: 48, height: 48, color: &quot;#22c55e&quot; }} /&gt; : &lt;AlertTriangle style={{ width: 48, height: 48, color: &quot;#ef4444&quot; }} /&gt; : &lt;Lock style={{ width: 48, height: 48, color: GOLD }} /&gt;}
        &lt;/div&gt;
        &lt;h2 style={{ fontSize: 26, fontWeight: 900, color: G, marginBottom: 8 }}&gt;
          {submissionResult?.status === &quot;graded&quot; ? submissionResult?.passed ? t(&quot;Exam Passed! 🎉&quot;, &quot;نجحت في الامتحان! 🎉&quot;) : t(&quot;Not Passed&quot;, &quot;لم تجتز الامتحان&quot;) : t(&quot;Exam Submitted&quot;, &quot;تم تقديم الامتحان&quot;)}
        &lt;/h2&gt;
        {submissionResult?.status === &quot;graded&quot; &amp;&amp; (
          &lt;&gt;
            &lt;div style={{ fontSize: 64, fontWeight: 900, color: submissionResult.passed ? &quot;#22c55e&quot; : &quot;#ef4444&quot;, marginBottom: 4, lineHeight: 1 }}&gt;{Math.round(submissionResult.percentage || 0)}%&lt;/div&gt;
            &lt;div style={{ fontSize: 15, color: &quot;#7a9e88&quot;, marginBottom: 20 }}&gt;{submissionResult.score}/{submissionResult.totalPoints} {t(&quot;points&quot;, &quot;نقاط&quot;)}&lt;/div&gt;
            {deductedPoints &gt; 0 &amp;&amp; &lt;div style={{ fontSize: 13, color: &quot;#ef4444&quot;, marginBottom: 16, padding: &quot;8px 16px&quot;, background: &quot;#fff5f5&quot;, borderRadius: 10 }}&gt;−{deductedPoints} pts deducted for violations&lt;/div&gt;}
          &lt;/&gt;
        )}
        {submissionResult?.status === &quot;submitted&quot; &amp;&amp; (
          &lt;div style={{ background: &quot;#fffbeb&quot;, borderRadius: 12, padding: 16, marginBottom: 20, border: `1px solid ${GOLD}44` }}&gt;
            &lt;p style={{ fontSize: 14, color: &quot;#7a9e88&quot;, lineHeight: 1.7, margin: 0 }}&gt;{t(&quot;Your exam has been submitted and is awaiting grading by your teacher.&quot;, &quot;تم تقديم امتحانك وبانتظار تصحيح المعلم.&quot;)}&lt;/p&gt;
          &lt;/div&gt;
        )}
        &lt;div style={{ display: &quot;flex&quot;, gap: 10 }}&gt;
          &lt;button onClick={() =&gt; navigate(&quot;/student/exams&quot;)} style={{ flex: 1, padding: &quot;14px 0&quot;, borderRadius: 14, background: &quot;#f8fafb&quot;, border: `1.5px solid ${BORDER}`, color: G, fontSize: 14, fontWeight: 700, cursor: &quot;pointer&quot;, fontFamily: &quot;&#x27;Cairo&#x27;,sans-serif&quot; }}&gt;{t(&quot;Back to Exams&quot;, &quot;العودة&quot;)}&lt;/button&gt;
          &lt;button onClick={() =&gt; navigate(`/student/results/${attemptId}`)} style={{ flex: 1, padding: &quot;14px 0&quot;, borderRadius: 14, background: G, border: &quot;none&quot;, color: &quot;#fff&quot;, fontSize: 14, fontWeight: 700, cursor: &quot;pointer&quot;, fontFamily: &quot;&#x27;Cairo&#x27;,sans-serif&quot; }}&gt;{t(&quot;View Results&quot;, &quot;عرض النتيجة&quot;)}&lt;/button&gt;
        &lt;/div&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  );

  if (loading) return (
    &lt;div style={{ minHeight: &quot;100vh&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot;, background: &quot;#f8fafb&quot; }}&gt;
      &lt;div style={{ textAlign: &quot;center&quot; }}&gt;
        &lt;div style={{ width: 52, height: 52, border: `4px solid ${G}`, borderTopColor: &quot;transparent&quot;, borderRadius: &quot;50%&quot;, animation: &quot;spin .8s linear infinite&quot;, margin: &quot;0 auto 16px&quot; }} /&gt;
        &lt;p style={{ color: &quot;#7a9e88&quot;, fontSize: 14, fontFamily: &quot;&#x27;Cairo&#x27;,sans-serif&quot; }}&gt;{t(&quot;Loading exam…&quot;, &quot;جارٍ تحميل الامتحان…&quot;)}&lt;/p&gt;
      &lt;/div&gt;
      &lt;style&gt;{`@keyframes spin{to{transform:rotate(360deg)}}`}&lt;/style&gt;
    &lt;/div&gt;
  );

  // ── REVIEW PHASE ──
  if (phase === &quot;review&quot;) return (
    &lt;div style={{ height: &quot;100vh&quot;, display: &quot;flex&quot;, flexDirection: &quot;column&quot;, background: &quot;#f5f7fa&quot;, fontFamily: &quot;&#x27;Cairo&#x27;,sans-serif&quot;, overflow: &quot;hidden&quot; }}&gt;
      &lt;style&gt;{`@keyframes spin{to{transform:rotate(360deg)}}`}&lt;/style&gt;
      {procEnabled &amp;&amp; !submitted &amp;&amp; (
        &lt;ProctoringOverlay cameraReady={proc.cameraReady} faceDetected={proc.faceDetected}
          integrityScore={proc.integrityScore} suspicionLevel={proc.suspicionLevel}
          strikes={proc.strikes} maxStrikes={proc.maxStrikes} violations={proc.violations}
          lastWarningType={proc.lastWarningType} audioMonitoring={proc.audioMonitoring}
          recentViolations={(proc as any).recentViolations} getStream={(proc as any).getStream}
          attemptId={attemptId || &quot;&quot;} onPointDeduction={handlePointDeduction} /&gt;
      )}
      &lt;div style={{ background: G, padding: &quot;14px 16px&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 12, flexShrink: 0 }}&gt;
        &lt;button onClick={() =&gt; setPhase(&quot;exam&quot;)} style={{ background: &quot;rgba(255,255,255,.15)&quot;, border: &quot;none&quot;, color: &quot;#fff&quot;, borderRadius: 10, padding: &quot;7px 14px&quot;, fontSize: 13, fontWeight: 700, cursor: &quot;pointer&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 5, fontFamily: &quot;&#x27;Cairo&#x27;,sans-serif&quot; }}&gt;
          &lt;ChevronLeft style={{ width: 14, height: 14 }} /&gt;{t(&quot;Back&quot;, &quot;عودة&quot;)}
        &lt;/button&gt;
        &lt;div style={{ flex: 1 }}&gt;
          &lt;div style={{ fontSize: 15, fontWeight: 700, color: &quot;#fff&quot; }}&gt;{t(&quot;Review Your Answers&quot;, &quot;مراجعة إجاباتك&quot;)}&lt;/div&gt;
          &lt;div style={{ fontSize: 11, color: &quot;rgba(255,255,255,.6)&quot; }}&gt;{answeredCount}/{questions.length} answered · {flaggedCount} flagged · {confidentCount} confident&lt;/div&gt;
        &lt;/div&gt;
        &lt;div style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 5, background: timerBg, borderRadius: 20, padding: &quot;4px 12px&quot; }}&gt;
          &lt;Clock style={{ width: 12, height: 12, color: timerColor }} /&gt;&lt;span style={{ fontSize: 13, fontWeight: 900, color: timerColor, fontVariantNumeric: &quot;tabular-nums&quot; }}&gt;{fmt(timeLeft)}&lt;/span&gt;
        &lt;/div&gt;
      &lt;/div&gt;
      &lt;div style={{ flex: 1, overflow: &quot;auto&quot;, padding: 16 }}&gt;
        {/* Stats */}
        &lt;div style={{ display: &quot;grid&quot;, gridTemplateColumns: &quot;repeat(4,1fr)&quot;, gap: 10, marginBottom: 16 }}&gt;
          {[
            { l: t(&quot;Answered&quot;, &quot;مُجاب&quot;), v: answeredCount, c: &quot;#22c55e&quot;, bg: &quot;#f0fff4&quot; },
            { l: t(&quot;Flagged&quot;, &quot;مُعلّم&quot;), v: flaggedCount, c: GOLD, bg: &quot;#fffbeb&quot; },
            { l: t(&quot;Unanswered&quot;, &quot;غير مُجاب&quot;), v: questions.length - answeredCount, c: &quot;#ef4444&quot;, bg: &quot;#fff5f5&quot; },
            { l: t(&quot;Confident&quot;, &quot;واثق&quot;), v: confidentCount, c: &quot;#6366f1&quot;, bg: &quot;#eef2ff&quot; },
          ].map((s, i) =&gt; (
            &lt;div key={i} style={{ background: s.bg, borderRadius: 12, padding: &quot;12px 8px&quot;, textAlign: &quot;center&quot;, border: `1px solid ${s.c}22` }}&gt;
              &lt;div style={{ fontSize: 26, fontWeight: 900, color: s.c }}&gt;{s.v}&lt;/div&gt;
              &lt;div style={{ fontSize: 10, color: &quot;#7a9e88&quot; }}&gt;{s.l}&lt;/div&gt;
            &lt;/div&gt;
          ))}
        &lt;/div&gt;

        {/* Question grid */}
        &lt;div style={{ background: &quot;#fff&quot;, borderRadius: 16, padding: 16, marginBottom: 14, border: `1px solid ${BORDER}` }}&gt;
          &lt;div style={{ fontSize: 13, fontWeight: 700, color: G, marginBottom: 12 }}&gt;{t(&quot;All Questions&quot;, &quot;جميع الأسئلة&quot;)}&lt;/div&gt;
          &lt;div style={{ display: &quot;grid&quot;, gridTemplateColumns: &quot;repeat(auto-fill,minmax(48px,1fr))&quot;, gap: 6 }}&gt;
            {questions.map((qq, i) =&gt; {
              const a = answers[qq.id];
              const confColor = a?.confidence === &quot;confident&quot; ? &quot;#6366f1&quot; : a?.confidence === &quot;unsure&quot; ? GOLD : a?.confidence === &quot;guessing&quot; ? &quot;#ef4444&quot; : null;
              return (
                &lt;button key={qq.id} onClick={() =&gt; { setIdx(i); setPhase(&quot;exam&quot;); }}
                  style={{ height: 48, borderRadius: 10, border: &quot;none&quot;, fontSize: 12, fontWeight: 700, cursor: &quot;pointer&quot;, position: &quot;relative&quot;, flexDirection: &quot;column&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot;, gap: 2,
                    background: a?.flagged ? &quot;#fffbeb&quot; : a?.text ? &quot;#f0fff4&quot; : &quot;#f8fafb&quot;,
                    color: a?.flagged ? GOLD : a?.text ? &quot;#22c55e&quot; : &quot;#7a9e88&quot;,
                    outline: i === currentIdx ? `2px solid ${G}` : &quot;&quot; }}&gt;
                  {i + 1}
                  {confColor &amp;&amp; &lt;div style={{ width: 6, height: 6, borderRadius: &quot;50%&quot;, background: confColor }} /&gt;}
                  {a?.flagged &amp;&amp; &lt;span style={{ position: &quot;absolute&quot;, top: 2, right: 3, fontSize: 8 }}&gt;🚩&lt;/span&gt;}
                &lt;/button&gt;
              );
            })}
          &lt;/div&gt;
        &lt;/div&gt;

        {/* Warnings */}
        {questions.length - answeredCount &gt; 0 &amp;&amp; (
          &lt;div style={{ background: &quot;#fff5f5&quot;, borderRadius: 12, padding: &quot;12px 16px&quot;, marginBottom: 12, display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 10, border: &quot;1px solid #fca5a5&quot; }}&gt;
            &lt;AlertTriangle style={{ width: 17, height: 17, color: &quot;#ef4444&quot;, flexShrink: 0 }} /&gt;
            &lt;span style={{ fontSize: 13, fontWeight: 700, color: &quot;#ef4444&quot; }}&gt;{questions.length - answeredCount} {t(&quot;questions unanswered — are you sure you want to submit?&quot;, &quot;أسئلة لم تُجب عليها — هل أنت متأكد من التقديم؟&quot;)}&lt;/span&gt;
          &lt;/div&gt;
        )}
        {deductedPoints &gt; 0 &amp;&amp; (
          &lt;div style={{ background: &quot;#fff5f5&quot;, borderRadius: 12, padding: &quot;12px 16px&quot;, marginBottom: 12, display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 10, border: &quot;1px solid #fca5a5&quot; }}&gt;
            &lt;AlertTriangle style={{ width: 17, height: 17, color: &quot;#ef4444&quot;, flexShrink: 0 }} /&gt;
            &lt;span style={{ fontSize: 13, fontWeight: 700, color: &quot;#ef4444&quot; }}&gt;−{deductedPoints} {t(&quot;points deducted for violations&quot;, &quot;نقاط خُصمت بسبب المخالفات&quot;)}&lt;/span&gt;
          &lt;/div&gt;
        )}

        &lt;div style={{ display: &quot;flex&quot;, gap: 10 }}&gt;
          &lt;button onClick={() =&gt; setPhase(&quot;exam&quot;)} style={{ flex: 1, padding: &quot;14px 0&quot;, borderRadius: 12, background: &quot;#f8fafb&quot;, border: `1.5px solid ${BORDER}`, color: G, fontSize: 14, fontWeight: 700, cursor: &quot;pointer&quot;, fontFamily: &quot;&#x27;Cairo&#x27;,sans-serif&quot; }}&gt;← {t(&quot;Continue Exam&quot;, &quot;متابعة الامتحان&quot;)}&lt;/button&gt;
          &lt;button onClick={handleSubmit} disabled={submitting}
            style={{ flex: 1, padding: &quot;14px 0&quot;, borderRadius: 12, background: submitting ? &quot;#9ca3af&quot; : &quot;#dc2626&quot;, border: &quot;none&quot;, color: &quot;#fff&quot;, fontSize: 14, fontWeight: 700, cursor: submitting ? &quot;not-allowed&quot; : &quot;pointer&quot;, fontFamily: &quot;&#x27;Cairo&#x27;,sans-serif&quot; }}&gt;
            {submitting ? t(&quot;Submitting…&quot;, &quot;جارٍ التقديم…&quot;) : t(&quot;Submit Exam ✓&quot;, &quot;تقديم الامتحان ✓&quot;)}
          &lt;/button&gt;
        &lt;/div&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  );

  // ── MAIN EXAM ──
  return (
    &lt;div style={{ height: &quot;100vh&quot;, display: &quot;flex&quot;, flexDirection: &quot;column&quot;, background: &quot;#f0f2f5&quot;, fontFamily: &quot;&#x27;Cairo&#x27;,sans-serif&quot;, userSelect: &quot;none&quot;, WebkitUserSelect: &quot;none&quot;, overflow: &quot;hidden&quot; }} onContextMenu={e =&gt; e.preventDefault()}&gt;
      &lt;style&gt;{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulseTimer{0%,100%{opacity:1}50%{opacity:.5}}
        @keyframes slideIn{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:translateX(0)}}
        *{box-sizing:border-box}
        @media print { body { display:none !important; } }
      `}&lt;/style&gt;

      {procEnabled &amp;&amp; !submitted &amp;&amp; (
        &lt;ProctoringOverlay cameraReady={proc.cameraReady} faceDetected={proc.faceDetected}
          integrityScore={proc.integrityScore} suspicionLevel={proc.suspicionLevel}
          strikes={proc.strikes} maxStrikes={proc.maxStrikes} violations={proc.violations}
          lastWarningType={proc.lastWarningType} audioMonitoring={proc.audioMonitoring}
          recentViolations={(proc as any).recentViolations} getStream={(proc as any).getStream}
          attemptId={attemptId || &quot;&quot;} onPointDeduction={handlePointDeduction} /&gt;
      )}

      {/* HEADER */}
      &lt;div style={{ height: 56, background: G, display: &quot;flex&quot;, alignItems: &quot;center&quot;, padding: &quot;0 10px&quot;, gap: 8, flexShrink: 0, zIndex: 40, boxShadow: &quot;0 2px 8px rgba(0,0,0,.3)&quot; }}&gt;
        &lt;BookOpen style={{ width: 15, height: 15, color: GOLD, flexShrink: 0 }} /&gt;
        &lt;span style={{ fontSize: 13, fontWeight: 800, color: &quot;#fff&quot;, overflow: &quot;hidden&quot;, textOverflow: &quot;ellipsis&quot;, whiteSpace: &quot;nowrap&quot;, flex: 1, minWidth: 0 }}&gt;
          {language === &quot;ar&quot; ? exam?.title_ar || exam?.title : exam?.title}
        &lt;/span&gt;
        {/* Timer */}
        &lt;div style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 4, background: timerBg, border: `1.5px solid ${timerColor}66`, borderRadius: 20, padding: &quot;4px 10px&quot;, flexShrink: 0, animation: isTimeCrit ? &quot;pulseTimer 1s infinite&quot; : &quot;none&quot; }}&gt;
          &lt;Clock style={{ width: 12, height: 12, color: timerColor }} /&gt;
          &lt;span style={{ fontSize: 14, fontWeight: 900, color: timerColor, fontVariantNumeric: &quot;tabular-nums&quot; }}&gt;{fmt(timeLeft)}&lt;/span&gt;
        &lt;/div&gt;
        {/* Save indicator */}
        &lt;div style={{ fontSize: 9, color: &quot;rgba(255,255,255,.4)&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 2, flexShrink: 0 }}&gt;
          {saving ? &lt;div style={{ width: 7, height: 7, border: &quot;1px solid rgba(255,255,255,.3)&quot;, borderTopColor: &quot;transparent&quot;, borderRadius: &quot;50%&quot;, animation: &quot;spin .8s linear infinite&quot; }} /&gt; : lastSaved ? &lt;div style={{ width: 5, height: 5, borderRadius: &quot;50%&quot;, background: &quot;#22c55e&quot; }} /&gt; : null}
        &lt;/div&gt;
        &lt;span style={{ fontSize: 11, color: &quot;rgba(255,255,255,.65)&quot;, background: &quot;rgba(255,255,255,.1)&quot;, borderRadius: 16, padding: &quot;2px 8px&quot;, flexShrink: 0, whiteSpace: &quot;nowrap&quot; }}&gt;{answeredCount}/{questions.length}&lt;/span&gt;
        {deductedPoints &gt; 0 &amp;&amp; &lt;span style={{ fontSize: 10, color: &quot;#fca5a5&quot;, fontWeight: 700, flexShrink: 0 }}&gt;−{deductedPoints}pts&lt;/span&gt;}

        {/* Proctoring pill */}
        {procEnabled &amp;&amp; (
          &lt;div style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 3, background: &quot;rgba(0,0,0,.3)&quot;, borderRadius: 16, padding: &quot;3px 7px&quot;, flexShrink: 0, cursor: &quot;pointer&quot; }} onClick={() =&gt; setShowProcLog(v =&gt; !v)}&gt;
            &lt;div style={{ width: 5, height: 5, borderRadius: &quot;50%&quot;, background: proc.suspicionLevel === &quot;low&quot; ? &quot;#22c55e&quot; : proc.suspicionLevel === &quot;medium&quot; ? &quot;#f59e0b&quot; : &quot;#ef4444&quot; }} /&gt;
            &lt;span style={{ fontSize: 9, fontWeight: 700, color: &quot;rgba(255,255,255,.7)&quot; }}&gt;{Math.round(proc.integrityScore)}%&lt;/span&gt;
            {proc.violations &gt; 0 &amp;&amp; &lt;span style={{ fontSize: 8, background: &quot;#dc2626&quot;, color: &quot;#fff&quot;, borderRadius: 8, padding: &quot;0 4px&quot;, fontWeight: 900 }}&gt;{proc.violations}&lt;/span&gt;}
          &lt;/div&gt;
        )}

        {/* Keyboard help */}
        {!isMobile &amp;&amp; (
          &lt;button onClick={() =&gt; setShowKeyboardHelp(v =&gt; !v)} title=&quot;Keyboard shortcuts&quot; style={{ background: &quot;rgba(255,255,255,.1)&quot;, border: &quot;none&quot;, color: &quot;rgba(255,255,255,.6)&quot;, borderRadius: 8, padding: &quot;5px 7px&quot;, cursor: &quot;pointer&quot;, flexShrink: 0 }}&gt;
            &lt;Keyboard style={{ width: 12, height: 12 }} /&gt;
          &lt;/button&gt;
        )}

        &lt;button onClick={() =&gt; setShowNav(v =&gt; !v)} style={{ background: &quot;rgba(255,255,255,.12)&quot;, border: &quot;none&quot;, color: &quot;rgba(255,255,255,.8)&quot;, borderRadius: 8, padding: &quot;5px 7px&quot;, cursor: &quot;pointer&quot;, flexShrink: 0 }}&gt;
          &lt;Grid style={{ width: 13, height: 13 }} /&gt;
        &lt;/button&gt;
        &lt;button onClick={() =&gt; { saveAnswers(true); setPhase(&quot;review&quot;); }}
          style={{ background: &quot;#dc2626&quot;, border: &quot;none&quot;, color: &quot;#fff&quot;, borderRadius: 9, padding: &quot;6px 10px&quot;, fontSize: 11, fontWeight: 800, cursor: &quot;pointer&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 4, fontFamily: &quot;&#x27;Cairo&#x27;,sans-serif&quot;, flexShrink: 0 }}&gt;
          &lt;Eye style={{ width: 12, height: 12 }} /&gt;{t(&quot;Submit&quot;, &quot;تقديم&quot;)}
        &lt;/button&gt;
      &lt;/div&gt;

      {/* Keyboard help overlay */}
      {showKeyboardHelp &amp;&amp; (
        &lt;div style={{ position: &quot;fixed&quot;, top: 64, right: 10, background: &quot;#1a1a2e&quot;, borderRadius: 14, padding: &quot;14px 18px&quot;, zIndex: 100, boxShadow: &quot;0 8px 32px rgba(0,0,0,.4)&quot;, minWidth: 200 }}&gt;
          &lt;div style={{ fontSize: 11, fontWeight: 700, color: GOLD, marginBottom: 10, letterSpacing: 1 }}&gt;KEYBOARD SHORTCUTS&lt;/div&gt;
          {[[&quot;→ / ↓&quot;, &quot;Next question&quot;], [&quot;← / ↑&quot;, &quot;Previous question&quot;], [&quot;F&quot;, &quot;Flag/unflag&quot;], [&quot;1&quot;, &quot;Mark Confident&quot;], [&quot;2&quot;, &quot;Mark Unsure&quot;], [&quot;3&quot;, &quot;Mark Guessing&quot;]].map(([k, v]) =&gt; (
            &lt;div key={k} style={{ display: &quot;flex&quot;, justifyContent: &quot;space-between&quot;, gap: 16, marginBottom: 5, fontSize: 11 }}&gt;
              &lt;span style={{ color: &quot;#fff&quot;, background: &quot;rgba(255,255,255,.1)&quot;, padding: &quot;2px 8px&quot;, borderRadius: 4, fontFamily: &quot;monospace&quot; }}&gt;{k}&lt;/span&gt;
              &lt;span style={{ color: &quot;rgba(255,255,255,.6)&quot; }}&gt;{v}&lt;/span&gt;
            &lt;/div&gt;
          ))}
        &lt;/div&gt;
      )}

      {/* Progress bar */}
      &lt;div style={{ height: 4, background: &quot;rgba(0,0,0,.15)&quot;, flexShrink: 0 }}&gt;
        &lt;div style={{ height: &quot;100%&quot;, width: `${progressPct}%`, background: `linear-gradient(90deg,${GM},${GOLD})`, transition: &quot;width .5s&quot; }} /&gt;
      &lt;/div&gt;

      {/* BODY */}
      &lt;div style={{ flex: 1, display: &quot;flex&quot;, overflow: &quot;hidden&quot;, minHeight: 0 }}&gt;

        {/* LEFT: Question nav (desktop) */}
        {!isMobile &amp;&amp; (
          &lt;div style={{ width: 180, background: &quot;#fff&quot;, borderRight: `1px solid ${BORDER}`, display: &quot;flex&quot;, flexDirection: &quot;column&quot;, overflow: &quot;hidden&quot;, flexShrink: 0 }}&gt;
            &lt;div style={{ padding: &quot;10px 10px 8px&quot;, borderBottom: `1px solid ${BORDER}` }}&gt;
              &lt;div style={{ fontSize: 9, fontWeight: 800, color: &quot;#7a9e88&quot;, letterSpacing: 1.5, marginBottom: 8 }}&gt;QUESTIONS&lt;/div&gt;
              &lt;div style={{ display: &quot;grid&quot;, gridTemplateColumns: &quot;repeat(4,1fr)&quot;, gap: 4, maxHeight: 300, overflowY: &quot;auto&quot; }}&gt;
                {questions.map((qq, i) =&gt; {
                  const a = answers[qq.id];
                  const confDot = a?.confidence === &quot;confident&quot; ? &quot;#6366f1&quot; : a?.confidence === &quot;unsure&quot; ? GOLD : a?.confidence === &quot;guessing&quot; ? &quot;#ef4444&quot; : null;
                  return (
                    &lt;button key={qq.id} onClick={() =&gt; setIdx(i)} title={`Q${i + 1} — ${a?.text ? &quot;Answered&quot; : &quot;Unanswered&quot;}${a?.flagged ? &quot; · Flagged&quot; : &quot;&quot;}${a?.confidence ? ` · ${a.confidence}` : &quot;&quot;}`}
                      style={{ height: 38, borderRadius: 8, border: &quot;none&quot;, fontSize: 11, fontWeight: 800, cursor: &quot;pointer&quot;, position: &quot;relative&quot;, flexDirection: &quot;column&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot;, gap: 1.5, transition: &quot;all .12s&quot;,
                        background: i === currentIdx ? G : a?.flagged ? &quot;#fffbeb&quot; : a?.text ? &quot;#f0fff4&quot; : &quot;#f8fafb&quot;,
                        color: i === currentIdx ? &quot;#fff&quot; : a?.flagged ? GOLD : a?.text ? &quot;#22c55e&quot; : &quot;#7a9e88&quot;,
                        outline: i === currentIdx ? `2px solid ${GOLD}` : a?.flagged ? `1px solid ${GOLD}` : a?.text ? `1px solid #86efac` : `1px solid transparent` }}&gt;
                      {i + 1}
                      {confDot &amp;&amp; &lt;div style={{ width: 4, height: 4, borderRadius: &quot;50%&quot;, background: confDot }} /&gt;}
                      {a?.flagged &amp;&amp; &lt;span style={{ position: &quot;absolute&quot;, top: 1, right: 2, fontSize: 7 }}&gt;🚩&lt;/span&gt;}
                    &lt;/button&gt;
                  );
                })}
              &lt;/div&gt;
            &lt;/div&gt;
            &lt;div style={{ padding: &quot;8px 10px&quot;, display: &quot;flex&quot;, flexDirection: &quot;column&quot;, gap: 4 }}&gt;
              {[[&quot;#f0fff4&quot;, &quot;#86efac&quot;, &quot;#22c55e&quot;, `Answered (${answeredCount})`], [&quot;#fffbeb&quot;, GOLD, GOLD, `Flagged (${flaggedCount})`], [&quot;#f8fafb&quot;, BORDER, &quot;#9ca3af&quot;, `Unanswered (${questions.length - answeredCount})`], [&quot;#eef2ff&quot;, &quot;#a5b4fc&quot;, &quot;#6366f1&quot;, `Confident (${confidentCount})`]].map(([bg, bd, c, lb], i) =&gt; (
                &lt;div key={i} style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 5, fontSize: 9 }}&gt;
                  &lt;div style={{ width: 10, height: 10, borderRadius: 3, background: bg, border: `1px solid ${bd}`, flexShrink: 0 }} /&gt;
                  &lt;span style={{ color: &quot;#7a9e88&quot; }}&gt;{lb}&lt;/span&gt;
                &lt;/div&gt;
              ))}
            &lt;/div&gt;
            &lt;div style={{ marginTop: &quot;auto&quot;, padding: &quot;8px 10px&quot;, borderTop: `1px solid ${BORDER}`, fontSize: 9, display: &quot;flex&quot;, flexDirection: &quot;column&quot;, gap: 4 }}&gt;
              &lt;div style={{ display: &quot;flex&quot;, justifyContent: &quot;space-between&quot;, color: &quot;#7a9e88&quot; }}&gt;&lt;span&gt;Pass Mark&lt;/span&gt;&lt;span style={{ fontWeight: 800, color: G }}&gt;{exam?.passing_score}%&lt;/span&gt;&lt;/div&gt;
              &lt;div style={{ display: &quot;flex&quot;, justifyContent: &quot;space-between&quot;, color: &quot;#7a9e88&quot; }}&gt;&lt;span&gt;Questions&lt;/span&gt;&lt;span style={{ fontWeight: 800, color: G }}&gt;{questions.length}&lt;/span&gt;&lt;/div&gt;
              {deductedPoints &gt; 0 &amp;&amp; &lt;div style={{ display: &quot;flex&quot;, justifyContent: &quot;space-between&quot;, color: &quot;#ef4444&quot; }}&gt;&lt;span&gt;Deducted&lt;/span&gt;&lt;span style={{ fontWeight: 800 }}&gt;−{deductedPoints}pts&lt;/span&gt;&lt;/div&gt;}
            &lt;/div&gt;
          &lt;/div&gt;
        )}

        {/* CENTER: QUESTION */}
        &lt;div style={{ flex: 1, overflow: &quot;auto&quot;, padding: &quot;12px&quot;, display: &quot;flex&quot;, flexDirection: &quot;column&quot; }}&gt;
          {q &amp;&amp; (
            &lt;div style={{ maxWidth: 720, margin: &quot;0 auto&quot;, width: &quot;100%&quot;, animation: &quot;slideIn .2s ease&quot; }} key={currentIdx}&gt;
              &lt;div style={{ background: &quot;#fff&quot;, borderRadius: 20, boxShadow: &quot;0 4px 24px rgba(0,0,0,.1)&quot;, overflow: &quot;hidden&quot; }}&gt;

                {/* Question header */}
                &lt;div style={{ background: `linear-gradient(135deg,${G} 0%,${GM} 100%)`, padding: &quot;16px 20px&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 10 }}&gt;
                  &lt;div style={{ width: 40, height: 40, borderRadius: &quot;50%&quot;, background: &quot;rgba(255,255,255,.18)&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot;, fontSize: 17, fontWeight: 900, color: &quot;#fff&quot;, flexShrink: 0, border: &quot;2px solid rgba(255,255,255,.25)&quot; }}&gt;{currentIdx + 1}&lt;/div&gt;
                  &lt;div style={{ flex: 1, display: &quot;flex&quot;, gap: 6, flexWrap: &quot;wrap&quot;, alignItems: &quot;center&quot; }}&gt;
                    &lt;span style={{ fontSize: 11, padding: &quot;3px 10px&quot;, borderRadius: 20, background: &quot;rgba(255,255,255,.15)&quot;, color: &quot;rgba(255,255,255,.9)&quot;, fontWeight: 700, textTransform: &quot;capitalize&quot; }}&gt;
                      {q.question_type?.replace(/_/g, &quot; &quot;)}
                    &lt;/span&gt;
                    {q.difficulty &amp;&amp; (
                      &lt;span style={{ fontSize: 11, padding: &quot;3px 10px&quot;, borderRadius: 20, background: q.difficulty === &quot;hard&quot; ? &quot;rgba(239,68,68,.35)&quot; : q.difficulty === &quot;easy&quot; ? &quot;rgba(34,197,94,.35)&quot; : &quot;rgba(255,255,255,.15)&quot;, color: &quot;#fff&quot;, fontWeight: 700 }}&gt;{q.difficulty}&lt;/span&gt;
                    )}
                    {q.section_title &amp;&amp; (
                      &lt;span style={{ fontSize: 10, padding: &quot;2px 8px&quot;, borderRadius: 20, background: &quot;rgba(201,168,76,.3)&quot;, color: GOLD, fontWeight: 600 }}&gt;§ {q.section_title}&lt;/span&gt;
                    )}
                    &lt;span style={{ fontSize: 11, padding: &quot;3px 10px&quot;, borderRadius: 20, background: &quot;rgba(201,168,76,.3)&quot;, color: GOLD, fontWeight: 800, marginLeft: &quot;auto&quot; }}&gt;{q.points || 1} {t(&quot;pts&quot;, &quot;نقطة&quot;)}&lt;/span&gt;
                  &lt;/div&gt;
                  &lt;button onClick={() =&gt; toggleFlag(q.id)}
                    style={{ width: 38, height: 38, borderRadius: 10, border: &quot;none&quot;, background: answers[q.id]?.flagged ? &quot;#dc2626&quot; : &quot;rgba(255,255,255,.18)&quot;, color: &quot;#fff&quot;, cursor: &quot;pointer&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot;, flexShrink: 0, transition: &quot;all .15s&quot; }}&gt;
                    &lt;Flag style={{ width: 16, height: 16 }} /&gt;
                  &lt;/button&gt;
                &lt;/div&gt;

                {/* Question body */}
                &lt;div style={{ padding: &quot;22px 22px 10px&quot; }}&gt;
                  {/* Question text — Arabic first, English below, brackets removed */}
                  &lt;div style={{ marginBottom: 20 }}&gt;
                    {(q.question_text || q.question_text_ar)
                      ? &lt;QText text={sanitizeHtml(q.question_text||&#x27;&#x27;)} textAr={sanitizeHtml(q.question_text_ar||&#x27;&#x27;)} /&gt;
                      : &lt;p style={{ color: &quot;#9ca3af&quot;, fontStyle: &quot;italic&quot;, fontSize: 14 }}&gt;Question text missing.&lt;/p&gt;
                    }
                    {/* Media */}
                    {q.media_url &amp;&amp; (q.question_type === &quot;audio&quot; || q.question_type === &quot;dictation&quot; || q.question_type === &quot;audio_dictation&quot;) &amp;&amp; (
                      &lt;div style={{ marginTop: 12 }}&gt;
                        &lt;AudioPlayer src={q.media_url} title={t(&quot;Listen carefully&quot;, &quot;استمع بعناية&quot;)} maxPlays={3} /&gt;
                        {/* Fallback native player in case AudioPlayer fails */}
                        &lt;audio controls preload=&quot;metadata&quot; src={q.media_url} crossOrigin=&quot;anonymous&quot;
                          style={{ width: &quot;100%&quot;, marginTop: 6, borderRadius: 8, display: &quot;block&quot; }}
                          onError={e =&gt; { (e.target as HTMLAudioElement).style.display = &quot;block&quot;; }}
                        /&gt;
                      &lt;/div&gt;
                    )}
                    {q.media_url &amp;&amp; q.question_type === &quot;video&quot; &amp;&amp; &lt;div style={{ marginTop: 12, borderRadius: 12, overflow: &quot;hidden&quot; }}&gt;&lt;video controls src={q.media_url} style={{ width: &quot;100%&quot;, maxHeight: 240, background: &quot;#000&quot; }} /&gt;&lt;/div&gt;}
                    {q.media_url &amp;&amp; isImageUrl(q.media_url) &amp;&amp; ![&quot;audio&quot;, &quot;dictation&quot;, &quot;video&quot;].includes(q.question_type) &amp;&amp; &lt;img src={q.media_url} alt=&quot;&quot; style={{ marginTop: 12, maxHeight: 240, borderRadius: 10, objectFit: &quot;contain&quot;, display: &quot;block&quot; }} /&gt;}
                    {q.media_url &amp;&amp; !isImageUrl(q.media_url) &amp;&amp; ![&quot;audio&quot;, &quot;dictation&quot;, &quot;video&quot;].includes(q.question_type) &amp;&amp; &lt;div style={{ marginTop: 12 }}&gt;&lt;AudioPlayer src={q.media_url} title=&quot;Audio&quot; /&gt;&lt;/div&gt;}
                  &lt;/div&gt;

                  {/* MCQ */}
                  {(q.question_type === &quot;mcq&quot; || q.question_type === &quot;image_mcq&quot;) &amp;&amp; q.options &amp;&amp; (
                    &lt;div style={{ display: &quot;flex&quot;, flexDirection: &quot;column&quot;, gap: 11 }}&gt;
                      {(q.options as any[]).map((opt: any, idx: number) =&gt; {
                        const sel = answers[q.id]?.text === opt.id;
                        return (
                          &lt;div key={opt.id} onClick={() =&gt; setAnswer(q.id, opt.id)}
                            style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 14, padding: &quot;15px 18px&quot;, borderRadius: 14, cursor: &quot;pointer&quot;, transition: &quot;all .15s&quot;, background: sel ? &quot;#f0fff4&quot; : &quot;#f8fafb&quot;, border: `2px solid ${sel ? &quot;#22c55e&quot; : BORDER}`, boxShadow: sel ? &quot;0 2px 12px rgba(34,197,94,.2)&quot; : &quot;0 1px 4px rgba(0,0,0,.04)&quot; }}&gt;
                            &lt;div style={{ width: 36, height: 36, borderRadius: &quot;50%&quot;, background: sel ? GM : &quot;rgba(15,45,31,.08)&quot;, display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot;, fontSize: 14, fontWeight: 900, color: sel ? &quot;#fff&quot; : G, flexShrink: 0, border: `2px solid ${sel ? GM : BORDER}` }}&gt;
                              {String.fromCharCode(65 + idx)}
                            &lt;/div&gt;
                            {opt.image_url &amp;&amp; &lt;img src={opt.image_url} alt=&quot;&quot; style={{ height: 64, borderRadius: 8, objectFit: &quot;contain&quot; }} /&gt;}
                            &lt;div style={{ flex: 1 }}&gt;
                              {opt.text &amp;&amp; &lt;div dir=&quot;auto&quot; style={{ fontSize: 16, fontWeight: sel ? 700 : 500, color: sel ? G : &quot;#374151&quot;, fontFamily: &quot;&#x27;Amiri&#x27;,serif&quot;, lineHeight: 1.9 }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(opt.text) }} /&gt;}
                              {opt.text_ar &amp;&amp; opt.text_ar !== opt.text &amp;&amp; &lt;div dir=&quot;rtl&quot; style={{ fontSize: 18, fontFamily: &quot;&#x27;Amiri Quran&#x27;,serif&quot;, color: G, lineHeight: 2.1, marginTop: 3 }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(opt.text_ar) }} /&gt;}
                            &lt;/div&gt;
                            &lt;div style={{ width: 24, height: 24, borderRadius: &quot;50%&quot;, background: sel ? &quot;#22c55e&quot; : &quot;transparent&quot;, border: `2px solid ${sel ? &quot;#22c55e&quot; : BORDER}`, display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot;, flexShrink: 0, transition: &quot;all .15s&quot; }}&gt;
                              {sel &amp;&amp; &lt;span style={{ color: &quot;#fff&quot;, fontSize: 14, fontWeight: 900 }}&gt;✓&lt;/span&gt;}
                            &lt;/div&gt;
                          &lt;/div&gt;
                        );
                      })}
                    &lt;/div&gt;
                  )}

                  {/* Multi-select */}
                  {q.question_type === &quot;multi_select&quot; &amp;&amp; (
                    &lt;MultiSelectQuestion question={q} answer={answers[q.id]} onAnswer={(text, data) =&gt; setAnswer(q.id, text, data)} /&gt;
                  )}

                  {/* True/False */}
                  {q.question_type === &quot;true_false&quot; &amp;&amp; (
                    &lt;div style={{ display: &quot;grid&quot;, gridTemplateColumns: &quot;1fr 1fr&quot;, gap: 14 }}&gt;
                      {[{ v: &quot;true&quot;, l: t(&quot;True&quot;, &quot;صح&quot;), e: &quot;✓&quot;, c: &quot;#22c55e&quot; }, { v: &quot;false&quot;, l: t(&quot;False&quot;, &quot;خطأ&quot;), e: &quot;✗&quot;, c: &quot;#ef4444&quot; }].map(opt =&gt; {
                        const sel = answers[q.id]?.text === opt.v;
                        return (
                          &lt;div key={opt.v} onClick={() =&gt; setAnswer(q.id, opt.v)}
                            style={{ display: &quot;flex&quot;, flexDirection: &quot;column&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot;, padding: &quot;24px 12px&quot;, borderRadius: 16, cursor: &quot;pointer&quot;, background: sel ? opt.c + &quot;18&quot; : &quot;#f8fafb&quot;, border: `2px solid ${sel ? opt.c : BORDER}`, boxShadow: sel ? `0 2px 12px ${opt.c}33` : &quot;none&quot;, transition: &quot;all .15s&quot; }}&gt;
                            &lt;span style={{ fontSize: 38, marginBottom: 8 }}&gt;{opt.e}&lt;/span&gt;
                            &lt;span style={{ fontSize: 20, fontWeight: 800, color: sel ? opt.c : G, fontFamily: &quot;&#x27;Amiri&#x27;,serif&quot; }}&gt;{opt.l}&lt;/span&gt;
                          &lt;/div&gt;
                        );
                      })}
                    &lt;/div&gt;
                  )}

                  {/* Fill blank */}
                  {q.question_type === &quot;fill_blank&quot; &amp;&amp; (
                    &lt;input dir=&quot;auto&quot; placeholder={t(&quot;Type your answer here…&quot;, &quot;اكتب إجابتك هنا…&quot;)} value={answers[q.id]?.text || &quot;&quot;} onChange={e =&gt; setAnswer(q.id, e.target.value)}
                      style={{ width: &quot;100%&quot;, padding: &quot;15px 16px&quot;, borderRadius: 14, border: `2px solid ${BORDER}`, fontSize: 17, outline: &quot;none&quot;, color: G, background: &quot;#f8fafb&quot;, fontFamily: &quot;&#x27;Amiri&#x27;,serif&quot;, transition: &quot;border .15s&quot; }}
                      onFocus={e =&gt; (e.target.style.borderColor = GM)} onBlur={e =&gt; (e.target.style.borderColor = BORDER)} /&gt;
                  )}

                  {/* Essay/Short */}
                  {(q.question_type === &quot;short_answer&quot; || q.question_type === &quot;essay&quot;) &amp;&amp; (
                    &lt;&gt;
                      &lt;textarea dir=&quot;auto&quot; rows={q.question_type === &quot;essay&quot; ? 8 : 5} placeholder={t(&quot;Write your answer here…&quot;, &quot;اكتب إجابتك هنا…&quot;)} value={answers[q.id]?.text || &quot;&quot;} onChange={e =&gt; setAnswer(q.id, e.target.value)}
                        style={{ width: &quot;100%&quot;, padding: &quot;15px 16px&quot;, borderRadius: 14, border: `2px solid ${BORDER}`, fontSize: 17, outline: &quot;none&quot;, color: G, background: &quot;#f8fafb&quot;, resize: &quot;vertical&quot;, lineHeight: 1.9, fontFamily: &quot;&#x27;Amiri&#x27;,serif&quot;, transition: &quot;border .15s&quot; }}
                        onFocus={e =&gt; (e.target.style.borderColor = GM)} onBlur={e =&gt; (e.target.style.borderColor = BORDER)} /&gt;
                      {q.question_type === &quot;essay&quot; &amp;&amp; exam?.word_limit &amp;&amp; (
                        &lt;div style={{ fontSize: 11, color: &quot;#9ca3af&quot;, marginTop: 4, textAlign: &quot;right&quot; }}&gt;
                          {(answers[q.id]?.text || &quot;&quot;).split(/\s+/).filter(Boolean).length} / {exam.word_limit} words
                        &lt;/div&gt;
                      )}
                    &lt;/&gt;
                  )}

                  {/* Audio/Dictation */}
                  {(q.question_type === &quot;audio&quot; || q.question_type === &quot;dictation&quot;) &amp;&amp; (
                    &lt;div style={{ display: &quot;flex&quot;, flexDirection: &quot;column&quot;, gap: 12 }}&gt;
                      &lt;textarea dir=&quot;auto&quot; rows={4} placeholder={t(&quot;Write what you heard…&quot;, &quot;اكتب ما سمعته…&quot;)} value={answers[q.id]?.text || &quot;&quot;} onChange={e =&gt; setAnswer(q.id, e.target.value)}
                        style={{ padding: &quot;15px 16px&quot;, borderRadius: 14, border: `2px solid ${BORDER}`, fontSize: 17, outline: &quot;none&quot;, color: G, background: &quot;#f8fafb&quot;, resize: &quot;none&quot;, fontFamily: &quot;&#x27;Amiri&#x27;,serif&quot; }} /&gt;
                      &lt;p style={{ fontSize: 12, color: &quot;#9ca3af&quot; }}&gt;{t(&quot;Or record your answer:&quot;, &quot;أو سجّل إجابتك:&quot;)}&lt;/p&gt;
                      &lt;AudioRecorder onRecordingComplete={async (blob, url) =&gt; {
                        if (!blob.size) { toast({ title: &quot;Recording empty.&quot;, variant: &quot;destructive&quot; }); return; }
                        const path = `student-answers/${user!.id}/${attemptId}_${q.id}.webm`;
                        const { error } = await supabase.storage.from(&quot;exam-media&quot;).upload(path, blob, { upsert: true });
                        if (!error) { const { data: ud } = await supabase.storage.from(&quot;exam-media&quot;).createSignedUrl(path, 3600); setAnswer(q.id, answers[q.id]?.text || &quot;[audio_recorded]&quot;, { audioUrl: ud?.signedUrl || url, fileType: &quot;audio&quot; }); }
                        else { toast({ title: &quot;Upload failed.&quot;, variant: &quot;destructive&quot; }); setAnswer(q.id, answers[q.id]?.text || &quot;[audio_recorded]&quot;, { audioUrl: url, fileType: &quot;audio&quot; }); }
                      }} existingUrl={answers[q.id]?.data?.audioUrl} /&gt;
                    &lt;/div&gt;
                  )}

                  {/* Matching */}
                  {q.question_type === &quot;matching&quot; &amp;&amp; (
                    &lt;MatchingQuestion question={q} answer={answers[q.id]} onAnswer={(text, data) =&gt; setAnswer(q.id, text, data)} /&gt;
                  )}

                  {/* Ordering */}
                  {q.question_type === &quot;ordering&quot; &amp;&amp; (
                    &lt;OrderingQuestion question={q} answer={answers[q.id]} onAnswer={(text, data) =&gt; setAnswer(q.id, text, data)} /&gt;
                  )}

                  {/* Reading comprehension */}
                  {q.question_type === &quot;reading&quot; &amp;&amp; (
                    &lt;ReadingQuestion question={q} answer={answers[q.id]} onAnswer={(text, data) =&gt; setAnswer(q.id, text, data)} /&gt;
                  )}

                  {/* Confidence selector */}
                  {answers[q.id]?.text &amp;&amp; (
                    &lt;ConfidenceSelector value={answers[q.id]?.confidence || null} onChange={c =&gt; setConfidence(q.id, c)} /&gt;
                  )}
                &lt;/div&gt;

                {/* Navigation footer */}
                &lt;div style={{ padding: &quot;14px 20px&quot;, borderTop: `1px solid ${BORDER}`, display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 10, background: &quot;#fafafa&quot; }}&gt;
                  &lt;button onClick={() =&gt; setIdx(p =&gt; Math.max(0, p - 1))} disabled={currentIdx === 0}
                    style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 6, padding: &quot;11px 18px&quot;, borderRadius: 12, background: &quot;#fff&quot;, border: `1.5px solid ${BORDER}`, color: currentIdx === 0 ? &quot;#d1d5db&quot; : G, fontSize: 14, fontWeight: 700, cursor: currentIdx === 0 ? &quot;not-allowed&quot; : &quot;pointer&quot;, opacity: currentIdx === 0 ? 0.5 : 1, fontFamily: &quot;&#x27;Cairo&#x27;,sans-serif&quot;, boxShadow: &quot;0 1px 4px rgba(0,0,0,.06)&quot; }}&gt;
                    &lt;ChevronLeft style={{ width: 15, height: 15 }} /&gt;{t(&quot;Previous&quot;, &quot;السابق&quot;)}
                  &lt;/button&gt;
                  &lt;span style={{ flex: 1, textAlign: &quot;center&quot;, fontSize: 13, color: &quot;#6b7280&quot;, fontWeight: 600 }}&gt;{currentIdx + 1} of {questions.length}&lt;/span&gt;
                  {currentIdx === questions.length - 1 ? (
                    &lt;button onClick={() =&gt; { saveAnswers(true); setPhase(&quot;review&quot;); }}
                      style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 6, padding: &quot;11px 18px&quot;, borderRadius: 12, background: G, border: &quot;none&quot;, color: &quot;#fff&quot;, fontSize: 14, fontWeight: 700, cursor: &quot;pointer&quot;, fontFamily: &quot;&#x27;Cairo&#x27;,sans-serif&quot;, boxShadow: `0 2px 8px rgba(15,45,31,.3)` }}&gt;
                      &lt;Eye style={{ width: 14, height: 14 }} /&gt;{t(&quot;Review &amp; Submit&quot;, &quot;مراجعة وتقديم&quot;)}
                    &lt;/button&gt;
                  ) : (
                    &lt;button onClick={() =&gt; setIdx(p =&gt; Math.min(questions.length - 1, p + 1))}
                      style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 6, padding: &quot;11px 18px&quot;, borderRadius: 12, background: G, border: &quot;none&quot;, color: &quot;#fff&quot;, fontSize: 14, fontWeight: 700, cursor: &quot;pointer&quot;, fontFamily: &quot;&#x27;Cairo&#x27;,sans-serif&quot;, boxShadow: `0 2px 8px rgba(15,45,31,.3)` }}&gt;
                      {t(&quot;Next&quot;, &quot;التالي&quot;)}&lt;ChevronRight style={{ width: 15, height: 15 }} /&gt;
                    &lt;/button&gt;
                  )}
                &lt;/div&gt;
              &lt;/div&gt;
            &lt;/div&gt;
          )}
        &lt;/div&gt;

        {/* RIGHT: Summary + timer (desktop) */}
        {!isMobile &amp;&amp; (
          &lt;div style={{ width: 180, background: &quot;#fff&quot;, borderLeft: `1px solid ${BORDER}`, display: &quot;flex&quot;, flexDirection: &quot;column&quot;, flexShrink: 0, padding: 12, gap: 10, overflow: &quot;hidden&quot; }}&gt;
            &lt;div style={{ textAlign: &quot;center&quot;, background: timerBg, borderRadius: 12, padding: &quot;12px 8px&quot;, border: `1.5px solid ${timerColor}44` }}&gt;
              &lt;div style={{ fontSize: 9, fontWeight: 700, color: &quot;#9ca3af&quot;, letterSpacing: 1.5, marginBottom: 3 }}&gt;TIME LEFT&lt;/div&gt;
              &lt;div style={{ fontSize: 28, fontWeight: 900, color: timerColor, fontVariantNumeric: &quot;tabular-nums&quot;, animation: isTimeCrit ? &quot;pulseTimer 1s infinite&quot; : &quot;none&quot; }}&gt;{fmt(timeLeft)}&lt;/div&gt;
            &lt;/div&gt;
            &lt;div style={{ background: &quot;#f8fafb&quot;, borderRadius: 12, padding: &quot;10px&quot;, display: &quot;flex&quot;, flexDirection: &quot;column&quot;, gap: 7, border: `1px solid ${BORDER}` }}&gt;
              {[{ l: t(&quot;Answered&quot;, &quot;مُجاب&quot;), v: answeredCount, c: &quot;#22c55e&quot; }, { l: t(&quot;Flagged&quot;, &quot;مُعلّم&quot;), v: flaggedCount, c: GOLD }, { l: t(&quot;Unanswered&quot;, &quot;غير مُجاب&quot;), v: questions.length - answeredCount, c: &quot;#ef4444&quot; }, { l: t(&quot;Confident&quot;, &quot;واثق&quot;), v: confidentCount, c: &quot;#6366f1&quot; }].map((s, i) =&gt; (
                &lt;div key={i} style={{ display: &quot;flex&quot;, justifyContent: &quot;space-between&quot;, fontSize: 11 }}&gt;
                  &lt;span style={{ color: &quot;#9ca3af&quot; }}&gt;{s.l}&lt;/span&gt;&lt;span style={{ fontWeight: 800, color: s.c }}&gt;{s.v}&lt;/span&gt;
                &lt;/div&gt;
              ))}
              &lt;div style={{ height: 5, borderRadius: 3, background: &quot;#f0f4f0&quot;, overflow: &quot;hidden&quot;, marginTop: 2 }}&gt;
                &lt;div style={{ height: &quot;100%&quot;, width: `${progressPct}%`, background: `linear-gradient(90deg,${GM},${GOLD})`, transition: &quot;width .5s&quot;, borderRadius: 3 }} /&gt;
              &lt;/div&gt;
            &lt;/div&gt;
            {deductedPoints &gt; 0 &amp;&amp; (
              &lt;div style={{ background: &quot;#fff5f5&quot;, borderRadius: 10, padding: &quot;8px 10px&quot;, border: &quot;1px solid #fca5a5&quot;, fontSize: 11, color: &quot;#ef4444&quot;, fontWeight: 700, textAlign: &quot;center&quot; }}&gt;
                −{deductedPoints} pts&lt;br /&gt;&lt;span style={{ fontWeight: 400, fontSize: 9, color: &quot;#9ca3af&quot; }}&gt;proctoring violations&lt;/span&gt;
              &lt;/div&gt;
            )}
            &lt;button onClick={() =&gt; saveAnswers(false)} style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;center&quot;, gap: 5, padding: &quot;8px 0&quot;, borderRadius: 10, background: &quot;#f8fafb&quot;, border: `1px solid ${BORDER}`, color: G, fontSize: 11, fontWeight: 700, cursor: &quot;pointer&quot;, fontFamily: &quot;&#x27;Cairo&#x27;,sans-serif&quot; }}&gt;
              &lt;Save style={{ width: 11, height: 11 }} /&gt;{saving ? &quot;Saving…&quot; : &quot;Save Now&quot;}
            &lt;/button&gt;
            &lt;div style={{ fontSize: 9, color: &quot;#9ca3af&quot;, display: &quot;flex&quot;, flexDirection: &quot;column&quot;, gap: 3, marginTop: &quot;auto&quot;, paddingTop: 6, borderTop: `1px solid ${BORDER}` }}&gt;
              &lt;div style={{ display: &quot;flex&quot;, justifyContent: &quot;space-between&quot; }}&gt;&lt;span&gt;Pass Mark&lt;/span&gt;&lt;span style={{ fontWeight: 700, color: G }}&gt;{exam?.passing_score}%&lt;/span&gt;&lt;/div&gt;
              &lt;div style={{ display: &quot;flex&quot;, justifyContent: &quot;space-between&quot; }}&gt;&lt;span&gt;Total Qs&lt;/span&gt;&lt;span style={{ fontWeight: 700, color: G }}&gt;{questions.length}&lt;/span&gt;&lt;/div&gt;
            &lt;/div&gt;
          &lt;/div&gt;
        )}
      &lt;/div&gt;

      {/* MOBILE BOTTOM NAV */}
      {isMobile &amp;&amp; (
        &lt;div style={{ background: &quot;#fff&quot;, borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}&gt;
          &lt;div style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, justifyContent: &quot;space-between&quot;, padding: &quot;6px 12px 0&quot; }}&gt;
            &lt;span style={{ fontSize: 10, fontWeight: 700, color: &quot;#7a9e88&quot; }}&gt;
              {answeredCount}/{questions.length} answered{flaggedCount &gt; 0 &amp;&amp; ` · ${flaggedCount} flagged`}
            &lt;/span&gt;
            &lt;button onClick={() =&gt; setShowNav(v =&gt; !v)} style={{ fontSize: 10, fontWeight: 700, color: G, background: &quot;none&quot;, border: &quot;none&quot;, cursor: &quot;pointer&quot; }}&gt;
              {showNav ? &quot;▲ Hide&quot; : &quot;▼ All Questions&quot;}
            &lt;/button&gt;
          &lt;/div&gt;
          {showNav ? (
            &lt;div style={{ padding: &quot;8px 10px 10px&quot; }}&gt;
              &lt;div style={{ display: &quot;grid&quot;, gridTemplateColumns: &quot;repeat(auto-fill,minmax(34px,1fr))&quot;, gap: 5 }}&gt;
                {questions.map((qq, i) =&gt; {
                  const a = answers[qq.id];
                  return (
                    &lt;button key={qq.id} onClick={() =&gt; { setIdx(i); setShowNav(false); }}
                      style={{ height: 34, borderRadius: 8, border: &quot;none&quot;, fontSize: 11, fontWeight: 800, cursor: &quot;pointer&quot;, background: i === currentIdx ? G : a?.flagged ? &quot;#fffbeb&quot; : a?.text ? &quot;#f0fff4&quot; : &quot;#f8fafb&quot;, color: i === currentIdx ? &quot;#fff&quot; : a?.flagged ? GOLD : a?.text ? &quot;#22c55e&quot; : &quot;#7a9e88&quot;, outline: i === currentIdx ? `2px solid ${GOLD}` : &quot;&quot; }}&gt;
                      {i + 1}
                    &lt;/button&gt;
                  );
                })}
              &lt;/div&gt;
            &lt;/div&gt;
          ) : (
            &lt;div style={{ display: &quot;flex&quot;, alignItems: &quot;center&quot;, gap: 4, padding: &quot;6px 10px 8px&quot;, overflowX: &quot;auto&quot; }}&gt;
              {questions.map((qq, i) =&gt; {
                const a = answers[qq.id];
                return (
                  &lt;button key={qq.id} onClick={() =&gt; setIdx(i)}
                    style={{ width: 32, height: 32, borderRadius: 8, border: &quot;none&quot;, fontSize: 11, fontWeight: 800, cursor: &quot;pointer&quot;, flexShrink: 0, background: i === currentIdx ? G : a?.flagged ? &quot;#fffbeb&quot; : a?.text ? &quot;#f0fff4&quot; : &quot;#f8fafb&quot;, color: i === currentIdx ? &quot;#fff&quot; : a?.flagged ? GOLD : a?.text ? &quot;#22c55e&quot; : &quot;#7a9e88&quot;, transform: i === currentIdx ? &quot;scale(1.1)&quot; : &quot;scale(1)&quot; }}&gt;
                    {i + 1}
                  &lt;/button&gt;
                );
              })}
            &lt;/div&gt;
          )}
        &lt;/div&gt;
      )}
    &lt;/div&gt;
  );
};

export default ExamTaking;
</pre>
<div class="bottom-bar">
  <button class="bottom-copy" id="botBtn" onclick="copyCode()">📋 Tap to Copy All Code</button>
</div>
<script>
const CODE = document.getElementById('codeBlock').textContent;
function copyCode() {
  navigator.clipboard.writeText(CODE).then(() => {
    document.getElementById('topBtn').textContent = '✅ Copied!';
    document.getElementById('topBtn').classList.add('copied');
    document.getElementById('botBtn').textContent = '✅ Copied!';
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

  // Load exam — wrapped in try/catch so loading always clears
  useEffect(() => {
    if (!attemptId || !user) return;
    (async () => {
      try {
        const { data: ad, error: ae } = await supabase.from("exam_attempts").select("*,exams(*)").eq("id", attemptId).single();
        if (ae || !ad || ad.user_id !== user.id) { navigate("/student/exams"); return; }
        if (ad.status !== "in_progress") {
          setSubmitted(true); setExam(ad.exams);
          setSR({ status: ad.status, score: ad.score, totalPoints: ad.total_points, percentage: ad.percentage, passed: ad.passed });
          setLoading(false); return;
        }
        setExam(ad.exams);
        setTimeLeft(Math.max(0, (ad.exams.time_limit_minutes || 60) * 60 - Math.floor((Date.now() - new Date(ad.started_at).getTime()) / 1000)));
        setTabSw(ad.tab_switches || 0);
        logActivity(user.id, "exam_started", "exam_attempt", attemptId, { exam_id: ad.exam_id });

        // Try RPC first, fall back to direct query if it fails
        let ql: any[] = [];
        try {
          const { data: qs } = await supabase.rpc("get_exam_questions_for_student", { _exam_id: ad.exam_id });
          ql = qs || [];
        } catch {
          // RPC failed — fall back to direct query
          const { data: qs2 } = await supabase
            .from("exam_questions")
            .select("*, questions(*)")
            .eq("exam_id", ad.exam_id)
            .order("order_index");
          ql = (qs2 || []).map((eq: any) => ({ ...eq.questions, ...eq, id: eq.question_id || eq.id }));
        }
        // FIX: refresh signed media_url for audio questions (signed URLs expire after 1h)
        ql = await Promise.all(ql.map(async (q: any) => {
          if (q.media_url && q.media_url.includes("/storage/v1/object/sign/")) {
            // Extract bucket and path from signed URL
            const match = q.media_url.match(/\/storage\/v1\/object\/sign\/([^/]+)\/(.+?)\?/);
            if (match) {
              const [, bucket, path] = match;
              const { data: fresh } = await supabase.storage.from(bucket).createSignedUrl(decodeURIComponent(path), 7200);
              return { ...q, media_url: fresh?.signedUrl || q.media_url };
            }
          }
          return q;
        }));
        if (ad.exams.randomize_questions) ql = ql.sort(() => Math.random() - 0.5);
        setQuestions(ql);

        const { data: ea } = await supabase.from("exam_answers").select("*").eq("attempt_id", attemptId);
        const am: Record<string, AnswerState> = {};
        (ea || []).forEach((a: any) => { am[a.question_id] = { text: a.answer_text || "", data: a.answer_data, flagged: a.is_flagged || false, confidence: a.answer_data?.confidence || null }; });
        setAnswers(am);
      } catch (err) {
        console.error("Exam load error:", err);
      } finally {
        setLoading(false); // ALWAYS clear loading
      }
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
                    {q.media_url && (q.question_type === "audio" || q.question_type === "dictation" || q.question_type === "audio_dictation") && (
                      <div style={{ marginTop: 12 }}>
                        <AudioPlayer src={q.media_url} title={t("Listen carefully", "استمع بعناية")} maxPlays={3} />
                        {/* Fallback native player in case AudioPlayer fails */}
                        <audio controls preload="metadata" src={q.media_url} crossOrigin="anonymous"
                          style={{ width: "100%", marginTop: 6, borderRadius: 8, display: "block" }}
                          onError={e => { (e.target as HTMLAudioElement).style.display = "block"; }}
                        />
                      </div>
                    )}
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
