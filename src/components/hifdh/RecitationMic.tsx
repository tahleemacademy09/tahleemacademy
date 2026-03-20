/*
  src/components/hifdh/RecitationMic.tsx

  Tarteel-style page-based recitation:
  - All ayahs of the current page shown at once (hidden words)
  - Words reveal in real-time as you recite
  - Active ayah highlighted; auto-scrolls into view
  - Page auto-advances when all ayahs on the page are complete
  - Fixed bottom bar: mic + live transcript + progress
*/

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mic, Square, ChevronRight, ChevronLeft, BookOpen } from "lucide-react";

const DEEPGRAM_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY || "";
const GROQ_KEY     = import.meta.env.VITE_GROQ_API_KEY     || "";

/* ─── Types ───────────────────────────────────────────────── */
interface Props { userId: string | null; }
interface SurahMeta { number: number; name: string; englishName: string; numberOfAyahs: number; }
type WordState = "hidden" | "revealed" | "current";
interface Word { raw: string; norm: string; state: WordState; }
interface Ayah { number: number; numberInSurah: number; text: string; words: Word[]; }

/* ─── Arabic helpers ──────────────────────────────────────── */
const normalise = (t: string) =>
  t.replace(/[\u064B-\u065F\u0670]/g, "")
   .replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
   .replace(/\u0640/g, "").replace(/\s+/g, " ").trim();

const toWords = (text: string): Word[] =>
  text.replace(/﴿.*?﴾/g, "").trim().split(/\s+/).filter(Boolean)
    .map(w => ({ raw: w, norm: normalise(w), state: "hidden" as WordState }));

const arabicOnly = (t: string) =>
  t.replace(/[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]+/g, " ").replace(/\s+/g, " ").trim();

/* ─── Fuzzy matching ──────────────────────────────────────── */
const lev = (a: string, b: string): number => {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m+1 }, (_,i) =>
    Array.from({ length: n+1 }, (_,j) => i===0?j:j===0?i:0));
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++)
    dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
};
const wordMatches = (spoken: string, target: string) => {
  const s=normalise(spoken),t=normalise(target);
  if(!s||!t) return false;
  if(s===t) return true;
  const ml=Math.min(4,Math.min(s.length,t.length));
  if(ml>=3&&s.slice(0,ml)===t.slice(0,ml)) return true;
  if(t.length>=4&&s.includes(t)) return true;
  if(s.length>=4&&t.includes(s)) return true;
  return lev(s,t)<=Math.floor(Math.max(s.length,t.length)*0.3);
};

/* ─── Audio helpers ───────────────────────────────────────── */
const getBestMimeType = () => {
  for (const t of ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus",""]) {
    if (!t || MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
};
const toDeepgramCT = (mime: string) =>
  mime.includes("mp4")?"audio/mp4":mime.includes("ogg")?"audio/ogg":"audio/webm";
const fmt = (s: number) =>
  `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

/* ─── Page builder ────────────────────────────────────────────
   Groups ayahs into pages of max AYAHS_PER_PAGE ayahs OR
   MAX_WORDS_PER_PAGE words — whichever fills first.
   Short surahs (≤10 ayahs) always go on one page.
─────────────────────────────────────────────────────────────── */
const AYAHS_PER_PAGE  = 5;
const MAX_WORDS_PER_PAGE = 55;

const buildPages = (ayahs: Ayah[]): Ayah[][] => {
  if (ayahs.length <= 10) return [ayahs];
  const pages: Ayah[][] = [];
  let page: Ayah[] = [];
  let wc = 0;
  for (const a of ayahs) {
    const aw = a.words.length;
    if (page.length > 0 && (page.length >= AYAHS_PER_PAGE || wc + aw > MAX_WORDS_PER_PAGE)) {
      pages.push(page);
      page = []; wc = 0;
    }
    page.push(a); wc += aw;
  }
  if (page.length) pages.push(page);
  return pages;
};

/* ─── Colours ─────────────────────────────────────────────── */
const G700="#1a3d24", G500="#276749", G100="#f0fff4";
const GOLD="#b7791f", GOLD_LT="#fffbeb";
const RED="#c0392b", MUTED="#7a9e88", BORDER="#e2e8f0";

/* ═══════════════════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════════════════ */
export default function RecitationMic({ userId }: Props) {
  const [surahs,       setSurahs]       = useState<SurahMeta[]>([]);
  const [search,       setSearch]       = useState("");
  const [selected,     setSelected]     = useState<SurahMeta | null>(null);
  const [ayahs,        setAyahs]        = useState<Ayah[]>([]);
  const [loadingAyahs, setLoadingAyahs] = useState(false);

  const [ayahIdx,    setAyahIdx]    = useState(0);   // global ayah index
  const [pageIdx,    setPageIdx]    = useState(0);   // current page
  const [pages,      setPages]      = useState<Ayah[][]>([]);

  const [recording,  setRecording]  = useState(false);
  const [finished,   setFinished]   = useState(false);
  const [processing, setProcessing] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");
  const [transcript, setTranscript] = useState("");
  const [timer,      setTimer]      = useState(0);
  const [sessionStats, setSessionStats] = useState({ correct: 0, ayahs: 0 });

  /* refs */
  const mediaRecRef  = useRef<MediaRecorder | null>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const initChunkRef = useRef<Blob | null>(null);
  const fullAudioRef = useRef<Blob[]>([]);
  const lastChunkRef = useRef<string>("");  // dedup Whisper hallucinations
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const ayahIdxRef   = useRef(0);
  const ayahsRef     = useRef<Ayah[]>([]);
  const pointerRef   = useRef(0);
  const recordingRef = useRef(false);
  const mimeRef      = useRef("");
  const fullTransRef = useRef("");
  const activeAyahEl = useRef<HTMLDivElement | null>(null);  // for auto-scroll

  useEffect(() => { ayahIdxRef.current = ayahIdx; }, [ayahIdx]);
  useEffect(() => { ayahsRef.current   = ayahs;   }, [ayahs]);
  useEffect(() => { recordingRef.current = recording; }, [recording]);

  /* Auto-scroll active ayah into view */
  useEffect(() => {
    activeAyahEl.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [ayahIdx]);

  /* Load surahs */
  useEffect(() => {
    fetch("https://api.alquran.cloud/v1/surah")
      .then(r=>r.json()).then(d=>{ if(d.code===200) setSurahs(d.data); });
    return () => killMic();
  }, []);

  /* Load ayahs when surah selected */
  useEffect(() => {
    if (!selected) return;
    setLoadingAyahs(true);
    setAyahIdx(0); setPageIdx(0); setAyahs([]); setPages([]);
    setRecording(false); setFinished(false);
    pointerRef.current=0; fullTransRef.current="";
    killMic();
    fetch(`https://api.alquran.cloud/v1/surah/${selected.number}/ar.uthmani`)
      .then(r=>r.json()).then(d=>{
        if(d.code===200){
          const loaded: Ayah[] = d.data.ayahs.map((a:any)=>({
            number: a.number, numberInSurah: a.numberInSurah,
            text: a.text, words: toWords(a.text),
          }));
          setAyahs(loaded);
          setPages(buildPages(loaded));
        }
      }).finally(()=>setLoadingAyahs(false));
  }, [selected]);

  /* Timer */
  useEffect(() => {
    if (recording) {
      timerRef.current = setInterval(()=>setTimer(t=>t+1), 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current=null; }
    }
    return () => { if(timerRef.current) clearInterval(timerRef.current); };
  }, [recording]);

  /* ── Advance to next ayah ─────────────────────────────────── */
  const advanceAyah = useCallback((idx: number) => {
    saveAyah(idx);
    setSessionStats(s=>({ ...s, ayahs: s.ayahs+1 }));
    fullTransRef.current = "";
    lastChunkRef.current = "";
    pointerRef.current   = 0;
    setTranscript("");

    const next = idx + 1;
    ayahIdxRef.current = next;

    if (next >= ayahsRef.current.length) {
      setFinished(true); setRecording(false); killMic(); return;
    }

    setAyahIdx(next);
    setTimer(0);

    // If next ayah is on a different page, advance page
    setPages(prevPages => {
      const newPageIdx = prevPages.findIndex(p => p.some(a => a.numberInSurah === ayahsRef.current[next]?.numberInSurah));
      if (newPageIdx >= 0) setPageIdx(newPageIdx);
      return prevPages;
    });

    // Reset words for next ayah
    setAyahs(prev => {
      const u = [...prev];
      if (u[next]) u[next]={...u[next], words: u[next].words.map(w=>({...w, state:"hidden" as WordState}))};
      return u;
    });
  }, []);

  /* ── Process transcript chunk ─────────────────────────────── */
  const processTranscript = useCallback((newText: string) => {
    if (!newText.trim() || !recordingRef.current) return;
    const arabicText = arabicOnly(newText);
    if (!arabicText) return;

    // Skip chunks that are identical/near-identical to last chunk (Whisper hallucination)
    const newNorm = normalise(arabicText);
    const lastNorm = normalise(lastChunkRef.current);
    if (newNorm && lastNorm && newNorm === lastNorm) return;
    lastChunkRef.current = arabicText;

    // Keep fullTrans bounded — if > 120 chars, trim to last 60 chars to avoid
    // token flood from hallucinations confusing the sequential matcher
    const combined = (fullTransRef.current+" "+arabicText).trim();
    fullTransRef.current = combined.length > 120 ? combined.slice(-60) : combined;
    setTranscript(fullTransRef.current);

    const idx   = ayahIdxRef.current;
    const words = ayahsRef.current[idx]?.words;
    if (!words) return;

    const tokens = fullTransRef.current.split(/\s+/).filter(Boolean).map(normalise);
    let ptr=0, ti=0;
    while (ptr<words.length && ti<tokens.length) {
      if (wordMatches(tokens[ti], words[ptr].norm)) { ptr++; ti++; }
      else ti++;
    }
    if (ptr===pointerRef.current) return;
    pointerRef.current = ptr;

    setAyahs(prev => {
      const updated = [...prev];
      const ayah    = { ...updated[idx], words: updated[idx].words.map((w,wi)=>({
        ...w, state: wi<ptr?"revealed":wi===ptr?"current":"hidden" as WordState,
      }))};
      updated[idx] = ayah;
      if (ptr>=ayah.words.length) {
        setSessionStats(s=>({ ...s, correct: s.correct+ayah.words.length }));
        setTimeout(()=>advanceAyah(idx), 0);
      }
      return updated;
    });
  }, [advanceAyah]);

  /* ── VAD: skip silent chunks ──────────────────────────────── */
  const hasSpeech = useCallback(async (blob: Blob): Promise<boolean> => {
    try {
      const buf = await blob.arrayBuffer();
      const ctx = new (window.AudioContext||(window as any).webkitAudioContext)({ sampleRate:16000 });
      const audio = await ctx.decodeAudioData(buf);
      ctx.close();
      const d = audio.getChannelData(0);
      let sum=0; for(let i=0;i<d.length;i++) sum+=d[i]*d[i];
      return Math.sqrt(sum/d.length) > 0.01;
    } catch { return true; }
  }, []);

  /* ── Transcribe: Deepgram → Groq fallback ────────────────── */
  const sendToDeepgram = useCallback(async (blob: Blob) => {
    if (blob.size<500) return;
    if (!(await hasSpeech(blob))) return;
    setProcessing(true);
    try {
      let text="";
      if (DEEPGRAM_KEY) {
        try {
          const res = await fetch(
            "https://api.deepgram.com/v1/listen?model=nova-2&language=ar&punctuate=false",
            { method:"POST", headers:{ Authorization:`Token ${DEEPGRAM_KEY}`, "Content-Type":toDeepgramCT(mimeRef.current||blob.type) }, body:blob }
          );
          if (!res.ok) throw new Error(`Deepgram ${res.status}`);
          const data = await res.json();
          text = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript||"";
        } catch(e:any) { console.warn("Deepgram failed:",e?.message); }
      }
      if (!text && GROQ_KEY) {
        const ext=(mimeRef.current||"audio/webm").includes("mp4")?"mp4":(mimeRef.current||"").includes("ogg")?"ogg":"webm";
        const file=new File([blob],`audio.${ext}`,{ type:mimeRef.current||"audio/webm" });
        const fd=new FormData();
        fd.append("file",file); fd.append("model","whisper-large-v3-turbo");
        fd.append("language","ar"); fd.append("response_format","json");
        fd.append("prompt","بسم الله الرحمن الرحيم"); fd.append("temperature","0");
        const res=await fetch("https://api.groq.com/openai/v1/audio/transcriptions",
          { method:"POST", headers:{ Authorization:`Bearer ${GROQ_KEY}` }, body:fd });
        if (res.status===429) { console.warn("Groq rate limited, skipping"); return; }
        if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text().catch(()=>"")}`);
        text=(await res.json())?.text||"";
      }
      if (text) processTranscript(text);
      setError("");
    } catch(e:any) {
      setError(`Transcription failed: ${e?.message||"Unknown error"}`);
    } finally { setProcessing(false); }
  }, [processTranscript, hasSpeech]);

  /* ── Single MediaRecorder with timeslice ─────────────────── */
  const startRecording = useCallback((stream: MediaStream) => {
    if (!recordingRef.current) return;
    initChunkRef.current = null;
    const mr = new MediaRecorder(stream, mimeRef.current?{ mimeType:mimeRef.current }:{});
    mr.ondataavailable = e => {
      if (!e.data?.size||e.data.size===0) return;
      fullAudioRef.current.push(e.data);
      if (!initChunkRef.current) {
        initChunkRef.current=e.data;
        if (e.data.size>=500) sendToDeepgram(e.data);
        return;
      }
      const blob=new Blob([initChunkRef.current,e.data],{ type:mimeRef.current||"audio/webm" });
      if (blob.size>=500) sendToDeepgram(blob);
    };
    mr.start(3000);
    mediaRecRef.current=mr;
  }, [sendToDeepgram]);

  const killMic = () => {
    recordingRef.current=false;
    if(mediaRecRef.current){ try{mediaRecRef.current.stop();}catch(_){} mediaRecRef.current=null; }
    if(streamRef.current){ streamRef.current.getTracks().forEach(t=>t.stop()); streamRef.current=null; }
  };

  const toggleMic = async () => {
    if (recording) { setRecording(false); killMic(); return; }
    setError(""); setFinished(false);
    pointerRef.current=0; fullTransRef.current="";
    setTranscript(""); setTimer(0);
    setSessionStats({ correct:0, ayahs:0 });
    try {
      const stream=await navigator.mediaDevices.getUserMedia({ audio:true });
      streamRef.current=stream; fullAudioRef.current=[];
      mimeRef.current=getBestMimeType();
      recordingRef.current=true; setRecording(true);
      startRecording(stream);
    } catch { setError("Microphone access denied. Please allow mic and try again."); }
  };

  /* ── Save ayah ────────────────────────────────────────────── */
  const saveAyah = async (idx: number) => {
    if (!userId||!selected) return;
    const ayah=ayahsRef.current[idx]; if(!ayah) return;
    setSaving(true);
    try {
      const correct=ayah.words.filter(w=>w.state==="revealed").length;
      const scorePct=ayah.words.length>0?Math.round((correct/ayah.words.length)*100):0;
      let audioUrl="";
      if (fullAudioRef.current.length>0) {
        const blob=new Blob(fullAudioRef.current,{ type:mimeRef.current||"audio/webm" });
        const ext=mimeRef.current.includes("mp4")?"mp4":mimeRef.current.includes("ogg")?"ogg":"webm";
        const path=`${userId}/${selected.number}_${ayah.numberInSurah}_${Date.now()}.${ext}`;
        const { data:up }=await supabase.storage.from("hifdh-recordings").upload(path,blob);
        if(up){ const { data:u }=supabase.storage.from("hifdh-recordings").getPublicUrl(path); audioUrl=u?.publicUrl??""; }
        fullAudioRef.current=[];
      }
      await Promise.all([
        supabase.from("hifdh_recordings").insert({
          student_id:userId, surah_num:selected.number, surah_name:selected.englishName,
          ayah_start:ayah.numberInSurah, ayah_end:ayah.numberInSurah,
          audio_url:audioUrl, ai_score:scorePct, status:"pending",
          transcript:fullTransRef.current, word_results:ayah.words.map(x=>({ word:x.raw, result:x.state })),
        }),
        supabase.from("hifdh_sessions").insert({
          student_id:userId, surah_number:selected.number, surah_name:selected.englishName,
          ayah_start:ayah.numberInSurah, accuracy_score:scorePct, correct, wrong:0, duration:timer,
        }),
      ]);
      const { data:ex }=await supabase.from("hifdh_progress")
        .select("id,best_accuracy,times_reviewed").eq("user_id",userId).eq("surah_num",selected.number).single();
      if(ex){
        await supabase.from("hifdh_progress").update({
          last_reviewed:new Date().toISOString(),
          best_accuracy:Math.max(ex.best_accuracy??0,scorePct),
          times_reviewed:(ex.times_reviewed??0)+1,
        }).eq("id",ex.id);
      } else {
        await supabase.from("hifdh_progress").insert({
          user_id:userId, surah_num:selected.number, surah_name:selected.englishName,
          last_reviewed:new Date().toISOString(), best_accuracy:scorePct, times_reviewed:1,
        });
      }
    } catch(_) {}
    setSaving(false);
  };

  /* ── Derived ──────────────────────────────────────────────── */
  const currentPage    = pages[pageIdx] ?? [];
  const totalRevealed  = ayahs.reduce((s,a)=>s+a.words.filter(w=>w.state==="revealed").length, 0);
  const totalWords     = ayahs.reduce((s,a)=>s+a.words.length, 0);
  const overallPct     = totalWords>0 ? Math.round((totalRevealed/totalWords)*100) : 0;
  const filtered       = surahs.filter(s=>
    s.englishName.toLowerCase().includes(search.toLowerCase())||s.name.includes(search));

  /* ══ RENDER ════════════════════════════════════════════════ */
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100dvh", maxWidth:640, margin:"0 auto", background:"#fdfaf4", position:"relative", overflow:"hidden" }}>

      {/* ── TOP BAR ── */}
      <div style={{ flexShrink:0, background:G700, color:"#fff", padding:"10px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", zIndex:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <BookOpen size={18} color="#fff" />
          {selected ? (
            <div>
              <div style={{ fontSize:13, fontWeight:900 }}>{selected.englishName}</div>
              <div style={{ fontSize:11, opacity:.75, fontFamily:"'Amiri',serif" }}>{selected.name}</div>
            </div>
          ) : (
            <div style={{ fontSize:13, fontWeight:700 }}>Hifdh Practice</div>
          )}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          {selected && pages.length>1 && (
            <div style={{ fontSize:11, background:"rgba(255,255,255,.15)", borderRadius:8, padding:"3px 8px" }}>
              Page {pageIdx+1}/{pages.length}
            </div>
          )}
          {recording && (
            <div style={{ fontSize:12, fontVariantNumeric:"tabular-nums", fontWeight:700 }}>{fmt(timer)}</div>
          )}
          {saving && <div style={{ fontSize:10, opacity:.7 }}>Saving…</div>}
        </div>
      </div>

      {/* ── SURAH PICKER (shown when no surah selected) ── */}
      {!selected && (
        <div style={{ flex:1, overflowY:"auto", padding:16, display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ textAlign:"center", padding:"24px 0 8px" }}>
            <div style={{ fontSize:32, marginBottom:8 }}>📖</div>
            <div style={{ fontSize:18, fontWeight:900, color:G700 }}>اختر سورة للبدء</div>
            <div style={{ fontSize:13, color:MUTED, marginTop:4 }}>Select a Surah to begin</div>
          </div>
          <input
            value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search surah…"
            style={{ background:"#fff", border:`1px solid ${BORDER}`, borderRadius:12, padding:"11px 14px", fontSize:14, color:G700, width:"100%", boxSizing:"border-box" }}
          />
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
            {filtered.slice(0,114).map(s=>(
              <div key={s.number} onClick={()=>{ setSelected(s); setSearch(""); setFinished(false); }}
                style={{ background:"#fff", border:`1px solid ${BORDER}`, borderRadius:12, padding:"12px 14px", cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:32, height:32, borderRadius:"50%", background:GOLD_LT, border:`1.5px solid ${GOLD}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:900, color:GOLD, flexShrink:0 }}>
                  {s.number}
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:G700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{s.englishName}</div>
                  <div style={{ fontSize:12, fontFamily:"'Amiri',serif", color:GOLD }}>{s.name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── LOADING ── */}
      {selected && loadingAyahs && (
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:24, marginBottom:8 }}>⏳</div>
            <div style={{ fontSize:13, color:GOLD }}>Loading ayahs…</div>
          </div>
        </div>
      )}

      {/* ── COMPLETE SCREEN ── */}
      {finished && selected && (
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div style={{ textAlign:"center", background:"#fff", borderRadius:20, padding:32, border:`1px solid ${BORDER}`, width:"100%" }}>
            <div style={{ fontSize:52, marginBottom:12 }}>🎉</div>
            <div style={{ fontSize:22, fontWeight:900, color:G700, fontFamily:"'Amiri',serif" }}>Surah Complete!</div>
            <div style={{ fontSize:13, color:GOLD, marginTop:4, marginBottom:24 }}>أحسنت — Well done!</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:24 }}>
              {[
                { l:"Words",  v:sessionStats.correct, bg:"#f0fff4", c:G500 },
                { l:"Ayahs",  v:sessionStats.ayahs,   bg:GOLD_LT,  c:GOLD },
                { l:"Time",   v:fmt(timer),            bg:"#f8fafb", c:G700 },
              ].map((x,i)=>(
                <div key={i} style={{ background:x.bg, borderRadius:12, padding:"14px 8px" }}>
                  <div style={{ fontSize:22, fontWeight:900, color:x.c }}>{x.v}</div>
                  <div style={{ fontSize:11, color:MUTED }}>{x.l}</div>
                </div>
              ))}
            </div>
            <button onClick={()=>{ setSelected(null); setFinished(false); setAyahIdx(0); setPageIdx(0); setAyahs([]); setPages([]); setTimer(0); setSessionStats({ correct:0, ayahs:0 }); }}
              style={{ width:"100%", padding:14, borderRadius:12, border:"none", background:G700, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", marginBottom:10 }}>
              📖 New Surah
            </button>
            <button onClick={()=>{ setFinished(false); setAyahIdx(0); setPageIdx(0); setTimer(0); setSessionStats({ correct:0, ayahs:0 }); setAyahs(p=>p.map(a=>({ ...a, words:a.words.map(w=>({ ...w, state:"hidden" as WordState })) }))); setPages(buildPages(ayahsRef.current)); }}
              style={{ width:"100%", padding:14, borderRadius:12, border:`1px solid ${BORDER}`, background:"#fff", color:G700, fontSize:14, fontWeight:700, cursor:"pointer" }}>
              🔄 Repeat Surah
            </button>
          </div>
        </div>
      )}

      {/* ══ MAIN PAGE VIEW ══════════════════════════════════════ */}
      {selected && !loadingAyahs && !finished && currentPage.length>0 && (
        <>
          {/* Scrollable ayah area */}
          <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 160px" }}>

            {/* Bismillah on page 0 ayah 1 */}
            {pageIdx===0 && selected.number!==9 && (
              <div style={{ textAlign:"center", marginBottom:16, padding:"10px 0" }}>
                <div style={{ fontFamily:"'Amiri Quran',serif", fontSize:26, color:G700, lineHeight:2.2, direction:"rtl" }}>
                  بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
                </div>
              </div>
            )}

            {/* Page number indicator */}
            {pages.length>1 && (
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
                <div style={{ flex:1, height:1, background:BORDER }} />
                <div style={{ fontSize:11, color:MUTED, padding:"2px 10px", border:`1px solid ${BORDER}`, borderRadius:20, background:"#fff", whiteSpace:"nowrap" }}>
                  Page {pageIdx+1} · Ayahs {currentPage[0].numberInSurah}–{currentPage[currentPage.length-1].numberInSurah}
                </div>
                <div style={{ flex:1, height:1, background:BORDER }} />
              </div>
            )}

            {/* All ayahs on the current page rendered together */}
            <div style={{ background:"#fff", borderRadius:16, border:`1px solid ${BORDER}`, padding:"20px 18px", boxShadow:"0 2px 12px rgba(0,0,0,.05)" }}>
              <div style={{ fontFamily:"'Amiri Quran',serif", fontSize:26, lineHeight:3.6, textAlign:"justify", direction:"rtl", width:"100%" }}>
                {currentPage.map((ayah) => {
                  const isActive = ayah.numberInSurah === ayahsRef.current[ayahIdx]?.numberInSurah;
                  const isDone   = ayah.words.every(w=>w.state==="revealed");
                  return (
                    <span key={ayah.numberInSurah}
                      ref={isActive ? (el:any)=>{ activeAyahEl.current=el; } : undefined}
                      style={{ display:"inline" }}>
                      {ayah.words.map((w,wi)=>{
                        const isRevealed=w.state==="revealed";
                        const isCurrent =w.state==="current";
                        const isHidden  =w.state==="hidden";
                        return (
                          <span key={wi} style={{
                            display:"inline-block", margin:"0 3px",
                            transition:"all .2s",
                            ...(isRevealed?{
                              color:G500,
                            }:isCurrent?{
                              color:GOLD,
                              background:GOLD_LT,
                              borderRadius:4,
                              padding:"0 2px",
                              border:`1.5px solid ${GOLD}`,
                              textShadow:`0 0 6px ${GOLD}66`,
                              animation:"wordPulse .7s ease-in-out infinite",
                            }:{
                              color:"transparent",
                              background: isActive ? "#c8c8c8" : "#dedede",
                              borderRadius:3,
                              minWidth:`${Math.max(w.raw.length*9,20)}px`,
                              height:"0.6em", verticalAlign:"middle",
                              display:"inline-block",
                            })
                          }}>
                            {isHidden ? "\u00A0".repeat(Math.max(w.raw.length,2)) : w.raw}
                          </span>
                        );
                      })}
                      {/* Ayah number ornament */}
                      <span style={{
                        color: isDone ? G500 : isActive ? GOLD : "rgba(183,121,31,.45)",
                        fontSize:18, margin:"0 4px", fontFamily:"'Amiri',serif",
                        fontWeight: isActive ? 900 : 400,
                      }}>
                        ﴿{ayah.numberInSurah}﴾
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Page nav (manual) */}
            {pages.length>1 && (
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:14 }}>
                <button disabled={pageIdx===0||recording}
                  onClick={()=>{ if(pageIdx>0){ setPageIdx(p=>p-1); } }}
                  style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 14px", borderRadius:10, border:`1px solid ${BORDER}`, background:"#fff", color:pageIdx===0?MUTED:G700, fontSize:13, fontWeight:700, cursor:pageIdx===0||recording?"default":"pointer", opacity:pageIdx===0?.4:1 }}>
                  <ChevronRight size={14}/> Prev
                </button>
                <div style={{ display:"flex", gap:4 }}>
                  {pages.map((_,i)=>(
                    <div key={i} style={{ width:i===pageIdx?16:6, height:6, borderRadius:3, background:i===pageIdx?G700:i<pageIdx?G500:BORDER, transition:"all .3s" }} />
                  ))}
                </div>
                <button disabled={recording}
                  onClick={()=>{ if(pageIdx<pages.length-1) setPageIdx(p=>p+1); else setFinished(true); }}
                  style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 14px", borderRadius:10, border:`1px solid ${BORDER}`, background:"#fff", color:G700, fontSize:13, fontWeight:700, cursor:recording?"default":"pointer", opacity:recording?.4:1 }}>
                  Next <ChevronLeft size={14}/>
                </button>
              </div>
            )}
          </div>

          {/* ══ FIXED BOTTOM MIC BAR ══════════════════════════════ */}
          <div style={{
            position:"absolute", bottom:0, left:0, right:0,
            background:"rgba(255,253,245,.96)", backdropFilter:"blur(12px)",
            borderTop:`1px solid ${BORDER}`,
            padding:"12px 16px 20px",
            zIndex:20,
          }}>
            {/* Progress bar */}
            <div style={{ height:3, background:"#e8f0e8", borderRadius:2, marginBottom:12, overflow:"hidden" }}>
              <div style={{ width:`${overallPct}%`, height:"100%", background:`linear-gradient(90deg,${G500},${GOLD})`, transition:"width .5s", borderRadius:2 }} />
            </div>

            {/* Error */}
            {error && (
              <div style={{ background:"#fff5f5", border:"1px solid #fca5a5", borderRadius:8, padding:"8px 12px", marginBottom:10, fontSize:12, color:RED, fontWeight:600 }}>
                ⚠️ {error}
              </div>
            )}

            {/* Transcript */}
            {recording && transcript && (
              <div style={{ background:"#f0fff4", border:`1px solid #86efac`, borderRadius:10, padding:"8px 12px", marginBottom:10, maxHeight:60, overflowY:"auto" }}>
                <div style={{ fontSize:14, fontWeight:700, color:G700, direction:"rtl", textAlign:"right", fontFamily:"'Amiri Quran',serif", lineHeight:1.8 }}>
                  {transcript}
                </div>
              </div>
            )}

            {/* Controls row */}
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              {/* Mic button */}
              <button onClick={toggleMic} style={{
                width:60, height:60, borderRadius:"50%", border:"none", cursor:"pointer", flexShrink:0,
                background:recording?RED:G700,
                boxShadow:recording?`0 0 0 5px ${RED}33,0 0 0 10px ${RED}15`:`0 4px 16px rgba(26,61,36,.3)`,
                display:"flex", alignItems:"center", justifyContent:"center", transition:"all .2s",
                animation:recording?"micRing 1.4s ease-in-out infinite":"none",
              }}>
                {recording ? <Square size={22} fill="#fff" color="#fff"/> : <Mic size={22} color="#fff"/>}
              </button>

              {/* Status + waveform */}
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:800, color:recording?RED:G700, marginBottom:3 }}>
                  {recording?"اضغط للإيقاف · Tap to Stop":"اضغط للبدء · Tap to Start"}
                </div>
                {recording ? (
                  <div style={{ display:"flex", alignItems:"center", gap:2, height:20 }}>
                    {[10,16,8,22,12,18,8,14,20,10].map((h,i)=>(
                      <div key={i} style={{ width:3, height:h, borderRadius:2, background:processing?GOLD:G500, opacity:.7, animation:`waveBar .9s ease-in-out ${i*.08}s infinite alternate` }}/>
                    ))}
                    {processing && <span style={{ fontSize:10, color:GOLD, marginLeft:6 }}>⏳</span>}
                  </div>
                ) : (
                  <div style={{ fontSize:11, color:MUTED }}>
                    Ayah {ayahIdx+1}/{ayahs.length} · {overallPct}% complete
                  </div>
                )}
              </div>

              {/* Change surah button */}
              {!recording && (
                <button onClick={()=>{ setSelected(null); killMic(); setAyahs([]); setPages([]); setAyahIdx(0); setPageIdx(0); setFinished(false); }}
                  style={{ padding:"8px 12px", borderRadius:10, border:`1px solid ${BORDER}`, background:"#fff", color:G700, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  Change
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Keyframes */}
      <style>{`
        @keyframes micRing {
          0%,100%{box-shadow:0 0 0 5px ${RED}33,0 0 0 10px ${RED}15;}
          50%{box-shadow:0 0 0 9px ${RED}44,0 0 0 18px ${RED}0a;}
        }
        @keyframes wordPulse {
          0%,100%{opacity:1;} 50%{opacity:.55;}
        }
        @keyframes waveBar {
          from{transform:scaleY(.4);} to{transform:scaleY(1.5);}
        }
      `}</style>
    </div>
  );
}
