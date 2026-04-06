import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart3, Mic, MicOff, Brain, Target, FileCheck,
  Play, Pause, SkipBack, SkipForward, Minus, Plus,
  Maximize2, Minimize2, BookOpen, Flame, Star, ChevronRight,
  Moon, Award, X, CheckCircle2, AlertTriangle, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

import HifdhMemorization from "@/components/hifdh/HifdhMemorization";
import HifdhExercise from "@/components/hifdh/HifdhExercise";
import HifdhTest from "@/components/hifdh/HifdhTest";

type Tab = "overview" | "recitation" | "memorization" | "exercise" | "test";

const TABS: { id: Tab; ar: string; icon: React.ElementType }[] = [
  { id: "overview",     ar: "لوحة",   icon: BarChart3  },
  { id: "recitation",   ar: "تلاوة",  icon: Mic        },
  { id: "memorization", ar: "حفظ",    icon: Brain      },
  { id: "exercise",     ar: "تمرين",  icon: Target     },
  { id: "test",         ar: "اختبار", icon: FileCheck  },
];

const RECITERS = [
  { id: "ar.alafasy",            name: "Mishary Alafasy"  },
  { id: "ar.abdurrahmaansudais", name: "As-Sudais"        },
  { id: "ar.husary",             name: "Al-Husary"        },
  { id: "ar.minshawi",           name: "Al-Minshawi"      },
  { id: "ar.shaatri",            name: "Ash-Shaatri"      },
  { id: "ar.abdulsamad",         name: "Abdul Samad"      },
  { id: "ar.muhammadjibreel",    name: "M. Jibreel"       },
  { id: "ar.haniarrifai",        name: "Hani Ar-Rifai"    },
  { id: "ar.maaboramadan",       name: "Al-Muaiqly"       },
  { id: "ar.abdullahbasfar",     name: "Basfar"           },
];

const GOLD       = "#c9a84c";
const DARK_GREEN = "#0f2d1f";
const PARCHMENT  = "#fdf6e3";
const INK        = "#1c1208";

const toAr = (n: number) =>
  String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);

/* absolute ayah number → islamic.network CDN */
const buildAudioUrl = (absoluteNum: number, reciter: string) =>
  `https://cdn.islamic.network/quran/audio/128/${reciter}/${absoluteNum}.mp3`;

function groupBySurah(ayahs: any[]) {
  const groups: { surah: any; ayahs: any[] }[] = [];
  for (const ayah of ayahs) {
    const last = groups[groups.length - 1];
    if (!last || last.surah.number !== ayah.surah.number)
      groups.push({ surah: ayah.surah, ayahs: [ayah] });
    else last.ayahs.push(ayah);
  }
  return groups;
}

/* ─── Beautiful inline Dashboard ─────────────────────────────────────── */
function HifdhDashboardInline({
  userId,
  studentName,
  currentPage,
  onNavigate,
}: {
  userId: string | null;
  studentName: string;
  currentPage: number;
  onNavigate: (tab: Tab) => void;
}) {
  const progress = Math.round((currentPage / 604) * 100);
  const juz = Math.ceil(currentPage / 20.13);

  const stats = [
    { icon: BookOpen, label: "Current Page", value: String(currentPage), sub: `of 604`, color: "#2196a6" },
    { icon: Moon,     label: "Juz",           value: toAr(Math.min(juz, 30)), sub: "الجزء",   color: GOLD    },
    { icon: Flame,    label: "Progress",      value: `${progress}%`,          sub: "complete", color: "#e05a1c" },
  ];

  const actions = [
    { icon: Mic,       label: "Continue Recitation", tab: "recitation" as Tab,   desc: `Resume from page ${currentPage}` },
    { icon: Brain,     label: "Memorize",             tab: "memorization" as Tab, desc: "Strengthen your hifdh"           },
    { icon: Target,    label: "Practice Exercise",    tab: "exercise" as Tab,     desc: "Test what you know"              },
    { icon: FileCheck, label: "Take a Test",          tab: "test" as Tab,         desc: "Formal assessment"               },
  ];

  return (
    <div className="h-full overflow-y-auto" style={{ background: "linear-gradient(160deg,#0a1f13 0%,#0d1a0f 60%,#111008 100%)" }}>
      {/* Islamic geometric pattern overlay */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c9a84c' fill-opacity='0.04'%3E%3Cpath d='M30 0l8.66 5v10L30 20l-8.66-5V5L30 0zm0 40l8.66 5v10L30 60l-8.66-5V45L30 40zm20-20l8.66 5v10L50 40l-8.66-5V25L50 20zM10 20l8.66 5v10L10 40l-8.66-5V25L10 20z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }} />

      <div className="relative z-10 px-4 pt-5 pb-24 max-w-md mx-auto">

        {/* ── Greeting ── */}
        <div className="mb-6">
          <p style={{ fontFamily:"'Amiri',serif", color:GOLD, fontSize:"0.78em", direction:"rtl", marginBottom:2, opacity:0.85 }}>
            السلام عليكم
          </p>
          <h1 className="text-white text-xl font-bold tracking-tight leading-tight">
            {studentName.split(" ")[0]}
          </h1>
          <p style={{ color:"#5a8a6a", fontSize:"0.78em", marginTop:2 }}>
            May Allah bless your hifdh journey
          </p>
        </div>

        {/* ── Progress banner ── */}
        <div
          className="rounded-2xl p-4 mb-5 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg,${DARK_GREEN},#1a4a2e)`, border:`1px solid ${GOLD}33` }}
        >
          {/* Decorative arc */}
          <div style={{
            position:"absolute", top:-40, right:-40,
            width:120, height:120, borderRadius:"50%",
            border:`2px solid ${GOLD}22`, pointerEvents:"none"
          }} />
          <div style={{
            position:"absolute", top:-20, right:-20,
            width:80, height:80, borderRadius:"50%",
            border:`1px solid ${GOLD}15`, pointerEvents:"none"
          }} />

          <div className="flex items-end justify-between mb-3">
            <div>
              <p style={{ color:`${GOLD}cc`, fontSize:"0.7em", fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase" }}>
                Quran Journey
              </p>
              <p className="text-white text-2xl font-bold mt-0.5">
                {progress}<span style={{ fontSize:"0.55em", color:"#9dc9a8", marginLeft:2 }}>%</span>
              </p>
            </div>
            <div style={{ fontFamily:"'Amiri Quran','Amiri',serif", color:GOLD, fontSize:"1.5em", direction:"rtl" }}>
              ﷽
            </div>
          </div>

          {/* Progress bar */}
          <div className="rounded-full overflow-hidden" style={{ height:6, background:"#0a1f13" }}>
            <div
              className="h-full rounded-full"
              style={{
                width:`${progress}%`,
                background:`linear-gradient(to right,${GOLD}88,${GOLD})`,
                transition:"width 0.6s ease",
                minWidth: progress > 0 ? 6 : 0
              }}
            />
          </div>
          <p style={{ color:"#5a8a6a", fontSize:"0.68em", marginTop:6 }}>
            Page {currentPage} of 604 · Juz {Math.min(juz, 30)} of 30
          </p>
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          {stats.map(({ icon: Icon, label, value, sub, color }) => (
            <div
              key={label}
              className="rounded-xl p-3 flex flex-col items-center gap-1.5 text-center"
              style={{ background:"#0f2010cc", border:"1px solid #1e4a28" }}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: color + "22" }}>
                <Icon size={15} color={color} strokeWidth={2} />
              </div>
              <p className="font-bold text-white text-base leading-none" style={{ fontFamily:"'Amiri',serif" }}>{value}</p>
              <p style={{ color:"#5a8a6a", fontSize:"0.62em", lineHeight:1.2 }}>{sub}</p>
            </div>
          ))}
        </div>

        {/* ── Section label ── */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-px" style={{ background:`linear-gradient(to right,${GOLD}44,transparent)` }} />
          <span style={{ color:GOLD, fontSize:"0.68em", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase" }}>
            Quick Actions
          </span>
          <div className="flex-1 h-px" style={{ background:`linear-gradient(to left,${GOLD}44,transparent)` }} />
        </div>

        {/* ── Action cards ── */}
        <div className="flex flex-col gap-2.5">
          {actions.map(({ icon: Icon, label, tab, desc }, i) => (
            <button
              key={tab}
              onClick={() => onNavigate(tab)}
              className="flex items-center gap-3.5 rounded-xl px-4 py-3.5 text-left w-full transition-all active:scale-[0.98]"
              style={{
                background: i === 0
                  ? `linear-gradient(135deg,${DARK_GREEN},#1a4a2e)`
                  : "#0f201088",
                border: `1px solid ${i === 0 ? GOLD + "55" : "#1e4a2844"}`,
              }}
            >
              <div
                className="w-9 h-9 rounded-full flex-none flex items-center justify-center"
                style={{ background: i === 0 ? GOLD + "22" : "#1e4a2888" }}
              >
                <Icon size={17} color={i === 0 ? GOLD : "#5a8a6a"} strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm leading-tight" style={{ color: i === 0 ? "white" : "#c8d8cc" }}>
                  {label}
                </p>
                <p style={{ color:"#4a7a5a", fontSize:"0.68em", marginTop:1 }}>{desc}</p>
              </div>
              <ChevronRight size={14} color={i === 0 ? GOLD : "#2a5a3a"} />
            </button>
          ))}
        </div>

        {/* ── Motivational footer ── */}
        <div
          className="mt-5 rounded-xl px-4 py-3 text-center"
          style={{ background:"#0a150d", border:`1px solid ${GOLD}22` }}
        >
          <p style={{ fontFamily:"'Amiri',serif", color:GOLD, fontSize:"1.1em", direction:"rtl", lineHeight:2 }}>
            ﴿ إِنَّا نَحۡنُ نَزَّلۡنَا ٱلذِّكۡرَ وَإِنَّا لَهُۥ لَحَٰفِظُونَ ﴾
          </p>
          <p style={{ color:"#3a6a4a", fontSize:"0.65em", marginTop:4 }}>
            Al-Hijr 15:9 · Indeed, it is We who sent down the reminder, and indeed, We will be its guardian.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
export default function HifdhRevision() {
  const [activeTab,   setActiveTab]   = useState<Tab>("overview");
  const [userId,      setUserId]      = useState<string | null>(null);
  const [studentName, setStudentName] = useState("Student");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageData,    setPageData]    = useState<any>(null);
  const [loading,     setLoading]     = useState(false);
  const [playingAyah, setPlayingAyah] = useState(0);
  const [reciter,     setReciter]     = useState("ar.alafasy");
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [fontSize,    setFontSize]    = useState(26);
  const [flipDir,     setFlipDir]     = useState<"next" | "prev" | null>(null);
  const [fullscreen,  setFullscreen]  = useState(false);

  // ── AI Revision Recording State ──
  const [isRecording,    setIsRecording]    = useState(false);
  const [recTime,        setRecTime]        = useState(0);
  const [showResults,    setShowResults]    = useState(false);
  const [aiScoring,      setAiScoring]      = useState(false);
  const [aiScore,        setAiScore]        = useState<number | null>(null);
  const [aiTranscript,   setAiTranscript]   = useState<string | null>(null);
  const [wordErrors,     setWordErrors]     = useState<{word: string; status: "correct"|"wrong"|"missing"}[]>([]);
  const mediaRecRef  = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recTimerRef  = useRef<any>(null);

  const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY || "";

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg"].find(t => {
        try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
      }) || "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recChunksRef.current = [];
      mr.ondataavailable = e => { if (e.data?.size > 0) recChunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recTimerRef.current);
        const blob = new Blob(recChunksRef.current, { type: mime || "audio/webm" });
        if (blob.size > 0) runAiEvaluation(blob);
      };
      mr.start(200);
      mediaRecRef.current = mr;
      setIsRecording(true);
      setRecTime(0);
      recTimerRef.current = setInterval(() => setRecTime(t => t + 1), 1000);
    } catch {
      console.error("Mic denied");
    }
  };

  const stopRecording = () => {
    mediaRecRef.current?.stop();
    setIsRecording(false);
    clearInterval(recTimerRef.current);
  };

  const runAiEvaluation = async (blob: Blob) => {
    setAiScoring(true);
    setShowResults(true);
    setAiScore(null);
    setAiTranscript(null);
    setWordErrors([]);

    try {
      let transcript = "";

      // Transcribe via Groq Whisper
      if (GROQ_KEY) {
        const fd = new FormData();
        fd.append("file", new File([blob], "recitation.webm", { type: blob.type || "audio/webm" }));
        fd.append("model", "whisper-large-v3");
        fd.append("language", "ar");
        fd.append("response_format", "json");
        fd.append("temperature", "0");
        fd.append("prompt", "بسم الله الرحمن الرحيم الحمد لله رب العالمين الرحمن الرحيم");
        const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST", headers: { Authorization: `Bearer ${GROQ_KEY}` }, body: fd,
        });
        if (r.ok) transcript = (await r.json()).text || "";
      }

      // Fallback: transcribe-hifdh edge function
      if (!transcript) {
        try {
          const b64 = await new Promise<string>(resolve => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              resolve(result.split(",")[1] || "");
            };
            reader.readAsDataURL(blob);
          });
          const { data } = await supabase.functions.invoke("transcribe-hifdh", {
            body: { audio: b64, mimeType: blob.type || "audio/webm" },
          });
          transcript = data?.transcript || "";
        } catch { /* ignore */ }
      }

      setAiTranscript(transcript);

      // Compare to reference Quran text on current page
      const refText = (pageDataRef.current?.ayahs || []).map((a: any) => a.text).join(" ");
      const refWords = refText.replace(/[^\u0600-\u06FF\s]/g, "").trim().split(/\s+/).filter(Boolean);
      const gotWords = transcript.replace(/[^\u0600-\u06FF\s]/g, "").trim().split(/\s+/).filter(Boolean);

      // Word-level comparison
      const errors: {word: string; status: "correct"|"wrong"|"missing"}[] = [];
      const usedGot = new Set<number>();

      refWords.forEach(refW => {
        const cleanRef = refW.replace(/[\u064B-\u065F\u0670]/g, ""); // strip tashkeel for comparison
        let found = false;
        for (let i = 0; i < gotWords.length; i++) {
          if (usedGot.has(i)) continue;
          const cleanGot = gotWords[i].replace(/[\u064B-\u065F\u0670]/g, "");
          if (cleanRef === cleanGot || cleanRef.includes(cleanGot.slice(0, 3)) || cleanGot.includes(cleanRef.slice(0, 3))) {
            errors.push({ word: refW, status: "correct" });
            usedGot.add(i);
            found = true;
            break;
          }
        }
        if (!found) errors.push({ word: refW, status: "missing" });
      });

      // Extra words said by student that don't match
      gotWords.forEach((w, i) => {
        if (!usedGot.has(i)) errors.push({ word: w, status: "wrong" });
      });

      setWordErrors(errors);

      const correctCount = errors.filter(e => e.status === "correct").length;
      const score = refWords.length > 0 ? Math.round((correctCount / refWords.length) * 100) : 0;
      setAiScore(score);

      // Save to hifdh_recordings
      if (userId) {
        const firstSurahOnPage = pageDataRef.current?.ayahs?.[0]?.surah;
        await (supabase as any).from("hifdh_recordings").insert({
          student_id: userId,
          surah_name: firstSurahOnPage?.englishName || "",
          surah_num: firstSurahOnPage?.number || 0,
          ai_score: score,
          transcript,
          word_results: errors,
          status: "completed",
          created_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error("AI evaluation error:", e);
      setAiTranscript("Evaluation failed — please try again");
      setAiScore(0);
    } finally {
      setAiScoring(false);
    }
  };

  const fmtTime = (s: number) => `${Math.floor(s/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`;

  const audioRef    = useRef<HTMLAudioElement>(null);
  const playingRef  = useRef(0);
  const pageDataRef = useRef<any>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const flipTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── persist ── */
  useEffect(() => {
    const tab  = localStorage.getItem("hifdh_tab");
    const page = localStorage.getItem("hifdh_page");
    const rec  = localStorage.getItem("hifdh_reciter");
    const font = localStorage.getItem("hifdh_font");
    if (tab)  setActiveTab(tab as Tab);
    if (page) setCurrentPage(parseInt(page, 10));
    if (rec)  setReciter(rec);
    if (font) setFontSize(parseInt(font, 10));
  }, []);

  useEffect(() => { localStorage.setItem("hifdh_tab",     activeTab);          }, [activeTab]);
  useEffect(() => { localStorage.setItem("hifdh_page",    String(currentPage)); }, [currentPage]);
  useEffect(() => { localStorage.setItem("hifdh_reciter", reciter);             }, [reciter]);
  useEffect(() => { localStorage.setItem("hifdh_font",    String(fontSize));    }, [fontSize]);
  useEffect(() => { pageDataRef.current = pageData;                             }, [pageData]);

  /* ── auth ── */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      setUserId(data.user.id);
      supabase.from("profiles").select("full_name").eq("id", data.user.id).single()
        .then(({ data: p }) => { if (p?.full_name) setStudentName(p.full_name); });
    });
  }, []);

  /* ── fetch page ── */
  const fetchPage = useCallback((page: number) => {
    setLoading(true);
    setPageData(null);
    fetch(`https://api.alquran.cloud/v1/page/${page}/ar.uthmani`)
      .then(r => r.json())
      .then(json => { if (json?.code === 200) setPageData(json.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchPage(currentPage); }, [currentPage, fetchPage]);

  /* ── page navigation with flip animation ── */
  const navigate = useCallback((dir: "next" | "prev") => {
    if (flipTimeout.current) return; // block during animation
    setFlipDir(dir);
    flipTimeout.current = setTimeout(() => {
      setCurrentPage(p => dir === "next" ? Math.min(604, p + 1) : Math.max(1, p - 1));
      setPlayingAyah(0);
      playingRef.current = 0;
      setFlipDir(null);
      flipTimeout.current = null;
    }, 260); // half-way through the flip, swap page
  }, []);

  /* ── audio ── */
  const playAyah = useCallback((absoluteNum: number) => {
    if (!pageDataRef.current?.ayahs) return;
    playingRef.current = absoluteNum;
    setPlayingAyah(absoluteNum);
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.src = buildAudioUrl(absoluteNum, reciter);
    audio.load();
    audio.play().catch(() => setIsPlaying(false));
  }, [reciter]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    const pd    = pageDataRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); return; }
    const target = playingAyah > 0 ? playingAyah : pd?.ayahs?.[0]?.number ?? 1;
    playAyah(target);
  }, [isPlaying, playingAyah, playAyah]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      const pd  = pageDataRef.current;
      if (!pd?.ayahs) return;
      const idx = pd.ayahs.findIndex((a: any) => a.number === playingRef.current);
      if (idx >= 0 && idx < pd.ayahs.length - 1) playAyah(pd.ayahs[idx + 1].number);
      else { setIsPlaying(false); setPlayingAyah(0); playingRef.current = 0; }
    };
    const onPause = () => setIsPlaying(false);
    const onPlay  = () => setIsPlaying(true);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play",  onPlay);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play",  onPlay);
    };
  }, [playAyah]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.src = ""; }
    setIsPlaying(false); setPlayingAyah(0); playingRef.current = 0;
  }, [reciter]);

  /* ── swipe: right = next page (Arabic Quran direction) ── */
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 48) {
      if (dx > 0) navigate("next"); else navigate("prev");
    }
  };

  /* ── derived ── */
  const pageAyahs   = pageData?.ayahs ?? [];
  const surahGroups = groupBySurah(pageAyahs);
  const firstSurah  = pageAyahs[0]?.surah;
  const lastSurah   = pageAyahs[pageAyahs.length - 1]?.surah;
  const juzNum      = pageAyahs[0]?.juz;

  /* ══════════════════════════════════════════════════════════════════ */
  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden" style={{ background: "#0a0f0b" }}>
      <audio ref={audioRef} playsInline preload="none" style={{ display: "none" }} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&display=swap');

        /* ── Mushaf text ── */
        .mushaf-text {
          font-family: 'Amiri Quran', 'Scheherazade New', 'Amiri', serif;
          direction: rtl;
          text-align: justify;
          line-height: 2.7;
          color: ${INK};
        }
        .ayah-marker {
          font-family: 'Amiri', serif;
          color: ${GOLD};
          font-size: 0.7em;
          margin: 0 1px;
        }
        .ayah-active {
          background: ${GOLD}28;
          border-radius: 3px;
          outline: 1.5px solid ${GOLD}66;
          padding: 0 1px;
        }
        .surah-nameplate {
          margin: 10px 0 4px;
          padding: 6px 16px;
          background: linear-gradient(to right, transparent, ${GOLD}22, ${GOLD}44, ${GOLD}22, transparent);
          border-top: 1.5px solid ${GOLD}99;
          border-bottom: 1.5px solid ${GOLD}99;
          text-align: center;
          font-family: 'Amiri', serif;
          direction: rtl;
          color: ${DARK_GREEN};
          font-size: 1.08em;
          font-weight: 700;
        }
        .surah-nameplate small {
          display: block;
          font-size: 0.6em;
          color: #6b5520;
          font-weight: 400;
          font-family: Georgia, serif;
          margin-top: 2px;
        }
        .bismillah {
          font-family: 'Amiri Quran', 'Amiri', serif;
          direction: rtl; text-align: center;
          color: ${INK}; margin: 4px 0 10px; line-height: 2;
        }
        .mushaf-frame {
          background: ${PARCHMENT};
          border: 2px solid ${GOLD}88;
          position: relative;
        }
        .mushaf-frame::before {
          content: '';
          position: absolute;
          inset: 7px;
          border: 1px solid ${GOLD}44;
          border-radius: 1px;
          pointer-events: none;
          z-index: 1;
        }

        /* ── Page flip animation ── */
        @keyframes flipNext {
          0%   { transform: perspective(900px) rotateY(0deg)   scaleX(1);    opacity: 1; }
          48%  { transform: perspective(900px) rotateY(90deg)  scaleX(0.7);  opacity: 0; }
          52%  { transform: perspective(900px) rotateY(-90deg) scaleX(0.7);  opacity: 0; }
          100% { transform: perspective(900px) rotateY(0deg)   scaleX(1);    opacity: 1; }
        }
        @keyframes flipPrev {
          0%   { transform: perspective(900px) rotateY(0deg)   scaleX(1);    opacity: 1; }
          48%  { transform: perspective(900px) rotateY(-90deg) scaleX(0.7);  opacity: 0; }
          52%  { transform: perspective(900px) rotateY(90deg)  scaleX(0.7);  opacity: 0; }
          100% { transform: perspective(900px) rotateY(0deg)   scaleX(1);    opacity: 1; }
        }
        .flip-next { animation: flipNext 0.52s cubic-bezier(.4,0,.2,1) forwards; }
        .flip-prev { animation: flipPrev 0.52s cubic-bezier(.4,0,.2,1) forwards; }

        /* ── Footer ── */
        .ctrl { 
          display:flex; align-items:center; justify-content:center;
          border-radius:50%; cursor:pointer; flex-shrink:0;
          transition: transform 0.1s, opacity 0.12s;
        }
        .ctrl:active { transform: scale(0.84); }
        .ctrl:disabled { opacity: 0.3; }
      `}</style>

      {/* ═══════════════════════════════════════════════════════════
           TAB NAV — hidden in fullscreen
          ═══════════════════════════════════════════════════════════ */}
      {!fullscreen && (
        <nav
          className="flex-none w-full z-50 border-b"
          style={{ background: DARK_GREEN, borderColor: GOLD + "44" }}
        >
          <div className="flex items-center justify-around px-1 py-1">
            {TABS.map(({ id, ar, icon: Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all"
                  style={{ color: active ? GOLD : "#5a7d6a", background: active ? "#ffffff14" : "transparent" }}
                >
                  <Icon size={16} strokeWidth={active ? 2.5 : 1.8} />
                  <span className="text-[10px] font-bold leading-none tracking-wide">{ar}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* ═══════════════════════════════════════════════════════════
           CONTENT
          ═══════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-hidden relative">

        {/* ── لوحة Dashboard ── */}
        {activeTab === "overview" && (
          <HifdhDashboardInline
            userId={userId}
            studentName={studentName}
            currentPage={currentPage}
            onNavigate={(tab) => { setActiveTab(tab); }}
          />
        )}

        {/* ══════════════════════════════════════════════════════════
             RECITATION — mushaf reader
            ══════════════════════════════════════════════════════════ */}
        {activeTab === "recitation" && (
          <div
            className="h-full flex flex-col"
            style={{ background: "linear-gradient(160deg,#1a1007 0%,#0b0d0a 100%)" }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {/* Mushaf page scroll area */}
            <div className="flex-1 overflow-y-auto px-3 pt-3 pb-1">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <div style={{ fontFamily:"'Amiri Quran','Amiri',serif", color:GOLD, fontSize:28, direction:"rtl" }}>
                    بسم الله الرحمن الرحيم
                  </div>
                  <p style={{ color:"#7a9e88", fontSize:13 }}>Loading page {currentPage}…</p>
                </div>
              ) : (
                <div
                  className={cn(
                    "mushaf-frame max-w-lg mx-auto rounded-sm shadow-2xl overflow-hidden",
                    flipDir === "next" && "flip-next",
                    flipDir === "prev" && "flip-prev"
                  )}
                >
                  {/* Page header */}
                  <div
                    className="flex items-center justify-between px-5 py-2"
                    style={{
                      background: `linear-gradient(to bottom,${GOLD}18,transparent)`,
                      borderBottom: `1px solid ${GOLD}55`,
                    }}
                  >
                    <span style={{ fontFamily:"'Amiri',serif", color:DARK_GREEN, fontSize:"0.78em", fontWeight:700, direction:"rtl" }}>
                      {firstSurah?.nameAr ?? ""}
                    </span>
                    <span style={{ fontFamily:"'Amiri',serif", color:GOLD, fontSize:"0.7em" }}>
                      {juzNum ? `الجزء ${toAr(juzNum)}` : ""}
                    </span>
                    <span style={{ fontFamily:"Georgia,serif", color:"#5a4a20", fontSize:"0.65em" }}>
                      {lastSurah?.englishName ?? ""}
                    </span>
                  </div>

                  <div className="mx-5 h-px" style={{ background:`linear-gradient(to right,transparent,${GOLD}88,transparent)` }} />

                  {/* Quran text */}
                  <div className="px-6 py-5">
                    {surahGroups.map((group, gi) => {
                      const isNewSurah    = group.ayahs[0].numberInSurah === 1;
                      const showBismillah = isNewSurah && group.surah.number !== 9 && group.surah.number !== 1;
                      return (
                        <div key={gi}>
                          {isNewSurah && (
                            <div className="surah-nameplate">
                              سورة {group.surah.name}
                              <small>{group.surah.englishName} · {group.surah.numberOfAyahs} verses</small>
                            </div>
                          )}
                          {showBismillah && (
                            <div className="bismillah" style={{ fontSize: fontSize * 0.88 }}>
                              بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ
                            </div>
                          )}
                          <p className="mushaf-text" style={{ fontSize }}>
                            {group.ayahs.map((ayah) => (
                              <span
                                key={ayah.number}
                                onClick={() => playAyah(ayah.number)}
                                className={cn(
                                  "cursor-pointer transition-all",
                                  playingAyah === ayah.number && "ayah-active"
                                )}
                              >
                                {ayah.text}{" "}
                                <span className="ayah-marker">۝{toAr(ayah.numberInSurah)}</span>{" "}
                              </span>
                            ))}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mx-5 h-px" style={{ background:`linear-gradient(to right,transparent,${GOLD}88,transparent)` }} />
                  <div className="py-2.5 text-center" style={{ fontFamily:"'Amiri',serif", color:GOLD, fontSize:"0.82em" }}>
                    ─── {toAr(currentPage)} ───
                  </div>
                </div>
              )}
            </div>

            {/* ═══════════════════════════════════════════════════════
                 ONE-LINE STATIC FOOTER with Surah selector
                ═══════════════════════════════════════════════════════ */}
            <div
              className="flex-none border-t z-50"
              style={{ background: DARK_GREEN, borderColor: GOLD + "55" }}
            >
              <div className="flex items-center gap-1.5 px-2 py-2 max-w-lg mx-auto">

                {/* Surah selector */}
                <select
                  value=""
                  onChange={(e) => {
                    const pageNum = parseInt(e.target.value, 10);
                    if (pageNum >= 1 && pageNum <= 604) setCurrentPage(pageNum);
                  }}
                  className="text-[9px] rounded-lg px-1.5 py-1.5 outline-none min-w-0 w-[72px] flex-none"
                  style={{ background: "#1e4030", color: GOLD, border: `1px solid ${GOLD}33`, fontFamily: "'Amiri',serif" }}
                >
                  <option value="" disabled>سورة</option>
                  {[
                    [1,1,"الفاتحة"],[2,2,"البقرة"],[3,50,"آل عمران"],[4,77,"النساء"],[5,106,"المائدة"],
                    [6,128,"الأنعام"],[7,151,"الأعراف"],[8,177,"الأنفال"],[9,187,"التوبة"],[10,208,"يونس"],
                    [11,221,"هود"],[12,235,"يوسف"],[13,249,"الرعد"],[14,255,"إبراهيم"],[15,262,"الحجر"],
                    [16,267,"النحل"],[17,282,"الإسراء"],[18,293,"الكهف"],[19,305,"مريم"],[20,312,"طه"],
                    [21,322,"الأنبياء"],[22,332,"الحج"],[23,342,"المؤمنون"],[24,350,"النور"],[25,359,"الفرقان"],
                    [26,367,"الشعراء"],[27,377,"النمل"],[28,385,"القصص"],[29,396,"العنكبوت"],[30,404,"الروم"],
                    [31,411,"لقمان"],[32,415,"السجدة"],[33,418,"الأحزاب"],[34,428,"سبأ"],[35,434,"فاطر"],
                    [36,440,"يس"],[37,446,"الصافات"],[38,453,"ص"],[39,458,"الزمر"],[40,467,"غافر"],
                    [41,477,"فصلت"],[42,483,"الشورى"],[43,489,"الزخرف"],[44,496,"الدخان"],[45,499,"الجاثية"],
                    [46,502,"الأحقاف"],[47,507,"محمد"],[48,511,"الفتح"],[49,515,"الحجرات"],[50,518,"ق"],
                    [51,520,"الذاريات"],[52,523,"الطور"],[53,526,"النجم"],[54,528,"القمر"],[55,531,"الرحمن"],
                    [56,534,"الواقعة"],[57,537,"الحديد"],[58,542,"المجادلة"],[59,545,"الحشر"],[60,549,"الممتحنة"],
                    [61,551,"الصف"],[62,553,"الجمعة"],[63,554,"المنافقون"],[64,556,"التغابن"],[65,558,"الطلاق"],
                    [66,560,"التحريم"],[67,562,"الملك"],[68,564,"القلم"],[69,566,"الحاقة"],[70,568,"المعارج"],
                    [71,570,"نوح"],[72,572,"الجن"],[73,574,"المزمل"],[74,575,"المدثر"],[75,577,"القيامة"],
                    [76,578,"الإنسان"],[77,580,"المرسلات"],[78,582,"النبأ"],[79,583,"النازعات"],
                    [80,585,"عبس"],[81,586,"التكوير"],[82,587,"الانفطار"],[83,587,"المطففين"],
                    [84,589,"الانشقاق"],[85,590,"البروج"],[86,591,"الطارق"],[87,591,"الأعلى"],
                    [88,592,"الغاشية"],[89,593,"الفجر"],[90,594,"البلد"],[91,595,"الشمس"],
                    [92,595,"الليل"],[93,596,"الضحى"],[94,596,"الشرح"],[95,597,"التين"],
                    [96,597,"العلق"],[97,598,"القدر"],[98,598,"البينة"],[99,599,"الزلزلة"],
                    [100,600,"العاديات"],[101,600,"القارعة"],[102,600,"التكاثر"],
                    [103,601,"العصر"],[104,601,"الهمزة"],[105,601,"الفيل"],
                    [106,602,"قريش"],[107,602,"الماعون"],[108,602,"الكوثر"],
                    [109,603,"الكافرون"],[110,603,"النصر"],[111,603,"المسد"],
                    [112,604,"الإخلاص"],[113,604,"الفلق"],[114,604,"الناس"],
                  ].map(([num, page, name]) => (
                    <option key={num as number} value={page as number}>{name as string}</option>
                  ))}
                </select>

                {/* Prev */}
                <button
                  className="ctrl w-7 h-7 flex-none"
                  style={{ background: "#1e4030" }}
                  onClick={() => navigate("prev")}
                  disabled={currentPage <= 1}
                >
                  <SkipBack size={12} color={GOLD} />
                </button>

                {/* Play / Pause */}
                <button
                  className="ctrl w-9 h-9 flex-none shadow-lg"
                  style={{ background: GOLD }}
                  onClick={togglePlay}
                >
                  {isPlaying
                    ? <Pause size={14} fill={DARK_GREEN} color={DARK_GREEN} />
                    : <Play  size={14} fill={DARK_GREEN} color={DARK_GREEN} className="ml-0.5" />
                  }
                </button>

                {/* Next */}
                <button
                  className="ctrl w-7 h-7 flex-none"
                  style={{ background: "#1e4030" }}
                  onClick={() => navigate("next")}
                  disabled={currentPage >= 604}
                >
                  <SkipForward size={12} color={GOLD} />
                </button>

                {/* Reciter */}
                <select
                  value={reciter}
                  onChange={(e) => setReciter(e.target.value)}
                  className="flex-1 text-[9px] rounded-lg px-1.5 py-1.5 outline-none min-w-0"
                  style={{ background: "#1e4030", color: GOLD, border: `1px solid ${GOLD}33`, fontFamily: "Georgia,serif" }}
                >
                  {RECITERS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>

                {/* Font – */}
                <button
                  className="ctrl w-6 h-6 flex-none"
                  style={{ background: "#1e4030" }}
                  onClick={() => setFontSize(v => Math.max(18, v - 2))}
                >
                  <Minus size={10} color={GOLD} />
                </button>

                {/* Font + */}
                <button
                  className="ctrl w-6 h-6 flex-none"
                  style={{ background: "#1e4030" }}
                  onClick={() => setFontSize(v => Math.min(42, v + 2))}
                >
                  <Plus size={10} color={GOLD} />
                </button>

                {/* Mic — AI Evaluation */}
                <button
                  className="ctrl w-7 h-7 flex-none"
                  style={{ background: isRecording ? "#dc2626" : "#1e4030" }}
                  onClick={isRecording ? stopRecording : startRecording}
                >
                  {isRecording ? <MicOff size={11} color="#fff" /> : <Mic size={11} color={GOLD} />}
                </button>
                {isRecording && (
                  <span className="text-[9px] font-bold" style={{ color: "#dc2626" }}>{fmtTime(recTime)}</span>
                )}

                {/* Fullscreen toggle */}
                <button
                  className="ctrl w-6 h-6 flex-none"
                  style={{ background: "#1e4030" }}
                  onClick={() => setFullscreen(f => !f)}
                >
                  {fullscreen
                    ? <Minimize2 size={10} color={GOLD} />
                    : <Maximize2 size={10} color={GOLD} />
                  }
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Memorization ── */}
        {activeTab === "memorization" && (
          <div className="h-full overflow-y-auto"><HifdhMemorization /></div>
        )}

        {/* ── Exercise ── */}
        {activeTab === "exercise" && (
          <div className="h-full overflow-y-auto"><HifdhExercise /></div>
        )}

        {/* ── Test ── */}
        {activeTab === "test" && (
          <div className="h-full overflow-y-auto"><HifdhTest /></div>
        )}
      </div>
    </div>
  );
}
