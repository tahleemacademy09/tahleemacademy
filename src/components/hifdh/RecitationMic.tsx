/*  src/components/hifdh/RecitationMic.tsx  */
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { audioManager } from "./audioManager";

interface Props { userId: string | null; }
interface SurahMeta { number: number; name: string; englishName: string; numberOfAyahs: number; }
interface Word { raw: string; normalized: string; state: "hidden"|"correct"|"wrong"|"current"; }
interface Ayah { number: number; numberInSurah: number; text: string; words: Word[]; }

const normalize = (t: string) =>
  t.replace(/[\u064B-\u065F\u0670]/g,"").replace(/[أإآ]/g,"ا")
   .replace(/ة/g,"ه").replace(/ى/g,"ي").replace(/\s+/g," ").trim();

const toWords = (text: string): Word[] =>
  text.replace(/﴿.*?﴾/g,"").trim().split(/\s+/).filter(Boolean)
    .map(w => ({ raw:w, normalized:normalize(w), state:"hidden" as const }));

export default function RecitationMic({ userId }: Props) {
  const [surahs, setSurahs]         = useState<SurahMeta[]>([]);
  const [search, setSearch]         = useState("");
  const [selected, setSelected]     = useState<SurahMeta|null>(null);
  const [ayahs, setAyahs]           = useState<Ayah[]>([]);
  const [ayahIdx, setAyahIdx]       = useState(0);
  const [loading, setLoading]       = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [timer, setTimer]           = useState(0);
  const [transcript, setTranscript] = useState("");
  const [speechOk, setSpeechOk]     = useState(true);
  const [countdown, setCountdown]   = useState<number|null>(null);
  const [sessionDone, setSessionDone] = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct:0, wrong:0 });
  const [peekIdx, setPeekIdx]       = useState<number|null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [saving, setSaving]         = useState(false);

  const recogRef      = useRef<any>(null);
  const timerRef      = useRef<ReturnType<typeof setInterval>|null>(null);
  const countRef      = useRef<ReturnType<typeof setInterval>|null>(null);
  const mediaRecRef   = useRef<MediaRecorder|null>(null);
  const chunksRef     = useRef<Blob[]>([]);
  const peekTimerRef  = useRef<ReturnType<typeof setTimeout>|null>(null);
  const ayahIdxRef    = useRef(ayahIdx);
  const ayahsRef      = useRef(ayahs);
  const isRecordingRef = useRef(false); // ← ref version to avoid stale closure

  useEffect(() => { ayahIdxRef.current = ayahIdx; }, [ayahIdx]);
  useEffect(() => { ayahsRef.current = ayahs; }, [ayahs]);

  useEffect(() => {
    fetch("https://api.alquran.cloud/v1/surah").then(r=>r.json())
      .then(d=>{ if(d.code===200) setSurahs(d.data); });
    return () => { stopRecording(); audioManager.stop(); };
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true); setAyahIdx(0); setAyahs([]); setSessionDone(false);
    setSessionStats({correct:0,wrong:0}); setTranscript(""); stopRecording();
    fetch(`https://api.alquran.cloud/v1/surah/${selected.number}/ar.uthmani`)
      .then(r=>r.json()).then(d=>{
        if(d.code===200) setAyahs(d.data.ayahs.map((a:any)=>({
          number:a.number, numberInSurah:a.numberInSurah, text:a.text, words:toWords(a.text),
        })));
      }).finally(()=>setLoading(false));
  }, [selected]);

  useEffect(() => {
    if (isRecording) timerRef.current = setInterval(()=>setTimer(t=>t+1),1000);
    else if (timerRef.current) clearInterval(timerRef.current);
    return () => { if(timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  const fmt = (s:number) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  // ── Core word reveal logic ──────────────────────────────
  // Uses a sequential pointer: as transcript grows, reveal words one by one
  const wordPointerRef = useRef(0); // how many words have been revealed so far

  const checkWords = useCallback((spoken: string) => {
    const idx = ayahIdxRef.current;
    const currentAyahs = ayahsRef.current;
    if (!currentAyahs[idx]) return;

    const spokenNorm  = normalize(spoken);
    const spokenWords = spokenNorm.split(/\s+/).filter(Boolean);
    const ayahWords   = currentAyahs[idx].words;

    // ── Sequential matching: go through each ayah word in order ──
    // For each ayah word, check if ANY spoken word closely matches it
    // This handles out-of-order speech recognition results on Android

    let newPointer = wordPointerRef.current;

    // Try to extend the pointer forward as more words are recognized
    while (newPointer < ayahWords.length) {
      const target = ayahWords[newPointer].normalized;
      if (!target) { newPointer++; continue; }

      // Check if any spoken word matches this target
      const matched = spokenWords.some(sw => {
        if (!sw || sw.length < 2) return false;
        if (sw === target) return true;
        // Prefix match (first 3 chars) for partial recognition
        const minLen = Math.min(3, Math.min(sw.length, target.length));
        if (sw.slice(0, minLen) === target.slice(0, minLen)) return true;
        // Check if target contains spoken word (partial recognition)
        if (target.includes(sw) && sw.length >= 3) return true;
        if (sw.includes(target) && target.length >= 3) return true;
        return false;
      });

      if (matched) {
        newPointer++;
      } else {
        break; // stop at first unmatched word
      }
    }

    wordPointerRef.current = newPointer;

    // Now update word states based on pointer position
    setAyahs(prev => {
      const updated = [...prev];
      const ayah    = { ...updated[idx], words: [...updated[idx].words] };

      ayah.words = ayah.words.map((w, wi) => {
        if (wi < newPointer) {
          return { ...w, state: "correct" as const };
        }
        if (wi === newPointer) {
          return { ...w, state: "current" as const }; // next word to recite
        }
        return { ...w, state: "hidden" as const };
      });

      updated[idx] = ayah;

      // All words revealed → trigger auto-advance
      if (newPointer >= ayah.words.length && !countRef.current) {
        setTimeout(() => triggerCountdown(ayah.words), 300);
      }

      return updated;
    });
  }, []);

  const triggerCountdown = (words: Word[]) => {
    if (countRef.current) return;
    stopRecording();
    let c = 3;
    setCountdown(c);
    countRef.current = setInterval(() => {
      c--;
      if (c <= 0) {
        clearInterval(countRef.current!);
        countRef.current = null;
        setCountdown(null);
        advanceAyah(words);
      } else {
        setCountdown(c);
      }
    }, 1000);
  };

  const getScore = (words?: Word[]) => {
    const w = words || ayahsRef.current[ayahIdxRef.current]?.words || [];
    const correct = w.filter(x=>x.state==="correct").length;
    const wrong   = w.filter(x=>x.state==="wrong").length;
    const total   = w.length;
    return { correct, wrong, total, pct: total>0?Math.round((correct/total)*100):0 };
  };

  const advanceAyah = async (words?: Word[]) => {
    const sc = getScore(words);
    setSessionStats(s=>({correct:s.correct+sc.correct,wrong:s.wrong+sc.wrong}));
    await saveSession(sc.pct, words);
    const idx = ayahIdxRef.current;
    wordPointerRef.current = 0; // reset for next ayah
    if (idx < ayahsRef.current.length-1) {
      setAyahIdx(idx+1); setTimer(0); setTranscript("");
    } else setSessionDone(true);
  };

  const startRecording = async () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSpeechOk(false); return; }

    // Reset word pointer for this ayah
    wordPointerRef.current = 0;

    // Reset current ayah words to hidden
    setAyahs(prev => {
      const u   = [...prev];
      const idx = ayahIdxRef.current;
      if (u[idx]) u[idx] = { ...u[idx], words: u[idx].words.map(w => ({ ...w, state: "hidden" as const })) };
      return u;
    });

    // Start audio recording for admin review
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
      mr.start(200);
      mediaRecRef.current = mr;
    } catch(_) {}

    // ── Speech Recognition ──
    const rec = new SR();
    rec.lang            = "ar-SA";
    rec.continuous      = true;
    rec.interimResults  = true;
    rec.maxAlternatives = 5;

    // Accumulate ALL transcripts so far (final + interim)
    const finalTranscripts: string[] = [];

    rec.onresult = (e: any) => {
      // Separate final and interim results
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          finalTranscripts.push(t);
        } else {
          interim = t;
        }
      }
      // Combine all finals + current interim for full accumulated text
      const full = [...finalTranscripts, interim].join(" ").trim();
      setTranscript(full);
      if (full) checkWords(full);
    };

    rec.onerror = (e: any) => {
      if (e.error === "no-speech") return;
      if (e.error === "aborted")   return;
      // On network error, try to restart
      if (e.error === "network" && isRecordingRef.current) {
        setTimeout(() => { try { rec.start(); } catch(_) {} }, 500);
      }
    };

    // ── KEY FIX: use isRecordingRef not isRecording state ──
    rec.onend = () => {
      if (isRecordingRef.current && recogRef.current === rec) {
        setTimeout(() => {
          try { rec.start(); } catch(_) {}
        }, 200);
      }
    };

    recogRef.current = rec;
    try {
      rec.start();
      isRecordingRef.current = true;
      setIsRecording(true);
      setTimer(0);
      setTranscript("");
    } catch(e) {
      isRecordingRef.current = false;
    }
  };

  const stopRecording = () => {
    isRecordingRef.current = false; // ← set ref FIRST so onend doesn't restart
    setIsRecording(false);
    if (recogRef.current) {
      try { recogRef.current.stop(); } catch(_) {}
      recogRef.current = null;
    }
    if (mediaRecRef.current) {
      try { mediaRecRef.current.stop(); } catch(_) {}
      mediaRecRef.current = null;
    }
  };

  const handlePeekStart = (wi: number) => {
    setPeekIdx(wi);
    peekTimerRef.current = setTimeout(()=>setPeekIdx(null), 2000);
  };
  const handlePeekEnd = () => { if(peekTimerRef.current) clearTimeout(peekTimerRef.current); setPeekIdx(null); };

  const saveSession = async (scorePct: number, words?: Word[]) => {
    if (!userId || !selected) return;
    setSaving(true);
    try {
      const w = words || [];
      let audioUrl = "";
      if (chunksRef.current.length > 0) {
        const blob = new Blob(chunksRef.current, { type:"audio/webm" });
        const path = `${userId}/${selected.number}_${ayahsRef.current[ayahIdxRef.current]?.numberInSurah}_${Date.now()}.webm`;
        const { data: up } = await supabase.storage.from("hifdh-recordings").upload(path, blob);
        if (up) {
          const { data: urlData } = supabase.storage.from("hifdh-recordings").getPublicUrl(path);
          audioUrl = urlData?.publicUrl ?? "";
        }
      }
      await supabase.from("hifdh_recordings").insert({
        student_id:userId, surah_num:selected.number, surah_name:selected.englishName,
        ayah_start:ayahsRef.current[ayahIdxRef.current]?.numberInSurah,
        ayah_end:ayahsRef.current[ayahIdxRef.current]?.numberInSurah,
        audio_url:audioUrl, ai_score:scorePct, status:"pending", transcript,
        word_results: w.map(x=>({word:x.raw,result:x.state})),
      });
      await supabase.from("hifdh_sessions").insert({
        student_id:userId, surah_number:selected.number, surah_name:selected.englishName,
        ayah_start:ayahsRef.current[ayahIdxRef.current]?.numberInSurah,
        accuracy_score:scorePct, correct:w.filter(x=>x.state==="correct").length,
        wrong:w.filter(x=>x.state==="wrong").length, duration:timer,
      });
      const { data:ex } = await supabase.from("hifdh_progress").select("id,best_accuracy,times_reviewed").eq("user_id",userId).eq("surah_num",selected.number).single();
      if (ex) {
        await supabase.from("hifdh_progress").update({ last_reviewed:new Date().toISOString(), best_accuracy:Math.max(ex.best_accuracy??0,scorePct), times_reviewed:(ex.times_reviewed??0)+1 }).eq("id",ex.id);
      } else {
        await supabase.from("hifdh_progress").insert({ user_id:userId, surah_num:selected.number, surah_name:selected.englishName, last_reviewed:new Date().toISOString(), best_accuracy:scorePct, times_reviewed:1 });
      }
    } catch(_){}
    setSaving(false);
  };

  const score = getScore();
  const currentAyah = ayahs[ayahIdx];
  const filtered = surahs.filter(s=>s.englishName.toLowerCase().includes(search.toLowerCase())||s.name.includes(search));

  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background:"#fff", border:"1px solid #e2e8f0", borderRadius:16, boxShadow:"0 1px 6px rgba(0,0,0,.05)", ...ex,
  });

  return (
    <div style={{ padding:"18px 16px", display:"flex", flexDirection:"column", gap:16 }}>

      {/* Surah Picker */}
      <div style={card({ padding:"16px" })}>
        <div style={{ textAlign:"center", marginBottom:12 }}>
          <div style={{ fontFamily:"'Amiri',serif", fontSize:18, fontWeight:700, color:"#1a3d24" }}>Select Surah</div>
          <div style={{ fontSize:12, color:"#b7791f" }}>اختر السورة</div>
          {selected && <div style={{ fontSize:13, color:"#276749", fontWeight:700, marginTop:4 }}>{selected.englishName} — {selected.name}</div>}
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search surah…"
          style={{ width:"100%", background:"#f8fafb", border:"1px solid #e2e8f0", borderRadius:10, padding:"9px 13px", fontSize:13, color:"#1a3d24", marginBottom:10 }} />
        <div style={{ display:"flex", gap:7, overflowX:"auto", paddingBottom:4 }}>
          {filtered.slice(0,30).map(s=>(
            <div key={s.number} onClick={()=>{setSelected(s);setSearch("");}}
              style={{ flexShrink:0, padding:"6px 13px", borderRadius:20, fontSize:12, cursor:"pointer", whiteSpace:"nowrap",
                background:selected?.number===s.number?"#1a3d24":"#f8fafb",
                color:selected?.number===s.number?"#fff":"#1a3d24",
                border:`1px solid ${selected?.number===s.number?"#1a3d24":"#e2e8f0"}`,
                fontWeight:selected?.number===s.number?700:400,
              }}>
              {s.englishName}<br/><span style={{ fontSize:10, opacity:.8 }}>{s.name}</span>
            </div>
          ))}
        </div>
      </div>

      {!selected && (
        <div style={card({ padding:"44px 20px", textAlign:"center" })}>
          <div style={{ fontSize:44, marginBottom:12 }}>📖</div>
          <div style={{ fontFamily:"'Amiri',serif", fontSize:20, color:"#1a3d24", fontWeight:700 }}>Select a Surah to Begin</div>
          <div style={{ fontSize:13, color:"#7a9e88", marginTop:4 }}>اختر سورة للبدء</div>
        </div>
      )}

      {selected && loading && (
        <div style={card({ padding:"44px", textAlign:"center" })}>
          <div style={{ fontSize:13, color:"#b7791f", animation:"pulse 1s infinite" }}>Loading ayahs…</div>
        </div>
      )}

      {sessionDone && selected && (
        <div style={card({ padding:"36px 20px", textAlign:"center" })}>
          <div style={{ fontSize:48, marginBottom:12 }}>🎉</div>
          <div style={{ fontFamily:"'Amiri',serif", fontSize:24, color:"#1a3d24", fontWeight:700 }}>Excellent! Session Complete</div>
          <div style={{ fontSize:14, color:"#b7791f", marginTop:4 }}>أحسنت — Well done!</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, margin:"20px 0" }}>
            {[{l:"Correct",a:"صحيح",v:sessionStats.correct,c:"#276749",bg:"#f0fff4"},{l:"Wrong",a:"خطأ",v:sessionStats.wrong,c:"#c0392b",bg:"#fff5f5"},{l:"Ayahs",a:"آيات",v:ayahs.length,c:"#1a3d24",bg:"#f8fafb"}].map((x,i)=>(
              <div key={i} style={{ background:x.bg, borderRadius:12, padding:"14px 8px", border:`1px solid ${x.c}22` }}>
                <div style={{ fontSize:26, fontWeight:900, color:x.c }}>{x.v}</div>
                <div style={{ fontSize:12, fontWeight:700, color:"#1a3d24", marginTop:3 }}>{x.l}</div>
                <div style={{ fontSize:10, color:"#7a9e88" }}>{x.a}</div>
              </div>
            ))}
          </div>
          <button onClick={()=>{setSessionDone(false);setAyahIdx(0);setSessionStats({correct:0,wrong:0});setAyahs(p=>p.map(a=>({...a,words:a.words.map(w=>({...w,state:"hidden" as const}))})));}}
            style={{ padding:"13px 32px", borderRadius:12, background:"#1a3d24", border:"none", color:"#fff", fontSize:14, fontWeight:700 }}>
            Start Again · أعد المحاولة
          </button>
        </div>
      )}

      {selected && !loading && !sessionDone && currentAyah && (
        <>
          {/* Mushaf Display */}
          <div style={card({ padding:0, overflow:"hidden" })}>
            {/* Header */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", background:"#f8f4ec", borderBottom:"1px solid #e2e8f0" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:38, height:38, borderRadius:"50%", background:"#fffbeb", border:"1.5px solid #b7791f", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:"#b7791f" }}>
                  {selected.number}
                </div>
                <div>
                  <div style={{ fontSize:15, fontWeight:900, color:"#1a3d24" }}>{selected.englishName}</div>
                  <div style={{ fontSize:12, color:"#b7791f", fontWeight:600 }}>{selected.name}</div>
                  <div style={{ fontSize:11, color:"#7a9e88" }}>Ayah {currentAyah.numberInSurah} / {selected.numberOfAyahs}</div>
                </div>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                {saving && <span style={{ fontSize:10, color:"#b7791f", animation:"pulse 1s infinite" }}>Saving…</span>}
                <button onClick={()=>setIsFullscreen(v=>!v)}
                  style={{ padding:"6px 10px", borderRadius:8, background:"#f0f4f0", border:"1px solid #e2e8f0", fontSize:12, color:"#1a3d24" }}>
                  {isFullscreen?"⊡ Exit":"⊞ Full"}
                </button>
              </div>
            </div>

            {/* Legend */}
            <div style={{ display:"flex", gap:16, padding:"8px 16px", background:"#fafaf8", borderBottom:"1px solid #f0f4f0", flexWrap:"wrap" as const }}>
              {[["#276749","Correct","صحيح"],["#c0392b","Error","خطأ"],["#b7791f","Current","الآن"],["#94a3b8","Hold to peek","اضغط للمعاينة"]].map(([c,en,ar],i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:4, fontSize:11 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:c as string }} />
                  <span style={{ fontWeight:700, color:"#1a3d24" }}>{en}</span>
                  <span style={{ color:"#7a9e88" }}>{ar}</span>
                </div>
              ))}
            </div>

            {/* Bismillah */}
            {currentAyah.numberInSurah===1 && selected.number!==9 && (
              <div style={{ textAlign:"center", padding:"18px 20px", borderBottom:"1px solid #f0f4ec", background:"#fffdf5" }}>
                <div style={{ fontFamily:"'Amiri Quran',serif", fontSize:30, fontWeight:700, color:"#1a3d24", lineHeight:2.2, direction:"rtl" }}>
                  بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
                </div>
                <div style={{ fontSize:12, fontWeight:600, color:"#7a9e88", marginTop:2 }}>In the name of Allah, the Most Gracious, the Most Merciful</div>
              </div>
            )}

            {/* Ayah Text — full width, bold, large */}
            <div style={{ padding: isFullscreen?"30px 20px":"22px 18px", background:"#fffdf5", minHeight: isFullscreen?300:160 }}>
              <div style={{ fontFamily:"'Amiri Quran',serif", fontSize: isFullscreen?34:28, fontWeight:700, lineHeight:3, textAlign:"justify", direction:"rtl", width:"100%" }}>
                {currentAyah.words.map((w,wi)=>{
                  const isPeek = peekIdx===wi;
                  const show = isPeek || w.state==="correct" || w.state==="wrong" || w.state==="current";
                  return (
                    <span key={wi}
                      onMouseDown={()=>w.state==="hidden"&&handlePeekStart(wi)}
                      onMouseUp={handlePeekEnd}
                      onTouchStart={()=>w.state==="hidden"&&handlePeekStart(wi)}
                      onTouchEnd={handlePeekEnd}
                      style={{
                        display:"inline-block", marginLeft:8, cursor:w.state==="hidden"?"pointer":"default", transition:"all .15s",
                        ...(show ? {
                          color: isPeek?"#276749":w.state==="correct"?"#276749":w.state==="wrong"?"#c0392b":"#b7791f",
                          background: isPeek?"#e6ffed":w.state==="correct"?"#f0fff4":w.state==="wrong"?"#fff5f5":"#fffbeb",
                          borderRadius:5, padding:"0 3px",
                          border: `1px solid ${isPeek?"#9ae6b4":w.state==="correct"?"#9ae6b4":w.state==="wrong"?"#fca5a5":"#f6e05e"}`,
                          animation: w.state==="current"?"pulse 1.2s infinite":undefined,
                          textDecoration: w.state==="wrong"?"underline":undefined,
                          textDecorationStyle: w.state==="wrong"?"wavy" as const:undefined,
                          textDecorationColor: w.state==="wrong"?"#c0392b":undefined,
                        } : {
                          color:"transparent", background:"#cbd5e0", borderRadius:4, userSelect:"none" as const,
                          minWidth:`${Math.max(w.raw.length*10,28)}px`, height:"0.75em",
                          verticalAlign:"middle", display:"inline-block",
                        })
                      }}>
                      {show ? w.raw : "\u00A0".repeat(Math.max(w.raw.length,2))}
                    </span>
                  );
                })}
                <span style={{ color:"rgba(183,121,31,.6)", fontSize:20 }}> ﴿{currentAyah.numberInSurah}﴾</span>
              </div>
            </div>

            {/* Countdown */}
            {countdown!==null && (
              <div style={{ padding:"12px", background:"#fffbeb", borderTop:"1px solid #f6e05e", textAlign:"center" }}>
                <div style={{ fontSize:14, fontWeight:900, color:"#b7791f" }}>
                  Auto-advancing in {countdown}… · التالية خلال {countdown}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px", borderTop:"1px solid #e2e8f0", background:"#f8f4ec" }}>
              <button onClick={()=>{ stopRecording(); wordPointerRef.current=0; if(ayahIdx>0){setAyahIdx(i=>i-1);setTimer(0);setTranscript("");}}} disabled={ayahIdx===0}
                style={{ padding:"9px 16px", borderRadius:10, background:"#f0f4f0", border:"1px solid #e2e8f0", fontSize:13, fontWeight:700, color:ayahIdx===0?"#7a9e88":"#1a3d24", opacity:ayahIdx===0?.5:1 }}>
                ← Previous
              </button>
              <span style={{ fontSize:13, fontWeight:700, color:"#1a3d24" }}>{ayahIdx+1} / {ayahs.length}</span>
              <button onClick={()=>advanceAyah()}
                style={{ padding:"9px 16px", borderRadius:10, background:"#1a3d24", border:"none", color:"#fff", fontSize:13, fontWeight:700 }}>
                Next →
              </button>
            </div>
          </div>

          {/* Mic Panel */}
          <div style={card({ padding:"22px 18px", display:"flex", flexDirection:"column", alignItems:"center", gap:14 })}>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:18, fontWeight:900, color:"#1a3d24" }}>Recitation</div>
              <div style={{ fontSize:13, color:"#b7791f" }}>التلاوة</div>
            </div>

            {!speechOk && (
              <div style={{ width:"100%", background:"#fff5f5", border:"1px solid #fca5a5", borderRadius:10, padding:"10px 14px", fontSize:13, fontWeight:700, color:"#c0392b", textAlign:"center" }}>
                ⚠️ Please use Chrome or Edge for speech recognition
              </div>
            )}

            <div style={{ fontSize:14, fontWeight:700, color: isRecording?"#b7791f":"#718096" }}>
              {isRecording?"● Listening…":"Tap to Start"}
            </div>
            <div style={{ fontSize:12, color:"#7a9e88" }}>Hold any word to peek · اضغط على كلمة لمعاينتها</div>

            <div onClick={isRecording?stopRecording:startRecording}
              style={{ width:96, height:96, borderRadius:"50%", cursor:"pointer", transition:"all .2s",
                background: isRecording?"#1a3d24":"#f0f4f0",
                border:`2px solid ${isRecording?"#1a3d24":"#cbd5e0"}`,
                display:"flex", alignItems:"center", justifyContent:"center",
                boxShadow: isRecording?"0 4px 20px rgba(26,61,36,.3),0 0 0 10px rgba(26,61,36,.07)":"0 2px 8px rgba(0,0,0,.1)",
              }}>
              <div style={{ width:68, height:68, borderRadius:"50%", background:isRecording?"#276749":"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28 }}>
                {isRecording?"⏹":"🎙️"}
              </div>
            </div>

            <div style={{ fontSize:36, fontWeight:900, color:"#1a3d24", fontVariantNumeric:"tabular-nums", letterSpacing:3 }}>
              {fmt(timer)}
            </div>

            {isRecording && (
              <div style={{ display:"flex", alignItems:"center", gap:3, height:38 }}>
                {[16,24,12,30,18,34,14,26,10,22,32,16].map((h,i)=>(
                  <div key={i} style={{ width:3, height:h, background:"#1a3d24", borderRadius:2, opacity:.5, animation:`wave 1.1s ease-in-out ${i*.09}s infinite` }} />
                ))}
              </div>
            )}

            {/* Always show this box while recording so user knows if mic is picking up */}
            <div style={{ width:"100%", background: transcript ? "#f0fff4" : "#f8fafb", border:`1px solid ${transcript?"#9ae6b4":"#e2e8f0"}`, borderRadius:10, padding:"10px 14px", minHeight:50, transition:"all .3s" }}>
              {transcript ? (
                <div style={{ fontSize:18, fontWeight:700, color:"#1a3d24", textAlign:"right", direction:"rtl", fontFamily:"'Amiri Quran',serif", lineHeight:2 }}>
                  {transcript}
                </div>
              ) : (
                <div style={{ fontSize:12, fontWeight:600, color:"#7a9e88", textAlign:"center" }}>
                  {isRecording
                    ? "🎙️ Listening… Start reciting الآن"
                    : "Transcript will appear here as you recite"}
                </div>
              )}
            </div>

            <div style={{ display:"flex", gap:10, width:"100%" }}>
              <button onClick={stopRecording} disabled={!isRecording}
                style={{ flex:1, padding:"12px 0", borderRadius:12, background:isRecording?"#fff5f5":"#f8fafb", border:`1px solid ${isRecording?"#fca5a5":"#e2e8f0"}`, color:isRecording?"#c0392b":"#7a9e88", fontSize:14, fontWeight:700, opacity:isRecording?1:.6 }}>
                ⏹ Stop
              </button>
              <button onClick={()=>advanceAyah()}
                style={{ flex:1, padding:"12px 0", borderRadius:12, background:"#1a3d24", border:"none", color:"#fff", fontSize:14, fontWeight:700 }}>
                Next Ayah →
              </button>
            </div>
          </div>

          {/* Live Score */}
          <div style={card({ padding:"18px" })}>
            <div style={{ textAlign:"center", marginBottom:14 }}>
              <div style={{ fontSize:17, fontWeight:900, color:"#1a3d24" }}>Live Score</div>
              <div style={{ fontSize:12, color:"#b7791f" }}>التقييم اللحظي</div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:12 }}>
              <div style={{ width:70, height:70, borderRadius:"50%", background:`conic-gradient(#276749 0deg ${Math.round(score.pct*3.6)}deg,#f0f4f0 ${Math.round(score.pct*3.6)}deg)`, display:"flex", alignItems:"center", justifyContent:"center", position:"relative", flexShrink:0 }}>
                <div style={{ position:"absolute", width:52, height:52, borderRadius:"50%", background:"#fff" }} />
                <span style={{ position:"relative", fontSize:15, fontWeight:900, color:"#1a3d24" }}>{score.pct}%</span>
              </div>
              <div style={{ flex:1 }}>
                {([["✅ Correct","صحيح",score.correct,"#276749","#f0fff4"],["❌ Wrong","خطأ",score.wrong,"#c0392b","#fff5f5"],["⏳ Hidden","مخفي",score.total-score.correct-score.wrong,"#b7791f","#fffbeb"]] as const).map(([en,ar,val,col,bg],i)=>(
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"5px 10px", borderRadius:8, background:bg, marginBottom:5 }}>
                    <div>
                      <span style={{ fontSize:13, fontWeight:700, color:"#1a3d24" }}>{en}</span>
                      <span style={{ fontSize:11, color:"#7a9e88", marginRight:4 }}> {ar}</span>
                    </div>
                    <span style={{ fontSize:13, fontWeight:900, color:col }}>{val} words</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ height:8, borderRadius:4, background:"#f0f4f0", overflow:"hidden" }}>
              <div style={{ width:`${score.pct}%`, height:"100%", borderRadius:4, background:"linear-gradient(90deg,#276749,#b7791f)", transition:"width .5s" }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
