// src/pages/student/HifdhDailyRevisionPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Standalone Daily Hifdh Revision page — completely separate from Murojah
//
//  Route: /student/hifdh-daily
//
//  Sections:
//    • Today   — today's pages, start session CTA, week progress strip
//    • Schedule — full day-by-day programme timeline
//    • History  — past sessions with scores and breakdown
//
//  Session flow (full-screen overlay):
//    intro → reading (recite aloud, AI listens) → page_result (≥75% gate)
//    → testing (MCQ, ≥75% gate) → complete (submit + notify)
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, Mic, MicOff, BookOpen, CalendarDays, Clock, Trophy,
  Star, CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  Flame, Target, TrendingUp, Play, RefreshCcw, Heart, Loader2,
  BookMarked, BarChart2, Lock,
} from "lucide-react";

/* ── Design tokens ──────────────────────────────────────────────── */
const G0   = "#061409";
const G1   = "#0f2d1f";
const G2   = "#1a3d27";
const G3   = "#276749";
const GOLD = "#c9a84c";
const GOLD_L = "#e6c97a";
const W    = "#ffffff";
const WARM = "#faf8f4";
const BRD  = "#e5ddd3";
const INK  = "#1a1209";
const PASS = "#16a34a";
const FAIL = "#dc2626";
const AMBER = "#d97706";
const PASS_THRESHOLD = 75;

/* ── Interfaces ─────────────────────────────────────────────────── */
interface Assignment {
  id: string; student_id: string;
  mode: "juz" | "hizb" | "surah";
  selected_items: number[]; daily_pages: number;
  program_start?: string; starts_on?: string;
  days_off?: number[];     weekend_off?: boolean;
  program_days?: number;   notes?: string;
}
interface DailyLog {
  id: string; log_date: string; completed: boolean;
  avg_score: number | null; pages_revised: number | null;
  duration_secs: number | null;
  acknowledged_at?: string | null;
  session_data?: { page_results?: PageResult[]; errors?: any[] };
}
interface Ayah {
  number: number; numberInSurah: number; text: string;
  surah: { number: number; name: string; englishName: string };
}
interface PageResult {
  pageNum: number; score: number; errorWords: string[]; ayahs: Ayah[];
}
interface Question {
  id: number; type: "next_verse" | "missing_word";
  prompt: string; promptLabel: string;
  options: string[]; correct: number; correctText: string;
}
type Phase = "intro"|"reading"|"page_result"|"testing"|"test_result"|"complete";
type MainTab = "today"|"schedule"|"history";

/* ── Day descriptor ─────────────────────────────────────────────── */
interface ProgramDay {
  dayNum: number; date: string; isWorkingDay: boolean;
  pages: number[]; status: "done"|"missed"|"today"|"future";
  log?: DailyLog;
}

/* ── Quran page maps (Madani Mushaf, 604 pages) ─────────────────── */
const JUZ_START_PAGES: Record<number, number> = {
  1:1,   2:22,  3:42,  4:62,  5:82,  6:102, 7:122, 8:142, 9:162, 10:182,
  11:202,12:222,13:242,14:262,15:282,16:302,17:322,18:342,19:362,20:382,
  21:402,22:422,23:442,24:462,25:482,26:502,27:522,28:542,29:562,30:582,
};

// Hizb = half a Juz (~10 pages each). 60 hizbs total.
function getHizbStartPage(h: number): number {
  const juz = Math.ceil(h / 2);
  const isSecond = h % 2 === 0;
  return (JUZ_START_PAGES[juz] ?? 1) + (isSecond ? 10 : 0);
}

const SURAH_START_PAGES: Record<number, number> = {
  1:1,   2:2,   3:50,  4:77,  5:106, 6:128, 7:151, 8:177, 9:187, 10:208,
  11:221,12:235,13:249,14:255,15:262,16:267,17:282,18:293,19:305,20:312,
  21:322,22:332,23:342,24:350,25:359,26:367,27:377,28:385,29:396,30:404,
  31:411,32:415,33:418,34:428,35:434,36:440,37:446,38:453,39:458,40:467,
  41:477,42:483,43:489,44:496,45:499,46:502,47:507,48:511,49:515,50:518,
  51:520,52:523,53:526,54:528,55:531,56:534,57:537,58:542,59:545,60:549,
  61:551,62:553,63:554,64:556,65:558,66:560,67:562,68:564,69:566,70:568,
  71:570,72:572,73:574,74:575,75:577,76:578,77:580,78:582,79:583,80:585,
  81:586,82:587,83:587,84:589,85:590,86:591,87:591,88:592,89:593,90:594,
  91:595,92:595,93:596,94:596,95:597,96:597,97:598,98:598,99:599,100:599,
  101:600,102:601,103:601,104:601,105:602,106:602,107:602,108:603,109:603,110:603,
  111:603,112:604,113:604,114:604,
};

/**
 * Returns the absolute Quran page number where the assignment content begins.
 * For Juz 28 → 542, so day 1 = page 542, day 2 = page 543, etc.
 */
function getAssignmentStartPage(a: Assignment): number {
  const first = a.selected_items?.[0];
  if (!first) return 1;
  if (a.mode === "juz")   return JUZ_START_PAGES[first]  ?? 1;
  if (a.mode === "hizb")  return getHizbStartPage(first);
  if (a.mode === "surah") return SURAH_START_PAGES[first] ?? 1;
  return 1;
}

/* ── Helpers ────────────────────────────────────────────────────── */
function getStartDate(a: Assignment): string|undefined {
  return a.program_start || a.starts_on || undefined;
}
function getDaysOff(a: Assignment): number[] {
  if (Array.isArray(a.days_off)) return a.days_off;
  return a.weekend_off ? [0] : [];
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}
function todayISO(): string { return new Date().toISOString().split("T")[0]; }

/** Working days elapsed from startDate up to (not including) today */
function workingDaysElapsed(startDate: string, daysOff: number[]): number {
  const start = new Date(startDate + "T00:00:00");
  const now   = new Date(); now.setHours(0,0,0,0);
  let count = 0; const cur = new Date(start);
  while (cur < now) {
    if (!daysOff.includes(cur.getDay())) count++;
    cur.setDate(cur.getDate()+1);
  }
  return count;
}

/** Build full programme day list with correct absolute Quran page numbers */
function buildProgramDays(
  a: Assignment,
  logs: DailyLog[],
  today: string,
): ProgramDay[] {
  const startDate = getStartDate(a);
  if (!startDate) return [];
  const base       = getAssignmentStartPage(a);  // e.g. Juz 28 → page 542
  const daysOff    = getDaysOff(a);
  const totalDays  = a.program_days ?? 30;
  const logMap     = new Map(logs.map(l => [l.log_date, l]));
  const days: ProgramDay[] = [];
  let workDayIdx = 0;
  let calDay = 0;

  while (workDayIdx < totalDays) {
    const date      = addDays(startDate, calDay);
    const dayOfWeek = new Date(date+"T00:00:00").getDay();
    const isWork    = !daysOff.includes(dayOfWeek);
    if (isWork) {
      const offset = Math.floor(workDayIdx * a.daily_pages);
      const pages  = Array.from({length: a.daily_pages}, (_, i) => base + offset + i)
                          .filter(p => p >= 1 && p <= 604);
      const log    = logMap.get(date);
      const status: ProgramDay["status"] =
        date < today  ? (log?.completed ? "done" : "missed")
        : date===today ? "today"
        : "future";
      days.push({ dayNum: workDayIdx+1, date, isWorkingDay: true, pages, status, log });
      workDayIdx++;
    }
    calDay++;
    if (calDay > totalDays*3) break;
  }
  return days;
}

/** Today's absolute Quran page numbers, offset from the Juz/Hizb/Surah start */
function getTodayPages(a: Assignment): number[] {
  const base      = getAssignmentStartPage(a);   // e.g. Juz 28 → 542
  const startDate = getStartDate(a);
  const elapsed   = startDate ? workingDaysElapsed(startDate, getDaysOff(a)) : 0;
  const offset    = Math.floor(elapsed * a.daily_pages); // pages already covered
  return Array.from({length: a.daily_pages}, (_, i) => base + offset + i)
              .filter(p => p >= 1 && p <= 604);
}

/* ── Quran fetcher ──────────────────────────────────────────────── */
async function fetchPageAyahs(page: number): Promise<Ayah[]> {
  const r = await fetch(`https://api.alquran.cloud/v1/page/${page}/quran-uthmani`);
  if (!r.ok) return [];
  const j = await r.json();
  return (j?.data?.ayahs ?? []) as Ayah[];
}

/* ── Arabic scoring ─────────────────────────────────────────────── */
function normalizeAr(t: string): string {
  return t
    .replace(/[\u064B-\u065F\u0610-\u061A\u0670]/g,"")
    .replace(/[\u0622\u0623\u0625\u0627]/g,"\u0627")
    .replace(/\u0629/g,"\u0647").replace(/\u0649/g,"\u064A")
    .replace(/\u0640/g,"")
    .replace(/[^\u0621-\u063A\u0641-\u064A\s]/g,"")
    .replace(/\s+/g," ").trim();
}
function scoreText(transcript: string, ayahs: Ayah[], recSecs: number): number {
  const ref  = ayahs.map(a=>a.text).join(" ");
  const refW = normalizeAr(ref).split(" ").filter(Boolean);
  const gotW = normalizeAr(transcript).split(" ").filter(Boolean);
  if (!refW.length) return 0;
  if (!gotW.length) return recSecs>=45?40:0;
  const used=new Set<number>(); let matches=0;
  for (const rw of refW) {
    for (let i=0;i<gotW.length;i++) {
      if (used.has(i)) continue;
      const gw=gotW[i];
      if (rw===gw||(rw.length>=4&&gw.length>=4&&rw.slice(0,4)===gw.slice(0,4))) {
        matches++; used.add(i); break;
      }
    }
  }
  const base=Math.round((matches/refW.length)*100);
  const bonus=recSecs>=60?10:recSecs>=30?5:0;
  return Math.min(100,base+bonus);
}
function getErrorWords(transcript: string, ayahs: Ayah[]): string[] {
  const ref  = ayahs.map(a=>a.text).join(" ");
  const refW = normalizeAr(ref).split(" ").filter(Boolean);
  const gotW = normalizeAr(transcript).split(" ").filter(Boolean);
  const used = new Set<number>(); const errs: string[]=[];
  for (const rw of refW) {
    let found=false;
    for (let i=0;i<gotW.length;i++) {
      if (used.has(i)) continue;
      if (rw===gotW[i]||(rw.length>=4&&gotW[i].length>=4&&rw.slice(0,4)===gotW[i].slice(0,4))){
        used.add(i); found=true; break;
      }
    }
    if (!found) errs.push(rw);
  }
  return errs;
}
function shuffle<T>(arr:T[]): T[] {
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function buildQuestions(results: PageResult[]): Question[] {
  const allAyahs = results.flatMap(r=>r.ayahs);
  const qs: Question[] = [];
  let id = 0;
  // Next-verse questions (up to 5)
  const step1 = Math.max(1,Math.floor(allAyahs.length/5));
  for(let i=0;i<allAyahs.length-1&&qs.filter(q=>q.type==="next_verse").length<5;i+=step1){
    const correct=allAyahs[i+1];
    const wrongs =shuffle(allAyahs.filter((_,j)=>j!==i+1)).slice(0,3);
    if(wrongs.length<2) continue;
    const opts=shuffle([correct,...wrongs]);
    qs.push({id:id++,type:"next_verse",
      prompt:allAyahs[i].text,
      promptLabel:`${allAyahs[i].surah.englishName} · Verse ${allAyahs[i].numberInSurah}`,
      options:opts.map(o=>o.text), correct:opts.indexOf(correct), correctText:correct.text});
  }
  // Missing-word questions (up to 4)
  const step2 = Math.max(1,Math.floor(allAyahs.length/4));
  for(let i=0;i<allAyahs.length&&qs.filter(q=>q.type==="missing_word").length<4;i+=step2){
    const ayah=allAyahs[i]; const words=ayah.text.split(" ");
    if(words.length<4) continue;
    const bi=1+Math.floor(Math.random()*(words.length-2));
    const cw=words[bi];
    const blanked=words.map((w,j)=>j===bi?"____":w).join(" ");
    const pool=allAyahs.flatMap(a=>a.text.split(" ")).filter(w=>w!==cw&&w.length>2);
    const wrongs=shuffle([...new Set(pool)]).slice(0,3);
    if(wrongs.length<2) continue;
    const opts=shuffle([cw,...wrongs]);
    qs.push({id:id++,type:"missing_word",
      prompt:blanked,
      promptLabel:`Complete Verse ${ayah.numberInSurah} — ${ayah.surah.englishName}`,
      options:opts, correct:opts.indexOf(cw), correctText:cw});
  }
  return shuffle(qs);
}

/* ── Encouragement messages ─────────────────────────────────────── */
const RETRY_MSGS = [
  "لا تستسلم! Take a breath, read the page again carefully, then recite once more. You can do it! 💪",
  "Every Hafidh has moments of struggle — this is yours to overcome. Review the verses and try again.",
  "Allah loves effort. Re-read the page with your full attention, then recite boldly.",
  "Patience brings success. Look at the words once more and recite with confidence.",
  "Great hifdh is built one patient attempt at a time. Review, focus, and try again!",
];
const HADITHS = [
  {ar:"خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ", en:"The best among you are those who learn the Qur'an and teach it.", ref:"Sahih Bukhari 5027"},
  {ar:"اقْرَؤُوا الْقُرْآنَ فَإِنَّهُ يَأْتِي يَوْمَ الْقِيَامَةِ شَفِيعًا لِأَصْحَابِهِ", en:"Recite the Qur'an, for it will come as an intercessor on the Day of Resurrection.", ref:"Sahih Muslim 804"},
  {ar:"الْمَاهِرُ بِالْقُرْآنِ مَعَ السَّفَرَةِ الْكِرَامِ الْبَرَرَةِ", en:"The one proficient in the Qur'an will be with the noble, righteous scribes.", ref:"Sahih Bukhari 4937"},
];

/* ── Utility formatting ─────────────────────────────────────────── */
function fmtSecs(s:number): string {
  if(s<60) return `${s}s`;
  return `${Math.floor(s/60)}m ${s%60}s`;
}
function fmtDate(d:string): string {
  return new Date(d+"T00:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
}
function scoreColor(s:number): string {
  return s>=80?"#16a34a":s>=60?"#d97706":"#dc2626";
}

/* ══════════════════════════════════════════════════════════════════
   SESSION OVERLAY — full-screen recitation session
═══════════════════════════════════════════════════════════════════*/
interface SessionProps {
  assignment: Assignment;
  userId: string;
  todayPages: number[];
  onClose: (completed?: boolean) => void;
}

function SessionOverlay({ assignment, userId, todayPages, onClose }: SessionProps) {
  const [phase,        setPhase]       = useState<Phase>("intro");
  const [pageIdx,      setPageIdx]     = useState(0);
  const [pageAyahs,    setPageAyahs]   = useState<Ayah[]>([]);
  const [fetchingPage, setFetchingPage] = useState(false);
  const [pageResults,  setPageResults] = useState<PageResult[]>([]);
  const [score,        setScore]       = useState<number|null>(null);
  const [errorWords,   setErrorWords]  = useState<string[]>([]);
  const [retryCount,   setRetryCount]  = useState(0);
  const [retryMsg,     setRetryMsg]    = useState("");
  const [questions,    setQuestions]   = useState<Question[]>([]);
  const [qIdx,         setQIdx]        = useState(0);
  const [answers,      setAnswers]     = useState<(number|null)[]>([]);
  const [testScore,    setTestScore]   = useState<number|null>(null);
  const [finalScore,   setFinalScore]  = useState(0);
  const [isListening,  setIsListening] = useState(false);
  const [recSecs,      setRecSecs]     = useState(0);
  const [submitting,   setSubmitting]  = useState(false);
  const hadith = HADITHS[Math.floor(Math.random()*HADITHS.length)];
  const sessionStart = useRef(Date.now());
  const recognRef    = useRef<any>(null);
  const liveRef      = useRef("");
  const timerRef     = useRef<any>(null);
  const isListRef    = useRef(false);

  /* ── fetch ayahs when phase=reading ── */
  useEffect(() => {
    if (phase!=="reading") return;
    const pn = todayPages[pageIdx];
    if (!pn) return;
    setFetchingPage(true); setPageAyahs([]);
    fetchPageAyahs(pn).then(a => { setPageAyahs(a); setFetchingPage(false); });
  }, [phase, pageIdx, todayPages]);

  /* ── speech recognition ── */
  useEffect(() => { isListRef.current = isListening; }, [isListening]);

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Speech recognition not supported. Please use Chrome on Android."); return; }
    const rec = new SR();
    rec.lang="ar-SA"; rec.continuous=true; rec.interimResults=true; rec.maxAlternatives=3;
    liveRef.current = "";
    rec.onresult=(e:any)=>{
      let f="";
      for(let i=e.resultIndex;i<e.results.length;i++)
        if(e.results[i].isFinal) f+=e.results[i][0].transcript+" ";
      if(f) liveRef.current+=f;
    };
    rec.onerror=(e:any)=>{
      if(e.error==="not-allowed"){alert("Mic denied. Allow in browser settings.");setIsListening(false);clearInterval(timerRef.current);}
    };
    rec.onend=()=>{ if(isListRef.current){ try{rec.start();}catch{} } };
    rec.start();
    recognRef.current=rec;
    setIsListening(true); setRecSecs(0);
    timerRef.current=setInterval(()=>setRecSecs(s=>s+1),1000);
  },[]);

  const stopListening = useCallback(()=>{
    isListRef.current=false;
    recognRef.current?.stop(); recognRef.current=null;
    setIsListening(false); clearInterval(timerRef.current);
  },[]);

  const evaluatePage = () => {
    const tx  = liveRef.current.trim();
    const sc  = scoreText(tx, pageAyahs, recSecs);
    const errs= getErrorWords(tx, pageAyahs);
    setScore(sc); setErrorWords(errs);
    liveRef.current=""; setPhase("page_result");
  };

  const handleStop = () => { stopListening(); evaluatePage(); };

  const acceptPage = () => {
    const r: PageResult={pageNum:todayPages[pageIdx],score:score!,errorWords,ayahs:pageAyahs};
    const newResults=[...pageResults,r];
    setPageResults(newResults); setRetryCount(0); setScore(null);
    const next=pageIdx+1;
    if(next<todayPages.length){ setPageIdx(next); setPhase("reading"); }
    else { const qs=buildQuestions(newResults); setQuestions(qs); setAnswers(new Array(qs.length).fill(null)); setQIdx(0); setTestScore(null); setPhase("testing"); }
  };

  const retryPage = () => {
    setRetryMsg(RETRY_MSGS[retryCount%RETRY_MSGS.length]);
    setScore(null); setRetryCount(c=>c+1); liveRef.current=""; setRecSecs(0); setPhase("reading");
  };

  const pickAnswer=(i:number)=>{ const a=[...answers]; a[qIdx]=i; setAnswers(a); };
  const nextQ=()=>{ if(qIdx<questions.length-1) setQIdx(i=>i+1); else gradeTest(); };
  const gradeTest=()=>{
    const correct=answers.filter((a,i)=>a===questions[i]?.correct).length;
    const pct=questions.length>0?Math.round((correct/questions.length)*100):100;
    setTestScore(pct); setPhase("test_result");
    if(pct>=PASS_THRESHOLD) submitSession(pct);
  };
  const retryTest=()=>{
    setAnswers(new Array(questions.length).fill(null)); setQIdx(0); setTestScore(null); setPhase("testing");
  };

  const submitSession=async(tScore:number)=>{
    setSubmitting(true);
    const recAvg=pageResults.length?Math.round(pageResults.reduce((s,r)=>s+r.score,0)/pageResults.length):tScore;
    const overall=Math.round((recAvg+tScore)/2);
    setFinalScore(overall);
    const today=todayISO();
    const dur=Math.round((Date.now()-sessionStart.current)/1000);
    try {
      await (supabase as any).from("hifdh_daily_logs").upsert({
        student_id:userId, assignment_id:assignment.id,
        log_date:today, pages_revised:todayPages.length,
        avg_score:overall, duration_secs:dur, completed:true,
        session_data:{
          recitation_score:recAvg, test_score:tScore,
          pages_done:todayPages,
          page_results:pageResults.map(r=>({pageNum:r.pageNum,score:r.score,errorWords:r.errorWords})),
          errors:pageResults.flatMap(r=>r.errorWords.map(w=>({word:w,page:r.pageNum}))).slice(0,20),
        },
        updated_at:new Date().toISOString(),
      },{onConflict:"student_id,log_date"});

      // Notify
      const {data:pf}=await supabase.from("profiles").select("full_name").eq("user_id" as any,userId).maybeSingle();
      const name=(pf as any)?.full_name||"A student";
      const modeLabel=assignment.mode==="juz"?"Juz":assignment.mode==="hizb"?"Hizb":"Surah";
      const items=assignment.selected_items.slice(0,3).join(", ");
      const msg=`${modeLabel} ${items} — Score: ${overall}% · ${todayPages.length} page${todayPages.length>1?"s":""} done`;
      const {data:admins}=await supabase.from("profiles").select("user_id").eq("role","admin" as any);
      for(const a of (admins||[])){
        await (supabase as any).from("notifications").insert({
          user_id:(a as any).user_id, title:`📖 ${name} completed Daily Hifdh Revision`,
          message:msg, type:"hifdh_complete", read:false, created_at:new Date().toISOString(),
        });
      }
    } catch(e){ console.error("Submit error",e); }
    setSubmitting(false); setPhase("complete");
  };

  /* ── Shared UI atoms ── */
  const BackBtn=({onClick}:{onClick:()=>void})=>(
    <button onClick={onClick} style={{width:36,height:36,borderRadius:10,border:"none",cursor:"pointer",
      background:"rgba(255,255,255,.12)",color:W,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <ArrowLeft size={18}/>
    </button>
  );
  const ScoreRing=({pct}:{pct:number})=>{
    const pass=pct>=PASS_THRESHOLD;
    const col=pass?PASS:FAIL;
    const R=42; const C=2*Math.PI*R;
    return (
      <svg width={108} height={108} viewBox="0 0 108 108" style={{display:"block",margin:"0 auto 12px"}}>
        <circle cx={54} cy={54} r={R} fill="none" stroke={col+"22"} strokeWidth={10}/>
        <circle cx={54} cy={54} r={R} fill="none" stroke={col} strokeWidth={10}
          strokeDasharray={C} strokeDashoffset={C*(1-pct/100)}
          strokeLinecap="round" transform="rotate(-90 54 54)"
          style={{transition:"stroke-dashoffset .7s ease"}}/>
        <text x={54} y={50} textAnchor="middle" dominantBaseline="middle"
          fill={col} fontSize={22} fontWeight={900}>{pct}%</text>
        <text x={54} y={68} textAnchor="middle" dominantBaseline="middle"
          fill={col} fontSize={9} fontWeight={700}>{pass?"PASSED ✓":"TRY AGAIN"}</text>
      </svg>
    );
  };

  /* ── Wave bars ── */
  const Wave=()=>(
    <div style={{display:"flex",alignItems:"center",gap:3}}>
      {[14,22,32,40,28,36,20,30,16,24,38,18].map((h,i)=>(
        <div key={i} style={{
          width:4,height:h,borderRadius:3,background:PASS,
          animation:`wavePulse ${0.5+i*0.06}s ease-in-out ${i*0.05}s infinite`,
        }}/>
      ))}
    </div>
  );

  /* ── Quran page display ── */
  const QuranPage=()=>(
    fetchingPage
      ? <div style={{display:"flex",justifyContent:"center",padding:40}}>
          <Loader2 size={28} color={GOLD} style={{animation:"spin .9s linear infinite"}}/>
        </div>
      : pageAyahs.length>0
        ? <div style={{
            background:"#fffdf6",
            borderRadius:8,
            border:`2px solid ${GOLD}88`,
            boxShadow:`0 4px 20px rgba(0,0,0,.1)`,
            overflow:"hidden",
          }}>
            {/* Header */}
            <div style={{
              display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"8px 16px",
              background:`linear-gradient(to bottom,${GOLD}18,transparent)`,
              borderBottom:`1px solid ${GOLD}44`,
            }}>
              <span style={{fontFamily:"'Amiri',serif",fontSize:11,fontWeight:700,color:G1}}>
                {pageAyahs[0]?.surah?.englishName}
                {pageAyahs[pageAyahs.length-1]?.surah?.number!==pageAyahs[0]?.surah?.number&&
                  ` — ${pageAyahs[pageAyahs.length-1]?.surah?.englishName}`}
              </span>
              <span style={{fontFamily:"'Amiri',serif",fontSize:11,color:GOLD}}>
                صفحة {todayPages[pageIdx]}
              </span>
            </div>
            <div style={{height:1,background:`linear-gradient(to right,transparent,${GOLD}66,transparent)`,margin:"0 12px"}}/>
            {/* Quran text */}
            <div style={{padding:"14px 16px 10px"}}>
              <div style={{
                direction:"rtl",fontFamily:"'Amiri Quran','Amiri',serif",
                fontSize:22,color:INK,lineHeight:3.0,textAlign:"justify",
              }}>
                {pageAyahs.map((a,i)=>(
                  <span key={i}>
                    {a.text}
                    <span style={{fontSize:13,color:GOLD,margin:"0 3px",fontFamily:"'Amiri',serif"}}>
                      ۝{a.numberInSurah}
                    </span>
                  </span>
                ))}
              </div>
            </div>
            <div style={{height:1,background:`linear-gradient(to right,transparent,${GOLD}66,transparent)`,margin:"0 12px"}}/>
            <div style={{padding:"6px",textAlign:"center",fontFamily:"'Amiri',serif",color:GOLD,fontSize:12}}>
              ─── {todayPages[pageIdx]} ───
            </div>
          </div>
        : <div style={{padding:24,textAlign:"center",color:"#9CA3AF",fontSize:13}}>
            Could not load page — check internet connection.
          </div>
  );

  /* ════ RENDER PHASES ════ */
  return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:WARM,display:"flex",flexDirection:"column",
      fontFamily:"'Cairo',sans-serif",overscrollBehavior:"none"}}>
      <style>{`
        @keyframes spin  { to{transform:rotate(360deg)} }
        @keyframes wavePulse { 0%,100%{transform:scaleY(.4)} 50%{transform:scaleY(1)} }
        @keyframes slideUp { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&family=Cairo:wght@400;600;700;800;900&display=swap');
      `}</style>

      {/* ══ INTRO ══ */}
      {phase==="intro"&&(
        <>
          <div style={{background:`linear-gradient(160deg,${G1},${G2})`,padding:"14px 16px",
            display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
            <BackBtn onClick={()=>onClose(false)}/>
            <div style={{flex:1}}>
              <p style={{margin:0,fontWeight:900,fontSize:15,color:W}}>Daily Hifdh Session</p>
              <p style={{margin:0,fontSize:10,color:`${GOLD}cc`}}>
                {assignment.mode==="juz"?"Juz":assignment.mode==="hizb"?"Hizb":"Surah"}{" "}
                {assignment.selected_items.slice(0,3).join(", ")} · {assignment.daily_pages} page{assignment.daily_pages>1?"s":""}/day
              </p>
            </div>
            <div style={{fontFamily:"'Amiri',serif",color:GOLD,fontSize:"1.4em"}}>﷽</div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"16px 16px 28px",display:"flex",flexDirection:"column",gap:14}}>

            {/* Today's pages card */}
            <div style={{borderRadius:20,overflow:"hidden",background:`linear-gradient(135deg,${G1},${G2})`,
              border:`1px solid ${GOLD}33`,boxShadow:"0 8px 32px rgba(0,0,0,.2)"}}>
              <div style={{padding:"18px 18px 14px",textAlign:"center"}}>
                <div style={{fontFamily:"'Amiri',serif",color:GOLD,fontSize:"1.5em",marginBottom:6}}>
                  بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                </div>
                <p style={{margin:0,fontSize:11,color:"rgba(255,255,255,.5)",fontWeight:600}}>TODAY'S REVISION</p>
                <div style={{margin:"12px 0",padding:"14px",background:"rgba(255,255,255,.06)",borderRadius:14,
                  border:`1px solid ${GOLD}22`}}>
                  <p style={{margin:0,fontWeight:900,fontSize:26,color:W,letterSpacing:-.5}}>
                    Page{todayPages.length>1?"s":""}{" "}
                    {todayPages[0]}{todayPages.length>1?` – ${todayPages[todayPages.length-1]}`:""}
                  </p>
                  <p style={{margin:"4px 0 0",fontSize:11,color:`${GOLD}aa`}}>
                    of the Holy Qur'an
                  </p>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {[
                    {label:"Mode",    value:assignment.mode==="juz"?"Juz":assignment.mode==="hizb"?"Hizb":"Surah"},
                    {label:"Section", value:assignment.selected_items.slice(0,3).join(", ")+(assignment.selected_items.length>3?"…":"")},
                  ].map(s=>(
                    <div key={s.label} style={{padding:"8px",background:"rgba(255,255,255,.06)",borderRadius:10,
                      border:`1px solid rgba(255,255,255,.08)`}}>
                      <p style={{margin:0,fontSize:9,fontWeight:700,color:"rgba(255,255,255,.4)",
                        textTransform:"uppercase",letterSpacing:.5}}>{s.label}</p>
                      <p style={{margin:"2px 0 0",fontWeight:800,fontSize:13,color:W}}>{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* How it works */}
            <div style={{background:W,borderRadius:16,border:`1px solid ${BRD}`,padding:"14px 16px"}}>
              <p style={{margin:"0 0 12px",fontSize:10,fontWeight:800,color:G3,textTransform:"uppercase",letterSpacing:.6}}>
                Session Flow
              </p>
              {[
                {emoji:"📖",title:"Read the page",sub:"Study the Qur'an text shown on screen"},
                {emoji:"🎙️",title:"Recite aloud",sub:`AI listens — score ≥${PASS_THRESHOLD}% to continue; retry if below`},
                {emoji:"🎯",title:"Answer questions",sub:"MCQ from today's pages — ≥75% to pass"},
                {emoji:"✅",title:"Submit & done",sub:"Your teacher is notified automatically"},
              ].map((s,i)=>(
                <div key={i} style={{display:"flex",gap:12,padding:"9px 0",
                  borderBottom:i<3?"1px solid #F3F4F6":"none"}}>
                  <div style={{width:36,height:36,borderRadius:10,background:`${G1}0d`,
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>
                    {s.emoji}
                  </div>
                  <div style={{paddingTop:2}}>
                    <p style={{margin:0,fontWeight:700,fontSize:13,color:G1}}>{s.title}</p>
                    <p style={{margin:0,fontSize:11,color:"#9CA3AF"}}>{s.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {assignment.notes&&(
              <div style={{padding:"12px 14px",borderRadius:12,background:`${GOLD}10`,
                border:`1px solid ${GOLD}33`}}>
                <p style={{margin:"0 0 4px",fontSize:10,fontWeight:800,color:"#92400E",
                  textTransform:"uppercase",letterSpacing:.5}}>📝 Teacher's Note</p>
                <p style={{margin:0,fontSize:12,color:"#78350F",lineHeight:1.6}}>{assignment.notes}</p>
              </div>
            )}

            <button onClick={()=>setPhase("reading")}
              style={{padding:"15px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",
                background:`linear-gradient(135deg,${G2},${G3})`,color:W,fontWeight:900,fontSize:15,
                boxShadow:`0 4px 16px ${G1}66`,letterSpacing:.3}}>
              Begin Session →
            </button>
          </div>
        </>
      )}

      {/* ══ READING ══ */}
      {phase==="reading"&&(
        <>
          <div style={{background:`linear-gradient(160deg,${G1},${G2})`,padding:"14px 16px",
            display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
            <BackBtn onClick={()=>{stopListening();setPhase("intro");}}/>
            <div style={{flex:1}}>
              <p style={{margin:0,fontWeight:800,fontSize:14,color:W}}>
                Page {todayPages[pageIdx]} — Recite Aloud
              </p>
              <p style={{margin:0,fontSize:10,color:`${GOLD}cc`}}>
                Page {pageIdx+1} of {todayPages.length}{retryCount>0?` · Attempt ${retryCount+1}`:""}
              </p>
            </div>
            {/* Page dots */}
            <div style={{display:"flex",gap:4}}>
              {todayPages.map((_,i)=>(
                <div key={i} style={{width:8,height:8,borderRadius:"50%",
                  background:i<pageIdx?PASS:i===pageIdx?GOLD:"rgba(255,255,255,.25)"}}/>
              ))}
            </div>
          </div>

          <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",
            padding:"10px 14px 90px"}}>

            {retryMsg&&retryCount>0&&(
              <div style={{marginBottom:10,padding:"10px 12px",borderRadius:12,background:`${GOLD}12`,
                border:`1.5px solid ${GOLD}44`,animation:"slideUp .3s ease"}}>
                <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                  <Heart size={16} color={GOLD} style={{flexShrink:0,marginTop:1}}/>
                  <p style={{margin:0,fontSize:12,fontWeight:600,color:"#92400E",lineHeight:1.6}}>{retryMsg}</p>
                </div>
              </div>
            )}

            {/* During recitation — hide text, show listening indicator */}
            {isListening ? (
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",
                justifyContent:"center",padding:"60px 20px",gap:20}}>
                <Wave/>
                <p style={{margin:0,fontWeight:900,fontSize:16,color:G1,textAlign:"center"}}>
                  Listening attentively…
                </p>
                <p style={{margin:0,fontSize:12,color:"#6B7280",textAlign:"center",lineHeight:1.6}}>
                  Recite from start to finish — don't stop mid-verse
                </p>
                <span style={{display:"inline-block",padding:"6px 20px",borderRadius:20,
                  background:`${PASS}14`,border:`1px solid ${PASS}44`,
                  fontSize:14,fontWeight:900,color:PASS}}>
                  🔴 {Math.floor(recSecs/60).toString().padStart(2,"0")}:{(recSecs%60).toString().padStart(2,"0")}
                </span>
              </div>
            ) : (
              <>
                {!retryCount && (
                  <div style={{marginBottom:10,padding:"8px 12px",borderRadius:10,
                    background:"#FFFBEB",border:"1px solid #FDE68A",
                    display:"flex",alignItems:"center",gap:8}}>
                    <Target size={13} color={AMBER}/>
                    <span style={{fontSize:11,fontWeight:700,color:AMBER}}>
                      Recite the full page clearly — need ≥{PASS_THRESHOLD}% to proceed
                    </span>
                  </div>
                )}
                <QuranPage/>
              </>
            )}
          </div>

          {/* Sticky bottom */}
          <div style={{padding:"12px 16px",background:W,borderTop:`1px solid ${BRD}`,flexShrink:0}}>
            {!isListening
              ?(
                <button onClick={startListening}
                  style={{width:"100%",padding:"15px",borderRadius:14,border:"none",cursor:"pointer",
                    background:`linear-gradient(135deg,${G2},${G3})`,color:W,fontWeight:900,fontSize:14,
                    display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"inherit"}}>
                  <Mic size={17}/> Start Reciting
                </button>
              ):(
                <button onClick={handleStop}
                  style={{width:"100%",padding:"15px",borderRadius:14,border:"none",cursor:"pointer",
                    background:FAIL,color:W,fontWeight:900,fontSize:14,
                    display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"inherit"}}>
                  <MicOff size={17}/> Finished — Evaluate My Recitation
                </button>
              )
            }
          </div>
        </>
      )}

      {/* ══ PAGE RESULT ══ */}
      {phase==="page_result"&&score!==null&&(
        <>
          <div style={{background:`linear-gradient(160deg,${G1},${G2})`,padding:"14px 16px",
            display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
            <BackBtn onClick={()=>setPhase("reading")}/>
            <p style={{margin:0,fontWeight:800,fontSize:14,color:W,flex:1}}>
              Page {todayPages[pageIdx]} — Result
            </p>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"20px 16px 28px",
            display:"flex",flexDirection:"column",gap:14,animation:"fadeIn .3s ease"}}>

            <ScoreRing pct={score}/>
            <div style={{textAlign:"center",marginBottom:4}}>
              <p style={{margin:0,fontWeight:900,fontSize:18,color:score>=PASS_THRESHOLD?PASS:FAIL}}>
                {score>=PASS_THRESHOLD
                  ?(pageIdx+1<todayPages.length?"ممتاز! Next page →":"ممتاز! All pages done!")
                  :"يحتاج تحسين — Try Again"}
              </p>
              <p style={{margin:"5px 0 0",fontSize:12,color:"#6B7280"}}>
                {score>=PASS_THRESHOLD
                  ?`You scored ${score}% — excellent work!`
                  :`Scored ${score}% — below the ${PASS_THRESHOLD}% pass mark`}
              </p>
            </div>

            {score<PASS_THRESHOLD&&(
              <div style={{padding:"14px",borderRadius:14,background:`${GOLD}0e`,
                border:`1.5px solid ${GOLD}55`,animation:"slideUp .35s ease"}}>
                <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                  <div style={{width:38,height:38,borderRadius:10,background:`${GOLD}22`,
                    display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <Heart size={19} color={GOLD}/>
                  </div>
                  <div>
                    <p style={{margin:"0 0 4px",fontWeight:900,fontSize:13,color:"#92400E"}}>Focus & Try Again</p>
                    <p style={{margin:0,fontSize:12,color:"#78350F",lineHeight:1.65}}>
                      Read through the page once more, focusing on the words highlighted below.
                      Then recite again — every attempt builds your hifdh. 🌟
                    </p>
                  </div>
                </div>
              </div>
            )}

            {errorWords.length>0&&(
              <div style={{background:W,borderRadius:14,border:`1.5px solid #FECACA`,
                padding:"12px 14px"}}>
                <p style={{margin:"0 0 8px",fontSize:10,fontWeight:800,color:FAIL,
                  textTransform:"uppercase",letterSpacing:.5}}>
                  ⚠️ Words to focus on ({Math.min(errorWords.length,15)})
                </p>
                <div style={{display:"flex",flexWrap:"wrap",gap:5,direction:"rtl"}}>
                  {errorWords.slice(0,15).map((w,i)=>(
                    <span key={i} style={{padding:"5px 11px",borderRadius:8,background:"#FEE2E2",
                      color:FAIL,fontSize:15,fontFamily:"'Amiri',serif"}}>{w}</span>
                  ))}
                </div>
                <p style={{margin:"8px 0 0",fontSize:10,color:"#9CA3AF"}}>
                  Study these words before you re-read the page.
                </p>
              </div>
            )}

            {score>=PASS_THRESHOLD
              ?(
                <button onClick={acceptPage}
                  style={{padding:"15px",borderRadius:14,border:"none",cursor:"pointer",
                    background:`linear-gradient(135deg,${PASS},#15803d)`,color:W,
                    fontWeight:900,fontSize:14,fontFamily:"inherit",
                    boxShadow:`0 4px 16px ${PASS}44`}}>
                  {pageIdx+1<todayPages.length?"Continue to Next Page →":"Proceed to Test →"}
                </button>
              ):(
                <button onClick={retryPage}
                  style={{padding:"15px",borderRadius:14,border:"none",cursor:"pointer",
                    background:`linear-gradient(135deg,${AMBER},#b45309)`,color:W,
                    fontWeight:900,fontSize:14,fontFamily:"inherit",
                    boxShadow:`0 4px 16px ${AMBER}44`}}>
                  🔄 Re-read Page & Recite Again
                </button>
              )
            }
          </div>
        </>
      )}

      {/* ══ TESTING ══ */}
      {phase==="testing"&&testScore===null&&(
        questions.length>0?(
          <>
            <div style={{background:`linear-gradient(160deg,${G1},${G2})`,padding:"14px 16px",
              display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
              <div style={{width:36,height:36,borderRadius:10,background:`${GOLD}22`,
                display:"flex",alignItems:"center",justifyContent:"center"}}>
                <Target size={18} color={GOLD}/>
              </div>
              <div style={{flex:1}}>
                <p style={{margin:0,fontWeight:800,fontSize:14,color:W}}>
                  Verse Test — {qIdx+1}/{questions.length}
                </p>
                <p style={{margin:0,fontSize:10,color:`${GOLD}cc`}}>Choose the correct answer</p>
              </div>
            </div>

            <div style={{flex:1,overflowY:"auto",padding:"16px 16px 28px",
              display:"flex",flexDirection:"column",gap:14}}>
              {/* Progress bar */}
              <div style={{height:4,borderRadius:4,background:"#E5E7EB",overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:4,
                  background:`linear-gradient(to right,${GOLD},${G3})`,
                  width:`${((qIdx+1)/questions.length)*100}%`,transition:"width .3s"}}/>
              </div>
              {/* Dot row */}
              <div style={{display:"flex",gap:6,justifyContent:"center"}}>
                {questions.map((_,i)=>(
                  <div key={i} style={{width:9,height:9,borderRadius:"50%",
                    background:i<qIdx?PASS:i===qIdx?GOLD:BRD,transition:"background .2s"}}/>
                ))}
              </div>

              {(()=>{
                const q=questions[qIdx]; const ans=answers[qIdx];
                return(
                  <div style={{background:W,borderRadius:16,border:`1px solid ${BRD}`,overflow:"hidden",
                    boxShadow:"0 2px 12px rgba(0,0,0,.07)"}}>
                    <div style={{padding:"14px 16px",background:`${G1}0a`,borderBottom:`1px solid ${BRD}`}}>
                      <p style={{margin:"0 0 6px",fontSize:9,fontWeight:800,color:"#9CA3AF",
                        textTransform:"uppercase",letterSpacing:.5}}>
                        {q.type==="next_verse"?"What comes next?":"Fill in the blank"} · {q.promptLabel}
                      </p>
                      <p style={{margin:0,fontSize:19,direction:"rtl",fontFamily:"'Amiri Quran','Amiri',serif",
                        color:INK,lineHeight:2.6}}>{q.prompt}</p>
                    </div>
                    <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:8}}>
                      {q.options.map((opt,oi)=>(
                        <button key={oi} onClick={()=>pickAnswer(oi)}
                          style={{
                            width:"100%",padding:"13px 14px",borderRadius:12,cursor:"pointer",
                            textAlign:"right",direction:"rtl",fontFamily:"'Amiri',serif",
                            fontSize:16,lineHeight:1.9,color:INK,
                            border:`2px solid ${ans===oi?G2:BRD}`,
                            background:ans===oi?`${G1}0e`:WARM,
                            fontWeight:ans===oi?700:400,transition:"all .15s",
                          }}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <button onClick={nextQ} disabled={answers[qIdx]===null}
                style={{padding:"14px",borderRadius:14,border:"none",cursor:answers[qIdx]===null?"not-allowed":"pointer",
                  background:answers[qIdx]!==null?`linear-gradient(135deg,${G2},${G3})`:"#D1D5DB",
                  color:W,fontWeight:900,fontSize:14,fontFamily:"inherit",transition:"background .2s"}}>
                {qIdx<questions.length-1?"Next Question →":"Finish Test"}
              </button>
            </div>
          </>
        ):(
          /* No questions — submit directly */
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
            justifyContent:"center",padding:32,gap:16}}>
            <CheckCircle2 size={40} color={PASS}/>
            <p style={{fontWeight:800,fontSize:15,color:G1,margin:0}}>Not enough verses for MCQ</p>
            <p style={{fontSize:12,color:"#9CA3AF",margin:0,textAlign:"center"}}>
              Pages too short to generate questions — submitting your session now.
            </p>
            <button onClick={()=>submitSession(100)}
              style={{padding:"14px 32px",borderRadius:14,border:"none",cursor:"pointer",
                background:`linear-gradient(135deg,${G2},${G3})`,color:W,fontWeight:900,fontSize:14,fontFamily:"inherit"}}>
              Submit Session ✓
            </button>
          </div>
        )
      )}

      {/* ══ TEST RESULT ══ */}
      {phase==="test_result"&&testScore!==null&&(
        <>
          <div style={{background:`linear-gradient(160deg,${G1},${G2})`,padding:"14px 16px",
            display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
            <p style={{margin:0,fontWeight:800,fontSize:15,color:W,flex:1}}>Test Result</p>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"20px 16px 28px",
            display:"flex",flexDirection:"column",gap:14,animation:"fadeIn .3s ease"}}>
            <ScoreRing pct={testScore}/>
            <div style={{textAlign:"center",marginBottom:4}}>
              <p style={{margin:0,fontWeight:900,fontSize:18,color:testScore>=PASS_THRESHOLD?PASS:FAIL}}>
                {testScore>=PASS_THRESHOLD?"ممتاز! Test Passed!":"يحتاج مراجعة — Below Pass Mark"}
              </p>
              <p style={{margin:"5px 0 0",fontSize:12,color:"#6B7280"}}>
                {testScore>=PASS_THRESHOLD
                  ?"MashaAllah! Submitting your session…"
                  :`Score below ${PASS_THRESHOLD}% — review the answers and try again`}
              </p>
            </div>

            {/* Question breakdown */}
            <div style={{background:W,borderRadius:14,border:`1px solid ${BRD}`,padding:"12px 14px"}}>
              <p style={{margin:"0 0 10px",fontSize:9,fontWeight:800,color:"#9CA3AF",
                textTransform:"uppercase",letterSpacing:.5}}>Question Breakdown</p>
              {questions.map((q,i)=>{
                const ua=answers[i]; const ok=ua===q.correct;
                return(
                  <div key={q.id} style={{display:"flex",gap:10,padding:"8px 0",
                    borderBottom:i<questions.length-1?"1px solid #F3F4F6":"none"}}>
                    <div style={{width:24,height:24,borderRadius:"50%",flexShrink:0,
                      background:ok?"#DCFCE7":"#FEE2E2",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:11,fontWeight:900,color:ok?PASS:FAIL}}>
                      {ok?"✓":"✗"}
                    </div>
                    <div style={{flex:1}}>
                      <p style={{margin:0,fontSize:11,fontWeight:600,color:"#374151"}}>Q{i+1}: {q.promptLabel}</p>
                      {!ok&&(
                        <p style={{margin:"3px 0 0",fontSize:13,color:PASS,direction:"rtl",fontFamily:"'Amiri',serif"}}>
                          ✓ {q.correctText.slice(0,60)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {testScore>=PASS_THRESHOLD
              ?(
                submitting
                  ?<div style={{display:"flex",justifyContent:"center",padding:20}}>
                    <Loader2 size={28} color={GOLD} style={{animation:"spin .9s linear infinite"}}/>
                  </div>
                  :<div style={{padding:"12px",borderRadius:12,background:"#F0FDF4",
                    border:"1px solid #BBF7D0",textAlign:"center"}}>
                    <p style={{margin:0,fontSize:12,color:PASS,fontWeight:700}}>
                      ✅ Submitting your session…
                    </p>
                  </div>
              ):(
                <>
                  <div style={{padding:"12px 14px",borderRadius:12,background:`${GOLD}0d`,border:`1px solid ${GOLD}33`}}>
                    <p style={{margin:0,fontSize:12,color:"#92400E",fontWeight:600,lineHeight:1.6}}>
                      💪 You can do better! Review the correct answers above and take the test again.
                    </p>
                  </div>
                  <button onClick={retryTest}
                    style={{padding:"14px",borderRadius:14,border:"none",cursor:"pointer",
                      background:`linear-gradient(135deg,${AMBER},#b45309)`,color:W,
                      fontWeight:900,fontSize:14,fontFamily:"inherit"}}>
                    🔄 Retry Test
                  </button>
                </>
              )
            }
          </div>
        </>
      )}

      {/* ══ COMPLETE ══ */}
      {phase==="complete"&&(
        <div style={{flex:1,overflowY:"auto",
          background:`linear-gradient(160deg,${G0} 0%,${G1} 40%,${G2} 100%)`,
          display:"flex",flexDirection:"column",alignItems:"center",
          justifyContent:"center",padding:"32px 20px",gap:20}}>

          {/* Trophy */}
          <div style={{width:100,height:100,borderRadius:"50%",
            background:`${GOLD}1a`,border:`3px solid ${GOLD}`,
            display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:`0 0 40px ${GOLD}33`}}>
            <Trophy size={44} color={GOLD}/>
          </div>

          <div style={{textAlign:"center"}}>
            <p style={{margin:0,fontWeight:900,fontSize:24,color:W,letterSpacing:-.5}}>
              اليوم مكتمل! 🎉
            </p>
            <p style={{margin:"6px 0 0",fontSize:14,color:"rgba(255,255,255,.6)"}}>
              Today's Hifdh session is complete — JazakAllahu khairan!
            </p>
          </div>

          {/* Score grid */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,width:"100%",maxWidth:360}}>
            {[
              {label:"Final Score",value:`${finalScore}%`,
                color:finalScore>=80?"#86EFAC":finalScore>=60?GOLD:"#FCA5A5"},
              {label:"Pages Done",value:String(todayPages.length),color:GOLD},
              {label:"Duration",value:fmtSecs(Math.round((Date.now()-sessionStart.current)/1000)),color:"#93C5FD"},
            ].map(s=>(
              <div key={s.label} style={{background:"rgba(255,255,255,.08)",borderRadius:16,
                padding:"14px 8px",textAlign:"center",border:"1px solid rgba(255,255,255,.1)"}}>
                <p style={{margin:0,fontWeight:900,fontSize:22,color:s.color}}>{s.value}</p>
                <p style={{margin:"3px 0 0",fontSize:9,fontWeight:700,color:"rgba(255,255,255,.4)",
                  textTransform:"uppercase",letterSpacing:.5}}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Hadith */}
          <div style={{width:"100%",maxWidth:360,background:"rgba(255,255,255,.06)",borderRadius:18,
            padding:"18px 16px",border:`1px solid ${GOLD}33`,textAlign:"center"}}>
            <p style={{margin:"0 0 10px",fontFamily:"'Amiri',serif",fontSize:16,color:GOLD,
              direction:"rtl",lineHeight:2.2}}>{hadith.ar}</p>
            <p style={{margin:"0 0 5px",fontSize:12,color:"rgba(255,255,255,.6)",fontStyle:"italic",
              lineHeight:1.6}}>{hadith.en}</p>
            <p style={{margin:0,fontSize:10,color:`${GOLD}88`,fontWeight:700}}>— {hadith.ref}</p>
          </div>

          <div style={{width:"100%",maxWidth:360,padding:"11px 16px",borderRadius:12,
            background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",textAlign:"center"}}>
            <p style={{margin:0,fontSize:12,color:"rgba(255,255,255,.55)"}}>
              📨 Your teacher has been notified. Come back tomorrow for the next page, biiznillah!
            </p>
          </div>

          <button onClick={()=>onClose(true)}
            style={{width:"100%",maxWidth:360,padding:"14px",borderRadius:14,
              border:`2px solid ${GOLD}`,background:"transparent",color:GOLD,
              fontWeight:900,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
            Return to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════*/
export default function HifdhDailyRevisionPage() {
  const navigate = useNavigate();
  const [loading,      setLoading]      = useState(true);
  const [userId,       setUserId]       = useState<string|null>(null);
  const [studentName,  setStudentName]  = useState("Student");
  const [assignment,   setAssignment]   = useState<Assignment|null>(null);
  const [logs,         setLogs]         = useState<DailyLog[]>([]);
  const [todayLog,     setTodayLog]     = useState<DailyLog|null>(null);
  const [tab,          setTab]          = useState<MainTab>("today");
  const [showSession,  setShowSession]  = useState(false);
  const [historyOpen,  setHistoryOpen]  = useState<string|null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const today = todayISO();

  /* ── Load data ── */
  useEffect(()=>{
    supabase.auth.getUser().then(async({data})=>{
      if(!data?.user) return;
      const uid=data.user.id;
      setUserId(uid);

      const [{data:pf},{data:asgn},{data:lgs}] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("user_id" as any,uid).maybeSingle(),
        (supabase as any).from("hifdh_daily_assignments")
          .select("*").eq("student_id",uid).eq("active",true).maybeSingle(),
        (supabase as any).from("hifdh_daily_logs")
          .select("*").eq("student_id",uid)
          .order("log_date",{ascending:false}).limit(60),
      ]);

      if((pf as any)?.full_name) setStudentName((pf as any).full_name);
      if(asgn) setAssignment(asgn as Assignment);
      const allLogs=(lgs??[]) as DailyLog[];
      setLogs(allLogs);
      setTodayLog(allLogs.find(l=>l.log_date===today)??null);
      setLoading(false);
    });
  },[today]);

  /* ── Derived ── */
  const todayPages   = assignment ? getTodayPages(assignment)        : [];
  const programDays  = assignment ? buildProgramDays(assignment,logs,today) : [];
  const doneDays     = programDays.filter(d=>d.status==="done");
  const missedDays   = programDays.filter(d=>d.status==="missed");
  const totalDays    = assignment?.program_days ?? 0;
  const pct          = totalDays>0 ? Math.round((doneDays.length/totalDays)*100) : 0;

  // Streak: consecutive completed days back from yesterday
  const sortedLogs = [...logs].filter(l=>l.completed).sort((a,b)=>b.log_date.localeCompare(a.log_date));
  let streak = todayLog?.completed ? 1 : 0;
  let prev = new Date(today); prev.setDate(prev.getDate()-1);
  for(const l of sortedLogs){
    if(l.log_date===prev.toISOString().split("T")[0]){streak++;prev.setDate(prev.getDate()-1);}
    else if(l.log_date===today) continue;
    else break;
  }

  const avgScore = logs.filter(l=>l.avg_score!==null).length>0
    ? Math.round(logs.filter(l=>l.avg_score!==null).reduce((s,l)=>s+(l.avg_score??0),0)/logs.filter(l=>l.avg_score!==null).length)
    : null;

  const todayDone  = !!todayLog?.completed;
  const startDate  = assignment ? getStartDate(assignment) : null;
  const dayOfProg  = assignment && startDate
    ? workingDaysElapsed(startDate, getDaysOff(assignment))+1 : 0;

  // Last 7 days for week strip
  const last7 = Array.from({length:7},(_,i)=>{
    const d=new Date(today+"T00:00:00"); d.setDate(d.getDate()-(6-i));
    const ds=d.toISOString().split("T")[0];
    const log=logs.find(l=>l.log_date===ds);
    const isToday=ds===today;
    return {date:ds,log,isToday,dayName:d.toLocaleDateString("en-GB",{weekday:"short"})};
  });

  function handleSessionClose(completed=false) {
    setShowSession(false);
    if(completed) {
      // Refresh
      supabase.auth.getUser().then(async({data})=>{
        if(!data?.user) return;
        const uid=data.user.id;
        const [{data:lgs}]=await Promise.all([
          (supabase as any).from("hifdh_daily_logs")
            .select("*").eq("student_id",uid)
            .order("log_date",{ascending:false}).limit(60),
        ]);
        const allLogs=(lgs??[]) as DailyLog[];
        setLogs(allLogs);
        setTodayLog(allLogs.find(l=>l.log_date===today)??null);
      });
    }
  }

  /* ── Loading ── */
  if(loading) return(
    <div style={{minHeight:"100dvh",background:G1,display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",gap:14}}>
      <div style={{width:56,height:56,borderRadius:"50%",border:`3px solid ${GOLD}33`,
        borderTopColor:GOLD,animation:"spin .9s linear infinite"}}/>
      <p style={{color:GOLD,fontFamily:"'Cairo',sans-serif",fontWeight:700,fontSize:13}}>
        Loading your Hifdh schedule…
      </p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  /* ── No assignment ── */
  if(!assignment) return(
    <div style={{minHeight:"100dvh",background:WARM,fontFamily:"'Cairo',sans-serif",
      display:"flex",flexDirection:"column"}}>
      <div style={{background:`linear-gradient(160deg,${G1},${G2})`,padding:"14px 16px",
        display:"flex",alignItems:"center",gap:12}}>
        <button onClick={()=>navigate(-1)}
          style={{width:36,height:36,borderRadius:10,border:"none",cursor:"pointer",
            background:"rgba(255,255,255,.12)",color:W,display:"flex",alignItems:"center",
            justifyContent:"center"}}>
          <ArrowLeft size={18}/>
        </button>
        <p style={{margin:0,fontWeight:900,fontSize:15,color:W}}>Daily Hifdh Revision</p>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"center",padding:32,gap:16,textAlign:"center"}}>
        <div style={{width:80,height:80,borderRadius:"50%",background:`${G1}0d`,
          display:"flex",alignItems:"center",justifyContent:"center"}}>
          <BookOpen size={34} color={G3}/>
        </div>
        <p style={{margin:0,fontWeight:800,fontSize:17,color:G1}}>No Programme Assigned</p>
        <p style={{margin:0,fontSize:13,color:"#6B7280",lineHeight:1.7,maxWidth:280}}>
          Your teacher hasn't assigned a daily Hifdh revision programme yet.
          Please check back later or contact your teacher.
        </p>
        <button onClick={()=>navigate(-1)}
          style={{marginTop:8,padding:"12px 28px",borderRadius:12,border:`1.5px solid ${G2}`,
            background:W,color:G1,fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
          Go Back
        </button>
      </div>
    </div>
  );

  /* ══════════════════ MAIN RENDER ══════════════════════════════ */
  return (
    <>
      <style>{`
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes slideUp { from{transform:translateY(10px);opacity:0} to{transform:translateY(0);opacity:1} }
        @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&family=Cairo:wght@400;600;700;800;900&display=swap');
        * { box-sizing:border-box; }
      `}</style>

      {/* Session overlay */}
      {showSession&&userId&&(
        <SessionOverlay
          assignment={assignment}
          userId={userId}
          todayPages={todayPages}
          onClose={handleSessionClose}
        />
      )}

      <div style={{minHeight:"100dvh",background:WARM,display:"flex",flexDirection:"column",
        fontFamily:"'Cairo',sans-serif",maxWidth:600,margin:"0 auto"}}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{flexShrink:0,background:`linear-gradient(165deg,${G0} 0%,${G1} 60%,${G2} 100%)`,
          padding:"0 0 20px",overflow:"hidden",position:"relative"}}>
          {/* Geometric decoration */}
          <div style={{position:"absolute",top:-40,right:-40,width:180,height:180,
            borderRadius:"50%",border:`1px solid ${GOLD}18`,opacity:.6}}/>
          <div style={{position:"absolute",top:-20,right:-20,width:120,height:120,
            borderRadius:"50%",border:`1px solid ${GOLD}12`}}/>
          <div style={{position:"absolute",bottom:-30,left:-30,width:140,height:140,
            borderRadius:"50%",border:`1px solid ${GOLD}10`}}/>

          {/* Nav bar */}
          <div style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:12,
            position:"relative",zIndex:1}}>
            <button onClick={()=>navigate(-1)}
              style={{width:36,height:36,borderRadius:10,border:"none",cursor:"pointer",
                background:"rgba(255,255,255,.1)",color:W,
                display:"flex",alignItems:"center",justifyContent:"center"}}>
              <ArrowLeft size={18}/>
            </button>
            <div style={{flex:1}}>
              <p style={{margin:0,fontWeight:900,fontSize:15,color:W,letterSpacing:-.2}}>
                Daily Hifdh Revision
              </p>
              <p style={{margin:0,fontSize:10,color:`${GOLD}aa`}}>
                مراجعة الحفظ اليومية — {studentName}
              </p>
            </div>
            <div style={{fontFamily:"'Amiri',serif",color:GOLD,fontSize:"1.3em"}}>﷽</div>
          </div>

          {/* Stats strip */}
          <div style={{padding:"0 16px",position:"relative",zIndex:1,
            display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
            {[
              {icon:<Flame size={14} color={GOLD}/>,   label:"Streak",  value:`${streak}d`,  sub:"days"},
              {icon:<CheckCircle2 size={14} color="#86EFAC"/>, label:"Done", value:String(doneDays.length), sub:`of ${totalDays}`},
              {icon:<AlertCircle size={14} color="#FCA5A5"/>,  label:"Missed",value:String(missedDays.length),sub:"days"},
              {icon:<BarChart2 size={14} color="#93C5FD"/>, label:"Avg",   value:avgScore!=null?`${avgScore}%`:"—",sub:"score"},
            ].map(s=>(
              <div key={s.label} style={{background:"rgba(255,255,255,.07)",borderRadius:12,
                padding:"10px 6px",textAlign:"center",border:"1px solid rgba(255,255,255,.08)"}}>
                <div style={{display:"flex",justifyContent:"center",marginBottom:4}}>{s.icon}</div>
                <p style={{margin:0,fontWeight:900,fontSize:16,color:W,lineHeight:1}}>{s.value}</p>
                <p style={{margin:"2px 0 0",fontSize:8,color:"rgba(255,255,255,.4)",fontWeight:600,
                  textTransform:"uppercase",letterSpacing:.3}}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────── */}
        <div style={{flexShrink:0,background:W,borderBottom:`1px solid ${BRD}`,
          display:"flex",padding:"0 4px"}}>
          {([["today","Today","📅"],["schedule","Schedule","📋"],["history","History","📊"]] as const).map(([t,label,emoji])=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{flex:1,padding:"12px 6px",border:"none",cursor:"pointer",background:"transparent",
                fontFamily:"inherit",fontWeight:tab===t?800:600,fontSize:12,
                color:tab===t?G2:"#9CA3AF",
                borderBottom:tab===t?`2.5px solid ${G2}`:"2.5px solid transparent",
                transition:"all .15s"}}>
              {emoji} {label}
            </button>
          ))}
        </div>

        {/* ── Content ──────────────────────────────────────────── */}
        <div style={{flex:1,overflowY:"auto",padding:"14px 14px 32px",
          display:"flex",flexDirection:"column",gap:12}}>

          {/* ════ TAB: TODAY ════ */}
          {tab==="today"&&(
            <>
              {/* Today's hero card */}
              <div style={{borderRadius:20,overflow:"hidden",
                background:todayDone
                  ?`linear-gradient(135deg,#14532d,#166534)`
                  :`linear-gradient(135deg,${G1},${G2})`,
                border:todayDone?"1px solid #22c55e33":`1px solid ${GOLD}33`,
                boxShadow:todayDone?"0 4px 24px rgba(22,163,74,.15)":`0 4px 24px ${G1}44`,
                animation:"slideUp .35s ease"}}>
                <div style={{padding:"20px 18px"}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",
                    marginBottom:14}}>
                    <div>
                      <p style={{margin:0,fontSize:10,fontWeight:700,
                        color:todayDone?"rgba(255,255,255,.5)":"rgba(255,255,255,.5)",
                        textTransform:"uppercase",letterSpacing:.6}}>TODAY'S REVISION</p>
                      <p style={{margin:"3px 0 0",fontWeight:900,fontSize:22,color:W,letterSpacing:-.5}}>
                        {todayDone?"Session Complete! ✓":`Day ${dayOfProg} of ${totalDays}`}
                      </p>
                    </div>
                    {todayDone
                      ?<div style={{width:44,height:44,borderRadius:12,background:"rgba(255,255,255,.12)",
                          display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <CheckCircle2 size={24} color="#86efac"/>
                       </div>
                      :<div style={{textAlign:"center"}}>
                        <p style={{margin:0,fontWeight:900,fontSize:26,color:GOLD}}>{todayPages[0]}</p>
                        <p style={{margin:0,fontSize:8,fontWeight:700,color:`${GOLD}88`,
                          textTransform:"uppercase",letterSpacing:.5}}>
                          {todayPages.length>1?`–${todayPages[todayPages.length-1]}`:""} PAGE
                        </p>
                       </div>
                    }
                  </div>

                  {/* Program progress bar */}
                  <div style={{marginBottom:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",
                      marginBottom:5,fontSize:10,color:"rgba(255,255,255,.5)",fontWeight:600}}>
                      <span>Program Progress</span>
                      <span>{pct}%</span>
                    </div>
                    <div style={{height:6,borderRadius:4,background:"rgba(255,255,255,.15)",overflow:"hidden"}}>
                      <div style={{height:"100%",borderRadius:4,
                        background:todayDone?"#22c55e":`linear-gradient(to right,${GOLD},${GOLD_L})`,
                        width:`${pct}%`,transition:"width .5s"}}/>
                    </div>
                    <div style={{marginTop:4,display:"flex",justifyContent:"space-between",
                      fontSize:9,color:"rgba(255,255,255,.35)",fontWeight:600}}>
                      <span>{doneDays.length} days done</span>
                      <span>{totalDays-doneDays.length} remaining</span>
                    </div>
                  </div>

                  {todayDone?(
                    <>
                      {todayLog?.avg_score!=null&&(
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
                          {[
                            {label:"Score",   value:`${todayLog.avg_score}%`, color:scoreColor(todayLog.avg_score)},
                            {label:"Pages",   value:String(todayLog.pages_revised??todayPages.length)},
                            {label:"Time",    value:todayLog.duration_secs?fmtSecs(todayLog.duration_secs):"—"},
                          ].map(s=>(
                            <div key={s.label} style={{background:"rgba(255,255,255,.1)",borderRadius:10,
                              padding:"8px",textAlign:"center"}}>
                              <p style={{margin:0,fontWeight:900,fontSize:15,color:(s as any).color||W}}>{s.value}</p>
                              <p style={{margin:0,fontSize:8,fontWeight:700,color:"rgba(255,255,255,.4)",
                                textTransform:"uppercase"}}>{s.label}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{padding:"10px 14px",borderRadius:12,background:"rgba(255,255,255,.08)",
                        textAlign:"center"}}>
                        <p style={{margin:0,fontSize:12,color:"rgba(255,255,255,.6)"}}>
                          Come back tomorrow for your next page, biiznillah! 🌙
                        </p>
                      </div>
                    </>
                  ):(
                    <>
                      <div style={{display:"flex",gap:8,marginBottom:14}}>
                        <div style={{flex:1,padding:"10px",background:"rgba(255,255,255,.07)",
                          borderRadius:12,border:"1px solid rgba(255,255,255,.08)"}}>
                          <p style={{margin:0,fontSize:9,fontWeight:700,color:"rgba(255,255,255,.4)",
                            textTransform:"uppercase",letterSpacing:.4}}>Mode</p>
                          <p style={{margin:"2px 0 0",fontWeight:800,fontSize:13,color:W}}>
                            {assignment.mode==="juz"?"Juz":assignment.mode==="hizb"?"Hizb":"Surah"}
                            {" "}{assignment.selected_items.slice(0,3).join(", ")}
                            {assignment.selected_items.length>3?"…":""}
                          </p>
                        </div>
                        <div style={{flex:1,padding:"10px",background:"rgba(255,255,255,.07)",
                          borderRadius:12,border:"1px solid rgba(255,255,255,.08)"}}>
                          <p style={{margin:0,fontSize:9,fontWeight:700,color:"rgba(255,255,255,.4)",
                            textTransform:"uppercase",letterSpacing:.4}}>Pages Today</p>
                          <p style={{margin:"2px 0 0",fontWeight:900,fontSize:13,color:GOLD}}>
                            {todayPages[0]}{todayPages.length>1?`–${todayPages[todayPages.length-1]}`:""}
                          </p>
                        </div>
                      </div>
                      <button onClick={()=>setShowSession(true)}
                        style={{width:"100%",padding:"15px",borderRadius:14,border:"none",cursor:"pointer",
                          background:`linear-gradient(135deg,${GOLD},${GOLD_L})`,
                          color:G0,fontWeight:900,fontSize:15,fontFamily:"inherit",
                          display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                          boxShadow:`0 4px 20px ${GOLD}55`}}>
                        <Mic size={18}/> Start Today's Session
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Week strip */}
              <div style={{background:W,borderRadius:16,border:`1px solid ${BRD}`,
                padding:"14px 14px 12px"}}>
                <p style={{margin:"0 0 10px",fontSize:10,fontWeight:800,color:G3,
                  textTransform:"uppercase",letterSpacing:.5}}>This Week</p>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5}}>
                  {last7.map(({date,log,isToday,dayName})=>{
                    const done=!!log?.completed;
                    const isFuture=date>today;
                    const col=done?PASS:isFuture?"#E5E7EB":isToday?GOLD:FAIL;
                    return(
                      <div key={date} style={{textAlign:"center"}}>
                        <p style={{margin:"0 0 4px",fontSize:8,fontWeight:700,
                          color:isToday?G2:"#9CA3AF",textTransform:"uppercase"}}>{dayName}</p>
                        <div style={{width:"100%",aspectRatio:"1/1",borderRadius:10,
                          background:done?`${PASS}18`:isFuture?"#F9FAFB":isToday?`${GOLD}18`:`${FAIL}10`,
                          border:`1.5px solid ${col}`,
                          display:"flex",alignItems:"center",justifyContent:"center"}}>
                          {done?<CheckCircle2 size={14} color={PASS}/>
                           :isFuture?<Lock size={11} color="#D1D5DB"/>
                           :isToday?<Play size={12} color={GOLD}/>
                           :<AlertCircle size={13} color={FAIL}/>}
                        </div>
                        {done&&log?.avg_score!=null&&(
                          <p style={{margin:"3px 0 0",fontSize:7,fontWeight:700,color:scoreColor(log.avg_score)}}>
                            {log.avg_score}%
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Assignment info */}
              {startDate&&(
                <div style={{background:W,borderRadius:16,border:`1px solid ${BRD}`,padding:"14px"}}>
                  <p style={{margin:"0 0 10px",fontSize:10,fontWeight:800,color:G3,
                    textTransform:"uppercase",letterSpacing:.5}}>Programme Details</p>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {[
                      {label:"Started",  value:fmtDate(startDate)},
                      {label:"Total Days",value:String(totalDays)},
                      {label:"Pages/Day", value:String(assignment.daily_pages)},
                      {label:"Day Off",   value:getDaysOff(assignment).length>0
                        ?["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][getDaysOff(assignment)[0]]:"None"},
                    ].map(s=>(
                      <div key={s.label} style={{padding:"10px 12px",borderRadius:12,
                        background:`${G1}06`,border:`1px solid ${BRD}`}}>
                        <p style={{margin:0,fontSize:9,fontWeight:700,color:"#9CA3AF",
                          textTransform:"uppercase",letterSpacing:.4}}>{s.label}</p>
                        <p style={{margin:"3px 0 0",fontWeight:800,fontSize:13,color:G1}}>{s.value}</p>
                      </div>
                    ))}
                  </div>
                  {assignment.notes&&(
                    <div style={{marginTop:10,padding:"10px 12px",borderRadius:10,
                      background:`${GOLD}0d`,border:`1px solid ${GOLD}33`}}>
                      <p style={{margin:0,fontSize:10,fontWeight:700,color:"#92400E"}}>📝 Teacher's Note</p>
                      <p style={{margin:"3px 0 0",fontSize:12,color:"#78350F"}}>{assignment.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ════ TAB: SCHEDULE ════ */}
          {tab==="schedule"&&(
            <>
              {/* Overall progress */}
              <div style={{background:`linear-gradient(135deg,${G1},${G2})`,borderRadius:18,
                padding:"16px",border:`1px solid ${GOLD}22`,animation:"slideUp .3s ease"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div>
                    <p style={{margin:0,fontWeight:900,fontSize:15,color:W}}>Programme Overview</p>
                    <p style={{margin:0,fontSize:11,color:"rgba(255,255,255,.5)"}}>
                      {startDate?`Started ${fmtDate(startDate)}`:""}
                    </p>
                  </div>
                  <div style={{textAlign:"center"}}>
                    <p style={{margin:0,fontWeight:900,fontSize:28,color:GOLD}}>{pct}%</p>
                    <p style={{margin:0,fontSize:9,fontWeight:700,color:`${GOLD}88`,textTransform:"uppercase"}}>
                      Complete
                    </p>
                  </div>
                </div>
                <div style={{height:8,borderRadius:4,background:"rgba(255,255,255,.15)",overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:4,width:`${pct}%`,
                    background:`linear-gradient(to right,${GOLD},${GOLD_L})`,transition:"width .5s"}}/>
                </div>
                <div style={{marginTop:8,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                  {[
                    {label:"Done",   value:doneDays.length,  color:"#86EFAC"},
                    {label:"Missed", value:missedDays.length, color:"#FCA5A5"},
                    {label:"Left",   value:totalDays-doneDays.length-missedDays.length, color:"rgba(255,255,255,.4)"},
                  ].map(s=>(
                    <div key={s.label} style={{background:"rgba(255,255,255,.07)",borderRadius:8,
                      padding:"6px",textAlign:"center"}}>
                      <p style={{margin:0,fontWeight:800,fontSize:14,color:s.color}}>{s.value}</p>
                      <p style={{margin:0,fontSize:8,fontWeight:700,color:"rgba(255,255,255,.3)",
                        textTransform:"uppercase"}}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Day list */}
              <div style={{background:W,borderRadius:16,border:`1px solid ${BRD}`,overflow:"hidden"}}>
                <button onClick={()=>setScheduleOpen(o=>!o)}
                  style={{width:"100%",padding:"13px 14px",border:"none",cursor:"pointer",
                    background:"transparent",display:"flex",alignItems:"center",gap:8,fontFamily:"inherit"}}>
                  <CalendarDays size={14} color={G3}/>
                  <span style={{flex:1,textAlign:"left",fontSize:11,fontWeight:800,color:G1,
                    textTransform:"uppercase",letterSpacing:.5}}>
                    Day-by-Day Schedule ({programDays.length} days)
                  </span>
                  {scheduleOpen?<ChevronUp size={14} color="#9CA3AF"/>:<ChevronDown size={14} color="#9CA3AF"/>}
                </button>

                {scheduleOpen&&(
                  <div style={{borderTop:`1px solid ${BRD}`,maxHeight:420,overflowY:"auto"}}>
                    {programDays.map((day,i)=>{
                      const isDone  = day.status==="done";
                      const isMiss  = day.status==="missed";
                      const isToday = day.status==="today";
                      const isFuture= day.status==="future";
                      const dotColor= isDone?PASS:isMiss?FAIL:isToday?GOLD:"#E5E7EB";
                      return(
                        <div key={day.date}
                          style={{padding:"10px 14px",borderBottom:i<programDays.length-1?`1px solid #F9FAFB`:"none",
                            background:isToday?`${GOLD}08`:isDone?`${PASS}05`:"transparent",
                            display:"flex",alignItems:"center",gap:10}}>
                          <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,
                            background:isDone?`${PASS}18`:isMiss?`${FAIL}12`:isToday?`${GOLD}18`:"#F3F4F6",
                            border:`2px solid ${dotColor}`,
                            display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,
                            color:dotColor}}>
                            {isDone?"✓":isMiss?"!":String(day.dayNum)}
                          </div>
                          <div style={{flex:1}}>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <span style={{fontWeight:700,fontSize:12,color:isToday?G1:"#374151"}}>
                                {isToday?"📅 TODAY — ":""}{fmtDate(day.date)}
                              </span>
                              {isToday&&<span style={{padding:"1px 7px",borderRadius:6,background:GOLD,
                                color:G0,fontSize:8,fontWeight:900}}>NOW</span>}
                            </div>
                            <div style={{fontSize:11,color:"#9CA3AF",marginTop:1}}>
                              Page{day.pages.length>1?"s":""}{" "}
                              {day.pages[0]}{day.pages.length>1?`–${day.pages[day.pages.length-1]}`:""}
                              {day.log?.avg_score!=null&&(
                                <span style={{marginLeft:8,fontWeight:700,
                                  color:scoreColor(day.log.avg_score)}}>
                                  {day.log.avg_score}%
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{padding:"2px 8px",borderRadius:8,fontSize:9,fontWeight:800,
                            background:isDone?`${PASS}18`:isMiss?`${FAIL}12`:isToday?`${GOLD}18`:"#F3F4F6",
                            color:isDone?PASS:isMiss?FAIL:isToday?AMBER:"#9CA3AF"}}>
                            {isDone?"Done":isMiss?"Missed":isToday?"Today":"—"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ════ TAB: HISTORY ════ */}
          {tab==="history"&&(
            <>
              {/* Summary bar */}
              <div style={{background:`linear-gradient(135deg,${G1},${G2})`,borderRadius:18,
                padding:"14px 16px",border:`1px solid ${GOLD}22`,animation:"slideUp .3s ease"}}>
                <p style={{margin:"0 0 10px",fontWeight:900,fontSize:14,color:W}}>Overall Performance</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                  {[
                    {label:"Sessions",  value:String(logs.filter(l=>l.completed).length), icon:<CheckCircle2 size={13} color="#86EFAC"/>},
                    {label:"Avg Score", value:avgScore!=null?`${avgScore}%`:"—",          icon:<Star size={13} color={GOLD}/>},
                    {label:"Best Streak",value:`${streak}d`,                              icon:<Flame size={13} color="#FCA5A5"/>},
                  ].map(s=>(
                    <div key={s.label} style={{background:"rgba(255,255,255,.08)",borderRadius:12,
                      padding:"10px 8px",textAlign:"center",border:"1px solid rgba(255,255,255,.08)"}}>
                      <div style={{display:"flex",justifyContent:"center",marginBottom:4}}>{s.icon}</div>
                      <p style={{margin:0,fontWeight:900,fontSize:18,color:W}}>{s.value}</p>
                      <p style={{margin:"2px 0 0",fontSize:8,fontWeight:700,color:"rgba(255,255,255,.4)",
                        textTransform:"uppercase"}}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Log list */}
              {logs.filter(l=>l.completed).length===0?(
                <div style={{background:W,borderRadius:16,border:`1px solid ${BRD}`,
                  padding:"32px",textAlign:"center"}}>
                  <TrendingUp size={32} color="#D1D5DB" style={{margin:"0 auto 10px"}}/>
                  <p style={{margin:0,fontWeight:700,fontSize:13,color:"#9CA3AF"}}>No sessions yet</p>
                  <p style={{margin:"5px 0 0",fontSize:12,color:"#D1D5DB"}}>
                    Start your first session to see history here.
                  </p>
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {logs.filter(l=>l.completed).map(log=>(
                    <div key={log.id} style={{background:W,borderRadius:14,
                      border:`1px solid ${BRD}`,overflow:"hidden"}}>
                      <button onClick={()=>setHistoryOpen(h=>h===log.id?null:log.id)}
                        style={{width:"100%",padding:"12px 14px",border:"none",cursor:"pointer",
                          background:"transparent",display:"flex",alignItems:"center",gap:10,
                          fontFamily:"inherit"}}>
                        <div style={{width:36,height:36,borderRadius:10,flexShrink:0,
                          background:log.avg_score!=null?`${scoreColor(log.avg_score)}18`:"#F3F4F6",
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:13,fontWeight:900,color:log.avg_score!=null?scoreColor(log.avg_score):"#9CA3AF"}}>
                          {log.avg_score!=null?`${log.avg_score}%`:"✓"}
                        </div>
                        <div style={{flex:1,textAlign:"left"}}>
                          <p style={{margin:0,fontWeight:700,fontSize:13,color:"#111827"}}>
                            {fmtDate(log.log_date)}
                          </p>
                          <p style={{margin:0,fontSize:10,color:"#9CA3AF"}}>
                            {log.pages_revised??todayPages.length} page{(log.pages_revised??1)!==1?"s":""} revised
                            {log.duration_secs?` · ${fmtSecs(log.duration_secs)}`:""}
                          </p>
                        </div>
                        {log.acknowledged_at&&(
                          <span style={{fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:6,
                            background:"#F3E8FF",color:"#7c3aed"}}>Acked</span>
                        )}
                        {historyOpen===log.id?<ChevronUp size={14} color="#9CA3AF"/>:<ChevronDown size={14} color="#9CA3AF"/>}
                      </button>

                      {historyOpen===log.id&&(
                        <div style={{padding:"0 14px 14px",borderTop:`1px solid #F3F4F6`,
                          animation:"slideUp .2s ease"}}>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:10}}>
                            {[
                              {label:"Recitation",value:log.session_data?.page_results
                                ?`${Math.round(log.session_data.page_results.reduce((s:number,r:any)=>s+r.score,0)/(log.session_data.page_results.length||1))}%`
                                :log.avg_score!=null?`${log.avg_score}%`:"—"},
                              {label:"Duration",  value:log.duration_secs?fmtSecs(log.duration_secs):"—"},
                              {label:"Pages",     value:String(log.pages_revised??"—")},
                            ].map(s=>(
                              <div key={s.label} style={{background:WARM,borderRadius:10,padding:"8px",
                                textAlign:"center",border:`1px solid ${BRD}`}}>
                                <p style={{margin:0,fontWeight:800,fontSize:14,color:G1}}>{s.value}</p>
                                <p style={{margin:0,fontSize:8,fontWeight:700,color:"#9CA3AF",
                                  textTransform:"uppercase"}}>{s.label}</p>
                              </div>
                            ))}
                          </div>
                          {/* Page breakdown */}
                          {log.session_data?.page_results&&log.session_data.page_results.length>0&&(
                            <div style={{marginTop:10}}>
                              <p style={{margin:"0 0 6px",fontSize:9,fontWeight:800,color:"#9CA3AF",
                                textTransform:"uppercase",letterSpacing:.5}}>Page Scores</p>
                              {log.session_data.page_results.map((r:any)=>(
                                <div key={r.pageNum} style={{display:"flex",alignItems:"center",
                                  gap:8,padding:"5px 0",borderBottom:`1px solid #F3F4F6`}}>
                                  <span style={{fontSize:11,fontWeight:700,color:"#374151",minWidth:50}}>
                                    Page {r.pageNum}
                                  </span>
                                  <div style={{flex:1,height:6,borderRadius:4,background:"#F3F4F6",overflow:"hidden"}}>
                                    <div style={{height:"100%",borderRadius:4,
                                      width:`${r.score}%`,background:scoreColor(r.score)}}/>
                                  </div>
                                  <span style={{fontSize:11,fontWeight:800,color:scoreColor(r.score),minWidth:36}}>
                                    {r.score}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          {log.session_data?.errors&&log.session_data.errors.length>0&&(
                            <div style={{marginTop:10,padding:"10px 12px",borderRadius:10,
                              background:"#FFF7ED",border:"1px solid #FED7AA"}}>
                              <p style={{margin:"0 0 6px",fontSize:9,fontWeight:800,color:AMBER,
                                textTransform:"uppercase"}}>Error Words</p>
                              <div style={{display:"flex",flexWrap:"wrap",gap:4,direction:"rtl"}}>
                                {log.session_data.errors.slice(0,12).map((e:any,i:number)=>(
                                  <span key={i} style={{padding:"3px 9px",borderRadius:7,
                                    background:"#FFEDD5",color:AMBER,
                                    fontSize:13,fontFamily:"'Amiri',serif"}}>{e.word}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
