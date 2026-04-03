import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart3, Mic, Brain, Target, FileCheck,
  Play, Pause, SkipBack, SkipForward, Minus, Plus
} from "lucide-react";
import { cn } from "@/lib/utils";

import HifdhDashboard from "@/components/hifdh/HifdhDashboard";
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
  { id: "ar.alafasy",            name: "Mishary Alafasy"   },
  { id: "ar.abdurrahmaansudais", name: "As-Sudais"         },
  { id: "ar.husary",             name: "Al-Husary"         },
  { id: "ar.minshawi",           name: "Al-Minshawi"       },
  { id: "ar.shaatri",            name: "Ash-Shaatri"       },
  { id: "ar.abdulsamad",         name: "Abdul Samad"       },
  { id: "ar.muhammadjibreel",    name: "M. Jibreel"        },
  { id: "ar.haniarrifai",        name: "Hani Ar-Rifai"     },
  { id: "ar.maaboramadan",       name: "Al-Muaiqly"        },
  { id: "ar.abdullahbasfar",     name: "Basfar"            },
];

const GOLD       = "#c9a84c";
const DARK_GREEN = "#0f2d1f";
const PARCHMENT  = "#fdf6e3";
const INK        = "#1c1208";

/* ── helpers ── */
const toAr = (n: number) =>
  String(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);

/**
 * FIX — use ABSOLUTE ayah number (ayah.number, range 1-6236).
 * islamic.network CDN:
 *   https://cdn.islamic.network/quran/audio/128/{edition}/{absoluteNum}.mp3
 *
 * The old code used surah+ayah padded ("001001.mp3") which is the
 * everyayah.com format and does NOT work on this CDN.
 */
const buildAudioUrl = (absoluteNum: number, reciter: string) =>
  `https://cdn.islamic.network/quran/audio/128/${reciter}/${absoluteNum}.mp3`;

/* ── group page ayahs by surah (a page can cross surah boundaries) ── */
function groupBySurah(ayahs: any[]) {
  const groups: { surah: any; ayahs: any[] }[] = [];
  for (const ayah of ayahs) {
    const last = groups[groups.length - 1];
    if (!last || last.surah.number !== ayah.surah.number) {
      groups.push({ surah: ayah.surah, ayahs: [ayah] });
    } else {
      last.ayahs.push(ayah);
    }
  }
  return groups;
}

/* ══════════════════════════════════════════════════════════════════════ */
export default function HifdhRevision() {
  const [activeTab,   setActiveTab]   = useState<Tab>("overview");
  const [userId,      setUserId]      = useState<string | null>(null);
  const [studentName, setStudentName] = useState("Student");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageData,    setPageData]    = useState<any>(null);
  const [loading,     setLoading]     = useState(false);
  const [playingAyah, setPlayingAyah] = useState(0);   // absolute ayah number
  const [reciter,     setReciter]     = useState("ar.alafasy");
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [fontSize,    setFontSize]    = useState(26);
  const [slideDir,    setSlideDir]    = useState<"ltr" | "rtl" | null>(null);

  const audioRef    = useRef<HTMLAudioElement>(null);
  const playingRef  = useRef(0);
  const pageDataRef = useRef<any>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  /* ── persist preferences ── */
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
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", data.user.id)
        .single()
        .then(({ data: p }) => { if (p?.full_name) setStudentName(p.full_name); });
    });
  }, []);

  /* ── fetch page from alquran.cloud ── */
  const fetchPage = useCallback((page: number) => {
    setLoading(true);
    setPageData(null);
    fetch(`https://api.alquran.cloud/v1/page/${page}/ar.uthmani`)
      .then((r) => r.json())
      .then((json) => {
        if (json?.code === 200) setPageData(json.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchPage(currentPage); }, [currentPage, fetchPage]);

  /* ── clear slide animation ── */
  useEffect(() => {
    if (!slideDir) return;
    const t = setTimeout(() => setSlideDir(null), 360);
    return () => clearTimeout(t);
  }, [slideDir, currentPage]);

  /* ── page navigation
     Arabic Quran direction:
       swipe RIGHT (finger left→right) = advance to next page
       swipe LEFT  (finger right→left) = go to previous page            ── */
  const goNext = useCallback(() => {
    setSlideDir("ltr");
    setCurrentPage((p) => Math.min(604, p + 1));
    setPlayingAyah(0);
    playingRef.current = 0;
  }, []);

  const goPrev = useCallback(() => {
    setSlideDir("rtl");
    setCurrentPage((p) => Math.max(1, p - 1));
    setPlayingAyah(0);
    playingRef.current = 0;
  }, []);

  /* ── audio ── */
  const playAyah = useCallback((absoluteNum: number) => {
    const pd = pageDataRef.current;
    if (!pd?.ayahs) return;
    playingRef.current = absoluteNum;
    setPlayingAyah(absoluteNum);
    const url   = buildAudioUrl(absoluteNum, reciter);
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.src = url;
    audio.load();
    audio.play().catch((err) => {
      console.warn("Audio blocked:", err.message);
      setIsPlaying(false);
    });
  }, [reciter]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    const pd    = pageDataRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      const target =
        playingAyah > 0 ? playingAyah : pd?.ayahs?.[0]?.number ?? 1;
      playAyah(target);
    }
  }, [isPlaying, playingAyah, playAyah]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      const pd  = pageDataRef.current;
      if (!pd?.ayahs) return;
      const idx = pd.ayahs.findIndex((a: any) => a.number === playingRef.current);
      if (idx >= 0 && idx < pd.ayahs.length - 1) {
        playAyah(pd.ayahs[idx + 1].number);
      } else {
        setIsPlaying(false);
        setPlayingAyah(0);
        playingRef.current = 0;
      }
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

  /* stop audio when reciter changes */
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.src = ""; }
    setIsPlaying(false);
    setPlayingAyah(0);
    playingRef.current = 0;
  }, [reciter]);

  /* ── swipe handlers ── */
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 48) {
      if (dx > 0) goNext(); else goPrev();
    }
  };

  /* ── derived values ── */
  const pageAyahs   = pageData?.ayahs ?? [];
  const surahGroups = groupBySurah(pageAyahs);
  const firstSurah  = pageAyahs[0]?.surah;
  const lastSurah   = pageAyahs[pageAyahs.length - 1]?.surah;
  const juzNum      = pageAyahs[0]?.juz;

  /* ══════════════════════════════════════════════════════════════════ */
  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden" style={{ background: "#111" }}>
      <audio ref={audioRef} playsInline preload="none" style={{ display: "none" }} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&display=swap');

        .mushaf-text {
          font-family: 'Amiri Quran', 'Scheherazade New', 'Amiri', serif;
          direction: rtl;
          text-align: justify;
          line-height: 2.6;
          word-spacing: 1px;
          color: ${INK};
        }
        .ayah-marker {
          font-family: 'Amiri', serif;
          color: ${GOLD};
          font-size: 0.72em;
          display: inline;
          margin: 0 1px;
        }
        .ayah-active {
          background: ${GOLD}28;
          border-radius: 3px;
          outline: 1.5px solid ${GOLD}66;
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
          font-size: 0.62em;
          color: #6b5520;
          font-weight: 400;
          font-family: Georgia, serif;
          margin-top: 2px;
        }
        .bismillah {
          font-family: 'Amiri Quran', 'Amiri', serif;
          direction: rtl;
          text-align: center;
          color: ${INK};
          margin: 4px 0 10px;
          line-height: 2;
        }
        .mushaf-page {
          background: ${PARCHMENT};
          position: relative;
        }
        .mushaf-page::before {
          content: '';
          position: absolute;
          inset: 7px;
          border: 1px solid ${GOLD}44;
          border-radius: 1px;
          pointer-events: none;
          z-index: 1;
        }
        @keyframes slideInR {
          from { opacity: 0; transform: translateX(40px);  }
          to   { opacity: 1; transform: translateX(0);     }
        }
        @keyframes slideInL {
          from { opacity: 0; transform: translateX(-40px); }
          to   { opacity: 1; transform: translateX(0);     }
        }
        .slide-ltr { animation: slideInR 0.32s ease-out forwards; }
        .slide-rtl { animation: slideInL 0.32s ease-out forwards; }
        .ctrl-btn {
          display:flex; align-items:center; justify-content:center;
          border-radius:50%; transition: transform 0.1s, opacity 0.12s;
        }
        .ctrl-btn:active { transform: scale(0.87); opacity: 0.75; }
      `}</style>

      {/* ═══════════════════════════════════════════════════════════
           STATIC TAB NAVIGATION — flex-none keeps it pinned
          ═══════════════════════════════════════════════════════════ */}
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
                style={{
                  color:      active ? GOLD      : "#5a7d6a",
                  background: active ? "#ffffff14" : "transparent",
                }}
              >
                <Icon size={16} strokeWidth={active ? 2.5 : 1.8} />
                <span className="text-[10px] font-bold leading-none tracking-wide">{ar}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════════
           CONTENT AREA
          ═══════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-hidden relative">

        {/* ── Overview ── */}
        {activeTab === "overview" && (
          <div className="h-full overflow-y-auto bg-gray-50">
            <HifdhDashboard
              userId={userId}
              studentName={studentName}
              onNavigate={setActiveTab}
              activeTab={activeTab}
            />
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
             RECITATION — mushaf view
            ════════════════════════════════════════════════════════ */}
        {activeTab === "recitation" && (
          <div
            className="h-full flex flex-col"
            style={{ background: "linear-gradient(160deg,#1a1007 0%,#0b0d0a 100%)" }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {/* Scrollable page area */}
            <div className="flex-1 overflow-y-auto px-3 pt-3 pb-2">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <div
                    style={{
                      fontFamily: "'Amiri Quran','Amiri',serif",
                      color: GOLD, direction: "rtl", fontSize: 28,
                    }}
                  >
                    بسم الله الرحمن الرحيم
                  </div>
                  <p style={{ color: "#7a9e88", fontSize: 13 }}>
                    Loading page {currentPage}…
                  </p>
                </div>
              ) : (
                <div
                  className={cn(
                    "mushaf-page max-w-lg mx-auto rounded-sm shadow-2xl overflow-hidden",
                    slideDir === "ltr" && "slide-ltr",
                    slideDir === "rtl" && "slide-rtl"
                  )}
                  style={{ border: `2px solid ${GOLD}88` }}
                >
                  {/* ── Page header ── */}
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

                  {/* ── Decorative rule ── */}
                  <div className="mx-5 h-px" style={{ background:`linear-gradient(to right,transparent,${GOLD}88,transparent)` }} />

                  {/* ── Quran text ── */}
                  <div className="px-6 py-5">
                    {surahGroups.map((group, gi) => {
                      const isNewSurah    = group.ayahs[0].numberInSurah === 1;
                      const showBismillah = isNewSurah && group.surah.number !== 9 && group.surah.number !== 1;
                      return (
                        <div key={gi}>
                          {isNewSurah && (
                            <div className="surah-nameplate">
                              سورة {group.surah.name}
                              <small>
                                {group.surah.englishName} · {group.surah.numberOfAyahs} verses
                              </small>
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
                                  "cursor-pointer transition-all rounded-sm",
                                  playingAyah === ayah.number && "ayah-active"
                                )}
                              >
                                {ayah.text}
                                {" "}
                                <span className="ayah-marker">۝{toAr(ayah.numberInSurah)}</span>
                                {" "}
                              </span>
                            ))}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Decorative rule + page number ── */}
                  <div className="mx-5 h-px" style={{ background:`linear-gradient(to right,transparent,${GOLD}88,transparent)` }} />
                  <div className="py-2.5 text-center" style={{ fontFamily:"'Amiri',serif", color:GOLD, fontSize:"0.82em" }}>
                    ─── {toAr(currentPage)} ───
                  </div>
                </div>
              )}
            </div>

            {/* ═══════════════════════════════════════════════════════
                 STATIC PLAYBACK FOOTER — flex-none keeps it pinned
                ═══════════════════════════════════════════════════════ */}
            <div
              className="flex-none border-t z-50"
              style={{ background: DARK_GREEN, borderColor: GOLD + "44" }}
            >
              <div className="px-4 pt-2.5 pb-3 max-w-lg mx-auto">

                {/* Row 1: surah label + font size */}
                <div className="flex items-center justify-between mb-2">
                  <span style={{ fontFamily:"'Amiri Quran','Amiri',serif", color:GOLD, fontSize:"0.85em", direction:"rtl" }}>
                    {firstSurah?.nameAr ?? "القرآن الكريم"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setFontSize((v) => Math.max(18, v - 2))}
                      className="ctrl-btn w-6 h-6"
                      style={{ background: "#1e4030" }}
                    >
                      <Minus size={11} color={GOLD} />
                    </button>
                    <span style={{ color:GOLD, fontSize:"0.7em", minWidth:20, textAlign:"center" }}>{fontSize}</span>
                    <button
                      onClick={() => setFontSize((v) => Math.min(42, v + 2))}
                      className="ctrl-btn w-6 h-6"
                      style={{ background: "#1e4030" }}
                    >
                      <Plus size={11} color={GOLD} />
                    </button>
                  </div>
                </div>

                {/* Row 2: transport + reciter */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={goPrev}
                    className="ctrl-btn w-9 h-9 flex-none"
                    style={{ background: "#1e4030", opacity: currentPage <= 1 ? 0.4 : 1 }}
                    disabled={currentPage <= 1}
                  >
                    <SkipBack size={16} color={GOLD} />
                  </button>

                  <button
                    onClick={togglePlay}
                    className="ctrl-btn w-12 h-12 flex-none shadow-lg"
                    style={{ background: GOLD }}
                  >
                    {isPlaying
                      ? <Pause size={19} fill={DARK_GREEN} color={DARK_GREEN} />
                      : <Play  size={19} fill={DARK_GREEN} color={DARK_GREEN} className="ml-0.5" />
                    }
                  </button>

                  <button
                    onClick={goNext}
                    className="ctrl-btn w-9 h-9 flex-none"
                    style={{ background: "#1e4030", opacity: currentPage >= 604 ? 0.4 : 1 }}
                    disabled={currentPage >= 604}
                  >
                    <SkipForward size={16} color={GOLD} />
                  </button>

                  <select
                    value={reciter}
                    onChange={(e) => setReciter(e.target.value)}
                    className="flex-1 text-[11px] rounded px-2 py-2 outline-none"
                    style={{
                      background: "#1e4030",
                      color: GOLD,
                      border: `1px solid ${GOLD}44`,
                      fontFamily: "Georgia,serif",
                    }}
                  >
                    {RECITERS.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>

                {/* Hint */}
                <p className="text-center mt-1.5" style={{ color:"#4a6b56", fontSize:"0.58em", letterSpacing:"0.04em" }}>
                  swipe right → next page &nbsp;·&nbsp; tap any verse to play
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Memorization ── */}
        {activeTab === "memorization" && (
          <div className="h-full overflow-y-auto">
            <HifdhMemorization />
          </div>
        )}

        {/* ── Exercise ── */}
        {activeTab === "exercise" && (
          <div className="h-full overflow-y-auto">
            <HifdhExercise />
          </div>
        )}

        {/* ── Test ── */}
        {activeTab === "test" && (
          <div className="h-full overflow-y-auto">
            <HifdhTest />
          </div>
        )}
      </div>
    </div>
  );
}
