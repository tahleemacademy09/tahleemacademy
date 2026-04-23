/*
  MustabaqahPage.tsx — Tahleem Academy
  ════════════════════════════════════════════════════════════════════
  International Quran Recitation Competition
  Route: /musabaqah/recitation

  ROLES:
    admin / teacher  → Moderator  (full control: call contestant, pick card,
                                   reveal verse, bell, stop, score each stage)
    student          → Contestant (when called: dominant video, sees verse)
                       Audience   (watches live, reactions only — no mic)

  FLOW PER CONTESTANT:
    Entry (3D Quran + room code)
    → Lobby (waiting room, participant list)
    → Competition:
        Stage 1–3 each:
          question_selection  moderator selects numbered card for contestant
          verse_reveal        moderator reads out aloud, verse shown everywhere
          reading             contestant recites, timer running, bell available
          scoring             moderator enters score
        complete              contestant finished → next contestant called

  SUPABASE: musabaqah_rooms + musabaqah_events (realtime broadcast)
════════════════════════════════════════════════════════════════════
*/

import {
  useState, useEffect, useRef, useCallback, useReducer,
} from "react";
import { useNavigate }         from "react-router-dom";
import { supabase }            from "@/integrations/supabase/client";
import { useAuth }             from "@/contexts/AuthContext";
import { useToast }            from "@/hooks/use-toast";

/* ── Brand tokens ──────────────────────────────────────────────── */
const G    = "#0a1f12";
const GM   = "#163d28";
const GOLD = "#c9a84c";
const GOLDD= "#a8843a";

/* ══════════════════════════════════════════════════════════════════
   CSS  — injected once via <style> tag
══════════════════════════════════════════════════════════════════ */
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700;900&family=Cinzel:wght@400;600;700&family=Amiri:ital,wght@0,400;0,700;1,400&family=Cairo:wght@400;600;700;900&display=swap');
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
:root{--gold:#c9a84c;--goldd:#a8843a;--g:#0a1f12;--gm:#163d28;}

/* ── animations ── */
@keyframes floatBook{0%,100%{transform:rotateX(20deg) rotateY(-8deg) translateY(0)}50%{transform:rotateX(20deg) rotateY(-8deg) translateY(-16px)}}
@keyframes goldGlow{0%,100%{filter:drop-shadow(0 0 10px rgba(201,168,76,.3))}50%{filter:drop-shadow(0 0 26px rgba(201,168,76,.65))}}
@keyframes bellSwing{0%,100%{transform:rotate(0) scale(1)}15%{transform:rotate(22deg) scale(1.1)}30%{transform:rotate(-18deg) scale(1.1)}45%{transform:rotate(12deg)}60%{transform:rotate(-7deg)}75%{transform:rotate(4deg)}}
@keyframes pulseRing{0%{transform:scale(1);opacity:.9}100%{transform:scale(2.4);opacity:0}}
@keyframes float{0%,100%{transform:translateY(0) scale(1);opacity:.6}50%{transform:translateY(-10px) scale(1.02);opacity:1}}
@keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes recGlow{0%,100%{box-shadow:0 0 18px rgba(34,197,94,.4)}50%{box-shadow:0 0 40px rgba(34,197,94,.85),0 0 70px rgba(34,197,94,.25)}}
@keyframes calledGlow{0%,100%{box-shadow:0 0 18px rgba(201,168,76,.5)}50%{box-shadow:0 0 45px rgba(201,168,76,.9),0 0 90px rgba(201,168,76,.35)}}
@keyframes twinkle{0%,100%{opacity:.2;transform:scale(1)}50%{opacity:1;transform:scale(1.6)}}
@keyframes ripple{0%{transform:scale(0);opacity:.9}100%{transform:scale(4);opacity:0}}
@keyframes scanLine{0%{top:0}100%{top:100%}}
@keyframes staggerIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes cardFlip{0%{transform:rotateY(90deg) scale(.8);opacity:0}100%{transform:rotateY(0) scale(1);opacity:1}}
@keyframes stopPop{0%{transform:scale(.7);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
@keyframes goldShimmer{0%{background-position:-200% center}100%{background-position:200% center}}
@keyframes ticker{from{transform:translateX(100%)}to{transform:translateX(-100%)}}
@keyframes emojiFloat{0%{transform:translateY(0) scale(1);opacity:1}100%{transform:translateY(-180px) scale(2);opacity:0}}

/* ── utility classes ── */
.fade-up{animation:fadeUp .45s cubic-bezier(.22,1,.36,1) both;}
.fade-in{animation:fadeIn .35s ease both;}
.stagger-in{animation:staggerIn .5s cubic-bezier(.22,1,.36,1) both;}
.card-flip{animation:cardFlip .5s cubic-bezier(.175,.885,.32,1.275);}
.gold-btn{
  background:linear-gradient(135deg,#9B6E10,#c9a84c,#e8c96a,#c9a84c,#9B6E10);
  background-size:300%;
  color:#071a10;font-family:'Cinzel',serif;font-weight:700;
  border:none;cursor:pointer;letter-spacing:.06em;transition:all .35s;
}
.gold-btn:hover{background-position:100% 50%;transform:translateY(-2px);box-shadow:0 8px 28px rgba(201,168,76,.55);}
.gold-btn:active{transform:scale(.97);}
.glass{background:rgba(22,61,40,.55);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(201,168,76,.18);}
.bell-anim{animation:bellSwing .9s ease-in-out;}

::-webkit-scrollbar{width:4px;height:4px;}
::-webkit-scrollbar-track{background:rgba(255,255,255,.04);}
::-webkit-scrollbar-thumb{background:rgba(201,168,76,.3);border-radius:2px;}
input:focus,select:focus{outline:none;border-color:rgba(201,168,76,.7)!important;box-shadow:0 0 0 3px rgba(201,168,76,.12);}
`;

/* ══════════════════════════════════════════════════════════════════
   SOUND ENGINE
══════════════════════════════════════════════════════════════════ */
let _actx: AudioContext | null = null;
const actx = () => {
  if (!_actx) _actx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (_actx.state === "suspended") _actx.resume();
  return _actx;
};
const tone = (freqs: number[], dur: number, type: OscillatorType = "sine", vol = 0.3) => {
  try {
    const c = actx(), t = c.currentTime;
    freqs.forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(vol / (i + 1), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur);
    });
  } catch {}
};
const SFX = {
  bell:   () => { tone([440, 880, 1320, 1760], 3.2, "sine", 0.35); },
  stop:   () => { tone([2400, 2800], 0.3, "square", 0.4); setTimeout(() => tone([2400,2800],.3,"square",.4), 340); },
  reveal: () => { [523,659,784,1047].forEach((f,i) => setTimeout(()=>tone([f],0.7,"sine",.28), i*130)); },
  called: () => { [523,659,784,1047].forEach((f,i) => setTimeout(()=>tone([f],0.7,"sine",.3), i*120)); },
  complete:()=>{ [523,659,784,659,784,1047].forEach((f,i)=>setTimeout(()=>tone([f],.35,"triangle",.25),i*160)); },
};

/* ══════════════════════════════════════════════════════════════════
   DATA
══════════════════════════════════════════════════════════════════ */
const STAGES = [
  { id:1, name:"Tajweed & Makhraj",     abbr:"Stage I",   time:120, desc:"Pronunciation & articulation points" },
  { id:2, name:"Memorization Test",     abbr:"Stage II",  time:90,  desc:"Continue from given verse" },
  { id:3, name:"Tarteel Recitation",    abbr:"Stage III", time:150, desc:"Beautiful measured recitation" },
];

const SCORE_CRITERIA = [
  { key:"tajweed",  label:"Tajweed",     max:40 },
  { key:"hifdh",    label:"Hifdh",       max:30 },
  { key:"tarteel",  label:"Tarteel",     max:20 },
  { key:"adab",     label:"Adab/Manner", max:10 },
];

const REACTIONS = ["🤲","❤️","⭐","👏","🌙","📖","🕊️","✨","🌟","🎉"];

const TICKER_MSGS = [
  "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ — Welcome to Al-Musabaqah Al-Qur'aniyyah",
  "Recite with Tajweed, Tarteel, and Tawadhu'",
  "May Allah bless all participants and their families",
  "International Quran Recitation Competition — Live Broadcast",
];

const QUESTIONS = [
  { id:1, surah:"Al-Baqarah",  ayah:"2:255",  arabic:"اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ۗ مَنْ ذَا الَّذِي يَشْفَعُ عِنْدَهُ إِلَّا بِإِذْنِهِ", translation:"Allah — there is no deity except Him, the Ever-Living, the Sustainer of existence. Neither drowsiness overtakes Him nor sleep. To Him belongs whatever is in the heavens and whatever is on the earth." },
  { id:2, surah:"Al-Fatiha",   ayah:"1:1–7",  arabic:"بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ۝ الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ ۝ الرَّحْمَٰنِ الرَّحِيمِ ۝ مَالِكِ يَوْمِ الدِّينِ ۝ إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ ۝ اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ", translation:"In the name of Allah, the Entirely Merciful, the Especially Merciful. All praise is due to Allah, Lord of the worlds — the Merciful, Sovereign of the Day of Recompense." },
  { id:3, surah:"Al-Ikhlas",   ayah:"112:1-4",arabic:"قُلْ هُوَ اللَّهُ أَحَدٌ ۝ اللَّهُ الصَّمَدُ ۝ لَمْ يَلِدْ وَلَمْ يُولَدْ ۝ وَلَمْ يَكُنْ لَهُ كُفُوًا أَحَدٌ", translation:"Say: He is Allah, the One. Allah, the Eternal Refuge. He neither begets nor is born. Nor is there to Him any equivalent." },
  { id:4, surah:"Ya-Sin",      ayah:"36:1-5", arabic:"يس ۝ وَالْقُرْآنِ الْحَكِيمِ ۝ إِنَّكَ لَمِنَ الْمُرْسَلِينَ ۝ عَلَىٰ صِرَاطٍ مُّسْتَقِيمٍ ۝ تَنزِيلَ الْعَزِيزِ الرَّحِيمِ", translation:"Ya-Sin. By the wise Quran. Indeed you are among the messengers, on a straight path — a revelation of the Exalted, the Merciful." },
  { id:5, surah:"Al-Rahman",   ayah:"55:1-13",arabic:"الرَّحْمَٰنُ ۝ عَلَّمَ الْقُرْآنَ ۝ خَلَقَ الْإِنسَانَ ۝ عَلَّمَهُ الْبَيَانَ ۝ الشَّمْسُ وَالْقَمَرُ بِحُسْبَانٍ ۝ فَبِأَيِّ آلَاءِ رَبِّكُمَا تُكَذِّبَانِ", translation:"The Most Merciful taught the Quran, created man, taught him eloquence. The sun and moon follow precise courses — so which of your Lord's favours would you deny?" },
  { id:6, surah:"Al-Mulk",     ayah:"67:1-3", arabic:"تَبَارَكَ الَّذِي بِيَدِهِ الْمُلْكُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ ۝ الَّذِي خَلَقَ الْمَوْتَ وَالْحَيَاةَ لِيَبْلُوَكُمْ أَيُّكُمْ أَحْسَنُ عَمَلًا", translation:"Blessed is He in whose hand is dominion — He is over all things competent. Who created death and life to test which of you is best in deed." },
  { id:7, surah:"Al-Kahf",     ayah:"18:1-3", arabic:"الْحَمْدُ لِلَّهِ الَّذِي أَنزَلَ عَلَىٰ عَبْدِهِ الْكِتَابَ وَلَمْ يَجْعَل لَّهُ عِوَجًا ۝ قَيِّمًا لِّيُنذِرَ بَأْسًا شَدِيدًا مِّن لَّدُنْهُ", translation:"Praise to Allah who sent down the Book upon His Servant and has not made therein any deviation — straight, to warn of severe punishment from Him." },
  { id:8, surah:"Al-Hashr",    ayah:"59:22-24",arabic:"هُوَ اللَّهُ الَّذِي لَا إِلَٰهَ إِلَّا هُوَ ۖ عَالِمُ الْغَيْبِ وَالشَّهَادَةِ ۖ هُوَ الرَّحْمَٰنُ الرَّحِيمُ ۝ هُوَ اللَّهُ الَّذِي لَا إِلَٰهَ إِلَّا هُوَ الْمَلِكُ الْقُدُّوسُ", translation:"He is Allah — other than whom there is no deity, Knower of the unseen and the witnessed. He is the Entirely Merciful, the King, the Most Pure." },
  { id:9, surah:"Al-Baqarah",  ayah:"2:285-286",arabic:"آمَنَ الرَّسُولُ بِمَا أُنزِلَ إِلَيْهِ مِن رَّبِّهِ وَالْمُؤْمِنُونَ ۚ كُلٌّ آمَنَ بِاللَّهِ وَمَلَائِكَتِهِ وَكُتُبِهِ وَرُسُلِهِ", translation:"The Messenger has believed in what was revealed to him from his Lord, and so have the believers — all of them believe in Allah, His angels, His books, and His messengers." },
];

/* ══════════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════════ */
type Phase = "question_selection"|"verse_reveal"|"reading"|"scoring"|"complete";
type MyRole = "moderator"|"contestant"|"audience";

interface Contestant { id: string; name: string; country: string; flag: string; }
interface FloatEmoji { id: number; emoji: string; x: number; }
interface StageScore { score: number; bells: number; criteria: Record<string,number>; }

interface CompState {
  phase:           Phase;
  contestantIdx:   number;
  contestants:     Contestant[];
  selectedQ:       typeof QUESTIONS[0] | null;
  usedQIds:        number[];
  stageIdx:        number;
  stageScores:     (StageScore|null)[];
  timer:           number;
  timerRunning:    boolean;
  bellCount:       number;
  bellFlash:       boolean;
  stopFlash:       boolean;
  floatEmojis:     FloatEmoji[];
  criteriaInput:   Record<string,string>;
  viewerCount:     number;
}

type Action =
  | { type:"SELECT_Q";        q: typeof QUESTIONS[0] }
  | { type:"REVEAL" }
  | { type:"START_READING" }
  | { type:"TICK" }
  | { type:"BELL" }
  | { type:"BELL_END" }
  | { type:"STOP" }
  | { type:"STOP_END" }
  | { type:"SET_CRITERIA";    key: string; val: string }
  | { type:"SAVE_SCORE" }
  | { type:"NEXT_CONTESTANT" }
  | { type:"REACT";           emoji: string }
  | { type:"REMOVE_EMOJI";    id: number }
  | { type:"SYNC_EVENT";      event: any }
  | { type:"SET_CONTESTANTS"; contestants: Contestant[] };

const initState = (): CompState => ({
  phase: "question_selection",
  contestantIdx: 0,
  contestants: [
    { id:"1", name:"Ahmad Al-Rashidi",  country:"Saudi Arabia", flag:"🇸🇦" },
    { id:"2", name:"Fatimah Idris",     country:"Nigeria",      flag:"🇳🇬" },
    { id:"3", name:"Yusuf Al-Qasim",    country:"Malaysia",     flag:"🇲🇾" },
    { id:"4", name:"Khadijah Hassan",   country:"Egypt",        flag:"🇪🇬" },
  ],
  selectedQ: null,
  usedQIds: [],
  stageIdx: 0,
  stageScores: [null, null, null],
  timer: STAGES[0].time,
  timerRunning: false,
  bellCount: 0,
  bellFlash: false,
  stopFlash: false,
  floatEmojis: [],
  criteriaInput: {},
  viewerCount: 163,
});

function reducer(s: CompState, a: Action): CompState {
  switch (a.type) {
    case "SELECT_Q":     return { ...s, selectedQ: a.q };
    case "REVEAL":       return { ...s, phase:"verse_reveal", usedQIds:[...new Set([...s.usedQIds, s.selectedQ!.id])], timer: STAGES[s.stageIdx].time };
    case "START_READING":return { ...s, phase:"reading", timerRunning:true };
    case "TICK":
      if (!s.timerRunning) return s;
      if (s.timer <= 1) return { ...s, timer:0, timerRunning:false, phase:"scoring" };
      return { ...s, timer: s.timer-1 };
    case "BELL":  return { ...s, bellCount: s.bellCount+1, bellFlash:true };
    case "BELL_END": return { ...s, bellFlash:false };
    case "STOP":  return { ...s, stopFlash:true, timerRunning:false };
    case "STOP_END": return { ...s, stopFlash:false, phase:"scoring" };
    case "SET_CRITERIA": return { ...s, criteriaInput:{ ...s.criteriaInput, [a.key]:a.val } };
    case "SAVE_SCORE": {
      const scoreEntry: StageScore = {
        score: SCORE_CRITERIA.reduce((sum,c)=>sum+(parseInt(s.criteriaInput[c.key]||"0")||0),0),
        bells: s.bellCount,
        criteria: Object.fromEntries(SCORE_CRITERIA.map(c=>[c.key, parseInt(s.criteriaInput[c.key]||"0")||0])),
      };
      const newScores = [...s.stageScores]; newScores[s.stageIdx] = scoreEntry;
      const nextStage = s.stageIdx+1;
      if (nextStage < STAGES.length) {
        return { ...s, stageScores:newScores, stageIdx:nextStage, phase:"question_selection", selectedQ:null, bellCount:0, criteriaInput:{}, timer:STAGES[nextStage].time };
      }
      return { ...s, stageScores:newScores, phase:"complete", criteriaInput:{} };
    }
    case "NEXT_CONTESTANT": {
      const next = s.contestantIdx+1;
      return { ...initState(), contestants:s.contestants, contestantIdx:next, viewerCount:s.viewerCount };
    }
    case "REACT": {
      const e: FloatEmoji = { id:Date.now(), emoji:a.emoji, x:Math.random()*70+10 };
      return { ...s, floatEmojis:[...s.floatEmojis, e] };
    }
    case "REMOVE_EMOJI": return { ...s, floatEmojis:s.floatEmojis.filter(e=>e.id!==a.id) };
    case "SYNC_EVENT": {
      const ev = a.event;
      if (ev.type==="BELL")          return { ...s, bellCount:s.bellCount+1, bellFlash:true };
      if (ev.type==="STOP")          return { ...s, stopFlash:true, timerRunning:false };
      if (ev.type==="REVEAL"&&ev.q)  return { ...s, phase:"verse_reveal", selectedQ:ev.q, usedQIds:[...new Set([...s.usedQIds, ev.q.id])], timer:STAGES[s.stageIdx].time };
      if (ev.type==="START_READING") return { ...s, phase:"reading", timerRunning:true };
      if (ev.type==="SCORING")       return { ...s, phase:"scoring", timerRunning:false };
      if (ev.type==="SELECT_Q"&&ev.q)return { ...s, selectedQ:ev.q };
      return s;
    }
    default: return s;
  }
}

/* ══════════════════════════════════════════════════════════════════
   HELPER COMPONENTS
══════════════════════════════════════════════════════════════════ */

/* Stars background */
const Stars = () => {
  const stars = Array.from({length:55}, (_,i)=>({
    x:Math.random()*100, y:Math.random()*100,
    s:Math.random()*2+.5, d:(Math.random()*3+1.5).toFixed(1), dl:(Math.random()*4).toFixed(1)
  }));
  return (
    <div style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden"}}>
      {stars.map((st,i)=>(
        <div key={i} style={{
          position:"absolute",left:`${st.x}%`,top:`${st.y}%`,
          width:st.s,height:st.s,borderRadius:"50%",background:"#E8B84B",
          animation:`twinkle ${st.d}s ease-in-out infinite ${st.dl}s`,
        }}/>
      ))}
    </div>
  );
};

/* Islamic geometric overlay */
const GeoPattern = () => (
  <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:.05,pointerEvents:"none"}} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="mp-geo" x="0" y="0" width="90" height="90" patternUnits="userSpaceOnUse">
        <polygon points="45,4 82,25 82,65 45,86 8,65 8,25" fill="none" stroke="#c9a84c" strokeWidth=".6"/>
        <line x1="45" y1="4"  x2="45" y2="86" stroke="#c9a84c" strokeWidth=".3"/>
        <line x1="8"  y1="25" x2="82" y2="65" stroke="#c9a84c" strokeWidth=".3"/>
        <line x1="82" y1="25" x2="8"  y2="65" stroke="#c9a84c" strokeWidth=".3"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#mp-geo)"/>
  </svg>
);

/* Timer circle */
const TimerCircle = ({ seconds, total, size=80 }: { seconds:number; total:number; size?:number }) => {
  const r = (size-10)/2, circ = 2*Math.PI*r;
  const pct = total>0 ? Math.max(0, seconds/total) : 0;
  const urgent = seconds<=30 && seconds>0;
  const color = urgent ? "#ef4444" : GOLD;
  return (
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth={7}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth={7}
          strokeDasharray={circ} strokeDashoffset={circ*(1-pct)}
          strokeLinecap="round" style={{transition:"stroke-dashoffset 1s linear"}}
        />
      </svg>
      <div style={{
        position:"absolute",inset:0,display:"flex",flexDirection:"column",
        alignItems:"center",justifyContent:"center",
        fontFamily:"'Cinzel',serif",color:urgent?"#ef4444":GOLD,
        animation:urgent?"float 1s ease-in-out infinite":"none",
      }}>
        <div style={{fontSize:size*.2,fontWeight:700,lineHeight:1}}>
          {Math.floor(seconds/60)}:{(seconds%60).toString().padStart(2,"0")}
        </div>
        <div style={{fontSize:size*.09,opacity:.4,letterSpacing:1}}>SEC</div>
      </div>
    </div>
  );
};

/* 3-D Open Quran */
const OpenQuran3D = () => (
  <div style={{perspective:1300,display:"flex",justifyContent:"center",marginBottom:20}}>
    <div style={{
      width:360,height:260,position:"relative",
      transform:"rotateX(18deg) rotateY(-7deg)",
      transformStyle:"preserve-3d",
      animation:"floatBook 5s ease-in-out infinite",
      filter:"drop-shadow(0 45px 65px rgba(0,0,0,.9))",
    }}>
      {/* left page */}
      <div style={{
        position:"absolute",left:0,top:0,width:176,height:260,
        background:"linear-gradient(150deg,#f7f2e6,#ede4ce 60%,#d8ccb8)",
        borderRadius:"8px 0 0 8px",border:"2px solid #c9a84c",borderRight:"none",
        overflow:"hidden",boxShadow:"inset -12px 0 26px rgba(0,0,0,.2)",
      }}>
        <div style={{position:"absolute",inset:7,border:"1.5px solid rgba(201,168,76,.55)",borderRadius:4}}/>
        {/* corner gems */}
        {[{t:9,l:9},{t:9,r:9},{b:9,l:9},{b:9,r:9}].map((pos,i)=>(
          <div key={i} style={{position:"absolute",...pos,width:10,height:10,
            background:"radial-gradient(circle,#c9a84c,transparent)",borderRadius:"50%",opacity:.7}}/>
        ))}
        <div style={{padding:"22px 12px",fontFamily:"'Amiri',serif",fontSize:9,color:"#2a1a08",direction:"rtl",textAlign:"right",lineHeight:2.3}}>
          {["بِسْمِ اللَّهِ الرَّحْمَٰنِ","الرَّحِيمِ","الْحَمْدُ لِلَّهِ رَبِّ","الْعَالَمِينَ","الرَّحْمَٰنِ الرَّحِيمِ","مَالِكِ يَوْمِ الدِّينِ"].map((t,i)=>(
            <div key={i} style={{borderBottom:i<5?".5px solid rgba(201,168,76,.22)":"none",paddingBottom:1}}>{t}</div>
          ))}
        </div>
        <div style={{position:"absolute",bottom:10,left:"50%",transform:"translateX(-50%)",fontSize:8,color:"#8B6514",fontFamily:"'Cinzel',serif"}}>١</div>
      </div>

      {/* spine */}
      <div style={{
        position:"absolute",left:174,top:0,width:14,height:260,
        background:"linear-gradient(90deg,#6B4F10,#c9a84c 40%,#e8c96a 50%,#c9a84c 60%,#6B4F10)",
        boxShadow:"0 0 18px rgba(201,168,76,.5)",
      }}/>

      {/* right page */}
      <div style={{
        position:"absolute",right:0,top:0,width:176,height:260,
        background:"linear-gradient(150deg,#f5f0e4,#ece3cd 60%,#d5caB8)",
        borderRadius:"0 8px 8px 0",border:"2px solid #c9a84c",borderLeft:"none",
        overflow:"hidden",boxShadow:"inset 8px 0 20px rgba(0,0,0,.12)",
      }}>
        <div style={{position:"absolute",inset:7,border:"1.5px solid rgba(201,168,76,.55)",borderRadius:4}}/>
        {[{t:9,l:9},{t:9,r:9},{b:9,l:9},{b:9,r:9}].map((pos,i)=>(
          <div key={i} style={{position:"absolute",...pos,width:10,height:10,
            background:"radial-gradient(circle,#c9a84c,transparent)",borderRadius:"50%",opacity:.7}}/>
        ))}
        <div style={{padding:"22px 12px",fontFamily:"'Amiri',serif",fontSize:9,color:"#2a1a08",direction:"rtl",textAlign:"right",lineHeight:2.3}}>
          {["إِيَّاكَ نَعْبُدُ","وَإِيَّاكَ نَسْتَعِينُ","اهْدِنَا الصِّرَاطَ","الْمُسْتَقِيمَ","صِرَاطَ الَّذِينَ","أَنْعَمْتَ عَلَيْهِمْ"].map((t,i)=>(
            <div key={i} style={{borderBottom:i<5?".5px solid rgba(201,168,76,.22)":"none",paddingBottom:1}}>{t}</div>
          ))}
        </div>
        <div style={{position:"absolute",bottom:10,left:"50%",transform:"translateX(-50%)",fontSize:8,color:"#8B6514",fontFamily:"'Cinzel',serif"}}>٢</div>
      </div>

      {/* Center rosette */}
      <div style={{
        position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",
        width:20,height:20,background:"radial-gradient(circle,#e8c96a,#c9a84c)",
        borderRadius:"50%",zIndex:10,boxShadow:"0 0 16px rgba(201,168,76,.9)",
        display:"flex",alignItems:"center",justifyContent:"center",
        fontSize:8,color:"#071a10",fontWeight:900,
      }}>✦</div>

      {/* Bookmark ribbon */}
      <div style={{
        position:"absolute",right:28,top:0,width:11,height:72,
        background:"linear-gradient(to bottom,#c9a84c,#8B6514)",
        borderRadius:"0 0 5px 5px",zIndex:20,
      }}>
        <div style={{position:"absolute",bottom:0,left:"50%",transform:"translateX(-50%)",
          width:0,height:0,borderLeft:"5.5px solid transparent",borderRight:"5.5px solid transparent",
          borderTop:"7px solid #8B6514",
        }}/>
      </div>

      {/* Bottom thickness shadow */}
      <div style={{
        position:"absolute",left:2,bottom:-8,width:358,height:9,
        background:"linear-gradient(90deg,#1a5e36,#0d3d22,#1a5e36)",
        borderRadius:"0 0 4px 4px",
        transform:"rotateX(-90deg)",transformOrigin:"top",
        boxShadow:"0 4px 14px rgba(0,0,0,.8)",
      }}/>
    </div>
  </div>
);

/* Video feed */
const VideoFeed = ({
  name, subtitle, flag, large, isSelf, isMod, isRecording
}: {
  name:string; subtitle?:string; flag?:string;
  large?:boolean; isSelf?:boolean; isMod?:boolean; isRecording?:boolean;
}) => (
  <div style={{
    width:"100%",height:"100%",position:"relative",
    background: isMod
      ? "linear-gradient(160deg,#12243D 0%,#080E1A 100%)"
      : "linear-gradient(160deg,#0d3d22 0%,#040e08 100%)",
    borderRadius:large?14:10,
    border:`2px solid ${isRecording?"#22c55e":isMod?"rgba(80,140,220,.3)":"rgba(201,168,76,.22)"}`,
    overflow:"hidden",
    display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
    boxShadow:isRecording?"0 0 28px rgba(34,197,94,.3)":isMod?"0 0 20px rgba(40,90,160,.25)":"none",
  }}>
    {/* Corner brackets */}
    {["tl","tr","bl","br"].map(c=>(
      <div key={c} style={{
        position:"absolute",
        top:c.startsWith("t")?9:undefined,bottom:c.startsWith("b")?9:undefined,
        left:c.endsWith("l")?9:undefined,right:c.endsWith("r")?9:undefined,
        width:15,height:15,
        borderTop:c.startsWith("t")?`2px solid ${isRecording?"#22c55e":isMod?"rgba(80,140,220,.45)":"rgba(201,168,76,.45)"}`:undefined,
        borderBottom:c.startsWith("b")?`2px solid ${isRecording?"#22c55e":isMod?"rgba(80,140,220,.45)":"rgba(201,168,76,.45)"}`:undefined,
        borderLeft:c.endsWith("l")?`2px solid ${isRecording?"#22c55e":isMod?"rgba(80,140,220,.45)":"rgba(201,168,76,.45)"}`:undefined,
        borderRight:c.endsWith("r")?`2px solid ${isRecording?"#22c55e":isMod?"rgba(80,140,220,.45)":"rgba(201,168,76,.45)"}`:undefined,
      }}/>
    ))}

    {/* Scan line when recording */}
    {isRecording && (
      <div style={{position:"absolute",left:0,right:0,height:2,
        background:"linear-gradient(90deg,transparent,rgba(34,197,94,.4),transparent)",
        animation:"scanLine 2.5s linear infinite",pointerEvents:"none",
      }}/>
    )}

    {/* Avatar */}
    <div style={{
      width:large?88:52,height:large?88:52,borderRadius:"50%",
      background:isMod?"linear-gradient(135deg,#1e3a5f,#0d2038)":"linear-gradient(135deg,#1A6B3A,#0B3D1E)",
      border:`3px solid ${isRecording?"#22c55e":isMod?"rgba(80,140,220,.5)":"rgba(201,168,76,.5)"}`,
      display:"flex",alignItems:"center",justifyContent:"center",
      fontSize:large?34:20,marginBottom:9,position:"relative",
      animation:isRecording?"recGlow 2s ease-in-out infinite":undefined,
    }}>
      {flag||"👤"}
      {isRecording && (
        <div style={{position:"absolute",inset:-4,borderRadius:"50%",border:"2px solid #22c55e",animation:"ripple 2s ease-out infinite"}}/>
      )}
    </div>

    <div style={{fontFamily:"'Cinzel',serif",fontSize:large?16:10,color:"#e8c96a",fontWeight:700,textAlign:"center",textShadow:"0 2px 8px rgba(0,0,0,.8)"}}>{name}</div>
    {subtitle && <div style={{fontSize:large?11:8,color:"rgba(255,255,255,.4)",marginTop:3}}>{subtitle}</div>}

    {/* Badges */}
    {isRecording && (
      <div style={{position:"absolute",top:11,right:11,background:"rgba(239,68,68,.9)",color:"#fff",borderRadius:4,padding:"2px 8px",fontSize:9,fontWeight:700,letterSpacing:1,fontFamily:"'Cinzel',serif",animation:"float 1.2s ease-in-out infinite"}}>● REC</div>
    )}
    {isSelf && (
      <div style={{position:"absolute",top:11,left:11,background:"rgba(201,168,76,.15)",color:GOLD,borderRadius:4,padding:"2px 8px",fontSize:9,border:"1px solid rgba(201,168,76,.4)",fontFamily:"'Cinzel',serif"}}>YOU</div>
    )}
    {isMod && (
      <div style={{position:"absolute",top:11,left:11,background:"rgba(30,80,150,.4)",color:"#80AEFF",borderRadius:4,padding:"2px 8px",fontSize:9,border:"1px solid rgba(80,140,220,.3)",fontFamily:"'Cinzel',serif"}}>JUDGE</div>
    )}
  </div>
);

/* Verse reveal panel */
const VersePanel = ({ q, big }: { q: typeof QUESTIONS[0]; big?:boolean }) => (
  <div className="fade-up" style={{
    background:"rgba(10,31,18,.7)",border:"1px solid rgba(201,168,76,.3)",
    borderRadius:14,padding:big?"20px 26px":"13px 16px",backdropFilter:"blur(12px)",
  }}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,paddingBottom:8,borderBottom:"1px solid rgba(201,168,76,.15)"}}>
      <div style={{width:3,height:18,background:"linear-gradient(to bottom,#e8c96a,#c9a84c)",borderRadius:2}}/>
      <span style={{fontFamily:"'Cinzel',serif",fontSize:10,color:GOLD,letterSpacing:"0.2em",textTransform:"uppercase"}}>{q.surah}</span>
      <span style={{fontSize:10,color:"rgba(255,255,255,.25)"}}>·</span>
      <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:"rgba(201,168,76,.65)",letterSpacing:"0.15em"}}>{q.ayah}</span>
    </div>
    <div style={{
      fontFamily:"'Amiri',serif",
      fontSize:big?"clamp(17px,3vw,25px)":"clamp(14px,2.5vw,20px)",
      color:"#F5F0E4",textAlign:"right",direction:"rtl",lineHeight:2.3,
      marginBottom:12,textShadow:"0 1px 8px rgba(0,0,0,.5)",
    }}>{q.arabic}</div>
    <div style={{fontSize:11,color:"rgba(255,255,255,.38)",fontStyle:"italic",lineHeight:1.7}}>{q.translation}</div>
  </div>
);

/* Question number card */
const QCard = ({ num, selected, used, onClick }: { num:number; selected:boolean; used:boolean; onClick:()=>void }) => (
  <button onClick={onClick} disabled={used} style={{
    width:60,height:82,borderRadius:12,border:"none",cursor:used?"default":"pointer",
    background:selected
      ? "linear-gradient(135deg,#9B6E10,#c9a84c,#e8c96a)"
      : used ? "rgba(255,255,255,.04)"
      : "linear-gradient(150deg,#0B3D1E,#1A6B3A)",
    outline:`2px solid ${selected?"#e8c96a":used?"rgba(255,255,255,.07)":"rgba(201,168,76,.4)"}`,
    display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
    transform:selected?"translateY(-6px) scale(1.1)":"scale(1)",
    transition:"all .3s cubic-bezier(.175,.885,.32,1.275)",
    boxShadow:selected?"0 12px 32px rgba(201,168,76,.6)":"0 4px 14px rgba(0,0,0,.5)",
    fontFamily:"'Cinzel',serif",
    color:selected?"#071a10":used?"rgba(255,255,255,.12)":GOLD,
    fontSize:22,fontWeight:900,position:"relative",overflow:"hidden",
  }}>
    {selected && <div style={{position:"absolute",inset:0,background:"radial-gradient(circle at 50% 30%,rgba(255,255,255,.25),transparent)"}}/>}
    {num}
    <div style={{fontSize:8,marginTop:3,opacity:.65,letterSpacing:.5,fontWeight:400}}>
      {selected?"SELECTED":used?"USED":"PICK"}
    </div>
  </button>
);

/* Score badge */
const ScoreBadge = ({ score }: { score:number }) => {
  const color = score>=90?"#4CAF50":score>=75?GOLD:score>=60?"#FF9800":"#ef4444";
  return (
    <div style={{
      width:42,height:42,borderRadius:"50%",
      background:`radial-gradient(circle,${color}22,${color}08)`,
      border:`2px solid ${color}`,flexShrink:0,
      display:"flex",alignItems:"center",justifyContent:"center",
      fontFamily:"'Cinzel',serif",fontSize:13,fontWeight:700,color,
    }}>{score}</div>
  );
};

/* ══════════════════════════════════════════════════════════════════
   SCREEN: ENTRY  (3D Quran + room code)
══════════════════════════════════════════════════════════════════ */
const EntryScreen = ({ onEnter }: { onEnter:(role:MyRole, code:string)=>void }) => {
  const [code, setCode]   = useState("");
  const [role, setRole]   = useState<MyRole|"">("");
  const [loading, setLoading] = useState(false);

  const go = () => {
    if (!role || !code.trim()) return;
    setLoading(true);
    SFX.called();
    setTimeout(() => onEnter(role as MyRole, code.trim().toUpperCase()), 600);
  };

  return (
    <div style={{
      minHeight:"100vh",
      background:"radial-gradient(ellipse at 50% 20%,#0B3D1E 0%,#071a10 38%,#020806 100%)",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      position:"relative",overflow:"hidden",padding:"24px 16px",
    }}>
      <Stars/>
      <GeoPattern/>
      {/* Aura glow */}
      <div style={{position:"absolute",width:600,height:300,top:"8%",left:"50%",transform:"translateX(-50%)",
        background:"radial-gradient(ellipse,rgba(201,168,76,.1),transparent 65%)",pointerEvents:"none"}}/>

      {/* Arabic title */}
      <div style={{fontFamily:"'Amiri',serif",fontSize:"clamp(16px,3.5vw,26px)",color:"rgba(201,168,76,.55)",
        textAlign:"center",marginBottom:8,direction:"rtl",letterSpacing:2}}>
        المسابقة القرآنية الدولية
      </div>

      <OpenQuran3D/>

      <h1 style={{
        fontFamily:"'Cinzel Decorative',serif",fontSize:"clamp(14px,2.8vw,24px)",
        color:"#e8c96a",textAlign:"center",letterSpacing:"0.05em",marginBottom:5,
        textShadow:"0 0 35px rgba(201,168,76,.4)",lineHeight:1.3,
      }}>Al-Musabaqah Al-Qur'aniyyah</h1>
      <p style={{fontFamily:"'Cairo',sans-serif",fontSize:11,color:"rgba(255,255,255,.35)",
        letterSpacing:"0.2em",textTransform:"uppercase",marginBottom:32}}>
        International Quran Recitation Competition
      </p>

      {/* Role selection */}
      <div style={{display:"flex",gap:10,marginBottom:26,flexWrap:"wrap",justifyContent:"center"}}>
        {([
          {id:"moderator" as MyRole, icon:"⚖️", label:"Moderator", desc:"Judge & Control"},
          {id:"contestant"as MyRole, icon:"📖", label:"Contestant", desc:"Reciter"},
          {id:"audience"  as MyRole, icon:"👥", label:"Audience",   desc:"Watch & React"},
        ]).map(r=>(
          <button key={r.id} onClick={()=>setRole(r.id)} style={{
            width:110,padding:"14px 8px",borderRadius:14,cursor:"pointer",transition:"all .3s",
            background:role===r.id?"rgba(201,168,76,.12)":"rgba(255,255,255,.04)",
            border:`1.5px solid ${role===r.id?GOLD:"rgba(255,255,255,.09)"}`,
            display:"flex",flexDirection:"column",alignItems:"center",gap:7,
            boxShadow:role===r.id?`0 0 22px rgba(201,168,76,.3)`:"none",
            transform:role===r.id?"translateY(-3px)":"none",
          }}>
            <span style={{fontSize:24}}>{r.icon}</span>
            <span style={{fontFamily:"'Cinzel',serif",fontSize:11,color:role===r.id?GOLD:"rgba(255,255,255,.6)",fontWeight:700}}>{r.label}</span>
            <span style={{fontSize:9,color:"rgba(255,255,255,.28)"}}>{r.desc}</span>
          </button>
        ))}
      </div>

      {/* Room code */}
      <div style={{marginBottom:20,textAlign:"center"}}>
        <div style={{fontSize:10,color:"rgba(201,168,76,.6)",letterSpacing:"0.18em",textTransform:"uppercase",
          marginBottom:8,fontFamily:"'Cairo',sans-serif"}}>Competition Room Code</div>
        <input
          value={code} onChange={e=>setCode(e.target.value.toUpperCase())} maxLength={8}
          placeholder="ENTER CODE" onKeyDown={e=>e.key==="Enter"&&go()}
          style={{
            background:"rgba(255,255,255,.04)",border:"1.5px solid rgba(201,168,76,.38)",
            borderRadius:12,padding:"13px 24px",color:"#e8c96a",fontSize:22,
            fontFamily:"'Cinzel',serif",letterSpacing:"0.3em",textAlign:"center",
            width:220,transition:"border-color .3s",
          }}
        />
      </div>

      <button className="gold-btn" onClick={go} disabled={loading||!role||!code.trim()} style={{
        padding:"14px 52px",fontSize:13,borderRadius:50,
        opacity:role&&code.trim()?1:.4,
        cursor:role&&code.trim()?"pointer":"not-allowed",
      }}>
        {loading?"Joining…":"Enter Competition Hall ▶"}
      </button>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════
   SCREEN: LOBBY
══════════════════════════════════════════════════════════════════ */
const LobbyScreen = ({ role, roomCode, onStart }: { role:MyRole; roomCode:string; onStart:()=>void }) => {
  const [tick, setTick] = useState(0);
  useEffect(()=>{ const iv=setInterval(()=>setTick(t=>t+1),1200); return()=>clearInterval(iv); },[]);
  const participants = [
    {name:"Ustadh Khalid (Head Judge)",role:"moderator",flag:"⚖️"},
    {name:"Ahmad Al-Rashidi",role:"contestant",flag:"🇸🇦"},
    {name:"Fatimah Idris",role:"contestant",flag:"🇳🇬"},
    {name:"Yusuf Al-Qasim",role:"contestant",flag:"🇲🇾"},
    {name:"Khadijah Hassan",role:"contestant",flag:"🇪🇬"},
    {name:`${163+tick%7} Viewers`,role:"audience",flag:"👁️"},
  ];
  return (
    <div style={{
      minHeight:"100vh",
      background:"radial-gradient(ellipse at 50% 0%,#0B3D1E 0%,#020806 60%)",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      position:"relative",padding:24,
    }}>
      <Stars/>
      <div className="glass" style={{borderRadius:22,padding:"36px 28px",maxWidth:460,width:"100%",textAlign:"center",boxShadow:"0 0 80px rgba(0,0,0,.6)"}}>
        <div style={{fontSize:40,marginBottom:10}}>🕌</div>
        <h2 style={{fontFamily:"'Cinzel',serif",color:"#e8c96a",fontSize:20,marginBottom:5}}>Competition Hall</h2>
        <div style={{fontFamily:"'Cairo',sans-serif",fontSize:11,color:"rgba(255,255,255,.35)",marginBottom:8}}>Room Code</div>
        <div style={{fontFamily:"'Cinzel',serif",fontSize:28,color:GOLD,letterSpacing:"0.35em",marginBottom:24,textShadow:"0 0 18px rgba(201,168,76,.4)"}}>{roomCode}</div>

        <div style={{marginBottom:22}}>
          {participants.map((p,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",
              borderBottom:i<participants.length-1?"1px solid rgba(255,255,255,.05)":"none"}}>
              <span style={{fontSize:18}}>{p.flag}</span>
              <span style={{flex:1,color:"rgba(255,255,255,.8)",fontFamily:"'Cairo',sans-serif",fontSize:13,textAlign:"left"}}>{p.name}</span>
              <span style={{
                fontSize:9,padding:"3px 9px",borderRadius:20,letterSpacing:.5,textTransform:"uppercase",fontFamily:"'Cinzel',serif",
                background:p.role==="moderator"?"rgba(201,168,76,.2)":p.role==="contestant"?"rgba(34,197,94,.15)":"rgba(255,255,255,.05)",
                color:p.role==="moderator"?GOLD:p.role==="contestant"?"#22c55e":"rgba(255,255,255,.4)",
                border:`1px solid ${p.role==="moderator"?"rgba(201,168,76,.3)":p.role==="contestant"?"rgba(34,197,94,.3)":"rgba(255,255,255,.09)"}`,
              }}>{p.role}</span>
            </div>
          ))}
        </div>

        <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"center",marginBottom:20}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:"#22c55e",animation:"float 1.5s ease-in-out infinite"}}/>
          <span style={{fontSize:12,color:"rgba(255,255,255,.4)",fontFamily:"'Cairo',sans-serif"}}>Live — {participants.length} connected</span>
        </div>

        {role==="moderator" ? (
          <button className="gold-btn" onClick={()=>{SFX.reveal();onStart();}} style={{padding:"15px 0",fontSize:14,width:"100%",borderRadius:12}}>
            ▶ Begin Competition
          </button>
        ) : (
          <div style={{color:"rgba(255,255,255,.3)",fontSize:13,fontFamily:"'Cairo',sans-serif",padding:"12px 0",animation:"float 2s ease-in-out infinite"}}>
            ⏳ Waiting for moderator to begin…
          </div>
        )}
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════
   COMPETITION SCREEN  — wraps 3 sub-views
══════════════════════════════════════════════════════════════════ */
const CompScreen = ({
  state, dispatch, myRole,
}: {
  state: CompState; dispatch: React.Dispatch<Action>; myRole: MyRole;
}) => {
  const contestant = state.contestants[state.contestantIdx];
  const stage      = STAGES[state.stageIdx];
  const [tickerIdx, setTickerIdx] = useState(0);
  useEffect(()=>{ const iv=setInterval(()=>setTickerIdx(i=>(i+1)%TICKER_MSGS.length),5500); return()=>clearInterval(iv); },[]);

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"#030D07",overflow:"hidden",position:"relative",fontFamily:"'Cairo',sans-serif"}}>

      {/* Floating emoji reactions */}
      {state.floatEmojis.map(e=>(
        <div key={e.id} style={{
          position:"fixed",bottom:130,left:`${e.x}%`,
          fontSize:30,zIndex:9999,pointerEvents:"none",
          animation:"emojiFloat 3.2s ease-out forwards",
        }}>{e.emoji}</div>
      ))}

      {/* Bell flash */}
      {state.bellFlash && (
        <div style={{position:"fixed",inset:0,zIndex:9998,pointerEvents:"none",
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
          background:"rgba(0,0,0,.58)"}}>
          <div style={{position:"relative",width:110,height:110,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{position:"absolute",inset:0,borderRadius:"50%",background:"rgba(201,168,76,.35)",animation:"pulseRing .8s ease-out"}}/>
            <div style={{position:"absolute",inset:12,borderRadius:"50%",background:"rgba(201,168,76,.5)",animation:"pulseRing .8s ease-out .14s"}}/>
            <div style={{width:76,height:76,borderRadius:"50%",background:`radial-gradient(circle,${GOLD},${GOLDD})`,
              display:"flex",alignItems:"center",justifyContent:"center",animation:"bellSwing .7s ease",fontSize:34}}>🔔</div>
          </div>
          <div style={{marginTop:14,fontFamily:"'Cinzel',serif",fontWeight:900,fontSize:20,color:"#fff",letterSpacing:4}}>
            خطأ · MISTAKE
          </div>
        </div>
      )}

      {/* Stop flash */}
      {state.stopFlash && (
        <div style={{position:"fixed",inset:0,zIndex:9997,pointerEvents:"none",
          display:"flex",alignItems:"center",justifyContent:"center",
          background:"rgba(239,68,68,.2)",border:"4px solid #ef4444"}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,animation:"stopPop .3s ease-out"}}>
            <div style={{fontSize:80,lineHeight:1}}>⏹</div>
            <div style={{fontFamily:"'Cinzel',serif",fontWeight:900,fontSize:28,color:"#fff",letterSpacing:6}}>قف · STOP</div>
          </div>
        </div>
      )}

      {/* ── TOP HEADER ── */}
      <div style={{
        background:"linear-gradient(90deg,#061210,#0B3D1E,#061210)",
        borderBottom:"1px solid rgba(201,168,76,.2)",height:54,
        display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px",flexShrink:0,
      }}>
        <div>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:12,color:"#e8c96a",letterSpacing:"0.04em"}}>⟨ Al-Musabaqah Al-Qur'aniyyah ⟩</div>
          <div style={{fontSize:9,color:"rgba(255,255,255,.28)",letterSpacing:"0.1em"}}>International Competition</div>
        </div>

        {/* Stage pills */}
        <div style={{display:"flex",gap:6}}>
          {STAGES.map((s,i)=>(
            <div key={s.id} style={{
              fontSize:9,padding:"4px 12px",borderRadius:20,fontFamily:"'Cinzel',serif",
              background:i===state.stageIdx?"rgba(201,168,76,.2)":i<state.stageIdx?"rgba(34,197,94,.12)":"rgba(255,255,255,.04)",
              color:i===state.stageIdx?"#e8c96a":i<state.stageIdx?"#22c55e":"rgba(255,255,255,.2)",
              border:`1px solid ${i===state.stageIdx?"rgba(201,168,76,.45)":i<state.stageIdx?"rgba(34,197,94,.3)":"rgba(255,255,255,.07)"}`,
              display:"flex",alignItems:"center",gap:4,
            }}>
              {i<state.stageIdx&&"✓ "}{s.abbr}
              {i===state.stageIdx&&state.stageScores[i]&&<ScoreBadge score={state.stageScores[i]!.score}/>}
            </div>
          ))}
        </div>

        {/* Live badge */}
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:"#ef4444",animation:"float 1.2s ease-in-out infinite"}}/>
          <span style={{fontSize:10,color:"#ef4444",fontFamily:"'Cinzel',serif",letterSpacing:1}}>LIVE</span>
          <span style={{fontSize:10,color:"rgba(255,255,255,.3)",marginLeft:4}}>
            👁️ {state.viewerCount}
          </span>
        </div>
      </div>

      {/* ── TICKER ── */}
      <div style={{height:24,background:"rgba(201,168,76,.07)",borderBottom:"1px solid rgba(201,168,76,.1)",
        display:"flex",alignItems:"center",overflow:"hidden",flexShrink:0}}>
        <div style={{fontSize:10,color:"rgba(201,168,76,.75)",letterSpacing:"0.15em",fontFamily:"'Cinzel',serif",
          padding:"0 14px",whiteSpace:"nowrap",transition:"opacity .5s"}}>
          {TICKER_MSGS[tickerIdx]}
        </div>
        <div style={{flex:1,height:1,background:"rgba(201,168,76,.12)"}}/>
        <div style={{padding:"0 14px",fontSize:9,color:"rgba(255,255,255,.28)",fontFamily:"'Cairo',sans-serif"}}>
          {contestant?.flag} {contestant?.name} — {stage.name}
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{flex:1,overflow:"hidden",display:"flex"}}>
        {myRole==="moderator" && <ModView state={state} dispatch={dispatch} contestant={contestant} stage={stage}/>}
        {myRole==="contestant" && <ContView state={state} contestant={contestant} stage={stage}/>}
        {myRole==="audience" && <AudView state={state} dispatch={dispatch} contestant={contestant} stage={stage}/>}
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════
   MODERATOR VIEW
══════════════════════════════════════════════════════════════════ */
const ModView = ({ state, dispatch, contestant, stage }: {
  state:CompState; dispatch:React.Dispatch<Action>;
  contestant:Contestant; stage:typeof STAGES[0];
}) => {
  const { phase, selectedQ, usedQIds, stageIdx, stageScores, bellCount, criteriaInput } = state;
  const totalCriteria = SCORE_CRITERIA.reduce((sum,c)=>sum+(parseInt(criteriaInput[c.key]||"0")||0),0);

  return (
    <div style={{display:"flex",flex:1,overflow:"hidden"}}>

      {/* ── LEFT: Main video area ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",padding:"12px 10px 12px 14px",gap:10,overflow:"hidden",minWidth:0}}>

        {/* Contestant video — dominant */}
        <div style={{flex:phase==="reading"?3:2.2,minHeight:130,position:"relative"}}>
          <VideoFeed
            name={contestant.name}
            subtitle={`${contestant.flag} ${contestant.country}`}
            flag={contestant.flag}
            large isRecording={phase==="reading"}
          />
          {/* Overlay bottom info */}
          <div style={{
            position:"absolute",bottom:0,left:0,right:0,
            background:"linear-gradient(transparent,rgba(0,0,0,.88))",
            padding:"28px 16px 12px",borderRadius:"0 0 14px 14px",
            display:"flex",alignItems:"flex-end",justifyContent:"space-between",
          }}>
            <div>
              <div style={{fontFamily:"'Cinzel',serif",color:"#e8c96a",fontSize:17,fontWeight:700}}>{contestant.flag} {contestant.name}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,.45)",marginTop:2}}>{contestant.country} · Contestant {state.contestantIdx+1}/{state.contestants.length}</div>
            </div>
            {phase==="reading" && <TimerCircle seconds={state.timer} total={stage.time} size={74}/>}
          </div>
          {/* Bell mistake flash on contestant video */}
          {state.bellFlash && (
            <div style={{position:"absolute",inset:0,background:"rgba(255,100,0,.2)",borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:18,color:"#fff",fontWeight:900,background:"rgba(239,68,68,.9)",padding:"10px 30px",borderRadius:12}}>
                🔔 MISTAKE — TAKE AGAIN
              </div>
            </div>
          )}
        </div>

        {/* Verse panel */}
        {(phase==="verse_reveal"||phase==="reading") && selectedQ && (
          <div style={{flex:1,overflowY:"auto"}}>
            <VersePanel q={selectedQ} big/>
          </div>
        )}

        {/* Bell + Stop controls */}
        {phase==="reading" && (
          <div style={{display:"flex",gap:10,flexShrink:0}}>
            <button
              className="bell-btn"
              onClick={()=>{ dispatch({type:"BELL"}); SFX.bell(); setTimeout(()=>dispatch({type:"BELL_END"}),2200); }}
              style={{
                flex:1,padding:"15px 0",borderRadius:50,cursor:"pointer",border:"none",
                background:"linear-gradient(135deg,#7B1A1A,#B91C1C,#DC2626)",color:"#fff",
                fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:15,letterSpacing:"0.05em",
                display:"flex",alignItems:"center",justifyContent:"center",gap:9,
                boxShadow:state.bellFlash?"0 0 40px rgba(239,68,68,.9)":"0 4px 18px rgba(0,0,0,.6)",
                transition:"box-shadow .2s",
              }}
            >
              <span style={{display:"inline-block",animation:state.bellFlash?"bellSwing .8s ease":"none",fontSize:20}}>🔔</span>
              Ring Bell {bellCount>0&&`(${bellCount})`}
            </button>
            <button
              onClick={()=>{ dispatch({type:"STOP"}); SFX.stop(); setTimeout(()=>dispatch({type:"STOP_END"}),2000); }}
              style={{
                flex:1,padding:"15px 0",borderRadius:50,cursor:"pointer",border:"1px solid rgba(201,168,76,.3)",
                background:"linear-gradient(135deg,#0B3D1E,#1A6B3A)",color:GOLD,
                fontFamily:"'Cinzel',serif",fontWeight:700,fontSize:13,letterSpacing:"0.04em",
                display:"flex",alignItems:"center",justifyContent:"center",gap:8,
              }}
            >
              ⏹ Stop Reading
            </button>
          </div>
        )}
      </div>

      {/* ── RIGHT SIDEBAR ── */}
      <div style={{
        width:265,background:"rgba(10,31,18,.35)",
        borderLeft:"1px solid rgba(201,168,76,.1)",
        display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0,
      }}>
        {/* Stage info */}
        <div style={{padding:"12px 14px",borderBottom:"1px solid rgba(255,255,255,.05)",flexShrink:0}}>
          <div style={{fontSize:9,color:"rgba(201,168,76,.65)",letterSpacing:"0.18em",textTransform:"uppercase",marginBottom:3,fontFamily:"'Cinzel',serif"}}>Stage {stageIdx+1} of {STAGES.length}</div>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:12,color:"#e8c96a",fontWeight:700}}>{stage.name}</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,.3)",marginTop:2,lineHeight:1.5}}>{stage.desc} · {stage.time}s</div>
        </div>

        {/* Phase content */}
        <div style={{flex:1,overflowY:"auto",padding:14}}>

          {/* ── question selection ── */}
          {phase==="question_selection" && (
            <div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.45)",marginBottom:12,lineHeight:1.7}}>
                Ask <strong style={{color:"#e8c96a"}}>{contestant.name}</strong> to pick a card number, then select it below and reveal.
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:7,justifyContent:"center",marginBottom:16}}>
                {QUESTIONS.map(q=>(
                  <QCard key={q.id} num={q.id}
                    selected={selectedQ?.id===q.id}
                    used={usedQIds.includes(q.id)&&selectedQ?.id!==q.id}
                    onClick={()=>dispatch({type:"SELECT_Q",q})}
                  />
                ))}
              </div>
              {selectedQ && (
                <button className="gold-btn" style={{width:"100%",padding:"13px 0",borderRadius:10,fontSize:12}}
                  onClick={()=>{ dispatch({type:"REVEAL"}); SFX.reveal(); }}>
                  📢 Reveal & Read Aloud
                </button>
              )}
            </div>
          )}

          {/* ── verse reveal ── */}
          {phase==="verse_reveal" && selectedQ && (
            <div>
              <div style={{background:"rgba(201,168,76,.08)",border:"1px solid rgba(201,168,76,.28)",borderRadius:12,padding:"12px",marginBottom:14}}>
                <div style={{fontSize:9,color:GOLD,fontFamily:"'Cinzel',serif",marginBottom:8,letterSpacing:"0.1em"}}>📢 READ ALOUD NOW:</div>
                <div style={{fontFamily:"'Amiri',serif",fontSize:16,color:"#F5F0E4",direction:"rtl",textAlign:"right",lineHeight:2}}>{selectedQ.arabic}</div>
                <div style={{fontSize:10,color:"rgba(255,255,255,.35)",marginTop:8,fontStyle:"italic"}}>{selectedQ.surah} · {selectedQ.ayah}</div>
              </div>
              <button className="gold-btn" style={{width:"100%",padding:"13px 0",borderRadius:10,fontSize:12}}
                onClick={()=>{ dispatch({type:"START_READING"}); SFX.start?.(); }}>
                ▶ Start Recitation Timer
              </button>
            </div>
          )}

          {/* ── scoring ── */}
          {phase==="scoring" && (
            <div className="stagger-in">
              <div style={{fontFamily:"'Cinzel',serif",fontSize:13,color:"#e8c96a",marginBottom:14}}>Stage {stageIdx+1} Score</div>
              <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid rgba(255,255,255,.05)",marginBottom:10,fontSize:11,color:"rgba(255,255,255,.45)"}}>
                <span>Bell rings (mistakes)</span>
                <span style={{color:"#ef4444",fontWeight:700}}>× {bellCount}</span>
              </div>

              {SCORE_CRITERIA.map(c=>(
                <div key={c.key} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5,fontSize:11}}>
                    <span style={{color:"rgba(255,255,255,.65)",fontFamily:"'Cinzel',serif",letterSpacing:.3}}>{c.label}</span>
                    <span style={{color:GOLD,fontSize:10}}>max {c.max}</span>
                  </div>
                  <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                    {Array.from({length:c.max+1},(_,v)=>v).filter(v=>v%5===0||v===c.max).map(v=>(
                      <button key={v} onClick={()=>dispatch({type:"SET_CRITERIA",key:c.key,val:String(v)})} style={{
                        padding:"4px 8px",borderRadius:7,fontSize:10,cursor:"pointer",border:"none",
                        fontFamily:"'Cinzel',serif",fontWeight:700,
                        background:parseInt(criteriaInput[c.key]||"0")===v?"rgba(201,168,76,.3)":"rgba(255,255,255,.05)",
                        color:parseInt(criteriaInput[c.key]||"0")===v?GOLD:"rgba(255,255,255,.4)",
                        outline:parseInt(criteriaInput[c.key]||"0")===v?"1px solid rgba(201,168,76,.5)":"none",
                        transition:"all .15s",
                      }}>{v}</button>
                    ))}
                    <input type="number" min={0} max={c.max}
                      value={criteriaInput[c.key]||""}
                      onChange={e=>dispatch({type:"SET_CRITERIA",key:c.key,val:e.target.value})}
                      placeholder="—"
                      style={{width:40,background:"rgba(255,255,255,.06)",border:"1px solid rgba(201,168,76,.3)",
                        borderRadius:7,padding:"4px 6px",color:"#e8c96a",fontSize:11,textAlign:"center",fontFamily:"'Cinzel',serif"}}
                    />
                  </div>
                </div>
              ))}

              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",
                borderTop:"1px solid rgba(255,255,255,.08)",marginBottom:14}}>
                <span style={{fontFamily:"'Cinzel',serif",fontSize:12,color:"rgba(255,255,255,.6)"}}>Total Score</span>
                <span style={{fontFamily:"'Cinzel',serif",fontSize:22,fontWeight:900,color:GOLD}}>{totalCriteria}<span style={{fontSize:11,opacity:.5}}>/100</span></span>
              </div>

              <button className="gold-btn" onClick={()=>{ dispatch({type:"SAVE_SCORE"}); SFX.complete(); }}
                style={{width:"100%",padding:"13px 0",borderRadius:10,fontSize:12,opacity:totalCriteria>0?1:.4}}>
                Save & {stageIdx<STAGES.length-1?"Next Stage →":"Finish ✓"}
              </button>
            </div>
          )}

          {/* ── complete ── */}
          {phase==="complete" && (
            <div className="stagger-in" style={{textAlign:"center"}}>
              <div style={{fontSize:38,marginBottom:10}}>🏆</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:15,color:"#e8c96a",marginBottom:16}}>Recitation Complete</div>
              {STAGES.map((s,i)=>(
                <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                  padding:"9px 0",borderBottom:i<STAGES.length-1?"1px solid rgba(255,255,255,.05)":"none"}}>
                  <div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,.5)",fontFamily:"'Cinzel',serif"}}>{s.abbr}</div>
                    {stageScores[i] && <div style={{fontSize:9,color:"rgba(255,255,255,.28)"}}>{stageScores[i]!.bells} bell(s)</div>}
                  </div>
                  {stageScores[i] ? <ScoreBadge score={stageScores[i]!.score}/> : <span style={{color:"rgba(255,255,255,.15)",fontSize:11}}>–</span>}
                </div>
              ))}
              <div style={{marginTop:12,padding:"11px",background:"rgba(201,168,76,.08)",borderRadius:10,
                display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontFamily:"'Cinzel',serif",fontSize:12,color:"#e8c96a"}}>TOTAL</span>
                <span style={{fontFamily:"'Cinzel',serif",fontSize:20,color:"#e8c96a",fontWeight:900}}>
                  {stageScores.reduce((a,s)=>a+(s?.score||0),0)}<span style={{fontSize:10,opacity:.5}}>/300</span>
                </span>
              </div>
              <div style={{marginTop:16}}>
                {state.contestantIdx<state.contestants.length-1 ? (
                  <button className="gold-btn" onClick={()=>{ dispatch({type:"NEXT_CONTESTANT"}); SFX.called(); }}
                    style={{width:"100%",padding:"13px 0",borderRadius:10,fontSize:12}}>
                    📣 Call Next Contestant
                  </button>
                ) : (
                  <div style={{fontSize:12,color:"#22c55e",fontFamily:"'Cinzel',serif",padding:11,
                    background:"rgba(34,197,94,.1)",borderRadius:10}}>
                    🎉 All contestants finished!
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Running score footer */}
        {stageScores.some(s=>s!==null) && (
          <div style={{padding:"9px 14px",borderTop:"1px solid rgba(255,255,255,.05)",flexShrink:0}}>
            <div style={{fontSize:9,color:"rgba(201,168,76,.55)",letterSpacing:"0.15em",marginBottom:7,fontFamily:"'Cinzel',serif",textTransform:"uppercase"}}>Running Score</div>
            {stageScores.map((sc,i)=>sc!==null&&(
              <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"rgba(255,255,255,.5)",marginBottom:3}}>
                <span>Stage {i+1}</span>
                <span style={{color:"#22c55e",fontWeight:700}}>{sc.score}/100</span>
              </div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#e8c96a",marginTop:7,paddingTop:6,borderTop:"1px solid rgba(255,255,255,.05)"}}>
              <span style={{fontFamily:"'Cinzel',serif"}}>Total</span>
              <span style={{fontWeight:700}}>{stageScores.reduce((a,s)=>a+(s?.score||0),0)}/300</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════
   CONTESTANT VIEW  — dominant video + bottom audience strip
══════════════════════════════════════════════════════════════════ */
const ContView = ({ state, contestant, stage }: {
  state:CompState; contestant:Contestant; stage:typeof STAGES[0];
}) => {
  const { phase, selectedQ, timer, bellFlash } = state;
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",padding:"10px 14px 0",gap:10,overflow:"hidden"}}>

      {/* Self video — DOMINANT, takes up half the screen */}
      <div style={{flex:"3 3 0",minHeight:160,position:"relative"}}>
        <VideoFeed name={contestant.name} subtitle={`${contestant.flag} ${contestant.country}`}
          flag={contestant.flag} large isSelf isRecording={phase==="reading"}/>

        {/* Timer overlay */}
        {phase==="reading" && (
          <div style={{position:"absolute",top:14,right:14}}>
            <TimerCircle seconds={timer} total={stage.time} size={78}/>
          </div>
        )}

        {/* Mistake overlay */}
        {bellFlash && (
          <div style={{position:"absolute",inset:0,background:"rgba(239,68,68,.28)",borderRadius:14,
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{background:"rgba(220,38,38,.95)",borderRadius:14,padding:"14px 32px",
              fontFamily:"'Cinzel',serif",fontSize:19,color:"#fff",fontWeight:900,letterSpacing:"0.04em",
              boxShadow:"0 0 40px rgba(239,68,68,.7)",animation:"stopPop .3s ease-out"}}>
              🔔 MISTAKE — TAKE AGAIN
            </div>
          </div>
        )}

        {/* Stage label */}
        <div style={{position:"absolute",top:14,left:14,
          background:"rgba(0,0,0,.65)",borderRadius:8,padding:"4px 12px",
          fontFamily:"'Cinzel',serif",fontSize:10,color:"#e8c96a"}}>
          {stage.abbr} · {stage.name}
        </div>
      </div>

      {/* Verse panel / status */}
      <div style={{flex:"1.2 1.2 0",overflow:"auto"}}>
        {phase==="question_selection" && (
          <div style={{
            height:"100%",background:"rgba(10,31,18,.5)",borderRadius:12,
            border:"1px solid rgba(201,168,76,.18)",
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,
          }}>
            <div style={{fontSize:10,color:"rgba(255,255,255,.35)",letterSpacing:"0.18em",textTransform:"uppercase",fontFamily:"'Cinzel',serif"}}>Choose a Question Card</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
              {[1,2,3,4,5,6,7,8,9].map(n=>(
                <div key={n} style={{width:58,height:80,borderRadius:12,background:"linear-gradient(150deg,#0B3D1E,#1A6B3A)",
                  border:"2px solid rgba(201,168,76,.4)",display:"flex",flexDirection:"column",
                  alignItems:"center",justifyContent:"center",
                  fontFamily:"'Cinzel',serif",fontSize:20,color:GOLD,fontWeight:900,userSelect:"none"}}>
                  {n}<div style={{fontSize:8,opacity:.5,marginTop:3}}>PICK</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.28)",fontStyle:"italic"}}>Tell your number — moderator will select it</div>
          </div>
        )}
        {(phase==="verse_reveal"||phase==="reading") && selectedQ && <VersePanel q={selectedQ} big/>}
        {phase==="verse_reveal" && (
          <div style={{marginTop:10,textAlign:"center",fontSize:13,color:"#22c55e",
            animation:"float 1.5s ease-in-out infinite",fontFamily:"'Cinzel',serif"}}>
            🎙 Moderator reading verse aloud… begin when timer starts
          </div>
        )}
        {phase==="scoring" && (
          <div style={{height:"100%",background:"rgba(10,31,18,.45)",borderRadius:12,
            border:"1px solid rgba(201,168,76,.18)",
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10}}>
            <div style={{fontSize:26,animation:"float 2s ease-in-out infinite"}}>⏳</div>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:15,color:"#e8c96a"}}>Stage {state.stageIdx+1} Complete</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.38)",textAlign:"center",lineHeight:1.7}}>
              Moderator is reviewing your recitation<br/>and entering your score.
            </div>
          </div>
        )}
        {phase==="complete" && (
          <div style={{height:"100%",background:"rgba(10,31,18,.45)",borderRadius:12,
            border:"1px solid rgba(201,168,76,.28)",
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
            <div style={{fontSize:40}}>🏆</div>
            <div style={{fontFamily:"'Cinzel',serif",fontSize:16,color:"#e8c96a"}}>All Stages Complete</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.38)"}}>
              Total: <strong style={{color:"#e8c96a",fontSize:18}}>{state.stageScores.reduce((a,s)=>a+(s?.score||0),0)}</strong>/300
            </div>
            <div style={{fontSize:12,color:"rgba(255,255,255,.3)",fontStyle:"italic"}}>بَارَكَ اللَّهُ فِيكُمْ — Awaiting results</div>
          </div>
        )}
      </div>

      {/* ── AUDIENCE STRIP at bottom ── */}
      <AudienceStrip viewerCount={state.viewerCount}/>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════
   AUDIENCE VIEW  — watch + react
══════════════════════════════════════════════════════════════════ */
const AudView = ({ state, dispatch, contestant, stage }: {
  state:CompState; dispatch:React.Dispatch<Action>;
  contestant:Contestant; stage:typeof STAGES[0];
}) => {
  const { phase, selectedQ, timer, stageScores, bellCount } = state;
  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",padding:"10px 14px 0",gap:10,overflow:"hidden"}}>

      {/* Video feeds row */}
      <div style={{display:"flex",gap:10,flex:"3 3 0",minHeight:0}}>
        {/* Contestant — dominant */}
        <div style={{flex:3,minWidth:0,position:"relative"}}>
          <VideoFeed name={contestant.name} subtitle={`${contestant.flag} ${contestant.country}`}
            flag={contestant.flag} large isRecording={phase==="reading"}/>
          {phase==="reading" && (
            <div style={{position:"absolute",top:12,right:12}}>
              <TimerCircle seconds={timer} total={stage.time} size={64}/>
            </div>
          )}
          <div style={{position:"absolute",bottom:12,left:12,
            background:"rgba(0,0,0,.65)",borderRadius:8,padding:"4px 12px",
            fontFamily:"'Cinzel',serif",fontSize:10,color:"#e8c96a"}}>
            {stage.name}
          </div>
        </div>
        {/* Moderator / Judge feed */}
        <div style={{flex:1,minWidth:70}}>
          <VideoFeed name="Head Judge" subtitle="Moderator" flag="⚖️" isMod/>
        </div>
      </div>

      {/* Verse panel */}
      {(phase==="verse_reveal"||phase==="reading") && selectedQ && (
        <div style={{flex:"1 1 0",overflow:"auto"}}>
          <VersePanel q={selectedQ}/>
        </div>
      )}

      {/* Info strip */}
      <div style={{display:"flex",alignItems:"center",gap:14,padding:"7px 14px",
        background:"rgba(10,31,18,.35)",borderRadius:10,border:"1px solid rgba(255,255,255,.05)",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:"#ef4444",animation:"float 1.2s ease-in-out infinite"}}/>
          <span style={{fontSize:11,color:"rgba(255,255,255,.38)",fontFamily:"'Cairo',sans-serif"}}>
            👁️ {state.viewerCount} watching
          </span>
        </div>
        {bellCount>0 && (
          <div style={{fontSize:11,color:"#FF8C42",display:"flex",alignItems:"center",gap:4}}>
            🔔 <span style={{fontFamily:"'Cinzel',serif"}}>{bellCount} bell{bellCount!==1?"s":""}</span>
          </div>
        )}
        <div style={{flex:1}}/>
        {stageScores.some(s=>s) && (
          <div style={{fontSize:11,color:"rgba(255,255,255,.38)"}}>
            Score: <strong style={{color:"#e8c96a"}}>{stageScores.reduce((a,s)=>a+(s?.score||0),0)}/300</strong>
          </div>
        )}
        <div style={{fontSize:10,color:"rgba(255,255,255,.2)",fontFamily:"'Cinzel',serif"}}>👂 Listen Only</div>
      </div>

      {/* Reaction bar */}
      <div style={{flexShrink:0,background:"rgba(10,31,18,.55)",border:"1px solid rgba(201,168,76,.15)",borderRadius:50,
        padding:"9px 18px",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",justifyContent:"center",marginBottom:4}}>
        <span style={{fontSize:9,color:"rgba(255,255,255,.25)",fontFamily:"'Cairo',sans-serif",marginRight:4,letterSpacing:"0.1em",textTransform:"uppercase"}}>React:</span>
        {REACTIONS.map(emoji=>(
          <button key={emoji}
            onClick={()=>{ dispatch({type:"REACT",emoji}); setTimeout(()=>dispatch({type:"REMOVE_EMOJI",id:Date.now()}),3200); }}
            style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.09)",borderRadius:50,
              padding:"7px 12px",cursor:"pointer",fontSize:18,transition:"all .2s"}}
            onMouseOver={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(201,168,76,.2)";(e.currentTarget as HTMLButtonElement).style.transform="scale(1.18) translateY(-3px)";}}
            onMouseOut={e=>{(e.currentTarget as HTMLButtonElement).style.background="rgba(255,255,255,.05)";(e.currentTarget as HTMLButtonElement).style.transform="scale(1)";}}
          >{emoji}</button>
        ))}
        <span style={{fontSize:9,color:"rgba(255,255,255,.18)",marginLeft:6,fontFamily:"'Cairo',sans-serif"}}>No mic · reactions only</span>
      </div>
    </div>
  );
};

/* Audience strip shown at bottom of contestant view */
const AudienceStrip = ({ viewerCount }: { viewerCount:number }) => (
  <div style={{
    flexShrink:0,
    background:"rgba(10,31,18,.45)",
    borderTop:"1px solid rgba(201,168,76,.12)",
    padding:"8px 14px",
    display:"flex",alignItems:"center",gap:14,flexWrap:"wrap",
    marginLeft:-14,marginRight:-14,
  }}>
    <div style={{fontSize:10,color:"rgba(255,255,255,.3)",fontFamily:"'Cinzel',serif",letterSpacing:"0.12em",textTransform:"uppercase"}}>Audience</div>
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      <div style={{width:6,height:6,borderRadius:"50%",background:"#ef4444",animation:"float 1.2s ease-in-out infinite"}}/>
      <span style={{fontSize:11,color:"rgba(255,255,255,.38)",fontFamily:"'Cairo',sans-serif"}}>👁️ {viewerCount} watching live</span>
    </div>
    <div style={{flex:1}}/>
    {/* Simulated audience avatars */}
    <div style={{display:"flex",gap:3}}>
      {["🇸🇦","🇳🇬","🇲🇾","🇪🇬","🇵🇰","🇧🇩","🇮🇩","🇹🇷","🇬🇧","🇺🇸"].map((f,i)=>(
        <div key={i} style={{fontSize:14,opacity:.7,transition:"transform .2s"}}>{f}</div>
      ))}
      <span style={{fontSize:10,color:"rgba(255,255,255,.25)",fontFamily:"'Cairo',sans-serif",marginLeft:4,alignSelf:"center"}}>+{viewerCount-10}</span>
    </div>
    <div style={{fontSize:9,color:"rgba(255,255,255,.18)",fontFamily:"'Cinzel',serif"}}>Reactions only · no mic</div>
  </div>
);

/* ══════════════════════════════════════════════════════════════════
   ROOT PAGE COMPONENT
══════════════════════════════════════════════════════════════════ */
const MustabaqahPage = () => {
  const navigate         = useNavigate();
  const { user, profile, hasRole } = useAuth();
  const { toast }        = useToast();

  /* Derive my role from Tahleem auth */
  const derivedRole: MyRole = (hasRole("admin")||hasRole("teacher")) ? "moderator" : "contestant";

  /* Screen state */
  const [screen,  setScreen]   = useState<"entry"|"lobby"|"competition">("entry");
  const [myRole,  setMyRole]   = useState<MyRole>(derivedRole);
  const [roomCode,setRoomCode] = useState("");

  /* Competition state */
  const [state, dispatch] = useReducer(reducer, undefined, initState);

  /* Supabase realtime channel */
  const channelRef = useRef<ReturnType<typeof supabase.channel>|null>(null);

  /* Timer effect */
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(()=>{
    if (state.timerRunning && state.timer>0) {
      timerRef.current = setTimeout(()=>dispatch({type:"TICK"}), 1000);
    } else if (state.timer<=0 && state.timerRunning) {
      dispatch({type:"TICK"});
    }
    return ()=>clearTimeout(timerRef.current);
  },[state.timer, state.timerRunning]);

  /* Subscribe to realtime when in competition */
  useEffect(()=>{
    if (screen!=="competition" || !roomCode) return;
    const ch = supabase.channel(`musabaqah:${roomCode}`, { config:{ broadcast:{ self:false } } });
    ch.on("broadcast", { event:"comp_event" }, ({ payload }) => {
      dispatch({ type:"SYNC_EVENT", event:payload });
      if (payload.type==="BELL")  SFX.bell();
      if (payload.type==="STOP")  SFX.stop();
      if (payload.type==="REVEAL") SFX.reveal();
    }).subscribe();
    channelRef.current = ch;
    return ()=>{ ch.unsubscribe(); };
  },[screen, roomCode]);

  /* Broadcast helper (moderator sends events) */
  const broadcast = useCallback((event: object) => {
    channelRef.current?.send({ type:"broadcast", event:"comp_event", payload:event });
  },[]);

  /* Wrapped dispatch: moderator also broadcasts */
  const wrappedDispatch = useCallback((action: Action) => {
    dispatch(action);
    if (myRole==="moderator") {
      if (action.type==="BELL")    broadcast({type:"BELL"});
      if (action.type==="STOP")    broadcast({type:"STOP"});
      if (action.type==="REVEAL") broadcast({type:"REVEAL", q:state.selectedQ});
      if (action.type==="START_READING") broadcast({type:"START_READING"});
      if (action.type==="SAVE_SCORE")    broadcast({type:"SCORING"});
      if (action.type==="SELECT_Q")      broadcast({type:"SELECT_Q", q:(action as any).q});
    }
  },[myRole, broadcast, state.selectedQ]);

  const handleEnter = (role: MyRole, code: string) => {
    setMyRole(role);
    setRoomCode(code);
    toast({ title:"Joining room…", description:`Code: ${code}` });
    setScreen("lobby");
  };

  return (
    <>
      <style>{STYLES}</style>
      {screen==="entry"       && <EntryScreen onEnter={handleEnter}/>}
      {screen==="lobby"       && <LobbyScreen role={myRole} roomCode={roomCode} onStart={()=>setScreen("competition")}/>}
      {screen==="competition" && <CompScreen state={state} dispatch={wrappedDispatch} myRole={myRole}/>}
    </>
  );
};

export default MustabaqahPage;
