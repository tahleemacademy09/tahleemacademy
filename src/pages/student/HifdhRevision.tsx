/*
  HifdhRevision.tsx \u2014 Tahleem Academy
  Light cream design matching Revision Centre style
  Full functionality: mic, word-check, timer, surah API, audio, Supabase
*/

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// \u2500\u2500\u2500 Types \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
interface SurahMeta {
  number: number;
  name: string;
  englishName: string;
  numberOfAyahs: number;
}

interface AyahData {
  number: number;
  numberInSurah: number;
  text: string;
  words: WordState[];
}

interface WordState {
  raw: string;
  normalized: string;
  state: "idle" | "correct" | "wrong" | "current";
}

interface RevisionEntry {
  surah_num: number;
  surah_name: string;
  last_reviewed: string;
  best_accuracy: number;
}

type Mode = "memorize" | "recitation" | "revision";

// \u2500\u2500\u2500 Arabic helpers \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const normalize = (t: string) =>
  t.replace(/[\u064B-\u065F\u0670]/g, "")
   .replace(/[\u0623\u0625\u0622]/g, "\u0627")
   .replace(/\u0629/g, "\u0647")
   .replace(/\u0649/g, "\u064a")
   .replace(/\s+/g, " ")
   .trim();

const toWords = (text: string): WordState[] =>
  text.replace(/\ufd3f.*?\ufd3e/g, "").trim().split(/\s+/).filter(Boolean).map((w) => ({
    raw: w, normalized: normalize(w), state: "idle" as const,
  }));

// \u2500\u2500\u2500 Component \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
export default function HifdhRevision() {
  const [mode, setMode] = useState<Mode>("recitation");
  const [surahs, setSurahs] = useState<SurahMeta[]>([]);
  const [selectedSurah, setSelectedSurah] = useState<SurahMeta | null>(null);
  const [ayahs, setAyahs] = useState<AyahData[]>([]);
  const [ayahIndex, setAyahIndex] = useState(0);
  const [loadingAyahs, setLoadingAyahs] = useState(false);
  const [surahSearch, setSurahSearch] = useState("");

  const [isRecording, setIsRecording] = useState(false);
  const [timer, setTimer] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [speechSupported, setSpeechSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionWrong, setSessionWrong] = useState(0);
  const [showSummary, setShowSummary] = useState(false);

  const [revisionSchedule, setRevisionSchedule] = useState<RevisionEntry[]>([]);
  const [savingSession, setSavingSession] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserId(data.user.id);
    });
  }, []);

  useEffect(() => {
    fetch("https://api.alquran.cloud/v1/surah")
      .then((r) => r.json())
      .then((d) => { if (d.code === 200) setSurahs(d.data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedSurah) return;
    setLoadingAyahs(true);
    setAyahIndex(0);
    setAyahs([]);
    setShowSummary(false);
    fetch(`https://api.alquran.cloud/v1/surah/${selectedSurah.number}/ar.uthmani`)
      .then((r) => r.json())
      .then((d) => {
        if (d.code === 200) {
          setAyahs(d.data.ayahs.map((a: any) => ({
            number: a.number, numberInSurah: a.numberInSurah,
            text: a.text, words: toWords(a.text),
          })));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAyahs(false));
  }, [selectedSurah]);

  useEffect(() => {
    if (!userId) return;
    supabase.from("hifdh_progress")
      .select("surah_num,surah_name,last_reviewed,best_accuracy")
      .eq("user_id", userId)
      .order("last_reviewed", { ascending: true })
      .limit(5)
      .then(({ data }) => { if (data) setRevisionSchedule(data as RevisionEntry[]); })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  const formatTimer = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const checkWords = useCallback((spokenText: string) => {
    if (!ayahs[ayahIndex]) return;
    const spokenWords = normalize(spokenText).split(/\s+/).filter(Boolean);
    setAyahs((prev) => {
      const updated = [...prev];
      const ayah = { ...updated[ayahIndex] };
      const words = ayah.words.map((w, wi) => {
        const spoken = spokenWords[wi];
        if (!spoken) return wi === spokenWords.length ? { ...w, state: "current" as const } : { ...w, state: "idle" as const };
        if (spoken === w.normalized) return { ...w, state: "correct" as const };
        const isClose = spokenWords.some((sw) => sw === w.normalized || w.normalized.startsWith(sw.slice(0, 3)));
        return { ...w, state: isClose ? "correct" as const : "wrong" as const };
      });
      const firstIdle = words.findIndex((w) => w.state === "idle");
      if (firstIdle !== -1) words[firstIdle] = { ...words[firstIdle], state: "current" };
      ayah.words = words;
      updated[ayahIndex] = ayah;
      return updated;
    });
  }, [ayahIndex, ayahs]);

  const initRecognition = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSpeechSupported(false); return null; }
    const rec = new SR();
    rec.lang = "ar-SA"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) interim += e.results[i][0].transcript;
      setTranscript(interim);
      checkWords(interim);
    };
    rec.onerror = (e: any) => { if (e.error !== "no-speech") stopRecording(); };
    rec.onend = () => { if (recognitionRef.current && isRecording) { try { rec.start(); } catch (_) {} } };
    return rec;
  }, [isRecording, checkWords]);

  const startRecording = () => {
    const rec = initRecognition();
    if (!rec) return;
    recognitionRef.current = rec;
    try {
      rec.start(); setIsRecording(true); setTimer(0); setTranscript("");
      setAyahs((prev) => {
        const updated = [...prev];
        if (updated[ayahIndex]) updated[ayahIndex] = { ...updated[ayahIndex], words: updated[ayahIndex].words.map((w) => ({ ...w, state: "idle" })) };
        return updated;
      });
    } catch (_) {}
  };

  const stopRecording = () => {
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch (_) {} recognitionRef.current = null; }
    setIsRecording(false);
  };

  const getAyahScore = () => {
    if (!ayahs[ayahIndex]) return { correct: 0, wrong: 0, total: 0, pct: 0 };
    const words = ayahs[ayahIndex].words;
    const correct = words.filter((w) => w.state === "correct").length;
    const wrong = words.filter((w) => w.state === "wrong").length;
    const total = words.length;
    return { correct, wrong, total, pct: total > 0 ? Math.round((correct / total) * 100) : 0 };
  };

  const saveSession = async (scorePct: number) => {
    if (!userId || !selectedSurah || !ayahs[ayahIndex]) return;
    setSavingSession(true);
    try {
      const sc = getAyahScore();
      await supabase.from("hifdh_sessions").insert({
        student_id: userId, surah_number: selectedSurah.number,
        surah_name: selectedSurah.englishName, ayah_start: ayahs[ayahIndex].numberInSurah,
        accuracy_score: scorePct, correct: sc.correct, wrong: sc.wrong, duration: timer,
      });
      const { data: ex } = await supabase.from("hifdh_progress")
        .select("id,times_reviewed,best_accuracy").eq("user_id", userId).eq("surah_num", selectedSurah.number).single();
      if (ex) {
        await supabase.from("hifdh_progress").update({
          last_reviewed: new Date().toISOString(),
          best_accuracy: Math.max(ex.best_accuracy ?? 0, scorePct),
          times_reviewed: (ex.times_reviewed ?? 0) + 1,
        }).eq("id", ex.id);
      } else {
        await supabase.from("hifdh_progress").insert({
          user_id: userId, surah_num: selectedSurah.number,
          surah_name: selectedSurah.englishName,
          last_reviewed: new Date().toISOString(), best_accuracy: scorePct, times_reviewed: 1,
        });
      }
    } catch (_) {}
    setSavingSession(false);
  };

  const nextAyah = async () => {
    stopRecording();
    const score = getAyahScore();
    setSessionCorrect((c) => c + score.correct);
    setSessionWrong((w) => w + score.wrong);
    await saveSession(score.pct);
    if (ayahIndex < ayahs.length - 1) { setAyahIndex((i) => i + 1); setTimer(0); setTranscript(""); }
    else setShowSummary(true);
  };

  const prevAyah = () => { stopRecording(); if (ayahIndex > 0) { setAyahIndex((i) => i - 1); setTimer(0); setTranscript(""); } };

  const playAyahAudio = () => {
    if (!ayahs[ayahIndex]) return;
    const url = `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${ayahs[ayahIndex].number}.mp3`;
    if (audioRef.current) {
      audioRef.current.pause(); audioRef.current.src = url;
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      audioRef.current.onended = () => setIsPlaying(false);
    }
  };

  const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  const urgencyColor = (d: number) => d >= 10 ? "#c0392b" : d >= 5 ? "#b7791f" : "#276749";
  const urgencyBg = (d: number) => d >= 10 ? "#fff5f5" : d >= 5 ? "#fffbeb" : "#f0fff4";
  const urgencyLabel = (d: number) => d >= 10 ? "Urgent \u00b7 \u0639\u0627\u062c\u0644" : d >= 5 ? "Soon \u00b7 \u0642\u0631\u064a\u0628\u0627\u064b" : "Good \u00b7 \u0628\u062e\u064a\u0631";

  const currentAyah = ayahs[ayahIndex];
  const score = getAyahScore();
  const filteredSurahs = surahs.filter(
    (s) => s.englishName.toLowerCase().includes(surahSearch.toLowerCase()) || s.name.includes(surahSearch)
  );

  const wordBg = (s: WordState["state"]) => ({ idle: "transparent", correct: "#f0fff4", wrong: "#fff5f5", current: "#fffbeb" }[s]);
  const wordColor = (s: WordState["state"]) => ({ idle: "#1a3d24", correct: "#276749", wrong: "#c0392b", current: "#b7791f" }[s]);
  const wordBorder = (s: WordState["state"]) => ({ idle: "transparent", correct: "#9ae6b4", wrong: "#feb2b2", current: "#f6e05e" }[s]);

  return (
    <div style={{ fontFamily: "'Cairo', sans-serif", background: "#f5f0e8", minHeight: "100vh", color: "#1a3d24" }}>

      <audio ref={audioRef} style={{ display: "none" }} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&family=Cairo:wght@300;400;600;700;900&display=swap');
        @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse  { 0%,100%{opacity:.6} 50%{opacity:1} }
        @keyframes wave   { 0%,100%{transform:scaleY(.3)} 50%{transform:scaleY(1)} }
        @keyframes ring   { 0%,100%{box-shadow:0 0 0 0 rgba(26,61,36,.15)} 50%{box-shadow:0 0 0 14px rgba(26,61,36,.05)} }
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-thumb{background:rgba(26,61,36,.15);border-radius:2px}
        input::placeholder{color:#7a9e88}
      `}</style>

      {/* \u2500\u2500 Page Header \u2500\u2500 */}
      <div style={{ textAlign: "center", padding: "36px 20px 24px", borderBottom: "1px solid rgba(26,61,36,.1)" }}>
        <h1 style={{ fontFamily: "'Amiri', serif", fontSize: 32, fontWeight: 700, color: "#1a3d24", margin: 0, letterSpacing: "-0.5px" }}>
          AI-Hifdh Centre
        </h1>
        <p style={{ fontFamily: "'Amiri', serif", fontSize: 15, color: "#b7791f", margin: "6px 0 0", fontStyle: "italic" }}>
          Smart memorization strengthens the heart \u2014 \u0627\u0644\u062d\u0650\u0641\u0638 \u0627\u0644\u0630\u0643\u064a \u064a\u064f\u062b\u0628\u0650\u0651\u062a \u0627\u0644\u0642\u0644\u0628
        </p>
        {savingSession && (
          <span style={{ fontSize: 11, color: "#b7791f", animation: "pulse 1s infinite", display: "block", marginTop: 6 }}>
            Saving session\u2026
          </span>
        )}
      </div>

      <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 700, margin: "0 auto" }}>

        {/* \u2500\u2500 Stats Row \u2500\u2500 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { icon: "\ud83d\udcd6", val: "7.5", label: "Juz Memorized",  sub: "\u0623\u062c\u0632\u0627\u0621 \u0645\u062d\u0641\u0648\u0638\u0629" },
            { icon: "\ud83d\udcca", val: `${score.pct}%`, label: "Live Accuracy", sub: "\u0627\u0644\u062f\u0642\u0629 \u0627\u0644\u0644\u062d\u0638\u064a\u0629" },
            { icon: "\ud83d\udd25", val: "7",   label: "Day Streak",     sub: "\u0633\u0644\u0633\u0644\u0629 \u0627\u0644\u0623\u064a\u0627\u0645" },
            { icon: "\ud83d\udd50", val: formatTimer(timer), label: "Session Time", sub: "\u0648\u0642\u062a \u0627\u0644\u062c\u0644\u0633\u0629" },
          ].map((s, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 16, padding: "18px 16px", border: "1px solid rgba(26,61,36,.1)", boxShadow: "0 1px 4px rgba(0,0,0,.06)", textAlign: "center" }}>
              <div style={{ fontSize: 26, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: "#1a3d24", lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 12, color: "#4a7c59", marginTop: 4, fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 10, color: "#7a9e88" }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* \u2500\u2500 Mode Selector \u2500\u2500 */}
        <div style={{ background: "#fff", borderRadius: 16, padding: "18px 16px", border: "1px solid rgba(26,61,36,.1)", boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          <div style={{ fontFamily: "'Amiri',serif", fontSize: 16, fontWeight: 700, color: "#1a3d24", marginBottom: 12 }}>
            Select Mode \u00b7 \u0627\u062e\u062a\u0631 \u0627\u0644\u0648\u0636\u0639
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {([
              { k: "memorize",   e: "\ud83d\udcd6", en: "Memorize",   ar: "\u062d\u0650\u0641\u0638 \u062c\u062f\u064a\u062f" },
              { k: "recitation", e: "\ud83c\udf99\ufe0f", en: "Recitation", ar: "\u062a\u0644\u0627\u0648\u0629 \u0630\u0643\u064a\u0629" },
              { k: "revision",   e: "\ud83d\udd04", en: "Revision",   ar: "\u0645\u0631\u0627\u062c\u0639\u0629" },
            ] as const).map((m) => (
              <div key={m.k} onClick={() => setMode(m.k)}
                style={{ textAlign: "center", padding: "12px 8px", borderRadius: 12, cursor: "pointer", transition: "all .2s",
                  background: mode === m.k ? "#1a3d24" : "#f5f0e8",
                  border: `1.5px solid ${mode === m.k ? "#1a3d24" : "rgba(26,61,36,.15)"}`,
                }}>
                <div style={{ fontSize: 20, marginBottom: 5 }}>{m.e}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: mode === m.k ? "#fff" : "#1a3d24" }}>{m.en}</div>
                <div style={{ fontSize: 10, color: mode === m.k ? "#b7791f" : "#7a9e88", marginTop: 2 }}>{m.ar}</div>
              </div>
            ))}
          </div>
        </div>

        {/* \u2500\u2500 Surah Selector \u2500\u2500 */}
        <div style={{ background: "#fff", borderRadius: 16, padding: "18px 16px", border: "1px solid rgba(26,61,36,.1)", boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          <div style={{ fontFamily: "'Amiri',serif", fontSize: 16, fontWeight: 700, color: "#1a3d24", marginBottom: 12 }}>
            Select Surah \u00b7 \u0627\u062e\u062a\u0631 \u0627\u0644\u0633\u0648\u0631\u0629
            {selectedSurah && <span style={{ fontSize: 13, color: "#b7791f", fontWeight: 400, marginRight: 8 }}> \u2014 {selectedSurah.englishName} \u00b7 {selectedSurah.name}</span>}
          </div>
          <input
            value={surahSearch}
            onChange={(e) => setSurahSearch(e.target.value)}
            placeholder="Search surah\u2026 \u0627\u0628\u062d\u062b \u0639\u0646 \u0633\u0648\u0631\u0629"
            style={{ width: "100%", background: "#f5f0e8", border: "1px solid rgba(26,61,36,.15)", borderRadius: 10, padding: "9px 13px", color: "#1a3d24", fontSize: 13, fontFamily: "'Cairo',sans-serif", outline: "none", marginBottom: 12, boxSizing: "border-box" as const }}
          />
          <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 4 }}>
            {filteredSurahs.slice(0, 30).map((s) => (
              <div key={s.number} onClick={() => { setSelectedSurah(s); setSurahSearch(""); }}
                style={{ flexShrink: 0, padding: "6px 13px", borderRadius: 30, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap",
                  background: selectedSurah?.number === s.number ? "#1a3d24" : "#f5f0e8",
                  color: selectedSurah?.number === s.number ? "#fff" : "#1a3d24",
                  border: `1px solid ${selectedSurah?.number === s.number ? "#1a3d24" : "rgba(26,61,36,.2)"}`,
                  fontWeight: selectedSurah?.number === s.number ? 700 : 400,
                }}>
                {s.englishName} \u00b7 {s.name}
              </div>
            ))}
            {surahs.length === 0 && <div style={{ fontSize: 12, color: "#7a9e88" }}>Loading surahs\u2026</div>}
          </div>
        </div>

        {/* \u2500\u2500 No surah \u2500\u2500 */}
        {!selectedSurah && (
          <div style={{ background: "#fff", borderRadius: 16, padding: "40px 20px", border: "1px solid rgba(26,61,36,.1)", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>\ud83d\udcd6</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 18, color: "#1a3d24", fontWeight: 700 }}>Select a Surah to Begin</div>
            <div style={{ fontSize: 12, color: "#7a9e88", marginTop: 4 }}>\u0627\u062e\u062a\u0631 \u0633\u0648\u0631\u0629 \u0644\u0644\u0628\u062f\u0621 \u00b7 Choose from the list above</div>
          </div>
        )}

        {/* \u2500\u2500 Loading \u2500\u2500 */}
        {selectedSurah && loadingAyahs && (
          <div style={{ background: "#fff", borderRadius: 16, padding: "40px 20px", border: "1px solid rgba(26,61,36,.1)", textAlign: "center" }}>
            <div style={{ fontSize: 12, color: "#b7791f", animation: "pulse 1s infinite" }}>Loading ayahs\u2026 \u00b7 \u062c\u0627\u0631\u064d \u0627\u0644\u062a\u062d\u0645\u064a\u0644</div>
          </div>
        )}

        {/* \u2500\u2500 Summary \u2500\u2500 */}
        {showSummary && selectedSurah && (
          <div style={{ background: "#fff", borderRadius: 16, padding: "32px 20px", border: "1px solid rgba(26,61,36,.1)", textAlign: "center", animation: "fadeIn .4s ease", boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>\ud83c\udf89</div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 22, color: "#1a3d24", fontWeight: 700 }}>Session Complete! \u00b7 \u0623\u062d\u0633\u0646\u062a</div>
            <div style={{ fontSize: 13, color: "#b7791f", marginTop: 4, marginBottom: 20 }}>
              {selectedSurah.englishName} \u00b7 {selectedSurah.name}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
              {[
                { label: "Correct \u00b7 \u0635\u062d\u064a\u062d", val: sessionCorrect, color: "#276749", bg: "#f0fff4" },
                { label: "Wrong \u00b7 \u062e\u0637\u0623",    val: sessionWrong,   color: "#c0392b", bg: "#fff5f5" },
                { label: "Ayahs \u00b7 \u0622\u064a\u0627\u062a",   val: ayahs.length,   color: "#1a3d24", bg: "#f5f0e8" },
              ].map((item, i) => (
                <div key={i} style={{ background: item.bg, borderRadius: 12, padding: "14px 10px", border: `1px solid ${item.color}22` }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: item.color }}>{item.val}</div>
                  <div style={{ fontSize: 10, color: "#7a9e88", marginTop: 2 }}>{item.label}</div>
                </div>
              ))}
            </div>
            <button
              onClick={() => { setShowSummary(false); setAyahIndex(0); setSessionCorrect(0); setSessionWrong(0); }}
              style={{ padding: "12px 28px", borderRadius: 12, background: "#1a3d24", border: "none", color: "#fff", fontFamily: "'Cairo',sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              Start Again \u00b7 \u0623\u0639\u062f \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629
            </button>
          </div>
        )}

        {/* \u2500\u2500 Quran Card \u2500\u2500 */}
        {selectedSurah && !loadingAyahs && !showSummary && currentAyah && (
          <>
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid rgba(26,61,36,.1)", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid rgba(26,61,36,.08)", background: "#f9f6f0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", border: "1.5px solid #b7791f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#b7791f", fontWeight: 700, background: "#fffbeb" }}>
                    {selectedSurah.number}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a3d24" }}>
                      {selectedSurah.englishName} <span style={{ color: "#b7791f" }}>\u00b7 {selectedSurah.name}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#7a9e88" }}>
                      Ayah {currentAyah.numberInSurah} of {selectedSurah.numberOfAyahs} \u00b7 \u0622\u064a\u0629 {currentAyah.numberInSurah}
                    </div>
                  </div>
                </div>
                <button onClick={playAyahAudio}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 13px", borderRadius: 20, background: isPlaying ? "#1a3d24" : "#f5f0e8", border: "1px solid rgba(26,61,36,.2)", color: isPlaying ? "#fff" : "#1a3d24", fontFamily: "'Cairo',sans-serif", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  {isPlaying ? "\u23f8 Playing" : "\ud83d\udd0a Listen \u00b7 \u0627\u0633\u062a\u0645\u0639"}
                </button>
              </div>

              {/* Word legend */}
              <div style={{ display: "flex", gap: 12, padding: "8px 16px", background: "#fafaf8", borderBottom: "1px solid rgba(26,61,36,.06)", flexWrap: "wrap" as const }}>
                {[["#276749","#f0fff4","Correct \u00b7 \u0635\u062d\u064a\u062d"],["#c0392b","#fff5f5","Error \u00b7 \u062e\u0637\u0623"],["#b7791f","#fffbeb","Current \u00b7 \u0627\u0644\u0622\u0646"],["#4a7c59","transparent","Pending \u00b7 \u0644\u0645 \u064a\u064f\u0642\u0631\u0623"]].map(([col,bg,label],i)=>(
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#7a9e88" }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: bg as string, border: `1px solid ${col}` }} />
                    {label}
                  </div>
                ))}
              </div>

              {/* Bismillah */}
              {currentAyah.numberInSurah === 1 && selectedSurah.number !== 9 && (
                <div style={{ textAlign: "center", padding: "18px 16px", borderBottom: "1px solid rgba(26,61,36,.06)", background: "#fffbf0" }}>
                  <div style={{ fontFamily: "'Amiri Quran',serif", fontSize: 26, color: "#1a3d24", lineHeight: 2 }}>
                    \u0628\u0650\u0633\u0652\u0645\u0650 \u0671\u0644\u0644\u064e\u0651\u0647\u0650 \u0671\u0644\u0631\u064e\u0651\u062d\u0652\u0645\u064e\u0670\u0646\u0650 \u0671\u0644\u0631\u064e\u0651\u062d\u0650\u064a\u0645\u0650
                  </div>
                  <div style={{ fontSize: 11, color: "#7a9e88", marginTop: 2 }}>
                    In the name of Allah, the Most Gracious, the Most Merciful
                  </div>
                </div>
              )}

              {/* Ayah text */}
              <div style={{ padding: "22px 18px", direction: "rtl" }}>
                <div style={{ fontFamily: "'Amiri Quran',serif", fontSize: 26, lineHeight: 2.6, textAlign: "right" }}>
                  {currentAyah.words.map((w, wi) => (
                    <span key={wi} style={{
                      display: "inline", marginLeft: 6, cursor: "default",
                      color: wordColor(w.state),
                      background: wordBg(w.state),
                      border: `1px solid ${wordBorder(w.state)}`,
                      borderRadius: w.state !== "idle" ? "5px" : 0,
                      padding: w.state !== "idle" ? "0 3px" : 0,
                      animation: w.state === "current" ? "pulse 1.2s ease-in-out infinite" : "none",
                    }}>{w.raw}</span>
                  ))}
                  <span style={{ color: "#b7791f", fontSize: 16, opacity: 0.7 }}> \ufd3f{currentAyah.numberInSurah}\ufd3e</span>
                </div>
              </div>

              {/* Navigation */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderTop: "1px solid rgba(26,61,36,.08)", background: "#f9f6f0" }}>
                <button onClick={prevAyah} disabled={ayahIndex === 0}
                  style={{ padding: "8px 16px", borderRadius: 10, background: "#f5f0e8", border: "1px solid rgba(26,61,36,.2)", color: ayahIndex === 0 ? "#7a9e88" : "#1a3d24", fontFamily: "'Cairo',sans-serif", fontSize: 12, cursor: ayahIndex === 0 ? "not-allowed" : "pointer", opacity: ayahIndex === 0 ? .5 : 1 }}>
                  \u2190 Prev \u00b7 \u0627\u0644\u0633\u0627\u0628\u0642\u0629
                </button>
                <span style={{ fontSize: 12, color: "#7a9e88", fontWeight: 600 }}>{ayahIndex + 1} / {ayahs.length}</span>
                <button onClick={nextAyah}
                  style={{ padding: "8px 16px", borderRadius: 10, background: "#1a3d24", border: "none", color: "#fff", fontFamily: "'Cairo',sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  Next \u00b7 \u0627\u0644\u062a\u0627\u0644\u064a\u0629 \u2192
                </button>
              </div>
            </div>

            {/* \u2500\u2500 Recording Card \u2500\u2500 */}
            <div style={{ background: "#fff", borderRadius: 16, padding: "22px 18px", border: "1px solid rgba(26,61,36,.1)", boxShadow: "0 1px 4px rgba(0,0,0,.06)", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <div style={{ fontFamily: "'Amiri',serif", fontSize: 16, fontWeight: 700, color: "#1a3d24" }}>
                Recitation \u00b7 \u0627\u0644\u062a\u0644\u0627\u0648\u0629
              </div>

              {!speechSupported && (
                <div style={{ background: "#fff5f5", border: "1px solid #feb2b2", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#c0392b", textAlign: "center", width: "100%" }}>
                  \u26a0\ufe0f Speech recognition not supported. Please use Chrome or Edge.
                </div>
              )}

              <div style={{ fontSize: 13, color: isRecording ? "#b7791f" : "#7a9e88", fontWeight: 600 }}>
                {isRecording ? "\u25cf Listening \u00b7 \u062c\u0627\u0631\u064d \u0627\u0644\u0627\u0633\u062a\u0645\u0627\u0639\u2026" : "Tap mic to start \u00b7 \u0627\u0636\u063a\u0637 \u0644\u0644\u0628\u062f\u0621"}
              </div>

              {/* Mic button */}
              <div onClick={isRecording ? stopRecording : startRecording}
                style={{ width: 92, height: 92, borderRadius: "50%", cursor: speechSupported ? "pointer" : "not-allowed",
                  background: isRecording ? "#1a3d24" : "#f5f0e8",
                  border: `2px solid ${isRecording ? "#1a3d24" : "rgba(26,61,36,.25)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  animation: isRecording ? "ring 2
