import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mic, MicOff, CheckCircle, Clock, Flame,
  BookOpen, ArrowLeft, RotateCcw, Send, ChevronRight,
  Eye, EyeOff, Star, Settings
} from "lucide-react";
import HifdhPlanSettings from "@/components/hifdh/HifdhPlanSettings";

const SURAH_NAMES: Record<number, { ar: string; en: string }> = {
  1: { ar: "الفاتحة", en: "Al-Fatiha" },
  2: { ar: "البقرة", en: "Al-Baqarah" },
  36: { ar: "يس", en: "Ya-Sin" },
  55: { ar: "الرحمن", en: "Ar-Rahman" },
  56: { ar: "الواقعة", en: "Al-Waqi'a" },
  67: { ar: "الملك", en: "Al-Mulk" },
  78: { ar: "النبأ", en: "An-Naba" },
  79: { ar: "النازعات", en: "An-Naziat" },
  80: { ar: "عبس", en: "Abasa" },
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

type View = "home" | "session";

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
  const [hideAyahs, setHideAyahs] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [score, setScore] = useState<number | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => { if (user) loadData(); }, [user]);

  const loadData = async () => {
    setLoading(true);
    const { data: planData } = await supabase.from("hifdh_plans" as any).select("*").eq("student_id", user!.id).maybeSingle();

    if (planData) {
      setPlan(planData as HifdhPlan);
    } else {
      const { data: newPlan } = await supabase.from("hifdh_plans" as any).insert({
        student_id: user!.id, current_juz: 30, daily_target_ayahs: 5,
        surah_rotation: [114, 113, 112, 111, 110, 109, 108],
        surah_number: 114, ayah_start: 1, ayah_end: 6,
        revision_mode: "memorize", difficulty: "beginner",
        teacher_locked: false, max_ayahs_override: 10,
      }).select().single();
      if (newPlan) setPlan(newPlan as HifdhPlan);
    }

    const { data: sessionData } = await supabase.from("hifdh_sessions" as any).select("*").eq("student_id", user!.id).order("session_date", { ascending: false }).limit(30);
    const sess = (sessionData || []) as HifdhSession[];
    setSessions(sess);

    const today = new Date().toISOString().split("T")[0];
    const todaySess = sess.find(s => s.session_date === today);

    if (!todaySess && planData) {
      const p = planData as HifdhPlan;
      const { data: newSession } = await supabase.from("hifdh_sessions" as any).insert({
        student_id: user!.id, plan_id: p.id, session_date: today,
        surah_number: p.surah_number || 114,
        ayah_start: p.ayah_start || 1,
        ayah_end: p.ayah_end || 6,
        status: "pending", streak_count: calculateStreak(sess),
      }).select().single();
      if (newSession) setTodaySession(newSession as HifdhSession);
    } else {
      setTodaySession(todaySess || null);
    }

    setStreak(calculateStreak(sess));
    setLoading(false);
  };

  const calculateStreak = (sess: HifdhSession[]) => {
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
      setAyahs(verses.map((v: any, i: number) => ({ number: start + i, text: v.text_uthmani })));
    } catch { setAyahs([{ number: start, text: "Failed to load. Check connection." }]); }
  };

  const startSession = async () => {
    if (!todaySession) return;
    await fetchAyahs(todaySession.surah_number, todaySession.ayah_start, todaySession.ayah_end);
    setView("session"); setTranscript(""); setSubmitted(false); setFeedback(""); setScore(null);
  };

  const startRecording = async () => {
    setTranscript("");
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      const r = new SR(); r.lang = "ar-SA"; r.continuous = true; r.interimResults = true;
      r.onresult = (e: any) => { let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; setTranscript(t); };
      r.start(); recognitionRef.current = r;
      setIsRecording(true);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = e => chunksRef.current.push(e.data);
      recorder.onstop = () => stream.getTracks().forEach(t => t.stop());
      recorder.start(); mediaRecorderRef.current = recorder;
      setIsRecording(true);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch { toast({ title: "Microphone denied", variant: "destructive" }); }
  };

  const stopRecording = () => {
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
    if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
    clearInterval(timerRef.current); setIsRecording(false); setRecordingTime(0);
  };

  const submitSession = async () => {
    if (!todaySession || !user) return;
    const ayahText = ayahs.map(a => a.text).join(" ");
    const ayahWords = ayahText.replace(/[^\u0600-\u06FF\s]/g, "").split(/\s+/).filter(Boolean);
    const txWords = transcript.replace(/[^\u0600-\u06FF\s]/g, "").split(/\s+/).filter(Boolean);
    let matches = 0;
    ayahWords.forEach(w => { if (txWords.some(tw => tw.includes(w.slice(0, 3)))) matches++; });
    const pct = ayahWords.length > 0 ? Math.min(Math.round((matches / ayahWords.length) * 100), 100) : 50;
    const fb = pct >= 80 ? "ما شاء الله! Excellent recitation! Your accuracy is very good. 🌟" : pct >= 50 ? "جيد! Good effort! Review the ayahs and try again. 📖" : "استمر! Keep practicing! Every attempt brings you closer. 🤲";
    setScore(pct); setFeedback(fb);
    await supabase.from("hifdh_sessions" as any).update({ status: "completed", recitation_transcript: transcript, accuracy_score: pct, fluency_score: pct, feedback: fb, submitted_at: new Date().toISOString(), streak_count: streak }).eq("id", todaySession.id);
    setSubmitted(true);
    setTodaySession(prev => prev ? { ...prev, status: "completed", accuracy_score: pct } : prev);
    toast({ title: "بارك الله فيك! Session submitted ✅" });
  };

  const markManual = async () => {
    if (!todaySession) return;
    await supabase.from("hifdh_sessions" as any).update({ status: "completed", submitted_at: new Date().toISOString() }).eq("id", todaySession.id);
    setTodaySession(prev => prev ? { ...prev, status: "completed" } : prev);
    toast({ title: "Marked as completed ✅" });
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

  // ─── SESSION VIEW ───
  if (view === "session" && todaySession) {
    const name = sn(todaySession.surah_number);
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

        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
          {!submitted && (
            <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: "#1a3a2a" }}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <p className="text-white/70 text-xs">Your Assigned Ayahs</p>
                <button onClick={() => setHideAyahs(!hideAyahs)} className="flex items-center gap-1 text-white/60 text-xs">
                  {hideAyahs ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  {hideAyahs ? "Show" : "Hide"}
                </button>
              </div>
              {!hideAyahs ? (
                <div className="px-4 py-4 space-y-3">
                  {ayahs.map(a => (
                    <div key={a.number} className="border-b border-white/10 pb-3 last:border-0">
                      <span className="text-[11px] text-white/40 block mb-1">{a.number}</span>
                      <p className="text-white text-xl leading-loose text-right" dir="rtl" style={{ fontFamily: "'Amiri', serif", lineHeight: "2.2" }}>{a.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-6 text-center text-white/40 text-sm">Ayahs hidden — recite from memory 🧠</div>
              )}
            </div>
          )}

          {!submitted && (
            <div className="bg-white rounded-2xl p-5 shadow-sm text-center space-y-4">
              <p className="text-sm font-medium text-gray-600">Tap microphone to record your recitation</p>
              <div className="flex flex-col items-center gap-3">
                <button onClick={isRecording ? stopRecording : startRecording}
                  className={`h-20 w-20 rounded-full flex items-center justify-center text-white shadow-lg transition-transform active:scale-95 ${isRecording ? "animate-pulse" : ""}`}
                  style={{ backgroundColor: isRecording ? "#EF4444" : "#1a3a2a" }}>
                  {isRecording ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
                </button>
                {isRecording && <p className="text-red-500 text-sm font-medium">🔴 {fr(recordingTime)}</p>}
                {!isRecording && !transcript && <p className="text-gray-400 text-xs">Tap to start recording</p>}
              </div>

              {transcript && (
                <div className="p-3 rounded-xl text-right border" style={{ backgroundColor: "#f5f0e8" }}>
                  <p className="text-[10px] text-gray-500 mb-1 text-left">ما قرأته — Your recitation:</p>
                  <p className="text-base leading-loose" dir="rtl" style={{ fontFamily: "'Amiri', serif", color: "#1a3a2a" }}>{transcript}</p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button onClick={() => { setTranscript(""); setIsRecording(false); }} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-sm text-gray-500">
                  <RotateCcw className="h-4 w-4" /> Re-record
                </button>
                {transcript && (
                  <button onClick={submitSession} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-sm" style={{ backgroundColor: "#1a3a2a" }}>
                    <Send className="h-4 w-4" /> Submit
                  </button>
                )}
              </div>
              {!transcript && (
                <button onClick={markManual} className="w-full py-2.5 rounded-xl border text-sm" style={{ borderColor: "#b8962e", color: "#b8962e" }}>
                  ✅ Mark as Completed Manually
                </button>
              )}
            </div>
          )}

          {submitted && score !== null && (
            <div className="bg-white rounded-2xl p-6 shadow-sm text-center space-y-4">
              <div className="text-5xl">{score >= 80 ? "🌟" : score >= 50 ? "📖" : "🤲"}</div>
              <div>
                <p className="text-2xl font-bold" style={{ color: score >= 80 ? "#1a3a2a" : score >= 50 ? "#b8962e" : "#ef4444" }}>{score}%</p>
                <p className="text-xs text-gray-500 mt-0.5">Accuracy Score</p>
              </div>
              <div className="p-3 rounded-xl text-sm text-gray-700" style={{ backgroundColor: "#f5f0e8" }}>{feedback}</div>
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <Flame className="h-4 w-4 text-orange-500" /><span>{streak} day streak 🔥</span>
              </div>
              <button onClick={() => { setView("home"); loadData(); }} className="w-full py-3 rounded-xl text-white font-medium" style={{ backgroundColor: "#1a3a2a" }}>Done ✅</button>
            </div>
          )}

          {submitted && score === null && (
            <div className="bg-white rounded-2xl p-6 shadow-sm text-center space-y-3">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <p className="font-semibold">Session Completed!</p>
              <p className="text-sm text-gray-500">بارك الله فيك</p>
              <button onClick={() => { setView("home"); loadData(); }} className="w-full py-3 rounded-xl text-white" style={{ backgroundColor: "#1a3a2a" }}>Done</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── HOME VIEW ───
  return (
    <div className="container mx-auto px-4 py-6 space-y-5 max-w-xl">

      {/* Header */}
      <div className="text-center py-4 px-4 rounded-2xl relative" style={{ backgroundColor: "#1a3a2a" }}>
        <button onClick={() => setShowPlanSettings(true)} className="absolute top-3 right-3 p-2 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
          <Settings className="h-4 w-4 text-white/70" />
        </button>
        <p className="text-white/60 text-xs mb-1" style={{ fontFamily: "'Amiri', serif" }}>وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا</p>
        <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>Al-Hifdh</h1>
        <p className="text-white/60 text-xs mt-0.5">Daily Quran Revision</p>
        {plan && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full text-white/80" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
              {plan.revision_mode === "memorize" ? "📖 Memorize" : "🔄 Review"}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full text-white/80" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
              {plan.difficulty || "beginner"}
            </span>
          </div>
        )}
      </div>

      {/* Stats */}
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

      {/* Today's Assignment */}
      {todaySession ? (
        <div className="rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3" style={{ backgroundColor: "#1a3a2a" }}>
            <p className="text-white/60 text-xs">Today's Revision</p>
            <h2 className="text-white font-semibold text-lg" style={{ fontFamily: "'Playfair Display', serif" }}>
              {sn(todaySession.surah_number).en}
            </h2>
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
                <p className="text-xs text-gray-500 mt-0.5">بارك الله فيك — May Allah bless you</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-6 text-center shadow-sm">
          <BookOpen className="h-10 w-10 mx-auto mb-2" style={{ color: "#1a3a2a" }} />
          <p className="font-medium">No plan assigned yet</p>
          <p className="text-xs text-gray-500 mt-1">Contact your teacher to assign a Hifdh plan</p>
          <button onClick={() => setShowPlanSettings(true)} className="mt-3 text-xs underline" style={{ color: "#b8962e" }}>
            Or set your own plan →
          </button>
        </div>
      )}

      {/* Recent Sessions */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm" style={{ color: "#1a3a2a" }}>Recent Sessions</h3>
        </div>
        {sessions.slice(0, 5).length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-gray-400">No sessions yet — start your first one! 🌙</div>
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
                {s.accuracy_score != null && (
                  <span className={`text-sm font-bold ${s.accuracy_score >= 80 ? "text-green-500" : s.accuracy_score >= 50 ? "text-amber-500" : "text-red-400"}`}>{s.accuracy_score}%</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Plan Settings */}
      <HifdhPlanSettings
        open={showPlanSettings}
        onClose={() => setShowPlanSettings(false)}
        plan={plan}
        onSaved={(updated) => { setPlan(updated as HifdhPlan); loadData(); }}
      />
    </div>
  );
};

export default HifdhRevision;
