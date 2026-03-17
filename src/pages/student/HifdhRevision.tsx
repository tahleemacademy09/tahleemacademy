import { useState } from "react";

const SURAHS = [
  { en: "Al-Fatihah", ar: "الفاتحة" },
  { en: "Al-Baqarah", ar: "البقرة" },
  { en: "Ali 'Imran", ar: "آل عمران" },
  { en: "An-Nisa", ar: "النساء" },
  { en: "Al-Ma'idah", ar: "المائدة" },
  { en: "Al-Kahf", ar: "الكهف" },
  { en: "Ya-Sin", ar: "يس" },
  { en: "Ar-Rahman", ar: "الرحمن" },
  { en: "Al-Mulk", ar: "الملك" },
  { en: "Al-Ikhlas", ar: "الإخلاص" },
];

const AYAHS = [
  {
    num: "١", numEn: "1",
    words: [{ text: "الٓمٓ", state: "correct" }],
  },
  {
    num: "٢", numEn: "2",
    words: [
      { text: "ذَٰلِكَ", state: "correct" },
      { text: "ٱلْكِتَٰبُ", state: "correct" },
      { text: "لَا", state: "correct" },
      { text: "رَيْبَ", state: "current" },
      { text: "فِيهِ", state: "idle" },
      { text: "هُدًى", state: "idle" },
      { text: "لِّلْمُتَّقِينَ", state: "idle" },
    ],
  },
  {
    num: "٣", numEn: "3",
    words: [
      { text: "ٱلَّذِينَ", state: "idle" },
      { text: "يُؤْمِنُونَ", state: "wrong" },
      { text: "بِٱلْغَيْبِ", state: "idle" },
      { text: "وَيُقِيمُونَ", state: "idle" },
      { text: "ٱلصَّلَوٰةَ", state: "idle" },
      { text: "وَمِمَّا", state: "idle" },
      { text: "رَزَقْنَٰهُمْ", state: "idle" },
      { text: "يُنفِقُونَ", state: "idle" },
    ],
  },
  {
    num: "٤", numEn: "4",
    words: [
      { text: "وَٱلَّذِينَ", state: "idle" },
      { text: "يُؤْمِنُونَ", state: "idle" },
      { text: "بِمَآ", state: "idle" },
      { text: "أُنزِلَ", state: "idle" },
      { text: "إِلَيْكَ", state: "idle" },
      { text: "وَمَآ", state: "idle" },
      { text: "أُنزِلَ", state: "idle" },
      { text: "مِن", state: "idle" },
      { text: "قَبْلِكَ", state: "idle" },
    ],
  },
];

const JUZ_STATES: Array<"done" | "partial" | "empty"> = [
  "done","done","done","done","done","done","done","partial",
  "empty","empty","empty","empty","empty","empty","empty","empty",
  "empty","empty","empty","empty","empty","empty","empty","empty",
  "empty","empty","empty","empty","empty","empty",
];

type Mode = "memorize" | "recitation" | "revision";

export default function HifdhRevision() {
  const [activeMode, setActiveMode] = useState<Mode>("recitation");
  const [activeSurah, setActiveSurah] = useState(1);
  const [isRecording, setIsRecording] = useState(true);

  const wordStyle = (state: string): React.CSSProperties => {
    if (state === "correct") return { color: "#6fcf97" };
    if (state === "wrong") return { color: "#eb5757", background: "rgba(235,87,87,0.12)", borderRadius: "4px", padding: "1px 3px" };
    if (state === "current") return { color: "#c9a84c", background: "rgba(201,168,76,0.18)", borderRadius: "4px", padding: "1px 3px", animation: "pulseWord 1.2s ease-in-out infinite" };
    return { color: "#e8f0eb" };
  };

  return (
    <div style={{ fontFamily: "'Cairo', sans-serif", background: "#0a1f13", minHeight: "100vh", color: "#e8f0eb", overflowX: "hidden" }}>

      <div style={{ position: "fixed", inset: 0, backgroundImage: "repeating-linear-gradient(60deg,transparent,transparent 40px,rgba(201,168,76,0.02) 40px,rgba(201,168,76,0.02) 41px),repeating-linear-gradient(-60deg,transparent,transparent 40px,rgba(201,168,76,0.02) 40px,rgba(201,168,76,0.02) 41px)", pointerEvents: "none", zIndex: 0 }} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Cairo:wght@300;400;600;700;900&display=swap');
        @keyframes pulseWord { 0%,100%{background:rgba(201,168,76,0.12)} 50%{background:rgba(201,168,76,0.28)} }
        @keyframes ringPulse { 0%,100%{box-shadow:0 0 0 0 rgba(201,168,76,0.2)} 50%{box-shadow:0 0 0 16px rgba(201,168,76,0.06),0 0 0 32px rgba(201,168,76,0.02)} }
        @keyframes waveAnim { 0%,100%{transform:scaleY(0.3)} 50%{transform:scaleY(1)} }
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-thumb{background:rgba(201,168,76,0.25);border-radius:3px}
      `}</style>

      <div style={{ position: "relative", zIndex: 1, paddingBottom: 40 }}>

        {/* Top Bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid rgba(201,168,76,0.15)", background: "rgba(10,31,19,0.85)", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>
              AI-<span style={{ color: "#c9a84c" }}>Hifdh</span>
            </div>
            <div style={{ fontSize: 11, color: "#7a9e88" }}>الحِفظ الذكي · Smart Memorization</div>
          </div>
          <span style={{ background: "linear-gradient(135deg,#c9a84c,#8b6914)", color: "#0a1f13", fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20 }}>
            🔥 7-Day Streak · ٧ أيام
          </span>
        </div>

        <div style={{ padding: "22px 18px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Mode Selector */}
          <div>
            <div style={{ fontSize: 11, color: "#7a9e88", letterSpacing: 1.2, marginBottom: 10 }}>
              SELECT MODE · اختر الوضع
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
              {[
                { key: "memorize",   emoji: "📖", en: "Memorize",   ar: "حِفظ جديد",  desc: "Learn new verses" },
                { key: "recitation", emoji: "🎙️", en: "Recitation", ar: "تلاوة ذكية", desc: "AI checks live" },
                { key: "revision",   emoji: "🔄", en: "Revision",   ar: "مراجعة",     desc: "Spaced repetition" },
              ].map((m) => (
                <div
                  key={m.key}
                  onClick={() => setActiveMode(m.key as Mode)}
                  style={{
                    background: activeMode === m.key ? "linear-gradient(135deg,rgba(201,168,76,0.18),rgba(46,107,62,0.2))" : "#122b1a",
                    border: `1px solid ${activeMode === m.key ? "rgba(201,168,76,0.45)" : "rgba(201,168,76,0.12)"}`,
                    borderRadius: 14, padding: "14px 10px", cursor: "pointer",
                    transition: "all 0.2s", textAlign: "center" as const,
                    boxShadow: activeMode === m.key ? "0 0 0 1px rgba(201,168,76,0.2),0 6px 24px rgba(0,0,0,0.3)" : "none",
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 5 }}>{m.emoji}</div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{m.en}</div>
                  <div style={{ fontSize: 10, color: "#c9a84c", marginTop: 1 }}>{m.ar}</div>
                  <div style={{ fontSize: 10, color: "#7a9e88", marginTop: 4, lineHeight: 1.4 }}>{m.desc}</div>
                  {activeMode === m.key && (
                    <div style={{ marginTop: 7, display: "inline-block", fontSize: 9, padding: "2px 8px", borderRadius: 10, background: "rgba(201,168,76,0.18)", color: "#c9a84c", border: "1px solid rgba(201,168,76,0.3)" }}>
                      ✨ Active · نشط
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Surah Picker */}
          <div style={{ background: "#122b1a", border: "1px solid rgba(201,168,76,0.12)", borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                Surah · <span style={{ color: "#7a9e88", fontSize: 12 }}>السورة</span>
              </div>
              <span style={{ fontSize: 11, color: "#c9a84c", cursor: "pointer" }}>View All →</span>
            </div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
              {SURAHS.map((s, i) => (
                <div
                  key={i}
                  onClick={() => setActiveSurah(i)}
                  style={{
                    flexShrink: 0, padding: "6px 14px", borderRadius: 30, fontSize: 11,
                    cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap",
                    background: activeSurah === i ? "linear-gradient(90deg,#c9a84c,#8b6914)" : "rgba(255,255,255,0.04)",
                    color: activeSurah === i ? "#0a1f13" : "#e8f0eb",
                    fontWeight: activeSurah === i ? 700 : 400,
                    border: activeSurah === i ? "none" : "1px solid rgba(201,168,76,0.12)",
                  }}
                >
                  {s.en} · {s.ar}
                </div>
              ))}
            </div>
          </div>

          {/* Quran Display */}
          <div style={{ background: "#122b1a", border: "1px solid rgba(201,168,76,0.12)", borderRadius: 18, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid rgba(201,168,76,0.1)", background: "rgba(0,0,0,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", border: "1.5px solid #c9a84c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#c9a84c", fontWeight: 700 }}>2</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    Al-Baqarah <span style={{ color: "#c9a84c" }}>· البقرة</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#7a9e88" }}>286 Verses · Madinan · مدنية</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {["🔊", "⚙️"].map((ic, i) => (
                  <div key={i} style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(201,168,76,0.12)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 13 }}>{ic}</div>
                ))}
              </div>
            </div>

            {/* Bismillah */}
            <div style={{ textAlign: "center", padding: "16px", borderBottom: "1px solid rgba(201,168,76,0.08)" }}>
              <div style={{ fontFamily: "'Amiri Quran', serif", fontSize: 24, color: "#e4c36a", letterSpacing: 2, lineHeight: 2 }}>
                بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
              </div>
              <div style={{ fontSize: 10, color: "#7a9e88", marginTop: 4 }}>
                In the name of Allah, the Most Gracious, the Most Merciful
              </div>
            </div>

            {/* Word legend */}
            <div style={{ display: "flex", gap: 16, padding: "8px 18px", borderBottom: "1px solid rgba(201,168,76,0.06)", background: "rgba(0,0,0,0.1)" }}>
              {[["#6fcf97","Correct · صحيح"],["#eb5757","Error · خطأ"],["#c9a84c","Current · الآن"]].map(([col,label],i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:"#7a9e88" }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background: col as string }} />
                  {label}
                </div>
              ))}
            </div>

            {/* Ayahs */}
            <div style={{ padding: "14px 18px", direction: "rtl" }}>
              {AYAHS.map((ayah, ai) => (
                <div key={ai} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0", borderBottom: ai < AYAHS.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#c9a84c", fontWeight: 700, flexShrink: 0, marginTop: 6 }}>
                    {ayah.numEn}
                  </div>
                  <div style={{ fontFamily: "'Amiri Quran', serif", fontSize: 22, lineHeight: 2.2, flex: 1, textAlign: "right" }}>
                    {ayah.words.map((w, wi) => (
                      <span key={wi} style={{ display: "inline", cursor: "pointer", marginLeft: 4, ...wordStyle(w.state) }}>
                        {w.text}
                      </span>
                    ))}
                    <span style={{ color: "#c9a84c", fontSize: 15 }}> ﴿{ayah.num}﴾</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recording Panel */}
          <div style={{ background: "#122b1a", border: "1px solid rgba(201,168,76,0.12)", borderRadius: 18, padding: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "#c9a84c", fontWeight: 600 }}>
                {isRecording ? "● Listening · جارٍ الاستماع..." : "Tap to Start · اضغط للبدء"}
              </div>
            </div>

            <div
              onClick={() => setIsRecording(!isRecording)}
              style={{ width: 100, height: 100, borderRadius: "50%", background: "linear-gradient(135deg,rgba(201,168,76,0.1),rgba(46,107,62,0.18))", border: "1.5px solid rgba(201,168,76,0.3)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", animation: isRecording ? "ringPulse 2.5s ease-in-out infinite" : "none" }}
            >
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(145deg,#1a3d24,#0d2818)", border: "1px solid rgba(201,168,76,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
                🎙️
              </div>
            </div>

            <div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>00:12</div>

            {isRecording && (
              <div style={{ display: "flex", alignItems: "center", gap: 3, height: 40 }}>
                {[22,30,18,36,24,40,20,32,16,28,38,22].map((h, i) => (
                  <div key={i} style={{ width: 3, height: h, background: "linear-gradient(180deg,#c9a84c,rgba(201,168,76,0.3))", borderRadius: 2, animation: `waveAnim 1.2s ease-in-out ${i * 0.1}s infinite` }} />
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, width: "100%" }}>
              <button
                onClick={() => setIsRecording(false)}
                style={{ flex: 1, padding: "11px 0", borderRadius: 12, background: "rgba(235,87,87,0.15)", border: "1px solid rgba(235,87,87,0.3)", color: "#eb5757", fontFamily: "'Cairo',sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                ⏹ Stop · إيقاف
              </button>
              <button
                style={{ flex: 1, padding: "11px 0", borderRadius: 12, background: "linear-gradient(135deg,#c9a84c,#8b6914)", border: "none", color: "#0a1f13", fontFamily: "'Cairo',sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                Next Ayah · التالي →
              </button>
            </div>
          </div>

          {/* Live Score */}
          <div style={{ background: "#122b1a", border: "1px solid rgba(201,168,76,0.12)", borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 13, color: "#7a9e88", fontWeight: 700, marginBottom: 14 }}>
              Live Score · التقييم اللحظي
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
              <div style={{ width: 70, height: 70, borderRadius: "50%", background: "conic-gradient(#c9a84c 0deg 302deg,rgba(255,255,255,0.07) 302deg)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", flexShrink: 0 }}>
                <div style={{ position: "absolute", width: 52, height: 52, borderRadius: "50%", background: "#122b1a" }} />
                <span style={{ position: "relative", fontSize: 16, fontWeight: 700, color: "#c9a84c" }}>84%</span>
              </div>
              <div style={{ flex: 1 }}>
                {[
                  ["✅ Correct · صحيح", "3 words", "#6fcf97"],
                  ["❌ Error · خطأ",    "1 word",  "#eb5757"],
                  ["⏳ Left · متبقي",   "4 words", "#f2c94c"],
                ].map(([label, val, col], i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: "#7a9e88" }}>{label}</span>
                    <span style={{ color: col, fontWeight: 600 }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
              <div style={{ width: "84%", height: "100%", borderRadius: 2, background: "linear-gradient(90deg,#c9a84c,#6fcf97)" }} />
            </div>
          </div>

          {/* Stats */}
          <div>
            <div style={{ fontSize: 11, color: "#7a9e88", letterSpacing: 1.2, marginBottom: 10 }}>
              YOUR PROGRESS · تقدمك
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { icon: "📖", val: "7.5", en: "Juz Memorized", ar: "أجزاء محفوظة", change: "↑ +0.5 this week" },
                { icon: "🔥", val: "7",   en: "Day Streak",    ar: "سلسلة الأيام", change: "↑ Personal best!" },
                { icon: "⭐", val: "92%", en: "Avg Accuracy",  ar: "متوسط الدقة",  change: "↑ +4% this week" },
                { icon: "⏱️", val: "42",  en: "Mins Today",    ar: "دقيقة اليوم",  change: "Target: 60 mins" },
              ].map((s, i) => (
                <div key={i} style={{ background: "#122b1a", border: "1px solid rgba(201,168,76,0.12)", borderRadius: 14, padding: 16 }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: "#c9a84c", lineHeight: 1 }}>{s.val}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>{s.en}</div>
                  <div style={{ fontSize: 10, color: "#7a9e88" }}>{s.ar}</div>
                  <div style={{ fontSize: 11, color: "#6fcf97", marginTop: 5 }}>{s.change}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Juz Map */}
          <div style={{ background: "#122b1a", border: "1px solid rgba(201,168,76,0.12)", borderRadius: 16, padding: "18px 18px" }}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Juz Progress Map · خريطة الأجزاء</div>
              <div style={{ fontSize: 11, color: "#7a9e88" }}>30 Juz · ٣٠ جزءاً</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(10,1fr)", gap: 6 }}>
              {JUZ_STATES.map((state, i) => (
                <div key={i} title={`Juz ${i + 1}`} style={{
                  aspectRatio: "1", borderRadius: 7,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700, cursor: "pointer",
                  background: state === "done" ? "linear-gradient(135deg,#c9a84c,#8b6914)" : state === "partial" ? "rgba(201,168,76,0.22)" : "rgba(255,255,255,0.05)",
                  color: state === "done" ? "#0a1f13" : state === "partial" ? "#c9a84c" : "#7a9e88",
                  border: state === "empty" ? "1px solid rgba(255,255,255,0.07)" : state === "partial" ? "1px solid rgba(201,168,76,0.3)" : "none",
                }}>
                  {i + 1}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" as const }}>
              {[["#c9a84c","Memorized · محفوظ"],["rgba(201,168,76,0.4)","In Progress · جارٍ"],["rgba(255,255,255,0.15)","Not Started · لم يبدأ"]].map(([col,label],i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:"#7a9e88" }}>
                  <div style={{ width:10, height:10, borderRadius:3, background: col as string }} />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* Revision Schedule */}
          <div style={{ background: "#122b1a", border: "1px solid rgba(201,168,76,0.12)", borderRadius: 16, padding: "18px 18px" }}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>📅 Revision Schedule · جدول المراجعة</div>
            </div>
            {[
              { dot: "#eb5757", glow: "rgba(235,87,87,0.5)", en: "Juz 3 – Ali 'Imran",  ar: "آل عمران",  sub: "Last reviewed 12 days ago · منذ ١٢ يوم", badge: "Urgent · عاجل", bc: "rgba(235,87,87,0.15)", btc: "#eb5757", bb: "rgba(235,87,87,0.25)" },
              { dot: "#f2c94c", glow: "rgba(242,201,76,0.5)",  en: "Juz 5 – An-Nisa",    ar: "النساء",    sub: "Last reviewed 5 days ago · منذ 5 أيام",  badge: "Soon · قريباً", bc: "rgba(242,201,76,0.15)", btc: "#f2c94c", bb: "rgba(242,201,76,0.25)" },
              { dot: "#6fcf97", glow: "rgba(111,207,151,0.5)", en: "Juz 1 – Al-Fatihah", ar: "الفاتحة",   sub: "Reviewed yesterday · البارحة",            badge: "Good · بخير",   bc: "rgba(111,207,151,0.15)", btc: "#6fcf97", bb: "rgba(111,207,151,0.25)" },
            ].map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: r.dot, boxShadow: `0 0 6px ${r.glow}`, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {r.en} <span style={{ color: "#c9a84c", fontSize: 11 }}>· {r.ar}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#7a9e88" }}>{r.sub}</div>
                </div>
                <div style={{ fontSize: 10, padding: "3px 10px", borderRadius: 10, fontWeight: 700, background: r.bc, color: r.btc, border: `1px solid ${r.bb}`, whiteSpace: "nowrap" as const }}>
                  {r.badge}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
