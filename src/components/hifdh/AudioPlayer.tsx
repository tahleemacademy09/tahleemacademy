/*
  src/components/hifdh/AudioPlayer.tsx
  ─────────────────────────────────────────────────────────
  - 6 reciters with selector
  - Playback modes: Single · Repeat · Read All · Repeat All
  - Repeat count (1–5)
  - Auto-advance with highlighted current ayah
  - Personal voice tab: record per-ayah, playback like a reciter
*/

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Props { userId: string | null; }

interface SurahMeta { number: number; name: string; englishName: string; numberOfAyahs: number; }
interface Ayah      { number: number; numberInSurah: number; text: string; }

const RECITERS = [
  { id:"ar.alafasy",            name:"Mishary Alafasy",         ar:"مشاري العفاسي" },
  { id:"ar.abdurrahmaansudais", name:"Abdul Rahman Al-Sudais",  ar:"عبدالرحمن السديس" },
  { id:"ar.husary",             name:"Mahmoud Al-Husary",       ar:"محمود الحصري" },
  { id:"ar.minshawi",           name:"Mohamed Al-Minshawi",     ar:"محمد المنشاوي" },
  { id:"ar.shaatree",           name:"Abu Bakr Al-Shatri",      ar:"أبو بكر الشاطري" },
  { id:"ar.abdullahbasfar",     name:"Abdullah Basfar",         ar:"عبدالله بصفر" },
];

type PlayMode = "single" | "repeat" | "readall" | "repeatall";
type SubTab   = "listen" | "personal";

export default function AudioPlayer({ userId }: Props) {
  const [subTab, setSubTab]       = useState<SubTab>("listen");
  const [surahs, setSurahs]       = useState<SurahMeta[]>([]);
  const [search, setSearch]       = useState("");
  const [selected, setSelected]   = useState<SurahMeta | null>(null);
  const [ayahs, setAyahs]         = useState<Ayah[]>([]);
  const [ayahIdx, setAyahIdx]     = useState(0);
  const [loading, setLoading]     = useState(false);

  // Playback state
  const [reciter, setReciter]     = useState(RECITERS[0]);
  const [playMode, setPlayMode]   = useState<PlayMode>("single");
  const [repeatCount, setRepeat]  = useState(1);
  const [repeatDone, setRepeatDone] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [duration, setDuration]   = useState(0);

  // Personal voice
  const [isRecording, setIsRecording]     = useState(false);
  const [personalRecs, setPersonalRecs]   = useState<Record<number,string>>({});
  const [playingPersonal, setPlayingPersonal] = useState<number|null>(null);

  const audioRef    = useRef<HTMLAudioElement | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const progressRef = useRef<ReturnType<typeof setInterval>|null>(null);

  useEffect(() => {
    fetch("https://api.alquran.cloud/v1/surah")
      .then(r=>r.json()).then(d=>{ if(d.code===200) setSurahs(d.data); });
    if (typeof window !== "undefined") audioRef.current = new Audio();
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true); setAyahIdx(0); setAyahs([]); stopAudio();
    fetch(`https://api.alquran.cloud/v1/surah/${selected.number}/ar.uthmani`)
      .then(r=>r.json()).then(d=>{
        if(d.code===200) setAyahs(d.data.ayahs.map((a:any)=>({ number:a.number, numberInSurah:a.numberInSurah, text:a.text })));
      }).finally(()=>setLoading(false));
  }, [selected]);

  // Load personal recordings from supabase
  useEffect(() => {
    if (!userId || !selected) return;
    supabase.from("hifdh_recordings")
      .select("ayah_start,audio_url")
      .eq("student_id", userId).eq("surah_num", selected.number)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<number,string> = {};
        data.forEach((r: any) => { if (r.audio_url) map[r.ayah_start] = r.audio_url; });
        setPersonalRecs(map);
      });
  }, [userId, selected]);

  const audioUrl = (ayahNum: number) =>
    `https://cdn.islamic.network/quran/audio/128/${reciter.id}/${ayahNum}.mp3`;

  const stopAudio = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    if (progressRef.current) clearInterval(progressRef.current);
    setIsPlaying(false); setProgress(0); setRepeatDone(0);
  };

  const playAyah = (idx: number, isPersonal = false) => {
    if (!ayahs[idx] || !audioRef.current) return;
    stopAudio();
    const src = isPersonal ? (personalRecs[ayahs[idx].numberInSurah] ?? "") : audioUrl(ayahs[idx].number);
    if (!src) return;
    audioRef.current.src = src;
    audioRef.current.play().then(() => setIsPlaying(true)).catch(()=>{});
    audioRef.current.onloadedmetadata = () => { if(audioRef.current) setDuration(audioRef.current.duration||0); };
    progressRef.current = setInterval(() => {
      if (!audioRef.current) return;
      setProgress(audioRef.current.currentTime);
    }, 300);
    audioRef.current.onended = () => handleAudioEnd(idx, isPersonal);
  };

  const handleAudioEnd = (idx: number, isPersonal: boolean) => {
    if (playMode === "single") { stopAudio(); return; }
    if (playMode === "repeat") {
      const done = repeatDone + 1;
      if (done < repeatCount) { setRepeatDone(done); playAyah(idx, isPersonal); }
      else { setRepeatDone(0); if (idx < ayahs.length-1) { setAyahIdx(idx+1); playAyah(idx+1, isPersonal); } else stopAudio(); }
      return;
    }
    if (playMode === "readall" || playMode === "repeatall") {
      if (idx < ayahs.length-1) { setAyahIdx(idx+1); playAyah(idx+1, isPersonal); }
      else if (playMode==="repeatall") { setAyahIdx(0); playAyah(0, isPersonal); }
      else stopAudio();
    }
  };

  // Personal voice recording
  const startPersonalRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType:"audio/webm" });
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        if (!userId || !selected || !ayahs[ayahIdx]) return;
        const blob = new Blob(chunksRef.current, { type:"audio/webm" });
        const path = `${userId}/personal_${selected.number}_${ayahs[ayahIdx].numberInSurah}_${Date.now()}.webm`;
        const { data: up } = await supabase.storage.from("hifdh-recordings").upload(path, blob);
        if (up) {
          const { data: urlData } = supabase.storage.from("hifdh-recordings").getPublicUrl(path);
          const url = urlData?.publicUrl ?? "";
          setPersonalRecs(prev => ({ ...prev, [ayahs[ayahIdx].numberInSurah]: url }));
          await supabase.from("hifdh_recordings").upsert({
            student_id: userId, surah_num: selected.number, surah_name: selected.englishName,
            ayah_start: ayahs[ayahIdx].numberInSurah, audio_url: url, ai_score: 0, status: "pending",
          });
        }
        stream.getTracks().forEach(t=>t.stop());
      };
      mr.start(); mediaRecRef.current = mr; setIsRecording(true);
    } catch(_) {}
  };

  const stopPersonalRec = () => {
    if (mediaRecRef.current) { try { mediaRecRef.current.stop(); } catch(_){} mediaRecRef.current = null; }
    setIsRecording(false);
  };

  const playPersonal = (idx: number) => {
    const ayah = ayahs[idx];
    if (!ayah || !personalRecs[ayah.numberInSurah]) return;
    if (playingPersonal === idx) { stopAudio(); setPlayingPersonal(null); return; }
    setPlayingPersonal(idx);
    playAyah(idx, true);
  };

  const filtered = surahs.filter(s => s.englishName.toLowerCase().includes(search.toLowerCase()) || s.name.includes(search));

  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background:"#fff", border:"1px solid #e8f0eb", borderRadius:16,
    boxShadow:"0 1px 6px rgba(0,0,0,.05)", ...ex,
  });

  return (
    <div style={{ padding:"18px 16px", display:"flex", flexDirection:"column", gap:16 }}>

      {/* Sub-tabs */}
      <div style={{ display:"flex", background:"#f8fafb", borderRadius:12, padding:4, border:"1px solid #e8f0eb" }}>
        {([["listen","🎧","Listen","استماع"],["personal","🎤","My Voice","صوتي"]] as const).map(([k,icon,en,ar])=>(
          <button key={k} onClick={()=>setSubTab(k as SubTab)}
            style={{ flex:1, padding:"9px 8px", borderRadius:9, border:"none", fontSize:12, fontWeight: subTab===k ? 700 : 400,
              background: subTab===k ? "#fff" : "transparent",
              color: subTab===k ? "#1a3d24" : "#7a9e88",
              boxShadow: subTab===k ? "0 1px 4px rgba(0,0,0,.08)" : "none",
            }}>
            {icon} {en} · {ar}
          </button>
        ))}
      </div>

      {/* Surah Picker */}
      <div style={card({ padding:"16px" })}>
        <div style={{ fontFamily:"'Amiri',serif", fontSize:17, fontWeight:700, color:"#1a3d24", marginBottom:10 }}>
          Select Surah · اختر السورة
          {selected && <span style={{ fontSize:12, color:"#b7791f", fontWeight:400 }}> — {selected.englishName}</span>}
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search… ابحث"
          style={{ width:"100%", background:"#f8fafb", border:"1px solid #e8f0eb", borderRadius:10, padding:"8px 12px", fontSize:13, color:"#1a3d24", marginBottom:10 }} />
        <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:4 }}>
          {filtered.slice(0,30).map(s=>(
            <div key={s.number} onClick={()=>{ setSelected(s); setSearch(""); }}
              style={{ flexShrink:0, padding:"5px 12px", borderRadius:20, fontSize:11, cursor:"pointer", whiteSpace:"nowrap",
                background: selected?.number===s.number ? "#1a3d24" : "#f8fafb",
                color: selected?.number===s.number ? "#fff" : "#1a3d24",
                border:`1px solid ${selected?.number===s.number?"#1a3d24":"#e8f0eb"}`,
                fontWeight: selected?.number===s.number ? 700 : 400,
              }}>
              {s.englishName} · {s.name}
            </div>
          ))}
        </div>
      </div>

      {/* ── LISTEN TAB ── */}
      {subTab === "listen" && (
        <>
          {/* Reciter Selector */}
          <div style={card({ padding:"16px" })}>
            <div style={{ fontFamily:"'Amiri',serif", fontSize:16, fontWeight:700, color:"#1a3d24", marginBottom:10 }}>
              Reciter · القارئ
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {RECITERS.map(r=>(
                <div key={r.id} onClick={()=>{ setReciter(r); stopAudio(); }}
                  style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:10, cursor:"pointer",
                    background: reciter.id===r.id ? "#f0fff4" : "#f8fafb",
                    border:`1px solid ${reciter.id===r.id ? "#9ae6b4" : "#e8f0eb"}`,
                  }}>
                  <div style={{ width:36, height:36, borderRadius:"50%", background: reciter.id===r.id ? "#1a3d24" : "#e8f0eb", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
                    🎙️
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:"#1a3d24" }}>{r.name}</div>
                    <div style={{ fontSize:11, color:"#7a9e88" }}>{r.ar}</div>
                  </div>
                  {reciter.id===r.id && <div style={{ fontSize:16, color:"#276749" }}>✓</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Playback Controls */}
          <div style={card({ padding:"16px" })}>
            <div style={{ fontFamily:"'Amiri',serif", fontSize:16, fontWeight:700, color:"#1a3d24", marginBottom:12 }}>
              Playback Mode · وضع التشغيل
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
              {([["single","▶️","Single","مرة واحدة"],["repeat","🔂","Repeat Ayah","تكرار الآية"],["readall","▶️▶️","Read All","قراءة الكل"],["repeatall","🔁","Repeat All","تكرار الكل"]] as const).map(([k,icon,en,ar])=>(
                <div key={k} onClick={()=>setPlayMode(k)}
                  style={{ padding:"10px 8px", borderRadius:10, cursor:"pointer", textAlign:"center",
                    background: playMode===k ? "#1a3d24" : "#f8fafb",
                    border:`1px solid ${playMode===k?"#1a3d24":"#e8f0eb"}`,
                  }}>
                  <div style={{ fontSize:18, marginBottom:4 }}>{icon}</div>
                  <div style={{ fontSize:11, fontWeight:700, color: playMode===k?"#fff":"#1a3d24" }}>{en}</div>
                  <div style={{ fontSize:9, color: playMode===k?"rgba(255,255,255,.7)":"#7a9e88" }}>{ar}</div>
                </div>
              ))}
            </div>

            {/* Repeat count */}
            {playMode==="repeat" && (
              <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:"#f8fafb", borderRadius:10, marginBottom:12 }}>
                <span style={{ fontSize:13, color:"#1a3d24", fontWeight:600 }}>Repeat each ayah:</span>
                {[1,2,3,5,10].map(n=>(
                  <div key={n} onClick={()=>setRepeat(n)}
                    style={{ width:32, height:32, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, cursor:"pointer",
                      background: repeatCount===n ? "#1a3d24" : "#fff",
                      color: repeatCount===n ? "#fff" : "#1a3d24",
                      border:`1px solid ${repeatCount===n?"#1a3d24":"#e8f0eb"}`,
                    }}>
                    {n}×
                  </div>
                ))}
              </div>
            )}

            {/* Main Play/Stop */}
            {selected && ayahs.length > 0 && (
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={()=>{ setAyahIdx(0); playAyah(0); }}
                  disabled={isPlaying}
                  style={{ flex:1, padding:"12px 0", borderRadius:12, background: isPlaying ? "#f0f4f0" : "#1a3d24", border:"none", color: isPlaying ? "#7a9e88" : "#fff", fontSize:13, fontWeight:700, opacity: isPlaying?.6:1, cursor: isPlaying?"not-allowed":"pointer" }}>
                  ▶ Play · تشغيل
                </button>
                <button onClick={stopAudio} disabled={!isPlaying}
                  style={{ flex:1, padding:"12px 0", borderRadius:12, background: isPlaying ? "#fff5f5" : "#f8fafb", border:`1px solid ${isPlaying?"#fca5a5":"#e8f0eb"}`, color: isPlaying?"#c0392b":"#7a9e88", fontSize:13, fontWeight:600, opacity: isPlaying?1:.6, cursor: isPlaying?"pointer":"not-allowed" }}>
                  ⏹ Stop · إيقاف
                </button>
              </div>
            )}
          </div>

          {/* Ayah List */}
          {selected && !loading && ayahs.length > 0 && (
            <div style={card({ padding:"16px" })}>
              <div style={{ fontFamily:"'Amiri',serif", fontSize:16, fontWeight:700, color:"#1a3d24", marginBottom:12 }}>
                Ayahs · الآيات
              </div>
              {/* Progress bar */}
              {isPlaying && duration > 0 && (
                <div style={{ marginBottom:12 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#7a9e88", marginBottom:4 }}>
                    <span>{Math.round(progress)}s</span>
                    <span>Ayah {ayahIdx+1} · {repeatDone>0?`repeat ${repeatDone+1}/${repeatCount}`:""}</span>
                    <span>{Math.round(duration)}s</span>
                  </div>
                  <div style={{ height:4, borderRadius:2, background:"#f0f4f0", overflow:"hidden" }}>
                    <div style={{ width:`${duration>0?(progress/duration)*100:0}%`, height:"100%", background:"#276749", transition:"width .3s linear" }} />
                  </div>
                </div>
              )}
              <div style={{ maxHeight:320, overflowY:"auto", display:"flex", flexDirection:"column", gap:4 }}>
                {ayahs.map((a, i) => (
                  <div key={i}
                    style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, cursor:"pointer",
                      background: ayahIdx===i && isPlaying ? "#f0fff4" : "#f8fafb",
                      border:`1px solid ${ayahIdx===i && isPlaying ? "#9ae6b4" : "#e8f0eb"}`,
                      transition:"all .2s",
                    }}
                    onClick={()=>{ setAyahIdx(i); playAyah(i); }}>
                    <div style={{ width:30, height:30, borderRadius:"50%", background: ayahIdx===i&&isPlaying ? "#1a3d24" : "#e8f0eb", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, color: ayahIdx===i&&isPlaying?"#fff":"#7a9e88", flexShrink:0 }}>
                      {ayahIdx===i && isPlaying ? "♪" : a.numberInSurah}
                    </div>
                    <div style={{ fontFamily:"'Amiri Quran',serif", fontSize:16, color:"#1a3d24", direction:"rtl", flex:1, textAlign:"right", lineHeight:1.8 }}>
                      {a.text.substring(0,60)}{a.text.length>60?"…":""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── PERSONAL VOICE TAB ── */}
      {subTab === "personal" && (
        <>
          <div style={card({ padding:"18px", textAlign:"center" })}>
            <div style={{ fontFamily:"'Amiri',serif", fontSize:16, fontWeight:700, color:"#1a3d24", marginBottom:4 }}>
              🎤 Record Your Voice · سجّل صوتك
            </div>
            <div style={{ fontSize:12, color:"#7a9e88", marginBottom:16 }}>
              Record yourself reciting each ayah and play it back like a reciter · سجّل نفسك واستمع كما تفعل مع القرّاء
            </div>

            {!selected && (
              <div style={{ fontSize:13, color:"#7a9e88" }}>Select a surah above first · اختر سورة أولاً</div>
            )}

            {selected && ayahs.length > 0 && (
              <>
                {/* Current ayah indicator */}
                <div style={{ background:"#f8fafb", border:"1px solid #e8f0eb", borderRadius:10, padding:"12px 16px", marginBottom:14 }}>
                  <div style={{ fontSize:12, color:"#7a9e88", marginBottom:4 }}>
                    Recording Ayah {ayahs[ayahIdx]?.numberInSurah} of {selected.numberOfAyahs}
                  </div>
                  <div style={{ fontFamily:"'Amiri Quran',serif", fontSize:20, color:"#1a3d24", direction:"rtl", lineHeight:2 }}>
                    {ayahs[ayahIdx]?.text.substring(0,80)}{(ayahs[ayahIdx]?.text.length??0)>80?"…":""}
                  </div>
                </div>

                {/* Record button */}
                <div style={{ display:"flex", justifyContent:"center", marginBottom:14 }}>
                  <div onClick={isRecording ? stopPersonalRec : startPersonalRec}
                    style={{ width:80, height:80, borderRadius:"50%", cursor:"pointer",
                      background: isRecording ? "#c0392b" : "#1a3d24",
                      display:"flex", alignItems:"center", justifyContent:"center", fontSize:26,
                      boxShadow: isRecording ? "0 0 0 8px rgba(192,57,43,.15)" : "0 2px 8px rgba(0,0,0,.15)",
                      transition:"all .2s",
                    }}>
                    {isRecording ? "⏹" : "🎤"}
                  </div>
                </div>
                <div style={{ fontSize:12, color: isRecording?"#c0392b":"#7a9e88", fontWeight:600, marginBottom:16 }}>
                  {isRecording ? "● Recording… tap to stop" : "Tap to record this ayah"}
                </div>

                {/* Navigation */}
                <div style={{ display:"flex", gap:8, marginBottom:16 }}>
                  <button onClick={()=>setAyahIdx(i=>Math.max(0,i-1))} disabled={ayahIdx===0}
                    style={{ flex:1, padding:"9px 0", borderRadius:10, background:"#f8fafb", border:"1px solid #e8f0eb", color:ayahIdx===0?"#7a9e88":"#1a3d24", fontSize:12, opacity:ayahIdx===0?.5:1 }}>
                    ← Prev
                  </button>
                  <button onClick={()=>setAyahIdx(i=>Math.min(ayahs.length-1,i+1))} disabled={ayahIdx===ayahs.length-1}
                    style={{ flex:1, padding:"9px 0", borderRadius:10, background:"#1a3d24", border:"none", color:"#fff", fontSize:12, fontWeight:700, opacity:ayahIdx===ayahs.length-1?.5:1 }}>
                    Next →
                  </button>
                </div>

                {/* Recorded ayahs list */}
                <div style={{ textAlign:"left" }}>
                  <div style={{ fontFamily:"'Amiri',serif", fontSize:15, fontWeight:700, color:"#1a3d24", marginBottom:10 }}>
                    Your Recordings · تسجيلاتك
                  </div>
                  {Object.keys(personalRecs).length === 0 ? (
                    <div style={{ fontSize:12, color:"#7a9e88", textAlign:"center", padding:"16px 0" }}>
                      No recordings yet · لا توجد تسجيلات بعد
                    </div>
                  ) : ayahs.filter(a => personalRecs[a.numberInSurah]).map((a, i) => (
                    <div key={i}
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, marginBottom:6,
                        background: playingPersonal===ayahs.indexOf(a) ? "#f0fff4" : "#f8fafb",
                        border:`1px solid ${playingPersonal===ayahs.indexOf(a)?"#9ae6b4":"#e8f0eb"}`,
                      }}>
                      <button onClick={()=>playPersonal(ayahs.indexOf(a))}
                        style={{ width:34, height:34, borderRadius:"50%", background: playingPersonal===ayahs.indexOf(a)?"#c0392b":"#1a3d24", border:"none", color:"#fff", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        {playingPersonal===ayahs.indexOf(a) ? "⏹" : "▶"}
                      </button>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:"#1a3d24" }}>Ayah {a.numberInSurah}</div>
                        <div style={{ fontSize:10, color:"#7a9e88" }}>Tap to play · اضغط للتشغيل</div>
                      </div>
                      <div style={{ fontSize:18 }}>🎤</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}

    </div>
  );
}
