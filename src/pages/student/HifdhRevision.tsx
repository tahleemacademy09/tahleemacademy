/*
  ╔══════════════════════════════════════════════════════╗
  ║   HifdhRevision.tsx — Tahleem Academy                ║
  ║   Full AI-Hifdh Page with:                           ║
  ║   • Real mic (Web Speech API, Arabic)                ║
  ║   • Word-by-word live checking                       ║
  ║   • Working timer                                    ║
  ║   • Surah switching (Quran Cloud API)                ║
  ║   • Ayah navigation                                  ║
  ║   • Audio playback (Alafasy)                         ║
  ║   • Score saves to Supabase                          ║
  ║   • Revision schedule from Supabase                  ║
  ║   • Mistake highlighting                             ║
  ╚══════════════════════════════════════════════════════╝

  SUPABASE TABLES REQUIRED:
  ─────────────────────────
  1. hifdh_sessions
     - id          uuid primary key default uuid_generate_v4()
     - user_id     uuid references auth.users
     - surah_num   int
     - surah_name  text
     - ayah_num    int
     - score       int        (0–100)
     - correct     int
     - wrong       int
     - duration    int        (seconds)
     - created_at  timestamp default now()

  2. hifdh_progress
     - id            uuid primary key default uuid_generate_v4()
     - user_id       uuid references auth.users
     - surah_num     int
     - surah_name    text
     - last_reviewed timestamp default now()
     - best_accuracy int
     - times_reviewed int default 1
*/

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────
interface SurahMeta {
  number: number;
  name: string;           // Arabic
  englishName: string;
  numberOfAyahs: number;
}

interface AyahData {
  number: number;         // global verse number
  numberInSurah: number;
  text: string;           // raw Arabic text
  words: WordState[];
}

interface WordState {
  raw: string;            // original with tashkeel
  normalized: string;     // stripped for comparison
  state: "idle" | "correct" | "wrong" | "current";
}

interface RevisionEntry {
  surah_num: number;
  surah_name: string;
  last_reviewed: string;
  best_accuracy: number;
}

type Mode = "memorize" | "recitation" | "revision";

// ─── Arabic helpers ───────────────────────────────────
const normalize = (t: string) =>
  t
    .replace(/[\u064B-\u065F\u0670]/g, "")   // strip tashkeel
    .replace(/[أإآ]/g, "ا")                   // unify alef
    .replace(/ة/g, "ه")                        // teh marbuta → ha
    .replace(/ى/g, "ي")                        // alef maqsura → ya
    .replace(/\s+/g, " ")
    .trim();

const toWords = (text: string): WordState[] =>
  text
    .replace(/﴿.*?﴾/g, "")                   // remove verse numbers
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ({ raw: w, normalized: normalize(w), state: "idle" as const }));

// ─── Main component ───────────────────────────────────
export default function HifdhRevision() {
  // UI state
  const [mode, setMode] = useState<Mode>("recitation");
  const [surahs, setSurahs] = useState<SurahMeta[]>([]);
  const [selectedSurah, setSelectedSurah] = useState<SurahMeta | null>(null);
  const [ayahs, setAyahs] = useState<AyahData[]>([]);
  const [ayahIndex, setAyahIndex] = useState(0);
  const [loadingAyahs, setLoadingAyahs] = useState(false);
  const [surahSearch, setSurahSearch] = useState("");

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [timer, setTimer] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [speechSupported, setSpeechSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Audio
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Session score
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionWrong, setSessionWrong] = useState(0);
  const [showSummary, setShowSummary] = useState(false);

  // Supabase
  const [revisionSchedule, setRevisionSchedule] = useState<RevisionEntry[]>([]);
  const [savingSession, setSavingSession] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // ── Get current user ──────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserId(data.user.id);
    });
  }, []);

  // ── Fetch surahs list ─────────────────────────────
  useEffect(() => {
    fetch("https://api.alquran.cloud/v1/surah")
      .then((r) => r.json())
      .then((d) => {
        if (d.code === 200) setSurahs(d.data);
      })
      .catch(() => {});
  }, []);

  // ── Fetch ayahs when surah changes ────────────────
  useEffect(() => {
    if (!selectedSurah) return;
    setLoadingAyahs(true);
    setAyahIndex(0);
    setAyahs([]);
    setShowSummary(false);
    fetch(`https://api.alquran.cloud/v1/surah/${selectedSurah.number}/ar.uthmani`)
      .then((r) => r.json())
      .then((d) => {
        if (d.code === 200) {
          const parsed: AyahData[] = d.data.ayahs.map((a: any) => ({
            number: a.number,
            numberInSurah: a.numberInSurah,
            text: a.text,
            words: toWords(a.text),
          }));
          setAyahs(parsed);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAyahs(false));
  }, [selectedSurah]);

  // ── Fetch revision schedule ───────────────────────
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("hifdh_progress")
      .select("surah_num,surah_name,last_reviewed,best_accuracy")
      .eq("user_id", userId)
      .order("last_reviewed", { ascending: true })
      .limit(5)
      .then(({ data }) => {
        if (data) setRevisionSchedule(data as RevisionEntry[]);
      })
      .catch(() => {});
  }, [userId]);

  // ── Timer ─────────────────────────────────────────
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  const formatTimer = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // ── Speech Recognition ────────────────────────────
  const initRecognition = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSpeechSupported(false); return null; }

    const rec = new SR();
    rec.lang = "ar-SA";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;

    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        interim += e.results[i][0].transcript;
      }
      setTranscript(interim);
      checkWords(interim);
    };

    rec.onerror = (e: any) => {
      if (e.error !== "no-speech") stopRecording();
    };

    rec.onend = () => {
      // auto-restart if still recording
      if (recognitionRef.current && isRecording) {
        try { rec.start(); } catch (_) {}
      }
    };

    return rec;
  }, [isRecording]);

  // ── Word-by-word checking ─────────────────────────
  const checkWords = useCallback(
    (spokenText: string) => {
      if (!ayahs[ayahIndex]) return;
      const spokenNorm = normalize(spokenText);
      const spokenWords = spokenNorm.split(/\s+/).filter(Boolean);

      setAyahs((prev) => {
        const updated = [...prev];
        const ayah = { ...updated[ayahIndex] };
        const words = ayah.words.map((w, wi) => {
          const spoken = spokenWords[wi];
          if (!spoken) return wi === spokenWords.length ? { ...w, state: "current" as const } : { ...w, state: "idle" as const };
          if (spoken === w.normalized) return { ...w, state: "correct" as const };
          // check any alternative close match
          const isClose = spokenWords.some(
            (sw) => sw === w.normalized || w.normalized.startsWith(sw.slice(0, 3))
          );
          return { ...w, state: isClose ? "correct" as const : "wrong" as const };
        });

        // Mark current word
        const firstIdle = words.findIndex((w) => w.state === "idle");
        if (firstIdle !== -1) words[firstIdle] = { ...words[firstIdle], state: "current" };

        ayah.words = words;
        updated[ayahIndex] = ayah;
        return updated;
      });
    },
    [ayahIndex, ayahs]
  );

  // ── Start recording ───────────────────────────────
  const startRecording = () => {
    const rec = initRecognition();
    if (!rec) return;
    recognitionRef.current = rec;
    try {
      rec.start();
      setIsRecording(true);
      setTimer(0);
      setTranscript("");
      // reset current ayah words to idle
      setAyahs((prev) => {
        const updated = [...prev];
        if (updated[ayahIndex]) {
          updated[ayahIndex] = {
            ...updated[ayahIndex],
            words: updated[ayahIndex].words.map((w) => ({ ...w, state: "idle" })),
          };
        }
        return updated;
      });
    } catch (_) {}
  };

  // ── Stop recording ────────────────────────────────
  const stopRecording = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
    setIsRecording(false);
  };

  // ── Calculate score for current ayah ─────────────
  const getAyahScore = () => {
    if (!ayahs[ayahIndex]) return { correct: 0, wrong: 0, total: 0, pct: 0 };
    const words = ayahs[ayahIndex].words;
    const correct = words.filter((w) => w.state === "correct").length;
    const wrong = words.filter((w) => w.state === "wrong").length;
    const total = words.length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { correct, wrong, total, pct };
  };

  // ── Next ayah ─────────────────────────────────────
  const nextAyah = async () => {
    stopRecording();
    const score = getAyahScore();
    setSessionCorrect((c) => c + score.correct);
    setSessionWrong((w) => w + score.wrong);
    await saveSessionToSupabase(score.pct);

    if (ayahIndex < ayahs.length - 1) {
      setAyahIndex((i) => i + 1);
      setTimer(0);
      setTranscript("");
    } else {
      setShowSummary(true);
    }
  };

  const prevAyah = () => {
    stopRecording();
    if (ayahIndex > 0) {
      setAyahIndex((i) => i - 1);
      setTimer(0);
      setTranscript("");
    }
  };

  // ── Audio playback ────────────────────────────────
  const playAyahAudio = () => {
    if (!ayahs[ayahIndex]) return;
    const verseNum = ayahs[ayahIndex].number;
    const url = `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${verseNum}.mp3`;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = url;
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
      audioRef.current.onended = () => setIsPlaying(false);
    }
  };

  // ── Save session to Supabase ──────────────────────
  const saveSessionToSupabase = async (scorePct: number) => {
    if (!userId || !selectedSurah || !ayahs[ayahIndex]) return;
    setSavingSession(true);
    try {
      // Save session record
      await supabase.from("hifdh_sessions").insert({
        user_id: userId,
        surah_num: selectedSurah.number,
        surah_name: selectedSurah.englishName,
        ayah_num: ayahs[ayahIndex].numberInSurah,
        score: scorePct,
        correct: getAyahScore().correct,
        wrong: getAyahScore().wrong,
        duration: timer,
      });

      // Upsert progress
      const { data: existing } = await supabase
        .from("hifdh_progress")
        .select("id,times_reviewed,best_accuracy")
        .eq("user_id", userId)
        .eq("surah_num", selectedSurah.number)
        .single();

      if (existing) {
        await supabase
          .from("hifdh_progress")
          .update({
            last_reviewed: new Date().toISOString(),
            best_accuracy: Math.max(existing.best_accuracy ?? 0, scorePct),
            times_reviewed: (existing.times_reviewed ?? 0) + 1,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("hifdh_progress").insert({
          user_id: userId,
          surah_num: selectedSurah.number,
          surah_name: selectedSurah.englishName,
          last_reviewed: new Date().toISOString(),
          best_accuracy: scorePct,
          times_reviewed: 1,
        });
      }
    } catch (_) {}
    setSavingSession(false);
  };

  // ── Days since date ───────────────────────────────
  const daysSince = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    return Math.floor(diff / 86400000);
  };

  const urgencyColor = (days: number) =>
    days >= 10 ? "#eb5757" : days >= 5 ? "#f2c94c" : "#6fcf97";

  const urgencyLabel = (days: number) =>
    days >= 10 ? "Urgent · عاجل" : days >= 5 ? "Soon · قريباً" : "Good · بخير";

  // ── Current ayah & score ──────────────────────────
  const currentAyah = ayahs[ayahIndex];
  const score = getAyahScore();

  const filteredSurahs = surahs.filter(
    (s) =>
      s.englishName.toLowerCase().includes(surahSearch.toLowerCase()) ||
      s.name.includes(surahSearch)
  );

  // ─── Styles ───────────────────────────────────────
  const C = {
    bg: "#0a1f13", mid: "#122b1a", border: "rgba(201,168,76,0.14)",
    gold: "#c9a84c", goldLight: "#e4c36a", dim: "#7a9e88", text: "#e8f0eb",
    green: "#6fcf97", red: "#eb5757", yellow: "#f2c94c",
  };

  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: C.mid, border: `1px solid ${C.border}`,
    borderRadius: 16, padding: "18px 18px", ...extra,
  });

  const wordColor = (s: WordState["state"]) => ({
    idle: C.text, correct: C.green, wrong: C.red, current: C.gold,
  }[s]);

  // ─────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Cairo',sans-serif", background: C.bg, minHeight: "100vh", color: C.text, overflowX: "hidden" }}>

      {/* Hidden audio element */}
      <audio ref={audioRef} style={{ display: "none" }} />

      {/* Geometric bg */}
      <div style={{ position: "fixed", inset: 0, backgroundImage: "repeating-linear-gradient(60deg,transparent,transparent 40px,rgba(201,168,76,0.018) 40px,rgba(201,168,76,0.018) 41px),repeating-linear-gradient(-60deg,transparent,transparent 40px,rgba(201,168,76,0.018) 40px,rgba(201,168,76,0.018) 41px)", pointerEvents: "none", zIndex: 0 }} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Cairo:wght@300;400;600;700;900&display=swap');
        @keyframes pulse  { 0%,100%{opacity:.7} 50%{opacity:1} }
        @keyframes ring   { 0%,100%{box-shadow:0 0 0 0 rgba(201,168,76,.22)} 50%{box-shadow:0 0 0 18px rgba(201,168,76,.06),0 0 0 36px rgba(201,168,76,.02)} }
        @keyframes wave   { 0%,100%{transform:scaleY(.3)} 50%{transform:scaleY(1)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-thumb{background:rgba(201,168,76,.2);border-radius:2px}
      `}</style>

      <div style={{ position: "relative", zIndex: 1, paddingBottom: 50 }}>

        {/* ── Top Bar ── */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", borderBottom:`1px solid ${C.border}`, background:"rgba(10,31,19,.9)", backdropFilter:"blur(12px)", position:"sticky", top:0, zIndex:20 }}>
          <div>
            <div style={{ fontSize:17, fontWeight:700 }}>AI-<span style={{ color:C.gold }}>Hifdh</span></div>
            <div style={{ fontSize:10, color:C.dim }}>الحِفظ الذكي · Smart Memorization</div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {savingSession && <span style={{ fontSize:10, color:C.gold, animation:"pulse 1s infinite" }}>Saving…</span>}
            <span style={{ background:"linear-gradient(135deg,#c9a84c,#8b6914)", color:"#0a1f13", fontSize:11, fontWeight:700, padding:"4px 11px", borderRadius:20 }}>🔥 7-Day Streak</span>
          </div>
        </div>

        <div style={{ padding:"20px 16px", display:"flex", flexDirection:"column", gap:18 }}>

          {/* ── Mode Tabs ── */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
            {([
              { k:"memorize",   e:"📖", en:"Memorize",   ar:"حِفظ" },
              { k:"recitation", e:"🎙️", en:"Recitation", ar:"تلاوة" },
              { k:"revision",   e:"🔄", en:"Revision",   ar:"مراجعة" },
            ] as const).map((m) => (
              <div key={m.k} onClick={() => setMode(m.k)}
                style={{ ...card({ padding:"12px 8px", cursor:"pointer", textAlign:"center", transition:"all .2s",
                  background: mode===m.k ? "linear-gradient(135deg,rgba(201,168,76,.18),rgba(46,107,62,.2))" : C.mid,
                  border: `1px solid ${mode===m.k ? "rgba(201,168,76,.45)" : C.border}`,
                  boxShadow: mode===m.k ? "0 0 0 1px rgba(201,168,76,.2),0 4px 20px rgba(0,0,0,.3)" : "none",
                }) }}>
                <div style={{ fontSize:20, marginBottom:4 }}>{m.e}</div>
                <div style={{ fontSize:12, fontWeight:700 }}>{m.en}</div>
                <div style={{ fontSize:10, color:C.gold }}>{m.ar}</div>
                {mode===m.k && <div style={{ marginTop:5, fontSize:9, color:C.gold }}>✨ Active</div>}
              </div>
            ))}
          </div>

          {/* ── Surah Selector ── */}
          <div style={card()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div style={{ fontSize:13, fontWeight:700 }}>Surah · <span style={{ color:C.dim, fontWeight:400 }}>السورة</span></div>
              {selectedSurah && <span style={{ fontSize:11, color:C.gold }}>{selectedSurah.englishName} · {selectedSurah.name}</span>}
            </div>
            <input
              value={surahSearch}
              onChange={(e) => setSurahSearch(e.target.value)}
              placeholder="Search surah… ابحث عن سورة"
              style={{ width:"100%", background:"rgba(255,255,255,.05)", border:`1px solid ${C.border}`, borderRadius:10, padding:"8px 12px", color:C.text, fontSize:12, fontFamily:"'Cairo',sans-serif", outline:"none", marginBottom:10 }}
            />
            <div style={{ display:"flex", gap:7, overflowX:"auto", paddingBottom:4 }}>
              {filteredSurahs.slice(0, 30).map((s) => (
                <div key={s.number}
                  onClick={() => { setSelectedSurah(s); setSurahSearch(""); }}
                  style={{ flexShrink:0, padding:"5px 12px", borderRadius:30, fontSize:11, cursor:"pointer", whiteSpace:"nowrap",
                    background: selectedSurah?.number===s.number ? "linear-gradient(90deg,#c9a84c,#8b6914)" : "rgba(255,255,255,.04)",
                    color: selectedSurah?.number===s.number ? "#0a1f13" : C.text,
                    fontWeight: selectedSurah?.number===s.number ? 700 : 400,
                    border: selectedSurah?.number===s.number ? "none" : `1px solid ${C.border}`,
                  }}>
                  {s.englishName} · {s.name}
                </div>
              ))}
              {surahs.length === 0 && <div style={{ fontSize:12, color:C.dim }}>Loading surahs…</div>}
            </div>
          </div>

          {/* ── No Surah Selected ── */}
          {!selectedSurah && (
            <div style={{ ...card({ textAlign:"center", padding:"40px 20px" }) }}>
              <div style={{ fontSize:36, marginBottom:12 }}>📖</div>
              <div style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>Select a Surah to Begin</div>
              <div style={{ fontSize:12, color:C.dim }}>اختر سورة للبدء · Choose from the list above</div>
            </div>
          )}

          {/* ── Loading ── */}
          {selectedSurah && loadingAyahs && (
            <div style={{ ...card({ textAlign:"center", padding:"40px 20px" }) }}>
              <div style={{ fontSize:12, color:C.gold, animation:"pulse 1s infinite" }}>Loading ayahs… · جارٍ التحميل</div>
            </div>
          )}

          {/* ── Session Summary ── */}
          {showSummary && selectedSurah && (
            <div style={{ ...card({ textAlign:"center", padding:"30px 20px", animation:"fadeIn .4s ease" }) }}>
              <div style={{ fontSize:36, marginBottom:12 }}>🎉</div>
              <div style={{ fontSize:17, fontWeight:700, marginBottom:4 }}>Session Complete! · أحسنت</div>
              <div style={{ fontSize:12, color:C.dim, marginBottom:20 }}>
                {selectedSurah.englishName} · {selectedSurah.name}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:20 }}>
                {[
                  { label:"Correct · صحيح", val:sessionCorrect, color:C.green },
                  { label:"Wrong · خطأ", val:sessionWrong, color:C.red },
                  { label:"Ayahs · آيات", val:ayahs.length, color:C.gold },
                ].map((item,i)=>(
                  <div key={i} style={{ background:"rgba(255,255,255,.04)", borderRadius:10, padding:12 }}>
                    <div style={{ fontSize:22, fontWeight:900, color:item.color }}>{item.val}</div>
                    <div style={{ fontSize:10, color:C.dim, marginTop:2 }}>{item.label}</div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => { setShowSummary(false); setAyahIndex(0); setSessionCorrect(0); setSessionWrong(0); }}
                style={{ padding:"11px 28px", borderRadius:12, background:"linear-gradient(135deg,#c9a84c,#8b6914)", border:"none", color:"#0a1f13", fontFamily:"'Cairo',sans-serif", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                Start Again · أعد المحاولة
              </button>
            </div>
          )}

          {/* ── Quran Display + Controls ── */}
          {selectedSurah && !loadingAyahs && !showSummary && currentAyah && (
            <>
              {/* Ayah Card */}
              <div style={{ ...card({ padding:0, overflow:"hidden" }) }}>
                {/* Header */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", borderBottom:`1px solid ${C.border}`, background:"rgba(0,0,0,.2)" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:34, height:34, borderRadius:"50%", border:`1.5px solid ${C.gold}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:C.gold, fontWeight:700 }}>
                      {selectedSurah.number}
                    </div>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700 }}>{selectedSurah.englishName} <span style={{ color:C.gold }}>· {selectedSurah.name}</span></div>
                      <div style={{ fontSize:10, color:C.dim }}>Ayah {currentAyah.numberInSurah} of {selectedSurah.numberOfAyahs} · آية {currentAyah.numberInSurah}</div>
                    </div>
                  </div>
                  {/* Listen button */}
                  <button
                    onClick={playAyahAudio}
                    style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 12px", borderRadius:20, background: isPlaying ? "rgba(201,168,76,.2)" : "rgba(255,255,255,.06)", border:`1px solid ${C.border}`, color: isPlaying ? C.gold : C.text, fontFamily:"'Cairo',sans-serif", fontSize:11, fontWeight:600, cursor:"pointer" }}>
                    {isPlaying ? "⏸" : "🔊"} {isPlaying ? "Playing" : "Listen · استمع"}
                  </button>
                </div>

                {/* Word legend */}
                <div style={{ display:"flex", gap:14, padding:"8px 16px", background:"rgba(0,0,0,.12)", borderBottom:`1px solid ${C.border}` }}>
                  {[[C.green,"Correct · صحيح"],[C.red,"Error · خطأ"],[C.gold,"Current · الآن"],[C.text,"Pending · لم يُقرأ"]].map(([col,label],i)=>(
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:C.dim }}>
                      <div style={{ width:7, height:7, borderRadius:"50%", background:col as string }} />{label}
                    </div>
                  ))}
                </div>

                {/* Bismillah */}
                {currentAyah.numberInSurah === 1 && selectedSurah.number !== 9 && (
                  <div style={{ textAlign:"center", padding:"16px", borderBottom:`1px solid ${C.border}` }}>
                    <div style={{ fontFamily:"'Amiri Quran',serif", fontSize:24, color:C.goldLight, lineHeight:2 }}>
                      بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
                    </div>
                    <div style={{ fontSize:10, color:C.dim, marginTop:2 }}>In the name of Allah, the Most Gracious, the Most Merciful</div>
                  </div>
                )}

                {/* Ayah text */}
                <div style={{ padding:"20px 16px", direction:"rtl" }}>
                  <div style={{ fontFamily:"'Amiri Quran',serif", fontSize:24, lineHeight:2.4, textAlign:"right" }}>
                    {currentAyah.words.map((w, wi) => (
                      <span key={wi}
                        style={{ display:"inline", marginLeft:6, cursor:"default",
                          color: wordColor(w.state),
                          background: w.state==="wrong" ? "rgba(235,87,87,.12)" : w.state==="current" ? "rgba(201,168,76,.15)" : "transparent",
                          borderRadius: w.state!=="idle" ? "4px" : 0,
                          padding: w.state!=="idle" ? "0 2px" : 0,
                          animation: w.state==="current" ? "pulse 1.2s ease-in-out infinite" : "none",
                        }}>
                        {w.raw}
                      </span>
                    ))}
                    <span style={{ color:"rgba(201,168,76,.6)", fontSize:16 }}> ﴿{currentAyah.numberInSurah}﴾</span>
                  </div>
                </div>

                {/* Ayah navigation */}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 16px", borderTop:`1px solid ${C.border}`, background:"rgba(0,0,0,.12)" }}>
                  <button onClick={prevAyah} disabled={ayahIndex===0}
                    style={{ padding:"7px 14px", borderRadius:10, background:"rgba(255,255,255,.06)", border:`1px solid ${C.border}`, color: ayahIndex===0 ? C.dim : C.text, fontFamily:"'Cairo',sans-serif", fontSize:12, cursor: ayahIndex===0 ? "not-allowed" : "pointer", opacity: ayahIndex===0 ? .5 : 1 }}>
                    ← Prev · السابقة
                  </button>
                  <span style={{ fontSize:11, color:C.dim }}>{ayahIndex+1} / {ayahs.length}</span>
                  <button onClick={nextAyah}
                    style={{ padding:"7px 14px", borderRadius:10, background:"linear-gradient(90deg,#c9a84c,#8b6914)", border:"none", color:"#0a1f13", fontFamily:"'Cairo',sans-serif", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    Next · التالية →
                  </button>
                </div>
              </div>

              {/* ── Recording Panel ── */}
              <div style={{ ...card({ display:"flex", flexDirection:"column", alignItems:"center", gap:16 }) }}>
                {!speechSupported && (
                  <div style={{ background:"rgba(235,87,87,.12)", border:"1px solid rgba(235,87,87,.3)", borderRadius:10, padding:"10px 14px", fontSize:12, color:C.red, textAlign:"center" }}>
                    ⚠️ Speech recognition not supported in this browser. Try Chrome or Edge.
                  </div>
                )}

                <div style={{ fontSize:13, color: isRecording ? C.gold : C.dim, fontWeight:600 }}>
                  {isRecording ? "● Listening · جارٍ الاستماع…" : "Tap mic to start · اضغط للبدء"}
                </div>

                {/* Mic button */}
                <div
                  onClick={isRecording ? stopRecording : startRecording}
                  style={{ width:96, height:96, borderRadius:"50%",
                    background: isRecording ? "linear-gradient(135deg,rgba(201,168,76,.18),rgba(46,107,62,.22))" : "linear-gradient(135deg,rgba(255,255,255,.04),rgba(46,107,62,.1))",
                    border:`1.5px solid ${isRecording ? "rgba(201,168,76,.4)" : C.border}`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    cursor: speechSupported ? "pointer" : "not-allowed",
                    animation: isRecording ? "ring 2.5s ease-in-out infinite" : "none",
                  }}>
                  <div style={{ width:68, height:68, borderRadius:"50%", background:"linear-gradient(145deg,#1a3d24,#0d2818)", border:`1px solid ${isRecording ? "rgba(201,168,76,.35)" : C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26 }}>
                    {isRecording ? "⏹" : "🎙️"}
                  </div>
                </div>

                {/* Timer */}
                <div style={{ fontSize:28, fontWeight:700, fontVariantNumeric:"tabular-nums", color: isRecording ? C.text : C.dim }}>
                  {formatTimer(timer)}
                </div>

                {/* Waveform */}
                {isRecording && (
                  <div style={{ display:"flex", alignItems:"center", gap:3, height:38 }}>
                    {[20,28,16,34,22,38,18,30,14,26,36,20].map((h,i)=>(
                      <div key={i} style={{ width:3, height:h, background:"linear-gradient(180deg,#c9a84c,rgba(201,168,76,.25))", borderRadius:2, animation:`wave 1.1s ease-in-out ${i*.09}s infinite` }} />
                    ))}
                  </div>
                )}

                {/* Live transcript */}
                {transcript.length > 0 && (
                  <div style={{ width:"100%", background:"rgba(255,255,255,.04)", borderRadius:10, padding:"10px 14px", fontSize:14, color:C.dim, textAlign:"right", direction:"rtl", fontFamily:"'Amiri Quran',serif", lineHeight:1.8, maxHeight:80, overflowY:"auto" }}>
                    {transcript}
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display:"flex", gap:10, width:"100%" }}>
                  <button
                    onClick={stopRecording}
                    disabled={!isRecording}
                    style={{ flex:1, padding:"10px 0", borderRadius:12, background:"rgba(235,87,87,.14)", border:"1px solid rgba(235,87,87,.28)", color:C.red, fontFamily:"'Cairo',sans-serif", fontSize:13, fontWeight:600, cursor: isRecording ? "pointer" : "not-allowed", opacity: isRecording ? 1 : .5 }}>
                    ⏹ Stop · إيقاف
                  </button>
                  <button
                    onClick={nextAyah}
                    style={{ flex:1, padding:"10px 0", borderRadius:12, background:"linear-gradient(135deg,#c9a84c,#8b6914)", border:"none", color:"#0a1f13", fontFamily:"'Cairo',sans-serif", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                    Next Ayah · التالية →
                  </button>
                </div>
              </div>

              {/* ── Live Score ── */}
              <div style={card()}>
                <div style={{ fontSize:13, color:C.dim, fontWeight:700, marginBottom:14 }}>
                  Live Score · التقييم اللحظي
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:14 }}>
                  {/* Score ring */}
                  <div style={{ width:68, height:68, borderRadius:"50%", background:`conic-gradient(${C.gold} 0deg ${Math.round(score.pct*3.6)}deg,rgba(255,255,255,.07) ${Math.round(score.pct*3.6)}deg)`, display:"flex", alignItems:"center", justifyContent:"center", position:"relative", flexShrink:0 }}>
                    <div style={{ position:"absolute", width:50, height:50, borderRadius:"50%", background:C.mid }} />
                    <span style={{ position:"relative", fontSize:14, fontWeight:700, color:C.gold }}>{score.pct}%</span>
                  </div>
                  <div style={{ flex:1 }}>
                    {([
                      [`✅ Correct · صحيح`, score.correct, C.green],
                      [`❌ Wrong · خطأ`,    score.wrong,   C.red],
                      [`⏳ Left · متبقي`,   score.total - score.correct - score.wrong, C.yellow],
                    ] as const).map(([label,val,col],i)=>(
                      <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:5 }}>
                        <span style={{ color:C.dim }}>{label}</span>
                        <span style={{ color:col, fontWeight:600 }}>{val} words</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ height:4, borderRadius:2, background:"rgba(255,255,255,.07)", overflow:"hidden" }}>
                  <div style={{ width:`${score.pct}%`, height:"100%", borderRadius:2, background:`linear-gradient(90deg,${C.gold},${C.green})`, transition:"width .5s ease" }} />
                </div>
                {/* Session totals */}
                <div style={{ display:"flex", justifyContent:"space-between", marginTop:12, fontSize:11, color:C.dim }}>
                  <span>Session correct · إجمالي الصحيح: <span style={{ color:C.green, fontWeight:700 }}>{sessionCorrect}</span></span>
                  <span>Session wrong · إجمالي الخطأ: <span style={{ color:C.red, fontWeight:700 }}>{sessionWrong}</span></span>
                </div>
              </div>
            </>
          )}

          {/* ── Stats ── */}
          <div>
            <div style={{ fontSize:11, color:C.dim, letterSpacing:1.2, marginBottom:10 }}>YOUR PROGRESS · تقدمك</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {[
                { icon:"📖", val:"7.5", en:"Juz Memorized",  ar:"أجزاء محفوظة", change:"↑ +0.5 this week" },
                { icon:"🔥", val:"7",   en:"Day Streak",     ar:"سلسلة الأيام", change:"↑ Personal best!" },
                { icon:"⭐", val:"92%", en:"Avg Accuracy",   ar:"متوسط الدقة",  change:"↑ +4% this week" },
                { icon:"⏱️", val:"42",  en:"Mins Today",     ar:"دقيقة اليوم",  change:"Target: 60 mins" },
              ].map((s,i)=>(
                <div key={i} style={card({ padding:"14px 16px" })}>
                  <div style={{ fontSize:20, marginBottom:7 }}>{s.icon}</div>
                  <div style={{ fontSize:24, fontWeight:900, color:C.gold, lineHeight:1 }}>{s.val}</div>
                  <div style={{ fontSize:12, fontWeight:600, marginTop:4 }}>{s.en}</div>
                  <div style={{ fontSize:10, color:C.dim }}>{s.ar}</div>
                  <div style={{ fontSize:11, color:C.green, marginTop:5 }}>{s.change}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Revision Schedule (from Supabase) ── */}
          <div style={card()}>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:700 }}>📅 Revision Schedule · جدول المراجعة</div>
              <div style={{ fontSize:10, color:C.dim, marginTop:2 }}>Based on your last reviewed dates · بناءً على آخر مراجعة</div>
            </div>

            {revisionSchedule.length === 0 ? (
              <div style={{ fontSize:12, color:C.dim, textAlign:"center", padding:"16px 0" }}>
                No revision data yet. Start reciting to track your progress!<br/>
                <span style={{ fontSize:11 }}>ابدأ التلاوة لتتبع تقدمك</span>
              </div>
            ) : (
              revisionSchedule.map((r, i) => {
                const days = daysSince(r.last_reviewed);
                const col = urgencyColor(days);
                return (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 0", borderBottom: i < revisionSchedule.length-1 ? `1px solid rgba(255,255,255,.05)` : "none" }}>
                    <div style={{ width:10, height:10, borderRadius:"50%", background:col, boxShadow:`0 0 6px ${col}55`, flexShrink:0 }} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>Juz / {r.surah_name}</div>
                      <div style={{ fontSize:11, color:C.dim }}>
                        Last reviewed {days === 0 ? "today" : `${days} day${days>1?"s":""} ago`}
                        {" · "} Best: <span style={{ color:C.gold }}>{r.best_accuracy}%</span>
                      </div>
                    </div>
                    <div style={{ fontSize:10, padding:"3px 10px", borderRadius:10, fontWeight:700, background:`${col}22`, color:col, border:`1px solid ${col}44`, whiteSpace:"nowrap" as const }}>
                      {urgencyLabel(days)}
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
