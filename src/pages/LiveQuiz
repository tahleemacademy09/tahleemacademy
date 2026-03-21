/*
  LiveQuiz.tsx — Al-Musabaqah | Islamic Live Quiz Arena
  Kahoot-style live quiz with Supabase Realtime
  Colors: Deep Green #064E3B + Gold #C9922A (Tahleem Academy)
*/

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Trophy, Users, Play, ArrowRight, Star,
  Crown, Zap, RotateCcw, X,
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
  status: "waiting" | "active" | "question" | "reveal" | "finished";
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

/* ══════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════ */
const LiveQuiz = () => {
  const { user, hasRole } = useAuth();
  const { toast }        = useToast();
  const isHost           = hasRole?.("admin") || hasRole?.("teacher");

  type View =
    | "hub" | "creating" | "joining"
    | "lobby-host" | "question-host" | "reveal-host" | "results-host"
    | "lobby-player" | "question-player" | "reveal-player" | "results-player";

  const [view,         setView]         = useState<View>("hub");
  const [room,         setRoom]         = useState<Room|null>(null);
  const [participant,  setParticipant]  = useState<Participant|null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentQ,     setCurrentQ]     = useState<Question|null>(null);
  const [selectedAns,  setSelectedAns]  = useState<string|null>(null);
  const [timeLeft,     setTimeLeft]     = useState(20);
  const [answerCounts, setAnswerCounts] = useState<Record<string,number>>({});
  const [numAnswered,  setNumAnswered]  = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [joinCode,     setJoinCode]     = useState("");
  const [playerName,   setPlayerName]   = useState("");
  const [settings,     setSettings]     = useState({ topic:"All Topics", numQ:10, timeQ:20 });

  const timerRef  = useRef<any>(null);
  const channelRef= useRef<any>(null);

  /* ── Realtime subscription ── */
  useEffect(() => {
    if (!room) return;
    const ch = supabase.channel(`lq-${room.id}`)
      .on("postgres_changes",{ event:"*", schema:"public", table:"live_quiz_rooms",    filter:`id=eq.${room.id}` }, (p:any) => {
        const r = p.new as Room;
        setRoom(r);
        if (!isHost) {
          if (r.status === "question") { loadCurrentQ(r.current_question_index); setView("question-player"); setSelectedAns(null); }
          if (r.status === "reveal")   setView("reveal-player");
          if (r.status === "finished") { loadParticipants(); setView("results-player"); }
        }
      })
      .on("postgres_changes",{ event:"*", schema:"public", table:"live_quiz_participants", filter:`room_id=eq.${room.id}` }, () => loadParticipants())
      .on("postgres_changes",{ event:"*", schema:"public", table:"live_quiz_answers",      filter:`room_id=eq.${room.id}` }, () => loadAnswerCounts())
      .subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
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

  /* ── Data loaders ── */
  const loadParticipants = async () => {
    if (!room) return;
    const { data } = await supabase.from("live_quiz_participants" as any).select("*").eq("room_id", room.id).order("score",{ascending:false});
    setParticipants((data||[]) as Participant[]);
  };

  const loadCurrentQ = async (idx: number) => {
    if (!room) return;
    const { data } = await supabase.from("live_quiz_questions" as any).select("*").eq("room_id", room.id).eq("order_index", idx).single();
    if (data) setCurrentQ({ ...data, options: data.options as string[] } as Question);
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

  /* ── Actions ── */
  const createRoom = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const code = genCode();
      let pool = settings.topic === "All Topics" ? POOL : POOL.filter(q => q.topic === settings.topic);
      if (pool.length < settings.numQ) pool = POOL;
      const selected = [...pool].sort(() => Math.random()-0.5).slice(0, settings.numQ);

      const { data: rd, error } = await supabase.from("live_quiz_rooms" as any).insert({
        code, host_id: user.id, status: "waiting",
        current_question_index: 0, total_questions: selected.length, topic: settings.topic,
      } as any).select().single();
      if (error) throw error;

      setRoom(rd as Room);
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
      setRoom(rd as Room);
      const { data: pd, error: pe } = await supabase.from("live_quiz_participants" as any).insert({
        room_id: (rd as any).id, player_name: playerName.trim(), score:0, streak:0,
      } as any).select().single();
      if (pe) throw pe;
      setParticipant(pd as Participant);
      setView("lobby-player");
    } catch(e:any) {
      toast({ title:"Error", description:e.message, variant:"destructive" });
    } finally { setLoading(false); }
  };

  const startQuiz = async () => {
    if (!room) return;
    await loadCurrentQ(0);
    await supabase.from("live_quiz_rooms" as any).update({ status:"question", current_question_index:0 } as any).eq("id", room.id);
    setView("question-host"); setSelectedAns(null); setAnswerCounts({}); setNumAnswered(0);
  };

  const handleReveal = async () => {
    if (!room) return;
    clearInterval(timerRef.current);
    await supabase.from("live_quiz_rooms" as any).update({ status:"reveal" } as any).eq("id", room.id);
    await loadParticipants(); await loadAnswerCounts();
    setView("reveal-host");
  };

  const nextQuestion = async () => {
    if (!room) return;
    const next = (room.current_question_index||0) + 1;
    if (next >= (room.total_questions||0)) {
      await supabase.from("live_quiz_rooms" as any).update({ status:"finished" } as any).eq("id", room.id);
      await loadParticipants();
      setView("results-host");
    } else {
      await loadCurrentQ(next);
      await supabase.from("live_quiz_rooms" as any).update({ status:"question", current_question_index:next } as any).eq("id", room.id);
      setView("question-host"); setAnswerCounts({}); setNumAnswered(0);
    }
  };

  const submitAnswer = async (answer: string) => {
    if (!room || !currentQ || !participant || selectedAns) return;
    setSelectedAns(answer);
    const isCorrect  = answer === currentQ.correct_answer;
    const speedBonus = Math.max(0, Math.floor((timeLeft / currentQ.time_limit) * 500));
    const points     = isCorrect ? 500 + speedBonus : 0;
    await supabase.from("live_quiz_answers" as any).insert({
      room_id:room.id, question_id:currentQ.id, participant_id:participant.id,
      answer, is_correct:isCorrect, time_taken:currentQ.time_limit-timeLeft, points_earned:points,
    } as any);
    if (isCorrect) {
      await supabase.from("live_quiz_participants" as any).update({ score:(participant.score||0)+points, streak:(participant.streak||0)+1, last_answer_correct:true } as any).eq("id",participant.id);
      setParticipant(p => p ? {...p, score:(p.score||0)+points, streak:(p.streak||0)+1} : p);
    } else {
      await supabase.from("live_quiz_participants" as any).update({ streak:0, last_answer_correct:false } as any).eq("id",participant.id);
      setParticipant(p => p ? {...p, streak:0} : p);
    }
  };

  const resetAll = () => {
    setView("hub"); setRoom(null); setParticipant(null);
    setParticipants([]); setCurrentQ(null); setSelectedAns(null);
    setJoinCode(""); setPlayerName("");
  };

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

  /* ══ HUB ══════════════════════════════════════════ */
  if (view === "hub") return (
    <div style={{...pageStyle, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 20px"}}>
      <IslamicBg opacity={0.09}/>
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
            <button onClick={()=>setView("creating")} style={goldBtn}>
              <Crown size={18}/> Host a Quiz
            </button>
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

  /* ══ CREATING ═════════════════════════════════════ */
  if (view === "creating") return (
    <div style={{...pageStyle, padding:"28px 18px", overflowY:"auto"}}>
      <IslamicBg opacity={0.08}/>
      <div style={{position:"relative",zIndex:1,maxWidth:440,margin:"0 auto"}}>
        <button onClick={()=>setView("hub")} style={backBtn}>← Back</button>
        <h2 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:28,color:"#fff",margin:"0 0 4px"}}>Create Quiz Room</h2>
        <p style={{fontSize:13,color:"rgba(255,255,255,0.45)",marginBottom:22}}>Configure your live session</p>

        <div style={{...glassCard, display:"flex", flexDirection:"column", gap:22}}>

          {/* Topic */}
          <div>
            <label style={{fontSize:11,fontWeight:700,color:GOLD,display:"block",marginBottom:10,letterSpacing:1.5,textTransform:"uppercase"}}>Topic</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {TOPICS.map(t => (
                <button key={t} onClick={()=>setSettings(p=>({...p,topic:t}))}
                  style={{padding:"8px 14px",borderRadius:20,border:`1.5px solid ${settings.topic===t?GOLD:"rgba(255,255,255,0.15)"}`,background:settings.topic===t?`rgba(201,146,42,0.18)`:"transparent",color:settings.topic===t?GOLD:"rgba(255,255,255,0.55)",cursor:"pointer",fontSize:12,fontWeight:700,transition:"all .15s"}}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Num questions */}
          <div>
            <label style={{fontSize:11,fontWeight:700,color:GOLD,display:"block",marginBottom:10,letterSpacing:1.5,textTransform:"uppercase"}}>Number of Questions</label>
            <div style={{display:"flex",gap:8}}>
              {[5,8,10,15].map(n=>(
                <button key={n} onClick={()=>setSettings(p=>({...p,numQ:n}))}
                  style={{flex:1,padding:"11px",borderRadius:10,border:`1.5px solid ${settings.numQ===n?GOLD:"rgba(255,255,255,0.15)"}`,background:settings.numQ===n?`rgba(201,146,42,0.18)`:"transparent",color:settings.numQ===n?GOLD:"rgba(255,255,255,0.55)",cursor:"pointer",fontWeight:800,fontSize:15,transition:"all .15s"}}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Time per Q */}
          <div>
            <label style={{fontSize:11,fontWeight:700,color:GOLD,display:"block",marginBottom:10,letterSpacing:1.5,textTransform:"uppercase"}}>Time Per Question</label>
            <div style={{display:"flex",gap:8}}>
              {[10,15,20,30].map(n=>(
                <button key={n} onClick={()=>setSettings(p=>({...p,timeQ:n}))}
                  style={{flex:1,padding:"11px",borderRadius:10,border:`1.5px solid ${settings.timeQ===n?GOLD:"rgba(255,255,255,0.15)"}`,background:settings.timeQ===n?`rgba(201,146,42,0.18)`:"transparent",color:settings.timeQ===n?GOLD:"rgba(255,255,255,0.55)",cursor:"pointer",fontWeight:800,fontSize:15,transition:"all .15s"}}>
                  {n}s
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div style={{background:`rgba(201,146,42,0.1)`,borderRadius:12,padding:"12px 16px",border:`1px solid rgba(201,146,42,0.2)`}}>
            <p style={{fontSize:12,color:"rgba(255,255,255,0.6)",margin:0}}>
              📋 <strong style={{color:"#fff"}}>{settings.numQ} questions</strong> · <strong style={{color:"#fff"}}>{settings.topic}</strong> · <strong style={{color:"#fff"}}>{settings.timeQ}s</strong> each
            </p>
          </div>

          <button onClick={createRoom} disabled={loading} style={{...goldBtn,marginTop:4}}>
            {loading ? "Creating…" : <><Zap size={18}/> Create Room</>}
          </button>
        </div>
      </div>
    </div>
  );

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
          <p style={{fontSize:12,color:"rgba(255,255,255,0.4)",marginTop:8}}>Students enter this at tahleemacademy.vercel.app</p>
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
  if (view === "question-host" && currentQ && room) return (
    <div style={{...pageStyle, padding:"18px 16px", overflowY:"auto"}}>
      <IslamicBg opacity={0.05}/>
      <div style={{position:"relative",zIndex:1,maxWidth:600,margin:"0 auto"}}>

        {/* Top bar */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div>
            <p style={{fontSize:13,color:"rgba(255,255,255,0.45)",margin:0}}>
              Question {(room.current_question_index||0)+1} / {room.total_questions}
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
          <div style={{width:`${((room.current_question_index||0)/room.total_questions)*100}%`,height:"100%",background:GOLD,borderRadius:2,transition:"width .4s"}}/>
        </div>

        {/* Question card */}
        <div style={{...glassCard, textAlign:"center", marginBottom:16, minHeight:90, display:"flex", alignItems:"center", justifyContent:"center"}}>
          <p style={{fontSize:20,fontWeight:700,color:"#fff",margin:0,lineHeight:1.6,fontFamily:"'Playfair Display',serif"}}>{currentQ.question}</p>
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
      </div>
    </div>
  );

  /* ══ QUESTION PLAYER ══════════════════════════════ */
  if (view === "question-player" && currentQ) return (
    <div style={{...pageStyle, padding:"18px 16px"}}>
      <IslamicBg opacity={0.05}/>
      <div style={{position:"relative",zIndex:1,maxWidth:480,margin:"0 auto"}}>

        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div>
            <p style={{fontSize:13,color:"rgba(255,255,255,0.45)",margin:0}}>Q{(room?.current_question_index||0)+1}</p>
            <p style={{fontSize:12,color:GOLD,fontWeight:700,margin:0}}>{participant?.player_name} · {participant?.score||0} pts</p>
          </div>
          <TimerRing seconds={timeLeft} total={currentQ.time_limit}/>
        </div>

        {/* Question */}
        <div style={{...glassCard, textAlign:"center", minHeight:100, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:20}}>
          <p style={{fontSize:18,fontWeight:700,color:"#fff",margin:0,lineHeight:1.6,fontFamily:"'Playfair Display',serif"}}>{currentQ.question}</p>
        </div>

        {/* Options */}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {currentQ.options.map((opt,i) => {
            const isSel = selectedAns === opt;
            return (
              <button key={i} onClick={()=>submitAnswer(opt)} disabled={!!selectedAns}
                style={{padding:"16px 18px",borderRadius:14,border:`2px solid ${isSel?SHAPES[i].border:"rgba(255,255,255,0.12)"}`,background:isSel?SHAPES[i].bg:"rgba(255,255,255,0.04)",color:"#fff",cursor:selectedAns?"default":"pointer",fontWeight:700,fontSize:15,textAlign:"left",display:"flex",alignItems:"center",gap:12,transition:"all .2s",transform:isSel?"scale(1.02)":"scale(1)",boxShadow:isSel?`0 0 20px ${SHAPES[i].border}40`:"none"}}>
                <span style={{fontSize:20,color:SHAPES[i].border,minWidth:22}}>{SHAPES[i].icon}</span>
                <span style={{flex:1}}>{opt}</span>
                {isSel && <span style={{fontSize:20}}>✓</span>}
              </button>
            );
          })}
        </div>

        {selectedAns && (
          <div style={{marginTop:18,textAlign:"center",padding:"14px",background:"rgba(255,255,255,0.04)",borderRadius:12,border:"1px solid rgba(255,255,255,0.08)"}}>
            <p style={{fontSize:13,color:"rgba(255,255,255,0.5)",margin:0}}>⏳ Answer locked — waiting for host…</p>
          </div>
        )}
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
          {(room.current_question_index||0)+1 >= room.total_questions
            ? "🏁 Show Final Results"
            : <>Next Question <ArrowRight size={16}/></>}
        </button>
      </div>
    </div>
  );

  /* ══ REVEAL PLAYER ════════════════════════════════ */
  if (view === "reveal-player" && currentQ) {
    const correct = selectedAns === currentQ.correct_answer;
    return (
      <div style={{...pageStyle, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"30px 20px"}}>
        <IslamicBg opacity={0.06}/>
        <div style={{position:"relative",zIndex:1,textAlign:"center",maxWidth:400}}>
          <div style={{fontSize:72,marginBottom:12,animation:"bounce .6s ease"}}>{correct?"🌟":"😔"}</div>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontWeight:900,fontSize:32,color:correct?GOLD:"#EF4444",margin:"0 0 8px"}}>
            {correct ? "Correct!" : "Wrong!"}
          </h2>
          <p style={{fontSize:14,color:"rgba(255,255,255,0.6)",margin:"0 0 20px"}}>
            {correct ? `+${500} points` : `Correct: ${currentQ.correct_answer}`}
          </p>
          {currentQ.explanation && (
            <div style={{...glassCard, marginBottom:20, textAlign:"left"}}>
              <p style={{fontSize:13,color:"rgba(255,255,255,0.6)",margin:0,fontStyle:"italic"}}>📖 {currentQ.explanation}</p>
            </div>
          )}
          <div style={{background:`rgba(201,146,42,0.12)`,border:`1.5px solid rgba(201,146,42,0.35)`,borderRadius:16,padding:"16px 24px"}}>
            <p style={{fontSize:11,color:"rgba(255,255,255,0.45)",margin:"0 0 2px",letterSpacing:1,textTransform:"uppercase"}}>Your Score</p>
            <p style={{fontSize:40,fontWeight:900,color:GOLD,margin:0}}>{participant?.score||0}</p>
          </div>
          <p style={{fontSize:13,color:"rgba(255,255,255,0.35)",marginTop:16}}>⏳ Waiting for next question…</p>
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

          <button onClick={resetAll} style={goldBtn}>
            <RotateCcw size={16}/> Back to Home
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default LiveQuiz;
