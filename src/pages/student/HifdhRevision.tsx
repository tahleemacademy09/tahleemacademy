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
  { id: "overview" as Tab, ar: "لوحة", icon: BarChart3 },
  { id: "recitation" as Tab, ar: "تلاوة", icon: Mic },
  { id: "memorization" as Tab, ar: "حفظ", icon: Brain },
  { id: "exercise" as Tab, ar: "تمرين", icon: Target },
  { id: "test" as Tab, ar: "اختبار", icon: FileCheck },
];

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

function toAr(n: number) {
  return String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);
}

const audioUrl = (surah: number, ayah: number, reciter: string) => {
  const s = String(surah).padStart(3, "0");
  const a = String(ayah).padStart(3, "0");
  return `https://cdn.islamic.network/quran/audio/128/${reciter}/${s}${a}.mp3`;
};

export default function HifdhRevision() {
  // ── State ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("overview");  const [userId, setUserId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState("Student");
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageData, setPageData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [playingAyah, setPlayingAyah] = useState(0);
  const [reciter, setReciter] = useState("ar.alafasy");
  const [isPlaying, setIsPlaying] = useState(false);
  const [fontSize, setFontSize] = useState(28);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // ── Refs ────────────────────────────────────────────────────────────────
  const audioRef = useRef<HTMLAudioElement>(null);
  const playingRef = useRef(0);
  const pageDataRef = useRef<any>(null);
  const verseRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // ── Persistence ────────────────────────────────────────────────────────
  useEffect(() => {
    const tab = localStorage.getItem("hifdh_tab");
    if (tab) setActiveTab(tab as Tab);
    const page = localStorage.getItem("hifdh_page");
    if (page) setCurrentPage(parseInt(page, 10));
    const rec = localStorage.getItem("hifdh_reciter");
    if (rec) setReciter(rec);
    const font = localStorage.getItem("hifdh_font");
    if (font) setFontSize(parseInt(font, 10));
  }, []);

  useEffect(() => { localStorage.setItem("hifdh_tab", activeTab); }, [activeTab]);
  useEffect(() => { localStorage.setItem("hifdh_page", String(currentPage)); }, [currentPage]);
  useEffect(() => { localStorage.setItem("hifdh_reciter", reciter); }, [reciter]);
  useEffect(() => { localStorage.setItem("hifdh_font", String(fontSize)); }, [fontSize]);

  useEffect(() => { pageDataRef.current = pageData; }, [pageData]);

  // Load user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      setUserId(data.user.id);
      supabase.from("profiles").select("full_name").eq("id", data.user.id).single()
        .then(({  p }) => { if (p?.full_name) setStudentName(p.full_name); });
    });
  }, []);

  // ── Fetch Page (Promise Chaining - NO ASYNC/AWAIT) ──────────────────────  const fetchPage = useCallback((page: number) => {
    setLoading(true);
    setPageData(null);
    setIsTransitioning(true);
    
    fetch(`https://api.alquran.cloud/v1/page/${page}/ar.uthmani`)
      .then((res) => res.json())
      .then((json) => {
        if (json.code === 200) setPageData(json.data);
      })
      .catch((error) => {
        console.error("Fetch error:", error);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => { fetchPage(currentPage); }, [currentPage, fetchPage]);

  useEffect(() => {
    if (isTransitioning) {
      const t = setTimeout(() => setIsTransitioning(false), 300);
      return () => clearTimeout(t);
    }
  }, [isTransitioning, currentPage]);

  // ── FIXED AUDIO PLAYBACK ────────────────────────────────────────────────
  const playAyah = useCallback((num: number) => {
    const pd = pageDataRef.current;
    if (!pd || !pd.ayahs) return;
    const ayah = pd.ayahs.find((a: any) => a.numberInSurah === num);
    if (!ayah) return;

    playingRef.current = num;
    setPlayingAyah(num);
    
    const url = audioUrl(ayah.surah.number, num, reciter);
    console.log("🎵 Audio URL:", url);

    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.load();
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(err => {
          console.warn("⚠️ Play blocked:", err.name);
          setIsPlaying(false);
        });
    }  }, [reciter]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      const target = playingAyah > 0 ? playingAyah : 1;
      playAyah(target);
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const onEnded = () => {
      const pd = pageDataRef.current;
      if (!pd || !pd.ayahs) return;
      const next = playingRef.current + 1;
      if (next <= pd.ayahs[pd.ayahs.length - 1].numberInSurah) {
        playAyah(next);
      } else {
        setIsPlaying(false);
      }
    };

    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
    };
  }, [playAyah]);

  // ── RTL SWIPE LOGIC ─────────────────────────────────────────────────────
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diffX = touchStartX.current - e.changedTouches[0].clientX;
    const diffY = touchStartY.current - e.changedTouches[0].clientY;    
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
      if (diffX > 0) {
        setCurrentPage(p => Math.min(604, p + 1));
      } else {
        setCurrentPage(p => Math.max(1, p - 1));
      }
    }
  };

  const surahInfo = pageData?.ayahs?.[0]?.surah || {};
  const pageAyahs = pageData?.ayahs || [];

  return (
    <div className="relative h-[100dvh] bg-[#faf6ee] flex flex-col overflow-hidden">
      <audio ref={audioRef} playsInline preload="metadata" crossOrigin="anonymous" style={{ display: "none" }} />

      <style>{`
        .quran-text { 
          font-family: 'Amiri Quran', 'Scheherazade New', serif; 
          line-height: 2.2; 
          text-align: justify; 
          text-indent: 0;
          direction: rtl;
        }
        .ayah-marker { font-family: 'Amiri', serif; color: ${GOLD}; font-size: 0.85em; margin: 0 4px; }
        .verse-active { background: #fffbeb; border-radius: 8px; padding: 2px 4px; box-shadow: 0 0 0 2px ${GOLD}33; }
        @keyframes pageFade { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .page-enter { animation: pageFade 0.3s ease-out forwards; }
      `}</style>

      {/* ── COMPACT HEADER (Hidden in Recitation) ───────────────────────── */}
      {activeTab !== "recitation" && (
        <nav className="sticky top-0 z-50 w-full bg-white border-b border-gray-100 py-1.5">
          <div className="flex items-center justify-around px-2">
            {TABS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button key={item.id} onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all",
                    isActive ? "text-[#0f2d1f] bg-gray-50" : "text-gray-400"
                  )}>
                  <item.icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                  <span className="text-[10px] font-semibold leading-none">{item.ar}</span>
                </button>
              );
            })}
          </div>
        </nav>      )}

      {/* ── CONTENT AREA ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden relative">
        
        {activeTab === "overview" && (
          <div className="h-full overflow-y-auto">
            <HifdhDashboard userId={userId} studentName={studentName} onNavigate={setActiveTab} activeTab={activeTab} />
          </div>
        )}

        {activeTab === "recitation" && (
          <div 
            className="h-full flex flex-col bg-[#faf6ee]"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="flex-1 overflow-y-auto px-4 py-6 pb-24 scroll-smooth">
              {loading ? (
                <div className="flex items-center justify-center h-full text-[#7a9e88]">Loading Page {currentPage}...</div>
              ) : (
                <div className={cn("max-w-2xl mx-auto bg-white rounded-2xl p-6 shadow-sm min-h-full", isTransitioning && "page-enter")}>
                  <div className="quran-text text-[#2d4a35]" style={{ fontSize }}>
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

            {/* ── PERMANENT FOOTER ──────────────────────────────────────── */}
            <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-100 p-2.5 z-40">
              <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-[#0f2d1f] min-w-[50px] truncate">
                  {surahInfo.nameAr || "القرآن"} <span className="text-gray-400">{currentPage}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); setCurrentPage(p => Math.max(1, p - 1)); }} 
                    className="p-1.5 rounded-full bg-gray-100 active:scale-95 transition">
                    <SkipBack size={16} className="text-[#0f2d1f]" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} 
                    className="w-9 h-9 rounded-full bg-[#0f2d1f] flex items-center justify-center active:scale-95 transition shadow-md">
                    {isPlaying ? <Pause size={16} fill="#fff" /> : <Play size={16} fill="#fff" className="ml-0.5" />}                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setCurrentPage(p => Math.min(604, p + 1)); }} 
                    className="p-1.5 rounded-full bg-gray-100 active:scale-95 transition">
                    <SkipForward size={16} className="text-[#0f2d1f]" />
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <select value={reciter} onChange={(e) => setReciter(e.target.value)}
                    className="text-[10px] bg-gray-50 border border-gray-200 rounded px-1.5 py-1 outline-none max-w-[80px] truncate" 
                    onClick={(e) => e.stopPropagation()}>
                    {RECITERS.map((r) => <option key={r.id} value={r.id}>{r.name.split(" ")[0]}</option>)}
                  </select>
                  <button onClick={(e) => { e.stopPropagation(); setFontSize((v) => Math.max(20, v - 2)); }} 
                    className="p-1 rounded bg-gray-100 active:scale-95">
                    <Minus size={12} className="text-[#0f2d1f]" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setFontSize((v) => Math.min(40, v + 2)); }} 
                    className="p-1 rounded bg-gray-100 active:scale-95">
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