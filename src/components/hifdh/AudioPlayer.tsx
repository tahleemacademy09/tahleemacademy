/*  src/components/hifdh/AudioPlayer.tsx  */
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { audioManager } from "./audioManager";

interface Props { userId: string | null; }
interface SurahMeta { number: number; name: string; englishName: string; numberOfAyahs: number; }
interface Ayah { number: number; numberInSurah: number; text: string; }
interface TeacherRec { teacher_name: string; audio_url: string; ayah_num: number; surah_num: number; }

const RECITERS = [
  { id:"ar.alafasy",             name:"Mishary Alafasy",        ar:"مشاري العفاسي" },
  { id:"ar.abdurrahmaansudais",  name:"Abdul Rahman Al-Sudais", ar:"عبدالرحمن السديس" },
  { id:"ar.husary",              name:"Mahmoud Al-Husary",      ar:"محمود الحصري" },
  { id:"ar.minshawi",            name:"Mohamed Al-Minshawi",    ar:"محمد المنشاوي" },
  { id:"ar.shaatree",            name:"Abu Bakr Al-Shatri",     ar:"أبو بكر الشاطري" },
  { id:"ar.abdullahbasfar",      name:"Abdullah Basfar",        ar:"عبدالله بصفر" },
];

type PlayMode = "single"|"repeat"|"readall"|"repeatall";
type SubTab   = "listen"|"personal";

export default function AudioPlayer({ userId }: Props) {
  const [subTab, setSubTab]         = useState<SubTab>("listen");
  const [surahs, setSurahs]         = useState<SurahMeta[]>([]);
  const [search, setSearch]         = useState("");
  const [selected, setSelected]     = useState<SurahMeta|null>(null);
  const [ayahs, setAyahs]           = useState<Ayah[]>([]);
  const [ayahIdx, setAyahIdx]       = useState(0);
  const [loading, setLoading]       = useState(false);

  // Reciter
  const [reciter, setReciter]       = useState(RECITERS[0]);
  const [showReciters, setShowReciters] = useState(true);
  const [showPlayback, setShowPlayback] = useState(true);
  const [useTeacher, setUseTeacher] = useState(false);
  const [teacherRecs, setTeacherRecs] = useState<TeacherRec[]>([]);

  // Playback
  const [playMode, setPlayMode]     = useState<PlayMode>("single");
  const [repeatCount, setRepeatCount] = useState(1);
  const [customRepeat, setCustomRepeat] = useState("1");
  const [repeatDone, setRepeatDone] = useState(0);
  const [isPlaying, setIsPlaying]   = useState(false);
  const [progress, setProgress]     = useState(0);
  const [durTotal, setDurTotal]     = useState(0);
  const currentIdxRef               = useRef(0);
  const progressRef                 = useRef<ReturnType<typeof setInterval>|null>(null);

  // Personal
  const [isRecording, setIsRecording] = useState(false);
  const [personalRecs, setPersonalRecs] = useState<Record<number,string>>({});
  const [playingPersonal, setPlayingPersonal] = useState<number|null>(null);
  const mediaRecRef = useRef<MediaRecorder|null>(null);
  const chunksRef   = useRef<Blob[]>([]);

  useEffect(() => {
    fetch("https://api.alquran.cloud/v1/surah").then(r=>r.json()).then(d=>{ if(d.code===200) setSurahs(d.data); });
    return () => { audioManager.stop(); if(progressRef.current) clearInterval(progressRef.current); };
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true); setAyahIdx(0); setAyahs([]); audioManager.stop(); setIsPlaying(false);
    fetch(`https://api.alquran.cloud/v1/surah/${selected.number}/ar.uthmani`)
      .then(r=>r.json()).then(d=>{ if(d.code===200) setAyahs(d.data.ayahs.map((a:any)=>({number:a.number,numberInSurah:a.numberInSurah,text:a.text}))); })
      .finally(()=>setLoading(false));
    if (userId) {
      supabase.from("hifdh_recordings").select("*").eq("student_id", userId).eq("surah_num", selected.number)
        .then(({ data }) => {
          if (!data) return;
          const map: Record<number,string> = {};
          data.forEach((r:any)=>{ if(r.audio_url) map[r.ayah_start]=r.audio_url; });
          setPersonalRecs(map);
        });
    }
    // Load teacher recordings
    supabase.from("teacher_recitations").select("teacher_name,audio_url,ayah_num,surah_num")
      .eq("surah_num", selected.number).then(({data})=>{ if(data) setTeacherRecs(data as TeacherRec[]); });
  }, [selected, userId]);

  const getAudioUrl = (idx: number) => {
    if (!ayahs[idx]) return "";
    if (useTeacher) {
      const tr = teacherRecs.find(r=>r.ayah_num===ayahs[idx].numberInSurah);
      if (tr) return tr.audio_url;
    }
    return `https://cdn.islamic.network/quran/audio/128/${reciter.id}/${ayahs[idx].number}.mp3`;
  };

  const startProgress = () => {
    if (progressRef.current) clearInterval(progressRef.current);
    progressRef.current = setInterval(()=>{
      setProgress(audioManager.currentTime);
      setDurTotal(audioManager.duration);
    }, 300);
  };

  const playAyah = (idx: number) => {
    currentIdxRef.current = idx;
    setAyahIdx(idx);
    const url = getAudioUrl(idx);
    if (!url) return;
    setRepeatDone(0);
    audioManager.play(url,
      () => handleEnd(idx),
      () => { setIsPlaying(false); if(progressRef.current) clearInterval(progressRef.current); }
    );
    setIsPlaying(true);
    startProgress();
  };

  const handleEnd = (idx: number) => {
    if (playMode==="single") { setIsPlaying(false); return; }
    if (playMode==="repeat") {
      const rc = parseInt(customRepeat)||repeatCount;
      setRepeatDone(prev=>{
        const done = prev+1;
        if (done < rc) {
          const url = getAudioUrl(idx);
          if (url) { audioManager.play(url,()=>handleEnd(idx)); startProgress(); }
          return done;
        } else {
          if (idx<(ayahs.length-1)) playAyah(idx+1);
          else setIsPlaying(false);
          return 0;
        }
      });
      return;
    }
    if (playMode==="readall"||playMode==="repeatall") {
      if (idx<ayahs.length-1) playAyah(idx+1);
      else if (playMode==="repeatall") playAyah(0);
      else setIsPlaying(false);
    }
  };

  const stopAll = () => {
    audioManager.stop(); setIsPlaying(false); setPlayingPersonal(null);
    if (progressRef.current) clearInterval(progressRef.current);
    setProgress(0);
  };

  // Personal recording
  const startPersonalRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:{ noiseSuppression:true, echoCancellation:true } });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream,{mimeType:"audio/webm"});
      mr.ondataavailable = e=>chunksRef.current.push(e.data);
      mr.onstop = async () => {
        if (!userId||!selected||!ayahs[ayahIdx]) return;
        const blob = new Blob(chunksRef.current,{type:"audio/webm"});
        const path = `${userId}/personal_${selected.number}_${ayahs[ayahIdx].numberInSurah}_${Date.now()}.webm`;
        const {data:up} = await supabase.storage.from("hifdh-recordings").upload(path,blob);
        if (up) {
          const {data:urlData} = supabase.storage.from("hifdh-recordings").getPublicUrl(path);
          const url = urlData?.publicUrl??"";
          setPersonalRecs(p=>({...p,[ayahs[ayahIdx].numberInSurah]:url}));
          await supabase.from("hifdh_recordings").upsert({ student_id:userId, surah_num:selected.number, surah_name:selected.englishName, ayah_start:ayahs[ayahIdx].numberInSurah, audio_url:url, ai_score:0, status:"pending" });
        }
        stream.getTracks().forEach(t=>t.stop());
      };
      mr.start(); mediaRecRef.current=mr; setIsRecording(true);
    } catch(_){}
  };

  const stopPersonalRec = () => {
    if (mediaRecRef.current) { try{mediaRecRef.current.stop();}catch(_){} mediaRecRef.current=null; }
    setIsRecording(false);
  };

  const playPersonal = (idx: number) => {
    const ayah = ayahs[idx];
    if (!ayah||!personalRecs[ayah.numberInSurah]) return;
    if (playingPersonal===idx) { stopAll(); return; }
    stopAll();
    setPlayingPersonal(idx);
    audioManager.play(personalRecs[ayah.numberInSurah], ()=>setPlayingPersonal(null), ()=>setPlayingPersonal(null));
  };

  const filtered = surahs.filter(s=>s.englishName.toLowerCase().includes(search.toLowerCase())||s.name.includes(search));

  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background:"#fff", border:"1px solid #e2e8f0", borderRadius:16, boxShadow:"0 1px 6px rgba(0,0,0,.05)", ...ex,
  });

  const sectionHead = (en:string, ar:string, open:boolean, toggle:()=>void) => (
    <div onClick={toggle} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", marginBottom:open?14:0 }}>
      <div style={{ flex:1, textAlign:"center" }}>
        <div style={{ fontSize:16, fontWeight:900, color:"#1a3d24" }}>{en}</div>
        <div style={{ fontSize:11, color:"#b7791f" }}>{ar}</div>
      </div>
      <div style={{ fontSize:18, color:"#7a9e88" }}>{open?"▲":"▼"}</div>
    </div>
  );

  return (
    <div style={{ padding:"18px 16px", display:"flex", flexDirection:"column", gap:16 }}>

      {/* Sub-tabs */}
      <div style={{ display:"flex", background:"#f8fafb", borderRadius:12, padding:4, border:"1px solid #e2e8f0" }}>
        {([["listen","🎧","Listen","استماع"],["personal","🎤","My Voice","صوتي"]] as const).map(([k,icon,en,ar])=>(
          <button key={k} onClick={()=>{stopAll();setSubTab(k as SubTab);}}
            style={{ flex:1, padding:"10px 8px", borderRadius:9, border:"none", fontSize:12, fontWeight:subTab===k?700:400,
              background:subTab===k?"#fff":"transparent", color:subTab===k?"#1a3d24":"#7a9e88",
              boxShadow:subTab===k?"0 1px 4px rgba(0,0,0,.08)":"none",
            }}>
            <div style={{ fontSize:18, marginBottom:2 }}>{icon}</div>
            <div style={{ fontWeight:700 }}>{en}</div>
            <div style={{ fontSize:10, color:subTab===k?"#b7791f":"#a0aec0" }}>{ar}</div>
          </button>
        ))}
      </div>

      {/* Surah Picker */}
      <div style={card({ padding:"16px" })}>
        <div style={{ textAlign:"center", marginBottom:10 }}>
          <div style={{ fontSize:17, fontWeight:900, color:"#1a3d24" }}>Select Surah</div>
          <div style={{ fontSize:12, color:"#b7791f" }}>اختر السورة</div>
          {selected && <div style={{ fontSize:13, color:"#276749", fontWeight:700, marginTop:4 }}>{selected.englishName} — {selected.name}</div>}
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…"
          style={{ width:"100%", background:"#f8fafb", border:"1px solid #e2e8f0", borderRadius:10, padding:"8px 12px", fontSize:13, color:"#1a3d24", marginBottom:10 }} />
        <div style={{ display:"flex", gap:7, overflowX:"auto", paddingBottom:4 }}>
          {filtered.slice(0,30).map(s=>(
            <div key={s.number} onClick={()=>{setSelected(s);setSearch("");stopAll();}}
              style={{ flexShrink:0, padding:"6px 13px", borderRadius:20, fontSize:11, cursor:"pointer", whiteSpace:"nowrap",
                background:selected?.number===s.number?"#1a3d24":"#f8fafb",
                color:selected?.number===s.number?"#fff":"#1a3d24",
                border:`1px solid ${selected?.number===s.number?"#1a3d24":"#e2e8f0"}`,
                fontWeight:selected?.number===s.number?700:400,
              }}>
              {s.englishName}<br/><span style={{ fontSize:9 }}>{s.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── LISTEN TAB ── */}
      {subTab==="listen" && (
        <>
          {/* Reciter Selector — collapsible */}
          <div style={card({ padding:"16px" })}>
            {sectionHead("Reciter","القارئ", showReciters, ()=>setShowReciters(v=>!v))}
            {showReciters && (
              <>
                {/* Teacher option if available */}
                {teacherRecs.length>0 && (
                  <div onClick={()=>setUseTeacher(v=>!v)}
                    style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:10, cursor:"pointer", marginBottom:8,
                      background:useTeacher?"#f0fff4":"#fffbeb", border:`1.5px solid ${useTeacher?"#9ae6b4":"#f6d860"}`,
                    }}>
                    <div style={{ width:38, height:38, borderRadius:"50%", background:useTeacher?"#1a3d24":"#fffbeb", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>👨‍🏫</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:900, color:"#1a3d24" }}>My Teacher</div>
                      <div style={{ fontSize:11, color:"#b7791f" }}>المعلم · {teacherRecs[0]?.teacher_name}</div>
                    </div>
                    {useTeacher && <div style={{ fontSize:16, color:"#276749" }}>✓</div>}
                  </div>
                )}
                {RECITERS.map(r=>(
                  <div key={r.id} onClick={()=>{setReciter(r);setUseTeacher(false);stopAll();}}
                    style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:10, cursor:"pointer", marginBottom:6,
                      background:!useTeacher&&reciter.id===r.id?"#f0fff4":"#f8fafb",
                      border:`1px solid ${!useTeacher&&reciter.id===r.id?"#9ae6b4":"#e2e8f0"}`,
                    }}>
                    <div style={{ width:36, height:36, borderRadius:"50%", background:!useTeacher&&reciter.id===r.id?"#1a3d24":"#e8f0eb", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>🎙️</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"#1a3d24" }}>{r.name}</div>
                      <div style={{ fontSize:11, color:"#7a9e88" }}>{r.ar}</div>
                    </div>
                    {!useTeacher&&reciter.id===r.id && <div style={{ fontSize:16, color:"#276749" }}>✓</div>}
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Playback Controls — collapsible */}
          <div style={card({ padding:"16px" })}>
            {sectionHead("Playback Mode","وضع التشغيل", showPlayback, ()=>setShowPlayback(v=>!v))}
            {showPlayback && (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
                  {([["single","▶","Single","مرة"],["repeat","🔂","Repeat Ayah","تكرار"],["readall","▶▶","Read All","الكل"],["repeatall","🔁","Repeat All","تكرار الكل"]] as const).map(([k,icon,en,ar])=>(
                    <div key={k} onClick={()=>setPlayMode(k)}
                      style={{ textAlign:"center", padding:"10px 8px", borderRadius:10, cursor:"pointer",
                        background:playMode===k?"#1a3d24":"#f8fafb", border:`1px solid ${playMode===k?"#1a3d24":"#e2e8f0"}`,
                      }}>
                      <div style={{ fontSize:20, marginBottom:3 }}>{icon}</div>
                      <div style={{ fontSize:12, fontWeight:900, color:playMode===k?"#fff":"#1a3d24" }}>{en}</div>
                      <div style={{ fontSize:10, color:playMode===k?"rgba(255,255,255,.7)":"#7a9e88" }}>{ar}</div>
                    </div>
                  ))}
                </div>

                {/* Custom repeat */}
                {playMode==="repeat" && (
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:"#1a3d24", marginBottom:6 }}>Repeat each ayah how many times?</div>
                    <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const }}>
                        {[1,2,3,5,7,10].map(n=>(
                          <div key={n} onClick={()=>{setRepeatCount(n);setCustomRepeat(String(n));}}
                            style={{ width:36, height:36, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:900, cursor:"pointer",
                              background:repeatCount===n&&customRepeat===String(n)?"#1a3d24":"#f8fafb",
                              color:repeatCount===n&&customRepeat===String(n)?"#fff":"#1a3d24",
                              border:`1px solid ${repeatCount===n&&customRepeat===String(n)?"#1a3d24":"#e2e8f0"}`,
                            }}>
                            {n}×
                          </div>
                        ))}
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ fontSize:12, color:"#7a9e88", fontWeight:600 }}>Custom:</span>
                        <input type="number" min={1} max={100} value={customRepeat}
                          onChange={e=>{setCustomRepeat(e.target.value);setRepeatCount(parseInt(e.target.value)||1);}}
                          style={{ width:56, background:"#f8fafb", border:"1px solid #e2e8f0", borderRadius:8, padding:"6px 8px", fontSize:14, fontWeight:900, textAlign:"center", color:"#1a3d24" }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Play/Stop */}
                {selected && ayahs.length>0 && (
                  <div style={{ display:"flex", gap:10 }}>
                    <button onClick={()=>{stopAll();playAyah(0);}} disabled={isPlaying}
                      style={{ flex:1, padding:"12px 0", borderRadius:12, background:isPlaying?"#f0f4f0":"#1a3d24", border:"none", color:isPlaying?"#7a9e88":"#fff", fontSize:14, fontWeight:900, opacity:isPlaying?.6:1, cursor:isPlaying?"not-allowed":"pointer" }}>
                      ▶ Play All
                    </button>
                    <button onClick={stopAll} disabled={!isPlaying}
                      style={{ flex:1, padding:"12px 0", borderRadius:12, background:isPlaying?"#fff5f5":"#f8fafb", border:`1px solid ${isPlaying?"#fca5a5":"#e2e8f0"}`, color:isPlaying?"#c0392b":"#7a9e88", fontSize:14, fontWeight:700, opacity:isPlaying?1:.6 }}>
                      ⏹ Stop
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Ayah List */}
          {selected && !loading && ayahs.length>0 && (
            <div style={card({ padding:"16px" })}>
              <div style={{ textAlign:"center", marginBottom:12 }}>
                <div style={{ fontSize:16, fontWeight:900, color:"#1a3d24" }}>Ayahs</div>
                <div style={{ fontSize:11, color:"#b7791f" }}>الآيات</div>
              </div>
              {/* Progress */}
              {isPlaying && durTotal>0 && (
                <div style={{ marginBottom:12 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, fontWeight:600, color:"#7a9e88", marginBottom:4 }}>
                    <span>Ayah {ayahIdx+1} {repeatDone>0?`(rep ${repeatDone+1}/${parseInt(customRepeat)||repeatCount})`:""}</span>
                    <span>{Math.round(progress)}s / {Math.round(durTotal)}s</span>
                  </div>
                  <div style={{ height:6, borderRadius:3, background:"#f0f4f0", overflow:"hidden" }}>
                    <div style={{ width:`${durTotal>0?(progress/durTotal)*100:0}%`, height:"100%", background:"#276749", transition:"width .3s linear" }} />
                  </div>
                </div>
              )}
              <div style={{ maxHeight:340, overflowY:"auto", display:"flex", flexDirection:"column", gap:4 }}>
                {ayahs.map((a,i)=>(
                  <div key={i} onClick={()=>{stopAll();playAyah(i);}}
                    style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, cursor:"pointer",
                      background:ayahIdx===i&&isPlaying?"#f0fff4":"#f8fafb",
                      border:`1px solid ${ayahIdx===i&&isPlaying?"#9ae6b4":"#e2e8f0"}`,
                    }}>
                    <div style={{ width:32, height:32, borderRadius:"50%", background:ayahIdx===i&&isPlaying?"#1a3d24":"#e8f0eb", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:900, color:ayahIdx===i&&isPlaying?"#fff":"#7a9e88", flexShrink:0 }}>
                      {ayahIdx===i&&isPlaying?"♪":a.numberInSurah}
                    </div>
                    <div style={{ fontFamily:"'Amiri Quran',serif", fontSize:18, fontWeight:700, color:"#1a3d24", direction:"rtl", flex:1, textAlign:"right", lineHeight:2 }}>
                      {a.text.length>70?a.text.substring(0,70)+"…":a.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── PERSONAL VOICE TAB ── */}
      {subTab==="personal" && (
        <div style={card({ padding:"20px" })}>
          <div style={{ textAlign:"center", marginBottom:16 }}>
            <div style={{ fontSize:18, fontWeight:900, color:"#1a3d24" }}>🎤 Record Your Voice</div>
            <div style={{ fontSize:13, color:"#b7791f" }}>سجّل صوتك</div>
            <div style={{ fontSize:12, color:"#7a9e88", marginTop:4 }}>Record each ayah and play it back like a reciter</div>
          </div>

          {!selected && (
            <div style={{ textAlign:"center", padding:"20px 0", fontSize:13, color:"#7a9e88" }}>
              Select a surah above first · اختر سورة أولاً
            </div>
          )}

          {selected && ayahs.length>0 && (
            <>
              {/* Current ayah */}
              <div style={{ background:"#fffdf5", border:"1px solid #e2e8f0", borderRadius:10, padding:"14px 16px", marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#7a9e88" }}>Ayah {ayahs[ayahIdx]?.numberInSurah} of {selected.numberOfAyahs}</div>
                  <div style={{ fontSize:11, color:personalRecs[ayahs[ayahIdx]?.numberInSurah]?"#276749":"#7a9e88", fontWeight:700 }}>
                    {personalRecs[ayahs[ayahIdx]?.numberInSurah]?"✓ Recorded":"Not recorded yet"}
                  </div>
                </div>
                <div style={{ fontFamily:"'Amiri Quran',serif", fontSize:22, fontWeight:700, color:"#1a3d24", direction:"rtl", lineHeight:2.2, textAlign:"right" }}>
                  {ayahs[ayahIdx]?.text}
                </div>
              </div>

              <div style={{ display:"flex", justifyContent:"center", marginBottom:14 }}>
                <div onClick={isRecording?stopPersonalRec:startPersonalRec}
                  style={{ width:86, height:86, borderRadius:"50%", cursor:"pointer", transition:"all .2s",
                    background:isRecording?"#c0392b":"#1a3d24", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28,
                    boxShadow:isRecording?"0 0 0 10px rgba(192,57,43,.12)":"0 2px 10px rgba(0,0,0,.15)",
                  }}>
                  {isRecording?"⏹":"🎤"}
                </div>
              </div>
              <div style={{ textAlign:"center", fontSize:13, fontWeight:700, color:isRecording?"#c0392b":"#7a9e88", marginBottom:14 }}>
                {isRecording?"● Recording… tap to stop":"Tap to record this ayah"}
                {isRecording && <div style={{ fontSize:11, fontWeight:400, marginTop:2 }}>Noise suppression active · تقليل الضوضاء</div>}
              </div>

              <div style={{ display:"flex", gap:8, marginBottom:16 }}>
                <button onClick={()=>setAyahIdx(i=>Math.max(0,i-1))} disabled={ayahIdx===0}
                  style={{ flex:1, padding:"10px 0", borderRadius:10, background:"#f8fafb", border:"1px solid #e2e8f0", fontSize:13, fontWeight:700, color:ayahIdx===0?"#7a9e88":"#1a3d24", opacity:ayahIdx===0?.5:1 }}>
                  ← Previous
                </button>
                <button onClick={()=>setAyahIdx(i=>Math.min(ayahs.length-1,i+1))} disabled={ayahIdx===ayahs.length-1}
                  style={{ flex:1, padding:"10px 0", borderRadius:10, background:"#1a3d24", border:"none", color:"#fff", fontSize:13, fontWeight:700, opacity:ayahIdx===ayahs.length-1?.5:1 }}>
                  Next →
                </button>
              </div>

              {/* Recorded list */}
              <div style={{ borderTop:"1px solid #e2e8f0", paddingTop:14 }}>
                <div style={{ textAlign:"center", marginBottom:10 }}>
                  <div style={{ fontSize:15, fontWeight:900, color:"#1a3d24" }}>Your Recordings</div>
                  <div style={{ fontSize:11, color:"#b7791f" }}>تسجيلاتك</div>
                </div>
                {Object.keys(personalRecs).length===0 ? (
                  <div style={{ textAlign:"center", fontSize:13, color:"#7a9e88", padding:"14px 0" }}>No recordings yet · لا توجد تسجيلات</div>
                ) : ayahs.filter(a=>personalRecs[a.numberInSurah]).map((a,i)=>{
                  const idx2 = ayahs.indexOf(a);
                  return (
                    <div key={i} onClick={()=>playPersonal(idx2)}
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, marginBottom:6, cursor:"pointer",
                        background:playingPersonal===idx2?"#f0fff4":"#f8fafb",
                        border:`1px solid ${playingPersonal===idx2?"#9ae6b4":"#e2e8f0"}`,
                      }}>
                      <div style={{ width:36, height:36, borderRadius:"50%", background:playingPersonal===idx2?"#c0392b":"#1a3d24", border:"none", color:"#fff", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        {playingPersonal===idx2?"⏹":"▶"}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:"#1a3d24" }}>Ayah {a.numberInSurah}</div>
                        <div style={{ fontSize:11, color:"#7a9e88" }}>Tap to play · اضغط للتشغيل</div>
                      </div>
                      <div style={{ fontSize:18 }}>🎤</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
