import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Mic, Brain, Target, FileCheck, Play, Pause, SkipBack, SkipForward, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

// Import your existing components
import HifdhDashboard from "@/components/hifdh/HifdhDashboard";
import HifdhMemorization from "@/components/hifdh/HifdhMemorization";
import HifdhExercise from "@/components/hifdh/HifdhExercise";
import HifdhTest from "@/components/hifdh/HifdhTest";

type Tab = "overview" | "recitation" | "memorization" | "exercise" | "test";

const TABS = [
  { id: "overview" as Tab, en: "Overview", ar: "لوحة", icon: BarChart3 },
  { id: "recitation" as Tab, en: "Recitation", ar: "تلاوة", icon: Mic },
  { id: "memorization" as Tab, en: "Memorization", ar: "حفظ", icon: Brain },
  { id: "exercise" as Tab, en: "Exercise", ar: "تمرين", icon: Target },
  { id: "test" as Tab, en: "Test", ar: "اختبار", icon: FileCheck },
];

// Expanded popular reciters
const RECITERS = [
  { id: "ar.alafasy", name: "Mishary Rashid Alafasy" },
  { id: "ar.abdurrahmaansudais", name: "Abdurrahman As-Sudais" },
  { id: "ar.husary", name: "Mahmoud Khalil Al-Husary" },
  { id: "ar.minshawi", name: "Mohamed Siddiq Al-Minshawi" },
  { id: "ar.shaatri", name: "Abu Bakr Ash-Shaatree" },
  { id: "ar.abdulsamad", name: "Abdul Basit Abdul Samad" },
  { id: "ar.muhammadjibreel", name: "Muhammad Jibreel" },
  { id: "ar.haniarrifai", name: "Hani Ar-Rifai" },
  { id: "ar.maaboramadan", name: "Maher Al Muaiqly" },
  { id: "ar.abdullahbasfar", name: "Abdullah Basfar" },
];

const G = "#0f2d1f";
const GOLD = "#c9a84c";
const BG = "#faf6ee";

function toAr(n: number) {
  return String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);
}

// Audio URL Builder
const audioUrl = (surah: number, ayah: number, reciter: string) => {
  const s = String(surah).padStart(3, "0");
  const a = String(ayah).padStart(3, "0");
  return `https://cdn.islamic.network/quran/audio/128/${reciter}/${s}${a}.mp3`;
};
export default function HifdhRevision() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [userId, setUserId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState("Student");
  
  // Header visibility (optional auto-hide)
  const [tabsVisible, setTabsVisible] = useState(true);
  const tabTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Recitation state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageData, setPageData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [playingAyah, setPlayingAyah] = useState(0);
  const [reciter, setReciter] = useState("ar.alafasy");
  const [isPlaying, setIsPlaying] = useState(false);
  const [fontSize, setFontSize] = useState(28);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playingRef = useRef(0);
  const pageDataRef = useRef<any>(null);
  const verseRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const touchStartX = useRef(0);

  useEffect(() => { pageDataRef.current = pageData; }, [pageData]);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  // Load user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      setUserId(data.user.id);
      supabase.from("profiles").select("full_name").eq("id", data.user.id).single()
        .then(({ data: p }) => { if (p?.full_name) setStudentName(p.full_name); });
    });
  }, []);

  // Header auto-hide (optional)
  const resetTabTimer = useCallback(() => {
    setTabsVisible(true);
    clearTimeout(tabTimerRef.current);
    tabTimerRef.current = setTimeout(() => setTabsVisible(false), 3000);
  }, []);

  useEffect(() => {
    resetTabTimer();
    const events = ["touchstart", "scroll", "mousemove", "keydown", "click"];
    const handler = () => resetTabTimer();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      clearTimeout(tabTimerRef.current);
    };
  }, [resetTabTimer]);

  // ── FIXED AUDIO PLAYBACK LOGIC ──────────────────────────────────────────
  const stopAll = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    playingRef.current = 0;
    setPlayingAyah(0);
    setIsPlaying(false);
  }, []);

  const fetchPage = useCallback(async (page: number) => {
    setLoading(true);
    setPageData(null);
    stopAll();
    try {
      const res = await fetch(`https://api.alquran.cloud/v1/page/${page}/ar.uthmani`);
      const json = await res.json();
      if (json.code === 200) setPageData(json.data);
    } catch { /* silent */ }
    setLoading(false);
  }, [stopAll]);

  useEffect(() => { fetchPage(currentPage); }, [currentPage, fetchPage]);

  const playAyah = useCallback((num: number) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const pd = pageDataRef.current;
    if (!pd || !pd.ayahs) return;
    const ayah = pd.ayahs.find((a: any) => a.numberInSurah === num);
    if (!ayah) return;

    playingRef.current = num;
    setPlayingAyah(num);
    setIsPlaying(true);

    const audio = new Audio();
    audio.src = audioUrl(ayah.surah.number, num, reciter);
    audio.preload = "auto";
    audioRef.current = audio;
    // Proper promise handling for browser autoplay policies
    audio.play()
      .then(() => setIsPlaying(true))
      .catch((err) => {
        console.warn("Audio play failed:", err.name, err.message);
        setIsPlaying(false);
      });

    audio.onended = () => {
      const next = num + 1;
      if (next <= pd.ayahs[pd.ayahs.length - 1].numberInSurah) {
        playAyah(next);
      } else {
        setIsPlaying(false);
      }
    };

    audio.onerror = () => {
      console.error("Audio failed to load. Check network or reciter availability.");
      setIsPlaying(false);
    };
  }, [reciter]);

  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      const target = playingAyah > 0 ? playingAyah : 1;
      playAyah(target);
    }
  };

  const nextAyah = () => {
    const pd = pageDataRef.current;
    if (!pd || !pd.ayahs) return;
    const next = playingAyah > 0 ? playingAyah + 1 : 1;
    if (next <= pd.ayahs[pd.ayahs.length - 1].numberInSurah) playAyah(next);
  };

  const prevAyah = () => {
    const prev = playingAyah > 1 ? playingAyah - 1 : 1;
    playAyah(prev);
  };

  // Swipe handlers for ayah navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) nextAyah();
      else prevAyah();
    }
  };

  const surahInfo = pageData?.ayahs?.[0]?.surah || {};
  const pageAyahs = pageData?.ayahs || [];

  return (
    <div className="relative h-[100dvh] bg-[#faf6ee] flex flex-col overflow-hidden" onClick={resetTabTimer}>
      <style>{`
        .quran-text { font-family: 'Amiri Quran', 'Scheherazade New', serif; line-height: 2.4; }
        .ayah-marker { font-family: 'Amiri', serif; color: ${GOLD}; font-size: 0.85em; margin: 0 4px; }
        .verse-active { background: #fffbeb; border-radius: 8px; padding: 2px 4px; box-shadow: 0 0 0 2px ${GOLD}33; }
      `}</style>

      {/* ── STICKY TAB BAR ──────────────────────────────────────────────── */}
      <nav className={cn(
        "sticky top-0 z-50 w-full bg-white border-b border-gray-100 shadow-sm transition-all duration-300 ease-out",
        tabsVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-full pointer-events-none"
      )}>
        <div className="flex items-stretch justify-between w-full px-0 py-2">
          {TABS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button key={item.id} onClick={() => { setActiveTab(item.id); resetTabTimer(); }}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 py-2.5 gap-0.5 transition-all",
                  isActive ? "text-[#0f2d1f]" : "text-gray-400 hover:text-gray-600"
                )}>
                <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[11px] font-semibold leading-tight">{item.en}</span>
                <span className="text-[9px] text-gray-400 leading-tight">{item.ar}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── CONTENT AREA ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden relative">
        
        {activeTab === "overview" && (
          <div className="h-full overflow-y-auto">
            <HifdhDashboard userId={userId} studentName={studentName} onNavigate={setActiveTab} activeTab={activeTab} />
          </div>        )}

        {activeTab === "recitation" && (
          <div 
            className="h-full flex flex-col"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Quran Scroll Area (pb-28 prevents overlap with permanent footer) */}
            <div className="flex-1 overflow-y-auto px-4 py-6 pb-28 scroll-smooth">
              {loading ? (
                <div className="flex items-center justify-center h-full text-[#7a9e88]">Loading Page {currentPage}...</div>
              ) : (
                <div className="max-w-2xl mx-auto bg-white rounded-2xl p-6 shadow-sm min-h-full">
                  <div className="quran-text text-center text-[#2d4a35]" style={{ fontSize, lineHeight: 2.6, direction: "rtl" }}>
                    {pageAyahs.map((ayah: any) => (
                      <span key={ayah.numberInSurah} ref={(el) => { verseRefs.current[ayah.numberInSurah] = el; }}
                        onClick={(e) => { e.stopPropagation(); playAyah(ayah.numberInSurah); }}
                        className={cn("cursor-pointer transition-all", playingAyah === ayah.numberInSurah && "verse-active")}>
                        {ayah.text} <span className="ayah-marker">۝{toAr(ayah.numberInSurah)}</span>{" "}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── PERMANENT FOOTER CONTROLS ─────────────────────────────── */}
            <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-100 p-3 z-40">
              <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-[#0f2d1f] min-w-[60px] truncate">
                  {surahInfo.nameAr || "القرآن"} <span className="text-gray-400">Pg {currentPage}</span>
                </div>

                <div className="flex items-center gap-3">
                  <button onClick={(e) => { e.stopPropagation(); prevAyah(); }} className="p-2 rounded-full bg-gray-100 active:scale-95 transition">
                    <SkipBack size={18} className="text-[#0f2d1f]" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} 
                    className="w-10 h-10 rounded-full bg-[#0f2d1f] flex items-center justify-center active:scale-95 transition shadow-md">
                    {isPlaying ? <Pause size={18} fill="#fff" /> : <Play size={18} fill="#fff" className="ml-0.5" />}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); nextAyah(); }} className="p-2 rounded-full bg-gray-100 active:scale-95 transition">
                    <SkipForward size={18} className="text-[#0f2d1f]" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <select value={reciter} onChange={(e) => setReciter(e.target.value)}
                    className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 outline-none max-w-[100px] truncate" onClick={(e) => e.stopPropagation()}>                    {RECITERS.map((r) => <option key={r.id} value={r.id}>{r.name.split(" ")[0]}</option>)}
                  </select>
                  <button onClick={(e) => { e.stopPropagation(); setFontSize((v) => Math.max(20, v - 2)); }} className="p-1.5 rounded bg-gray-100 active:scale-95 flex items-center gap-1">
                    <Minus size={12} className="text-[#0f2d1f]" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setFontSize((v) => Math.min(40, v + 2)); }} className="p-1.5 rounded bg-gray-100 active:scale-95 flex items-center gap-1">
                    <Plus size={12} className="text-[#0f2d1f]" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "memorization" && (
          <div className="h-full overflow-y-auto">
            <HifdhMemorization />
          </div>
        )}
        {activeTab === "exercise" && (
          <div className="h-full overflow-y-auto">
            <HifdhExercise />
          </div>
        )}
        {activeTab === "test" && (
          <div className="h-full overflow-y-auto">
            <HifdhTest />
          </div>
        )}
      </div>
    </div>
  );
}