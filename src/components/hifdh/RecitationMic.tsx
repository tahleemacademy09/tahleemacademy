/*
  src/components/hifdh/RecitationMic.tsx
  ────────────────────────────────────────────────────────────
  - Mushaf-style Quran page display
  - Hidden words reveal as you recite
  - Word-by-word AI checking (green/red)
  - Peek on tap-hold
  - Auto-advance with 3s countdown
  - Audio recording → Supabase Storage
  - Session saved to hifdh_sessions + hifdh_recordings

  SUPABASE REQUIRED:
  ─────────────────
  Storage bucket: hifdh-recordings (public: false)

  Table: hifdh_recordings
    id              uuid primary key default uuid_generate_v4()
    student_id      uuid references auth.users
    surah_num       int
    surah_name      text
    ayah_start      int
    ayah_end        int
    audio_url       text
    ai_score        int
    admin_score     int
    admin_feedback  text
    admin_id        uuid
    admin_reviewed_at timestamp
    transcript      text
    word_results    jsonb
    status          text default 'pending'   -- pending|reviewed|overridden
    created_at      timestamp default now()

  SQL:
  ────
  create table if not exists hifdh_recordings (
    id uuid primary key default uuid_generate_v4(),
    student_id uuid references auth.users,
    surah_num int, surah_name text,
    ayah_start int, ayah_end int,
    audio_url text, ai_score int,
    admin_score int, admin_feedback text, admin_id uuid,
    admin_reviewed_at timestamp, transcript text,
    word_results jsonb, status text default 'pending',
    created_at timestamp default now()
  );
  alter table hifdh_recordings enable row level security;
  create policy "student own" on hifdh_recordings for select using (auth.uid() = student_id);
  create policy "insert own"  on hifdh_recordings for insert with check (auth.uid() = student_id);
  create policy "admin all"   on hifdh_recordings for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
*/

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Props { userId: string | null; }

interface SurahMeta {
  number: number; name: string; englishName: string; numberOfAyahs: number;
}
interface Word {
  raw: string; normalized: string;
  reveal: "hidden" | "correct" | "wrong" | "peek";
}
interface Ayah {
  number: number; numberInSurah: number; text: string; words: Word[];
}

const normalize = (t: string) =>
  t.replace(/[\u064B-\u065F\u0670]/g,"")
   .replace(/[أإآ]/g,"ا").replace(/ة/g,"ه").replace(/ى/g,"ي")
   .replace(/\s+/g," ").trim();

const toWords = (text: string): Word[] =>
  text.replace(/﴿.*?﴾/g,"").trim().split(/\s+/).filter(Boolean)
    .map(w => ({ raw: w, normalized: normalize(w), reveal: "hidden" as const }));

export default function RecitationMic({ userId }: Props) {
  const [surahs, setSurahs]           = useState<SurahMeta[]>([]);
  const [search, setSearch]           = useState("");
  const [selected, setSelected]       = useState<SurahMeta | null>(null);
  const [ayahs, setAyahs]             = useState<Ayah[]>([]);
  const [ayahIdx, setAyahIdx]         = useState(0);
  const [loading, setLoading]         = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [timer, setTimer]             = useState(0);
  const [transcript, setTranscript]   = useState("");
  const [speechOk, setSpeechOk]       = useState(true);

  const [countdown, setCountdown]     = useState<number | null>(null);
  const [sessionDone, setSessionDone] = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct: 0, wrong: 0 });

  const [peekWord, setPeekWord]       = useState<number | null>(null);
  const peekTimer                     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recogRef    = useRef<any>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const audioRef    = useRef<HTMLAudioElement | null>(null);
  const countRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load surahs
  useEffect(() => {
    fetch("https://api.alquran.cloud/v1/surah")
      .then(r => r.json()).then(d => { if (d.code===200) setSurahs(d.data); });
  }, []);

  // Load ayahs
  useEffect(() => {
    if (!selected) return;
    setLoading(true); setAyahIdx(0); setAyahs([]); setSessionDone(false); setSessionStats({ correct:0, wrong:0 });
    fetch(`https://api.alquran.cloud/v1/surah/${selected.number}/ar.uthmani`)
      .then(r => r.json()).then(d => {
        if (d.code===200) setAyahs(d.data.ayahs.map((a: any) => ({
          number: a.number, numberInSurah: a.numberInSurah,
          text: a.text, words: toWords(a.text),
        })));
      }).finally(() => setLoading(false));
  }, [selected]);

  // Timer
  useEffect(() => {
    if (isRecording) timerRef.current = setInterval(() => setTimer(t => t+1), 1000);
    else if (timerRef.current) clearInterval(timerRef.current);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  const fmt = (s: number) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  // Word checking
  const checkWords = useCallback((spoken: string) => {
    if (!ayahs[ayahIdx]) return;
    const spWords = normalize(spoken).split(/\s+/).filter(Boolean);
    setAyahs(prev => {
      const updated = [...prev];
      const ayah = { ...updated[ayahIdx] };
      const words = ayah.words.map((w, wi) => {
        const sp = spWords[wi];
        if (!sp) return { ...w, reveal: wi === spWords.length ? "hidden" as const : w.reveal };
        if (sp === w.normalized || spWords.some(s => s === w.normalized)) return { ...w, reveal: "correct" as const };
        return { ...w, reveal: "wrong" as const };
      });
      ayah.words = words;
      updated[ayahIdx] = ayah;
      // Check if all words revealed → trigger auto-advance
      const allDone = words.every(w => w.reveal === "correct" || w.reveal === "wrong");
      if (allDone) startCountdown(words);
      return updated;
    });
  }, [ayahIdx, ayahs]);

  // Auto-advance countdown
  const startCountdown = (words: Word[]) => {
    if (countRef.current) return; // already counting
    stopRecording();
    let c = 3;
    setCountdown(c);
    countRef.current = setInterval(() => {
      c--;
      if (c <= 0) {
        clearInterval(countRef.current!); countRef.current = null;
        setCountdown(null);
        advanceAyah(words);
      } else setCountdown(c);
    }, 1000);
  };

  const advanceAyah = async (words?: Word[]) => {
    const w = words || (ayahs[ayahIdx]?.words ?? []);
    const correct = w.filter(x => x.reveal === "correct").length;
    const wrong   = w.filter(x => x.reveal === "wrong").length;
    const total   = w.length;
    const pct     = total > 0 ? Math.round((correct/total)*100) : 0;
    setSessionStats(s => ({ correct: s.correct + correct, wrong: s.wrong + wrong }));
    await saveToSupabase(pct, w);
    if (ayahIdx < ayahs.length - 1) {
      setAyahIdx(i => i + 1); setTimer(0); setTranscript("");
    } else setSessionDone(true);
  };

  // Speech recognition
  const startRecording = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSpeechOk(false); return; }

    // Start audio recording
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      audioChunks.current = [];
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mr.ondataavailable = e => audioChunks.current.push(e.data);
      mr.start(250);
      mediaRecRef.current = mr;
    }).catch(() => {});

    const rec = new SR();
    rec.lang = "ar-SA"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) interim += e.results[i][0].transcript;
      setTranscript(interim);
      checkWords(interim);
    };
    rec.onerror = (e: any) => { if (e.error !== "no-speech") stopRecording(); };
    rec.onend   = () => { if (recogRef.current && isRecording) { try { rec.start(); } catch(_){} } };
    recogRef.current = rec;
    try { rec.start(); setIsRecording(true); setTimer(0); setTranscript(""); resetWords(); } catch(_){}
  };

  const stopRecording = () => {
    if (recogRef.current) { try { recogRef.current.stop(); } catch(_){} recogRef.current = null; }
    if (mediaRecRef.current) { try { mediaRecRef.current.stop(); } catch(_){} }
    setIsRecording(false);
  };

  const resetWords = () => setAyahs(prev => {
    const u = [...prev];
    if (u[ayahIdx]) u[ayahIdx] = { ...u[ayahIdx], words: u[ayahIdx].words.map(w => ({ ...w, reveal: "hidden" })) };
    return u;
  });

  // Peek
  const handlePeekStart = (wi: number) => {
    setPeekWord(wi);
    peekTimer.current = setTimeout(() => setPeekWord(null), 2000);
  };
  const handlePeekEnd = () => { if (peekTimer.current) clearTimeout(peekTimer.current); setPeekWord(null); };

  // Save to Supabase
  const saveToSupabase = async (score: number, words: Word[]) => {
    if (!userId || !selected || !ayahs[ayahIdx]) return;
    try {
      // Upload audio
      let audioUrl = "";
      if (audioChunks.current.length > 0) {
        const blob = new Blob(audioChunks.current, { type: "audio/webm" });
        const path = `${userId}/${selected.number}_${ayahs[ayahIdx].numberInSurah}_${Date.now()}.webm`;
        const { data: upData } = await supabase.storage.from("hifdh-recordings").upload(path, blob);
        if (upData) {
          const { data: urlData } = supabase.storage.from("hifdh-recordings").getPublicUrl(path);
          audioUrl = urlData?.publicUrl ?? "";
        }
      }

      // Save recording record
      await supabase.from("hifdh_recordings").insert({
        student_id: userId,
        surah_num: selected.number, surah_name: selected.englishName,
        ayah_start: ayahs[ayahIdx].numberInSurah, ayah_end: ayahs[ayahIdx].numberInSurah,
        audio_url: audioUrl, ai_score: score, status: "pending",
        transcript, word_results: words.map(w => ({ word: w.raw, result: w.reveal })),
      });

      // Save session
      await supabase.from("hifdh_sessions").insert({
        student_id: userId, surah_number: selected.number, surah_name: selected.englishName,
        ayah_start: ayahs[ayahIdx].numberInSurah, accuracy_score: score,
        correct: words.filter(w => w.reveal==="correct").length,
        wrong: words.filter(w => w.reveal==="wrong").length,
        duration: timer,
      });

      // Upsert progress
      const { data: ex } = await supabase.from("hifdh_progress")
        .select("id,best_accuracy,times_reviewed").eq("user_id", userId).eq("surah_num", selected.number).single();
      if (ex) {
        await supabase.from("hifdh_progress").update({
          last_reviewed: new Date().toISOString(),
          best_accuracy: Math.max(ex.best_accuracy??0, score),
          times_reviewed: (ex.times_reviewed??0) + 1,
        }).eq("id", ex.id);
      } else {
        await supabase.from("hifdh_progress").insert({
          user_id: userId, surah_num: selected.number, surah_name: selected.englishName,
          last_reviewed: new Date().toISOString(), best_accuracy: score, times_reviewed: 1,
        });
      }
    } catch(_) {}
  };

  const score = (() => {
    if (!ayahs[ayahIdx]) return { correct:0, wrong:0, total:0, pct:0 };
    const w = ayahs[ayahIdx].words;
    const correct = w.filter(x => x.reveal==="correct").length;
    const wrong   = w.filter(x => x.reveal==="wrong").length;
    return { correct, wrong, total: w.length, pct: w.length > 0 ? Math.round((correct/w.length)*100) : 0 };
  })();

  const filtered = surahs.filter(s =>
    s.englishName.toLowerCase().includes(search.toLowerCase()) || s.name.includes(search)
  );

  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background:"#fff", border:"1px solid #e8f0eb", borderRadius:16,
    boxShadow:"0 1px 6px rgba(0,0,0,.05)", ...ex,
  });

  const currentAyah = ayahs[ayahIdx];

  return (
    <div style={{ padding:"18px 16px", display:"flex", flexDirection:"column", gap:16 }}>

      {/* Surah Picker */}
      <div style={card({ padding:"16px" })}>
        <div style={{ fontFamily:"'Amiri',serif", fontSize:17, fontWeight:700, color:"#1a3d24", marginBottom:10 }}>
          Select Surah · اختر السورة
          {selected && <span style={{ fontSize:13, color:"#b7791f", fontWeight:400 }}> — {selected.englishName} · {selected.name}</span>}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search… ابحث"
          style={{ width:"100%", background:"#f8fafb", border:"1px solid #e8f0eb", borderRadius:10, padding:"9px 13px", fontSize:13, color:"#1a3d24", marginBottom:10 }} />
        <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:4 }}>
          {filtered.slice(0,30).map(s => (
            <div key={s.number} onClick={() => { setSelected(s); setSearch(""); }}
              style={{ flexShrink:0, padding:"5px 12px", borderRadius:20, fontSize:11, cursor:"pointer", whiteSpace:"nowrap",
                background: selected?.number===s.number ? "#1a3d24" : "#f8fafb",
                color: selected?.number===s.number ? "#fff" : "#1a3d24",
                border:`1px solid ${selected?.number===s.number ? "#1a3d24" : "#e8f0eb"}`,
                fontWeight: selected?.number===s.number ? 700 : 400,
              }}>
              {s.englishName} · {s.name}
            </div>
          ))}
        </div>
      </div>

      {/* No surah */}
      {!selected && (
        <div style={card({ padding:"40px 20px", textAlign:"center" })}>
          <div style={{ fontSize:40, marginBottom:12 }}>📖</div>
          <div style={{ fontFamily:"'Amiri',serif", fontSize:18, color:"#1a3d24", fontWeight:700 }}>Select a Surah to Begin</div>
          <div style={{ fontSize:12, color:"#7a9e88", marginTop:4 }}>اختر سورة للبدء</div>
        </div>
      )}

      {/* Loading */}
      {selected && loading && (
        <div style={card({ padding:"40px", textAlign:"center" })}>
          <div style={{ fontSize:12, color:"#b7791f", animation:"pulse 1s infinite" }}>Loading… جارٍ التحميل</div>
        </div>
      )}

      {/* Session Summary */}
      {sessionDone && selected && (
        <div style={card({ padding:"32px 20px", textAlign:"center", animation:"fadeUp .4s ease" })}>
          <div style={{ fontSize:44, marginBottom:12 }}>🎉</div>
          <div style={{ fontFamily:"'Amiri',serif", fontSize:22, color:"#1a3d24", fontWeight:700 }}>Session Complete!</div>
          <div style={{ fontSize:13, color:"#b7791f", marginTop:4, marginBottom:20 }}>{selected.englishName} · {selected.name}</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:20 }}>
            {[
              { l:"Correct · صحيح", v:sessionStats.correct, c:"#276749", bg:"#f0fff4" },
              { l:"Wrong · خطأ",    v:sessionStats.wrong,   c:"#c0392b", bg:"#fff5f5" },
              { l:"Ayahs · آيات",   v:ayahs.length,         c:"#1a3d24", bg:"#f8fafb" },
            ].map((x,i)=>(
              <div key={i} style={{ background:x.bg, borderRadius:12, padding:"14px 8px", border:`1px solid ${x.c}22` }}>
                <div style={{ fontSize:24, fontWeight:900, color:x.c }}>{x.v}</div>
                <div style={{ fontSize:10, color:"#7a9e88", marginTop:2 }}>{x.l}</div>
              </div>
            ))}
          </div>
          <button onClick={() => { setSessionDone(false); setAyahIdx(0); setSessionStats({correct:0,wrong:0}); setAyahs(prev => prev.map(a => ({ ...a, words: a.words.map(w => ({...w,reveal:"hidden"})) }))); }}
            style={{ padding:"12px 28px", borderRadius:12, background:"#1a3d24", border:"none", color:"#fff", fontSize:14, fontWeight:700 }}>
            Start Again · أعد المحاولة
          </button>
        </div>
      )}

      {/* ── Mushaf Ayah Display ── */}
      {selected && !loading && !sessionDone && currentAyah && (
        <>
          {/* Mushaf Page Card */}
          <div style={card({ padding:0, overflow:"hidden" })}>
            {/* Header bar */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", background:"#f8f4ec", borderBottom:"1px solid #e8f0eb" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:36, height:36, borderRadius:"50%", background:"#fffbeb", border:"1.5px solid #b7791f", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#b7791f" }}>
                  {selected.number}
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:"#1a3d24" }}>
                    {selected.englishName} <span style={{ color:"#b7791f" }}>· {selected.name}</span>
                  </div>
                  <div style={{ fontSize:10, color:"#7a9e88" }}>Ayah {currentAyah.numberInSurah} of {selected.numberOfAyahs}</div>
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:11, color:"#7a9e88" }}>{ayahIdx+1} / {ayahs.length}</div>
                <div style={{ fontSize:10, color:"#276749", fontWeight:600 }}>
                  {isRecording ? "● Recording" : "Paused"}
                </div>
              </div>
            </div>

            {/* Legend */}
            <div style={{ display:"flex", gap:14, padding:"8px 16px", background:"#fafaf8", borderBottom:"1px solid #f0f4f0", flexWrap:"wrap" as const }}>
              {[["#276749","Correct"],["#c0392b","Error"],["#888","Hidden — hold to peek"]].map(([c,l],i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:"#7a9e88" }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:c }} />{l}
                </div>
              ))}
            </div>

            {/* Bismillah */}
            {currentAyah.numberInSurah===1 && selected.number!==9 && (
              <div style={{ textAlign:"center", padding:"16px 20px", borderBottom:"1px solid #f0f4ec", background:"#fffdf5" }}>
                <div style={{ fontFamily:"'Amiri Quran',serif", fontSize:26, color:"#1a3d24", lineHeight:2, direction:"rtl" }}>
                  بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
                </div>
                <div style={{ fontSize:10, color:"#7a9e88", marginTop:2 }}>In the name of Allah, the Most Gracious, the Most Merciful</div>
              </div>
            )}

            {/* Ayah Words — Mushaf Style */}
            <div style={{ padding:"24px 20px", background:"#fffdf5", direction:"rtl", minHeight:120 }}>
              <div style={{ fontFamily:"'Amiri Quran',serif", fontSize:28, lineHeight:3, textAlign:"justify", direction:"rtl" }}>
                {currentAyah.words.map((w, wi) => {
                  const isPeeking = peekWord === wi;
                  const reveal = isPeeking ? "peek" : w.reveal;
                  return (
                    <span key={wi}
                      onMouseDown={() => w.reveal==="hidden" && handlePeekStart(wi)}
                      onMouseUp={handlePeekEnd}
                      onTouchStart={() => w.reveal==="hidden" && handlePeekStart(wi)}
                      onTouchEnd={handlePeekEnd}
                      style={{
                        display:"inline-block", marginLeft:8, cursor: w.reveal==="hidden" ? "pointer" : "default",
                        transition:"all .2s",
                        ...(reveal==="hidden" ? {
                          color:"transparent",
                          background:"#c8d4c8",
                          borderRadius:4,
                          minWidth: `${Math.max(w.raw.length * 8, 24)}px`,
                          height:"0.85em",
                          verticalAlign:"middle",
                          display:"inline-block",
                          userSelect:"none" as const,
                        } : reveal==="peek" ? {
                          color:"#1a3d24",
                          background:"#e8f5e9",
                          borderRadius:4,
                          padding:"0 3px",
                          boxShadow:"0 0 0 2px #276749",
                        } : reveal==="correct" ? {
                          color:"#276749",
                          background:"#f0fff4",
                          borderRadius:4,
                          padding:"0 2px",
                        } : {
                          color:"#c0392b",
                          background:"#fff5f5",
                          borderRadius:4,
                          padding:"0 2px",
                          textDecoration:"underline",
                          textDecorationStyle:"wavy" as const,
                          textDecorationColor:"#c0392b",
                        }),
                      }}>
                      {reveal !== "hidden" ? w.raw : "\u00A0".repeat(Math.max(w.raw.length, 2))}
                    </span>
                  );
                })}
                <span style={{ color:"rgba(183,121,31,.6)", fontSize:18, marginRight:8 }}>﴿{currentAyah.numberInSurah}﴾</span>
              </div>
              {peekWord !== null && (
                <div style={{ textAlign:"center", fontSize:11, color:"#276749", marginTop:8, fontStyle:"italic" }}>
                  👁️ Peeking — releasing in a moment
                </div>
              )}
            </div>

            {/* Countdown overlay */}
            {countdown !== null && (
              <div style={{ padding:"14px", background:"#fffbeb", borderTop:"1px solid #f6d860", textAlign:"center" }}>
                <div style={{ fontSize:13, color:"#b7791f", fontWeight:700 }}>
                  Next ayah in {countdown}… · التالية خلال {countdown}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px", borderTop:"1px solid #e8f0eb", background:"#f8f4ec" }}>
              <button onClick={() => { stopRecording(); if(ayahIdx>0){setAyahIdx(i=>i-1);setTimer(0);setTranscript("");} }} disabled={ayahIdx===0}
                style={{ padding:"8px 14px", borderRadius:10, background:"#f0f4f0", border:"1px solid #e8f0eb", color:ayahIdx===0?"#7a9e88":"#1a3d24", fontSize:12, opacity:ayahIdx===0?.5:1, cursor:ayahIdx===0?"not-allowed":"pointer" }}>
                ← Prev
              </button>
              <button onClick={() => advanceAyah()}
                style={{ padding:"8px 16px", borderRadius:10, background:"#1a3d24", border:"none", color:"#fff", fontSize:12, fontWeight:700 }}>
                Next · التالية →
              </button>
            </div>
          </div>

          {/* ── Mic Panel ── */}
          <div style={card({ padding:"22px 18px", display:"flex", flexDirection:"column", alignItems:"center", gap:14 })}>
            <div style={{ fontFamily:"'Amiri',serif", fontSize:17, fontWeight:700, color:"#1a3d24" }}>
              Recitation · التلاوة
            </div>

            {!speechOk && (
              <div style={{ background:"#fff5f5", border:"1px solid #fca5a5", borderRadius:10, padding:"10px 14px", fontSize:12, color:"#c0392b", textAlign:"center", width:"100%" }}>
                ⚠️ Please use Chrome or Edge for speech recognition
              </div>
            )}

            <div style={{ fontSize:12, color: isRecording ? "#b7791f" : "#7a9e88", fontWeight:600 }}>
              {isRecording ? "● Listening · جارٍ الاستماع…" : "Tap mic to start · اضغط للبدء"}
            </div>
            <div style={{ fontSize:11, color:"#7a9e88" }}>Hold a word to peek · اضغط مطولاً لمعاينة الكلمة</div>

            {/* Mic Button */}
            <div onClick={isRecording ? stopRecording : startRecording}
              style={{ width:90, height:90, borderRadius:"50%", cursor:"pointer", transition:"all .2s",
                background: isRecording ? "#1a3d24" : "#f0f4f0",
                border:`2px solid ${isRecording ? "#1a3d24" : "#d4e8d4"}`,
                display:"flex", alignItems:"center", justifyContent:"center",
                boxShadow: isRecording ? "0 4px 20px rgba(26,61,36,.3), 0 0 0 8px rgba(26,61,36,.08)" : "0 2px 8px rgba(0,0,0,.08)",
              }}>
              <div style={{ width:64, height:64, borderRadius:"50%", background: isRecording ? "#276749" : "#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, boxShadow:"inset 0 1px 3px rgba(0,0,0,.1)" }}>
                {isRecording ? "⏹" : "🎙️"}
              </div>
            </div>

            <div style={{ fontSize:30, fontWeight:900, color:"#1a3d24", fontVariantNumeric:"tabular-nums", letterSpacing:2 }}>
              {fmt(timer)}
            </div>

            {/* Waveform */}
            {isRecording && (
              <div style={{ display:"flex", alignItems:"center", gap:3, height:36 }}>
                {[16,24,12,30,18,34,14,26,10,22,32,16].map((h,i)=>(
                  <div key={i} style={{ width:3, height:h, background:"#1a3d24", borderRadius:2, opacity:.5, animation:`wave 1.1s ease-in-out ${i*.09}s infinite` }} />
                ))}
              </div>
            )}

            {/* Transcript */}
            {transcript && (
              <div style={{ width:"100%", background:"#f8fafb", border:"1px solid #e8f0eb", borderRadius:10, padding:"10px 14px", fontSize:16, color:"#1a3d24", textAlign:"right", direction:"rtl", fontFamily:"'Amiri Quran',serif", lineHeight:2, maxHeight:80, overflowY:"auto" }}>
                {transcript}
              </div>
            )}

            <div style={{ display:"flex", gap:10, width:"100%" }}>
              <button onClick={stopRecording} disabled={!isRecording}
                style={{ flex:1, padding:"11px 0", borderRadius:12, background: isRecording ? "#fff5f5" : "#f8fafb", border:`1px solid ${isRecording?"#fca5a5":"#e8f0eb"}`, color: isRecording ? "#c0392b" : "#7a9e88", fontSize:13, fontWeight:600, opacity: isRecording ? 1 : .6 }}>
                ⏹ Stop · إيقاف
              </button>
              <button onClick={() => advanceAyah()}
                style={{ flex:1, padding:"11px 0", borderRadius:12, background:"#1a3d24", border:"none", color:"#fff", fontSize:13, fontWeight:700 }}>
                Next Ayah · التالية →
              </button>
            </div>
          </div>

          {/* ── Live Score ── */}
          <div style={card({ padding:"18px" })}>
            <div style={{ fontFamily:"'Amiri',serif", fontSize:17, fontWeight:700, color:"#1a3d24", marginBottom:14 }}>
              Live Score · التقييم اللحظي
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:12 }}>
              <div style={{ width:68, height:68, borderRadius:"50%", background:`conic-gradient(#276749 0deg ${Math.round(score.pct*3.6)}deg,#f0f4f0 ${Math.round(score.pct*3.6)}deg)`, display:"flex", alignItems:"center", justifyContent:"center", position:"relative", flexShrink:0 }}>
                <div style={{ position:"absolute", width:50, height:50, borderRadius:"50%", background:"#fff" }} />
                <span style={{ position:"relative", fontSize:14, fontWeight:900, color:"#1a3d24" }}>{score.pct}%</span>
              </div>
              <div style={{ flex:1 }}>
                {([["✅ Correct · صحيح",score.correct,"#276749","#f0fff4"],["❌ Wrong · خطأ",score.wrong,"#c0392b","#fff5f5"],["⏳ Hidden · مخفي",score.total-score.correct-score.wrong,"#b7791f","#fffbeb"]] as const).map(([l,v,c,bg],i)=>(
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"4px 10px", borderRadius:8, background:bg, marginBottom:5 }}>
                    <span style={{ fontSize:12, color:"#7a9e88" }}>{l}</span>
                    <span style={{ fontSize:12, color:c, fontWeight:700 }}>{v} words</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ height:6, borderRadius:3, background:"#f0f4f0", overflow:"hidden" }}>
              <div style={{ width:`${score.pct}%`, height:"100%", borderRadius:3, background:"linear-gradient(90deg,#276749,#b7791f)", transition:"width .5s ease" }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
