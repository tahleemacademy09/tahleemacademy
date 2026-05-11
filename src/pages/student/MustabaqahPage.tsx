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

/* ── Video grid — PiP layout: main dominant + self-view corner overlay ── */
const LiveVideoGrid = ({
  activeUserId, isJudge, isObserver, allowControls, activePStatus,
}: {
  activeUserId:string|null; isJudge:boolean; isObserver:boolean; allowControls:boolean; activePStatus?:string|null;
}) => {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants   = useRemoteParticipants();

  const getMeta = (p:any) => { try { return JSON.parse(p?.metadata||"{}"); } catch { return {}; } };
  const localMeta  = getMeta(localParticipant);
  const iAmJudge   = localMeta.role === "judge";
  const iAmActive  = !!(activeUserId && localMeta.user_id === activeUserId);

  const judgeRemote  = remoteParticipants.find(p=>getMeta(p).role==="judge");
  const activeRemote = remoteParticipants.find(p=>getMeta(p).user_id===activeUserId);
  const localPub     = localParticipant?.getTrackPublication(Track.Source.Camera);
  const judgeRemotePub   = judgeRemote?.getTrackPublication(Track.Source.Camera);
  const activeRemotePub  = activeRemote?.getTrackPublication(Track.Source.Camera);

  // ── Decide main view (dominant) and PiP self-view ──────────────────
  // Judge:  active participant dominant — self as PiP bottom-right
  // Active participant: judge dominant — self as PiP bottom-right
  // Observer / waiting: judge dominant, no PiP

  let mainPub:any, mainParticipant:any, mainName:string, mainLabel:string;
  let pipShow = false;

  if (iAmJudge) {
    // Judge sees participant as main
    mainPub = activeRemotePub;
    mainParticipant = activeRemote ?? null;
    mainName  = getMeta(activeRemote).name || (activeUserId ? "Participant" : "—");
    mainLabel = activeUserId ? `🎙️ ${mainName}` : "⚖️ Waiting for participant…";
    pipShow   = true; // judge always sees self PiP
  } else if (iAmActive) {
    // Active participant sees judge as main
    mainPub = judgeRemotePub;
    mainParticipant = judgeRemote ?? null;
    mainName  = getMeta(judgeRemote).name || "Judge";
    mainLabel = `⚖️ ${mainName}`;
    pipShow   = true; // active participant sees self PiP
  } else {
    // Observers / waiting participants: see whoever is active (judge or active p)
    if (judgeRemote || judgeRemotePub) {
      mainPub = judgeRemotePub;
      mainParticipant = judgeRemote ?? null;
      mainName  = getMeta(judgeRemote).name || "Judge";
      mainLabel = `⚖️ ${mainName}`;
    } else {
      mainPub = activeRemotePub;
      mainParticipant = activeRemote ?? null;
      mainName  = getMeta(activeRemote).name || "Live";
      mainLabel = `🎙️ ${mainName}`;
    }
    pipShow = false;
  }

  const hasMain = !!(mainPub?.videoTrack) || !!mainParticipant || iAmJudge || iAmActive;

  if (!hasMain) return (
    <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,background:"rgba(0,0,0,.6)"}}>
      <div style={{fontSize:36,opacity:.3}}>﷽</div>
      <div style={{color:"rgba(255,255,255,.25)",fontSize:12,textAlign:"center",maxWidth:220,lineHeight:1.7}}>
        {isObserver ? "Live video appears when a participant is called" : "Joining live room…"}
      </div>
    </div>
  );

  return (
    <div style={{position:"relative",width:"100%",height:"100%",background:"#000",overflow:"hidden"}}>

      {/* ── Main dominant video (full area) ── */}
      <div style={{position:"absolute",inset:0}}>
        <VideoPanel
          pub={mainPub}
          participant={mainParticipant}
          localParticipant={localParticipant}
          name={mainName}
          label={mainLabel}
        />
      </div>

      {/* ── PiP self-view — bottom-right corner ── */}
      {pipShow && (
        <div style={{
          position:"absolute",
          bottom:44,   // above the LIVE badge
          right:8,
          width:88,
          height:116,
          borderRadius:12,
          overflow:"hidden",
          border:`2px solid rgba(201,168,76,.55)`,
          boxShadow:"0 4px 20px rgba(0,0,0,.7)",
          zIndex:8,
          background:"#111",
        }}>
          {localPub?.videoTrack ? (
            <div className="musabaqah-local-video" style={{width:"100%",height:"100%"}}>
              <VideoTrack
                trackRef={{participant:localParticipant, source:Track.Source.Camera, publication:localPub}}
                style={{width:"100%",height:"100%",objectFit:"cover"}}
              />
            </div>
          ) : (
            <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:4}}>
              <div style={{width:32,height:32,borderRadius:"50%",background:`${GOLD}22`,display:"flex",alignItems:"center",justifyContent:"center",color:GOLD,fontWeight:800,fontSize:14,fontFamily:"Cairo,sans-serif"}}>
                {(localMeta.name||"?")[0]?.toUpperCase()}
              </div>
              <div style={{color:"rgba(255,255,255,.35)",fontSize:8,textAlign:"center",padding:"0 4px"}}>You</div>
            </div>
          )}
          {/* Small "YOU" label */}
          <div style={{position:"absolute",bottom:0,left:0,right:0,background:"linear-gradient(to top,rgba(0,0,0,.8),transparent)",padding:"10px 4px 3px",textAlign:"center"}}>
            <span style={{color:"rgba(255,255,255,.6)",fontSize:8,fontWeight:700,letterSpacing:.5}}>YOU</span>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Camera controls — ONLY for judge + active participant ──────── */
const CameraControls = ({ isActive, isJudge }: { isActive:boolean; isJudge:boolean }) => {
  const { localParticipant } = useLocalParticipant();
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);

  useEffect(() => {
    if (isJudge) {
      localParticipant.setCameraEnabled(true).then(()=>setCamOn(true)).catch(()=>{});
      localParticipant.setMicrophoneEnabled(true).then(()=>setMicOn(true)).catch(()=>{});
    }
  }, [isJudge]);

  useEffect(() => {
    if (isActive && !isJudge) {
      localParticipant.setMicrophoneEnabled(true).then(()=>setMicOn(true)).catch(()=>{});
      localParticipant.setCameraEnabled(true).then(()=>setCamOn(true)).catch(()=>{});
    }
  }, [isActive, isJudge]);

  return (
    <div style={{display:"flex",gap:6,justifyContent:"center"}}>
      <button onClick={async()=>{ const n=!micOn; await localParticipant.setMicrophoneEnabled(n); setMicOn(n); }}
        style={{background:micOn?`${GREEN}22`:"rgba(0,0,0,.6)",border:`1.5px solid ${micOn?GREEN:"rgba(255,255,255,.3)"}`,borderRadius:8,padding:"4px 8px",cursor:"pointer",color:micOn?GREEN:"rgba(255,255,255,.7)",display:"flex",flexDirection:"column",alignItems:"center",gap:1,fontFamily:"Cairo,sans-serif",fontWeight:700,minWidth:40,transition:"all .2s"}}>
        {micOn?<Mic size={12}/>:<MicOff size={12}/>}
        <span style={{fontSize:8,lineHeight:1.2}}>{micOn?"On":"Mute"}</span>
      </button>
      <button onClick={async()=>{ const n=!camOn; await localParticipant.setCameraEnabled(n); setCamOn(n); }}
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
}
interface Participant {
  id:string; competition_id:string; user_id?:string; participant_name:string; school?:string;
  queue_position:number; status:PStatus; total_score:number; stage_scores:Record<string,number>;
  bell_counts:Record<string,number>; proctor_flagged:boolean; camera_on:boolean; created_at:string;
}
interface Attempt {
  id:string; competition_id:string; participant_id:string; stage_number:number;
  scope_label:string; scope_label_ar:string; bell_count:number; score_breakdown?:Record<string,number>;
  judge_score?:number; judge_comment?:string; duration_seconds?:number; status:"pending"|"reciting"|"scored"; created_at:string;
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

  type View = "list"|"setup"|"join"|"role_select"|"arena"|"results";
  const [view,         setView]         = useState<View>("list");
  const [userRole,     setUserRole]     = useState<"judge"|"participant"|"observer"|null>(null);
  const [loading,      setLoading]      = useState(false);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competition,  setCompetition]  = useState<Competition|null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [attempts,     setAttempts]     = useState<Attempt[]>([]);
  const [myParticipant,setMyParticipant]= useState<Participant|null>(null);
  const [onlineUsers,  setOnlineUsers]  = useState<{name:string;role:string}[]>([]);
  const [activeP,        setActiveP]       = useState<Participant|null>(null);
  const [currentAttempt, setCurAttempt]    = useState<Attempt|null>(null);
  const [bellCount,      setBellCount]     = useState(0);
  const [bellFlash,      setBellFlash]     = useState(false);
  const [stopFlash,      setStopFlash]     = useState(false);
  // Countdown timer
  const [timerActive,    setTimerActive]   = useState(false);
  const [timerSecs,      setTimerSecs]     = useState(0);      // counts DOWN
  const [judgeTimerDuration, setJudgeTimerDuration] = useState(300); // judge-set duration per student
  const [timerExpired,   setTimerExpired]  = useState(false);
  const [elapsedSecs,    setElapsedSecs]   = useState(0);      // for display/DB
  const [judgeTab,       setJudgeTab]      = useState<"controls"|"roster">("roster");
  const [rosterMode,     setRosterMode]    = useState<"list"|"grid">("list");
  const [showScorePanel, setShowScore]     = useState(false);
  const [scoreBreak,     setScoreBreak]    = useState<Record<string,string>>({tajweed:"",memorize:"",fluency:"",voice:""});
  const [judgeComment,   setJudgeComment]  = useState("");
  const [copyFlash,      setCopyFlash]     = useState(false);
  const [deleteModal,    setDeleteModal]   = useState<Competition|null>(null);
  const [audioReady,     setAudioReady]    = useState(false);
  const [stageTiles,     setStageTiles]    = useState<Tile[]>([]);
  const [pickedTile,     setPickedTile]    = useState<Tile|null>(null);
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
  const [form, setForm] = useState({title:"",description:"",scope_type:"juz30",total_stages:5,time_limit:300,use_criteria:true,tiles_per_stage:10,use_custom_q:false,custom_questions:""});
  const [joinForm, setJoinForm] = useState({room_code:"",name:profile?.full_name||"",school:profile?.school||""});

  // ── Q-Settings panel (live editing of questions from arena) ──────
  const [showQSettings,    setShowQSettings]    = useState(false);
  const [qSettingsTab,     setQSettingsTab]     = useState<"manual"|"ai">("manual");
  const [qSettingsStage,   setQSettingsStage]   = useState<number>(1); // which stage's questions are being edited
  const [stageQuestions,   setStageQuestions]   = useState<Record<string,string>>({}); // stageNum -> newline-separated questions
  const [liveCustomQ,      setLiveCustomQ]      = useState("");   // editable custom questions text (all-stages fallback)
  const [aiPrompt,         setAiPrompt]         = useState("");
  const [aiQCount,         setAiQCount]         = useState(10);
  const [aiGenLoading,     setAiGenLoading]     = useState(false);
  const [liveInstructions, setLiveInstructions] = useState("");   // per-competition instructions shown with question
  const [tilePickerCollapsed, setTilePickerCollapsed] = useState(false); // collapse tile grid to icon after pick

  const channelRef       = useRef<any>(null);
  const timerRef         = useRef<any>(null);
  const myParticipantRef = useRef<Participant|null>(null);
  const competitionRef   = useRef<Competition|null>(null);
  const elapsedRef       = useRef(0);  // for accurate elapsed tracking independent of timer direction

  useEffect(()=>{ myParticipantRef.current=myParticipant; },[myParticipant]);
  useEffect(()=>{ competitionRef.current=competition; },[competition]);

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
  const loadCompetitions = async () => {
    const {data} = await supabase.from("musabaqah_competitions" as any).select("*").order("created_at",{ascending:false});
    if (data) setCompetitions(data as Competition[]);
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

  useEffect(()=>{ if (competition) { loadParticipants(); loadAttempts(); } },[competition]);

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

  useEffect(()=>{
    if (!competition) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    const ch = supabase.channel(`musabaqah:${competition.id}`,{config:{broadcast:{ack:false}}})
      .on("broadcast",{event:"BELL"},({payload}:any)=>{
        setBellFlash(true); setBellCount(payload.count??0);
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
        setBellCount(0); setTimerSecs(0); setElapsedSecs(0); elapsedRef.current=0;
        setTimerExpired(false); setShowScore(false);
        setPickedTile(null); setStageTiles([]); setAyahText(null); setPickerParticipantId(null);
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
        setStageTiles(payload.tiles??[]); setPickedTile(null); setAyahText(null);
        setShowTilePicker(true); setPickerParticipantId(payload.picker_participant_id??null);
      })
      .on("broadcast",{event:"QUESTION_PICKED"},({payload}:any)=>{
        const tile=payload.tile as Tile; setPickedTile(tile);
        if (tile?.surah>0) fetchAyah(tile.surah,tile.ayah);
        getACtx().state==="running"?playTilePick():getACtx().resume().then(playTilePick);
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
        const mine=myParticipantRef.current;
        if (payload.participant_id===mine?.id) {
          setMyParticipant(p=>p?{...p,status:"completed",total_score:(p.total_score||0)+payload.score}:p);
          toast({title:`🏆 Your score: ${payload.score} pts`});
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
      .on("postgres_changes" as any,{event:"*",schema:"public",table:"musabaqah_participants",filter:`competition_id=eq.${competition.id}`},()=>{ loadParticipants(); })
      .subscribe(async()=>{
        const myName=myParticipantRef.current?.participant_name||profile?.full_name||"Guest";
        const myR=isJudge?"judge":myParticipantRef.current?"participant":"observer";
        await ch.track({name:myName,role:myR,user_id:user?.id});
      });
    ch.on("presence",{event:"sync"},()=>{
      const state=ch.presenceState() as Record<string,any[]>;
      setOnlineUsers(Object.values(state).flat().map((u:any)=>({name:u.name||"Guest",role:u.role||"observer"})));
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

  const buildTiles = (comp: Competition): Tile[] => {
    const count = comp.scope_config?.tiles_per_stage ?? 10;
    const stageKey = String(comp.current_stage);

    // 1. Prefer per-stage questions from the live editor
    const stageLive = stageQuestions[stageKey]?.split("\n").map(s=>s.trim()).filter(Boolean) ?? [];
    const stageDb: string[] = comp.scope_config?.stage_questions?.[stageKey] ?? [];
    const stageSpecific = stageLive.length > 0 ? stageLive : stageDb;
    if (stageSpecific.length > 0) {
      return Array.from({length: Math.min(count, stageSpecific.length)}, (_,i) => ({
        num: i+1, label: stageSpecific[i], labelAr: "",
        surah: 0, ayah: 0, surahName: "", surahAr: "",
      }));
    }

    // 2. Fall back to flat custom questions (all-stages list, sliced by stage)
    const liveList = liveCustomQ.split("\n").map(s=>s.trim()).filter(Boolean);
    const customs: string[] = liveList.length > 0 ? liveList : (comp.scope_config?.custom_questions ?? []);
    if (customs.length > 0) {
      const stageOffset = (comp.current_stage - 1) * count;
      const slice = customs.slice(stageOffset, stageOffset + count);
      const effective = slice.length > 0 ? slice : customs.slice(0, count);
      return Array.from({length: Math.min(count, effective.length)}, (_,i) => ({
        num: i+1, label: effective[i] ?? genQuestion(comp.scope_type).label, labelAr: "",
        surah: 0, ayah: 0, surahName: "", surahAr: "",
      }));
    }

    // 3. Fall back to random Quran passages
    return genTiles(comp.scope_type, count);
  };

  // ── JUDGE ACTIONS ────────────────────────────────────────────────

  const callParticipant = async (p:Participant) => {
    if (!competition) return;
    setBellCount(0); setTimerSecs(judgeTimerDuration); setElapsedSecs(0); elapsedRef.current=0;
    setTimerExpired(false); setShowScore(false);
    setScoreBreak({tajweed:"",memorize:"",fluency:"",voice:""}); setJudgeComment("");
    setPickedTile(null); setAyahText(null);
    setTilePickerCollapsed(false);
    const tiles = buildTiles(competition);
    setStageTiles(tiles); setShowTilePicker(true);
    // Broadcast immediately (no await)
    broadcast("CALLED",{participant_id:p.id,participant_name:p.participant_name});
    broadcast("TILES_SHOWN",{tiles,stage:competition.current_stage,picker_participant_id:p.id});
    playCalled();
    setActiveP({...p, status:"called"}); setCompetition(c=>c?{...c,current_participant_id:p.id}:c);
    setJudgeTab("controls");
    // DB async — no blocking
    supabase.from("musabaqah_participants" as any).update({status:"called"}).eq("id",p.id);
    supabase.from("musabaqah_competitions" as any).update({current_participant_id:p.id}).eq("id",competition.id);
  };

  const pickTile = (tile:Tile) => {
    setPickedTile(tile);
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
      stage_number:competition.current_stage,
      scope_label:pickedTile.label, scope_label_ar:pickedTile.labelAr,
      bell_count:0, status:"reciting",
    }).select().single();
    if (att) setCurAttempt(att as Attempt);
    setActiveP(p=>p?{...p,status:"reciting"}:p);
  };

  // ✅ Bell — INSTANT: sound + broadcast first, DB async
  const ringBell = () => {
    const n=bellCount+1;
    setBellCount(n);           // state
    playBell();                // sound — instant
    setBellFlash(true);        // visual
    setTimeout(()=>setBellFlash(false),2500);
    broadcast("BELL",{count:n}); // network broadcast — fast (no await)
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

  const submitScore = async () => {
    if (!activeP || !competition) return;
    if (submittingScore) return;
    setSubmittingScore(true);
    try {
      let attempt = currentAttempt;
      // If no attempt record exists (e.g. after page reload), create one now
      if (!attempt) {
        const { data: att } = await supabase.from("musabaqah_attempts" as any).insert({
          competition_id: competition.id,
          participant_id: activeP.id,
          stage_number: competition.current_stage,
          scope_label: pickedTile?.label || "Manual entry",
          scope_label_ar: pickedTile?.labelAr || "",
          bell_count: bellCount,
          status: "reciting",
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
      total = Math.max(0, total - bellCount * 2);
      await supabase.from("musabaqah_attempts" as any).update({
        judge_score: total, score_breakdown: breakdown,
        judge_comment: judgeComment, bell_count: bellCount, status: "scored",
      } as any).eq("id", attempt.id);
      const newTotal = (activeP.total_score || 0) + total;
      await supabase.from("musabaqah_participants" as any).update({
        status: "completed", total_score: newTotal,
        stage_scores: { ...(activeP.stage_scores || {}), [competition!.current_stage]: total },
      } as any).eq("id", activeP.id);
      broadcast("SCORE_SUBMITTED", { participant_id: activeP.id, score: total });
      toast({ title: `✅ Score saved: ${total} pts` });
      setActiveP(null); setCurAttempt(null); setShowScore(false);
      setBellCount(0); setTimerSecs(0); setElapsedSecs(0); elapsedRef.current = 0;
      setTimerActive(false); setTimerExpired(false);
      setShowTilePicker(false); setPickedTile(null); setAyahText(null);
      setJudgeTab("roster"); loadParticipants(); loadAttempts();
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingScore(false);
    }
  };

  const advanceStage = async () => {
    if (!competition) return;
    const next=competition.current_stage+1;
    if (next>competition.total_stages) {
      await supabase.from("musabaqah_competitions" as any).update({status:"completed",current_participant_id:null}).eq("id",competition.id);
      broadcast("COMPETITION_END"); setView("results"); return;
    }
    await supabase.from("musabaqah_participants" as any).update({status:"waiting"}).eq("competition_id",competition.id);
    await supabase.from("musabaqah_competitions" as any).update({current_stage:next,current_participant_id:null}).eq("id",competition.id);
    setCompetition(c=>c?{...c,current_stage:next,current_participant_id:null}:c);
    broadcast("STAGE_CHANGE",{stage:next});
    toast({title:`🎯 Stage ${next} begins!`}); loadParticipants();
  };

  const terminateSession = async () => {
    if (!competition) return;
    const ok = window.confirm("End this session for all participants? This cannot be undone.");
    if (!ok) return;
    await supabase.from("musabaqah_competitions" as any).update({ status: "completed", current_participant_id: null } as any).eq("id", competition.id);
    broadcast("COMPETITION_END");
    localStorage.removeItem("musabaqah_session");
    setView("results");
  };

  const startCompetition = async () => {
    if (!competition) return;
    await supabase.from("musabaqah_competitions" as any).update({status:"active"}).eq("id",competition.id);
    setCompetition(c=>c?{...c,status:"active"}:c);
    broadcast("COMP_START", {});
    setJudgeTab("controls"); // jump straight to Controls so Call button is visible
    toast({title:"🎯 Competition started! Call the first participant."});
  };

  const createCompetition = async () => {
    if (!form.title.trim()) { toast({title:"Enter a title",variant:"destructive"}); return; }
    setLoading(true);
    const room_code=genCode();
    const customQList = form.use_custom_q ? form.custom_questions.split("\n").map(s=>s.trim()).filter(Boolean) : [];
    const {data,error}=await supabase.from("musabaqah_competitions" as any).insert({
      title:form.title.trim(),description:form.description.trim(),scope_type:form.scope_type,
      scope_config:{ tiles_per_stage: form.tiles_per_stage, custom_questions: customQList },
      total_stages:form.total_stages,current_stage:1,time_limit_seconds:form.time_limit,
      status:"open",room_code,created_by:user?.id,use_criteria_scoring:form.use_criteria,
    }).select().single();
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

  const joinCompetition = async () => {
    const code=joinForm.room_code.trim().toUpperCase(), name=joinForm.name.trim();
    if (!code||!name) { toast({title:"Enter code and name",variant:"destructive"}); return; }
    setLoading(true);
    const {data:comp,error:compErr}=await supabase.from("musabaqah_competitions" as any).select("*").eq("room_code",code).maybeSingle();
    if (compErr||!comp) { toast({title:"Not found",description:`No competition: ${code}`,variant:"destructive"}); setLoading(false); return; }
    const {data:existing}=await supabase.from("musabaqah_participants" as any).select("*").eq("competition_id",(comp as Competition).id).eq("user_id",user?.id).maybeSingle();
    if (existing) { setCompetition(comp as Competition); setMyParticipant(existing as Participant); setUserRole("participant"); setLoading(false); setView("arena"); await fetchLkToken(code); return; }
    const {count}=await supabase.from("musabaqah_participants" as any).select("id",{count:"exact",head:true}).eq("competition_id",(comp as Competition).id);
    const {data:participant,error:insertErr}=await supabase.from("musabaqah_participants" as any).insert({
      competition_id:(comp as Competition).id,user_id:user?.id||null,participant_name:name,school:joinForm.school||null,
      queue_position:(count??0)+1,status:"pending",total_score:0,stage_scores:{},bell_counts:{},proctor_flagged:false,camera_on:false,
    }).select().single();
    setLoading(false);
    if (insertErr) { toast({title:"Failed",description:insertErr.message,variant:"destructive"}); return; }
    setCompetition(comp as Competition); setMyParticipant(participant as Participant); setUserRole("participant");
    setView("arena"); await fetchLkToken(code); toast({title:"✅ Joined!"});
  };

  const openComp = async (comp:Competition) => {
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
    if (canJudge) { setView("role_select"); return; }
    const {data}=await supabase.from("musabaqah_participants" as any).select("*").eq("competition_id",comp.id).eq("user_id",user?.id).single();
    if (data) { setMyParticipant(data as Participant); setUserRole("participant"); setView("arena"); await fetchLkToken(comp.room_code); }
    else setView("role_select");
  };

  const chooseRole = async (roleId:string) => {
    setUserRole(roleId as any);
    if (roleId==="judge"||roleId==="observer") { setView("arena"); if (competition) await fetchLkToken(competition.room_code); return; }
    if (competition) {
      const {data}=await supabase.from("musabaqah_participants" as any).select("*").eq("competition_id",competition.id).eq("user_id",user?.id).single();
      if (data) { setMyParticipant(data as Participant); setView("arena"); await fetchLkToken(competition.room_code); }
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
    await supabase.from("musabaqah_participants" as any).update({ status: "waiting" }).eq("id", p.id);
    broadcast("PARTICIPANT_APPROVED", { participant_id: p.id });
    loadParticipants();
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
    setCopyFlash(true); setTimeout(()=>setCopyFlash(false),1800); toast({title:`📋 ${code}`});
  };

  const waiting = participants.filter(p=>p.status==="waiting");
  const pending = participants.filter(p=>p.status==="pending");
  const done    = participants.filter(p=>p.status==="completed");
  // allDone: no waiting, no pending, at least one participant completed, no active participant
  const allDone = waiting.length===0 && pending.length===0 && done.length>0 && !activeP;

  // Auto-switch judge to controls tab when all participants in this stage are done
  // so the "Next Stage" / "End Competition" button is immediately visible
  useEffect(() => {
    if (allDone && isJudge) setJudgeTab("controls");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone, isJudge]);

  // Auto-switch judge to Controls tab the moment competition becomes active
  useEffect(() => {
    if (competition?.status === "active" && isJudge && !activeP) setJudgeTab("controls");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competition?.status, isJudge]);
  const totalCrit = competition?.use_criteria_scoring ? SCORING_CRITERIA.reduce((s,c)=>s+(Number(scoreBreak[c.key])||0),0) : Number(scoreBreak.tajweed)||0;
  const finalScore = Math.max(0,totalCrit-bellCount*2);
  const timerWarning = timerSecs > 0 && timerSecs <= 30;
  const timerDanger  = timerSecs > 0 && timerSecs <= 10;

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
  /** Auto-fill all stages with Quran questions from the competition's scope,
   *  distributing a unique set of tiles to each stage. No AI needed. */
  const autoFillAllStages = () => {
    if (!competition) return;
    const count = competition.scope_config?.tiles_per_stage ?? 10;
    const total = competition.total_stages;
    const pool = competition.scope_type === "juz30"
      ? SURAHS.filter(s => s.juz === 30)
      : competition.scope_type === "juz29"
      ? SURAHS.filter(s => s.juz >= 29)
      : SURAHS;

    // Build a large unique pool of questions, shuffled
    const questions: string[] = [];
    // Generate up to 5x what we need to ensure uniqueness across stages
    const needed = count * total;
    const attempts = needed * 6;
    const seen = new Set<string>();
    for (let i = 0; i < attempts && questions.length < needed; i++) {
      const s = pool[Math.floor(Math.random() * pool.length)];
      const a = Math.floor(Math.random() * s.v) + 1;
      const key = `${s.n}-${a}`;
      if (!seen.has(key)) { seen.add(key); questions.push(`${s.en} — Ayah ${a}`); }
    }
    // Pad if not enough unique questions (small scope)
    while (questions.length < needed) {
      const s = pool[Math.floor(Math.random() * pool.length)];
      const a = Math.floor(Math.random() * s.v) + 1;
      questions.push(`${s.en} — Ayah ${a}`);
    }

    const newSQ: Record<string, string> = {};
    for (let i = 0; i < total; i++) {
      newSQ[String(i + 1)] = questions.slice(i * count, (i + 1) * count).join("\n");
    }
    setStageQuestions(newSQ);
    toast({ title: `✅ Generated ${count} questions for each of ${total} stages from ${competition.scope_type}` });
  };

  const generateAIQuestions = async () => {
    if (!aiPrompt.trim()) { toast({title:"Enter a prompt",variant:"destructive"}); return; }
    setAiGenLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("tahleem-ai", {
        body: {
          action: "generate",
          prompt: `Generate exactly ${aiQCount} concise Islamic recitation competition questions or passage assignments for a Quran/Islamic studies competition. Each item should be on its own line, formatted simply like: "Al-Fatiha full" or "Al-Baqarah 1-5" or "Surah Al-Ikhlas complete". No numbering, no bullets, just one item per line. Topic/scope context: ${aiPrompt}`,
        }
      });
      if (error) throw new Error(error.message);
      const raw = (data?.text || data?.content?.[0]?.text || "") as string;
      if (!raw.trim()) throw new Error("Empty response from AI");
      const lines = raw.split("\n").map((s:string)=>s.replace(/^[\d\-\*\.\)]+\s*/,"").trim()).filter((s:string)=>s.length>3);
      const stageKey = String(qSettingsStage);
      const existing = (stageQuestions[stageKey]||"").trim();
      const merged = existing ? existing + "\n" + lines.join("\n") : lines.join("\n");
      setStageQuestions(sq=>({...sq, [stageKey]: merged}));
      setQSettingsTab("manual");
      toast({ title: `✨ Generated ${lines.length} questions for Stage ${qSettingsStage} — review & save` });
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
            {isJudge&&<button className="gold-btn" onClick={()=>setView("setup")} style={{flex:1,color:G,border:"none",borderRadius:14,padding:"14px 0",fontWeight:800,cursor:"pointer",fontSize:15,fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Plus size={18}/> New Competition</button>}
            <button onClick={()=>setView("join")} style={{flex:1,background:"rgba(255,255,255,.07)",color:"#fff",border:"1.5px solid rgba(201,168,76,.3)",borderRadius:14,padding:"14px 0",fontWeight:700,cursor:"pointer",fontSize:15,fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><LogIn size={18}/> Join with Code</button>
            <button onClick={loadCompetitions} style={{background:"rgba(255,255,255,.06)",color:"rgba(255,255,255,.4)",border:"1.5px solid rgba(255,255,255,.1)",borderRadius:14,padding:"14px 16px",cursor:"pointer"}}><RefreshCw size={16}/></button>
          </div>
          {shown.length===0 ? (
            <div className="stagger-3 glass-card" style={{textAlign:"center",padding:"48px 24px",borderRadius:20,color:"rgba(255,255,255,.3)"}}>
              <Trophy size={44} color="rgba(201,168,76,.2)" style={{marginBottom:12}}/>
              <p style={{margin:0,fontWeight:600}}>No active competitions</p>
              {isJudge&&<p style={{margin:"6px 0 0",fontSize:13,opacity:.6}}>Create one to get started</p>}
            </div>
          ) : shown.map((c,i)=>(
            <div key={c.id} onClick={()=>openComp(c)} className={`glass-card stagger-${Math.min(i+2,5)}`}
              style={{borderRadius:18,padding:"16px 18px",cursor:"pointer",border:`1.5px solid rgba(201,168,76,${c.status==="active"?.55:.18})`,display:"flex",alignItems:"center",gap:12,marginBottom:12,boxShadow:c.status==="active"?"0 0 30px rgba(201,168,76,.15)":"none"}}>
              <div style={{width:48,height:48,borderRadius:14,flexShrink:0,background:c.status==="active"?`linear-gradient(135deg,${GOLD},${GOLDD})`:c.status==="completed"?"rgba(96,165,250,.15)":"rgba(255,255,255,.08)",border:`1.5px solid ${c.status==="active"?GOLD:c.status==="completed"?"rgba(96,165,250,.35)":"rgba(201,168,76,.2)"}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                {c.status==="active"?<Radio size={22} color={G}/>:c.status==="completed"?<Award size={22} color="#60a5fa"/>:<Trophy size={22} color={GOLD}/>}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4,flexWrap:"wrap"}}>
                  <span style={{color:"#fff",fontWeight:700,fontSize:14}}>{c.title}</span>
                  <span style={{padding:"2px 9px",borderRadius:20,fontSize:10,fontWeight:700,background:c.status==="active"?`${GREEN}22`:c.status==="open"?`${GOLD}22`:"rgba(255,255,255,.08)",color:c.status==="active"?GREEN:c.status==="open"?GOLD:"rgba(255,255,255,.35)",border:`1px solid ${c.status==="active"?GREEN:c.status==="open"?GOLD:"rgba(255,255,255,.1)"}`}}>
                    {c.status==="active"?"🔴 LIVE":c.status==="open"?"🟢 OPEN":c.status==="completed"?"✅ DONE":c.status.toUpperCase()}
                  </span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{color:"rgba(255,255,255,.35)",fontSize:11}}>Stage {c.current_stage}{'/'}{c.total_stages}</span>
                  <span style={{color:"rgba(255,255,255,.15)"}}>·</span>
                  <button onClick={e=>copyCode(c.room_code,e)} style={{background:"none",border:"none",padding:0,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                    <span style={{color:GOLD,fontWeight:800,letterSpacing:2,fontSize:12}}>{c.room_code}</span>
                    <span style={{fontSize:10,color:"rgba(201,168,76,.5)"}}>📋</span>
                  </button>
                </div>
              </div>
              {canJudge&&<button onClick={e=>{e.stopPropagation();setDeleteModal(c);}} style={{background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.25)",borderRadius:9,padding:"7px 9px",cursor:"pointer",color:RED}}>🗑️</button>}
              <ChevronRight size={16} color="rgba(255,255,255,.2)"/>
            </div>
          ))}
          {isJudge&&<div className="stagger-5" style={{marginTop:8,background:"rgba(201,168,76,.06)",border:"1px solid rgba(201,168,76,.15)",borderRadius:14,padding:"12px 16px",display:"flex",gap:10,alignItems:"flex-start"}}>
            <Crown size={15} color={GOLD} style={{flexShrink:0,marginTop:2}}/>
            <p style={{color:"rgba(255,255,255,.45)",fontSize:12,margin:0,lineHeight:1.7}}><strong style={{color:GOLD}}>Judge mode:</strong> Create competitions, call participants, reveal questions, ring bell, score recitations in real time.</p>
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
              {[5,8,10,12,15,20].map(n=>(
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
        <div style={{marginBottom:16}}>
          <Label>Room Code</Label>
          <input value={joinForm.room_code} onChange={e=>setJoinForm(f=>({...f,room_code:e.target.value.toUpperCase()}))} placeholder="AB3XY7" maxLength={6}
            style={{width:"100%",background:"rgba(201,168,76,.08)",border:"2px solid rgba(201,168,76,.4)",borderRadius:14,padding:"16px 20px",color:GOLD,fontSize:28,fontWeight:900,letterSpacing:10,textAlign:"center",textTransform:"uppercase"}}/>
        </div>
        <Inp label="Your Full Name" value={joinForm.name} onChange={(e:any)=>setJoinForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Ahmad Muhammad"/>
        <Inp label="School / Institute (optional)" value={joinForm.school} onChange={(e:any)=>setJoinForm(f=>({...f,school:e.target.value}))} placeholder="e.g. Tahleem Academy"/>
        <button className="gold-btn" onClick={joinCompetition} disabled={loading} style={{width:"100%",color:G,border:"none",borderRadius:14,padding:"16px",fontWeight:800,cursor:loading?"not-allowed":"pointer",fontSize:16,fontFamily:"Cairo,sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8,opacity:loading?.7:1,marginTop:8}}>
          {loading?<Loader2 size={18} style={{animation:"spin 1s linear infinite"}}/>:<LogIn size={18}/>}{loading?"Joining...":"Join Competition"}
        </button>
      </div>
    </div>
  );

  /* ── ROLE SELECT ── */
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
    const sorted=[...participants].sort((a,b)=>b.total_score-a.total_score);
    const medals=["🥇","🥈","🥉"]; const pColors=[GOLD,"#aaa","#b87333"];
    return (
      <div style={{minHeight:"100vh",position:"relative",fontFamily:"Cairo,sans-serif",overflowY:"auto",paddingBottom:60}}>
        <GlobalStyles/><IslamicBackground/>
        <div style={{position:"relative",zIndex:1,maxWidth:600,margin:"0 auto",padding:"40px 16px 0"}}>
          <div className="anim-slide-up" style={{textAlign:"center",marginBottom:36}}>
            <div style={{fontSize:64,marginBottom:8,animation:"floatUp 4s ease-in-out infinite"}}>🏆</div>
            <h1 style={{fontFamily:"Cinzel,serif",color:GOLD,fontSize:28,margin:"0 0 4px",fontWeight:700}}>Final Results</h1>
            <p style={{color:"rgba(255,255,255,.4)",margin:0,fontSize:13}}>{competition?.title} · {competition?.total_stages} Stages</p>
          </div>
          {sorted.length>=1&&(
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
          <div className="glass-card" style={{borderRadius:20,overflow:"hidden",marginBottom:24}}>
            {sorted.map((p,i)=>(
              <div key={p.id} style={{padding:"12px 20px",borderBottom:"1px solid rgba(255,255,255,.05)",display:"flex",alignItems:"center",gap:12,background:i<3?"rgba(201,168,76,.04)":"transparent"}}>
                <span style={{width:28,textAlign:"center",color:i<3?GOLD:"rgba(255,255,255,.25)",fontWeight:800}}>{i<3?medals[i]:`#${i+1}`}</span>
                <Avatar name={p.participant_name} size={34} active={i===0}/>
                <div style={{flex:1,minWidth:0}}><div style={{color:"#fff",fontWeight:600,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.participant_name}</div>{p.school&&<div style={{color:"rgba(255,255,255,.3)",fontSize:11}}>{p.school}</div>}</div>
                <div style={{display:"flex",gap:4}}>
                  {Array.from({length:competition?.total_stages||5},(_,si)=>(
                    <div key={si} style={{background:"rgba(255,255,255,.05)",borderRadius:6,padding:"2px 7px",textAlign:"center",fontSize:11}}>
                      <div style={{color:GOLD,fontWeight:700}}>{(p.stage_scores||{})[si+1]??"-"}</div>
                      <div style={{color:"rgba(255,255,255,.2)",fontSize:9}}>S{si+1}</div>
                    </div>
                  ))}
                </div>
                <div style={{color:GOLD,fontWeight:900,fontSize:18,minWidth:40,textAlign:"right"}}>{p.total_score}</div>
              </div>
            ))}
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
          <LiveVideoGrid activeUserId={activeP?.user_id??null} isJudge={isJudge} isObserver={isObserver} allowControls={true} activePStatus={activeP?.status??null}/>,
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
            <span style={{color:"rgba(255,255,255,.3)",fontSize:10,flexShrink:0}}>S{competition.current_stage}/{competition.total_stages}</span>
            <div style={{display:"flex",gap:2,flexShrink:0}}>
              {Array.from({length:competition.total_stages},(_,i)=>(
                <div key={i} style={{width:11,height:11,borderRadius:"50%",background:i+1<competition.current_stage?GOLD:i+1===competition.current_stage?`${GOLD}55`:"rgba(255,255,255,.07)",border:`1px solid ${i+1<=competition.current_stage?GOLD:"rgba(255,255,255,.08)"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:6,fontWeight:800,color:i+1<competition.current_stage?G:GOLD}}>
                  {i+1<competition.current_stage?"✓":""}
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

      {/* ══ ACTION BAR — immediately below video, always accessible ══ */}
      {isJudge && activeP?.status==="reciting" && (
        <div style={{flexShrink:0,display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:8,padding:"8px 12px",background:"rgba(4,12,6,.98)",borderBottom:"1px solid rgba(201,168,76,.08)"}}>
          <button onClick={ringBell} style={{background:`linear-gradient(135deg,${GOLD},#e8c96a 40%,${GOLDD})`,color:G,border:"none",borderRadius:12,padding:"13px 0",cursor:"pointer",fontWeight:900,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:6,boxShadow:"0 4px 20px rgba(201,168,76,.4)",position:"relative",userSelect:"none"}}>
            {bellCount>0&&<span style={{position:"absolute",top:5,right:7,background:RED,color:"#fff",borderRadius:"50%",width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:900}}>{bellCount}</span>}
            <Bell size={18} strokeWidth={2.5}/> Ring Bell
          </button>
          <button onClick={signalStop} style={{background:`linear-gradient(135deg,${RED},#dc2626)`,color:"#fff",border:"none",borderRadius:12,padding:"13px 0",cursor:"pointer",fontWeight:800,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:6,boxShadow:"0 4px 16px rgba(239,68,68,.3)",userSelect:"none"}}>
            <StopCircle size={16}/> Stop
          </button>
        </div>
      )}
      {isJudge && pickedTile && activeP && activeP.status!=="reciting" && activeP.status!=="completed" && (
        <div style={{flexShrink:0,padding:"8px 12px",background:"rgba(4,12,6,.98)",borderBottom:"1px solid rgba(34,197,94,.12)"}}>
          <button onClick={startReciting} style={{width:"100%",background:`linear-gradient(135deg,${GREEN}dd,#16a34a)`,color:"#fff",border:"none",borderRadius:11,padding:"13px",cursor:"pointer",fontWeight:900,fontFamily:"Cairo,sans-serif",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 4px 20px rgba(34,197,94,.35)",animation:"recitingGlow 2s ease-in-out infinite"}}>
            <Play size={18}/> ▶ Start Reciting — {activeP?.participant_name}
          </button>
        </div>
      )}
      {!isJudge && !isObserver && myParticipant?.status==="reciting" && timerActive && (
        <div style={{flexShrink:0,padding:"7px 12px",background:"rgba(4,12,6,.98)",borderBottom:"1px solid rgba(34,197,94,.12)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:GREEN,animation:"pulseRing 1s ease-in-out infinite"}}/>
            <span style={{color:GREEN,fontWeight:800,fontSize:12}}>NOW RECITING</span>
          </div>
          <div style={{color:timerDanger?RED:timerWarning?GOLD:GREEN,fontWeight:900,fontSize:20,fontFamily:"Cinzel,serif"}}>{fmt(timerSecs)}</div>
          {bellCount>0&&<div style={{color:RED,fontSize:11,fontWeight:700}}>🔔×{bellCount}</div>}
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
                    {bellCount>0&&<span style={{color:GOLD,fontSize:10}}>🔔×{bellCount} −{bellCount*2}pts</span>}
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
                        <NumberTilePicker tiles={stageTiles} pickedNum={pickedTile?.num??null} onPick={()=>{}} canPick={false} stage={competition.current_stage}/>
                      </div>
                    )}
                    {pickedTile&&(
                      <div style={{padding:"0 9px 9px"}}>
                        <QuestionDisplay tile={pickedTile} ayahText={ayahText} loadingAyah={loadingAyah} isParticipant={false} instructions={liveInstructions||undefined}/>
                        {activeP.status!=="reciting"&&activeP.status!=="completed"&&(
                          <button onClick={startReciting} style={{width:"100%",marginTop:10,background:`linear-gradient(135deg,${GREEN}dd,#16a34a)`,color:"#fff",border:"none",borderRadius:11,padding:"14px",cursor:"pointer",fontWeight:900,fontFamily:"Cairo,sans-serif",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 4px 20px rgba(34,197,94,.35)",animation:"recitingGlow 2s ease-in-out infinite"}}>
                            <Play size={18}/> ▶ Start Reciting — {activeP.participant_name}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {showScorePanel&&(
                  <div style={{background:"rgba(201,168,76,.06)",border:"1px solid rgba(201,168,76,.2)",borderRadius:12,padding:"13px"}}>
                    <div style={{color:GOLD,fontWeight:800,fontSize:13,marginBottom:10}}>📝 Score — {activeP?.participant_name}</div>
                    {competition.use_criteria_scoring ? (
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:9}}>
                        {SCORING_CRITERIA.map(c=>(
                          <div key={c.key}>
                            <div style={{color:"rgba(255,255,255,.5)",fontSize:10,marginBottom:3,display:"flex",justifyContent:"space-between"}}><span>{c.label}/{c.labelAr}</span><span style={{color:GOLD}}>/{c.max}</span></div>
                            <input type="number" min={0} max={c.max} value={scoreBreak[c.key]} onChange={e=>setScoreBreak(s=>({...s,[c.key]:e.target.value}))} placeholder={`0–${c.max}`} style={{width:"100%",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",borderRadius:7,padding:"7px 9px",color:"#fff",fontSize:14}}/>
                          </div>
                        ))}
                      </div>
                    ):(
                      <div style={{marginBottom:9}}>
                        <div style={{color:"rgba(255,255,255,.5)",fontSize:11,marginBottom:3}}>Score /100</div>
                        <input type="number" min={0} max={100} value={scoreBreak.tajweed} onChange={e=>setScoreBreak(s=>({...s,tajweed:e.target.value}))} style={{width:"100%",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",borderRadius:7,padding:"9px",color:"#fff",fontSize:16}}/>
                      </div>
                    )}
                    <input value={judgeComment} onChange={e=>setJudgeComment(e.target.value)} placeholder="Judge's comment (optional)" style={{width:"100%",background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",borderRadius:7,padding:"7px 11px",color:"#fff",fontSize:12,marginBottom:9}}/>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9}}>
                      {bellCount>0&&<span style={{color:GOLD,fontSize:11}}>⚠️ −{bellCount*2} penalty</span>}
                      <span style={{color:GREEN,fontWeight:800,fontSize:14,marginLeft:"auto"}}>Final: {finalScore}/100</span>
                    </div>
                    <button onClick={submitScore} disabled={submittingScore} style={{width:"100%",background:submittingScore?`rgba(34,197,94,.4)`:`linear-gradient(135deg,${GREEN}dd,#16a34a)`,color:"#fff",border:"none",borderRadius:9,padding:"11px",cursor:submittingScore?"not-allowed":"pointer",fontWeight:800,fontFamily:"Cairo,sans-serif",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
                      {submittingScore?<><span style={{animation:"spin .8s linear infinite",display:"inline-block"}}>⏳</span> Saving…</>:<><CheckCircle size={13}/> Submit Score</>}
                    </button>
                  </div>
                )}

                {competition.status==="active"&&allDone&&(
                  <button onClick={advanceStage} style={{background:competition.current_stage>=competition.total_stages?`linear-gradient(135deg,${GOLD},${GOLDD})`:"linear-gradient(135deg,#7c3aed,#6d28d9)",color:"#fff",border:"none",borderRadius:11,padding:"13px",cursor:"pointer",fontWeight:800,fontFamily:"Cairo,sans-serif",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
                    {competition.current_stage>=competition.total_stages?<><Trophy size={15}/> End & Show Results</>:<><ArrowRight size={15}/> Next Stage {competition.current_stage+1}</>}
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
                {/* Next Stage / End button shown here too so judge never has to hunt for it */}
                {competition.status==="active"&&allDone&&(
                  <button onClick={advanceStage} style={{width:"100%",marginBottom:10,background:competition.current_stage>=competition.total_stages?`linear-gradient(135deg,${GOLD},${GOLDD})`:"linear-gradient(135deg,#7c3aed,#6d28d9)",color:"#fff",border:"none",borderRadius:11,padding:"13px",cursor:"pointer",fontWeight:800,fontFamily:"Cairo,sans-serif",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
                    {competition.current_stage>=competition.total_stages?<><Trophy size={15}/> End & Show Results</>:<><ArrowRight size={15}/> Next Stage {competition.current_stage+1} →</>}
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
                    <div style={{color:"#a78bfa",fontSize:9,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>⏳ Awaiting Approval</div>
                    {participants.filter(p=>p.status==="pending").map(p=>(
                      <div key={p.id} style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
                        <Avatar name={p.participant_name} size={26}/>
                        <div style={{flex:1,minWidth:0}}><div style={{color:"#fff",fontWeight:700,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.participant_name}</div>{p.school&&<div style={{color:"rgba(255,255,255,.3)",fontSize:10}}>{p.school}</div>}</div>
                        <button onClick={()=>approveParticipant(p)} style={{background:"rgba(34,197,94,.15)",color:GREEN,border:`1px solid ${GREEN}44`,borderRadius:7,padding:"4px 10px",cursor:"pointer",fontWeight:700,fontSize:11,flexShrink:0,fontFamily:"Cairo,sans-serif"}}>Admit</button>
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
              </div>
            )}
            {myParticipant.status==="waiting"&&(
              <div className="glass-card" style={{borderRadius:14,padding:"18px",textAlign:"center"}}>
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
              </div>
            )}
            {myParticipant.status==="called"&&(
              <div style={{animation:"calledGlow 2s ease-in-out infinite",background:"rgba(201,168,76,.09)",border:`2px solid ${GOLD}`,borderRadius:14,padding:"13px"}}>
                <div style={{textAlign:"center",marginBottom:10}}>
                  <div style={{fontSize:28,animation:"floatUp 2s ease-in-out infinite"}}>🎙️</div>
                  <div style={{color:GOLD,fontWeight:900,fontSize:15,letterSpacing:.5,marginTop:5}}>YOU HAVE BEEN CALLED!</div>
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
                  <NumberTilePicker tiles={stageTiles} pickedNum={pickedTile?.num??null} onPick={!pickedTile?pickTile:()=>{}} canPick={!pickedTile} stage={competition.current_stage}/>
                )}
                {pickedTile&&<QuestionDisplay tile={pickedTile} ayahText={ayahText} loadingAyah={loadingAyah} isParticipant={true} instructions={liveInstructions||undefined}/>}
              </div>
            )}
            {myParticipant.status==="reciting"&&(
              <div style={{animation:"recitingGlow 2s ease-in-out infinite",background:"rgba(34,197,94,.07)",border:`2px solid ${GREEN}`,borderRadius:14,padding:"13px"}}>
                <div style={{textAlign:"center",marginBottom:9}}>
                  <div style={{fontSize:26,animation:"floatUp 1.5s ease-in-out infinite"}}>🎙️</div>
                  <div style={{color:GREEN,fontWeight:900,fontSize:15,letterSpacing:.5,marginTop:5}}>NOW RECITING</div>
                  {bellCount>0&&<div style={{color:RED,fontWeight:700,fontSize:11,marginTop:2}}>🔔 {bellCount} error{bellCount!==1?"s":""} · −{bellCount*2} pts</div>}
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
                <div style={{color:GREEN,fontWeight:800,fontSize:15}}>Recitation Complete!</div>
                <div style={{color:GOLD,fontWeight:900,fontSize:36,marginTop:5}}>{myParticipant.total_score}</div>
                <div style={{color:"rgba(255,255,255,.35)",fontSize:11}}>Total Points</div>
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
                  {/* Quick-fill banner — one click populates all stages from scope */}
                  <div style={{background:"rgba(34,197,94,.07)",border:"1px solid rgba(34,197,94,.25)",borderRadius:12,padding:"10px 13px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
                    <Shuffle size={13} color={GREEN} style={{flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <div style={{color:GREEN,fontWeight:700,fontSize:12}}>Fill all stages from Quran scope</div>
                      <div style={{color:"rgba(255,255,255,.35)",fontSize:10,marginTop:1}}>Auto-distributes unique ayahs across all {competition.total_stages} stages from {competition.scope_type}. No AI needed.</div>
                    </div>
                    <button onClick={autoFillAllStages}
                      style={{background:"rgba(34,197,94,.15)",border:"1px solid rgba(34,197,94,.35)",borderRadius:9,padding:"6px 11px",cursor:"pointer",color:GREEN,fontWeight:700,fontSize:12,fontFamily:"Cairo,sans-serif",flexShrink:0,whiteSpace:"nowrap"}}>
                      Auto-fill
                    </button>
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
                      {[5,8,10,12,15,20].map(n=>(
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
