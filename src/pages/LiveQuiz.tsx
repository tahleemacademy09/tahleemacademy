/*
  LiveQuiz.tsx — Al-Musabaqah | Islamic Live Quiz Arena
  Kahoot-style live quiz with Supabase Realtime
  Colors: Deep Green #064E3B + Gold #C9922A (Tahleem Academy)
*/

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Trophy, Users, Play, ArrowRight, Star,
  Crown, Zap, RotateCcw, X,
  BookOpen, Eye, PlusCircle, Sparkles,
  Copy, Share2, Check, Pencil, Trash2, ChevronDown, ChevronUp, Plus,
} from "lucide-react";

/* ── Brand Colors ─────────────────────────────────────── */
const G     = "#064E3B";
const GM    = "#065F46";
const GOLD  = "#C9922A";
const GOLD2 = "#A67C1E";

/* ── Types ───────────────────────────────────────────── */
interface Room {
  id: string;
  code: string;
  host_id: string;
  status: "waiting" | "active" | "countdown" | "question" | "reveal" | "finished";
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
interface SavedQuiz {
  id: string;
  name: string;
  questions: Omit<Question,"id">[];
  settings: { topic: string; numQ: number; timeQ: number };
  createdAt: number;
  lastLaunched?: number;
  persistentCode: string;
}

/* ── Built-in Islamic Questions Pool ────────────────── */
const POOL: Omit<Question,"id">[] = [
  { question:"How many letters are in the Arabic alphabet?", options:["26","28","30","32"], correct_answer:"28", explanation:"The Arabic alphabet has 28 letters.", time_limit:20, topic:"Arabic" },
  { question:"What is the first Surah of the Quran?", options:["Al-Baqarah","Al-Fatiha","Al-Ikhlas","Al-Nas"], correct_answer:"Al-Fatiha", explanation:"Al-Fatiha (The Opening) is the first surah.", time_limit:15, topic:"Quran" },
  { question:"How many verses does Surah Al-Fatiha have?", options:["5","6","7","8"], correct_answer:"7", explanation:"Al-Fatiha has 7 verses.", time_limit:20, topic:"Quran" },
  { question:"What does 'Tajweed' mean?", options:["Recitation speed","To beautify/improve","Memorization","Translation"], correct_answer:"To beautify/improve", explanation:"Tajweed means to improve and perfect the recitation.", time_limit:20, topic:"Tajweed" },
  { question:"What is the meaning of 'Bismillah'?", options:["Praise be to Allah","In the name of Allah","Allah is great","Peace be upon Him"], correct_answer:"In the name of Allah", explanation:"Bismillah means 'In the name of Allah'.", time_limit:15, topic:"Islamic Studies" },
  { question:"How many Surahs are in the Holy Quran?", options:["110","112","114","116"], correct_answer:"114", explanation:"The Quran has 114 Surahs.", time_limit:15, topic:"Quran" },
  { question:"What is 'Ikhfa' in Tajweed?", options:["Hiding/concealing","Full merging","Elongation","Stopping"], correct_answer:"Hiding/concealing", explanation:"Ikhfa means to hide the Noon Sakin sound.", time_limit:25, topic:"Tajweed" },
  { question:"Which pillar of Islam is stated first?", options:["Salah","Zakat","Shahada","Sawm"], correct_answer:"Shahada", explanation:"The Shahada (testimony of faith) is the first pillar.", time_limit:20, topic:"Fiqh" },
  { question:"How many times is Salah performed daily?", options:["3","4","5","6"], correct_answer:"5", explanation:"Muslims pray 5 times a day.", time_limit:10, topic:"Fiqh" },
  { question:"What does 'Alhamdulillah' mean?", options:["God is great","All praise is due to Allah","Peace be upon him","In the name of Allah"], correct_answer:"All praise is due to Allah", explanation:"Alhamdulillah means 'All praise is due to Allah'.", time_limit:15, topic:"Islamic Studies" },
  { question:"What is 'Idgham' in Tajweed?", options:["Prolongation","Merging of letters","Stopping","Clear pronunciation"], correct_answer:"Merging of letters", explanation:"Idgham means to merge one letter into another.", time_limit:20, topic:"Tajweed" },
  { question:"The Arabic word 'قلب' means:", options:["Mind","Soul","Heart","Love"], correct_answer:"Heart", explanation:"Qalb (قلب) means heart in Arabic.", time_limit:20, topic:"Arabic" },
  { question:"Which month is Ramadan in the Islamic calendar?", options:["7th","8th","9th","10th"], correct_answer:"9th", explanation:"Ramadan is the 9th month of the Islamic calendar.", time_limit:20, topic:"Islamic Studies" },
  { question:"How many Juz (parts) does the Quran have?", options:["20","25","28","30"], correct_answer:"30", explanation:"The Quran is divided into 30 Juz.", time_limit:15, topic:"Quran" },
  { question:"What does 'Madd' mean in Tajweed?", options:["Stopping","Elongation","Merging","Hiding"], correct_answer:"Elongation", explanation:"Madd means elongation/prolongation of a vowel sound.", time_limit:20, topic:"Tajweed" },
];

/* ── Answer Shape Colors (Kahoot-style) ─────────────── */
const SHAPES = [
  { bg:"rgba(6,78,59,0.8)",  border:"#22C55E", icon:"▲", label:"A" },
  { bg:"rgba(30,58,95,0.8)", border:"#3B82F6", icon:"◆", label:"B" },
  { bg:"rgba(74,25,66,0.8)", border:"#A855F7", icon:"●", label:"C" },
  { bg:"rgba(74,32,0,0.8)",  border:"#F97316", icon:"■", label:"D" },
];

/* ── Islamic Geometric Background ───────────────────── */
const IslamicBg = ({ opacity = 0.07 }: { opacity?: number }) => (
  <svg style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",opacity,zIndex:0,pointerEvents:"none"}} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="ip" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
        {/* 8-pointed star */}
        <polygon points="60,6 70,42 106,42 77,63 88,99 60,78 32,99 43,63 14,42 50,42" fill="none" stroke={GOLD} strokeWidth="0.8"/>
        {/* Inner octagon */}
        <polygon points="60,22 72,46 98,46 78,62 86,88 60,73 34,88 42,62 22,46 48,46" fill="none" stroke={GOLD} strokeWidth="0.35" opacity="0.6"/>
        {/* Center gem */}
        <circle cx="60" cy="60" r="4" fill="none" stroke={GOLD} strokeWidth="0.6"/>
        {/* Corner stars small */}
        <polygon points="0,0 4,14 18,14 7,22 11,36 0,28 -11,36 -7,22 -18,14 -4,14" fill="none" stroke={GOLD} strokeWidth="0.4" transform="translate(0,0)" opacity="0.5"/>
        <polygon points="120,120 124,134 138,134 127,142 131,156 120,148 109,156 113,142 102,134 116,134" fill="none" stroke={GOLD} strokeWidth="0.4" opacity="0.5"/>
        {/* Grid lines */}
        <line x1="0" y1="60" x2="120" y2="60" stroke={GOLD} strokeWidth="0.2" opacity="0.3"/>
        <line x1="60" y1="0" x2="60" y2="120" stroke={GOLD} strokeWidth="0.2" opacity="0.3"/>
        <line x1="0" y1="0" x2="120" y2="120" stroke={GOLD} strokeWidth="0.15" opacity="0.15"/>
        <line x1="120" y1="0" x2="0" y2="120" stroke={GOLD} strokeWidth="0.15" opacity="0.15"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#ip)"/>
  </svg>
);

/* ── Countdown Ring ──────────────────────────────────── */
const TimerRing = ({ seconds, total }: { seconds: number; total: number }) => {
  const pct  = seconds / total;
  const r    = 34;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;
  const col  = pct > 0.5 ? GOLD : pct > 0.25 ? "#F59E0B" : "#EF4444";
  return (
    <div style={{position:"relative",width:84,height:84,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <svg width="84" height="84" style={{transform:"rotate(-90deg)",position:"absolute"}}>
        <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="5"/>
        <circle cx="42" cy="42" r={r} fill="none" stroke={col} strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{transition:"stroke-dasharray 1s linear, stroke 0.4s"}}/>
      </svg>
      <span style={{fontSize:24,fontWeight:900,color:col,zIndex:1}}>{seconds}</span>
    </div>
  );
};

/* ── Helpers ─────────────────────────────────────────── */
const genCode = () => Math.floor(100000 + Math.random() * 900000).toString();
const TOPICS  = ["All Topics","Quran","Tajweed","Arabic","Fiqh","Islamic Studies"];
const EMOJI_POOL = ["🌙","⭐","🕌","📖","🌟","✨","🌺","🦋","💎","🌸"];


/* ── Split bilingual question text into Arabic + English parts ── */
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
      const s = l.replace(/[()]/g, '').trim(); if (!s) continue;
      if (/[؀-ۿ]/.test(s)) arParts.push(s);
      else if (/[a-zA-Z]/.test(s)) enParts.push(s);
    }
    if (arParts.length && enParts.length) return { ar: arParts.join(' '), en: enParts.join(' ') };
  }
  return null;
}

const LQQuestion = ({ text }: { text: string }) => {
  const split = splitBilingual(text);
  if (split) return (
    <div style={{textAlign:'center'}}>
      {split.ar && <p style={{fontFamily:"'Scheherazade New','Amiri Quran','Amiri',serif",fontSize:24,fontWeight:700,color:'#fff',margin:'0 0 10px',lineHeight:2.2,direction:'rtl'}}>{split.ar}</p>}
      {split.en && <p style={{fontFamily:"'Cairo',sans-serif",fontSize:16,fontWeight:600,color:'rgba(255,255,255,0.85)',margin:0,lineHeight:1.8}}>{split.en}</p>}
    </div>
  );
  const isAr = /[؀-ۿ]/.test(text);
  return <p style={{fontFamily:isAr?"'Scheherazade New','Amiri Quran','Amiri',serif":"'Cairo',sans-serif",fontSize:isAr?24:20,fontWeight:700,color:'#fff',margin:0,lineHeight:isAr?2.2:1.6,direction:isAr?'rtl':'ltr'}}>{text}</p>;
};

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════ */
const LiveQuiz = () => {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const { toast }        = useToast();
  const isHost           = hasRole?.("admin") || hasRole?.("teacher");

  type View =
    | "hub" | "creating" | "joining" | "saved-quizzes" | "edit-quiz"
    | "q-source" | "q-preview" | "q-ai" | "q-bank" | "q-upload" | "q-manual"
    | "lobby-host" | "countdown-host" | "question-host" | "reveal-host" | "results-host"
    | "lobby-player" | "countdown-player" | "question-player" | "reveal-player" | "results-player"
    | "post-chat" | "farewell";

  /* ── State — lazy-initialized from sessionStorage so navigation never wipes an active quiz ── */
  const [view, setView] = useState<View>(() => {
    try {
      const s = sessionStorage.getItem("lq_view") as View | null;
      if (!s || s === "hub") return "hub";
      if (s === "countdown-host")   return "question-host";
      if (s === "countdown-player") return "question-player";
      return s;
    } catch { return "hub"; }
  });
  const [room,         setRoom]         = useState<Room|null>(() => {
    try { const s = sessionStorage.getItem("lq_room"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [participant,  setParticipant]  = useState<Participant|null>(() => {
    try { const s = sessionStorage.getItem("lq_participant"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentQ,     setCurrentQ]     = useState<Question|null>(() => {
    try { const s = sessionStorage.getItem("lq_current_q"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [selectedAns,  setSelectedAns]  = useState<string|null>(null);
  const [timeLeft,     setTimeLeft]     = useState(20);
  const [answerCounts, setAnswerCounts] = useState<Record<string,number>>({});
  const [numAnswered,  setNumAnswered]  = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [countdown,    setCountdown]    = useState(3);
  const [joinCode,     setJoinCode]     = useState("");
  const [playerName,   setPlayerName]   = useState("");
  const [settings,     setSettingsRaw]  = useState(() => {
    try { const s = sessionStorage.getItem("lq_settings"); return s ? JSON.parse(s) : { topic:"All Topics", numQ:10, timeQ:20 }; } catch { return { topic:"All Topics", numQ:10, timeQ:20 }; }
  });
  const setSettings = (fn: any) => setSettingsRaw((prev: any) => { const next = typeof fn === "function" ? fn(prev) : fn; try { sessionStorage.setItem("lq_settings", JSON.stringify(next)); } catch {} return next; });

  // ── Missing state declarations (caused blank screen crash) ──
  const [customQs,     setCustomQs]     = useState<Omit<Question,"id">[]>([]);
  const [bankExams,    setBankExams]    = useState<{id:string;title:string}[]>([]);
  const [bankQs,       setBankQs]       = useState<Omit<Question,"id">[]>([]);
  const [selBankExam,  setSelBankExam]  = useState<string>("");
  const [aiTopic,      setAiTopic]      = useState<string>("");
  const [aiLoading,    setAiLoading]    = useState<boolean>(false);
  const [uploadError,  setUploadError]  = useState<string>("");
  const [manualQ,      setManualQ]      = useState<{question:string;optA:string;optB:string;optC:string;optD:string;correct:string;explanation:string}>(
    { question:"", optA:"", optB:"", optC:"", optD:"", correct:"A", explanation:"" }
  );

  // ── Quiz name + bulk paste — persisted to sessionStorage so tab switches don't wipe state ──
  const [quizName,   setQuizNameRaw]   = useState<string>(() => sessionStorage.getItem("lq_quiz_name") || "");
  const [bulkText,   setBulkTextRaw]   = useState<string>(() => sessionStorage.getItem("lq_bulk_text") || "");
  const [bulkParsed, setBulkParsed]    = useState<Omit<Question,"id">[]>([]);
  const [bulkError,  setBulkError]     = useState<string>("");

  const setQuizName = (v: string) => { setQuizNameRaw(v); try { sessionStorage.setItem("lq_quiz_name", v); } catch {} };
  const setBulkText = (v: string) => { setBulkTextRaw(v); try { sessionStorage.setItem("lq_bulk_text", v); } catch {} };

  const timerRef        = useRef<any>(null);
  const channelRef      = useRef<any>(null);
  const broadcastRef    = useRef<any>(null);
  // Ref tracks current question index for nextQuestion's stale-closure avoidance.
  // Seeded from sessionStorage so it's correct after a page navigation.
  const questionIdxRef  = useRef<number>((() => {
    try { return parseInt(sessionStorage.getItem("lq_q_index") || "0") || 0; } catch { return 0; }
  })());
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedSavedId, setCopiedSavedId] = useState<string|null>(null);

  // ── Answer-change support ──
  // Players can pick a different option as many times as they like while the
  // timer is still running. We track the DB row id for this question's answer
  // (so re-picking updates it instead of inserting duplicates) and the
  // participant's score/streak from BEFORE this question, so recomputing on
  // every change never double-counts points.
  const answerRowIdRef  = useRef<string|null>(null);
  const baseScoreRef    = useRef<number>(0);
  const baseStreakRef   = useRef<number>(0);

  // ── Edit Saved Quiz ──
  const [editingQuizId, setEditingQuizId]   = useState<string|null>(null);
  const [editQs,        setEditQs]          = useState<Omit<Question,"id">[]>([]);
  const [editName,      setEditName]        = useState<string>("");
  const [editSettings,  setEditSettings]    = useState<{topic:string;numQ:number;timeQ:number}>({topic:"All Topics",numQ:10,timeQ:20});
  const [expandedEditQ, setExpandedEditQ]   = useState<number|null>(null);
  // ── Saved Quizzes ──
  const [savedQuizzes, setSavedQuizzesRaw] = useState<SavedQuiz[]>(() => {
    try { const s = localStorage.getItem("lq_saved_quizzes"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const setSavedQuizzes = (fn: SavedQuiz[] | ((prev: SavedQuiz[]) => SavedQuiz[])) => {
    setSavedQuizzesRaw(prev => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      try { localStorage.setItem("lq_saved_quizzes", JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const saveCurrentQuiz = (qs: Omit<Question,"id">[]) => {
    if (!quizName.trim() || qs.length === 0) return;
    const entry: SavedQuiz = {
      id: `sq-${Date.now()}`,
      name: quizName.trim(),
      questions: qs,
      settings: { ...settings },
      createdAt: Date.now(),
      persistentCode: genCode(),
    };
    setSavedQuizzes(prev => [entry, ...prev]);
    return entry;
  };
  const deleteSavedQuiz = (id: string) => setSavedQuizzes(prev => prev.filter(q => q.id !== id));
  const refreshSavedCode = (id: string) => setSavedQuizzes(prev => prev.map(q => q.id === id ? { ...q, persistentCode: genCode() } : q));

  const startEditQuiz = (sq: SavedQuiz) => {
    setEditingQuizId(sq.id);
    setEditQs(sq.questions.map(q => ({ ...q })));
    setEditName(sq.name);
    setEditSettings({ ...sq.settings });
    setExpandedEditQ(null);
    setView("edit-quiz");
  };

  const saveEditedQuiz = () => {
    if (!editingQuizId) return;
    setSavedQuizzes(prev => prev.map(q =>
      q.id === editingQuizId
        ? { ...q, name: editName.trim() || q.name, questions: editQs, settings: editSettings }
        : q
    ));
    toast({ title: "✅ Quiz updated!" });
    setView("saved-quizzes");
  };

  const updateEditQ = (idx: number, patch: Partial<Omit<Question,"id">>) => {
    setEditQs(prev => prev.map((q, i) => i === idx ? { ...q, ...patch } : q));
  };

  const deleteEditQ = (idx: number) => {
    setEditQs(prev => prev.filter((_, i) => i !== idx));
    setExpandedEditQ(null);
  };

  const addEditQ = () => {
    const newQ: Omit<Question,"id"> = {
      question: "", options: ["", "", "", ""], correct_answer: "",
      explanation: "", time_limit: editSettings.timeQ, topic: "Manual",
    };
    setEditQs(prev => [...prev, newQ]);
    setExpandedEditQ(editQs.length);
  };
  const launchSavedQuiz = async (sq: SavedQuiz) => {
    setQuizName(sq.name);
    setSettings(sq.settings);
    setCustomQs(sq.questions);
    setSavedQuizzes(prev => prev.map(q => q.id === sq.id ? { ...q, lastLaunched: Date.now() } : q));
    // Directly create room using the persistent code
    if (!user) return;
    setLoading(true);
    try {
      const code = sq.persistentCode;
      const selected = sq.questions.slice(0, sq.settings.numQ).map(q => ({ ...q, time_limit: sq.settings.timeQ }));
      const { data: rd, error } = await supabase.from("live_quiz_rooms" as any).insert({
        code, host_id: user.id, status: "waiting",
        current_question_index: 0, total_questions: selected.length,
        topic: sq.name,
      } as any).select().single();
      if (error) throw error;
      setRoom(rd as unknown as Room);
      for (let i = 0; i < selected.length; i++) {
        await supabase.from("live_quiz_questions" as any).insert({
          room_id: (rd as any).id, question: selected[i].question,
          options: selected[i].options, correct_answer: selected[i].correct_answer,
          explanation: selected[i].explanation || null, time_limit: sq.settings.timeQ,
          order_index: i, topic: selected[i].topic,
        } as any);
      }
      setView("lobby-host");
      toast({ title: `✅ Room launched! Code: ${code}` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };
  // ── Chat state ──
  const [chatMessages, setChatMessages] = useState<{id:string;name:string;text:string;ts:number;isHost:boolean}[]>([]);
  const [chatInput,    setChatInput]    = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  // ── Explicit question-index state — lazy-initialized from sessionStorage,
  // then updated from broadcast (players), DB events (both), and local actions (host).
  const [currentQIndex, setCurrentQIndex] = useState<number>(() => {
    try { return parseInt(sessionStorage.getItem("lq_q_index") || "0") || 0; } catch { return 0; }
  });

  /* ── Persist quiz session so page-switches / navigation don't wipe state ── */
  useEffect(() => { try { sessionStorage.setItem("lq_view", view); } catch {} }, [view]);
  useEffect(() => { try { room ? sessionStorage.setItem("lq_room", JSON.stringify(room)) : sessionStorage.removeItem("lq_room"); } catch {} }, [room]);
  useEffect(() => { try { participant ? sessionStorage.setItem("lq_participant", JSON.stringify(participant)) : sessionStorage.removeItem("lq_participant"); } catch {} }, [participant]);
  useEffect(() => { try { currentQ ? sessionStorage.setItem("lq_current_q", JSON.stringify(currentQ)) : sessionStorage.removeItem("lq_current_q"); } catch {} }, [currentQ]);
  useEffect(() => { try { sessionStorage.setItem("lq_q_index", String(currentQIndex)); } catch {} }, [currentQIndex]);

  /* ── Mount: auto-fill from URL params (state restoration is handled by lazy initialisers above) ── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get("code");
    const name   = params.get("name");
    if (code) { setJoinCode(code.toUpperCase()); setView("joining"); }
    if (name) setQuizName(decodeURIComponent(name));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Bulk paste parser ─────────────────────────────────────────────────
     Format (one block per question, separated by ---):
       Q: Question text
       A: Option A
       B: Option B*   ← asterisk marks the correct answer
       C: Option C
       D: Option D
       Note: Optional explanation
  ─────────────────────────────────────────────────────────────────────── */
  const parseBulkText = (text: string): { questions: Omit<Question,"id">[]; errors: string[] } => {
    const errors: string[] = [];
    const questions: Omit<Question,"id">[] = [];
    const blocks = text.split(/^---+$/m).map(b => b.trim()).filter(Boolean);

    blocks.forEach((block, bi) => {
      const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
      let question = "";
      const options: string[] = [];
      let correct_answer = "";
      let explanation = "";

      for (const line of lines) {
        if (/^Q:/i.test(line)) {
          question = line.replace(/^Q:\s*/i, "").trim();
        } else if (/^[A-D]:/i.test(line)) {
          const raw   = line.replace(/^[A-D]:\s*/i, "").trim();
          const isCorrect = raw.endsWith("*");
          const opt   = isCorrect ? raw.slice(0, -1).trim() : raw;
          options.push(opt);
          if (isCorrect) correct_answer = opt;
        } else if (/^(Note|Explanation|E):/i.test(line)) {
          explanation = line.replace(/^(Note|Explanation|E):\s*/i, "").trim();
        }
      }

      if (!question)          { errors.push(`Block ${bi+1}: missing Q:`); return; }
      if (options.length < 2) { errors.push(`Block ${bi+1}: need at least 2 options`); return; }
      if (!correct_answer)    { errors.push(`Block ${bi+1}: mark correct answer with * e.g. "B: Answer*"`); return; }

      questions.push({ question, options, correct_answer, explanation, time_limit: settings.timeQ, topic: "Manual" });
    });

    return { questions, errors };
  };

  const handleBulkParse = () => {
    setBulkError("");
    if (!bulkText.trim()) { setBulkError("Paste your questions above first."); return; }
    const { questions, errors } = parseBulkText(bulkText);
    if (errors.length) { setBulkError(errors.join(" · ")); return; }
    setBulkParsed(questions);
    setCustomQs(questions);
    setView("q-preview");
  };

  /* ── Realtime subscription ── */
  useEffect(() => {
    if (!room) return;

    // Shared broadcast channel — host pushes question data directly to students.
    // This bypasses RLS on live_quiz_questions entirely.
    const bc = supabase.channel(`lq-broadcast-${room.id}`)
      .on("broadcast", { event: "question" }, ({ payload }: any) => {
        // Students receive full question object from host
        if (!isHost && payload?.q) {
          const q = payload.q as Question;
          setCurrentQ(q);
          // ── KEY FIX: set the counter immediately from the broadcast payload
          // so it's correct BEFORE the postgres_changes event arrives from the DB.
          if (typeof q.order_index === "number") setCurrentQIndex(q.order_index);
          setSelectedAns(null);
          // Reset per-question answer tracking so a new question starts fresh
          // and doesn't inherit the previous question's answer row / points.
          answerRowIdRef.current = null;
          setParticipant(p => {
            baseScoreRef.current  = p?.score  || 0;
            baseStreakRef.current = p?.streak || 0;
            return p;
          });
          setCountdown(3);
          setView("countdown-player");
        }
      })
      // ── Post-quiz chat ──
      .on("broadcast", { event: "chat_start" }, () => {
        // Host opens discussion → all players auto-join
        setChatMessages([]);
        setView("post-chat");
      })
      .on("broadcast", { event: "chat_msg" }, ({ payload }: any) => {
        if (payload?.id) {
          setChatMessages(prev => {
            // Deduplicate (sender already added it optimistically)
            if (prev.some(m => m.id === payload.id)) return prev;
            return [...prev, payload];
          });
        }
      })
      .on("broadcast", { event: "chat_end" }, () => {
        // Host closes discussion → everyone sees the farewell screen
        if (!isHost) setView("farewell");
      })
      .subscribe();
    broadcastRef.current = bc;

    // Postgres changes — room status events for reveal/finished
    const ch = supabase.channel(`lq-db-${room.id}`)
      .on("postgres_changes",{ event:"*", schema:"public", table:"live_quiz_rooms", filter:`id=eq.${room.id}` }, async (p:any) => {
        const r = p.new as Room;
        setRoom(r);
        // Keep currentQIndex in sync with the DB — this is the authoritative source for the host
        // and a fallback for players (broadcast already updates it, but this catches edge cases).
        if (typeof r.current_question_index === "number") setCurrentQIndex(r.current_question_index);
        if (!isHost) {
          // Students rely on broadcast for question data (no RLS issues)
          // Only handle reveal and finished from DB events
          if (r.status === "reveal")   { await loadParticipants(); setView("reveal-player"); }
          if (r.status === "finished") { await loadParticipants(); setView("results-player"); }
        }
      })
      .on("postgres_changes",{ event:"*", schema:"public", table:"live_quiz_participants", filter:`room_id=eq.${room.id}` }, () => loadParticipants())
      .on("postgres_changes",{ event:"*", schema:"public", table:"live_quiz_answers",      filter:`room_id=eq.${room.id}` }, () => loadAnswerCounts())
      .subscribe();
    channelRef.current = ch;

    return () => {
      supabase.removeChannel(bc);
      supabase.removeChannel(ch);
    };
  }, [room?.id]);

  /* ── Timer ── */
  useEffect(() => {
    if (view === "question-host" || view === "question-player") {
      clearInterval(timerRef.current);
      setTimeLeft(currentQ?.time_limit ?? 20);
      timerRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) { clearInterval(timerRef.current); if (view === "question-host") handleReveal(); return 0; }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [view, currentQ]);


  /* ── Countdown 3-2-1 for HOST — after 3s push status to "question" ── */
  useEffect(() => {
    if (view !== "countdown-host") return;
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(interval);
          // Push "question" status — this triggers students to show the question
          if (room) {
            supabase.from("live_quiz_rooms" as any)
              .update({ status: "question" } as any)
              .eq("id", room.id)
              .then(() => {});
          }
          setView("question-host");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [view]);

  /* ── Countdown 3-2-1 for players ── */
  useEffect(() => {
    if (view !== "countdown-player") return;
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(interval);
          setView("question-player");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [view]);

  /* ── Data loaders ── */
  const loadParticipants = async () => {
    if (!room) return;
    const { data } = await supabase.from("live_quiz_participants" as any).select("*").eq("room_id", room.id).order("score",{ascending:false});
    setParticipants((data||[]) as unknown as Participant[]);
  };

  const loadCurrentQ = async (idx: number) => {
    if (!room) return;
    const { data } = await supabase.from("live_quiz_questions" as any).select("*").eq("room_id", room.id).eq("order_index", idx).single();
    if (data) setCurrentQ({ ...(data as any), options: (data as any).options as string[] } as Question);
  };

  const loadAnswerCounts = async () => {
    if (!room || !currentQ) return;
    const { data } = await supabase.from("live_quiz_answers" as any).select("answer").eq("room_id", room.id).eq("question_id", currentQ.id);
    if (!data) return;
    const counts: Record<string,number> = {};
    data.forEach((a:any) => { counts[a.answer] = (counts[a.answer]||0) + 1; });
    setAnswerCounts(counts);
    setNumAnswered(data.length);
  };

  /* ── Load exams for question bank ── */
  const loadBankExams = async () => {
    const { data } = await supabase.from("exams").select("id,title").eq("is_published", true);
    setBankExams(data||[]);
  };

  const loadBankQs = async (examId: string) => {
    setSelBankExam(examId);
    const { data } = await supabase.from("exam_questions").select("*")
      .eq("exam_id", examId).eq("question_type","mcq");
    const qs = (data||[]).filter((q:any)=>q.options?.length>=2).map((q:any):Omit<Question,"id"> => ({
      question: q.question_text,
      options: (q.options as any[]).map((o:any)=>typeof o==="string"?o:o.text||o.value||""),
      correct_answer: q.correct_answer,
      explanation: q.explanation||"",
      time_limit: settings.timeQ,
      topic: "Question Bank",
    }));
    setBankQs(qs);
  };

  /* ── AI generate questions ── */
  const generateAiQs = async () => {
    if (!aiTopic.trim()) return;
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("tahleem-ai", {
        body: {
          action: "revision",
          prompt: `Create ${settings.numQ} multiple-choice quiz questions about "${aiTopic}" for Islamic education students.
Return ONLY valid JSON array, no markdown, no explanation, nothing else:
[{"question":"...","options":["A","B","C","D"],"correct_answer":"exact option text","explanation":"brief explanation","topic":"${aiTopic}"}]
Make questions educational, clearly worded, and accurate.`
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      const text = data?.text || data?.content || "";
      const clean = text.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim();
      const parsed = JSON.parse(clean) as any[];
      const qs: Omit<Question,"id">[] = parsed.map((q: any) => ({
        question: q.question, options: q.options,
        correct_answer: q.correct_answer, explanation: q.explanation||"",
        time_limit: settings.timeQ, topic: aiTopic,
      }));
      setCustomQs(qs);
      setView("q-preview");
    } catch(e:any) {
      alert("AI Error: " + e.message);
    } finally { setAiLoading(false); }
  };

  /* ── Parse uploaded CSV/JSON ── */
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        let parsed: any[] = [];
        if (file.name.endsWith(".json")) {
          parsed = JSON.parse(text);
        } else {
          // CSV: question,optA,optB,optC,optD,correct_answer,explanation
          const lines = text.split("\n").filter(l=>l.trim());
          const header = lines[0].toLowerCase();
          const start = header.includes("question") ? 1 : 0;
          parsed = lines.slice(start).map(line => {
            const cols = line.split(",").map(c=>c.trim().replace(/^"|"$/g,""));
            return { question:cols[0], options:[cols[1],cols[2],cols[3],cols[4]], correct_answer:cols[5], explanation:cols[6]||"" };
          });
        }
        const qs: Omit<Question,"id">[] = parsed.map(q => ({
          question: q.question, options: q.options||[q.optA,q.optB,q.optC,q.optD],
          correct_answer: q.correct_answer||q.answer, explanation: q.explanation||"",
          time_limit: settings.timeQ, topic: q.topic||"Uploaded",
        })).filter(q=>q.question&&q.options?.length>=2&&q.correct_answer);
        if (!qs.length) throw new Error("No valid questions found");
        setCustomQs(qs);
        setView("q-preview");
      } catch(err:any) {
        setUploadError("Parse error: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  /* ── Add manual question ── */
  const addManualQ = () => {
    const { question, optA, optB, optC, optD, correct, explanation } = manualQ;
    if (!question.trim()||!optA.trim()||!optB.trim()) return;
    const opts = [optA,optB,optC,optD].filter(o=>o.trim());
    const correctText = correct==="A"?optA:correct==="B"?optB:correct==="C"?optC:optD;
    setCustomQs(prev=>[...prev,{ question, options:opts, correct_answer:correctText, explanation, time_limit:settings.timeQ, topic:"Manual" }]);
    setManualQ({ question:"", optA:"", optB:"", optC:"", optD:"", correct:"A", explanation:"" });
  };

  /* ── Actions ── */
  const createRoom = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const code = genCode();
      let selected: Omit<Question,"id">[] = [];

      if (customQs.length > 0) {
        selected = customQs.slice(0, settings.numQ).map(q=>({...q, time_limit:settings.timeQ}));
      } else {
        let pool = settings.topic === "All Topics" ? POOL : POOL.filter(q => q.topic === settings.topic);
        if (pool.length < settings.numQ) pool = POOL;
        selected = [...pool].sort(() => Math.random()-0.5).slice(0, settings.numQ);
      }

      const { data: rd, error } = await supabase.from("live_quiz_rooms" as any).insert({
        code, host_id: user.id, status: "waiting",
        current_question_index: 0, total_questions: selected.length,
        topic: quizName.trim() || settings.topic,
      } as any).select().single();
      if (error) throw error;

      setRoom(rd as unknown as Room);
      for (let i = 0; i < selected.length; i++) {
        await supabase.from("live_quiz_questions" as any).insert({
          room_id: (rd as any).id, question: selected[i].question,
          options: selected[i].options, correct_answer: selected[i].correct_answer,
          explanation: selected[i].explanation||null, time_limit: settings.timeQ,
          order_index: i, topic: selected[i].topic,
        } as any);
      }
      setView("lobby-host");
      toast({ title:`✅ Room created! Code: ${code}` });
    } catch(e:any) {
      toast({ title:"Error", description:e.message, variant:"destructive" });
    } finally { setLoading(false); }
  };

  const joinRoom = async () => {
    if (!joinCode.trim() || !playerName.trim()) return;
    setLoading(true);
    try {
      const { data: rd } = await supabase.from("live_quiz_rooms" as any).select("*").eq("code", joinCode.trim()).eq("status","waiting").single();
      if (!rd) throw new Error("Room not found or already started");
      setRoom(rd as unknown as Room);
      const { data: pd, error: pe } = await supabase.from("live_quiz_participants" as any).insert({
        room_id: (rd as any).id, player_name: playerName.trim(), score:0, streak:0,
      } as any).select().single();
      if (pe) throw pe;
      setParticipant(pd as unknown as Participant);
      setView("lobby-player");
    } catch(e:any) {
      toast({ title:"Error", description:e.message, variant:"destructive" });
    } finally { setLoading(false); }
  };

  /* ── Broadcast question to all students via Realtime Broadcast ── */
  const broadcastQuestion = (q: Question) => {
    try {
      broadcastRef.current?.send({
        type: "broadcast",
        event: "question",
        payload: { q },
      });
    } catch (_) {}
  };

  const startQuiz = async () => {
    if (!room) return;
    // Reset index ref — avoids stale closure in nextQuestion
    questionIdxRef.current = 0;
    setCurrentQIndex(0);
    // Load Q0 on host side
    const { data: qData } = await supabase.from("live_quiz_questions" as any).select("*").eq("room_id", room.id).eq("order_index", 0).single();
     const q = qData ? { ...(qData as any), options: (qData as any).options as string[] } as Question : null;
    if (q) {
      setCurrentQ(q);
      broadcastQuestion(q);
    }
    await supabase.from("live_quiz_rooms" as any).update({ status:"countdown", current_question_index:0 } as any).eq("id", room.id);
    setRoom(r => r ? { ...r, current_question_index: 0, status: "countdown" } : r);
    setCountdown(3); setView("countdown-host"); setSelectedAns(null); setAnswerCounts({}); setNumAnswered(0);
  };

  const handleReveal = async () => {
    if (!room) return;
    clearInterval(timerRef.current);
    await supabase.from("live_quiz_rooms" as any).update({ status:"reveal" } as any).eq("id", room.id);
    setRoom(r => r ? { ...r, status: "reveal" } : r);
    await loadParticipants(); await loadAnswerCounts();
    setView("reveal-host");
  };

  const nextQuestion = async () => {
    if (!room) return;
    // ── Use ref instead of room.current_question_index to avoid stale closure ──
    // room state can lag behind due to React batching; ref is always current
    const next = questionIdxRef.current + 1;
    if (next >= (room.total_questions||0)) {
      await supabase.from("live_quiz_rooms" as any).update({ status:"finished" } as any).eq("id", room.id);
      setRoom(r => r ? { ...r, status:"finished" } : r);
      await loadParticipants();
      setView("results-host");
    } else {
      const { data: qData } = await supabase.from("live_quiz_questions" as any).select("*").eq("room_id", room.id).eq("order_index", next).single();
      const q = qData ? { ...(qData as any), options: (qData as any).options as string[] } as Question : null;
      if (q) {
        setCurrentQ(q);
        broadcastQuestion(q);
        await new Promise(res => setTimeout(res, 150));
      }
      // Advance ref BEFORE the DB update so subsequent calls read the correct value
      questionIdxRef.current = next;
      setCurrentQIndex(next);
      await supabase.from("live_quiz_rooms" as any).update({ status:"countdown", current_question_index:next } as any).eq("id", room.id);
      setRoom(r => r ? { ...r, current_question_index: next, status: "countdown" } : r);
      setCountdown(3); setView("countdown-host"); setAnswerCounts({}); setNumAnswered(0);
    }
  };

  const submitAnswer = async (answer: string) => {
    // Players may change their pick as many times as they like while the
    // timer is still running — only block once time's up or before a
    // question has loaded.
    if (!room || !currentQ || !participant || timeLeft <= 0) return;
    setSelectedAns(answer);
    const isCorrect  = answer === currentQ.correct_answer;
    const speedBonus = Math.max(0, Math.floor((timeLeft / currentQ.time_limit) * 500));
    const points     = isCorrect ? 500 + speedBonus : 0;

    if (!answerRowIdRef.current) {
      // First pick for this question — insert the answer row.
      const { data } = await supabase.from("live_quiz_answers" as any).insert({
        room_id:room.id, question_id:currentQ.id, participant_id:participant.id,
        answer, is_correct:isCorrect, time_taken:currentQ.time_limit-timeLeft, points_earned:points,
      } as any).select("id").single();
      if (data) answerRowIdRef.current = (data as any).id;
    } else {
      // Changed their mind — update the same row instead of inserting a duplicate.
      await supabase.from("live_quiz_answers" as any).update({
        answer, is_correct:isCorrect, time_taken:currentQ.time_limit-timeLeft, points_earned:points,
      } as any).eq("id", answerRowIdRef.current);
    }

    // Recompute score/streak from the pre-question baseline so switching
    // answers never double-counts points from an earlier pick.
    const newScore  = baseScoreRef.current + points;
    const newStreak = isCorrect ? baseStreakRef.current + 1 : 0;
    await supabase.from("live_quiz_participants" as any).update({ score:newScore, streak:newStreak, last_answer_correct:isCorrect } as any).eq("id",participant.id);
    setParticipant(p => p ? {...p, score:newScore, streak:newStreak} : p);
  };

  const resetAll = () => {
    setView("hub"); setRoom(null); setParticipant(null);
    setParticipants([]); setCurrentQ(null); setSelectedAns(null);
    setJoinCode(""); setPlayerName(""); setCurrentQIndex(0);
    questionIdxRef.current = 0;
    // Clear persisted session so the next quiz starts fresh
    try {
      ["lq_view","lq_room","lq_participant","lq_current_q","lq_q_index"].forEach(k => sessionStorage.removeItem(k));
    } catch {}
  };

  /* ── Chat helpers ── */
  const myChatName = isHost
    ? "🎓 Teacher"
    : (participant?.player_name || "Student");

  const openDiscussion = () => {
    setChatMessages([]);
    broadcastRef.current?.send({ type:"broadcast", event:"chat_start", payload:{} });
    setView("post-chat");
  };

  const sendChatMsg = () => {
    const text = chatInput.trim();
    if (!text) return;
    const msg = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name:myChatName, text, ts:Date.now(), isHost };
    setChatMessages(prev => [...prev, msg]);
    setChatInput("");
    broadcastRef.current?.send({ type:"broadcast", event:"chat_msg", payload:msg });
    // Auto-scroll
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior:"smooth" }), 60);
  };

  const closeChatForAll = () => {
    broadcastRef.current?.send({ type:"broadcast", event:"chat_end", payload:{} });
    setView("farewell");
  };

  /* ── Chat auto-scroll ── */
  useEffect(() => {
    if (view === "post-chat") chatEndRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [chatMessages, view]);

  /* ══════════════════════════════════════════════════
     SHARED STYLES
  ══════════════════════════════════════════════════ */
  const pageStyle: React.CSSProperties = {
    minHeight:"100svh",
    background:`linear-gradient(160deg,${G} 0%, #021F16 60%, #000D09 100%)`,
    position:"relative", overflow:"hidden",
  };
  const glassCard: React.CSSProperties = {
    background:"rgba(255,255,255,0.04)",
    backdropFilter:"blur(20px)",
    border:`1px solid rgba(201,146,42,0.25)`,
    borderRadius:22,
    padding:24,
  };
  const goldBtn: React.CSSProperties = {
    padding:"16px", borderRadius:14, border:"none",
    background:`linear-gradient(135deg,${GOLD},${GOLD2})`,
    color:"#fff", cursor:"pointer", fontWeight:900, fontSize:16,
    display:"flex", alignItems:"center", justifyContent:"center", gap:10,
    width:"100%", fontFamily:"'Playfair Display',serif",
    boxShadow:`0 4px 24px rgba(201,146,42,0.4)`,
  };
  const outlineBtn: React.CSSProperties = {
    padding:"15px", borderRadius:14,
    border:`2px solid rgba(201,146,42,0.5)`,
    background:"rgba(201,146,42,0.08)",
    color:"#fff", cursor:"pointer", fontWeight:800, fontSize:15,
    display:"flex", alignItems:"center", justifyContent:"center", gap:10,
    width:"100%", fontFamily:"'Playfair Display',serif",
  };
  const backBtn: React.CSSProperties = {
    background:"none", border:"none",
    color:"rgba(255,255,255,0.5)",
    cursor:"pointer", fontSize:13, fontWeight:600,
    display:"flex", alignItems:"center", gap:6,
    marginBottom:24,
  };
  const divider = (
    <div style={{display:"flex",alignItems:"center",gap:12,margin:"20px 0"}}>
      <div style={{flex:1,height:1,background:`rgba(201,146,42,0.2)`}}/>
      <Star size={12} color={GOLD} fill={GOLD}/>
      <div style={{flex:1,height:1,background:`rgba(201,146,42,0.2)`}}/>
    </div>
  );

  /* ══ SAVED QUIZZES ════════════════════════════════ */
  if (view === "saved-quizzes") return (
    <div style={{...pageStyle, padding:"0 0 40px", overflowY:"auto"}}>
      <IslamicBg opacity={0.08}/>
      {/* Sticky header */}
      <div style={{position:"sticky",top:0,zIndex:10,background:"rgba(6,20,14,0.95)",backdropFilter:"blur(12px)",borderBottom:"1px solid rgba(201,146,42,0.2)",padding:"14px 18px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={()=>setView("hub")} style={{...backBtn,margin:0}}>← Back</button>
        <div style={{flex:1,textAlign:"center"}}>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:20,color:"#fff",margin:0}}>Saved Quizzes</h2>
        </div>
        <div style={{width:50}}/>
      </div>

      <div style={{position:"relative",zIndex:1,maxWidth:480,margin:"0 auto",padding:"20px 18px",display:"flex",flexDirection:"column",gap:16}}>
        {savedQuizzes.length === 0 ? (
          <div style={{textAlign:"center",padding:"48px 24px",background:"rgba(255,255,255,0.03)",borderRadius:20,border:"1px solid rgba(255,255,255,0.07)"}}>
            <div style={{fontSize:48,marginBottom:12,opacity:0.4}}>💾</div>
            <p style={{fontSize:15,fontWeight:700,color:"rgba(255,255,255,0.4)",margin:"0 0 6px"}}>No saved quizzes yet</p>
            <p style={{fontSize:13,color:"rgba(255,255,255,0.25)",margin:0}}>Build a quiz and tap "Save for Later" on the preview screen</p>
          </div>
        ) : (
          savedQuizzes.map(sq => (
            <div key={sq.id} style={{background:"rgba(255,255,255,0.04)",border:"1.5px solid rgba(201,146,42,0.2)",borderRadius:20,overflow:"hidden"}}>

              {/* ── Join Code Hero ── */}
              <div style={{background:"rgba(201,146,42,0.1)",borderBottom:"1px solid rgba(201,146,42,0.2)",padding:"16px 18px"}}>
                <p style={{fontSize:10,fontWeight:700,color:GOLD,letterSpacing:2,textTransform:"uppercase",margin:"0 0 8px"}}>Join Code</p>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:36,fontWeight:900,color:GOLD,letterSpacing:8,fontFamily:"'Courier New',monospace",flex:1}}>
                    {sq.persistentCode}
                  </span>
                  {/* Copy button */}
                  <button
                    onClick={()=>{
                      navigator.clipboard.writeText(sq.persistentCode).then(()=>{
                        setCopiedSavedId(sq.id);
                        setTimeout(()=>setCopiedSavedId(null), 2000);
                      });
                    }}
                    style={{flexShrink:0,display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:10,border:`1px solid ${GOLD}`,background:"rgba(201,146,42,0.15)",color:GOLD,fontWeight:700,fontSize:12,cursor:"pointer"}}>
                    {copiedSavedId===sq.id ? <><Check size={13}/> Copied!</> : <><Copy size={13}/> Copy</>}
                  </button>
                  {/* Refresh code button */}
                  <button
                    onClick={()=>refreshSavedCode(sq.id)}
                    title="Generate a new code"
                    style={{flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",width:36,height:36,borderRadius:10,border:"1px solid rgba(255,255,255,0.15)",background:"rgba(255,255,255,0.06)",color:"rgba(255,255,255,0.5)",cursor:"pointer",fontSize:16}}>
                    <RotateCcw size={14}/>
                  </button>
                </div>
                <p style={{fontSize:10,color:"rgba(255,255,255,0.3)",margin:"6px 0 0"}}>
                  Students enter this at tahleemacademy.vercel.app · tap 🔄 to change
                </p>
              </div>

              {/* ── Quiz Info ── */}
              <div style={{padding:"14px 18px 16px",display:"flex",flexDirection:"column",gap:10}}>
                {/* Name + delete */}
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:15,fontWeight:900,color:"#fff",margin:"0 0 5px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sq.name}</p>
                    <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                      <span style={{fontSize:11,color:GOLD,background:"rgba(201,146,42,0.1)",padding:"2px 8px",borderRadius:20,border:"1px solid rgba(201,146,42,0.25)",fontWeight:700}}>
                        {sq.questions.length} Qs
                      </span>
                      <span style={{fontSize:11,color:"rgba(255,255,255,0.45)",background:"rgba(255,255,255,0.05)",padding:"2px 8px",borderRadius:20,border:"1px solid rgba(255,255,255,0.08)",fontWeight:600}}>
                        {sq.settings.timeQ}s/Q
                      </span>
                      <span style={{fontSize:11,color:"rgba(255,255,255,0.45)",background:"rgba(255,255,255,0.05)",padding:"2px 8px",borderRadius:20,border:"1px solid rgba(255,255,255,0.08)",fontWeight:600}}>
                        {sq.settings.topic}
                      </span>
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                    <button onClick={()=>startEditQuiz(sq)}
                      title="Edit quiz"
                      style={{background:"none",border:"none",color:GOLD,cursor:"pointer",padding:"2px 6px",lineHeight:1,display:"flex",alignItems:"center",gap:3,fontSize:13,fontWeight:700}}>
                      <Pencil size={13}/> Edit
                    </button>
                    <button onClick={()=>deleteSavedQuiz(sq.id)}
                      style={{flexShrink:0,background:"none",border:"none",color:"rgba(239,68,68,0.45)",cursor:"pointer",fontSize:18,padding:"2px 6px",lineHeight:1}}
                      title="Delete quiz">✕</button>
                  </div>
                </div>

                {/* Question preview */}
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {sq.questions.slice(0,2).map((q,i) => (
                    <p key={i} style={{fontSize:12,color:"rgba(255,255,255,0.35)",margin:0,lineHeight:1.4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      <span style={{color:"rgba(201,146,42,0.5)",fontWeight:700}}>#{i+1}</span> {q.question}
                    </p>
                  ))}
                  {sq.questions.length > 2 && (
                    <p style={{fontSize:11,color:"rgba(255,255,255,0.2)",margin:0}}>+{sq.questions.length-2} more questions</p>
                  )}
                </div>

                {/* Launch row */}
                <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:6,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
                  <p style={{fontSize:10,color:"rgba(255,255,255,0.22)",margin:0,flex:1}}>
                    {sq.lastLaunched ? `Last launched ${new Date(sq.lastLaunched).toLocaleDateString()}` : `Saved ${new Date(sq.createdAt).toLocaleDateString()}`}
                  </p>
                  <button
                    onClick={()=>launchSavedQuiz(sq)}
                    disabled={loading}
                    style={{display:"flex",alignItems:"center",gap:8,padding:"10px 22px",borderRadius:12,border:"none",background:`linear-gradient(135deg,${GOLD},${GOLD2})`,color:"#fff",fontWeight:900,fontSize:14,cursor:loading?"not-allowed":"pointer",opacity:loading?0.6:1,boxShadow:`0 4px 16px rgba(201,146,42,0.35)`,fontFamily:"'Playfair Display',serif"}}>
                    <Play size={15}/> {loading ? "Launching…" : "Launch →"}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}

        <div style={{marginTop:4,textAlign:"center"}}>
          <button onClick={()=>setView("creating")} style={{...outlineBtn, fontSize:13, padding:"12px"}}>
            + Create New Quiz
          </button>
        </div>
      </div>
    </div>
  );

  /* ══ EDIT SAVED QUIZ ════════════════════════════════ */
  if (view === "edit-quiz") return (
    <div style={{...pageStyle, padding:"0 0 60px", overflowY:"auto"}}>
      <IslamicBg opacity={0.08}/>
      {/* Sticky header */}
      <div style={{position:"sticky",top:0,zIndex:10,background:"rgba(6,20,14,0.97)",backdropFilter:"blur(14px)",borderBottom:"1px solid rgba(201,146,42,0.2)",padding:"14px 18px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={()=>setView("saved-quizzes")} style={{...backBtn,margin:0}}>← Back</button>
        <div style={{flex:1,textAlign:"center"}}>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:20,color:"#fff",margin:0}}>Edit Quiz</h2>
        </div>
        <button
          onClick={saveEditedQuiz}
          disabled={!editName.trim() || editQs.length === 0}
          style={{padding:"8px 18px",borderRadius:12,border:"none",background:editName.trim()&&editQs.length>0?`linear-gradient(135deg,${GOLD},${GOLD2})`:"rgba(255,255,255,0.08)",color:editName.trim()&&editQs.length>0?"#fff":"rgba(255,255,255,0.3)",fontWeight:800,fontSize:13,cursor:editName.trim()&&editQs.length>0?"pointer":"not-allowed",flexShrink:0}}>
          Save
        </button>
      </div>

      <div style={{position:"relative",zIndex:1,maxWidth:480,margin:"0 auto",padding:"20px 18px",display:"flex",flexDirection:"column",gap:18}}>

        {/* ── Quiz Name ── */}
        <div style={{...glassCard, display:"flex", flexDirection:"column", gap:10}}>
          <label style={{fontSize:11,fontWeight:700,color:GOLD,letterSpacing:1.5,textTransform:"uppercase" as const}}>📋 Quiz Name</label>
          <input
            value={editName}
            onChange={e=>setEditName(e.target.value)}
            placeholder="Quiz name…"
            style={{width:"100%",padding:"12px 14px",borderRadius:11,border:`1.5px solid rgba(201,146,42,0.35)`,background:"rgba(255,255,255,0.06)",color:"#fff",fontSize:14,outline:"none",boxSizing:"border-box" as const,fontFamily:"inherit"}}
          />
        </div>

        {/* ── Settings ── */}
        <div style={{...glassCard, display:"flex", flexDirection:"column", gap:14}}>
          <p style={{fontSize:11,fontWeight:700,color:GOLD,letterSpacing:1.5,textTransform:"uppercase" as const,margin:0}}>⚙️ Settings</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <label style={{fontSize:11,color:"rgba(255,255,255,0.5)",display:"block",marginBottom:5}}>Secs / Question</label>
              <input type="number" min={5} max={120} value={editSettings.timeQ}
                onChange={e=>setEditSettings(s=>({...s,timeQ:parseInt(e.target.value)||20}))}
                style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1.5px solid rgba(201,146,42,0.3)`,background:"rgba(255,255,255,0.06)",color:"#fff",fontSize:15,fontWeight:700,outline:"none",boxSizing:"border-box" as const}}/>
            </div>
            <div>
              <label style={{fontSize:11,color:"rgba(255,255,255,0.5)",display:"block",marginBottom:5}}># Qs to Launch</label>
              <input type="number" min={1} max={editQs.length} value={editSettings.numQ}
                onChange={e=>setEditSettings(s=>({...s,numQ:Math.min(editQs.length,parseInt(e.target.value)||10)}))}
                style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1.5px solid rgba(201,146,42,0.3)`,background:"rgba(255,255,255,0.06)",color:"#fff",fontSize:15,fontWeight:700,outline:"none",boxSizing:"border-box" as const}}/>
            </div>
          </div>
          <div>
            <label style={{fontSize:11,color:"rgba(255,255,255,0.5)",display:"block",marginBottom:5}}>Topic</label>
            <select value={editSettings.topic} onChange={e=>setEditSettings(s=>({...s,topic:e.target.value}))}
              style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1.5px solid rgba(201,146,42,0.3)`,background:"rgba(6,20,14,0.9)",color:"#fff",fontSize:14,outline:"none",boxSizing:"border-box" as const}}>
              {TOPICS.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* ── Questions ── */}
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <p style={{fontSize:13,fontWeight:800,color:"#fff",margin:0}}>{editQs.length} Question{editQs.length!==1?"s":""}</p>
            <button onClick={addEditQ}
              style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:10,border:`1.5px solid rgba(201,146,42,0.4)`,background:"rgba(201,146,42,0.08)",color:GOLD,fontWeight:700,fontSize:12,cursor:"pointer"}}>
              <Plus size={13}/> Add Question
            </button>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {editQs.map((q, idx) => {
              const isOpen = expandedEditQ === idx;
              const isValid = q.question.trim() && q.options.filter(o=>o.trim()).length >= 2 && q.correct_answer.trim();
              return (
                <div key={idx} style={{background:"rgba(255,255,255,0.04)",border:`1.5px solid ${isOpen?"rgba(201,146,42,0.5)":"rgba(255,255,255,0.08)"}`,borderRadius:16,overflow:"hidden",transition:"border-color .2s"}}>
                  {/* Question header (always visible) */}
                  <div
                    onClick={()=>setExpandedEditQ(isOpen ? null : idx)}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",cursor:"pointer",userSelect:"none" as const}}>
                    <span style={{width:24,height:24,borderRadius:8,background:`rgba(201,146,42,0.15)`,border:`1px solid rgba(201,146,42,0.3)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:GOLD,flexShrink:0}}>{idx+1}</span>
                    <p style={{flex:1,margin:0,fontSize:13,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const,opacity:q.question.trim()?1:0.35}}>
                      {q.question.trim() || "Untitled question…"}
                    </p>
                    <span style={{fontSize:10,color:isValid?"#22C55E":"rgba(239,68,68,0.6)",flexShrink:0,fontWeight:700}}>{isValid?"✓":"!"}</span>
                    {isOpen ? <ChevronUp size={14} color="rgba(255,255,255,0.4)"/> : <ChevronDown size={14} color="rgba(255,255,255,0.3)"/>}
                  </div>

                  {/* Expanded editor */}
                  {isOpen && (
                    <div style={{padding:"0 14px 16px",display:"flex",flexDirection:"column",gap:12,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
                      {/* Question text */}
                      <div style={{paddingTop:12}}>
                        <label style={{fontSize:10,fontWeight:700,color:GOLD,display:"block",marginBottom:5,letterSpacing:1.2,textTransform:"uppercase" as const}}>Question Text</label>
                        <textarea
                          value={q.question}
                          onChange={e=>updateEditQ(idx,{question:e.target.value})}
                          rows={2}
                          placeholder="Enter question…"
                          style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1.5px solid rgba(201,146,42,0.3)`,background:"rgba(255,255,255,0.06)",color:"#fff",fontSize:13,outline:"none",boxSizing:"border-box" as const,fontFamily:"inherit",resize:"vertical" as const}}
                        />
                      </div>

                      {/* Options */}
                      <div>
                        <label style={{fontSize:10,fontWeight:700,color:GOLD,display:"block",marginBottom:8,letterSpacing:1.2,textTransform:"uppercase" as const}}>Options (mark correct with ✓)</label>
                        <div style={{display:"flex",flexDirection:"column",gap:7}}>
                          {["A","B","C","D"].map((lbl,oi)=>{
                            const isCorrect = q.correct_answer === q.options[oi];
                            return (
                              <div key={lbl} style={{display:"flex",alignItems:"center",gap:8}}>
                                <button
                                  onClick={()=>updateEditQ(idx,{correct_answer:q.options[oi]})}
                                  title="Mark as correct"
                                  style={{width:28,height:28,borderRadius:8,border:`2px solid ${isCorrect?"#22C55E":"rgba(255,255,255,0.2)"}`,background:isCorrect?"rgba(34,197,94,0.2)":"transparent",color:isCorrect?"#22C55E":"rgba(255,255,255,0.3)",cursor:"pointer",fontSize:12,fontWeight:800,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s"}}>
                                  {isCorrect?"✓":lbl}
                                </button>
                                <input
                                  value={q.options[oi]||""}
                                  onChange={e=>{
                                    const newOpts = [...q.options];
                                    const oldOpt = newOpts[oi];
                                    newOpts[oi] = e.target.value;
                                    const newCorrect = q.correct_answer === oldOpt ? e.target.value : q.correct_answer;
                                    updateEditQ(idx,{options:newOpts,correct_answer:newCorrect});
                                  }}
                                  placeholder={`Option ${lbl}…`}
                                  style={{flex:1,padding:"8px 11px",borderRadius:9,border:`1.5px solid ${isCorrect?"rgba(34,197,94,0.4)":"rgba(255,255,255,0.12)"}`,background:"rgba(255,255,255,0.05)",color:"#fff",fontSize:13,outline:"none",boxSizing:"border-box" as const,fontFamily:"inherit"}}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Explanation */}
                      <div>
                        <label style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.4)",display:"block",marginBottom:5,letterSpacing:1.2,textTransform:"uppercase" as const}}>Explanation (optional)</label>
                        <input
                          value={q.explanation||""}
                          onChange={e=>updateEditQ(idx,{explanation:e.target.value})}
                          placeholder="Brief explanation shown after answer…"
                          style={{width:"100%",padding:"9px 11px",borderRadius:9,border:`1.5px solid rgba(255,255,255,0.1)`,background:"rgba(255,255,255,0.04)",color:"rgba(255,255,255,0.7)",fontSize:12,outline:"none",boxSizing:"border-box" as const,fontFamily:"inherit"}}
                        />
                      </div>

                      {/* Delete question */}
                      <button onClick={()=>deleteEditQ(idx)}
                        style={{display:"flex",alignItems:"center",gap:6,alignSelf:"flex-start" as const,padding:"7px 12px",borderRadius:9,border:"1px solid rgba(239,68,68,0.3)",background:"rgba(239,68,68,0.07)",color:"rgba(239,68,68,0.7)",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                        <Trash2 size={12}/> Remove Question
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {editQs.length === 0 && (
            <div style={{textAlign:"center",padding:"32px 24px",background:"rgba(255,255,255,0.02)",borderRadius:16,border:"1px solid rgba(255,255,255,0.06)"}}>
              <p style={{fontSize:13,color:"rgba(255,255,255,0.3)",margin:0}}>No questions yet — tap "Add Question" above</p>
            </div>
          )}
        </div>

        {/* Save button */}
        <button
          onClick={saveEditedQuiz}
          disabled={!editName.trim() || editQs.length === 0}
          style={{...goldBtn, opacity:editName.trim()&&editQs.length>0?1:0.45, cursor:editName.trim()&&editQs.length>0?"pointer":"not-allowed", marginTop:4}}>
          💾 Save Changes ({editQs.length} question{editQs.length!==1?"s":""})
        </button>
      </div>
    </div>
  );

  /* ══ HUB ══════════════════════════════════════════ */
  if (view === "hub") return (
    <div style={{...pageStyle, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 20px", position:"relative"}}>
      <IslamicBg opacity={0.09}/>
      {/* Back arrow — top left */}
      <button
        onClick={() => navigate(-1)}
        style={{ position:"absolute", top:16, left:16, zIndex:10, display:"flex", alignItems:"center", gap:6, background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.18)", borderRadius:12, padding:"8px 14px", color:"rgba(255,255,255,0.85)", fontWeight:700, fontSize:13, cursor:"pointer", backdropFilter:"blur(8px)" }}>
        ← {isHost ? "Dashboard" : "Back"}
      </button>
      <div style={{position:"relative",zIndex:1,width:"100%",maxWidth:420,textAlign:"center"}}>

        {/* Logo */}
        <div style={{width:80,height:80,borderRadius:24,background:`linear-gradient(135deg,${GOLD},${GOLD2})`,display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:16,boxShadow:`0 8px 32px rgba(201,146,42,0.5)`}}>
          <span style={{fontSize:38}}>🏆</span>
        </div>
        <h1 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:36,color:"#fff",margin:"0 0 4px",letterSpacing:-1}}>
          Al-Musabaqah
        </h1>
        <p style={{fontSize:18,color:GOLD,fontWeight:700,margin:"0 0 4px",fontFamily:"'Amiri',serif",letterSpacing:2}}>
          المسابقة الحية
        </p>
        <p style={{fontSize:13,color:"rgba(255,255,255,0.45)",marginBottom:32,letterSpacing:1}}>
          LIVE ISLAMIC QUIZ ARENA
        </p>

        {divider}

        <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:32}}>
          <button onClick={()=>setView("joining")} style={outlineBtn}>
            <Zap size={18} color={GOLD}/> Join a Quiz
          </button>
          {isHost && (
            <>
              <button onClick={()=>setView("creating")} style={goldBtn}>
                <Crown size={18}/> Host a Quiz
              </button>
              {savedQuizzes.length > 0 && (
                <button onClick={()=>setView("saved-quizzes")} style={{...outlineBtn, borderColor:`rgba(201,146,42,0.5)`}}>
                  <BookOpen size={18} color={GOLD}/> Saved Quizzes ({savedQuizzes.length})
                </button>
              )}
            </>
          )}
        </div>

        {/* Stats row */}
        <div style={{display:"flex",gap:0,background:"rgba(255,255,255,0.04)",borderRadius:16,border:`1px solid rgba(201,146,42,0.15)`,overflow:"hidden"}}>
          {[{v:"15+",l:"Questions"},{v:"Live",l:"Real-time"},{v:"∞",l:"Players"}].map((s,i)=>(
            <div key={s.l} style={{flex:1,textAlign:"center",padding:"14px 8px",borderRight:i<2?`1px solid rgba(201,146,42,0.15)`:"none"}}>
              <p style={{fontSize:20,fontWeight:900,color:GOLD,margin:0}}>{s.v}</p>
              <p style={{fontSize:11,color:"rgba(255,255,255,0.4)",margin:0,letterSpacing:0.5}}>{s.l}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  /* ══ JOINING ══════════════════════════════════════ */
  if (view === "joining") return (
    <div style={{...pageStyle, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"30px 20px"}}>
      <IslamicBg opacity={0.08}/>
      <div style={{position:"relative",zIndex:1,width:"100%",maxWidth:420}}>
        <button onClick={()=>setView("hub")} style={backBtn}>← Back</button>
        <div style={glassCard}>
          <div style={{textAlign:"center",marginBottom:26}}>
            <div style={{fontSize:40,marginBottom:8}}>🎯</div>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:24,color:"#fff",margin:"0 0 6px"}}>Join Quiz</h2>
            <p style={{fontSize:13,color:"rgba(255,255,255,0.45)",margin:0}}>Enter the code from your teacher</p>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:GOLD,display:"block",marginBottom:6,letterSpacing:1.5,textTransform:"uppercase"}}>Your Name</label>
              <input value={playerName} onChange={e=>setPlayerName(e.target.value)} placeholder="e.g. Abdullah" maxLength={20}
                style={{width:"100%",padding:"13px 16px",borderRadius:12,border:`1.5px solid rgba(201,146,42,0.3)`,background:"rgba(255,255,255,0.06)",color:"#fff",fontSize:15,fontWeight:600,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:GOLD,display:"block",marginBottom:6,letterSpacing:1.5,textTransform:"uppercase"}}>Room Code</label>
              <input value={joinCode} onChange={e=>setJoinCode(e.target.value)} placeholder="000000" maxLength={6} inputMode="numeric"
                style={{width:"100%",padding:"14px 16px",borderRadius:12,border:`2px solid ${joinCode.length===6?GOLD:"rgba(201,146,42,0.3)"}`,background:"rgba(255,255,255,0.06)",color:GOLD,fontSize:28,fontWeight:900,outline:"none",letterSpacing:8,textAlign:"center",boxSizing:"border-box",transition:"border-color .2s"}}/>
            </div>
            <button onClick={joinRoom} disabled={!joinCode.trim()||!playerName.trim()||loading}
              style={{...goldBtn, opacity:joinCode.trim()&&playerName.trim()?1:0.4, cursor:joinCode.trim()&&playerName.trim()?"pointer":"not-allowed"}}>
              {loading ? "Joining…" : "Enter Room →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  /* ══ CREATING — Combined Setup (Questions + Settings) ══ */
  if (view === "creating" || view === "q-source") return (
    <div style={{...pageStyle, padding:"0 0 40px", overflowY:"auto"}}>
      <IslamicBg opacity={0.08}/>

      {/* Sticky header */}
      <div style={{position:"sticky",top:0,zIndex:10,background:"rgba(6,20,14,0.95)",backdropFilter:"blur(12px)",borderBottom:"1px solid rgba(201,146,42,0.2)",padding:"14px 18px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={()=>setView("hub")} style={{...backBtn,margin:0}}>← Back</button>
        <div style={{flex:1,textAlign:"center"}}>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:20,color:"#fff",margin:0}}>Setup Quiz</h2>
        </div>
        <div style={{width:50}}/>
      </div>

      <div style={{position:"relative",zIndex:1,maxWidth:460,margin:"0 auto",padding:"20px 18px",display:"flex",flexDirection:"column",gap:20}}>

        {/* ── SECTION 0: Quiz Name ── */}
        <div style={{...glassCard, display:"flex", flexDirection:"column", gap:10}}>
          <label style={{fontSize:11,fontWeight:700,color:GOLD,letterSpacing:1.5,textTransform:"uppercase" as const}}>📋 Quiz Name</label>
          <input
            value={quizName}
            onChange={e=>setQuizName(e.target.value)}
            placeholder="e.g. Tajweed Class — Noon Sakin Rules"
            style={{width:"100%",padding:"12px 14px",borderRadius:11,border:`1.5px solid rgba(201,146,42,0.35)`,background:"rgba(255,255,255,0.06)",color:"#fff",fontSize:14,outline:"none",boxSizing:"border-box" as const,fontFamily:"inherit"}}
          />
          <p style={{fontSize:11,color:"rgba(255,255,255,0.3)",margin:0}}>Shown to students in the lobby. Pre-filled from the class name when coming from a live class.</p>
        </div>

        {/* ── SECTION 1: Question Source ── */}
        <div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <div style={{width:32,height:32,borderRadius:10,background:`linear-gradient(135deg,${GOLD},${GOLD2})`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 4px 12px rgba(201,146,42,0.4)`}}>
              <BookOpen size={16} color="#fff"/>
            </div>
            <div>
              <p style={{fontSize:16,fontWeight:900,color:"#fff",margin:0}}>Questions</p>
              <p style={{fontSize:11,color:"rgba(255,255,255,0.4)",margin:0}}>Choose how to add your questions</p>
            </div>
            {customQs.length > 0 && (
              <span style={{marginLeft:"auto",fontSize:12,fontWeight:800,color:GOLD,background:"rgba(201,146,42,0.15)",padding:"4px 12px",borderRadius:20,border:`1px solid rgba(201,146,42,0.3)`}}>
                ✓ {customQs.length} ready
              </span>
            )}
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {[
              { id:"builtin", icon:"🕌", label:"Built-in Islamic Pool",  desc:"15+ ready-made questions",           action:()=>{ setCustomQs([]); setView("q-preview"); } },
              { id:"ai",      icon:"🤖", label:"AI Generated",            desc:"AI generates by topic",       action:()=>setView("q-ai") },
              { id:"bank",    icon:"🏦", label:"Question Bank",           desc:"Import from your published exams",   action:()=>{ loadBankExams(); setView("q-bank"); } },
              { id:"upload",  icon:"📁", label:"Upload CSV / JSON",       desc:"Upload a file of questions",         action:()=>setView("q-upload") },
              { id:"manual",  icon:"✍️", label:"Type Manually",           desc:"Add questions one by one",           action:()=>{ setCustomQs([]); setView("q-manual"); } },
            ].map(s=>(
              <button key={s.id} onClick={s.action}
                style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",borderRadius:14,border:`1.5px solid rgba(201,146,42,0.25)`,background:"rgba(255,255,255,0.04)",cursor:"pointer",textAlign:"left" as const,transition:"all .15s",width:"100%"}}
                onMouseEnter={e=>{(e.currentTarget as any).style.borderColor=GOLD;(e.currentTarget as any).style.background="rgba(201,146,42,0.1)";}}
                onMouseLeave={e=>{(e.currentTarget as any).style.borderColor="rgba(201,146,42,0.25)";(e.currentTarget as any).style.background="rgba(255,255,255,0.04)";}}>
                <span style={{fontSize:26,flexShrink:0,width:36,textAlign:"center" as const}}>{s.icon}</span>
                <div style={{flex:1}}>
                  <p style={{fontSize:14,fontWeight:800,color:"#fff",margin:"0 0 2px"}}>{s.label}</p>
                  <p style={{fontSize:11,color:"rgba(255,255,255,0.4)",margin:0}}>{s.desc}</p>
                </div>
                <ArrowRight size={14} color={GOLD}/>
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{flex:1,height:1,background:"rgba(201,146,42,0.15)"}}/>
          <Star size={10} color={GOLD} fill={GOLD}/>
          <div style={{flex:1,height:1,background:"rgba(201,146,42,0.15)"}}/>
        </div>

        {/* ── SECTION 2: Settings ── */}
        <div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <div style={{width:32,height:32,borderRadius:10,background:"rgba(255,255,255,0.08)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,border:"1px solid rgba(255,255,255,0.12)"}}>
              <Zap size={15} color={GOLD}/>
            </div>
            <div>
              <p style={{fontSize:16,fontWeight:900,color:"#fff",margin:0}}>Settings</p>
              <p style={{fontSize:11,color:"rgba(255,255,255,0.4)",margin:0}}>Adjust timing and topic</p>
            </div>
          </div>

          <div style={{...glassCard, display:"flex", flexDirection:"column", gap:18}}>
            {/* Topic */}
            <div>
              <label style={{fontSize:11,fontWeight:700,color:GOLD,display:"block",marginBottom:8,letterSpacing:1.5,textTransform:"uppercase" as const}}>Topic</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {TOPICS.map(t=>(
                  <button key={t} onClick={()=>setSettings(p=>({...p,topic:t}))}
                    style={{padding:"7px 12px",borderRadius:20,border:`1.5px solid ${settings.topic===t?GOLD:"rgba(255,255,255,0.12)"}`,background:settings.topic===t?"rgba(201,146,42,0.18)":"transparent",color:settings.topic===t?GOLD:"rgba(255,255,255,0.5)",cursor:"pointer",fontSize:12,fontWeight:700,transition:"all .15s"}}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Questions count */}
            <div>
              <label style={{fontSize:11,fontWeight:700,color:GOLD,display:"block",marginBottom:8,letterSpacing:1.5,textTransform:"uppercase" as const}}>Number of Questions</label>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {[5,10,15,20].map(n=>(
                  <button key={n} onClick={()=>setSettings(p=>({...p,numQ:n}))}
                    style={{flex:1,padding:"10px",borderRadius:10,border:`1.5px solid ${settings.numQ===n?GOLD:"rgba(255,255,255,0.12)"}`,background:settings.numQ===n?"rgba(201,146,42,0.18)":"transparent",color:settings.numQ===n?GOLD:"rgba(255,255,255,0.5)",cursor:"pointer",fontWeight:800,fontSize:15,transition:"all .15s"}}>
                    {n}
                  </button>
                ))}
                <input
                  type="number" min={1} max={100}
                  value={settings.numQ}
                  onChange={e=>{const v=parseInt(e.target.value)||1; setSettings(p=>({...p,numQ:Math.max(1,v)}));}}
                  style={{width:64,padding:"10px 8px",borderRadius:10,border:`1.5px solid rgba(201,146,42,0.4)`,background:"rgba(255,255,255,0.07)",color:GOLD,fontWeight:800,fontSize:15,outline:"none",textAlign:"center",fontFamily:"inherit"}}
                />
              </div>
              <p style={{fontSize:11,color:"rgba(255,255,255,0.3)",margin:"6px 0 0"}}>Or type any number in the box →</p>
            </div>

            {/* Time per Q */}
            <div>
              <label style={{fontSize:11,fontWeight:700,color:GOLD,display:"block",marginBottom:8,letterSpacing:1.5,textTransform:"uppercase" as const}}>Time Per Question</label>
              <div style={{display:"flex",gap:8}}>
                {[10,15,20,30].map(n=>(
                  <button key={n} onClick={()=>setSettings(p=>({...p,timeQ:n}))}
                    style={{flex:1,padding:"10px",borderRadius:10,border:`1.5px solid ${settings.timeQ===n?GOLD:"rgba(255,255,255,0.12)"}`,background:settings.timeQ===n?"rgba(201,146,42,0.18)":"transparent",color:settings.timeQ===n?GOLD:"rgba(255,255,255,0.5)",cursor:"pointer",fontWeight:800,fontSize:14,transition:"all .15s"}}>
                    {n}s
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Summary + Go to Preview (only when custom questions loaded) ── */}
        {customQs.length > 0 && (
          <div>
            <div style={{background:"rgba(201,146,42,0.1)",borderRadius:14,padding:"14px 16px",border:`1px solid rgba(201,146,42,0.3)`,marginBottom:12}}>
              <p style={{fontSize:13,color:"rgba(255,255,255,0.7)",margin:0}}>
                ✅ <strong style={{color:GOLD}}>{customQs.length} questions</strong> ready · <strong style={{color:"#fff"}}>{settings.topic}</strong> · <strong style={{color:"#fff"}}>{settings.timeQ}s</strong> each
              </p>
            </div>
            <button onClick={()=>setView("q-preview")} style={goldBtn}>
              <Eye size={18}/> Preview & Launch →
            </button>
          </div>
        )}
      </div>
    </div>
  );

  /* ══ Q-AI — AI question generator ════════════════ */
  if (view === "q-ai") return (
    <div style={{...pageStyle, padding:"28px 18px", overflowY:"auto"}}>
      <IslamicBg opacity={0.08}/>
      <div style={{position:"relative",zIndex:1,maxWidth:440,margin:"0 auto"}}>
        <button onClick={()=>setView("creating")} style={backBtn}>← Back</button>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
          <span style={{fontSize:24}}>🤖</span>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:26,color:"#fff",margin:0}}>AI Generator</h2>
        </div>
        <p style={{fontSize:13,color:"rgba(255,255,255,0.4)",marginBottom:22}}>AI will create {settings.numQ} questions instantly</p>
        <div style={{...glassCard, display:"flex", flexDirection:"column", gap:16}}>
          <div>
            <label style={{fontSize:11,fontWeight:700,color:GOLD,display:"block",marginBottom:8,letterSpacing:1.5,textTransform:"uppercase"}}>Topic or concept</label>
            <input value={aiTopic} onChange={e=>setAiTopic(e.target.value)}
              placeholder="e.g. Noon Sakin rules, Arabic vocabulary, Pillars of Islam…"
              style={{width:"100%",padding:"13px 16px",borderRadius:12,border:`1.5px solid rgba(201,146,42,0.3)`,background:"rgba(255,255,255,0.06)",color:"#fff",fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
          </div>
          <div style={{background:"rgba(201,146,42,0.08)",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(201,146,42,0.2)"}}>
            <p style={{fontSize:12,color:GOLD,fontWeight:700,margin:"0 0 6px"}}>💡 Tips for better questions:</p>
            <p style={{fontSize:11,color:"rgba(255,255,255,0.5)",margin:0,lineHeight:1.8}}>
              • Be specific: "Noon Sakin rules" not "Tajweed"<br/>
              • Add level: "beginner Arabic vocabulary"<br/>
              • Reference topic: "Surah Al-Baqarah themes"
            </p>
          </div>
          <button onClick={generateAiQs} disabled={!aiTopic.trim()||aiLoading}
            style={{...goldBtn, opacity:aiTopic.trim()?1:0.4, cursor:aiTopic.trim()?"pointer":"not-allowed"}}>
            {aiLoading ? <><span style={{animation:"spin .8s linear infinite",display:"inline-block"}}>⏳</span> Generating…</> : <><Sparkles size={16}/> Generate {settings.numQ} Questions</>}
          </button>
        </div>
      </div>
    </div>
  );

  /* ══ Q-BANK — Import from Question Bank ══════════ */
  if (view === "q-bank") return (
    <div style={{...pageStyle, padding:"28px 18px", overflowY:"auto"}}>
      <IslamicBg opacity={0.08}/>
      <div style={{position:"relative",zIndex:1,maxWidth:480,margin:"0 auto"}}>
        <button onClick={()=>setView("creating")} style={backBtn}>← Back</button>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
          <span style={{fontSize:24}}>🏦</span>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:26,color:"#fff",margin:0}}>Question Bank</h2>
        </div>
        <p style={{fontSize:13,color:"rgba(255,255,255,0.4)",marginBottom:20}}>Import MCQ questions from your published exams</p>

        {/* Exam picker */}
        <div style={{...glassCard, marginBottom:14}}>
          <label style={{fontSize:11,fontWeight:700,color:GOLD,display:"block",marginBottom:10,letterSpacing:1.5,textTransform:"uppercase"}}>Select Exam</label>
          {bankExams.length === 0 ? (
            <p style={{fontSize:13,color:"rgba(255,255,255,0.35)",margin:0,textAlign:"center",padding:"12px 0"}}>No published exams found</p>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {bankExams.map(e=>(
                <button key={e.id} onClick={()=>loadBankQs(e.id)}
                  style={{padding:"11px 14px",borderRadius:10,border:`1.5px solid ${selBankExam===e.id?GOLD:"rgba(255,255,255,0.1)"}`,background:selBankExam===e.id?"rgba(201,146,42,0.12)":"rgba(255,255,255,0.03)",color:selBankExam===e.id?GOLD:"rgba(255,255,255,0.7)",cursor:"pointer",fontWeight:700,fontSize:13,textAlign:"left",transition:"all .15s"}}>
                  📋 {e.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Questions from selected exam */}
        {bankQs.length > 0 && (
          <div style={{...glassCard, marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <p style={{fontSize:12,color:GOLD,fontWeight:700,margin:0,letterSpacing:1,textTransform:"uppercase"}}>{bankQs.length} MCQ questions found</p>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:200,overflowY:"auto"}}>
              {bankQs.slice(0,8).map((q,i)=>(
                <div key={i} style={{padding:"8px 12px",borderRadius:8,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)"}}>
                  <p style={{fontSize:12,color:"rgba(255,255,255,0.7)",margin:0,lineHeight:1.4}}>{i+1}. {q.question.slice(0,80)}{q.question.length>80?"…":""}</p>
                </div>
              ))}
              {bankQs.length > 8 && <p style={{fontSize:11,color:"rgba(255,255,255,0.3)",textAlign:"center",margin:"4px 0 0"}}>+{bankQs.length-8} more questions</p>}
            </div>
            <button onClick={()=>{ setCustomQs(bankQs.slice(0,settings.numQ)); setView("q-preview"); }}
              style={{...goldBtn, marginTop:12}}>
              Use These {Math.min(bankQs.length,settings.numQ)} Questions →
            </button>
          </div>
        )}
      </div>
    </div>
  );

  /* ══ Q-UPLOAD — Upload CSV/JSON ══════════════════ */
  if (view === "q-upload") return (
    <div style={{...pageStyle, padding:"28px 18px", overflowY:"auto"}}>
      <IslamicBg opacity={0.08}/>
      <div style={{position:"relative",zIndex:1,maxWidth:440,margin:"0 auto"}}>
        <button onClick={()=>setView("creating")} style={backBtn}>← Back</button>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
          <span style={{fontSize:24}}>📁</span>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:26,color:"#fff",margin:0}}>Upload Questions</h2>
        </div>
        <p style={{fontSize:13,color:"rgba(255,255,255,0.4)",marginBottom:22}}>Upload a CSV or JSON file</p>

        <div style={{...glassCard, display:"flex", flexDirection:"column", gap:16}}>
          {/* Drop zone */}
          <label style={{display:"block",cursor:"pointer"}}>
            <div style={{border:`2px dashed rgba(201,146,42,0.4)`,borderRadius:16,padding:"32px 20px",textAlign:"center",background:"rgba(201,146,42,0.04)",transition:"all .2s"}}>
              <div style={{fontSize:40,marginBottom:10}}>📤</div>
              <p style={{fontSize:14,fontWeight:700,color:"#fff",margin:"0 0 4px"}}>Tap to select file</p>
              <p style={{fontSize:12,color:"rgba(255,255,255,0.4)",margin:0}}>Supports .csv and .json files</p>
            </div>
            <input type="file" accept=".csv,.json" onChange={handleUpload} style={{display:"none"}}/>
          </label>

          {uploadError && (
            <div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:10,padding:"10px 14px"}}>
              <p style={{fontSize:12,color:"#EF4444",margin:0}}>⚠️ {uploadError}</p>
            </div>
          )}

          {/* CSV template */}
          <div style={{background:"rgba(255,255,255,0.03)",borderRadius:12,padding:"14px",border:"1px solid rgba(255,255,255,0.08)"}}>
            <p style={{fontSize:11,color:GOLD,fontWeight:700,margin:"0 0 8px",letterSpacing:1.5,textTransform:"uppercase"}}>CSV Format</p>
            <code style={{fontSize:10,color:"rgba(255,255,255,0.5)",lineHeight:1.8,display:"block",whiteSpace:"pre-wrap"}}>{"question,optA,optB,optC,optD,correct_answer,explanation\nHow many Surahs?,110,112,114,116,114,The Quran has 114 Surahs"}</code>
          </div>

          {/* JSON template */}
          <div style={{background:"rgba(255,255,255,0.03)",borderRadius:12,padding:"14px",border:"1px solid rgba(255,255,255,0.08)"}}>
            <p style={{fontSize:11,color:GOLD,fontWeight:700,margin:"0 0 8px",letterSpacing:1.5,textTransform:"uppercase"}}>JSON Format</p>
            <code style={{fontSize:10,color:"rgba(255,255,255,0.5)",lineHeight:1.8,display:"block",whiteSpace:"pre-wrap"}}>{'[{"question":"...","options":["A","B","C","D"],"correct_answer":"A","explanation":"..."}]'}</code>
          </div>
        </div>
      </div>
    </div>
  );

  /* ══ Q-MANUAL — Manual question entry ════════════ */
  if (view === "q-manual") return (
    <div style={{...pageStyle, padding:"28px 18px", overflowY:"auto"}}>
      <IslamicBg opacity={0.08}/>
      <div style={{position:"relative",zIndex:1,maxWidth:480,margin:"0 auto"}}>
        <button onClick={()=>setView("creating")} style={backBtn}>← Back</button>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
          <span style={{fontSize:24}}>✍️</span>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:26,color:"#fff",margin:0}}>Bulk Entry</h2>
        </div>
        <p style={{fontSize:13,color:"rgba(255,255,255,0.4)",marginBottom:20}}>Paste all your questions at once using the format below</p>

        {/* Format example */}
        <div style={{background:"rgba(201,146,42,0.08)",border:"1px solid rgba(201,146,42,0.25)",borderRadius:14,padding:"14px 16px",marginBottom:16}}>
          <p style={{fontSize:11,fontWeight:700,color:GOLD,margin:"0 0 8px",letterSpacing:1.2}}>📐 FORMAT — copy this pattern:</p>
          <pre style={{fontSize:11,color:"rgba(255,255,255,0.65)",margin:0,lineHeight:1.9,fontFamily:"'Courier New',monospace",whiteSpace:"pre-wrap" as const}}>{`Q: What is the first pillar of Islam?
A: Salah
B: Shahada*
C: Zakat
D: Hajj
Note: The Shahada is the declaration of faith.
---
Q: How many Surahs are in the Quran?
A: 110
B: 112
C: 114*
D: 116
Note: The Quran has 114 Surahs.
---`}</pre>
          <p style={{fontSize:10,color:"rgba(255,255,255,0.35)",margin:"8px 0 0",lineHeight:1.6}}>
            • Add <strong style={{color:GOLD}}>*</strong> after the correct option (e.g. <code style={{color:GOLD}}>B: Answer*</code>)<br/>
            • Separate questions with <strong style={{color:GOLD}}>---</strong> on its own line<br/>
            • <code style={{color:"rgba(255,255,255,0.5)"}}>Note:</code> line is optional
          </p>
        </div>

        {/* Paste box */}
        <div style={{...glassCard, display:"flex", flexDirection:"column", gap:12}}>
          <label style={{fontSize:11,fontWeight:700,color:GOLD,letterSpacing:1.5,textTransform:"uppercase" as const}}>Paste Questions Here</label>
          <textarea
            value={bulkText}
            onChange={e=>{ setBulkText(e.target.value); setBulkError(""); }}
            onInput={e=>{ const v=(e.target as HTMLTextAreaElement).value; if(v!==bulkText){ setBulkText(v); setBulkError(""); } }}
            onPaste={e=>{ e.preventDefault(); const txt=e.clipboardData.getData("text/plain"); const cur=(e.target as HTMLTextAreaElement); const start=cur.selectionStart??0; const end=cur.selectionEnd??cur.value.length; const next=cur.value.slice(0,start)+txt+cur.value.slice(end); setBulkText(next); setBulkError(""); }}
            placeholder={"Q: What is the first pillar of Islam?\nA: Salah\nB: Shahada*\nC: Zakat\nD: Hajj\nNote: The Shahada is the declaration of faith.\n---\nQ: Next question..."}
            style={{width:"100%",padding:"13px 14px",borderRadius:11,border:`1.5px solid rgba(201,146,42,0.3)`,background:"rgba(255,255,255,0.05)",color:"#fff",fontSize:12,outline:"none",boxSizing:"border-box" as const,fontFamily:"'Courier New',monospace",lineHeight:1.8,minHeight:280,resize:"vertical" as const}}
          />
          {bulkError && (
            <div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:10,padding:"10px 14px"}}>
              <p style={{fontSize:12,color:"#f87171",margin:0}}>⚠️ {bulkError}</p>
            </div>
          )}
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>{ setBulkText(""); setBulkError(""); }} disabled={!bulkText.trim()}
              style={{padding:"13px 18px",borderRadius:12,border:"1.5px solid rgba(239,68,68,0.4)",background:"transparent",color:"rgba(239,68,68,0.7)",cursor:bulkText.trim()?"pointer":"not-allowed",fontSize:13,fontWeight:700,opacity:bulkText.trim()?1:0.4}}>
              Clear
            </button>
            <button onClick={handleBulkParse} disabled={!bulkText.trim()}
              style={{...goldBtn, flex:1, opacity:bulkText.trim()?1:0.4, cursor:bulkText.trim()?"pointer":"not-allowed"}}>
              <Eye size={16}/> Parse &amp; Preview →
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  /* ══ Q-PREVIEW — Review before creating room ══════ */
  if (view === "q-preview") {
    const previewList = customQs.length > 0 ? customQs : 
      (settings.topic==="All Topics"?POOL:POOL.filter(q=>q.topic===settings.topic))
        .sort(()=>Math.random()-0.5).slice(0,settings.numQ);
    return (
      <div style={{...pageStyle, padding:"24px 18px", overflowY:"auto"}}>
        <IslamicBg opacity={0.08}/>
        <div style={{position:"relative",zIndex:1,maxWidth:480,margin:"0 auto"}}>
          <button onClick={()=>setView("creating")} style={backBtn}>← Back</button>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
            <div>
              <h2 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:24,color:"#fff",margin:"0 0 2px"}}>Preview Questions</h2>
              <p style={{fontSize:13,color:"rgba(255,255,255,0.4)",margin:0}}>{previewList.length} questions · {settings.timeQ}s each</p>
            </div>
            <div style={{textAlign:"center",background:"rgba(201,146,42,0.12)",border:"1px solid rgba(201,146,42,0.3)",borderRadius:12,padding:"8px 14px"}}>
              <p style={{fontSize:24,fontWeight:900,color:GOLD,margin:0}}>{previewList.length}</p>
              <p style={{fontSize:10,color:"rgba(255,255,255,0.4)",margin:0}}>Qs</p>
            </div>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
            {previewList.slice(0,5).map((q,i)=>(
              <div key={i} style={{...glassCard, padding:"14px 16px"}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                  <span style={{fontSize:12,fontWeight:800,color:GOLD,minWidth:22,marginTop:1}}>#{i+1}</span>
                  <div style={{flex:1}}>
                    <p style={{fontSize:13,fontWeight:700,color:"#fff",margin:"0 0 6px",lineHeight:1.4}}>{q.question}</p>
                    <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                      {q.options.map((opt,oi)=>(
                        <span key={oi} style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:opt===q.correct_answer?"rgba(34,197,94,0.2)":"rgba(255,255,255,0.06)",color:opt===q.correct_answer?"#22C55E":"rgba(255,255,255,0.5)",border:opt===q.correct_answer?"1px solid rgba(34,197,94,0.4)":"1px solid transparent",fontWeight:opt===q.correct_answer?700:400}}>
                          {opt===q.correct_answer?"✓ ":""}{opt.slice(0,24)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {previewList.length > 5 && (
              <div style={{textAlign:"center",padding:"10px",background:"rgba(255,255,255,0.03)",borderRadius:10,border:"1px solid rgba(255,255,255,0.06)"}}>
                <p style={{fontSize:12,color:"rgba(255,255,255,0.35)",margin:0}}>+{previewList.length-5} more questions in the quiz</p>
              </div>
            )}
          </div>

          <button onClick={()=>{ if(customQs.length===0) setCustomQs(previewList); createRoom(); }}
            disabled={loading} style={{...goldBtn, fontSize:17, padding:18}}>
            {loading ? "Creating Room…" : <><Play size={20}/> Launch Quiz Room!</>}
          </button>
          {customQs.length > 0 && quizName.trim() && (
            <button
              onClick={() => { saveCurrentQuiz(customQs.length > 0 ? customQs : previewList); toast({ title: "✅ Quiz saved! Find it in Saved Quizzes." }); }}
              style={{ ...outlineBtn, marginTop: 10, fontSize: 14 }}>
              💾 Save for Later
            </button>
          )}
          {customQs.length > 0 && !quizName.trim() && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textAlign: "center", marginTop: 8 }}>
              Add a quiz name above to enable saving
            </p>
          )}
        </div>
      </div>
    );
  }

  /* ══ LOBBY HOST ═══════════════════════════════════ */
  if (view === "lobby-host" && room) return (
    <div style={{...pageStyle, padding:"24px 18px", overflowY:"auto"}}>
      <IslamicBg opacity={0.08}/>
      <div style={{position:"relative",zIndex:1,maxWidth:500,margin:"0 auto"}}>

        {/* Room code hero */}
        <div style={{textAlign:"center",marginBottom:24}}>
          <p style={{fontSize:11,color:GOLD,fontWeight:700,letterSpacing:2,textTransform:"uppercase",margin:"0 0 10px"}}>Share this code</p>
          <div style={{background:`rgba(201,146,42,0.12)`,border:`2px solid ${GOLD}`,borderRadius:22,padding:"20px 36px",display:"inline-block",boxShadow:`0 8px 32px rgba(201,146,42,0.25)`}}>
            <span style={{fontSize:52,fontWeight:900,color:GOLD,letterSpacing:10,fontFamily:"'Courier New',monospace"}}>{room.code}</span>
          </div>
          <p style={{fontSize:12,color:"rgba(255,255,255,0.4)",marginTop:8,marginBottom:12}}>Students enter this at tahleemacademy.vercel.app</p>
          {/* Copy + Share buttons */}
          <div style={{display:"flex",gap:10,justifyContent:"center"}}>
            <button
              onClick={()=>{
                navigator.clipboard.writeText(room.code).then(()=>{
                  setCopiedCode(true); setTimeout(()=>setCopiedCode(false),2000);
                });
              }}
              style={{display:"flex",alignItems:"center",gap:7,padding:"9px 20px",borderRadius:12,border:`1px solid ${GOLD}`,background:"rgba(201,146,42,0.1)",color:GOLD,fontWeight:700,fontSize:13,cursor:"pointer"}}>
              {copiedCode ? <><Check size={14}/> Copied!</> : <><Copy size={14}/> Copy Code</>}
            </button>
            {navigator.share && (
              <button
                onClick={()=>{
                  navigator.share({
                    title:"Join Al-Musabaqah Quiz!",
                    text:`Join my Tahleem Academy quiz! Room code: ${room.code}
Go to: tahleemacademy.vercel.app/live-quiz`,
                    url:`${window.location.origin}/live-quiz`,
                  }).catch(()=>{});
                }}
                style={{display:"flex",alignItems:"center",gap:7,padding:"9px 20px",borderRadius:12,border:`1px solid rgba(255,255,255,0.2)`,background:"rgba(255,255,255,0.06)",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                <Share2 size={14}/> Share
              </button>
            )}
          </div>
        </div>

        {/* Player list */}
        <div style={{...glassCard, marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <h3 style={{fontWeight:800,fontSize:15,color:"#fff",margin:0,display:"flex",alignItems:"center",gap:8}}>
              <Users size={16} color={GOLD}/> Waiting Room
            </h3>
            <span style={{fontSize:14,fontWeight:800,color:GOLD,background:`rgba(201,146,42,0.15)`,padding:"3px 12px",borderRadius:20}}>{participants.length} joined</span>
          </div>

          {participants.length === 0 ? (
            <div style={{textAlign:"center",padding:"24px 0"}}>
              <div style={{fontSize:32,marginBottom:6,opacity:0.5}}>👥</div>
              <p style={{fontSize:13,color:"rgba(255,255,255,0.35)",margin:0}}>Waiting for students to join…</p>
            </div>
          ) : (
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {participants.map((p,i) => (
                <div key={p.id} style={{padding:"6px 14px",borderRadius:20,background:`rgba(201,146,42,0.12)`,border:`1px solid rgba(201,146,42,0.25)`,color:"#fff",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6,animation:"fadeIn .3s ease"}}>
                  {EMOJI_POOL[i % EMOJI_POOL.length]} {p.player_name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quiz info chips */}
        <div style={{display:"flex",gap:8,marginBottom:20}}>
          {[{l:"Topic",v:settings.topic},{l:"Questions",v:String(room.total_questions)},{l:"Time/Q",v:`${settings.timeQ}s`}].map(s=>(
            <div key={s.l} style={{flex:1,background:"rgba(255,255,255,0.04)",borderRadius:12,padding:"11px 8px",textAlign:"center",border:"1px solid rgba(255,255,255,0.08)"}}>
              <p style={{fontSize:15,fontWeight:900,color:GOLD,margin:0}}>{s.v}</p>
              <p style={{fontSize:10,color:"rgba(255,255,255,0.35)",margin:0,letterSpacing:0.5}}>{s.l}</p>
            </div>
          ))}
        </div>

        <button onClick={startQuiz} disabled={participants.length===0}
          style={{...goldBtn, opacity:participants.length>0?1:0.4, cursor:participants.length>0?"pointer":"not-allowed", fontSize:18, padding:18}}>
          <Play size={22}/> Start Quiz Now!
        </button>
        {participants.length===0 && <p style={{textAlign:"center",fontSize:12,color:"rgba(255,255,255,0.35)",marginTop:8}}>Need at least 1 player to start</p>}
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );

  /* ══ LOBBY PLAYER ═════════════════════════════════ */
  if (view === "lobby-player" && room) return (
    <div style={{...pageStyle, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"30px 20px"}}>
      <IslamicBg opacity={0.08}/>
      <div style={{position:"relative",zIndex:1,textAlign:"center",maxWidth:380}}>
        <div style={{width:80,height:80,borderRadius:24,background:`linear-gradient(135deg,${GOLD},${GOLD2})`,display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:16,boxShadow:`0 8px 32px rgba(201,146,42,0.4)`,animation:"pulse 2s infinite"}}>
          <span style={{fontSize:38}}>🕌</span>
        </div>
        <h2 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:26,color:"#fff",margin:"0 0 4px"}}>You're in!</h2>
        <p style={{fontSize:16,color:GOLD,fontWeight:700,marginBottom:24}}>{participant?.player_name}</p>

        <div style={{...glassCard, marginBottom:20}}>
          <p style={{fontSize:11,color:GOLD,fontWeight:700,margin:"0 0 6px",letterSpacing:1.5,textTransform:"uppercase"}}>Room Code</p>
          <p style={{fontSize:38,fontWeight:900,color:"#fff",margin:0,letterSpacing:8,fontFamily:"'Courier New',monospace"}}>{room.code}</p>
        </div>

        {participants.length > 0 && (
          <div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",marginBottom:20}}>
            {participants.map((p,i) => (
              <span key={p.id} style={{fontSize:12,color:p.id===participant?.id?GOLD:"rgba(255,255,255,0.5)",background:"rgba(255,255,255,0.05)",padding:"4px 10px",borderRadius:20,border:p.id===participant?.id?`1px solid ${GOLD}`:"1px solid transparent"}}>
                {EMOJI_POOL[i%EMOJI_POOL.length]} {p.player_name}
              </span>
            ))}
          </div>
        )}

        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:GOLD,animation:"pulse 1s infinite"}}/>
          <p style={{fontSize:13,color:"rgba(255,255,255,0.4)",margin:0}}>Waiting for the host to start…</p>
        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.6;transform:scale(.95)}}`}</style>
    </div>
  );

  /* ══ QUESTION HOST ════════════════════════════════ */
  if (view === "question-host" && room) return (
    <div style={{...pageStyle, padding:"18px 16px", overflowY:"auto"}}>
      <IslamicBg opacity={0.05}/>
      <div style={{position:"relative",zIndex:1,maxWidth:600,margin:"0 auto"}}>

        {/* Loading state — shows if currentQ hasn't arrived yet */}
        {!currentQ && (
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:300,gap:16}}>
            <div style={{width:48,height:48,borderRadius:"50%",border:`4px solid ${GOLD}`,borderTopColor:"transparent",animation:"spin .8s linear infinite"}}/>
            <p style={{fontSize:14,color:"rgba(255,255,255,0.5)",margin:0}}>Loading question…</p>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}
        {currentQ && (<>
      {/* Top bar */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div>
            <p style={{fontSize:13,color:"rgba(255,255,255,0.45)",margin:0}}>
              Question {currentQIndex+1} / {room.total_questions}
            </p>
            <p style={{fontSize:11,color:GOLD,margin:0,fontWeight:700,letterSpacing:0.5}}>{currentQ.topic}</p>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{textAlign:"center"}}>
              <p style={{fontSize:11,color:"rgba(255,255,255,0.4)",margin:0}}>Answered</p>
              <p style={{fontSize:20,fontWeight:900,color:GOLD,margin:0}}>{numAnswered}<span style={{fontSize:12,color:"rgba(255,255,255,0.4)"}}>/{participants.length}</span></p>
            </div>
            <TimerRing seconds={timeLeft} total={currentQ.time_limit}/>
          </div>
        </div>

        {/* Progress */}
        <div style={{height:3,background:"rgba(255,255,255,0.08)",borderRadius:2,marginBottom:18,overflow:"hidden"}}>
          <div style={{width:`${(currentQIndex/room.total_questions)*100}%`,height:"100%",background:GOLD,borderRadius:2,transition:"width .4s"}}/>
        </div>

        {/* Question card */}
        <div style={{...glassCard, textAlign:"center", marginBottom:16, minHeight:90, display:"flex", alignItems:"center", justifyContent:"center"}}>
          <LQQuestion text={currentQ.question}/>
        </div>

        {/* Answer grid */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          {currentQ.options.map((opt,i) => (
            <div key={i} style={{padding:"16px 14px",borderRadius:14,background:SHAPES[i].bg,border:`2px solid ${SHAPES[i].border}`,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:20,fontWeight:900,color:SHAPES[i].border,minWidth:22}}>{SHAPES[i].icon}</span>
              <span style={{fontSize:13,fontWeight:700,color:"#fff",lineHeight:1.3}}>{opt}</span>
            </div>
          ))}
        </div>

        {/* Live bar chart */}
        <div style={{background:"rgba(255,255,255,0.03)",borderRadius:14,padding:"12px 14px",marginBottom:14,border:"1px solid rgba(255,255,255,0.06)"}}>
          <p style={{fontSize:10,color:"rgba(255,255,255,0.35)",margin:"0 0 8px",fontWeight:700,letterSpacing:1.5}}>LIVE RESPONSES</p>
          <div style={{display:"flex",gap:8,alignItems:"flex-end",height:44}}>
            {currentQ.options.map((opt,i) => {
              const cnt    = answerCounts[opt]||0;
              const maxCnt = Math.max(1,...currentQ.options.map(o=>answerCounts[o]||0));
              return (
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                  <span style={{fontSize:11,color:"rgba(255,255,255,0.6)",fontWeight:700}}>{cnt}</span>
                  <div style={{width:"100%",borderRadius:"4px 4px 0 0",background:SHAPES[i].border,height:`${Math.max(4,(cnt/maxCnt)*32)}px`,transition:"height .4s ease",opacity:0.85}}/>
                </div>
              );
            })}
          </div>
        </div>

        <button onClick={handleReveal} style={outlineBtn}>Reveal Answer →</button>
      </>)}
      </div>
    </div>
  );

  /* ══ COUNTDOWN HOST ══════════════════════════════ */
  if (view === "countdown-host") return (
    <div style={{...pageStyle, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"20px"}}>
      <IslamicBg opacity={0.08}/>
      <div style={{position:"relative",zIndex:1,textAlign:"center"}}>
        <p style={{fontSize:11,color:"rgba(255,255,255,0.5)",fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>
          Question {currentQIndex+1} of {room?.total_questions}
        </p>
        <p style={{fontSize:14,color:GOLD,fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:28}}>
          Launching in…
        </p>
        {/* Giant countdown ring */}
        <div style={{
          width:180,height:180,borderRadius:"50%",
          background:`conic-gradient(${GOLD} ${(countdown/3)*360}deg, rgba(255,255,255,0.06) 0deg)`,
          display:"flex",alignItems:"center",justifyContent:"center",
          margin:"0 auto 28px",
          boxShadow:`0 0 60px rgba(201,146,42,${countdown===3?0.6:countdown===2?0.4:0.7})`,
        }}>
          <div style={{width:150,height:150,borderRadius:"50%",background:"#021F16",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{
              fontSize:88,fontWeight:900,color:GOLD,
              fontFamily:"'Playfair Display',serif",
              lineHeight:1,
              animation:"countdown-pop .3s ease",
              display:"block",
            }}>{countdown}</span>
          </div>
        </div>

        {/* Info */}
        <div style={{...glassCard, padding:"12px 24px", marginBottom:20, display:"inline-block"}}>
          <p style={{fontSize:13,color:"rgba(255,255,255,0.6)",margin:"0 0 2px"}}>Students are getting ready…</p>
          <p style={{fontSize:12,color:"rgba(255,255,255,0.35)",margin:0}}>{participants.length} player{participants.length!==1?"s":""} in the room</p>
        </div>

        {/* Progress dots */}
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          {[3,2,1].map(n => (
            <div key={n} style={{
              width:12,height:12,borderRadius:"50%",
              background:countdown>=n?GOLD:"rgba(255,255,255,0.15)",
              transition:"background .3s",
              boxShadow:countdown>=n?`0 0 8px ${GOLD}`:"none",
            }}/>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes countdown-pop{0%{transform:scale(1.4);opacity:0}100%{transform:scale(1);opacity:1}}
      `}</style>
    </div>
  );

  /* ══ COUNTDOWN PLAYER ════════════════════════════ */
  if (view === "countdown-player") return (
    <div style={{...pageStyle, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"20px"}}>
      <IslamicBg opacity={0.08}/>
      <div style={{position:"relative",zIndex:1,textAlign:"center"}}>
        <p style={{fontSize:14,color:GOLD,fontWeight:700,letterSpacing:2,textTransform:"uppercase",marginBottom:32}}>
          Get Ready!
        </p>
        {/* Giant countdown number */}
        <div style={{
          width:180,height:180,borderRadius:"50%",
          background:`conic-gradient(${GOLD} ${(countdown/3)*360}deg, rgba(255,255,255,0.06) 0deg)`,
          display:"flex",alignItems:"center",justifyContent:"center",
          margin:"0 auto 28px",
          boxShadow:`0 0 60px rgba(201,146,42,${countdown===3?0.6:countdown===2?0.4:0.7})`,
          animation:"pulse-ring 1s ease-in-out",
        }}>
          <div style={{width:150,height:150,borderRadius:"50%",background:"#021F16",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{
              fontSize:88,fontWeight:900,color:GOLD,
              fontFamily:"'Playfair Display',serif",
              lineHeight:1,
              animation:"countdown-pop .3s ease",
              display:"block",
            }}>{countdown}</span>
          </div>
        </div>
        <p style={{fontSize:16,color:"rgba(255,255,255,0.45)",fontWeight:600}}>
          {countdown === 3 ? "📖 Read the question…" : countdown === 2 ? "🤔 Think carefully…" : "⚡ Almost time!"}
        </p>
        {/* Progress dots */}
        <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:24}}>
          {[3,2,1].map(n => (
            <div key={n} style={{
              width:12,height:12,borderRadius:"50%",
              background:countdown>=n?GOLD:"rgba(255,255,255,0.15)",
              transition:"background .3s",
              boxShadow:countdown>=n?`0 0 8px ${GOLD}`:"none",
            }}/>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes countdown-pop{0%{transform:scale(1.4);opacity:0}100%{transform:scale(1);opacity:1}}
        @keyframes pulse-ring{0%{transform:scale(0.9)}50%{transform:scale(1.02)}100%{transform:scale(1)}}
      `}</style>
    </div>
  );

  /* ══ QUESTION PLAYER ══════════════════════════════ */
  if (view === "question-player") return (
    <div style={{...pageStyle, padding:"18px 16px"}}>
      <IslamicBg opacity={0.05}/>
      <div style={{position:"relative",zIndex:1,maxWidth:480,margin:"0 auto"}}>

        {!currentQ && (
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"70vh",gap:16}}>
            <div style={{width:44,height:44,borderRadius:"50%",border:`4px solid ${GOLD}`,borderTopColor:"transparent",animation:"lqspin .8s linear infinite"}}/>
            <p style={{fontSize:14,color:"rgba(255,255,255,0.5)",margin:0}}>Loading question…</p>
            <style>{`@keyframes lqspin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}
        {currentQ && (<>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div>
            <p style={{fontSize:13,color:"rgba(255,255,255,0.45)",margin:0}}>Q{currentQIndex+1}</p>
            <p style={{fontSize:12,color:GOLD,fontWeight:700,margin:0}}>{participant?.player_name} · {participant?.score||0} pts</p>
          </div>
          <TimerRing seconds={timeLeft} total={currentQ.time_limit}/>
        </div>

        {/* Question */}
        <div style={{...glassCard, textAlign:"center", minHeight:100, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:20}}>
          <LQQuestion text={currentQ.question}/>
        </div>

        {/* Options */}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {currentQ.options.map((opt,i) => {
            const isSel = selectedAns === opt;
            return (
              <button key={i} onClick={()=>submitAnswer(opt)} disabled={timeLeft<=0}
                style={{padding:"16px 18px",borderRadius:14,border:`2px solid ${isSel?SHAPES[i].border:"rgba(255,255,255,0.12)"}`,background:isSel?SHAPES[i].bg:"rgba(255,255,255,0.04)",color:"#fff",cursor:timeLeft<=0?"default":"pointer",fontWeight:700,fontSize:15,textAlign:"left",display:"flex",alignItems:"center",gap:12,transition:"all .2s",transform:isSel?"scale(1.02)":"scale(1)",boxShadow:isSel?`0 0 20px ${SHAPES[i].border}40`:"none"}}>
                <span style={{fontSize:20,color:SHAPES[i].border,minWidth:22}}>{SHAPES[i].icon}</span>
                <span style={{flex:1}}>{opt}</span>
                {isSel && <span style={{fontSize:20}}>✓</span>}
              </button>
            );
          })}
        </div>

        {selectedAns && (
          <div style={{marginTop:18,textAlign:"center",padding:"14px",background:"rgba(255,255,255,0.04)",borderRadius:12,border:"1px solid rgba(255,255,255,0.08)"}}>
            <p style={{fontSize:13,color:"rgba(255,255,255,0.5)",margin:0}}>✓ Answer saved — you can change it until time runs out</p>
          </div>
        )}
        </>)}
      </div>
    </div>
  );

  /* ══ REVEAL HOST ══════════════════════════════════ */
  if (view === "reveal-host" && currentQ && room) return (
    <div style={{...pageStyle, padding:"20px 16px", overflowY:"auto"}}>
      <IslamicBg opacity={0.06}/>
      <div style={{position:"relative",zIndex:1,maxWidth:600,margin:"0 auto"}}>

        {/* Correct answer reveal */}
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:44,marginBottom:8}}>✅</div>
          <h3 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:22,color:"#fff",margin:"0 0 10px"}}>Correct Answer</h3>
          <div style={{background:`rgba(201,146,42,0.15)`,border:`2px solid ${GOLD}`,borderRadius:16,padding:"14px 24px",display:"inline-block",boxShadow:`0 4px 24px rgba(201,146,42,0.3)`}}>
            <p style={{fontSize:18,fontWeight:900,color:GOLD,margin:0}}>{currentQ.correct_answer}</p>
          </div>
          {currentQ.explanation && (
            <p style={{fontSize:13,color:"rgba(255,255,255,0.55)",marginTop:10,fontStyle:"italic",maxWidth:360,margin:"10px auto 0"}}>📖 {currentQ.explanation}</p>
          )}
        </div>

        {/* Answer distribution */}
        <div style={{...glassCard, marginBottom:14}}>
          <p style={{fontSize:11,color:GOLD,fontWeight:700,margin:"0 0 12px",letterSpacing:1.5,textTransform:"uppercase"}}>Answer Distribution</p>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {currentQ.options.map((opt,i) => {
              const cnt    = answerCounts[opt]||0;
              const maxCnt = Math.max(1,...currentQ.options.map(o=>answerCounts[o]||0));
              const isCorrect = opt === currentQ.correct_answer;
              return (
                <div key={i} style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:14,color:SHAPES[i].border,minWidth:16}}>{SHAPES[i].icon}</span>
                  <div style={{flex:1,height:28,background:"rgba(255,255,255,0.05)",borderRadius:8,overflow:"hidden",position:"relative"}}>
                    <div style={{height:"100%",width:`${Math.max(4,(cnt/Math.max(1,numAnswered||1))*100)}%`,background:isCorrect?`${GOLD}CC`:SHAPES[i].border+"88",borderRadius:8,transition:"width .5s ease",display:"flex",alignItems:"center",paddingLeft:8}}>
                      <span style={{fontSize:11,fontWeight:700,color:"#fff",whiteSpace:"nowrap"}}>{opt.slice(0,20)}{opt.length>20?"…":""}</span>
                    </div>
                  </div>
                  <span style={{fontSize:13,fontWeight:800,color:isCorrect?GOLD:"rgba(255,255,255,0.6)",minWidth:22,textAlign:"right"}}>{cnt}</span>
                  {isCorrect && <span style={{fontSize:14}}>✅</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Leaderboard */}
        <div style={{...glassCard, marginBottom:16}}>
          <h4 style={{fontWeight:800,fontSize:13,color:GOLD,margin:"0 0 12px",letterSpacing:1.5,textTransform:"uppercase",display:"flex",alignItems:"center",gap:8}}>
            <Trophy size={14}/> Leaderboard
          </h4>
          {participants.slice(0,5).map((p,i) => (
            <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 0",borderBottom:i<Math.min(4,participants.length-1)?"1px solid rgba(255,255,255,0.06)":"none"}}>
              <span style={{fontSize:16,minWidth:24}}>{["🥇","🥈","🥉","4️⃣","5️⃣"][i]}</span>
              <span style={{fontSize:14,fontWeight:700,color:"#fff",flex:1}}>{p.player_name}</span>
              <span style={{fontSize:15,fontWeight:900,color:GOLD}}>{p.score}</span>
            </div>
          ))}
        </div>

        <button onClick={nextQuestion} style={goldBtn}>
          {currentQIndex+1 >= room.total_questions
            ? "🏁 Show Final Results"
            : <>Next Question <ArrowRight size={16}/></>}
        </button>
      </div>
    </div>
  );

  /* ══ REVEAL PLAYER ════════════════════════════════ */
  if (view === "reveal-player") {
    if (!currentQ) return (
      <div style={{...pageStyle, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16}}>
        <div style={{width:44,height:44,borderRadius:"50%",border:`4px solid ${GOLD}`,borderTopColor:"transparent",animation:"lqspin .8s linear infinite"}}/>
        <p style={{fontSize:14,color:"rgba(255,255,255,0.5)",margin:0}}>Loading results…</p>
        <style>{`@keyframes lqspin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
    const correct = selectedAns === currentQ.correct_answer;
    const myRank  = participants.findIndex(p => p.id === participant?.id) + 1;
    return (
      <div style={{...pageStyle, padding:"24px 18px", overflowY:"auto"}}>
        <IslamicBg opacity={0.06}/>
        <div style={{position:"relative",zIndex:1,maxWidth:420,margin:"0 auto",textAlign:"center"}}>

          {/* Result */}
          <div style={{fontSize:64,marginBottom:8,animation:"bounce .6s ease"}}>{correct?"🌟":"😔"}</div>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:28,color:correct?GOLD:"#EF4444",margin:"0 0 6px"}}>
            {correct ? "Correct!" : "Wrong!"}
          </h2>
          <p style={{fontSize:14,color:"rgba(255,255,255,0.55)",margin:"0 0 16px"}}>
            {correct ? "+500 points" : `Correct: ${currentQ.correct_answer}`}
          </p>

          {/* Explanation */}
          {currentQ.explanation && (
            <div style={{...glassCard, marginBottom:14, textAlign:"left"}}>
              <p style={{fontSize:13,color:"rgba(255,255,255,0.6)",margin:0,fontStyle:"italic"}}>📖 {currentQ.explanation}</p>
            </div>
          )}

          {/* Score + Rank row */}
          <div style={{display:"flex",gap:10,marginBottom:16}}>
            <div style={{flex:1,background:"rgba(201,146,42,0.12)",border:"1.5px solid rgba(201,146,42,0.35)",borderRadius:14,padding:"14px 10px"}}>
              <p style={{fontSize:10,color:"rgba(255,255,255,0.45)",margin:"0 0 2px",letterSpacing:1,textTransform:"uppercase"}}>Your Score</p>
              <p style={{fontSize:32,fontWeight:900,color:GOLD,margin:0}}>{participant?.score||0}</p>
            </div>
            {myRank > 0 && (
              <div style={{flex:1,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:14,padding:"14px 10px"}}>
                <p style={{fontSize:10,color:"rgba(255,255,255,0.45)",margin:"0 0 2px",letterSpacing:1,textTransform:"uppercase"}}>Your Rank</p>
                <p style={{fontSize:32,fontWeight:900,color:"#fff",margin:0}}>#{myRank}</p>
              </div>
            )}
          </div>

          {/* Leaderboard */}
          {participants.length > 0 && (
            <div style={{...glassCard, textAlign:"left", marginBottom:16}}>
              <h4 style={{fontWeight:800,fontSize:12,color:GOLD,margin:"0 0 12px",letterSpacing:1.5,textTransform:"uppercase",display:"flex",alignItems:"center",gap:8}}>
                <Trophy size={13}/> Leaderboard
              </h4>
              {participants.slice(0,5).map((p,i) => (
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px",borderRadius:10,marginBottom:2,background:p.id===participant?.id?"rgba(201,146,42,0.12)":"transparent",border:p.id===participant?.id?"1px solid rgba(201,146,42,0.3)":"1px solid transparent"}}>
                  <span style={{fontSize:16,minWidth:24}}>{["🥇","🥈","🥉","4️⃣","5️⃣"][i]}</span>
                  <span style={{flex:1,fontSize:13,fontWeight:700,color:p.id===participant?.id?GOLD:"#fff"}}>
                    {p.player_name}{p.id===participant?.id?" (You)":""}
                  </span>
                  <span style={{fontSize:14,fontWeight:900,color:GOLD}}>{p.score}</span>
                </div>
              ))}
            </div>
          )}

          <p style={{fontSize:12,color:"rgba(255,255,255,0.3)"}}>⏳ Waiting for next question…</p>
        </div>
        <style>{`@keyframes bounce{0%,100%{transform:scale(1)}50%{transform:scale(1.2)}}`}</style>
      </div>
    );
  }

  /* ══ RESULTS ══════════════════════════════════════ */
  if ((view==="results-host"||view==="results-player") && room) {
    const myRank = participants.findIndex(p=>p.id===participant?.id)+1;
    const top3   = [participants[1], participants[0], participants[2]];
    return (
      <div style={{...pageStyle, padding:"24px 18px", overflowY:"auto"}}>
        <IslamicBg opacity={0.09}/>
        <div style={{position:"relative",zIndex:1,maxWidth:480,margin:"0 auto",textAlign:"center"}}>

          {/* Trophy header */}
          <div style={{marginBottom:20}}>
            <div style={{fontSize:60,marginBottom:8}}>🏆</div>
            <h1 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:32,color:"#fff",margin:"0 0 4px"}}>Quiz Complete!</h1>
            <p style={{fontSize:16,color:GOLD,fontWeight:700,letterSpacing:1,fontFamily:"'Amiri',serif"}}>مبروك — Congratulations!</p>
          </div>

          {/* Podium */}
          <div style={{display:"flex",alignItems:"flex-end",justifyContent:"center",gap:6,marginBottom:24,height:130}}>
            {top3.map((p,i) => {
              if (!p) return <div key={i} style={{flex:1}}/>;
              const heights  = [100,130,80];
              const medals   = ["🥈","🥇","🥉"];
              const bgAlpha  = ["rgba(192,192,192,0.12)","rgba(201,146,42,0.2)","rgba(205,127,50,0.12)"];
              const borderC  = ["rgba(192,192,192,0.3)",GOLD,"rgba(205,127,50,0.3)"];
              return (
                <div key={p.id} style={{flex:1,height:heights[i],background:bgAlpha[i],borderRadius:"12px 12px 0 0",border:`1px solid ${borderC[i]}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",padding:"8px 4px",gap:2}}>
                  <span style={{fontSize:22}}>{medals[i]}</span>
                  <p style={{fontSize:11,fontWeight:800,color:"#fff",margin:0,lineHeight:1.2,wordBreak:"break-word",padding:"0 4px"}}>{p.player_name}</p>
                  <p style={{fontSize:13,fontWeight:900,color:GOLD,margin:0}}>{p.score}</p>
                </div>
              );
            })}
          </div>

          {/* Full list */}
          <div style={{...glassCard, textAlign:"left", marginBottom:16}}>
            <h4 style={{fontWeight:800,fontSize:13,color:GOLD,margin:"0 0 12px",letterSpacing:1.5,textTransform:"uppercase",display:"flex",alignItems:"center",gap:8}}>
              <Trophy size={13}/> Final Standings
            </h4>
            {participants.map((p,i) => (
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 8px",borderRadius:10,marginBottom:2,background:p.id===participant?.id?`rgba(201,146,42,0.1)`:"transparent",border:p.id===participant?.id?`1px solid rgba(201,146,42,0.25)`:"1px solid transparent"}}>
                <span style={{fontSize:14,minWidth:26,textAlign:"center"}}>{i<3?["🥇","🥈","🥉"][i]:`#${i+1}`}</span>
                <span style={{flex:1,fontSize:14,fontWeight:700,color:p.id===participant?.id?GOLD:"#fff"}}>
                  {p.player_name}{p.id===participant?.id?" (You)":""}
                </span>
                <span style={{fontSize:15,fontWeight:900,color:GOLD}}>{p.score}</span>
              </div>
            ))}
          </div>

          {view==="results-player" && myRank>0 && (
            <div style={{marginBottom:16,padding:"12px 20px",background:`rgba(201,146,42,0.1)`,borderRadius:14,border:`1px solid rgba(201,146,42,0.25)`}}>
              <p style={{fontSize:14,color:"rgba(255,255,255,0.7)",margin:0}}>
                You finished <strong style={{color:GOLD,fontSize:18}}>#{myRank}</strong> out of {participants.length} players
              </p>
            </div>
          )}

          {/* Post-quiz actions */}
          {view === "results-host" ? (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <button onClick={openDiscussion} style={{...goldBtn,display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
                <span style={{fontSize:18}}>💬</span> Open Class Discussion
              </button>
              <button onClick={resetAll} style={{...backBtn,justifyContent:"center",textAlign:"center"}}>
                Skip → Return Home
              </button>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{padding:"12px 16px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(201,146,42,0.15)",borderRadius:14,display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:20}}>💬</span>
                <p style={{fontSize:13,color:"rgba(255,255,255,0.55)",margin:0}}>
                  Waiting for teacher to open the discussion…
                </p>
              </div>
              <button onClick={resetAll} style={{...backBtn,justifyContent:"center",textAlign:"center"}}>
                Return Home
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ══ POST-QUIZ LIVE CHAT ══════════════════════════ */
  if (view === "post-chat" && room) {
    const isMe = (name: string) => name === myChatName;
    return (
      <div style={{...pageStyle, display:"flex", flexDirection:"column", height:"100svh", overflow:"hidden"}}>
        <IslamicBg opacity={0.06}/>

        {/* ── Header ── */}
        <div style={{position:"relative",zIndex:2,padding:"14px 16px 12px",borderBottom:`1px solid rgba(201,146,42,0.18)`,backdropFilter:"blur(12px)",background:"rgba(2,31,22,0.7)",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
          <div style={{flex:1,minWidth:0}}>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:17,color:"#fff",margin:"0 0 1px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
              💬 Class Discussion
            </h2>
            <p style={{fontSize:11,color:GOLD,margin:0,fontFamily:"'Amiri',serif",letterSpacing:1}}>
              {room.topic} · {participants.length} participants
            </p>
          </div>
          {isHost ? (
            <button
              onClick={closeChatForAll}
              style={{flexShrink:0,padding:"8px 16px",borderRadius:12,border:`1px solid rgba(201,146,42,0.4)`,background:"rgba(201,146,42,0.12)",color:GOLD,fontWeight:700,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}
            >
              ✓ Close &amp; Return Home
            </button>
          ) : (
            <button
              onClick={resetAll}
              style={{flexShrink:0,padding:"8px 12px",borderRadius:12,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.06)",color:"rgba(255,255,255,0.6)",fontSize:12,cursor:"pointer"}}
            >
              Leave
            </button>
          )}
        </div>

        {/* ── Welcome banner — shown until first message ── */}
        {chatMessages.length === 0 && (
          <div style={{position:"relative",zIndex:1,padding:"20px 20px 0",flexShrink:0}}>
            <div style={{padding:"18px 20px",background:"rgba(201,146,42,0.07)",border:`1px solid rgba(201,146,42,0.2)`,borderRadius:18,textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:8}}>🌟</div>
              <p style={{fontFamily:"'Amiri',serif",fontSize:17,color:GOLD,margin:"0 0 4px",letterSpacing:1}}>
                بارك الله فيكم جميعاً
              </p>
              <p style={{fontSize:13,color:"rgba(255,255,255,0.5)",margin:0,lineHeight:1.65}}>
                May Allāh bless every one of you for your efforts.<br/>
                Commend your classmates or share your thoughts below.
              </p>
            </div>
          </div>
        )}

        {/* ── Messages ── */}
        <div style={{position:"relative",zIndex:1,flex:1,overflowY:"auto",padding:"14px 14px 4px",display:"flex",flexDirection:"column",gap:12}}>
          {chatMessages.map(msg => (
            <div key={msg.id} style={{display:"flex",flexDirection:"column",alignItems:isMe(msg.name)?"flex-end":"flex-start"}}>
              <span style={{
                fontSize:10,fontWeight:700,letterSpacing:0.6,textTransform:"uppercase",
                color: msg.isHost ? GOLD : "rgba(255,255,255,0.38)",
                marginBottom:3,
                paddingLeft: isMe(msg.name) ? 0 : 6,
                paddingRight: isMe(msg.name) ? 6 : 0,
              }}>
                {msg.name}{isMe(msg.name) ? " · You" : ""}
              </span>
              <div style={{
                maxWidth:"78%",
                padding:"10px 14px",
                borderRadius: isMe(msg.name) ? "18px 4px 18px 18px" : "4px 18px 18px 18px",
                background: isMe(msg.name)
                  ? `linear-gradient(135deg,${GOLD},${GOLD2})`
                  : msg.isHost
                    ? "rgba(201,146,42,0.13)"
                    : "rgba(255,255,255,0.07)",
                border: isMe(msg.name) ? "none" : msg.isHost ? `1px solid rgba(201,146,42,0.3)` : "1px solid rgba(255,255,255,0.09)",
                color: isMe(msg.name) ? "#1a1108" : "#fff",
                fontSize:14,
                lineHeight:1.5,
                wordBreak:"break-word",
              }}>
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={chatEndRef}/>
        </div>

        {/* ── Participants name strip ── */}
        <div style={{position:"relative",zIndex:2,padding:"7px 14px",borderTop:`1px solid rgba(255,255,255,0.05)`,display:"flex",gap:6,overflowX:"auto",flexShrink:0,alignItems:"center"}}>
          <span style={{fontSize:10,color:"rgba(255,255,255,0.25)",marginRight:2,flexShrink:0}}>IN CHAT:</span>
          {participants.map(p => (
            <span key={p.id} style={{
              flexShrink:0,fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20,
              background: p.id === participant?.id ? `rgba(201,146,42,0.18)` : "rgba(255,255,255,0.05)",
              border: p.id === participant?.id ? `1px solid rgba(201,146,42,0.35)` : "1px solid rgba(255,255,255,0.08)",
              color: p.id === participant?.id ? GOLD : "rgba(255,255,255,0.4)",
            }}>
              {p.player_name}
            </span>
          ))}
        </div>

        {/* ── Input ── */}
        <div style={{position:"relative",zIndex:2,padding:"10px 12px 16px",borderTop:`1px solid rgba(201,146,42,0.15)`,backdropFilter:"blur(12px)",background:"rgba(2,31,22,0.6)",display:"flex",gap:8,flexShrink:0}}>
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMsg(); } }}
            placeholder={`${myChatName} — share a thought…`}
            style={{flex:1,background:"rgba(255,255,255,0.07)",border:`1px solid rgba(201,146,42,0.22)`,borderRadius:14,padding:"11px 14px",color:"#fff",fontSize:14,outline:"none",fontFamily:"inherit"}}
          />
          <button
            onClick={sendChatMsg}
            disabled={!chatInput.trim()}
            style={{
              flexShrink:0,width:46,height:46,borderRadius:14,border:"none",
              background: chatInput.trim() ? `linear-gradient(135deg,${GOLD},${GOLD2})` : "rgba(255,255,255,0.06)",
              color: chatInput.trim() ? "#1a1108" : "rgba(255,255,255,0.2)",
              fontSize:18,cursor:chatInput.trim()?"pointer":"default",
              display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s",
            }}
          >
            ➤
          </button>
        </div>
      </div>
    );
  }

  /* ══ FAREWELL — Appreciation + Course Suggestions ══ */
  if (view === "farewell") {
    return (
      <div style={{...pageStyle, overflowY:"auto"}}>
        <IslamicBg opacity={0.1}/>
        <div style={{position:"relative",zIndex:1,maxWidth:500,margin:"0 auto",padding:"32px 18px 48px"}}>

          {/* ── Appreciation header ── */}
          <div style={{textAlign:"center",marginBottom:28}}>
            {/* Decorative star row */}
            <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:18,opacity:0.6}}>
              {["✦","★","✦","★","✦"].map((s,i)=>(
                <span key={i} style={{color:GOLD,fontSize:i===2?18:12}}>{s}</span>
              ))}
            </div>

            <div style={{width:72,height:72,borderRadius:"50%",background:`linear-gradient(135deg,${GOLD},${GOLD2})`,display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:16,boxShadow:`0 0 40px rgba(201,146,42,0.35)`}}>
              <span style={{fontSize:34}}>🤲</span>
            </div>

            <h1 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:28,color:"#fff",margin:"0 0 6px",lineHeight:1.2}}>
              جزاكم الله خيراً
            </h1>
            <p style={{fontFamily:"'Amiri',serif",fontSize:15,color:GOLD,margin:"0 0 20px",letterSpacing:1}}>
              May Allāh reward you all with the best
            </p>

            {/* Appreciation card */}
            <div style={{padding:"22px 24px",background:"rgba(201,146,42,0.07)",border:`1px solid rgba(201,146,42,0.22)`,borderRadius:20,textAlign:"left",marginBottom:8}}>
              <p style={{fontSize:14,color:"rgba(255,255,255,0.8)",margin:"0 0 14px",lineHeight:1.75}}>
                Assalāmu ʿalaykum wa rahmatullāhi wa barakātuh,
              </p>
              <p style={{fontSize:14,color:"rgba(255,255,255,0.72)",margin:"0 0 14px",lineHeight:1.75}}>
                A heartfelt <strong style={{color:GOLD}}>جزاكم الله خيراً</strong> to every one of you who joined today's quiz.
                Your presence, effort, and eagerness to learn are a source of joy and a sign of Allāh's blessing upon this madrosah.
              </p>
              <p style={{fontSize:14,color:"rgba(255,255,255,0.72)",margin:"0 0 14px",lineHeight:1.75}}>
                Whether you topped the leaderboard or simply gave it your best — <strong style={{color:GOLD}}>every step taken for the sake of knowledge is worship.</strong>
              </p>
              <p style={{fontFamily:"'Amiri',serif",fontSize:16,color:GOLD,margin:"0 0 6px",textAlign:"center",lineHeight:1.8}}>
                اللّهُمَّ انْفَعْنَا بِمَا عَلَّمْتَنَا وَعَلِّمْنَا مَا يَنْفَعُنَا وَزِدْنَا عِلْمًا
              </p>
              <p style={{fontSize:12,color:"rgba(255,255,255,0.38)",textAlign:"center",margin:0,fontStyle:"italic"}}>
                "O Allāh, benefit us with what You have taught us, teach us what benefits us, and increase us in knowledge."
              </p>
            </div>
          </div>

          {/* Divider */}
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
            <div style={{flex:1,height:1,background:`linear-gradient(90deg,transparent,rgba(201,146,42,0.3))`}}/>
            <span style={{color:GOLD,fontSize:16}}>✦</span>
            <p style={{fontSize:11,color:GOLD,fontWeight:700,letterSpacing:2,textTransform:"uppercase",margin:0}}>Continue Your Journey</p>
            <span style={{color:GOLD,fontSize:16}}>✦</span>
            <div style={{flex:1,height:1,background:`linear-gradient(90deg,rgba(201,146,42,0.3),transparent)`}}/>
          </div>

          <p style={{fontSize:13,color:"rgba(255,255,255,0.45)",marginBottom:18,textAlign:"center",lineHeight:1.65}}>
            The best of you are those who learn the Qur'an and teach it. — <em>Sahih al-Bukhāri</em><br/>
            Explore our courses and keep the flame of learning alive. 🕯️
          </p>

          <button
            onClick={() => { resetAll(); navigate("/"); }}
            style={{...goldBtn,display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:10}}
          >
            🏡 Visit Tahleem Academy
          </button>

          {/* Closing dua */}
          <div style={{marginTop:32,textAlign:"center",opacity:0.6}}>
            <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:10}}>
              {["✦","★","✦","★","✦"].map((s,i)=>(
                <span key={i} style={{color:GOLD,fontSize:i===2?14:9}}>{s}</span>
              ))}
            </div>
            <p style={{fontFamily:"'Amiri',serif",fontSize:14,color:GOLD,margin:"0 0 4px"}}>
              وَفَّقَكُمُ اللهُ وَسَدَّدَكُمْ
            </p>
            <p style={{fontSize:11,color:"rgba(255,255,255,0.3)",margin:0,fontStyle:"italic"}}>
              May Allāh grant you tawfīq and keep you steadfast
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default LiveQuiz;