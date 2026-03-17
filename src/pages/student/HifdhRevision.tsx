import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mic, MicOff, CheckCircle, Clock, Flame,
  BookOpen, ArrowLeft, RotateCcw, Send, Star,
  Settings, Volume2, RefreshCw, Loader2, Eye
} from "lucide-react";
import HifdhPlanSettings from "@/components/hifdh/HifdhPlanSettings";

const SURAH_NAMES: Record<number, { ar: string; en: string }> = {
  1:{ar:"الفاتحة",en:"Al-Fatiha"},2:{ar:"البقرة",en:"Al-Baqarah"},
  36:{ar:"يس",en:"Ya-Sin"},55:{ar:"الرحمن",en:"Ar-Rahman"},
  67:{ar:"الملك",en:"Al-Mulk"},78:{ar:"النبأ",en:"An-Naba"},
  87:{ar:"الأعلى",en:"Al-Ala"},88:{ar:"الغاشية",en:"Al-Ghashiya"},
  89:{ar:"الفجر",en:"Al-Fajr"},93:{ar:"الضحى",en:"Ad-Duha"},
  94:{ar:"الشرح",en:"Ash-Sharh"},95:{ar:"التين",en:"At-Tin"},
  96:{ar:"العلق",en:"Al-Alaq"},97:{ar:"القدر",en:"Al-Qadr"},
  98:{ar:"البينة",en:"Al-Bayyina"},99:{ar:"الزلزلة",en:"Az-Zalzala"},
  100:{ar:"العاديات",en:"Al-Adiyat"},101:{ar:"القارعة",en:"Al-Qaria"},
  102:{ar:"التكاثر",en:"At-Takathur"},103:{ar:"العصر",en:"Al-Asr"},
  104:{ar:"الهمزة",en:"Al-Humaza"},105:{ar:"الفيل",en:"Al-Fil"},
  106:{ar:"قريش",en:"Quraysh"},107:{ar:"الماعون",en:"Al-Maun"},
  108:{ar:"الكوثر",en:"Al-Kawthar"},109:{ar:"الكافرون",en:"Al-Kafirun"},
  110:{ar:"النصر",en:"An-Nasr"},111:{ar:"المسد",en:"Al-Masad"},
  112:{ar:"الإخلاص",en:"Al-Ikhlas"},113:{ar:"الفلق",en:"Al-Falaq"},
  114:{ar:"الناس",en:"An-Nas"},
};

const norm = (t: string) =>
  t.replace(/[\u064B-\u065F\u0670]/g,"")
   .replace(/[أإآا]/g,"ا").replace(/[ىي]/g,"ي")
   .replace(/ة/g,"ه").trim();

type WordState = "hidden" | "correct" | "wrong" | "mispronounced";

interface LiveWord {
  original: string;
  state: WordState;
  revealed: boolean;
}

interface LiveAyah {
  number: number;
  words: LiveWord[];
}

const stateStyle = (s: WordState, revealed: boolean) => {
  if (!revealed) return { bg: "#1a3a2a", color: "#1a3a2a", border: "2px solid rgba(255,255,255,0.1)" };
  if (s === "correct")      return { bg: "#dcfce7", color: "#16a34a", border: "none" };
  if (s === "wrong")        return { bg: "#fee2e2", color: "#dc2626", border: "none" };
  if (s === "mispronounced") return { bg: "#ffedd5", color: "#ea580c", border: "none" };
  return { bg: "transparent", color: "white", border: "none" };
};

interface HifdhPlan {
  id:string; current_juz:number; daily_target_ayahs:number; surah_rotation:number[];
  surah_number:number; ayah_start:number; ayah_end:number; revision_mode:string;
  difficulty:string; teacher_locked:boolean; max_ayahs_override:number; notes:string|null;
}
interface HifdhSession {
  id:string; session_date:string; surah_number:number; ayah_start:number; ayah_end:number;
  status:string; fluency_score:number|null; accuracy_score:number|null;
  feedback:string|null; streak_count:number; recitation_transcript:string|null;
  teacher_score:number|null; teacher_feedback:string|null;
}
interface Ayah { number:number; text:string; }
type View = "home"|"session"|"dictation"|"result";

const HifdhRevision = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [view, setView] = useState<View>("home");
  const [plan, setPlan] = useState<HifdhPlan|null>(null);
  const [todaySession, setTodaySession] = useState<HifdhSession|null>(null);
  const [sessions, setSessions] = useState<HifdhSession[]>([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showPlanSettings, setShowPlanSettings] = useState(false);

  const [ayahs, setAyahs] = useState<Ayah[]>([]);
  const [liveAyahs, setLiveAyahs] = useState<LiveAyah[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState("");
  const [sessionScore, setSessionScore] = useState<number|null>(null);
  const [sessionFeedback, setSessionFeedback] = useState("");
  const [showReveal, setShowReveal] = useState(false);

  const [dictationAyahs, setDictationAyahs] = useState<Ayah[]>([]);
  const [dictationPlaying, setDictationPlaying] = useState(false);
  const [dictationRecording, setDictationRecording] = useState(false);
  const [dictationTranscribing, setDictationTranscribing] = useState(false);
  const [dictationTranscript, setDictationTranscript] = useState("");
  const [dictationScore, setDictationScore] = useState<number|null>(null);
  const [dictationTime, setDictationTime] = useState(0);
  const [currentDictIdx, setCurrentDictIdx] = useState(0);
  const [finalScore, setFinalScore] = useState<number|null>(null);

  const mediaRecRef = useRef<MediaRecorder|null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const liveRecRef = useRef<any>(null);

  useEffect(() => { if (user) loadData(); }, [user]);

  const loadData = async () => {
    setLoading(true);
    const { data: pd } = await supabase.from("hifdh_plans" as any).select("*").eq("student_id", user!.id).maybeSingle();
    if (pd) setPlan(pd as HifdhPlan);
    
    const { data: sd } = await supabase.from("hifdh_sessions" as any).select("*").eq("student_id", user!.id).order("session_date", { ascending: false }).limit(30);
    const sess = (sd||[]) as HifdhSession[];
    setSessions(sess);
    const today = new Date().toISOString().split("T")[0];
    const ts = sess.find(s => s.session_date === today);
    if (!ts && pd) {
      const p = pd as HifdhPlan;
      const { data: ns } = await supabase.from("hifdh_sessions" as any).insert({
        student_id: user!.id, plan_id: p.id, session_date: today,
        surah_number: p.surah_number||114, ayah_start: p.ayah_start||1, ayah_end: p.ayah_end||6,
        status: "pending", streak_count: calcStreak(sess),
      }).select().single();
      if (ns) setTodaySession(ns as HifdhSession);
    } else setTodaySession(ts||null);
    setStreak(calcStreak(sess));
    setLoading(false);
  };

  const calcStreak = (sess: HifdhSession[]) => {
    let s = 0; const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today); d.setDate(d.getDate()-i);
      const ds = d.toISOString().split("T")[0];
      if (i === 0) { s++; continue; }
      if (sess.find(x => x.session_date === ds && x.status === "completed")) s++; else break;
    }
    return s;
  };

  const fetchAyahs = async (surahNum:number, start:number, end:number): Promise<Ayah[]> => {
    try {
      const res = await fetch(`https://api.quran.com/api/v4/verses/by_chapter/${surahNum}?fields=text_uthmani&per_page=50`);
      const json = await res.json();
      return (json.verses||[]).slice(start-1, end).map((v:any, i:number) => ({ number: start+i, text: v.text_uthmani }));
    } catch { return [{ number: start, text: "Failed to load." }]; }
  };

  const buildLiveAyahs = (fetched: Ayah[]): LiveAyah[] =>
    fetched.map(a => ({
      number: a.number,
      words: a.text.split(/\s+/).filter(Boolean).map(w => ({ original: w, state: "hidden" as WordState, revealed: false }))
    }));

  const matchLiveWords = (transcript: string, current: LiveAyah[]): LiveAyah[] => {
    const spoken = transcript.replace(/[^\u0600-\u06FF\s]/g,"").split(/\s+/).filter(Boolean);
    return current.map(ayah => ({
      ...ayah,
      words: ayah.words.map(word => {
        const nw = norm(word.original);
        const matched = spoken.some(sw => norm(sw) === nw);
        const partial = !matched && spoken.some(sw => {
          const ns = norm(sw);
          return ns.length >= 3 && (ns.includes(nw.slice(0,3)) || nw.includes(ns.slice(0,3)));
        });
        if (matched) return { ...word, state: "correct" as WordState, revealed: true };
        if (partial) return { ...word, state: "mispronounced" as WordState, revealed: true };
        return word;
      })
    }));
  };

  const applyDeepgramCorrection = (transcript: string, current: LiveAyah[]): LiveAyah[] => {
    const spoken = transcript.replace(/[^\u0600-\u06FF\s]/g,"").split(/\s+/).filter(Boolean);
    return current.map(ayah => ({
      ...ayah,
      words: ayah.words.map(word => {
        const nw = norm(word.original);
        const exact = spoken.some(sw => norm(sw) === nw);
        const partial = !exact && spoken.some(sw => {
          const ns = norm(sw);
          return ns.length >= 3 && (ns.includes(nw.slice(0,3)) || nw.includes(ns.slice(0,3)));
        });
        if (exact) return { ...word, state: "correct" as WordState, revealed: true };
        if (partial) return { ...word, state: "mispronounced" as WordState, revealed: true };
        return { ...word, state: "wrong" as WordState, revealed: true };
      })
    }));
  };

  const calcScore = (la: LiveAyah[]): number => {
    const all = la.flatMap(a => a.words);
    const correct = all.filter(w => w.state === "correct").length;
    return all.length ? Math.round((correct / all.length) * 100) : 0;
  };

  // Logic previously at line 265
  const performFinalGrading = (transcript: string) => {
    setFinalTranscript(transcript);
    setLiveAyahs(prev => {
      const corrected = applyDeepgramCorrection(transcript, prev);
      const pct = calcScore(corrected);
      setSessionScore(pct);
      if (pct >= 80) setSessionFeedback("ما شاء الله! Excellent recitation! 🌟");
      else if (pct >= 50) setSessionFeedback("جيد! Good effort! Review the red words. 📖");
      else setSessionFeedback("استمر! Keep practicing daily. 🤲");
      return corrected;
    });
  };

  const transcribeWithDeepgram = async (audioBlob: Blob) => {
    try {
      setTranscribing(true);
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recitation.webm');

      const { data, error } = await supabase.functions.invoke('transcribe-hifdh', {
        body: formData,
      });

      if (error) throw error;
      if (data && data.transcript) {
        performFinalGrading(data.transcript);
      } else {
        throw new Error("No transcript returned");
      }
    } catch (error) {
      console.error("Deepgram Error:", error);
      toast({ title: "Transcription failed", variant: "destructive" });
    } finally {
      setTranscribing(false);
    }
  };

  const startSession = async () => {
    if (!todaySession) return;
    const fetched = await fetchAyahs(todaySession.surah_number, todaySession.ayah_start, todaySession.ayah_end);
    setAyahs(fetched);
    setLiveAyahs(buildLiveAyahs(fetched));
    setFinalTranscript(""); setSessionScore(null); setSessionFeedback(""); setShowReveal(false);
    setView("session");
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        
        if (todaySession) {
          const path = `sessions/${todaySession.id}/${user!.id}-${Date.now()}.webm`;
          const { error: ue } = await supabase.storage.from("hifdh-audio").upload(path, blob, { upsert: true });
          if (!ue) await supabase.from("hifdh_sessions" as any).update({ audio_path: path }).eq("id", todaySession.id);
        }
        
        await transcribeWithDeepgram(blob);
      };

      recorder.start(100);
      mediaRecRef.current = recorder;

      const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      if (SR) {
        const r = new SR();
        r.lang = "ar-SA"; r.continuous = true; r.interimResults = true;
        r.onresult = (e: any) => {
          let t = "";
          for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript + " ";
          setLiveAyahs(prev => matchLiveWords(t, prev));
        };
        r.start();
        liveRecRef.current = r;
      }

      setIsRecording(true);
      timerRef.current = setInterval(() => setRecordingTime(t => t+1), 1000);
    } catch { toast({ title: "Microphone access denied", variant: "destructive" }); }
  };

  const stopRecording = () => {
    liveRecRef.current?.stop(); liveRecRef.current = null;
    mediaRecRef.current?.stop();
    clearInterval(timerRef.current);
    setIsRecording(false); setRecordingTime(0);
  };

  const startDictation = async () => {
    if (!todaySession) return;
    const all = await fetchAyahs(todaySession.surah_number, todaySession.ayah_start, todaySession.ayah_end);
    const picked = [...all].sort(() => Math.random()-0.5).slice(0, Math.min(3, all.length));
    setDictationAyahs(picked);
    setDictationTranscript(""); setDictationScore(null); setCurrentDictIdx(0);
    setView("dictation");
    setTimeout(() => playDict(picked, 0), 600);
  };

  const playDict = (list: Ayah[], idx: number) => {
    if (idx >= list.length) { setDictationPlaying(false); return; }
    setCurrentDictIdx(idx); setDictationPlaying(true);
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(list[idx].text);
      u.lang = "ar-SA"; u.rate = 0.65; u.pitch = 1;
      u.onend = () => { setDictationPlaying(false); if (idx < list.length-1) setTimeout(() => playDict(list, idx+1), 1200); };
      window.speechSynthesis.speak(u);
    } else { setDictationPlaying(false); }
  };

  const submitDictation = async () => {
    const allWords = dictationAyahs.flatMap(a =>
      a.text.split(/\s+/).filter(Boolean).map(w => ({ w, matched: false }))
    );
    const spoken = dictationTranscript.replace(/[^\u0600-\u06FF\s]/g,"").split(/\s+/).filter(Boolean);
    let correct = 0;
    allWords.forEach(({ w }) => { const nw = norm(w); if (spoken.some(sw => norm(sw) === nw)) correct++; });
    const pct = allWords.length ? Math.round((correct/allWords.length)*100) : 0;
    setDictationScore(pct);
    const combined = Math.round(((sessionScore||50)+pct)/2);
    setFinalScore(combined);
    if (todaySession) {
      await supabase.from("hifdh_sessions" as any).update({
        status: "completed", recitation_transcript: finalTranscript,
        accuracy_score: combined, fluency_score: sessionScore||50,
        feedback: sessionFeedback, submitted_at: new Date().toISOString(), streak_count: streak,
      }).eq("id", todaySession.id);
      setTodaySession(prev => prev ? { ...prev, status: "completed", accuracy_score: combined } : prev);
    }
    setView("result");
    toast({ title: "بارك الله فيك! Session complete ✅" });
  };

  const fr = (s:number) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  const sn = (n:number) => SURAH_NAMES[n]||{ ar:`سورة ${n}`, en:`Surah ${n}` };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center space-y-3">
        <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto"/>
        <p className="text-sm text-muted-foreground">Loading your Hifdh plan...</p>
      </div>
    </div>
  );

  if (view === "result") {
    const score = finalScore||0;
    return (
      <div className="flex flex-col min-h-screen items-center justify-center px-6 py-10 space-y-6" style={{ backgroundColor:"#f5f0e8" }}>
        <div className="text-6xl">{score>=80?"🌟":score>=50?"📖":"🤲"}</div>
        <div className="text-center">
          <p className="text-4xl font-bold" style={{ color:score>=80?"#16a34a":score>=50?"#b8962e":"#ef4444" }}>{score}%</p>
          <p className="text-gray-500 text-sm mt-1">Final Score</p>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
            <p className="text-2xl font-bold" style={{ color:"#1a3a2a" }}>{sessionScore||0}%</p>
            <p className="text-xs text-gray-400">Recitation</p>
          </div>
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
            <p className="text-2xl font-bold" style={{ color:"#1a3a2a" }}>{dictationScore||0}%</p>
            <p className="text-xs text-gray-400">Dictation</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 w-full max-w-xs shadow-sm text-sm text-center text-gray-600">{sessionFeedback}</div>
        <button onClick={() => { setView("home"); loadData(); }} className="w-full max-w-xs py-3 rounded-2xl text-white font-semibold" style={{ backgroundColor:"#1a3a2a" }}>Done ✅</button>
      </div>
    );
  }

  if (view === "dictation") {
    return (
      <div className="flex flex-col min-h-screen" style={{ backgroundColor:"#f5f0e8" }}>
        <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor:"#1a3a2a" }}>
          <button onClick={() => setView("session")} className="text-white/80 p-1"><ArrowLeft className="h-5 w-5"/></button>
          <div className="flex-1">
            <h2 className="text-white font-semibold text-sm">Dictation Evaluation</h2>
          </div>
        </div>
        <div className="flex-1 px-4 py-5 space-y-4">
           <div className="bg-white rounded-2xl p-5 shadow-sm text-center space-y-4">
              <p className="text-sm text-gray-500">{dictationPlaying?"Listen carefully...":dictationTranscribing?"Processing...":"Recite what you heard"}</p>
              <div className="flex flex-col items-center gap-3">
                <button onClick={dictationRecording?() => setDictationRecording(false):() => setDictationRecording(true)}
                  className="h-20 w-20 rounded-full flex items-center justify-center text-white"
                  style={{ backgroundColor:"#1a3a2a" }}>
                  <Mic className="h-8 w-8"/>
                </button>
              </div>
           </div>
           <Button onClick={submitDictation} className="w-full">Submit</Button>
        </div>
      </div>
    );
  }

  if (view === "session" && todaySession) {
    const name = sn(todaySession.surah_number);
    const allWords = liveAyahs.flatMap(a => a.words);
    const revealedCount = allWords.filter(w => w.revealed).length;
    const totalCount = allWords.length;

    return (
      <div className="flex flex-col min-h-screen" style={{ backgroundColor:"#f5f0e8" }}>
        <div className="px-4 py-3 flex items-center gap-3 shadow-sm" style={{ backgroundColor:"#1a3a2a" }}>
          <button onClick={() => { stopRecording(); setView("home"); }} className="text-white/80 p-1"><ArrowLeft className="h-5 w-5"/></button>
          <div className="flex-1">
            <h2 className="text-white font-semibold text-sm">Hifdh Session</h2>
            <p className="text-white/60 text-[11px]">{name.en} — {todaySession.ayah_start}–{todaySession.ayah_end}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor:"#1a3a2a" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <p className="text-white/70 text-xs">
                {isRecording ? "🔴 Reciting live..." : transcribing ? "🤖 AI analysing..." : "Review complete"}
              </p>
              {!finalTranscript && (
                  <button onMouseDown={() => setShowReveal(true)} onMouseUp={() => setShowReveal(false)} className="text-white/50 text-[10px] border border-white/20 rounded-full px-2 py-0.5">
                    <Eye className="h-3 w-3 inline mr-1"/> Hold to peek
                  </button>
              )}
            </div>

            <div className="px-4 py-5 space-y-6">
              {liveAyahs.map(ayah => (
                <div key={ayah.number}>
                  <div className="flex flex-wrap gap-2 justify-end" dir="rtl">
                    {ayah.words.map((word, wi) => {
                      const showWord = word.revealed || showReveal;
                      const style = stateStyle(word.state, word.revealed);
                      return (
                        <span key={wi} className="rounded-xl px-2 py-1" style={{ fontFamily: "'Amiri', serif", fontSize: "1.25rem", backgroundColor: style.bg, color: showWord ? style.color : "transparent", border: style.border }}>
                          {word.original}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm text-center space-y-4">
            {transcribing ? (
              <div className="py-4">
                <Loader2 className="h-10 w-10 animate-spin mx-auto mb-2"/>
                <p className="text-sm font-medium">Deepgram AI is analysing...</p>
              </div>
            ) : !finalTranscript ? (
              <div className="flex flex-col items-center gap-3">
                <button onClick={isRecording?stopRecording:startRecording} className="h-20 w-20 rounded-full flex items-center justify-center text-white" style={{ backgroundColor:isRecording?"#EF4444":"#1a3a2a" }}>
                  {isRecording?<MicOff className="h-8 w-8"/>:<Mic className="h-8 w-8"/>}
                </button>
                {isRecording && <p className="text-red-500 text-sm font-medium">🔴 {fr(recordingTime)}</p>}
              </div>
            ) : (
              <div className="flex gap-2">
                <Button onClick={() => { setFinalTranscript(""); setSessionScore(null); setLiveAyahs(buildLiveAyahs(ayahs)); }} variant="outline" className="flex-1">Re-record</Button>
                <Button onClick={startDictation} className="flex-1" style={{ backgroundColor:"#1a3a2a" }}>Dictation</Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-5 max-w-xl">
      <div className="text-center py-6 px-4 rounded-2xl relative" style={{ backgroundColor:"#1a3a2a" }}>
        <h1 className="text-2xl font-bold text-white">Al-Hifdh</h1>
        <p className="text-white/60 text-xs mt-1">Powered by Deepgram AI</p>
      </div>

      {todaySession ? (
        <div className="bg-white rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold text-lg">{sn(todaySession.surah_number).en}</h2>
          <p className="text-sm text-gray-500 mb-4">Ayahs {todaySession.ayah_start} – {todaySession.ayah_end}</p>
          {todaySession.status !== "completed" ? (
            <Button onClick={startSession} className="w-full" style={{ backgroundColor:"#1a3a2a" }}>Start Revision</Button>
          ) : (
            <p className="text-green-600 text-center font-medium">✅ Completed for today</p>
          )}
        </div>
      ) : (
        <Button onClick={() => setShowPlanSettings(true)}>Setup Plan</Button>
      )}

      <HifdhPlanSettings open={showPlanSettings} onClose={() => setShowPlanSettings(false)} plan={plan} onSaved={() => loadData()}/>
    </div>
  );
};

export default HifdhRevision;
