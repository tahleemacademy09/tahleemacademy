import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mic, MicOff, CheckCircle, Clock, Flame,
  BookOpen, ArrowLeft, RotateCcw, Send, Star,
  Eye, EyeOff, Settings, Volume2, VolumeX, RefreshCw
} from "lucide-react";
import HifdhPlanSettings from "@/components/hifdh/HifdhPlanSettings";

const SURAH_NAMES: Record<number, { ar: string; en: string }> = {
  1: { ar: "الفاتحة", en: "Al-Fatiha" },
  2: { ar: "البقرة", en: "Al-Baqarah" },
  36: { ar: "يس", en: "Ya-Sin" },
  55: { ar: "الرحمن", en: "Ar-Rahman" },
  67: { ar: "الملك", en: "Al-Mulk" },
  78: { ar: "النبأ", en: "An-Naba" },
  87: { ar: "الأعلى", en: "Al-Ala" },
  88: { ar: "الغاشية", en: "Al-Ghashiya" },
  89: { ar: "الفجر", en: "Al-Fajr" },
  93: { ar: "الضحى", en: "Ad-Duha" },
  94: { ar: "الشرح", en: "Ash-Sharh" },
  95: { ar: "التين", en: "At-Tin" },
  96: { ar: "العلق", en: "Al-Alaq" },
  97: { ar: "القدر", en: "Al-Qadr" },
  98: { ar: "البينة", en: "Al-Bayyina" },
  99: { ar: "الزلزلة", en: "Az-Zalzala" },
  100: { ar: "العاديات", en: "Al-Adiyat" },
  101: { ar: "القارعة", en: "Al-Qaria" },
  102: { ar: "التكاثر", en: "At-Takathur" },
  103: { ar: "العصر", en: "Al-Asr" },
  104: { ar: "الهمزة", en: "Al-Humaza" },
  105: { ar: "الفيل", en: "Al-Fil" },
  106: { ar: "قريش", en: "Quraysh" },
  107: { ar: "الماعون", en: "Al-Maun" },
  108: { ar: "الكوثر", en: "Al-Kawthar" },
  109: { ar: "الكافرون", en: "Al-Kafirun" },
  110: { ar: "النصر", en: "An-Nasr" },
  111: { ar: "المسد", en: "Al-Masad" },
  112: { ar: "الإخلاص", en: "Al-Ikhlas" },
  113: { ar: "الفلق", en: "Al-Falaq" },
  114: { ar: "الناس", en: "An-Nas" },
};

// ─── Arabic word comparison ───
const normalizeArabic = (text: string) =>
  text.replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/[أإآا]/g, "ا")
      .replace(/[ىي]/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/\s+/g, " ").trim();

type WordStatus = "correct" | "mispronounced" | "skipped" | "pending";

interface WordResult {
  word: string;
  status: WordStatus;
}

interface AyahResult {
  number: number;
  text: string;
  words: WordResult[];
  fullyRecited: boolean;
}

const compareWords = (quranText: string, transcriptText: string): WordResult[] => {
  const qWords = quranText.replace(/[^\u0600-\u06FF\s]/g, "").split(/\s+/).filter(Boolean);
  const tWords = transcriptText.replace(/[^\u0600-\u06FF\s]/g, "").split(/\s+/).filter(Boolean);
  return qWords.map(qw => {
    const nqw = normalizeArabic(qw);
    const exactMatch = tWords.some(tw => normalizeArabic(tw) === nqw);
    if (exactMatch) return { word: qw, status: "correct" as WordStatus };
    const partialMatch = tWords.some(tw => {
      const ntw = normalizeArabic(tw);
      return ntw.length >= 3 && (ntw.includes(nqw.slice(0, 3)) || nqw.includes(ntw.slice(0, 3)));
    });
    if (partialMatch) return { word: qw, status: "mispronounced" as WordStatus };
    return { word: qw, status: "skipped" as WordStatus };
  });
};

const wordColor = (status: WordStatus) => {
  if (status === "correct") return { color: "#16a34a", bg: "#dcfce7" };
  if (status === "mispronounced") return { color: "#ea580c", bg: "#ffedd5" };
  if (status === "skipped") return { color: "#dc2626", bg: "#fee2e2" };
  return { color: "#9ca3af", bg: "#f3f4f6" };
};

interface HifdhPlan {
  id: string;
  current_juz: number;
  daily_target_ayahs: number;
  surah_rotation: number[];
  surah_number: number;
  ayah_start: number;
  ayah_end: number;
  revision_mode: string;
  difficulty: string;
  teacher_locked: boolean;
  max_ayahs_override: number;
  notes: string | null;
}

interface HifdhSession {
  id: string;
  session_date: string;
  surah_number: number;
  ayah_start: number;
  ayah_end: number;
  status: string;
  fluency_score: number | null;
  accuracy_score: number | null;
  feedback: string | null;
  streak_count: number;
  recitation_transcript: string | null;
}

interface Ayah {
  number: number;
  text: string;
}

type View = "home" | "session" | "dictation" | "result";

const HifdhRevision = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const [view, setView] = useState<View>("home");
  const [plan, setPlan] = useState<HifdhPlan | null>(null);
  const [todaySession, setTodaySession] = useState<HifdhSession | null>(null);
  const [sessions, setSessions] = useState<HifdhSession[]>([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showPlanSettings, setShowPlanSettings] = useState(false);

  // Session state
  const [ayahs, setAyahs] = useState<Ayah[]>([]);
  const [ayahResults, setAyahResults] = useState<AyahResult[]>([]);
  const [hideAyahs, setHideAyahs] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [sessionScore, setSessionScore] = useState<number | null>(null);
  const [sessionFeedback, setSessionFeedback] = useState("");

  // Dictation state
  const [dictationAyahs, setDictationAyahs] = useState<Ayah[]>([]);
  const [dictationPlaying, setDictationPlaying] = useState(false);
  const [dictationRecording, setDictationRecording] = useState(false);
  const [dictationTranscript, setDictationTranscript] = useState("");
  const [dictationScore, setDictationScore] = useState<number | null>(null);
  const [dictationTime, setDictationTime] = useState(0);
  const [currentDictationIdx, setCurrentDictationIdx] = useState(0);

  // Final result
  const [finalScore, setFinalScore] = useState<number | null>(null);

  const recognitionRef = useRef<any>(null);
  const dictRecognitionRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const dictTimerRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => { if (user) loadData(); }, [user]);

  // Update word highlights when transcript changes
  useEffect(() => {
    if (!liveTranscript || !ayahs.length) return;
    const results = ayahs.map(a => {
      const words = compareWords(a.text, liveTranscript);
      const correctCount = words.filter(w => w.status === "correct").length;
      return { number: a.number, text: a.text, words, fullyRecited: correctCount / words.length > 0.7 };
    });
    setAyahResults(results);
  }, [liveTranscript, ayahs]);

  const loadData = async () => {
    setLoading(true);
    const { data: planData } = await supabase.from("hifdh_plans" as any).select("*").eq("student_id", user!.id).maybeSingle();
    if (planData) {
      setPlan(planData as HifdhPlan);
    } else {
      const { data: np } = await supabase.from("hifdh_plans" as any).insert({
        student_id: user!.id, current_juz: 30, daily_target_ayahs: 5,
        surah_rotation: [114, 113, 112, 111, 110],
        surah_number: 114, ayah_start: 1, ayah_end: 6,
        revision_mode: "memorize", difficulty: "beginner",
        teacher_locked: false, max_ayahs_override: 10,
      }).select().single();
      if (np) setPlan(np as HifdhPlan);
    }
    const { data: sd } = await supabase.from("hifdh_sessions" as any).select("*").eq("student_id", user!.id).order("session_date", { ascending: false }).limit(30);
    const sess = (sd || []) as HifdhSession[];
    setSessions(sess);
    const today = new Date().toISOString().split("T")[0];
    const ts = sess.find(s => s.session_date === today);
    if (!ts && planData) {
      const p = planData as HifdhPlan;
      const { data: ns } = await supabase.from("hifdh_sessions" as any).insert({
        student_id: user!.id, plan_id: p.id, session_date: today,
        surah_number: p.surah_number || 114, ayah_start: p.ayah_start || 1, ayah_end: p.ayah_end || 6,
        status: "pending", streak_count: calcStreak(sess),
      }).select().single();
      if (ns) setTodaySession(ns as HifdhSession);
    } else setTodaySession(ts || null);
    setStreak(calcStreak(sess));
    setLoading(false);
  };

  const calcStreak = (sess: HifdhSession[]) => {
    let s = 0;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split("T")[0];
      if (i === 0) { s++; continue; }
      if (sess.find(x => x.session_date === ds && x.status === "completed")) s++; else break;
    }
    return s;
  };

  const fetchAyahs = async (surahNum: number, start: number, end: number) => {
    try {
      const res = await fetch(`https://api.quran.com/api/v4/verses/by_chapter/${surahNum}?fields=text_uthmani&per_page=50`);
      const json = await res.json();
      const verses = (json.verses || []).slice(start - 1, end);
      return verses.map((v: any, i: number) => ({ number: start + i, text: v.text_uthmani })) as Ayah[];
    } catch { return [{ number: start, text: "Failed to load. Check connection." }]; }
  };

  const startSession = async () => {
    if (!todaySession) return;
    const fetched = await fetchAyahs(todaySession.surah_number, todaySession.ayah_start, todaySession.ayah_end);
    setAyahs(fetched);
    setAyahResults(fetched.map(a => ({ number: a.number, text: a.text, words: a.text.split(" ").map(w => ({ word: w, status: "pending" as WordStatus })), fullyRecited: false })));
    setLiveTranscript(""); setFinalTranscript(""); setSessionScore(null); setSessionFeedback("");
    setView("session");
  };

  // ─── Recitation Recording ───
  const startRecording = () => {
    setLiveTranscript("");
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) { toast({ title: "Speech recognition not supported on this browser", variant: "destructive" }); return; }
    const r = new SR();
    r.lang = "ar-SA"; r.continuous = true; r.interimResults = true;
    r.onresult = (e: any) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript + " ";
      setLiveTranscript(t);
    };
    r.onerror = () => toast({ title: "Mic error", variant: "destructive" });
    r.start();
    recognitionRef.current = r;
    setIsRecording(true);
    timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
  };

  const stopRecording = () => {
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
    clearInterval(timerRef.current); setIsRecording(false); setRecordingTime(0);
    setFinalTranscript(liveTranscript);
    // Final highlight pass
    if (ayahs.length && liveTranscript) {
      const results = ayahs.map(a => {
        const words = compareWords(a.text, liveTranscript);
        const correctCount = words.filter(w => w.status === "correct").length;
        return { number: a.number, text: a.text, words, fullyRecited: correctCount / words.length > 0.7 };
      });
      setAyahResults(results);
      // Calculate score
      const allWords = results.flatMap(r => r.words);
      const correct = allWords.filter(w => w.status === "correct").length;
      const pct = Math.round((correct / allWords.length) * 100);
      setSessionScore(pct);
      if (pct >= 80) setSessionFeedback("ما شاء الله! Excellent recitation! Ready for dictation evaluation. 🌟");
      else if (pct >= 50) setSessionFeedback("جيد! Good effort! Check the highlighted words and try again or proceed. 📖");
      else setSessionFeedback("استمر في المحاولة! Review the red words carefully before proceeding. 🤲");
    }
  };

  // ─── Dictation: AI reads ayahs aloud ───
  const startDictation = async () => {
    if (!todaySession) return;
    // Pick 2-3 random ayahs from assigned portion
    const allAyahs = await fetchAyahs(todaySession.surah_number, todaySession.ayah_start, todaySession.ayah_end);
    const shuffled = [...allAyahs].sort(() => Math.random() - 0.5).slice(0, Math.min(3, allAyahs.length));
    setDictationAyahs(shuffled);
    setDictationTranscript(""); setDictationScore(null); setCurrentDictationIdx(0);
    setView("dictation");
    // Start playing after short delay
    setTimeout(() => playDictationAyah(shuffled, 0), 800);
  };

  const playDictationAyah = (ayahList: Ayah[], idx: number) => {
    if (idx >= ayahList.length) { setDictationPlaying(false); return; }
    setCurrentDictationIdx(idx);
    setDictationPlaying(true);
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(ayahList[idx].text);
      utt.lang = "ar-SA"; utt.rate = 0.7; utt.pitch = 1;
      utt.onend = () => {
        setDictationPlaying(false);
        if (idx < ayahList.length - 1) setTimeout(() => playDictationAyah(ayahList, idx + 1), 1000);
      };
      window.speechSynthesis.speak(utt);
      synthRef.current = utt;
    } else {
      toast({ title: "Text-to-speech not supported", variant: "destructive" });
      setDictationPlaying(false);
    }
  };

  const replayDictation = () => {
    window.speechSynthesis?.cancel();
    setDictationTranscript("");
    playDictationAyah(dictationAyahs, 0);
  };

  const startDictationRecording = () => {
    setDictationTranscript("");
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) { toast({ title: "Speech recognition not supported", variant: "destructive" }); return; }
    const r = new SR();
    r.lang = "ar-SA"; r.continuous = true; r.interimResults = true;
    r.onresult = (e: any) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript + " ";
      setDictationTranscript(t);
    };
    r.start();
    dictRecognitionRef.current = r;
    setDictationRecording(true);
    dictTimerRef.current = setInterval(() => setDictationTime(t => t + 1), 1000);
  };

  const stopDictationRecording = () => {
    if (dictRecognitionRef.current) { dictRecognitionRef.current.stop(); dictRecognitionRef.current = null; }
    clearInterval(dictTimerRef.current); setDictationRecording(false); setDictationTime(0);
  };

  const submitDictation = async () => {
    const allText = dictationAyahs.map(a => a.text).join(" ");
    const allWords = compareWords(allText, dictationTranscript);
    const correct = allWords.filter(w => w.status === "correct").length;
    const pct = Math.round((correct / allWords.length) * 100);
    setDictationScore(pct);
    const combined = Math.round(((sessionScore || 50) + pct) / 2);
    setFinalScore(combined);
    // Save to DB
    if (todaySession) {
      await supabase.from("hifdh_sessions" as any).update({
        status: "completed", recitation_transcript: finalTranscript,
        accuracy_score: combined, fluency_score: sessionScore || 50,
        feedback: sessionFeedback, submitted_at: new Date().toISOString(), streak_count: streak,
      }).eq("id", todaySession.id);
      setTodaySession(prev => prev ? { ...prev, status: "completed", accuracy_score: combined } : prev);
    }
    setView("result");
    toast({ title: "بارك الله فيك! Session complete ✅" });
  };

  const fr = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const sn = (n: number) => SURAH_NAMES[n] || { ar: `سورة ${n}`, en: `Surah ${n}` };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center space-y-3">
        <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Loading your Hifdh plan...</p>
      </div>
    </div>
  );

  // ─── RESULT VIEW ───
  if (view === "result") {
    const score = finalScore || 0;
    return (
      <div className="flex flex-col min-h-screen items-center justify-center px-6 py-10 space-y-6" style={{ backgroundColor: "#f5f0e8" }}>
        <div className="text-6xl">{score >= 80 ? "🌟" : score >= 50 ? "📖" : "🤲"}</div>
        <div className="text-center">
          <p className="text-4xl font-bold" style={{ color: score >= 80 ? "#16a34a" : score >= 50 ? "#b8962e" : "#ef4444" }}>{score}%</p>
          <p className="text-gray-500 text-sm mt-1">Final Combined Score</p>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
            <p className="text-2xl font-bold" style={{ color: "#1a3a2a" }}>{sessionScore || 0}%</p>
            <p className="text-xs text-gray-400">Recitation</p>
          </div>
          <div className="bg-white rounded-2xl p-4 text-center shadow-sm">
            <p className="text-2xl font-bold" style={{ color: "#1a3a2a" }}>{dictationScore || 0}%</p>
            <p className="text-xs text-gray-400">Dictation</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 w-full max-w-xs shadow-sm text-sm text-center text-gray-600">{sessionFeedback}</div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Flame className="h-4 w-4 text-orange-500" /><span>{streak} day streak 🔥</span>
        </div>
        <button onClick={() => { setView("home"); loadData(); }} className="w-full max-w-xs py-3 rounded-2xl text-white font-semibold" style={{ backgroundColor: "#1a3a2a" }}>Done ✅</button>
      </div>
    );
  }

  // ─── DICTATION VIEW ───
  if (view === "dictation") {
    return (
      <div className="flex flex-col min-h-screen" style={{ backgroundColor: "#f5f0e8" }}>
        <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: "#1a3a2a" }}>
          <button onClick={() => setView("session")} className="text-white/80 p-1"><ArrowLeft className="h-5 w-5" /></button>
          <div className="flex-1">
            <h2 className="text-white font-semibold text-sm">Dictation Evaluation</h2>
            <p className="text-white/60 text-[11px]">Listen carefully then recite back</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">

          {/* Instructions */}
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-sm font-semibold mb-1" style={{ color: "#1a3a2a" }}>📢 How it works:</p>
            <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
              <li>Listen to the AI recite the ayahs</li>
              <li>Tap microphone to recite back what you heard</li>
              <li>AI evaluates your accuracy</li>
            </ol>
          </div>

          {/* Ayahs being dictated */}
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: "#1a3a2a" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <p className="text-white/70 text-xs">Dictation Ayahs ({dictationAyahs.length})</p>
              <div className="flex items-center gap-2">
                {dictationPlaying && <div className="flex gap-0.5">{[1,2,3].map(i => <div key={i} className="w-1 h-3 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />)}</div>}
                <button onClick={replayDictation} className="flex items-center gap-1 text-white/60 text-xs">
                  <RefreshCw className="h-3.5 w-3.5" /> Replay
                </button>
              </div>
            </div>
            <div className="px-4 py-4 space-y-3">
              {dictationAyahs.map((a, i) => (
                <div key={a.number} className={`border-b border-white/10 pb-3 last:border-0 transition-opacity ${i === currentDictationIdx && dictationPlaying ? "opacity-100" : "opacity-60"}`}>
                  <span className="text-[11px] text-white/40 block mb-1">Ayah {a.number}</span>
                  {dictationScore !== null ? (
                    // Show highlighted after submission
                    <div className="flex flex-wrap gap-1 justify-end" dir="rtl">
                      {compareWords(a.text, dictationTranscript).map((w, wi) => {
                        const c = wordColor(w.status);
                        return <span key={wi} className="px-1 py-0.5 rounded text-sm" style={{ backgroundColor: c.bg, color: c.color, fontFamily: "'Amiri', serif" }}>{w.word}</span>;
                      })}
                    </div>
                  ) : (
                    <p className="text-white text-xl leading-loose text-right" dir="rtl" style={{ fontFamily: "'Amiri', serif", lineHeight: "2.2" }}>
                      {dictationPlaying && i === currentDictationIdx ? a.text : "━━━━━━━━━━"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Recording */}
          {!dictationScore && (
            <div className="bg-white rounded-2xl p-5 shadow-sm text-center space-y-4">
              <p className="text-sm text-gray-500">Now recite back what you heard</p>
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={dictationRecording ? stopDictationRecording : startDictationRecording}
                  disabled={dictationPlaying}
                  className={`h-18 w-18 h-20 w-20 rounded-full flex items-center justify-center text-white shadow-lg transition-all ${dictationRecording ? "animate-pulse" : ""} ${dictationPlaying ? "opacity-40" : ""}`}
                  style={{ backgroundColor: dictationRecording ? "#EF4444" : "#1a3a2a" }}
                >
                  {dictationRecording ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
                </button>
                {dictationRecording && <p className="text-red-500 text-sm font-medium">🔴 {fr(dictationTime)}</p>}
                {dictationPlaying && <p className="text-green-600 text-xs">Listen first...</p>}
              </div>

              {dictationTranscript && (
                <div className="p-3 rounded-xl text-right border" style={{ backgroundColor: "#f5f0e8" }}>
                  <p className="text-[10px] text-gray-500 mb-1 text-left">Your recitation:</p>
                  <p className="text-base leading-loose" dir="rtl" style={{ fontFamily: "'Amiri', serif", color: "#1a3a2a" }}>{dictationTranscript}</p>
                </div>
              )}

              {dictationTranscript && (
                <button onClick={submitDictation} className="w-full py-3 rounded-2xl text-white font-medium flex items-center justify-center gap-2" style={{ backgroundColor: "#1a3a2a" }}>
                  <Send className="h-4 w-4" /> Submit Dictation
                </button>
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
    const hasResults = ayahResults.length > 0;
    const allWords = ayahResults.flatMap(r => r.words);
    const correct = allWords.filter(w => w.status === "correct").length;
    const skipped = allWords.filter(w => w.status === "skipped").length;
    const mispronounced = allWords.filter(w => w.status === "mispronounced").length;

    return (
      <div className="flex flex-col min-h-screen" style={{ backgroundColor: "#f5f0e8" }}>
        <div className="px-4 py-3 flex items-center gap-3 shadow-sm" style={{ backgroundColor: "#1a3a2a" }}>
          <button onClick={() => { stopRecording(); setView("home"); }} className="text-white/80 p-1"><ArrowLeft className="h-5 w-5" /></button>
          <div className="flex-1">
            <h2 className="text-white font-semibold text-sm">Hifdh Session</h2>
            <p className="text-white/60 text-[11px]">{name.en} — Ayahs {todaySession.ayah_start}–{todaySession.ayah_end}</p>
          </div>
          <div className="text-white/60 text-xs" dir="rtl">{name.ar}</div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

          {/* Legend */}
          {isRecording || finalTranscript ? (
            <div className="flex items-center gap-3 bg-white rounded-2xl px-4 py-2.5 shadow-sm flex-wrap">
              {[
                { color: "#16a34a", bg: "#dcfce7", label: "Correct" },
                { color: "#ea580c", bg: "#ffedd5", label: "Mispronounced" },
                { color: "#dc2626", bg: "#fee2e2", label: "Skipped" },
                { color: "#9ca3af", bg: "#f3f4f6", label: "Pending" },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="text-[10px] text-gray-500">{l.label}</span>
                </div>
              ))}
            </div>
          ) : null}

          {/* Ayahs with word highlighting */}
          <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: "#1a3a2a" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <p className="text-white/70 text-xs">Assigned Ayahs</p>
              <div className="flex items-center gap-2">
                {isRecording && (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                    <span className="text-red-300 text-[10px]">Live</span>
                  </div>
                )}
                <button onClick={() => setHideAyahs(!hideAyahs)} className="flex items-center gap-1 text-white/60 text-xs">
                  {hideAyahs ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  {hideAyahs ? "Show" : "Hide"}
                </button>
              </div>
            </div>

            {!hideAyahs ? (
              <div className="px-4 py-4 space-y-4">
                {(hasResults ? ayahResults : ayahs.map(a => ({ number: a.number, text: a.text, words: [], fullyRecited: false }))).map(a => (
                  <div key={a.number} className="border-b border-white/10 pb-4 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-white/40">Ayah {a.number}</span>
                      {a.words.length > 0 && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${a.fullyRecited ? "bg-green-500/20 text-green-300" : "bg-white/10 text-white/40"}`}>
                          {a.fullyRecited ? "✓ Recited" : "Pending"}
                        </span>
                      )}
                    </div>
                    {a.words.length > 0 ? (
                      // Highlighted words
                      <div className="flex flex-wrap gap-1 justify-end" dir="rtl">
                        {a.words.map((w, wi) => {
                          const c = wordColor(w.status);
                          return (
                            <span
                              key={wi}
                              className="px-1.5 py-0.5 rounded-lg text-lg transition-all"
                              style={{
                                backgroundColor: w.status === "pending" ? "transparent" : c.bg,
                                color: w.status === "pending" ? "white" : c.color,
                                fontFamily: "'Amiri', serif",
                                lineHeight: "2"
                              }}
                            >
                              {w.word}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      // Plain text before recording
                      <p className="text-white text-xl leading-loose text-right" dir="rtl" style={{ fontFamily: "'Amiri', serif", lineHeight: "2.2" }}>
                        {ayahs.find(x => x.number === a.number)?.text}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-white/40 text-sm">Ayahs hidden — recite from memory 🧠</div>
            )}
          </div>

          {/* Stats after recording */}
          {finalTranscript && sessionScore !== null && (
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="text-center"><p className="text-lg font-bold text-green-600">{correct}</p><p className="text-[10px] text-gray-400">Correct</p></div>
                <div className="text-center"><p className="text-lg font-bold text-orange-500">{mispronounced}</p><p className="text-[10px] text-gray-400">Mispronounced</p></div>
                <div className="text-center"><p className="text-lg font-bold text-red-500">{skipped}</p><p className="text-[10px] text-gray-400">Skipped</p></div>
              </div>
              <div className="h-2 rounded-full overflow-hidden bg-gray-100">
                <div className="h-full rounded-full transition-all" style={{ width: `${sessionScore}%`, backgroundColor: sessionScore >= 80 ? "#16a34a" : sessionScore >= 50 ? "#b8962e" : "#ef4444" }} />
              </div>
              <p className="text-center text-sm font-bold mt-2" style={{ color: "#1a3a2a" }}>{sessionScore}% accuracy</p>
              <p className="text-center text-xs text-gray-500 mt-1">{sessionFeedback}</p>
            </div>
          )}

          {/* Recording Controls */}
          <div className="bg-white rounded-2xl p-5 shadow-sm text-center space-y-4">
            {!finalTranscript ? (
              <>
                <p className="text-sm text-gray-500">{isRecording ? "Reciting... words highlighted in real-time" : "Tap mic to start reciting"}</p>
                <div className="flex flex-col items-center gap-3">
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`h-20 w-20 rounded-full flex items-center justify-center text-white shadow-lg transition-transform active:scale-95 ${isRecording ? "animate-pulse" : ""}`}
                    style={{ backgroundColor: isRecording ? "#EF4444" : "#1a3a2a" }}
                  >
                    {isRecording ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
                  </button>
                  {isRecording && <p className="text-red-500 text-sm font-medium">🔴 {fr(recordingTime)}</p>}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => { setFinalTranscript(""); setLiveTranscript(""); setAyahResults(ayahs.map(a => ({ number: a.number, text: a.text, words: [], fullyRecited: false }))); setSessionScore(null); }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm text-gray-500"
                  >
                    <RotateCcw className="h-4 w-4" /> Re-record
                  </button>
                  <button
                    onClick={startDictation}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-sm"
                    style={{ backgroundColor: "#1a3a2a" }}
                  >
                    <Volume2 className="h-4 w-4" /> Dictation Test
                  </button>
                </div>
                <button
                  onClick={async () => {
                    if (!todaySession) return;
                    await supabase.from("hifdh_sessions" as any).update({ status: "completed", recitation_transcript: finalTranscript, accuracy_score: sessionScore, submitted_at: new Date().toISOString() }).eq("id", todaySession.id);
                    setTodaySession(prev => prev ? { ...prev, status: "completed" } : prev);
                    setView("home"); loadData();
                    toast({ title: "Session saved ✅" });
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

      <div className="text-center py-4 px-4 rounded-2xl relative" style={{ backgroundColor: "#1a3a2a" }}>
        <button onClick={() => setShowPlanSettings(true)} className="absolute top-3 right-3 p-2 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
          <Settings className="h-4 w-4 text-white/70" />
        </button>
        <p className="text-white/60 text-xs mb-1" style={{ fontFamily: "'Amiri', serif" }}>وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا</p>
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>Al-Hifdh</h1>
        <p className="text-white/60 text-xs mt-0.5">Daily Quran Revision</p>
        {plan && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full text-white/80" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>{plan.revision_mode === "memorize" ? "📖 Memorize" : "🔄 Review"}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full text-white/80" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>{plan.difficulty || "beginner"}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: <Flame className="h-5 w-5 text-orange-500" />, label: "Streak", value: `${streak} days` },
          { icon: <CheckCircle className="h-5 w-5 text-green-500" />, label: "Completed", value: `${sessions.filter(s => s.status === "completed").length}` },
          { icon: <Star className="h-5 w-5 text-amber-500" />, label: "This Week", value: `${sessions.filter(s => s.status === "completed" && new Date(s.session_date) >= new Date(Date.now() - 7 * 86400000)).length}/7` },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-2xl p-3 text-center shadow-sm">
            <div className="flex justify-center mb-1">{s.icon}</div>
            <p className="text-base font-bold" style={{ color: "#1a3a2a" }}>{s.value}</p>
            <p className="text-[10px] text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {todaySession ? (
        <div className="rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3" style={{ backgroundColor: "#1a3a2a" }}>
            <p className="text-white/60 text-xs">Today's Revision</p>
            <h2 className="text-white font-semibold text-lg" style={{ fontFamily: "'Playfair Display', serif" }}>{sn(todaySession.surah_number).en}</h2>
            <p className="text-white/60 text-sm" dir="rtl" style={{ fontFamily: "'Amiri', serif" }}>{sn(todaySession.surah_number).ar}</p>
          </div>
          <div className="bg-white px-4 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Ayahs {todaySession.ayah_start} – {todaySession.ayah_end}</span>
              <Badge variant={todaySession.status === "completed" ? "default" : "secondary"} className="text-xs">
                {todaySession.status === "completed" ? "✅ Done" : "⏳ Pending"}
              </Badge>
            </div>
            {todaySession.status !== "completed" ? (
              <Button onClick={startSession} className="w-full rounded-xl" style={{ backgroundColor: "#1a3a2a" }}>
                <Mic className="h-4 w-4 mr-2" /> Start Session
              </Button>
            ) : (
              <div className="text-center py-2">
                <p className="text-green-600 font-medium text-sm">✅ Today's revision complete!</p>
                <p className="text-xs text-gray-500 mt-0.5">بارك الله فيك</p>
                {todaySession.accuracy_score != null && <p className="text-sm font-bold mt-1" style={{ color: "#1a3a2a" }}>Score: {todaySession.accuracy_score}%</p>}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <BookOpen className="h-10 w-10 mx-auto mb-2" style={{ color: "#1a3a2a" }} />
          <p className="font-medium">No plan assigned yet</p>
          <p className="text-xs text-gray-500 mt-1">Contact your teacher or set your own plan</p>
          <button onClick={() => setShowPlanSettings(true)} className="mt-3 text-xs underline" style={{ color: "#b8962e" }}>Set my plan →</button>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b"><h3 className="font-semibold text-sm" style={{ color: "#1a3a2a" }}>Recent Sessions</h3></div>
        {sessions.slice(0, 5).length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-gray-400">No sessions yet 🌙</div>
        ) : (
          <div className="divide-y">
            {sessions.slice(0, 5).map(s => (
              <div key={s.id} className="flex items-center px-4 py-3 gap-3">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${s.status === "completed" ? "bg-green-100" : "bg-gray-100"}`}>
                  {s.status === "completed" ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Clock className="h-4 w-4 text-gray-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{sn(s.surah_number).en} — {s.ayah_start}:{s.ayah_end}</p>
                  <p className="text-xs text-gray-400">{new Date(s.session_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>
                </div>
                {s.accuracy_score != null && <span className={`text-sm font-bold ${s.accuracy_score >= 80 ? "text-green-500" : s.accuracy_score >= 50 ? "text-amber-500" : "text-red-400"}`}>{s.accuracy_score}%</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <HifdhPlanSettings open={showPlanSettings} onClose={() => setShowPlanSettings(false)} plan={plan} onSaved={(updated) => { setPlan(updated as HifdhPlan); loadData(); }} />
    </div>
  );
};

export default HifdhRevision;
