import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Mic, Brain, Target, FileCheck, Play, Pause, SkipBack, SkipForward, Type, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tab Configuration ──────────────────────────────────────────────────────
type Tab = "overview" | "recitation" | "memorization" | "exercise" | "test";

const TABS = [
  { id: "overview" as Tab, en: "Overview", ar: "لوحة", icon: BarChart3 },
  { id: "recitation" as Tab, en: "Recitation", ar: "تلاوة", icon: Mic },
  { id: "memorization" as Tab, en: "Memorization", ar: "حفظ", icon: Brain },
  { id: "exercise" as Tab, en: "Exercise", ar: "تمرين", icon: Target },
  { id: "test" as Tab, en: "Test", ar: "اختبار", icon: FileCheck },
];

// ── Reciter List ───────────────────────────────────────────────────────────
const RECITERS = [
  { id: "ar.alafasy", name: "Mishary Rashid Alafasy" },
  { id: "ar.abdurrahmaansudais", name: "Abdurrahman As-Sudais" },
  { id: "ar.husary", name: "Mahmoud Khalil Al-Husary" },
  { id: "ar.minshawi", name: "Mohamed Siddiq Al-Minshawi" },
  { id: "ar.shaatri", name: "Abu Bakr Ash-Shaatree" },
];

// ── Theme Colors ───────────────────────────────────────────────────────────
const G = "#0f2d1f";
const GOLD = "#c9a84c";
const BG = "#faf6ee";

// ── Helper: Arabic Numerals ────────────────────────────────────────────────
function toAr(n: number) {
  return String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);
}

// ── Audio URL Builder (matches your existing surahData.ts) ─────────────────
const audioUrl = (surah: number, ayah: number, reciter: string) => {
  const s = String(surah).padStart(3, "0");
  const a = String(ayah).padStart(3, "0");
  return `https://cdn.islamic.network/quran/audio/128/${reciter}/${s}${a}.mp3`;
};

export default function HifdhRevision() {
  // ── State ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [userId, setUserId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState("Student");
  
  // Visibility
  const [tabsVisible, setTabsVisible] = useState(true);  const [controlsVisible, setControlsVisible] = useState(true);

  // Recitation
  const [currentPage, setCurrentPage] = useState(1);
  const [pageData, setPageData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [playingAyah, setPlayingAyah] = useState(0);
  const [reciter, setReciter] = useState("ar.alafasy");
  const [isPlaying, setIsPlaying] = useState(false);
  const [fontSize, setFontSize] = useState(28);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playingRef = useRef(0);
  const pageDataRef = useRef<any>(null);
  const verseRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const tabTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const controlTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Effects ──────────────────────────────────────────────────────────────
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

  // ── Auto-Hide Logic ──────────────────────────────────────────────────────
  const resetTabTimer = useCallback(() => {
    setTabsVisible(true);
    clearTimeout(tabTimerRef.current);
    tabTimerRef.current = setTimeout(() => setTabsVisible(false), 3000);
  }, []);

  const resetControlTimer = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(controlTimerRef.current);
    controlTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
  }, []);

  const revealAll = useCallback(() => {
    resetTabTimer();
    resetControlTimer();
  }, [resetTabTimer, resetControlTimer]);
  useEffect(() => {
    revealAll();
    const events = ["touchstart", "scroll", "mousemove", "keydown", "click"];
    const handler = () => revealAll();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      clearTimeout(tabTimerRef.current);
      clearTimeout(controlTimerRef.current);
    };
  }, [revealAll]);

  // ── Recitation Logic ─────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
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
    audioRef.current?.pause();
    const pd = pageDataRef.current;
    if (!pd || !pd.ayahs) return;
    const ayah = pd.ayahs.find((a: any) => a.numberInSurah === num);
    if (!ayah) { stopAll(); return; }

    playingRef.current = num;
    setPlayingAyah(num);
    setIsPlaying(true);
    resetControlTimer();

    const audio = new Audio(audioUrl(ayah.surah.number, num, reciter));
    audioRef.current = audio;    audio.play().catch(stopAll);
    audio.onended = () => {
      const next = num + 1;
      if (next <= pd.ayahs[pd.ayahs.length - 1].numberInSurah) playAyah(next);
      else stopAll();
    };
  }, [stopAll, reciter, resetControlTimer]);

  const togglePlay = () => (isPlaying ? stopAll() : playAyah(playingAyah || 1));
  const nextAyah = () => playingAyah < (pageData?.ayahs?.length || 0) && playAyah(playingAyah + 1);
  const prevAyah = () => playingAyah > 1 && playAyah(playingAyah - 1);

  const surahInfo = pageData?.ayahs?.[0]?.surah || {};
  const pageAyahs = pageData?.ayahs || [];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="relative h-[100dvh] bg-[#faf6ee] flex flex-col overflow-hidden" onClick={revealAll}>
      <style>{`
        .quran-text { font-family: 'Amiri Quran', 'Scheherazade New', serif; line-height: 2.4; }
        .ayah-marker { font-family: 'Amiri', serif; color: ${GOLD}; font-size: 0.85em; margin: 0 4px; }
        .verse-active { background: #fffbeb; border-radius: 8px; padding: 2px 4px; box-shadow: 0 0 0 2px ${GOLD}33; }
      `}</style>

      {/* ── AUTO-HIDING TAB BAR ─────────────────────────────────────────── */}
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
        {activeTab === "overview" && (          <div className="h-full overflow-y-auto p-4">
            <div className="text-center text-gray-500 mt-20">
              <BarChart3 size={48} className="mx-auto mb-4 opacity-50" />
              <p>Dashboard overview loads here</p>
            </div>
          </div>
        )}

        {activeTab === "recitation" && (
          <div className="h-full flex flex-col">
            {/* Quran Text Container */}
            <div className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth">
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

            {/* ── AUTO-HIDING PLAYBACK CONTROLS ─────────────────────────── */}
            <div className={cn(
              "absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-100 p-3 transition-all duration-300 ease-out z-40",
              controlsVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-full pointer-events-none"
            )}>
              <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-[#0f2d1f] min-w-[60px]">
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
                  </button>                </div>

                <div className="flex items-center gap-2">
                  <select value={reciter} onChange={(e) => { setReciter(e.target.value); resetControlTimer(); }}
                    className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 outline-none" onClick={(e) => e.stopPropagation()}>
                    {RECITERS.map((r) => <option key={r.id} value={r.id}>{r.name.split(" ")[0]}</option>)}
                  </select>
                  <button onClick={(e) => { e.stopPropagation(); setFontSize((v) => Math.max(20, v - 2)); resetControlTimer(); }} className="p-1.5 rounded bg-gray-100 active:scale-95">
                    <Type size={14} className="text-[#0f2d1f]" />−
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setFontSize((v) => Math.min(40, v + 2)); resetControlTimer(); }} className="p-1.5 rounded bg-gray-100 active:scale-95">
                    <Type size={14} className="text-[#0f2d1f]" />+
                  </button>
                </div>
              </div>
            </div>

            {/* ── PAGE NAVIGATION ───────────────────────────────────────── */}
            <div className="absolute bottom-[72px] left-0 right-0 px-4 pointer-events-none">
              <div className="max-w-2xl mx-auto flex gap-3 pointer-events-auto">
                <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}
                  className="flex-1 py-2.5 rounded-xl bg-white/90 border border-gray-200 text-sm font-semibold text-[#0f2d1f] shadow-sm disabled:opacity-40 active:scale-95 transition">
                  <ChevronLeft size={16} className="inline mr-1" /> Prev
                </button>
                <button onClick={() => setCurrentPage((p) => Math.min(604, p + 1))} disabled={currentPage >= 604}
                  className="flex-1 py-2.5 rounded-xl bg-white/90 border border-gray-200 text-sm font-semibold text-[#0f2d1f] shadow-sm disabled:opacity-40 active:scale-95 transition">
                  Next <ChevronRight size={16} className="inline ml-1" />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "memorization" && (
          <div className="h-full overflow-y-auto p-4">
            <div className="text-center text-gray-500 mt-20">
              <Brain size={48} className="mx-auto mb-4 opacity-50" />
              <p>Memorization tools load here</p>
            </div>
          </div>
        )}

        {activeTab === "exercise" && (
          <div className="h-full overflow-y-auto p-4">
            <div className="text-center text-gray-500 mt-20">
              <Target size={48} className="mx-auto mb-4 opacity-50" />
              <p>Exercise drills load here</p>
            </div>
          </div>
        )}
        {activeTab === "test" && (
          <div className="h-full overflow-y-auto p-4">
            <div className="text-center text-gray-500 mt-20">
              <FileCheck size={48} className="mx-auto mb-4 opacity-50" />
              <p>Assessment center loads here</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}