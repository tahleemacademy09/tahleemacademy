/*
  MustabaqahPage.tsx — Tahleem Academy
  Enhanced mobile-first redesign with animated Islamic background
*/

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Mic, MicOff, Video, VideoOff, Bell, Play,
  Trophy, Users, Plus, Crown, Clock, Star, BookOpen,
  CheckCircle, RefreshCw, ChevronRight,
  Shuffle, Award, Radio, Flag, ArrowRight,
  LogIn, Settings, StopCircle, Loader2, PhoneCall,
  Hash, LayoutGrid, List, Eye, Volume2, Medal,
} from "lucide-react";

/* ── Brand ─────────────────────────────────────────────────── */
const G    = "#0f2d1f";
const GM   = "#163d28";
const GD   = "#0a1f12";
const GOLD = "#c9a84c";
const GOLDD= "#a8843a";
const RED  = "#ef4444";
const GREEN= "#22c55e";

/* ══════════════════════════════════════════════════════════════
   GLOBAL STYLES (injected once)
══════════════════════════════════════════════════════════════ */
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Amiri:wght@400;700&family=Cinzel:wght@400;600;700;900&display=swap');

    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

    @keyframes rotatePattern {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    @keyframes floatUp {
      0%   { transform: translateY(0px) scale(1);   opacity: 0.6; }
      50%  { transform: translateY(-12px) scale(1.02); opacity: 1; }
      100% { transform: translateY(0px) scale(1);   opacity: 0.6; }
    }
    @keyframes goldShimmer {
      0%   { background-position: -200% center; }
      100% { background-position:  200% center; }
    }
    @keyframes pulseRing {
      0%   { transform: scale(1);   opacity: 1; }
      100% { transform: scale(2.2); opacity: 0; }
    }
    @keyframes bellSwing {
      0%,100% { transform: rotate(0deg); }
      20%     { transform: rotate(-20deg); }
      40%     { transform: rotate(20deg); }
      60%     { transform: rotate(-12deg); }
      80%     { transform: rotate(8deg); }
    }
    @keyframes fadeSlideUp {
      from { opacity: 0; transform: translateY(20px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes recitingGlow {
      0%,100% { box-shadow: 0 0 20px rgba(34,197,94,0.4); }
      50%     { box-shadow: 0 0 40px rgba(34,197,94,0.8), 0 0 80px rgba(34,197,94,0.3); }
    }
    @keyframes calledGlow {
      0%,100% { box-shadow: 0 0 20px rgba(201,168,76,0.5); }
      50%     { box-shadow: 0 0 50px rgba(201,168,76,0.9), 0 0 100px rgba(201,168,76,0.4); }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes ripple {
      0%   { transform: scale(0); opacity: 1; }
      100% { transform: scale(4); opacity: 0; }
    }
    @keyframes staggerIn {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .anim-slide-up { animation: fadeSlideUp 0.45s cubic-bezier(0.22,1,0.36,1) both; }
    .anim-fade     { animation: fadeIn 0.3s ease both; }

    .gold-btn {
      background: linear-gradient(135deg, #c9a84c 0%, #e8c96a 40%, #c9a84c 60%, #a8843a 100%);
      background-size: 200% auto;
      transition: background-position 0.4s, transform 0.15s, box-shadow 0.15s;
    }
    .gold-btn:hover  { background-position: right center; transform: translateY(-1px); box-shadow: 0 8px 32px rgba(201,168,76,0.5); }
    .gold-btn:active { transform: scale(0.97); }

    .glass-card {
      background: rgba(22,61,40,0.55);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(201,168,76,0.18);
    }

    .participant-row { transition: transform 0.15s, box-shadow 0.15s; }
    .participant-row:active { transform: scale(0.99); }

    .bell-btn:active { animation: bellSwing 0.5s ease; }

    input, select, textarea {
      font-family: 'Cairo', sans-serif !important;
    }
    input:focus, select:focus {
      outline: none;
      border-color: rgba(201,168,76,0.7) !important;
      box-shadow: 0 0 0 3px rgba(201,168,76,0.15);
    }

    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(201,168,76,0.3); border-radius: 2px; }

    .stagger-1 { animation: staggerIn 0.4s 0.05s both; }
    .stagger-2 { animation: staggerIn 0.4s 0.10s both; }
    .stagger-3 { animation: staggerIn 0.4s 0.15s both; }
    .stagger-4 { animation: staggerIn 0.4s 0.20s both; }
    .stagger-5 { animation: staggerIn 0.4s 0.25s both; }
  `}</style>
);

/* ══════════════════════════════════════════════════════════════
   ANIMATED ISLAMIC BACKGROUND
══════════════════════════════════════════════════════════════ */
const IslamicBackground = () => (
  <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
    {/* Deep gradient base */}
    <div style={{
      position: "absolute", inset: 0,
      background: `radial-gradient(ellipse at 20% 20%, #1a4a2e 0%, ${GD} 40%, #050f09 100%)`,
    }}/>

    {/* Rotating star pattern — slow outer */}
    <svg style={{
      position: "absolute", top: "50%", left: "50%",
      width: "180vmax", height: "180vmax",
      transform: "translate(-50%,-50%)",
      opacity: 0.045,
      animation: "rotatePattern 120s linear infinite",
    }} viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="star8" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
          <polygon points="50,5 58,35 88,35 65,55 73,85 50,67 27,85 35,55 12,35 42,35"
            fill="none" stroke={GOLD} strokeWidth="0.8"/>
          <polygon points="50,15 56,33 75,33 61,44 66,63 50,54 34,63 39,44 25,33 44,33"
            fill="none" stroke={GOLD} strokeWidth="0.4" opacity="0.6"/>
          <circle cx="50" cy="50" r="4" fill="none" stroke={GOLD} strokeWidth="0.5"/>
          <circle cx="50" cy="50" r="12" fill="none" stroke={GOLD} strokeWidth="0.3" opacity="0.5"/>
          <line x1="0" y1="50" x2="100" y2="50" stroke={GOLD} strokeWidth="0.2" opacity="0.4"/>
          <line x1="50" y1="0" x2="50" y2="100" stroke={GOLD} strokeWidth="0.2" opacity="0.4"/>
          <line x1="0" y1="0" x2="100" y2="100" stroke={GOLD} strokeWidth="0.15" opacity="0.25"/>
          <line x1="100" y1="0" x2="0" y2="100" stroke={GOLD} strokeWidth="0.15" opacity="0.25"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#star8)"/>
    </svg>

    {/* Counter-rotating inner ring */}
    <svg style={{
      position: "absolute", top: "50%", left: "50%",
      width: "90vmax", height: "90vmax",
      transform: "translate(-50%,-50%)",
      opacity: 0.06,
      animation: "rotatePattern 60s linear infinite reverse",
    }} viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
      <polygon points="250,20 265,100 340,80 290,150 360,190 275,200 290,280 230,230 200,310 190,225 110,250 175,195 115,145 200,160 200,80"
        fill="none" stroke={GOLD} strokeWidth="1.5"/>
      <circle cx="250" cy="250" r="120" fill="none" stroke={GOLD} strokeWidth="0.8" strokeDasharray="8 4"/>
      <circle cx="250" cy="250" r="180" fill="none" stroke={GOLD} strokeWidth="0.5" strokeDasharray="4 8"/>
    </svg>

    {/* Ambient glow blobs */}
    <div style={{
      position: "absolute", top: "-10%", right: "-10%",
      width: "50vw", height: "50vw", borderRadius: "50%",
      background: "radial-gradient(circle, rgba(201,168,76,0.08) 0%, transparent 70%)",
    }}/>
    <div style={{
      position: "absolute", bottom: "-15%", left: "-10%",
      width: "60vw", height: "60vw", borderRadius: "50%",
      background: "radial-gradient(circle, rgba(22,61,40,0.6) 0%, transparent 70%)",
    }}/>
    <div style={{
      position: "absolute", top: "40%", left: "50%", transform: "translateX(-50%)",
      width: "40vw", height: "40vw", borderRadius: "50%",
      background: "radial-gradient(circle, rgba(201,168,76,0.04) 0%, transparent 70%)",
      animation: "floatUp 8s ease-in-out infinite",
    }}/>
  </div>
);

/* ══════════════════════════════════════════════════════════════
   BELL FLASH OVERLAY
══════════════════════════════════════════════════════════════ */
const BellFlash = ({ visible }: { visible: boolean }) => (
  <div style={{
    position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none",
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    opacity: visible ? 1 : 0, transition: "opacity 0.25s",
    background: visible ? "rgba(0,0,0,0.55)" : "transparent",
  }}>
    {visible && (
      <>
        <div style={{ position: "relative", width: 120, height: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(201,168,76,0.3)", animation: "pulseRing 0.8s ease-out" }}/>
          <div style={{ position: "absolute", inset: 10, borderRadius: "50%", background: "rgba(201,168,76,0.5)", animation: "pulseRing 0.8s ease-out 0.15s" }}/>
          <div style={{ position: "relative", width: 80, height: 80, borderRadius: "50%", background: `radial-gradient(circle, ${GOLD} 0%, ${GOLDD} 100%)`, display: "flex", alignItems: "center", justifyContent: "center", animation: "bellSwing 0.6s ease" }}>
            <Bell size={38} color={G} strokeWidth={2.5}/>
          </div>
        </div>
        <div style={{ marginTop: 16, fontFamily: "Cairo, sans-serif", fontWeight: 800, fontSize: 22, color: "#fff", letterSpacing: 4, textShadow: "0 2px 16px rgba(0,0,0,0.8)" }}>
          خطأ • ERROR
        </div>
      </>
    )}
  </div>
);

/* ══════════════════════════════════════════════════════════════
   STOP FLASH
══════════════════════════════════════════════════════════════ */
const StopFlash = ({ visible }: { visible: boolean }) => (
  <div style={{
    position: "fixed", inset: 0, zIndex: 9998, pointerEvents: "none",
    display: "flex", alignItems: "center", justifyContent: "center",
    background: visible ? "rgba(239,68,68,0.22)" : "transparent",
    border: visible ? `4px solid ${RED}` : "4px solid transparent",
    transition: "all 0.2s",
  }}>
    {visible && (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, animation: "fadeSlideUp 0.2s ease" }}>
        <StopCircle size={90} color={RED} strokeWidth={1.5}/>
        <div style={{ fontFamily: "Cairo, sans-serif", fontWeight: 900, fontSize: 32, color: "#fff", letterSpacing: 6, textShadow: "0 4px 20px rgba(0,0,0,0.9)" }}>
          قف • STOP
        </div>
      </div>
    )}
  </div>
);

/* ══════════════════════════════════════════════════════════════
   AVATAR
══════════════════════════════════════════════════════════════ */
const Avatar = ({ name, size = 44, active = false, called = false }: { name: string; size?: number; active?: boolean; called?: boolean }) => {
  const initials = name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: active
        ? `linear-gradient(135deg, ${GOLD} 0%, ${GOLDD} 100%)`
        : called
          ? `linear-gradient(135deg, #f97316 0%, #ea580c 100%)`
          : `linear-gradient(135deg, ${GM} 0%, #0a1f12 100%)`,
      border: active ? `2.5px solid ${GOLD}` : called ? "2.5px solid #f97316" : "1.5px solid rgba(201,168,76,0.25)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: active ? G : called ? "#fff" : GOLD,
      fontWeight: 800, fontFamily: "Cairo, sans-serif",
      fontSize: size * 0.38,
      animation: active ? "recitingGlow 2s ease-in-out infinite" : called ? "calledGlow 1.5s ease-in-out infinite" : "none",
    }}>
      {initials || "?"}
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════
   SECTION LABEL
══════════════════════════════════════════════════════════════ */
const Label = ({ children }: { children: React.ReactNode }) => (
  <div style={{ color: GOLD, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8, fontFamily: "Cairo, sans-serif" }}>
    {children}
  </div>
);

/* ══════════════════════════════════════════════════════════════
   STYLED INPUT
══════════════════════════════════════════════════════════════ */
const Input = ({ label, value, onChange, placeholder, type = "text", ...rest }: any) => (
  <div style={{ marginBottom: 16 }}>
    <Label>{label}</Label>
    <input
      type={type} value={value} onChange={onChange} placeholder={placeholder}
      style={{
        width: "100%", background: "rgba(255,255,255,0.06)",
        border: "1.5px solid rgba(201,168,76,0.25)", borderRadius: 12,
        padding: "12px 16px", color: "#fff", fontSize: 15,
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
      {...rest}
    />
  </div>
);

/* ══════════════════════════════════════════════════════════════
   AUDIO ENGINE
══════════════════════════════════════════════════════════════ */
let _audioCtx: AudioContext | null = null;
const getAudioCtx = () => {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  if (_audioCtx.state === "suspended") _audioCtx.resume();
  return _audioCtx;
};
const playBellSound = () => {
  try {
    const ctx = getAudioCtx(), t = ctx.currentTime;
    [440, 880, 1320, 1760].forEach((freq, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.setValueAtTime(freq * (1 + i * 0.002), t);
      gain.gain.setValueAtTime(0.35 / (i + 1), t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t); osc.stop(t + 2.5);
    });
  } catch {}
};
const playStopSound = () => {
  try {
    const ctx = getAudioCtx(), t = ctx.currentTime;
    [0, 0.35].forEach(offset => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = "square"; osc.frequency.setValueAtTime(2400, t + offset);
      osc.frequency.linearRampToValueAtTime(2800, t + offset + 0.15);
      gain.gain.setValueAtTime(0.4, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.3);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t + offset); osc.stop(t + offset + 0.35);
    });
  } catch {}
};
const playCalledSound = () => {
  try {
    const ctx = getAudioCtx(), t = ctx.currentTime;
    [523, 659, 784, 1047].forEach((freq, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = "sine"; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.3, t + i * 0.12 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.7);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t + i * 0.12); osc.stop(t + i * 0.12 + 0.8);
    });
  } catch {}
};
const playStageComplete = () => {
  try {
    const ctx = getAudioCtx(), t = ctx.currentTime;
    [523, 659, 784, 659, 784, 1047].forEach((freq, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = "triangle"; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.25, t + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.3);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(t + i * 0.15); osc.stop(t + i * 0.15 + 0.35);
    });
  } catch {}
};

/* ══════════════════════════════════════════════════════════════
   QURAN DATA
══════════════════════════════════════════════════════════════ */
const SURAHS = [
  {n:1,en:"Al-Fatiha",ar:"الفاتحة",v:7,juz:1},{n:78,en:"An-Naba'",ar:"النبأ",v:40,juz:30},
  {n:87,en:"Al-A'la",ar:"الأعلى",v:19,juz:30},{n:88,en:"Al-Ghashiyah",ar:"الغاشية",v:26,juz:30},
  {n:89,en:"Al-Fajr",ar:"الفجر",v:30,juz:30},{n:93,en:"Ad-Duha",ar:"الضحى",v:11,juz:30},
  {n:94,en:"Ash-Sharh",ar:"الشرح",v:8,juz:30},{n:96,en:"Al-'Alaq",ar:"العلق",v:19,juz:30},
  {n:99,en:"Az-Zalzalah",ar:"الزلزلة",v:8,juz:30},{n:100,en:"Al-'Adiyat",ar:"العاديات",v:11,juz:30},
  {n:101,en:"Al-Qari'ah",ar:"القارعة",v:11,juz:30},{n:102,en:"At-Takathur",ar:"التكاثر",v:8,juz:30},
  {n:103,en:"Al-'Asr",ar:"العصر",v:3,juz:30},{n:104,en:"Al-Humazah",ar:"الهمزة",v:9,juz:30},
  {n:105,en:"Al-Fil",ar:"الفيل",v:5,juz:30},{n:106,en:"Quraysh",ar:"قريش",v:4,juz:30},
  {n:107,en:"Al-Ma'un",ar:"الماعون",v:7,juz:30},{n:108,en:"Al-Kawthar",ar:"الكوثر",v:3,juz:30},
  {n:109,en:"Al-Kafirun",ar:"الكافرون",v:6,juz:30},{n:110,en:"An-Nasr",ar:"النصر",v:3,juz:30},
  {n:112,en:"Al-Ikhlas",ar:"الإخلاص",v:4,juz:30},{n:113,en:"Al-Falaq",ar:"الفلق",v:5,juz:30},
  {n:114,en:"An-Nas",ar:"الناس",v:6,juz:30},{n:67,en:"Al-Mulk",ar:"الملك",v:30,juz:29},
  {n:36,en:"Ya-Sin",ar:"يس",v:83,juz:22},{n:55,en:"Ar-Rahman",ar:"الرحمن",v:78,juz:27},
  {n:56,en:"Al-Waqi'ah",ar:"الواقعة",v:96,juz:27},
];

const JUZ_NAMES: Record<number,string> = {
  1:"Alif Lam Mim",2:"Sayaqul",3:"Tilkar Rusul",4:"Lan Tanaloo",5:"Wal Muhsanat",
  6:"La Yuhibbullah",7:"Wa Idha Sami'u",8:"Wa Law Annana",9:"Qalal Mala",10:"Wa'lamu",
  11:"Ya'tadhirun",12:"Wa Ma Min Dabbah",13:"Wa Ma Ubari'u",14:"Rubama",15:"Subhana Allathi",
  16:"Qala Alam",17:"Iqtaraba",18:"Qad Aflaha",19:"Wa Qalallathina",20:"Amman Khalaqa",
  21:"Utlu Ma Uhiya",22:"Wa Man Yaqnut",23:"Wa Mali",24:"Fa Man Azlamu",25:"Ilayhi Yuraddu",
  26:"Ha Mim",27:"Qala Fa Ma Khatbukum",28:"Qad Sami'Allah",29:"Tabarakal Lathi",30:"Amma",
};

const SCOPE_OPTIONS = [
  { id:"juz30",  label:"Juz 30 (Amma)",  labelAr:"جزء عم",             desc:"Short surahs — juniors" },
  { id:"juz29",  label:"Juz 29–30",       labelAr:"جزء تبارك وعم",      desc:"Two final juz" },
  { id:"full30", label:"Full 30 Juz",     labelAr:"القرآن كاملاً",       desc:"Entire Quran — advanced" },
  { id:"custom", label:"Custom Scope",    labelAr:"نطاق مخصص",           desc:"Pick specific juz/surah" },
];

const SCORING_CRITERIA = [
  { key:"tajweed",  label:"Tajweed",  labelAr:"التجويد",  max:40 },
  { key:"memorize", label:"Hifdh",    labelAr:"الحفظ",    max:30 },
  { key:"fluency",  label:"Fluency",  labelAr:"الطلاقة",  max:20 },
  { key:"voice",    label:"Voice",    labelAr:"الصوت",    max:10 },
];

/* ══════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════ */
type CompStatus = "draft"|"open"|"active"|"paused"|"completed";
type PStatus    = "waiting"|"called"|"reciting"|"completed"|"absent"|"disqualified";

interface Competition {
  id: string; title: string; description?: string;
  scope_type: string; scope_config: any; total_stages: number;
  current_stage: number; time_limit_seconds: number; status: CompStatus;
  current_participant_id?: string|null; room_code: string;
  created_by: string; created_at: string; use_criteria_scoring: boolean;
}
interface Participant {
  id: string; competition_id: string; user_id?: string;
  participant_name: string; school?: string; queue_position: number;
  status: PStatus; total_score: number; stage_scores: Record<string,number>;
  bell_counts: Record<string,number>; proctor_flagged: boolean;
  camera_on: boolean; created_at: string;
}
interface Attempt {
  id: string; competition_id: string; participant_id: string;
  stage_number: number; scope_label: string; scope_label_ar: string;
  bell_count: number; score_breakdown?: Record<string,number>;
  judge_score?: number; judge_comment?: string; duration_seconds?: number;
  status: "pending"|"reciting"|"scored"; created_at: string;
}

/* ── Helpers ─────────────────────────────────────────────── */
const genRoomCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
};

const pickRandomScope = (scopeType: string) => {
  if (scopeType === "juz30") {
    const s = SURAHS.filter(s => s.juz === 30);
    const chosen = s[Math.floor(Math.random() * s.length)];
    const ayah = Math.floor(Math.random() * chosen.v) + 1;
    return { label:`${chosen.en} (Ayah ${ayah})`, labelAr:`سورة ${chosen.ar} (الآية ${ayah})` };
  }
  if (scopeType === "juz29") {
    const juz = Math.random() > 0.5 ? 29 : 30;
    const s = SURAHS.filter(s => s.juz === juz);
    const chosen = s[Math.floor(Math.random() * s.length)];
    const ayah = Math.floor(Math.random() * Math.min(chosen.v, 20)) + 1;
    return { label:`${chosen.en} (Ayah ${ayah})`, labelAr:`سورة ${chosen.ar} (الآية ${ayah})` };
  }
  if (scopeType === "full30") {
    const juz = Math.floor(Math.random() * 30) + 1;
    return { label:`Juz ${juz} — ${JUZ_NAMES[juz]}`, labelAr:`الجزء ${juz}` };
  }
  return { label:"Custom selection", labelAr:"اختيار مخصص" };
};

const fmtTime = (s: number) => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

const STATUS_COLOR: Record<PStatus,string> = {
  waiting:"#c9a84c", called:"#f97316", reciting:"#22c55e",
  completed:"#60a5fa", absent:"#6b7280", disqualified:"#ef4444",
};
const STATUS_LABEL: Record<PStatus,string> = {
  waiting:"Waiting", called:"Called", reciting:"Reciting",
  completed:"Completed", absent:"Absent", disqualified:"DQ",
};
const STATUS_ICON: Record<PStatus,string> = {
  waiting:"⏳", called:"⚡", reciting:"🎙️",
  completed:"✅", absent:"❌", disqualified:"🚫",
};

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════ */
export default function MustabaqahPage() {
  const { user, profile, hasRole } = useAuth() as any;
  const { toast } = useToast();
  const isJudge = hasRole?.("admin") || hasRole?.("teacher");

  type View = "list"|"setup"|"join"|"arena"|"results";
  const [view,          setView]          = useState<View>("list");
  const [loading,       setLoading]       = useState(false);
  const [competitions,  setCompetitions]  = useState<Competition[]>([]);
  const [competition,   setCompetition]   = useState<Competition|null>(null);
  const [participants,  setParticipants]  = useState<Participant[]>([]);
  const [attempts,      setAttempts]      = useState<Attempt[]>([]);
  const [myParticipant, setMyParticipant] = useState<Participant|null>(null);

  const [activeP,         setActiveP]         = useState<Participant|null>(null);
  const [currentAttempt,  setCurAttempt]       = useState<Attempt|null>(null);
  const [bellCount,       setBellCount]        = useState(0);
  const [bellFlash,       setBellFlash]        = useState(false);
  const [stopFlash,       setStopFlash]        = useState(false);
  const [timerActive,     setTimerActive]      = useState(false);
  const [timerSecs,       setTimerSecs]        = useState(0);
  const [rosterMode,      setRosterMode]       = useState<"grid"|"list">("list");
  const [showProctor,     setShowProctor]      = useState(false);
  const [showScorePanel,  setShowScore]        = useState(false);
  const [judgeTab,        setJudgeTab]         = useState<"controls"|"roster">("roster");
  const [calledScope,     setCalledScope]      = useState<{ label: string; labelAr: string } | null>(null);
  const [audioReady,      setAudioReady]       = useState(false);
  const [floatReactions,  setFloatReactions]   = useState<{ id: string; emoji: string; name: string; x: number }[]>([]);

  const [scoreBreak,   setScoreBreak]   = useState<Record<string,string>>({ tajweed:"", memorize:"", fluency:"", voice:"" });
  const [judgeComment, setJudgeComment] = useState("");
  const [localStream,  setLocalStream]  = useState<MediaStream|null>(null);
  const [micOn,        setMicOn]        = useState(false);
  const [camOn,        setCamOn]        = useState(false);

  const [form, setForm] = useState({
    title:"", description:"", scope_type:"juz30",
    total_stages:5, time_limit:300, use_criteria:true, customJuz:30,
  });
  const [joinForm, setJoinForm] = useState({ room_code:"", name:"", school:"" });

  const channelRef = useRef<any>(null);
  const timerRef   = useRef<any>(null);

  /* Load competitions */
  useEffect(() => { loadCompetitions(); }, []);

  const loadCompetitions = async () => {
    const { data } = await supabase.from("musabaqah_competitions" as any)
      .select("*").order("created_at", { ascending:false });
    if (data) setCompetitions(data as Competition[]);
  };

  /* Realtime */
  useEffect(() => {
    if (!competition) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    const ch = supabase.channel(`musabaqah:${competition.id}`)
      .on("broadcast", { event:"BELL" }, ({ payload }:any) => {
        setBellFlash(true); setBellCount(payload.count ?? 0);
        setTimeout(() => setBellFlash(false), 2500);
        // Wake audio then play
        const ctx = getAudioCtx();
        if (ctx.state === "running") { playBellSound(); }
        else { ctx.resume().then(() => playBellSound()); }
      })
      .on("broadcast", { event:"STOP" }, () => {
        setStopFlash(true); setTimerActive(false);
        setTimeout(() => setStopFlash(false), 2500);
        const ctx = getAudioCtx();
        if (ctx.state === "running") { playStopSound(); }
        else { ctx.resume().then(() => playStopSound()); }
      })
      .on("broadcast", { event:"CALLED" }, ({ payload }:any) => {
        loadParticipants(); loadAttempts(); setBellCount(0); setTimerSecs(0); setShowScore(false);
        if (payload.scope_label) setCalledScope({ label: payload.scope_label, labelAr: payload.scope_label_ar || "" });
        if (payload.participant_id === myParticipant?.id) {
          const ctx = getAudioCtx();
          const play = () => playCalledSound();
          if (ctx.state === "running") { play(); }
          else { ctx.resume().then(() => play()); }
          try { navigator.vibrate?.([400,100,400,100,800]); } catch {}
          toast({ title:"🎙️ You have been called!", description:"Unmute your mic and begin reciting." });
        }
      })
      .on("broadcast", { event:"REACTION" }, ({ payload }:any) => {
        const id = Math.random().toString(36).slice(2);
        const x = 10 + Math.random() * 80;
        setFloatReactions(r => [...r, { id, emoji: payload.emoji, name: payload.name, x }]);
        setTimeout(() => setFloatReactions(r => r.filter(rx => rx.id !== id)), 3000);
      })
      .on("broadcast", { event:"SCORE_SUBMITTED" }, () => { loadParticipants(); loadAttempts(); setShowScore(false); })
      .on("broadcast", { event:"STAGE_CHANGE" }, ({ payload }:any) => {
        setCompetition(c => c ? { ...c, current_stage:payload.stage } : c);
        playStageComplete(); setBellCount(0); setActiveP(null); setCurAttempt(null);
        loadParticipants(); loadAttempts();
      })
      .on("broadcast", { event:"COMPETITION_END" }, () => {
        setCompetition(c => c ? { ...c, status:"completed" } : c);
        playStageComplete(); setTimeout(() => setView("results"), 1200);
      })
      .on("broadcast", { event:"PROCTOR_FLAG" }, ({ payload }:any) => {
        setParticipants(ps => ps.map(p => p.id === payload.participant_id ? { ...p, proctor_flagged:payload.flagged } : p));
      })
      .on("postgres_changes" as any, { event:"*", schema:"public", table:"musabaqah_participants", filter:`competition_id=eq.${competition.id}` }, () => loadParticipants())
      .subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [competition?.id, myParticipant?.id]);

  /* Timer */
  useEffect(() => {
    if (timerActive) timerRef.current = setInterval(() => setTimerSecs(s => s+1), 1000);
    else clearInterval(timerRef.current);
    return () => clearInterval(timerRef.current);
  }, [timerActive]);

  const loadParticipants = useCallback(async () => {
    if (!competition) return;
    const { data } = await supabase.from("musabaqah_participants" as any)
      .select("*").eq("competition_id", competition.id).order("queue_position");
    if (data) {
      setParticipants(data as Participant[]);
      if (competition.current_participant_id)
        setActiveP((data as Participant[]).find(p => p.id === competition.current_participant_id) || null);
      if (user) {
        const mine = (data as Participant[]).find(p => p.user_id === user.id);
        if (mine) setMyParticipant(mine);
      }
    }
  }, [competition, user]);

  const loadAttempts = useCallback(async () => {
    if (!competition) return;
    const { data } = await supabase.from("musabaqah_attempts" as any)
      .select("*").eq("competition_id", competition.id).order("created_at");
    if (data) setAttempts(data as Attempt[]);
  }, [competition]);

  useEffect(() => { if (competition) { loadParticipants(); loadAttempts(); } }, [competition]);

  const broadcast = (event: string, payload: object = {}) =>
    channelRef.current?.send({ type:"broadcast", event, payload });

  const wakeAudio = () => {
    try { getAudioCtx().resume().then(() => setAudioReady(true)); } catch {}
  };

  const REACTION_EMOJIS = ["🤲","❤️","🌟","👏","🎙️","📖","🕌","🤍"];

  const sendReaction = (emoji: string) => {
    wakeAudio();
    const name = myParticipant?.participant_name || "Audience";
    const id = Math.random().toString(36).slice(2);
    const x = 10 + Math.random() * 80;
    setFloatReactions(r => [...r, { id, emoji, name, x }]);
    setTimeout(() => setFloatReactions(r => r.filter(rx => rx.id !== id)), 3000);
    broadcast("REACTION", { emoji, name });
  };

  /* Media */
  const toggleMic = async () => {
    if (!micOn) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio:true, video:camOn });
        setLocalStream(s); setMicOn(true);
        if (myParticipant) await supabase.from("musabaqah_participants" as any).update({ camera_on:camOn }).eq("id", myParticipant.id);
      } catch { toast({ title:"Mic access denied", variant:"destructive" }); }
    } else {
      localStream?.getAudioTracks().forEach(t => { t.enabled=false; t.stop(); });
      setMicOn(false);
    }
  };
  const toggleCam = async () => {
    if (!camOn) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio:micOn, video:true });
        setLocalStream(s); setCamOn(true);
        if (myParticipant) await supabase.from("musabaqah_participants" as any).update({ camera_on:true }).eq("id", myParticipant.id);
      } catch { toast({ title:"Camera access denied", variant:"destructive" }); }
    } else {
      localStream?.getVideoTracks().forEach(t => { t.enabled=false; t.stop(); });
      setCamOn(false);
      if (myParticipant) await supabase.from("musabaqah_participants" as any).update({ camera_on:false }).eq("id", myParticipant.id);
    }
  };

  /* Judge actions */
  const ringBell = async () => {
    const n = bellCount + 1; setBellCount(n); playBellSound(); setBellFlash(true);
    setTimeout(() => setBellFlash(false), 2500);
    broadcast("BELL", { count:n });
    if (currentAttempt) await supabase.from("musabaqah_attempts" as any).update({ bell_count:n }).eq("id", currentAttempt.id);
  };

  const signalStop = async () => {
    playStopSound(); setStopFlash(true); setTimerActive(false);
    setTimeout(() => setStopFlash(false), 2500);
    broadcast("STOP"); setShowScore(true);
    if (currentAttempt) await supabase.from("musabaqah_attempts" as any).update({ status:"scored", duration_seconds:timerSecs }).eq("id", currentAttempt.id);
    if (activeP) await supabase.from("musabaqah_participants" as any).update({ status:"completed" }).eq("id", activeP.id);
  };

  const callParticipant = async (p: Participant) => {
    if (!competition) return;
    setBellCount(0); setTimerSecs(0); setShowScore(false);
    setScoreBreak({ tajweed:"", memorize:"", fluency:"", voice:"" }); setJudgeComment("");
    const scope = pickRandomScope(competition.scope_type);
    const { data:att } = await supabase.from("musabaqah_attempts" as any).insert({
      competition_id:competition.id, participant_id:p.id,
      stage_number:competition.current_stage,
      scope_label:scope.label, scope_label_ar:scope.labelAr,
      bell_count:0, status:"reciting",
    }).select().single();
    if (att) setCurAttempt(att as Attempt);
    await supabase.from("musabaqah_participants" as any).update({ status:"called" }).eq("id", p.id);
    await supabase.from("musabaqah_competitions" as any).update({ current_participant_id:p.id }).eq("id", competition.id);
    setActiveP(p);
    setCompetition(c => c ? { ...c, current_participant_id:p.id } : c);
    playCalledSound();
    broadcast("CALLED", { participant_id:p.id, participant_name:p.participant_name, scope_label:scope.label, scope_label_ar:scope.labelAr });
    setJudgeTab("controls");
  };

  const startReciting = async () => {
    if (!activeP) return;
    await supabase.from("musabaqah_participants" as any).update({ status:"reciting" }).eq("id", activeP.id);
    setActiveP(p => p ? { ...p, status:"reciting" } : p); setTimerActive(true);
  };

  const submitScore = async () => {
    if (!activeP || !currentAttempt) return;
    let totalScore = 0;
    const breakdown: Record<string,number> = {};
    if (competition?.use_criteria_scoring) {
      SCORING_CRITERIA.forEach(c => {
        const v = Math.min(Number(scoreBreak[c.key])||0, c.max);
        breakdown[c.key] = v; totalScore += v;
      });
    } else { totalScore = Number(scoreBreak.tajweed)||0; }
    totalScore = Math.max(0, totalScore - bellCount*2);
    await supabase.from("musabaqah_attempts" as any).update({ judge_score:totalScore, score_breakdown:breakdown, judge_comment:judgeComment, bell_count:bellCount, status:"scored" }).eq("id", currentAttempt.id);
    const newTotal = (activeP.total_score||0) + totalScore;
    await supabase.from("musabaqah_participants" as any).update({ status:"completed", total_score:newTotal, stage_scores:{ ...(activeP.stage_scores||{}), [competition!.current_stage]:totalScore } }).eq("id", activeP.id);
    broadcast("SCORE_SUBMITTED", { participant_id:activeP.id, score:totalScore });
    toast({ title:`✅ Score saved: ${totalScore} pts` });
    setActiveP(null); setCurAttempt(null); setShowScore(false);
    setBellCount(0); setTimerSecs(0); setTimerActive(false);
    loadParticipants(); loadAttempts();
    setJudgeTab("roster");
  };

  const advanceStage = async () => {
    if (!competition) return;
    const next = competition.current_stage + 1;
    if (next > competition.total_stages) {
      await supabase.from("musabaqah_competitions" as any).update({ status:"completed", current_participant_id:null }).eq("id", competition.id);
      broadcast("COMPETITION_END"); setView("results"); return;
    }
    await supabase.from("musabaqah_participants" as any).update({ status:"waiting" }).eq("competition_id", competition.id);
    await supabase.from("musabaqah_competitions" as any).update({ current_stage:next, current_participant_id:null }).eq("id", competition.id);
    setCompetition(c => c ? { ...c, current_stage:next, current_participant_id:null } : c);
    broadcast("STAGE_CHANGE", { stage:next });
    toast({ title:`🎯 Stage ${next} begins!` }); loadParticipants();
  };

  const createCompetition = async () => {
    if (!form.title.trim()) { toast({ title:"Enter a title", variant:"destructive" }); return; }
    setLoading(true);
    const room_code = genRoomCode();
    const { data, error } = await supabase.from("musabaqah_competitions" as any).insert({
      title:form.title.trim(), description:form.description.trim(),
      scope_type:form.scope_type, scope_config:{ customJuz:form.customJuz },
      total_stages:form.total_stages, current_stage:1,
      time_limit_seconds:form.time_limit, status:"open", room_code,
      created_by:user?.id, use_criteria_scoring:form.use_criteria,
    }).select().single();
    setLoading(false);
    if (error) { toast({ title:"Error creating competition", description:error.message, variant:"destructive" }); return; }
    setCompetition(data as Competition); setView("arena");
    toast({ title:`🏆 Created! Code: ${room_code}` });
  };

  const joinCompetition = async () => {
    const code = joinForm.room_code.trim().toUpperCase();
    const name = joinForm.name.trim();
    if (!code || !name) { toast({ title:"Fill all fields", variant:"destructive" }); return; }
    setLoading(true);
    const { data:comp } = await supabase.from("musabaqah_competitions" as any).select("*").eq("room_code", code).single();
    if (!comp) { toast({ title:"Competition not found", variant:"destructive" }); setLoading(false); return; }
    const { data:existing } = await supabase.from("musabaqah_participants" as any).select("*").eq("competition_id", (comp as Competition).id).eq("user_id", user?.id).single();
    if (existing) {
      setCompetition(comp as Competition); setMyParticipant(existing as Participant);
      setLoading(false); setView("arena"); return;
    }
    const { count } = await supabase.from("musabaqah_participants" as any).select("id", { count:"exact" }).eq("competition_id", (comp as Competition).id);
    const { data:participant } = await supabase.from("musabaqah_participants" as any).insert({
      competition_id:(comp as Competition).id, user_id:user?.id,
      participant_name:name, school:joinForm.school,
      queue_position:(count||0)+1, status:"waiting",
      total_score:0, stage_scores:{}, bell_counts:{},
      proctor_flagged:false, camera_on:false,
    }).select().single();
    setLoading(false);
    if (participant) {
      setCompetition(comp as Competition); setMyParticipant(participant as Participant);
      setView("arena"); toast({ title:"✅ Joined!" });
    }
  };

  const openComp = async (comp: Competition) => {
    setCompetition(comp);
    if (isJudge) { setView("arena"); return; }
    const { data } = await supabase.from("musabaqah_participants" as any).select("*").eq("competition_id", comp.id).eq("user_id", user?.id).single();
    if (data) { setMyParticipant(data as Participant); setView("arena"); }
    else setView("join");
  };

  const startCompetition = async () => {
    if (!competition) return;
    await supabase.from("musabaqah_competitions" as any).update({ status:"active" }).eq("id", competition.id);
    setCompetition(c => c ? { ...c, status:"active" } : c);
    toast({ title:"🎯 Competition started!" });
  };

  const toggleProctoringFlag = async (p: Participant) => {
    const flagged = !p.proctor_flagged;
    await supabase.from("musabaqah_participants" as any).update({ proctor_flagged:flagged }).eq("id", p.id);
    broadcast("PROCTOR_FLAG", { participant_id:p.id, flagged });
  };

  /* ── Derived ─────────────────────────────────────────────── */
  const waiting = participants.filter(p => p.status === "waiting");
  const done    = participants.filter(p => p.status === "completed");
  const allDone = waiting.length === 0 && participants.length > 0 && !activeP;
  const totalCrit = competition?.use_criteria_scoring
    ? SCORING_CRITERIA.reduce((s,c) => s + (Number(scoreBreak[c.key])||0), 0)
    : Number(scoreBreak.tajweed)||0;
  const finalScore = Math.max(0, totalCrit - bellCount*2);

  /* ════════════════════════════════════════════════════════════
     VIEW: LIST
  ════════════════════════════════════════════════════════════ */
  if (view === "list") {
    const shown = isJudge ? competitions : competitions.filter(c => c.status==="open"||c.status==="active");
    return (
      <div style={{ minHeight:"100vh", position:"relative", fontFamily:"Cairo, sans-serif", overflowY:"auto", paddingBottom:80 }}>
        <GlobalStyles/>
        <IslamicBackground/>

        {/* Header */}
        <div className="anim-slide-up" style={{ position:"relative", zIndex:1, textAlign:"center", padding:"52px 24px 32px" }}>
          <div style={{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:80, height:80, borderRadius:24, background:`linear-gradient(135deg, ${GOLD} 0%, ${GOLDD} 100%)`, boxShadow:`0 12px 40px rgba(201,168,76,0.5)`, marginBottom:20, animation:"floatUp 5s ease-in-out infinite" }}>
            <Trophy size={40} color={G} strokeWidth={2.5}/>
          </div>
          <h1 style={{ fontFamily:"Cinzel, serif", color:"#fff", fontSize:30, fontWeight:700, margin:"0 0 4px", letterSpacing:2 }}>
            Al-Musābaqah
          </h1>
          <p style={{ fontFamily:"Amiri, serif", color:GOLD, fontSize:18, margin:"0 0 8px", letterSpacing:2, direction:"rtl" }}>
            مسابقة التلاوة الحية
          </p>
          <p style={{ color:"rgba(255,255,255,0.4)", fontSize:13, margin:0 }}>
            Professional Live Qur'an Recitation Competition
          </p>
        </div>

        <div style={{ position:"relative", zIndex:1, maxWidth:560, margin:"0 auto", padding:"0 16px" }}>
          {/* Action buttons */}
          <div className="stagger-1" style={{ display:"flex", gap:10, marginBottom:24 }}>
            {isJudge && (
              <button className="gold-btn" onClick={() => setView("setup")} style={{
                flex:1, color:G, border:"none", borderRadius:14,
                padding:"14px 0", fontWeight:800, cursor:"pointer",
                fontSize:15, fontFamily:"Cairo, sans-serif",
                display:"flex", alignItems:"center", justifyContent:"center", gap:8,
              }}>
                <Plus size={18}/> New Competition
              </button>
            )}
            <button onClick={() => setView("join")} style={{
              flex:1, background:"rgba(255,255,255,0.07)", color:"#fff",
              border:"1.5px solid rgba(201,168,76,0.3)", borderRadius:14,
              padding:"14px 0", fontWeight:700, cursor:"pointer", fontSize:15,
              fontFamily:"Cairo, sans-serif",
              display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            }}>
              <LogIn size={18}/> Join with Code
            </button>
            <button onClick={loadCompetitions} style={{
              background:"rgba(255,255,255,0.06)", color:"rgba(255,255,255,0.4)",
              border:"1.5px solid rgba(255,255,255,0.1)", borderRadius:14,
              padding:"14px 16px", cursor:"pointer",
            }}>
              <RefreshCw size={16}/>
            </button>
          </div>

          {/* Divider */}
          <div className="stagger-2" style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
            <div style={{ flex:1, height:1, background:"rgba(201,168,76,0.15)" }}/>
            <Star size={10} color={GOLD} fill={GOLD}/>
            <Star size={13} color={GOLD} fill={GOLD}/>
            <Star size={10} color={GOLD} fill={GOLD}/>
            <div style={{ flex:1, height:1, background:"rgba(201,168,76,0.15)" }}/>
          </div>

          {/* Competition list */}
          {shown.length === 0 ? (
            <div className="stagger-3 glass-card" style={{ textAlign:"center", padding:"48px 24px", borderRadius:20, color:"rgba(255,255,255,0.3)" }}>
              <Trophy size={44} color="rgba(201,168,76,0.2)" style={{ marginBottom:12 }}/>
              <p style={{ margin:0, fontWeight:600 }}>No active competitions</p>
              {isJudge && <p style={{ margin:"6px 0 0", fontSize:13, opacity:0.6 }}>Create one to get started</p>}
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {shown.map((c, i) => (
                <div key={c.id} onClick={() => openComp(c)}
                  className={`glass-card participant-row stagger-${Math.min(i+2,5)}`}
                  style={{
                    borderRadius:18, padding:"18px 20px", cursor:"pointer",
                    border:`1.5px solid rgba(201,168,76,${c.status==="active"?0.55:0.18})`,
                    boxShadow:c.status==="active" ? `0 0 30px rgba(201,168,76,0.15), inset 0 0 30px rgba(201,168,76,0.05)` : "none",
                    display:"flex", alignItems:"center", gap:14,
                  }}>
                  <div style={{
                    width:50, height:50, borderRadius:16, flexShrink:0,
                    background:c.status==="active" ? `linear-gradient(135deg, ${GOLD} 0%, ${GOLDD} 100%)` : "rgba(255,255,255,0.08)",
                    border:`1.5px solid ${c.status==="active" ? GOLD : "rgba(201,168,76,0.2)"}`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    animation:c.status==="active" ? "calledGlow 2s ease-in-out infinite" : "none",
                  }}>
                    {c.status==="active" ? <Radio size={22} color={G}/> : <Trophy size={22} color={GOLD}/>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:4 }}>
                      <span style={{ color:"#fff", fontWeight:700, fontSize:15 }}>{c.title}</span>
                      <span style={{
                        padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:700,
                        background:c.status==="active" ? `${GREEN}22` : c.status==="open" ? `${GOLD}22` : "rgba(255,255,255,0.08)",
                        color:c.status==="active" ? GREEN : c.status==="open" ? GOLD : "rgba(255,255,255,0.4)",
                        border:`1px solid ${c.status==="active" ? GREEN : c.status==="open" ? GOLD : "rgba(255,255,255,0.1)"}`,
                      }}>
                        {c.status==="active" ? "🔴 LIVE" : c.status==="open" ? "🟢 OPEN" : c.status.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ color:"rgba(255,255,255,0.4)", fontSize:12 }}>
                      Stage {c.current_stage}/{c.total_stages} · Code:{" "}
                      <span style={{ color:GOLD, fontWeight:800, letterSpacing:2 }}>{c.room_code}</span>
                    </div>
                  </div>
                  <ChevronRight size={18} color="rgba(255,255,255,0.25)"/>
                </div>
              ))}
            </div>
          )}

          {isJudge && (
            <div className="stagger-5" style={{ marginTop:20, background:"rgba(201,168,76,0.06)", border:"1px solid rgba(201,168,76,0.15)", borderRadius:14, padding:"12px 16px", display:"flex", gap:10, alignItems:"flex-start" }}>
              <Crown size={15} color={GOLD} style={{ flexShrink:0, marginTop:2 }}/>
              <p style={{ color:"rgba(255,255,255,0.45)", fontSize:12, margin:0, lineHeight:1.7 }}>
                <strong style={{ color:GOLD }}>Admin mode:</strong> Create competitions, call participants, ring bell, and judge recitations in real-time.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     VIEW: SETUP
  ════════════════════════════════════════════════════════════ */
  if (view === "setup") {
    return (
      <div style={{ minHeight:"100vh", position:"relative", fontFamily:"Cairo, sans-serif", overflowY:"auto", paddingBottom:40 }}>
        <GlobalStyles/>
        <IslamicBackground/>
        <div className="anim-slide-up" style={{ position:"relative", zIndex:1, maxWidth:560, margin:"0 auto", padding:"24px 16px" }}>
          <button onClick={() => setView("list")} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.4)", cursor:"pointer", marginBottom:20, fontSize:13, display:"flex", alignItems:"center", gap:6 }}>
            ← Back
          </button>

          <div className="glass-card" style={{ borderRadius:24, padding:"28px 24px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
              <div style={{ width:44, height:44, borderRadius:14, background:`linear-gradient(135deg, ${GOLD} 0%, ${GOLDD} 100%)`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Plus size={22} color={G}/>
              </div>
              <div>
                <h2 style={{ color:"#fff", fontFamily:"Cinzel, serif", fontSize:20, margin:0, fontWeight:600 }}>New Competition</h2>
                <p style={{ color:"rgba(255,255,255,0.35)", fontSize:12, margin:0 }}>Set up your musabaqah</p>
              </div>
            </div>

            <Input label="Competition Title" value={form.title} onChange={(e:any) => setForm(f => ({ ...f, title:e.target.value }))} placeholder="e.g. Ramadan Tajweed Championship"/>
            <Input label="Description (optional)" value={form.description} onChange={(e:any) => setForm(f => ({ ...f, description:e.target.value }))} placeholder="Brief description..."/>

            {/* Scope */}
            <div style={{ marginBottom:16 }}>
              <Label>Quran Scope</Label>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {SCOPE_OPTIONS.map(s => (
                  <div key={s.id} onClick={() => setForm(f => ({ ...f, scope_type:s.id }))} style={{
                    background:form.scope_type===s.id ? `${GOLD}18` : "rgba(255,255,255,0.04)",
                    border:`1.5px solid ${form.scope_type===s.id ? GOLD : "rgba(255,255,255,0.1)"}`,
                    borderRadius:12, padding:"10px 12px", cursor:"pointer",
                    transition:"all 0.2s",
                  }}>
                    <div style={{ color:form.scope_type===s.id ? GOLD : "#fff", fontWeight:700, fontSize:13 }}>{s.label}</div>
                    <div style={{ color:"rgba(255,255,255,0.35)", fontSize:11, marginTop:2 }}>{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stages + Time */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
              <div>
                <Label>Stages</Label>
                <select value={form.total_stages} onChange={e => setForm(f => ({ ...f, total_stages:Number(e.target.value) }))} style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1.5px solid rgba(201,168,76,0.25)", borderRadius:12, padding:"12px 14px", color:"#fff", fontSize:14 }}>
                  {[1,2,3,4,5,6,7,8,10].map(n => <option key={n} value={n} style={{ background:G }}>{n} Stage{n>1?"s":""}</option>)}
                </select>
              </div>
              <div>
                <Label>Time Limit (sec)</Label>
                <input type="number" value={form.time_limit} onChange={e => setForm(f => ({ ...f, time_limit:Number(e.target.value) }))} min={60} max={1800} step={30} style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1.5px solid rgba(201,168,76,0.25)", borderRadius:12, padding:"12px 14px", color:"#fff", fontSize:14 }}/>
              </div>
            </div>

            {/* Scoring */}
            <div style={{ marginBottom:24 }}>
              <Label>Scoring Mode</Label>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {[
                  { v:true,  label:"Criteria scoring", desc:"Tajweed 40 + Hifdh 30 + Fluency 20 + Voice 10" },
                  { v:false, label:"Simple score",     desc:"0–100 direct score" },
                ].map(o => (
                  <div key={String(o.v)} onClick={() => setForm(f => ({ ...f, use_criteria:o.v }))} style={{
                    background:form.use_criteria===o.v ? `${GOLD}15` : "rgba(255,255,255,0.04)",
                    border:`1.5px solid ${form.use_criteria===o.v ? GOLD : "rgba(255,255,255,0.1)"}`,
                    borderRadius:12, padding:"12px 14px", cursor:"pointer", transition:"all 0.2s",
                    display:"flex", alignItems:"center", gap:12,
                  }}>
                    <div style={{ width:18, height:18, borderRadius:"50%", border:`2px solid ${form.use_criteria===o.v ? GOLD : "rgba(255,255,255,0.25)"}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      {form.use_criteria===o.v && <div style={{ width:8, height:8, borderRadius:"50%", background:GOLD }}/>}
                    </div>
                    <div>
                      <div style={{ color:form.use_criteria===o.v ? GOLD : "#fff", fontWeight:700, fontSize:13 }}>{o.label}</div>
                      <div style={{ color:"rgba(255,255,255,0.35)", fontSize:11 }}>{o.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button className="gold-btn" onClick={createCompetition} disabled={loading} style={{
              width:"100%", color:G, border:"none", borderRadius:14,
              padding:"16px", fontWeight:800, cursor:loading?"not-allowed":"pointer",
              fontSize:16, fontFamily:"Cairo, sans-serif",
              display:"flex", alignItems:"center", justifyContent:"center", gap:8,
              opacity:loading ? 0.7 : 1,
            }}>
              {loading ? <Loader2 size={18} style={{ animation:"spin 1s linear infinite" }}/> : <Trophy size={18}/>}
              {loading ? "Creating..." : "Create Competition"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     VIEW: JOIN
  ════════════════════════════════════════════════════════════ */
  if (view === "join") {
    return (
      <div style={{ minHeight:"100vh", position:"relative", fontFamily:"Cairo, sans-serif", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
        <GlobalStyles/>
        <IslamicBackground/>
        <div className="anim-slide-up glass-card" style={{ position:"relative", zIndex:1, width:"100%", maxWidth:440, borderRadius:24, padding:"32px 24px" }}>
          <button onClick={() => setView("list")} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.4)", cursor:"pointer", marginBottom:20, fontSize:13, display:"flex", alignItems:"center", gap:6 }}>
            ← Back
          </button>

          <div style={{ textAlign:"center", marginBottom:28 }}>
            <div style={{ width:64, height:64, borderRadius:20, background:`linear-gradient(135deg, ${GOLD} 0%, ${GOLDD} 100%)`, display:"inline-flex", alignItems:"center", justifyContent:"center", marginBottom:14, boxShadow:`0 8px 32px rgba(201,168,76,0.4)` }}>
              <LogIn size={28} color={G}/>
            </div>
            <h2 style={{ fontFamily:"Cinzel, serif", color:"#fff", fontSize:22, margin:"0 0 6px", fontWeight:600 }}>Join Competition</h2>
            <p style={{ color:"rgba(255,255,255,0.4)", fontSize:13, margin:0 }}>Enter your room code to compete</p>
          </div>

          {/* Room code — big */}
          <div style={{ marginBottom:16 }}>
            <Label>Room Code</Label>
            <input
              value={joinForm.room_code}
              onChange={e => setJoinForm(f => ({ ...f, room_code:e.target.value.toUpperCase() }))}
              placeholder="AB3XY7"
              maxLength={6}
              style={{
                width:"100%", background:"rgba(201,168,76,0.08)",
                border:`2px solid rgba(201,168,76,0.4)`, borderRadius:14,
                padding:"16px 20px", color:GOLD, fontSize:28,
                fontWeight:900, letterSpacing:10, textAlign:"center",
                textTransform:"uppercase",
              }}
            />
          </div>

          <Input label="Your Full Name" value={joinForm.name} onChange={(e:any) => setJoinForm(f => ({ ...f, name:e.target.value }))} placeholder="e.g. Ahmad Muhammad"/>
          <Input label="School / Institute (optional)" value={joinForm.school} onChange={(e:any) => setJoinForm(f => ({ ...f, school:e.target.value }))} placeholder="e.g. Tahleem Academy"/>

          <button className="gold-btn" onClick={joinCompetition} disabled={loading} style={{
            width:"100%", color:G, border:"none", borderRadius:14,
            padding:"16px", fontWeight:800, cursor:loading?"not-allowed":"pointer",
            fontSize:16, fontFamily:"Cairo, sans-serif",
            display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            opacity:loading ? 0.7 : 1, marginTop:8,
          }}>
            {loading ? <Loader2 size={18} style={{ animation:"spin 1s linear infinite" }}/> : <LogIn size={18}/>}
            {loading ? "Joining..." : "Join Competition"}
          </button>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     VIEW: RESULTS
  ════════════════════════════════════════════════════════════ */
  if (view === "results") {
    const sorted = [...participants].sort((a,b) => b.total_score - a.total_score);
    const medals  = ["🥇","🥈","🥉"];
    const podiumColors = [GOLD, "#aaa", "#b87333"];
    return (
      <div style={{ minHeight:"100vh", position:"relative", fontFamily:"Cairo, sans-serif", overflowY:"auto", paddingBottom:60 }}>
        <GlobalStyles/>
        <IslamicBackground/>
        <div style={{ position:"relative", zIndex:1, maxWidth:600, margin:"0 auto", padding:"40px 16px 0" }}>
          <div className="anim-slide-up" style={{ textAlign:"center", marginBottom:36 }}>
            <div style={{ fontSize:64, marginBottom:8, animation:"floatUp 4s ease-in-out infinite" }}>🏆</div>
            <h1 style={{ fontFamily:"Cinzel, serif", color:GOLD, fontSize:28, margin:"0 0 4px", fontWeight:700 }}>Final Results</h1>
            <p style={{ color:"rgba(255,255,255,0.4)", margin:0, fontSize:13 }}>{competition?.title} · {competition?.total_stages} Stages</p>
            <p style={{ color:"rgba(255,255,255,0.25)", margin:"6px 0 0", fontFamily:"Amiri,serif", fontSize:16, direction:"rtl" }}>نتائج المسابقة</p>
          </div>

          {/* Top 3 podium */}
          {sorted.length >= 1 && (
            <div style={{ display:"flex", justifyContent:"center", gap:10, marginBottom:32, alignItems:"flex-end" }}>
              {[sorted[1], sorted[0], sorted[2]].filter(Boolean).map((p, i) => {
                const rank = i===1 ? 0 : i===0 ? 1 : 2;
                const heights = [140, 180, 110];
                return (
                  <div key={p.id} className={`stagger-${i+1}`} style={{
                    flex:1, maxWidth:160,
                    background:`rgba(${rank===0?"201,168,76":"255,255,255"},0.06)`,
                    border:`1.5px solid ${podiumColors[rank]}55`,
                    borderRadius:20, padding:"16px 12px",
                    textAlign:"center", height:heights[i],
                    display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-end",
                    boxShadow:rank===0 ? `0 0 40px rgba(201,168,76,0.2)` : "none",
                  }}>
                    <div style={{ fontSize:rank===0?36:28 }}>{medals[rank]}</div>
                    <Avatar name={p.participant_name} size={rank===0?52:40} active={rank===0}/>
                    <div style={{ color:"#fff", fontWeight:700, fontSize:13, marginTop:8, lineHeight:1.3 }}>{p.participant_name}</div>
                    <div style={{ color:podiumColors[rank], fontWeight:900, fontSize:rank===0?24:18, marginTop:4 }}>{p.total_score}</div>
                    <div style={{ color:"rgba(255,255,255,0.3)", fontSize:10 }}>pts</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Full table */}
          <div className="glass-card" style={{ borderRadius:20, overflow:"hidden" }}>
            <div style={{ padding:"14px 20px", borderBottom:"1px solid rgba(201,168,76,0.15)", display:"flex", alignItems:"center", gap:8 }}>
              <Award size={16} color={GOLD}/>
              <span style={{ color:GOLD, fontWeight:700, fontSize:14 }}>Full Rankings</span>
            </div>
            {sorted.map((p, i) => (
              <div key={p.id} style={{
                padding:"12px 20px", borderBottom:"1px solid rgba(255,255,255,0.05)",
                display:"flex", alignItems:"center", gap:12,
                background:i<3 ? `rgba(201,168,76,0.04)` : "transparent",
              }}>
                <span style={{ width:28, textAlign:"center", color:i<3?GOLD:"rgba(255,255,255,0.25)", fontWeight:800, fontSize:14 }}>
                  {i<3 ? medals[i] : `#${i+1}`}
                </span>
                <Avatar name={p.participant_name} size={34} active={i===0}/>
                <div style={{ flex:1 }}>
                  <div style={{ color:"#fff", fontWeight:600, fontSize:14 }}>{p.participant_name}</div>
                  {p.school && <div style={{ color:"rgba(255,255,255,0.3)", fontSize:11 }}>{p.school}</div>}
                </div>
                <div style={{ display:"flex", gap:4 }}>
                  {Array.from({ length:competition?.total_stages||5 }, (_,si) => (
                    <div key={si} style={{ background:"rgba(255,255,255,0.05)", borderRadius:6, padding:"2px 7px", textAlign:"center", fontSize:11 }}>
                      <div style={{ color:GOLD, fontWeight:700 }}>{(p.stage_scores||{})[si+1]??"-"}</div>
                      <div style={{ color:"rgba(255,255,255,0.2)", fontSize:9 }}>S{si+1}</div>
                    </div>
                  ))}
                </div>
                <div style={{ textAlign:"right", minWidth:48 }}>
                  <div style={{ color:GOLD, fontWeight:900, fontSize:18 }}>{p.total_score}</div>
                  <div style={{ color:"rgba(255,255,255,0.2)", fontSize:10 }}>pts</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display:"flex", justifyContent:"center", marginTop:24 }}>
            <button onClick={() => setView("list")} style={{
              background:"rgba(255,255,255,0.07)", color:"#fff",
              border:"1px solid rgba(255,255,255,0.15)", borderRadius:12,
              padding:"12px 32px", cursor:"pointer", fontFamily:"Cairo,sans-serif", fontWeight:600, fontSize:14,
            }}>
              ← Back to List
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     VIEW: ARENA
  ════════════════════════════════════════════════════════════ */
  if (view !== "arena" || !competition) return null;

  return (
    <div style={{ minHeight:"100vh", maxHeight:"100vh", display:"flex", flexDirection:"column", fontFamily:"Cairo, sans-serif", overflow:"hidden", position:"relative" }}>
      <GlobalStyles/>
      <IslamicBackground/>
      <BellFlash visible={bellFlash}/>
      <StopFlash visible={stopFlash}/>

      {/* ── FLOATING REACTIONS OVERLAY ────────────────────── */}
      <div style={{ position:"fixed", inset:0, zIndex:9997, pointerEvents:"none", overflow:"hidden" }}>
        {floatReactions.map(r => (
          <div key={r.id} style={{
            position:"absolute", bottom:90, left:`${r.x}%`,
            animation:"fadeSlideUp 0.4s ease both",
            display:"flex", flexDirection:"column", alignItems:"center", gap:2,
          }}>
            <div style={{ fontSize:32, filter:"drop-shadow(0 2px 8px rgba(0,0,0,0.6))", animation:"floatUp 3s ease-in-out both" }}>{r.emoji}</div>
            <div style={{ color:"rgba(255,255,255,0.6)", fontSize:10, background:"rgba(0,0,0,0.5)", borderRadius:20, padding:"2px 8px", whiteSpace:"nowrap" }}>{r.name}</div>
          </div>
        ))}
      </div>

      {/* ── TOP BAR ───────────────────────────────────────── */}
      <div style={{
        position:"relative", zIndex:10, flexShrink:0,
        background:"rgba(5,15,8,0.85)", backdropFilter:"blur(20px)",
        borderBottom:"1px solid rgba(201,168,76,0.15)",
        padding:"10px 16px", display:"flex", alignItems:"center", gap:10,
      }}>
        <button onClick={() => setView("list")} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.35)", cursor:"pointer", fontSize:20, padding:"0 4px", lineHeight:1 }}>←</button>

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ color:"#fff", fontWeight:800, fontSize:15, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", fontFamily:"Cinzel,serif" }}>
            {competition.title}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:2 }}>
            <span style={{
              fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:20,
              background:competition.status==="active" ? `${GREEN}22` : `${GOLD}22`,
              color:competition.status==="active" ? GREEN : GOLD,
              border:`1px solid ${competition.status==="active" ? GREEN : GOLD}`,
            }}>
              {competition.status==="active" ? "🔴 LIVE" : competition.status.toUpperCase()}
            </span>
            <span style={{ color:"rgba(255,255,255,0.3)", fontSize:11 }}>
              Stage {competition.current_stage}/{competition.total_stages}
            </span>
          </div>
        </div>

        {/* Stage dots */}
        <div style={{ display:"flex", gap:4 }}>
          {Array.from({ length:competition.total_stages }, (_,i) => (
            <div key={i} style={{
              width:22, height:22, borderRadius:"50%",
              background:i+1<competition.current_stage ? GOLD : i+1===competition.current_stage ? `${GOLD}33` : "rgba(255,255,255,0.08)",
              border:`1.5px solid ${i+1<=competition.current_stage ? GOLD : "rgba(255,255,255,0.1)"}`,
              display:"flex", alignItems:"center", justifyContent:"center",
              color:i+1<competition.current_stage ? G : i+1===competition.current_stage ? GOLD : "rgba(255,255,255,0.3)",
              fontSize:10, fontWeight:800,
            }}>
              {i+1<competition.current_stage ? "✓" : i+1}
            </div>
          ))}
        </div>

        {/* Room code pill */}
        <div style={{ background:"rgba(201,168,76,0.12)", border:"1px solid rgba(201,168,76,0.3)", borderRadius:8, padding:"4px 10px", color:GOLD, fontWeight:800, fontSize:13, letterSpacing:2, flexShrink:0 }}>
          {competition.room_code}
        </div>
      </div>

      {/* ── MAIN SCROLLABLE BODY ──────────────────────────── */}
      <div style={{ flex:1, overflowY:"auto", position:"relative", zIndex:1, paddingBottom:myParticipant && !isJudge ? 110 : 16 }}>

        {/* Active Reciter Card */}
        <div style={{ padding:"16px 16px 0" }}>
          <div style={{
            background:activeP
              ? activeP.status==="reciting"
                ? "rgba(34,197,94,0.08)"
                : "rgba(201,168,76,0.08)"
              : "rgba(255,255,255,0.04)",
            border:`1.5px solid ${activeP ? activeP.status==="reciting" ? `${GREEN}55` : `${GOLD}55` : "rgba(255,255,255,0.08)"}`,
            borderRadius:20, padding:"16px",
            animation:activeP?.status==="reciting" ? "recitingGlow 2.5s ease-in-out infinite" : activeP?.status==="called" ? "calledGlow 2s ease-in-out infinite" : "none",
          }}>
            {activeP ? (
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <Avatar name={activeP.participant_name} size={56} active={activeP.status==="reciting"} called={activeP.status==="called"}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ color:"#fff", fontWeight:800, fontSize:18, fontFamily:"Cinzel,serif", lineHeight:1.2 }}>{activeP.participant_name}</div>
                    {activeP.school && <div style={{ color:"rgba(255,255,255,0.4)", fontSize:12, marginTop:2 }}>{activeP.school}</div>}
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:8 }}>
                      <span style={{
                        background:`${STATUS_COLOR[activeP.status]}18`,
                        border:`1px solid ${STATUS_COLOR[activeP.status]}`,
                        color:STATUS_COLOR[activeP.status], borderRadius:20,
                        padding:"3px 12px", fontSize:12, fontWeight:700,
                      }}>
                        {STATUS_ICON[activeP.status]} {STATUS_LABEL[activeP.status]}
                      </span>
                      {timerActive && (
                        <span style={{ color:timerSecs>competition.time_limit_seconds*0.8 ? RED : GREEN, fontWeight:800, fontSize:16, display:"flex", alignItems:"center", gap:4 }}>
                          <Clock size={13}/>{fmtTime(timerSecs)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Assigned passage */}
                {currentAttempt && (
                  <div style={{ marginTop:12, background:"rgba(201,168,76,0.08)", border:"1px solid rgba(201,168,76,0.2)", borderRadius:12, padding:"10px 14px" }}>
                    <div style={{ color:GOLD, fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", marginBottom:4 }}>Assigned Passage</div>
                    <div style={{ color:"#fff", fontWeight:700, fontSize:14 }}>{currentAttempt.scope_label}</div>
                    <div style={{ color:"rgba(255,255,255,0.4)", fontSize:13, direction:"rtl", fontFamily:"Amiri,serif", marginTop:2 }}>{currentAttempt.scope_label_ar}</div>
                  </div>
                )}

                {bellCount > 0 && (
                  <div style={{ marginTop:8, display:"flex", alignItems:"center", gap:6 }}>
                    <Bell size={13} color={GOLD}/>
                    <span style={{ color:GOLD, fontWeight:700, fontSize:13 }}>{bellCount} error{bellCount!==1?"s":""} · −{bellCount*2} pts</span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display:"flex", alignItems:"center", gap:14, padding:"8px 0" }}>
                <div style={{ width:52, height:52, borderRadius:"50%", background:"rgba(201,168,76,0.07)", border:"2px dashed rgba(201,168,76,0.2)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <Mic size={22} color="rgba(201,168,76,0.35)"/>
                </div>
                <div>
                  <div style={{ color:"rgba(255,255,255,0.5)", fontSize:14, fontWeight:600 }}>
                    {competition.status==="open" ? "Awaiting start..." : "Select a participant below"}
                  </div>
                  <div style={{ color:"rgba(255,255,255,0.25)", fontSize:12, marginTop:2 }}>
                    {participants.length} registered · {waiting.length} waiting
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* JUDGE CONTROLS */}
        {isJudge && (
          <div style={{ padding:"12px 16px 0" }}>
            {/* Tab switcher */}
            <div style={{ display:"flex", gap:0, background:"rgba(255,255,255,0.05)", borderRadius:12, padding:3, marginBottom:12 }}>
              {[["controls","⚙️ Controls"],["roster","👥 Roster"]].map(([tab, label]) => (
                <button key={tab} onClick={() => setJudgeTab(tab as any)} style={{
                  flex:1, background:judgeTab===tab ? "rgba(201,168,76,0.2)" : "transparent",
                  border:judgeTab===tab ? `1px solid rgba(201,168,76,0.4)` : "1px solid transparent",
                  borderRadius:10, padding:"8px 0", color:judgeTab===tab ? GOLD : "rgba(255,255,255,0.4)",
                  fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"Cairo,sans-serif",
                  transition:"all 0.2s",
                }}>
                  {label}
                </button>
              ))}
            </div>

            {judgeTab === "controls" && (
              <div style={{ display:"flex", flexDirection:"column", gap:10, animation:"fadeIn 0.2s ease" }}>
                {/* Start competition */}
                {competition.status==="open" && (
                  <button onClick={startCompetition} style={{
                    background:`linear-gradient(135deg, ${GREEN}dd 0%, #16a34a 100%)`,
                    color:"#fff", border:"none", borderRadius:14, padding:"15px",
                    cursor:"pointer", fontWeight:800, fontFamily:"Cairo,sans-serif",
                    fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                    boxShadow:`0 4px 20px rgba(34,197,94,0.3)`,
                  }}>
                    <Play size={18}/> Start Competition
                  </button>
                )}

                {/* Start reciting */}
                {activeP?.status==="called" && (
                  <button onClick={startReciting} style={{
                    background:`linear-gradient(135deg, ${GREEN}dd 0%, #16a34a 100%)`,
                    color:"#fff", border:"none", borderRadius:14, padding:"15px",
                    cursor:"pointer", fontWeight:800, fontFamily:"Cairo,sans-serif",
                    fontSize:15, display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                    boxShadow:`0 4px 20px rgba(34,197,94,0.3)`,
                  }}>
                    <Play size={18}/> Start Reciting ▶
                  </button>
                )}

                {/* BELL + STOP */}
                {activeP?.status==="reciting" && (
                  <div style={{ display:"grid", gridTemplateColumns:"1.2fr 1fr", gap:10 }}>
                    <button className="bell-btn" onClick={ringBell} style={{
                      background:`linear-gradient(135deg, ${GOLD} 0%, #e8c96a 40%, ${GOLDD} 100%)`,
                      color:G, border:"none", borderRadius:14, padding:"20px 0",
                      cursor:"pointer", fontWeight:900, fontSize:17,
                      display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                      boxShadow:`0 6px 28px rgba(201,168,76,0.5)`,
                      position:"relative", overflow:"hidden",
                    }}>
                      {bellCount > 0 && (
                        <span style={{ position:"absolute", top:8, right:8, background:RED, color:"#fff", borderRadius:"50%", width:22, height:22, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:900 }}>{bellCount}</span>
                      )}
                      <Bell size={24} strokeWidth={2.5}/>
                      Ring Bell
                    </button>
                    <button onClick={signalStop} style={{
                      background:`linear-gradient(135deg, ${RED} 0%, #dc2626 100%)`,
                      color:"#fff", border:"none", borderRadius:14, padding:"20px 0",
                      cursor:"pointer", fontWeight:800, fontSize:16,
                      display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                      boxShadow:`0 6px 20px rgba(239,68,68,0.35)`,
                    }}>
                      <StopCircle size={20}/> Stop
                    </button>
                  </div>
                )}

                {/* Score panel */}
                {showScorePanel && (
                  <div style={{ background:"rgba(201,168,76,0.07)", border:"1px solid rgba(201,168,76,0.25)", borderRadius:16, padding:"16px" }}>
                    <div style={{ color:GOLD, fontWeight:800, fontSize:14, marginBottom:12, display:"flex", alignItems:"center", gap:6 }}>
                      📝 Enter Score — {activeP?.participant_name}
                    </div>
                    {competition.use_criteria_scoring ? (
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
                        {SCORING_CRITERIA.map(c => (
                          <div key={c.key}>
                            <div style={{ color:"rgba(255,255,255,0.6)", fontSize:11, marginBottom:4, display:"flex", justifyContent:"space-between" }}>
                              <span>{c.label} / {c.labelAr}</span>
                              <span style={{ color:GOLD }}>/{c.max}</span>
                            </div>
                            <input type="number" min={0} max={c.max} value={scoreBreak[c.key]}
                              onChange={e => setScoreBreak(s => ({ ...s, [c.key]:e.target.value }))}
                              placeholder={`0–${c.max}`}
                              style={{ width:"100%", background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:8, padding:"8px 10px", color:"#fff", fontSize:14 }}/>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ marginBottom:10 }}>
                        <div style={{ color:"rgba(255,255,255,0.6)", fontSize:12, marginBottom:4 }}>Score /100</div>
                        <input type="number" min={0} max={100} value={scoreBreak.tajweed}
                          onChange={e => setScoreBreak(s => ({ ...s, tajweed:e.target.value }))}
                          style={{ width:"100%", background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:8, padding:"10px", color:"#fff", fontSize:16 }}/>
                      </div>
                    )}
                    <input type="text" value={judgeComment} onChange={e => setJudgeComment(e.target.value)} placeholder="Judge's comment (optional)"
                      style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, padding:"8px 12px", color:"#fff", fontSize:13, marginBottom:10 }}/>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                      {bellCount>0 && <span style={{ color:GOLD, fontSize:12 }}>⚠️ −{bellCount*2} bell penalty</span>}
                      <span style={{ color:GREEN, fontWeight:800, fontSize:16, marginLeft:"auto" }}>Final: {finalScore}/100</span>
                    </div>
                    <button onClick={submitScore} style={{
                      width:"100%", background:`linear-gradient(135deg, ${GREEN}dd 0%, #16a34a 100%)`,
                      color:"#fff", border:"none", borderRadius:10, padding:"12px",
                      cursor:"pointer", fontWeight:800, fontFamily:"Cairo,sans-serif", fontSize:14,
                      display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                    }}>
                      <CheckCircle size={16}/> Submit Score
                    </button>
                  </div>
                )}

                {/* Advance stage */}
                {competition.status==="active" && allDone && (
                  <button onClick={advanceStage} style={{
                    background:competition.current_stage>=competition.total_stages
                      ? `linear-gradient(135deg, ${GOLD} 0%, ${GOLDD} 100%)`
                      : `linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)`,
                    color:"#fff", border:"none", borderRadius:14, padding:"14px",
                    cursor:"pointer", fontWeight:800, fontFamily:"Cairo,sans-serif",
                    fontSize:15, display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                    boxShadow:`0 4px 20px rgba(124,58,237,0.3)`,
                  }}>
                    {competition.current_stage>=competition.total_stages
                      ? <><Trophy size={18}/> End & Show Results</>
                      : <><ArrowRight size={18}/> Next Stage {competition.current_stage+1}</>}
                  </button>
                )}

                {/* Stats */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                  {[["⏳",waiting.length,"Waiting"],[`🎙️`,done.length,"Done"],["👥",participants.length,"Total"]].map(([icon,n,label]) => (
                    <div key={label as string} style={{ background:"rgba(255,255,255,0.04)", borderRadius:12, padding:"10px 8px", textAlign:"center" }}>
                      <div style={{ fontSize:16 }}>{icon}</div>
                      <div style={{ color:GOLD, fontWeight:800, fontSize:18 }}>{n}</div>
                      <div style={{ color:"rgba(255,255,255,0.35)", fontSize:11 }}>{label}</div>
                    </div>
                  ))}
                </div>

                <button onClick={() => setView("results")} style={{ background:"transparent", color:"rgba(255,255,255,0.3)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"10px", cursor:"pointer", fontFamily:"Cairo,sans-serif", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                  <Award size={13}/> View Live Standings
                </button>
              </div>
            )}

            {judgeTab === "roster" && (
              <div style={{ animation:"fadeIn 0.2s ease" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                  <span style={{ color:"rgba(255,255,255,0.5)", fontSize:13 }}>
                    <Users size={13} style={{ marginRight:4, verticalAlign:"middle" }}/>{participants.length} registered
                  </span>
                  <div style={{ display:"flex", gap:4 }}>
                    {[["list",<List size={12}/>],["grid",<LayoutGrid size={12}/>]].map(([mode, icon]) => (
                      <button key={mode as string} onClick={() => setRosterMode(mode as any)} style={{
                        background:rosterMode===mode ? `${GOLD}22` : "rgba(255,255,255,0.05)",
                        border:`1px solid ${rosterMode===mode ? GOLD : "rgba(255,255,255,0.1)"}`,
                        borderRadius:8, padding:"5px 9px", cursor:"pointer", color:rosterMode===mode ? GOLD : "rgba(255,255,255,0.3)",
                      }}>
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>

                {participants.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"32px 0", color:"rgba(255,255,255,0.3)" }}>
                    <Users size={32} style={{ opacity:0.2, marginBottom:8 }}/>
                    <p style={{ margin:0, fontSize:13 }}>Share code: <strong style={{ color:GOLD, letterSpacing:3 }}>{competition.room_code}</strong></p>
                  </div>
                ) : rosterMode==="list" ? (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {participants.map(p => {
                      const isActive = p.id===activeP?.id;
                      const isMe     = p.id===myParticipant?.id;
                      return (
                        <div key={p.id} className="participant-row" style={{
                          background:isActive ? `rgba(201,168,76,0.1)` : isMe ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.03)",
                          border:`1.5px solid ${isActive ? GOLD : isMe ? `${GREEN}55` : p.proctor_flagged ? `${RED}55` : "rgba(255,255,255,0.08)"}`,
                          borderRadius:14, padding:"12px 14px", display:"flex", alignItems:"center", gap:10,
                        }}>
                          <span style={{ color:"rgba(255,255,255,0.2)", fontSize:11, width:18, textAlign:"center" }}>#{p.queue_position}</span>
                          <Avatar name={p.participant_name} size={36} active={isActive} called={p.status==="called"}/>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                              <span style={{ color:isActive?GOLD:"#fff", fontWeight:700, fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.participant_name}</span>
                              {isMe && <span style={{ color:GREEN, fontSize:10, fontWeight:800 }}>YOU</span>}
                              {p.proctor_flagged && <Flag size={11} color={RED}/>}
                            </div>
                            {p.school && <div style={{ color:"rgba(255,255,255,0.3)", fontSize:11 }}>{p.school}</div>}
                          </div>
                          <div style={{ background:`${STATUS_COLOR[p.status]}18`, border:`1px solid ${STATUS_COLOR[p.status]}55`, color:STATUS_COLOR[p.status], borderRadius:20, padding:"2px 9px", fontSize:11, fontWeight:700, flexShrink:0 }}>
                            {STATUS_ICON[p.status]} {STATUS_LABEL[p.status]}
                          </div>
                          {p.total_score>0 && <div style={{ color:GOLD, fontWeight:800, fontSize:16, flexShrink:0 }}>{p.total_score}</div>}
                          {competition.status==="active" && p.status==="waiting" && !activeP && (
                            <button onClick={() => callParticipant(p)} style={{ background:`${GOLD}22`, color:GOLD, border:`1px solid ${GOLD}55`, borderRadius:8, padding:"6px 12px", cursor:"pointer", fontWeight:700, fontSize:12, flexShrink:0, fontFamily:"Cairo,sans-serif", display:"flex", alignItems:"center", gap:4 }}>
                              <PhoneCall size={12}/> Call
                            </button>
                          )}
                          {p.status==="waiting" && (
                            <button onClick={async () => { await supabase.from("musabaqah_participants" as any).update({ status:"absent" }).eq("id", p.id); loadParticipants(); }} style={{ background:"transparent", color:"rgba(255,255,255,0.2)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, padding:"4px 8px", cursor:"pointer", fontSize:10, flexShrink:0 }}>
                              Absent
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))", gap:8 }}>
                    {participants.map(p => {
                      const isActive = p.id===activeP?.id;
                      return (
                        <div key={p.id} style={{ background:isActive?`${GOLD}12`:"rgba(255,255,255,0.04)", border:`1.5px solid ${isActive?GOLD:p.proctor_flagged?RED:"rgba(255,255,255,0.09)"}`, borderRadius:14, padding:"12px 10px", textAlign:"center", position:"relative" }}>
                          {p.proctor_flagged && <div style={{ position:"absolute", top:6, right:6 }}><Flag size={11} color={RED}/></div>}
                          <Avatar name={p.participant_name} size={44} active={isActive} called={p.status==="called"}/>
                          <div style={{ color:isActive?GOLD:"#fff", fontWeight:700, fontSize:12, marginTop:7, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.participant_name}</div>
                          <div style={{ color:STATUS_COLOR[p.status], fontSize:10, fontWeight:700, marginTop:4 }}>{STATUS_ICON[p.status]} {STATUS_LABEL[p.status]}</div>
                          {p.total_score>0 && <div style={{ color:GOLD, fontWeight:900, fontSize:16, marginTop:4 }}>{p.total_score}</div>}
                          {competition.status==="active" && p.status==="waiting" && !activeP && (
                            <button onClick={() => callParticipant(p)} style={{ width:"100%", marginTop:8, background:`${GOLD}20`, color:GOLD, border:`1px solid ${GOLD}55`, borderRadius:8, padding:"5px 0", cursor:"pointer", fontWeight:700, fontSize:11, fontFamily:"Cairo,sans-serif" }}>
                              <PhoneCall size={11} style={{ marginRight:4, verticalAlign:"middle" }}/>Call
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* PARTICIPANT VIEW — waiting */}
        {!isJudge && myParticipant && (
          <div style={{ padding:"12px 16px 0" }}>
            {myParticipant.status==="waiting" && (
              <div className="glass-card" style={{ borderRadius:18, padding:"20px", textAlign:"center" }}>
                <div style={{ fontSize:40, marginBottom:8 }}>⏳</div>
                <div style={{ color:GOLD, fontWeight:800, fontSize:16 }}>Waiting in Queue</div>
                <div style={{ color:"rgba(255,255,255,0.4)", fontSize:13, marginTop:4 }}>
                  Position #{myParticipant.queue_position} of {participants.length}
                </div>
                <div style={{ color:"rgba(255,255,255,0.25)", fontSize:12, marginTop:8 }}>
                  Your judge will call you when it's your turn. Stay ready!
                </div>
              </div>
            )}
            {(myParticipant.status==="called"||myParticipant.status==="reciting") && (
              <div style={{ background:`rgba(201,168,76,0.1)`, border:`2px solid ${GOLD}`, borderRadius:18, padding:"20px", textAlign:"center", animation:"calledGlow 2s ease-in-out infinite" }}>
                <div style={{ fontSize:44, marginBottom:8, animation:"floatUp 2s ease-in-out infinite" }}>🎙️</div>
                <div style={{ color:GOLD, fontWeight:900, fontSize:18, letterSpacing:1 }}>
                  {myParticipant.status==="called" ? "YOU HAVE BEEN CALLED!" : "Now Reciting..."}
                </div>
                <div style={{ color:"rgba(255,255,255,0.55)", fontSize:13, marginTop:6, marginBottom:12 }}>
                  {myParticipant.status==="called" ? "Unmute your mic and prepare to recite" : "Recite clearly and confidently"}
                </div>

                {/* Assigned passage */}
                {calledScope && (
                  <div style={{ background:"rgba(0,0,0,0.3)", border:`1px solid ${GOLD}44`, borderRadius:12, padding:"12px 16px", marginBottom:16, textAlign:"center" }}>
                    <div style={{ color:GOLD, fontSize:10, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", marginBottom:6 }}>📖 Your Assigned Passage</div>
                    <div style={{ color:"#fff", fontWeight:800, fontSize:17 }}>{calledScope.label}</div>
                    {calledScope.labelAr && (
                      <div style={{ color:"rgba(255,255,255,0.55)", fontSize:16, direction:"rtl", fontFamily:"Amiri,serif", marginTop:4 }}>{calledScope.labelAr}</div>
                    )}
                  </div>
                )}

                <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
                  <button onClick={() => { wakeAudio(); toggleMic(); }} style={{
                    background:micOn ? `${GREEN}22` : "rgba(255,255,255,0.08)",
                    border:`2px solid ${micOn ? GREEN : "rgba(255,255,255,0.2)"}`,
                    borderRadius:12, padding:"12px 20px", cursor:"pointer",
                    color:micOn ? GREEN : "rgba(255,255,255,0.6)",
                    display:"flex", alignItems:"center", gap:6, fontSize:14, fontFamily:"Cairo,sans-serif", fontWeight:700,
                  }}>
                    {micOn ? <Mic size={18}/> : <MicOff size={18}/>}
                    {micOn ? "Mic On" : "Unmute"}
                  </button>
                  <button onClick={() => { wakeAudio(); toggleCam(); }} style={{
                    background:camOn ? `${GREEN}22` : "rgba(255,255,255,0.08)",
                    border:`2px solid ${camOn ? GREEN : "rgba(255,255,255,0.2)"}`,
                    borderRadius:12, padding:"12px 20px", cursor:"pointer",
                    color:camOn ? GREEN : "rgba(255,255,255,0.6)",
                    display:"flex", alignItems:"center", gap:6, fontSize:14, fontFamily:"Cairo,sans-serif", fontWeight:700,
                  }}>
                    {camOn ? <Video size={18}/> : <VideoOff size={18}/>}
                    Camera
                  </button>
                </div>
              </div>
            )}
            {myParticipant.status==="completed" && (
              <div className="glass-card" style={{ borderRadius:18, padding:"20px", textAlign:"center" }}>
                <div style={{ fontSize:48, marginBottom:8 }}>✅</div>
                <div style={{ color:GREEN, fontWeight:800, fontSize:18 }}>Recitation Complete</div>
                <div style={{ color:GOLD, fontWeight:900, fontSize:40, marginTop:8 }}>{myParticipant.total_score}</div>
                <div style={{ color:"rgba(255,255,255,0.4)", fontSize:13 }}>Total Points</div>
              </div>
            )}

            {/* Roster for participants */}
            <div style={{ marginTop:16 }}>
              <div style={{ color:"rgba(255,255,255,0.4)", fontSize:13, fontWeight:600, marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
                <Users size={13}/> {participants.length} Participants
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {participants.map(p => {
                  const isMe = p.id===myParticipant?.id;
                  return (
                    <div key={p.id} style={{
                      background:isMe?"rgba(201,168,76,0.08)":p.id===activeP?.id?"rgba(34,197,94,0.07)":"rgba(255,255,255,0.03)",
                      border:`1px solid ${isMe?`${GOLD}44`:p.id===activeP?.id?`${GREEN}44`:"rgba(255,255,255,0.07)"}`,
                      borderRadius:12, padding:"10px 14px", display:"flex", alignItems:"center", gap:10,
                    }}>
                      <span style={{ color:"rgba(255,255,255,0.2)", fontSize:11, width:18 }}>#{p.queue_position}</span>
                      <Avatar name={p.participant_name} size={32} active={p.id===activeP?.id&&p.status==="reciting"} called={p.status==="called"}/>
                      <div style={{ flex:1 }}>
                        <div style={{ color:isMe?GOLD:"#fff", fontWeight:isMe?700:500, fontSize:14 }}>
                          {p.participant_name}{isMe && <span style={{ color:GREEN, fontSize:11, marginLeft:6 }}>YOU</span>}
                        </div>
                      </div>
                      <span style={{ color:STATUS_COLOR[p.status], fontSize:12, fontWeight:700 }}>
                        {STATUS_ICON[p.status]} {STATUS_LABEL[p.status]}
                      </span>
                      {p.total_score>0 && <span style={{ color:GOLD, fontWeight:800, fontSize:15 }}>{p.total_score}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MY STATUS BAR + REACTIONS — sticky bottom (participants only) */}
      {!isJudge && myParticipant && (
        <div style={{
          position:"fixed", bottom:0, left:0, right:0, zIndex:20,
          background:"rgba(5,15,8,0.97)", backdropFilter:"blur(20px)",
          borderTop:"1px solid rgba(201,168,76,0.2)",
        }}>
          {/* Reaction bar — always visible for audience */}
          {(myParticipant.status==="waiting"||myParticipant.status==="completed") && activeP && (
            <div style={{ padding:"8px 16px 0", display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ color:"rgba(255,255,255,0.3)", fontSize:11, flexShrink:0 }}>React:</span>
              <div style={{ display:"flex", gap:6, overflowX:"auto" }}>
                {REACTION_EMOJIS.map(e => (
                  <button key={e} onClick={() => sendReaction(e)} style={{
                    background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)",
                    borderRadius:10, padding:"6px 10px", cursor:"pointer", fontSize:20, flexShrink:0,
                    transition:"transform 0.1s",
                  }} onTouchStart={ev => (ev.currentTarget.style.transform="scale(1.3)")}
                    onTouchEnd={ev => (ev.currentTarget.style.transform="scale(1)")}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Status row */}
          <div style={{ padding:"10px 16px 12px", display:"flex", alignItems:"center", gap:12 }}>
            <Avatar name={myParticipant.participant_name} size={36} active={myParticipant.status==="reciting"} called={myParticipant.status==="called"}/>
            <div style={{ flex:1 }}>
              <div style={{ color:"#fff", fontWeight:700, fontSize:13 }}>{myParticipant.participant_name}</div>
              <div style={{ color:STATUS_COLOR[myParticipant.status], fontSize:12, fontWeight:600, marginTop:2 }}>
                {myParticipant.status==="called"    && "🔔 YOU HAVE BEEN CALLED!"}
                {myParticipant.status==="reciting"  && "🎙️ Now Reciting..."}
                {myParticipant.status==="waiting"   && `⏳ Waiting — #${myParticipant.queue_position}`}
                {myParticipant.status==="completed" && "✅ Done"}
              </div>
            </div>
            {/* Sound enable button */}
            {!audioReady && (
              <button onClick={wakeAudio} style={{
                background:`${GOLD}22`, border:`1px solid ${GOLD}55`, borderRadius:10,
                padding:"6px 12px", cursor:"pointer", color:GOLD, fontSize:11, fontWeight:700,
                display:"flex", alignItems:"center", gap:4, fontFamily:"Cairo,sans-serif",
              }}>
                <Volume2 size={13}/> Enable Sound
              </button>
            )}
            {myParticipant.total_score>0 && <div style={{ color:GOLD, fontWeight:900, fontSize:22 }}>{myParticipant.total_score}<span style={{ color:"rgba(255,255,255,0.3)", fontSize:11 }}> pts</span></div>}
          </div>
        </div>
      )}
    </div>
  );
}
