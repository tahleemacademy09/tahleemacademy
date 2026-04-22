/*
  MustabaqahPage.tsx — Tahleem Academy
  ══════════════════════════════════════════════════════════════════════
  Al-Musābaqah — Professional Live Qur'an Recitation Competition Arena
  ══════════════════════════════════════════════════════════════════════

  Architecture
  ─────────────
  • Judge/Admin:  Create competition → open registration → start →
                  call participants one by one → ring bell for errors →
                  signal stop → score → advance → view full results.
  • Participant:  Join with room code → await call → unmute mic →
                  recite → receive bell/stop signals → see score.
  • Proctoring:   Moderator panel with camera-on/off status + proctoring
                  flag per participant.

  Supabase tables:  musabaqah_competitions, musabaqah_participants,
                    musabaqah_attempts  (see SQL block at bottom of file)

  Realtime channel: `musabaqah:{competition_id}` (Supabase Broadcast)
  Events:  CALLED | BELL | STOP | SCORE_SUBMITTED | STAGE_CHANGE |
           COMPETITION_END | PROCTOR_FLAG

  Colors:  #0f2d1f green · #c9a84c gold  (Tahleem brand)
  Fonts:   Cairo, Amiri (Arabic), Playfair Display (display)
══════════════════════════════════════════════════════════════════════
*/

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Mic, MicOff, Video, VideoOff, Bell, Square, Play, SkipForward,
  Trophy, Users, Plus, Crown, Clock, Star, BookOpen, AlertTriangle,
  CheckCircle, XCircle, RefreshCw, Download, ChevronRight, Eye,
  EyeOff, Shuffle, Award, Radio, Volume2, Flag, ArrowRight,
  LogIn, Settings, StopCircle, Medal, Loader2, PhoneCall,
  RotateCcw, Hash, LayoutGrid, List,
} from "lucide-react";

/* ══════════════════════════════════════════════════════════════════
   BRAND
══════════════════════════════════════════════════════════════════ */
const G    = "#0f2d1f";
const GM   = "#163d28";
const GD   = "#0a1f12";
const GOLD = "#c9a84c";
const GOLDD= "#a8843a";
const RED  = "#ef4444";
const GREEN = "#22c55e";

/* ══════════════════════════════════════════════════════════════════
   WEB AUDIO — Sound System
══════════════════════════════════════════════════════════════════ */
let _audioCtx: AudioContext | null = null;
const getAudioCtx = () => {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (_audioCtx.state === "suspended") _audioCtx.resume();
  return _audioCtx;
};

/** Traditional competition bell — metallic overtone ring */
const playBellSound = () => {
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    const fundamentals = [440, 880, 1320, 1760];
    fundamentals.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq * (1 + i * 0.002), t);
      gain.gain.setValueAtTime(0.35 / (i + 1), t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 2.5);
    });
  } catch {}
};

/** Referee whistle — sharp double-blast stop signal */
const playStopSound = () => {
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    [0, 0.35].forEach(offset => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(2400, t + offset);
      osc.frequency.linearRampToValueAtTime(2800, t + offset + 0.15);
      gain.gain.setValueAtTime(0.4, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + offset);
      osc.stop(t + offset + 0.35);
    });
  } catch {}
};

/** Ceremonial chime — participant is being called */
const playCalledSound = () => {
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    [523, 659, 784, 1047].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.3, t + i * 0.12 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.7);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + i * 0.12);
      osc.stop(t + i * 0.12 + 0.8);
    });
  } catch {}
};

/** Stage completion fanfare */
const playStageComplete = () => {
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    const seq = [523, 659, 784, 659, 784, 1047];
    seq.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.25, t + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + i * 0.15);
      osc.stop(t + i * 0.15 + 0.35);
    });
  } catch {}
};

/* ══════════════════════════════════════════════════════════════════
   QURAN DATA
══════════════════════════════════════════════════════════════════ */
const SURAHS = [
  {n:1,en:"Al-Fatiha",ar:"الفاتحة",v:7,juz:1},
  {n:2,en:"Al-Baqarah",ar:"البقرة",v:286,juz:1},
  {n:3,en:"Ali 'Imran",ar:"آل عمران",v:200,juz:3},
  {n:4,en:"An-Nisa",ar:"النساء",v:176,juz:4},
  {n:5,en:"Al-Ma'idah",ar:"المائدة",v:120,juz:6},
  {n:6,en:"Al-An'am",ar:"الأنعام",v:165,juz:7},
  {n:7,en:"Al-A'raf",ar:"الأعراف",v:206,juz:8},
  {n:8,en:"Al-Anfal",ar:"الأنفال",v:75,juz:9},
  {n:9,en:"At-Tawbah",ar:"التوبة",v:129,juz:10},
  {n:10,en:"Yunus",ar:"يونس",v:109,juz:11},
  {n:11,en:"Hud",ar:"هود",v:123,juz:11},
  {n:12,en:"Yusuf",ar:"يوسف",v:111,juz:12},
  {n:13,en:"Ar-Ra'd",ar:"الرعد",v:43,juz:13},
  {n:14,en:"Ibrahim",ar:"إبراهيم",v:52,juz:13},
  {n:15,en:"Al-Hijr",ar:"الحجر",v:99,juz:14},
  {n:16,en:"An-Nahl",ar:"النحل",v:128,juz:14},
  {n:17,en:"Al-Isra",ar:"الإسراء",v:111,juz:15},
  {n:18,en:"Al-Kahf",ar:"الكهف",v:110,juz:15},
  {n:19,en:"Maryam",ar:"مريم",v:98,juz:16},
  {n:20,en:"Ta-Ha",ar:"طه",v:135,juz:16},
  {n:21,en:"Al-Anbiya",ar:"الأنبياء",v:112,juz:17},
  {n:22,en:"Al-Hajj",ar:"الحج",v:78,juz:17},
  {n:23,en:"Al-Mu'minun",ar:"المؤمنون",v:118,juz:18},
  {n:24,en:"An-Nur",ar:"النور",v:64,juz:18},
  {n:25,en:"Al-Furqan",ar:"الفرقان",v:77,juz:18},
  {n:26,en:"Ash-Shu'ara",ar:"الشعراء",v:227,juz:19},
  {n:27,en:"An-Naml",ar:"النمل",v:93,juz:19},
  {n:28,en:"Al-Qasas",ar:"القصص",v:88,juz:20},
  {n:29,en:"Al-Ankabut",ar:"العنكبوت",v:69,juz:20},
  {n:30,en:"Ar-Rum",ar:"الروم",v:60,juz:21},
  {n:36,en:"Ya-Sin",ar:"يس",v:83,juz:22},
  {n:55,en:"Ar-Rahman",ar:"الرحمن",v:78,juz:27},
  {n:56,en:"Al-Waqi'ah",ar:"الواقعة",v:96,juz:27},
  {n:67,en:"Al-Mulk",ar:"الملك",v:30,juz:29},
  {n:78,en:"An-Naba'",ar:"النبأ",v:40,juz:30},
  {n:87,en:"Al-A'la",ar:"الأعلى",v:19,juz:30},
  {n:88,en:"Al-Ghashiyah",ar:"الغاشية",v:26,juz:30},
  {n:89,en:"Al-Fajr",ar:"الفجر",v:30,juz:30},
  {n:93,en:"Ad-Duha",ar:"الضحى",v:11,juz:30},
  {n:94,en:"Ash-Sharh",ar:"الشرح",v:8,juz:30},
  {n:96,en:"Al-'Alaq",ar:"العلق",v:19,juz:30},
  {n:99,en:"Az-Zalzalah",ar:"الزلزلة",v:8,juz:30},
  {n:100,en:"Al-'Adiyat",ar:"العاديات",v:11,juz:30},
  {n:101,en:"Al-Qari'ah",ar:"القارعة",v:11,juz:30},
  {n:102,en:"At-Takathur",ar:"التكاثر",v:8,juz:30},
  {n:103,en:"Al-'Asr",ar:"العصر",v:3,juz:30},
  {n:104,en:"Al-Humazah",ar:"الهمزة",v:9,juz:30},
  {n:105,en:"Al-Fil",ar:"الفيل",v:5,juz:30},
  {n:106,en:"Quraysh",ar:"قريش",v:4,juz:30},
  {n:107,en:"Al-Ma'un",ar:"الماعون",v:7,juz:30},
  {n:108,en:"Al-Kawthar",ar:"الكوثر",v:3,juz:30},
  {n:109,en:"Al-Kafirun",ar:"الكافرون",v:6,juz:30},
  {n:110,en:"An-Nasr",ar:"النصر",v:3,juz:30},
  {n:111,en:"Al-Masad",ar:"المسد",v:5,juz:30},
  {n:112,en:"Al-Ikhlas",ar:"الإخلاص",v:4,juz:30},
  {n:113,en:"Al-Falaq",ar:"الفلق",v:5,juz:30},
  {n:114,en:"An-Nas",ar:"الناس",v:6,juz:30},
];

const JUZ_NAMES: Record<number, string> = {
  1:"Alif Lam Mim",2:"Sayaqul",3:"Tilkar Rusul",4:"Lan Tanaloo",
  5:"Wal Muhsanat",6:"La Yuhibbullah",7:"Wa Idha Sami'u",
  8:"Wa Law Annana",9:"Qalal Mala",10:"Wa'lamu",11:"Ya'tadhirun",
  12:"Wa Ma Min Dabbah",13:"Wa Ma Ubari'u",14:"Rubama",
  15:"Subhana Allathi",16:"Qala Alam",17:"Iqtaraba",18:"Qad Aflaha",
  19:"Wa Qalallathina",20:"Amman Khalaqa",21:"Utlu Ma Uhiya",
  22:"Wa Man Yaqnut",23:"Wa Mali",24:"Fa Man Azlamu",
  25:"Ilayhi Yuraddu",26:"Ha Mim",27:"Qala Fa Ma Khatbukum",
  28:"Qad Sami'Allah",29:"Tabarakal Lathi",30:"Amma"
};

const SCOPE_OPTIONS = [
  { id: "juz30",    label: "Juz 30 (Amma)",   labelAr: "جزء عم",   desc: "Short surahs — ideal for juniors" },
  { id: "juz29",    label: "Juz 29–30",        labelAr: "جزء تبارك وعم", desc: "Two final juz" },
  { id: "full30",   label: "Full 30 Juz",      labelAr: "القرآن كاملاً",  desc: "Entire Quran — advanced" },
  { id: "custom",   label: "Custom Scope",     labelAr: "نطاق مخصص",      desc: "Pick specific juz/surah" },
];

const SCORING_CRITERIA = [
  { key: "tajweed",    label: "Tajweed",    labelAr: "التجويد",    max: 40 },
  { key: "memorize",  label: "Hifdh",      labelAr: "الحفظ",      max: 30 },
  { key: "fluency",   label: "Fluency",    labelAr: "الطلاقة",    max: 20 },
  { key: "voice",     label: "Voice",      labelAr: "الصوت",      max: 10 },
];

/* ══════════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════════ */
type CompStatus = "draft"|"open"|"active"|"paused"|"completed";
type PStatus    = "waiting"|"called"|"reciting"|"completed"|"absent"|"disqualified";

interface Competition {
  id: string;
  title: string;
  description?: string;
  scope_type: string; // juz30 | juz29 | full30 | custom
  scope_config: any;
  total_stages: number;
  current_stage: number;
  time_limit_seconds: number;
  status: CompStatus;
  current_participant_id?: string | null;
  room_code: string;
  created_by: string;
  created_at: string;
  use_criteria_scoring: boolean;
}

interface Participant {
  id: string;
  competition_id: string;
  user_id?: string;
  participant_name: string;
  school?: string;
  queue_position: number;
  status: PStatus;
  total_score: number;
  stage_scores: Record<string, number>;
  bell_counts: Record<string, number>;
  proctor_flagged: boolean;
  camera_on: boolean;
  created_at: string;
}

interface Attempt {
  id: string;
  competition_id: string;
  participant_id: string;
  stage_number: number;
  scope_label: string;
  scope_label_ar: string;
  bell_count: number;
  score_breakdown?: Record<string, number>;
  judge_score?: number;
  judge_comment?: string;
  duration_seconds?: number;
  status: "pending"|"reciting"|"scored";
  created_at: string;
}

/* ══════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════ */
const genRoomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

const pickRandomScope = (scopeType: string): {label: string, labelAr: string} => {
  if (scopeType === "juz30") {
    const s = SURAHS.filter(s => s.juz === 30);
    const chosen = s[Math.floor(Math.random() * s.length)];
    const ayah   = Math.floor(Math.random() * chosen.v) + 1;
    return { label: `${chosen.en} (Ayah ${ayah})`, labelAr: `سورة ${chosen.ar} (الآية ${ayah})` };
  }
  if (scopeType === "juz29") {
    const juz = Math.random() > 0.5 ? 29 : 30;
    const s   = SURAHS.filter(s => s.juz === juz);
    const chosen = s[Math.floor(Math.random() * s.length)];
    const ayah = Math.floor(Math.random() * Math.min(chosen.v, 20)) + 1;
    return { label: `${chosen.en} (Ayah ${ayah})`, labelAr: `سورة ${chosen.ar} (الآية ${ayah})` };
  }
  if (scopeType === "full30") {
    const juz = Math.floor(Math.random() * 30) + 1;
    return { label: `Juz ${juz} — ${JUZ_NAMES[juz]}`, labelAr: `الجزء ${juz} — ${JUZ_NAMES[juz]}` };
  }
  return { label: "Custom selection", labelAr: "اختيار مخصص" };
};

const fmtTime = (s: number) => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

const statusColor: Record<PStatus, string> = {
  waiting:      GOLD,
  called:       "#f97316",
  reciting:     GREEN,
  completed:    "#60a5fa",
  absent:       "#6b7280",
  disqualified: RED,
};

const statusLabel: Record<PStatus, string> = {
  waiting:      "Waiting",
  called:       "Called",
  reciting:     "Reciting",
  completed:    "Completed",
  absent:       "Absent",
  disqualified: "Disqualified",
};

/* ══════════════════════════════════════════════════════════════════
   Islamic SVG Background
══════════════════════════════════════════════════════════════════ */
const IslamicBg = ({ opacity=0.05 }: {opacity?: number}) => (
  <svg style={{ position:"absolute",top:0,left:0,width:"100%",height:"100%",
    opacity,zIndex:0,pointerEvents:"none" }} xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="mp-pat" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
        <polygon points="40,4 46,28 70,28 52,44 58,68 40,52 22,68 28,44 10,28 34,28"
          fill="none" stroke={GOLD} strokeWidth="0.6"/>
        <circle cx="40" cy="40" r="2.5" fill="none" stroke={GOLD} strokeWidth="0.4"/>
        <line x1="0" y1="40" x2="80" y2="40" stroke={GOLD} strokeWidth="0.15" opacity="0.5"/>
        <line x1="40" y1="0" x2="40" y2="80" stroke={GOLD} strokeWidth="0.15" opacity="0.5"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#mp-pat)"/>
  </svg>
);

/* ══════════════════════════════════════════════════════════════════
   ANIMATED BELL INDICATOR
══════════════════════════════════════════════════════════════════ */
const BellFlash = ({ visible }: {visible: boolean}) => (
  <div style={{
    position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)",
    zIndex:9999, pointerEvents:"none",
    opacity: visible ? 1 : 0,
    transition: "opacity 0.2s",
    display:"flex", flexDirection:"column", alignItems:"center", gap:8,
  }}>
    <div style={{
      width:120, height:120, borderRadius:"50%",
      background: `radial-gradient(circle, rgba(234,179,8,0.9) 0%, rgba(234,179,8,0.4) 60%, transparent 100%)`,
      display:"flex", alignItems:"center", justifyContent:"center",
      animation: visible ? "bellPulse 0.4s ease-in-out" : "none",
    }}>
      <Bell size={52} color="#fff" strokeWidth={2.5}/>
    </div>
    <span style={{ color:"#fff", fontFamily:"Cairo,sans-serif", fontWeight:700,
      fontSize:18, textShadow:"0 2px 8px rgba(0,0,0,0.9)", letterSpacing:2 }}>
      خطأ • ERROR
    </span>
    <style>{`@keyframes bellPulse{0%{transform:scale(0.8)}50%{transform:scale(1.15)}100%{transform:scale(1)}}`}</style>
  </div>
);

/* ══════════════════════════════════════════════════════════════════
   STOP FLASH INDICATOR
══════════════════════════════════════════════════════════════════ */
const StopFlash = ({ visible }: {visible: boolean}) => (
  <div style={{
    position:"fixed", top:0, left:0, right:0, bottom:0,
    zIndex:9998, pointerEvents:"none",
    background: visible ? "rgba(239,68,68,0.25)" : "transparent",
    borderRadius:0, border: visible ? `6px solid ${RED}` : "none",
    transition: "all 0.15s",
    display:"flex", alignItems:"center", justifyContent:"center",
  }}>
    {visible && (
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
        <StopCircle size={80} color={RED} strokeWidth={2}/>
        <span style={{ color:"#fff", fontFamily:"Cairo,sans-serif", fontWeight:800,
          fontSize:28, textShadow:"0 2px 12px rgba(0,0,0,0.9)", letterSpacing:4 }}>
          قف • STOP
        </span>
      </div>
    )}
  </div>
);

/* ══════════════════════════════════════════════════════════════════
   PARTICIPANT AVATAR
══════════════════════════════════════════════════════════════════ */
const Avatar = ({ name, size=48, active=false }: { name:string, size?:number, active?:boolean }) => {
  const initials = name.split(" ").slice(0,2).map(w => w[0]?.toUpperCase()||"").join("");
  return (
    <div style={{
      width:size, height:size, borderRadius:"50%",
      background: active
        ? `linear-gradient(135deg, ${GOLD} 0%, ${GOLDD} 100%)`
        : `linear-gradient(135deg, ${GM} 0%, #0a1f12 100%)`,
      border: active ? `3px solid ${GOLD}` : `2px solid rgba(201,168,76,0.3)`,
      display:"flex", alignItems:"center", justifyContent:"center",
      color: active ? G : GOLD,
      fontWeight:700, fontFamily:"Cairo,sans-serif",
      fontSize: size * 0.35, flexShrink:0,
      boxShadow: active ? `0 0 20px rgba(201,168,76,0.5)` : "none",
    }}>
      {initials || "?"}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════
   VIDEO TILE  (local camera preview)
══════════════════════════════════════════════════════════════════ */
const VideoTile = ({ stream, name, size=200, active=false }:
  { stream: MediaStream|null, name:string, size?:number, active?:boolean }) => {
  const vidRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (vidRef.current && stream) {
      vidRef.current.srcObject = stream;
    }
  }, [stream]);
  return (
    <div style={{
      width:size, height:size * 0.75, borderRadius:12,
      overflow:"hidden", position:"relative",
      background: `linear-gradient(135deg, ${GD} 0%, ${G} 100%)`,
      border: active ? `2px solid ${GOLD}` : `1.5px solid rgba(201,168,76,0.2)`,
      boxShadow: active ? `0 0 30px rgba(201,168,76,0.3)` : "none",
    }}>
      {stream ? (
        <video ref={vidRef} autoPlay muted playsInline style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
      ) : (
        <div style={{ width:"100%", height:"100%", display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center", gap:8 }}>
          <Avatar name={name} size={size * 0.3} active={active}/>
          <span style={{ color:"rgba(255,255,255,0.5)", fontSize:11, fontFamily:"Cairo,sans-serif" }}>
            No Video
          </span>
        </div>
      )}
      {active && (
        <div style={{ position:"absolute", top:8, right:8, width:10, height:10,
          borderRadius:"50%", background:GREEN, animation:"recitingPulse 1s ease-in-out infinite" }}/>
      )}
      <style>{`@keyframes recitingPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(1.4)}}`}</style>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════ */
export default function MustabaqahPage() {
  const navigate       = useNavigate();
  const { user, profile, hasRole } = useAuth() as any;
  const { toast }      = useToast();
  const isJudge        = hasRole?.("admin") || hasRole?.("teacher");

  /* ── View state ──────────────────────────────────────────────── */
  type View = "list"|"setup"|"join"|"arena"|"results";
  const [view,         setView]         = useState<View>("list");
  const [loading,      setLoading]      = useState(false);

  /* ── Data ────────────────────────────────────────────────────── */
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competition,  setCompetition]  = useState<Competition|null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [attempts,     setAttempts]     = useState<Attempt[]>([]);
  const [myParticipant,setMyParticipant]= useState<Participant|null>(null);

  /* ── Arena UI state ──────────────────────────────────────────── */
  const [activeP,      setActiveP]      = useState<Participant|null>(null);
  const [currentAttempt,setCurAttempt]  = useState<Attempt|null>(null);
  const [bellCount,    setBellCount]    = useState(0);
  const [bellFlash,    setBellFlash]    = useState(false);
  const [stopFlash,    setStopFlash]    = useState(false);
  const [timerActive,  setTimerActive]  = useState(false);
  const [timerSecs,    setTimerSecs]    = useState(0);
  const [rosterMode,   setRosterMode]   = useState<"grid"|"list">("list");
  const [showProctor,  setShowProctor]  = useState(false);

  /* ── Scoring state ───────────────────────────────────────────── */
  const [scoreBreak, setScoreBreak]     = useState<Record<string,string>>({
    tajweed:"", memorize:"", fluency:"", voice:"",
  });
  const [judgeComment, setJudgeComment] = useState("");
  const [showScorePanel, setShowScore]  = useState(false);

  /* ── Local media ─────────────────────────────────────────────── */
  const [localStream,  setLocalStream]  = useState<MediaStream|null>(null);
  const [micOn,        setMicOn]        = useState(false);
  const [camOn,        setCamOn]        = useState(false);

  /* ── Setup form ──────────────────────────────────────────────── */
  const [form, setForm] = useState({
    title:"", description:"",
    scope_type:"juz30", total_stages:5, time_limit:300,
    use_criteria: true,
    customJuz: 30,
  });

  /* ── Join form ───────────────────────────────────────────────── */
  const [joinForm, setJoinForm] = useState({ room_code:"", name:"", school:"" });

  /* ── Refs ────────────────────────────────────────────────────── */
  const channelRef  = useRef<any>(null);
  const timerRef    = useRef<any>(null);
  const bellSoundsRef = useRef<number>(0);

  /* ══════════════════════════════════════════════════════════════
     LOAD COMPETITIONS
  ══════════════════════════════════════════════════════════════ */
  useEffect(() => { loadCompetitions(); }, []);

  const loadCompetitions = async () => {
    const { data } = await supabase
      .from("musabaqah_competitions" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setCompetitions(data as Competition[]);
  };

  /* ══════════════════════════════════════════════════════════════
     REALTIME CHANNEL
  ══════════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!competition) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const ch = supabase
      .channel(`musabaqah:${competition.id}`)
      .on("broadcast", { event: "BELL" }, ({ payload }: any) => {
        playBellSound();
        setBellFlash(true);
        setBellCount(payload.count ?? 0);
        setTimeout(() => setBellFlash(false), 2500);
      })
      .on("broadcast", { event: "STOP" }, () => {
        playStopSound();
        setStopFlash(true);
        setTimerActive(false);
        setTimeout(() => setStopFlash(false), 2500);
      })
      .on("broadcast", { event: "CALLED" }, ({ payload }: any) => {
        loadParticipants();
        loadAttempts();
        setBellCount(0);
        setTimerSecs(0);
        setShowScore(false);
        if (payload.participant_id === myParticipant?.id) {
          playCalledSound();
          try { navigator.vibrate?.([400, 100, 400, 100, 800]); } catch {}
          toast({ title: "🎙️ You have been called!", description: "Please unmute your microphone and begin reciting." });
        }
      })
      .on("broadcast", { event: "SCORE_SUBMITTED" }, () => {
        loadParticipants();
        loadAttempts();
        setShowScore(false);
      })
      .on("broadcast", { event: "STAGE_CHANGE" }, ({ payload }: any) => {
        setCompetition(c => c ? { ...c, current_stage: payload.stage } : c);
        playStageComplete();
        setBellCount(0);
        setActiveP(null);
        setCurAttempt(null);
        loadParticipants();
        loadAttempts();
      })
      .on("broadcast", { event: "COMPETITION_END" }, () => {
        setCompetition(c => c ? { ...c, status: "completed" } : c);
        playStageComplete();
        setTimeout(() => setView("results"), 1200);
      })
      .on("broadcast", { event: "PROCTOR_FLAG" }, ({ payload }: any) => {
        setParticipants(ps => ps.map(p =>
          p.id === payload.participant_id ? { ...p, proctor_flagged: payload.flagged } : p
        ));
      })
      .on("postgres_changes" as any, {
        event: "*", schema: "public",
        table: "musabaqah_participants",
        filter: `competition_id=eq.${competition.id}`,
      }, () => { loadParticipants(); })
      .subscribe();

    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [competition?.id, myParticipant?.id]);

  /* ══════════════════════════════════════════════════════════════
     TIMER
  ══════════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (timerActive) {
      timerRef.current = setInterval(() => setTimerSecs(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [timerActive]);

  /* ══════════════════════════════════════════════════════════════
     DATA LOADERS
  ══════════════════════════════════════════════════════════════ */
  const loadParticipants = useCallback(async () => {
    if (!competition) return;
    const { data } = await supabase
      .from("musabaqah_participants" as any)
      .select("*")
      .eq("competition_id", competition.id)
      .order("queue_position");
    if (data) {
      setParticipants(data as Participant[]);
      if (competition.current_participant_id) {
        setActiveP((data as Participant[]).find(p => p.id === competition.current_participant_id) || null);
      }
      if (user) {
        const mine = (data as Participant[]).find(p => p.user_id === user.id);
        if (mine) setMyParticipant(mine);
      }
    }
  }, [competition, user]);

  const loadAttempts = useCallback(async () => {
    if (!competition) return;
    const { data } = await supabase
      .from("musabaqah_attempts" as any)
      .select("*")
      .eq("competition_id", competition.id)
      .order("created_at");
    if (data) setAttempts(data as Attempt[]);
  }, [competition]);

  useEffect(() => {
    if (competition) { loadParticipants(); loadAttempts(); }
  }, [competition]);

  /* ══════════════════════════════════════════════════════════════
     BROADCAST HELPER
  ══════════════════════════════════════════════════════════════ */
  const broadcast = (event: string, payload: object = {}) => {
    channelRef.current?.send({ type: "broadcast", event, payload });
  };

  /* ══════════════════════════════════════════════════════════════
     LOCAL MEDIA
  ══════════════════════════════════════════════════════════════ */
  const toggleMic = async () => {
    if (!micOn) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: camOn });
        setLocalStream(s);
        setMicOn(true);
        // Update camera_on in DB
        if (myParticipant) {
          await supabase.from("musabaqah_participants" as any)
            .update({ camera_on: camOn })
            .eq("id", myParticipant.id);
        }
      } catch { toast({ title:"Mic access denied", variant:"destructive" }); }
    } else {
      localStream?.getAudioTracks().forEach(t => { t.enabled = false; t.stop(); });
      setMicOn(false);
    }
  };

  const toggleCam = async () => {
    if (!camOn) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: micOn, video: true });
        setLocalStream(s);
        setCamOn(true);
        if (myParticipant) {
          await supabase.from("musabaqah_participants" as any)
            .update({ camera_on: true })
            .eq("id", myParticipant.id);
        }
      } catch { toast({ title:"Camera access denied", variant:"destructive" }); }
    } else {
      localStream?.getVideoTracks().forEach(t => { t.enabled = false; t.stop(); });
      setCamOn(false);
      if (myParticipant) {
        await supabase.from("musabaqah_participants" as any)
          .update({ camera_on: false })
          .eq("id", myParticipant.id);
      }
    }
  };

  /* ══════════════════════════════════════════════════════════════
     JUDGE ACTIONS
  ══════════════════════════════════════════════════════════════ */
  const ringBell = async () => {
    const newCount = bellCount + 1;
    bellSoundsRef.current = newCount;
    setBellCount(newCount);
    playBellSound();
    setBellFlash(true);
    setTimeout(() => setBellFlash(false), 2500);
    broadcast("BELL", { count: newCount });
    // Update attempt bell count
    if (currentAttempt) {
      await supabase.from("musabaqah_attempts" as any)
        .update({ bell_count: newCount })
        .eq("id", currentAttempt.id);
    }
  };

  const signalStop = async () => {
    playStopSound();
    setStopFlash(true);
    setTimerActive(false);
    setTimeout(() => setStopFlash(false), 2500);
    broadcast("STOP");
    setShowScore(true);
    if (currentAttempt) {
      await supabase.from("musabaqah_attempts" as any)
        .update({ status: "scored", duration_seconds: timerSecs })
        .eq("id", currentAttempt.id);
    }
    if (activeP) {
      await supabase.from("musabaqah_participants" as any)
        .update({ status: "completed" })
        .eq("id", activeP.id);
    }
  };

  const callParticipant = async (p: Participant) => {
    if (!competition) return;
    setBellCount(0);
    setTimerSecs(0);
    setShowScore(false);
    setScoreBreak({ tajweed:"", memorize:"", fluency:"", voice:"" });
    setJudgeComment("");

    // Pick scope
    const scope = pickRandomScope(competition.scope_type);

    // Create attempt
    const { data: att } = await supabase.from("musabaqah_attempts" as any).insert({
      competition_id: competition.id,
      participant_id: p.id,
      stage_number: competition.current_stage,
      scope_label: scope.label,
      scope_label_ar: scope.labelAr,
      bell_count: 0,
      status: "reciting",
    }).select().single();

    if (att) setCurAttempt(att as Attempt);

    // Update participant + competition
    await supabase.from("musabaqah_participants" as any)
      .update({ status: "called" }).eq("id", p.id);
    await supabase.from("musabaqah_competitions" as any)
      .update({ current_participant_id: p.id }).eq("id", competition.id);

    setActiveP(p);
    setCompetition(c => c ? { ...c, current_participant_id: p.id } : c);

    playCalledSound();
    broadcast("CALLED", {
      participant_id: p.id,
      participant_name: p.participant_name,
      scope_label: scope.label,
      scope_label_ar: scope.labelAr,
    });
  };

  const startReciting = async () => {
    if (!activeP) return;
    await supabase.from("musabaqah_participants" as any)
      .update({ status: "reciting" }).eq("id", activeP.id);
    setActiveP(p => p ? { ...p, status: "reciting" } : p);
    setTimerActive(true);
  };

  const submitScore = async () => {
    if (!activeP || !currentAttempt) return;
    let totalScore = 0;
    const breakdown: Record<string, number> = {};
    if (competition?.use_criteria_scoring) {
      SCORING_CRITERIA.forEach(c => {
        const v = Number(scoreBreak[c.key]) || 0;
        breakdown[c.key] = Math.min(v, c.max);
        totalScore += breakdown[c.key];
      });
    } else {
      totalScore = Number(scoreBreak.tajweed) || 0;
    }

    // Bell deduction (each bell = -2 from judge's discretion)
    const bellPenalty = bellCount * 2;
    totalScore = Math.max(0, totalScore - bellPenalty);

    // Update attempt
    await supabase.from("musabaqah_attempts" as any)
      .update({
        judge_score: totalScore,
        score_breakdown: breakdown,
        judge_comment: judgeComment,
        bell_count: bellCount,
        status: "scored",
      }).eq("id", currentAttempt.id);

    // Update participant total
    const newTotal = (activeP.total_score || 0) + totalScore;
    const newStageScores = {
      ...(activeP.stage_scores || {}),
      [competition!.current_stage]: totalScore,
    };
    await supabase.from("musabaqah_participants" as any)
      .update({
        status: "completed",
        total_score: newTotal,
        stage_scores: newStageScores,
      }).eq("id", activeP.id);

    broadcast("SCORE_SUBMITTED", { participant_id: activeP.id, score: totalScore });
    toast({ title: `✅ Score saved: ${totalScore} pts — ${activeP.participant_name}` });

    setActiveP(null);
    setCurAttempt(null);
    setShowScore(false);
    setBellCount(0);
    setTimerSecs(0);
    setTimerActive(false);
    loadParticipants();
    loadAttempts();
  };

  const advanceStage = async () => {
    if (!competition) return;
    const nextStage = competition.current_stage + 1;
    if (nextStage > competition.total_stages) {
      // End competition
      await supabase.from("musabaqah_competitions" as any)
        .update({ status: "completed", current_participant_id: null }).eq("id", competition.id);
      // Reset all participants to waiting for next stage
      broadcast("COMPETITION_END");
      setView("results");
      return;
    }
    // Reset participants to waiting
    await supabase.from("musabaqah_participants" as any)
      .update({ status: "waiting" })
      .eq("competition_id", competition.id);
    await supabase.from("musabaqah_competitions" as any)
      .update({ current_stage: nextStage, current_participant_id: null })
      .eq("id", competition.id);
    setCompetition(c => c ? { ...c, current_stage: nextStage, current_participant_id: null } : c);
    broadcast("STAGE_CHANGE", { stage: nextStage });
    toast({ title: `🎯 Stage ${nextStage} of ${competition.total_stages} begins!` });
    loadParticipants();
  };

  const toggleProctoringFlag = async (p: Participant) => {
    const flagged = !p.proctor_flagged;
    await supabase.from("musabaqah_participants" as any)
      .update({ proctor_flagged: flagged }).eq("id", p.id);
    broadcast("PROCTOR_FLAG", { participant_id: p.id, flagged });
  };

  /* ══════════════════════════════════════════════════════════════
     CREATE COMPETITION
  ══════════════════════════════════════════════════════════════ */
  const createCompetition = async () => {
    if (!form.title.trim()) { toast({ title:"Enter a competition title", variant:"destructive" }); return; }
    setLoading(true);
    const room_code = genRoomCode();
    const { data, error } = await supabase.from("musabaqah_competitions" as any).insert({
      title: form.title.trim(),
      description: form.description.trim(),
      scope_type: form.scope_type,
      scope_config: { customJuz: form.customJuz },
      total_stages: form.total_stages,
      current_stage: 1,
      time_limit_seconds: form.time_limit,
      status: "open",
      room_code,
      created_by: user?.id,
      use_criteria_scoring: form.use_criteria,
    }).select().single();
    setLoading(false);
    if (error) { toast({ title:"Error creating competition", description: error.message, variant:"destructive" }); return; }
    setCompetition(data as Competition);
    setView("arena");
    toast({ title: `🏆 Competition created! Room code: ${room_code}` });
  };

  /* ══════════════════════════════════════════════════════════════
     JOIN COMPETITION
  ══════════════════════════════════════════════════════════════ */
  const joinCompetition = async () => {
    const code = joinForm.room_code.trim().toUpperCase();
    const name  = joinForm.name.trim();
    if (!code || !name) { toast({ title:"Fill all fields", variant:"destructive" }); return; }
    setLoading(true);
    const { data: comp } = await supabase.from("musabaqah_competitions" as any)
      .select("*").eq("room_code", code).single();
    if (!comp) { toast({ title:"Competition not found", description:`No open competition with code ${code}`, variant:"destructive" }); setLoading(false); return; }

    // Check if already joined
    const { data: existing } = await supabase.from("musabaqah_participants" as any)
      .select("*").eq("competition_id", (comp as Competition).id).eq("user_id", user?.id).single();
    if (existing) {
      setCompetition(comp as Competition);
      setMyParticipant(existing as Participant);
      setLoading(false);
      setView("arena");
      return;
    }

    // Get next queue position
    const { count } = await supabase.from("musabaqah_participants" as any)
      .select("id", { count: "exact" }).eq("competition_id", (comp as Competition).id);

    const { data: participant } = await supabase.from("musabaqah_participants" as any).insert({
      competition_id: (comp as Competition).id,
      user_id: user?.id,
      participant_name: name,
      school: joinForm.school,
      queue_position: (count || 0) + 1,
      status: "waiting",
      total_score: 0,
      stage_scores: {},
      bell_counts: {},
      proctor_flagged: false,
      camera_on: false,
    }).select().single();

    setLoading(false);
    if (participant) {
      setCompetition(comp as Competition);
      setMyParticipant(participant as Participant);
      setView("arena");
      toast({ title: "✅ Joined! Welcome to the competition." });
    }
  };

  const openComp = async (comp: Competition) => {
    setCompetition(comp);
    // Check if judge already or participant
    if (isJudge) { setView("arena"); return; }
    // Check if participant
    const { data } = await supabase.from("musabaqah_participants" as any)
      .select("*").eq("competition_id", comp.id).eq("user_id", user?.id).single();
    if (data) { setMyParticipant(data as Participant); setView("arena"); }
    else setView("join");
  };

  /* ══════════════════════════════════════════════════════════════
     OPEN COMPETITION (for registration)
  ══════════════════════════════════════════════════════════════ */
  const openForRegistration = async () => {
    if (!competition) return;
    await supabase.from("musabaqah_competitions" as any)
      .update({ status: "open" }).eq("id", competition.id);
    setCompetition(c => c ? { ...c, status: "open" } : c);
    toast({ title: "🔓 Competition is now open for registration" });
  };

  const startCompetition = async () => {
    if (!competition) return;
    await supabase.from("musabaqah_competitions" as any)
      .update({ status: "active" }).eq("id", competition.id);
    setCompetition(c => c ? { ...c, status: "active" } : c);
    toast({ title: "🎯 Competition started!" });
  };

  /* ══════════════════════════════════════════════════════════════
     VIEW: COMPETITION LIST
  ══════════════════════════════════════════════════════════════ */
  if (view === "list") {
    const openComps = competitions.filter(c => c.status === "open" || c.status === "active");
    const myComps   = isJudge ? competitions : openComps;
    return (
      <div style={{
        minHeight:"100vh", background:`linear-gradient(160deg, ${G} 0%, #0a1f12 60%, #050f09 100%)`,
        position:"relative", overflowY:"auto", fontFamily:"Cairo,sans-serif", padding:"0 0 60px",
      }}>
        <IslamicBg/>
        {/* Header */}
        <div style={{ position:"relative", zIndex:1, textAlign:"center", padding:"48px 24px 32px" }}>
          <div style={{ fontSize:48, marginBottom:8 }}>🏆</div>
          <h1 style={{ fontFamily:"'Playfair Display',serif", color:GOLD, fontSize:32, margin:0, letterSpacing:1 }}>
            Al-Musābaqah
          </h1>
          <div style={{ color:"rgba(255,255,255,0.5)", fontSize:13, marginTop:4, fontFamily:"Amiri,serif",
            direction:"rtl" }}>
            مسابقة التلاوة الحية
          </div>
          <p style={{ color:"rgba(255,255,255,0.55)", maxWidth:500, margin:"12px auto 0", fontSize:14 }}>
            Professional live Qur'an recitation competitions with real-time judging, bell signals, and certified results.
          </p>
        </div>

        <div style={{ position:"relative", zIndex:1, maxWidth:900, margin:"0 auto", padding:"0 24px" }}>
          {/* Action bar */}
          <div style={{ display:"flex", gap:12, marginBottom:24, flexWrap:"wrap" }}>
            {isJudge && (
              <button onClick={() => setView("setup")} style={{
                background:`linear-gradient(135deg, ${GOLD} 0%, ${GOLDD} 100%)`,
                color:G, border:"none", borderRadius:10, padding:"12px 24px",
                fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:8,
                fontSize:14, fontFamily:"Cairo,sans-serif",
              }}>
                <Plus size={18}/> Create Competition
              </button>
            )}
            <button onClick={() => setView("join")} style={{
              background:"rgba(255,255,255,0.06)", color:"#fff",
              border:"1.5px solid rgba(201,168,76,0.3)", borderRadius:10,
              padding:"12px 24px", fontWeight:600, cursor:"pointer",
              display:"flex", alignItems:"center", gap:8, fontSize:14,
              fontFamily:"Cairo,sans-serif",
            }}>
              <LogIn size={18}/> Join with Code
            </button>
            <button onClick={loadCompetitions} style={{
              background:"transparent", color:"rgba(255,255,255,0.4)",
              border:"1px solid rgba(255,255,255,0.1)", borderRadius:10,
              padding:"12px 16px", cursor:"pointer",
            }}>
              <RefreshCw size={16}/>
            </button>
          </div>

          {/* Competition cards */}
          {myComps.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 24px", color:"rgba(255,255,255,0.35)" }}>
              <Trophy size={48} color="rgba(201,168,76,0.3)" style={{ marginBottom:12 }}/>
              <p style={{ margin:0 }}>No active competitions</p>
              {isJudge && <p style={{ margin:"4px 0 0", fontSize:13 }}>Create one to get started.</p>}
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {myComps.map(c => (
                <div key={c.id} onClick={() => openComp(c)} style={{
                  background:`linear-gradient(135deg, ${GM}cc 0%, rgba(10,31,18,0.9) 100%)`,
                  border:`1.5px solid rgba(201,168,76,${c.status==="active"?0.5:0.2})`,
                  borderRadius:14, padding:"20px 24px", cursor:"pointer",
                  display:"flex", alignItems:"center", gap:16,
                  backdropFilter:"blur(10px)",
                  boxShadow: c.status==="active" ? `0 0 20px rgba(201,168,76,0.15)` : "none",
                  transition:"all 0.2s",
                }}>
                  <div style={{
                    width:52, height:52, borderRadius:"50%",
                    background: c.status==="active"
                      ? `linear-gradient(135deg, ${GOLD} 0%, ${GOLDD} 100%)`
                      : `linear-gradient(135deg, ${GM} 0%, #0a1f12 100%)`,
                    border:`2px solid ${c.status==="active" ? GOLD : "rgba(201,168,76,0.2)"}`,
                    display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                  }}>
                    {c.status==="active" ? <Radio size={22} color={G}/> : <Trophy size={22} color={GOLD}/>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                      <span style={{ color:"#fff", fontWeight:700, fontSize:16 }}>{c.title}</span>
                      <span style={{
                        background: c.status==="active" ? `${GREEN}22` : c.status==="open" ? `${GOLD}22` : "rgba(255,255,255,0.08)",
                        color: c.status==="active" ? GREEN : c.status==="open" ? GOLD : "rgba(255,255,255,0.5)",
                        border:`1px solid ${c.status==="active" ? GREEN : c.status==="open" ? GOLD : "rgba(255,255,255,0.1)"}`,
                        borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:600,
                      }}>
                        {c.status==="active" ? "🔴 LIVE" : c.status==="open" ? "🟢 OPEN" : c.status.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ color:"rgba(255,255,255,0.45)", fontSize:13, marginTop:2 }}>
                      {SCOPE_OPTIONS.find(s => s.id === c.scope_type)?.label || c.scope_type} ·
                      Stage {c.current_stage}/{c.total_stages} ·
                      Code: <span style={{ color:GOLD, fontWeight:700, letterSpacing:2 }}>{c.room_code}</span>
                    </div>
                  </div>
                  <ChevronRight size={20} color="rgba(255,255,255,0.3)"/>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     VIEW: SETUP
  ══════════════════════════════════════════════════════════════ */
  if (view === "setup") {
    const inp = (label: string, key: keyof typeof form, type="text", extra?: any) => (
      <div style={{ marginBottom:16 }}>
        <label style={{ color:GOLD, fontSize:12, fontWeight:600, letterSpacing:1,
          textTransform:"uppercase", display:"block", marginBottom:6 }}>{label}</label>
        <input
          type={type} value={String(form[key])}
          onChange={e => setForm(f => ({ ...f, [key]: type==="number" ? Number(e.target.value) : e.target.value }))}
          style={{
            width:"100%", background:"rgba(255,255,255,0.05)", border:`1.5px solid rgba(201,168,76,0.3)`,
            borderRadius:10, padding:"10px 14px", color:"#fff", fontFamily:"Cairo,sans-serif",
            fontSize:14, outline:"none", boxSizing:"border-box",
          }}
          {...extra}
        />
      </div>
    );
    return (
      <div style={{
        minHeight:"100vh", background:`linear-gradient(160deg, ${G} 0%, #0a1f12 100%)`,
        display:"flex", alignItems:"center", justifyContent:"center",
        padding:24, fontFamily:"Cairo,sans-serif",
      }}>
        <IslamicBg/>
        <div style={{
          position:"relative", zIndex:1, width:"100%", maxWidth:580,
          background:"rgba(10,31,18,0.95)", borderRadius:20,
          border:`1.5px solid rgba(201,168,76,0.3)`,
          padding:"36px 32px", backdropFilter:"blur(20px)",
        }}>
          <button onClick={() => setView("list")} style={{ background:"none", border:"none",
            color:"rgba(255,255,255,0.4)", cursor:"pointer", marginBottom:16, fontSize:13 }}>
            ← Back
          </button>
          <h2 style={{ color:GOLD, fontFamily:"'Playfair Display',serif",
            fontSize:24, margin:"0 0 24px", display:"flex", alignItems:"center", gap:8 }}>
            <Plus size={20}/> New Competition
          </h2>

          {inp("Competition Title", "title", "text", { placeholder:"e.g. Ramadan Tajweed Competition 2025" })}
          {inp("Description (optional)", "description", "text", { placeholder:"Brief description..." })}

          {/* Scope */}
          <div style={{ marginBottom:16 }}>
            <label style={{ color:GOLD, fontSize:12, fontWeight:600, letterSpacing:1,
              textTransform:"uppercase", display:"block", marginBottom:8 }}>Quran Scope</label>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {SCOPE_OPTIONS.map(s => (
                <div key={s.id} onClick={() => setForm(f => ({ ...f, scope_type: s.id }))} style={{
                  background: form.scope_type===s.id ? `${GOLD}22` : "rgba(255,255,255,0.04)",
                  border:`1.5px solid ${form.scope_type===s.id ? GOLD : "rgba(255,255,255,0.1)"}`,
                  borderRadius:10, padding:"10px 12px", cursor:"pointer",
                }}>
                  <div style={{ color: form.scope_type===s.id ? GOLD : "#fff", fontWeight:600, fontSize:13 }}>
                    {s.label}
                  </div>
                  <div style={{ color:"rgba(255,255,255,0.4)", fontSize:11, marginTop:2 }}>{s.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
            <div>
              <label style={{ color:GOLD, fontSize:12, fontWeight:600, letterSpacing:1,
                textTransform:"uppercase", display:"block", marginBottom:6 }}>Stages</label>
              <select value={form.total_stages}
                onChange={e => setForm(f => ({ ...f, total_stages: Number(e.target.value) }))}
                style={{ width:"100%", background:"rgba(255,255,255,0.05)", border:`1.5px solid rgba(201,168,76,0.3)`,
                  borderRadius:10, padding:"10px 14px", color:"#fff", fontFamily:"Cairo,sans-serif", fontSize:14, outline:"none" }}>
                {[1,2,3,4,5,6,7,8,10].map(n => (
                  <option key={n} value={n} style={{ background:G }}>{n} {n===1?"Stage":"Stages"}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ color:GOLD, fontSize:12, fontWeight:600, letterSpacing:1,
                textTransform:"uppercase", display:"block", marginBottom:6 }}>Time Limit (secs)</label>
              <input type="number" value={form.time_limit}
                onChange={e => setForm(f => ({ ...f, time_limit: Number(e.target.value) }))}
                min={60} max={1800} step={30}
                style={{ width:"100%", background:"rgba(255,255,255,0.05)", border:`1.5px solid rgba(201,168,76,0.3)`,
                  borderRadius:10, padding:"10px 14px", color:"#fff", fontFamily:"Cairo,sans-serif",
                  fontSize:14, outline:"none", boxSizing:"border-box" }}/>
            </div>
          </div>

          {/* Scoring Mode */}
          <div style={{ marginBottom:24 }}>
            <label style={{ color:GOLD, fontSize:12, fontWeight:600, letterSpacing:1,
              textTransform:"uppercase", display:"block", marginBottom:8 }}>Scoring Mode</label>
            <div style={{ display:"flex", gap:8 }}>
              {[
                { v:true,  label:"Criteria (Tajweed 40 + Hifdh 30 + Fluency 20 + Voice 10)" },
                { v:false, label:"Simple (0–100 direct score)" },
              ].map(o => (
                <div key={String(o.v)} onClick={() => setForm(f => ({ ...f, use_criteria: o.v }))} style={{
                  flex:1, background: form.use_criteria===o.v ? `${GOLD}22` : "rgba(255,255,255,0.04)",
                  border:`1.5px solid ${form.use_criteria===o.v ? GOLD : "rgba(255,255,255,0.1)"}`,
                  borderRadius:10, padding:"10px 12px", cursor:"pointer",
                  color: form.use_criteria===o.v ? GOLD : "rgba(255,255,255,0.6)", fontSize:12,
                }}>
                  {o.label}
                </div>
              ))}
            </div>
          </div>

          <button onClick={createCompetition} disabled={loading} style={{
            width:"100%", background:`linear-gradient(135deg, ${GOLD} 0%, ${GOLDD} 100%)`,
            color:G, border:"none", borderRadius:12, padding:"14px",
            fontWeight:800, cursor:loading?"not-allowed":"pointer",
            fontSize:16, fontFamily:"Cairo,sans-serif", display:"flex",
            alignItems:"center", justifyContent:"center", gap:8,
          }}>
            {loading ? <Loader2 size={18} style={{ animation:"spin 1s linear infinite" }}/> : <Trophy size={18}/>}
            {loading ? "Creating..." : "Create Competition"}
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </button>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     VIEW: JOIN
  ══════════════════════════════════════════════════════════════ */
  if (view === "join") {
    return (
      <div style={{
        minHeight:"100vh", background:`linear-gradient(160deg, ${G} 0%, #0a1f12 100%)`,
        display:"flex", alignItems:"center", justifyContent:"center",
        padding:24, fontFamily:"Cairo,sans-serif",
      }}>
        <IslamicBg/>
        <div style={{
          position:"relative", zIndex:1, width:"100%", maxWidth:440,
          background:"rgba(10,31,18,0.95)", borderRadius:20,
          border:`1.5px solid rgba(201,168,76,0.3)`,
          padding:"36px 32px", backdropFilter:"blur(20px)",
        }}>
          <button onClick={() => setView("list")} style={{ background:"none", border:"none",
            color:"rgba(255,255,255,0.4)", cursor:"pointer", marginBottom:16, fontSize:13 }}>
            ← Back
          </button>
          <h2 style={{ color:GOLD, fontFamily:"'Playfair Display',serif", fontSize:24, margin:"0 0 8px" }}>
            Join Competition
          </h2>
          <p style={{ color:"rgba(255,255,255,0.45)", fontSize:13, margin:"0 0 24px" }}>
            Enter the room code given by your judge or moderator.
          </p>
          {[
            { key:"room_code", label:"Room Code", placeholder:"E.g. AB3XY7" },
            { key:"name",      label:"Your Full Name", placeholder:"e.g. Ahmad Muhammad" },
            { key:"school",    label:"School / Institute (optional)", placeholder:"e.g. Tahleem Academy" },
          ].map(({ key, label, placeholder }) => (
            <div key={key} style={{ marginBottom:16 }}>
              <label style={{ color:GOLD, fontSize:12, fontWeight:600, letterSpacing:1,
                textTransform:"uppercase", display:"block", marginBottom:6 }}>{label}</label>
              <input value={(joinForm as any)[key]}
                onChange={e => setJoinForm(f => ({ ...f, [key]: key==="room_code" ? e.target.value.toUpperCase() : e.target.value }))}
                placeholder={placeholder}
                style={{ width:"100%", background:"rgba(255,255,255,0.05)", border:`1.5px solid rgba(201,168,76,0.3)`,
                  borderRadius:10, padding:"11px 14px", color:"#fff", fontFamily:"Cairo,sans-serif",
                  fontSize:14, outline:"none", boxSizing:"border-box",
                  ...(key==="room_code" ? { letterSpacing:6, textTransform:"uppercase", fontWeight:700, fontSize:18 } : {}) }}/>
            </div>
          ))}
          <button onClick={joinCompetition} disabled={loading} style={{
            width:"100%", background:`linear-gradient(135deg, ${GOLD} 0%, ${GOLDD} 100%)`,
            color:G, border:"none", borderRadius:12, padding:"14px",
            fontWeight:800, cursor:loading?"not-allowed":"pointer",
            fontSize:16, fontFamily:"Cairo,sans-serif", display:"flex",
            alignItems:"center", justifyContent:"center", gap:8,
          }}>
            {loading ? <Loader2 size={18} style={{ animation:"spin2 1s linear infinite" }}/> : <LogIn size={18}/>}
            {loading ? "Joining..." : "Join Competition"}
            <style>{`@keyframes spin2{to{transform:rotate(360deg)}}`}</style>
          </button>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     VIEW: RESULTS
  ══════════════════════════════════════════════════════════════ */
  if (view === "results") {
    const sorted = [...participants].sort((a,b) => b.total_score - a.total_score);
    const medals = ["🥇","🥈","🥉"];
    return (
      <div style={{
        minHeight:"100vh", background:`linear-gradient(160deg, ${G} 0%, #0a1f12 100%)`,
        padding:"0 0 80px", fontFamily:"Cairo,sans-serif", overflowY:"auto",
      }}>
        <IslamicBg/>
        <div style={{ position:"relative", zIndex:1, maxWidth:700, margin:"0 auto", padding:"48px 24px 0" }}>
          <div style={{ textAlign:"center", marginBottom:40 }}>
            <div style={{ fontSize:56, marginBottom:8 }}>🏆</div>
            <h1 style={{ fontFamily:"'Playfair Display',serif", color:GOLD, fontSize:28, margin:"0 0 4px" }}>
              Final Results
            </h1>
            <p style={{ color:"rgba(255,255,255,0.45)", margin:0, fontSize:14 }}>
              {competition?.title} · {competition?.total_stages} Stages
            </p>
            <p style={{ color:"rgba(255,255,255,0.3)", margin:"8px 0 0", direction:"rtl",
              fontFamily:"Amiri,serif", fontSize:16 }}>
              نتائج المسابقة
            </p>
          </div>

          {/* Podium */}
          <div style={{ display:"flex", justifyContent:"center", gap:16, marginBottom:40, flexWrap:"wrap" }}>
            {sorted.slice(0,3).map((p, i) => (
              <div key={p.id} style={{
                background: i===0
                  ? `linear-gradient(135deg, ${GOLD}33 0%, ${GOLDD}22 100%)`
                  : `rgba(255,255,255,0.05)`,
                border: `1.5px solid ${i===0 ? GOLD : i===1 ? "#aaa" : "#b87333"}`,
                borderRadius:16, padding:"24px 20px", textAlign:"center", minWidth:160,
                order: i===0 ? 0 : i===1 ? -1 : 1,
              }}>
                <div style={{ fontSize: i===0 ? 40 : 32, marginBottom:8 }}>{medals[i]}</div>
                <Avatar name={p.participant_name} size={56} active={i===0}/>
                <div style={{ color:"#fff", fontWeight:700, fontSize:15, margin:"10px 0 2px" }}>
                  {p.participant_name}
                </div>
                {p.school && <div style={{ color:"rgba(255,255,255,0.4)", fontSize:12 }}>{p.school}</div>}
                <div style={{ color: i===0 ? GOLD : "#fff", fontSize:22, fontWeight:800, marginTop:8 }}>
                  {p.total_score}
                </div>
                <div style={{ color:"rgba(255,255,255,0.35)", fontSize:11 }}>TOTAL SCORE</div>
              </div>
            ))}
          </div>

          {/* Full table */}
          <div style={{ background:"rgba(10,31,18,0.8)", borderRadius:14,
            border:"1px solid rgba(201,168,76,0.2)", overflow:"hidden" }}>
            <div style={{ padding:"14px 20px", borderBottom:"1px solid rgba(201,168,76,0.15)",
              display:"flex", gap:8, alignItems:"center" }}>
              <Award size={16} color={GOLD}/>
              <span style={{ color:GOLD, fontWeight:700, fontSize:14 }}>Full Rankings</span>
            </div>
            {sorted.map((p, i) => (
              <div key={p.id} style={{
                padding:"14px 20px", borderBottom:"1px solid rgba(255,255,255,0.05)",
                display:"flex", alignItems:"center", gap:12,
                background: i < 3 ? `${GOLD}08` : "transparent",
              }}>
                <span style={{ width:28, textAlign:"center", color: i<3 ? GOLD : "rgba(255,255,255,0.3)",
                  fontWeight:700, fontSize:14 }}>{i<3 ? medals[i] : `#${i+1}`}</span>
                <Avatar name={p.participant_name} size={36}/>
                <div style={{ flex:1 }}>
                  <div style={{ color:"#fff", fontWeight:600, fontSize:14 }}>{p.participant_name}</div>
                  {p.school && <div style={{ color:"rgba(255,255,255,0.35)", fontSize:12 }}>{p.school}</div>}
                </div>
                {/* Stage breakdown */}
                <div style={{ display:"flex", gap:4 }}>
                  {Array.from({ length: competition?.total_stages || 5 }, (_, si) => (
                    <div key={si} style={{
                      background:"rgba(255,255,255,0.06)", borderRadius:6,
                      padding:"2px 8px", fontSize:11, color:"rgba(255,255,255,0.5)", textAlign:"center",
                    }}>
                      <div style={{ color:GOLD, fontWeight:700 }}>
                        {(p.stage_scores || {})[si+1] ?? "—"}
                      </div>
                      <div style={{ fontSize:9 }}>S{si+1}</div>
                    </div>
                  ))}
                </div>
                <div style={{ textAlign:"right", minWidth:60 }}>
                  <div style={{ color:GOLD, fontWeight:800, fontSize:18 }}>{p.total_score}</div>
                  <div style={{ color:"rgba(255,255,255,0.3)", fontSize:11 }}>pts</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display:"flex", gap:12, marginTop:24, justifyContent:"center" }}>
            <button onClick={() => setView("list")} style={{
              background:"rgba(255,255,255,0.07)", color:"#fff",
              border:"1px solid rgba(255,255,255,0.15)", borderRadius:10,
              padding:"11px 24px", cursor:"pointer", fontFamily:"Cairo,sans-serif", fontWeight:600,
            }}>
              ← Back to List
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     VIEW: ARENA (main competition view)
  ══════════════════════════════════════════════════════════════ */
  if (view !== "arena" || !competition) return null;

  const waiting     = participants.filter(p => p.status === "waiting");
  const completed   = participants.filter(p => p.status === "completed");
  const allDone     = waiting.length === 0 && participants.length > 0 && !activeP;
  const totalCriteriaScore = competition.use_criteria_scoring
    ? SCORING_CRITERIA.reduce((sum, c) => sum + (Number(scoreBreak[c.key])||0), 0)
    : Number(scoreBreak.tajweed) || 0;
  const bellPenalty = bellCount * 2;
  const finalScore  = Math.max(0, totalCriteriaScore - bellPenalty);

  return (
    <div style={{
      minHeight:"100vh", maxHeight:"100vh",
      background:`linear-gradient(160deg, ${G} 0%, #080d09 100%)`,
      display:"flex", flexDirection:"column", overflow:"hidden",
      fontFamily:"Cairo,sans-serif", position:"relative",
    }}>
      <IslamicBg opacity={0.04}/>
      <BellFlash visible={bellFlash}/>
      <StopFlash visible={stopFlash}/>

      {/* ── TOP BAR ─────────────────────────────────────────── */}
      <div style={{
        position:"relative", zIndex:10,
        background:`linear-gradient(90deg, ${GD} 0%, ${GM} 100%)`,
        borderBottom:`1px solid rgba(201,168,76,0.2)`,
        padding:"12px 20px", display:"flex", alignItems:"center", gap:12, flexShrink:0,
      }}>
        <button onClick={() => setView("list")} style={{ background:"none", border:"none",
          color:"rgba(255,255,255,0.4)", cursor:"pointer", fontSize:13, padding:0 }}>←</button>

        <div style={{ flex:1, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
          <span style={{ color:GOLD, fontWeight:800, fontSize:15, fontFamily:"'Playfair Display',serif" }}>
            {competition.title}
          </span>
          <span style={{
            background: competition.status==="active" ? `${GREEN}22` : `${GOLD}22`,
            color: competition.status==="active" ? GREEN : GOLD,
            border:`1px solid ${competition.status==="active" ? GREEN : GOLD}`,
            borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:700,
          }}>
            {competition.status==="active" ? "🔴 LIVE" : competition.status.toUpperCase()}
          </span>
        </div>

        {/* Stage pills */}
        <div style={{ display:"flex", gap:4 }}>
          {Array.from({ length: competition.total_stages }, (_, i) => (
            <div key={i} style={{
              width:28, height:28, borderRadius:"50%",
              background: i + 1 < competition.current_stage
                ? GOLD
                : i + 1 === competition.current_stage
                  ? `${GOLD}44`
                  : "rgba(255,255,255,0.08)",
              border: `1.5px solid ${i+1<=competition.current_stage ? GOLD : "rgba(255,255,255,0.1)"}`,
              display:"flex", alignItems:"center", justifyContent:"center",
              color: i+1 < competition.current_stage ? G : i+1===competition.current_stage ? GOLD : "rgba(255,255,255,0.3)",
              fontWeight:700, fontSize:11,
            }}>
              {i+1 < competition.current_stage ? "✓" : i+1}
            </div>
          ))}
        </div>

        <div style={{ background:"rgba(201,168,76,0.15)", borderRadius:8, padding:"4px 12px",
          color:GOLD, fontWeight:700, fontSize:13, letterSpacing:2 }}>
          {competition.room_code}
        </div>

        {/* Proctoring toggle */}
        <button onClick={() => setShowProctor(s => !s)} style={{
          background: showProctor ? `${GOLD}22` : "rgba(255,255,255,0.07)",
          border:`1px solid ${showProctor ? GOLD : "rgba(255,255,255,0.15)"}`,
          borderRadius:8, padding:"6px 12px", cursor:"pointer",
          color: showProctor ? GOLD : "rgba(255,255,255,0.5)",
          fontSize:12, display:"flex", alignItems:"center", gap:6, fontFamily:"Cairo,sans-serif",
        }}>
          <Eye size={14}/>
          {showProctor ? "Proctor ON" : "Proctor"}
        </button>
      </div>

      {/* ── MAIN LAYOUT ─────────────────────────────────────── */}
      <div style={{
        flex:1, display:"flex", flexDirection:"column",
        overflow:"hidden", position:"relative", zIndex:1,
      }}>

        {/* ─── ACTIVE RECITER + JUDGE PANEL ─────────────────── */}
        <div style={{
          display:"flex", flexShrink:0, gap:0,
          borderBottom:`1px solid rgba(201,168,76,0.12)`,
          maxHeight:"42vh",
        }}>
          {/* Active Reciter Slot */}
          <div style={{
            flex:1.2, padding:"20px 24px",
            background:`linear-gradient(135deg, ${GD}ee 0%, rgba(10,31,18,0.95) 100%)`,
            borderRight:`1px solid rgba(201,168,76,0.12)`,
            display:"flex", flexDirection:"column", gap:12, overflow:"hidden",
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <Radio size={14} color={activeP ? GREEN : "rgba(255,255,255,0.3)"}
                style={activeP ? { animation:"rpulse 1s ease-in-out infinite" } : {}}/>
              <span style={{ color:"rgba(255,255,255,0.5)", fontSize:12, fontWeight:600,
                textTransform:"uppercase", letterSpacing:1 }}>
                {activeP ? "Currently Reciting" : "Awaiting Participant"}
              </span>
              <style>{`@keyframes rpulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
            </div>

            {activeP ? (
              <div style={{ display:"flex", gap:16, alignItems:"flex-start" }}>
                {/* Video / Avatar */}
                <div style={{ flexShrink:0 }}>
                  {isJudge ? (
                    <div style={{
                      width:120, height:90, borderRadius:10, overflow:"hidden",
                      background:`linear-gradient(135deg, ${GM} 0%, #050f09 100%)`,
                      border:`2px solid ${activeP.status==="reciting" ? GREEN : GOLD}`,
                      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                      gap:6, position:"relative",
                    }}>
                      <Avatar name={activeP.participant_name} size={50} active={activeP.status==="reciting"}/>
                      {activeP.camera_on && (
                        <div style={{ position:"absolute", top:4, right:4, width:8, height:8,
                          borderRadius:"50%", background:GREEN }}/>
                      )}
                    </div>
                  ) : (
                    <VideoTile stream={myParticipant?.id === activeP.id ? localStream : null}
                      name={activeP.participant_name} size={150} active/>
                  )}
                </div>
                {/* Info */}
                <div style={{ flex:1 }}>
                  <div style={{ color:"#fff", fontWeight:800, fontSize:22,
                    fontFamily:"'Playfair Display',serif", lineHeight:1.2 }}>
                    {activeP.participant_name}
                  </div>
                  {activeP.school && (
                    <div style={{ color:"rgba(255,255,255,0.45)", fontSize:13, marginTop:2 }}>
                      {activeP.school}
                    </div>
                  )}
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:10 }}>
                    <div style={{
                      background:`${statusColor[activeP.status]}22`,
                      border:`1px solid ${statusColor[activeP.status]}`,
                      color:statusColor[activeP.status], borderRadius:20,
                      padding:"3px 12px", fontSize:12, fontWeight:700,
                    }}>
                      {activeP.status === "called" && "⚡ "}
                      {activeP.status === "reciting" && "🎙️ "}
                      {statusLabel[activeP.status]}
                    </div>
                    {/* Timer */}
                    {timerActive && (
                      <div style={{ display:"flex", alignItems:"center", gap:4,
                        color:timerSecs > competition.time_limit_seconds * 0.8 ? RED : GREEN,
                        fontWeight:700, fontSize:16 }}>
                        <Clock size={14}/>
                        {fmtTime(timerSecs)}
                      </div>
                    )}
                  </div>
                  {/* Assigned passage */}
                  {currentAttempt && (
                    <div style={{ marginTop:10, background:"rgba(201,168,76,0.1)",
                      border:"1px solid rgba(201,168,76,0.25)", borderRadius:8, padding:"8px 12px" }}>
                      <div style={{ color:GOLD, fontSize:11, fontWeight:600, marginBottom:2 }}>ASSIGNED PASSAGE</div>
                      <div style={{ color:"#fff", fontWeight:600, fontSize:13 }}>{currentAttempt.scope_label}</div>
                      <div style={{ color:"rgba(255,255,255,0.4)", fontSize:12, direction:"rtl",
                        fontFamily:"Amiri,serif", marginTop:2 }}>{currentAttempt.scope_label_ar}</div>
                    </div>
                  )}
                  {/* Bell count */}
                  {bellCount > 0 && (
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:8 }}>
                      <Bell size={14} color={GOLD}/>
                      <span style={{ color:GOLD, fontWeight:700 }}>{bellCount} error{bellCount!==1?"s":""} recorded</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ flex:1, display:"flex", flexDirection:"column",
                alignItems:"center", justifyContent:"center", gap:8 }}>
                <div style={{ width:80, height:80, borderRadius:"50%",
                  background:"rgba(201,168,76,0.08)", border:"2px dashed rgba(201,168,76,0.3)",
                  display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <Mic size={32} color="rgba(201,168,76,0.4)"/>
                </div>
                <div style={{ color:"rgba(255,255,255,0.3)", fontSize:13 }}>
                  {competition.status==="open"
                    ? "Waiting for competition to start..."
                    : "Select a participant from the roster below"}
                </div>
              </div>
            )}

            {/* MY MIC/CAM CONTROLS (participant) */}
            {!isJudge && myParticipant && myParticipant.status !== "waiting" && (
              <div style={{ display:"flex", gap:8, marginTop:4 }}>
                <button onClick={toggleMic} style={{
                  background: micOn ? `${GREEN}22` : "rgba(255,255,255,0.07)",
                  border:`1.5px solid ${micOn ? GREEN : "rgba(255,255,255,0.2)"}`,
                  borderRadius:10, padding:"8px 16px", cursor:"pointer",
                  color: micOn ? GREEN : "rgba(255,255,255,0.5)",
                  display:"flex", alignItems:"center", gap:6, fontSize:13, fontFamily:"Cairo,sans-serif",
                }}>
                  {micOn ? <Mic size={16}/> : <MicOff size={16}/>}
                  {micOn ? "Mic On" : "Unmute Mic"}
                </button>
                <button onClick={toggleCam} style={{
                  background: camOn ? `${GREEN}22` : "rgba(255,255,255,0.07)",
                  border:`1.5px solid ${camOn ? GREEN : "rgba(255,255,255,0.2)"}`,
                  borderRadius:10, padding:"8px 16px", cursor:"pointer",
                  color: camOn ? GREEN : "rgba(255,255,255,0.5)",
                  display:"flex", alignItems:"center", gap:6, fontSize:13, fontFamily:"Cairo,sans-serif",
                }}>
                  {camOn ? <Video size={16}/> : <VideoOff size={16}/>}
                  {camOn ? "Cam On" : "Camera"}
                </button>
              </div>
            )}
          </div>

          {/* ─── JUDGE CONTROL PANEL ──────────────────────────── */}
          {isJudge && (
            <div style={{
              width:300, flexShrink:0, padding:"16px 20px", overflow:"auto",
              background:"rgba(5,15,8,0.95)",
              display:"flex", flexDirection:"column", gap:12,
            }}>
              <div style={{ color:GOLD, fontWeight:700, fontSize:13, display:"flex",
                alignItems:"center", gap:6 }}>
                <Settings size={14}/> Judge Controls
              </div>

              {/* Competition management */}
              {competition.status === "open" && (
                <button onClick={startCompetition} style={{
                  background:`linear-gradient(135deg, ${GREEN}cc 0%, #16a34a 100%)`,
                  color:"#fff", border:"none", borderRadius:10, padding:"11px",
                  cursor:"pointer", fontWeight:700, fontFamily:"Cairo,sans-serif",
                  fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                }}>
                  <Play size={16}/> Start Competition
                </button>
              )}

              {/* Call + Start Reciting */}
              {competition.status === "active" && !activeP && (
                <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:8, padding:10,
                  color:"rgba(255,255,255,0.4)", fontSize:12, textAlign:"center" }}>
                  Select a participant below to call them
                </div>
              )}
              {activeP && activeP.status === "called" && (
                <button onClick={startReciting} style={{
                  background:`linear-gradient(135deg, ${GREEN}cc 0%, #16a34a 100%)`,
                  color:"#fff", border:"none", borderRadius:10, padding:"11px",
                  cursor:"pointer", fontWeight:700, fontFamily:"Cairo,sans-serif",
                  fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                }}>
                  <Play size={16}/> Start Reciting
                </button>
              )}

              {/* BELL BUTTON */}
              {activeP && activeP.status === "reciting" && (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <button onClick={ringBell} style={{
                    background:`linear-gradient(135deg, ${GOLD}dd 0%, ${GOLDD} 100%)`,
                    color:G, border:"none", borderRadius:12, padding:"16px",
                    cursor:"pointer", fontWeight:800, fontSize:16,
                    display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                    boxShadow:`0 4px 20px rgba(201,168,76,0.4)`,
                    fontFamily:"Cairo,sans-serif",
                  }}>
                    <Bell size={22} strokeWidth={2.5}/>
                    Ring Bell · خطأ
                    {bellCount > 0 && (
                      <span style={{ background:RED, color:"#fff", borderRadius:"50%",
                        width:22, height:22, display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:12, fontWeight:800 }}>
                        {bellCount}
                      </span>
                    )}
                  </button>

                  {/* STOP BUTTON */}
                  <button onClick={signalStop} style={{
                    background:`linear-gradient(135deg, ${RED}cc 0%, #dc2626 100%)`,
                    color:"#fff", border:"none", borderRadius:12, padding:"14px",
                    cursor:"pointer", fontWeight:700, fontSize:15,
                    display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                    fontFamily:"Cairo,sans-serif",
                  }}>
                    <StopCircle size={20}/>
                    Stop · قف
                  </button>
                </div>
              )}

              {/* SCORE ENTRY */}
              {showScorePanel && (
                <div style={{ background:"rgba(201,168,76,0.08)",
                  border:"1px solid rgba(201,168,76,0.25)", borderRadius:10, padding:12 }}>
                  <div style={{ color:GOLD, fontWeight:700, fontSize:13, marginBottom:8 }}>
                    📝 Enter Score
                  </div>
                  {competition.use_criteria_scoring ? (
                    SCORING_CRITERIA.map(c => (
                      <div key={c.key} style={{ marginBottom:8 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                          <span style={{ color:"rgba(255,255,255,0.7)", fontSize:12 }}>
                            {c.label} / {c.labelAr}
                          </span>
                          <span style={{ color:GOLD, fontSize:12, fontWeight:700 }}>
                            /{c.max}
                          </span>
                        </div>
                        <input type="number" min={0} max={c.max}
                          value={scoreBreak[c.key]}
                          onChange={e => setScoreBreak(s => ({ ...s, [c.key]: e.target.value }))}
                          placeholder={`0–${c.max}`}
                          style={{ width:"100%", background:"rgba(255,255,255,0.08)", color:"#fff",
                            border:"1px solid rgba(255,255,255,0.2)", borderRadius:7, padding:"6px 10px",
                            fontFamily:"Cairo,sans-serif", fontSize:13, outline:"none", boxSizing:"border-box" }}/>
                      </div>
                    ))
                  ) : (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ color:"rgba(255,255,255,0.7)", fontSize:12, marginBottom:3 }}>
                        Score / 100
                      </div>
                      <input type="number" min={0} max={100}
                        value={scoreBreak.tajweed}
                        onChange={e => setScoreBreak(s => ({ ...s, tajweed: e.target.value }))}
                        placeholder="0–100"
                        style={{ width:"100%", background:"rgba(255,255,255,0.08)", color:"#fff",
                          border:"1px solid rgba(255,255,255,0.2)", borderRadius:7, padding:"6px 10px",
                          fontFamily:"Cairo,sans-serif", fontSize:13, outline:"none", boxSizing:"border-box" }}/>
                    </div>
                  )}
                  <input type="text" value={judgeComment}
                    onChange={e => setJudgeComment(e.target.value)}
                    placeholder="Judge's comment (optional)"
                    style={{ width:"100%", background:"rgba(255,255,255,0.08)", color:"#fff",
                      border:"1px solid rgba(255,255,255,0.2)", borderRadius:7, padding:"6px 10px",
                      fontFamily:"Cairo,sans-serif", fontSize:12, outline:"none", boxSizing:"border-box", marginBottom:6 }}/>
                  {bellCount > 0 && (
                    <div style={{ color:GOLD, fontSize:11, marginBottom:6 }}>
                      ⚠️ {bellCount} bell(s) × 2 = −{bellPenalty} pts penalty
                    </div>
                  )}
                  <div style={{ color:GREEN, fontWeight:700, fontSize:14, marginBottom:8 }}>
                    Final Score: {finalScore}/{competition.use_criteria_scoring ? 100 : 100}
                  </div>
                  <button onClick={submitScore} style={{
                    width:"100%", background:`linear-gradient(135deg, ${GREEN}cc 0%, #16a34a 100%)`,
                    color:"#fff", border:"none", borderRadius:8, padding:"10px",
                    cursor:"pointer", fontWeight:700, fontFamily:"Cairo,sans-serif", fontSize:14,
                  }}>
                    <CheckCircle size={14} style={{ marginRight:6 }}/>
                    Submit Score
                  </button>
                </div>
              )}

              {/* Advance stage */}
              {competition.status === "active" && allDone && isJudge && (
                <button onClick={advanceStage} style={{
                  background: competition.current_stage >= competition.total_stages
                    ? `linear-gradient(135deg, ${GOLD} 0%, ${GOLDD} 100%)`
                    : `linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)`,
                  color:"#fff", border:"none", borderRadius:10, padding:"12px",
                  cursor:"pointer", fontWeight:700, fontFamily:"Cairo,sans-serif",
                  fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                }}>
                  {competition.current_stage >= competition.total_stages
                    ? <><Trophy size={16}/> End & Show Results</>
                    : <><ArrowRight size={16}/> Next Stage {competition.current_stage + 1}</>}
                </button>
              )}

              {/* Stage status */}
              <div style={{ background:"rgba(255,255,255,0.04)", borderRadius:8, padding:10 }}>
                <div style={{ color:"rgba(255,255,255,0.5)", fontSize:11, marginBottom:4 }}>
                  STAGE {competition.current_stage}/{competition.total_stages}
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <div style={{ flex:1, textAlign:"center" }}>
                    <div style={{ color:GOLD, fontWeight:700 }}>{waiting.length}</div>
                    <div style={{ color:"rgba(255,255,255,0.4)", fontSize:10 }}>Waiting</div>
                  </div>
                  <div style={{ flex:1, textAlign:"center" }}>
                    <div style={{ color:GREEN, fontWeight:700 }}>{completed.length}</div>
                    <div style={{ color:"rgba(255,255,255,0.4)", fontSize:10 }}>Done</div>
                  </div>
                  <div style={{ flex:1, textAlign:"center" }}>
                    <div style={{ color:"#fff", fontWeight:700 }}>{participants.length}</div>
                    <div style={{ color:"rgba(255,255,255,0.4)", fontSize:10 }}>Total</div>
                  </div>
                </div>
              </div>

              {/* View results early */}
              <button onClick={() => setView("results")} style={{
                background:"transparent", color:"rgba(255,255,255,0.3)",
                border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"8px",
                cursor:"pointer", fontFamily:"Cairo,sans-serif", fontSize:12,
                display:"flex", alignItems:"center", justifyContent:"center", gap:4,
              }}>
                <LayoutGrid size={13}/> View Live Standings
              </button>
            </div>
          )}
        </div>

        {/* ─── PROCTORING PANEL ────────────────────────────────── */}
        {showProctor && isJudge && (
          <div style={{
            flexShrink:0, borderBottom:`1px solid rgba(201,168,76,0.12)`,
            padding:"12px 20px", background:"rgba(5,15,8,0.9)",
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
              <Eye size={14} color={GOLD}/>
              <span style={{ color:GOLD, fontWeight:700, fontSize:13 }}>Proctoring Monitor</span>
              <span style={{ color:"rgba(255,255,255,0.3)", fontSize:12 }}>
                — Flag participants with camera issues or suspicious behavior
              </span>
            </div>
            <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
              {participants.map(p => (
                <div key={p.id} style={{
                  flexShrink:0, width:110, background:"rgba(255,255,255,0.04)",
                  border:`1.5px solid ${p.proctor_flagged ? RED : p.camera_on ? GREEN : "rgba(255,255,255,0.1)"}`,
                  borderRadius:10, padding:8, textAlign:"center",
                }}>
                  <Avatar name={p.participant_name} size={36}/>
                  <div style={{ color:"rgba(255,255,255,0.8)", fontSize:11, fontWeight:600,
                    marginTop:5, lineHeight:1.2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {p.participant_name}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
                    gap:3, marginTop:4 }}>
                    {p.camera_on
                      ? <><Video size={10} color={GREEN}/><span style={{ color:GREEN, fontSize:10 }}>CAM</span></>
                      : <><VideoOff size={10} color="rgba(255,255,255,0.3)"/><span style={{ color:"rgba(255,255,255,0.3)", fontSize:10 }}>NO CAM</span></>}
                  </div>
                  <button onClick={() => toggleProctoringFlag(p)} style={{
                    marginTop:5, background: p.proctor_flagged ? `${RED}33` : "rgba(255,255,255,0.06)",
                    border:`1px solid ${p.proctor_flagged ? RED : "rgba(255,255,255,0.15)"}`,
                    borderRadius:6, padding:"3px 6px", cursor:"pointer",
                    color: p.proctor_flagged ? RED : "rgba(255,255,255,0.4)",
                    fontSize:10, display:"flex", alignItems:"center", gap:3, width:"100%",
                    justifyContent:"center", fontFamily:"Cairo,sans-serif",
                  }}>
                    <Flag size={10}/>
                    {p.proctor_flagged ? "FLAGGED" : "Flag"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── PARTICIPANT ROSTER ──────────────────────────────── */}
        <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
          {/* Roster header */}
          <div style={{
            padding:"10px 20px", borderBottom:"1px solid rgba(255,255,255,0.06)",
            display:"flex", alignItems:"center", gap:8, flexShrink:0,
            background:"rgba(5,15,8,0.8)",
          }}>
            <Users size={14} color={GOLD}/>
            <span style={{ color:GOLD, fontWeight:700, fontSize:13 }}>
              Participants — {participants.length} registered
            </span>
            <div style={{ marginLeft:"auto", display:"flex", gap:4 }}>
              <button onClick={() => setRosterMode("list")} style={{
                background: rosterMode==="list" ? `${GOLD}22` : "transparent",
                border:`1px solid ${rosterMode==="list" ? GOLD : "rgba(255,255,255,0.1)"}`,
                borderRadius:6, padding:"4px 8px", cursor:"pointer", color: rosterMode==="list" ? GOLD : "rgba(255,255,255,0.35)",
              }}>
                <List size={12}/>
              </button>
              <button onClick={() => setRosterMode("grid")} style={{
                background: rosterMode==="grid" ? `${GOLD}22` : "transparent",
                border:`1px solid ${rosterMode==="grid" ? GOLD : "rgba(255,255,255,0.1)"}`,
                borderRadius:6, padding:"4px 8px", cursor:"pointer", color: rosterMode==="grid" ? GOLD : "rgba(255,255,255,0.35)",
              }}>
                <LayoutGrid size={12}/>
              </button>
            </div>
          </div>

          {/* Roster body */}
          <div style={{ flex:1, overflowY:"auto", padding:16 }}>
            {participants.length === 0 ? (
              <div style={{ textAlign:"center", padding:"32px 24px", color:"rgba(255,255,255,0.3)" }}>
                <Users size={36} style={{ opacity:0.3, marginBottom:8 }}/>
                <p style={{ margin:0 }}>No participants yet. Share the room code: <span style={{ color:GOLD, fontWeight:700, letterSpacing:3 }}>{competition.room_code}</span></p>
              </div>
            ) : rosterMode === "list" ? (
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {participants.map((p, i) => {
                  const isActive = p.id === activeP?.id;
                  const isMe     = p.id === myParticipant?.id;
                  return (
                    <div key={p.id} style={{
                      background: isActive
                        ? `linear-gradient(135deg, ${GOLD}18 0%, rgba(10,31,18,0.9) 100%)`
                        : isMe ? `rgba(74,222,128,0.07)` : "rgba(255,255,255,0.03)",
                      border:`1.5px solid ${isActive ? GOLD : isMe ? GREEN : p.proctor_flagged ? RED : "rgba(255,255,255,0.08)"}`,
                      borderRadius:10, padding:"10px 14px",
                      display:"flex", alignItems:"center", gap:10,
                      boxShadow: isActive ? `0 0 12px rgba(201,168,76,0.15)` : "none",
                    }}>
                      {/* Position */}
                      <span style={{ color:"rgba(255,255,255,0.25)", fontSize:12, width:20, textAlign:"center",
                        fontWeight:600 }}>#{p.queue_position}</span>

                      <Avatar name={p.participant_name} size={34} active={isActive}/>

                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ color:isActive ? GOLD : "#fff", fontWeight:isActive ? 700 : 500,
                            fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {p.participant_name}
                          </span>
                          {isMe && <span style={{ color:GREEN, fontSize:10, fontWeight:700 }}>YOU</span>}
                          {p.proctor_flagged && <Flag size={12} color={RED}/>}
                        </div>
                        {p.school && (
                          <div style={{ color:"rgba(255,255,255,0.35)", fontSize:11 }}>{p.school}</div>
                        )}
                      </div>

                      {/* Status badge */}
                      <div style={{
                        background:`${statusColor[p.status]}18`,
                        border:`1px solid ${statusColor[p.status]}`,
                        color:statusColor[p.status], borderRadius:20,
                        padding:"2px 8px", fontSize:11, fontWeight:600, flexShrink:0,
                      }}>
                        {p.status === "reciting" && "🎙️ "}
                        {statusLabel[p.status]}
                      </div>

                      {/* Score */}
                      {p.total_score > 0 && (
                        <div style={{ textAlign:"right", flexShrink:0 }}>
                          <div style={{ color:GOLD, fontWeight:800, fontSize:15 }}>{p.total_score}</div>
                          <div style={{ color:"rgba(255,255,255,0.25)", fontSize:10 }}>pts</div>
                        </div>
                      )}

                      {/* Judge CALL button */}
                      {isJudge && competition.status === "active" && p.status === "waiting" && !activeP && (
                        <button onClick={() => callParticipant(p)} style={{
                          background:`linear-gradient(135deg, ${GOLD}cc 0%, ${GOLDD} 100%)`,
                          color:G, border:"none", borderRadius:8, padding:"6px 14px",
                          cursor:"pointer", fontWeight:700, fontSize:12,
                          display:"flex", alignItems:"center", gap:5, flexShrink:0,
                          fontFamily:"Cairo,sans-serif",
                        }}>
                          <PhoneCall size={13}/>
                          Call
                        </button>
                      )}

                      {/* Absent / DQ buttons */}
                      {isJudge && p.status === "waiting" && (
                        <button onClick={async () => {
                          await supabase.from("musabaqah_participants" as any)
                            .update({ status: "absent" }).eq("id", p.id);
                          loadParticipants();
                        }} style={{
                          background:"transparent", color:"rgba(255,255,255,0.25)",
                          border:"1px solid rgba(255,255,255,0.1)", borderRadius:8,
                          padding:"4px 8px", cursor:"pointer", fontSize:10, flexShrink:0,
                        }}>
                          Absent
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* GRID MODE */
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(140px, 1fr))", gap:10 }}>
                {participants.map((p) => {
                  const isActive = p.id === activeP?.id;
                  const isMe     = p.id === myParticipant?.id;
                  return (
                    <div key={p.id} style={{
                      background: isActive ? `${GOLD}18` : "rgba(255,255,255,0.04)",
                      border:`1.5px solid ${isActive ? GOLD : p.proctor_flagged ? RED : "rgba(255,255,255,0.1)"}`,
                      borderRadius:12, padding:12, textAlign:"center",
                      position:"relative",
                    }}>
                      {p.proctor_flagged && (
                        <div style={{ position:"absolute", top:6, right:6 }}>
                          <Flag size={12} color={RED}/>
                        </div>
                      )}
                      <Avatar name={p.participant_name} size={44} active={isActive}/>
                      <div style={{ color: isActive ? GOLD : "#fff", fontWeight:600, fontSize:12,
                        marginTop:6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {p.participant_name}
                        {isMe && <span style={{ color:GREEN }}> ★</span>}
                      </div>
                      <div style={{
                        background:`${statusColor[p.status]}18`,
                        border:`1px solid ${statusColor[p.status]}`,
                        color:statusColor[p.status], borderRadius:20,
                        padding:"2px 8px", fontSize:10, fontWeight:600, marginTop:6,
                        display:"inline-block",
                      }}>
                        {statusLabel[p.status]}
                      </div>
                      {p.total_score > 0 && (
                        <div style={{ color:GOLD, fontWeight:800, fontSize:16, marginTop:4 }}>
                          {p.total_score}
                        </div>
                      )}
                      {isJudge && competition.status === "active" && p.status === "waiting" && !activeP && (
                        <button onClick={() => callParticipant(p)} style={{
                          width:"100%", marginTop:6,
                          background:`${GOLD}22`, color:GOLD,
                          border:`1px solid ${GOLD}`, borderRadius:7,
                          padding:"5px 0", cursor:"pointer", fontWeight:700, fontSize:11,
                          fontFamily:"Cairo,sans-serif",
                        }}>
                          <PhoneCall size={11} style={{ marginRight:4 }}/>Call
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MY STATUS BAR (participant only) */}
      {!isJudge && myParticipant && (
        <div style={{
          position:"fixed", bottom:0, left:0, right:0, zIndex:20,
          background:`linear-gradient(90deg, ${GD} 0%, ${GM} 100%)`,
          borderTop:`1px solid rgba(201,168,76,0.2)`,
          padding:"10px 20px", display:"flex", alignItems:"center", gap:12,
        }}>
          <Avatar name={myParticipant.participant_name} size={32}/>
          <div style={{ flex:1 }}>
            <span style={{ color:"#fff", fontWeight:700, fontSize:13 }}>
              {myParticipant.participant_name}
            </span>
            <span style={{ color:"rgba(255,255,255,0.4)", fontSize:12, marginLeft:8 }}>
              #{myParticipant.queue_position}
            </span>
          </div>
          <div style={{
            background:`${statusColor[myParticipant.status]}18`,
            border:`1px solid ${statusColor[myParticipant.status]}`,
            color:statusColor[myParticipant.status],
            borderRadius:20, padding:"3px 12px", fontSize:12, fontWeight:700,
          }}>
            {myParticipant.status === "called" && "🔔 YOU HAVE BEEN CALLED!"}
            {myParticipant.status === "reciting" && "🎙️ Reciting..."}
            {myParticipant.status === "waiting" && `⏳ Waiting — Position #${myParticipant.queue_position}`}
            {myParticipant.status === "completed" && `✅ Done — ${myParticipant.total_score} pts`}
            {myParticipant.status === "absent" && "❌ Marked Absent"}
          </div>
          {myParticipant.total_score > 0 && (
            <div style={{ color:GOLD, fontWeight:800, fontSize:18 }}>
              {myParticipant.total_score} pts
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/*
══════════════════════════════════════════════════════════════
  SUPABASE SQL — Run in Supabase SQL Editor
══════════════════════════════════════════════════════════════

-- 1. Competitions table
CREATE TABLE IF NOT EXISTS musabaqah_competitions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                TEXT NOT NULL,
  description          TEXT,
  scope_type           TEXT DEFAULT 'juz30',
  scope_config         JSONB DEFAULT '{}',
  total_stages         INT  DEFAULT 5,
  current_stage        INT  DEFAULT 1,
  time_limit_seconds   INT  DEFAULT 300,
  status               TEXT DEFAULT 'draft',
  current_participant_id UUID,
  room_code            TEXT UNIQUE,
  created_by           UUID REFERENCES auth.users(id),
  use_criteria_scoring BOOLEAN DEFAULT TRUE,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Participants table
CREATE TABLE IF NOT EXISTS musabaqah_participants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id    UUID REFERENCES musabaqah_competitions(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES auth.users(id),
  participant_name  TEXT NOT NULL,
  school            TEXT,
  queue_position    INT,
  status            TEXT DEFAULT 'waiting',
  total_score       NUMERIC DEFAULT 0,
  stage_scores      JSONB DEFAULT '{}',
  bell_counts       JSONB DEFAULT '{}',
  proctor_flagged   BOOLEAN DEFAULT FALSE,
  camera_on         BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Attempts table
CREATE TABLE IF NOT EXISTS musabaqah_attempts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id   UUID REFERENCES musabaqah_competitions(id) ON DELETE CASCADE,
  participant_id   UUID REFERENCES musabaqah_participants(id) ON DELETE CASCADE,
  stage_number     INT,
  scope_label      TEXT,
  scope_label_ar   TEXT,
  bell_count       INT DEFAULT 0,
  score_breakdown  JSONB,
  judge_score      NUMERIC,
  judge_comment    TEXT,
  duration_seconds INT,
  status           TEXT DEFAULT 'pending',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable Realtime for all three tables
ALTER PUBLICATION supabase_realtime ADD TABLE musabaqah_competitions;
ALTER PUBLICATION supabase_realtime ADD TABLE musabaqah_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE musabaqah_attempts;

-- 5. RLS Policies
ALTER TABLE musabaqah_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE musabaqah_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE musabaqah_attempts     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view competitions"
  ON musabaqah_competitions FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Admins and teachers can manage competitions"
  ON musabaqah_competitions FOR ALL TO authenticated
  USING (auth.uid() IN (
    SELECT id FROM profiles WHERE role IN ('admin','teacher')
  ));

CREATE POLICY "Anyone authenticated can view participants"
  ON musabaqah_participants FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Authenticated users can join"
  ON musabaqah_participants FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "Users can update own record, judges can update all"
  ON musabaqah_participants FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid() OR
    auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin','teacher'))
  );

CREATE POLICY "Judges manage attempts"
  ON musabaqah_attempts FOR ALL TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role IN ('admin','teacher'))
  );
CREATE POLICY "Anyone can view attempts"
  ON musabaqah_attempts FOR SELECT TO authenticated USING (TRUE);

══════════════════════════════════════════════════════════════
*/
