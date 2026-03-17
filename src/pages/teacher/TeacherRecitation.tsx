/*
  src/pages/teacher/TeacherRecitation.tsx
  ─────────────────────────────────────────────────────────
  Teacher records their own recitation per ayah.
  Students can choose teacher recitation in the AudioPlayer.

  SUPABASE TABLE:
  ───────────────
  create table if not exists teacher_recitations (
    id uuid primary key default uuid_generate_v4(),
    teacher_id uuid references auth.users,
    teacher_name text,
    surah_num int, surah_name text,
    ayah_num int, audio_url text,
    created_at timestamp default now(),
    unique(teacher_id, surah_num, ayah_num)
  );
  alter table teacher_recitations enable row level security;
  create policy "teacher own" on teacher_recitations for all using (auth.uid() = teacher_id);
  create policy "students read" on teacher_recitations for select using (true);
*/

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { audioManager } from "@/components/hifdh/audioManager";

interface SurahMeta { number:number; name:string; englishName:string; numberOfAyahs:number; }
interface Ayah { number:number; numberInSurah:number; text:string; }
interface MyRec { ayah_num:number; audio_url:string; }

export default function TeacherRecitation() {
  const [teacherId, setTeacherId]   = useState<string|null>(null);
  const [teacherName, setTeacherName] = useState("Teacher");
  const [surahs, setSurahs]         = useState<SurahMeta[]>([]);
  const [search, setSearch]         = useState("");
  const [selected, setSelected]     = useState<SurahMeta|null>(null);
  const [ayahs, setAyahs]           = useState<Ayah[]>([]);
  const [ayahIdx, setAyahIdx]       = useState(0);
  const [loading, setLoading]       = useState(false);
  const [myRecs, setMyRecs]         = useState<Record<number,string>>({});
  const [isRecording, setIsRecording] = useState(false);
  const [playingIdx, setPlayingIdx] = useState<number|null>(null);
  const [saving, setSaving]         = useState(false);
  const [recordedCount, setRecordedCount] = useState(0);

  const mediaRecRef = useRef<MediaRecorder|null>(null);
  const chunksRef   = useRef<Blob[]>([]);

  useEffect(()=>{
    supabase.auth.getUser().then(({data})=>{
      if (!data?.user) return;
      setTeacherId(data.user.id);
      supabase.from("profiles").select("full_name").eq("user_id",data.user.id).single()
        .then(({data:p})=>{ if(p?.full_name) setTeacherName(p.full_name); });
    });
    fetch("https://api.alquran.cloud/v1/surah").then(r=>r.json()).then(d=>{ if(d.code===200) setSurahs(d.data); });
    return ()=>{ audioManager.stop(); };
  },[]);

  useEffect(()=>{
    if (!selected||!teacherId) return;
    setLoading(true); setAyahIdx(0); setAyahs([]); audioManager.stop();
    fetch(`https://api.alquran.cloud/v1/surah/${selected.number}/ar.uthmani`)
      .then(r=>r.json()).then(d=>{ if(d.code===200) setAyahs(d.data.ayahs.map((a:any)=>({number:a.number,numberInSurah:a.numberInSurah,text:a.text}))); }).finally(()=>setLoading(false));
    supabase.from("teacher_recitations").select("ayah_num,audio_url").eq("teacher_id",teacherId).eq("surah_num",selected.number)
      .then(({data})=>{
        if (!data) return;
        const map:Record<number,string>={};
        data.forEach((r:any)=>{ map[r.ayah_num]=r.audio_url; });
        setMyRecs(map);
        setRecordedCount(Object.keys(map).length);
      });
  },[selected,teacherId]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio:{ noiseSuppression:true, echoCancellation:true, autoGainControl:true } });
      chunksRef.current=[];
      const mr = new MediaRecorder(stream,{mimeType:"audio/webm"});
      mr.ondataavailable=e=>chunksRef.current.push(e.data);
      mr.start(); mediaRecRef.current=mr; setIsRecording(true);
    }catch(_){}
  };

  const stopAndSave = async () => {
    if (!mediaRecRef.current||!teacherId||!selected||!ayahs[ayahIdx]) return;
    setIsRecording(false); setSaving(true);
    mediaRecRef.current.onstop = async () => {
      const blob = new Blob(chunksRef.current,{type:"audio/webm"});
      const path = `teacher_${teacherId}/${selected.number}_${ayahs[ayahIdx].numberInSurah}_${Date.now()}.webm`;
      const {data:up} = await supabase.storage.from("hifdh-recordings").upload(path,blob);
      if (up) {
        const {data:urlData} = supabase.storage.from("hifdh-recordings").getPublicUrl(path);
        const url = urlData?.publicUrl??"";
        await supabase.from("teacher_recitations").upsert({ teacher_id:teacherId, teacher_name:teacherName, surah_num:selected.number, surah_name:selected.englishName, ayah_num:ayahs[ayahIdx].numberInSurah, audio_url:url }, { onConflict:"teacher_id,surah_num,ayah_num" });
        setMyRecs(p=>{ const n={...p,[ayahs[ayahIdx].numberInSurah]:url}; setRecordedCount(Object.keys(n).length); return n; });
      }
      setSaving(false);
    };
    try { mediaRecRef.current.stop(); } catch(_){}
    mediaRecRef.current=null;
  };

  const playRec = (idx:number) => {
    const ayah=ayahs[idx]; if(!ayah||!myRecs[ayah.numberInSurah]) return;
    if (playingIdx===idx){audioManager.stop();setPlayingIdx(null);return;}
    audioManager.play(myRecs[ayah.numberInSurah],()=>setPlayingIdx(null),()=>setPlayingIdx(null));
    setPlayingIdx(idx);
  };

  const filtered=surahs.filter(s=>s.englishName.toLowerCase().includes(search.toLowerCase())||s.name.includes(search));

  const card=(ex?:React.CSSProperties):React.CSSProperties=>({background:"#fff",border:"1px solid #e2e8f0",borderRadius:16,boxShadow:"0 1px 6px rgba(0,0,0,.05)",...ex});
  const pct = selected ? Math.round((recordedCount/selected.numberOfAyahs)*100) : 0;

  return (
    <div style={{fontFamily:"'Cairo',sans-serif",background:"#f8fafb",minHeight:"100vh"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&family=Cairo:wght@400;700;900&display=swap'); *{box-sizing:border-box} @keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}} button,input{font-family:'Cairo',sans-serif;cursor:pointer;}`}</style>

      {/* Header */}
      <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"20px 20px 16px",position:"sticky",top:0,zIndex:10}}>
        <div style={{maxWidth:720,margin:"0 auto",textAlign:"center"}}>
          <h1 style={{fontFamily:"'Amiri',serif",fontSize:24,fontWeight:700,color:"#1a3d24"}}>Teacher Recitation Studio</h1>
          <p style={{fontSize:13,color:"#b7791f",fontStyle:"italic",marginTop:2}}>استوديو تسجيل المعلم</p>
          <p style={{fontSize:13,color:"#276749",fontWeight:600,marginTop:4}}>Recording as: {teacherName}</p>
        </div>
      </div>

      <div style={{maxWidth:720,margin:"0 auto",padding:"18px 16px",display:"flex",flexDirection:"column",gap:16}}>

        {/* Surah Picker */}
        <div style={card({padding:"16px"})}>
          <div style={{textAlign:"center",marginBottom:10}}>
            <div style={{fontSize:17,fontWeight:900,color:"#1a3d24"}}>Select Surah</div>
            <div style={{fontSize:12,color:"#b7791f"}}>اختر السورة</div>
            {selected&&<div style={{fontSize:13,color:"#276749",fontWeight:700,marginTop:4}}>{selected.englishName} — {selected.name}</div>}
          </div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…"
            style={{width:"100%",background:"#f8fafb",border:"1px solid #e2e8f0",borderRadius:10,padding:"8px 12px",fontSize:13,color:"#1a3d24",marginBottom:10}}/>
          <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4}}>
            {filtered.slice(0,30).map(s=>(
              <div key={s.number} onClick={()=>{setSelected(s);setSearch("");}}
                style={{flexShrink:0,padding:"5px 13px",borderRadius:20,fontSize:11,cursor:"pointer",whiteSpace:"nowrap",background:selected?.number===s.number?"#1a3d24":"#f8fafb",color:selected?.number===s.number?"#fff":"#1a3d24",border:`1px solid ${selected?.number===s.number?"#1a3d24":"#e2e8f0"}`,fontWeight:selected?.number===s.number?700:400}}>
                {s.englishName}<br/><span style={{fontSize:9}}>{s.name}</span>
              </div>
            ))}
          </div>
        </div>

        {!selected&&(
          <div style={card({padding:"44px 20px",textAlign:"center"})}>
            <div style={{fontSize:44,marginBottom:12}}>🎙️</div>
            <div style={{fontFamily:"'Amiri',serif",fontSize:20,color:"#1a3d24",fontWeight:700}}>Select a Surah to Start Recording</div>
            <div style={{fontSize:13,color:"#7a9e88",marginTop:4}}>اختر سورة للبدء في التسجيل</div>
          </div>
        )}

        {selected&&loading&&<div style={card({padding:"40px",textAlign:"center",fontSize:13,color:"#b7791f",animation:"pulse 1s infinite"})}>Loading…</div>}

        {selected&&!loading&&ayahs.length>0&&(
          <>
            {/* Progress */}
            <div style={card({padding:"16px"})}>
              <div style={{textAlign:"center",marginBottom:10}}>
                <div style={{fontSize:16,fontWeight:900,color:"#1a3d24"}}>Recording Progress</div>
                <div style={{fontSize:12,color:"#b7791f"}}>تقدم التسجيل</div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,fontWeight:700,color:"#1a3d24",marginBottom:6}}>
                <span>{recordedCount} recorded</span>
                <span>{selected.numberOfAyahs-recordedCount} remaining</span>
              </div>
              <div style={{height:10,borderRadius:5,background:"#f0f4f0",overflow:"hidden",marginBottom:4}}>
                <div style={{width:`${pct}%`,height:"100%",borderRadius:5,background:"linear-gradient(90deg,#276749,#b7791f)",transition:"width .5s"}}/>
              </div>
              <div style={{textAlign:"center",fontSize:13,fontWeight:700,color:"#276749"}}>{pct}% Complete</div>
            </div>

            {/* Current Ayah */}
            <div style={card({padding:0,overflow:"hidden"})}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:"#f8f4ec",borderBottom:"1px solid #e2e8f0"}}>
                <div>
                  <div style={{fontSize:15,fontWeight:900,color:"#1a3d24"}}>{selected.englishName}</div>
                  <div style={{fontSize:12,color:"#b7791f"}}>{selected.name}</div>
                  <div style={{fontSize:11,color:"#7a9e88"}}>Ayah {ayahs[ayahIdx]?.numberInSurah} / {selected.numberOfAyahs}</div>
                </div>
                <div style={{fontSize:12,fontWeight:700,color:myRecs[ayahs[ayahIdx]?.numberInSurah]?"#276749":"#7a9e88"}}>
                  {myRecs[ayahs[ayahIdx]?.numberInSurah]?"✓ Recorded":"Not recorded"}
                </div>
              </div>
              <div style={{padding:"22px 18px",background:"#fffdf5"}}>
                <div style={{fontFamily:"'Amiri Quran',serif",fontSize:28,fontWeight:700,color:"#1a3d24",direction:"rtl",lineHeight:2.6,textAlign:"justify"}}>
                  {ayahs[ayahIdx]?.text}
                  <span style={{color:"rgba(183,121,31,.6)",fontSize:20}}> ﴿{ayahs[ayahIdx]?.numberInSurah}﴾</span>
                </div>
              </div>
              {/* Nav */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderTop:"1px solid #e2e8f0",background:"#f8f4ec"}}>
                <button onClick={()=>setAyahIdx(i=>Math.max(0,i-1))} disabled={ayahIdx===0}
                  style={{padding:"9px 16px",borderRadius:10,background:"#f0f4f0",border:"1px solid #e2e8f0",fontSize:13,fontWeight:700,color:ayahIdx===0?"#7a9e88":"#1a3d24",opacity:ayahIdx===0?.5:1}}>
                  ← Previous
                </button>
                <span style={{fontSize:13,fontWeight:700,color:"#1a3d24"}}>{ayahIdx+1} / {ayahs.length}</span>
                <button onClick={()=>setAyahIdx(i=>Math.min(ayahs.length-1,i+1))} disabled={ayahIdx===ayahs.length-1}
                  style={{padding:"9px 16px",borderRadius:10,background:"#1a3d24",border:"none",color:"#fff",fontSize:13,fontWeight:700,opacity:ayahIdx===ayahs.length-1?.5:1}}>
                  Next →
                </button>
              </div>
            </div>

            {/* Recording Panel */}
            <div style={card({padding:"22px 18px",display:"flex",flexDirection:"column",alignItems:"center",gap:14})}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:18,fontWeight:900,color:"#1a3d24"}}>Record This Ayah</div>
                <div style={{fontSize:13,color:"#b7791f"}}>سجّل هذه الآية</div>
                <div style={{fontSize:11,color:"#7a9e88",marginTop:2}}>Noise suppression active · تقليل الضوضاء تلقائياً</div>
              </div>

              <div onClick={isRecording?stopAndSave:startRecording}
                style={{width:90,height:90,borderRadius:"50%",cursor:"pointer",transition:"all .2s",background:isRecording?"#c0392b":"#1a3d24",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,boxShadow:isRecording?"0 0 0 10px rgba(192,57,43,.12)":"0 2px 10px rgba(0,0,0,.15)"}}>
                {isRecording?"⏹":"🎙️"}
              </div>

              <div style={{textAlign:"center"}}>
                <div style={{fontSize:14,fontWeight:700,color:isRecording?"#c0392b":"#7a9e88"}}>
                  {saving?"Saving recording…":isRecording?"● Recording… tap to stop and save":"Tap to record"}
                </div>
                {myRecs[ayahs[ayahIdx]?.numberInSurah]&&!isRecording&&(
                  <div style={{fontSize:12,color:"#276749",marginTop:4,fontWeight:600}}>✓ You have a recording for this ayah — tap to re-record</div>
                )}
              </div>

              {/* Play my recording */}
              {myRecs[ayahs[ayahIdx]?.numberInSurah]&&!isRecording&&(
                <button onClick={()=>playRec(ayahIdx)}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"10px 20px",borderRadius:12,background:playingIdx===ayahIdx?"#f0fff4":"#f8fafb",border:`1px solid ${playingIdx===ayahIdx?"#9ae6b4":"#e2e8f0"}`,color:playingIdx===ayahIdx?"#276749":"#1a3d24",fontSize:13,fontWeight:700}}>
                  {playingIdx===ayahIdx?"⏹ Stop":"▶ Play My Recording"}
                </button>
              )}
            </div>

            {/* All recordings list */}
            <div style={card({padding:"16px"})}>
              <div style={{textAlign:"center",marginBottom:12}}>
                <div style={{fontSize:16,fontWeight:900,color:"#1a3d24"}}>All My Recordings</div>
                <div style={{fontSize:11,color:"#b7791f"}}>جميع تسجيلاتي</div>
              </div>
              {Object.keys(myRecs).length===0?(
                <div style={{textAlign:"center",fontSize:13,color:"#7a9e88",padding:"16px 0"}}>No recordings yet · لا توجد تسجيلات</div>
              ):ayahs.filter(a=>myRecs[a.numberInSurah]).map((a,i)=>{
                const idx2=ayahs.indexOf(a);
                return (
                  <div key={i} onClick={()=>playRec(idx2)}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,marginBottom:6,cursor:"pointer",background:playingIdx===idx2?"#f0fff4":"#f8fafb",border:`1px solid ${playingIdx===idx2?"#9ae6b4":"#e2e8f0"}`}}>
                    <div style={{width:36,height:36,borderRadius:"50%",background:playingIdx===idx2?"#c0392b":"#1a3d24",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:"#fff",flexShrink:0}}>
                      {playingIdx===idx2?"⏹":"▶"}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:700,color:"#1a3d24"}}>Ayah {a.numberInSurah}</div>
                      <div style={{fontFamily:"'Amiri Quran',serif",fontSize:14,color:"#7a9e88",direction:"rtl",textAlign:"right"}}>{a.text.substring(0,40)}…</div>
                    </div>
                    <div style={{fontSize:18}}>🎙️</div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
