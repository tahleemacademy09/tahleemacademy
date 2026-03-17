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

// ─── Arabic normalizer ───
const norm = (t: string) =>
  t.replace(/[\u064B-\u065F\u0670]/g,"")
   .replace(/[أإآا]/g,"ا").replace(/[ىي]/g,"ي")
   .replace(/ة/g,"ه").trim();

type WordState = "hidden" | "correct" | "wrong" | "mispronounced";

interface LiveWord {
  original: string;   // original Quran text with diacritics
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
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const [view, setView] = useState<View>("home");
  const [plan, setPlan] = useState<HifdhPlan|null>(null);
  const [todaySession, setTodaySession] = useState<HifdhSession|null>(null);
  const [sessions, setSessions] = useState<HifdhSession[]>([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showPlanSettings, setShowPlanSettings] = useState(false);

  // Session
  const [ayahs, setAyahs] = useState<Ayah[]>([]);
  const [liveAyahs, setLiveAyahs] = useState<LiveAyah[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState("");
  const [sessionScore, setSessionScore] = useState<number|null>(null);
  const [sessionFeedback, setSessionFeedback] = useState("");
  const [showReveal, setShowReveal] = useState(false); // "peek" button

  // Dictation
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
  const dictRecRef = useRef<MediaRecorder|null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const dictChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const dictTimerRef = useRef<any>(null);
  const liveRecRef = useRef<any>(null); // Web Speech for live preview

  useEffect(() => { if (user) loadData(); }, [user]);

  const loadData = async () => {
    setLoading(true);
    const { data: pd } = await supabase.from("hifdh_plans" as any).select("*").eq("student_id", user!.id).maybeSingle();
    if (pd) setPlan(pd as HifdhPlan);
    else {
      const { data: np } = await supabase.from("hifdh_plans" as any).insert({
        student_id: user!.id, current_juz: 30, daily_target_ayahs: 5,
        surah_rotation: [114,113,112,111,110], surah_number: 114, ayah_start: 1, ayah_end: 6,
        revision_mode: "memorize", difficulty: "beginner", teacher_locked: false, max_ayahs_override: 10,
      }).select().single();
      if (np) setPlan(np as HifdhPlan);
    }
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

  // ─── Build initial hidden live ayahs ───
  const buildLiveAyahs = (fetched: Ayah[]): LiveAyah[] =>
    fetched.map(a => ({
      number: a.number,
      words: a.text.split(/\s+/).filter(Boolean).map(w => ({ original: w, state: "hidden" as WordState, revealed: false }))
    }));

  // ─── Live Web Speech word matching ───
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

  // ─── Groq final correction ───
  const applyGroqCorrection = (transcript: string, current: LiveAyah[]): LiveAyah[] => {
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
        // Always reveal after Groq runs
        if (exact) return { ...word, state: "correct" as WordState, revealed: true };
        if (partial) return { ...word, state: "mispronounced" as WordState, revealed: true };
        return { ...word, state: "wrong" as WordState, revealed: true }; // unreached = wrong
      })
    }));
  };

  const transcribeWithGroq = async (blob: Blob): Promise<string> => {
    const formData = new FormData();
    formData.append("audio", blob, "recitation.webm");
    try {
      const { data, error } = await supabase.functions.invoke("transcribe-hifdh", { body: formData });
      if (error) throw error;
      return data?.transcript || "";
    } catch {
      toast({ title: "Transcription failed", variant: "destructive" });
      return "";
    }
  };

  const calcScore = (la: LiveAyah[]): number => {
    const all = la.flatMap(a => a.words);
    const correct = all.filter(w => w.state === "correct").length;
    return all.length ? Math.round((correct / all.length) * 100) : 0;
  };

  const startSession = async () => {
    if (!todaySession) return;
    const fetched = await fetchAyahs(todaySession.surah_number, todaySession.ayah_start, todaySession.ayah_end);
    setAyahs(fetched);
    setLiveAyahs(buildLiveAyahs(fetched));
    setFinalTranscript(""); setSessionScore(null); setSessionFeedback(""); setShowReveal(false);
    setView("session");
  };

  // ─── Recording: Web Speech live + MediaRecorder for Groq ───
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // MediaRecorder for Groq
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setTranscribing(true);
        // Save audio for teacher
        if (todaySession) {
          const path = `sessions/${todaySession.id}/${user!.id}-${Date.now()}.webm`;
          const { error: ue } = await supabase.storage.from("hifdh-audio").upload(path, blob, { upsert: true });
          if (!ue) await supabase.from("hifdh_sessions" as any).update({ audio_path: path }).eq("id", todaySession.id);
        }
          const transcribeWithDeepgram = async (audioBlob: Blob) => {
    try {
      setIsAnalysing(true);
      
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recitation.webm');

      // This calls your Supabase Edge Function we just updated
      const { data, error } = await supabase.functions.invoke('transcribe-hifdh', {
        body: formData,
      });

      if (error) throw error;

      if (data && data.transcript) {
        console.log("Deepgram Transcript:", data.transcript);
        // This function will now compare the Deepgram text to the Quran text
        performFinalGrading(data.transcript);
      } else {
        throw new Error("No transcript returned from Deepgram");
      }
    } catch (error) {
      console.error("Transcription error:", error);
      toast({
        title: "Transcription Error",
        description: "Could not analyze your recitation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAnalysing(false);
    }
  };
        setTranscribing(false);
      };
      recorder.start(100);
      mediaRecRef.current = recorder;

      // Web Speech for live preview
      const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      if (SR) {
        const r = new SR();
        r.lang = "ar-SA"; r.continuous = true; r.interimResults = true;
        r.onresult = (e: any) => {
          let t = "";
          for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript + " ";
          // Live preview update
          setLiveAyahs(prev => matchLiveWords(t, prev));
        };
        r.onerror = () => {}; // Silently ignore — Groq will correct
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

  // ─── Dictation ───
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

  const startDictRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      dictChunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) dictChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(dictChunksRef.current, { type: "audio/webm" });
        setDictationTranscribing(true);
        const t = await transcribeWithGroq(blob);
        setDictationTranscript(t);
        setDictationTranscribing(false);
      };
      recorder.start(100); dictRecRef.current = recorder;
      setDictationRecording(true);
      dictTimerRef.current = setInterval(() => setDictationTime(t => t+1), 1000);
    } catch { toast({ title: "Microphone denied", variant: "destructive" }); }
  };

  const stopDictRecording = () => {
    dictRecRef.current?.stop();
    clearInterval(dictTimerRef.current);
    setDictationRecording(false); setDictationTime(0);
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

  // ─── RESULT VIEW ───
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
        <div className="bg-amber-50 rounded-2xl p-3 w-full max-w-xs border border-amber-200 text-center">
          <p className="text-xs text-amber-700">👨‍🏫 Your teacher will review and may override this score</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Flame className="h-4 w-4 text-orange-500"/><span>{streak} day streak 🔥</span>
        </div>
        <button onClick={() => { setView("home"); loadData(); }} className="w-full max-w-xs py-3 rounded-2xl text-white font-semibold" style={{ backgroundColor:"#1a3a2a" }}>Done ✅</button>
      </div>
    );
  }

  // ─── DICTATION VIEW ───
  if (view === "dictation") {
    return (
      <div className="flex flex-col min-h-screen" style={{ backgroundColor:"#f5f0e8" }}>
        <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor:"#1a3a2a" }}>
          <button onClick={() => setView("session")} className="text-white/80 p-1"><ArrowLeft className="h-5 w-5"/></button>
          <div className="flex-1">
            <h2 className="text-white font-semibold text-sm">Dictation Evaluation</h2>
            <p className="text-white/60 text-[11px]">Listen then recite back</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-sm font-semibold mb-2" style={{ color:"#1a3a2a" }}>📢 Instructions:</p>
            <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
              <li>Listen to the AI recite the ayahs</li>
              <li>Tap mic and recite back what you heard</li>
              <li>Groq AI will evaluate your accuracy</li>
            </ol>
          </div>

          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor:"#1a3a2a" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <p className="text-white/70 text-xs">{dictationAyahs.length} Ayahs</p>
              <div className="flex items-center gap-3">
                {dictationPlaying && <div className="flex gap-0.5">{[1,2,3].map(i => <div key={i} className="w-1 h-3 bg-green-400 rounded-full animate-bounce" style={{ animationDelay:`${i*0.1}s` }}/>)}</div>}
                <button onClick={() => { window.speechSynthesis?.cancel(); setDictationTranscript(""); playDict(dictationAyahs,0); }} className="flex items-center gap-1 text-white/60 text-xs">
                  <RefreshCw className="h-3.5 w-3.5"/> Replay
                </button>
              </div>
            </div>
            <div className="px-4 py-4 space-y-3">
              {dictationAyahs.map((a, i) => (
                <div key={a.number} className={`border-b border-white/10 pb-3 last:border-0 transition-opacity ${i===currentDictIdx && dictationPlaying?"opacity-100":"opacity-50"}`}>
                  <span className="text-[11px] text-white/40 block mb-1">Ayah {a.number}</span>
                  {dictationScore !== null ? (
                    <div className="flex flex-wrap gap-1 justify-end" dir="rtl">
                      {a.text.split(/\s+/).filter(Boolean).map((w, wi) => {
                        const nw = norm(w);
                        const spoken = dictationTranscript.replace(/[^\u0600-\u06FF\s]/g,"").split(/\s+/).filter(Boolean);
                        const isCorrect = spoken.some(sw => norm(sw) === nw);
                        const isPartial = !isCorrect && spoken.some(sw => { const ns=norm(sw); return ns.length>=3&&(ns.includes(nw.slice(0,3))||nw.includes(ns.slice(0,3))); });
                        const bg = isCorrect?"#dcfce7":isPartial?"#ffedd5":"#fee2e2";
                        const color = isCorrect?"#16a34a":isPartial?"#ea580c":"#dc2626";
                        return <span key={wi} className="px-1.5 py-0.5 rounded-lg text-lg" style={{ backgroundColor:bg, color, fontFamily:"'Amiri',serif" }}>{w}</span>;
                      })}
                    </div>
                  ) : (
                    <p className="text-white text-xl text-right" dir="rtl" style={{ fontFamily:"'Amiri',serif", lineHeight:"2.2" }}>
                      {dictationPlaying && i===currentDictIdx ? a.text : "━━━━━━━━━━━━"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {!dictationScore && (
            <div className="bg-white rounded-2xl p-5 shadow-sm text-center space-y-4">
              <p className="text-sm text-gray-500">{dictationPlaying?"Listen carefully...":dictationTranscribing?"Processing...":"Recite what you heard"}</p>
              <div className="flex flex-col items-center gap-3">
                <button onClick={dictationRecording?stopDictRecording:startDictRecording}
                  disabled={dictationPlaying||dictationTranscribing}
                  className={`h-20 w-20 rounded-full flex items-center justify-center text-white shadow-lg ${dictationRecording?"animate-pulse":""} ${(dictationPlaying||dictationTranscribing)?"opacity-40":""}`}
                  style={{ backgroundColor:dictationRecording?"#EF4444":"#1a3a2a" }}>
                  {dictationTranscribing?<Loader2 className="h-8 w-8 animate-spin"/>:dictationRecording?<MicOff className="h-8 w-8"/>:<Mic className="h-8 w-8"/>}
                </button>
                {dictationRecording && <p className="text-red-500 text-sm font-medium">🔴 {fr(dictationTime)}</p>}
                {dictationTranscribing && <p className="text-primary text-xs animate-pulse">Groq AI processing...</p>}
              </div>
              {dictationTranscript && !dictationTranscribing && (
                <>
                  <div className="p-3 rounded-xl text-right border" style={{ backgroundColor:"#f5f0e8" }}>
                    <p className="text-[10px] text-gray-500 mb-1 text-left">Your recitation:</p>
                    <p className="text-base leading-loose" dir="rtl" style={{ fontFamily:"'Amiri',serif", color:"#1a3a2a" }}>{dictationTranscript}</p>
                  </div>
                  <button onClick={submitDictation} className="w-full py-3 rounded-2xl text-white font-medium flex items-center justify-center gap-2" style={{ backgroundColor:"#1a3a2a" }}>
                    <Send className="h-4 w-4"/> Submit Dictation
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── SESSION VIEW ───
  if (view === "session" && todaySession) {
    const name = sn(todaySession.surah_number);
    const allWords = liveAyahs.flatMap(a => a.words);
    const correct = allWords.filter(w => w.state === "correct").length;
    const wrong = allWords.filter(w => w.state === "wrong").length;
    const mispron = allWords.filter(w => w.state === "mispronounced").length;
    const revealed = allWords.filter(w => w.revealed).length;
    const total = allWords.length;

    return (
      <div className="flex flex-col min-h-screen" style={{ backgroundColor:"#f5f0e8" }}>
        {/* Header */}
        <div className="px-4 py-3 flex items-center gap-3 shadow-sm" style={{ backgroundColor:"#1a3a2a" }}>
          <button onClick={() => { stopRecording(); setView("home"); }} className="text-white/80 p-1"><ArrowLeft className="h-5 w-5"/></button>
          <div className="flex-1">
            <h2 className="text-white font-semibold text-sm">Hifdh Session</h2>
            <p className="text-white/60 text-[11px]">{name.en} — {todaySession.ayah_start}–{todaySession.ayah_end}</p>
          </div>
          {/* Progress */}
          {isRecording && (
            <div className="text-right">
              <p className="text-white text-xs font-medium">{revealed}/{total}</p>
              <p className="text-white/50 text-[10px]">words</p>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

          {/* Legend when recording or done */}
          {(isRecording || finalTranscript) && (
            <div className="flex items-center justify-center gap-4 bg-white rounded-2xl px-4 py-2.5 shadow-sm">
              {[
                { color:"#16a34a", label:"Correct" },
                { color:"#ea580c", label:"Mispronounced" },
                { color:"#dc2626", label:"Wrong/Skipped" },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor:l.color }}/>
                  <span className="text-[10px] text-gray-500">{l.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Tarteel-style Ayah display */}
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor:"#1a3a2a" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <p className="text-white/70 text-xs">
                  {!isRecording && !finalTranscript ? "Words hidden — recite from memory" :
                   isRecording ? "🔴 Reciting live..." :
                   transcribing ? "🤖 Groq analysing..." : "Review complete"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Peek button */}
                {!finalTranscript && (
                  <button
                    onMouseDown={() => setShowReveal(true)}
                    onMouseUp={() => setShowReveal(false)}
                    onTouchStart={() => setShowReveal(true)}
                    onTouchEnd={() => setShowReveal(false)}
                    className="flex items-center gap-1 text-white/50 text-[10px] border border-white/20 rounded-full px-2 py-0.5"
                  >
                    <Eye className="h-3 w-3"/> Hold to peek
                  </button>
                )}
              </div>
            </div>

            {/* Words */}
            <div className="px-4 py-5 space-y-6">
              {liveAyahs.map(ayah => (
                <div key={ayah.number}>
                  <span className="text-[10px] text-white/30 block mb-2">Ayah {ayah.number}</span>
                  <div className="flex flex-wrap gap-2 justify-end" dir="rtl">
                    {ayah.words.map((word, wi) => {
                      const showWord = word.revealed || showReveal;
                      const style = stateStyle(word.state, word.revealed);
                      return (
                        <span
                          key={wi}
                          className="rounded-xl px-2 py-1 transition-all duration-500"
                          style={{
                            fontFamily: "'Amiri', serif",
                            fontSize: "1.25rem",
                            lineHeight: "2.2",
                            backgroundColor: showReveal && !word.revealed ? "rgba(255,255,255,0.05)" : style.bg,
                            color: showWord ? style.color : "transparent",
                            border: style.border,
                            minWidth: "2.5rem",
                            textAlign: "center",
                            userSelect: "none",
                          }}
                        >
                          {showWord ? word.original : word.original}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Progress bar at bottom of ayah box */}
            {(isRecording || finalTranscript) && total > 0 && (
              <div className="px-4 pb-4">
                <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor:"rgba(255,255,255,0.1)" }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width:`${Math.round((revealed/total)*100)}%`, backgroundColor:"#16a34a" }}/>
                </div>
                <p className="text-[10px] text-white/40 mt-1 text-right">{Math.round((revealed/total)*100)}% revealed</p>
              </div>
            )}
          </div>

          {/* Score after Groq */}
          {finalTranscript && sessionScore !== null && !transcribing && (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="text-center"><p className="text-xl font-bold text-green-600">{correct}</p><p className="text-[10px] text-gray-400">Correct</p></div>
                <div className="text-center"><p className="text-xl font-bold text-orange-500">{mispron}</p><p className="text-[10px] text-gray-400">Mispron.</p></div>
                <div className="text-center"><p className="text-xl font-bold text-red-500">{wrong}</p><p className="text-[10px] text-gray-400">Skipped</p></div>
              </div>
              <div className="h-3 rounded-full overflow-hidden bg-gray-100">
                <div className="h-full rounded-full transition-all duration-1000" style={{ width:`${sessionScore}%`, backgroundColor:sessionScore>=80?"#16a34a":sessionScore>=50?"#b8962e":"#ef4444" }}/>
              </div>
              <p className="text-center text-base font-bold mt-2" style={{ color:"#1a3a2a" }}>{sessionScore}%</p>
              <p className="text-center text-xs text-gray-500 mt-1">{sessionFeedback}</p>
            </div>
          )}

          {/* Controls */}
          <div className="bg-white rounded-2xl p-5 shadow-sm text-center space-y-4">
            {transcribing ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <Loader2 className="h-10 w-10 animate-spin" style={{ color:"#1a3a2a" }}/>
                <p className="text-sm font-medium" style={{ color:"#1a3a2a" }}>Groq AI is analysing your recitation...</p>
                <p className="text-xs text-gray-400">Correcting highlights now</p>
              </div>
            ) : !finalTranscript ? (
              <>
                <p className="text-sm text-gray-500">
                  {isRecording ? "Words reveal as you recite — tap stop when done" : "Tap mic to start reciting from memory"}
                </p>
                <div className="flex flex-col items-center gap-3">
                  <button
                    onClick={isRecording?stopRecording:startRecording}
                    className={`h-20 w-20 rounded-full flex items-center justify-center text-white shadow-lg transition-transform active:scale-95 ${isRecording?"animate-pulse":""}`}
                    style={{ backgroundColor:isRecording?"#EF4444":"#1a3a2a" }}
                  >
                    {isRecording?<MicOff className="h-8 w-8"/>:<Mic className="h-8 w-8"/>}
                  </button>
                  {isRecording && <p className="text-red-500 text-sm font-medium">🔴 {fr(recordingTime)}</p>}
                  {!isRecording && <p className="text-gray-400 text-xs">Words will reveal live as you speak</p>}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => { setFinalTranscript(""); setSessionScore(null); setLiveAyahs(buildLiveAyahs(ayahs)); }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm text-gray-500"
                  >
                    <RotateCcw className="h-4 w-4"/> Re-record
                  </button>
                  <button
                    onClick={startDictation}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-sm font-medium"
                    style={{ backgroundColor:"#1a3a2a" }}
                  >
                    <Volume2 className="h-4 w-4"/> Dictation Test
                  </button>
                </div>
                <button
                  onClick={async () => {
                    if (!todaySession) return;
                    await supabase.from("hifdh_sessions" as any).update({ status:"completed", recitation_transcript:finalTranscript, accuracy_score:sessionScore, submitted_at:new Date().toISOString() }).eq("id", todaySession.id);
                    setTodaySession(prev => prev?{...prev, status:"completed"}:prev);
                    setView("home"); loadData();
                  }}
                  className="w-full py-2 text-xs text-gray-400 underline"
                >
                  Skip dictation & finish
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── HOME VIEW ───
  return (
    <div className="container mx-auto px-4 py-6 space-y-5 max-w-xl">
      <div className="text-center py-4 px-4 rounded-2xl relative" style={{ backgroundColor:"#1a3a2a" }}>
        <button onClick={() => setShowPlanSettings(true)} className="absolute top-3 right-3 p-2 rounded-full" style={{ backgroundColor:"rgba(255,255,255,0.1)" }}>
          <Settings className="h-4 w-4 text-white/70"/>
        </button>
        <p className="text-white/60 text-xs mb-1" style={{ fontFamily:"'Amiri',serif" }}>وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا</p>
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily:"'Playfair Display',serif" }}>Al-Hifdh</h1>
        <p className="text-white/60 text-xs mt-0.5">Daily Quran Revision • Powered by Groq AI</p>
        {plan && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full text-white/80" style={{ backgroundColor:"rgba(255,255,255,0.1)" }}>{plan.revision_mode==="memorize"?"📖 Memorize":"🔄 Review"}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full text-white/80" style={{ backgroundColor:"rgba(255,255,255,0.1)" }}>{plan.difficulty||"beginner"}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { icon:<Flame className="h-5 w-5 text-orange-500"/>, label:"Streak", value:`${streak} days` },
          { icon:<CheckCircle className="h-5 w-5 text-green-500"/>, label:"Completed", value:`${sessions.filter(s=>s.status==="completed").length}` },
          { icon:<Star className="h-5 w-5 text-amber-500"/>, label:"This Week", value:`${sessions.filter(s=>s.status==="completed"&&new Date(s.session_date)>=new Date(Date.now()-7*86400000)).length}/7` },
        ].map((s,i) => (
          <div key={i} className="bg-white rounded-2xl p-3 text-center shadow-sm">
            <div className="flex justify-center mb-1">{s.icon}</div>
            <p className="text-base font-bold" style={{ color:"#1a3a2a" }}>{s.value}</p>
            <p className="text-[10px] text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {todaySession ? (
        <div className="rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3" style={{ backgroundColor:"#1a3a2a" }}>
            <p className="text-white/60 text-xs">Today's Revision</p>
            <h2 className="text-white font-semibold text-lg" style={{ fontFamily:"'Playfair Display',serif" }}>{sn(todaySession.surah_number).en}</h2>
            <p className="text-white/60 text-sm" dir="rtl" style={{ fontFamily:"'Amiri',serif" }}>{sn(todaySession.surah_number).ar}</p>
          </div>
          <div className="bg-white px-4 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Ayahs {todaySession.ayah_start} – {todaySession.ayah_end}</span>
              <Badge variant={todaySession.status==="completed"?"default":"secondary"} className="text-xs">
                {todaySession.status==="completed"?"✅ Done":"⏳ Pending"}
              </Badge>
            </div>
            {/* Show teacher score if available */}
            {todaySession.status === "completed" && (
              <div className="space-y-1">
                {todaySession.teacher_score != null ? (
                  <div className="flex items-center justify-between p-2 rounded-xl" style={{ backgroundColor:"#e8f5e9" }}>
                    <p className="text-xs font-semibold text-green-700">👨‍🏫 Teacher Score (Official)</p>
                    <p className="text-lg font-bold text-green-700">{todaySession.teacher_score}%</p>
                  </div>
                ) : todaySession.accuracy_score != null ? (
                  <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50">
                    <p className="text-xs text-gray-500">🤖 AI Score (awaiting teacher review)</p>
                    <p className="text-base font-bold" style={{ color:"#1a3a2a" }}>{todaySession.accuracy_score}%</p>
                  </div>
                ) : null}
                {todaySession.teacher_feedback && (
                  <div className="p-2 rounded-xl" style={{ backgroundColor:"#f5f0e8" }}>
                    <p className="text-[10px] font-semibold text-gray-500 mb-0.5">Teacher Feedback:</p>
                    <p className="text-xs text-gray-700">{todaySession.teacher_feedback}</p>
                  </div>
                )}
              </div>
            )}
            {todaySession.status !== "completed" ? (
              <Button onClick={startSession} className="w-full rounded-xl" style={{ backgroundColor:"#1a3a2a" }}>
                <Mic className="h-4 w-4 mr-2"/> Start Session
              </Button>
            ) : (
              <div className="text-center py-1">
                <p className="text-green-600 font-medium text-sm">✅ Today's revision complete!</p>
                <p className="text-xs text-gray-500">بارك الله فيك</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <BookOpen className="h-10 w-10 mx-auto mb-2" style={{ color:"#1a3a2a" }}/>
          <p className="font-medium">No plan assigned yet</p>
          <button onClick={() => setShowPlanSettings(true)} className="mt-3 text-xs underline" style={{ color:"#b8962e" }}>Set my plan →</button>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b"><h3 className="font-semibold text-sm" style={{ color:"#1a3a2a" }}>Recent Sessions</h3></div>
        {sessions.slice(0,5).length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-gray-400">No sessions yet 🌙</div>
        ) : (
          <div className="divide-y">
            {sessions.slice(0,5).map(s => (
              <div key={s.id} className="flex items-center px-4 py-3 gap-3">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${s.status==="completed"?"bg-green-100":"bg-gray-100"}`}>
                  {s.status==="completed"?<CheckCircle className="h-4 w-4 text-green-500"/>:<Clock className="h-4 w-4 text-gray-400"/>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{sn(s.surah_number).en} — {s.ayah_start}:{s.ayah_end}</p>
                  <p className="text-xs text-gray-400">{new Date(s.session_date).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</p>
                </div>
                <div className="text-right shrink-0">
                  {s.teacher_score != null ? (
                    <p className="text-sm font-bold text-green-600">{s.teacher_score}%</p>
                  ) : s.accuracy_score != null ? (
                    <p className={`text-sm font-bold ${s.accuracy_score>=80?"text-green-500":s.accuracy_score>=50?"text-amber-500":"text-red-400"}`}>{s.accuracy_score}%</p>
                  ) : null}
                  {s.teacher_score != null && <p className="text-[9px] text-green-600">Teacher</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <HifdhPlanSettings open={showPlanSettings} onClose={() => setShowPlanSettings(false)} plan={plan} onSaved={(updated) => { setPlan(updated as HifdhPlan); loadData(); }}/>
    </div>
  );
};

export default HifdhRevision;
