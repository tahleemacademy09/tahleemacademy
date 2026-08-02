/*
  MustabaqahPage.tsx — Tahleem Academy  (v3)
  ════════════════════════════════════════════════════════
  Fixes & improvements:
  ✅ Back button in arena top bar
  ✅ Bell & Stop are instant — broadcast FIRST, DB async (no blocking await)
  ✅ Countdown timer per student — judge sets duration; expires → Extra / Stop modal
  ✅ Observer view: top-half video (VIEWING badge, no controls), bottom list
  ✅ Camera/mic controls ONLY for judge + active participant (not observers or waiting)
  ✅ Participants list clean — no duplication
  ✅ Question displayed prominently for all roles
  ✅ Tiles regenerated per stage/call (already via TILES_SHOWN)
  ✅ LiveKit: better reconnect + adaptive stream settings
  ✅ Fixed text overflow / overlap in video panel
*/

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  LiveKitRoom, RoomAudioRenderer, useLocalParticipant,
  useRemoteParticipants, VideoTrack, useRoomContext,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track, RoomEvent, ConnectionState } from "livekit-client";
import { queueMediaOp } from "@/components/classroom/classroomComponents";
import {
  Mic, MicOff, Video, VideoOff, Bell, Play, Trophy, Users,
  Plus, Clock, BookOpen, CheckCircle, RefreshCw, ChevronRight,
  Award, Radio, ArrowRight, LogIn, StopCircle, Loader2,
  PhoneCall, List, LayoutGrid, Volume2, Crown, ArrowLeft,
  TimerReset, AlertTriangle, Settings, Wand2, Wifi, WifiOff, Sparkles, Eye, Shuffle,
} from "lucide-react";

const G    = "#0f2d1f";
const GM   = "#163d28";
const GD   = "#0a1f12";
const GOLD = "#c9a84c";
const GOLDD= "#a8843a";
const RED  = "#ef4444";
const GREEN= "#22c55e";

const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Amiri+Quran&family=Amiri:wght@400;700&family=Cinzel:wght@400;600;700;900&display=swap');
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    @keyframes rotatePattern{from{transform:rotate(0)}to{transform:rotate(360deg)}}
    @keyframes floatUp{0%,100%{transform:translateY(0) scale(1);opacity:.6}50%{transform:translateY(-12px) scale(1.02);opacity:1}}
    @keyframes pulseRing{0%{transform:scale(1);opacity:1}100%{transform:scale(2.2);opacity:0}}
    @keyframes bellSwing{0%,100%{transform:rotate(0)}20%{transform:rotate(-20deg)}40%{transform:rotate(20deg)}60%{transform:rotate(-12deg)}80%{transform:rotate(8deg)}}
    @keyframes countdownPop{0%{transform:scale(.4);opacity:0}30%{transform:scale(1.15);opacity:1}100%{transform:scale(1);opacity:1}}
    @keyframes fadeSlideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes recitingGlow{0%,100%{box-shadow:0 0 20px rgba(34,197,94,.4)}50%{box-shadow:0 0 40px rgba(34,197,94,.8)}}
    @keyframes calledGlow{0%,100%{box-shadow:0 0 20px rgba(201,168,76,.5)}50%{box-shadow:0 0 50px rgba(201,168,76,.9)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes staggerIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    @keyframes tileReveal{0%{transform:scale(.8) rotateY(90deg);opacity:0}100%{transform:scale(1) rotateY(0);opacity:1}}
    @keyframes questionSlide{from{opacity:0;transform:translateY(24px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
    @keyframes timerPulse{0%,100%{opacity:1}50%{opacity:.5}}
    .anim-slide-up{animation:fadeSlideUp .45s cubic-bezier(.22,1,.36,1) both}
    .gold-btn{background:linear-gradient(135deg,#c9a84c 0%,#e8c96a 40%,#c9a84c 60%,#a8843a 100%);background-size:200% auto;transition:background-position .4s,transform .15s,box-shadow .15s}
    .gold-btn:hover{background-position:right center;transform:translateY(-1px);box-shadow:0 8px 32px rgba(201,168,76,.5)}
    .gold-btn:active{transform:scale(.97)}
    .glass-card{background:rgba(22,61,40,.55);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(201,168,76,.18)}
    .tile-revealed{animation:tileReveal .45s cubic-bezier(.22,1,.36,1) both}
    .question-slide{animation:questionSlide .5s cubic-bezier(.22,1,.36,1) both}
    .stagger-1{animation:staggerIn .4s .05s both}.stagger-2{animation:staggerIn .4s .10s both}
    .stagger-3{animation:staggerIn .4s .15s both}.stagger-4{animation:staggerIn .4s .20s both}
    .stagger-5{animation:staggerIn .4s .25s both}
    input,select,textarea{font-family:'Cairo',sans-serif!important}
    input:focus,select:focus,textarea:focus{outline:none;border-color:rgba(201,168,76,.7)!important;box-shadow:0 0 0 3px rgba(201,168,76,.15)}
    ::-webkit-scrollbar{width:4px;height:4px}
    ::-webkit-scrollbar-track{background:transparent}
    ::-webkit-scrollbar-thumb{background:rgba(201,168,76,.3);border-radius:2px}
    .timer-warning{animation:timerPulse .8s ease-in-out infinite}
    /* Local self-view is mirrored (selfie style) — matches what the user
       sees in the camera preview. Remote participants are NEVER mirrored. */
    .musabaqah-local-video video { transform:scaleX(-1)!important; -webkit-transform:scaleX(-1)!important; }
    .musabaqah-remote-video video { transform:none!important; -webkit-transform:none!important; }
  `}</style>
);

const IslamicBackground = () => (
  <div style={{position:"fixed",inset:0,zIndex:0,overflow:"hidden",pointerEvents:"none"}}>
    <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at 20% 20%,#1a4a2e 0%,${GD} 40%,#050f09 100%)`}}/>
    <svg style={{position:"absolute",top:"50%",left:"50%",width:"180vmax",height:"180vmax",transform:"translate(-50%,-50%)",opacity:.045,animation:"rotatePattern 120s linear infinite"}} viewBox="0 0 800 800">
      <defs><pattern id="star8m" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
        <polygon points="50,5 58,35 88,35 65,55 73,85 50,67 27,85 35,55 12,35 42,35" fill="none" stroke={GOLD} strokeWidth="0.8"/>
        <line x1="0" y1="50" x2="100" y2="50" stroke={GOLD} strokeWidth="0.2" opacity="0.4"/>
        <line x1="50" y1="0" x2="50" y2="100" stroke={GOLD} strokeWidth="0.2" opacity="0.4"/>
      </pattern></defs>
      <rect width="100%" height="100%" fill="url(#star8m)"/>
    </svg>
  </div>
);

const BellFlash = ({ visible, count }: { visible:boolean; count:number }) => (
  <div style={{position:"fixed",inset:0,zIndex:9999,pointerEvents:"none",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",opacity:visible?1:0,transition:"opacity .15s",background:visible?"rgba(0,0,0,.6)":"transparent"}}>
    {visible && <>
      <div style={{position:"relative",width:130,height:130,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{position:"absolute",inset:0,borderRadius:"50%",background:"rgba(201,168,76,.3)",animation:"pulseRing .8s ease-out"}}/>
        <div style={{position:"absolute",inset:10,borderRadius:"50%",background:"rgba(201,168,76,.5)",animation:"pulseRing .8s ease-out .15s"}}/>
        <div style={{position:"relative",width:88,height:88,borderRadius:"50%",background:`radial-gradient(circle,${GOLD},${GOLDD})`,display:"flex",alignItems:"center",justifyContent:"center",animation:"bellSwing .6s ease"}}>
          <Bell size={40} color={G} strokeWidth={2.5}/>
        </div>
      </div>
      <div style={{marginTop:14,fontFamily:"Cairo,sans-serif",fontWeight:900,fontSize:24,color:"#fff",letterSpacing:4}}>خطأ • ERROR</div>
      {count>0 && <div style={{marginTop:6,fontFamily:"Cairo,sans-serif",fontWeight:700,fontSize:16,color:GOLD}}>Bell #{count} · −{count*2} pts</div>}
    </>}
  </div>
);

/** Shared 3-2-1 countdown shown to judge, participant, and observers alike —
 *  purely visual on non-judge clients; the judge's own client is the one that
 *  calls startReciting() the moment this finishes, which is also exactly when
 *  the real recitation timer begins. */
const CountdownOverlay = ({ value }: { value:number|null }) => (
  <div style={{position:"fixed",inset:0,zIndex:10000,pointerEvents:"none",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",opacity:value!==null?1:0,transition:"opacity .15s",background:value!==null?"rgba(0,0,0,.7)":"transparent"}}>
    {value!==null && <>
      <div key={value} style={{width:150,height:150,borderRadius:"50%",background:`radial-gradient(circle,${GOLD},${GOLDD})`,display:"flex",alignItems:"center",justifyContent:"center",animation:"countdownPop 1s ease"}}>
        <span style={{fontFamily:"Cinzel,serif",fontWeight:900,fontSize:72,color:G}}>{value}</span>
      </div>
      <div style={{marginTop:18,fontFamily:"Cairo,sans-serif",fontWeight:800,fontSize:16,color:"#fff",letterSpacing:2}}>GET READY TO RECITE</div>
    </>}
  </div>
);

const StopFlash = ({ visible }: { visible:boolean }) => (
  <div style={{position:"fixed",inset:0,zIndex:9998,pointerEvents:"none",display:"flex",alignItems:"center",justifyContent:"center",background:visible?"rgba(239,68,68,.22)":"transparent",border:visible?`4px solid ${RED}`:"4px solid transparent",transition:"all .15s"}}>
    {visible && <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,animation:"fadeSlideUp .2s ease"}}>
      <StopCircle size={90} color={RED} strokeWidth={1.5}/>
      <div style={{fontFamily:"Cairo,sans-serif",fontWeight:900,fontSize:32,color:"#fff",letterSpacing:6}}>قف • STOP</div>
    </div>}
  </div>
);

/* ── Timer expired modal ── */
const TimerExpiredModal = ({ name, onExtraTime, onStop }: { name:string; onExtraTime:()=>void; onStop:()=>void }) => (
  <div style={{position:"fixed",inset:0,zIndex:9990,background:"rgba(0,0,0,.8)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div className="anim-slide-up glass-card" style={{borderRadius:22,padding:"28px 24px",maxWidth:360,width:"100%",textAlign:"center",border:`1.5px solid ${RED}66`}}>
      <div style={{fontSize:48,marginBottom:8}}>⏱️</div>
      <h3 style={{color:"#fff",fontFamily:"Cinzel,sans-serif",fontSize:18,margin:"0 0 6px",fontWeight:700}}>Time's Up!</h3>
      <p style={{color:"rgba(255,255,255,.55)",fontSize:13,margin:"0 0 20px",lineHeight:1.6}}>
        <strong style={{color:GOLD}}>{name}</strong>'s time has expired.
      </p>
      <div style={{display:"flex",gap:10}}>
        <button onClick={onExtraTime} style={{flex:1,background:`${GOLD}22`,color:GOLD,border:`1.5px solid ${GOLD}66`,borderRadius:12,padding:"13px 0",cursor:"pointer",fontFamily:"Cairo,sans-serif",fontWeight:800,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          <TimerReset size={16}/> +30s Extra
        </button>
        <button onClick={onStop} style={{flex:1,background:"linear-gradient(135deg,#991b1b,#dc2626)",color:"#fff",border:"none",borderRadius:12,padding:"13px 0",cursor:"pointer",fontFamily:"Cairo,sans-serif",fontWeight:800,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          <StopCircle size={16}/> Stop
        </button>
      </div>
    </div>
  </div>
);

const Avatar = ({ name, size=44, active=false, called=false }: { name:string; size?:number; active?:boolean; called?:boolean }) => {
  const initials = name.split(" ").slice(0,2).map(w=>w[0]?.toUpperCase()||"").join("");
  return (
    <div style={{width:size,height:size,borderRadius:"50%",flexShrink:0,background:active?`linear-gradient(135deg,${GOLD},${GOLDD})`:called?`linear-gradient(135deg,#f97316,#ea580c)`:`linear-gradient(135deg,${GM},#0a1f12)`,border:active?`2.5px solid ${GOLD}`:called?"2.5px solid #f97316":`1.5px solid rgba(201,168,76,.25)`,display:"flex",alignItems:"center",justifyContent:"center",color:active?G:GOLD,fontWeight:800,fontFamily:"Cairo,sans-serif",fontSize:size*.38,animation:active?"recitingGlow 2s ease-in-out infinite":called?"calledGlow 1.5s ease-in-out infinite":"none"}}>
      {initials||"?"}
    </div>
  );
};

let _actx: AudioContext|null = null;
const getACtx = () => {
  if(!_actx) _actx=new (window.AudioContext||(window as any).webkitAudioContext)();
  if(_actx.state==="suspended") _actx.resume();
  return _actx;
};
const playBell = () => { try { const c=getACtx(),t=c.currentTime; [440,880,1320,1760].forEach((f,i)=>{ const o=c.createOscillator(),g=c.createGain(); o.type="sine"; o.frequency.setValueAtTime(f,t); g.gain.setValueAtTime(.35/(i+1),t); g.gain.exponentialRampToValueAtTime(.001,t+2.5); o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+2.5); }); } catch{} };
const playStop = () => { try { const c=getACtx(),t=c.currentTime; [0,.35].forEach(off=>{ const o=c.createOscillator(),g=c.createGain(); o.type="square"; o.frequency.setValueAtTime(2400,t+off); g.gain.setValueAtTime(.4,t+off); g.gain.exponentialRampToValueAtTime(.001,t+off+.3); o.connect(g); g.connect(c.destination); o.start(t+off); o.stop(t+off+.35); }); } catch{} };
const playCalled = () => { try { const c=getACtx(),t=c.currentTime; [523,659,784,1047].forEach((f,i)=>{ const o=c.createOscillator(),g=c.createGain(); o.type="sine"; o.frequency.value=f; g.gain.setValueAtTime(0,t+i*.12); g.gain.linearRampToValueAtTime(.3,t+i*.12+.05); g.gain.exponentialRampToValueAtTime(.001,t+i*.12+.7); o.connect(g); g.connect(c.destination); o.start(t+i*.12); o.stop(t+i*.12+.8); }); } catch{} };
const playStageWin = () => { try { const c=getACtx(),t=c.currentTime; [523,659,784,659,784,1047].forEach((f,i)=>{ const o=c.createOscillator(),g=c.createGain(); o.type="triangle"; o.frequency.value=f; g.gain.setValueAtTime(.25,t+i*.15); g.gain.exponentialRampToValueAtTime(.001,t+i*.15+.3); o.connect(g); g.connect(c.destination); o.start(t+i*.15); o.stop(t+i*.15+.35); }); } catch{} };
const playTilePick = () => { try { const c=getACtx(),t=c.currentTime; [440,660,880].forEach((f,i)=>{ const o=c.createOscillator(),g=c.createGain(); o.type="sine"; o.frequency.value=f; g.gain.setValueAtTime(.2,t+i*.08); g.gain.exponentialRampToValueAtTime(.001,t+i*.08+.4); o.connect(g); g.connect(c.destination); o.start(t+i*.08); o.stop(t+i*.08+.5); }); } catch{} };

const SURAHS = [
  {n:1,en:"Al-Fatiha",ar:"الفاتحة",v:7,juz:1},
  {n:78,en:"An-Naba'",ar:"النبأ",v:40,juz:30},{n:87,en:"Al-A'la",ar:"الأعلى",v:19,juz:30},
  {n:88,en:"Al-Ghashiyah",ar:"الغاشية",v:26,juz:30},{n:89,en:"Al-Fajr",ar:"الفجر",v:30,juz:30},
  {n:93,en:"Ad-Duha",ar:"الضحى",v:11,juz:30},{n:94,en:"Ash-Sharh",ar:"الشرح",v:8,juz:30},
  {n:96,en:"Al-'Alaq",ar:"العلق",v:19,juz:30},{n:99,en:"Az-Zalzalah",ar:"الزلزلة",v:8,juz:30},
  {n:100,en:"Al-'Adiyat",ar:"العاديات",v:11,juz:30},{n:101,en:"Al-Qari'ah",ar:"القارعة",v:11,juz:30},
  {n:102,en:"At-Takathur",ar:"التكاثر",v:8,juz:30},{n:103,en:"Al-'Asr",ar:"العصر",v:3,juz:30},
  {n:104,en:"Al-Humazah",ar:"الهمزة",v:9,juz:30},{n:105,en:"Al-Fil",ar:"الفيل",v:5,juz:30},
  {n:106,en:"Quraysh",ar:"قريش",v:4,juz:30},{n:107,en:"Al-Ma'un",ar:"الماعون",v:7,juz:30},
  {n:108,en:"Al-Kawthar",ar:"الكوثر",v:3,juz:30},{n:109,en:"Al-Kafirun",ar:"الكافرون",v:6,juz:30},
  {n:110,en:"An-Nasr",ar:"النصر",v:3,juz:30},{n:112,en:"Al-Ikhlas",ar:"الإخلاص",v:4,juz:30},
  {n:113,en:"Al-Falaq",ar:"الفلق",v:5,juz:30},{n:114,en:"An-Nas",ar:"الناس",v:6,juz:30},
  {n:67,en:"Al-Mulk",ar:"الملك",v:30,juz:29},{n:36,en:"Ya-Sin",ar:"يس",v:83,juz:22},
  {n:55,en:"Ar-Rahman",ar:"الرحمن",v:78,juz:27},{n:56,en:"Al-Waqi'ah",ar:"الواقعة",v:96,juz:27},
];

interface Tile { num:number; label:string; labelAr:string; surah:number; ayah:number; surahName:string; surahAr:string; }

const genQuestion = (scopeType: string) => {
  const pool = scopeType==="juz30" ? SURAHS.filter(s=>s.juz===30) : scopeType==="juz29" ? SURAHS.filter(s=>s.juz>=29) : SURAHS;
  const ch = pool[Math.floor(Math.random()*pool.length)];
  const ayah = Math.floor(Math.random()*ch.v)+1;
  return { label:`${ch.en} — Ayah ${ayah}`, labelAr:`سورة ${ch.ar} — الآية ${ayah}`, surah:ch.n, ayah, surahName:ch.en, surahAr:ch.ar };
};
const genTiles = (scopeType: string, count=10): Tile[] =>
  Array.from({length:count}, (_,i) => ({ num:i+1, ...genQuestion(scopeType) }));

/** A single ayah reference resolved from the Quran API — surah/ayah number plus
 *  display names — used to build a Tile pool for Juz / Hizb / custom-range scopes. */
interface ScopeAyah { surah:number; ayah:number; surahName:string; surahAr:string; }

/** Fetch the full pool of ayahs belonging to a Juz, Hizb, or custom Surah/Ayah
 *  range from the public alquran.cloud API (the same API this page already uses
 *  for ayah text). Returns [] on any failure so callers can fall back safely. */
const fetchScopePool = async (scopeType:string, cfg:{
  juz_number?:number; hizb_number?:number;
  range_surah_start?:number; range_ayah_start?:number;
  range_surah_end?:number; range_ayah_end?:number;
}): Promise<ScopeAyah[]> => {
  try {
    if (scopeType==="juz" && cfg.juz_number) {
      const r = await fetch(`https://api.alquran.cloud/v1/juz/${cfg.juz_number}/quran-uthmani`);
      const d = await r.json();
      if (d?.code!==200) return [];
      return (d.data?.ayahs||[]).map((a:any)=>({
        surah:a.surah?.number, ayah:a.numberInSurah,
        surahName:a.surah?.englishName, surahAr:a.surah?.name,
      }));
    }
    if (scopeType==="hizb" && cfg.hizb_number) {
      // One Hizb = 4 Hizb-Quarters (240 quarters total across 60 Hizb).
      const quarters = [1,2,3,4].map(q => 4*(cfg.hizb_number!-1)+q);
      const results = await Promise.all(
        quarters.map(q=>fetch(`https://api.alquran.cloud/v1/hizbQuarter/${q}/quran-uthmani`).then(r=>r.json()))
      );
      const pool: ScopeAyah[] = [];
      results.forEach((d:any)=>{
        if (d?.code===200) (d.data?.ayahs||[]).forEach((a:any)=>pool.push({
          surah:a.surah?.number, ayah:a.numberInSurah, surahName:a.surah?.englishName, surahAr:a.surah?.name,
        }));
      });
      return pool;
    }
    if (scopeType==="custom_range" && cfg.range_surah_start && cfg.range_surah_end) {
      const r = await fetch("https://api.alquran.cloud/v1/surah");
      const d = await r.json();
      if (d?.code!==200) return [];
      const pool: ScopeAyah[] = [];
      (d.data||[]).forEach((s:any)=>{
        if (s.number < cfg.range_surah_start! || s.number > cfg.range_surah_end!) return;
        const ayahFrom = s.number===cfg.range_surah_start ? (cfg.range_ayah_start||1) : 1;
        const ayahTo   = s.number===cfg.range_surah_end   ? (cfg.range_ayah_end||s.numberOfAyahs) : s.numberOfAyahs;
        for (let a=ayahFrom; a<=Math.min(ayahTo,s.numberOfAyahs); a++) {
          pool.push({ surah:s.number, ayah:a, surahName:s.englishName, surahAr:s.name });
        }
      });
      return pool;
    }
  } catch(e) { console.warn("[Musabaqah] scope pool fetch failed", e); }
  return [];
};

/** Registration is open unless the judge manually closed it, or a deadline has
 *  passed and the judge hasn't manually overridden it back open. */
const isRegistrationOpen = (comp: {registration_deadline?:string|null; registration_override?:string}) => {
  if (comp.registration_override==="closed") return false;
  if (comp.registration_override==="open") return true;
  if (!comp.registration_deadline) return true;
  return new Date(comp.registration_deadline).getTime() > Date.now();
};

/** Purely time-based: has the registration deadline itself passed, regardless
 *  of any manual override? This drives the "your code is now unlocked" gate
 *  on the registered/holding screen — the deadline, not the override, is what
 *  decides when a registered participant may enter their code. */
const deadlinePassed = (comp?: {registration_deadline?:string|null}|null) => {
  if (!comp?.registration_deadline) return false;
  return new Date(comp.registration_deadline).getTime() <= Date.now();
};

/** A competition with a deadline can't have anyone admitted out of the
 *  "pending" queue until that deadline has actually passed (or the judge
 *  manually closed registration) — otherwise late registrants would be
 *  competing against people who already started. Competitions with no
 *  deadline at all are instant-join and this lock never applies to them. */
const admissionsLocked = (comp: {registration_deadline?:string|null; registration_override?:string}) =>
  !!comp.registration_deadline && isRegistrationOpen(comp);

/** The session start time is a SEPARATE thing from the registration deadline —
 *  the deadline only stops new sign-ups; the session start is set later by
 *  the admin/judge and is what actually opens the code-entry gate. A
 *  registered participant sits in "awaiting session" until this is set, then
 *  counts down to it, and only once it has arrived can they unlock with
 *  their code. If a competition never had a deadline in the first place,
 *  registration is instant-join and this whole gate is skipped entirely. */
const sessionStarted = (comp?: {session_start_at?:string|null}|null) => {
  if (!comp?.session_start_at) return false;
  return new Date(comp.session_start_at).getTime() <= Date.now();
};

const fmt = (s:number) => `${Math.floor(s/60)}:${String(Math.max(0,s)%60).padStart(2,"0")}`;

const NumberTilePicker = ({ tiles, pickedNum, onPick, canPick, stage }: { tiles:Tile[]; pickedNum:number|null; onPick:(t:Tile)=>void; canPick:boolean; stage:number }) => (
  <div style={{animation:"fadeIn .3s ease"}}>
    <div style={{textAlign:"center",marginBottom:14}}>
      <div style={{color:GOLD,fontWeight:900,fontSize:13,letterSpacing:2,textTransform:"uppercase"}}>Stage {stage} — Pick a Number</div>
      <div style={{color:"rgba(255,255,255,.35)",fontSize:11,marginTop:2,fontFamily:"Amiri,serif",direction:"rtl"}}>المرحلة {stage} — اختر رقماً</div>
      {canPick&&!pickedNum&&<div style={{color:"rgba(255,255,255,.3)",fontSize:11,marginTop:4}}>Tap a tile to reveal your question</div>}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
      {tiles.map(tile=>{
        const isPicked=pickedNum===tile.num, isOther=pickedNum!==null&&!isPicked;
        return (
          <div key={tile.num} className={isPicked?"tile-revealed":""} onClick={()=>canPick&&!pickedNum&&onPick(tile)}
            style={{height:64,borderRadius:14,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,background:isPicked?`linear-gradient(135deg,${GOLD},${GOLDD})`:"rgba(201,168,76,.12)",border:isPicked?`2px solid ${GOLD}`:`1.5px solid rgba(201,168,76,.${isOther?"1":"4"})`,cursor:canPick&&!pickedNum?"pointer":"default",opacity:isOther?.25:1,transition:"all .2s",boxShadow:isPicked?`0 0 24px rgba(201,168,76,.55)`:"none"}}>
            <span style={{fontFamily:"Cinzel,serif",fontWeight:900,fontSize:20,color:isPicked?G:GOLD,lineHeight:1}}>{tile.num}</span>
            {isPicked&&<span style={{fontSize:8,color:G,fontWeight:700,letterSpacing:.5}}>PICKED</span>}
          </div>
        );
      })}
    </div>
  </div>
);

/** Judge shuffles the waiting list into hidden boxes; each participant taps an
 *  unclaimed box and it flips to reveal their (server-assigned) queue position.
 *  Boxes already claimed by someone else show that person's name + position so
 *  everyone can watch the reveal happen live. */
const QueueBoxGrid = ({ boxCount, participants, myParticipantId, canPick, onPick }: {
  boxCount:number; participants:Participant[]; myParticipantId:string|null; canPick:boolean; onPick:(box:number)=>void;
}) => {
  const claimedByBox: Record<number, Participant> = {};
  participants.forEach(p => { if (p.queue_box_id) claimedByBox[p.queue_box_id] = p; });
  const myBox = participants.find(p=>p.id===myParticipantId)?.queue_box_id ?? null;
  return (
    <div style={{animation:"fadeIn .3s ease"}}>
      <div style={{textAlign:"center",marginBottom:14}}>
        <div style={{color:GOLD,fontWeight:900,fontSize:13,letterSpacing:2,textTransform:"uppercase"}}>Pick Your Box</div>
        <div style={{color:"rgba(255,255,255,.35)",fontSize:11,marginTop:2}}>Each box hides a queue position — tap one to reveal yours</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
        {Array.from({length:boxCount},(_,i)=>i+1).map(box=>{
          const claimant = claimedByBox[box];
          const isMine = myBox===box;
          return (
            <div key={box} className={claimant?"tile-revealed":""} onClick={()=>canPick&&!myBox&&!claimant&&onPick(box)}
              style={{height:64,borderRadius:14,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,
                background: claimant ? (isMine?`linear-gradient(135deg,${GOLD},${GOLDD})`:"rgba(255,255,255,.06)") : "rgba(201,168,76,.12)",
                border: isMine?`2px solid ${GOLD}`:claimant?"1.5px solid rgba(255,255,255,.15)":"1.5px solid rgba(201,168,76,.4)",
                cursor: canPick&&!myBox&&!claimant?"pointer":"default", opacity: claimant&&!isMine?.45:1, transition:"all .2s"}}>
              {claimant ? (
                <>
                  <span style={{fontFamily:"Cinzel,serif",fontWeight:900,fontSize:18,color:isMine?G:"#fff"}}>#{claimant.queue_position}</span>
                  <span style={{fontSize:7,color:isMine?G:"rgba(255,255,255,.55)",fontWeight:700,maxWidth:"90%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{claimant.participant_name}</span>
                </>
              ) : <span style={{fontFamily:"Cinzel,serif",fontWeight:900,fontSize:20,color:GOLD}}>?</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Read-only ordered roster so participants (not just the judge) can see who
 *  else is in the queue and where they stand. */
const QueueList = ({ list, myId, activeId }: { list:Participant[]; myId:string|null; activeId:string|null }) => (
  <div style={{marginTop:10,textAlign:"left"}}>
    {[...list].sort((a,b)=>a.queue_position-b.queue_position).map(p=>(
      <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 9px",borderRadius:9,marginBottom:4,
        background: p.id===myId?"rgba(201,168,76,.12)":p.id===activeId?"rgba(34,197,94,.08)":"rgba(255,255,255,.03)",
        border: p.id===myId?`1px solid ${GOLD}55`:"1px solid rgba(255,255,255,.05)"}}>
        <span style={{color:GOLD,fontWeight:800,fontSize:11,width:22,flexShrink:0}}>#{p.queue_position}</span>
        <Avatar name={p.participant_name} size={26}/>
        <span style={{color:"#fff",fontSize:12,fontWeight:p.id===myId?800:600,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.participant_name}{p.id===myId?" (You)":""}</span>
        <span style={{fontSize:14}}>{STATUS_ICON[p.status]}</span>
      </div>
    ))}
  </div>
);

const QuestionDisplay = ({ tile, ayahText, loadingAyah, isParticipant, isObserver, instructions }: { tile:Tile; ayahText:string|null; loadingAyah:boolean; isParticipant:boolean; isObserver?:boolean; instructions?:string }) => (
  <div className="question-slide" style={{background:"rgba(201,168,76,.08)",border:"1.5px solid rgba(201,168,76,.35)",borderRadius:18,padding:"18px 16px",marginTop:12}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
      <div style={{width:30,height:30,borderRadius:9,background:`linear-gradient(135deg,${GOLD},${GOLDD})`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><BookOpen size={14} color={G}/></div>
      <div style={{minWidth:0}}>
        <div style={{color:GOLD,fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase"}}>Question #{tile.num}</div>
        <div style={{color:"rgba(255,255,255,.35)",fontSize:10}}>Assigned Passage</div>
      </div>
    </div>
    <div style={{color:"#fff",fontWeight:800,fontSize:15,marginBottom:4,lineHeight:1.3}}>{tile.label}</div>
    <div style={{color:GOLD,fontSize:14,fontFamily:"Amiri,serif",direction:"rtl",marginBottom:10,lineHeight:1.6}}>{tile.labelAr}</div>
    {tile.surah>0&&(
      <div style={{background:"rgba(0,0,0,.35)",borderRadius:12,padding:"14px 12px",direction:"rtl",minHeight:54,display:"flex",alignItems:"center",justifyContent:"center"}}>
        {loadingAyah ? <Loader2 size={18} color={GOLD} style={{animation:"spin 1s linear infinite"}}/>
          : ayahText ? <div style={{fontFamily:"'Amiri Quran',serif",fontSize:20,color:"#fff",lineHeight:2.2,textAlign:"center"}}>{ayahText}<span style={{color:"rgba(201,168,76,.6)",fontSize:15}}> ﴿{tile.ayah}﴾</span></div>
          : <div style={{color:"rgba(255,255,255,.3)",fontSize:12}}>Loading ayah…</div>}
      </div>
    )}
    {/* Instructions block */}
    {instructions&&(
      <div style={{marginTop:12,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",borderRadius:10,padding:"10px 12px"}}>
        <div style={{color:GOLD,fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:"uppercase",marginBottom:4,display:"flex",alignItems:"center",gap:4}}><Eye size={10}/> Instructions</div>
        <div style={{color:"rgba(255,255,255,.75)",fontSize:12,lineHeight:1.7,whiteSpace:"pre-line"}}>{instructions}</div>
      </div>
    )}
    {isParticipant&&(
      <div style={{marginTop:12,background:"rgba(34,197,94,.1)",border:"1px solid rgba(34,197,94,.3)",borderRadius:10,padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
        <Mic size={13} color={GREEN}/><div style={{color:GREEN,fontSize:12,fontWeight:700}}>Prepare to recite — judge will signal Start</div>
      </div>
    )}
    {isObserver&&(
      <div style={{marginTop:10,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:10,padding:"7px 12px",display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:14}}>👁️</span><div style={{color:"rgba(255,255,255,.5)",fontSize:11}}>Following live — listen carefully</div>
      </div>
    )}
  </div>
);

/* ── VideoPanel — module-level so React never remounts it on re-renders ──── */
// CRITICAL: must be defined OUTSIDE LiveVideoGrid. If defined inside, React
// creates a new function reference on every render → unmount/remount → blink.
const VideoPanel = ({
  pub, participant: rp, localParticipant: lp, name, label, dominant, compact,
}:{
  pub:any; participant:any; localParticipant:any;
  name:string; label:string; dominant?:boolean; compact?:boolean;
}) => (
  <div style={{position:"relative",height:"100%",overflow:"hidden",background:"rgba(0,0,0,.9)",
    flex: compact ? "0 0 30%" : dominant ? "1 1 70%" : "1 1 100%",
    borderLeft: compact ? "1px solid rgba(201,168,76,.2)" : "none",
  }}>
    {pub?.videoTrack
      ? (
        // Local self-view is mirrored (selfie). Remote streams render as-is.
        <div className={(rp && rp !== lp) ? "musabaqah-remote-video" : "musabaqah-local-video"}
             style={{width:"100%",height:"100%",overflow:"hidden"}}>
          <VideoTrack
            trackRef={{participant: rp || lp, source: Track.Source.Camera, publication: pub}}
            style={{width:"100%",height:"100%",objectFit:"cover"}}/>
        </div>
      )
      : (
        <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:8}}>
          <div style={{width:48,height:48,borderRadius:"50%",background:`linear-gradient(135deg,${GOLD}44,${GOLDD}22)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:800,color:GOLD,fontFamily:"Cairo,sans-serif"}}>{name[0]?.toUpperCase()}</div>
          <div style={{color:"rgba(255,255,255,.3)",fontSize:11}}>{name}</div>
        </div>
      )
    }
    {/* Name label */}
    <div style={{position:"absolute",bottom:0,left:0,right:0,
      background:"linear-gradient(to top,rgba(0,0,0,.85) 0%,transparent 100%)",
      padding:"18px 10px 6px",display:"flex",alignItems:"flex-end",gap:6}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{color:"#fff",fontSize:compact?9:11,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontFamily:"Cairo,sans-serif"}}>
          {label}
        </div>
      </div>
      <div style={{width:6,height:6,borderRadius:"50%",background:GREEN,flexShrink:0,animation:"pulseRing 2s ease-in-out infinite"}}/>
    </div>
  </div>
);

/* ── Video grid — main dominant + a row of small switchable overlay tiles ──
 *  Every role (judge, active participant, waiting, observer) gets a main
 *  video plus small tiles for every *other* live feed — every judge (there
 *  can be more than one) and the active participant. Tapping any small tile
 *  swaps it into the main view; tapping the main view's own small self-tile
 *  (if present) swaps back. The choice is per-viewer (pinnedUserId), not
 *  broadcast — everyone can look at whoever they want independently. */
const LiveVideoGrid = ({
  activeUserId, isJudge, isObserver, allowControls, activePStatus, pinnedUserId, onPin,
}: {
  activeUserId:string|null; isJudge:boolean; isObserver:boolean; allowControls:boolean; activePStatus?:string|null;
  pinnedUserId:string|null; onPin:(userId:string|null)=>void;
}) => {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants   = useRemoteParticipants();

  const getMeta = (p:any) => { try { return JSON.parse(p?.metadata||"{}"); } catch { return {}; } };
  const localMeta  = getMeta(localParticipant);
  const iAmJudge   = localMeta.role === "judge";
  const iAmActive  = !!(activeUserId && localMeta.user_id === activeUserId);
  const localPub   = localParticipant?.getTrackPublication(Track.Source.Camera);

  // Every judge currently in the room (there can be more than one)
  const judgeRemotes  = remoteParticipants.filter(p=>getMeta(p).role==="judge");
  const activeRemote  = remoteParticipants.find(p=>getMeta(p).user_id===activeUserId);

  // Build the full roster of "feeds" available to this viewer: every remote
  // judge + the active participant, each tagged with a stable user_id.
  type Feed = { userId:string; participant:any; pub:any; name:string; kind:"judge"|"active" };
  const feeds: Feed[] = [];
  judgeRemotes.forEach(jp => {
    const meta = getMeta(jp);
    if (!meta.user_id || meta.user_id===activeUserId) return; // avoid dup if a judge is also the active reciter
    feeds.push({ userId:meta.user_id, participant:jp, pub:jp.getTrackPublication(Track.Source.Camera), name:meta.name||"Judge", kind:"judge" });
  });
  if (activeRemote) {
    const meta = getMeta(activeRemote);
    feeds.push({ userId:meta.user_id||activeUserId||"active", participant:activeRemote, pub:activeRemote.getTrackPublication(Track.Source.Camera), name:meta.name||"Participant", kind:"active" });
  }
  // Include myself as a selectable feed too (so I can swap back to "me" as main)
  if (iAmJudge || iAmActive) {
    feeds.push({ userId:localMeta.user_id||"me", participant:localParticipant, pub:localPub, name:localMeta.name||"You", kind: iAmJudge?"judge":"active" });
  }

  if (feeds.length === 0) return (
    <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,background:"rgba(0,0,0,.6)"}}>
      <div style={{fontSize:36,opacity:.3}}>﷽</div>
      <div style={{color:"rgba(255,255,255,.25)",fontSize:12,textAlign:"center",maxWidth:220,lineHeight:1.7}}>
        {isObserver ? "Live video appears when a participant is called" : "Joining live room…"}
      </div>
    </div>
  );

  // Default main (before any tap): judge → active participant; active participant → first judge;
  // observer/waiting → first judge if present, else active participant.
  const defaultMain = iAmJudge
    ? (feeds.find(f=>f.kind==="active") || feeds[0])
    : (feeds.find(f=>f.kind==="judge" && f.userId!==localMeta.user_id) || feeds[0]);
  const main = (pinnedUserId && feeds.find(f=>f.userId===pinnedUserId)) || defaultMain;
  const overlayFeeds = feeds.filter(f=>f.userId!==main.userId);

  const renderTile = (f:Feed, isMe:boolean) => (
    f.pub?.videoTrack ? (
      // Mirror only the local user's own feed (selfie-style); never mirror
      // remote participants — matches the VideoPanel mirroring rule above.
      <div className={isMe ? "musabaqah-local-video" : "musabaqah-remote-video"} style={{width:"100%",height:"100%"}}>
        <VideoTrack trackRef={{participant:f.participant, source:Track.Source.Camera, publication:f.pub}} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
      </div>
    ) : (
      <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:4,background:"#111"}}>
        <div style={{width:32,height:32,borderRadius:"50%",background:`${GOLD}22`,display:"flex",alignItems:"center",justifyContent:"center",color:GOLD,fontWeight:800,fontSize:14,fontFamily:"Cairo,sans-serif"}}>
          {(f.name||"?")[0]?.toUpperCase()}
        </div>
        <div style={{color:"rgba(255,255,255,.35)",fontSize:8,textAlign:"center",padding:"0 4px"}}>{isMe?"You":f.name}</div>
      </div>
    )
  );

  return (
    <div style={{position:"relative",width:"100%",height:"100%",background:"#000",overflow:"hidden"}}>
      {/* ── Main dominant video (full area) ── */}
      <div style={{position:"absolute",inset:0}}>
        {main.userId===(localMeta.user_id||"me") ? (
          <div style={{position:"relative",width:"100%",height:"100%"}}>
            {renderTile(main,true)}
            <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(to top,rgba(0,0,0,.85),transparent)",padding:"18px 10px 8px"}}>
              <span style={{color:"#fff",fontSize:12,fontWeight:700}}>You{main.kind==="judge"?" · ⚖️":" · 🎙️"}</span>
            </div>
          </div>
        ) : (
          <VideoPanel pub={main.pub} participant={main.participant} localParticipant={localParticipant} name={main.name} label={`${main.kind==="judge"?"⚖️":"🎙️"} ${main.name}`}/>
        )}
      </div>

      {/* ── Switchable overlay tiles — every other judge + the active participant ── */}
      {overlayFeeds.length>0 && (
        <div style={{position:"absolute",top:8,right:8,display:"flex",flexDirection:"column",gap:6,zIndex:8,maxHeight:"calc(100% - 60px)",overflowY:"auto"}}>
          {overlayFeeds.map(f=>{
            const isMe = f.userId===(localMeta.user_id||"me");
            return (
              <button key={f.userId} onClick={()=>onPin(f.userId)} style={{width:76,height:100,borderRadius:11,overflow:"hidden",position:"relative",border:`2px solid rgba(201,168,76,.55)`,boxShadow:"0 4px 16px rgba(0,0,0,.6)",background:"#111",padding:0,cursor:"pointer"}}>
                {renderTile(f,isMe)}
                <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(to top,rgba(0,0,0,.85),transparent)",padding:"10px 3px 3px",textAlign:"center"}}>
                  <span style={{color:"rgba(255,255,255,.75)",fontSize:8,fontWeight:700}}>{isMe?"YOU":f.kind==="judge"?`⚖️ ${f.name.split(" ")[0]}`:`🎙️ ${f.name.split(" ")[0]}`}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ── Camera controls — ONLY for judge + active participant ──────── */
const CameraControls = ({ isActive, isJudge }: { isActive:boolean; isJudge:boolean }) => {
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);

  useEffect(() => {
    if (isJudge) {
      queueMediaOp(room, () => localParticipant.setCameraEnabled(true)).then(()=>setCamOn(true)).catch(()=>{});
      queueMediaOp(room, () => localParticipant.setMicrophoneEnabled(true)).then(()=>setMicOn(true)).catch(()=>{});
    }
  }, [isJudge]);

  useEffect(() => {
    if (isActive && !isJudge) {
      queueMediaOp(room, () => localParticipant.setMicrophoneEnabled(true)).then(()=>setMicOn(true)).catch(()=>{});
      queueMediaOp(room, () => localParticipant.setCameraEnabled(true)).then(()=>setCamOn(true)).catch(()=>{});
    }
  }, [isActive, isJudge]);

  return (
    <div style={{display:"flex",gap:6,justifyContent:"center"}}>
      <button onClick={async()=>{ const n=!micOn; await queueMediaOp(room, () => localParticipant.setMicrophoneEnabled(n)); setMicOn(n); }}
        style={{background:micOn?`${GREEN}22`:"rgba(0,0,0,.6)",border:`1.5px solid ${micOn?GREEN:"rgba(255,255,255,.3)"}`,borderRadius:8,padding:"4px 8px",cursor:"pointer",color:micOn?GREEN:"rgba(255,255,255,.7)",display:"flex",flexDirection:"column",alignItems:"center",gap:1,fontFamily:"Cairo,sans-serif",fontWeight:700,minWidth:40,transition:"all .2s"}}>
        {micOn?<Mic size={12}/>:<MicOff size={12}/>}
        <span style={{fontSize:8,lineHeight:1.2}}>{micOn?"On":"Mute"}</span>
      </button>
      <button onClick={async()=>{ const n=!camOn; await queueMediaOp(room, () => localParticipant.setCameraEnabled(n)); setCamOn(n); }}
        style={{background:camOn?`${GREEN}22`:"rgba(0,0,0,.6)",border:`1.5px solid ${camOn?GREEN:"rgba(255,255,255,.3)"}`,borderRadius:8,padding:"4px 8px",cursor:"pointer",color:camOn?GREEN:"rgba(255,255,255,.7)",display:"flex",flexDirection:"column",alignItems:"center",gap:1,fontFamily:"Cairo,sans-serif",fontWeight:700,minWidth:40,transition:"all .2s"}}>
        {camOn?<Video size={12}/>:<VideoOff size={12}/>}
        <span style={{fontSize:8,lineHeight:1.2}}>Cam</span>
      </button>
    </div>
  );
};

const AudioEnabler = ({ onEnabled }: { onEnabled: () => void }) => {
  const room = useRoomContext();
  const [blocked, setBlocked] = useState(!room.canPlaybackAudio);
  useEffect(() => {
    const sync = () => { setBlocked(!room.canPlaybackAudio); if (room.canPlaybackAudio) onEnabled(); };
    sync();
    room.on(RoomEvent.AudioPlaybackStatusChanged, sync);
    return () => { room.off(RoomEvent.AudioPlaybackStatusChanged, sync); };
  }, [room, onEnabled]);
  if (!blocked) return null;
  return (
    <div style={{position:"absolute",inset:0,zIndex:20,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.72)",backdropFilter:"blur(4px)",borderRadius:18,gap:10}}>
      <Volume2 size={32} color={GOLD}/>
      <button onClick={() => { room.startAudio(); onEnabled(); }}
        style={{background:`linear-gradient(135deg,${GOLD},${GOLDD})`,color:G,border:"none",borderRadius:14,padding:"12px 28px",fontWeight:900,fontSize:16,cursor:"pointer",fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",gap:8,boxShadow:"0 6px 24px rgba(201,168,76,.5)"}}>
        <Volume2 size={18}/> Tap to Enable Audio
      </button>
      <p style={{color:"rgba(255,255,255,.45)",fontSize:12,margin:0,textAlign:"center"}}>Your browser requires a tap to start audio</p>
    </div>
  );
};

type CompStatus = "open"|"active"|"paused"|"completed";
type PStatus    = "waiting"|"pending"|"called"|"reciting"|"completed"|"absent"|"disqualified";

interface Competition {
  id:string; title:string; description?:string; scope_type:string; scope_config:any;
  total_stages:number; current_stage:number; time_limit_seconds:number; status:CompStatus;
  current_participant_id?:string|null; room_code:string; created_by:string; created_at:string; use_criteria_scoring:boolean;
  registration_deadline?:string|null; registration_override?:"auto"|"open"|"closed";
  session_start_at?:string|null;
  queue_reveal_active?:boolean; queue_box_count?:number;
  revealed_participant_ids?:string[]; results_reveal_active?:boolean;
  juz_options?:number[]|null;
}
interface Participant {
  id:string; competition_id:string; user_id?:string; participant_name:string; school?:string;
  queue_position:number; status:PStatus; total_score:number; stage_scores:Record<string,number>;
  bell_counts:Record<string,number>; proctor_flagged:boolean; camera_on:boolean; created_at:string;
  queue_box_id?:number|null;
  access_code?:string|null; assigned_juz?:number|null; code_acknowledged?:boolean;
  role?:"judge"|"participant"|"observer"|null;
}
interface Attempt {
  id:string; competition_id:string; participant_id:string; stage_number:number;
  scope_label:string; scope_label_ar:string; bell_count:number; score_breakdown?:Record<string,number>;
  judge_score?:number; judge_comment?:string; duration_seconds?:number; status:"pending"|"reciting"|"scored"; created_at:string;
  surah_number?:number|null; ayah_number?:number|null;
}
/** One judge's independent score for a given attempt. The attempt's official
 *  judge_score is the mean of every JudgeScore row tied to it. */
interface JudgeScore {
  id:string; attempt_id:string; participant_id:string; judge_user_id:string; judge_name:string;
  score_breakdown:Record<string,number>; total_score:number; comment?:string; created_at:string;
}

const SCORING_CRITERIA = [
  {key:"tajweed",label:"Tajweed",labelAr:"التجويد",max:40},
  {key:"memorize",label:"Hifdh",labelAr:"الحفظ",max:30},
  {key:"fluency",label:"Fluency",labelAr:"الطلاقة",max:20},
  {key:"voice",label:"Voice",labelAr:"الصوت",max:10},
];
const SCOPE_OPTIONS = [
  {id:"juz30",label:"Juz 30 (Amma)",desc:"Short surahs — juniors"},
  {id:"juz29",label:"Juz 29–30",desc:"Two final juz"},
  {id:"full30",label:"Full 30 Juz",desc:"Entire Quran — advanced"},
  {id:"juz",label:"Specific Juz",desc:"Pick any single Juz (1–30)"},
  {id:"hizb",label:"Specific Hizb",desc:"Pick any single Hizb (1–60, half a Juz)"},
  {id:"custom_range",label:"Custom Surah/Ayah Range",desc:"Pick your own start & end point"},
];
const STATUS_COLOR: Record<PStatus,string> = {pending:"#a78bfa",waiting:GOLD,called:"#f97316",reciting:GREEN,completed:"#60a5fa",absent:"#6b7280",disqualified:RED};
const STATUS_ICON:  Record<PStatus,string> = {pending:"🕐",waiting:"⏳",called:"⚡",reciting:"🎙️",completed:"✅",absent:"❌",disqualified:"🚫"};
const STATUS_LABEL: Record<PStatus,string> = {pending:"Pending",waiting:"Waiting",called:"Called!",reciting:"Reciting",completed:"Done",absent:"Absent",disqualified:"DQ"};
const REACTION_EMOJIS = ["🤲","❤️","🌟","👏","🎙️","📖","🕌","🤍"];

const genCode = () => { const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; return Array.from({length:6},()=>c[Math.floor(Math.random()*c.length)]).join(""); };
const Label = ({children}:{children:React.ReactNode}) => (
  <div style={{color:GOLD,fontSize:11,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:8,fontFamily:"Cairo,sans-serif"}}>{children}</div>
);
const Inp = ({label,value,onChange,placeholder,type="text",...rest}:any) => (
  <div style={{marginBottom:16}}>
    <Label>{label}</Label>
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(201,168,76,.25)",borderRadius:12,padding:"12px 16px",color:"#fff",fontSize:15}} {...rest}/>
  </div>
);

// LiveKit room options for better connection performance
const LK_OPTIONS = {
  dynacast: true,
  adaptiveStream: true,
  publishDefaults: {
    videoSimulcastLayers: [{ width: 640, height: 480, encoding: { maxBitrate: 900_000, maxFramerate: 24 } }],
    dtx: true,
    red: true,
  },
};

export default function MustabaqahPage() {
  const { user, profile, hasRole } = useAuth() as any;
  const { toast } = useToast();
  const navigate = useNavigate();
  const canJudge = hasRole?.("admin")||hasRole?.("teacher");
  // Only admins manage competitions at the platform level (create / edit settings /
  // delete). Teachers still judge live sessions via canJudge above — they just do it
  // by claiming a judge code (see judge_gate / claimJudgeCode) instead of getting
  // free rein over every competition's setup.
  const isAdmin = hasRole?.("admin");

  type View = "list"|"setup"|"join"|"registered"|"preroom"|"settings"|"judge_gate"|"observer_gate"|"role_select"|"arena"|"results"|"leaderboard";
  const [view,         setView]         = useState<View>("list");
  const [userRole,     setUserRole]     = useState<"judge"|"participant"|"observer"|null>(null);
  const [loading,      setLoading]      = useState(false);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [unreadInfoIds, setUnreadInfoIds] = useState<Set<string>>(new Set());
  const [competition,  setCompetition]  = useState<Competition|null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [attempts,     setAttempts]     = useState<Attempt[]>([]);
  const [myParticipant,setMyParticipant]= useState<Participant|null>(null);
  const [onlineUsers,  setOnlineUsers]  = useState<{name:string;role:string}[]>([]);
  const [judgeCodes,      setJudgeCodes]      = useState<string[]>([]);
  const [judgeCodeInput,  setJudgeCodeInput]  = useState("");
  const [observerNameInput, setObserverNameInput] = useState("");
  const [activeP,        setActiveP]       = useState<Participant|null>(null);
  const [currentAttempt, setCurAttempt]    = useState<Attempt|null>(null);
  const [bellCount,      setBellCount]     = useState(0);
  const [minorCount,     setMinorCount]    = useState(0); // -0.5 each
  const [majorCount,     setMajorCount]    = useState(0); // -1 each
  const [bellFlash,      setBellFlash]     = useState(false);
  const [stopFlash,      setStopFlash]     = useState(false);
  // Per-stage question type: "recitation" (default — pick a tile & recite),
  // "tajweed" or "waqf" (judge grades each configured question correct/wrong).
  const [stageTypes, setStageTypes] = useState<Record<string,"recitation"|"tajweed"|"waqf">>({});
  // Admin-configurable point values, stored on scope_config so they travel with the competition.
  const [scoringConfig, setScoringConfig] = useState({ minor_error: 0.5, major_error: 1, wrong_answer: 10 });
  // For a tajweed/waqf stage: correct/wrong per question line, keyed by question index.
  const [tajweedAnswers, setTajweedAnswers] = useState<Record<number,"correct"|"wrong">>({});
  // Local-only toggle so a room with multiple judges can split duties: one taps
  // errors while reciting, another is the one who finalizes and submits the score.
  const [judgeSubrole, setJudgeSubrole] = useState<"scorer"|"marker">("scorer");
  // Countdown timer
  const [timerActive,    setTimerActive]   = useState(false);
  const [countdownValue, setCountdownValue] = useState<number|null>(null); // 3-2-1 pre-recitation countdown (visual only — the real timer starts after it finishes)
  const countdownRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const [timerSecs,      setTimerSecs]     = useState(0);      // counts DOWN
  const [judgeTimerDuration, setJudgeTimerDuration] = useState(300); // judge-set duration per student
  const [timerExpired,   setTimerExpired]  = useState(false);
  const [elapsedSecs,    setElapsedSecs]   = useState(0);      // for display/DB
  const [judgeTab,       setJudgeTab]      = useState<"controls"|"roster">("roster");
  const [rosterMode,     setRosterMode]    = useState<"list"|"grid">("list");
  const [showScorePanel, setShowScore]     = useState(false);
  const [scoreBreak,     setScoreBreak]    = useState<Record<string,string>>({tajweed:"",memorize:"",fluency:"",voice:""});
  const [judgeComment,   setJudgeComment]  = useState("");
  // ── Multi-judge scoring: every judge scores independently, official score = mean ──
  const [judgeScores,    setJudgeScores]   = useState<Record<string, JudgeScore[]>>({}); // attempt_id -> all judges' scores
  const [presentJudges,  setPresentJudges] = useState<{user_id:string;name:string}[]>([]); // who's actually in the room right now
  const [myScoreSubmitted, setMyScoreSubmitted] = useState(false); // have I (this judge) scored the current attempt yet
  // ── Results reveal ceremony ──────────────────────────────────────
  const [revealBusy,     setRevealBusy]    = useState(false);
  const [revealSpotlight, setRevealSpotlight] = useState<{participant:Participant;rank:number}|null>(null);
  // ── Multi-judge video overlay: which remote user_id is currently pinned to the main view (tap-to-swap) ──
  const [pinnedUserId,   setPinnedUserId]  = useState<string|null>(null);
  const [copyFlash,      setCopyFlash]     = useState(false);
  const [deleteModal,    setDeleteModal]   = useState<Competition|null>(null);
  const [audioReady,     setAudioReady]    = useState(false);
  const [stageTiles,     setStageTiles]    = useState<Tile[]>([]);
  const [pickedTile,     setPickedTile]    = useState<Tile|null>(null);
  // Questions (by "surah:ayah" or, for tajweed/waqf template lines, by their
  // exact text) that a participant has already picked. Tracked across ALL
  // stages so buildTiles never re-offers the same question to a later
  // participant, in this stage or any other. Updated both locally (the
  // picker's own client) and via the QUESTION_PICKED broadcast (every other
  // client on the channel, including the judge/host who builds each new
  // participant's tile set).
  const [usedTileKeys,   setUsedTileKeys]  = useState<Set<string>>(new Set());
  const [showTilePicker, setShowTilePicker]= useState(false);
  const [pickerParticipantId, setPickerParticipantId] = useState<string|null>(null);
  const [ayahText,       setAyahText]      = useState<string|null>(null);
  const [loadingAyah,    setLoadingAyah]   = useState(false);
  const [livekitToken,   setLivekitToken]  = useState("");
  const [livekitUrl,     setLivekitUrl]    = useState("");
  const [lkConnected,    setLkConnected]   = useState(false);
  const [lkError,        setLkError]       = useState<string>("");
  const [videoDisabled,  setVideoDisabled] = useState(false);
  const [floatReactions, setFloatReactions]= useState<{id:string;emoji:string;name:string;x:number}[]>([]);
  const [showChat,       setShowChat]      = useState(false);
  const [chatMessages,   setChatMessages]  = useState<{id:string;name:string;text:string;time:string}[]>([]);
  const [chatInput,      setChatInput]     = useState("");
  const [form, setForm] = useState({title:"",description:"",scope_type:"juz30",total_stages:5,time_limit:300,use_criteria:true,tiles_per_stage:10,use_custom_q:false,custom_questions:"",
    juz_number:1, hizb_number:1, range_surah_start:1, range_ayah_start:1, range_surah_end:1, range_ayah_end:7,
    registration_deadline:"" as string, juz_options:[] as number[]});
  const [joinForm, setJoinForm] = useState({room_code:"",name:profile?.full_name||"",school:profile?.school||"",juz:undefined as number|undefined});
  // Live countdown (ms remaining) to a competition's registration_deadline —
  // drives the "registered" holding screen: shows the countdown while it's
  // running, then flips to the access-code entry prompt once it hits zero.
  const [regCountdownMs, setRegCountdownMs] = useState<number|null>(null);
  // Live countdown (ms remaining) to a competition's admin-set session_start_at —
  // separate from the registration deadline above. Drives the "awaiting session"
  // → "session starts in…" → "enter your code" progression on the holding screen.
  const [sessionCountdownMs, setSessionCountdownMs] = useState<number|null>(null);
  const [accessCodeInput, setAccessCodeInput] = useState("");
  const [ackingCode, setAckingCode] = useState(false);
  const [sessionTimeInput, setSessionTimeInput] = useState("");

  // ── Q-Settings panel (live editing of questions from arena) ──────
  const [showQSettings,    setShowQSettings]    = useState(false);
  const [qSettingsTab,     setQSettingsTab]     = useState<"manual"|"ai">("manual");
  const [qSettingsStage,   setQSettingsStage]   = useState<number>(1); // which stage's questions are being edited
  const [stageQuestions,   setStageQuestions]   = useState<Record<string,string>>({}); // stageNum -> newline-separated questions
  const [liveCustomQ,      setLiveCustomQ]      = useState("");   // editable custom questions text (all-stages fallback)
  const [autoFillGuide,    setAutoFillGuide]    = useState("");   // optional keyword to narrow no-AI auto-fill (e.g. a surah name)
  const [aiPrompt,         setAiPrompt]         = useState("");
  const [aiQCount,         setAiQCount]         = useState(10);
  const [aiGenLoading,     setAiGenLoading]     = useState(false);
  const [liveInstructions, setLiveInstructions] = useState("");   // per-competition instructions shown with question
  const [tilePickerCollapsed, setTilePickerCollapsed] = useState(false); // collapse tile grid to icon after pick
  // Per-participant stage tracking — one participant goes through ALL stages before next is called
  const [activeParticipantStage, setActiveParticipantStage] = useState(1); // which stage the active participant is currently on
  const [pickerStage, setPickerStage] = useState(1);                        // stage shown in the tile picker (participant side)

  const channelRef       = useRef<any>(null);
  const timerRef         = useRef<any>(null);
  const myParticipantRef = useRef<Participant|null>(null);
  const competitionRef   = useRef<Competition|null>(null);
  const elapsedRef       = useRef(0);  // for accurate elapsed tracking independent of timer direction

  const participantsRef   = useRef<Participant[]>([]);
  useEffect(()=>{ myParticipantRef.current=myParticipant; },[myParticipant]);
  useEffect(()=>{ competitionRef.current=competition; },[competition]);
  useEffect(()=>{ participantsRef.current=participants; },[participants]);

  // ── Session persistence: save arena session to localStorage ──────
  useEffect(()=>{
    if (view==="arena" && competition) {
      localStorage.setItem("musabaqah_session", JSON.stringify({
        competitionId: competition.id,
        roomCode: competition.room_code,
        userRole,
        participantId: myParticipant?.id ?? null,
      }));
    }
    if (view==="list") localStorage.removeItem("musabaqah_session");
  },[view, competition?.id, userRole, myParticipant?.id]);

  // ── Registration countdown ────────────────────────────────────────
  // While the participant is on the "registered" holding screen, tick down
  // to competition.registration_deadline every second. Once it reaches zero
  // the screen swaps from "here's your code, come back later" to "enter your
  // code now" — see the "registered" view below.
  useEffect(() => {
    if ((view!=="registered"&&view!=="preroom") || !competition?.registration_deadline) { setRegCountdownMs(null); return; }
    const deadline = new Date(competition.registration_deadline).getTime();
    const tick = () => setRegCountdownMs(Math.max(0, deadline - Date.now()));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [view, competition?.registration_deadline]);

  // ── Session-start countdown ───────────────────────────────────────
  // Once the admin sets competition.session_start_at, tick down to it on the
  // holding/preroom screens. Independent of the registration-deadline
  // countdown above — a participant can be well past the deadline and still
  // sitting in "awaiting session" with no countdown at all until this is set.
  useEffect(() => {
    if ((view!=="registered"&&view!=="preroom") || !competition?.session_start_at) { setSessionCountdownMs(null); return; }
    const target = new Date(competition.session_start_at).getTime();
    const tick = () => setSessionCountdownMs(Math.max(0, target - Date.now()));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [view, competition?.session_start_at]);

  // ── On mount, try to restore saved session ───────────────────────
  const [savedSession, setSavedSession] = useState<{competitionId:string;roomCode:string;userRole:string;participantId:string|null}|null>(null);
  useEffect(()=>{
    const raw = localStorage.getItem("musabaqah_session");
    if (!raw) return;
    try { setSavedSession(JSON.parse(raw)); } catch {}
  },[]);

  const rejoinSession = async () => {
    if (!savedSession) return;
    const {data:comp} = await supabase.from("musabaqah_competitions" as any).select("*").eq("id",savedSession.competitionId).single();
    if (!comp||((comp as Competition).status==="completed")) {
      localStorage.removeItem("musabaqah_session");
      setSavedSession(null);
      toast({title:"Session has ended",description:"The competition you were in has finished."});
      return;
    }
    setCompetition(comp as Competition);
    setUserRole(savedSession.userRole as any);
    if (savedSession.participantId) {
      const {data:p} = await supabase.from("musabaqah_participants" as any).select("*").eq("id",savedSession.participantId).single();
      if (p) setMyParticipant(p as Participant);
    }
    setSavedSession(null);
    setView("arena");
    await fetchLkToken((comp as Competition).room_code);
  };


  const isJudge = canJudge && userRole!=="observer" && userRole!=="participant";
  const isObserver = userRole==="observer";
  const iAmParticipantActive = !isJudge && myParticipant && (myParticipant.status==="called"||myParticipant.status==="reciting");

  // Countdown timer + elapsed tracker
  useEffect(()=>{
    if (timerActive) {
      timerRef.current = setInterval(()=>{
        setTimerSecs(s => {
          const next = s - 1;
          if (next <= 0) {
            clearInterval(timerRef.current);
            setTimerActive(false);
            if (isJudge) setTimerExpired(true);
            return 0;
          }
          return next;
        });
        setElapsedSecs(e => { elapsedRef.current = e+1; return e+1; });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return ()=>clearInterval(timerRef.current);
  },[timerActive]);

  const fetchLkToken = useCallback(async (roomCode:string) => {
    setLkError(""); setVideoDisabled(false);
    try {
      const {data,error} = await supabase.functions.invoke("musabaqah-livekit-token",{body:{room_code: roomCode}});
      if (error) throw new Error(error.message);
      if (data?.video_disabled) { setVideoDisabled(true); return; }
      if (data?.error) throw new Error(data.error);
      if (!data?.token || !data?.url) throw new Error("No token returned");
      setLivekitToken(data.token); setLivekitUrl(data.url); setLkConnected(true);
    } catch(err: any) {
      const msg = err?.message || "LiveKit connection failed";
      setLkError(msg); console.warn("[Musabaqah] LiveKit error:", msg);
    }
  },[]);

  const fetchAyah = async (surahNum:number,ayahNum:number) => {
    if (!surahNum||!ayahNum) return;
    setLoadingAyah(true); setAyahText(null);
    try {
      const r=await fetch(`https://api.alquran.cloud/v1/ayah/${surahNum}:${ayahNum}/quran-uthmani`);
      const d=await r.json();
      if (d?.code===200) setAyahText(d.data.text);
    } catch {} finally { setLoadingAyah(false); }
  };

  useEffect(()=>{ loadCompetitions(); },[]);

  // Self-heal: if this participant has been "called" for a while and hasn't
  // heard COUNTDOWN_START/START_RECITING (dropped websocket message), re-poll
  // the DB every few seconds so they don't get stuck staring at "wait for
  // judge to start" forever while the judge has actually already moved on.
  useEffect(()=>{
    if (isJudge || myParticipant?.status!=="called") return;
    const iv = setInterval(()=>{ loadParticipants(); }, 4000);
    return ()=>clearInterval(iv);
  },[isJudge, myParticipant?.status]);
  const loadCompetitions = async () => {
    const {data} = await supabase.from("musabaqah_competitions" as any).select("*").order("created_at",{ascending:false});
    if (data) setCompetitions(data as Competition[]);
    await loadUnreadInfoIds();
  };

  // ── Card-level red dot ─────────────────────────────────────────────
  // A competition gets a red dot on its list card whenever the signed-in
  // user has an unread notification linking back to it (e.g. the admin just
  // set/updated the session start time). Cleared when they open that card.
  const loadUnreadInfoIds = async () => {
    if (!user) return;
    const {data} = await supabase.from("notifications" as any)
      .select("id,link").eq("user_id",user.id).eq("is_read",false).like("link","%/musabaqah/recitation?comp=%");
    if (!data) return;
    const ids = new Set<string>();
    (data as any[]).forEach(n=>{ const m=/comp=([a-zA-Z0-9-]+)/.exec(n.link||""); if (m) ids.add(m[1]); });
    setUnreadInfoIds(ids);
  };

  // Marks this competition's info notifications read (called when a
  // participant opens it) so its red dot clears on both the card and bell.
  const clearUnreadInfo = async (compId:string) => {
    if (!user) return;
    setUnreadInfoIds(prev => { const n=new Set(prev); n.delete(compId); return n; });
    await supabase.from("notifications" as any).update({is_read:true,read_at:new Date().toISOString()})
      .eq("user_id",user.id).eq("is_read",false).like("link",`%/musabaqah/recitation?comp=${compId}%`);
  };

  const loadParticipants = useCallback(async () => {
    const comp=competitionRef.current; if (!comp) return;
    const {data}=await supabase.from("musabaqah_participants" as any).select("*").eq("competition_id",comp.id).order("queue_position");
    if (!data) return;
    setParticipants(data as Participant[]);
    if (comp.current_participant_id) {
      const fetched = (data as Participant[]).find(p=>p.id===comp.current_participant_id) || null;
      setActiveP(prev => {
        // Guard: don't let a stale DB read downgrade a locally-set status.
        // The judge fires the DB update async AFTER broadcasting CALLED/START_RECITING,
        // so the first loadParticipants() that fires may still see the old status.
        // Protect "called"→pending/waiting, and "reciting"→anything lesser.
        if (prev && fetched && prev.id === fetched.id) {
          const STATUS_RANK: Record<string,number> = { pending:0, waiting:1, called:2, reciting:3, completed:4 };
          const prevRank = STATUS_RANK[prev.status] ?? 0;
          const fetchedRank = STATUS_RANK[fetched.status] ?? 0;
          if (prevRank > fetchedRank) return { ...fetched, status: prev.status };
        }
        return fetched;
      });
    }
    if (user) {
      const mine=(data as Participant[]).find(p=>p.user_id===user.id);
      if (mine) setMyParticipant(prev => {
        // Guard: don't let a stale DB read downgrade a locally-set active status
        // (judge fires DB update async AFTER broadcasting CALLED, so DB may lag)
        if (prev && (prev.status==="called"||prev.status==="reciting") && mine.status==="waiting") {
          return {...mine, status: prev.status};
        }
        return mine;
      });
    }
  },[user]);

  const loadAttempts = useCallback(async () => {
    const comp=competitionRef.current; if (!comp) return;
    const {data}=await supabase.from("musabaqah_attempts" as any).select("*").eq("competition_id",comp.id).order("created_at");
    if (data) setAttempts(data as Attempt[]);
  },[]);

  // ── All judges' individual scores for this competition, grouped by attempt ──
  const loadJudgeScores = useCallback(async () => {
    const comp=competitionRef.current; if (!comp) return;
    const {data}=await supabase.from("musabaqah_judge_scores" as any).select("*").eq("competition_id",comp.id);
    if (!data) return;
    const grouped: Record<string, JudgeScore[]> = {};
    (data as JudgeScore[]).forEach(js => { (grouped[js.attempt_id] ||= []).push(js); });
    setJudgeScores(grouped);
  },[]);

  /** Mean total across every judge who has scored this attempt so far. */
  const meanScoreFor = (attemptId:string|undefined) => {
    const rows = attemptId ? (judgeScores[attemptId]||[]) : [];
    if (!rows.length) return 0;
    return Math.round((rows.reduce((s,r)=>s+r.total_score,0)/rows.length) * 10) / 10;
  };
  /** Mean of each criterion across judges, for showing a combined breakdown. */
  const meanBreakdownFor = (attemptId:string|undefined) => {
    const rows = attemptId ? (judgeScores[attemptId]||[]) : [];
    if (!rows.length) return {} as Record<string,number>;
    const out: Record<string,number> = {};
    SCORING_CRITERIA.forEach(c=>{
      const vals = rows.map(r=>r.score_breakdown?.[c.key]||0);
      out[c.key] = Math.round((vals.reduce((s,v)=>s+v,0)/vals.length)*10)/10;
    });
    return out;
  };

  useEffect(()=>{ if (competition) { loadParticipants(); loadAttempts(); loadJudgeScores(); } },[competition]);

  // ── Reconnect / resume: rebuild the in-progress moment from the DB instead
  //    of resetting — for judge, participant, and observers alike. Fires when
  //    an active participant exists but we haven't received the live question
  //    yet (fresh mount, refresh, or reconnect after a drop).
  useEffect(() => {
    if (!competition || !activeP) return;
    if (activeP.status !== "called" && activeP.status !== "reciting") return;
    if (pickedTile) return; // already have it live — nothing to rebuild

    if (activeP.status === "reciting") {
      const stageAttempts = attempts.filter(a => a.participant_id === activeP.id && a.stage_number === activeParticipantStage);
      const latest = stageAttempts[stageAttempts.length - 1];
      if (!latest) return;

      const tile: Tile = latest.surah_number && latest.ayah_number
        ? { num: activeParticipantStage, label: latest.scope_label, labelAr: latest.scope_label_ar,
            surah: latest.surah_number, ayah: latest.ayah_number,
            surahName: SURAHS.find(s => s.n === latest.surah_number)?.en ?? "",
            surahAr: SURAHS.find(s => s.n === latest.surah_number)?.ar ?? "" }
        : { num: activeParticipantStage, label: latest.scope_label, labelAr: latest.scope_label_ar, surah: 0, ayah: 0, surahName: "", surahAr: "" };
      setPickedTile(tile);
      setCurAttempt(latest);
      if (tile.surah > 0) fetchAyah(tile.surah, tile.ayah);

      // Reconstruct the real time remaining from how long ago this attempt began
      const startedMs = new Date(latest.created_at).getTime();
      const durationSecs = competition.time_limit_seconds || judgeTimerDuration || 300;
      const elapsed = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
      elapsedRef.current = elapsed; setElapsedSecs(elapsed);
      const remaining = Math.max(0, durationSecs - elapsed);
      if (remaining > 0) { setTimerSecs(remaining); setTimerActive(true); setTimerExpired(false); }
      else { setTimerSecs(0); setTimerActive(false); }

      if (isJudge) { setScoreBreak({ tajweed: "", memorize: "", fluency: "", voice: "" }); setJudgeComment(""); setShowScore(true); }
    } else {
      // Called but hasn't started reciting yet — restore the tile picker
      const cfg = (competition.scope_config || {}) as any;
      if (cfg.current_tiles?.length && cfg.current_called_id === activeP.id) {
        setStageTiles(cfg.current_tiles); setShowTilePicker(true); setPickerParticipantId(activeP.id);
        if (cfg.current_stage_num) setPickerStage(cfg.current_stage_num);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competition?.id, activeP?.id, activeP?.status, attempts.length]);

  // ── Polling fallback for pending participants ─────────────────────
  // Real-time broadcast can arrive before the channel finishes subscribing.
  // This ensures approval is never missed regardless of timing.
  useEffect(()=>{
    if (!competition || !myParticipant || myParticipant.status !== "pending") return;
    const iv = setInterval(async () => {
      const { data } = await supabase
        .from("musabaqah_participants" as any)
        .select("status")
        .eq("id", myParticipant.id)
        .single();
      if (data && (data as any).status !== "pending") {
        loadParticipants();
      }
    }, 2500);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[competition?.id, myParticipant?.id, myParticipant?.status]);

  // ── Tile fallback: participant is "called" but hasn't received tiles yet ──
  // Polls competition.scope_config.current_tiles from DB every 1.5s until tiles arrive.
  // This handles: missed broadcast, late channel subscription, stage-change race condition.
  useEffect(()=>{
    if (!competition || !myParticipant || myParticipant.status !== "called" || stageTiles.length > 0) return;
    const iv = setInterval(async () => {
      const { data } = await supabase
        .from("musabaqah_competitions" as any)
        .select("scope_config")
        .eq("id", competition.id)
        .single();
      const cfg = (data as any)?.scope_config;
      if (cfg?.current_tiles?.length > 0 && cfg?.current_called_id === myParticipant.id) {
        setStageTiles(cfg.current_tiles);
        setShowTilePicker(true);
        setPickerParticipantId(myParticipant.id);
        if (cfg.current_stage_num) setPickerStage(cfg.current_stage_num);
      }
    }, 1500);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[competition?.id, myParticipant?.id, myParticipant?.status, stageTiles.length]);

  useEffect(()=>{
    if (!competition) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    const ch = supabase.channel(`musabaqah:${competition.id}`,{config:{broadcast:{ack:false}}})
      .on("broadcast",{event:"BELL"},({payload}:any)=>{
        setBellFlash(true); setBellCount(payload.count??0);
        if (payload.severity==="minor") setMinorCount(c=>c+1); else if (payload.severity==="major") setMajorCount(c=>c+1);
        setTimeout(()=>setBellFlash(false),2500);
        getACtx().state==="running"?playBell():getACtx().resume().then(playBell);
      })
      .on("broadcast",{event:"STOP"},()=>{
        setStopFlash(true); setTimerActive(false); setTimerExpired(false);
        setTimeout(()=>setStopFlash(false),2500);
        getACtx().state==="running"?playStop():getACtx().resume().then(playStop);
      })
      .on("broadcast",{event:"TIMER_START"},({payload}:any)=>{
        setTimerSecs(payload.duration??300); setElapsedSecs(0); elapsedRef.current=0;
        setTimerActive(true); setTimerExpired(false);
      })
      .on("broadcast",{event:"TIMER_EXTRA"},({payload}:any)=>{
        setTimerSecs(s=>s+(payload.extra??30)); setTimerActive(true); setTimerExpired(false);
      })
      .on("broadcast",{event:"CALLED"},({payload}:any)=>{
        loadParticipants();
        setBellCount(0); setMinorCount(0); setMajorCount(0); setTajweedAnswers({}); setTimerSecs(0); setElapsedSecs(0); elapsedRef.current=0;
        setTimerExpired(false); setShowScore(false); setPinnedUserId(null);
        setPickedTile(null); setStageTiles([]); setAyahText(null); setPickerParticipantId(null);
        setPickerStage(1);
        const mine=myParticipantRef.current;
        if (payload.participant_id===mine?.id) {
          // Update local status immediately — don't wait for DB round-trip
          setMyParticipant(p=>p?{...p,status:"called"}:p);
          if (mine) myParticipantRef.current={...mine,status:"called"};
          getACtx().state==="running"?playCalled():getACtx().resume().then(playCalled);
          try{navigator.vibrate?.([400,100,400,100,800]);}catch{}
          toast({title:"🎙️ You have been called!",description:"Get ready to recite."});
        }
      })
      .on("broadcast",{event:"TILES_SHOWN"},({payload}:any)=>{
        // Only process if tiles are actually present — never clear working tiles with empty payload
        if (!payload.tiles?.length) return;
        setStageTiles(payload.tiles); setPickedTile(null); setAyahText(null);
        setShowTilePicker(true); setPickerParticipantId(payload.picker_participant_id??null);
        if (payload.stage) setPickerStage(payload.stage);
      })
      .on("broadcast",{event:"NEXT_STAGE"},({payload}:any)=>{
        // Fired after judge scores a stage and advances to next stage for the same participant
        const mine=myParticipantRef.current;
        if (mine && payload.participant_id===mine.id) {
          setPickerStage(payload.stage);
          toast({ title:`🎯 Stage ${payload.stage - 1} done: ${payload.prev_score} pts! Now Stage ${payload.stage} — pick your number` });
          try{navigator.vibrate?.([200,100,200,100,400]);}catch{}
        }
      })
      .on("broadcast",{event:"QUESTION_PICKED"},({payload}:any)=>{
        const tile=payload.tile as Tile; setPickedTile(tile);
        markTileUsed(tile); // sync exclusion to every client, incl. the host who builds future tile sets
        if (tile?.surah>0) fetchAyah(tile.surah,tile.ayah);
        getACtx().state==="running"?playTilePick():getACtx().resume().then(playTilePick);
      })
      .on("broadcast",{event:"COUNTDOWN_START"},()=>{
        // Non-judge clients just run the same visual countdown; the judge's own
        // client is the one that actually calls startReciting() once it finishes.
        runLocalCountdown();
      })
      .on("broadcast",{event:"START_RECITING"},({payload}:any)=>{
        loadParticipants();
        const mine=myParticipantRef.current;
        if (mine && payload.participant_id===mine.id) {
          // Update local status immediately so timer/controls appear
          setMyParticipant(p=>p?{...p,status:"reciting"}:p);
          if (mine) myParticipantRef.current={...mine,status:"reciting"};
          toast({title:"▶️ Start reciting now!"});
        }
      })
      .on("broadcast",{event:"SCORE_SUBMITTED"},({payload}:any)=>{
        loadParticipants(); loadAttempts();
        setShowScore(false); setShowTilePicker(false); setTimerExpired(false);
        setActiveP(null); setCurAttempt(null); setPickedTile(null); setPickerParticipantId(null);
        setPickerStage(1);
        const mine=myParticipantRef.current;
        if (payload.participant_id===mine?.id) {
          // payload.score is the grand total after all stages
          setMyParticipant(p=>p?{...p,status:"completed",total_score:payload.score}:p);
          toast({title:`🏆 All stages complete! Your total: ${payload.score} pts`});
        }
      })
      .on("broadcast",{event:"STAGE_CHANGE"},({payload}:any)=>{
        setCompetition(c=>c?{...c,current_stage:payload.stage}:c);
        setQSettingsStage(payload.stage); // sync stage editor to new stage
        setPickedTile(null); setStageTiles([]); setShowTilePicker(false); setAyahText(null); setPickerParticipantId(null);
        setActiveP(null); setCurAttempt(null); setTimerActive(false); setTimerSecs(0); setElapsedSecs(0);
        setTimerExpired(false); elapsedRef.current=0;
        playStageWin(); loadParticipants(); loadAttempts();
      })
      .on("broadcast",{event:"COMPETITION_END"},()=>{
        setCompetition(c=>c?{...c,status:"completed"}:c);
        playStageWin(); setTimeout(()=>setView("results"),1200);
      })
      .on("broadcast",{event:"CHAT"},({payload}:any)=>{
        const id=Math.random().toString(36).slice(2);
        const time=new Date().toLocaleTimeString("en",{hour:"2-digit",minute:"2-digit"});
        setChatMessages(m=>[...m.slice(-79),{id,name:payload.name,text:payload.text,time}]);
      })
      .on("broadcast",{event:"REACTION"},({payload}:any)=>{
        const id=Math.random().toString(36).slice(2); const x=10+Math.random()*80;
        setFloatReactions(r=>[...r,{id,emoji:payload.emoji,name:payload.name,x}]);
        setTimeout(()=>setFloatReactions(r=>r.filter(rx=>rx.id!==id)),3000);
      })
      .on("broadcast",{event:"PARTICIPANT_APPROVED"},({payload}:any)=>{
        // Always reload — catches DB change even if broadcast races with subscription init
        loadParticipants();
        const mine=myParticipantRef.current;
        if (mine&&payload.participant_id===mine.id) {
          setMyParticipant(p=>p?{...p,status:"waiting"}:p);
          if (mine) myParticipantRef.current={...mine,status:"waiting"};
          toast({title:"✅ You've been approved!",description:"You are now in the queue."});
          try{navigator.vibrate?.([200,100,200]);}catch{}
        }
      })
      .on("broadcast",{event:"SETTINGS_UPDATE"},({payload}:any)=>{
        // Push instructions update to all non-judge viewers
        if (payload.instructions!==undefined) setLiveInstructions(payload.instructions);
      })
      .on("broadcast",{event:"QUEUE_REVEAL_START"},({payload}:any)=>{
        setCompetition(c=>c?{...c, queue_box_count:payload.boxCount??0, queue_reveal_active:true}:c);
        loadParticipants();
      })
      .on("broadcast",{event:"QUEUE_BOX_PICKED"},()=>{ loadParticipants(); })
      .on("broadcast",{event:"QUEUE_REVEAL_DONE"},()=>{
        setCompetition(c=>c?{...c, queue_reveal_active:false}:c);
      })
      .on("broadcast",{event:"JUDGE_SCORE_SUBMITTED"},({payload}:any)=>{
        // Another judge submitted their score for the live attempt — refresh the
        // running mean everyone sees, and check if my own submission is still pending.
        loadJudgeScores();
        if (payload.judge_user_id===user?.id) setMyScoreSubmitted(true);
      })
      .on("broadcast",{event:"REVEAL_RESULT"},({payload}:any)=>{
        // A judge announced a participant's final rank/score — show it to everyone.
        setCompetition(c=>c?{...c, revealed_participant_ids:payload.revealed_participant_ids}:c);
        const p = participantsRef.current.find(pp=>pp.id===payload.participant_id);
        if (p) { setRevealSpotlight({participant:p, rank:payload.rank}); setTimeout(()=>setRevealSpotlight(null),4500); }
        playStageWin();
      })
      .on("broadcast",{event:"REVEAL_START"},({payload}:any)=>{
        setCompetition(c=>c?{...c, results_reveal_active:true, revealed_participant_ids:payload.revealed_participant_ids??[]}:c);
      })
      .on("postgres_changes" as any,{event:"*",schema:"public",table:"musabaqah_participants",filter:`competition_id=eq.${competition.id}`},()=>{ loadParticipants(); })
      .subscribe(async()=>{
        const myName=myParticipantRef.current?.participant_name||profile?.full_name||"Guest";
        const myR=isJudge?"judge":myParticipantRef.current?"participant":"observer";
        await ch.track({name:myName,role:myR,user_id:user?.id});
      });
    ch.on("presence",{event:"sync"},()=>{
      const state=ch.presenceState() as Record<string,any[]>;
      const flat = Object.values(state).flat() as any[];
      setOnlineUsers(flat.map((u:any)=>({name:u.name||"Guest",role:u.role||"observer"})));
      // De-dupe judges by user_id (one judge could have multiple tabs/presence entries)
      const judgeMap = new Map<string,{user_id:string;name:string}>();
      flat.filter((u:any)=>u.role==="judge"&&u.user_id).forEach((u:any)=>judgeMap.set(u.user_id,{user_id:u.user_id,name:u.name||"Judge"}));
      setPresentJudges(Array.from(judgeMap.values()));
    });
    channelRef.current=ch;
    return ()=>{ supabase.removeChannel(ch); };
  },[competition?.id]);

  const broadcast = (event:string,payload:object={}) => channelRef.current?.send({type:"broadcast",event,payload});
  const wakeAudio = () => { try{getACtx().resume().then(()=>setAudioReady(true));}catch{} };
  const sendReaction = (emoji:string) => {
    wakeAudio();
    const name=myParticipant?.participant_name||"Audience";
    const id=Math.random().toString(36).slice(2); const x=10+Math.random()*80;
    setFloatReactions(r=>[...r,{id,emoji,name,x}]);
    setTimeout(()=>setFloatReactions(r=>r.filter(rx=>rx.id!==id)),3000);
    broadcast("REACTION",{emoji,name});
  };

  /** Parse one line from Q-Settings into a Tile.
   *  Auto-generated lines carry a §surahNum:ayahNum suffix so we can
   *  reconstruct the full Tile (with surah>0) and trigger fetchAyah. */
  /** Stable identity for a tile/question, used to track what's already been
   *  picked so it isn't offered again. Verse-based tiles key on surah:ayah;
   *  free-text (tajweed/waqf template) lines key on their own text. */
  const tileKey = (t: Tile) => (t.surah > 0 ? `${t.surah}:${t.ayah}` : t.label);
  const markTileUsed = (t: Tile) => {
    const key = tileKey(t);
    if (!key) return;
    setUsedTileKeys(prev => (prev.has(key) ? prev : new Set(prev).add(key)));
  };

  const parseTileLine = (line: string, num: number): Tile => {
    const match = line.match(/§(\d+):(\d+)$/);
    if (match) {
      const surahN = parseInt(match[1]);
      const ayahN  = parseInt(match[2]);
      const label  = line.replace(/\s*§\d+:\d+$/, "").trim();
      const sd = SURAHS.find(s => s.n === surahN);
      return {
        num, label, labelAr: sd ? `سورة ${sd.ar} — الآية ${ayahN}` : "",
        surah: surahN, ayah: ayahN,
        surahName: sd?.en ?? "", surahAr: sd?.ar ?? "",
      };
    }
    return { num, label: line, labelAr: "", surah: 0, ayah: 0, surahName: "", surahAr: "" };
  };

  const buildTiles = (comp: Competition, stageNum?: number): Tile[] => {
    const count = comp.scope_config?.tiles_per_stage ?? 10;
    const stageKey = String(stageNum ?? comp.current_stage);

    // 1. Prefer per-stage questions from the live editor. The pool can hold up
    //    to 30 questions (see autoFillStage); each call here draws only
    //    `count` of the ones NOT already picked by an earlier participant, so
    //    the same question never comes up twice across the whole competition.
    const stageLive = stageQuestions[stageKey]?.split("\n").map(s=>s.trim()).filter(Boolean) ?? [];
    const stageDb: string[] = comp.scope_config?.stage_questions?.[stageKey] ?? [];
    const stageSpecific = stageLive.length > 0 ? stageLive : stageDb;
    if (stageSpecific.length > 0) {
      const parsed = stageSpecific.map((line,i) => parseTileLine(line, i+1));
      const fresh = parsed.filter(t => !usedTileKeys.has(tileKey(t)));
      // If every question in the pool has already been used (e.g. more
      // participants than unique questions), fall back to reusing rather
      // than showing an empty picker.
      const source = fresh.length > 0 ? fresh : parsed;
      const shuffled = [...source].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, count).map((t, i) => ({ ...t, num: i + 1 }));
    }

    // 2. Fall back to flat custom questions (all-stages list, sliced by stage)
    const liveList = liveCustomQ.split("\n").map(s=>s.trim()).filter(Boolean);
    const customs: string[] = liveList.length > 0 ? liveList : (comp.scope_config?.custom_questions ?? []);
    if (customs.length > 0) {
      const parsed = customs.map((line,i) => parseTileLine(line, i+1));
      const fresh = parsed.filter(t => !usedTileKeys.has(tileKey(t)));
      const source = fresh.length > 0 ? fresh : parsed;
      const stageOffset = (comp.current_stage - 1) * count;
      const slice = source.slice(stageOffset, stageOffset + count);
      const effective = slice.length > 0 ? slice : source.slice(0, count);
      return effective.slice(0, count).map((t, i) => ({ ...t, num: i + 1 }));
    }

    // 3. Fall back to a pre-fetched Juz/Hizb/custom-range pool, else random Quran passages
    const scopePool = comp.scope_config?.scope_pool as ScopeAyah[] | undefined;
    if (scopePool && scopePool.length > 0) {
      const fresh = scopePool.filter(p => !usedTileKeys.has(`${p.surah}:${p.ayah}`));
      const source = fresh.length > 0 ? fresh : scopePool;
      const shuffled = [...source].sort(()=>Math.random()-0.5).slice(0, count);
      return shuffled.map((p,i) => ({
        num:i+1, label:`${p.surahName} — Ayah ${p.ayah}`, labelAr:`سورة ${p.surahAr} — الآية ${p.ayah}`,
        surah:p.surah, ayah:p.ayah, surahName:p.surahName, surahAr:p.surahAr,
      }));
    }
    // Retry a handful of times to avoid handing out an already-used random pair
    let tiles = genTiles(comp.scope_type, count);
    for (let attempt = 0; attempt < 5 && tiles.some(t => usedTileKeys.has(tileKey(t))); attempt++) {
      tiles = genTiles(comp.scope_type, count);
    }
    return tiles;
  };

  // ── JUDGE ACTIONS ────────────────────────────────────────────────

  const callParticipant = async (p:Participant) => {
    if (!competition) return;
    setBellCount(0); setMinorCount(0); setMajorCount(0); setTajweedAnswers({}); setTimerSecs(judgeTimerDuration); setElapsedSecs(0); elapsedRef.current=0;
    setTimerExpired(false); setShowScore(false);
    setScoreBreak({tajweed:"",memorize:"",fluency:"",voice:""}); setJudgeComment("");
    setPickedTile(null); setAyahText(null);
    setTilePickerCollapsed(false);
    // Always start this participant at stage 1 — they'll do ALL stages in one sitting
    setActiveParticipantStage(1);
    setPickerStage(1);
    const tiles = buildTiles(competition, 1);
    setStageTiles(tiles); setShowTilePicker(true);
    setActiveP({...p, status:"called"}); setCompetition(c=>c?{...c,current_participant_id:p.id}:c);
    setJudgeTab("controls");

    // Broadcast immediately for fast delivery
    broadcast("CALLED",{participant_id:p.id,participant_name:p.participant_name});
    broadcast("TILES_SHOWN",{tiles,stage:1,picker_participant_id:p.id});
    playCalled();

    // Persist tiles + caller info to DB — participant polls this as a fallback if
    // the broadcast was missed (stage-change interruption, reconnect, etc.)
    const newCfg = {
      ...(competition.scope_config||{}),
      current_tiles: tiles,
      current_called_id: p.id,
      current_stage_num: competition.current_stage,
    };
    await Promise.all([
      supabase.from("musabaqah_participants" as any).update({status:"called"}).eq("id",p.id),
      supabase.from("musabaqah_competitions" as any)
        .update({current_participant_id:p.id, scope_config: newCfg} as any)
        .eq("id",competition.id),
    ]);

    // Re-broadcast after DB write to catch late subscribers
    setTimeout(()=>broadcast("TILES_SHOWN",{tiles,stage:1,picker_participant_id:p.id}), 800);
  };

  const pickTile = (tile:Tile) => {
    setPickedTile(tile);
    markTileUsed(tile); // don't offer this question again, in this or any stage
    if (tile.surah>0) fetchAyah(tile.surah,tile.ayah);
    playTilePick(); broadcast("QUESTION_PICKED",{tile});
    // Auto-collapse the picker grid after picking so question is front and centre
    setTimeout(()=>setTilePickerCollapsed(true), 900);
  };

  const startReciting = async () => {
    if (!activeP||!competition||!pickedTile) return;
    const duration = judgeTimerDuration;
    // Broadcast + audio instantly
    broadcast("START_RECITING",{participant_id:activeP.id});
    broadcast("TIMER_START",{duration});
    setTimerSecs(duration); setElapsedSecs(0); elapsedRef.current=0;
    setTimerActive(true); setTimerExpired(false);
    // DB async
    supabase.from("musabaqah_participants" as any).update({status:"reciting"}).eq("id",activeP.id);
    const {data:att}=await supabase.from("musabaqah_attempts" as any).insert({
      competition_id:competition.id, participant_id:activeP.id,
      stage_number:activeParticipantStage,
      scope_label:pickedTile.label, scope_label_ar:pickedTile.labelAr,
      bell_count:0, status:"reciting",
      surah_number:pickedTile.surah||null, ayah_number:pickedTile.ayah||null,
    }).select().single();
    if (att) setCurAttempt(att as Attempt);
    setActiveP(p=>p?{...p,status:"reciting"}:p);
    // Evaluation panel opens for judges the moment recitation begins — not just
    // after Stop — so scoring can happen live as they listen.
    setScoreBreak({ tajweed: "", memorize: "", fluency: "", voice: "" });
    setJudgeComment(""); setMyScoreSubmitted(false); setShowScore(true);
    // Re-broadcast shortly after so a dropped websocket message doesn't leave
    // the participant stuck on "wait for judge to start" forever.
    setTimeout(()=>{ broadcast("START_RECITING",{participant_id:activeP.id}); broadcast("TIMER_START",{duration}); }, 1000);
  };

  // Judge taps "Start Reciting" → everyone (judge, the participant, observers)
  // sees a shared 3-2-1 countdown; only once THIS finishes does startReciting()
  // actually run and the real recitation timer begin.
  const beginCountdown = () => {
    if (!activeP||!competition||!pickedTile||countdownValue!==null) return;
    broadcast("COUNTDOWN_START",{participant_id:activeP.id});
    runLocalCountdown(startReciting);
  };
  const runLocalCountdown = (onDone?:()=>void) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    let n=3; setCountdownValue(n);
    try{navigator.vibrate?.(150);}catch{}
    countdownRef.current = setInterval(()=>{
      n -= 1;
      if (n<=0) {
        clearInterval(countdownRef.current!); countdownRef.current=null;
        setCountdownValue(null);
        onDone?.();
      } else {
        setCountdownValue(n);
        try{navigator.vibrate?.(150);}catch{}
      }
    },1000);
  };

  // ✅ Error tap — INSTANT: sound + broadcast first, DB async.
  // Minor errors (yellow) deduct 0.5, major errors (red) deduct 1 — both configurable per competition.
  const ringError = (severity: "minor"|"major") => {
    const n = bellCount + 1;
    setBellCount(n);
    if (severity === "minor") setMinorCount(c => c + 1); else setMajorCount(c => c + 1);
    playBell();                // sound — instant
    setBellFlash(true);        // visual
    setTimeout(()=>setBellFlash(false),2500);
    broadcast("BELL",{count:n, severity}); // network broadcast — fast (no await)
    // DB update async, does NOT block the above
    if (currentAttempt) {
      supabase.from("musabaqah_attempts" as any).update({bell_count:n}).eq("id",currentAttempt.id);
    }
  };

  // ✅ Stop — INSTANT: sound + broadcast first, DB async
  const signalStop = () => {
    playStop();                // sound — instant
    setStopFlash(true);
    setTimerActive(false);
    setTimerExpired(false);
    setTimeout(()=>setStopFlash(false),2500);
    broadcast("STOP");         // broadcast — fast (no await)
    setShowScore(true);
    // DB async
    const elapsed = elapsedRef.current;
    if (currentAttempt) {
      supabase.from("musabaqah_attempts" as any).update({status:"scored",duration_seconds:elapsed}).eq("id",currentAttempt.id);
    }
    if (activeP) {
      supabase.from("musabaqah_participants" as any).update({status:"completed"}).eq("id",activeP.id);
    }
  };

  const handleExtraTime = () => {
    const extra = 30;
    setTimerSecs(s=>s+extra);
    setTimerActive(true);
    setTimerExpired(false);
    broadcast("TIMER_EXTRA",{extra});
  };

  const handleTimerStop = () => {
    setTimerExpired(false);
    signalStop();
  };

  const [submittingScore, setSubmittingScore] = useState(false);

  /** Step 1 of scoring: THIS judge submits their own independent score for the
   *  live attempt. Every present judge does this separately. Once every judge
   *  who's actually in the room has submitted, the stage auto-finalizes using
   *  the mean of all their scores (see finalizeAttemptScore below). */
  const submitMyJudgeScore = async () => {
    if (!activeP || !competition || !user) return;
    if (submittingScore) return;
    setSubmittingScore(true);
    try {
      let attempt = currentAttempt;
      if (!attempt) {
        const { data: att } = await supabase.from("musabaqah_attempts" as any).insert({
          competition_id: competition.id,
          participant_id: activeP.id,
          stage_number: activeParticipantStage,
          scope_label: pickedTile?.label || "Manual entry",
          scope_label_ar: pickedTile?.labelAr || "",
          bell_count: bellCount,
          status: "reciting",
          surah_number: pickedTile?.surah || null,
          ayah_number: pickedTile?.ayah || null,
        } as any).select().single();
        if (att) { attempt = att as Attempt; setCurAttempt(att as Attempt); }
      }
      if (!attempt) {
        toast({ title: "Error", description: "Could not create score record", variant: "destructive" });
        return;
      }
      let total = 0; const breakdown: Record<string, number> = {};
      if (competition?.use_criteria_scoring) {
        SCORING_CRITERIA.forEach(c => { const v = Math.min(Number(scoreBreak[c.key]) || 0, c.max); breakdown[c.key] = v; total += v; });
      } else { total = Number(scoreBreak.tajweed) || 0; }
      total = Math.max(0, total - errorPenalty);

      // Upsert THIS judge's own score row (one row per judge per attempt)
      const { data: myRow } = await supabase.from("musabaqah_judge_scores" as any)
        .upsert({
          attempt_id: attempt.id, competition_id: competition.id, participant_id: activeP.id,
          judge_user_id: user.id, judge_name: profile?.full_name || "Judge",
          score_breakdown: breakdown, total_score: total, comment: judgeComment,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: "attempt_id,judge_user_id" }).select().single();

      setMyScoreSubmitted(true);
      broadcast("JUDGE_SCORE_SUBMITTED", { attempt_id: attempt.id, judge_user_id: user.id, judge_name: profile?.full_name || "Judge" });
      await loadJudgeScores();

      // Merge in my just-submitted row locally (state update above may not have landed yet)
      const existing = judgeScores[attempt.id] || [];
      const merged = [...existing.filter(r=>r.judge_user_id!==user.id), (myRow as any) || {
        id:"local", attempt_id:attempt.id, participant_id:activeP.id, judge_user_id:user.id,
        judge_name:profile?.full_name||"Judge", score_breakdown:breakdown, total_score:total, comment:judgeComment, created_at:new Date().toISOString(),
      }];

      const otherJudgesPresent = presentJudges.filter(j=>j.user_id!==user.id);
      const everyoneScored = otherJudgesPresent.every(j=>merged.some(r=>r.judge_user_id===j.user_id));

      if (everyoneScored) {
        const meanTotal = Math.round((merged.reduce((s,r)=>s+r.total_score,0)/merged.length)*10)/10;
        const meanBreak: Record<string,number> = {};
        SCORING_CRITERIA.forEach(c=>{ const vals=merged.map(r=>r.score_breakdown?.[c.key]||0); meanBreak[c.key]=Math.round((vals.reduce((s,v)=>s+v,0)/vals.length)*10)/10; });
        await finalizeAttemptScore(attempt, meanTotal, meanBreak, merged.length);
      } else {
        toast({ title: `✅ Your score submitted — waiting for ${otherJudgesPresent.length - merged.filter(r=>otherJudgesPresent.some(j=>j.user_id===r.judge_user_id)).length} more judge(s)` });
      }
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingScore(false);
    }
  };

  /** Any judge can force-finalize with whichever scores have been submitted so
   *  far, in case another judge disconnected or never joined. */
  const forceFinalizeScore = async () => {
    if (!activeP || !currentAttempt) return;
    const rows = judgeScores[currentAttempt.id] || [];
    if (!rows.length) { toast({ title: "No judge has scored yet", variant: "destructive" }); return; }
    const meanTotal = Math.round((rows.reduce((s,r)=>s+r.total_score,0)/rows.length)*10)/10;
    const meanBreak: Record<string,number> = {};
    SCORING_CRITERIA.forEach(c=>{ const vals=rows.map(r=>r.score_breakdown?.[c.key]||0); meanBreak[c.key]=Math.round((vals.reduce((s,v)=>s+v,0)/vals.length)*10)/10; });
    await finalizeAttemptScore(currentAttempt, meanTotal, meanBreak, rows.length);
  };

  /** Step 2 of scoring: once every present judge (or a manual force) has
   *  weighed in, write the MEAN as the attempt's official score and advance
   *  the competition — same flow as before, just fed a mean instead of one
   *  judge's number. */
  const finalizeAttemptScore = async (attempt: Attempt, total: number, breakdown: Record<string,number>, judgeCount: number) => {
    if (!activeP || !competition) return;
    setSubmittingScore(true);
    try {
      await supabase.from("musabaqah_attempts" as any).update({
        judge_score: total, score_breakdown: breakdown,
        judge_comment: judgeComment, bell_count: bellCount, status: "scored",
      } as any).eq("id", attempt.id);

      const newStageScores = { ...(activeP.stage_scores || {}), [activeParticipantStage]: total };
      const newTotal = (activeP.total_score || 0) + total;

      const nextStage = activeParticipantStage + 1;
      const hasMoreStages = nextStage <= competition.total_stages;

      if (hasMoreStages) {
        // ── More stages remain — keep participant called, show next stage tiles ──────
        await supabase.from("musabaqah_participants" as any).update({
          total_score: newTotal,
          stage_scores: newStageScores,
          status: "called",
        } as any).eq("id", activeP.id);

        // Update local activeP so UI reflects new total and reset status
        setActiveP(p => p ? { ...p, total_score: newTotal, stage_scores: newStageScores, status: "called" } : p);

        // Advance to next stage for this participant
        setActiveParticipantStage(nextStage);
        setPickerStage(nextStage);

        // Generate fresh tiles for next stage
        const newTiles = buildTiles(competition, nextStage);
        setStageTiles(newTiles);
        setPickedTile(null);
        setAyahText(null);
        setShowTilePicker(true);
        setPickerParticipantId(activeP.id);
        setTilePickerCollapsed(false);
        setCurAttempt(null);
        setBellCount(0); setMinorCount(0); setMajorCount(0);
        setTimerSecs(judgeTimerDuration);
        setElapsedSecs(0);
        elapsedRef.current = 0;
        setTimerActive(false);
        setTimerExpired(false);
        setShowScore(false);
        setScoreBreak({ tajweed: "", memorize: "", fluency: "", voice: "" });
        setJudgeComment("");
        setMyScoreSubmitted(false);

        // Persist new tiles to DB so participant polling fallback works
        const newCfg = {
          ...(competition.scope_config || {}),
          current_tiles: newTiles,
          current_called_id: activeP.id,
          current_stage_num: nextStage,
        };
        supabase.from("musabaqah_competitions" as any)
          .update({ scope_config: newCfg } as any)
          .eq("id", competition.id);

        // Notify participant: new stage starting
        broadcast("NEXT_STAGE", { participant_id: activeP.id, stage: nextStage, prev_score: total });
        // Send new tiles
        broadcast("TILES_SHOWN", { tiles: newTiles, stage: nextStage, picker_participant_id: activeP.id });
        setTimeout(() => broadcast("TILES_SHOWN", { tiles: newTiles, stage: nextStage, picker_participant_id: activeP.id }), 800);

        toast({ title: `✅ Stage ${activeParticipantStage} scored: ${total} pts (mean of ${judgeCount} judge${judgeCount>1?"s":""}) — Now Stage ${nextStage}!` });
        loadAttempts(); loadJudgeScores();
      } else {
        // ── All stages complete for this participant ───────────────────────────────
        await supabase.from("musabaqah_participants" as any).update({
          status: "completed", total_score: newTotal,
          stage_scores: newStageScores,
        } as any).eq("id", activeP.id);

        broadcast("SCORE_SUBMITTED", { participant_id: activeP.id, score: newTotal });
        toast({ title: `🏆 All ${competition.total_stages} stages complete! Total: ${newTotal} pts (mean of ${judgeCount} judge${judgeCount>1?"s":""})` });

        setActiveP(null); setCurAttempt(null); setShowScore(false);
        setBellCount(0); setMinorCount(0); setMajorCount(0); setTajweedAnswers({}); setTimerSecs(0); setElapsedSecs(0); elapsedRef.current = 0;
        setTimerActive(false); setTimerExpired(false);
        setShowTilePicker(false); setPickedTile(null); setAyahText(null);
        setActiveParticipantStage(1); setMyScoreSubmitted(false);
        setJudgeTab("roster"); loadParticipants(); loadAttempts(); loadJudgeScores();
      }
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingScore(false);
    }
  };

  // Each participant already loops through all of their own stages in one
  // sitting (see finalizeAttemptScore's hasMoreStages branch), so there is no real
  // "next stage for everyone" concept — this button is only ever shown once
  // the whole roster is done (allDone), so it just ends the competition.
  // NOTE: this used to also support advancing competition.current_stage and
  // resetting every participant back to "waiting" — including ones who had
  // already finished all their stages. That let a judge accidentally re-call
  // a completed participant, whose score would then be re-added on top of
  // their existing total_score (double counting) and corrupt the leaderboard.
  const advanceStage = async () => {
    if (!competition) return;
    await supabase.from("musabaqah_competitions" as any).update({status:"completed",current_participant_id:null,revealed_participant_ids:[],results_reveal_active:true}).eq("id",competition.id);
    setCompetition(c=>c?{...c,revealed_participant_ids:[],results_reveal_active:true}:c);
    broadcast("REVEAL_START",{revealed_participant_ids:[]});
    broadcast("COMPETITION_END"); setView("results");
  };

  const terminateSession = async () => {
    if (!competition) return;
    const ok = window.confirm("End this session for all participants? This cannot be undone.");
    if (!ok) return;
    await supabase.from("musabaqah_competitions" as any).update({ status: "completed", current_participant_id: null, revealed_participant_ids:[], results_reveal_active:true } as any).eq("id", competition.id);
    setCompetition(c=>c?{...c,revealed_participant_ids:[],results_reveal_active:true}:c);
    broadcast("REVEAL_START",{revealed_participant_ids:[]});
    broadcast("COMPETITION_END");
    localStorage.removeItem("musabaqah_session");
    setView("results");
  };

  // ── Results reveal ceremony (judge only) ───────────────────────────
  // Scores stay hidden from everyone until the judge reveals them, one rank
  // at a time — either sequentially starting from last place, or by tapping
  // any specific rank directly.
  const rankedParticipants = [...participants].sort((a,b)=>b.total_score-a.total_score);
  const revealedIds = competition?.revealed_participant_ids || [];

  const revealParticipant = async (participantId:string) => {
    if (!competition || revealBusy) return;
    if (revealedIds.includes(participantId)) return;
    setRevealBusy(true);
    try {
      const updated = [...revealedIds, participantId];
      await supabase.from("musabaqah_competitions" as any).update({ revealed_participant_ids: updated } as any).eq("id", competition.id);
      setCompetition(c=>c?{...c, revealed_participant_ids: updated}:c);
      const rank = rankedParticipants.findIndex(p=>p.id===participantId) + 1;
      broadcast("REVEAL_RESULT", { participant_id: participantId, rank, revealed_participant_ids: updated });
      const p = participants.find(pp=>pp.id===participantId);
      if (p) { setRevealSpotlight({participant:p, rank}); setTimeout(()=>setRevealSpotlight(null),4500); }
      playStageWin();
    } finally { setRevealBusy(false); }
  };

  /** Reveal the lowest-ranked not-yet-announced participant — builds the
   *  ceremony from last place up to the winner. */
  /** Judge-only: unlock the leaderboard for everyone else without ending the
   *  competition — separate from terminateSession/advanceStage, which end
   *  the whole session. Reveals then proceed one participant at a time via
   *  the same revealParticipant/revealNextInOrder used on the results page. */
  const releaseLeaderboard = async () => {
    if (!competition) return;
    await supabase.from("musabaqah_competitions" as any).update({ results_reveal_active: true, revealed_participant_ids: [] } as any).eq("id", competition.id);
    setCompetition(c=>c?{...c, results_reveal_active:true, revealed_participant_ids:[]}:c);
    broadcast("REVEAL_START", { revealed_participant_ids: [] });
  };

  const revealNextInOrder = () => {
    for (let i = rankedParticipants.length - 1; i >= 0; i--) {
      if (!revealedIds.includes(rankedParticipants[i].id)) { revealParticipant(rankedParticipants[i].id); return; }
    }
  };

  const startCompetition = async () => {
    if (!competition) return;
    await supabase.from("musabaqah_competitions" as any).update({status:"active"}).eq("id",competition.id);
    setCompetition(c=>c?{...c,status:"active"}:c);
    broadcast("COMP_START", {});
    setJudgeTab("controls"); // jump straight to Controls so Call button is visible
    toast({title:"🎯 Competition started! Call the first participant."});
  };

  const ensureJudgeCodes = async (comp: Competition): Promise<string[]> => {
    const existing: string[] = comp.scope_config?.judge_codes ?? [];
    if (existing.length > 0) return existing; // don't cap — respect however many the admin has generated
    const codes = [genCode(), genCode()]; // starting pair; more can be added anytime from Settings
    const newConfig = { ...(comp.scope_config||{}), judge_codes: codes };
    await supabase.from("musabaqah_competitions" as any).update({ scope_config: newConfig } as any).eq("id", comp.id);
    setCompetition(c=>c&&c.id===comp.id?{...c,scope_config:newConfig}:c);
    return codes;
  };

  // Admin can generate additional judge codes any time a competition needs more judge seats
  // (e.g. a bigger panel, or extra teachers volunteering to judge).
  const addJudgeCode = async () => {
    if (!competition) return;
    const existing: string[] = competition.scope_config?.judge_codes ?? judgeCodes;
    const codes = [...existing, genCode()];
    const newConfig = { ...(competition.scope_config||{}), judge_codes: codes };
    await supabase.from("musabaqah_competitions" as any).update({ scope_config: newConfig } as any).eq("id", competition.id);
    setCompetition(c=>c&&c.id===competition.id?{...c,scope_config:newConfig}:c);
    setJudgeCodes(codes);
    toast({title:"New judge code added"});
  };

  const removeJudgeCode = async (code: string) => {
    if (!competition) return;
    const codes = (competition.scope_config?.judge_codes ?? judgeCodes).filter((c:string)=>c!==code);
    const newConfig = { ...(competition.scope_config||{}), judge_codes: codes };
    await supabase.from("musabaqah_competitions" as any).update({ scope_config: newConfig } as any).eq("id", competition.id);
    setCompetition(c=>c&&c.id===competition.id?{...c,scope_config:newConfig}:c);
    setJudgeCodes(codes);
  };

  const createCompetition = async () => {
    if (!form.title.trim()) { toast({title:"Enter a title"}); return; }
    setLoading(true);
    const room_code=genCode();
    const customQList = form.use_custom_q ? form.custom_questions.split("\n").map(s=>s.trim()).filter(Boolean) : [];
    // Juz / Hizb / custom-range need their ayah pool fetched from the Quran API up front
    // (once), then cached on the competition so every tile-build after this is instant
    // and works offline.
    let scopePool: any[] = [];
    if (["juz","hizb","custom_range"].includes(form.scope_type) && !form.use_custom_q) {
      scopePool = await fetchScopePool(form.scope_type, {
        juz_number: form.juz_number, hizb_number: form.hizb_number,
        range_surah_start: form.range_surah_start, range_ayah_start: form.range_ayah_start,
        range_surah_end: form.range_surah_end, range_ayah_end: form.range_ayah_end,
      });
      if (scopePool.length===0) {
        setLoading(false);
        toast({title:"Couldn't fetch that scope",description:"Check your connection and try again, or pick a different scope.",variant:"destructive"});
        return;
      }
    }
    const {data,error}=await supabase.from("musabaqah_competitions" as any).insert({
      title:form.title.trim(),description:form.description.trim(),scope_type:form.scope_type,
      scope_config:{
        tiles_per_stage: form.tiles_per_stage, custom_questions: customQList, scope_pool: scopePool,
        juz_number: form.juz_number, hizb_number: form.hizb_number,
        range_surah_start: form.range_surah_start, range_ayah_start: form.range_ayah_start,
        range_surah_end: form.range_surah_end, range_ayah_end: form.range_ayah_end,
        judge_codes: [genCode(), genCode()],
      },
      total_stages:form.total_stages,current_stage:1,time_limit_seconds:form.time_limit,
      status:"open",room_code,created_by:user?.id,use_criteria_scoring:form.use_criteria,
      registration_deadline: form.registration_deadline ? new Date(form.registration_deadline).toISOString() : null,
      registration_override: "auto",
      juz_options: form.juz_options.length ? form.juz_options : null,
    } as any).select().single();
    setLoading(false);
    if (error) { toast({title:"Error",description:error.message,variant:"destructive"}); return; }
    const comp=data as Competition;
    setCompetition(comp); setJudgeTimerDuration(comp.time_limit_seconds);
    // Init per-stage question state
    const sqText: Record<string,string> = {};
    for (let i=1; i<=comp.total_stages; i++) sqText[String(i)] = "";
    setStageQuestions(sqText); setQSettingsStage(1);
    setLiveCustomQ(customQList.join("\n")); setLiveInstructions(form.description.trim());
    setView("arena"); await fetchLkToken(room_code);
    toast({title:`🏆 Created! Code: ${room_code}`});
  };

  // Shared routing for "I already have a participant row for this comp" —
  // used by joinCompetition (rejoin), openComp, and chooseRole. A participant
  // still sitting at "pending" on a competition with a deadline hasn't
  // unlocked their access code yet, so they land back on the registered/
  // countdown screen instead of the arena.
  const enterAsExistingParticipant = async (comp:Competition, participant:Participant) => {
    setCompetition(comp); setMyParticipant(participant); setUserRole("participant");
    if (participant.status==="pending" && comp.registration_deadline) { setView("registered"); return; }
    setView("arena"); await fetchLkToken(comp.room_code);
  };

  const joinCompetition = async () => {
    const code=joinForm.room_code.trim().toUpperCase(), name=joinForm.name.trim();
    if (!code||!name) { toast({title:"Enter code and name"}); return; }
    setLoading(true);
    const {data:comp,error:compErr}=await supabase.from("musabaqah_competitions" as any).select("*").eq("room_code",code).maybeSingle();
    if (compErr||!comp) { toast({title:"Not found",description:`No competition: ${code}`,variant:"destructive"}); setLoading(false); return; }
    const {data:existing}=await supabase.from("musabaqah_participants" as any).select("*").eq("competition_id",(comp as Competition).id).eq("user_id",user?.id).maybeSingle();
    if (existing) { setLoading(false); await enterAsExistingParticipant(comp as Competition, existing as Participant); return; }
    if ((comp as Competition).status==="completed") { toast({title:"This competition has ended",variant:"destructive"}); setLoading(false); return; }
    if (!isRegistrationOpen(comp as Competition)) {
      toast({title:"Registration closed",description:"This musabaqah is no longer accepting new registrations.",variant:"destructive"});
      setLoading(false); return;
    }
    const compRow = comp as Competition;
    if (compRow.juz_options?.length && !joinForm.juz) { toast({title:"Please select your Juz"}); setLoading(false); return; }
    const {count}=await supabase.from("musabaqah_participants" as any).select("id",{count:"exact",head:true}).eq("competition_id",compRow.id);

    // Personal access code — distinct from the shared room_code. Retry a
    // couple of times on the rare chance of a collision with another
    // participant's code (unique index enforces this server-side).
    let participant:any=null, insertErr:any=null;
    for (let attempt=0; attempt<3 && !participant; attempt++) {
      const access_code = genCode();
      const res = await supabase.from("musabaqah_participants" as any).insert({
        competition_id:compRow.id,user_id:user?.id||null,participant_name:name,school:joinForm.school||null,
        queue_position:(count??0)+1,status:"pending",total_score:0,stage_scores:{},bell_counts:{},proctor_flagged:false,camera_on:false,
        access_code, assigned_juz: joinForm.juz ?? null,
      }).select().single();
      if (!res.error) { participant = res.data; break; }
      insertErr = res.error;
      if (res.error.code !== "23505") break; // only retry on unique-violation (duplicate access_code)
    }
    setLoading(false);
    if (!participant) { toast({title:"Failed",description:insertErr?.message||"Could not register",variant:"destructive"}); return; }
    setCompetition(compRow); setMyParticipant(participant as Participant); setUserRole("participant");
    if (compRow.registration_deadline) {
      setView("registered");
      toast({title:"🎉 Successfully registered!",description:"Awaiting session — you'll get a one-time look at your personal code next, so make sure to save it."});
    } else {
      setView("arena"); await fetchLkToken(code);
      toast({title:"✅ Registered!",description:`Your personal code is ${participant.access_code} — save it to come back anytime.`});
    }
  };

  // Participant confirms they've saved their personal code — flips
  // code_acknowledged so it is never displayed again after this. From then
  // on the holding screen only tells them to contact the admin if it's lost.
  const acknowledgeCode = async () => {
    if (!myParticipant) return;
    setAckingCode(true);
    await supabase.from("musabaqah_participants" as any).update({ code_acknowledged: true }).eq("id", myParticipant.id);
    setAckingCode(false);
    setMyParticipant(p => p ? { ...p, code_acknowledged: true } : p);
  };

  // Admin/judge sets (or updates) the session start time — separate action
  // from the registration deadline. Notifies every registered/waiting
  // participant so the red-dot + notification center picks it up.
  const setSessionStartTime = async () => {
    if (!competition || !sessionTimeInput) return;
    setLoading(true);
    const iso = new Date(sessionTimeInput).toISOString();
    const { error } = await supabase.from("musabaqah_competitions" as any).update({ session_start_at: iso } as any).eq("id", competition.id);
    setLoading(false);
    if (error) { toast({title:"Couldn't set session time", description:error.message, variant:"destructive"}); return; }
    setCompetition(c => c ? { ...c, session_start_at: iso } : c);
    const when = new Date(iso).toLocaleString("en",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
    toast({title:"⏰ Session time set", description:`Participants will see a countdown to ${when}.`});
    const notifyIds = participants.filter(p=>p.role!=="judge"&&p.user_id).map(p=>p.user_id!);
    if (notifyIds.length) {
      await supabase.from("notifications" as any).insert(notifyIds.map(uid=>({
        user_id: uid, type: "musabaqah_session_set", priority: "normal",
        title: "Musabaqah session time set", title_ar: null,
        message: `${competition.title}: the session starts ${when}.`, message_ar: null,
        link: `/musabaqah/recitation?comp=${competition.id}`, is_read: false,
      })));
    }
  };

  // Participant enters their personal access code once the registration
  // deadline has passed, to "log in" to the waiting room.
  const activateWithCode = async () => {
    if (!competition) return;
    const codeInput = accessCodeInput.trim().toUpperCase();
    if (!codeInput) { toast({title:"Enter your code"}); return; }
    setLoading(true);
    const {data:p,error}=await supabase.from("musabaqah_participants" as any)
      .select("*").eq("competition_id",competition.id).eq("access_code",codeInput).maybeSingle();
    setLoading(false);
    if (error || !p) { toast({title:"Invalid code",description:"Double-check your personal code and try again.",variant:"destructive"}); return; }
    const participant = p as Participant;
    if (participant.status==="pending") {
      await supabase.from("musabaqah_participants" as any).update({status:"waiting"}).eq("id",participant.id);
      participant.status = "waiting";
    }
    setMyParticipant(participant); setUserRole("participant");
    setView("arena"); await fetchLkToken(competition.room_code);
    toast({title:`👋 Welcome, ${participant.participant_name}!`});
  };

  const openComp = async (comp:Competition) => {
    clearUnreadInfo(comp.id);
    setCompetition(comp); setChatMessages([]); setUserRole(null);
    setJudgeTimerDuration(comp.time_limit_seconds);
    setJoinForm(f=>({...f,room_code:comp.room_code,name:f.name||profile?.full_name||"",school:f.school||profile?.school||""}));
    // Init live-editable Q settings from DB
    const cqs: string[] = comp.scope_config?.custom_questions ?? [];
    setLiveCustomQ(cqs.join("\n"));
    setLiveInstructions(comp.description||"");
    // Init per-stage questions
    const sq: Record<string,string[]> = comp.scope_config?.stage_questions ?? {};
    const sqText: Record<string,string> = {};
    for (let i=1; i<=comp.total_stages; i++) {
      sqText[String(i)] = (sq[String(i)] ?? []).join("\n");
    }
    setStageQuestions(sqText);
    setQSettingsStage(comp.current_stage);
    if (canJudge) {
      const {data:roster}=await supabase.from("musabaqah_participants" as any).select("*").eq("competition_id",comp.id).order("queue_position");
      if (roster) setParticipants(roster as Participant[]);
      // Mandatory registration: a judge/admin can't enter the room without
      // having claimed one of the (max 2) judge codes for this competition.
      const mine = (roster as Participant[]|null)?.find(p=>p.user_id===user?.id && p.role==="judge");
      if (mine) { setMyParticipant(mine); setView("preroom"); return; }
      const codes = await ensureJudgeCodes(comp);
      setJudgeCodes(codes); setJudgeCodeInput("");
      setView("judge_gate");
      return;
    }
    const {data}=await supabase.from("musabaqah_participants" as any).select("*").eq("competition_id",comp.id).eq("user_id",user?.id).single();
    if (data) { await enterAsExistingParticipant(comp, data as Participant); }
    else setView("role_select");
  };

  // ── Standalone Settings page (gear icon on a competition card) ────
  // Same live-editable Q-settings state used inside the arena drawer,
  // just entered directly from the list without opening the room.
  const openSettings = async (comp: Competition) => {
    setCompetition(comp);
    const cqs: string[] = comp.scope_config?.custom_questions ?? [];
    setLiveCustomQ(cqs.join("\n"));
    setLiveInstructions(comp.description||"");
    const sq: Record<string,string[]> = comp.scope_config?.stage_questions ?? {};
    const sqText: Record<string,string> = {};
    const st: Record<string,string> = comp.scope_config?.stage_types ?? {};
    const stObj: Record<string,"recitation"|"tajweed"|"waqf"> = {};
    for (let i=1; i<=comp.total_stages; i++) {
      sqText[String(i)] = (sq[String(i)] ?? []).join("\n");
      stObj[String(i)] = (st[String(i)] as any) || "recitation";
    }
    setStageQuestions(sqText);
    setStageTypes(stObj);
    setScoringConfig({
      minor_error: comp.scope_config?.scoring_config?.minor_error ?? 0.5,
      major_error: comp.scope_config?.scoring_config?.major_error ?? 1,
      wrong_answer: comp.scope_config?.scoring_config?.wrong_answer ?? 10,
    });
    setQSettingsStage(comp.current_stage);
    setJudgeCodes(await ensureJudgeCodes(comp));
    setView("settings");
  };

  // ── Judge-code gate: a judge/admin must claim one of the (however many) judge codes ──
  const claimJudgeCode = async () => {
    if (!competition || !user) return;
    const code = judgeCodeInput.trim().toUpperCase();
    if (!judgeCodes.includes(code)) { toast({title:"Invalid judge code",variant:"destructive"}); return; }
    setLoading(true);
    // Someone else already holding this exact code takes the slot — a code is one seat.
    const {data:holder} = await supabase.from("musabaqah_participants" as any)
      .select("*").eq("competition_id",competition.id).eq("role","judge").eq("access_code",code).maybeSingle();
    if (holder && (holder as Participant).user_id && (holder as Participant).user_id!==user.id) {
      setLoading(false);
      toast({title:"That judge code is already claimed",variant:"destructive"});
      return;
    }
    const {data:mine} = await supabase.from("musabaqah_participants" as any)
      .select("*").eq("competition_id",competition.id).eq("user_id",user.id).eq("role","judge").maybeSingle();
    let row = mine as Participant|null;
    if (!row) {
      const {data:inserted,error} = await supabase.from("musabaqah_participants" as any).insert({
        competition_id: competition.id, user_id: user.id,
        participant_name: profile?.full_name || "Judge", role: "judge",
        access_code: code, status: "waiting", queue_position: 0,
        total_score: 0, stage_scores: {}, bell_counts: {}, proctor_flagged: false, camera_on: false,
      } as any).select().single();
      setLoading(false);
      if (error) { toast({title:"Couldn't register",description:error.message,variant:"destructive"}); return; }
      row = inserted as Participant;
    } else {
      setLoading(false);
    }
    setMyParticipant(row);
    setParticipants(p=>[...p.filter(x=>x.id!==row!.id), row!]);
    setView("preroom");
  };

  // ── Observer/attendee gate: view-only access now requires name registration ──
  const registerObserver = async () => {
    if (!competition || !observerNameInput.trim()) { toast({title:"Enter your name"}); return; }
    setLoading(true);
    const {data:existing} = await supabase.from("musabaqah_participants" as any)
      .select("*").eq("competition_id",competition.id).eq("user_id",user?.id||"").eq("role","observer").maybeSingle();
    let row = existing as Participant|null;
    if (!row) {
      const {data:inserted,error} = await supabase.from("musabaqah_participants" as any).insert({
        competition_id: competition.id, user_id: user?.id,
        participant_name: observerNameInput.trim(), role: "observer",
        status: "waiting", queue_position: 0,
        total_score: 0, stage_scores: {}, bell_counts: {}, proctor_flagged: false, camera_on: false,
      } as any).select().single();
      setLoading(false);
      if (error) { toast({title:"Couldn't register",description:error.message,variant:"destructive"}); return; }
      row = inserted as Participant;
    } else {
      setLoading(false);
    }
    setMyParticipant(row);
    setUserRole("observer");
    setView("arena");
    if (competition) await fetchLkToken(competition.room_code);
  };

  const chooseRole = async (roleId:string) => {
    setUserRole(roleId as any);
    if (roleId==="judge") { setView("arena"); if (competition) await fetchLkToken(competition.room_code); return; }
    if (roleId==="observer") {
      // Mandatory registration: view-only attendees must give at least a name before entering.
      if (competition && user) {
        const {data:existing} = await supabase.from("musabaqah_participants" as any)
          .select("*").eq("competition_id",competition.id).eq("user_id",user.id).eq("role","observer").maybeSingle();
        if (existing) { setMyParticipant(existing as Participant); setView("arena"); await fetchLkToken(competition.room_code); return; }
      }
      setObserverNameInput(profile?.full_name||"");
      setView("observer_gate");
      return;
    }
    if (competition) {
      const {data}=await supabase.from("musabaqah_participants" as any).select("*").eq("competition_id",competition.id).eq("user_id",user?.id).single();
      if (data) { await enterAsExistingParticipant(competition, data as Participant); }
      else setView("join");
    }
  };


  const sendChat = () => {
    const text=chatInput.trim(); if (!text) return;
    const name=myParticipant?.participant_name||profile?.full_name||"Guest";
    const id=Math.random().toString(36).slice(2);
    const time=new Date().toLocaleTimeString("en",{hour:"2-digit",minute:"2-digit"});
    setChatMessages(m=>[...m.slice(-79),{id,name,text,time}]);
    broadcast("CHAT",{name,text}); setChatInput("");
  };

  const approveParticipant = async (p: Participant) => {
    if (!competition) return;
    if (admissionsLocked(competition)) { toast({title:"Registration still open", description:"Admissions unlock once the registration deadline passes.", variant:"destructive"}); return; }
    await supabase.from("musabaqah_participants" as any).update({ status: "waiting" }).eq("id", p.id);
    broadcast("PARTICIPANT_APPROVED", { participant_id: p.id });
    loadParticipants();
  };

  const admitAllPending = async () => {
    if (!competition) return;
    if (admissionsLocked(competition)) { toast({title:"Registration still open", description:"Admissions unlock once the registration deadline passes.", variant:"destructive"}); return; }
    const ids = participants.filter(p=>p.status==="pending").map(p=>p.id);
    if (!ids.length) return;
    await supabase.from("musabaqah_participants" as any).update({ status: "waiting" }).in("id", ids);
    ids.forEach(id=>broadcast("PARTICIPANT_APPROVED", { participant_id: id }));
    loadParticipants();
  };

  // Manual registration close/reopen — overrides the deadline either way.
  const toggleRegistration = async () => {
    if (!competition) return;
    const nextOverride = isRegistrationOpen(competition) ? "closed" : "open";
    await supabase.from("musabaqah_competitions" as any).update({ registration_override: nextOverride } as any).eq("id", competition.id);
    setCompetition(c=>c?{...c, registration_override: nextOverride}:c);
    toast({title: nextOverride==="closed" ? "🔒 Registration closed" : "🔓 Registration reopened"});
  };

  // Judge shuffles the current waiting list into hidden boxes for participants to pick.
  const startQueueReveal = async () => {
    if (!competition) return;
    const waitingP = participants.filter(p=>p.status==="waiting");
    if (waitingP.length < 2) { toast({title:"Need at least 2 waiting participants"}); return; }
    const n = waitingP.length;
    const positions = Array.from({length:n},(_,i)=>i+1);
    for (let i=positions.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [positions[i],positions[j]]=[positions[j],positions[i]]; }
    await supabase.from("musabaqah_participants" as any).update({ queue_box_id: null }).eq("competition_id",competition.id).in("id", waitingP.map(p=>p.id));
    await supabase.from("musabaqah_competitions" as any)
      .update({ queue_shuffle_boxes: positions, queue_box_count: n, queue_reveal_active: true } as any)
      .eq("id",competition.id);
    setCompetition(c=>c?{...c, queue_box_count:n, queue_reveal_active:true}:c);
    broadcast("QUEUE_REVEAL_START",{boxCount:n});
    loadParticipants();
    toast({title:`🎲 Queue shuffled — ${n} boxes ready to pick!`});
  };

  const finishQueueReveal = async () => {
    if (!competition) return;
    await supabase.from("musabaqah_competitions" as any).update({ queue_reveal_active:false } as any).eq("id",competition.id);
    setCompetition(c=>c?{...c, queue_reveal_active:false}:c);
    broadcast("QUEUE_REVEAL_DONE",{});
  };

  // Participant taps a hidden box — the actual position mapping never leaves the
  // server; this RPC atomically claims the box and returns the revealed position.
  const pickQueueBox = async (box:number) => {
    if (!competition || !myParticipant) return;
    const { data: position, error } = await supabase.rpc("claim_queue_box" as any, {
      p_competition_id: competition.id, p_participant_id: myParticipant.id, p_box_id: box,
    });
    if (error || position==null) { toast({title:"That box was just taken",description:"Pick another one.",variant:"destructive"}); loadParticipants(); return; }
    setMyParticipant(p=>p?{...p,queue_box_id:box,queue_position:position as number}:p);
    broadcast("QUEUE_BOX_PICKED",{});
    playTilePick();
    loadParticipants();
    toast({title:`📦 Box ${box} revealed — you're position #${position}!`});
  };

  const confirmDelete = async () => {
    if (!deleteModal) return;
    await supabase.from("musabaqah_attempts" as any).delete().eq("competition_id",deleteModal.id);
    await supabase.from("musabaqah_participants" as any).delete().eq("competition_id",deleteModal.id);
    await supabase.from("musabaqah_competitions" as any).delete().eq("id",deleteModal.id);
    setDeleteModal(null); loadCompetitions(); toast({title:"Deleted"});
  };

  const copyCode = (code:string,e:React.MouseEvent) => {
    e.stopPropagation(); navigator.clipboard?.writeText(code).catch(()=>{});
    setCopyFlash(true); setTimeout(()=>setCopyFlash(false),1800);
  };

  const waiting = participants.filter(p=>p.status==="waiting");
  const pending = participants.filter(p=>p.status==="pending");
  const done    = participants.filter(p=>p.status==="completed");
  // allDone: no waiting, no pending, at least one completed, and either no active participant
  // OR the active one is already completed with the score panel dismissed (curAttempt cleared).
  // This handles the case where activeP gets stuck as "completed" without a score panel.
  const allDone = waiting.length===0 && pending.length===0 && done.length>0 &&
    (!activeP || (activeP.status==="completed" && !currentAttempt && !showScorePanel));

  // Auto-switch judge to controls tab when all participants in this stage are done
  // so the "Next Stage" / "End Competition" button is immediately visible
  useEffect(() => {
    if (allDone && isJudge) setJudgeTab("controls");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone, isJudge]);

  // Safety: if activeP is "completed" but the score panel was never opened (curAttempt null),
  // the judge has no way to clear it. Auto-clear after 800ms so allDone can become true.
  useEffect(() => {
    if (!activeP || activeP.status !== "completed" || currentAttempt || showScorePanel) return;
    const t = setTimeout(() => setActiveP(null), 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeP?.status, currentAttempt, showScorePanel]);

  // Auto-switch judge to Controls tab the moment competition becomes active
  useEffect(() => {
    if (competition?.status === "active" && isJudge && !activeP) setJudgeTab("controls");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competition?.status, isJudge]);
  const totalCrit = competition?.use_criteria_scoring ? SCORING_CRITERIA.reduce((s,c)=>s+(Number(scoreBreak[c.key])||0),0) : Number(scoreBreak.tajweed)||0;
  const errorPenalty = Math.round((minorCount*scoringConfig.minor_error + majorCount*scoringConfig.major_error) * 10) / 10;
  const finalScore = Math.max(0,totalCrit-errorPenalty);
  const currentStageType: "recitation"|"tajweed"|"waqf" = (competition?.scope_config?.stage_types?.[String(activeParticipantStage)]) || "recitation";
  const currentStageQuestions: string[] = competition?.scope_config?.stage_questions?.[String(activeParticipantStage)] ?? [];
  const tajweedWrongCount = Object.values(tajweedAnswers).filter(v=>v==="wrong").length;
  const tajweedAutoScore = Math.max(0, 100 - tajweedWrongCount*scoringConfig.wrong_answer);
  const timerWarning = timerSecs > 0 && timerSecs <= 30;
  const timerDanger  = timerSecs > 0 && timerSecs <= 10;

  // Recitation stage, non-criteria mode: default the base score to 100 so the
  // "Your score" line auto-reflects the error deduction live, but an admin/judge
  // can still overwrite the number by hand.
  useEffect(() => {
    if (!showScorePanel || competition?.use_criteria_scoring) return;
    if (currentStageType !== "recitation") return;
    if (scoreBreak.tajweed === "") setScoreBreak(s => ({ ...s, tajweed: "100" }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showScorePanel, currentStageType]);

  // Tajweed/waqf stage: keep the score field synced to 100 minus (wrong answers × penalty),
  // while still leaving it editable for a manual override.
  useEffect(() => {
    if (!showScorePanel || currentStageType==="recitation") return;
    setScoreBreak(s => ({ ...s, tajweed: String(tajweedAutoScore) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tajweedAutoScore, showScorePanel, currentStageType]);

  // ── Back navigation ──────────────────────────────────────────────
  const goBack = () => {
    if (view==="arena") { setView("list"); return; }
    if (view==="list") { navigate(-1); return; }
    setView("list");
  };

  // ── Save live Q settings to DB ───────────────────────────────────
  const saveQSettings = async () => {
    if (!competition) return;
    const qList = liveCustomQ.split("\n").map(s=>s.trim()).filter(Boolean);
    // Build stage_questions map from the live stageQuestions state
    const stageQMap: Record<string,string[]> = {};
    for (let i=1; i<=competition.total_stages; i++) {
      const lines = (stageQuestions[String(i)]||"").split("\n").map(s=>s.trim()).filter(Boolean);
      if (lines.length > 0) stageQMap[String(i)] = lines;
    }
    const newConfig = {
      ...(competition.scope_config||{}),
      custom_questions: qList,
      stage_questions: stageQMap,
      stage_types: stageTypes,
      scoring_config: scoringConfig,
    };
    await supabase.from("musabaqah_competitions" as any)
      .update({ scope_config: newConfig, description: liveInstructions } as any)
      .eq("id", competition.id);
    setCompetition(c=>c?{...c,scope_config:newConfig,description:liveInstructions}:c);
    broadcast("SETTINGS_UPDATE", { instructions: liveInstructions });
    setShowQSettings(false);
    const stageCount = Object.keys(stageQMap).length;
    const msg = stageCount > 0
      ? `✅ Saved — ${stageCount} stage(s) with custom questions`
      : qList.length > 0 ? `✅ ${qList.length} flat custom questions saved` : "✅ Settings saved (random passages)";
    toast({ title: msg });
  };

  // ── AI question generation ───────────────────────────────────────
  /** Generic no-AI question banks for Tajweed/Waqf stages. These are rotated
   *  across a picked ayah reference so admins get a ready-to-review starting
   *  point without needing the AI Generate tab. They are templates, not
   *  verified per-ayah tajweed analysis — admins should review before saving. */
  const TAJWEED_RULE_BANK = [
    "Idghaam (with Ghunnah)", "Idghaam (without Ghunnah)", "Ikhfa",
    "Qalqalah", "Madd (natural)", "Madd (necessary)", "Ghunnah",
    "Iqlaab", "Noon Sakinah / Tanween rule", "Meem Sakinah rule",
  ];
  const WAQF_SIGN_BANK = [
    "Waqf Lazim (compulsory stop)", "Waqf Jaiz (permissible stop)",
    "Waqf Mamnu' (stopping prohibited)", "Waslu Awla (continuing preferred)",
    "Saktah (brief pause, no breath)",
  ];

  /** Auto-fill ONE stage (the currently-selected editing stage) with
   *  questions from the competition's scope — no AI needed. Branches on the
   *  stage's type: Recitation gets verse-reference tiles (with a §surah:ayah
   *  suffix so verse text loads live); Tajweed/Waqf get template questions
   *  built around a picked ayah, since those stages are graded correct/wrong
   *  rather than recited. An optional `guide` keyword narrows the ayah pool
   *  to surahs matching that word (e.g. "Fatiha", "short surahs" → no match
   *  falls back to the full scope pool). */
  const AUTOFILL_POOL_SIZE = 30; // each stage's auto-filled question bank holds up to this many

  const autoFillStage = (stageNum: number, guide?: string) => {
    if (!competition) return;
    const poolSize = Math.min(AUTOFILL_POOL_SIZE, competition.scope_config?.tiles_per_stage
      ? Math.max(AUTOFILL_POOL_SIZE, competition.scope_config.tiles_per_stage) : AUTOFILL_POOL_SIZE);
    const stageKey = String(stageNum);
    const stageType: "recitation"|"tajweed"|"waqf" = stageTypes[stageKey] || "recitation";

    let pool = competition.scope_type === "juz30"
      ? SURAHS.filter(s => s.juz === 30)
      : competition.scope_type === "juz29"
      ? SURAHS.filter(s => s.juz >= 29)
      : SURAHS;

    const g = (guide || "").trim().toLowerCase();
    if (g) {
      const narrowed = pool.filter(s => s.en.toLowerCase().includes(g) || s.ar.includes(guide!.trim()));
      if (narrowed.length > 0) pool = narrowed;
    }

    // Don't repeat an ayah that's already used in another stage's live list,
    // or that a participant has already been asked (tracked in usedTileKeys
    // across the whole competition).
    const usedElsewhere = new Set<string>(usedTileKeys);
    for (let i = 1; i <= competition.total_stages; i++) {
      if (i === stageNum) continue;
      (stageQuestions[String(i)] || "").split("\n").forEach(line => {
        const m = line.match(/§(\d+):(\d+)/);
        if (m) usedElsewhere.add(`${m[1]}:${m[2]}`);
      });
    }

    const seen = new Set<string>(usedElsewhere);
    const pairs: {s: typeof SURAHS[0], a: number}[] = [];
    for (let attempt = 0; attempt < poolSize * 20 && pairs.length < poolSize; attempt++) {
      const s = pool[Math.floor(Math.random() * pool.length)];
      const a = Math.floor(Math.random() * s.v) + 1;
      const key = `${s.n}:${a}`;
      if (!seen.has(key)) { seen.add(key); pairs.push({s, a}); }
    }
    while (pairs.length < poolSize) { // pad if the (possibly narrowed) scope is too small
      const s = pool[Math.floor(Math.random() * pool.length)];
      const a = Math.floor(Math.random() * s.v) + 1;
      pairs.push({s, a});
    }

    let questions: string[];
    if (stageType === "recitation") {
      // §surah:ayah suffix is parsed by parseTileLine/buildTiles to produce a
      // proper Tile with surah>0, which triggers fetchAyah to load verse text.
      questions = pairs.map(({s, a}) => `${s.en} — Ayah ${a} §${s.n}:${a}`);
    } else {
      // Tajweed/Waqf questions are shown as plain text to the judge (no tile
      // picker), so we don't append the § suffix here.
      const bank = stageType === "tajweed" ? TAJWEED_RULE_BANK : WAQF_SIGN_BANK;
      questions = pairs.map(({s, a}, i) => {
        const rule = bank[i % bank.length];
        return stageType === "tajweed"
          ? `What tajweed rule applies in ${s.en}, Ayah ${a}? (e.g. ${rule})`
          : `Is stopping permitted at this point in ${s.en}, Ayah ${a}? (${rule})`;
      });
    }

    setStageQuestions(sq => ({ ...sq, [stageKey]: questions.join("\n") }));
    toast({ title: `✅ ${questions.length} ${stageType} question${questions.length > 1 ? "s" : ""} set for Stage ${stageNum}${g ? ` — guided by "${guide}"` : ""}` });
  };

  const generateAIQuestions = async () => {
    if (!aiPrompt.trim()) { toast({title:"Enter a prompt",variant:"destructive"}); return; }
    setAiGenLoading(true);
    try {
      const stageKey = String(qSettingsStage);
      const stageType: "recitation"|"tajweed"|"waqf" = stageTypes[stageKey] || "recitation";

      const basePromptByType: Record<"recitation"|"tajweed"|"waqf", string> = {
        recitation: `Generate exactly ${aiQCount} concise Quran recitation competition passage assignments. Each item should be on its own line, formatted simply like: "Al-Fatiha full" or "Al-Baqarah 1-5" or "Surah Al-Ikhlas complete". No numbering, no bullets, just one item per line.`,
        tajweed: `Generate exactly ${aiQCount} Tajweed rule questions for a live Qur'an competition judge to read aloud and mark correct/wrong. Each question should ask the participant to identify or explain a specific tajweed rule (e.g. Idghaam, Ikhfaa, Qalqalah, Madd, Ghunnah, Iqlaab, Noon Sakinah/Tanween rules) as it applies in a specific ayah. Each item on its own line, phrased as a short direct question, e.g. "What tajweed rule applies to the noon sakinah in Surah Al-Baqarah, Ayah 3?". No numbering, no bullets, no answers included — just the question, one per line.`,
        waqf: `Generate exactly ${aiQCount} Waqf (stopping/pause sign) questions for a live Qur'an competition judge to read aloud and mark correct/wrong. Each question should ask the participant to identify the correct waqf sign, or whether stopping is permitted/preferred/prohibited, at a specific point in a specific ayah. Each item on its own line, phrased as a short direct question, e.g. "Is it permissible to stop after 'ٱلرَّحِيمِ' in Surah Al-Fatiha, Ayah 3?". No numbering, no bullets, no answers included — just the question, one per line.`,
      };

      const { data, error } = await supabase.functions.invoke("tahleem-ai", {
        body: {
          action: "generate",
          prompt: `${basePromptByType[stageType]} Topic/scope context: ${aiPrompt}`,
        }
      });
      if (error) throw new Error(error.message);
      const raw = (data?.text || data?.content?.[0]?.text || "") as string;
      if (!raw.trim()) throw new Error("Empty response from AI");
      const lines = raw.split("\n").map((s:string)=>s.replace(/^[\d\-\*\.\)]+\s*/,"").trim()).filter((s:string)=>s.length>3);
      const existing = (stageQuestions[stageKey]||"").trim();
      const merged = existing ? existing + "\n" + lines.join("\n") : lines.join("\n");
      setStageQuestions(sq=>({...sq, [stageKey]: merged}));
      setQSettingsTab("manual");
      toast({ title: `✨ Generated ${lines.length} ${stageType} questions for Stage ${qSettingsStage} — review & save` });
    } catch(e:any) {
      // AI failed — offer to auto-fill from scope instead
      toast({
        title: "AI generation unavailable",
        description: "Use 'Fill from Quran scope' instead — no internet needed.",
        variant: "destructive"
      });
    } finally { setAiGenLoading(false); }
  };

  /* ════════════════════════════════════════════════════════════════
     LIST VIEW
  ════════════════════════════════════════════════════════════════ */
  if (view==="list") {
    const shown=isJudge?competitions:competitions.filter(c=>c.status==="open"||c.status==="active");
    return (
      <div style={{minHeight:"100vh",position:"relative",fontFamily:"Cairo,sans-serif",overflowY:"auto",paddingBottom:80}}>
        <GlobalStyles/><IslamicBackground/>
        {deleteModal&&(
          <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,.75)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div className="anim-slide-up glass-card" style={{borderRadius:22,padding:"32px 28px",maxWidth:380,width:"100%",textAlign:"center",border:"1.5px solid rgba(239,68,68,.4)"}}>
              <div style={{fontSize:48,marginBottom:12}}>🗑️</div>
              <h3 style={{color:"#fff",fontFamily:"Cinzel,sans-serif",fontSize:18,margin:"0 0 8px",fontWeight:700}}>Delete Competition?</h3>
              <p style={{color:RED,fontSize:12,margin:"0 0 24px"}}>⚠️ Deletes all participants & attempts.</p>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>setDeleteModal(null)} style={{flex:1,background:"rgba(255,255,255,.07)",color:"rgba(255,255,255,.7)",border:"1px solid rgba(255,255,255,.15)",borderRadius:12,padding:"13px 0",cursor:"pointer",fontFamily:"Cairo,sans-serif",fontWeight:700,fontSize:14}}>Cancel</button>
                <button onClick={confirmDelete} style={{flex:1,background:"linear-gradient(135deg,#991b1b,#dc2626)",color:"#fff",border:"none",borderRadius:12,padding:"13px 0",cursor:"pointer",fontFamily:"Cairo,sans-serif",fontWeight:800,fontSize:14}}>Delete</button>
              </div>
            </div>
          </div>
        )}

        {/* Back button */}
        <div style={{position:"relative",zIndex:1,padding:"16px 20px 0"}}>
          <button onClick={goBack} style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",borderRadius:10,padding:"8px 14px",cursor:"pointer",color:"rgba(255,255,255,.6)",display:"flex",alignItems:"center",gap:6,fontSize:13,fontFamily:"Cairo,sans-serif"}}>
            <ArrowLeft size={14}/> Back
          </button>
        </div>

        <div className="anim-slide-up" style={{position:"relative",zIndex:1,textAlign:"center",padding:"24px 24px 28px"}}>
          <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:80,height:80,borderRadius:24,background:`linear-gradient(135deg,${GOLD},${GOLDD})`,boxShadow:"0 12px 40px rgba(201,168,76,.5)",marginBottom:20,animation:"floatUp 5s ease-in-out infinite"}}>
            <Trophy size={40} color={G} strokeWidth={2.5}/>
          </div>
          <h1 style={{fontFamily:"Cinzel,serif",color:"#fff",fontSize:30,fontWeight:700,margin:"0 0 4px",letterSpacing:2}}>Al-Musābaqah</h1>
          <p style={{fontFamily:"Amiri,serif",color:GOLD,fontSize:18,margin:"0 0 8px",direction:"rtl"}}>مسابقة التلاوة الحية</p>
          <p style={{color:"rgba(255,255,255,.4)",fontSize:13,margin:0}}>Live Qur'an Recitation Competition</p>
        </div>

        <div style={{position:"relative",zIndex:1,maxWidth:560,margin:"0 auto",padding:"0 16px"}}>
        {/* Rejoin saved session banner */}
        {savedSession && (
          <div className="stagger-1" style={{background:"rgba(201,168,76,.12)",border:`1.5px solid ${GOLD}`,borderRadius:16,padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:28,flexShrink:0}}>🔄</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:GOLD,fontWeight:800,fontSize:14}}>Rejoin Session</div>
              <div style={{color:"rgba(255,255,255,.5)",fontSize:12,marginTop:2}}>You were in competition <strong style={{color:"#fff"}}>{savedSession.roomCode}</strong></div>
            </div>
            <div style={{display:"flex",gap:8,flexShrink:0}}>
              <button onClick={rejoinSession} style={{background:`linear-gradient(135deg,${GOLD},${GOLDD})`,color:G,border:"none",borderRadius:10,padding:"8px 16px",cursor:"pointer",fontWeight:800,fontSize:13,fontFamily:"Cairo,sans-serif"}}>Rejoin</button>
              <button onClick={()=>{localStorage.removeItem("musabaqah_session");setSavedSession(null);}} style={{background:"rgba(255,255,255,.07)",color:"rgba(255,255,255,.45)",border:"1px solid rgba(255,255,255,.12)",borderRadius:10,padding:"8px 12px",cursor:"pointer",fontSize:13}}>✕</button>
            </div>
          </div>
        )}

          <div className="stagger-2" style={{display:"flex",gap:8,marginBottom:16}}>
            {isAdmin&&<button className="gold-btn" onClick={()=>setView("setup")} style={{flex:1,color:G,border:"none",borderRadius:14,padding:"14px 0",fontWeight:800,cursor:"pointer",fontSize:15,fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Plus size={18}/> New Competition</button>}
            <button onClick={()=>setView("join")} style={{flex:1,background:"rgba(255,255,255,.07)",color:"#fff",border:"1.5px solid rgba(201,168,76,.3)",borderRadius:14,padding:"14px 0",fontWeight:700,cursor:"pointer",fontSize:15,fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><LogIn size={18}/> Join with Code</button>
            <button onClick={loadCompetitions} style={{background:"rgba(255,255,255,.06)",color:"rgba(255,255,255,.4)",border:"1.5px solid rgba(255,255,255,.1)",borderRadius:14,padding:"14px 16px",cursor:"pointer"}}><RefreshCw size={16}/></button>
          </div>
          {shown.length===0 ? (
            <div className="stagger-3 glass-card" style={{textAlign:"center",padding:"48px 24px",borderRadius:20,color:"rgba(255,255,255,.3)"}}>
              <Trophy size={44} color="rgba(201,168,76,.2)" style={{marginBottom:12}}/>
              <p style={{margin:0,fontWeight:600}}>No active competitions</p>
              {isAdmin&&<p style={{margin:"6px 0 0",fontSize:13,opacity:.6}}>Create one to get started</p>}
              {canJudge&&!isAdmin&&<p style={{margin:"6px 0 0",fontSize:13,opacity:.6}}>Ask an admin for a judge code once one is open</p>}
            </div>
          ) : shown.map((c,i)=>(
            <div key={c.id} onClick={()=>openComp(c)} className={`glass-card stagger-${Math.min(i+2,5)}`}
              style={{borderRadius:18,padding:"16px 18px",cursor:"pointer",border:`1.5px solid rgba(201,168,76,${c.status==="active"?.55:.18})`,display:"flex",alignItems:"center",gap:12,marginBottom:12,boxShadow:c.status==="active"?"0 0 30px rgba(201,168,76,.15)":"none"}}>
              <div style={{position:"relative",width:48,height:48,borderRadius:14,flexShrink:0,background:c.status==="active"?`linear-gradient(135deg,${GOLD},${GOLDD})`:c.status==="completed"?"rgba(96,165,250,.15)":"rgba(255,255,255,.08)",border:`1.5px solid ${c.status==="active"?GOLD:c.status==="completed"?"rgba(96,165,250,.35)":"rgba(201,168,76,.2)"}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                {c.status==="active"?<Radio size={22} color={G}/>:c.status==="completed"?<Award size={22} color="#60a5fa"/>:<Trophy size={22} color={GOLD}/>}
                {unreadInfoIds.has(c.id) && (
                  <span style={{position:"absolute",top:-3,right:-3,width:11,height:11,borderRadius:"50%",background:RED,border:"2px solid #0a1f12"}}/>
                )}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4,flexWrap:"wrap"}}>
                  <span style={{color:"#fff",fontWeight:700,fontSize:14}}>{c.title}</span>
                  <span style={{padding:"2px 9px",borderRadius:20,fontSize:10,fontWeight:700,background:c.status==="active"?`${GREEN}22`:c.status==="open"?`${GOLD}22`:"rgba(255,255,255,.08)",color:c.status==="active"?GREEN:c.status==="open"?GOLD:"rgba(255,255,255,.35)",border:`1px solid ${c.status==="active"?GREEN:c.status==="open"?GOLD:"rgba(255,255,255,.1)"}`}}>
                    {c.status==="active"?"🔴 LIVE":c.status==="open"?"🟢 OPEN":c.status==="completed"?"✅ DONE":c.status.toUpperCase()}
                  </span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{color:"rgba(255,255,255,.35)",fontSize:11}}>{c.total_stages} Stages</span>
                  {c.status==="open"&&!isRegistrationOpen(c)&&(
                    <><span style={{color:"rgba(255,255,255,.15)"}}>·</span><span style={{color:RED,fontSize:10,fontWeight:700}}>Registration Closed</span></>
                  )}
                  {canJudge && (
                    <>
                      <span style={{color:"rgba(255,255,255,.15)"}}>·</span>
                      <button onClick={e=>copyCode(c.room_code,e)} style={{background:"none",border:"none",padding:0,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                        <span style={{color:GOLD,fontWeight:800,letterSpacing:2,fontSize:12}}>{c.room_code}</span>
                        <span style={{fontSize:10,color:"rgba(201,168,76,.5)"}}>📋</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
              <button onClick={async e=>{e.stopPropagation(); setCompetition(c); const {data}=await supabase.from("musabaqah_participants" as any).select("*").eq("competition_id",c.id).order("queue_position"); if(data) setParticipants(data as Participant[]); setView("leaderboard");}} style={{background:"rgba(96,165,250,.1)",border:"1px solid rgba(96,165,250,.3)",borderRadius:9,padding:"7px 9px",cursor:"pointer",color:"#60a5fa",display:"flex",alignItems:"center"}}><Award size={14}/></button>
              {isAdmin&&<button onClick={e=>{e.stopPropagation();openSettings(c);}} style={{background:"rgba(201,168,76,.1)",border:"1px solid rgba(201,168,76,.25)",borderRadius:9,padding:"7px 9px",cursor:"pointer",color:GOLD,display:"flex",alignItems:"center"}}><Settings size={14}/></button>}
              {isAdmin&&<button onClick={e=>{e.stopPropagation();setDeleteModal(c);}} style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.25)",borderRadius:9,padding:"7px 9px",cursor:"pointer",color:RED}}>🗑️</button>}
              <ChevronRight size={16} color="rgba(255,255,255,.2)"/>
            </div>
          ))}
          {isJudge&&<div className="stagger-5" style={{marginTop:8,background:"rgba(201,168,76,.06)",border:"1px solid rgba(201,168,76,.15)",borderRadius:14,padding:"12px 16px",display:"flex",gap:10,alignItems:"flex-start"}}>
            <Crown size={15} color={GOLD} style={{flexShrink:0,marginTop:2}}/>
            <p style={{color:"rgba(255,255,255,.45)",fontSize:12,margin:0,lineHeight:1.7}}>{isAdmin?<><strong style={{color:GOLD}}>Judge mode:</strong> Create competitions, call participants, reveal questions, ring bell, score recitations in real time.</>:<><strong style={{color:GOLD}}>Judge mode:</strong> Tap a competition and enter the judge code an admin shares with you to join — you'll see the countdown to the session and can call, question, and score participants live.</>}</p>
          </div>}
        </div>
      </div>
    );
  }

  /* ── SETUP ── */
  if (view==="setup") return (
    <div style={{minHeight:"100vh",position:"relative",fontFamily:"Cairo,sans-serif",overflowY:"auto",paddingBottom:40}}>
      <GlobalStyles/><IslamicBackground/>
      <div className="anim-slide-up" style={{position:"relative",zIndex:1,maxWidth:560,margin:"0 auto",padding:"24px 16px"}}>
        <button onClick={()=>setView("list")} style={{background:"none",border:"none",color:"rgba(255,255,255,.4)",cursor:"pointer",marginBottom:20,fontSize:13,display:"flex",alignItems:"center",gap:6}}><ArrowLeft size={14}/> Back</button>
        <div className="glass-card" style={{borderRadius:24,padding:"28px 24px"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
            <div style={{width:44,height:44,borderRadius:14,background:`linear-gradient(135deg,${GOLD},${GOLDD})`,display:"flex",alignItems:"center",justifyContent:"center"}}><Plus size={22} color={G}/></div>
            <div><h2 style={{color:"#fff",fontFamily:"Cinzel,sans-serif",fontSize:20,margin:0,fontWeight:600}}>New Competition</h2><p style={{color:"rgba(255,255,255,.35)",fontSize:12,margin:0}}>Set up your musabaqah</p></div>
          </div>
          <Inp label="Competition Title" value={form.title} onChange={(e:any)=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Ramadan Tajweed Championship"/>
          <Inp label="Description (optional)" value={form.description} onChange={(e:any)=>setForm(f=>({...f,description:e.target.value}))} placeholder="Brief description..."/>
          <div style={{marginBottom:16}}>
            <Label>Quran Scope</Label>
            {SCOPE_OPTIONS.map(s=>(
              <div key={s.id} onClick={()=>setForm(f=>({...f,scope_type:s.id}))} style={{background:form.scope_type===s.id?`${GOLD}18`:"rgba(255,255,255,.04)",border:`1.5px solid ${form.scope_type===s.id?GOLD:"rgba(255,255,255,.1)"}`,borderRadius:12,padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                <div style={{width:18,height:18,borderRadius:"50%",border:`2px solid ${form.scope_type===s.id?GOLD:"rgba(255,255,255,.25)"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{form.scope_type===s.id&&<div style={{width:8,height:8,borderRadius:"50%",background:GOLD}}/>}</div>
                <div><div style={{color:form.scope_type===s.id?GOLD:"#fff",fontWeight:700,fontSize:13}}>{s.label}</div><div style={{color:"rgba(255,255,255,.35)",fontSize:11}}>{s.desc}</div></div>
              </div>
            ))}
            {form.scope_type==="juz"&&(
              <div style={{marginTop:8}}>
                <Label>Which Juz?</Label>
                <select value={form.juz_number} onChange={e=>setForm(f=>({...f,juz_number:Number(e.target.value)}))} style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(201,168,76,.25)",borderRadius:12,padding:"12px 14px",color:"#fff",fontSize:14}}>
                  {Array.from({length:30},(_,i)=>i+1).map(n=><option key={n} value={n} style={{background:G}}>Juz {n}</option>)}
                </select>
              </div>
            )}
            {form.scope_type==="hizb"&&(
              <div style={{marginTop:8}}>
                <Label>Which Hizb?</Label>
                <select value={form.hizb_number} onChange={e=>setForm(f=>({...f,hizb_number:Number(e.target.value)}))} style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(201,168,76,.25)",borderRadius:12,padding:"12px 14px",color:"#fff",fontSize:14}}>
                  {Array.from({length:60},(_,i)=>i+1).map(n=><option key={n} value={n} style={{background:G}}>Hizb {n}</option>)}
                </select>
              </div>
            )}
            {form.scope_type==="custom_range"&&(
              <div style={{marginTop:8}}>
                <Label>From — Surah : Ayah</Label>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <input type="number" min={1} max={114} value={form.range_surah_start} onChange={e=>setForm(f=>({...f,range_surah_start:Number(e.target.value)}))} placeholder="Surah #" style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(201,168,76,.25)",borderRadius:12,padding:"12px 14px",color:"#fff",fontSize:14}}/>
                  <input type="number" min={1} value={form.range_ayah_start} onChange={e=>setForm(f=>({...f,range_ayah_start:Number(e.target.value)}))} placeholder="Ayah #" style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(201,168,76,.25)",borderRadius:12,padding:"12px 14px",color:"#fff",fontSize:14}}/>
                </div>
                <Label>To — Surah : Ayah</Label>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <input type="number" min={1} max={114} value={form.range_surah_end} onChange={e=>setForm(f=>({...f,range_surah_end:Number(e.target.value)}))} placeholder="Surah #" style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(201,168,76,.25)",borderRadius:12,padding:"12px 14px",color:"#fff",fontSize:14}}/>
                  <input type="number" min={1} value={form.range_ayah_end} onChange={e=>setForm(f=>({...f,range_ayah_end:Number(e.target.value)}))} placeholder="Ayah #" style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(201,168,76,.25)",borderRadius:12,padding:"12px 14px",color:"#fff",fontSize:14}}/>
                </div>
                <div style={{color:"rgba(255,255,255,.3)",fontSize:11,marginTop:4}}>Surah numbers 1–114. Leave ayah as 1 / max if unsure — we'll fetch the exact ayah counts when you create the competition.</div>
              </div>
            )}
          </div>
          <div style={{marginBottom:16}}>
            <Label>Registration Deadline (optional)</Label>
            <input type="datetime-local" value={form.registration_deadline} onChange={e=>setForm(f=>({...f,registration_deadline:e.target.value}))}
              style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(201,168,76,.25)",borderRadius:12,padding:"12px 14px",color:"#fff",fontSize:14,colorScheme:"dark"}}/>
            <div style={{color:"rgba(255,255,255,.3)",fontSize:11,marginTop:4}}>Leave blank for no deadline. Registration auto-closes at this time — you can always reopen it manually from the arena. Once closed, participants wait for you to separately set a session start time (from the room, before entering) — that's what actually opens their code-entry gate.</div>
          </div>
          <div style={{marginBottom:16}}>
            <Label>Juz Options for Registration (optional)</Label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {Array.from({length:30},(_,i)=>i+1).map(n=>{
                const active = form.juz_options.includes(n);
                return (
                  <button key={n} type="button" onClick={()=>setForm(f=>({...f,juz_options: active ? f.juz_options.filter(x=>x!==n) : [...f.juz_options,n]}))}
                    style={{background:active?`${GOLD}22`:"rgba(255,255,255,.06)",border:`1.5px solid ${active?GOLD:"rgba(255,255,255,.15)"}`,borderRadius:8,padding:"6px 10px",cursor:"pointer",color:active?GOLD:"rgba(255,255,255,.6)",fontFamily:"Cairo,sans-serif",fontWeight:700,fontSize:12,minWidth:34}}>
                    {n}
                  </button>
                );
              })}
            </div>
            <div style={{color:"rgba(255,255,255,.3)",fontSize:11,marginTop:4}}>
              {form.juz_options.length ? `Participants will pick their Juz from ${form.juz_options.length} option${form.juz_options.length>1?"s":""} when they register.` : "Leave empty to skip Juz selection during registration."}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
            <div><Label>Total Stages</Label>
              <select value={form.total_stages} onChange={e=>setForm(f=>({...f,total_stages:Number(e.target.value)}))} style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(201,168,76,.25)",borderRadius:12,padding:"12px 14px",color:"#fff",fontSize:14}}>
                {[1,2,3,4,5,6,7,8,10].map(n=><option key={n} value={n} style={{background:G}}>{n} Stage{n>1?"s":""}</option>)}
              </select>
            </div>
            <div><Label>Timer per Student (sec)</Label>
              <input type="number" value={form.time_limit} onChange={e=>setForm(f=>({...f,time_limit:Number(e.target.value)}))} min={30} max={1800} step={30} style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(201,168,76,.25)",borderRadius:12,padding:"12px 14px",color:"#fff",fontSize:14}}/>
            </div>
          </div>
          <div style={{marginBottom:16}}>
            <Label>Tiles per stage</Label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[5,8,10,12,15,20,25,30].map(n=>(
                <button key={n} onClick={()=>setForm(f=>({...f,tiles_per_stage:n}))}
                  style={{background:form.tiles_per_stage===n?`${GOLD}22`:"rgba(255,255,255,.06)",border:`1.5px solid ${form.tiles_per_stage===n?GOLD:"rgba(255,255,255,.15)"}`,borderRadius:10,padding:"8px 16px",cursor:"pointer",color:form.tiles_per_stage===n?GOLD:"rgba(255,255,255,.6)",fontFamily:"Cairo,sans-serif",fontWeight:700,fontSize:13}}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div style={{marginBottom:form.use_custom_q?0:16}}>
            <div onClick={()=>setForm(f=>({...f,use_custom_q:!f.use_custom_q}))}
              style={{background:form.use_custom_q?`${GOLD}18`:"rgba(255,255,255,.04)",border:`1.5px solid ${form.use_custom_q?GOLD:"rgba(255,255,255,.12)"}`,borderRadius:12,padding:"12px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:36,height:20,borderRadius:10,background:form.use_custom_q?GOLD:"rgba(255,255,255,.15)",position:"relative",transition:"background .2s",flexShrink:0}}>
                <div style={{position:"absolute",top:2,left:form.use_custom_q?18:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
              </div>
              <div>
                <div style={{color:form.use_custom_q?GOLD:"#fff",fontWeight:700,fontSize:13}}>Custom Questions</div>
                <div style={{color:"rgba(255,255,255,.35)",fontSize:11,marginTop:2}}>Enter your own question list instead of random Quran passages</div>
              </div>
            </div>
          </div>
          {form.use_custom_q&&(
            <div style={{marginBottom:16,marginTop:10}}>
              <Label>Custom Questions (one per line)</Label>
              <textarea value={form.custom_questions} onChange={e=>setForm(f=>({...f,custom_questions:e.target.value}))}
                placeholder={"Al-Baqarah 1-5\nAl-Imran 10-20\nAl-Fatiha full\n..."}
                rows={6} style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(201,168,76,.25)",borderRadius:12,padding:"12px 16px",color:"#fff",fontSize:13,fontFamily:"Cairo,sans-serif",resize:"vertical",lineHeight:1.6}}/>
              <div style={{color:"rgba(255,255,255,.3)",fontSize:11,marginTop:4}}>{form.custom_questions.split("\n").filter(s=>s.trim()).length} questions</div>
            </div>
          )}
          <div style={{marginBottom:24}}>
            <Label>Scoring Mode</Label>
            {[{v:true,label:"Criteria scoring",desc:"Tajweed 40 + Hifdh 30 + Fluency 20 + Voice 10"},{v:false,label:"Simple score",desc:"0–100 direct score"}].map(o=>(
              <div key={String(o.v)} onClick={()=>setForm(f=>({...f,use_criteria:o.v}))} style={{background:form.use_criteria===o.v?`${GOLD}15`:"rgba(255,255,255,.04)",border:`1.5px solid ${form.use_criteria===o.v?GOLD:"rgba(255,255,255,.1)"}`,borderRadius:12,padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
                <div style={{width:18,height:18,borderRadius:"50%",border:`2px solid ${form.use_criteria===o.v?GOLD:"rgba(255,255,255,.25)"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{form.use_criteria===o.v&&<div style={{width:8,height:8,borderRadius:"50%",background:GOLD}}/>}</div>
                <div><div style={{color:form.use_criteria===o.v?GOLD:"#fff",fontWeight:700,fontSize:13}}>{o.label}</div><div style={{color:"rgba(255,255,255,.35)",fontSize:11}}>{o.desc}</div></div>
              </div>
            ))}
          </div>
          <button className="gold-btn" onClick={createCompetition} disabled={loading} style={{width:"100%",color:G,border:"none",borderRadius:14,padding:"16px",fontWeight:800,cursor:loading?"not-allowed":"pointer",fontSize:16,fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:loading?.7:1}}>
            {loading?<Loader2 size={18} style={{animation:"spin 1s linear infinite"}}/>:<Trophy size={18}/>}{loading?"Creating...":"Create Competition"}
          </button>
        </div>
      </div>
    </div>
  );

  /* ── JOIN ── */
  if (view==="join") return (
    <div style={{minHeight:"100vh",position:"relative",fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <GlobalStyles/><IslamicBackground/>
      <div className="anim-slide-up glass-card" style={{position:"relative",zIndex:1,width:"100%",maxWidth:440,borderRadius:24,padding:"32px 24px"}}>
        <button onClick={()=>setView("list")} style={{background:"none",border:"none",color:"rgba(255,255,255,.4)",cursor:"pointer",marginBottom:20,fontSize:13,display:"flex",alignItems:"center",gap:6}}><ArrowLeft size={14}/> Back</button>
        <div style={{textAlign:"center",marginBottom:20}}>
          <h2 style={{fontFamily:"Cinzel,sans-serif",color:"#fff",fontSize:19,margin:"0 0 4px",fontWeight:700}}>Register</h2>
          <p style={{color:"rgba(255,255,255,.4)",fontSize:12,margin:0}}>{competition?.title}</p>
        </div>
        <div style={{marginBottom:16}}>
          <Label>Room Code</Label>
          <input value={joinForm.room_code} onChange={e=>setJoinForm(f=>({...f,room_code:e.target.value.toUpperCase()}))} placeholder="AB3XY7" maxLength={6}
            style={{width:"100%",background:"rgba(201,168,76,.08)",border:"2px solid rgba(201,168,76,.4)",borderRadius:14,padding:"16px 20px",color:GOLD,fontSize:28,fontWeight:900,letterSpacing:10,textAlign:"center",textTransform:"uppercase"}}/>
        </div>
        <Inp label="Your Full Name" value={joinForm.name} onChange={(e:any)=>setJoinForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Ahmad Muhammad"/>
        <Inp label="School / Institute (optional)" value={joinForm.school} onChange={(e:any)=>setJoinForm(f=>({...f,school:e.target.value}))} placeholder="e.g. Tahleem Academy"/>
        {!!competition?.juz_options?.length && (
          <div style={{marginBottom:16}}>
            <Label>Your Juz</Label>
            <select value={joinForm.juz ?? ""} onChange={e=>setJoinForm(f=>({...f,juz:e.target.value?Number(e.target.value):undefined}))}
              style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(201,168,76,.25)",borderRadius:12,padding:"12px 14px",color:"#fff",fontSize:14}}>
              <option value="" style={{background:G}}>Select the Juz you'll recite...</option>
              {competition.juz_options.map(n=><option key={n} value={n} style={{background:G}}>Juz {n}</option>)}
            </select>
            <div style={{color:"rgba(255,255,255,.3)",fontSize:11,marginTop:4}}>Set by the organizer for this competition.</div>
          </div>
        )}
        {competition?.registration_deadline && (
          <div style={{background:"rgba(201,168,76,.08)",border:"1px solid rgba(201,168,76,.2)",borderRadius:12,padding:"10px 14px",marginBottom:16,fontSize:12,color:"rgba(255,255,255,.55)"}}>
            Registration closes{" "}
            <strong style={{color:GOLD}}>{new Date(competition.registration_deadline).toLocaleString("en",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</strong>.
            You'll get a personal code once — save it. The waiting room opens once the organizer schedules the session.
          </div>
        )}
        <button className="gold-btn" onClick={joinCompetition} disabled={loading} style={{width:"100%",color:G,border:"none",borderRadius:14,padding:"16px",fontWeight:800,cursor:loading?"not-allowed":"pointer",fontSize:16,fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:loading?.7:1,marginTop:8}}>
          {loading?<Loader2 size={18} style={{animation:"spin 1s linear infinite"}}/>:<LogIn size={18}/>}{loading?"Registering...":"Register"}
        </button>
      </div>
    </div>
  );

  /* ── REGISTERED (holding screen) ──────────────────────────────────
     Phases, in order:
       1. beforeDeadline   — registration still open; informational countdown to the deadline
       2. awaitingSession  — deadline passed, admin hasn't set a session start yet; no countdown
       3. countingToSession— admin set session_start_at; countdown to it
       4. readyToEnter     — session start has arrived; code-entry gate opens
     The participant's own access code is shown ONCE — right after registering,
     while code_acknowledged is still false — then never displayed again. */
  if (view==="registered" && competition && myParticipant) {
    const deadlineDone = deadlinePassed(competition);
    const hasSessionTime = !!competition.session_start_at;
    const sessionDone = sessionStarted(competition);
    const phase: "beforeDeadline"|"awaitingSession"|"countingToSession"|"readyToEnter" =
      !deadlineDone ? "beforeDeadline" : !hasSessionTime ? "awaitingSession" : !sessionDone ? "countingToSession" : "readyToEnter";
    const needsCodeReveal = !myParticipant.code_acknowledged;

    const regSecs = regCountdownMs !== null ? Math.floor(regCountdownMs/1000) : 0;
    const rdd = Math.floor(regSecs/86400), rhh = Math.floor((regSecs%86400)/3600), rmm = Math.floor((regSecs%3600)/60), rss = regSecs%60;
    const sesSecs = sessionCountdownMs !== null ? Math.floor(sessionCountdownMs/1000) : 0;
    const sdd = Math.floor(sesSecs/86400), shh = Math.floor((sesSecs%86400)/3600), smm = Math.floor((sesSecs%3600)/60), sss = sesSecs%60;

    const headline = needsCodeReveal ? "🎉" : phase==="readyToEnter" ? "🔓" : phase==="countingToSession" ? "⏳" : phase==="awaitingSession" ? "🕊️" : "🎉";
    const subtitle =
      needsCodeReveal ? "Successfully registered — save your code below." :
      phase==="beforeDeadline" ? "You're registered! Registration is still open." :
      phase==="awaitingSession" ? "Successfully registered — awaiting session." :
      phase==="countingToSession" ? "Session starts soon — hang tight." :
      "The session has started — enter your code to join the waiting room.";

    return (
      <div style={{minHeight:"100vh",position:"relative",fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
        <GlobalStyles/><IslamicBackground/>
        <div className="anim-slide-up glass-card" style={{position:"relative",zIndex:1,width:"100%",maxWidth:440,borderRadius:24,padding:"32px 24px",textAlign:"center"}}>
          <button onClick={()=>setView("list")} style={{background:"none",border:"none",color:"rgba(255,255,255,.4)",cursor:"pointer",marginBottom:16,fontSize:13,display:"flex",alignItems:"center",gap:6}}><ArrowLeft size={14}/> Back</button>
          <div style={{fontSize:44,marginBottom:8}}>{headline}</div>
          <h2 style={{fontFamily:"Cinzel,sans-serif",color:"#fff",fontSize:19,margin:"0 0 4px",fontWeight:700}}>{competition.title}</h2>
          <p style={{color:"rgba(255,255,255,.4)",fontSize:12,margin:"0 0 20px"}}>{subtitle}</p>

          <div style={{marginBottom:20}}>
            <Label>Your Name</Label>
            <div style={{color:"#fff",fontWeight:700,fontSize:16,marginBottom:10}}>{myParticipant.participant_name}</div>
            {myParticipant.assigned_juz && (
              <span style={{display:"inline-block",background:"rgba(74,222,128,.12)",border:"1px solid rgba(74,222,128,.3)",color:"#4ADE80",borderRadius:20,padding:"4px 12px",fontSize:12,fontWeight:700}}>
                📖 Juz {myParticipant.assigned_juz}
              </span>
            )}
          </div>

          {needsCodeReveal ? (
            /* First time: extra emphasis so they know to save it, but it stays visible after too now. */
            <div style={{marginBottom:20,background:"rgba(239,68,68,.06)",border:"1.5px solid rgba(239,68,68,.25)",borderRadius:16,padding:"18px 16px"}}>
              <div style={{color:RED,fontSize:11,fontWeight:800,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>⚠ Save This Now</div>
              <div onClick={(e:any)=>copyCode(myParticipant.access_code||"",e)} style={{cursor:"pointer",background:"rgba(201,168,76,.1)",border:"2px solid rgba(201,168,76,.4)",borderRadius:14,padding:"16px 20px",color:GOLD,fontSize:28,fontWeight:900,letterSpacing:8,marginBottom:10}}>
                {myParticipant.access_code}
              </div>
              <p style={{color:"rgba(255,255,255,.4)",fontSize:11,margin:"0 0 14px"}}>Tap to copy. Screenshot or write it down — you'll still be able to see it here while you wait for the session.</p>
              <button className="gold-btn" onClick={acknowledgeCode} disabled={ackingCode} style={{width:"100%",color:G,border:"none",borderRadius:14,padding:"14px",fontWeight:800,cursor:ackingCode?"not-allowed":"pointer",fontSize:15,fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:ackingCode?.7:1}}>
                {ackingCode?<Loader2 size={16} style={{animation:"spin 1s linear infinite"}}/>:<CheckCircle size={16}/>} Got it
              </button>
            </div>
          ) : phase!=="readyToEnter" && (
            /* Not their first visit, and not time to enter yet — still show the code so anyone
               who didn't copy it the first time isn't stuck waiting to contact the admin. */
            <div style={{marginBottom:20,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:14,padding:"14px 16px"}}>
              <div style={{color:"rgba(255,255,255,.35)",fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Your Code</div>
              <div onClick={(e:any)=>copyCode(myParticipant.access_code||"",e)} style={{cursor:"pointer",background:"rgba(201,168,76,.1)",border:"1.5px solid rgba(201,168,76,.35)",borderRadius:12,padding:"12px 16px",color:GOLD,fontSize:22,fontWeight:900,letterSpacing:6,marginBottom:8}}>
                {myParticipant.access_code}
              </div>
              <p style={{color:"rgba(255,255,255,.35)",fontSize:11,margin:0}}>Tap to copy. You'll enter this once the session starts.</p>
            </div>
          )}

          {!needsCodeReveal && phase==="beforeDeadline" && (
            <div>
              <Label>Registration Closes In</Label>
              <div style={{display:"flex",justifyContent:"center",gap:10,marginBottom:6}}>
                {[[rdd,"d"],[rhh,"h"],[rmm,"m"],[rss,"s"]].map(([v,u]:any)=>(
                  <div key={u} style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:12,padding:"10px 14px",minWidth:56}}>
                    <div style={{color:GOLD,fontWeight:900,fontSize:22,fontFamily:"Cinzel,serif"}}>{String(v).padStart(2,"0")}</div>
                    <div style={{color:"rgba(255,255,255,.35)",fontSize:10,textTransform:"uppercase"}}>{u}</div>
                  </div>
                ))}
              </div>
              <p style={{color:"rgba(255,255,255,.35)",fontSize:11,margin:0}}>Once registration closes you'll wait here for the admin to schedule the session.</p>
            </div>
          )}

          {!needsCodeReveal && phase==="awaitingSession" && (
            <div>
              <div style={{fontSize:28,marginBottom:6}}>🕊️</div>
              <p style={{color:"rgba(255,255,255,.4)",fontSize:12,margin:0}}>The admin hasn't scheduled the session yet. Come back once it's set — you'll see a countdown here.</p>
            </div>
          )}

          {!needsCodeReveal && phase==="countingToSession" && (
            <div>
              <Label>Session Starts In</Label>
              <div style={{display:"flex",justifyContent:"center",gap:10,marginBottom:6}}>
                {[[sdd,"d"],[shh,"h"],[smm,"m"],[sss,"s"]].map(([v,u]:any)=>(
                  <div key={u} style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:12,padding:"10px 14px",minWidth:56}}>
                    <div style={{color:GOLD,fontWeight:900,fontSize:22,fontFamily:"Cinzel,serif"}}>{String(v).padStart(2,"0")}</div>
                    <div style={{color:"rgba(255,255,255,.35)",fontSize:10,textTransform:"uppercase"}}>{u}</div>
                  </div>
                ))}
              </div>
              <p style={{color:"rgba(255,255,255,.35)",fontSize:11,margin:0}}>Come back once the countdown ends and enter your code.</p>
            </div>
          )}

          {!needsCodeReveal && phase==="readyToEnter" && (
            <div style={{marginTop:8}}>
              <p style={{color:"rgba(255,255,255,.3)",fontSize:11,margin:"0 0 10px"}}>Your code is <span style={{color:GOLD,fontWeight:800,letterSpacing:2}}>{myParticipant.access_code}</span> — tap below to copy, or type it in.</p>
              <Label>Enter Your Code</Label>
              <input value={accessCodeInput} onChange={e=>setAccessCodeInput(e.target.value.toUpperCase())} placeholder="CODE" maxLength={6}
                style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(201,168,76,.3)",borderRadius:14,padding:"14px 20px",color:"#fff",fontSize:22,fontWeight:800,letterSpacing:6,textAlign:"center",textTransform:"uppercase",marginBottom:14}}/>
              <button className="gold-btn" onClick={activateWithCode} disabled={loading} style={{width:"100%",color:G,border:"none",borderRadius:14,padding:"16px",fontWeight:800,cursor:loading?"not-allowed":"pointer",fontSize:16,fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:loading?.7:1}}>
                {loading?<Loader2 size={18} style={{animation:"spin 1s linear infinite"}}/>:<LogIn size={18}/>}{loading?"Entering...":"Enter Waiting Room"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }


  /* ── PREROOM (judges/admins land here after tapping a card — deadline countdown, full registrant list, then Enter Room) ── */
  if (view==="preroom" && competition) {
    const hasDeadline = !!competition.registration_deadline;
    const closed = !hasDeadline || (regCountdownMs !== null && regCountdownMs <= 0);
    const totalSecs = regCountdownMs !== null ? Math.floor(regCountdownMs/1000) : 0;
    const dd = Math.floor(totalSecs/86400), hh = Math.floor((totalSecs%86400)/3600), mm = Math.floor((totalSecs%3600)/60), ss = totalSecs%60;
    // Read-only session countdown for teachers/judges who aren't admins — they
    // shouldn't see (or be able to touch) the session-time setter below.
    const sesSecs = sessionCountdownMs !== null ? Math.floor(sessionCountdownMs/1000) : 0;
    const psdd = Math.floor(sesSecs/86400), pshh = Math.floor((sesSecs%86400)/3600), psmm = Math.floor((sesSecs%3600)/60), psss = sesSecs%60;
    return (
      <div style={{minHeight:"100vh",position:"relative",fontFamily:"Cairo,sans-serif",overflowY:"auto",paddingBottom:100}}>
        <GlobalStyles/><IslamicBackground/>
        <div style={{position:"relative",zIndex:1,padding:"16px 20px 0"}}>
          <button onClick={()=>setView("list")} style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",borderRadius:10,padding:"8px 14px",cursor:"pointer",color:"rgba(255,255,255,.6)",display:"flex",alignItems:"center",gap:6,fontSize:13,fontFamily:"Cairo,sans-serif"}}>
            <ArrowLeft size={14}/> Back
          </button>
        </div>

        <div style={{position:"relative",zIndex:1,maxWidth:520,margin:"0 auto",padding:"20px 16px 0"}}>
          <div className="glass-card anim-slide-up" style={{borderRadius:20,padding:"22px 20px",textAlign:"center",marginBottom:16}}>
            <h2 style={{fontFamily:"Cinzel,sans-serif",color:"#fff",fontSize:19,margin:"0 0 4px",fontWeight:700}}>{competition.title}</h2>
            <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:8,marginBottom:hasDeadline&&!closed?16:0}}>
              <span style={{color:GOLD,fontWeight:800,letterSpacing:2,fontSize:13}}>{competition.room_code}</span>
              <span style={{color:"rgba(255,255,255,.3)",fontSize:12}}>· {competition.total_stages} Stages</span>
            </div>
            {hasDeadline && !closed && (
              <div>
                <div style={{color:"rgba(255,255,255,.35)",fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>Registration Closes In</div>
                <div style={{display:"flex",justifyContent:"center",gap:8}}>
                  {[[dd,"d"],[hh,"h"],[mm,"m"],[ss,"s"]].map(([v,u]:any)=>(
                    <div key={u} style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:12,padding:"9px 12px",minWidth:48}}>
                      <div style={{color:GOLD,fontWeight:900,fontSize:18,fontFamily:"Cinzel,serif"}}>{String(v).padStart(2,"0")}</div>
                      <div style={{color:"rgba(255,255,255,.35)",fontSize:9,textTransform:"uppercase"}}>{u}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {hasDeadline && closed && (
              <div style={{color:RED,fontSize:12,fontWeight:700,marginTop:6}}>Registration closed</div>
            )}
          </div>

          {hasDeadline && isAdmin && (
            <div className="glass-card" style={{borderRadius:18,padding:"16px 18px",marginBottom:16}}>
              <div style={{color:"rgba(255,255,255,.4)",fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Session Start Time</div>
              {competition.session_start_at ? (
                <div style={{marginBottom:12}}>
                  <div style={{color:GOLD,fontWeight:800,fontSize:15,marginBottom:2}}>
                    {new Date(competition.session_start_at).toLocaleString("en",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}
                  </div>
                  <div style={{color: sessionStarted(competition) ? GREEN : "rgba(255,255,255,.35)", fontSize:11, fontWeight:700}}>
                    {sessionStarted(competition) ? "Session has started — the code gate is open" : "Countdown showing to registered participants"}
                  </div>
                </div>
              ) : (
                <p style={{color:"rgba(255,255,255,.35)",fontSize:12,margin:"0 0 12px"}}>Not set yet — registered participants are waiting, with no countdown shown, until you set this.</p>
              )}
              <div style={{display:"flex",gap:8}}>
                <input type="datetime-local" value={sessionTimeInput} onChange={e=>setSessionTimeInput(e.target.value)}
                  style={{flex:1,background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(201,168,76,.25)",borderRadius:12,padding:"10px 12px",color:"#fff",fontSize:13,colorScheme:"dark"}}/>
                <button onClick={setSessionStartTime} disabled={loading||!sessionTimeInput} style={{background:`linear-gradient(135deg,${GOLD},${GOLDD})`,color:G,border:"none",borderRadius:12,padding:"0 16px",cursor:loading||!sessionTimeInput?"not-allowed":"pointer",fontWeight:800,fontSize:13,fontFamily:"Cairo,sans-serif",opacity:loading||!sessionTimeInput?.6:1}}>
                  {competition.session_start_at?"Update":"Set"}
                </button>
              </div>
            </div>
          )}

          {/* Teacher/judge (non-admin) view: read-only countdown to the session — no
              ability to set or edit the time, just watch it and wait for the code gate. */}
          {hasDeadline && !isAdmin && (
            <div className="glass-card" style={{borderRadius:18,padding:"16px 18px",marginBottom:16,textAlign:"center"}}>
              <div style={{color:"rgba(255,255,255,.4)",fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>Session Start Time</div>
              {!competition.session_start_at ? (
                <p style={{color:"rgba(255,255,255,.35)",fontSize:12,margin:0}}>The admin hasn't scheduled the session yet. Come back once it's set — you'll see a countdown here.</p>
              ) : sessionStarted(competition) ? (
                <div style={{color:GREEN,fontSize:13,fontWeight:800}}>🔓 Session has started — you're good to enter</div>
              ) : (
                <div>
                  <div style={{color:"rgba(255,255,255,.5)",fontSize:12,marginBottom:8}}>
                    {new Date(competition.session_start_at).toLocaleString("en",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}
                  </div>
                  <div style={{display:"flex",justifyContent:"center",gap:8}}>
                    {[[psdd,"d"],[pshh,"h"],[psmm,"m"],[psss,"s"]].map(([v,u]:any)=>(
                      <div key={u} style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:12,padding:"9px 12px",minWidth:48}}>
                        <div style={{color:GOLD,fontWeight:900,fontSize:18,fontFamily:"Cinzel,serif"}}>{String(v).padStart(2,"0")}</div>
                        <div style={{color:"rgba(255,255,255,.35)",fontSize:9,textTransform:"uppercase"}}>{u}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="glass-card" style={{borderRadius:18,padding:"16px 18px",marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{color:"rgba(255,255,255,.4)",fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>Registered Participants</div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{background:"rgba(201,168,76,.15)",border:"1px solid rgba(201,168,76,.3)",color:GOLD,borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:800}}>{participants.length}</span>
                {isAdmin && participants.some(p=>p.status==="pending") && (
                  admissionsLocked(competition) ? (
                    <span style={{color:"rgba(255,255,255,.35)",fontSize:10,fontWeight:700}}>🔒 Admits after deadline</span>
                  ) : (
                    <button onClick={admitAllPending} style={{background:"rgba(34,197,94,.15)",border:"1px solid rgba(34,197,94,.4)",color:GREEN,borderRadius:9,padding:"5px 10px",cursor:"pointer",fontWeight:700,fontSize:11,fontFamily:"Cairo,sans-serif"}}>Admit All</button>
                  )
                )}
              </div>
            </div>
            {participants.length===0 ? (
              <p style={{color:"rgba(255,255,255,.3)",fontSize:12,textAlign:"center",padding:"16px 0",margin:0}}>No one has registered yet</p>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:340,overflowY:"auto"}}>
                {participants.map(p=>(
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:12,padding:"9px 12px"}}>
                    <div style={{width:32,height:32,borderRadius:9,background:"rgba(201,168,76,.15)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:GOLD,fontWeight:800,fontSize:13}}>
                      {p.participant_name?.[0]?.toUpperCase()||"?"}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:"#fff",fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.participant_name}</div>
                      {p.assigned_juz&&<div style={{color:"rgba(255,255,255,.35)",fontSize:10}}>Juz {p.assigned_juz}</div>}
                    </div>
                    <span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20,background:p.status==="completed"?"rgba(96,165,250,.15)":p.status==="pending"?"rgba(255,255,255,.08)":`${GREEN}22`,color:p.status==="completed"?"#60a5fa":p.status==="pending"?"rgba(255,255,255,.4)":GREEN}}>
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setView("leaderboard")} style={{flex:1,background:"rgba(255,255,255,.07)",color:"#fff",border:"1.5px solid rgba(201,168,76,.3)",borderRadius:14,padding:"14px 0",fontWeight:700,cursor:"pointer",fontSize:14,fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <Award size={16}/> Leaderboard
            </button>
            <button className="gold-btn" onClick={()=>setView("role_select")} style={{flex:2,color:G,border:"none",borderRadius:14,padding:"16px",fontWeight:800,cursor:"pointer",fontSize:16,fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <LogIn size={18}/> Enter Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── STANDALONE SETTINGS PAGE (gear icon on a card — same live Q-settings state as the old in-arena drawer, now a full page) ── */
  if (view==="settings" && competition) {
    return (
      <div style={{minHeight:"100vh",position:"relative",fontFamily:"Cairo,sans-serif",overflowY:"auto",paddingBottom:100}}>
        <GlobalStyles/><IslamicBackground/>
        <div style={{position:"relative",zIndex:1,padding:"16px 20px 0"}}>
          <button onClick={()=>setView("list")} style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",borderRadius:10,padding:"8px 14px",cursor:"pointer",color:"rgba(255,255,255,.6)",display:"flex",alignItems:"center",gap:6,fontSize:13,fontFamily:"Cairo,sans-serif"}}>
            <ArrowLeft size={14}/> Back
          </button>
        </div>

        <div style={{position:"relative",zIndex:1,maxWidth:520,margin:"0 auto",padding:"18px 16px 0"}}>
          <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:16}}>
            <div style={{width:36,height:36,borderRadius:10,background:`linear-gradient(135deg,${GOLD},${GOLDD})`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Wand2 size={16} color={G}/></div>
            <div>
              <div style={{color:"#fff",fontWeight:800,fontSize:16}}>Question Settings</div>
              <div style={{color:"rgba(255,255,255,.35)",fontSize:11}}>{competition.title} — set questions & instructions per stage</div>
            </div>
          </div>

          {/* ── Judge codes — generate as many seats as you need, one per judge ── */}
          <div className="glass-card" style={{borderRadius:16,padding:"14px 16px",marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:7}}>
                <Users size={13} color={GOLD}/>
                <div style={{color:GOLD,fontWeight:800,fontSize:12,letterSpacing:.5}}>Judge Codes ({judgeCodes.length} seat{judgeCodes.length===1?"":"s"})</div>
              </div>
              <button onClick={addJudgeCode} style={{background:"rgba(201,168,76,.15)",border:"1px solid rgba(201,168,76,.4)",borderRadius:8,padding:"5px 10px",cursor:"pointer",color:GOLD,fontWeight:700,fontSize:11,display:"flex",alignItems:"center",gap:4,fontFamily:"Cairo,sans-serif"}}>
                <Plus size={12}/> Add code
              </button>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {judgeCodes.map((code,i)=>(
                <div key={code} style={{position:"relative",flex:"1 1 90px",minWidth:90}}>
                  <button onClick={(e:any)=>copyCode(code,e)} style={{width:"100%",background:"rgba(201,168,76,.1)",border:"1.5px solid rgba(201,168,76,.35)",borderRadius:11,padding:"10px 8px",cursor:"pointer",textAlign:"center"}}>
                    <div style={{color:"rgba(255,255,255,.35)",fontSize:9,marginBottom:3}}>Judge {i+1}</div>
                    <div style={{color:GOLD,fontWeight:900,letterSpacing:3,fontSize:15}}>{code}</div>
                  </button>
                  {judgeCodes.length>1 && (
                    <button onClick={()=>removeJudgeCode(code)} aria-label="Remove judge code" style={{position:"absolute",top:-6,right:-6,width:18,height:18,borderRadius:"50%",background:"#EF4444",border:"none",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,lineHeight:1}}>×</button>
                  )}
                </div>
              ))}
            </div>
            <div style={{color:"rgba(255,255,255,.3)",fontSize:10,marginTop:8,lineHeight:1.6}}>Give one code to each judge — tap a code to copy, or add more codes if more teachers are judging. A judge claims a seat by entering it the first time they open this competition.</div>
          </div>

          {/* ── Scoring configuration — how much each error/wrong answer costs ── */}
          <div className="glass-card" style={{borderRadius:16,padding:"14px 16px",marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:10}}>
              <Award size={13} color={GOLD}/>
              <div style={{color:GOLD,fontWeight:800,fontSize:12,letterSpacing:.5}}>Scoring Configuration</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              {([
                ["minor_error","Minor Error","yellow bell"],
                ["major_error","Major Error","red bell"],
                ["wrong_answer","Wrong Answer","tajweed/waqf"],
              ] as const).map(([key,label,hint])=>(
                <div key={key}>
                  <div style={{color:"rgba(255,255,255,.4)",fontSize:9,marginBottom:3}}>{label}</div>
                  <input type="number" min={0} step={key==="wrong_answer"?1:0.5}
                    value={scoringConfig[key]}
                    onChange={e=>setScoringConfig(c=>({...c,[key]:Number(e.target.value)||0}))}
                    style={{width:"100%",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",borderRadius:7,padding:"7px 8px",color:"#fff",fontSize:14,textAlign:"center"}}/>
                  <div style={{color:"rgba(255,255,255,.25)",fontSize:9,marginTop:3,textAlign:"center"}}>{hint}</div>
                </div>
              ))}
            </div>
            <div style={{color:"rgba(255,255,255,.3)",fontSize:10,marginTop:8,lineHeight:1.6}}>Points deducted per tap during recitation stages, and per wrong answer on Tajweed/Waqf stages. Saved with the rest of these settings below.</div>
          </div>

          <div style={{display:"flex",padding:"0 0 4px",gap:7}}>
            {([["manual","📝 Questions"],["ai","✨ AI Generate"]] as const).map(([t,l])=>(
              <button key={t} onClick={()=>setQSettingsTab(t)} style={{flex:1,background:qSettingsTab===t?"rgba(201,168,76,.2)":"rgba(255,255,255,.04)",border:qSettingsTab===t?"1px solid rgba(201,168,76,.4)":"1px solid rgba(255,255,255,.1)",borderRadius:9,padding:"9px 0",color:qSettingsTab===t?GOLD:"rgba(255,255,255,.4)",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"Cairo,sans-serif",transition:"all .2s"}}>{l}</button>
            ))}
          </div>

          {qSettingsTab==="manual"&&(
            <div style={{padding:"14px 0 4px"}}>
              <div style={{color:"rgba(255,255,255,.4)",fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:5}}>Editing Stage</div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {Array.from({length:competition.total_stages},(_,i)=>{
                  const s=i+1;
                  const hasQ=(stageQuestions[String(s)]||"").trim().length>0;
                  const isCurrent=s===competition.current_stage;
                  return(
                    <button key={s} onClick={()=>setQSettingsStage(s)}
                      style={{background:qSettingsStage===s?`${GOLD}22`:"rgba(255,255,255,.04)",border:`1.5px solid ${qSettingsStage===s?GOLD:hasQ?"rgba(34,197,94,.4)":"rgba(255,255,255,.12)"}`,borderRadius:9,padding:"5px 12px",cursor:"pointer",color:qSettingsStage===s?GOLD:hasQ?GREEN:"rgba(255,255,255,.45)",fontWeight:700,fontSize:12,fontFamily:"Cairo,sans-serif",position:"relative",display:"flex",alignItems:"center",gap:4}}>
                      S{s}{isCurrent&&<span style={{fontSize:8,background:`${GOLD}33`,color:GOLD,borderRadius:4,padding:"1px 4px",lineHeight:1.3}}>NOW</span>}
                      {hasQ&&<span style={{width:5,height:5,borderRadius:"50%",background:GREEN,flexShrink:0}}/>}
                    </button>
                  );
                })}
              </div>
              <div style={{marginTop:10}}>
                <div style={{color:"rgba(255,255,255,.4)",fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:5}}>Stage {qSettingsStage} Type</div>
                <div style={{display:"flex",gap:6}}>
                  {(["recitation","tajweed","waqf"] as const).map(t=>(
                    <button key={t} onClick={()=>setStageTypes(s=>({...s,[String(qSettingsStage)]:t}))} style={{flex:1,background:(stageTypes[String(qSettingsStage)]||"recitation")===t?`${GOLD}22`:"rgba(255,255,255,.04)",border:`1.5px solid ${(stageTypes[String(qSettingsStage)]||"recitation")===t?GOLD:"rgba(255,255,255,.12)"}`,borderRadius:9,padding:"7px 0",cursor:"pointer",color:(stageTypes[String(qSettingsStage)]||"recitation")===t?GOLD:"rgba(255,255,255,.45)",fontWeight:700,fontSize:11,fontFamily:"Cairo,sans-serif",textTransform:"capitalize"}}>
                      {t==="recitation"?"🎙️ Recitation":t==="tajweed"?"📖 Tajweed":"⏸️ Waqf"}
                    </button>
                  ))}
                </div>
                <div style={{color:"rgba(255,255,255,.3)",fontSize:10,marginTop:6,lineHeight:1.5}}>
                  {(stageTypes[String(qSettingsStage)]||"recitation")==="recitation"
                    ? "Reciter picks a tile and recites — scored /100 with live error deduction."
                    : "The questions below become correct/wrong checks the judge marks live, each wrong answer deducting the configured penalty."}
                </div>
              </div>
            </div>
          )}

          <div style={{padding:"10px 0 0"}}>
            {qSettingsTab==="manual"&&(
              <>
                <div style={{background:"rgba(34,197,94,.07)",border:"1px solid rgba(34,197,94,.25)",borderRadius:12,padding:"10px 13px",marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                    <Shuffle size={13} color={GREEN} style={{flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <div style={{color:GREEN,fontWeight:700,fontSize:12}}>Fill Stage {qSettingsStage} from Quran scope</div>
                      <div style={{color:"rgba(255,255,255,.35)",fontSize:10,marginTop:1}}>
                        {(stageTypes[String(qSettingsStage)]||"recitation")==="recitation"
                          ? `Picks unique verses from ${competition.scope_type}. No AI needed.`
                          : `Generates template ${stageTypes[String(qSettingsStage)]} questions from ${competition.scope_type} — review before saving.`}
                      </div>
                    </div>
                    <button onClick={()=>autoFillStage(qSettingsStage, autoFillGuide)}
                      style={{background:"rgba(34,197,94,.15)",border:"1px solid rgba(34,197,94,.35)",borderRadius:9,padding:"6px 11px",cursor:"pointer",color:GREEN,fontWeight:700,fontSize:12,fontFamily:"Cairo,sans-serif",flexShrink:0,whiteSpace:"nowrap"}}>
                      Auto-fill
                    </button>
                  </div>
                  <input value={autoFillGuide} onChange={e=>setAutoFillGuide(e.target.value)}
                    placeholder="Optional: guide with a surah name (e.g. \"Fatiha\") — leave blank for any surah in scope"
                    style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",borderRadius:8,padding:"7px 10px",color:"#fff",fontSize:11,fontFamily:"Cairo,sans-serif"}}/>
                </div>
                <div style={{color:"rgba(255,255,255,.45)",fontSize:11,marginBottom:6,lineHeight:1.6}}>
                  <strong style={{color:GOLD}}>Stage {qSettingsStage} questions</strong> — one per line.{" "}
                  <span style={{color:"rgba(255,255,255,.3)"}}>Leave empty to use random Quran passages.</span>
                </div>
                <textarea
                  value={stageQuestions[String(qSettingsStage)]||""}
                  onChange={e=>setStageQuestions(sq=>({...sq,[String(qSettingsStage)]:e.target.value}))}
                  placeholder={"Al-Fatiha full\nAl-Baqarah 1-5\nSurah Al-Ikhlas complete\n..."}
                  rows={7}
                  style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(201,168,76,.25)",borderRadius:11,padding:"11px 13px",color:"#fff",fontSize:13,fontFamily:"Cairo,sans-serif",resize:"vertical",lineHeight:1.7,boxSizing:"border-box"}}
                />
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{color:"rgba(255,255,255,.3)",fontSize:10,marginTop:3}}>
                    {(stageQuestions[String(qSettingsStage)]||"").split("\n").filter(s=>s.trim()).length} questions for Stage {qSettingsStage}
                    {(stageQuestions[String(qSettingsStage)]||"").includes("§") &&
                      <span style={{color:GREEN,marginLeft:5}}>· verse text enabled ✓</span>}
                  </div>
                  <button onClick={()=>setStageQuestions(sq=>({...sq,[String(qSettingsStage)]:""}))}
                    style={{background:"none",border:"none",color:"rgba(239,68,68,.5)",fontSize:10,cursor:"pointer",fontFamily:"Cairo,sans-serif",padding:0}}>
                    Clear Stage {qSettingsStage}
                  </button>
                </div>

                <details style={{marginBottom:10}}>
                  <summary style={{color:"rgba(255,255,255,.35)",fontSize:11,cursor:"pointer",userSelect:"none",marginBottom:6}}>
                    📋 All-stages fallback list ({liveCustomQ.split("\n").filter(s=>s.trim()).length} entries)
                  </summary>
                  <div style={{color:"rgba(255,255,255,.35)",fontSize:10,marginBottom:4}}>Used only if a stage has no specific questions above.</div>
                  <textarea
                    value={liveCustomQ}
                    onChange={e=>setLiveCustomQ(e.target.value)}
                    placeholder={"Al-Fatiha full\nAl-Baqarah 1-5\n..."}
                    rows={4}
                    style={{width:"100%",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,padding:"9px 11px",color:"rgba(255,255,255,.7)",fontSize:12,fontFamily:"Cairo,sans-serif",resize:"vertical",lineHeight:1.6,boxSizing:"border-box"}}
                  />
                </details>

                <div style={{color:GOLD,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:5,display:"flex",alignItems:"center",gap:3}}><Eye size={10}/> Instructions for Participants</div>
                <textarea value={liveInstructions} onChange={e=>setLiveInstructions(e.target.value)} placeholder={"e.g. Recite with proper Tajweed rules. Begin with Bismillah."} rows={3} style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(201,168,76,.15)",borderRadius:11,padding:"9px 13px",color:"#fff",fontSize:13,fontFamily:"Cairo,sans-serif",resize:"vertical",lineHeight:1.7,boxSizing:"border-box",marginBottom:14}}/>
              </>
            )}
            {qSettingsTab==="ai"&&(
              <>
                <div style={{background:"rgba(201,168,76,.08)",border:"1px solid rgba(201,168,76,.2)",borderRadius:11,padding:"11px 13px",marginBottom:12,display:"flex",alignItems:"flex-start",gap:7}}>
                  <Sparkles size={13} color={GOLD} style={{flexShrink:0,marginTop:2}}/>
                  <div style={{color:"rgba(255,255,255,.6)",fontSize:12,lineHeight:1.7}}>
                    AI generates questions for <strong style={{color:GOLD}}>Stage {qSettingsStage}</strong>. They're added to that stage's list for review before saving.
                  </div>
                </div>
                <div style={{marginBottom:12}}>
                  <div style={{color:GOLD,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:5}}>Target Stage</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {Array.from({length:competition.total_stages},(_,i)=>{
                      const s=i+1;
                      return(
                        <button key={s} onClick={()=>setQSettingsStage(s)}
                          style={{background:qSettingsStage===s?`${GOLD}22`:"rgba(255,255,255,.04)",border:`1.5px solid ${qSettingsStage===s?GOLD:"rgba(255,255,255,.12)"}`,borderRadius:9,padding:"5px 12px",cursor:"pointer",color:qSettingsStage===s?GOLD:"rgba(255,255,255,.45)",fontWeight:700,fontSize:12,fontFamily:"Cairo,sans-serif"}}>
                          S{s}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div style={{marginBottom:11}}>
                  <div style={{color:GOLD,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:5}}>Prompt / Scope</div>
                  <textarea value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} placeholder={"e.g. Juz 30 short surahs for junior students"} rows={3} style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(201,168,76,.25)",borderRadius:11,padding:"11px 13px",color:"#fff",fontSize:13,fontFamily:"Cairo,sans-serif",resize:"none",lineHeight:1.7,boxSizing:"border-box"}}/>
                </div>
                <div style={{marginBottom:14}}>
                  <div style={{color:GOLD,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:5}}>Count</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {[5,8,10,12,15,20,25,30].map(n=>(
                      <button key={n} onClick={()=>setAiQCount(n)} style={{background:aiQCount===n?`${GOLD}22`:"rgba(255,255,255,.06)",border:`1.5px solid ${aiQCount===n?GOLD:"rgba(255,255,255,.15)"}`,borderRadius:8,padding:"5px 12px",cursor:"pointer",color:aiQCount===n?GOLD:"rgba(255,255,255,.55)",fontFamily:"Cairo,sans-serif",fontWeight:700,fontSize:12}}>{n}</button>
                    ))}
                  </div>
                </div>
                <button onClick={generateAIQuestions} disabled={aiGenLoading||!aiPrompt.trim()} style={{width:"100%",background:aiGenLoading||!aiPrompt.trim()?"rgba(255,255,255,.08)":`linear-gradient(135deg,${GOLD},${GOLDD})`,color:aiGenLoading||!aiPrompt.trim()?"rgba(255,255,255,.3)":G,border:"none",borderRadius:11,padding:"13px",cursor:aiGenLoading||!aiPrompt.trim()?"not-allowed":"pointer",fontWeight:800,fontSize:14,fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:7,marginBottom:14,transition:"all .2s"}}>
                  {aiGenLoading?<><Loader2 size={15} style={{animation:"spin 1s linear infinite"}}/> Generating…</>:<><Sparkles size={15}/> Generate {aiQCount} Questions for Stage {qSettingsStage}</>}
                </button>
              </>
            )}
          </div>

          <div style={{display:"flex",gap:8,paddingTop:6}}>
            <button onClick={()=>setView("list")} style={{flex:1,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:11,padding:"13px",cursor:"pointer",color:"rgba(255,255,255,.5)",fontWeight:700,fontSize:13,fontFamily:"Cairo,sans-serif"}}>Cancel</button>
            <button onClick={async()=>{await saveQSettings();setView("list");}} style={{flex:2,background:`linear-gradient(135deg,${GOLD},${GOLDD})`,border:"none",borderRadius:11,padding:"13px",cursor:"pointer",color:G,fontWeight:800,fontSize:13,fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
              <CheckCircle size={14}/> Save All Changes
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── JUDGE GATE (mandatory registration — a judge/admin must claim one of the 2 judge codes before entering the room) ── */
  if (view==="judge_gate" && competition) {
    return (
      <div style={{minHeight:"100vh",position:"relative",fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <GlobalStyles/><IslamicBackground/>
        <div className="anim-slide-up glass-card" style={{position:"relative",zIndex:1,width:"100%",maxWidth:420,borderRadius:24,padding:"32px 24px"}}>
          <button onClick={()=>setView("list")} style={{background:"none",border:"none",color:"rgba(255,255,255,.4)",cursor:"pointer",marginBottom:16,fontSize:13,display:"flex",alignItems:"center",gap:6}}><ArrowLeft size={14}/> Back</button>
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{fontSize:40,marginBottom:8}}>⚖️</div>
            <h2 style={{fontFamily:"Cinzel,sans-serif",color:"#fff",fontSize:18,margin:"0 0 4px",fontWeight:700}}>Judge Registration</h2>
            <p style={{color:"rgba(255,255,255,.4)",fontSize:12,margin:0}}>Enter your judge code for <strong style={{color:GOLD}}>{competition.title}</strong> — there are only 2 seats.</p>
          </div>
          <Label>Judge Code</Label>
          <input value={judgeCodeInput} onChange={e=>setJudgeCodeInput(e.target.value.toUpperCase())} placeholder="XXXXXX" maxLength={6}
            style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(201,168,76,.3)",borderRadius:14,padding:"14px 20px",color:"#fff",fontSize:20,fontWeight:800,letterSpacing:6,textAlign:"center",textTransform:"uppercase",marginBottom:16,boxSizing:"border-box"}}/>
          <button className="gold-btn" onClick={claimJudgeCode} disabled={loading||judgeCodeInput.trim().length<6} style={{width:"100%",color:G,border:"none",borderRadius:14,padding:"16px",fontWeight:800,cursor:loading?"not-allowed":"pointer",fontSize:15,fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:loading?.7:1}}>
            {loading?<Loader2 size={18} style={{animation:"spin 1s linear infinite"}}/>:<LogIn size={18}/>}{loading?"Registering...":"Claim Judge Seat"}
          </button>
        </div>
      </div>
    );
  }

  /* ── OBSERVER GATE (mandatory registration — view-only attendees must give a name before entering) ── */
  if (view==="observer_gate" && competition) {
    return (
      <div style={{minHeight:"100vh",position:"relative",fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <GlobalStyles/><IslamicBackground/>
        <div className="anim-slide-up glass-card" style={{position:"relative",zIndex:1,width:"100%",maxWidth:420,borderRadius:24,padding:"32px 24px"}}>
          <button onClick={()=>setView("role_select")} style={{background:"none",border:"none",color:"rgba(255,255,255,.4)",cursor:"pointer",marginBottom:16,fontSize:13,display:"flex",alignItems:"center",gap:6}}><ArrowLeft size={14}/> Back</button>
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{fontSize:40,marginBottom:8}}>👁️</div>
            <h2 style={{fontFamily:"Cinzel,sans-serif",color:"#fff",fontSize:18,margin:"0 0 4px",fontWeight:700}}>Watch & Follow</h2>
            <p style={{color:"rgba(255,255,255,.4)",fontSize:12,margin:0}}>Just your name — view-only access to <strong style={{color:GOLD}}>{competition.title}</strong>.</p>
          </div>
          <Label>Your Name</Label>
          <input value={observerNameInput} onChange={e=>setObserverNameInput(e.target.value)} placeholder="Full name"
            style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(201,168,76,.25)",borderRadius:12,padding:"12px 16px",color:"#fff",fontSize:15,marginBottom:16,boxSizing:"border-box"}}/>
          <button className="gold-btn" onClick={registerObserver} disabled={loading||!observerNameInput.trim()} style={{width:"100%",color:G,border:"none",borderRadius:14,padding:"16px",fontWeight:800,cursor:loading?"not-allowed":"pointer",fontSize:15,fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:loading?.7:1}}>
            {loading?<Loader2 size={18} style={{animation:"spin 1s linear infinite"}}/>:<LogIn size={18}/>}{loading?"Registering...":"Continue as Viewer"}
          </button>
        </div>
      </div>
    );
  }

  /* ── LEADERBOARD (live — averaged judge scores, viewable anytime, no reveal ceremony) ── */
  if (view==="leaderboard" && competition) {
    const sorted = rankedParticipants.filter(p=>p.role!=="judge"&&p.role!=="observer");
    const medals=["🥇","🥈","🥉"];
    const released = !!competition.results_reveal_active;
    const allRevealed = released && sorted.length>0 && sorted.every(p=>revealedIds.includes(p.id));

    // Non-judges get nothing at all until the admin releases it.
    if (!canJudge && !released) {
      return (
        <div style={{minHeight:"100vh",position:"relative",fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <GlobalStyles/><IslamicBackground/>
          <div className="anim-slide-up glass-card" style={{position:"relative",zIndex:1,width:"100%",maxWidth:380,borderRadius:22,padding:"36px 24px",textAlign:"center"}}>
            <button onClick={()=>setView("list")} style={{background:"none",border:"none",color:"rgba(255,255,255,.4)",cursor:"pointer",marginBottom:16,fontSize:13,display:"flex",alignItems:"center",gap:6}}><ArrowLeft size={14}/> Back</button>
            <div style={{fontSize:44,marginBottom:10}}>🔒</div>
            <h2 style={{fontFamily:"Cinzel,sans-serif",color:"#fff",fontSize:17,margin:"0 0 6px",fontWeight:700}}>Leaderboard Not Released Yet</h2>
            <p style={{color:"rgba(255,255,255,.4)",fontSize:12,margin:0,lineHeight:1.6}}>The judges will unveil results once every participant has been called.</p>
          </div>
        </div>
      );
    }

    return (
      <div style={{minHeight:"100vh",position:"relative",fontFamily:"Cairo,sans-serif",overflowY:"auto",paddingBottom:60}}>
        <GlobalStyles/><IslamicBackground/>

        {revealSpotlight && (
          <div style={{position:"fixed",inset:0,zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.82)",backdropFilter:"blur(6px)"}}>
            <div className="anim-slide-up" style={{textAlign:"center",padding:"32px 40px",background:"rgba(10,20,15,.9)",border:`1.5px solid ${GOLD}55`,borderRadius:24,boxShadow:"0 0 60px rgba(201,168,76,.25)"}}>
              <div style={{color:"rgba(255,255,255,.4)",fontSize:13,fontWeight:700,letterSpacing:2,marginBottom:6}}>IN POSITION</div>
              <div style={{fontSize:56,fontWeight:900,color:GOLD,fontFamily:"Cinzel,serif",lineHeight:1}}>#{revealSpotlight.rank}</div>
              <Avatar name={revealSpotlight.participant.participant_name} size={64} active/>
              <div style={{color:"#fff",fontWeight:800,fontSize:20,marginTop:10}}>{revealSpotlight.participant.participant_name}</div>
              <div style={{color:GREEN,fontWeight:900,fontSize:32,fontFamily:"Cinzel,serif",marginTop:6}}>{revealSpotlight.participant.total_score} pts</div>
            </div>
          </div>
        )}

        <div style={{position:"relative",zIndex:1,padding:"16px 20px 0"}}>
          <button onClick={()=>setView(canJudge?"preroom":"list")} style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",borderRadius:10,padding:"8px 14px",cursor:"pointer",color:"rgba(255,255,255,.6)",display:"flex",alignItems:"center",gap:6,fontSize:13,fontFamily:"Cairo,sans-serif"}}>
            <ArrowLeft size={14}/> Back
          </button>
        </div>
        <div style={{position:"relative",zIndex:1,maxWidth:600,margin:"0 auto",padding:"20px 16px 0"}}>
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{fontSize:44,marginBottom:6}}>🏆</div>
            <h1 style={{fontFamily:"Cinzel,serif",color:GOLD,fontSize:22,margin:"0 0 4px",fontWeight:700}}>Leaderboard</h1>
            <p style={{color:"rgba(255,255,255,.4)",margin:0,fontSize:12}}>
              {competition.title}
              {canJudge && !released && " · only judges can see this — release it once everyone's been called"}
              {released && !allRevealed && ` · ${sorted.filter(p=>revealedIds.includes(p.id)).length}/${sorted.length} revealed`}
            </p>
          </div>

          {/* ── Judge-only controls: release it, then unveil last place → first ── */}
          {canJudge && !released && (
            <div className="glass-card" style={{borderRadius:16,padding:14,marginBottom:20,textAlign:"center"}}>
              <p style={{color:"rgba(255,255,255,.45)",fontSize:12,margin:"0 0 10px"}}>You can see live scores below. Everyone else is locked out until you release it.</p>
              <button onClick={releaseLeaderboard} style={{width:"100%",background:`linear-gradient(135deg,${GOLD},${GOLDD})`,color:G,border:"none",borderRadius:11,padding:"12px",cursor:"pointer",fontWeight:900,fontFamily:"Cairo,sans-serif",fontSize:14}}>
                🔓 Release Leaderboard to Everyone
              </button>
            </div>
          )}
          {canJudge && released && !allRevealed && (
            <div className="glass-card" style={{borderRadius:16,padding:14,marginBottom:20}}>
              <div style={{color:GOLD,fontWeight:800,fontSize:13,marginBottom:10}}>🎺 Unveil Results</div>
              <button onClick={revealNextInOrder} disabled={revealBusy} style={{width:"100%",background:`linear-gradient(135deg,${GOLD},${GOLDD})`,color:G,border:"none",borderRadius:11,padding:"12px",cursor:revealBusy?"not-allowed":"pointer",fontWeight:900,fontFamily:"Cairo,sans-serif",fontSize:14,marginBottom:10,opacity:revealBusy?.6:1}}>
                Reveal Next (starts from last place)
              </button>
              <div style={{color:"rgba(255,255,255,.35)",fontSize:10,marginBottom:6}}>Or tap any rank to unveil it directly:</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
                {sorted.map((p,i)=>{
                  const rank=i+1; const done=revealedIds.includes(p.id);
                  return (
                    <button key={p.id} onClick={()=>revealParticipant(p.id)} disabled={done||revealBusy} style={{background:done?`${GREEN}18`:"rgba(255,255,255,.06)",border:`1px solid ${done?GREEN+"55":"rgba(255,255,255,.15)"}`,borderRadius:9,padding:"8px 4px",cursor:done?"default":"pointer",color:done?GREEN:"#fff",fontWeight:800,fontSize:12,opacity:revealBusy&&!done?.5:1}}>
                      {done?"✓":`#${rank}`}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="glass-card" style={{borderRadius:20,overflow:"hidden"}}>
            {sorted.length===0 ? (
              <p style={{color:"rgba(255,255,255,.3)",fontSize:13,textAlign:"center",padding:"30px 0",margin:0}}>No scores yet</p>
            ) : sorted.map((p,i)=>{
              // Judges always see real numbers. Everyone else only sees a row
              // once the judge has tapped reveal for that specific participant —
              // unrevealed rows stay blurred/locked, even after release.
              const unlocked = canJudge || revealedIds.includes(p.id);
              const stageCount = Object.keys(p.stage_scores||{}).length;
              const avg = stageCount>0 ? Math.round((p.total_score/stageCount)*10)/10 : 0;
              return (
                <div key={p.id} className={unlocked&&released?"anim-slide-up":undefined} style={{padding:"12px 20px",borderBottom:"1px solid rgba(255,255,255,.05)",display:"flex",alignItems:"center",gap:12,background:unlocked&&i<3?"rgba(201,168,76,.04)":"transparent",opacity:unlocked?1:.45,filter:unlocked?"none":"blur(3px)"}}>
                  <span style={{width:28,textAlign:"center",color:!unlocked?"rgba(255,255,255,.2)":i<3?GOLD:"rgba(255,255,255,.25)",fontWeight:800}}>{!unlocked?"🔒":i<3?medals[i]:`#${i+1}`}</span>
                  <Avatar name={p.participant_name} size={34} active={unlocked&&i===0}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:"#fff",fontWeight:600,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.participant_name}</div>
                    {p.school&&<div style={{color:"rgba(255,255,255,.3)",fontSize:11}}>{p.school}</div>}
                  </div>
                  {unlocked && (
                    <div style={{display:"flex",gap:4}}>
                      {Array.from({length:competition.total_stages},(_,si)=>(
                        <div key={si} style={{background:"rgba(255,255,255,.05)",borderRadius:6,padding:"2px 7px",textAlign:"center",fontSize:11}}>
                          <div style={{color:GOLD,fontWeight:700}}>{(p.stage_scores||{})[si+1]??"-"}</div>
                          <div style={{color:"rgba(255,255,255,.2)",fontSize:9}}>S{si+1}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{textAlign:"right",minWidth:64}}>
                    <div style={{color:unlocked?GOLD:"rgba(255,255,255,.2)",fontWeight:900,fontSize:18}}>{unlocked?p.total_score:"?"}</div>
                    {unlocked && <div style={{color:"rgba(255,255,255,.25)",fontSize:9}}>avg {avg}/stage</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (view==="role_select"&&competition) {
    const ROLES=canJudge
      ?[{id:"judge",icon:"⚖️",title:"Judge / Host",desc:"Control flow, call participants, reveal questions, ring bell, score recitations",color:GOLD},
        {id:"observer",icon:"👁️",title:"Watch & Follow",desc:"View live video, see participants, react to recitations",color:GREEN}]
      :[{id:"participant",icon:"🎙️",title:"Join as Participant",desc:"Recite when called by the judge",color:GOLD},
        {id:"observer",icon:"👁️",title:"Watch & Follow",desc:"Follow live, chat, react — view-only mode",color:GREEN}];
    return (
      <div style={{minHeight:"100vh",position:"relative",fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <GlobalStyles/><IslamicBackground/>
        <div className="anim-slide-up glass-card" style={{position:"relative",zIndex:1,width:"100%",maxWidth:440,borderRadius:24,padding:"32px 24px"}}>
          <button onClick={()=>setView("list")} style={{background:"none",border:"none",color:"rgba(255,255,255,.4)",cursor:"pointer",marginBottom:20,fontSize:13,display:"flex",alignItems:"center",gap:6}}><ArrowLeft size={14}/> Back</button>
          <div style={{textAlign:"center",marginBottom:28}}>
            <div style={{fontSize:48,marginBottom:12,animation:"floatUp 4s ease-in-out infinite"}}>🏆</div>
            <h2 style={{fontFamily:"Cinzel,sans-serif",color:"#fff",fontSize:20,margin:"0 0 6px",fontWeight:700}}>{competition.title}</h2>
            <span style={{color:GOLD,fontWeight:800,letterSpacing:2,fontSize:14}}>{competition.room_code}</span>
            <p style={{color:"rgba(255,255,255,.4)",fontSize:13,margin:"16px 0 0"}}>How do you want to join?</p>
          </div>
          {ROLES.map(r=>(
            <button key={r.id} onClick={()=>chooseRole(r.id)} style={{width:"100%",background:"rgba(255,255,255,.04)",border:`1.5px solid ${r.color}44`,borderRadius:16,padding:"18px 20px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:16,marginBottom:10,transition:"all .2s"}}>
              <div style={{fontSize:36,flexShrink:0}}>{r.icon}</div>
              <div>
                <div style={{color:r.color,fontWeight:800,fontSize:16}}>{r.title}</div>
                <div style={{color:"rgba(255,255,255,.4)",fontSize:12,marginTop:4,lineHeight:1.5}}>{r.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ── RESULTS ── */
  if (view==="results") {
    const sorted = rankedParticipants;
    const medals=["🥇","🥈","🥉"]; const pColors=[GOLD,"#aaa","#b87333"];
    const allRevealed = sorted.length>0 && sorted.every(p=>revealedIds.includes(p.id));
    const revealedSorted = sorted.filter(p=>revealedIds.includes(p.id));

    return (
      <div style={{minHeight:"100vh",position:"relative",fontFamily:"Cairo,sans-serif",overflowY:"auto",paddingBottom:60}}>
        <GlobalStyles/><IslamicBackground/>

        {/* ── Spotlight overlay — pops up when a rank is freshly announced ── */}
        {revealSpotlight && (
          <div style={{position:"fixed",inset:0,zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.82)",backdropFilter:"blur(6px)"}}>
            <div className="anim-slide-up" style={{textAlign:"center",padding:"32px 40px",background:"rgba(10,20,15,.9)",border:`1.5px solid ${GOLD}55`,borderRadius:24,boxShadow:"0 0 60px rgba(201,168,76,.25)"}}>
              <div style={{color:"rgba(255,255,255,.4)",fontSize:13,fontWeight:700,letterSpacing:2,marginBottom:6}}>IN POSITION</div>
              <div style={{fontSize:56,fontWeight:900,color:GOLD,fontFamily:"Cinzel,serif",lineHeight:1}}>#{revealSpotlight.rank}</div>
              <Avatar name={revealSpotlight.participant.participant_name} size={64} active/>
              <div style={{color:"#fff",fontWeight:800,fontSize:20,marginTop:10}}>{revealSpotlight.participant.participant_name}</div>
              <div style={{color:GREEN,fontWeight:900,fontSize:32,fontFamily:"Cinzel,serif",marginTop:6}}>{revealSpotlight.participant.total_score} pts</div>
            </div>
          </div>
        )}

        <div style={{position:"relative",zIndex:1,maxWidth:600,margin:"0 auto",padding:"40px 16px 0"}}>
          <div className="anim-slide-up" style={{textAlign:"center",marginBottom:24}}>
            <div style={{fontSize:64,marginBottom:8,animation:"floatUp 4s ease-in-out infinite"}}>🏆</div>
            <h1 style={{fontFamily:"Cinzel,serif",color:GOLD,fontSize:28,margin:"0 0 4px",fontWeight:700}}>Final Results</h1>
            <p style={{color:"rgba(255,255,255,.4)",margin:0,fontSize:13}}>{competition?.title} · {competition?.total_stages} Stages</p>
            {!allRevealed && <p style={{color:GOLD,margin:"8px 0 0",fontSize:12,fontWeight:700}}>🎙️ Results being announced — {revealedSorted.length}/{sorted.length} revealed</p>}
          </div>

          {/* ── Judge-only announce controls ── */}
          {isJudge && !allRevealed && (
            <div className="glass-card" style={{borderRadius:16,padding:14,marginBottom:24}}>
              <div style={{color:GOLD,fontWeight:800,fontSize:13,marginBottom:10}}>🎺 Announce Results</div>
              <button onClick={revealNextInOrder} disabled={revealBusy} style={{width:"100%",background:`linear-gradient(135deg,${GOLD},${GOLDD})`,color:G,border:"none",borderRadius:11,padding:"12px",cursor:revealBusy?"not-allowed":"pointer",fontWeight:900,fontFamily:"Cairo,sans-serif",fontSize:14,marginBottom:10,opacity:revealBusy?.6:1}}>
                Reveal Next (starts from last place)
              </button>
              <div style={{color:"rgba(255,255,255,.35)",fontSize:10,marginBottom:6}}>Or tap any rank to announce it directly:</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6}}>
                {sorted.map((p,i)=>{
                  const rank=i+1; const done=revealedIds.includes(p.id);
                  return (
                    <button key={p.id} onClick={()=>revealParticipant(p.id)} disabled={done||revealBusy} style={{background:done?`${GREEN}18`:"rgba(255,255,255,.06)",border:`1px solid ${done?GREEN+"55":"rgba(255,255,255,.15)"}`,borderRadius:9,padding:"8px 4px",cursor:done?"default":"pointer",color:done?GREEN:"#fff",fontWeight:800,fontSize:12,opacity:revealBusy&&!done?.5:1}}>
                      {done?"✓":`#${rank}`}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Podium — only once everyone has been announced ── */}
          {allRevealed && sorted.length>=1&&(
            <div style={{display:"flex",justifyContent:"center",gap:10,marginBottom:32,alignItems:"flex-end"}}>
              {[sorted[1],sorted[0],sorted[2]].filter(Boolean).map((p,i)=>{
                const rank=i===1?0:i===0?1:2; const hs=[140,180,110];
                return (
                  <div key={p.id} className={`stagger-${i+1}`} style={{flex:1,maxWidth:160,background:`rgba(${rank===0?"201,168,76":"255,255,255"},.06)`,border:`1.5px solid ${pColors[rank]}55`,borderRadius:20,padding:"16px 12px",textAlign:"center",height:hs[i],display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",boxShadow:rank===0?"0 0 40px rgba(201,168,76,.2)":"none"}}>
                    <div style={{fontSize:rank===0?36:28}}>{medals[rank]}</div>
                    <Avatar name={p.participant_name} size={rank===0?52:40} active={rank===0}/>
                    <div style={{color:"#fff",fontWeight:700,fontSize:13,marginTop:8}}>{p.participant_name}</div>
                    <div style={{color:pColors[rank],fontWeight:900,fontSize:rank===0?24:18,marginTop:4}}>{p.total_score}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Full leaderboard — revealed ranks show real scores, the rest stay locked ── */}
          <div className="glass-card" style={{borderRadius:20,overflow:"hidden",marginBottom:24}}>
            {sorted.map((p,i)=>{
              const done = revealedIds.includes(p.id);
              return (
                <div key={p.id} className={done?"anim-slide-up":undefined} style={{padding:"12px 20px",borderBottom:"1px solid rgba(255,255,255,.05)",display:"flex",alignItems:"center",gap:12,background:done&&i<3?"rgba(201,168,76,.04)":"transparent",opacity:done?1:.5}}>
                  <span style={{width:28,textAlign:"center",color:!done?"rgba(255,255,255,.2)":i<3?GOLD:"rgba(255,255,255,.25)",fontWeight:800}}>{!done?"🔒":i<3?medals[i]:`#${i+1}`}</span>
                  <Avatar name={p.participant_name} size={34} active={done&&i===0}/>
                  <div style={{flex:1,minWidth:0}}><div style={{color:"#fff",fontWeight:600,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.participant_name}</div>{p.school&&<div style={{color:"rgba(255,255,255,.3)",fontSize:11}}>{p.school}</div>}</div>
                  {done&&(
                    <div style={{display:"flex",gap:4}}>
                      {Array.from({length:competition?.total_stages||5},(_,si)=>(
                        <div key={si} style={{background:"rgba(255,255,255,.05)",borderRadius:6,padding:"2px 7px",textAlign:"center",fontSize:11}}>
                          <div style={{color:GOLD,fontWeight:700}}>{(p.stage_scores||{})[si+1]??"-"}</div>
                          <div style={{color:"rgba(255,255,255,.2)",fontSize:9}}>S{si+1}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{color:done?GOLD:"rgba(255,255,255,.2)",fontWeight:900,fontSize:18,minWidth:40,textAlign:"right"}}>{done?p.total_score:"?"}</div>
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",justifyContent:"center"}}>
            <button onClick={()=>setView("list")} style={{background:"rgba(255,255,255,.07)",color:"#fff",border:"1px solid rgba(255,255,255,.15)",borderRadius:12,padding:"12px 32px",cursor:"pointer",fontFamily:"Cairo,sans-serif",fontWeight:600,fontSize:14}}><ArrowLeft size={14} style={{marginRight:6,verticalAlign:"middle"}}/> Back to List</button>
          </div>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════
     ARENA VIEW
  ════════════════════════════════════════════════════════════════ */
  if (view!=="arena"||!competition) return null;

  /* ─ Full-bleed video hero ──────────────────────────────────────── */
  const videoHero = (showControls: boolean) => {
    // inner() renders the shared chrome (ornaments, LIVE badge) around content.
    // CameraControls is NOT included here — it uses useLocalParticipant() which
    // must only be called inside <LiveKitRoom>. It is added separately below.
    const inner = (children: React.ReactNode, withControls = false) => (
      <div style={{position:"relative",width:"100%",height:"100%",background:"#050f08",overflow:"hidden"}}>
        {children}
        {/* Islamic ornament corners */}
        <div style={{position:"absolute",top:0,left:0,fontSize:22,opacity:.18,color:GOLD,lineHeight:1,padding:4,pointerEvents:"none"}}>❁</div>
        <div style={{position:"absolute",top:0,right:0,fontSize:22,opacity:.18,color:GOLD,lineHeight:1,padding:4,pointerEvents:"none",transform:"scaleX(-1)"}}>❁</div>
        {/* Compact mic/cam overlay — always visible inside LiveKitRoom context */}
        {withControls&&(
          <div style={{position:"absolute",top:8,right:8,zIndex:5,pointerEvents:"auto"}}>
            <div style={{background:"rgba(0,0,0,.65)",backdropFilter:"blur(10px)",borderRadius:10,padding:"4px 6px",display:"flex",gap:4}}>
              <CameraControls isActive={!!iAmParticipantActive} isJudge={isJudge}/>
            </div>
          </div>
        )}
        {/* Live badge bottom left */}
        <div style={{position:"absolute",bottom:8,left:10,zIndex:5,display:"flex",alignItems:"center",gap:5,background:"rgba(0,0,0,.65)",backdropFilter:"blur(8px)",borderRadius:8,padding:"3px 9px",pointerEvents:"none"}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:RED,animation:"pulseRing 1.5s ease-in-out infinite"}}/>
          <span style={{color:"#fff",fontSize:10,fontWeight:700,letterSpacing:1}}>LIVE</span>
          {activeP&&<span style={{color:GOLD,fontSize:10,fontWeight:700}}>· {activeP.participant_name}</span>}
        </div>
      </div>
    );

    // Fallback: video disabled — no LiveKitRoom, no CameraControls
    if (videoDisabled) return inner(
      <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8}}>
        <div style={{fontSize:40,opacity:.15}}>﷽</div>
        <span style={{color:"rgba(255,255,255,.2)",fontSize:12}}>Live video not available</span>
      </div>
    );

    // Connected: LiveKitRoom wraps everything — pass withControls=true so
    // CameraControls renders safely inside the room context
    if (lkConnected && livekitToken && livekitUrl) return (
      <LiveKitRoom serverUrl={livekitUrl} token={livekitToken} connect={lkConnected} audio={true} video={true} options={LK_OPTIONS}>
        <RoomAudioRenderer/>
        <AudioEnabler onEnabled={()=>setAudioReady(true)}/>
        {inner(
          <LiveVideoGrid activeUserId={activeP?.user_id??null} isJudge={isJudge} isObserver={isObserver} allowControls={true} activePStatus={activeP?.status??null} pinnedUserId={pinnedUserId} onPin={setPinnedUserId}/>,
          true  // always show mic/cam controls to all connected users
        )}
      </LiveKitRoom>
    );

    // Fallback: loading / error — no LiveKitRoom, no CameraControls
    return inner(
      <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
        <div style={{fontSize:44,opacity:.12}}>﷽</div>
        {lkError?(
          <>
            <div style={{color:"rgba(255,255,255,.3)",fontSize:12,textAlign:"center"}}>Live video unavailable</div>
            <button onClick={()=>competition&&fetchLkToken(competition.room_code)} style={{background:`${GOLD}22`,color:GOLD,border:`1px solid ${GOLD}55`,borderRadius:10,padding:"6px 18px",cursor:"pointer",fontFamily:"Cairo,sans-serif",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:5}}>
              <RefreshCw size={12}/> Retry
            </button>
          </>
        ):(
          <><div style={{color:"rgba(255,255,255,.2)",fontSize:12}}>Connecting…</div><Loader2 size={20} color={GOLD} style={{opacity:.4,animation:"spin 1s linear infinite"}}/></>
        )}
      </div>
    );
  };


  return (
    <div style={{minHeight:"100vh",maxHeight:"100vh",display:"flex",flexDirection:"column",fontFamily:"Cairo,sans-serif",overflow:"hidden",position:"relative",background:"#050f08"}}>
      <GlobalStyles/><IslamicBackground/>
      <BellFlash visible={bellFlash} count={bellCount}/>
      <CountdownOverlay value={countdownValue}/>
      <StopFlash visible={stopFlash}/>

      {timerExpired && isJudge && activeP && (
        <TimerExpiredModal name={activeP.participant_name} onExtraTime={handleExtraTime} onStop={handleTimerStop}/>
      )}

      {/* Floating reactions */}
      <div style={{position:"fixed",inset:0,zIndex:9997,pointerEvents:"none",overflow:"hidden"}}>
        {floatReactions.map(r=>(
          <div key={r.id} style={{position:"absolute",bottom:90,left:`${r.x}%`,animation:"fadeSlideUp .4s ease both",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
            <div style={{fontSize:32,filter:"drop-shadow(0 2px 8px rgba(0,0,0,.6))",animation:"floatUp 3s ease-in-out both"}}>{r.emoji}</div>
            <div style={{color:"rgba(255,255,255,.6)",fontSize:10,background:"rgba(0,0,0,.5)",borderRadius:20,padding:"2px 8px",whiteSpace:"nowrap"}}>{r.name}</div>
          </div>
        ))}
      </div>

      {/* ══ HEADER (slim) ════════════════════════════════════════════ */}
      <div style={{position:"relative",zIndex:10,flexShrink:0,background:"rgba(4,12,6,.97)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(201,168,76,.18)",padding:"8px 12px",display:"flex",alignItems:"center",gap:8}}>
        <button onClick={()=>setView("list")} style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,padding:"5px 8px",cursor:"pointer",color:"rgba(255,255,255,.6)",display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
          <ArrowLeft size={13}/><span style={{fontSize:11}}>Back</span>
        </button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{color:"#fff",fontWeight:800,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:"Cinzel,serif",letterSpacing:.3}}>{competition.title}</div>
          <div style={{display:"flex",alignItems:"center",gap:5,marginTop:1,flexWrap:"nowrap"}}>
            <span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:20,background:competition.status==="active"?`${GREEN}22`:`${GOLD}22`,color:competition.status==="active"?GREEN:GOLD,border:`1px solid ${competition.status==="active"?GREEN:GOLD}`,letterSpacing:.5,flexShrink:0}}>
              {competition.status==="active"?"● LIVE":competition.status.toUpperCase()}
            </span>
            {/* Shows the current reciter's own stage progress (pickerStage), not a
                competition-wide stage — each participant runs through all stages
                in one sitting, so there's no single "stage" for the whole event. */}
            <span style={{color:"rgba(255,255,255,.3)",fontSize:10,flexShrink:0}}>S{pickerStage}/{competition.total_stages}</span>
            <div style={{display:"flex",gap:2,flexShrink:0}}>
              {Array.from({length:competition.total_stages},(_,i)=>(
                <div key={i} style={{width:11,height:11,borderRadius:"50%",background:i+1<pickerStage?GOLD:i+1===pickerStage?`${GOLD}55`:"rgba(255,255,255,.07)",border:`1px solid ${i+1<=pickerStage?GOLD:"rgba(255,255,255,.08)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:6,fontWeight:800,color:i+1<pickerStage?G:GOLD}}>
                  {i+1<pickerStage?"✓":""}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{background:"rgba(201,168,76,.1)",border:"1px solid rgba(201,168,76,.2)",borderRadius:7,padding:"3px 7px",flexShrink:0}}>
          <span style={{color:GOLD,fontSize:9,fontWeight:700}}>{isJudge?"⚖️ Judge":isObserver?"👁️ Observer":"🎙️ Me"}</span>
        </div>
        <button onClick={()=>setShowChat(c=>!c)} style={{background:showChat?`${GOLD}22`:"rgba(255,255,255,.06)",border:`1px solid ${showChat?GOLD:"rgba(255,255,255,.1)"}`,borderRadius:8,padding:"5px 7px",cursor:"pointer",color:showChat?GOLD:"rgba(255,255,255,.4)",flexShrink:0,position:"relative"}}>
          💬{chatMessages.length>0&&!showChat&&<span style={{position:"absolute",top:-4,right:-4,background:RED,borderRadius:"50%",width:12,height:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,color:"#fff",fontWeight:900}}>{chatMessages.length>9?"9+":chatMessages.length}</span>}
        </button>
      </div>

      {/* CHAT PANEL */}
      {showChat&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:30,height:"55vh",display:"flex",flexDirection:"column",background:"rgba(5,15,8,.97)",backdropFilter:"blur(24px)",borderTop:`1.5px solid ${GOLD}33`,borderRadius:"20px 20px 0 0",animation:"fadeSlideUp .3s ease"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,.07)",flexShrink:0}}>
            <span style={{color:GOLD,fontWeight:800,fontSize:14}}>💬 Live Chat</span>
            <div style={{display:"flex",gap:4,flex:1,overflowX:"auto"}}>
              {onlineUsers.slice(0,5).map((u,i)=>(
                <span key={i} style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",borderRadius:20,padding:"2px 8px",fontSize:11,color:"rgba(255,255,255,.55)",whiteSpace:"nowrap",flexShrink:0}}>
                  {u.role==="judge"?"⚖️":u.role==="participant"?"🎙️":"👁️"} {u.name}
                </span>
              ))}
            </div>
            <button onClick={()=>setShowChat(false)} style={{background:"none",border:"none",color:"rgba(255,255,255,.35)",cursor:"pointer",fontSize:20,padding:0,lineHeight:1,flexShrink:0}}>✕</button>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"10px 14px",display:"flex",flexDirection:"column",gap:8}}>
            {chatMessages.length===0
              ? <div style={{textAlign:"center",color:"rgba(255,255,255,.2)",fontSize:13,marginTop:24}}>No messages yet — say salam! 👋</div>
              : chatMessages.map(m=>(
                <div key={m.id} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                  <div style={{width:28,height:28,borderRadius:"50%",background:`linear-gradient(135deg,${GOLD}88,${GOLDD}88)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:G,flexShrink:0}}>{m.name[0]?.toUpperCase()}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"baseline",gap:6}}><span style={{color:GOLD,fontWeight:700,fontSize:12}}>{m.name}</span><span style={{color:"rgba(255,255,255,.2)",fontSize:10}}>{m.time}</span></div>
                    <div style={{color:"rgba(255,255,255,.8)",fontSize:13,marginTop:2,lineHeight:1.4,wordBreak:"break-word"}}>{m.text}</div>
                  </div>
                </div>
              ))}
          </div>
          <div style={{display:"flex",gap:8,padding:"10px 14px 14px",flexShrink:0,borderTop:"1px solid rgba(255,255,255,.07)"}}>
            <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendChat()} placeholder="Type a message..." style={{flex:1,background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.12)",borderRadius:12,padding:"10px 14px",color:"#fff",fontSize:14,fontFamily:"Cairo,sans-serif"}}/>
            <button onClick={sendChat} style={{background:`linear-gradient(135deg,${GOLD},${GOLDD})`,border:"none",borderRadius:12,padding:"10px 16px",cursor:"pointer",color:G,fontWeight:800,fontSize:14,fontFamily:"Cairo,sans-serif",flexShrink:0}}>Send</button>
          </div>
        </div>
      )}

      {/* ══ VIDEO HERO — takes 58% of viewport ════════════════════════ */}
      <div style={{flexShrink:0,height:"58vh",minHeight:260,maxHeight:460,position:"relative",borderBottom:`1px solid ${GOLD}1a`}}>
        {videoHero(true)}
        {!activeP&&(
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
            <div style={{color:GOLD,fontSize:26,opacity:.05,fontFamily:"Amiri,serif",letterSpacing:4}}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>
          </div>
        )}
      </div>

      {/* ══ ACTION BAR — immediately below video, always accessible.
          Also stays visible while awarding marks (showScorePanel) so a judge
          can still log an error they missed, or correct one, before submitting. ══ */}
      {isJudge && (activeP?.status==="reciting" || showScorePanel) && (
        <div style={{flexShrink:0,display:"grid",gridTemplateColumns:activeP?.status==="reciting"?"1fr 1fr 0.8fr":"1fr 1fr",gap:8,padding:"8px 12px",background:"rgba(4,12,6,.98)",borderBottom:"1px solid rgba(201,168,76,.08)"}}>
          <button onClick={()=>ringError("minor")} style={{background:"linear-gradient(135deg,#facc15,#eab308)",color:"#3f2d00",border:"none",borderRadius:12,padding:"13px 0",cursor:"pointer",fontWeight:900,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:6,boxShadow:"0 4px 20px rgba(250,204,21,.35)",position:"relative",userSelect:"none"}}>
            {minorCount>0&&<span style={{position:"absolute",top:5,right:7,background:RED,color:"#fff",borderRadius:"50%",width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:900}}>{minorCount}</span>}
            <Bell size={16} strokeWidth={2.5}/> Minor −{scoringConfig.minor_error}
          </button>
          <button onClick={()=>ringError("major")} style={{background:`linear-gradient(135deg,${RED},#dc2626)`,color:"#fff",border:"none",borderRadius:12,padding:"13px 0",cursor:"pointer",fontWeight:900,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:6,boxShadow:"0 4px 20px rgba(239,68,68,.35)",position:"relative",userSelect:"none"}}>
            {majorCount>0&&<span style={{position:"absolute",top:5,right:7,background:"#fff",color:RED,borderRadius:"50%",width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:900}}>{majorCount}</span>}
            <Bell size={16} strokeWidth={2.5}/> Major −{scoringConfig.major_error}
          </button>
          {activeP?.status==="reciting" && (
          <button onClick={signalStop} style={{background:"rgba(255,255,255,.1)",color:"#fff",border:"1px solid rgba(255,255,255,.2)",borderRadius:12,padding:"13px 0",cursor:"pointer",fontWeight:800,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:5,userSelect:"none"}}>
            <StopCircle size={15}/> Stop
          </button>
          )}
        </div>
      )}
      {isJudge && pickedTile && activeP && activeP.status!=="reciting" && activeP.status!=="completed" && (
        <div style={{flexShrink:0,padding:"8px 12px",background:"rgba(4,12,6,.98)",borderBottom:"1px solid rgba(34,197,94,.12)"}}>
          <button onClick={beginCountdown} disabled={countdownValue!==null} style={{width:"100%",background:`linear-gradient(135deg,${GREEN}dd,#16a34a)`,color:"#fff",border:"none",borderRadius:11,padding:"13px",cursor:countdownValue!==null?"not-allowed":"pointer",fontWeight:900,fontFamily:"Cairo,sans-serif",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 4px 20px rgba(34,197,94,.35)",animation:"recitingGlow 2s ease-in-out infinite",opacity:countdownValue!==null?.6:1}}>
            <Play size={18}/> {countdownValue!==null?`Starting in ${countdownValue}…`:`▶ Start Reciting — ${activeP?.participant_name}`}
          </button>
        </div>
      )}
      {/* Universal timer — shown to judge, active participant, waiting participants,
          and observers alike, so everyone sees the same countdown for the current stage. */}
      {activeP?.status==="reciting" && timerActive && (
        <div style={{flexShrink:0,padding:"7px 12px",background:"rgba(4,12,6,.98)",borderBottom:"1px solid rgba(34,197,94,.12)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:5,minWidth:0}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:GREEN,animation:"pulseRing 1s ease-in-out infinite",flexShrink:0}}/>
            <span style={{color:GREEN,fontWeight:800,fontSize:12,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
              {isJudge||isObserver ? `${activeP.participant_name} RECITING` : "NOW RECITING"}
            </span>
          </div>
          <div style={{color:timerDanger?RED:timerWarning?GOLD:GREEN,fontWeight:900,fontSize:20,fontFamily:"Cinzel,serif",flexShrink:0}}>{fmt(timerSecs)}</div>
          {bellCount>0&&<div style={{color:RED,fontSize:11,fontWeight:700,flexShrink:0}}>🔔×{bellCount}</div>}
        </div>
      )}

      {/* ══ SCROLLABLE CONTENT — remaining space ══════════════════════ */}
      <div style={{flex:1,overflowY:"auto",position:"relative",zIndex:1}}>

        {/* ── OBSERVER ─────────────────────────────────────────────── */}
        {isObserver&&(
          <div style={{padding:"10px 12px 100px",display:"flex",flexDirection:"column",gap:8}}>
            {activeP&&(
              <div style={{background:"rgba(34,197,94,.07)",border:`1px solid ${GREEN}33`,borderRadius:11,padding:"9px 12px",display:"flex",alignItems:"center",gap:8}}>
                <Avatar name={activeP.participant_name} size={30} active={activeP.status==="reciting"} called={activeP.status==="called"}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:"#fff",fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeP.participant_name}</div>
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <span style={{color:STATUS_COLOR[activeP.status],fontSize:10,fontWeight:700}}>{STATUS_ICON[activeP.status]} {STATUS_LABEL[activeP.status]}</span>
                    {timerActive&&<span style={{color:timerDanger?RED:timerWarning?GOLD:GREEN,fontWeight:800,fontSize:11}}>{fmt(timerSecs)}</span>}
                    {bellCount>0&&<span style={{color:GOLD,fontSize:10}}>🔔×{bellCount}</span>}
                  </div>
                </div>
              </div>
            )}
            {pickedTile&&<QuestionDisplay tile={pickedTile} ayahText={ayahText} loadingAyah={loadingAyah} isParticipant={false} isObserver={true} instructions={liveInstructions||undefined}/>}
            {activeP&&(
              <div style={{display:"flex",alignItems:"center",gap:4,overflowX:"auto"}}>
                <span style={{color:"rgba(255,255,255,.3)",fontSize:10,flexShrink:0}}>React:</span>
                {REACTION_EMOJIS.map(e=><button key={e} onClick={()=>sendReaction(e)} style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,padding:"4px 8px",cursor:"pointer",fontSize:16,flexShrink:0}}>{e}</button>)}
              </div>
            )}
            <div style={{color:"rgba(255,255,255,.35)",fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",display:"flex",alignItems:"center",gap:4,marginTop:4}}><Users size={10} color={GOLD}/>{participants.length} Participants</div>
            {participants.map(p=>{
              const isActive=p.id===activeP?.id;
              return(
                <div key={p.id} style={{background:isActive?"rgba(34,197,94,.07)":"rgba(255,255,255,.02)",border:`1px solid ${isActive?`${GREEN}33`:"rgba(255,255,255,.06)"}`,borderRadius:9,padding:"7px 10px",display:"flex",alignItems:"center",gap:7}}>
                  <Avatar name={p.participant_name} size={26} active={isActive&&p.status==="reciting"} called={p.status==="called"}/>
                  <div style={{flex:1,minWidth:0}}><div style={{color:isActive?GOLD:"#fff",fontWeight:isActive?700:500,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.participant_name}</div></div>
                  <span style={{color:STATUS_COLOR[p.status],fontSize:10,fontWeight:700,flexShrink:0}}>{STATUS_ICON[p.status]}</span>
                  {p.total_score>0&&<span style={{color:GOLD,fontWeight:800,fontSize:11,flexShrink:0}}>{p.total_score}</span>}
                </div>
              );
            })}
          </div>
        )}

        {/* ── JUDGE ────────────────────────────────────────────────── */}
        {isJudge&&(
          <div style={{padding:"10px 12px 16px"}}>
            {activeP&&(
              <div style={{background:activeP.status==="reciting"?"rgba(34,197,94,.07)":"rgba(201,168,76,.07)",border:`1px solid ${activeP.status==="reciting"?`${GREEN}33`:`${GOLD}33`}`,borderRadius:11,padding:"9px 12px",display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
                <Avatar name={activeP.participant_name} size={30} active={activeP.status==="reciting"} called={activeP.status==="called"}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:"#fff",fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeP.participant_name}</div>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{color:STATUS_COLOR[activeP.status],fontSize:10,fontWeight:700}}>{STATUS_ICON[activeP.status]} {STATUS_LABEL[activeP.status]}</span>
                    {timerActive&&<span style={{color:timerDanger?RED:timerWarning?GOLD:GREEN,fontWeight:800,fontSize:12,display:"flex",alignItems:"center",gap:2}}><Clock size={9}/>{fmt(timerSecs)}</span>}
                    {bellCount>0&&<span style={{color:GOLD,fontSize:10}}>🔔×{bellCount} −{errorPenalty}pts</span>}
                  </div>
                  {/* Stage progress dots for current participant */}
                  <div style={{display:"flex",alignItems:"center",gap:4,marginTop:4}}>
                    <span style={{color:"rgba(255,255,255,.3)",fontSize:9}}>Stage:</span>
                    {Array.from({length:competition.total_stages},(_,i)=>{
                      const s=i+1;
                      const done=s<activeParticipantStage;
                      const current=s===activeParticipantStage;
                      return(
                        <div key={s} style={{width:16,height:16,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:800,background:done?GOLD:current?`${GOLD}55`:"rgba(255,255,255,.07)",border:`1px solid ${done||current?GOLD:"rgba(255,255,255,.12)"}`,color:done?G:current?GOLD:"rgba(255,255,255,.25)",flexShrink:0,transition:"all .3s"}}>
                          {done?"✓":s}
                        </div>
                      );
                    })}
                    <span style={{color:GOLD,fontWeight:800,fontSize:10}}>{activeParticipantStage}/{competition.total_stages}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div style={{display:"flex",gap:4,marginBottom:9,alignItems:"center"}}>
              <div style={{display:"flex",flex:1,background:"rgba(255,255,255,.04)",borderRadius:9,padding:2}}>
                {[["controls","⚙️ Controls"],["roster","👥 Roster"]].map(([tab,label])=>(
                  <button key={tab} onClick={()=>setJudgeTab(tab as any)} style={{flex:1,background:judgeTab===tab?"rgba(201,168,76,.18)":"transparent",border:judgeTab===tab?"1px solid rgba(201,168,76,.35)":"1px solid transparent",borderRadius:7,padding:"7px 0",color:judgeTab===tab?GOLD:"rgba(255,255,255,.35)",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"Cairo,sans-serif",transition:"all .2s"}}>{label}</button>
                ))}
              </div>
              <button onClick={()=>{ setQSettingsStage(competition.current_stage); setShowQSettings(true); }} style={{background:"rgba(201,168,76,.1)",border:"1px solid rgba(201,168,76,.25)",borderRadius:8,padding:"7px 9px",cursor:"pointer",color:GOLD,display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
                <Wand2 size={12}/><span style={{fontSize:10,fontWeight:700}}>Q</span>
              </button>
            </div>

            {judgeTab==="controls"&&(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {competition.status==="open"&&(
                  <button onClick={startCompetition} style={{background:`linear-gradient(135deg,${GREEN}dd,#16a34a)`,color:"#fff",border:"none",borderRadius:11,padding:"13px",cursor:"pointer",fontWeight:800,fontFamily:"Cairo,sans-serif",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:7,boxShadow:"0 4px 18px rgba(34,197,94,.3)"}}>
                    <Play size={16}/> Start Competition
                  </button>
                )}

                {competition.status==="active"&&!activeP&&(
                  <div style={{background:"rgba(201,168,76,.05)",border:"1px solid rgba(201,168,76,.12)",borderRadius:9,padding:"8px 11px"}}>
                    <div style={{color:GOLD,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:5,display:"flex",alignItems:"center",gap:3}}><Clock size={10}/> Timer per student</div>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {[60,90,120,180,300,600].map(sec=>(
                        <button key={sec} onClick={()=>setJudgeTimerDuration(sec)} style={{background:judgeTimerDuration===sec?`${GOLD}22`:"rgba(255,255,255,.05)",border:`1px solid ${judgeTimerDuration===sec?GOLD:"rgba(255,255,255,.12)"}`,borderRadius:7,padding:"4px 10px",cursor:"pointer",color:judgeTimerDuration===sec?GOLD:"rgba(255,255,255,.45)",fontFamily:"Cairo,sans-serif",fontWeight:700,fontSize:11}}>
                          {fmt(sec)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {competition.status==="active"&&!activeP&&waiting.length>0&&(
                  <div>
                    {/* Prominent call banner */}
                    <div style={{background:"rgba(201,168,76,.12)",border:"1.5px solid rgba(201,168,76,.4)",borderRadius:12,padding:"10px 13px",marginBottom:8,display:"flex",alignItems:"center",gap:8,animation:"recitingGlow 2s ease-in-out infinite"}}>
                      <PhoneCall size={16} color={GOLD}/>
                      <div>
                        <div style={{color:GOLD,fontWeight:800,fontSize:13}}>Call a Participant</div>
                        <div style={{color:"rgba(255,255,255,.4)",fontSize:10,marginTop:1}}>{waiting.length} waiting — tap a name below to call</div>
                      </div>
                    </div>
                    {waiting.slice(0,6).map(p=>{
                      const isOnline=onlineUsers.some(u=>u.name===p.participant_name||u.name===p.participant_name.split(" ")[0]);
                      return(
                        <button key={p.id} onClick={()=>callParticipant(p)} style={{width:"100%",background:`${GOLD}0e`,border:`1.5px solid ${GOLD}44`,borderRadius:11,padding:"11px 13px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,textAlign:"left",fontFamily:"Cairo,sans-serif",marginBottom:6,boxShadow:"0 2px 12px rgba(201,168,76,.1)",transition:"all .15s"}}>
                          <div style={{position:"relative",flexShrink:0}}>
                            <Avatar name={p.participant_name} size={34}/>
                            <div style={{position:"absolute",bottom:0,right:0,width:9,height:9,borderRadius:"50%",background:isOnline?GREEN:RED,border:"2px solid #050f08"}}/>
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{color:"#fff",fontWeight:700,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.participant_name}</div>
                            <span style={{color:isOnline?GREEN:"rgba(255,255,255,.3)",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",gap:2}}>{isOnline?<Wifi size={8}/>:<WifiOff size={8}/>}{isOnline?"Online · Ready":"Offline"}</span>
                          </div>
                          <div style={{background:`linear-gradient(135deg,${GOLD},${GOLDD})`,color:G,borderRadius:8,padding:"6px 12px",fontWeight:800,fontSize:12,flexShrink:0,display:"flex",alignItems:"center",gap:4}}><PhoneCall size={11}/> Call</div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Tile picker — collapsible */}
                {showTilePicker&&activeP&&stageTiles.length>0&&(
                  <div style={{background:"rgba(10,20,15,.95)",border:`1.5px solid ${GOLD}33`,borderRadius:12}}>
                    <button onClick={()=>setTilePickerCollapsed(c=>!c)} style={{width:"100%",background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:7,padding:"9px 11px",fontFamily:"Cairo,sans-serif"}}>
                      <span style={{fontSize:13}}>🎙️</span>
                      <div style={{flex:1,minWidth:0,textAlign:"left"}}>
                        <span style={{color:"rgba(255,255,255,.65)",fontSize:11}}><strong style={{color:GOLD}}>{activeP.participant_name}</strong> {pickedTile?`picked #${pickedTile.num}`:"is picking…"}</span>
                      </div>
                      {pickedTile&&<span style={{background:`${GOLD}22`,border:`1px solid ${GOLD}44`,borderRadius:5,padding:"2px 5px",color:GOLD,fontSize:9,fontWeight:700,flexShrink:0}}>#{pickedTile.num}</span>}
                      <span style={{color:"rgba(255,255,255,.3)",fontSize:13}}>{tilePickerCollapsed?"▾":"▴"}</span>
                    </button>
                    {!tilePickerCollapsed&&(
                      <div style={{padding:"0 9px 9px"}}>
                        <NumberTilePicker tiles={stageTiles} pickedNum={pickedTile?.num??null} onPick={()=>{}} canPick={false} stage={activeParticipantStage}/>
                      </div>
                    )}
                    {pickedTile&&(
                      <div style={{padding:"0 9px 9px"}}>
                        <QuestionDisplay tile={pickedTile} ayahText={ayahText} loadingAyah={loadingAyah} isParticipant={false} instructions={liveInstructions||undefined}/>
                        {activeP.status!=="reciting"&&activeP.status!=="completed"&&(
                          <button onClick={beginCountdown} disabled={countdownValue!==null} style={{width:"100%",marginTop:10,background:`linear-gradient(135deg,${GREEN}dd,#16a34a)`,color:"#fff",border:"none",borderRadius:11,padding:"14px",cursor:countdownValue!==null?"not-allowed":"pointer",fontWeight:900,fontFamily:"Cairo,sans-serif",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 4px 20px rgba(34,197,94,.35)",animation:"recitingGlow 2s ease-in-out infinite",opacity:countdownValue!==null?.6:1}}>
                            <Play size={18}/> {countdownValue!==null?`Starting in ${countdownValue}…`:`▶ Start Reciting — ${activeP.participant_name}`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {showScorePanel&&(
                  <div style={{background:"rgba(201,168,76,.06)",border:"1px solid rgba(201,168,76,.2)",borderRadius:12,padding:"13px"}}>
                    <div style={{color:GOLD,fontWeight:800,fontSize:13,marginBottom:4,display:"flex",alignItems:"center",gap:6}}>
                      📝 Stage {activeParticipantStage} Score — {activeP?.participant_name}
                      {activeP?.status==="reciting"&&<span style={{color:GREEN,fontSize:10,fontWeight:700,background:`${GREEN}22`,borderRadius:5,padding:"2px 6px"}}>● scoring live</span>}
                    </div>
                    {/* Split duties when more than one judge is present: one can just tap errors
                        while reciting, another finalizes and submits the score. */}
                    {presentJudges.length>1&&(
                      <div style={{display:"flex",gap:6,marginBottom:9}}>
                        {(["scorer","marker"] as const).map(r=>(
                          <button key={r} onClick={()=>setJudgeSubrole(r)} style={{flex:1,background:judgeSubrole===r?`${GOLD}22`:"rgba(255,255,255,.05)",border:`1px solid ${judgeSubrole===r?GOLD:"rgba(255,255,255,.12)"}`,borderRadius:8,padding:"6px 0",cursor:"pointer",color:judgeSubrole===r?GOLD:"rgba(255,255,255,.45)",fontWeight:700,fontSize:11,fontFamily:"Cairo,sans-serif"}}>
                            {r==="scorer"?"🖊️ I'm the Scorer":"🔔 I'm Marking Errors"}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Multi-judge status: who else in the room has already submitted */}
                    {presentJudges.length>1&&(
                      <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:9}}>
                        {presentJudges.map(j=>{
                          const scored = (judgeScores[currentAttempt?.id||""]||[]).some(r=>r.judge_user_id===j.user_id);
                          return <span key={j.user_id} style={{fontSize:10,fontWeight:700,borderRadius:6,padding:"3px 7px",color:scored?GREEN:"rgba(255,255,255,.4)",background:scored?`${GREEN}18`:"rgba(255,255,255,.05)",border:`1px solid ${scored?GREEN+"55":"rgba(255,255,255,.1)"}`}}>{scored?"✓":"…"} {j.name.split(" ")[0]}</span>;
                        })}
                      </div>
                    )}
                    {competition.use_criteria_scoring ? (
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:9}}>
                        {SCORING_CRITERIA.map(c=>(
                          <div key={c.key}>
                            <div style={{color:"rgba(255,255,255,.5)",fontSize:10,marginBottom:3,display:"flex",justifyContent:"space-between"}}><span>{c.label}/{c.labelAr}</span><span style={{color:GOLD}}>/{c.max}</span></div>
                            <input type="number" min={0} max={c.max} value={scoreBreak[c.key]} onChange={e=>setScoreBreak(s=>({...s,[c.key]:e.target.value}))} placeholder={`0–${c.max}`} style={{width:"100%",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",borderRadius:7,padding:"7px 9px",color:"#fff",fontSize:14}}/>
                          </div>
                        ))}
                      </div>
                    ) : currentStageType!=="recitation" ? (
                      <div style={{marginBottom:9}}>
                        <div style={{color:"rgba(255,255,255,.5)",fontSize:11,marginBottom:6,display:"flex",justifyContent:"space-between"}}>
                          <span>{currentStageType==="tajweed"?"Tajweed":"Waqf"} Questions — mark each</span>
                          <span style={{color:GOLD}}>−{scoringConfig.wrong_answer} per wrong</span>
                        </div>
                        {currentStageQuestions.length===0 ? (
                          <div style={{color:"rgba(255,255,255,.3)",fontSize:11,padding:"8px 0"}}>No questions configured for this stage yet — add some in Settings.</div>
                        ) : (
                          <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:6}}>
                            {currentStageQuestions.map((q,i)=>(
                              <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,.03)",borderRadius:8,padding:"7px 9px"}}>
                                <span style={{flex:1,minWidth:0,color:"#fff",fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{q}</span>
                                <button onClick={()=>setTajweedAnswers(a=>({...a,[i]:"correct"}))} style={{background:tajweedAnswers[i]==="correct"?`${GREEN}33`:"rgba(255,255,255,.06)",border:`1px solid ${tajweedAnswers[i]==="correct"?GREEN:"rgba(255,255,255,.15)"}`,borderRadius:6,padding:"5px 9px",cursor:"pointer",color:tajweedAnswers[i]==="correct"?GREEN:"rgba(255,255,255,.4)",fontSize:11,fontWeight:700,flexShrink:0}}>✓</button>
                                <button onClick={()=>setTajweedAnswers(a=>({...a,[i]:"wrong"}))} style={{background:tajweedAnswers[i]==="wrong"?`${RED}33`:"rgba(255,255,255,.06)",border:`1px solid ${tajweedAnswers[i]==="wrong"?RED:"rgba(255,255,255,.15)"}`,borderRadius:6,padding:"5px 9px",cursor:"pointer",color:tajweedAnswers[i]==="wrong"?RED:"rgba(255,255,255,.4)",fontSize:11,fontWeight:700,flexShrink:0}}>✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{color:"rgba(255,255,255,.5)",fontSize:11,marginBottom:3}}>Score /100 (auto — editable)</div>
                        <input type="number" min={0} max={100} value={scoreBreak.tajweed} onChange={e=>setScoreBreak(s=>({...s,tajweed:e.target.value}))} style={{width:"100%",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",borderRadius:7,padding:"9px",color:"#fff",fontSize:16}}/>
                      </div>
                    ):(
                      <div style={{marginBottom:9}}>
                        <div style={{color:"rgba(255,255,255,.5)",fontSize:11,marginBottom:3}}>Score /100 (auto — editable)</div>
                        <input type="number" min={0} max={100} value={scoreBreak.tajweed} onChange={e=>setScoreBreak(s=>({...s,tajweed:e.target.value}))} style={{width:"100%",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",borderRadius:7,padding:"9px",color:"#fff",fontSize:16}}/>
                      </div>
                    )}
                    <input value={judgeComment} onChange={e=>setJudgeComment(e.target.value)} placeholder="Judge's comment (optional)" style={{width:"100%",background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",borderRadius:7,padding:"7px 11px",color:"#fff",fontSize:12,marginBottom:9}}/>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9}}>
                      {bellCount>0&&<span style={{color:GOLD,fontSize:11}}>⚠️ −{errorPenalty} penalty</span>}
                      <span style={{color:GREEN,fontWeight:800,fontSize:14,marginLeft:"auto"}}>Your score: {finalScore}/100</span>
                    </div>
                    {judgeSubrole==="marker" ? (
                      <div style={{textAlign:"center",padding:"9px",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,color:"rgba(255,255,255,.4)",fontSize:12}}>
                        You're marking errors — the judge set as Scorer submits the final score.
                      </div>
                    ) : myScoreSubmitted ? (
                      <div style={{textAlign:"center",padding:"9px",background:`${GREEN}12`,border:`1px solid ${GREEN}33`,borderRadius:9,color:GREEN,fontWeight:700,fontSize:12}}>
                        ✓ Your score is in — waiting for {Math.max(0,presentJudges.filter(j=>j.user_id!==user?.id).length-(judgeScores[currentAttempt?.id||""]||[]).filter(r=>r.judge_user_id!==user?.id).length)} other judge(s)
                      </div>
                    ):(
                      <button onClick={submitMyJudgeScore} disabled={submittingScore} style={{width:"100%",background:submittingScore?`rgba(34,197,94,.4)`:`linear-gradient(135deg,${GREEN}dd,#16a34a)`,color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:submittingScore?"not-allowed":"pointer",fontWeight:800,fontFamily:"Cairo,sans-serif",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
                        {submittingScore?<><span style={{animation:"spin .8s linear infinite",display:"inline-block"}}>⏳</span> Saving…</>:<><CheckCircle size={13}/> Submit My Score</>}
                      </button>
                    )}
                    {myScoreSubmitted && presentJudges.length>1 && (judgeScores[currentAttempt?.id||""]||[]).length < presentJudges.length && (
                      <button onClick={forceFinalizeScore} style={{width:"100%",marginTop:7,background:"transparent",color:"rgba(255,255,255,.4)",border:"1px solid rgba(255,255,255,.15)",borderRadius:8,padding:"8px",cursor:"pointer",fontSize:11,fontFamily:"Cairo,sans-serif"}}>
                        Force finalize with scores submitted so far
                      </button>
                    )}
                  </div>
                )}

                {competition.status==="active"&&allDone&&(
                  <button onClick={advanceStage} style={{background:`linear-gradient(135deg,${GOLD},${GOLDD})`,color:"#fff",border:"none",borderRadius:11,padding:"13px",cursor:"pointer",fontWeight:800,fontFamily:"Cairo,sans-serif",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
                    <Trophy size={15}/> End & Show Results
                  </button>
                )}

                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                  {[["⏳",waiting.length,"Waiting"],["✅",done.length,"Done"],["👥",participants.length,"Total"]].map(([icon,n,label])=>(
                    <div key={label as string} style={{background:"rgba(255,255,255,.03)",borderRadius:9,padding:"8px 5px",textAlign:"center"}}>
                      <div style={{fontSize:13}}>{icon}</div><div style={{color:GOLD,fontWeight:800,fontSize:15}}>{n}</div><div style={{color:"rgba(255,255,255,.3)",fontSize:10}}>{label}</div>
                    </div>
                  ))}
                </div>

                <button onClick={()=>setView("results")} style={{background:"transparent",color:"rgba(255,255,255,.3)",border:"1px solid rgba(255,255,255,.08)",borderRadius:8,padding:"8px",cursor:"pointer",fontFamily:"Cairo,sans-serif",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",gap:3}}>
                  <Award size={11}/> View Live Standings
                </button>
                <button onClick={terminateSession} style={{background:"rgba(239,68,68,.07)",color:RED,border:`1px solid ${RED}33`,borderRadius:8,padding:"8px",cursor:"pointer",fontFamily:"Cairo,sans-serif",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:3}}>
                  <StopCircle size={11}/> End Session for All
                </button>
              </div>
            )}

            {judgeTab==="roster"&&(
              <div>
                {/* Registration status + manual close/reopen (deadline handles the rest automatically) */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.08)",borderRadius:9,padding:"8px 10px",marginBottom:9}}>
                  <div style={{minWidth:0}}>
                    <div style={{color:isRegistrationOpen(competition)?GREEN:RED,fontSize:11,fontWeight:800}}>
                      {isRegistrationOpen(competition)?"🟢 Registration Open":"🔴 Registration Closed"}
                    </div>
                    {competition.registration_deadline&&(
                      <div style={{color:"rgba(255,255,255,.3)",fontSize:9,marginTop:1}}>
                        Deadline: {new Date(competition.registration_deadline).toLocaleString("en",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}
                      </div>
                    )}
                  </div>
                  <button onClick={toggleRegistration} style={{flexShrink:0,background:isRegistrationOpen(competition)?"rgba(239,68,68,.12)":"rgba(34,197,94,.12)",color:isRegistrationOpen(competition)?RED:GREEN,border:`1px solid ${isRegistrationOpen(competition)?RED:GREEN}44`,borderRadius:8,padding:"6px 11px",cursor:"pointer",fontWeight:700,fontSize:11,fontFamily:"Cairo,sans-serif"}}>
                    {isRegistrationOpen(competition)?"Close":"Reopen"}
                  </button>
                </div>
                {/* Next Stage / End button shown here too so judge never has to hunt for it */}
                {competition.status==="active"&&allDone&&(
                  <button onClick={advanceStage} style={{width:"100%",marginBottom:10,background:`linear-gradient(135deg,${GOLD},${GOLDD})`,color:"#fff",border:"none",borderRadius:11,padding:"13px",cursor:"pointer",fontWeight:800,fontFamily:"Cairo,sans-serif",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
                    <Trophy size={15}/> End & Show Results
                  </button>
                )}
                {competition.status!=="active"&&waiting.length>=2&&(
                  <button onClick={competition.queue_reveal_active?finishQueueReveal:startQueueReveal} style={{width:"100%",marginBottom:10,background:"rgba(167,139,250,.12)",color:"#a78bfa",border:"1px solid rgba(167,139,250,.4)",borderRadius:11,padding:"11px",cursor:"pointer",fontWeight:800,fontFamily:"Cairo,sans-serif",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
                    <Shuffle size={14}/> {competition.queue_reveal_active?"Finish Queue Reveal":"Shuffle Queue Positions"}
                  </button>
                )}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7}}>
                  <span style={{color:"rgba(255,255,255,.4)",fontSize:11}}>{participants.filter(p=>p.status!=="pending").length} registered</span>
                  <div style={{display:"flex",gap:3}}>
                    {[["list",<List size={10}/>],["grid",<LayoutGrid size={10}/>]].map(([mode,icon])=>(
                      <button key={mode as string} onClick={()=>setRosterMode(mode as any)} style={{background:rosterMode===mode?`${GOLD}22`:"rgba(255,255,255,.04)",border:`1px solid ${rosterMode===mode?GOLD:"rgba(255,255,255,.09)"}`,borderRadius:6,padding:"4px 7px",cursor:"pointer",color:rosterMode===mode?GOLD:"rgba(255,255,255,.25)"}}>{icon}</button>
                    ))}
                  </div>
                </div>
                {participants.filter(p=>p.status==="pending").length>0&&(
                  <div style={{background:"rgba(167,139,250,.07)",border:"1px solid rgba(167,139,250,.2)",borderRadius:9,padding:"9px",marginBottom:7}}>
                    <div style={{color:"#a78bfa",fontSize:9,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>
                      ⏳ Awaiting Approval{admissionsLocked(competition)&&<span style={{color:"rgba(255,255,255,.35)",fontWeight:600,textTransform:"none",letterSpacing:0}}> · 🔒 opens once registration closes</span>}
                    </div>
                    {participants.filter(p=>p.status==="pending").map(p=>(
                      <div key={p.id} style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
                        <Avatar name={p.participant_name} size={26}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{color:"#fff",fontWeight:700,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.participant_name}</div>
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            {p.school&&<div style={{color:"rgba(255,255,255,.3)",fontSize:10}}>{p.school}</div>}
                            {p.assigned_juz&&<div style={{color:"#4ADE80",fontSize:10,fontWeight:700}}>Juz {p.assigned_juz}</div>}
                            {p.access_code&&<div style={{color:GOLD,fontSize:10,fontWeight:700,letterSpacing:1}}>Code: {p.access_code}</div>}
                          </div>
                        </div>
                        {!admissionsLocked(competition) && (
                          <button onClick={()=>approveParticipant(p)} style={{background:"rgba(34,197,94,.15)",color:GREEN,border:`1px solid ${GREEN}44`,borderRadius:7,padding:"4px 10px",cursor:"pointer",fontWeight:700,fontSize:11,flexShrink:0,fontFamily:"Cairo,sans-serif"}}>Admit</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {rosterMode==="list"
                  ? participants.filter(p=>p.status!=="pending").map(p=>{
                      const isActive=p.id===activeP?.id;
                      return(
                        <div key={p.id} style={{background:isActive?"rgba(201,168,76,.06)":"rgba(255,255,255,.02)",border:`1px solid ${isActive?`${GOLD}33`:"rgba(255,255,255,.05)"}`,borderRadius:8,padding:"7px 9px",display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                          <span style={{color:"rgba(255,255,255,.2)",fontSize:9,width:12,flexShrink:0}}>#{p.queue_position}</span>
                          <Avatar name={p.participant_name} size={24} active={isActive&&p.status==="reciting"} called={p.status==="called"}/>
                          <div style={{flex:1,minWidth:0}}><div style={{color:isActive?GOLD:"#fff",fontWeight:isActive?700:500,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.participant_name}</div></div>
                          <span style={{color:STATUS_COLOR[p.status],fontSize:9,fontWeight:700,flexShrink:0}}>{STATUS_ICON[p.status]}</span>
                          {p.total_score>0&&<span style={{color:GOLD,fontWeight:800,fontSize:11,flexShrink:0}}>{p.total_score}</span>}
                          {competition.status==="active"&&p.status==="waiting"&&!activeP&&(
                            <button onClick={()=>callParticipant(p)} style={{background:`${GOLD}18`,color:GOLD,border:`1px solid ${GOLD}44`,borderRadius:6,padding:"3px 7px",cursor:"pointer",fontWeight:700,fontSize:9,fontFamily:"Cairo,sans-serif",flexShrink:0}}>Call</button>
                          )}
                        </div>
                      );
                    })
                  : (
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5}}>
                      {participants.filter(p=>p.status!=="pending").map(p=>{
                        const isActive=p.id===activeP?.id;
                        return(
                          <div key={p.id} style={{background:isActive?`${GOLD}15`:"rgba(255,255,255,.03)",border:`1px solid ${isActive?GOLD:"rgba(255,255,255,.07)"}`,borderRadius:9,padding:"9px 5px",textAlign:"center"}}>
                            <Avatar name={p.participant_name} size={28} active={isActive&&p.status==="reciting"} called={p.status==="called"}/>
                            <div style={{color:isActive?GOLD:"#fff",fontWeight:700,fontSize:9,marginTop:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.participant_name}</div>
                            <div style={{color:STATUS_COLOR[p.status],fontSize:8,fontWeight:700,marginTop:2}}>{STATUS_ICON[p.status]}</div>
                            {p.total_score>0&&<div style={{color:GOLD,fontWeight:900,fontSize:12,marginTop:2}}>{p.total_score}</div>}
                            {competition.status==="active"&&p.status==="waiting"&&!activeP&&(
                              <button onClick={()=>callParticipant(p)} style={{width:"100%",marginTop:4,background:`${GOLD}18`,color:GOLD,border:`1px solid ${GOLD}44`,borderRadius:6,padding:"3px 0",cursor:"pointer",fontWeight:700,fontSize:8,fontFamily:"Cairo,sans-serif"}}>Call</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )
                }
              </div>
            )}
          </div>
        )}

        {/* ── PARTICIPANT ───────────────────────────────────────────── */}
        {!isJudge&&!isObserver&&myParticipant&&(
          <div style={{padding:"10px 12px 16px"}}>
            {myParticipant.status==="pending"&&(
              <div className="glass-card" style={{borderRadius:14,padding:"22px 16px",textAlign:"center"}}>
                <div style={{fontSize:34,marginBottom:6,animation:"floatUp 4s ease-in-out infinite"}}>🕐</div>
                <div style={{color:"#a78bfa",fontWeight:900,fontSize:16}}>Awaiting Approval</div>
                <div style={{color:"rgba(255,255,255,.4)",fontSize:12,marginTop:6,lineHeight:1.7}}>The judge will admit you shortly.<br/><strong style={{color:"#fff"}}>{myParticipant.participant_name}</strong></div>
                {competition&&(
                  <div style={{marginTop:10,display:"inline-flex",alignItems:"center",gap:6,background:"rgba(201,168,76,.1)",border:`1px solid ${GOLD}44`,borderRadius:20,padding:"5px 12px"}}>
                    <span style={{color:"rgba(255,255,255,.4)",fontSize:10}}>Room Code</span>
                    <span style={{color:GOLD,fontWeight:800,letterSpacing:2,fontSize:12}}>{competition.room_code}</span>
                  </div>
                )}
              </div>
            )}
            {myParticipant.status==="waiting"&&(
              <div className="glass-card" style={{borderRadius:14,padding:"18px",textAlign:"center"}}>
                {competition?.queue_reveal_active && !myParticipant.queue_box_id ? (
                  <QueueBoxGrid boxCount={competition.queue_box_count||0} participants={participants} myParticipantId={myParticipant.id} canPick={true} onPick={pickQueueBox}/>
                ) : (
                  <>
                    <div style={{fontSize:28,marginBottom:5,animation:"floatUp 4s ease-in-out infinite"}}>⏳</div>
                    <div style={{color:GOLD,fontWeight:800,fontSize:14}}>Waiting in Queue</div>
                    <div style={{color:"rgba(255,255,255,.35)",fontSize:11,marginTop:3}}>Position #{myParticipant.queue_position} of {participants.filter(p=>p.status!=="pending").length}</div>
                    {activeP&&activeP.id!==myParticipant.id&&(
                      <div style={{marginTop:9,background:"rgba(34,197,94,.07)",border:"1px solid rgba(34,197,94,.2)",borderRadius:9,padding:"8px 11px"}}>
                        <div style={{color:GREEN,fontWeight:700,fontSize:11}}>🎙️ Now Reciting</div>
                        <div style={{color:"#fff",fontWeight:700,fontSize:13}}>{activeP.participant_name}</div>
                        {pickedTile&&<div style={{color:GOLD,fontSize:11,marginTop:2}}>📖 {pickedTile.label}</div>}
                      </div>
                    )}
                    <QueueList list={participants.filter(p=>p.status!=="pending")} myId={myParticipant.id} activeId={activeP?.id??null}/>
                  </>
                )}
              </div>
            )}
            {myParticipant.status==="called"&&(
              <div style={{animation:"calledGlow 2s ease-in-out infinite",background:"rgba(201,168,76,.09)",border:`2px solid ${GOLD}`,borderRadius:14,padding:"13px"}}>
                <div style={{textAlign:"center",marginBottom:10}}>
                  <div style={{fontSize:28,animation:"floatUp 2s ease-in-out infinite"}}>🎙️</div>
                  <div style={{color:GOLD,fontWeight:900,fontSize:15,letterSpacing:.5,marginTop:5}}>YOU HAVE BEEN CALLED!</div>
                  {/* Stage progress */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5,marginTop:6,marginBottom:4}}>
                    {Array.from({length:competition.total_stages},(_,i)=>{
                      const s=i+1;
                      const stageScores=myParticipant.stage_scores||{};
                      const isDone=stageScores[s]!==undefined;
                      const isCurrent=s===pickerStage;
                      return(
                        <div key={s} style={{width:20,height:20,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,background:isDone?GOLD:isCurrent?`${GOLD}55`:"rgba(255,255,255,.07)",border:`1.5px solid ${isDone||isCurrent?GOLD:"rgba(255,255,255,.12)"}`,color:isDone?G:isCurrent?GOLD:"rgba(255,255,255,.25)",flexShrink:0,transition:"all .3s"}}>
                          {isDone?"✓":s}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{color:"rgba(255,255,255,.5)",fontSize:11,fontWeight:700}}>Stage {pickerStage} of {competition.total_stages}</div>
                  {!pickedTile
                    ?<div style={{color:"rgba(255,255,255,.65)",fontSize:12,marginTop:3,fontWeight:700}}>👇 Pick your number below</div>
                    :<div style={{color:GREEN,fontSize:12,marginTop:3,fontWeight:700}}>✅ Selected — wait for judge to start</div>
                  }
                </div>
                {/* Toggle grid button after picking */}
                {pickedTile&&(
                  <button onClick={()=>setTilePickerCollapsed(c=>!c)} style={{width:"100%",background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,padding:"6px 11px",cursor:"pointer",color:"rgba(255,255,255,.5)",fontFamily:"Cairo,sans-serif",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",gap:4,marginBottom:7}}>
                    <span style={{color:GOLD,fontWeight:700}}>#{pickedTile.num}</span> {tilePickerCollapsed?"Show grid ▾":"Hide grid ▴"}
                  </button>
                )}
                {(!pickedTile||!tilePickerCollapsed)&&stageTiles.length>0&&(
                  <NumberTilePicker tiles={stageTiles} pickedNum={pickedTile?.num??null} onPick={!pickedTile?pickTile:()=>{}} canPick={!pickedTile} stage={pickerStage}/>
                )}
                {/* Waiting for tiles — shown when broadcast/DB hasn't delivered yet */}
                {!pickedTile&&stageTiles.length===0&&(
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,padding:"18px 0"}}>
                    <Loader2 size={28} color={GOLD} style={{animation:"spin 1s linear infinite"}}/>
                    <div style={{color:"rgba(255,255,255,.4)",fontSize:12,textAlign:"center"}}>Loading your numbers…</div>
                    <div style={{color:"rgba(255,255,255,.2)",fontSize:10,textAlign:"center"}}>If this takes too long, ask the judge to re-call you.</div>
                  </div>
                )}
                {pickedTile&&<QuestionDisplay tile={pickedTile} ayahText={ayahText} loadingAyah={loadingAyah} isParticipant={true} instructions={liveInstructions||undefined}/>}
              </div>
            )}
            {myParticipant.status==="reciting"&&(
              <div style={{animation:"recitingGlow 2s ease-in-out infinite",background:"rgba(34,197,94,.07)",border:`2px solid ${GREEN}`,borderRadius:14,padding:"13px"}}>
                <div style={{textAlign:"center",marginBottom:9}}>
                  <div style={{fontSize:26,animation:"floatUp 1.5s ease-in-out infinite"}}>🎙️</div>
                  <div style={{color:GREEN,fontWeight:900,fontSize:15,letterSpacing:.5,marginTop:5}}>NOW RECITING</div>
                  {/* Stage progress */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5,marginTop:6}}>
                    {Array.from({length:competition.total_stages},(_,i)=>{
                      const s=i+1;
                      const stageScores=myParticipant.stage_scores||{};
                      const isDone=stageScores[s]!==undefined;
                      const isCurrent=s===pickerStage;
                      return(
                        <div key={s} style={{width:20,height:20,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,background:isDone?GOLD:isCurrent?`${GREEN}55`:"rgba(255,255,255,.07)",border:`1.5px solid ${isDone?GOLD:isCurrent?GREEN:"rgba(255,255,255,.12)"}`,color:isDone?G:isCurrent?GREEN:"rgba(255,255,255,.25)",flexShrink:0,transition:"all .3s"}}>
                          {isDone?"✓":s}
                        </div>
                      );
                    })}
                    <span style={{color:GREEN,fontWeight:800,fontSize:11}}>Stage {pickerStage}/{competition.total_stages}</span>
                  </div>
                  {bellCount>0&&<div style={{color:RED,fontWeight:700,fontSize:11,marginTop:2}}>🔔 {bellCount} error{bellCount!==1?"s":""} · −{errorPenalty} pts</div>}
                </div>
                {pickedTile&&(
                  <div style={{background:"rgba(0,0,0,.3)",border:"1px solid rgba(255,255,255,.08)",borderRadius:11,padding:"11px"}}>
                    <div style={{color:GOLD,fontSize:9,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",marginBottom:3}}>📖 Your Passage</div>
                    <div style={{color:"#fff",fontWeight:700,fontSize:13,marginBottom:5}}>{pickedTile.label}</div>
                    {ayahText&&<div style={{fontFamily:"'Amiri Quran',serif",fontSize:18,color:"rgba(255,255,255,.9)",direction:"rtl",textAlign:"center",lineHeight:2.2,padding:"8px 5px",background:"rgba(201,168,76,.05)",borderRadius:8}}>{ayahText}<span style={{color:"rgba(201,168,76,.5)",fontSize:13}}> ﴿{pickedTile.ayah}﴾</span></div>}
                  </div>
                )}
                {liveInstructions&&<div style={{marginTop:9,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:8,padding:"7px 10px"}}><div style={{color:GOLD,fontSize:9,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:2}}>Instructions</div><div style={{color:"rgba(255,255,255,.6)",fontSize:11,lineHeight:1.7}}>{liveInstructions}</div></div>}
                <div style={{color:"rgba(255,255,255,.3)",fontSize:10,textAlign:"center",marginTop:9}}>Recite clearly. Judge will signal when to stop.</div>
              </div>
            )}
            {myParticipant.status==="completed"&&(
              <div className="glass-card" style={{borderRadius:14,padding:"18px",textAlign:"center"}}>
                <div style={{fontSize:36,marginBottom:5}}>✅</div>
                <div style={{color:GREEN,fontWeight:800,fontSize:15}}>All Stages Complete!</div>
                <div style={{color:GOLD,fontWeight:900,fontSize:36,marginTop:5}}>{myParticipant.total_score}</div>
                <div style={{color:"rgba(255,255,255,.35)",fontSize:11}}>Total Points</div>
                {/* Per-stage scores breakdown */}
                {Object.keys(myParticipant.stage_scores||{}).length>0&&(
                  <div style={{display:"flex",justifyContent:"center",gap:6,marginTop:12,flexWrap:"wrap"}}>
                    {Array.from({length:competition.total_stages},(_,i)=>{
                      const s=i+1;
                      const score=(myParticipant.stage_scores||{})[s];
                      return score!==undefined?(
                        <div key={s} style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(201,168,76,.2)",borderRadius:8,padding:"6px 10px",minWidth:44}}>
                          <div style={{color:"rgba(255,255,255,.35)",fontSize:9,fontWeight:700,letterSpacing:.5}}>S{s}</div>
                          <div style={{color:GOLD,fontWeight:800,fontSize:14}}>{score}</div>
                        </div>
                      ):null;
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Observer bottom bar */}
      {isObserver&&activeP&&(
        <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:20,background:"rgba(4,12,6,.97)",backdropFilter:"blur(20px)",borderTop:"1px solid rgba(201,168,76,.1)",padding:"8px 12px 14px",display:"flex",alignItems:"center",gap:7}}>
          <span style={{fontSize:16}}>👁️</span>
          <div style={{flex:1,color:"rgba(255,255,255,.4)",fontSize:11}}>Viewing as Observer</div>
          <button onClick={()=>setShowChat(c=>!c)} style={{background:`${GOLD}15`,border:`1px solid ${GOLD}33`,borderRadius:8,padding:"5px 10px",cursor:"pointer",color:GOLD,fontWeight:700,fontSize:11,fontFamily:"Cairo,sans-serif"}}>💬 Chat</button>
        </div>
      )}

      {/* ══ Q-SETTINGS PANEL ══════════════════════════════════════════ */}
      {showQSettings&&isJudge&&(
        <div style={{position:"fixed",inset:0,zIndex:9990,display:"flex",flexDirection:"column",justifyContent:"flex-end"}} onClick={()=>setShowQSettings(false)}>
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.6)",backdropFilter:"blur(6px)"}}/>
          <div onClick={e=>e.stopPropagation()} style={{position:"relative",zIndex:1,background:"linear-gradient(180deg,#0d2419 0%,#061410 100%)",borderTop:"1.5px solid rgba(201,168,76,.35)",borderRadius:"22px 22px 0 0",maxHeight:"90vh",display:"flex",flexDirection:"column",fontFamily:"Cairo,sans-serif"}}>
            {/* Header */}
            <div style={{display:"flex",alignItems:"center",gap:9,padding:"14px 18px",borderBottom:"1px solid rgba(255,255,255,.07)",flexShrink:0}}>
              <div style={{width:32,height:32,borderRadius:9,background:`linear-gradient(135deg,${GOLD},${GOLDD})`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Wand2 size={14} color={G}/></div>
              <div style={{flex:1}}>
                <div style={{color:"#fff",fontWeight:800,fontSize:14}}>Question Settings</div>
                <div style={{color:"rgba(255,255,255,.35)",fontSize:10}}>Set questions & instructions per stage</div>
              </div>
              <button onClick={()=>setShowQSettings(false)} style={{background:"none",border:"none",color:"rgba(255,255,255,.35)",cursor:"pointer",fontSize:20,padding:0,lineHeight:1}}>✕</button>
            </div>

            {/* Tab bar: Manual / AI */}
            <div style={{display:"flex",padding:"8px 14px 4px",flexShrink:0,gap:7}}>
              {([["manual","📝 Questions"],["ai","✨ AI Generate"]] as const).map(([t,l])=>(
                <button key={t} onClick={()=>setQSettingsTab(t)} style={{flex:1,background:qSettingsTab===t?"rgba(201,168,76,.2)":"transparent",border:qSettingsTab===t?"1px solid rgba(201,168,76,.4)":"1px solid transparent",borderRadius:9,padding:"7px 0",color:qSettingsTab===t?GOLD:"rgba(255,255,255,.4)",fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"Cairo,sans-serif",transition:"all .2s"}}>{l}</button>
              ))}
            </div>

            {/* Stage selector (only for manual tab) */}
            {qSettingsTab==="manual"&&competition&&(
              <div style={{padding:"6px 14px 4px",flexShrink:0}}>
                <div style={{color:"rgba(255,255,255,.4)",fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:5}}>
                  Editing Stage
                </div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {Array.from({length:competition.total_stages},(_,i)=>{
                    const s=i+1;
                    const hasQ=(stageQuestions[String(s)]||"").trim().length>0;
                    const isCurrent=s===competition.current_stage;
                    return(
                      <button key={s} onClick={()=>setQSettingsStage(s)}
                        style={{background:qSettingsStage===s?`${GOLD}22`:"rgba(255,255,255,.04)",border:`1.5px solid ${qSettingsStage===s?GOLD:hasQ?"rgba(34,197,94,.4)":"rgba(255,255,255,.12)"}`,borderRadius:9,padding:"5px 12px",cursor:"pointer",color:qSettingsStage===s?GOLD:hasQ?GREEN:"rgba(255,255,255,.45)",fontWeight:700,fontSize:12,fontFamily:"Cairo,sans-serif",position:"relative",display:"flex",alignItems:"center",gap:4}}>
                        S{s}{isCurrent&&<span style={{fontSize:8,background:`${GOLD}33`,color:GOLD,borderRadius:4,padding:"1px 4px",lineHeight:1.3}}>NOW</span>}
                        {hasQ&&<span style={{width:5,height:5,borderRadius:"50%",background:GREEN,flexShrink:0}}/>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{flex:1,overflowY:"auto",padding:"10px 14px 0"}}>
              {qSettingsTab==="manual"&&competition&&(
                <>
                  {/* Quick-fill banner — one click fills the currently-selected stage from scope */}
                  <div style={{background:"rgba(34,197,94,.07)",border:"1px solid rgba(34,197,94,.25)",borderRadius:12,padding:"10px 13px",marginBottom:12}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                      <Shuffle size={13} color={GREEN} style={{flexShrink:0}}/>
                      <div style={{flex:1}}>
                        <div style={{color:GREEN,fontWeight:700,fontSize:12}}>Fill Stage {qSettingsStage} from Quran scope</div>
                        <div style={{color:"rgba(255,255,255,.35)",fontSize:10,marginTop:1}}>
                          {(stageTypes[String(qSettingsStage)]||"recitation")==="recitation"
                            ? `Picks unique verses from ${competition.scope_type}. No AI needed.`
                            : `Generates template ${stageTypes[String(qSettingsStage)]} questions from ${competition.scope_type} — review before saving.`}
                        </div>
                      </div>
                      <button onClick={()=>autoFillStage(qSettingsStage, autoFillGuide)}
                        style={{background:"rgba(34,197,94,.15)",border:"1px solid rgba(34,197,94,.35)",borderRadius:9,padding:"6px 11px",cursor:"pointer",color:GREEN,fontWeight:700,fontSize:12,fontFamily:"Cairo,sans-serif",flexShrink:0,whiteSpace:"nowrap"}}>
                        Auto-fill
                      </button>
                    </div>
                    <input value={autoFillGuide} onChange={e=>setAutoFillGuide(e.target.value)}
                      placeholder="Optional: guide with a surah name (e.g. \"Fatiha\") — leave blank for any surah in scope"
                      style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",borderRadius:8,padding:"7px 10px",color:"#fff",fontSize:11,fontFamily:"Cairo,sans-serif"}}/>
                  </div>
                  <div style={{color:"rgba(255,255,255,.45)",fontSize:11,marginBottom:6,lineHeight:1.6}}>
                    <strong style={{color:GOLD}}>Stage {qSettingsStage} questions</strong> — one per line.{" "}
                    <span style={{color:"rgba(255,255,255,.3)"}}>Leave empty to use random Quran passages.</span>
                  </div>
                  <textarea
                    value={stageQuestions[String(qSettingsStage)]||""}
                    onChange={e=>setStageQuestions(sq=>({...sq,[String(qSettingsStage)]:e.target.value}))}
                    placeholder={"Al-Fatiha full\nAl-Baqarah 1-5\nSurah Al-Ikhlas complete\n..."}
                    rows={7}
                    style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(201,168,76,.25)",borderRadius:11,padding:"11px 13px",color:"#fff",fontSize:13,fontFamily:"Cairo,sans-serif",resize:"vertical",lineHeight:1.7,boxSizing:"border-box"}}
                  />
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{color:"rgba(255,255,255,.3)",fontSize:10,marginTop:3}}>
                      {(stageQuestions[String(qSettingsStage)]||"").split("\n").filter(s=>s.trim()).length} questions for Stage {qSettingsStage}
                      {(stageQuestions[String(qSettingsStage)]||"").includes("§") &&
                        <span style={{color:GREEN,marginLeft:5}}>· verse text enabled ✓</span>}
                    </div>
                    <button onClick={()=>setStageQuestions(sq=>({...sq,[String(qSettingsStage)]:""}))}
                      style={{background:"none",border:"none",color:"rgba(239,68,68,.5)",fontSize:10,cursor:"pointer",fontFamily:"Cairo,sans-serif",padding:0}}>
                      Clear Stage {qSettingsStage}
                    </button>
                  </div>

                  {/* Flat fallback list */}
                  <details style={{marginBottom:10}}>
                    <summary style={{color:"rgba(255,255,255,.35)",fontSize:11,cursor:"pointer",userSelect:"none",marginBottom:6}}>
                      📋 All-stages fallback list ({liveCustomQ.split("\n").filter(s=>s.trim()).length} entries)
                    </summary>
                    <div style={{color:"rgba(255,255,255,.35)",fontSize:10,marginBottom:4}}>Used only if a stage has no specific questions above.</div>
                    <textarea
                      value={liveCustomQ}
                      onChange={e=>setLiveCustomQ(e.target.value)}
                      placeholder={"Al-Fatiha full\nAl-Baqarah 1-5\n..."}
                      rows={4}
                      style={{width:"100%",background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,padding:"9px 11px",color:"rgba(255,255,255,.7)",fontSize:12,fontFamily:"Cairo,sans-serif",resize:"vertical",lineHeight:1.6,boxSizing:"border-box"}}
                    />
                  </details>

                  <div style={{color:GOLD,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:5,display:"flex",alignItems:"center",gap:3}}><Eye size={10}/> Instructions for Participants</div>
                  <textarea value={liveInstructions} onChange={e=>setLiveInstructions(e.target.value)} placeholder={"e.g. Recite with proper Tajweed rules. Begin with Bismillah."} rows={3} style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(201,168,76,.15)",borderRadius:11,padding:"9px 13px",color:"#fff",fontSize:13,fontFamily:"Cairo,sans-serif",resize:"vertical",lineHeight:1.7,boxSizing:"border-box",marginBottom:14}}/>
                </>
              )}
              {qSettingsTab==="ai"&&(
                <>
                  <div style={{background:"rgba(201,168,76,.08)",border:"1px solid rgba(201,168,76,.2)",borderRadius:11,padding:"11px 13px",marginBottom:12,display:"flex",alignItems:"flex-start",gap:7}}>
                    <Sparkles size={13} color={GOLD} style={{flexShrink:0,marginTop:2}}/>
                    <div style={{color:"rgba(255,255,255,.6)",fontSize:12,lineHeight:1.7}}>
                      AI generates questions for <strong style={{color:GOLD}}>Stage {qSettingsStage}</strong>. They're added to that stage's list for review before saving.
                    </div>
                  </div>
                  {/* Stage selector for AI tab too */}
                  {competition&&(
                    <div style={{marginBottom:12}}>
                      <div style={{color:GOLD,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:5}}>Target Stage</div>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                        {Array.from({length:competition.total_stages},(_,i)=>{
                          const s=i+1;
                          return(
                            <button key={s} onClick={()=>setQSettingsStage(s)}
                              style={{background:qSettingsStage===s?`${GOLD}22`:"rgba(255,255,255,.04)",border:`1.5px solid ${qSettingsStage===s?GOLD:"rgba(255,255,255,.12)"}`,borderRadius:9,padding:"5px 12px",cursor:"pointer",color:qSettingsStage===s?GOLD:"rgba(255,255,255,.45)",fontWeight:700,fontSize:12,fontFamily:"Cairo,sans-serif"}}>
                              S{s}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div style={{marginBottom:11}}>
                    <div style={{color:GOLD,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:5}}>Prompt / Scope</div>
                    <textarea value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} placeholder={"e.g. Juz 30 short surahs for junior students"} rows={3} style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(201,168,76,.25)",borderRadius:11,padding:"11px 13px",color:"#fff",fontSize:13,fontFamily:"Cairo,sans-serif",resize:"none",lineHeight:1.7,boxSizing:"border-box"}}/>
                  </div>
                  <div style={{marginBottom:14}}>
                    <div style={{color:GOLD,fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:5}}>Count</div>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      {[5,8,10,12,15,20,25,30].map(n=>(
                        <button key={n} onClick={()=>setAiQCount(n)} style={{background:aiQCount===n?`${GOLD}22`:"rgba(255,255,255,.06)",border:`1.5px solid ${aiQCount===n?GOLD:"rgba(255,255,255,.15)"}`,borderRadius:8,padding:"5px 12px",cursor:"pointer",color:aiQCount===n?GOLD:"rgba(255,255,255,.55)",fontFamily:"Cairo,sans-serif",fontWeight:700,fontSize:12}}>{n}</button>
                      ))}
                    </div>
                  </div>
                  <button onClick={generateAIQuestions} disabled={aiGenLoading||!aiPrompt.trim()} style={{width:"100%",background:aiGenLoading||!aiPrompt.trim()?"rgba(255,255,255,.08)":`linear-gradient(135deg,${GOLD},${GOLDD})`,color:aiGenLoading||!aiPrompt.trim()?"rgba(255,255,255,.3)":G,border:"none",borderRadius:11,padding:"13px",cursor:aiGenLoading||!aiPrompt.trim()?"not-allowed":"pointer",fontWeight:800,fontSize:14,fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:7,marginBottom:14,transition:"all .2s"}}>
                    {aiGenLoading?<><Loader2 size={15} style={{animation:"spin 1s linear infinite"}}/> Generating…</>:<><Sparkles size={15}/> Generate {aiQCount} Questions for Stage {qSettingsStage}</>}
                  </button>
                </>
              )}
            </div>
            <div style={{padding:"11px 14px 18px",borderTop:"1px solid rgba(255,255,255,.07)",flexShrink:0,display:"flex",gap:8}}>
              <button onClick={()=>setShowQSettings(false)} style={{flex:1,background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.1)",borderRadius:11,padding:"12px",cursor:"pointer",color:"rgba(255,255,255,.5)",fontWeight:700,fontSize:13,fontFamily:"Cairo,sans-serif"}}>Cancel</button>
              <button onClick={saveQSettings} style={{flex:2,background:`linear-gradient(135deg,${GOLD},${GOLDD})`,border:"none",borderRadius:11,padding:"12px",cursor:"pointer",color:G,fontWeight:800,fontSize:13,fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
                <CheckCircle size={14}/> Save All Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
