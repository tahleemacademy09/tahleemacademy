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
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  LiveKitRoom, RoomAudioRenderer, useLocalParticipant,
  useRemoteParticipants, VideoTrack, useRoomContext,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track, RoomEvent, ConnectionState } from "livekit-client";
import { ALL_SURAHS, parseGuide, guideToAyahs, resolveVerseTexts, isMostlyArabic } from "@/lib/musabaqahQuestions";
import { queueMediaOp } from "@/components/classroom/classroomComponents";
import {
  Mic, MicOff, Video, VideoOff, Bell, Play, Trophy, Users,
  Plus, Clock, BookOpen, CheckCircle, RefreshCw, ChevronRight,
  Award, Radio, ArrowRight, LogIn, StopCircle, Loader2,
  PhoneCall, List, LayoutGrid, Volume2, Crown, ArrowLeft,
  TimerReset, AlertTriangle, Settings, Wand2, Wifi, WifiOff, Sparkles, Eye, Shuffle,
} from "lucide-react";

const supabase: any = typedSupabase;

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
  mix_juz?:number[]; mix_surahs?:number[]; mix_pages?:number[];
}): Promise<ScopeAyah[]> => {
  try {
    if (scopeType==="mix") {
      // Any combination of whole Juz, whole Surahs and individual mushaf pages (1–604).
      // Every source is fetched, merged and de-duplicated into one ayah pool.
      const seen = new Set<string>();
      const pool: ScopeAyah[] = [];
      const add = (surah:number, ayah:number, surahName:string, surahAr:string) => {
        const k = `${surah}:${ayah}`;
        if (!surah || !ayah || seen.has(k)) return;
        seen.add(k); pool.push({ surah, ayah, surahName, surahAr });
      };
      let failed = false;
      const get = async (path:string) => {
        try {
          const r = await fetch(`https://api.alquran.cloud/v1/${path}`);
          const d = await r.json();
          if (d?.code===200) return d.data;
        } catch {}
        failed = true; return null;
      };
      const jobs: (() => Promise<void>)[] = [];
      (cfg.mix_juz||[]).forEach(n=>jobs.push(async()=>{
        const d = await get(`juz/${n}/quran-uthmani`);
        (d?.ayahs||[]).forEach((a:any)=>add(a.surah?.number, a.numberInSurah, a.surah?.englishName, a.surah?.name));
      }));
      (cfg.mix_surahs||[]).forEach(n=>jobs.push(async()=>{
        const d = await get(`surah/${n}/quran-uthmani`);
        (d?.ayahs||[]).forEach((a:any)=>add(d.number, a.numberInSurah, d.englishName, d.name));
      }));
      (cfg.mix_pages||[]).forEach(n=>jobs.push(async()=>{
        const d = await get(`page/${n}/quran-uthmani`);
        (d?.ayahs||[]).forEach((a:any)=>add(a.surah?.number, a.numberInSurah, a.surah?.englishName, a.surah?.name));
      }));
      // Run in small batches so a large page list doesn't fire hundreds of requests at once.
      for (let i=0; i<jobs.length; i+=8) await Promise.all(jobs.slice(i,i+8).map(j=>j()));
      return failed ? [] : pool;
    }
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

/** Parse "1-5, 20, 100-110" into a sorted, unique list of mushaf page numbers (1–604). */
const parsePageList = (txt:string): number[] => {
  const out = new Set<number>();
  (txt||"").split(/[,\s;،]+/).map(t=>t.trim()).filter(Boolean).forEach(tok=>{
    const m = tok.match(/^(\d{1,3})\s*[-–—]\s*(\d{1,3})$/);
    if (m) {
      let a = Number(m[1]), b = Number(m[2]);
      if (a>b) [a,b]=[b,a];
      for (let n=Math.max(1,a); n<=Math.min(604,b); n++) out.add(n);
    } else if (/^\d{1,3}$/.test(tok)) {
      const n = Number(tok); if (n>=1 && n<=604) out.add(n);
    }
  });
  return [...out].sort((a,b)=>a-b);
};
/** [1,2,3,7,20,21] → "1-3, 7, 20-21" */
const compactPageList = (pages:number[]): string => {
  const out:string[] = []; let i = 0;
  while (i<pages.length) {
    let j = i; while (j+1<pages.length && pages[j+1]===pages[j]+1) j++;
    out.push(j>i ? `${pages[i]}-${pages[j]}` : `${pages[i]}`); i = j+1;
  }
  return out.join(", ");
};
/** First/last mushaf page of a Juz (Madani mushaf, 604 pages). */
const juzPageRange = (j:number): [number,number] => [j===1 ? 1 : (j-1)*20+2, j===30 ? 604 : j*20+1];
const SURAH_NAMES = ["Al-Fatihah","Al-Baqarah","Aal-E-Imran","An-Nisa","Al-Ma'idah","Al-An'am","Al-A'raf","Al-Anfal","At-Tawbah","Yunus","Hud","Yusuf","Ar-Ra'd","Ibrahim","Al-Hijr","An-Nahl","Al-Isra","Al-Kahf","Maryam","Ta-Ha","Al-Anbiya","Al-Hajj","Al-Mu'minun","An-Nur","Al-Furqan","Ash-Shu'ara","An-Naml","Al-Qasas","Al-Ankabut","Ar-Rum","Luqman","As-Sajdah","Al-Ahzab","Saba","Fatir","Ya-Sin","As-Saffat","Sad","Az-Zumar","Ghafir","Fussilat","Ash-Shura","Az-Zukhruf","Ad-Dukhan","Al-Jathiyah","Al-Ahqaf","Muhammad","Al-Fath","Al-Hujurat","Qaf","Adh-Dhariyat","At-Tur","An-Najm","Al-Qamar","Ar-Rahman","Al-Waqi'ah","Al-Hadid","Al-Mujadila","Al-Hashr","Al-Mumtahanah","As-Saff","Al-Jumu'ah","Al-Munafiqun","At-Taghabun","At-Talaq","At-Tahrim","Al-Mulk","Al-Qalam","Al-Haqqah","Al-Ma'arij","Nuh","Al-Jinn","Al-Muzzammil","Al-Muddaththir","Al-Qiyamah","Al-Insan","Al-Mursalat","An-Naba","An-Nazi'at","Abasa","At-Takwir","Al-Infitar","Al-Mutaffifin","Al-Inshiqaq","Al-Buruj","At-Tariq","Al-A'la","Al-Ghashiyah","Al-Fajr","Al-Balad","Ash-Shams","Al-Layl","Ad-Duha","Ash-Sharh","At-Tin","Al-Alaq","Al-Qadr","Al-Bayyinah","Az-Zalzalah","Al-Adiyat","Al-Qari'ah","At-Takathur","Al-Asr","Al-Humazah","Al-Fil","Quraysh","Al-Ma'un","Al-Kawthar","Al-Kafirun","An-Nasr","Al-Masad","Al-Ikhlas","Al-Falaq","An-Nas"];

/** Competitions store their ayah pool compactly ("2:255") plus a small surah-name map, so the
 *  competition row stays small (it is re-read often). Older competitions stored full objects in
 *  scope_pool — this reads either format. */
const compactScopePool = (pool:ScopeAyah[]) => {
  const names: Record<string,[string,string]> = {};
  pool.forEach(p=>{ if (!names[String(p.surah)]) names[String(p.surah)] = [p.surahName, p.surahAr]; });
  return { scope_pool_c: pool.map(p=>`${p.surah}:${p.ayah}`), scope_surah_names: names };
};
const getScopePool = (cfg:any): ScopeAyah[] => {
  if (Array.isArray(cfg?.scope_pool) && cfg.scope_pool.length>0) return cfg.scope_pool as ScopeAyah[];
  const c: string[] = Array.isArray(cfg?.scope_pool_c) ? cfg.scope_pool_c : [];
  const names: Record<string,[string,string]> = cfg?.scope_surah_names || {};
  return c.map(k=>{
    const [sn,an] = k.split(":").map(Number);
    const nm = names[String(sn)] || [`Surah ${sn}`, ""];
    return { surah:sn, ayah:an, surahName:nm[0], surahAr:nm[1] };
  });
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

/** A competition with a scheduled start time (or a registration deadline) keeps every newly
 *  registered participant on the waiting screen until the start time arrives. Competitions made
 *  before the mandatory start time existed have neither, and keep their old instant-join behaviour. */
const needsWaitingGate = (comp?: {session_start_at?:string|null; registration_deadline?:string|null}|null) =>
  !!(comp?.session_start_at || comp?.registration_deadline);
/** ISO timestamp → value for <input type="datetime-local"> in the device's own time zone. */
const toLocalInput = (iso?:string|null): string => {
  if (!iso) return "";
  const d = new Date(iso); if (isNaN(d.getTime())) return "";
  const z = (n:number) => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
};
const fmtDT = (iso:string) => new Date(iso).toLocaleString("en",{weekday:"short",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});

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
const QueueList = ({ list, myId, activeId, micRequests, onMicTap, liveMicStatus }: { list:Participant[]; myId:string|null; activeId:string|null; micRequests?:Set<string>; onMicTap?:(p:Participant)=>void; liveMicStatus?:Record<string,{micOn:boolean;speaking:boolean}> }) => (
  <div style={{marginTop:10,textAlign:"left"}}>
    {[...list].sort((a,b)=>a.queue_position-b.queue_position).map(p=>{
      const wantsMic = !!micRequests?.has(p.id);
      const st = p.user_id ? liveMicStatus?.[p.user_id] : undefined;
      const isOn = !!st?.micOn;
      return(
      <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 9px",borderRadius:9,marginBottom:4,
        background: (wantsMic||isOn)?"rgba(34,197,94,.1)":p.id===myId?"rgba(201,168,76,.12)":p.id===activeId?"rgba(34,197,94,.08)":"rgba(255,255,255,.03)",
        border: (wantsMic||isOn)?`1px solid ${GREEN}66`:p.id===myId?`1px solid ${GOLD}55`:"1px solid rgba(255,255,255,.05)"}}>
        <span style={{color:GOLD,fontWeight:800,fontSize:11,width:22,flexShrink:0}}>#{p.queue_position}</span>
        {isOn ? (
          <span title="Mic live" style={{display:"flex",flexShrink:0,color:GREEN,animation:st?.speaking?"timerPulse .6s ease-in-out infinite":undefined}}><Mic size={13}/></span>
        ) : wantsMic ? (
          <button onClick={()=>onMicTap?.(p)} title="Wants to talk" style={{background:"none",border:"none",padding:0,cursor:onMicTap?"pointer":"default",display:"flex",flexShrink:0,animation:"timerPulse 1s ease-in-out infinite"}}>
            <Mic size={13} color={GREEN}/>
          </button>
        ) : (
          <span style={{display:"flex",flexShrink:0,color:"rgba(255,255,255,.18)"}}><MicOff size={13}/></span>
        )}
        <Avatar name={p.participant_name} size={26}/>
        <span style={{color:"#fff",fontSize:12,fontWeight:p.id===myId?800:600,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.participant_name}{p.id===myId?" (You)":""}</span>
        <span style={{fontSize:14}}>{STATUS_ICON[p.status]}</span>
      </div>
      );
    })}
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
    {tile.surah===0&&isMostlyArabic(tile.label)
      ? <div dir="rtl" style={{background:"rgba(0,0,0,.35)",borderRadius:12,padding:"14px 12px",fontFamily:"'Amiri Quran',serif",fontSize:22,color:"#fff",lineHeight:2.2,textAlign:"center",marginBottom:6}}>{tile.label}</div>
      : <div dir="auto" style={{color:"#fff",fontWeight:800,fontSize:15,marginBottom:4,lineHeight:1.3}}>{tile.label}</div>}
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

  // ── Draggable PiP tile stack ────────────────────────────────────────
  // The overlay tile stack (top-right by default) can otherwise sit on top
  // of other UI. Let the viewer drag it anywhere within the video area;
  // position is per-viewer only (not synced) and resets on remount.
  const pipContainerRef = useRef<HTMLDivElement>(null);
  const [pipOffset, setPipOffset] = useState({ x: 0, y: 0 });
  const pipDrag = useRef<{ startX:number; startY:number; origX:number; origY:number; moved:boolean } | null>(null);

  const onPipPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    pipDrag.current = { startX: e.clientX, startY: e.clientY, origX: pipOffset.x, origY: pipOffset.y, moved: false };
  };
  const onPipPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = pipDrag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) d.moved = true;
    if (!d.moved) return;
    const el = pipContainerRef.current;
    const parent = el?.parentElement;
    let nx = d.origX + dx, ny = d.origY + dy;
    if (el && parent) {
      // offsetLeft/Top reflect the resting (untransformed) position, so we
      // can clamp the translate so the tile stack never leaves the video area.
      const minX = -el.offsetLeft, maxX = parent.clientWidth - el.offsetLeft - el.offsetWidth;
      const minY = -el.offsetTop,  maxY = parent.clientHeight - el.offsetTop - el.offsetHeight;
      nx = Math.min(maxX, Math.max(minX, nx));
      ny = Math.min(maxY, Math.max(minY, ny));
    }
    setPipOffset({ x: nx, y: ny });
  };
  const onPipPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = pipDrag.current;
    if (d?.moved) {
      // Swallow the click that would otherwise fire on the tile underneath
      // the pointer (would swap the pinned feed right after a drag).
      const el = pipContainerRef.current;
      if (el) {
        const suppress = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); el.removeEventListener("click", suppress, true); };
        el.addEventListener("click", suppress, true);
      }
    }
    pipDrag.current = null;
  };

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

      {/* ── Switchable overlay tiles — every other judge + the active participant ──
          Draggable: press-and-drag anywhere on the stack (including the grip
          at top) to move it out of the way of other controls. */}
      {overlayFeeds.length>0 && (
        <div ref={pipContainerRef}
          onPointerDown={onPipPointerDown} onPointerMove={onPipPointerMove}
          onPointerUp={onPipPointerUp} onPointerCancel={onPipPointerUp}
          style={{position:"absolute",top:8,right:8,display:"flex",flexDirection:"column",gap:6,zIndex:8,
            maxHeight:"calc(100% - 60px)",overflowY:"auto",
            transform:`translate(${pipOffset.x}px,${pipOffset.y}px)`,
            touchAction:"none",cursor:"grab"}}>
          {/* Grip handle — visual affordance that this stack can be dragged */}
          <div style={{width:76,display:"flex",justifyContent:"center",padding:"2px 0",flexShrink:0}}>
            <div style={{width:26,height:4,borderRadius:2,background:"rgba(255,255,255,.35)"}}/>
          </div>
          {overlayFeeds.map(f=>{
            const isMe = f.userId===(localMeta.user_id||"me");
            return (
              <button key={f.userId} onClick={()=>onPin(f.userId)} style={{width:76,height:100,borderRadius:11,overflow:"hidden",position:"relative",border:`2px solid rgba(201,168,76,.55)`,boxShadow:"0 4px 16px rgba(0,0,0,.6)",background:"#111",padding:0,cursor:"pointer",touchAction:"none"}}>
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
const CameraControls = ({ isActive, isJudge, videoAllowed, forceMuteToken }: { isActive:boolean; isJudge:boolean; videoAllowed:boolean; forceMuteToken?:number }) => {
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);

  // Judge force-muted this user from the roster — disable the mic locally.
  // Skipped on the very first render (token starts at 0) so mounting doesn't mute anyone.
  const prevMuteToken = useRef(forceMuteToken);
  useEffect(() => {
    if (forceMuteToken===undefined || forceMuteToken===prevMuteToken.current) return;
    prevMuteToken.current = forceMuteToken;
    queueMediaOp(room, () => localParticipant.setMicrophoneEnabled(false)).then(()=>setMicOn(false)).catch(()=>{});
  }, [forceMuteToken]);

  useEffect(() => {
    if (isJudge) {
      queueMediaOp(room, () => localParticipant.setMicrophoneEnabled(true)).then(()=>setMicOn(true)).catch(()=>{});
      if (videoAllowed) queueMediaOp(room, () => localParticipant.setCameraEnabled(true)).then(()=>setCamOn(true)).catch(()=>{});
    }
  }, [isJudge, videoAllowed]);

  useEffect(() => {
    if (isActive && !isJudge) {
      queueMediaOp(room, () => localParticipant.setMicrophoneEnabled(true)).then(()=>setMicOn(true)).catch(()=>{});
      if (videoAllowed) queueMediaOp(room, () => localParticipant.setCameraEnabled(true)).then(()=>setCamOn(true)).catch(()=>{});
    }
  }, [isActive, isJudge, videoAllowed]);

  // If the admin turns video off mid-session while my camera is already on,
  // switch it off — audio keeps flowing untouched.
  useEffect(() => {
    if (!videoAllowed && camOn) {
      queueMediaOp(room, () => localParticipant.setCameraEnabled(false)).then(()=>setCamOn(false)).catch(()=>{});
    }
  }, [videoAllowed]);

  return (
    <div style={{display:"flex",gap:6,justifyContent:"center"}}>
      <button onClick={async()=>{ const n=!micOn; await queueMediaOp(room, () => localParticipant.setMicrophoneEnabled(n)); setMicOn(n); }}
        style={{background:micOn?`${GREEN}22`:"rgba(0,0,0,.6)",border:`1.5px solid ${micOn?GREEN:"rgba(255,255,255,.3)"}`,borderRadius:8,padding:"4px 8px",cursor:"pointer",color:micOn?GREEN:"rgba(255,255,255,.7)",display:"flex",flexDirection:"column",alignItems:"center",gap:1,fontFamily:"Cairo,sans-serif",fontWeight:700,minWidth:40,transition:"all .2s"}}>
        {micOn?<Mic size={12}/>:<MicOff size={12}/>}
        <span style={{fontSize:8,lineHeight:1.2}}>{micOn?"On":"Mute"}</span>
      </button>
      {videoAllowed && (
        <button onClick={async()=>{ const n=!camOn; await queueMediaOp(room, () => localParticipant.setCameraEnabled(n)); setCamOn(n); }}
          style={{background:camOn?`${GREEN}22`:"rgba(0,0,0,.6)",border:`1.5px solid ${camOn?GREEN:"rgba(255,255,255,.3)"}`,borderRadius:8,padding:"4px 8px",cursor:"pointer",color:camOn?GREEN:"rgba(255,255,255,.7)",display:"flex",flexDirection:"column",alignItems:"center",gap:1,fontFamily:"Cairo,sans-serif",fontWeight:700,minWidth:40,transition:"all .2s"}}>
          {camOn?<Video size={12}/>:<VideoOff size={12}/>}
          <span style={{fontSize:8,lineHeight:1.2}}>Cam</span>
        </button>
      )}
    </div>
  );
};

// Tracks every connected user's live mic (on/off) + speaking state from inside
// the LiveKitRoom context, and reports it up to the parent page (which lives
// outside the room) so the roster can show a real mic status beside each name.
const AudioStateSync = ({ onUpdate }: { onUpdate:(map:Record<string,{micOn:boolean;speaking:boolean}>)=>void }) => {
  const room = useRoomContext();
  useEffect(() => {
    if (!room) return;
    const getMeta = (p:any) => { try { return JSON.parse(p?.metadata||"{}"); } catch { return {}; } };
    const recompute = () => {
      const map: Record<string,{micOn:boolean;speaking:boolean}> = {};
      const speakingIds = new Set((room.activeSpeakers||[]).map((s:any)=>s.identity));
      const all:any[] = [room.localParticipant, ...Array.from(room.remoteParticipants?.values?.()||[])];
      all.forEach((p:any) => {
        const meta = getMeta(p);
        if (!meta.user_id) return;
        const micPub = p.getTrackPublication?.(Track.Source.Microphone);
        map[meta.user_id] = { micOn: !!micPub && !micPub.isMuted, speaking: speakingIds.has(p.identity) };
      });
      onUpdate(map);
    };
    recompute();
    room.on(RoomEvent.TrackMuted, recompute);
    room.on(RoomEvent.TrackUnmuted, recompute);
    room.on(RoomEvent.ActiveSpeakersChanged, recompute);
    room.on(RoomEvent.ParticipantConnected, recompute);
    room.on(RoomEvent.ParticipantDisconnected, recompute);
    room.on(RoomEvent.LocalTrackPublished, recompute);
    room.on(RoomEvent.LocalTrackUnpublished, recompute);
    return () => {
      room.off(RoomEvent.TrackMuted, recompute);
      room.off(RoomEvent.TrackUnmuted, recompute);
      room.off(RoomEvent.ActiveSpeakersChanged, recompute);
      room.off(RoomEvent.ParticipantConnected, recompute);
      room.off(RoomEvent.ParticipantDisconnected, recompute);
      room.off(RoomEvent.LocalTrackPublished, recompute);
      room.off(RoomEvent.LocalTrackUnpublished, recompute);
    };
  }, [room, onUpdate]);
  return null;
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
  {id:"mix",label:"Mix — Juz, Surahs & Pages",desc:"Combine several Juz, specific Surahs and any mushaf pages"},
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
  const [onlineUsers,  setOnlineUsers]  = useState<{name:string;role:string;user_id?:string}[]>([]);
  const [judgeCodes,      setJudgeCodes]      = useState<string[]>([]);
  const [judgeCodeInput,  setJudgeCodeInput]  = useState("");
  const [observerNameInput, setObserverNameInput] = useState("");
  const [activeP,        setActiveP]       = useState<Participant|null>(null);
  const [micRequests,    setMicRequests]   = useState<Set<string>>(new Set()); // participant ids who've raised their hand to talk while waiting
  const [liveMicStatus,  setLiveMicStatus] = useState<Record<string,{micOn:boolean;speaking:boolean}>>({}); // user_id -> real-time mic state, fed by AudioStateSync
  const [forceMuteToken, setForceMuteToken]= useState(0); // bumped when I (this device) get force-muted by the judge
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
  const [expandedRosterId, setExpandedRosterId] = useState<string|null>(null);
  const [rosterEditScores, setRosterEditScores] = useState<Record<string,string>>({});
  const [rosterCallStage, setRosterCallStage] = useState<Record<string,string>>({});
  const [showScorePanel, setShowScore]     = useState(false);
  // ── Manual "stuck" recovery: lets anyone force a resync of their exact
  //    stage/status from the DB instead of waiting on broadcast/polling.
  const [resyncing,      setResyncing]     = useState(false);
  // ── Stage review/correction: the judge can step Back to an already-scored
  //    stage of the current participant to fix a mistake, then Next back to
  //    where they left off. stageFrontier is the furthest stage reached so
  //    far for this participant — Back/Next are only allowed within it.
  const [stageFrontier,  setStageFrontier] = useState(1);
  const [savingCorrection, setSavingCorrection] = useState(false);
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
    mix_juz:[] as number[], mix_surahs:[] as number[], mix_pages:"", mix_surah_q:"", mix_random_n:5,
    registration_deadline:"" as string, session_start_at:"" as string, juz_options:[] as number[]});
  // Editable copy of a competition's registration-time settings (Settings page).
  const [editForm, setEditForm] = useState<any>(null);
  const [savingDetails, setSavingDetails] = useState(false);
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
  const [autoFillCount,    setAutoFillCount]    = useState(30);
  const [autoFillAppend,   setAutoFillAppend]   = useState(false);
  const [autoFilling,      setAutoFilling]      = useState(false);
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

  // ── Keep the waiting screen in sync with the admin ─────────────────
  // If the admin changes (or brings forward) the start time, the countdown here follows.
  useEffect(() => {
    if (view!=="registered" || !competition?.id) return;
    let stop = false;
    const poll = async () => {
      const {data} = await supabase.from("musabaqah_competitions" as any).select("*").eq("id",competition.id).maybeSingle();
      if (!stop && data) setCompetition(c => c ? { ...c, ...(data as any) } : c);
    };
    const iv = setInterval(poll, 8000);
    return () => { stop = true; clearInterval(iv); };
  }, [view, competition?.id]);

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
    // Still waiting for the start time? Back to the countdown, not the room.
    if (savedSession.userRole==="participant" && needsWaitingGate(comp as Competition)) {
      const {data:pp} = savedSession.participantId
        ? await supabase.from("musabaqah_participants" as any).select("*").eq("id",savedSession.participantId).single()
        : {data:null};
      if (pp && (pp as Participant).status==="pending") { setMyParticipant(pp as Participant); setView("registered"); return; }
    }
    setView("arena");
    await fetchLkToken((comp as Competition).room_code);
  };


  const isJudge = canJudge && userRole!=="observer" && userRole!=="participant";
  const isObserver = userRole==="observer";
  const iAmParticipantActive = !isJudge && myParticipant && (myParticipant.status==="called"||myParticipant.status==="reciting");
  // Admin (judge) can turn live video off for the whole competition — everyone
  // falls back to the audio/no-video placeholder. Defaults to enabled (true)
  // when the setting has never been touched, so existing competitions are unaffected.
  const adminVideoOff = competition?.scope_config?.video_enabled === false;

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
      // Restore exact error counts from the DB — nothing resets to zero on a
      // refresh or dropped connection mid-recitation.
      setBellCount(latest.bell_count ?? 0);
      setMinorCount((latest.score_breakdown as any)?.__minor ?? 0);
      setMajorCount((latest.score_breakdown as any)?.__major ?? 0);
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

  // ── Manual "stuck" recovery ─────────────────────────────────────────
  // Broadcasts and polling usually keep everyone in sync, but a dropped
  // connection or a missed event can still leave someone stuck (most often
  // a participant stuck at "picking number"). This lets anyone force a fresh
  // pull from the DB and land back in exactly the right spot — no full page
  // reload needed.
  const forceResync = useCallback(async () => {
    const comp = competitionRef.current;
    if (!comp) return;
    setResyncing(true);
    try {
      const { data: compRow } = await supabase
        .from("musabaqah_competitions" as any).select("*").eq("id", comp.id).single();
      if (compRow) {
        setCompetition(c => c ? { ...c, ...(compRow as any) } : (compRow as any));
      }
      await Promise.all([loadParticipants(), loadAttempts(), loadJudgeScores()]);

      const cfg = ((compRow as any)?.scope_config || {}) as any;
      const mine = myParticipantRef.current;
      if (mine) {
        if (mine.status === "called" && cfg.current_tiles?.length && cfg.current_called_id === mine.id) {
          setStageTiles(cfg.current_tiles);
          setShowTilePicker(true);
          setPickerParticipantId(mine.id);
          if (cfg.current_stage_num) setPickerStage(cfg.current_stage_num);
        } else if (mine.status === "reciting" && !pickedTile) {
          const stage = cfg.current_stage_num || pickerStage;
          const stageAttempts = attempts.filter(a => a.participant_id === mine.id && a.stage_number === stage);
          const latest = stageAttempts[stageAttempts.length - 1];
          if (latest) {
            setCurAttempt(latest);
            setBellCount(latest.bell_count ?? 0);
            setMinorCount((latest.score_breakdown as any)?.__minor ?? 0);
            setMajorCount((latest.score_breakdown as any)?.__major ?? 0);
          }
        }
      }
      toast({ title: "🔄 Synced", description: "You're up to date." });
    } catch {
      toast({ title: "Sync failed", description: "Check your connection and try again.", variant: "destructive" });
    } finally {
      setResyncing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[loadParticipants, loadAttempts, loadJudgeScores, pickedTile, attempts, pickerStage]);

  useEffect(()=>{
    if (!competition) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    const ch = supabase.channel(`musabaqah:${competition.id}`,{config:{broadcast:{ack:false}}})
      .on("broadcast",{event:"BELL"},({payload}:any)=>{
        setBellCount(payload.count??0);
        if (payload.severity==="minor") setMinorCount(c=>c+1); else if (payload.severity==="major") setMajorCount(c=>c+1);
        // Minor errors stay invisible to reciters — no flash, no sound, no alert.
        // Judges and observers still get notified of every bell (minor + major);
        // a reciter only ever feels/hears a major error.
        const isReciterClient = !isJudge && !isObserver;
        if (isReciterClient && payload.severity==="minor") return;
        setBellFlash(true);
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
      .on("broadcast",{event:"CALL_CANCELLED"},({payload}:any)=>{
        // Judge cancelled a stuck call (e.g. stuck on question picking) to call someone else.
        loadParticipants();
        setShowScore(false); setShowTilePicker(false); setTimerExpired(false); setTimerActive(false);
        setPickedTile(null); setStageTiles([]); setAyahText(null); setPickerParticipantId(null);
        const mine=myParticipantRef.current;
        if (mine && payload.participant_id===mine.id) {
          setMyParticipant(p=>p?{...p,status:"waiting"}:p);
          if (mine) myParticipantRef.current={...mine,status:"waiting"};
          toast({title:"Call cancelled",description:"You're back in the waiting queue."});
        }
      })
      .on("broadcast",{event:"FORCE_MUTE"},({payload}:any)=>{
        const mine=myParticipantRef.current;
        if (mine && payload.participant_id===mine.id) {
          setForceMuteToken(t=>t+1);
          toast({title:"🔇 Your mic was muted by the judge"});
        }
      })
      .on("broadcast",{event:"MIC_REQUEST"},({payload}:any)=>{
        setMicRequests(prev=>{
          const next=new Set(prev);
          if (payload.requesting) next.add(payload.participant_id); else next.delete(payload.participant_id);
          return next;
        });
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
      .on("broadcast",{event:"VIDEO_TOGGLE"},({payload}:any)=>{
        // Admin flipped the video-on/video-off switch for everyone — reflect
        // it immediately without waiting for a DB round-trip.
        setCompetition(c=>c?{...c, scope_config:{...(c.scope_config||{}), video_enabled: payload.enabled}}:c);
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
      .on("presence",{event:"sync"},()=>{
        const state=ch.presenceState() as Record<string,any[]>;
        const flat = Object.values(state).flat() as any[];
        setOnlineUsers(flat.map((u:any)=>({name:u.name||"Guest",role:u.role||"observer",user_id:u.user_id as string|undefined})));
        // De-dupe judges by user_id (one judge could have multiple tabs/presence entries)
        const judgeMap = new Map<string,{user_id:string;name:string}>();
        flat.filter((u:any)=>u.role==="judge"&&u.user_id).forEach((u:any)=>judgeMap.set(u.user_id,{user_id:u.user_id,name:u.name||"Judge"}));
        setPresentJudges(Array.from(judgeMap.values()));
      })
      .subscribe(async()=>{
        const myName=myParticipantRef.current?.participant_name||profile?.full_name||"Guest";
        const myR=isJudge?"judge":myParticipantRef.current?"participant":"observer";
        await ch.track({name:myName,role:myR,user_id:user?.id});
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
    // Written-out verse text (no numbers) — shown as-is, nothing to fetch.
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
    const scopePool = getScopePool(comp.scope_config);
    if (scopePool.length > 0) {
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

  const callParticipant = async (p:Participant, startStage:number=1) => {
    if (!competition) return;
    const stage = Math.max(1, Math.min(startStage, competition.total_stages));
    setBellCount(0); setMinorCount(0); setMajorCount(0); setTajweedAnswers({}); setTimerSecs(judgeTimerDuration); setElapsedSecs(0); elapsedRef.current=0;
    setTimerExpired(false); setShowScore(false);
    setScoreBreak({tajweed:"",memorize:"",fluency:"",voice:""}); setJudgeComment("");
    setPickedTile(null); setAyahText(null);
    setTilePickerCollapsed(false);
    // Normally starts at stage 1 (all stages in one sitting), but a judge can
    // call someone in directly at a later stage — e.g. resuming a participant
    // who already has recorded scores for stages 1-3 and should continue at 4.
    setActiveParticipantStage(stage);
    setStageFrontier(stage);
    setPickerStage(stage);
    const tiles = buildTiles(competition, stage);
    setStageTiles(tiles); setShowTilePicker(true);
    setActiveP({...p, status:"called"}); setCompetition(c=>c?{...c,current_participant_id:p.id}:c);
    setJudgeTab("controls");

    // Broadcast immediately for fast delivery
    broadcast("CALLED",{participant_id:p.id,participant_name:p.participant_name});
    broadcast("TILES_SHOWN",{tiles,stage,picker_participant_id:p.id});
    playCalled();

    // Persist tiles + caller info to DB — participant polls this as a fallback if
    // the broadcast was missed (stage-change interruption, reconnect, etc.)
    const newCfg = {
      ...(competition.scope_config||{}),
      current_tiles: tiles,
      current_called_id: p.id,
      current_stage_num: stage,
    };
    await Promise.all([
      supabase.from("musabaqah_participants" as any).update({status:"called"}).eq("id",p.id),
      supabase.from("musabaqah_competitions" as any)
        .update({current_participant_id:p.id, scope_config: newCfg} as any)
        .eq("id",competition.id),
    ]);

    // Re-broadcast after DB write to catch late subscribers
    setTimeout(()=>broadcast("TILES_SHOWN",{tiles,stage,picker_participant_id:p.id}), 800);
  };

  // Judge cancels the current call — used when a participant is stuck (e.g. on
  // question picking) and the judge needs to free them up and call someone else.
  // Reverts the called participant back to "waiting" instead of leaving them stuck.
  const cancelCall = async () => {
    if (!activeP || !competition) return;
    const cancelledId = activeP.id;
    broadcast("CALL_CANCELLED",{participant_id:cancelledId});
    setActiveP(null); setShowTilePicker(false); setStageTiles([]); setPickedTile(null); setAyahText(null);
    setShowScore(false); setCurAttempt(null); setTimerActive(false); setTimerExpired(false); setPickerParticipantId(null);
    // Clear it locally (and in the ref loadParticipants reads from) BEFORE
    // reloading — otherwise loadParticipants still sees the old
    // current_participant_id, re-fetches this now-"waiting" participant, and
    // sets them right back as activeP, silently undoing the cancel.
    setCompetition(c=>c?{...c,current_participant_id:null}:c);
    await Promise.all([
      supabase.from("musabaqah_participants" as any).update({status:"waiting"}).eq("id",cancelledId),
      supabase.from("musabaqah_competitions" as any).update({current_participant_id:null} as any).eq("id",competition.id),
    ]);
    loadParticipants();
  };

  // Waiting participant raises/lowers their hand to ask to speak — surfaced as a
  // mic icon in front of their name for the judge (and others) to see live.
  const toggleMicRequest = () => {
    if (!myParticipant) return;
    const requesting = !micRequests.has(myParticipant.id);
    setMicRequests(prev=>{
      const next=new Set(prev);
      if (requesting) next.add(myParticipant.id); else next.delete(myParticipant.id);
      return next;
    });
    broadcast("MIC_REQUEST",{participant_id:myParticipant.id, requesting});
  };

  // Judge taps the mic icon next to a waiting participant's name to acknowledge
  // and clear their raised-hand request (e.g. after letting them speak briefly).
  const clearMicRequest = (p:Participant) => {
    setMicRequests(prev=>{ const next=new Set(prev); next.delete(p.id); return next; });
    broadcast("MIC_REQUEST",{participant_id:p.id, requesting:false});
  };

  // Judge taps a live (green) mic icon to force-mute that participant remotely.
  const forceMuteParticipant = (p:Participant) => {
    broadcast("FORCE_MUTE",{participant_id:p.id});
  };

  // Shared online/offline check used anywhere we show a participant's presence
  // dot (roster list, call list). Matches by user_id when the participant has
  // a linked account (reliable — presence tracks the signed-in user's id), and
  // only falls back to a normalized name comparison for participants without
  // one (e.g. registered by an admin, no login).
  const isParticipantOnline = (p:Participant) => {
    const norm=(s:string)=>s.trim().toLowerCase().replace(/\s+/g," ");
    return onlineUsers.some(u=>
      (p.user_id&&u.user_id&&u.user_id===p.user_id) ||
      (!p.user_id && norm(u.name)===norm(p.participant_name))
    );
  };

  // Shared mic-status icon shown beside every participant's name in the judge's
  // roster/call lists: green + pulsing while they're actually speaking, green
  // (tap to mute) while their mic is live but quiet, pulsing (tap to acknowledge)
  // while they've raised a hand to talk, and dim MicOff otherwise.
  const renderMicIcon = (p:Participant, size=12) => {
    const st = p.user_id ? liveMicStatus[p.user_id] : undefined;
    const isOn = !!st?.micOn;
    if (isOn) {
      return (
        <button onClick={()=>forceMuteParticipant(p)} title="Live — tap to mute" style={{background:"none",border:"none",padding:0,cursor:"pointer",display:"flex",flexShrink:0,color:GREEN,animation:st?.speaking?"timerPulse .6s ease-in-out infinite":undefined}}>
          <Mic size={size}/>
        </button>
      );
    }
    if (micRequests.has(p.id)) {
      return (
        <button onClick={()=>clearMicRequest(p)} title="Wants to talk — tap to acknowledge" style={{background:"none",border:"none",padding:0,cursor:"pointer",display:"flex",flexShrink:0,color:GREEN,animation:"timerPulse 1s ease-in-out infinite"}}>
          <Mic size={size}/>
        </button>
      );
    }
    return <span style={{display:"flex",flexShrink:0,color:"rgba(255,255,255,.18)"}}><MicOff size={size}/></span>;
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
    const nextMinor = severity==="minor" ? minorCount+1 : minorCount;
    const nextMajor = severity==="major" ? majorCount+1 : majorCount;
    setBellCount(n);
    if (severity === "minor") setMinorCount(nextMinor); else setMajorCount(nextMajor);
    playBell();                // sound — instant
    setBellFlash(true);        // visual
    setTimeout(()=>setBellFlash(false),2500);
    broadcast("BELL",{count:n, severity}); // network broadcast — fast (no await)
    // DB update async, does NOT block the above. Minor/major split is stored
    // inside score_breakdown (no schema change needed) so a refresh or
    // reconnect mid-recitation can restore the exact counts instead of
    // silently resetting them to zero.
    if (currentAttempt) {
      supabase.from("musabaqah_attempts" as any).update({
        bell_count:n,
        score_breakdown:{ ...(currentAttempt.score_breakdown||{}), __minor:nextMinor, __major:nextMajor },
      }).eq("id",currentAttempt.id);
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
        setStageFrontier(nextStage);
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
        setActiveParticipantStage(1); setStageFrontier(1); setMyScoreSubmitted(false);
        setJudgeTab("roster"); loadParticipants(); loadAttempts(); loadJudgeScores();
      }
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingScore(false);
    }
  };

  /** Judge steps Back/Next between stages already reached (1..stageFrontier)
   *  for the currently active participant — e.g. to revisit stage 2 and fix
   *  a scoring mistake before returning to where they left off. Pulls the
   *  recorded attempt for that stage back into the score panel for editing.
   *  Never touches participant status or auto-advances — that only happens
   *  through the normal Submit Score flow. */
  const reviewStage = (stageNum: number) => {
    if (!activeP || !competition) return;
    const clamped = Math.max(1, Math.min(stageNum, stageFrontier));
    if (clamped === activeParticipantStage) return;
    setActiveParticipantStage(clamped);
    setPickerStage(clamped);
    setMyScoreSubmitted(false);
    const stageAttempts = attempts.filter(a => a.participant_id === activeP.id && a.stage_number === clamped);
    const latest = stageAttempts[stageAttempts.length - 1];
    if (latest) {
      setCurAttempt(latest);
      setBellCount(latest.bell_count ?? 0);
      setMinorCount((latest.score_breakdown as any)?.__minor ?? 0);
      setMajorCount((latest.score_breakdown as any)?.__major ?? 0);
      setJudgeComment(latest.judge_comment || "");
      if (competition.use_criteria_scoring) {
        const bd = (latest.score_breakdown || {}) as any;
        setScoreBreak({ tajweed: String(bd.tajweed ?? ""), memorize: String(bd.memorize ?? ""), fluency: String(bd.fluency ?? ""), voice: String(bd.voice ?? "") });
      } else {
        setScoreBreak(s => ({ ...s, tajweed: String(latest.judge_score ?? "") }));
      }
      const tile: Tile = latest.surah_number && latest.ayah_number
        ? { num: clamped, label: latest.scope_label, labelAr: latest.scope_label_ar, surah: latest.surah_number, ayah: latest.ayah_number,
            surahName: SURAHS.find(s => s.n === latest.surah_number)?.en ?? "", surahAr: SURAHS.find(s => s.n === latest.surah_number)?.ar ?? "" }
        : { num: clamped, label: latest.scope_label, labelAr: latest.scope_label_ar, surah: 0, ayah: 0, surahName: "", surahAr: "" };
      setPickedTile(tile);
      if (tile.surah > 0) fetchAyah(tile.surah, tile.ayah);
      setShowScore(true);
      setTilePickerCollapsed(true);
    } else {
      // No recorded attempt for this stage (shouldn't normally happen inside the frontier)
      setCurAttempt(null); setPickedTile(null); setAyahText(null); setShowScore(false);
      setBellCount(0); setMinorCount(0); setMajorCount(0);
      setScoreBreak({ tajweed: "", memorize: "", fluency: "", voice: "" }); setJudgeComment("");
    }
  };

  /** Saves a corrected score for a stage being reviewed (activeParticipantStage
   *  < stageFrontier) — updates just that stage's number and recalculates the
   *  participant's total from all stage scores. Does NOT advance the stage or
   *  change participant status, since correction is separate from progression. */
  const saveStageCorrection = async () => {
    if (!activeP || !competition || !currentAttempt) return;
    setSavingCorrection(true);
    try {
      let total = 0; const breakdown: Record<string, number> = {};
      if (competition.use_criteria_scoring) {
        SCORING_CRITERIA.forEach(c => { const v = Math.min(Number(scoreBreak[c.key]) || 0, c.max); breakdown[c.key] = v; total += v; });
      } else { total = Number(scoreBreak.tajweed) || 0; }
      total = Math.max(0, Math.round((total - errorPenalty) * 10) / 10);

      await supabase.from("musabaqah_attempts" as any).update({
        judge_score: total, score_breakdown: { ...breakdown, __minor: minorCount, __major: majorCount },
        judge_comment: judgeComment, bell_count: bellCount, status: "scored",
      } as any).eq("id", currentAttempt.id);

      const newStageScores = { ...(activeP.stage_scores || {}), [activeParticipantStage]: total };
      const newTotal: number = Object.values(newStageScores).reduce<number>((s, v) => s + (Number(v) || 0), 0);
      await supabase.from("musabaqah_participants" as any).update({ stage_scores: newStageScores, total_score: newTotal } as any).eq("id", activeP.id);
      setActiveP(p => p ? { ...p, stage_scores: newStageScores, total_score: newTotal } : p);
      loadAttempts(); loadParticipants();
      toast({ title: `✅ Stage ${activeParticipantStage} corrected: ${total} pts`, description: "Total recalculated from all stages." });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingCorrection(false);
    }
  };

  /** Manual admin correction from the Roster — edit any participant's score for
   *  any stage (even after they've completed), independent of the live scoring
   *  flow above. Recalculates total_score as the sum of all stage scores. */
  const correctRosterStageScore = async (p: Participant, stageNum: number, newScore: number) => {
    const newStageScores = { ...(p.stage_scores || {}), [stageNum]: newScore };
    const newTotal: number = Object.values(newStageScores).reduce<number>((s, v) => s + (Number(v) || 0), 0);
    await supabase.from("musabaqah_participants" as any).update({ stage_scores: newStageScores, total_score: newTotal } as any).eq("id", p.id);
    setParticipants(ps => ps.map(x => x.id === p.id ? { ...x, stage_scores: newStageScores, total_score: newTotal } : x));
    if (activeP?.id === p.id) setActiveP(a => a ? { ...a, stage_scores: newStageScores, total_score: newTotal } : a);
    toast({ title: `Stage ${stageNum} corrected`, description: `${p.participant_name}: ${newScore} pts (total recalculated)` });
  };

  /** Manual admin override — mark a participant as Called (pulls them into the
   *  active slot, same as tapping Call) or Done (marks all stages complete
   *  without changing already-recorded scores). Useful when the normal flow
   *  gets stuck and the judge needs to force a participant's status directly. */
  const setParticipantStatusManually = async (p: Participant, status: "called" | "completed" | "waiting", stage?: number) => {
    if (!competition) return;
    if (status === "called") {
      await callParticipant(p, stage ?? 1);
      return;
    }
    await supabase.from("musabaqah_participants" as any).update({ status } as any).eq("id", p.id);
    setParticipants(ps => ps.map(x => x.id === p.id ? { ...x, status } : x));
    if (activeP?.id === p.id) {
      setActiveP(null); setShowTilePicker(false); setStageTiles([]); setPickedTile(null); setAyahText(null);
      setShowScore(false); setCurAttempt(null); setTimerActive(false); setTimerExpired(false); setPickerParticipantId(null);
      setCompetition(c=>c?{...c,current_participant_id:null}:c);
      await supabase.from("musabaqah_competitions" as any).update({ current_participant_id: null } as any).eq("id", competition.id);
    }
    toast({ title: `${p.participant_name} marked as ${status === "completed" ? "Done" : "Waiting"}` });
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

  // Undo an "End Session for All" — puts the competition back to "active" so
  // the judge can resume calling/scoring participants. Individual participants'
  // statuses/scores are untouched (they stay however they were left), only the
  // competition-level status + results-reveal flags are reverted.
  const reviveSession = async () => {
    if (!competition) return;
    const ok = window.confirm("Reopen this session? It will go live again and the results screen will be hidden until you end it.");
    if (!ok) return;
    await supabase.from("musabaqah_competitions" as any).update({ status: "active", results_reveal_active: false, revealed_participant_ids: [] } as any).eq("id", competition.id);
    setCompetition(c=>c?{...c, status:"active", results_reveal_active:false, revealed_participant_ids:[]}:c);
    broadcast("SESSION_REVIVED");
    setView("arena");
    toast({ title: "Session reopened" });
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

  // Admin toggle: turn live video on/off for the whole competition. Persists
  // to scope_config (so it survives refresh / late joiners via the normal DB
  // load) and broadcasts instantly so everyone already connected switches
  // over without needing to refresh.
  const toggleVideoEnabled = async () => {
    if (!competition) return;
    const nextEnabled = !(competition.scope_config?.video_enabled ?? true);
    const newConfig = { ...(competition.scope_config||{}), video_enabled: nextEnabled };
    setCompetition(c=>c&&c.id===competition.id?{...c,scope_config:newConfig}:c); // instant local
    broadcast("VIDEO_TOGGLE", { enabled: nextEnabled });
    toast({ title: nextEnabled ? "📹 Video enabled for this competition" : "🚫 Video disabled for this competition" });
    const { error } = await supabase.from("musabaqah_competitions" as any).update({ scope_config: newConfig } as any).eq("id", competition.id);
    if (error) {
      // Roll back local state if the DB write failed so we don't show a state
      // that isn't actually persisted (would be lost on refresh / to other users).
      setCompetition(c=>c&&c.id===competition.id?{...c,scope_config:competition.scope_config}:c);
      toast({ title: "Couldn't save video setting", description: error.message, variant: "destructive" });
    }
  };

  const createCompetition = async () => {
    if (!form.title.trim()) { toast({title:"Enter a title"}); return; }
    // The start date & time is mandatory — registered students count down to it and only
    // see the Join button once it arrives.
    if (!form.session_start_at) { toast({title:"Set the competition start date & time",description:"Students see a countdown to this moment.",variant:"destructive"}); return; }
    const startMs = new Date(form.session_start_at).getTime();
    if (!(startMs > Date.now())) { toast({title:"Start time must be in the future",variant:"destructive"}); return; }
    if (form.registration_deadline && new Date(form.registration_deadline).getTime() > startMs) {
      toast({title:"Registration deadline must be before the start time",variant:"destructive"}); return;
    }
    setLoading(true);
    const room_code=genCode();
    const customQList = form.use_custom_q ? form.custom_questions.split("\n").map(s=>s.trim()).filter(Boolean) : [];
    // Juz / Hizb / custom-range need their ayah pool fetched from the Quran API up front
    // (once), then cached on the competition so every tile-build after this is instant
    // and works offline.
    let scopePool: any[] = [];
    const mixPages = parsePageList(form.mix_pages);
    if (form.scope_type==="mix" && !form.use_custom_q && form.mix_juz.length===0 && form.mix_surahs.length===0 && mixPages.length===0) {
      setLoading(false);
      toast({title:"Pick something for the mix",description:"Select at least one Juz, Surah or page range.",variant:"destructive"});
      return;
    }
    if (["juz","hizb","custom_range","mix"].includes(form.scope_type) && !form.use_custom_q) {
      scopePool = await fetchScopePool(form.scope_type, {
        mix_juz: form.mix_juz, mix_surahs: form.mix_surahs, mix_pages: mixPages,
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
        tiles_per_stage: form.tiles_per_stage, custom_questions: customQList, scope_pool: [], ...compactScopePool(scopePool),
        mix_juz: form.mix_juz, mix_surahs: form.mix_surahs, mix_pages: mixPages,
        juz_number: form.juz_number, hizb_number: form.hizb_number,
        range_surah_start: form.range_surah_start, range_ayah_start: form.range_ayah_start,
        range_surah_end: form.range_surah_end, range_ayah_end: form.range_ayah_end,
        judge_codes: [genCode(), genCode()],
        video_enabled: true,
      },
      total_stages:form.total_stages,current_stage:1,time_limit_seconds:form.time_limit,
      status:"open",room_code,created_by:user?.id,use_criteria_scoring:form.use_criteria,
      registration_deadline: form.registration_deadline ? new Date(form.registration_deadline).toISOString() : null,
      registration_override: "auto",
      session_start_at: new Date(form.session_start_at).toISOString(),
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
    if (participant.status==="pending" && needsWaitingGate(comp)) { setView("registered"); return; }
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
    if (needsWaitingGate(compRow)) {
      setView("registered");
      toast({title:"🎉 Successfully registered!",description:"You'll wait here with a countdown — the Join button appears when the competition starts."});
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
  const setSessionStartTime = async (overrideIso?:string) => {
    if (!competition) return;
    const iso = overrideIso || (sessionTimeInput ? new Date(sessionTimeInput).toISOString() : "");
    if (!iso) return;
    setLoading(true);
    const { error } = await supabase.from("musabaqah_competitions" as any).update({ session_start_at: iso } as any).eq("id", competition.id);
    setLoading(false);
    if (error) { toast({title:"Couldn't set session time", description:error.message, variant:"destructive"}); return; }
    setCompetition(c => c ? { ...c, session_start_at: iso } : c);
    const when = new Date(iso).toLocaleString("en",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
    toast(overrideIso
      ? {title:"▶ Session started", description:"Registered participants can join now."}
      : {title:"⏰ Session time set", description:`Participants will see a countdown to ${when}.`});
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

  // One-tap entry once the start time has arrived. Re-checks the start time against the
  // database first, so a participant can't get in early on a stale screen.
  const joinNow = async () => {
    if (!competition || !myParticipant) return;
    setLoading(true);
    const {data:fresh} = await supabase.from("musabaqah_competitions" as any).select("*").eq("id",competition.id).maybeSingle();
    const comp = (fresh ? { ...competition, ...(fresh as any) } : competition) as Competition;
    setCompetition(comp);
    if (!sessionStarted(comp)) {
      setLoading(false);
      toast({title:"Not started yet",description:"The start time was moved — keep this page open.",variant:"destructive"});
      return;
    }
    let status = myParticipant.status;
    if (status==="pending") {
      await supabase.from("musabaqah_participants" as any).update({status:"waiting"}).eq("id",myParticipant.id);
      status = "waiting";
    }
    setLoading(false);
    setMyParticipant({ ...myParticipant, status });
    setView("arena"); await fetchLkToken(comp.room_code);
    toast({title:`👋 Welcome, ${myParticipant.participant_name}!`});
  };

  // Participant enters their personal access code (fallback, e.g. joining from another device).
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
  const buildEditForm = (c: Competition) => {
    const cfg:any = c.scope_config || {};
    return {
      title:c.title, description:c.description||"", scope_type:c.scope_type,
      total_stages:c.total_stages, time_limit:c.time_limit_seconds, use_criteria:c.use_criteria_scoring ?? true,
      tiles_per_stage:cfg.tiles_per_stage ?? 10, use_custom_q:false, custom_questions:"",
      juz_number:cfg.juz_number ?? 1, hizb_number:cfg.hizb_number ?? 1,
      range_surah_start:cfg.range_surah_start ?? 1, range_ayah_start:cfg.range_ayah_start ?? 1,
      range_surah_end:cfg.range_surah_end ?? 1, range_ayah_end:cfg.range_ayah_end ?? 7,
      mix_juz:(cfg.mix_juz||[]) as number[], mix_surahs:(cfg.mix_surahs||[]) as number[],
      mix_pages:compactPageList(cfg.mix_pages||[]), mix_surah_q:"", mix_random_n:5,
      registration_deadline:toLocalInput(c.registration_deadline), session_start_at:toLocalInput(c.session_start_at),
      registration_override:c.registration_override || "auto", juz_options:(c.juz_options||[]) as number[],
    };
  };

  // Save the registration-time details (title, scope, stages, timer, deadline, start time…).
  // Re-fetches the ayah pool only when the scope itself actually changed.
  const saveCompetitionDetails = async () => {
    if (!competition || !editForm) return;
    const ef = editForm;
    if (!ef.title.trim()) { toast({title:"Enter a title"}); return; }
    if (!ef.session_start_at) { toast({title:"Start date & time is required",variant:"destructive"}); return; }
    const startMs = new Date(ef.session_start_at).getTime();
    if (ef.registration_deadline && new Date(ef.registration_deadline).getTime() > startMs) {
      toast({title:"Registration deadline must be before the start time",variant:"destructive"}); return;
    }
    if (ef.total_stages < competition.current_stage) {
      toast({title:`Can't go below the current stage (${competition.current_stage})`,variant:"destructive"}); return;
    }
    const mixPages = parsePageList(ef.mix_pages);
    if (ef.scope_type==="mix" && !ef.mix_juz.length && !ef.mix_surahs.length && !mixPages.length) {
      toast({title:"Pick something for the mix",description:"Select at least one Juz, Surah or page range.",variant:"destructive"}); return;
    }
    setSavingDetails(true);
    const cfgOld:any = competition.scope_config || {};
    const sig = (v:any) => JSON.stringify([v.scope_type,v.juz_number,v.hizb_number,v.range_surah_start,v.range_ayah_start,v.range_surah_end,v.range_ayah_end,v.mix_juz,v.mix_surahs,v.mix_pages]);
    const oldSig = sig({scope_type:competition.scope_type, juz_number:cfgOld.juz_number??1, hizb_number:cfgOld.hizb_number??1,
      range_surah_start:cfgOld.range_surah_start??1, range_ayah_start:cfgOld.range_ayah_start??1, range_surah_end:cfgOld.range_surah_end??1, range_ayah_end:cfgOld.range_ayah_end??7,
      mix_juz:cfgOld.mix_juz||[], mix_surahs:cfgOld.mix_surahs||[], mix_pages:cfgOld.mix_pages||[]});
    const newSig = sig({...ef, mix_pages:mixPages});
    let poolPatch:any = {};
    if (oldSig !== newSig) {
      if (["juz","hizb","custom_range","mix"].includes(ef.scope_type)) {
        const pool = await fetchScopePool(ef.scope_type, {
          juz_number:ef.juz_number, hizb_number:ef.hizb_number,
          range_surah_start:ef.range_surah_start, range_ayah_start:ef.range_ayah_start,
          range_surah_end:ef.range_surah_end, range_ayah_end:ef.range_ayah_end,
          mix_juz:ef.mix_juz, mix_surahs:ef.mix_surahs, mix_pages:mixPages,
        });
        if (pool.length===0) {
          setSavingDetails(false);
          toast({title:"Couldn't fetch that scope",description:"Check your connection and try again.",variant:"destructive"}); return;
        }
        poolPatch = { scope_pool: [], ...compactScopePool(pool) };
      } else {
        poolPatch = { scope_pool: [], scope_pool_c: [], scope_surah_names: {} };
      }
    }
    const newConfig = { ...cfgOld, ...poolPatch,
      tiles_per_stage: ef.tiles_per_stage,
      juz_number: ef.juz_number, hizb_number: ef.hizb_number,
      range_surah_start: ef.range_surah_start, range_ayah_start: ef.range_ayah_start,
      range_surah_end: ef.range_surah_end, range_ayah_end: ef.range_ayah_end,
      mix_juz: ef.mix_juz, mix_surahs: ef.mix_surahs, mix_pages: mixPages };
    const startIso = new Date(ef.session_start_at).toISOString();
    const patch:any = {
      title: ef.title.trim(), description: ef.description.trim(), scope_type: ef.scope_type, scope_config: newConfig,
      total_stages: ef.total_stages, time_limit_seconds: ef.time_limit, use_criteria_scoring: ef.use_criteria,
      registration_deadline: ef.registration_deadline ? new Date(ef.registration_deadline).toISOString() : null,
      registration_override: ef.registration_override || "auto",
      session_start_at: startIso,
      juz_options: ef.juz_options.length ? ef.juz_options : null,
    };
    const { data, error } = await supabase.from("musabaqah_competitions" as any).update(patch).eq("id", competition.id).select().single();
    setSavingDetails(false);
    if (error) { toast({title:"Couldn't save",description:error.message,variant:"destructive"}); return; }
    const updated = data as Competition;
    setCompetition(updated);
    setCompetitions(cs => cs.map(c => c.id===updated.id ? updated : c));
    setLiveInstructions(updated.description||"");
    setJudgeTimerDuration(updated.time_limit_seconds);
    // Tell registered students if the start time moved.
    const oldStart = competition.session_start_at ? new Date(competition.session_start_at).getTime() : 0;
    if (oldStart !== new Date(startIso).getTime()) {
      const {data:roster} = await supabase.from("musabaqah_participants" as any).select("user_id,role").eq("competition_id", competition.id);
      const ids = ((roster||[]) as any[]).filter(r=>r.role!=="judge" && r.user_id).map(r=>r.user_id as string);
      if (ids.length) {
        await supabase.from("notifications" as any).insert(ids.map(uid=>({
          user_id: uid, type: "musabaqah_session_set", priority: "normal",
          title: "Musabaqah start time updated", title_ar: null,
          message: `${updated.title}: the competition starts ${fmtDT(startIso)}.`, message_ar: null,
          link: `/musabaqah/recitation?comp=${competition.id}`, is_read: false,
        })));
      }
    }
    toast({title:"✅ Competition details saved"});
  };

  const openSettings = async (comp: Competition) => {
    setCompetition(comp);
    setEditForm(buildEditForm(comp));
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

  const autoFillStage = async (stageNum: number, guide?: string) => {
    if (!competition || autoFilling) return;
    const poolSize = Math.max(1, Math.min(AUTOFILL_POOL_SIZE, autoFillCount));
    const stageKey = String(stageNum);
    const stageType: "recitation"|"tajweed"|"waqf" = stageTypes[stageKey] || "recitation";

    const builtIn = competition.scope_type === "juz30"
      ? SURAHS.filter(s => s.juz === 30)
      : competition.scope_type === "juz29" ? SURAHS.filter(s => s.juz >= 29) : SURAHS;
    const scopePool: ScopeAyah[] = getScopePool(competition.scope_config);

    // Candidate ayahs: the guide (surah names/numbers + optional ayah ranges) wins;
    // otherwise the competition's own scope.
    const guideItems = parseGuide(guide || "");
    const guided = guideToAyahs(guideItems);
    let candidates: {surah:number; ayah:number}[];
    if (guided.length > 0) candidates = guided;
    else if (scopePool.length > 0) candidates = scopePool.map(p => ({ surah: p.surah, ayah: p.ayah }));
    else candidates = builtIn.flatMap(s => Array.from({length: s.v}, (_, i) => ({ surah: s.n, ayah: i + 1 })));

    // Avoid verses already used in other stages / already asked.
    const used = new Set<string>(usedTileKeys);
    const seenText = new Set<string>();
    for (let i = 1; i <= competition.total_stages; i++) {
      if (i === stageNum && !autoFillAppend) continue;
      (stageQuestions[String(i)] || "").split("\n").forEach(l => { const t = l.trim(); if (t) seenText.add(t); });
    }

    setAutoFilling(true);
    try {
      const shuffled = [...candidates].sort(() => Math.random() - 0.5);
      const fresh = shuffled.filter(c => !used.has(`${c.surah}:${c.ayah}`));
      const base = fresh.length >= poolSize ? fresh : [...fresh, ...shuffled.filter(c => used.has(`${c.surah}:${c.ayah}`))];
      const ordered = base.slice(0, poolSize + 25);
      const texts = await resolveVerseTexts(ordered);

      const verses: string[] = [];
      for (const t of texts) {
        if (!t || seenText.has(t) || verses.includes(t)) continue;
        verses.push(t);
        if (verses.length >= poolSize) break;
      }
      if (verses.length === 0) throw new Error("no verses");

      let questions: string[];
      if (stageType === "recitation") {
        questions = verses; // the verse itself, written out — no numbers
      } else {
        const bank = stageType === "tajweed" ? TAJWEED_RULE_BANK : WAQF_SIGN_BANK;
        questions = verses.map((v, i) => stageType === "tajweed"
          ? `What tajweed rule applies in: ﴿ ${v} ﴾ (e.g. ${bank[i % bank.length]})`
          : `Is stopping permitted at the end of: ﴿ ${v} ﴾ (${bank[i % bank.length]})`);
      }

      const existing = (stageQuestions[stageKey] || "").trim();
      const merged = autoFillAppend && existing ? existing + "\n" + questions.join("\n") : questions.join("\n");
      setStageQuestions(sq => ({ ...sq, [stageKey]: merged }));
      const bad = guideItems.filter(g => !g.ok).length;
      toast({
        title: `✅ ${questions.length} verse${questions.length > 1 ? "s" : ""} written for Stage ${stageNum}`,
        description: bad ? `${bad} guide item${bad > 1 ? "s" : ""} not recognised and skipped.` : (guided.length ? "Taken from your guide." : "Taken from the competition scope."),
      });
    } catch {
      toast({
        title: "Couldn't load verse text",
        description: "Check your internet connection and try Auto-fill again (verses are fetched from alquran.cloud).",
        variant: "destructive",
      });
    } finally { setAutoFilling(false); }
  };

  /** Smart guide panel above the questions box (shared by both settings modals). */
  const renderAutoFillPanel = () => {
    if (!competition) return null;
    const st: "recitation"|"tajweed"|"waqf" = stageTypes[String(qSettingsStage)] || "recitation";
    const items = parseGuide(autoFillGuide);
    const matched = items.filter(i => i.ok);
    const scopePool: ScopeAyah[] = getScopePool(competition.scope_config);
    const scopeSurahs = [...new Set(scopePool.map(p => p.surah))];
    const suggestions = (scopeSurahs.length > 0 ? ALL_SURAHS.filter(s => scopeSurahs.includes(s.n)) :
      competition.scope_type === "juz30" ? ALL_SURAHS.filter(s => s.n >= 78) :
      competition.scope_type === "juz29" ? ALL_SURAHS.filter(s => s.n >= 67) : ALL_SURAHS).slice(0, 14);
    const addToGuide = (name: string) => setAutoFillGuide(g => {
      const parts = g.split(/[,\n،]+/).map(x => x.trim()).filter(Boolean);
      return parts.includes(name) ? g : [...parts, name].join(", ");
    });
    const chip = (active: boolean): React.CSSProperties => ({
      background: active ? `${GOLD}26` : "rgba(255,255,255,.05)", border: `1px solid ${active ? GOLD : "rgba(255,255,255,.12)"}`,
      color: active ? GOLD : "rgba(255,255,255,.6)", borderRadius: 8, padding: "4px 9px", fontSize: 11, cursor: "pointer", fontFamily: "Cairo,sans-serif", fontWeight: 700,
    });
    return (
      <div style={{background:"rgba(34,197,94,.07)",border:"1px solid rgba(34,197,94,.25)",borderRadius:12,padding:"10px 13px",marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
          <Shuffle size={13} color={GREEN} style={{flexShrink:0}}/>
          <div style={{flex:1}}>
            <div style={{color:GREEN,fontWeight:700,fontSize:12}}>Write Stage {qSettingsStage} verses</div>
            <div style={{color:"rgba(255,255,255,.4)",fontSize:10,marginTop:1,lineHeight:1.5}}>
              {st==="recitation" ? "Writes out the actual ayat — no numbers. Needs internet." : `Writes ${st} questions built on the actual ayat. Needs internet.`}
            </div>
          </div>
          <button disabled={autoFilling} onClick={()=>autoFillStage(qSettingsStage, autoFillGuide)}
            style={{background:"rgba(34,197,94,.15)",border:"1px solid rgba(34,197,94,.35)",borderRadius:9,padding:"6px 11px",cursor:autoFilling?"wait":"pointer",opacity:autoFilling?.6:1,color:GREEN,fontWeight:700,fontSize:12,fontFamily:"Cairo,sans-serif",flexShrink:0,whiteSpace:"nowrap"}}>
            {autoFilling ? "Writing…" : "Auto-fill"}
          </button>
        </div>

        <div style={{color:"rgba(255,255,255,.5)",fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Guide (optional)</div>
        <textarea value={autoFillGuide} onChange={e=>setAutoFillGuide(e.target.value)} rows={2} dir="auto"
          placeholder={"Which surahs? e.g.  Ikhlas, Falaq 1-3, 112, الفاتحة"}
          style={{width:"100%",background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",borderRadius:8,padding:"7px 10px",color:"#fff",fontSize:12,fontFamily:"Cairo,sans-serif",resize:"vertical",boxSizing:"border-box"}}/>

        {items.length > 0 && (
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:6}}>
            {items.map((it,i)=>(
              <span key={i} style={{fontSize:10,borderRadius:7,padding:"3px 8px",background:it.ok?"rgba(34,197,94,.12)":"rgba(239,68,68,.12)",color:it.ok?GREEN:"#f87171"}}>
                {it.ok ? `✓ ${it.surah!.en}${it.from?` (${it.from===it.to?it.from:`${it.from}–${it.to}`})`:` (all ${it.surah!.v})`}` : `✗ "${it.raw}" not found`}
              </span>
            ))}
          </div>
        )}
        {matched.length === 0 && (
          <div style={{color:"rgba(255,255,255,.35)",fontSize:10,marginTop:6,lineHeight:1.6}}>
            Blank = random verses from the competition scope. Tap a surah below to add it to the guide.
          </div>
        )}
        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:7}}>
          {suggestions.map(s=>(
            <button key={s.n} onClick={()=>addToGuide(s.en)} style={chip(matched.some(m=>m.surah?.n===s.n))}>{s.en}</button>
          ))}
          {autoFillGuide && <button onClick={()=>setAutoFillGuide("")} style={{...chip(false),color:"#f87171",borderColor:"rgba(239,68,68,.3)"}}>Clear guide</button>}
        </div>

        <div style={{display:"flex",alignItems:"center",gap:6,marginTop:10,flexWrap:"wrap"}}>
          <span style={{color:"rgba(255,255,255,.5)",fontSize:10,fontWeight:700}}>How many:</span>
          {[5,10,20,30].map(n=>(<button key={n} onClick={()=>setAutoFillCount(n)} style={chip(autoFillCount===n)}>{n}</button>))}
          <span style={{width:1,height:16,background:"rgba(255,255,255,.12)",margin:"0 2px"}}/>
          <button onClick={()=>setAutoFillAppend(false)} style={chip(!autoFillAppend)}>Replace</button>
          <button onClick={()=>setAutoFillAppend(true)} style={chip(autoFillAppend)}>Add to list</button>
        </div>

        <details style={{marginTop:10}}>
          <summary style={{color:GOLD,fontSize:11,cursor:"pointer",userSelect:"none",fontWeight:700}}>💡 How to set good questions</summary>
          <div style={{color:"rgba(255,255,255,.6)",fontSize:11,lineHeight:1.8,marginTop:6}}>
            <div>• <b>Pool size:</b> keep at least 3× the number of participants so nobody gets a repeated verse. Each tile draw only uses verses not yet picked.</div>
            <div>• <b>Guide formats:</b> <code>Ikhlas</code> (whole surah) · <code>Falaq 1-3</code> or <code>Falaq:1-3</code> (range) · <code>112</code> (surah number) · Arabic names work too. Separate with commas.</div>
            <div>• <b>Easy → hard:</b> Stage 1 short surahs (Ikhlas, Kawthar, Asr) → middle stages medium verses → last stage longer verses from a wider guide.</div>
            <div>• <b>Recitation:</b> the verse itself is shown to the reciter, so each line is one verse. <b>Tajweed/Waqf:</b> the judge reads the verse and marks the answer correct/wrong.</div>
            <div>• <b>Review before saving:</b> edit or delete any line, or press Auto-fill again to redraw. Nothing is saved until you tap Save All Changes.</div>
            <div>• <b>Instructions box</b> (below) is what participants read before reciting, e.g. “Begin with Bismillah. Recite with Tajweed.”</div>
          </div>
        <                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        