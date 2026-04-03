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
  { id: "overview", ar: "لوحة", icon: BarChart3 },
  { id: "recitation", ar: "تلاوة", icon: Mic },
  { id: "memorization", ar: "حفظ", icon: Brain },
  { id: "exercise", ar: "تمرين", icon: Target },
  { id: "test", ar: "اختبار", icon: FileCheck }
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
  { id: "ar.abdullahbasfar", name: "Abdullah Basfar" }
];

const G = "#0f2d1f";
const GOLD = "#c9a84c";

function toAr(n) {
  return String(n).replace(/[0-9]/g, function(d) { return "٠١٢٣٤٥٦٧٨٩"[d]; });
}

function audioUrl(surah, ayah, reciter) {
  var s = String(surah).padStart(3, "0");
  var a = String(ayah).padStart(3, "0");
  return "https://cdn.islamic.network/quran/audio/128/" + reciter + "/" + s + a + ".mp3";
}

export default function HifdhRevision() {
  var activeTab = useState("overview");
  var setActiveTab = activeTab[1];  activeTab = activeTab[0];
  
  var userIdState = useState(null);
  var setUserId = userIdState[1];
  var userId = userIdState[0];
  
  var studentNameState = useState("Student");
  var setStudentName = studentNameState[1];
  var studentName = studentNameState[0];
  
  var currentPageState = useState(1);
  var setCurrentPage = currentPageState[1];
  var currentPage = currentPageState[0];
  
  var pageDataState = useState(null);
  var setPageData = pageDataState[1];
  var pageData = pageDataState[0];
  
  var loadingState = useState(false);
  var setLoading = loadingState[1];
  var loading = loadingState[0];
  
  var playingAyahState = useState(0);
  var setPlayingAyah = playingAyahState[1];
  var playingAyah = playingAyahState[0];
  
  var reciterState = useState("ar.alafasy");
  var setReciter = reciterState[1];
  var reciter = reciterState[0];
  
  var isPlayingState = useState(false);
  var setIsPlaying = isPlayingState[1];
  var isPlaying = isPlayingState[0];
  
  var fontSizeState = useState(28);
  var setFontSize = fontSizeState[1];
  var fontSize = fontSizeState[0];
  
  var isTransitioningState = useState(false);
  var setIsTransitioning = isTransitioningState[1];
  var isTransitioning = isTransitioningState[0];

  var audioRef = useRef(null);
  var playingRef = useRef(0);
  var pageDataRef = useRef(null);
  var verseRefs = useRef({});
  var touchStartX = useRef(0);
  var touchStartY = useRef(0);

  // Persistence
  useEffect(function() {
    var tab = localStorage.getItem("hifdh_tab");
    if (tab) setActiveTab(tab);
    var page = localStorage.getItem("hifdh_page");
    if (page) setCurrentPage(parseInt(page, 10));
    var rec = localStorage.getItem("hifdh_reciter");
    if (rec) setReciter(rec);
    var font = localStorage.getItem("hifdh_font");
    if (font) setFontSize(parseInt(font, 10));
  }, []);

  useEffect(function() { localStorage.setItem("hifdh_tab", activeTab); }, [activeTab]);
  useEffect(function() { localStorage.setItem("hifdh_page", String(currentPage)); }, [currentPage]);
  useEffect(function() { localStorage.setItem("hifdh_reciter", reciter); }, [reciter]);
  useEffect(function() { localStorage.setItem("hifdh_font", String(fontSize)); }, [fontSize]);

  useEffect(function() { pageDataRef.current = pageData; }, [pageData]);

  // Load user
  useEffect(function() {
    supabase.auth.getUser().then(function(result) {
      var data = result.data;
      if (!data || !data.user) return;
      setUserId(data.user.id);
      supabase.from("profiles").select("full_name").eq("id", data.user.id).single()
        .then(function(res) {
          var p = res.data;
          if (p && p.full_name) setStudentName(p.full_name);
        });
    });
  }, []);

  // Fetch Page
  var fetchPage = useCallback(function(page) {
    setLoading(true);
    setPageData(null);
    setIsTransitioning(true);
    
    fetch("https://api.alquran.cloud/v1/page/" + page + "/ar.uthmani")
      .then(function(res) {
        return res.json();
      })
      .then(function(json) {
        if (json && json.code === 200) {
          setPageData(json.data);
        }
        setLoading(false);
      })
      .catch(function(error) {
        console.error("Fetch error:", error);
        setLoading(false);
      });
  }, []);

  useEffect(function() { fetchPage(currentPage); }, [currentPage, fetchPage]);

  useEffect(function() {
    if (isTransitioning) {
      var t = setTimeout(function() { setIsTransitioning(false); }, 300);
      return function() { clearTimeout(t); };
    }
  }, [isTransitioning, currentPage]);

  // Audio Playback
  var playAyah = useCallback(function(num) {
    var pd = pageDataRef.current;
    if (!pd || !pd.ayahs) return;
    
    var ayah = null;
    for (var i = 0; i < pd.ayahs.length; i++) {
      if (pd.ayahs[i].numberInSurah === num) {
        ayah = pd.ayahs[i];
        break;
      }
    }
    if (!ayah) return;

    playingRef.current = num;
    setPlayingAyah(num);
    
    var url = audioUrl(ayah.surah.number, num, reciter);
    console.log("🎵 Audio URL:", url);

    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.load();
      audioRef.current.play()
        .then(function() { setIsPlaying(true); })
        .catch(function(err) {
          console.warn("⚠️ Play blocked:", err.name);
          setIsPlaying(false);
        });
    }
  }, [reciter]);

  var togglePlay = function() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      var target = playingAyah > 0 ? playingAyah : 1;
      playAyah(target);
    }
  };

  useEffect(function() {
    var audio = audioRef.current;
    if (!audio) return;
    
    var onEnded = function() {
      var pd = pageDataRef.current;
      if (!pd || !pd.ayahs) return;
      var next = playingRef.current + 1;
      if (next <= pd.ayahs[pd.ayahs.length - 1].numberInSurah) {
        playAyah(next);
      } else {
        setIsPlaying(false);
      }
    };

    var onPause = function() { setIsPlaying(false); };
    var onPlay = function() { setIsPlaying(true); };

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    return function() {
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
    };
  }, [playAyah]);

  // Swipe Logic
  var handleTouchStart = function(e) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  var handleTouchEnd = function(e) {
    var diffX = touchStartX.current - e.changedTouches[0].clientX;
    var diffY = touchStartY.current - e.changedTouches[0].clientY;
    
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
      if (diffX > 0) {
        setCurrentPage(function(p) { return Math.min(604, p + 1); });
      } else {
        setCurrentPage(function(p) { return Math.max(1, p - 1); });
      }
    }
  };

  var surahInfo = pageData && pageData.ayahs && pageData.ayahs[0] ? pageData.ayahs[0].surah : {};
  var pageAyahs = pageData ? pageData.ayahs : [];

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

      {/* Compact Header */}
      {activeTab !== "recitation" && (
        <nav className="sticky top-0 z-50 w-full bg-white border-b border-gray-100 py-1.5">
          <div className="flex items-center justify-around px-2">
            {TABS.map(function(item) {
              var isActive = activeTab === item.id;
              return (
                <button key={item.id} onClick={function() { setActiveTab(item.id); }}
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
        </nav>
      )}

      {/* Content Area */}
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
                    {pageAyahs.map(function(ayah) {
                      return (
                        <span key={ayah.numberInSurah} ref={function(el) { verseRefs.current[ayah.numberInSurah] = el; }}
                          onClick={function(e) { e.stopPropagation(); playAyah(ayah.numberInSurah); }}
                          className={cn("cursor-pointer transition-all", playingAyah === ayah.numberInSurah && "verse-active")}>
                          {ayah.text} <span className="ayah-marker">۝{toAr(ayah.numberInSurah)}</span>{" "}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Permanent Footer */}
            <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-100 p-2.5 z-40">
              <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-[#0f2d1f] min-w-[50px] truncate">
                  {surahInfo && surahInfo.nameAr ? surahInfo.nameAr : "القرآن"} <span className="text-gray-400">{currentPage}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button onClick={function(e) { e.stopPropagation(); setCurrentPage(function(p) { return Math.max(1, p - 1); }); }} 
                    className="p-1.5 rounded-full bg-gray-100 active:scale-95 transition">
                    <SkipBack size={16} className="text-[#0f2d1f]" />
                  </button>
                  <button onClick={function(e) { e.stopPropagation(); togglePlay(); }} 
                    className="w-9 h-9 rounded-full bg-[#0f2d1f] flex items-center justify-center active:scale-95 transition shadow-md">
                    {isPlaying ? <Pause size={16} fill="#fff" /> : <Play size={16} fill="#fff" className="ml-0.5" />}
                  </button>
                  <button onClick={function(e) { e.stopPropagation(); setCurrentPage(function(p) { return Math.min(604, p + 1); }); }} 
                    className="p-1.5 rounded-full bg-gray-100 active:scale-95 transition">
                    <SkipForward size={16} className="text-[#0f2d1f]" />
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <select value={reciter} onChange={function(e) { setReciter(e.target.value); }}
                    className="text-[10px] bg-gray-50 border border-gray-200 rounded px-1.5 py-1 outline-none max-w-[80px] truncate" 
                    onClick={function(e) { e.stopPropagation(); }}>
                    {RECITERS.map(function(r) { return <option key={r.id} value={r.id}>{r.name.split(" ")[0]}</option>; })}
                  </select>
                  <button onClick={function(e) { e.stopPropagation(); setFontSize(function(v) { return Math.max(20, v - 2); }); }} 
                    className="p-1 rounded bg-gray-100 active:scale-95">
                    <Minus size={12} className="text-[#0f2d1f]" />
                  </button>
                  <button onClick={function(e) { e.stopPropagation(); setFontSize(function(v) { return Math.min(40, v + 2); }); }} 
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
