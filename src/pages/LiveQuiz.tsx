import React from "react";

const LiveQuiz = () => {
  return (
    <div>
      {/* 
export default LiveQuiz;
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0F172A; color: #E2E8F0; min-height: 100vh; }
  .header { background: #7C3AED; padding: 16px 20px; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 12px rgba(0,0,0,.4); }
  .header-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
  .badge { background: rgba(255,255,255,.2); border: 1px solid rgba(255,255,255,.3); border-radius: 20px; padding: 3px 12px; font-size: 11px; font-weight: 800; letter-spacing: 1px; color: #fff; }
  .filename { font-size: 17px; font-weight: 800; color: #fff; }
  .fix-desc { font-size: 12px; color: rgba(255,255,255,.75); margin-top: 4px; }
  .meta { font-size: 11px; color: rgba(255,255,255,.5); margin-top: 4px; }
  .copy-btn { background: #fff; color: #7C3AED; border: none; border-radius: 12px; padding: 11px 22px; font-size: 14px; font-weight: 800; cursor: pointer; flex-shrink: 0; }
  .copy-btn.copied { background: #22C55E; color: #fff; }
  .path-bar { background: #1E293B; padding: 9px 20px; font-size: 11px; color: #64748B; font-family: monospace; border-bottom: 1px solid #334155; }
  .path-bar span { color: #94A3B8; }
  pre { font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.7; color: #CBD5E1; white-space: pre-wrap; word-break: break-all; padding: 20px 20px 90px; }
  .bottom-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #1E293B; border-top: 1px solid #334155; padding: 12px 20px; display: flex; justify-content: center; }
  .bottom-copy { background: #7C3AED; color: #fff; border: none; border-radius: 14px; padding: 14px; font-size: 16px; font-weight: 800; cursor: pointer; width: 100%; max-width: 500px; }
  .bottom-copy.copied { background: #22C55E; }
</style>
</head>
<body>
<div class="header">
  <div class="header-top">
    <div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span class="badge">BUILD FIX + Fix 1</span>
        <span class="filename">LiveQuiz.tsx</span>
      </div>
      <div class="fix-desc">✅ Correct .tsx file — Musabaqah stale-closure fix (questionIdxRef)</div>
      <div class="meta">📁 90.9 KB · 📝 1658 lines · This is the REAL React/TypeScript file</div>
    </div>
    <button class="copy-btn" id="topBtn" onclick="copyCode()">📋 Copy</button>
  </div>
</div>
<div class="path-bar">Place at: <span>src/pages/LiveQuiz.tsx</span></div>
<pre id="codeBlock">/*
  LiveQuiz.tsx — Al-Musabaqah | Islamic Live Quiz Arena
  Kahoot-style live quiz with Supabase Realtime
  Colors: Deep Green #064E3B + Gold #C9922A (Tahleem Academy)
*/

import { useState, useEffect, useRef } from &quot;react&quot;;
import { useNavigate } from &quot;react-router-dom&quot;;
import { supabase } from &quot;@/integrations/supabase/client&quot;;
import { useAuth } from &quot;@/contexts/AuthContext&quot;;
import { useToast } from &quot;@/hooks/use-toast&quot;;
import {
  Trophy, Users, Play, ArrowRight, Star,
  Crown, Zap, RotateCcw, X,
  BookOpen, Eye, PlusCircle, Sparkles,
  Copy, Share2, Check,
} from &quot;lucide-react&quot;;

/* ── Brand Colors ─────────────────────────────────────── */
const G     = &quot;#064E3B&quot;;
const GM    = &quot;#065F46&quot;;
const GOLD  = &quot;#C9922A&quot;;
const GOLD2 = &quot;#A67C1E&quot;;

/* ── Types ───────────────────────────────────────────── */
interface Room {
  id: string;
  code: string;
  host_id: string;
  status: &quot;waiting&quot; | &quot;active&quot; | &quot;countdown&quot; | &quot;question&quot; | &quot;reveal&quot; | &quot;finished&quot;;
  current_question_index: number;
  total_questions: number;
  topic: string;
}
interface Participant {
  id: string; room_id: string; player_name: string;
  score: number; streak: number; last_answer_correct?: boolean;
}
interface Question {
  id: string; question: string; options: string[];
  correct_answer: string; explanation?: string;
  time_limit: number; topic?: string; order_index?: number;
}

/* ── Built-in Islamic Questions Pool ────────────────── */
const POOL: Omit&lt;Question,&quot;id&quot;&gt;[] = [
  { question:&quot;How many letters are in the Arabic alphabet?&quot;, options:[&quot;26&quot;,&quot;28&quot;,&quot;30&quot;,&quot;32&quot;], correct_answer:&quot;28&quot;, explanation:&quot;The Arabic alphabet has 28 letters.&quot;, time_limit:20, topic:&quot;Arabic&quot; },
  { question:&quot;What is the first Surah of the Quran?&quot;, options:[&quot;Al-Baqarah&quot;,&quot;Al-Fatiha&quot;,&quot;Al-Ikhlas&quot;,&quot;Al-Nas&quot;], correct_answer:&quot;Al-Fatiha&quot;, explanation:&quot;Al-Fatiha (The Opening) is the first surah.&quot;, time_limit:15, topic:&quot;Quran&quot; },
  { question:&quot;How many verses does Surah Al-Fatiha have?&quot;, options:[&quot;5&quot;,&quot;6&quot;,&quot;7&quot;,&quot;8&quot;], correct_answer:&quot;7&quot;, explanation:&quot;Al-Fatiha has 7 verses.&quot;, time_limit:20, topic:&quot;Quran&quot; },
  { question:&quot;What does &#x27;Tajweed&#x27; mean?&quot;, options:[&quot;Recitation speed&quot;,&quot;To beautify/improve&quot;,&quot;Memorization&quot;,&quot;Translation&quot;], correct_answer:&quot;To beautify/improve&quot;, explanation:&quot;Tajweed means to improve and perfect the recitation.&quot;, time_limit:20, topic:&quot;Tajweed&quot; },
  { question:&quot;What is the meaning of &#x27;Bismillah&#x27;?&quot;, options:[&quot;Praise be to Allah&quot;,&quot;In the name of Allah&quot;,&quot;Allah is great&quot;,&quot;Peace be upon Him&quot;], correct_answer:&quot;In the name of Allah&quot;, explanation:&quot;Bismillah means &#x27;In the name of Allah&#x27;.&quot;, time_limit:15, topic:&quot;Islamic Studies&quot; },
  { question:&quot;How many Surahs are in the Holy Quran?&quot;, options:[&quot;110&quot;,&quot;112&quot;,&quot;114&quot;,&quot;116&quot;], correct_answer:&quot;114&quot;, explanation:&quot;The Quran has 114 Surahs.&quot;, time_limit:15, topic:&quot;Quran&quot; },
  { question:&quot;What is &#x27;Ikhfa&#x27; in Tajweed?&quot;, options:[&quot;Hiding/concealing&quot;,&quot;Full merging&quot;,&quot;Elongation&quot;,&quot;Stopping&quot;], correct_answer:&quot;Hiding/concealing&quot;, explanation:&quot;Ikhfa means to hide the Noon Sakin sound.&quot;, time_limit:25, topic:&quot;Tajweed&quot; },
  { question:&quot;Which pillar of Islam is stated first?&quot;, options:[&quot;Salah&quot;,&quot;Zakat&quot;,&quot;Shahada&quot;,&quot;Sawm&quot;], correct_answer:&quot;Shahada&quot;, explanation:&quot;The Shahada (testimony of faith) is the first pillar.&quot;, time_limit:20, topic:&quot;Fiqh&quot; },
  { question:&quot;How many times is Salah performed daily?&quot;, options:[&quot;3&quot;,&quot;4&quot;,&quot;5&quot;,&quot;6&quot;], correct_answer:&quot;5&quot;, explanation:&quot;Muslims pray 5 times a day.&quot;, time_limit:10, topic:&quot;Fiqh&quot; },
  { question:&quot;What does &#x27;Alhamdulillah&#x27; mean?&quot;, options:[&quot;God is great&quot;,&quot;All praise is due to Allah&quot;,&quot;Peace be upon him&quot;,&quot;In the name of Allah&quot;], correct_answer:&quot;All praise is due to Allah&quot;, explanation:&quot;Alhamdulillah means &#x27;All praise is due to Allah&#x27;.&quot;, time_limit:15, topic:&quot;Islamic Studies&quot; },
  { question:&quot;What is &#x27;Idgham&#x27; in Tajweed?&quot;, options:[&quot;Prolongation&quot;,&quot;Merging of letters&quot;,&quot;Stopping&quot;,&quot;Clear pronunciation&quot;], correct_answer:&quot;Merging of letters&quot;, explanation:&quot;Idgham means to merge one letter into another.&quot;, time_limit:20, topic:&quot;Tajweed&quot; },
  { question:&quot;The Arabic word &#x27;قلب&#x27; means:&quot;, options:[&quot;Mind&quot;,&quot;Soul&quot;,&quot;Heart&quot;,&quot;Love&quot;], correct_answer:&quot;Heart&quot;, explanation:&quot;Qalb (قلب) means heart in Arabic.&quot;, time_limit:20, topic:&quot;Arabic&quot; },
  { question:&quot;Which month is Ramadan in the Islamic calendar?&quot;, options:[&quot;7th&quot;,&quot;8th&quot;,&quot;9th&quot;,&quot;10th&quot;], correct_answer:&quot;9th&quot;, explanation:&quot;Ramadan is the 9th month of the Islamic calendar.&quot;, time_limit:20, topic:&quot;Islamic Studies&quot; },
  { question:&quot;How many Juz (parts) does the Quran have?&quot;, options:[&quot;20&quot;,&quot;25&quot;,&quot;28&quot;,&quot;30&quot;], correct_answer:&quot;30&quot;, explanation:&quot;The Quran is divided into 30 Juz.&quot;, time_limit:15, topic:&quot;Quran&quot; },
  { question:&quot;What does &#x27;Madd&#x27; mean in Tajweed?&quot;, options:[&quot;Stopping&quot;,&quot;Elongation&quot;,&quot;Merging&quot;,&quot;Hiding&quot;], correct_answer:&quot;Elongation&quot;, explanation:&quot;Madd means elongation/prolongation of a vowel sound.&quot;, time_limit:20, topic:&quot;Tajweed&quot; },
];

/* ── Answer Shape Colors (Kahoot-style) ─────────────── */
const SHAPES = [
  { bg:&quot;rgba(6,78,59,0.8)&quot;,  border:&quot;#22C55E&quot;, icon:&quot;▲&quot;, label:&quot;A&quot; },
  { bg:&quot;rgba(30,58,95,0.8)&quot;, border:&quot;#3B82F6&quot;, icon:&quot;◆&quot;, label:&quot;B&quot; },
  { bg:&quot;rgba(74,25,66,0.8)&quot;, border:&quot;#A855F7&quot;, icon:&quot;●&quot;, label:&quot;C&quot; },
  { bg:&quot;rgba(74,32,0,0.8)&quot;,  border:&quot;#F97316&quot;, icon:&quot;■&quot;, label:&quot;D&quot; },
];

/* ── Islamic Geometric Background ───────────────────── */
const IslamicBg = ({ opacity = 0.07 }: { opacity?: number }) =&gt; (
  &lt;svg style={{position:&quot;fixed&quot;,top:0,left:0,width:&quot;100%&quot;,height:&quot;100%&quot;,opacity,zIndex:0,pointerEvents:&quot;none&quot;}} xmlns=&quot;http://www.w3.org/2000/svg&quot;&gt;
    &lt;defs&gt;
      &lt;pattern id=&quot;ip&quot; x=&quot;0&quot; y=&quot;0&quot; width=&quot;120&quot; height=&quot;120&quot; patternUnits=&quot;userSpaceOnUse&quot;&gt;
        {/* 8-pointed star */}
        &lt;polygon points=&quot;60,6 70,42 106,42 77,63 88,99 60,78 32,99 43,63 14,42 50,42&quot; fill=&quot;none&quot; stroke={GOLD} strokeWidth=&quot;0.8&quot;/&gt;
        {/* Inner octagon */}
        &lt;polygon points=&quot;60,22 72,46 98,46 78,62 86,88 60,73 34,88 42,62 22,46 48,46&quot; fill=&quot;none&quot; stroke={GOLD} strokeWidth=&quot;0.35&quot; opacity=&quot;0.6&quot;/&gt;
        {/* Center gem */}
        &lt;circle cx=&quot;60&quot; cy=&quot;60&quot; r=&quot;4&quot; fill=&quot;none&quot; stroke={GOLD} strokeWidth=&quot;0.6&quot;/&gt;
        {/* Corner stars small */}
        &lt;polygon points=&quot;0,0 4,14 18,14 7,22 11,36 0,28 -11,36 -7,22 -18,14 -4,14&quot; fill=&quot;none&quot; stroke={GOLD} strokeWidth=&quot;0.4&quot; transform=&quot;translate(0,0)&quot; opacity=&quot;0.5&quot;/&gt;
        &lt;polygon points=&quot;120,120 124,134 138,134 127,142 131,156 120,148 109,156 113,142 102,134 116,134&quot; fill=&quot;none&quot; stroke={GOLD} strokeWidth=&quot;0.4&quot; opacity=&quot;0.5&quot;/&gt;
        {/* Grid lines */}
        &lt;line x1=&quot;0&quot; y1=&quot;60&quot; x2=&quot;120&quot; y2=&quot;60&quot; stroke={GOLD} strokeWidth=&quot;0.2&quot; opacity=&quot;0.3&quot;/&gt;
        &lt;line x1=&quot;60&quot; y1=&quot;0&quot; x2=&quot;60&quot; y2=&quot;120&quot; stroke={GOLD} strokeWidth=&quot;0.2&quot; opacity=&quot;0.3&quot;/&gt;
        &lt;line x1=&quot;0&quot; y1=&quot;0&quot; x2=&quot;120&quot; y2=&quot;120&quot; stroke={GOLD} strokeWidth=&quot;0.15&quot; opacity=&quot;0.15&quot;/&gt;
        &lt;line x1=&quot;120&quot; y1=&quot;0&quot; x2=&quot;0&quot; y2=&quot;120&quot; stroke={GOLD} strokeWidth=&quot;0.15&quot; opacity=&quot;0.15&quot;/&gt;
      &lt;/pattern&gt;
    &lt;/defs&gt;
    &lt;rect width=&quot;100%&quot; height=&quot;100%&quot; fill=&quot;url(#ip)&quot;/&gt;
  &lt;/svg&gt;
);

/* ── Countdown Ring ──────────────────────────────────── */
const TimerRing = ({ seconds, total }: { seconds: number; total: number }) =&gt; {
  const pct  = seconds / total;
  const r    = 34;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;
  const col  = pct &gt; 0.5 ? GOLD : pct &gt; 0.25 ? &quot;#F59E0B&quot; : &quot;#EF4444&quot;;
  return (
    &lt;div style={{position:&quot;relative&quot;,width:84,height:84,display:&quot;flex&quot;,alignItems:&quot;center&quot;,justifyContent:&quot;center&quot;}}&gt;
      &lt;svg width=&quot;84&quot; height=&quot;84&quot; style={{transform:&quot;rotate(-90deg)&quot;,position:&quot;absolute&quot;}}&gt;
        &lt;circle cx=&quot;42&quot; cy=&quot;42&quot; r={r} fill=&quot;none&quot; stroke=&quot;rgba(255,255,255,0.12)&quot; strokeWidth=&quot;5&quot;/&gt;
        &lt;circle cx=&quot;42&quot; cy=&quot;42&quot; r={r} fill=&quot;none&quot; stroke={col} strokeWidth=&quot;5&quot;
          strokeDasharray={`${dash} ${circ}`} strokeLinecap=&quot;round&quot;
          style={{transition:&quot;stroke-dasharray 1s linear, stroke 0.4s&quot;}}/&gt;
      &lt;/svg&gt;
      &lt;span style={{fontSize:24,fontWeight:900,color:col,zIndex:1}}&gt;{seconds}&lt;/span&gt;
    &lt;/div&gt;
  );
};

/* ── Helpers ─────────────────────────────────────────── */
const genCode = () =&gt; Math.floor(100000 + Math.random() * 900000).toString();
const TOPICS  = [&quot;All Topics&quot;,&quot;Quran&quot;,&quot;Tajweed&quot;,&quot;Arabic&quot;,&quot;Fiqh&quot;,&quot;Islamic Studies&quot;];
const EMOJI_POOL = [&quot;🌙&quot;,&quot;⭐&quot;,&quot;🕌&quot;,&quot;📖&quot;,&quot;🌟&quot;,&quot;✨&quot;,&quot;🌺&quot;,&quot;🦋&quot;,&quot;💎&quot;,&quot;🌸&quot;];


/* ── Split bilingual question text into Arabic + English parts ── */
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
      const s = l.replace(/[()]/g, &#x27;&#x27;).trim(); if (!s) continue;
      if (/[؀-ۿ]/.test(s)) arParts.push(s);
      else if (/[a-zA-Z]/.test(s)) enParts.push(s);
    }
    if (arParts.length &amp;&amp; enParts.length) return { ar: arParts.join(&#x27; &#x27;), en: enParts.join(&#x27; &#x27;) };
  }
  return null;
}

const LQQuestion = ({ text }: { text: string }) =&gt; {
  const split = splitBilingual(text);
  if (split) return (
    &lt;div style={{textAlign:&#x27;center&#x27;}}&gt;
      {split.ar &amp;&amp; &lt;p style={{fontFamily:&quot;&#x27;Scheherazade New&#x27;,&#x27;Amiri Quran&#x27;,&#x27;Amiri&#x27;,serif&quot;,fontSize:24,fontWeight:700,color:&#x27;#fff&#x27;,margin:&#x27;0 0 10px&#x27;,lineHeight:2.2,direction:&#x27;rtl&#x27;}}&gt;{split.ar}&lt;/p&gt;}
      {split.en &amp;&amp; &lt;p style={{fontFamily:&quot;&#x27;Cairo&#x27;,sans-serif&quot;,fontSize:16,fontWeight:600,color:&#x27;rgba(255,255,255,0.85)&#x27;,margin:0,lineHeight:1.8}}&gt;{split.en}&lt;/p&gt;}
    &lt;/div&gt;
  );
  const isAr = /[؀-ۿ]/.test(text);
  return &lt;p style={{fontFamily:isAr?&quot;&#x27;Scheherazade New&#x27;,&#x27;Amiri Quran&#x27;,&#x27;Amiri&#x27;,serif&quot;:&quot;&#x27;Cairo&#x27;,sans-serif&quot;,fontSize:isAr?24:20,fontWeight:700,color:&#x27;#fff&#x27;,margin:0,lineHeight:isAr?2.2:1.6,direction:isAr?&#x27;rtl&#x27;:&#x27;ltr&#x27;}}&gt;{text}&lt;/p&gt;;
};

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════ */
const LiveQuiz = () =&gt; {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const { toast }        = useToast();
  const isHost           = hasRole?.(&quot;admin&quot;) || hasRole?.(&quot;teacher&quot;);

  type View =
    | &quot;hub&quot; | &quot;creating&quot; | &quot;joining&quot;
    | &quot;q-source&quot; | &quot;q-preview&quot; | &quot;q-ai&quot; | &quot;q-bank&quot; | &quot;q-upload&quot; | &quot;q-manual&quot;
    | &quot;lobby-host&quot; | &quot;countdown-host&quot; | &quot;question-host&quot; | &quot;reveal-host&quot; | &quot;results-host&quot;
    | &quot;lobby-player&quot; | &quot;countdown-player&quot; | &quot;question-player&quot; | &quot;reveal-player&quot; | &quot;results-player&quot;;

  const [view,         setView]         = useState&lt;View&gt;(&quot;hub&quot;);
  const [room,         setRoom]         = useState&lt;Room|null&gt;(null);
  const [participant,  setParticipant]  = useState&lt;Participant|null&gt;(null);
  const [participants, setParticipants] = useState&lt;Participant[]&gt;([]);
  const [currentQ,     setCurrentQ]     = useState&lt;Question|null&gt;(null);
  const [selectedAns,  setSelectedAns]  = useState&lt;string|null&gt;(null);
  const [timeLeft,     setTimeLeft]     = useState(20);
  const [answerCounts, setAnswerCounts] = useState&lt;Record&lt;string,number&gt;&gt;({});
  const [numAnswered,  setNumAnswered]  = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [countdown,    setCountdown]    = useState(3);
  const [joinCode,     setJoinCode]     = useState(&quot;&quot;);
  const [playerName,   setPlayerName]   = useState(&quot;&quot;);
  const [settings,     setSettings]     = useState({ topic:&quot;All Topics&quot;, numQ:10, timeQ:20 });

  // ── Missing state declarations (caused blank screen crash) ──
  const [customQs,     setCustomQs]     = useState&lt;Omit&lt;Question,&quot;id&quot;&gt;[]&gt;([]);
  const [bankExams,    setBankExams]    = useState&lt;{id:string;title:string}[]&gt;([]);
  const [bankQs,       setBankQs]       = useState&lt;Omit&lt;Question,&quot;id&quot;&gt;[]&gt;([]);
  const [selBankExam,  setSelBankExam]  = useState&lt;string&gt;(&quot;&quot;);
  const [aiTopic,      setAiTopic]      = useState&lt;string&gt;(&quot;&quot;);
  const [aiLoading,    setAiLoading]    = useState&lt;boolean&gt;(false);
  const [uploadError,  setUploadError]  = useState&lt;string&gt;(&quot;&quot;);
  const [manualQ,      setManualQ]      = useState&lt;{question:string;optA:string;optB:string;optC:string;optD:string;correct:string;explanation:string}&gt;(
    { question:&quot;&quot;, optA:&quot;&quot;, optB:&quot;&quot;, optC:&quot;&quot;, optD:&quot;&quot;, correct:&quot;A&quot;, explanation:&quot;&quot; }
  );

  const timerRef    = useRef&lt;any&gt;(null);
  const channelRef  = useRef&lt;any&gt;(null);
  const broadcastRef= useRef&lt;any&gt;(null);
  const questionIdxRef = useRef&lt;number&gt;(0);   // FIX: stable ref for current_question_index
  const [copiedCode, setCopiedCode] = useState(false);

  /* ── Realtime subscription ── */
  useEffect(() =&gt; {
    if (!room) return;

    // Shared broadcast channel — host pushes question data directly to students.
    // This bypasses RLS on live_quiz_questions entirely.
    const bc = supabase.channel(`lq-broadcast-${room.id}`)
      .on(&quot;broadcast&quot;, { event: &quot;question&quot; }, ({ payload }: any) =&gt; {
        // Students receive full question object from host
        if (!isHost &amp;&amp; payload?.q) {
          setCurrentQ(payload.q as Question);
          setSelectedAns(null);
          setCountdown(3);
          setView(&quot;countdown-player&quot;);
        }
      })
      .subscribe();
    broadcastRef.current = bc;

    // Postgres changes — room status events for reveal/finished
    const ch = supabase.channel(`lq-db-${room.id}`)
      .on(&quot;postgres_changes&quot;,{ event:&quot;*&quot;, schema:&quot;public&quot;, table:&quot;live_quiz_rooms&quot;, filter:`id=eq.${room.id}` }, async (p:any) =&gt; {
        const r = p.new as Room;
        setRoom(r);
        if (!isHost) {
          // Students rely on broadcast for question data (no RLS issues)
          // Only handle reveal and finished from DB events
          if (r.status === &quot;reveal&quot;)   { await loadParticipants(); setView(&quot;reveal-player&quot;); }
          if (r.status === &quot;finished&quot;) { await loadParticipants(); setView(&quot;results-player&quot;); }
        }
      })
      .on(&quot;postgres_changes&quot;,{ event:&quot;*&quot;, schema:&quot;public&quot;, table:&quot;live_quiz_participants&quot;, filter:`room_id=eq.${room.id}` }, () =&gt; loadParticipants())
      .on(&quot;postgres_changes&quot;,{ event:&quot;*&quot;, schema:&quot;public&quot;, table:&quot;live_quiz_answers&quot;,      filter:`room_id=eq.${room.id}` }, () =&gt; loadAnswerCounts())
      .subscribe();
    channelRef.current = ch;

    return () =&gt; {
      supabase.removeChannel(bc);
      supabase.removeChannel(ch);
    };
  }, [room?.id]);

  /* ── Timer ── */
  useEffect(() =&gt; {
    if (view === &quot;question-host&quot; || view === &quot;question-player&quot;) {
      clearInterval(timerRef.current);
      setTimeLeft(currentQ?.time_limit ?? 20);
      timerRef.current = setInterval(() =&gt; {
        setTimeLeft(t =&gt; {
          if (t &lt;= 1) { clearInterval(timerRef.current); if (view === &quot;question-host&quot;) handleReveal(); return 0; }
          return t - 1;
        });
      }, 1000);
    }
    return () =&gt; clearInterval(timerRef.current);
  }, [view, currentQ]);


  /* ── Countdown 3-2-1 for HOST — after 3s push status to &quot;question&quot; ── */
  useEffect(() =&gt; {
    if (view !== &quot;countdown-host&quot;) return;
    setCountdown(3);
    const interval = setInterval(() =&gt; {
      setCountdown(c =&gt; {
        if (c &lt;= 1) {
          clearInterval(interval);
          // Push &quot;question&quot; status — this triggers students to show the question
          if (room) {
            supabase.from(&quot;live_quiz_rooms&quot; as any)
              .update({ status: &quot;question&quot; } as any)
              .eq(&quot;id&quot;, room.id)
              .then(() =&gt; {});
          }
          setView(&quot;question-host&quot;);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () =&gt; clearInterval(interval);
  }, [view]);

  /* ── Countdown 3-2-1 for players ── */
  useEffect(() =&gt; {
    if (view !== &quot;countdown-player&quot;) return;
    setCountdown(3);
    const interval = setInterval(() =&gt; {
      setCountdown(c =&gt; {
        if (c &lt;= 1) {
          clearInterval(interval);
          setView(&quot;question-player&quot;);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () =&gt; clearInterval(interval);
  }, [view]);

  /* ── Data loaders ── */
  const loadParticipants = async () =&gt; {
    if (!room) return;
    const { data } = await supabase.from(&quot;live_quiz_participants&quot; as any).select(&quot;*&quot;).eq(&quot;room_id&quot;, room.id).order(&quot;score&quot;,{ascending:false});
    setParticipants((data||[]) as Participant[]);
  };

  const loadCurrentQ = async (idx: number) =&gt; {
    if (!room) return;
    const { data } = await supabase.from(&quot;live_quiz_questions&quot; as any).select(&quot;*&quot;).eq(&quot;room_id&quot;, room.id).eq(&quot;order_index&quot;, idx).single();
    if (data) setCurrentQ({ ...data, options: data.options as string[] } as Question);
  };

  const loadAnswerCounts = async () =&gt; {
    if (!room || !currentQ) return;
    const { data } = await supabase.from(&quot;live_quiz_answers&quot; as any).select(&quot;answer&quot;).eq(&quot;room_id&quot;, room.id).eq(&quot;question_id&quot;, currentQ.id);
    if (!data) return;
    const counts: Record&lt;string,number&gt; = {};
    data.forEach((a:any) =&gt; { counts[a.answer] = (counts[a.answer]||0) + 1; });
    setAnswerCounts(counts);
    setNumAnswered(data.length);
  };

  /* ── Load exams for question bank ── */
  const loadBankExams = async () =&gt; {
    const { data } = await supabase.from(&quot;exams&quot;).select(&quot;id,title&quot;).eq(&quot;is_published&quot;, true);
    setBankExams(data||[]);
  };

  const loadBankQs = async (examId: string) =&gt; {
    setSelBankExam(examId);
    const { data } = await supabase.from(&quot;exam_questions&quot;).select(&quot;*&quot;)
      .eq(&quot;exam_id&quot;, examId).eq(&quot;question_type&quot;,&quot;mcq&quot;);
    const qs = (data||[]).filter((q:any)=&gt;q.options?.length&gt;=2).map((q:any):Omit&lt;Question,&quot;id&quot;&gt; =&gt; ({
      question: q.question_text,
      options: (q.options as any[]).map((o:any)=&gt;typeof o===&quot;string&quot;?o:o.text||o.value||&quot;&quot;),
      correct_answer: q.correct_answer,
      explanation: q.explanation||&quot;&quot;,
      time_limit: settings.timeQ,
      topic: &quot;Question Bank&quot;,
    }));
    setBankQs(qs);
  };

  /* ── AI generate questions ── */
  const generateAiQs = async () =&gt; {
    if (!aiTopic.trim()) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(&quot;ai-generate&quot;, {
        body: {
          prompt: `Create ${settings.numQ} multiple-choice quiz questions about &quot;${aiTopic}&quot; for Islamic education students.
Return ONLY valid JSON array, no markdown, no explanation, nothing else:
[{&quot;question&quot;:&quot;...&quot;,&quot;options&quot;:[&quot;A&quot;,&quot;B&quot;,&quot;C&quot;,&quot;D&quot;],&quot;correct_answer&quot;:&quot;exact option text&quot;,&quot;explanation&quot;:&quot;brief explanation&quot;,&quot;topic&quot;:&quot;${aiTopic}&quot;}]
Make questions educational, clearly worded, and accurate.`
        },
      });
      if (error) throw new Error(error.message);
      const text = data?.text || data?.content || &quot;&quot;;
      const clean = text.replace(/```json\s*/gi,&quot;&quot;).replace(/```\s*/g,&quot;&quot;).trim();
      const parsed = JSON.parse(clean) as any[];
      const qs: Omit&lt;Question,&quot;id&quot;&gt;[] = parsed.map((q: any) =&gt; ({
        question: q.question, options: q.options,
        correct_answer: q.correct_answer, explanation: q.explanation||&quot;&quot;,
        time_limit: settings.timeQ, topic: aiTopic,
      }));
      setCustomQs(qs);
      setView(&quot;q-preview&quot;);
    } catch(e:any) {
      alert(&quot;AI Error: &quot; + e.message);
    } finally { setAiLoading(false); }
  };

  /* ── Parse uploaded CSV/JSON ── */
  const handleUpload = (e: React.ChangeEvent&lt;HTMLInputElement&gt;) =&gt; {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(&quot;&quot;);
    const reader = new FileReader();
    reader.onload = (ev) =&gt; {
      try {
        const text = ev.target?.result as string;
        let parsed: any[] = [];
        if (file.name.endsWith(&quot;.json&quot;)) {
          parsed = JSON.parse(text);
        } else {
          // CSV: question,optA,optB,optC,optD,correct_answer,explanation
          const lines = text.split(&quot;\n&quot;).filter(l=&gt;l.trim());
          const header = lines[0].toLowerCase();
          const start = header.includes(&quot;question&quot;) ? 1 : 0;
          parsed = lines.slice(start).map(line =&gt; {
            const cols = line.split(&quot;,&quot;).map(c=&gt;c.trim().replace(/^&quot;|&quot;$/g,&quot;&quot;));
            return { question:cols[0], options:[cols[1],cols[2],cols[3],cols[4]], correct_answer:cols[5], explanation:cols[6]||&quot;&quot; };
          });
        }
        const qs: Omit&lt;Question,&quot;id&quot;&gt;[] = parsed.map(q =&gt; ({
          question: q.question, options: q.options||[q.optA,q.optB,q.optC,q.optD],
          correct_answer: q.correct_answer||q.answer, explanation: q.explanation||&quot;&quot;,
          time_limit: settings.timeQ, topic: q.topic||&quot;Uploaded&quot;,
        })).filter(q=&gt;q.question&amp;&amp;q.options?.length&gt;=2&amp;&amp;q.correct_answer);
        if (!qs.length) throw new Error(&quot;No valid questions found&quot;);
        setCustomQs(qs);
        setView(&quot;q-preview&quot;);
      } catch(err:any) {
        setUploadError(&quot;Parse error: &quot; + err.message);
      }
    };
    reader.readAsText(file);
  };

  /* ── Add manual question ── */
  const addManualQ = () =&gt; {
    const { question, optA, optB, optC, optD, correct, explanation } = manualQ;
    if (!question.trim()||!optA.trim()||!optB.trim()) return;
    const opts = [optA,optB,optC,optD].filter(o=&gt;o.trim());
    const correctText = correct===&quot;A&quot;?optA:correct===&quot;B&quot;?optB:correct===&quot;C&quot;?optC:optD;
    setCustomQs(prev=&gt;[...prev,{ question, options:opts, correct_answer:correctText, explanation, time_limit:settings.timeQ, topic:&quot;Manual&quot; }]);
    setManualQ({ question:&quot;&quot;, optA:&quot;&quot;, optB:&quot;&quot;, optC:&quot;&quot;, optD:&quot;&quot;, correct:&quot;A&quot;, explanation:&quot;&quot; });
  };

  /* ── Actions ── */
  const createRoom = async () =&gt; {
    if (!user) return;
    setLoading(true);
    try {
      const code = genCode();
      let selected: Omit&lt;Question,&quot;id&quot;&gt;[] = [];

      if (customQs.length &gt; 0) {
        selected = customQs.slice(0, settings.numQ).map(q=&gt;({...q, time_limit:settings.timeQ}));
      } else {
        let pool = settings.topic === &quot;All Topics&quot; ? POOL : POOL.filter(q =&gt; q.topic === settings.topic);
        if (pool.length &lt; settings.numQ) pool = POOL;
        selected = [...pool].sort(() =&gt; Math.random()-0.5).slice(0, settings.numQ);
      }

      const { data: rd, error } = await supabase.from(&quot;live_quiz_rooms&quot; as any).insert({
        code, host_id: user.id, status: &quot;waiting&quot;,
        current_question_index: 0, total_questions: selected.length, topic: settings.topic,
      } as any).select().single();
      if (error) throw error;

      setRoom(rd as Room);
      for (let i = 0; i &lt; selected.length; i++) {
        await supabase.from(&quot;live_quiz_questions&quot; as any).insert({
          room_id: (rd as any).id, question: selected[i].question,
          options: selected[i].options, correct_answer: selected[i].correct_answer,
          explanation: selected[i].explanation||null, time_limit: settings.timeQ,
          order_index: i, topic: selected[i].topic,
        } as any);
      }
      setView(&quot;lobby-host&quot;);
      toast({ title:`✅ Room created! Code: ${code}` });
    } catch(e:any) {
      toast({ title:&quot;Error&quot;, description:e.message, variant:&quot;destructive&quot; });
    } finally { setLoading(false); }
  };

  const joinRoom = async () =&gt; {
    if (!joinCode.trim() || !playerName.trim()) return;
    setLoading(true);
    try {
      const { data: rd } = await supabase.from(&quot;live_quiz_rooms&quot; as any).select(&quot;*&quot;).eq(&quot;code&quot;, joinCode.trim()).eq(&quot;status&quot;,&quot;waiting&quot;).single();
      if (!rd) throw new Error(&quot;Room not found or already started&quot;);
      setRoom(rd as Room);
      const { data: pd, error: pe } = await supabase.from(&quot;live_quiz_participants&quot; as any).insert({
        room_id: (rd as any).id, player_name: playerName.trim(), score:0, streak:0,
      } as any).select().single();
      if (pe) throw pe;
      setParticipant(pd as Participant);
      setView(&quot;lobby-player&quot;);
    } catch(e:any) {
      toast({ title:&quot;Error&quot;, description:e.message, variant:&quot;destructive&quot; });
    } finally { setLoading(false); }
  };

  /* ── Broadcast question to all students via Realtime Broadcast ── */
  const broadcastQuestion = (q: Question) =&gt; {
    try {
      broadcastRef.current?.send({
        type: &quot;broadcast&quot;,
        event: &quot;question&quot;,
        payload: { q },
      });
    } catch (_) {}
  };

  const startQuiz = async () =&gt; {
    if (!room) return;
    // Load Q0 on host side
    const { data: qData } = await supabase.from(&quot;live_quiz_questions&quot; as any).select(&quot;*&quot;).eq(&quot;room_id&quot;, room.id).eq(&quot;order_index&quot;, 0).single();
    const q = qData ? { ...qData, options: qData.options as string[] } as Question : null;
    if (q) {
      setCurrentQ(q);
      // Broadcast full question object to students — bypasses RLS
      broadcastQuestion(q);
    }
    await supabase.from(&quot;live_quiz_rooms&quot; as any).update({ status:&quot;countdown&quot;, current_question_index:0 } as any).eq(&quot;id&quot;, room.id);
    setRoom(r =&gt; r ? { ...r, current_question_index: 0, status: &quot;countdown&quot; } : r);
    questionIdxRef.current = 0;   // FIX: reset ref on quiz start
    setCountdown(3); setView(&quot;countdown-host&quot;); setSelectedAns(null); setAnswerCounts({}); setNumAnswered(0);
  };

  const handleReveal = async () =&gt; {
    if (!room) return;
    clearInterval(timerRef.current);
    await supabase.from(&quot;live_quiz_rooms&quot; as any).update({ status:&quot;reveal&quot; } as any).eq(&quot;id&quot;, room.id);
    setRoom(r =&gt; r ? { ...r, status: &quot;reveal&quot; } : r);
    await loadParticipants(); await loadAnswerCounts();
    setView(&quot;reveal-host&quot;);
  };

  const nextQuestion = async () =&gt; {
    if (!room) return;
    // FIX: use ref instead of room.current_question_index to avoid stale closure
    const next = questionIdxRef.current + 1;
    if (next &gt;= (room.total_questions||0)) {
      await supabase.from(&quot;live_quiz_rooms&quot; as any).update({ status:&quot;finished&quot; } as any).eq(&quot;id&quot;, room.id);
      setRoom(r =&gt; r ? { ...r, status:&quot;finished&quot; } : r);
      await loadParticipants();
      setView(&quot;results-host&quot;);
    } else {
      const { data: qData } = await supabase.from(&quot;live_quiz_questions&quot; as any).select(&quot;*&quot;).eq(&quot;room_id&quot;, room.id).eq(&quot;order_index&quot;, next).single();
      const q = qData ? { ...qData, options: qData.options as string[] } as Question : null;
      if (q) {
        setCurrentQ(q);
        broadcastQuestion(q);
        await new Promise(res =&gt; setTimeout(res, 150));
      }
      await supabase.from(&quot;live_quiz_rooms&quot; as any).update({ status:&quot;countdown&quot;, current_question_index:next } as any).eq(&quot;id&quot;, room.id);
      questionIdxRef.current = next;   // FIX: advance ref so next call reads correct index
      setRoom(r =&gt; r ? { ...r, current_question_index: next, status: &quot;countdown&quot; } : r);
      setCountdown(3); setView(&quot;countdown-host&quot;); setAnswerCounts({}); setNumAnswered(0);
    }
  };

  const submitAnswer = async (answer: string) =&gt; {
    if (!room || !currentQ || !participant || selectedAns) return;
    setSelectedAns(answer);
    const isCorrect  = answer === currentQ.correct_answer;
    const speedBonus = Math.max(0, Math.floor((timeLeft / currentQ.time_limit) * 500));
    const points     = isCorrect ? 500 + speedBonus : 0;
    await supabase.from(&quot;live_quiz_answers&quot; as any).insert({
      room_id:room.id, question_id:currentQ.id, participant_id:participant.id,
      answer, is_correct:isCorrect, time_taken:currentQ.time_limit-timeLeft, points_earned:points,
    } as any);
    if (isCorrect) {
      await supabase.from(&quot;live_quiz_participants&quot; as any).update({ score:(participant.score||0)+points, streak:(participant.streak||0)+1, last_answer_correct:true } as any).eq(&quot;id&quot;,participant.id);
      setParticipant(p =&gt; p ? {...p, score:(p.score||0)+points, streak:(p.streak||0)+1} : p);
    } else {
      await supabase.from(&quot;live_quiz_participants&quot; as any).update({ streak:0, last_answer_correct:false } as any).eq(&quot;id&quot;,participant.id);
      setParticipant(p =&gt; p ? {...p, streak:0} : p);
    }
  };

  const resetAll = () =&gt; {
    setView(&quot;hub&quot;); setRoom(null); setParticipant(null);
    setParticipants([]); setCurrentQ(null); setSelectedAns(null);
    setJoinCode(&quot;&quot;); setPlayerName(&quot;&quot;);
  };

  /* ══════════════════════════════════════════════════
     SHARED STYLES
  ══════════════════════════════════════════════════ */
  const pageStyle: React.CSSProperties = {
    minHeight:&quot;100svh&quot;,
    background:`linear-gradient(160deg,${G} 0%, #021F16 60%, #000D09 100%)`,
    position:&quot;relative&quot;, overflow:&quot;hidden&quot;,
  };
  const glassCard: React.CSSProperties = {
    background:&quot;rgba(255,255,255,0.04)&quot;,
    backdropFilter:&quot;blur(20px)&quot;,
    border:`1px solid rgba(201,146,42,0.25)`,
    borderRadius:22,
    padding:24,
  };
  const goldBtn: React.CSSProperties = {
    padding:&quot;16px&quot;, borderRadius:14, border:&quot;none&quot;,
    background:`linear-gradient(135deg,${GOLD},${GOLD2})`,
    color:&quot;#fff&quot;, cursor:&quot;pointer&quot;, fontWeight:900, fontSize:16,
    display:&quot;flex&quot;, alignItems:&quot;center&quot;, justifyContent:&quot;center&quot;, gap:10,
    width:&quot;100%&quot;, fontFamily:&quot;&#x27;Playfair Display&#x27;,serif&quot;,
    boxShadow:`0 4px 24px rgba(201,146,42,0.4)`,
  };
  const outlineBtn: React.CSSProperties = {
    padding:&quot;15px&quot;, borderRadius:14,
    border:`2px solid rgba(201,146,42,0.5)`,
    background:&quot;rgba(201,146,42,0.08)&quot;,
    color:&quot;#fff&quot;, cursor:&quot;pointer&quot;, fontWeight:800, fontSize:15,
    display:&quot;flex&quot;, alignItems:&quot;center&quot;, justifyContent:&quot;center&quot;, gap:10,
    width:&quot;100%&quot;, fontFamily:&quot;&#x27;Playfair Display&#x27;,serif&quot;,
  };
  const backBtn: React.CSSProperties = {
    background:&quot;none&quot;, border:&quot;none&quot;,
    color:&quot;rgba(255,255,255,0.5)&quot;,
    cursor:&quot;pointer&quot;, fontSize:13, fontWeight:600,
    display:&quot;flex&quot;, alignItems:&quot;center&quot;, gap:6,
    marginBottom:24,
  };
  const divider = (
    &lt;div style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:12,margin:&quot;20px 0&quot;}}&gt;
      &lt;div style={{flex:1,height:1,background:`rgba(201,146,42,0.2)`}}/&gt;
      &lt;Star size={12} color={GOLD} fill={GOLD}/&gt;
      &lt;div style={{flex:1,height:1,background:`rgba(201,146,42,0.2)`}}/&gt;
    &lt;/div&gt;
  );

  /* ══ HUB ══════════════════════════════════════════ */
  if (view === &quot;hub&quot;) return (
    &lt;div style={{...pageStyle, display:&quot;flex&quot;, flexDirection:&quot;column&quot;, alignItems:&quot;center&quot;, justifyContent:&quot;center&quot;, padding:&quot;40px 20px&quot;, position:&quot;relative&quot;}}&gt;
      &lt;IslamicBg opacity={0.09}/&gt;
      {/* Back arrow — top left */}
      &lt;button
        onClick={() =&gt; navigate(-1)}
        style={{ position:&quot;absolute&quot;, top:16, left:16, zIndex:10, display:&quot;flex&quot;, alignItems:&quot;center&quot;, gap:6, background:&quot;rgba(255,255,255,0.1)&quot;, border:&quot;1px solid rgba(255,255,255,0.18)&quot;, borderRadius:12, padding:&quot;8px 14px&quot;, color:&quot;rgba(255,255,255,0.85)&quot;, fontWeight:700, fontSize:13, cursor:&quot;pointer&quot;, backdropFilter:&quot;blur(8px)&quot; }}&gt;
        ← {isHost ? &quot;Dashboard&quot; : &quot;Back&quot;}
      &lt;/button&gt;
      &lt;div style={{position:&quot;relative&quot;,zIndex:1,width:&quot;100%&quot;,maxWidth:420,textAlign:&quot;center&quot;}}&gt;

        {/* Logo */}
        &lt;div style={{width:80,height:80,borderRadius:24,background:`linear-gradient(135deg,${GOLD},${GOLD2})`,display:&quot;inline-flex&quot;,alignItems:&quot;center&quot;,justifyContent:&quot;center&quot;,marginBottom:16,boxShadow:`0 8px 32px rgba(201,146,42,0.5)`}}&gt;
          &lt;span style={{fontSize:38}}&gt;🏆&lt;/span&gt;
        &lt;/div&gt;
        &lt;h1 style={{fontFamily:&quot;&#x27;Playfair Display&#x27;,serif&quot;,fontWeight:900,fontSize:36,color:&quot;#fff&quot;,margin:&quot;0 0 4px&quot;,letterSpacing:-1}}&gt;
          Al-Musabaqah
        &lt;/h1&gt;
        &lt;p style={{fontSize:18,color:GOLD,fontWeight:700,margin:&quot;0 0 4px&quot;,fontFamily:&quot;&#x27;Amiri&#x27;,serif&quot;,letterSpacing:2}}&gt;
          المسابقة الحية
        &lt;/p&gt;
        &lt;p style={{fontSize:13,color:&quot;rgba(255,255,255,0.45)&quot;,marginBottom:32,letterSpacing:1}}&gt;
          LIVE ISLAMIC QUIZ ARENA
        &lt;/p&gt;

        {divider}

        &lt;div style={{display:&quot;flex&quot;,flexDirection:&quot;column&quot;,gap:12,marginBottom:32}}&gt;
          &lt;button onClick={()=&gt;setView(&quot;joining&quot;)} style={outlineBtn}&gt;
            &lt;Zap size={18} color={GOLD}/&gt; Join a Quiz
          &lt;/button&gt;
          {isHost &amp;&amp; (
            &lt;button onClick={()=&gt;setView(&quot;creating&quot;)} style={goldBtn}&gt;
              &lt;Crown size={18}/&gt; Host a Quiz
            &lt;/button&gt;
          )}
        &lt;/div&gt;

        {/* Stats row */}
        &lt;div style={{display:&quot;flex&quot;,gap:0,background:&quot;rgba(255,255,255,0.04)&quot;,borderRadius:16,border:`1px solid rgba(201,146,42,0.15)`,overflow:&quot;hidden&quot;}}&gt;
          {[{v:&quot;15+&quot;,l:&quot;Questions&quot;},{v:&quot;Live&quot;,l:&quot;Real-time&quot;},{v:&quot;∞&quot;,l:&quot;Players&quot;}].map((s,i)=&gt;(
            &lt;div key={s.l} style={{flex:1,textAlign:&quot;center&quot;,padding:&quot;14px 8px&quot;,borderRight:i&lt;2?`1px solid rgba(201,146,42,0.15)`:&quot;none&quot;}}&gt;
              &lt;p style={{fontSize:20,fontWeight:900,color:GOLD,margin:0}}&gt;{s.v}&lt;/p&gt;
              &lt;p style={{fontSize:11,color:&quot;rgba(255,255,255,0.4)&quot;,margin:0,letterSpacing:0.5}}&gt;{s.l}&lt;/p&gt;
            &lt;/div&gt;
          ))}
        &lt;/div&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  );

  /* ══ JOINING ══════════════════════════════════════ */
  if (view === &quot;joining&quot;) return (
    &lt;div style={{...pageStyle, display:&quot;flex&quot;, flexDirection:&quot;column&quot;, alignItems:&quot;center&quot;, justifyContent:&quot;center&quot;, padding:&quot;30px 20px&quot;}}&gt;
      &lt;IslamicBg opacity={0.08}/&gt;
      &lt;div style={{position:&quot;relative&quot;,zIndex:1,width:&quot;100%&quot;,maxWidth:420}}&gt;
        &lt;button onClick={()=&gt;setView(&quot;hub&quot;)} style={backBtn}&gt;← Back&lt;/button&gt;
        &lt;div style={glassCard}&gt;
          &lt;div style={{textAlign:&quot;center&quot;,marginBottom:26}}&gt;
            &lt;div style={{fontSize:40,marginBottom:8}}&gt;🎯&lt;/div&gt;
            &lt;h2 style={{fontFamily:&quot;&#x27;Playfair Display&#x27;,serif&quot;,fontWeight:900,fontSize:24,color:&quot;#fff&quot;,margin:&quot;0 0 6px&quot;}}&gt;Join Quiz&lt;/h2&gt;
            &lt;p style={{fontSize:13,color:&quot;rgba(255,255,255,0.45)&quot;,margin:0}}&gt;Enter the code from your teacher&lt;/p&gt;
          &lt;/div&gt;

          &lt;div style={{display:&quot;flex&quot;,flexDirection:&quot;column&quot;,gap:14}}&gt;
            &lt;div&gt;
              &lt;label style={{fontSize:11,fontWeight:700,color:GOLD,display:&quot;block&quot;,marginBottom:6,letterSpacing:1.5,textTransform:&quot;uppercase&quot;}}&gt;Your Name&lt;/label&gt;
              &lt;input value={playerName} onChange={e=&gt;setPlayerName(e.target.value)} placeholder=&quot;e.g. Abdullah&quot; maxLength={20}
                style={{width:&quot;100%&quot;,padding:&quot;13px 16px&quot;,borderRadius:12,border:`1.5px solid rgba(201,146,42,0.3)`,background:&quot;rgba(255,255,255,0.06)&quot;,color:&quot;#fff&quot;,fontSize:15,fontWeight:600,outline:&quot;none&quot;,boxSizing:&quot;border-box&quot;,fontFamily:&quot;inherit&quot;}}/&gt;
            &lt;/div&gt;
            &lt;div&gt;
              &lt;label style={{fontSize:11,fontWeight:700,color:GOLD,display:&quot;block&quot;,marginBottom:6,letterSpacing:1.5,textTransform:&quot;uppercase&quot;}}&gt;Room Code&lt;/label&gt;
              &lt;input value={joinCode} onChange={e=&gt;setJoinCode(e.target.value)} placeholder=&quot;000000&quot; maxLength={6} inputMode=&quot;numeric&quot;
                style={{width:&quot;100%&quot;,padding:&quot;14px 16px&quot;,borderRadius:12,border:`2px solid ${joinCode.length===6?GOLD:&quot;rgba(201,146,42,0.3)&quot;}`,background:&quot;rgba(255,255,255,0.06)&quot;,color:GOLD,fontSize:28,fontWeight:900,outline:&quot;none&quot;,letterSpacing:8,textAlign:&quot;center&quot;,boxSizing:&quot;border-box&quot;,transition:&quot;border-color .2s&quot;}}/&gt;
            &lt;/div&gt;
            &lt;button onClick={joinRoom} disabled={!joinCode.trim()||!playerName.trim()||loading}
              style={{...goldBtn, opacity:joinCode.trim()&amp;&amp;playerName.trim()?1:0.4, cursor:joinCode.trim()&amp;&amp;playerName.trim()?&quot;pointer&quot;:&quot;not-allowed&quot;}}&gt;
              {loading ? &quot;Joining…&quot; : &quot;Enter Room →&quot;}
            &lt;/button&gt;
          &lt;/div&gt;
        &lt;/div&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  );

  /* ══ CREATING — Combined Setup (Questions + Settings) ══ */
  if (view === &quot;creating&quot; || view === &quot;q-source&quot;) return (
    &lt;div style={{...pageStyle, padding:&quot;0 0 40px&quot;, overflowY:&quot;auto&quot;}}&gt;
      &lt;IslamicBg opacity={0.08}/&gt;

      {/* Sticky header */}
      &lt;div style={{position:&quot;sticky&quot;,top:0,zIndex:10,background:&quot;rgba(6,20,14,0.95)&quot;,backdropFilter:&quot;blur(12px)&quot;,borderBottom:&quot;1px solid rgba(201,146,42,0.2)&quot;,padding:&quot;14px 18px&quot;,display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:12}}&gt;
        &lt;button onClick={()=&gt;setView(&quot;hub&quot;)} style={{...backBtn,margin:0}}&gt;← Back&lt;/button&gt;
        &lt;div style={{flex:1,textAlign:&quot;center&quot;}}&gt;
          &lt;h2 style={{fontFamily:&quot;&#x27;Playfair Display&#x27;,serif&quot;,fontWeight:900,fontSize:20,color:&quot;#fff&quot;,margin:0}}&gt;Setup Quiz&lt;/h2&gt;
        &lt;/div&gt;
        &lt;div style={{width:50}}/&gt;
      &lt;/div&gt;

      &lt;div style={{position:&quot;relative&quot;,zIndex:1,maxWidth:460,margin:&quot;0 auto&quot;,padding:&quot;20px 18px&quot;,display:&quot;flex&quot;,flexDirection:&quot;column&quot;,gap:20}}&gt;

        {/* ── SECTION 1: Question Source ── */}
        &lt;div&gt;
          &lt;div style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:10,marginBottom:14}}&gt;
            &lt;div style={{width:32,height:32,borderRadius:10,background:`linear-gradient(135deg,${GOLD},${GOLD2})`,display:&quot;flex&quot;,alignItems:&quot;center&quot;,justifyContent:&quot;center&quot;,flexShrink:0,boxShadow:`0 4px 12px rgba(201,146,42,0.4)`}}&gt;
              &lt;BookOpen size={16} color=&quot;#fff&quot;/&gt;
            &lt;/div&gt;
            &lt;div&gt;
              &lt;p style={{fontSize:16,fontWeight:900,color:&quot;#fff&quot;,margin:0}}&gt;Questions&lt;/p&gt;
              &lt;p style={{fontSize:11,color:&quot;rgba(255,255,255,0.4)&quot;,margin:0}}&gt;Choose how to add your questions&lt;/p&gt;
            &lt;/div&gt;
            {customQs.length &gt; 0 &amp;&amp; (
              &lt;span style={{marginLeft:&quot;auto&quot;,fontSize:12,fontWeight:800,color:GOLD,background:&quot;rgba(201,146,42,0.15)&quot;,padding:&quot;4px 12px&quot;,borderRadius:20,border:`1px solid rgba(201,146,42,0.3)`}}&gt;
                ✓ {customQs.length} ready
              &lt;/span&gt;
            )}
          &lt;/div&gt;

          &lt;div style={{display:&quot;flex&quot;,flexDirection:&quot;column&quot;,gap:8}}&gt;
            {[
              { id:&quot;builtin&quot;, icon:&quot;🕌&quot;, label:&quot;Built-in Islamic Pool&quot;,  desc:&quot;15+ ready-made questions&quot;,           action:()=&gt;{ setCustomQs([]); setView(&quot;q-preview&quot;); } },
              { id:&quot;ai&quot;,      icon:&quot;🤖&quot;, label:&quot;AI Generated&quot;,            desc:&quot;AI generates by topic&quot;,       action:()=&gt;setView(&quot;q-ai&quot;) },
              { id:&quot;bank&quot;,    icon:&quot;🏦&quot;, label:&quot;Question Bank&quot;,           desc:&quot;Import from your published exams&quot;,   action:()=&gt;{ loadBankExams(); setView(&quot;q-bank&quot;); } },
              { id:&quot;upload&quot;,  icon:&quot;📁&quot;, label:&quot;Upload CSV / JSON&quot;,       desc:&quot;Upload a file of questions&quot;,         action:()=&gt;setView(&quot;q-upload&quot;) },
              { id:&quot;manual&quot;,  icon:&quot;✍️&quot;, label:&quot;Type Manually&quot;,           desc:&quot;Add questions one by one&quot;,           action:()=&gt;{ setCustomQs([]); setView(&quot;q-manual&quot;); } },
            ].map(s=&gt;(
              &lt;button key={s.id} onClick={s.action}
                style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:14,padding:&quot;14px 16px&quot;,borderRadius:14,border:`1.5px solid rgba(201,146,42,0.25)`,background:&quot;rgba(255,255,255,0.04)&quot;,cursor:&quot;pointer&quot;,textAlign:&quot;left&quot; as const,transition:&quot;all .15s&quot;,width:&quot;100%&quot;}}
                onMouseEnter={e=&gt;{(e.currentTarget as any).style.borderColor=GOLD;(e.currentTarget as any).style.background=&quot;rgba(201,146,42,0.1)&quot;;}}
                onMouseLeave={e=&gt;{(e.currentTarget as any).style.borderColor=&quot;rgba(201,146,42,0.25)&quot;;(e.currentTarget as any).style.background=&quot;rgba(255,255,255,0.04)&quot;;}}&gt;
                &lt;span style={{fontSize:26,flexShrink:0,width:36,textAlign:&quot;center&quot; as const}}&gt;{s.icon}&lt;/span&gt;
                &lt;div style={{flex:1}}&gt;
                  &lt;p style={{fontSize:14,fontWeight:800,color:&quot;#fff&quot;,margin:&quot;0 0 2px&quot;}}&gt;{s.label}&lt;/p&gt;
                  &lt;p style={{fontSize:11,color:&quot;rgba(255,255,255,0.4)&quot;,margin:0}}&gt;{s.desc}&lt;/p&gt;
                &lt;/div&gt;
                &lt;ArrowRight size={14} color={GOLD}/&gt;
              &lt;/button&gt;
            ))}
          &lt;/div&gt;
        &lt;/div&gt;

        {/* Divider */}
        &lt;div style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:10}}&gt;
          &lt;div style={{flex:1,height:1,background:&quot;rgba(201,146,42,0.15)&quot;}}/&gt;
          &lt;Star size={10} color={GOLD} fill={GOLD}/&gt;
          &lt;div style={{flex:1,height:1,background:&quot;rgba(201,146,42,0.15)&quot;}}/&gt;
        &lt;/div&gt;

        {/* ── SECTION 2: Settings ── */}
        &lt;div&gt;
          &lt;div style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:10,marginBottom:14}}&gt;
            &lt;div style={{width:32,height:32,borderRadius:10,background:&quot;rgba(255,255,255,0.08)&quot;,display:&quot;flex&quot;,alignItems:&quot;center&quot;,justifyContent:&quot;center&quot;,flexShrink:0,border:&quot;1px solid rgba(255,255,255,0.12)&quot;}}&gt;
              &lt;Zap size={15} color={GOLD}/&gt;
            &lt;/div&gt;
            &lt;div&gt;
              &lt;p style={{fontSize:16,fontWeight:900,color:&quot;#fff&quot;,margin:0}}&gt;Settings&lt;/p&gt;
              &lt;p style={{fontSize:11,color:&quot;rgba(255,255,255,0.4)&quot;,margin:0}}&gt;Adjust timing and topic&lt;/p&gt;
            &lt;/div&gt;
          &lt;/div&gt;

          &lt;div style={{...glassCard, display:&quot;flex&quot;, flexDirection:&quot;column&quot;, gap:18}}&gt;
            {/* Topic */}
            &lt;div&gt;
              &lt;label style={{fontSize:11,fontWeight:700,color:GOLD,display:&quot;block&quot;,marginBottom:8,letterSpacing:1.5,textTransform:&quot;uppercase&quot; as const}}&gt;Topic&lt;/label&gt;
              &lt;div style={{display:&quot;flex&quot;,flexWrap:&quot;wrap&quot;,gap:6}}&gt;
                {TOPICS.map(t=&gt;(
                  &lt;button key={t} onClick={()=&gt;setSettings(p=&gt;({...p,topic:t}))}
                    style={{padding:&quot;7px 12px&quot;,borderRadius:20,border:`1.5px solid ${settings.topic===t?GOLD:&quot;rgba(255,255,255,0.12)&quot;}`,background:settings.topic===t?&quot;rgba(201,146,42,0.18)&quot;:&quot;transparent&quot;,color:settings.topic===t?GOLD:&quot;rgba(255,255,255,0.5)&quot;,cursor:&quot;pointer&quot;,fontSize:12,fontWeight:700,transition:&quot;all .15s&quot;}}&gt;
                    {t}
                  &lt;/button&gt;
                ))}
              &lt;/div&gt;
            &lt;/div&gt;

            {/* Questions count */}
            &lt;div&gt;
              &lt;label style={{fontSize:11,fontWeight:700,color:GOLD,display:&quot;block&quot;,marginBottom:8,letterSpacing:1.5,textTransform:&quot;uppercase&quot; as const}}&gt;Number of Questions&lt;/label&gt;
              &lt;div style={{display:&quot;flex&quot;,gap:8,alignItems:&quot;center&quot;}}&gt;
                {[5,10,15,20].map(n=&gt;(
                  &lt;button key={n} onClick={()=&gt;setSettings(p=&gt;({...p,numQ:n}))}
                    style={{flex:1,padding:&quot;10px&quot;,borderRadius:10,border:`1.5px solid ${settings.numQ===n?GOLD:&quot;rgba(255,255,255,0.12)&quot;}`,background:settings.numQ===n?&quot;rgba(201,146,42,0.18)&quot;:&quot;transparent&quot;,color:settings.numQ===n?GOLD:&quot;rgba(255,255,255,0.5)&quot;,cursor:&quot;pointer&quot;,fontWeight:800,fontSize:15,transition:&quot;all .15s&quot;}}&gt;
                    {n}
                  &lt;/button&gt;
                ))}
                &lt;input
                  type=&quot;number&quot; min={1} max={100}
                  value={settings.numQ}
                  onChange={e=&gt;{const v=parseInt(e.target.value)||1; setSettings(p=&gt;({...p,numQ:Math.max(1,v)}));}}
                  style={{width:64,padding:&quot;10px 8px&quot;,borderRadius:10,border:`1.5px solid rgba(201,146,42,0.4)`,background:&quot;rgba(255,255,255,0.07)&quot;,color:GOLD,fontWeight:800,fontSize:15,outline:&quot;none&quot;,textAlign:&quot;center&quot;,fontFamily:&quot;inherit&quot;}}
                /&gt;
              &lt;/div&gt;
              &lt;p style={{fontSize:11,color:&quot;rgba(255,255,255,0.3)&quot;,margin:&quot;6px 0 0&quot;}}&gt;Or type any number in the box →&lt;/p&gt;
            &lt;/div&gt;

            {/* Time per Q */}
            &lt;div&gt;
              &lt;label style={{fontSize:11,fontWeight:700,color:GOLD,display:&quot;block&quot;,marginBottom:8,letterSpacing:1.5,textTransform:&quot;uppercase&quot; as const}}&gt;Time Per Question&lt;/label&gt;
              &lt;div style={{display:&quot;flex&quot;,gap:8}}&gt;
                {[10,15,20,30].map(n=&gt;(
                  &lt;button key={n} onClick={()=&gt;setSettings(p=&gt;({...p,timeQ:n}))}
                    style={{flex:1,padding:&quot;10px&quot;,borderRadius:10,border:`1.5px solid ${settings.timeQ===n?GOLD:&quot;rgba(255,255,255,0.12)&quot;}`,background:settings.timeQ===n?&quot;rgba(201,146,42,0.18)&quot;:&quot;transparent&quot;,color:settings.timeQ===n?GOLD:&quot;rgba(255,255,255,0.5)&quot;,cursor:&quot;pointer&quot;,fontWeight:800,fontSize:14,transition:&quot;all .15s&quot;}}&gt;
                    {n}s
                  &lt;/button&gt;
                ))}
              &lt;/div&gt;
            &lt;/div&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        {/* ── Summary + Go to Preview (only when custom questions loaded) ── */}
        {customQs.length &gt; 0 &amp;&amp; (
          &lt;div&gt;
            &lt;div style={{background:&quot;rgba(201,146,42,0.1)&quot;,borderRadius:14,padding:&quot;14px 16px&quot;,border:`1px solid rgba(201,146,42,0.3)`,marginBottom:12}}&gt;
              &lt;p style={{fontSize:13,color:&quot;rgba(255,255,255,0.7)&quot;,margin:0}}&gt;
                ✅ &lt;strong style={{color:GOLD}}&gt;{customQs.length} questions&lt;/strong&gt; ready · &lt;strong style={{color:&quot;#fff&quot;}}&gt;{settings.topic}&lt;/strong&gt; · &lt;strong style={{color:&quot;#fff&quot;}}&gt;{settings.timeQ}s&lt;/strong&gt; each
              &lt;/p&gt;
            &lt;/div&gt;
            &lt;button onClick={()=&gt;setView(&quot;q-preview&quot;)} style={goldBtn}&gt;
              &lt;Eye size={18}/&gt; Preview &amp; Launch →
            &lt;/button&gt;
          &lt;/div&gt;
        )}
      &lt;/div&gt;
    &lt;/div&gt;
  );

  /* ══ Q-AI — AI question generator ════════════════ */
  if (view === &quot;q-ai&quot;) return (
    &lt;div style={{...pageStyle, padding:&quot;28px 18px&quot;, overflowY:&quot;auto&quot;}}&gt;
      &lt;IslamicBg opacity={0.08}/&gt;
      &lt;div style={{position:&quot;relative&quot;,zIndex:1,maxWidth:440,margin:&quot;0 auto&quot;}}&gt;
        &lt;button onClick={()=&gt;setView(&quot;creating&quot;)} style={backBtn}&gt;← Back&lt;/button&gt;
        &lt;div style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:10,marginBottom:4}}&gt;
          &lt;span style={{fontSize:24}}&gt;🤖&lt;/span&gt;
          &lt;h2 style={{fontFamily:&quot;&#x27;Playfair Display&#x27;,serif&quot;,fontWeight:900,fontSize:26,color:&quot;#fff&quot;,margin:0}}&gt;AI Generator&lt;/h2&gt;
        &lt;/div&gt;
        &lt;p style={{fontSize:13,color:&quot;rgba(255,255,255,0.4)&quot;,marginBottom:22}}&gt;AI will create {settings.numQ} questions instantly&lt;/p&gt;
        &lt;div style={{...glassCard, display:&quot;flex&quot;, flexDirection:&quot;column&quot;, gap:16}}&gt;
          &lt;div&gt;
            &lt;label style={{fontSize:11,fontWeight:700,color:GOLD,display:&quot;block&quot;,marginBottom:8,letterSpacing:1.5,textTransform:&quot;uppercase&quot;}}&gt;Topic or concept&lt;/label&gt;
            &lt;input value={aiTopic} onChange={e=&gt;setAiTopic(e.target.value)}
              placeholder=&quot;e.g. Noon Sakin rules, Arabic vocabulary, Pillars of Islam…&quot;
              style={{width:&quot;100%&quot;,padding:&quot;13px 16px&quot;,borderRadius:12,border:`1.5px solid rgba(201,146,42,0.3)`,background:&quot;rgba(255,255,255,0.06)&quot;,color:&quot;#fff&quot;,fontSize:14,outline:&quot;none&quot;,boxSizing:&quot;border-box&quot;,fontFamily:&quot;inherit&quot;}}/&gt;
          &lt;/div&gt;
          &lt;div style={{background:&quot;rgba(201,146,42,0.08)&quot;,borderRadius:12,padding:&quot;12px 14px&quot;,border:&quot;1px solid rgba(201,146,42,0.2)&quot;}}&gt;
            &lt;p style={{fontSize:12,color:GOLD,fontWeight:700,margin:&quot;0 0 6px&quot;}}&gt;💡 Tips for better questions:&lt;/p&gt;
            &lt;p style={{fontSize:11,color:&quot;rgba(255,255,255,0.5)&quot;,margin:0,lineHeight:1.8}}&gt;
              • Be specific: &quot;Noon Sakin rules&quot; not &quot;Tajweed&quot;&lt;br/&gt;
              • Add level: &quot;beginner Arabic vocabulary&quot;&lt;br/&gt;
              • Reference topic: &quot;Surah Al-Baqarah themes&quot;
            &lt;/p&gt;
          &lt;/div&gt;
          &lt;button onClick={generateAiQs} disabled={!aiTopic.trim()||aiLoading}
            style={{...goldBtn, opacity:aiTopic.trim()?1:0.4, cursor:aiTopic.trim()?&quot;pointer&quot;:&quot;not-allowed&quot;}}&gt;
            {aiLoading ? &lt;&gt;&lt;span style={{animation:&quot;spin .8s linear infinite&quot;,display:&quot;inline-block&quot;}}&gt;⏳&lt;/span&gt; Generating…&lt;/&gt; : &lt;&gt;&lt;Sparkles size={16}/&gt; Generate {settings.numQ} Questions&lt;/&gt;}
          &lt;/button&gt;
        &lt;/div&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  );

  /* ══ Q-BANK — Import from Question Bank ══════════ */
  if (view === &quot;q-bank&quot;) return (
    &lt;div style={{...pageStyle, padding:&quot;28px 18px&quot;, overflowY:&quot;auto&quot;}}&gt;
      &lt;IslamicBg opacity={0.08}/&gt;
      &lt;div style={{position:&quot;relative&quot;,zIndex:1,maxWidth:480,margin:&quot;0 auto&quot;}}&gt;
        &lt;button onClick={()=&gt;setView(&quot;creating&quot;)} style={backBtn}&gt;← Back&lt;/button&gt;
        &lt;div style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:10,marginBottom:4}}&gt;
          &lt;span style={{fontSize:24}}&gt;🏦&lt;/span&gt;
          &lt;h2 style={{fontFamily:&quot;&#x27;Playfair Display&#x27;,serif&quot;,fontWeight:900,fontSize:26,color:&quot;#fff&quot;,margin:0}}&gt;Question Bank&lt;/h2&gt;
        &lt;/div&gt;
        &lt;p style={{fontSize:13,color:&quot;rgba(255,255,255,0.4)&quot;,marginBottom:20}}&gt;Import MCQ questions from your published exams&lt;/p&gt;

        {/* Exam picker */}
        &lt;div style={{...glassCard, marginBottom:14}}&gt;
          &lt;label style={{fontSize:11,fontWeight:700,color:GOLD,display:&quot;block&quot;,marginBottom:10,letterSpacing:1.5,textTransform:&quot;uppercase&quot;}}&gt;Select Exam&lt;/label&gt;
          {bankExams.length === 0 ? (
            &lt;p style={{fontSize:13,color:&quot;rgba(255,255,255,0.35)&quot;,margin:0,textAlign:&quot;center&quot;,padding:&quot;12px 0&quot;}}&gt;No published exams found&lt;/p&gt;
          ) : (
            &lt;div style={{display:&quot;flex&quot;,flexDirection:&quot;column&quot;,gap:6}}&gt;
              {bankExams.map(e=&gt;(
                &lt;button key={e.id} onClick={()=&gt;loadBankQs(e.id)}
                  style={{padding:&quot;11px 14px&quot;,borderRadius:10,border:`1.5px solid ${selBankExam===e.id?GOLD:&quot;rgba(255,255,255,0.1)&quot;}`,background:selBankExam===e.id?&quot;rgba(201,146,42,0.12)&quot;:&quot;rgba(255,255,255,0.03)&quot;,color:selBankExam===e.id?GOLD:&quot;rgba(255,255,255,0.7)&quot;,cursor:&quot;pointer&quot;,fontWeight:700,fontSize:13,textAlign:&quot;left&quot;,transition:&quot;all .15s&quot;}}&gt;
                  📋 {e.title}
                &lt;/button&gt;
              ))}
            &lt;/div&gt;
          )}
        &lt;/div&gt;

        {/* Questions from selected exam */}
        {bankQs.length &gt; 0 &amp;&amp; (
          &lt;div style={{...glassCard, marginBottom:14}}&gt;
            &lt;div style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,justifyContent:&quot;space-between&quot;,marginBottom:12}}&gt;
              &lt;p style={{fontSize:12,color:GOLD,fontWeight:700,margin:0,letterSpacing:1,textTransform:&quot;uppercase&quot;}}&gt;{bankQs.length} MCQ questions found&lt;/p&gt;
            &lt;/div&gt;
            &lt;div style={{display:&quot;flex&quot;,flexDirection:&quot;column&quot;,gap:6,maxHeight:200,overflowY:&quot;auto&quot;}}&gt;
              {bankQs.slice(0,8).map((q,i)=&gt;(
                &lt;div key={i} style={{padding:&quot;8px 12px&quot;,borderRadius:8,background:&quot;rgba(255,255,255,0.04)&quot;,border:&quot;1px solid rgba(255,255,255,0.06)&quot;}}&gt;
                  &lt;p style={{fontSize:12,color:&quot;rgba(255,255,255,0.7)&quot;,margin:0,lineHeight:1.4}}&gt;{i+1}. {q.question.slice(0,80)}{q.question.length&gt;80?&quot;…&quot;:&quot;&quot;}&lt;/p&gt;
                &lt;/div&gt;
              ))}
              {bankQs.length &gt; 8 &amp;&amp; &lt;p style={{fontSize:11,color:&quot;rgba(255,255,255,0.3)&quot;,textAlign:&quot;center&quot;,margin:&quot;4px 0 0&quot;}}&gt;+{bankQs.length-8} more questions&lt;/p&gt;}
            &lt;/div&gt;
            &lt;button onClick={()=&gt;{ setCustomQs(bankQs.slice(0,settings.numQ)); setView(&quot;q-preview&quot;); }}
              style={{...goldBtn, marginTop:12}}&gt;
              Use These {Math.min(bankQs.length,settings.numQ)} Questions →
            &lt;/button&gt;
          &lt;/div&gt;
        )}
      &lt;/div&gt;
    &lt;/div&gt;
  );

  /* ══ Q-UPLOAD — Upload CSV/JSON ══════════════════ */
  if (view === &quot;q-upload&quot;) return (
    &lt;div style={{...pageStyle, padding:&quot;28px 18px&quot;, overflowY:&quot;auto&quot;}}&gt;
      &lt;IslamicBg opacity={0.08}/&gt;
      &lt;div style={{position:&quot;relative&quot;,zIndex:1,maxWidth:440,margin:&quot;0 auto&quot;}}&gt;
        &lt;button onClick={()=&gt;setView(&quot;creating&quot;)} style={backBtn}&gt;← Back&lt;/button&gt;
        &lt;div style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:10,marginBottom:4}}&gt;
          &lt;span style={{fontSize:24}}&gt;📁&lt;/span&gt;
          &lt;h2 style={{fontFamily:&quot;&#x27;Playfair Display&#x27;,serif&quot;,fontWeight:900,fontSize:26,color:&quot;#fff&quot;,margin:0}}&gt;Upload Questions&lt;/h2&gt;
        &lt;/div&gt;
        &lt;p style={{fontSize:13,color:&quot;rgba(255,255,255,0.4)&quot;,marginBottom:22}}&gt;Upload a CSV or JSON file&lt;/p&gt;

        &lt;div style={{...glassCard, display:&quot;flex&quot;, flexDirection:&quot;column&quot;, gap:16}}&gt;
          {/* Drop zone */}
          &lt;label style={{display:&quot;block&quot;,cursor:&quot;pointer&quot;}}&gt;
            &lt;div style={{border:`2px dashed rgba(201,146,42,0.4)`,borderRadius:16,padding:&quot;32px 20px&quot;,textAlign:&quot;center&quot;,background:&quot;rgba(201,146,42,0.04)&quot;,transition:&quot;all .2s&quot;}}&gt;
              &lt;div style={{fontSize:40,marginBottom:10}}&gt;📤&lt;/div&gt;
              &lt;p style={{fontSize:14,fontWeight:700,color:&quot;#fff&quot;,margin:&quot;0 0 4px&quot;}}&gt;Tap to select file&lt;/p&gt;
              &lt;p style={{fontSize:12,color:&quot;rgba(255,255,255,0.4)&quot;,margin:0}}&gt;Supports .csv and .json files&lt;/p&gt;
            &lt;/div&gt;
            &lt;input type=&quot;file&quot; accept=&quot;.csv,.json&quot; onChange={handleUpload} style={{display:&quot;none&quot;}}/&gt;
          &lt;/label&gt;

          {uploadError &amp;&amp; (
            &lt;div style={{background:&quot;rgba(239,68,68,0.1)&quot;,border:&quot;1px solid rgba(239,68,68,0.3)&quot;,borderRadius:10,padding:&quot;10px 14px&quot;}}&gt;
              &lt;p style={{fontSize:12,color:&quot;#EF4444&quot;,margin:0}}&gt;⚠️ {uploadError}&lt;/p&gt;
            &lt;/div&gt;
          )}

          {/* CSV template */}
          &lt;div style={{background:&quot;rgba(255,255,255,0.03)&quot;,borderRadius:12,padding:&quot;14px&quot;,border:&quot;1px solid rgba(255,255,255,0.08)&quot;}}&gt;
            &lt;p style={{fontSize:11,color:GOLD,fontWeight:700,margin:&quot;0 0 8px&quot;,letterSpacing:1.5,textTransform:&quot;uppercase&quot;}}&gt;CSV Format&lt;/p&gt;
            &lt;code style={{fontSize:10,color:&quot;rgba(255,255,255,0.5)&quot;,lineHeight:1.8,display:&quot;block&quot;,whiteSpace:&quot;pre-wrap&quot;}}&gt;{&quot;question,optA,optB,optC,optD,correct_answer,explanation\nHow many Surahs?,110,112,114,116,114,The Quran has 114 Surahs&quot;}&lt;/code&gt;
          &lt;/div&gt;

          {/* JSON template */}
          &lt;div style={{background:&quot;rgba(255,255,255,0.03)&quot;,borderRadius:12,padding:&quot;14px&quot;,border:&quot;1px solid rgba(255,255,255,0.08)&quot;}}&gt;
            &lt;p style={{fontSize:11,color:GOLD,fontWeight:700,margin:&quot;0 0 8px&quot;,letterSpacing:1.5,textTransform:&quot;uppercase&quot;}}&gt;JSON Format&lt;/p&gt;
            &lt;code style={{fontSize:10,color:&quot;rgba(255,255,255,0.5)&quot;,lineHeight:1.8,display:&quot;block&quot;,whiteSpace:&quot;pre-wrap&quot;}}&gt;{&#x27;[{&quot;question&quot;:&quot;...&quot;,&quot;options&quot;:[&quot;A&quot;,&quot;B&quot;,&quot;C&quot;,&quot;D&quot;],&quot;correct_answer&quot;:&quot;A&quot;,&quot;explanation&quot;:&quot;...&quot;}]&#x27;}&lt;/code&gt;
          &lt;/div&gt;
        &lt;/div&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  );

  /* ══ Q-MANUAL — Manual question entry ════════════ */
  if (view === &quot;q-manual&quot;) return (
    &lt;div style={{...pageStyle, padding:&quot;28px 18px&quot;, overflowY:&quot;auto&quot;}}&gt;
      &lt;IslamicBg opacity={0.08}/&gt;
      &lt;div style={{position:&quot;relative&quot;,zIndex:1,maxWidth:480,margin:&quot;0 auto&quot;}}&gt;
        &lt;button onClick={()=&gt;setView(&quot;creating&quot;)} style={backBtn}&gt;← Back&lt;/button&gt;
        &lt;div style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,justifyContent:&quot;space-between&quot;,marginBottom:4}}&gt;
          &lt;div style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:10}}&gt;
            &lt;span style={{fontSize:24}}&gt;✍️&lt;/span&gt;
            &lt;h2 style={{fontFamily:&quot;&#x27;Playfair Display&#x27;,serif&quot;,fontWeight:900,fontSize:26,color:&quot;#fff&quot;,margin:0}}&gt;Manual Entry&lt;/h2&gt;
          &lt;/div&gt;
          &lt;span style={{fontSize:13,fontWeight:800,color:GOLD,background:&quot;rgba(201,146,42,0.15)&quot;,padding:&quot;4px 12px&quot;,borderRadius:20}}&gt;{customQs.length} added&lt;/span&gt;
        &lt;/div&gt;
        &lt;p style={{fontSize:13,color:&quot;rgba(255,255,255,0.4)&quot;,marginBottom:20}}&gt;Add questions one by one&lt;/p&gt;

        {/* Added questions list */}
        {customQs.length &gt; 0 &amp;&amp; (
          &lt;div style={{...glassCard, marginBottom:14}}&gt;
            &lt;p style={{fontSize:11,color:GOLD,fontWeight:700,margin:&quot;0 0 10px&quot;,letterSpacing:1.5,textTransform:&quot;uppercase&quot;}}&gt;Added Questions&lt;/p&gt;
            &lt;div style={{display:&quot;flex&quot;,flexDirection:&quot;column&quot;,gap:6,maxHeight:160,overflowY:&quot;auto&quot;}}&gt;
              {customQs.map((q,i)=&gt;(
                &lt;div key={i} style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:10,padding:&quot;8px 10px&quot;,borderRadius:8,background:&quot;rgba(255,255,255,0.04)&quot;}}&gt;
                  &lt;span style={{fontSize:11,color:GOLD,fontWeight:700,minWidth:20}}&gt;#{i+1}&lt;/span&gt;
                  &lt;p style={{fontSize:12,color:&quot;rgba(255,255,255,0.7)&quot;,margin:0,flex:1,lineHeight:1.3}}&gt;{q.question.slice(0,60)}{q.question.length&gt;60?&quot;…&quot;:&quot;&quot;}&lt;/p&gt;
                  &lt;button onClick={()=&gt;setCustomQs(prev=&gt;prev.filter((_,j)=&gt;j!==i))}
                    style={{background:&quot;none&quot;,border:&quot;none&quot;,cursor:&quot;pointer&quot;,color:&quot;rgba(239,68,68,0.7)&quot;,fontSize:16,padding:&quot;2px&quot;}}&gt;✕&lt;/button&gt;
                &lt;/div&gt;
              ))}
            &lt;/div&gt;
          &lt;/div&gt;
        )}

        {/* Add question form */}
        &lt;div style={{...glassCard, display:&quot;flex&quot;, flexDirection:&quot;column&quot;, gap:12}}&gt;
          &lt;p style={{fontSize:11,color:GOLD,fontWeight:700,margin:0,letterSpacing:1.5,textTransform:&quot;uppercase&quot;}}&gt;New Question&lt;/p&gt;
          &lt;input value={manualQ.question} onChange={e=&gt;setManualQ(p=&gt;({...p,question:e.target.value}))}
            placeholder=&quot;Question text *&quot;
            style={{width:&quot;100%&quot;,padding:&quot;11px 14px&quot;,borderRadius:10,border:&quot;1.5px solid rgba(201,146,42,0.3)&quot;,background:&quot;rgba(255,255,255,0.05)&quot;,color:&quot;#fff&quot;,fontSize:13,outline:&quot;none&quot;,boxSizing:&quot;border-box&quot;,fontFamily:&quot;inherit&quot;}}/&gt;
          &lt;div style={{display:&quot;grid&quot;,gridTemplateColumns:&quot;1fr 1fr&quot;,gap:8}}&gt;
            {[&quot;A&quot;,&quot;B&quot;,&quot;C&quot;,&quot;D&quot;].map((lbl,idx)=&gt;{
              const key = ([&quot;optA&quot;,&quot;optB&quot;,&quot;optC&quot;,&quot;optD&quot;] as const)[idx];
              return (
                &lt;input key={lbl} value={manualQ[key]} onChange={e=&gt;setManualQ(p=&gt;({...p,[key]:e.target.value}))}
                  placeholder={`Option ${lbl}${idx&lt;2?&quot; *&quot;:&quot;&quot;}`}
                  style={{padding:&quot;9px 12px&quot;,borderRadius:9,border:`1.5px solid ${manualQ.correct===lbl?&quot;rgba(34,197,94,0.6)&quot;:&quot;rgba(255,255,255,0.1)&quot;}`,background:&quot;rgba(255,255,255,0.04)&quot;,color:&quot;#fff&quot;,fontSize:12,outline:&quot;none&quot;,fontFamily:&quot;inherit&quot;}}/&gt;
              );
            })}
          &lt;/div&gt;
          &lt;div&gt;
            &lt;label style={{fontSize:11,color:&quot;rgba(255,255,255,0.5)&quot;,display:&quot;block&quot;,marginBottom:6}}&gt;Correct Answer&lt;/label&gt;
            &lt;div style={{display:&quot;flex&quot;,gap:8}}&gt;
              {[&quot;A&quot;,&quot;B&quot;,&quot;C&quot;,&quot;D&quot;].map(lbl=&gt;(
                &lt;button key={lbl} onClick={()=&gt;setManualQ(p=&gt;({...p,correct:lbl}))}
                  style={{flex:1,padding:&quot;9px&quot;,borderRadius:9,border:`1.5px solid ${manualQ.correct===lbl?&quot;#22C55E&quot;:&quot;rgba(255,255,255,0.12)&quot;}`,background:manualQ.correct===lbl?&quot;rgba(34,197,94,0.15)&quot;:&quot;transparent&quot;,color:manualQ.correct===lbl?&quot;#22C55E&quot;:&quot;rgba(255,255,255,0.55)&quot;,cursor:&quot;pointer&quot;,fontWeight:800,fontSize:14}}&gt;
                  {lbl}
                &lt;/button&gt;
              ))}
            &lt;/div&gt;
          &lt;/div&gt;
          &lt;input value={manualQ.explanation} onChange={e=&gt;setManualQ(p=&gt;({...p,explanation:e.target.value}))}
            placeholder=&quot;Explanation (optional)&quot;
            style={{width:&quot;100%&quot;,padding:&quot;11px 14px&quot;,borderRadius:10,border:&quot;1.5px solid rgba(255,255,255,0.1)&quot;,background:&quot;rgba(255,255,255,0.04)&quot;,color:&quot;#fff&quot;,fontSize:13,outline:&quot;none&quot;,boxSizing:&quot;border-box&quot;,fontFamily:&quot;inherit&quot;}}/&gt;
          &lt;button onClick={addManualQ} disabled={!manualQ.question.trim()||!manualQ.optA.trim()||!manualQ.optB.trim()}
            style={{...outlineBtn, opacity:manualQ.question.trim()&amp;&amp;manualQ.optA.trim()&amp;&amp;manualQ.optB.trim()?1:0.4}}&gt;
            &lt;PlusCircle size={16}/&gt; Add Question
          &lt;/button&gt;
        &lt;/div&gt;

        {customQs.length &gt; 0 &amp;&amp; (
          &lt;button onClick={()=&gt;setView(&quot;q-preview&quot;)} style={{...goldBtn, marginTop:14}}&gt;
            Preview {customQs.length} Questions →
          &lt;/button&gt;
        )}
      &lt;/div&gt;
    &lt;/div&gt;
  );

  /* ══ Q-PREVIEW — Review before creating room ══════ */
  if (view === &quot;q-preview&quot;) {
    const previewList = customQs.length &gt; 0 ? customQs : 
      (settings.topic===&quot;All Topics&quot;?POOL:POOL.filter(q=&gt;q.topic===settings.topic))
        .sort(()=&gt;Math.random()-0.5).slice(0,settings.numQ);
    return (
      &lt;div style={{...pageStyle, padding:&quot;24px 18px&quot;, overflowY:&quot;auto&quot;}}&gt;
        &lt;IslamicBg opacity={0.08}/&gt;
        &lt;div style={{position:&quot;relative&quot;,zIndex:1,maxWidth:480,margin:&quot;0 auto&quot;}}&gt;
          &lt;button onClick={()=&gt;setView(&quot;creating&quot;)} style={backBtn}&gt;← Back&lt;/button&gt;
          &lt;div style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,justifyContent:&quot;space-between&quot;,marginBottom:20}}&gt;
            &lt;div&gt;
              &lt;h2 style={{fontFamily:&quot;&#x27;Playfair Display&#x27;,serif&quot;,fontWeight:900,fontSize:24,color:&quot;#fff&quot;,margin:&quot;0 0 2px&quot;}}&gt;Preview Questions&lt;/h2&gt;
              &lt;p style={{fontSize:13,color:&quot;rgba(255,255,255,0.4)&quot;,margin:0}}&gt;{previewList.length} questions · {settings.timeQ}s each&lt;/p&gt;
            &lt;/div&gt;
            &lt;div style={{textAlign:&quot;center&quot;,background:&quot;rgba(201,146,42,0.12)&quot;,border:&quot;1px solid rgba(201,146,42,0.3)&quot;,borderRadius:12,padding:&quot;8px 14px&quot;}}&gt;
              &lt;p style={{fontSize:24,fontWeight:900,color:GOLD,margin:0}}&gt;{previewList.length}&lt;/p&gt;
              &lt;p style={{fontSize:10,color:&quot;rgba(255,255,255,0.4)&quot;,margin:0}}&gt;Qs&lt;/p&gt;
            &lt;/div&gt;
          &lt;/div&gt;

          &lt;div style={{display:&quot;flex&quot;,flexDirection:&quot;column&quot;,gap:8,marginBottom:20}}&gt;
            {previewList.slice(0,5).map((q,i)=&gt;(
              &lt;div key={i} style={{...glassCard, padding:&quot;14px 16px&quot;}}&gt;
                &lt;div style={{display:&quot;flex&quot;,alignItems:&quot;flex-start&quot;,gap:10}}&gt;
                  &lt;span style={{fontSize:12,fontWeight:800,color:GOLD,minWidth:22,marginTop:1}}&gt;#{i+1}&lt;/span&gt;
                  &lt;div style={{flex:1}}&gt;
                    &lt;p style={{fontSize:13,fontWeight:700,color:&quot;#fff&quot;,margin:&quot;0 0 6px&quot;,lineHeight:1.4}}&gt;{q.question}&lt;/p&gt;
                    &lt;div style={{display:&quot;flex&quot;,flexWrap:&quot;wrap&quot;,gap:4}}&gt;
                      {q.options.map((opt,oi)=&gt;(
                        &lt;span key={oi} style={{fontSize:11,padding:&quot;2px 8px&quot;,borderRadius:20,background:opt===q.correct_answer?&quot;rgba(34,197,94,0.2)&quot;:&quot;rgba(255,255,255,0.06)&quot;,color:opt===q.correct_answer?&quot;#22C55E&quot;:&quot;rgba(255,255,255,0.5)&quot;,border:opt===q.correct_answer?&quot;1px solid rgba(34,197,94,0.4)&quot;:&quot;1px solid transparent&quot;,fontWeight:opt===q.correct_answer?700:400}}&gt;
                          {opt===q.correct_answer?&quot;✓ &quot;:&quot;&quot;}{opt.slice(0,24)}
                        &lt;/span&gt;
                      ))}
                    &lt;/div&gt;
                  &lt;/div&gt;
                &lt;/div&gt;
              &lt;/div&gt;
            ))}
            {previewList.length &gt; 5 &amp;&amp; (
              &lt;div style={{textAlign:&quot;center&quot;,padding:&quot;10px&quot;,background:&quot;rgba(255,255,255,0.03)&quot;,borderRadius:10,border:&quot;1px solid rgba(255,255,255,0.06)&quot;}}&gt;
                &lt;p style={{fontSize:12,color:&quot;rgba(255,255,255,0.35)&quot;,margin:0}}&gt;+{previewList.length-5} more questions in the quiz&lt;/p&gt;
              &lt;/div&gt;
            )}
          &lt;/div&gt;

          &lt;button onClick={()=&gt;{ if(customQs.length===0) setCustomQs(previewList); createRoom(); }}
            disabled={loading} style={{...goldBtn, fontSize:17, padding:18}}&gt;
            {loading ? &quot;Creating Room…&quot; : &lt;&gt;&lt;Play size={20}/&gt; Launch Quiz Room!&lt;/&gt;}
          &lt;/button&gt;
        &lt;/div&gt;
      &lt;/div&gt;
    );
  }

  /* ══ LOBBY HOST ═══════════════════════════════════ */
  if (view === &quot;lobby-host&quot; &amp;&amp; room) return (
    &lt;div style={{...pageStyle, padding:&quot;24px 18px&quot;, overflowY:&quot;auto&quot;}}&gt;
      &lt;IslamicBg opacity={0.08}/&gt;
      &lt;div style={{position:&quot;relative&quot;,zIndex:1,maxWidth:500,margin:&quot;0 auto&quot;}}&gt;

        {/* Room code hero */}
        &lt;div style={{textAlign:&quot;center&quot;,marginBottom:24}}&gt;
          &lt;p style={{fontSize:11,color:GOLD,fontWeight:700,letterSpacing:2,textTransform:&quot;uppercase&quot;,margin:&quot;0 0 10px&quot;}}&gt;Share this code&lt;/p&gt;
          &lt;div style={{background:`rgba(201,146,42,0.12)`,border:`2px solid ${GOLD}`,borderRadius:22,padding:&quot;20px 36px&quot;,display:&quot;inline-block&quot;,boxShadow:`0 8px 32px rgba(201,146,42,0.25)`}}&gt;
            &lt;span style={{fontSize:52,fontWeight:900,color:GOLD,letterSpacing:10,fontFamily:&quot;&#x27;Courier New&#x27;,monospace&quot;}}&gt;{room.code}&lt;/span&gt;
          &lt;/div&gt;
          &lt;p style={{fontSize:12,color:&quot;rgba(255,255,255,0.4)&quot;,marginTop:8,marginBottom:12}}&gt;Students enter this at tahleemacademy.vercel.app&lt;/p&gt;
          {/* Copy + Share buttons */}
          &lt;div style={{display:&quot;flex&quot;,gap:10,justifyContent:&quot;center&quot;}}&gt;
            &lt;button
              onClick={()=&gt;{
                navigator.clipboard.writeText(room.code).then(()=&gt;{
                  setCopiedCode(true); setTimeout(()=&gt;setCopiedCode(false),2000);
                });
              }}
              style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:7,padding:&quot;9px 20px&quot;,borderRadius:12,border:`1px solid ${GOLD}`,background:&quot;rgba(201,146,42,0.1)&quot;,color:GOLD,fontWeight:700,fontSize:13,cursor:&quot;pointer&quot;}}&gt;
              {copiedCode ? &lt;&gt;&lt;Check size={14}/&gt; Copied!&lt;/&gt; : &lt;&gt;&lt;Copy size={14}/&gt; Copy Code&lt;/&gt;}
            &lt;/button&gt;
            {navigator.share &amp;&amp; (
              &lt;button
                onClick={()=&gt;{
                  navigator.share({
                    title:&quot;Join Al-Musabaqah Quiz!&quot;,
                    text:`Join my Tahleem Academy quiz! Room code: ${room.code}
Go to: tahleemacademy.vercel.app/live-quiz`,
                    url:`${window.location.origin}/live-quiz`,
                  }).catch(()=&gt;{});
                }}
                style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:7,padding:&quot;9px 20px&quot;,borderRadius:12,border:`1px solid rgba(255,255,255,0.2)`,background:&quot;rgba(255,255,255,0.06)&quot;,color:&quot;#fff&quot;,fontWeight:700,fontSize:13,cursor:&quot;pointer&quot;}}&gt;
                &lt;Share2 size={14}/&gt; Share
              &lt;/button&gt;
            )}
          &lt;/div&gt;
        &lt;/div&gt;

        {/* Player list */}
        &lt;div style={{...glassCard, marginBottom:16}}&gt;
          &lt;div style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,justifyContent:&quot;space-between&quot;,marginBottom:14}}&gt;
            &lt;h3 style={{fontWeight:800,fontSize:15,color:&quot;#fff&quot;,margin:0,display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:8}}&gt;
              &lt;Users size={16} color={GOLD}/&gt; Waiting Room
            &lt;/h3&gt;
            &lt;span style={{fontSize:14,fontWeight:800,color:GOLD,background:`rgba(201,146,42,0.15)`,padding:&quot;3px 12px&quot;,borderRadius:20}}&gt;{participants.length} joined&lt;/span&gt;
          &lt;/div&gt;

          {participants.length === 0 ? (
            &lt;div style={{textAlign:&quot;center&quot;,padding:&quot;24px 0&quot;}}&gt;
              &lt;div style={{fontSize:32,marginBottom:6,opacity:0.5}}&gt;👥&lt;/div&gt;
              &lt;p style={{fontSize:13,color:&quot;rgba(255,255,255,0.35)&quot;,margin:0}}&gt;Waiting for students to join…&lt;/p&gt;
            &lt;/div&gt;
          ) : (
            &lt;div style={{display:&quot;flex&quot;,flexWrap:&quot;wrap&quot;,gap:8}}&gt;
              {participants.map((p,i) =&gt; (
                &lt;div key={p.id} style={{padding:&quot;6px 14px&quot;,borderRadius:20,background:`rgba(201,146,42,0.12)`,border:`1px solid rgba(201,146,42,0.25)`,color:&quot;#fff&quot;,fontSize:13,fontWeight:600,display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:6,animation:&quot;fadeIn .3s ease&quot;}}&gt;
                  {EMOJI_POOL[i % EMOJI_POOL.length]} {p.player_name}
                &lt;/div&gt;
              ))}
            &lt;/div&gt;
          )}
        &lt;/div&gt;

        {/* Quiz info chips */}
        &lt;div style={{display:&quot;flex&quot;,gap:8,marginBottom:20}}&gt;
          {[{l:&quot;Topic&quot;,v:settings.topic},{l:&quot;Questions&quot;,v:String(room.total_questions)},{l:&quot;Time/Q&quot;,v:`${settings.timeQ}s`}].map(s=&gt;(
            &lt;div key={s.l} style={{flex:1,background:&quot;rgba(255,255,255,0.04)&quot;,borderRadius:12,padding:&quot;11px 8px&quot;,textAlign:&quot;center&quot;,border:&quot;1px solid rgba(255,255,255,0.08)&quot;}}&gt;
              &lt;p style={{fontSize:15,fontWeight:900,color:GOLD,margin:0}}&gt;{s.v}&lt;/p&gt;
              &lt;p style={{fontSize:10,color:&quot;rgba(255,255,255,0.35)&quot;,margin:0,letterSpacing:0.5}}&gt;{s.l}&lt;/p&gt;
            &lt;/div&gt;
          ))}
        &lt;/div&gt;

        &lt;button onClick={startQuiz} disabled={participants.length===0}
          style={{...goldBtn, opacity:participants.length&gt;0?1:0.4, cursor:participants.length&gt;0?&quot;pointer&quot;:&quot;not-allowed&quot;, fontSize:18, padding:18}}&gt;
          &lt;Play size={22}/&gt; Start Quiz Now!
        &lt;/button&gt;
        {participants.length===0 &amp;&amp; &lt;p style={{textAlign:&quot;center&quot;,fontSize:12,color:&quot;rgba(255,255,255,0.35)&quot;,marginTop:8}}&gt;Need at least 1 player to start&lt;/p&gt;}
      &lt;/div&gt;
      &lt;style&gt;{`@keyframes fadeIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}`}&lt;/style&gt;
    &lt;/div&gt;
  );

  /* ══ LOBBY PLAYER ═════════════════════════════════ */
  if (view === &quot;lobby-player&quot; &amp;&amp; room) return (
    &lt;div style={{...pageStyle, display:&quot;flex&quot;, flexDirection:&quot;column&quot;, alignItems:&quot;center&quot;, justifyContent:&quot;center&quot;, padding:&quot;30px 20px&quot;}}&gt;
      &lt;IslamicBg opacity={0.08}/&gt;
      &lt;div style={{position:&quot;relative&quot;,zIndex:1,textAlign:&quot;center&quot;,maxWidth:380}}&gt;
        &lt;div style={{width:80,height:80,borderRadius:24,background:`linear-gradient(135deg,${GOLD},${GOLD2})`,display:&quot;inline-flex&quot;,alignItems:&quot;center&quot;,justifyContent:&quot;center&quot;,marginBottom:16,boxShadow:`0 8px 32px rgba(201,146,42,0.4)`,animation:&quot;pulse 2s infinite&quot;}}&gt;
          &lt;span style={{fontSize:38}}&gt;🕌&lt;/span&gt;
        &lt;/div&gt;
        &lt;h2 style={{fontFamily:&quot;&#x27;Playfair Display&#x27;,serif&quot;,fontWeight:900,fontSize:26,color:&quot;#fff&quot;,margin:&quot;0 0 4px&quot;}}&gt;You&#x27;re in!&lt;/h2&gt;
        &lt;p style={{fontSize:16,color:GOLD,fontWeight:700,marginBottom:24}}&gt;{participant?.player_name}&lt;/p&gt;

        &lt;div style={{...glassCard, marginBottom:20}}&gt;
          &lt;p style={{fontSize:11,color:GOLD,fontWeight:700,margin:&quot;0 0 6px&quot;,letterSpacing:1.5,textTransform:&quot;uppercase&quot;}}&gt;Room Code&lt;/p&gt;
          &lt;p style={{fontSize:38,fontWeight:900,color:&quot;#fff&quot;,margin:0,letterSpacing:8,fontFamily:&quot;&#x27;Courier New&#x27;,monospace&quot;}}&gt;{room.code}&lt;/p&gt;
        &lt;/div&gt;

        {participants.length &gt; 0 &amp;&amp; (
          &lt;div style={{display:&quot;flex&quot;,flexWrap:&quot;wrap&quot;,gap:6,justifyContent:&quot;center&quot;,marginBottom:20}}&gt;
            {participants.map((p,i) =&gt; (
              &lt;span key={p.id} style={{fontSize:12,color:p.id===participant?.id?GOLD:&quot;rgba(255,255,255,0.5)&quot;,background:&quot;rgba(255,255,255,0.05)&quot;,padding:&quot;4px 10px&quot;,borderRadius:20,border:p.id===participant?.id?`1px solid ${GOLD}`:&quot;1px solid transparent&quot;}}&gt;
                {EMOJI_POOL[i%EMOJI_POOL.length]} {p.player_name}
              &lt;/span&gt;
            ))}
          &lt;/div&gt;
        )}

        &lt;div style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,justifyContent:&quot;center&quot;,gap:8}}&gt;
          &lt;div style={{width:8,height:8,borderRadius:&quot;50%&quot;,background:GOLD,animation:&quot;pulse 1s infinite&quot;}}/&gt;
          &lt;p style={{fontSize:13,color:&quot;rgba(255,255,255,0.4)&quot;,margin:0}}&gt;Waiting for the host to start…&lt;/p&gt;
        &lt;/div&gt;
      &lt;/div&gt;
      &lt;style&gt;{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.6;transform:scale(.95)}}`}&lt;/style&gt;
    &lt;/div&gt;
  );

  /* ══ QUESTION HOST ════════════════════════════════ */
  if (view === &quot;question-host&quot; &amp;&amp; room) return (
    &lt;div style={{...pageStyle, padding:&quot;18px 16px&quot;, overflowY:&quot;auto&quot;}}&gt;
      &lt;IslamicBg opacity={0.05}/&gt;
      &lt;div style={{position:&quot;relative&quot;,zIndex:1,maxWidth:600,margin:&quot;0 auto&quot;}}&gt;

        {/* Loading state — shows if currentQ hasn&#x27;t arrived yet */}
        {!currentQ &amp;&amp; (
          &lt;div style={{display:&quot;flex&quot;,flexDirection:&quot;column&quot;,alignItems:&quot;center&quot;,justifyContent:&quot;center&quot;,minHeight:300,gap:16}}&gt;
            &lt;div style={{width:48,height:48,borderRadius:&quot;50%&quot;,border:`4px solid ${GOLD}`,borderTopColor:&quot;transparent&quot;,animation:&quot;spin .8s linear infinite&quot;}}/&gt;
            &lt;p style={{fontSize:14,color:&quot;rgba(255,255,255,0.5)&quot;,margin:0}}&gt;Loading question…&lt;/p&gt;
            &lt;style&gt;{`@keyframes spin{to{transform:rotate(360deg)}}`}&lt;/style&gt;
          &lt;/div&gt;
        )}
        {currentQ &amp;&amp; (&lt;&gt;
      {/* Top bar */}
        &lt;div style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,justifyContent:&quot;space-between&quot;,marginBottom:12}}&gt;
          &lt;div&gt;
            &lt;p style={{fontSize:13,color:&quot;rgba(255,255,255,0.45)&quot;,margin:0}}&gt;
              Question {(room.current_question_index||0)+1} / {room.total_questions}
            &lt;/p&gt;
            &lt;p style={{fontSize:11,color:GOLD,margin:0,fontWeight:700,letterSpacing:0.5}}&gt;{currentQ.topic}&lt;/p&gt;
          &lt;/div&gt;
          &lt;div style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:14}}&gt;
            &lt;div style={{textAlign:&quot;center&quot;}}&gt;
              &lt;p style={{fontSize:11,color:&quot;rgba(255,255,255,0.4)&quot;,margin:0}}&gt;Answered&lt;/p&gt;
              &lt;p style={{fontSize:20,fontWeight:900,color:GOLD,margin:0}}&gt;{numAnswered}&lt;span style={{fontSize:12,color:&quot;rgba(255,255,255,0.4)&quot;}}&gt;/{participants.length}&lt;/span&gt;&lt;/p&gt;
            &lt;/div&gt;
            &lt;TimerRing seconds={timeLeft} total={currentQ.time_limit}/&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        {/* Progress */}
        &lt;div style={{height:3,background:&quot;rgba(255,255,255,0.08)&quot;,borderRadius:2,marginBottom:18,overflow:&quot;hidden&quot;}}&gt;
          &lt;div style={{width:`${((room.current_question_index||0)/room.total_questions)*100}%`,height:&quot;100%&quot;,background:GOLD,borderRadius:2,transition:&quot;width .4s&quot;}}/&gt;
        &lt;/div&gt;

        {/* Question card */}
        &lt;div style={{...glassCard, textAlign:&quot;center&quot;, marginBottom:16, minHeight:90, display:&quot;flex&quot;, alignItems:&quot;center&quot;, justifyContent:&quot;center&quot;}}&gt;
          &lt;LQQuestion text={currentQ.question}/&gt;
        &lt;/div&gt;

        {/* Answer grid */}
        &lt;div style={{display:&quot;grid&quot;,gridTemplateColumns:&quot;1fr 1fr&quot;,gap:10,marginBottom:16}}&gt;
          {currentQ.options.map((opt,i) =&gt; (
            &lt;div key={i} style={{padding:&quot;16px 14px&quot;,borderRadius:14,background:SHAPES[i].bg,border:`2px solid ${SHAPES[i].border}`,display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:10}}&gt;
              &lt;span style={{fontSize:20,fontWeight:900,color:SHAPES[i].border,minWidth:22}}&gt;{SHAPES[i].icon}&lt;/span&gt;
              &lt;span style={{fontSize:13,fontWeight:700,color:&quot;#fff&quot;,lineHeight:1.3}}&gt;{opt}&lt;/span&gt;
            &lt;/div&gt;
          ))}
        &lt;/div&gt;

        {/* Live bar chart */}
        &lt;div style={{background:&quot;rgba(255,255,255,0.03)&quot;,borderRadius:14,padding:&quot;12px 14px&quot;,marginBottom:14,border:&quot;1px solid rgba(255,255,255,0.06)&quot;}}&gt;
          &lt;p style={{fontSize:10,color:&quot;rgba(255,255,255,0.35)&quot;,margin:&quot;0 0 8px&quot;,fontWeight:700,letterSpacing:1.5}}&gt;LIVE RESPONSES&lt;/p&gt;
          &lt;div style={{display:&quot;flex&quot;,gap:8,alignItems:&quot;flex-end&quot;,height:44}}&gt;
            {currentQ.options.map((opt,i) =&gt; {
              const cnt    = answerCounts[opt]||0;
              const maxCnt = Math.max(1,...currentQ.options.map(o=&gt;answerCounts[o]||0));
              return (
                &lt;div key={i} style={{flex:1,display:&quot;flex&quot;,flexDirection:&quot;column&quot;,alignItems:&quot;center&quot;,gap:3}}&gt;
                  &lt;span style={{fontSize:11,color:&quot;rgba(255,255,255,0.6)&quot;,fontWeight:700}}&gt;{cnt}&lt;/span&gt;
                  &lt;div style={{width:&quot;100%&quot;,borderRadius:&quot;4px 4px 0 0&quot;,background:SHAPES[i].border,height:`${Math.max(4,(cnt/maxCnt)*32)}px`,transition:&quot;height .4s ease&quot;,opacity:0.85}}/&gt;
                &lt;/div&gt;
              );
            })}
          &lt;/div&gt;
        &lt;/div&gt;

        &lt;button onClick={handleReveal} style={outlineBtn}&gt;Reveal Answer →&lt;/button&gt;
      &lt;/&gt;)}
      &lt;/div&gt;
    &lt;/div&gt;
  );

  /* ══ COUNTDOWN HOST ══════════════════════════════ */
  if (view === &quot;countdown-host&quot;) return (
    &lt;div style={{...pageStyle, display:&quot;flex&quot;, flexDirection:&quot;column&quot;, alignItems:&quot;center&quot;, justifyContent:&quot;center&quot;, padding:&quot;20px&quot;}}&gt;
      &lt;IslamicBg opacity={0.08}/&gt;
      &lt;div style={{position:&quot;relative&quot;,zIndex:1,textAlign:&quot;center&quot;}}&gt;
        &lt;p style={{fontSize:11,color:&quot;rgba(255,255,255,0.5)&quot;,fontWeight:700,letterSpacing:2,textTransform:&quot;uppercase&quot;,marginBottom:6}}&gt;
          Question {(room?.current_question_index||0)+1} of {room?.total_questions}
        &lt;/p&gt;
        &lt;p style={{fontSize:14,color:GOLD,fontWeight:700,letterSpacing:2,textTransform:&quot;uppercase&quot;,marginBottom:28}}&gt;
          Launching in…
        &lt;/p&gt;
        {/* Giant countdown ring */}
        &lt;div style={{
          width:180,height:180,borderRadius:&quot;50%&quot;,
          background:`conic-gradient(${GOLD} ${(countdown/3)*360}deg, rgba(255,255,255,0.06) 0deg)`,
          display:&quot;flex&quot;,alignItems:&quot;center&quot;,justifyContent:&quot;center&quot;,
          margin:&quot;0 auto 28px&quot;,
          boxShadow:`0 0 60px rgba(201,146,42,${countdown===3?0.6:countdown===2?0.4:0.7})`,
        }}&gt;
          &lt;div style={{width:150,height:150,borderRadius:&quot;50%&quot;,background:&quot;#021F16&quot;,display:&quot;flex&quot;,alignItems:&quot;center&quot;,justifyContent:&quot;center&quot;}}&gt;
            &lt;span style={{
              fontSize:88,fontWeight:900,color:GOLD,
              fontFamily:&quot;&#x27;Playfair Display&#x27;,serif&quot;,
              lineHeight:1,
              animation:&quot;countdown-pop .3s ease&quot;,
              display:&quot;block&quot;,
            }}&gt;{countdown}&lt;/span&gt;
          &lt;/div&gt;
        &lt;/div&gt;

        {/* Info */}
        &lt;div style={{...glassCard, padding:&quot;12px 24px&quot;, marginBottom:20, display:&quot;inline-block&quot;}}&gt;
          &lt;p style={{fontSize:13,color:&quot;rgba(255,255,255,0.6)&quot;,margin:&quot;0 0 2px&quot;}}&gt;Students are getting ready…&lt;/p&gt;
          &lt;p style={{fontSize:12,color:&quot;rgba(255,255,255,0.35)&quot;,margin:0}}&gt;{participants.length} player{participants.length!==1?&quot;s&quot;:&quot;&quot;} in the room&lt;/p&gt;
        &lt;/div&gt;

        {/* Progress dots */}
        &lt;div style={{display:&quot;flex&quot;,gap:10,justifyContent:&quot;center&quot;}}&gt;
          {[3,2,1].map(n =&gt; (
            &lt;div key={n} style={{
              width:12,height:12,borderRadius:&quot;50%&quot;,
              background:countdown&gt;=n?GOLD:&quot;rgba(255,255,255,0.15)&quot;,
              transition:&quot;background .3s&quot;,
              boxShadow:countdown&gt;=n?`0 0 8px ${GOLD}`:&quot;none&quot;,
            }}/&gt;
          ))}
        &lt;/div&gt;
      &lt;/div&gt;
      &lt;style&gt;{`
        @keyframes countdown-pop{0%{transform:scale(1.4);opacity:0}100%{transform:scale(1);opacity:1}}
      `}&lt;/style&gt;
    &lt;/div&gt;
  );

  /* ══ COUNTDOWN PLAYER ════════════════════════════ */
  if (view === &quot;countdown-player&quot;) return (
    &lt;div style={{...pageStyle, display:&quot;flex&quot;, flexDirection:&quot;column&quot;, alignItems:&quot;center&quot;, justifyContent:&quot;center&quot;, padding:&quot;20px&quot;}}&gt;
      &lt;IslamicBg opacity={0.08}/&gt;
      &lt;div style={{position:&quot;relative&quot;,zIndex:1,textAlign:&quot;center&quot;}}&gt;
        &lt;p style={{fontSize:14,color:GOLD,fontWeight:700,letterSpacing:2,textTransform:&quot;uppercase&quot;,marginBottom:32}}&gt;
          Get Ready!
        &lt;/p&gt;
        {/* Giant countdown number */}
        &lt;div style={{
          width:180,height:180,borderRadius:&quot;50%&quot;,
          background:`conic-gradient(${GOLD} ${(countdown/3)*360}deg, rgba(255,255,255,0.06) 0deg)`,
          display:&quot;flex&quot;,alignItems:&quot;center&quot;,justifyContent:&quot;center&quot;,
          margin:&quot;0 auto 28px&quot;,
          boxShadow:`0 0 60px rgba(201,146,42,${countdown===3?0.6:countdown===2?0.4:0.7})`,
          animation:&quot;pulse-ring 1s ease-in-out&quot;,
        }}&gt;
          &lt;div style={{width:150,height:150,borderRadius:&quot;50%&quot;,background:&quot;#021F16&quot;,display:&quot;flex&quot;,alignItems:&quot;center&quot;,justifyContent:&quot;center&quot;}}&gt;
            &lt;span style={{
              fontSize:88,fontWeight:900,color:GOLD,
              fontFamily:&quot;&#x27;Playfair Display&#x27;,serif&quot;,
              lineHeight:1,
              animation:&quot;countdown-pop .3s ease&quot;,
              display:&quot;block&quot;,
            }}&gt;{countdown}&lt;/span&gt;
          &lt;/div&gt;
        &lt;/div&gt;
        &lt;p style={{fontSize:16,color:&quot;rgba(255,255,255,0.45)&quot;,fontWeight:600}}&gt;
          {countdown === 3 ? &quot;📖 Read the question…&quot; : countdown === 2 ? &quot;🤔 Think carefully…&quot; : &quot;⚡ Almost time!&quot;}
        &lt;/p&gt;
        {/* Progress dots */}
        &lt;div style={{display:&quot;flex&quot;,gap:10,justifyContent:&quot;center&quot;,marginTop:24}}&gt;
          {[3,2,1].map(n =&gt; (
            &lt;div key={n} style={{
              width:12,height:12,borderRadius:&quot;50%&quot;,
              background:countdown&gt;=n?GOLD:&quot;rgba(255,255,255,0.15)&quot;,
              transition:&quot;background .3s&quot;,
              boxShadow:countdown&gt;=n?`0 0 8px ${GOLD}`:&quot;none&quot;,
            }}/&gt;
          ))}
        &lt;/div&gt;
      &lt;/div&gt;
      &lt;style&gt;{`
        @keyframes countdown-pop{0%{transform:scale(1.4);opacity:0}100%{transform:scale(1);opacity:1}}
        @keyframes pulse-ring{0%{transform:scale(0.9)}50%{transform:scale(1.02)}100%{transform:scale(1)}}
      `}&lt;/style&gt;
    &lt;/div&gt;
  );

  /* ══ QUESTION PLAYER ══════════════════════════════ */
  if (view === &quot;question-player&quot;) return (
    &lt;div style={{...pageStyle, padding:&quot;18px 16px&quot;}}&gt;
      &lt;IslamicBg opacity={0.05}/&gt;
      &lt;div style={{position:&quot;relative&quot;,zIndex:1,maxWidth:480,margin:&quot;0 auto&quot;}}&gt;

        {!currentQ &amp;&amp; (
          &lt;div style={{display:&quot;flex&quot;,flexDirection:&quot;column&quot;,alignItems:&quot;center&quot;,justifyContent:&quot;center&quot;,minHeight:&quot;70vh&quot;,gap:16}}&gt;
            &lt;div style={{width:44,height:44,borderRadius:&quot;50%&quot;,border:`4px solid ${GOLD}`,borderTopColor:&quot;transparent&quot;,animation:&quot;lqspin .8s linear infinite&quot;}}/&gt;
            &lt;p style={{fontSize:14,color:&quot;rgba(255,255,255,0.5)&quot;,margin:0}}&gt;Loading question…&lt;/p&gt;
            &lt;style&gt;{`@keyframes lqspin{to{transform:rotate(360deg)}}`}&lt;/style&gt;
          &lt;/div&gt;
        )}
        {currentQ &amp;&amp; (&lt;&gt;
        &lt;div style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,justifyContent:&quot;space-between&quot;,marginBottom:16}}&gt;
          &lt;div&gt;
            &lt;p style={{fontSize:13,color:&quot;rgba(255,255,255,0.45)&quot;,margin:0}}&gt;Q{(room?.current_question_index||0)+1}&lt;/p&gt;
            &lt;p style={{fontSize:12,color:GOLD,fontWeight:700,margin:0}}&gt;{participant?.player_name} · {participant?.score||0} pts&lt;/p&gt;
          &lt;/div&gt;
          &lt;TimerRing seconds={timeLeft} total={currentQ.time_limit}/&gt;
        &lt;/div&gt;

        {/* Question */}
        &lt;div style={{...glassCard, textAlign:&quot;center&quot;, minHeight:100, display:&quot;flex&quot;, alignItems:&quot;center&quot;, justifyContent:&quot;center&quot;, marginBottom:20}}&gt;
          &lt;LQQuestion text={currentQ.question}/&gt;
        &lt;/div&gt;

        {/* Options */}
        &lt;div style={{display:&quot;flex&quot;,flexDirection:&quot;column&quot;,gap:10}}&gt;
          {currentQ.options.map((opt,i) =&gt; {
            const isSel = selectedAns === opt;
            return (
              &lt;button key={i} onClick={()=&gt;submitAnswer(opt)} disabled={!!selectedAns}
                style={{padding:&quot;16px 18px&quot;,borderRadius:14,border:`2px solid ${isSel?SHAPES[i].border:&quot;rgba(255,255,255,0.12)&quot;}`,background:isSel?SHAPES[i].bg:&quot;rgba(255,255,255,0.04)&quot;,color:&quot;#fff&quot;,cursor:selectedAns?&quot;default&quot;:&quot;pointer&quot;,fontWeight:700,fontSize:15,textAlign:&quot;left&quot;,display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:12,transition:&quot;all .2s&quot;,transform:isSel?&quot;scale(1.02)&quot;:&quot;scale(1)&quot;,boxShadow:isSel?`0 0 20px ${SHAPES[i].border}40`:&quot;none&quot;}}&gt;
                &lt;span style={{fontSize:20,color:SHAPES[i].border,minWidth:22}}&gt;{SHAPES[i].icon}&lt;/span&gt;
                &lt;span style={{flex:1}}&gt;{opt}&lt;/span&gt;
                {isSel &amp;&amp; &lt;span style={{fontSize:20}}&gt;✓&lt;/span&gt;}
              &lt;/button&gt;
            );
          })}
        &lt;/div&gt;

        {selectedAns &amp;&amp; (
          &lt;div style={{marginTop:18,textAlign:&quot;center&quot;,padding:&quot;14px&quot;,background:&quot;rgba(255,255,255,0.04)&quot;,borderRadius:12,border:&quot;1px solid rgba(255,255,255,0.08)&quot;}}&gt;
            &lt;p style={{fontSize:13,color:&quot;rgba(255,255,255,0.5)&quot;,margin:0}}&gt;⏳ Answer locked — waiting for host…&lt;/p&gt;
          &lt;/div&gt;
        )}
        &lt;/&gt;)}
      &lt;/div&gt;
    &lt;/div&gt;
  );

  /* ══ REVEAL HOST ══════════════════════════════════ */
  if (view === &quot;reveal-host&quot; &amp;&amp; currentQ &amp;&amp; room) return (
    &lt;div style={{...pageStyle, padding:&quot;20px 16px&quot;, overflowY:&quot;auto&quot;}}&gt;
      &lt;IslamicBg opacity={0.06}/&gt;
      &lt;div style={{position:&quot;relative&quot;,zIndex:1,maxWidth:600,margin:&quot;0 auto&quot;}}&gt;

        {/* Correct answer reveal */}
        &lt;div style={{textAlign:&quot;center&quot;,marginBottom:20}}&gt;
          &lt;div style={{fontSize:44,marginBottom:8}}&gt;✅&lt;/div&gt;
          &lt;h3 style={{fontFamily:&quot;&#x27;Playfair Display&#x27;,serif&quot;,fontWeight:900,fontSize:22,color:&quot;#fff&quot;,margin:&quot;0 0 10px&quot;}}&gt;Correct Answer&lt;/h3&gt;
          &lt;div style={{background:`rgba(201,146,42,0.15)`,border:`2px solid ${GOLD}`,borderRadius:16,padding:&quot;14px 24px&quot;,display:&quot;inline-block&quot;,boxShadow:`0 4px 24px rgba(201,146,42,0.3)`}}&gt;
            &lt;p style={{fontSize:18,fontWeight:900,color:GOLD,margin:0}}&gt;{currentQ.correct_answer}&lt;/p&gt;
          &lt;/div&gt;
          {currentQ.explanation &amp;&amp; (
            &lt;p style={{fontSize:13,color:&quot;rgba(255,255,255,0.55)&quot;,marginTop:10,fontStyle:&quot;italic&quot;,maxWidth:360,margin:&quot;10px auto 0&quot;}}&gt;📖 {currentQ.explanation}&lt;/p&gt;
          )}
        &lt;/div&gt;

        {/* Answer distribution */}
        &lt;div style={{...glassCard, marginBottom:14}}&gt;
          &lt;p style={{fontSize:11,color:GOLD,fontWeight:700,margin:&quot;0 0 12px&quot;,letterSpacing:1.5,textTransform:&quot;uppercase&quot;}}&gt;Answer Distribution&lt;/p&gt;
          &lt;div style={{display:&quot;flex&quot;,flexDirection:&quot;column&quot;,gap:8}}&gt;
            {currentQ.options.map((opt,i) =&gt; {
              const cnt    = answerCounts[opt]||0;
              const maxCnt = Math.max(1,...currentQ.options.map(o=&gt;answerCounts[o]||0));
              const isCorrect = opt === currentQ.correct_answer;
              return (
                &lt;div key={i} style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:10}}&gt;
                  &lt;span style={{fontSize:14,color:SHAPES[i].border,minWidth:16}}&gt;{SHAPES[i].icon}&lt;/span&gt;
                  &lt;div style={{flex:1,height:28,background:&quot;rgba(255,255,255,0.05)&quot;,borderRadius:8,overflow:&quot;hidden&quot;,position:&quot;relative&quot;}}&gt;
                    &lt;div style={{height:&quot;100%&quot;,width:`${Math.max(4,(cnt/Math.max(1,numAnswered||1))*100)}%`,background:isCorrect?`${GOLD}CC`:SHAPES[i].border+&quot;88&quot;,borderRadius:8,transition:&quot;width .5s ease&quot;,display:&quot;flex&quot;,alignItems:&quot;center&quot;,paddingLeft:8}}&gt;
                      &lt;span style={{fontSize:11,fontWeight:700,color:&quot;#fff&quot;,whiteSpace:&quot;nowrap&quot;}}&gt;{opt.slice(0,20)}{opt.length&gt;20?&quot;…&quot;:&quot;&quot;}&lt;/span&gt;
                    &lt;/div&gt;
                  &lt;/div&gt;
                  &lt;span style={{fontSize:13,fontWeight:800,color:isCorrect?GOLD:&quot;rgba(255,255,255,0.6)&quot;,minWidth:22,textAlign:&quot;right&quot;}}&gt;{cnt}&lt;/span&gt;
                  {isCorrect &amp;&amp; &lt;span style={{fontSize:14}}&gt;✅&lt;/span&gt;}
                &lt;/div&gt;
              );
            })}
          &lt;/div&gt;
        &lt;/div&gt;

        {/* Leaderboard */}
        &lt;div style={{...glassCard, marginBottom:16}}&gt;
          &lt;h4 style={{fontWeight:800,fontSize:13,color:GOLD,margin:&quot;0 0 12px&quot;,letterSpacing:1.5,textTransform:&quot;uppercase&quot;,display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:8}}&gt;
            &lt;Trophy size={14}/&gt; Leaderboard
          &lt;/h4&gt;
          {participants.slice(0,5).map((p,i) =&gt; (
            &lt;div key={p.id} style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:12,padding:&quot;9px 0&quot;,borderBottom:i&lt;Math.min(4,participants.length-1)?&quot;1px solid rgba(255,255,255,0.06)&quot;:&quot;none&quot;}}&gt;
              &lt;span style={{fontSize:16,minWidth:24}}&gt;{[&quot;🥇&quot;,&quot;🥈&quot;,&quot;🥉&quot;,&quot;4️⃣&quot;,&quot;5️⃣&quot;][i]}&lt;/span&gt;
              &lt;span style={{fontSize:14,fontWeight:700,color:&quot;#fff&quot;,flex:1}}&gt;{p.player_name}&lt;/span&gt;
              &lt;span style={{fontSize:15,fontWeight:900,color:GOLD}}&gt;{p.score}&lt;/span&gt;
            &lt;/div&gt;
          ))}
        &lt;/div&gt;

        &lt;button onClick={nextQuestion} style={goldBtn}&gt;
          {(room.current_question_index||0)+1 &gt;= room.total_questions
            ? &quot;🏁 Show Final Results&quot;
            : &lt;&gt;Next Question &lt;ArrowRight size={16}/&gt;&lt;/&gt;}
        &lt;/button&gt;
      &lt;/div&gt;
    &lt;/div&gt;
  );

  /* ══ REVEAL PLAYER ════════════════════════════════ */
  if (view === &quot;reveal-player&quot;) {
    if (!currentQ) return (
      &lt;div style={{...pageStyle, display:&quot;flex&quot;, flexDirection:&quot;column&quot;, alignItems:&quot;center&quot;, justifyContent:&quot;center&quot;, gap:16}}&gt;
        &lt;div style={{width:44,height:44,borderRadius:&quot;50%&quot;,border:`4px solid ${GOLD}`,borderTopColor:&quot;transparent&quot;,animation:&quot;lqspin .8s linear infinite&quot;}}/&gt;
        &lt;p style={{fontSize:14,color:&quot;rgba(255,255,255,0.5)&quot;,margin:0}}&gt;Loading results…&lt;/p&gt;
        &lt;style&gt;{`@keyframes lqspin{to{transform:rotate(360deg)}}`}&lt;/style&gt;
      &lt;/div&gt;
    );
    const correct = selectedAns === currentQ.correct_answer;
    const myRank  = participants.findIndex(p =&gt; p.id === participant?.id) + 1;
    return (
      &lt;div style={{...pageStyle, padding:&quot;24px 18px&quot;, overflowY:&quot;auto&quot;}}&gt;
        &lt;IslamicBg opacity={0.06}/&gt;
        &lt;div style={{position:&quot;relative&quot;,zIndex:1,maxWidth:420,margin:&quot;0 auto&quot;,textAlign:&quot;center&quot;}}&gt;

          {/* Result */}
          &lt;div style={{fontSize:64,marginBottom:8,animation:&quot;bounce .6s ease&quot;}}&gt;{correct?&quot;🌟&quot;:&quot;😔&quot;}&lt;/div&gt;
          &lt;h2 style={{fontFamily:&quot;&#x27;Playfair Display&#x27;,serif&quot;,fontWeight:900,fontSize:28,color:correct?GOLD:&quot;#EF4444&quot;,margin:&quot;0 0 6px&quot;}}&gt;
            {correct ? &quot;Correct!&quot; : &quot;Wrong!&quot;}
          &lt;/h2&gt;
          &lt;p style={{fontSize:14,color:&quot;rgba(255,255,255,0.55)&quot;,margin:&quot;0 0 16px&quot;}}&gt;
            {correct ? &quot;+500 points&quot; : `Correct: ${currentQ.correct_answer}`}
          &lt;/p&gt;

          {/* Explanation */}
          {currentQ.explanation &amp;&amp; (
            &lt;div style={{...glassCard, marginBottom:14, textAlign:&quot;left&quot;}}&gt;
              &lt;p style={{fontSize:13,color:&quot;rgba(255,255,255,0.6)&quot;,margin:0,fontStyle:&quot;italic&quot;}}&gt;📖 {currentQ.explanation}&lt;/p&gt;
            &lt;/div&gt;
          )}

          {/* Score + Rank row */}
          &lt;div style={{display:&quot;flex&quot;,gap:10,marginBottom:16}}&gt;
            &lt;div style={{flex:1,background:&quot;rgba(201,146,42,0.12)&quot;,border:&quot;1.5px solid rgba(201,146,42,0.35)&quot;,borderRadius:14,padding:&quot;14px 10px&quot;}}&gt;
              &lt;p style={{fontSize:10,color:&quot;rgba(255,255,255,0.45)&quot;,margin:&quot;0 0 2px&quot;,letterSpacing:1,textTransform:&quot;uppercase&quot;}}&gt;Your Score&lt;/p&gt;
              &lt;p style={{fontSize:32,fontWeight:900,color:GOLD,margin:0}}&gt;{participant?.score||0}&lt;/p&gt;
            &lt;/div&gt;
            {myRank &gt; 0 &amp;&amp; (
              &lt;div style={{flex:1,background:&quot;rgba(255,255,255,0.04)&quot;,border:&quot;1px solid rgba(255,255,255,0.1)&quot;,borderRadius:14,padding:&quot;14px 10px&quot;}}&gt;
                &lt;p style={{fontSize:10,color:&quot;rgba(255,255,255,0.45)&quot;,margin:&quot;0 0 2px&quot;,letterSpacing:1,textTransform:&quot;uppercase&quot;}}&gt;Your Rank&lt;/p&gt;
                &lt;p style={{fontSize:32,fontWeight:900,color:&quot;#fff&quot;,margin:0}}&gt;#{myRank}&lt;/p&gt;
              &lt;/div&gt;
            )}
          &lt;/div&gt;

          {/* Leaderboard */}
          {participants.length &gt; 0 &amp;&amp; (
            &lt;div style={{...glassCard, textAlign:&quot;left&quot;, marginBottom:16}}&gt;
              &lt;h4 style={{fontWeight:800,fontSize:12,color:GOLD,margin:&quot;0 0 12px&quot;,letterSpacing:1.5,textTransform:&quot;uppercase&quot;,display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:8}}&gt;
                &lt;Trophy size={13}/&gt; Leaderboard
              &lt;/h4&gt;
              {participants.slice(0,5).map((p,i) =&gt; (
                &lt;div key={p.id} style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:10,padding:&quot;8px&quot;,borderRadius:10,marginBottom:2,background:p.id===participant?.id?&quot;rgba(201,146,42,0.12)&quot;:&quot;transparent&quot;,border:p.id===participant?.id?&quot;1px solid rgba(201,146,42,0.3)&quot;:&quot;1px solid transparent&quot;}}&gt;
                  &lt;span style={{fontSize:16,minWidth:24}}&gt;{[&quot;🥇&quot;,&quot;🥈&quot;,&quot;🥉&quot;,&quot;4️⃣&quot;,&quot;5️⃣&quot;][i]}&lt;/span&gt;
                  &lt;span style={{flex:1,fontSize:13,fontWeight:700,color:p.id===participant?.id?GOLD:&quot;#fff&quot;}}&gt;
                    {p.player_name}{p.id===participant?.id?&quot; (You)&quot;:&quot;&quot;}
                  &lt;/span&gt;
                  &lt;span style={{fontSize:14,fontWeight:900,color:GOLD}}&gt;{p.score}&lt;/span&gt;
                &lt;/div&gt;
              ))}
            &lt;/div&gt;
          )}

          &lt;p style={{fontSize:12,color:&quot;rgba(255,255,255,0.3)&quot;}}&gt;⏳ Waiting for next question…&lt;/p&gt;
        &lt;/div&gt;
        &lt;style&gt;{`@keyframes bounce{0%,100%{transform:scale(1)}50%{transform:scale(1.2)}}`}&lt;/style&gt;
      &lt;/div&gt;
    );
  }

  /* ══ RESULTS ══════════════════════════════════════ */
  if ((view===&quot;results-host&quot;||view===&quot;results-player&quot;) &amp;&amp; room) {
    const myRank = participants.findIndex(p=&gt;p.id===participant?.id)+1;
    const top3   = [participants[1], participants[0], participants[2]];
    return (
      &lt;div style={{...pageStyle, padding:&quot;24px 18px&quot;, overflowY:&quot;auto&quot;}}&gt;
        &lt;IslamicBg opacity={0.09}/&gt;
        &lt;div style={{position:&quot;relative&quot;,zIndex:1,maxWidth:480,margin:&quot;0 auto&quot;,textAlign:&quot;center&quot;}}&gt;

          {/* Trophy header */}
          &lt;div style={{marginBottom:20}}&gt;
            &lt;div style={{fontSize:60,marginBottom:8}}&gt;🏆&lt;/div&gt;
            &lt;h1 style={{fontFamily:&quot;&#x27;Playfair Display&#x27;,serif&quot;,fontWeight:900,fontSize:32,color:&quot;#fff&quot;,margin:&quot;0 0 4px&quot;}}&gt;Quiz Complete!&lt;/h1&gt;
            &lt;p style={{fontSize:16,color:GOLD,fontWeight:700,letterSpacing:1,fontFamily:&quot;&#x27;Amiri&#x27;,serif&quot;}}&gt;مبروك — Congratulations!&lt;/p&gt;
          &lt;/div&gt;

          {/* Podium */}
          &lt;div style={{display:&quot;flex&quot;,alignItems:&quot;flex-end&quot;,justifyContent:&quot;center&quot;,gap:6,marginBottom:24,height:130}}&gt;
            {top3.map((p,i) =&gt; {
              if (!p) return &lt;div key={i} style={{flex:1}}/&gt;;
              const heights  = [100,130,80];
              const medals   = [&quot;🥈&quot;,&quot;🥇&quot;,&quot;🥉&quot;];
              const bgAlpha  = [&quot;rgba(192,192,192,0.12)&quot;,&quot;rgba(201,146,42,0.2)&quot;,&quot;rgba(205,127,50,0.12)&quot;];
              const borderC  = [&quot;rgba(192,192,192,0.3)&quot;,GOLD,&quot;rgba(205,127,50,0.3)&quot;];
              return (
                &lt;div key={p.id} style={{flex:1,height:heights[i],background:bgAlpha[i],borderRadius:&quot;12px 12px 0 0&quot;,border:`1px solid ${borderC[i]}`,display:&quot;flex&quot;,flexDirection:&quot;column&quot;,alignItems:&quot;center&quot;,justifyContent:&quot;flex-start&quot;,padding:&quot;8px 4px&quot;,gap:2}}&gt;
                  &lt;span style={{fontSize:22}}&gt;{medals[i]}&lt;/span&gt;
                  &lt;p style={{fontSize:11,fontWeight:800,color:&quot;#fff&quot;,margin:0,lineHeight:1.2,wordBreak:&quot;break-word&quot;,padding:&quot;0 4px&quot;}}&gt;{p.player_name}&lt;/p&gt;
                  &lt;p style={{fontSize:13,fontWeight:900,color:GOLD,margin:0}}&gt;{p.score}&lt;/p&gt;
                &lt;/div&gt;
              );
            })}
          &lt;/div&gt;

          {/* Full list */}
          &lt;div style={{...glassCard, textAlign:&quot;left&quot;, marginBottom:16}}&gt;
            &lt;h4 style={{fontWeight:800,fontSize:13,color:GOLD,margin:&quot;0 0 12px&quot;,letterSpacing:1.5,textTransform:&quot;uppercase&quot;,display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:8}}&gt;
              &lt;Trophy size={13}/&gt; Final Standings
            &lt;/h4&gt;
            {participants.map((p,i) =&gt; (
              &lt;div key={p.id} style={{display:&quot;flex&quot;,alignItems:&quot;center&quot;,gap:12,padding:&quot;10px 8px&quot;,borderRadius:10,marginBottom:2,background:p.id===participant?.id?`rgba(201,146,42,0.1)`:&quot;transparent&quot;,border:p.id===participant?.id?`1px solid rgba(201,146,42,0.25)`:&quot;1px solid transparent&quot;}}&gt;
                &lt;span style={{fontSize:14,minWidth:26,textAlign:&quot;center&quot;}}&gt;{i&lt;3?[&quot;🥇&quot;,&quot;🥈&quot;,&quot;🥉&quot;][i]:`#${i+1}`}&lt;/span&gt;
                &lt;span style={{flex:1,fontSize:14,fontWeight:700,color:p.id===participant?.id?GOLD:&quot;#fff&quot;}}&gt;
                  {p.player_name}{p.id===participant?.id?&quot; (You)&quot;:&quot;&quot;}
                &lt;/span&gt;
                &lt;span style={{fontSize:15,fontWeight:900,color:GOLD}}&gt;{p.score}&lt;/span&gt;
              &lt;/div&gt;
            ))}
          &lt;/div&gt;

          {view===&quot;results-player&quot; &amp;&amp; myRank&gt;0 &amp;&amp; (
            &lt;div style={{marginBottom:16,padding:&quot;12px 20px&quot;,background:`rgba(201,146,42,0.1)`,borderRadius:14,border:`1px solid rgba(201,146,42,0.25)`}}&gt;
              &lt;p style={{fontSize:14,color:&quot;rgba(255,255,255,0.7)&quot;,margin:0}}&gt;
                You finished &lt;strong style={{color:GOLD,fontSize:18}}&gt;#{myRank}&lt;/strong&gt; out of {participants.length} players
              &lt;/p&gt;
            &lt;/div&gt;
          )}

          &lt;button onClick={resetAll} style={goldBtn}&gt;
            &lt;RotateCcw size={16}/&gt; Back to Home
          &lt;/button&gt;
        &lt;/div&gt;
      &lt;/div&gt;
    );
  }

  return null;
};

export default LiveQuiz;</pre>
<div class="bottom-bar">
  <button class="bottom-copy" id="botBtn" onclick="copyCode()">📋 Tap to Copy — src/pages/LiveQuiz.tsx</button>
</div>
<script>
const CODE = document.getElementById('codeBlock').textContent;
function copyCode() {
  navigator.clipboard.writeText(CODE).then(() => {
    ['topBtn','botBtn'].forEach(id => {
      document.getElementById(id).textContent = '✅ Copied!';
      document.getElementById(id).classList.add('copied');
    });
    setTimeout(() => {
      document.getElementById('topBtn').textContent = '📋 Copy';
      document.getElementById('botBtn').textContent = '📋 Tap to Copy — src/pages/LiveQuiz.tsx';
      ['topBtn','botBtn'].forEach(id => document.getElementById(id).classList.remove('copied'));
    }, 3000);
  });
}
<h1>Live Quiz</h1>
    </div>
  );
};

export default LiveQuiz; */}
      <h1>Live Quiz</h1>
    </div>
  );
};

export default LiveQuiz;