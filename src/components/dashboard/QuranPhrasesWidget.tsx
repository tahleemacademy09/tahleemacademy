/*  src/components/dashboard/QuranPhrasesWidget.tsx
    Random Quranic phrases / words with meanings — refreshes on each visit
*/
import { useState, useEffect } from "react";

const PHRASES = [
  { ar: "بِسْمِ ٱللَّهِ", en: "In the name of Allah", meaning: "Said before starting any action" },
  { ar: "ٱلْحَمْدُ لِلَّهِ", en: "All praise is for Allah", meaning: "Expression of gratitude" },
  { ar: "سُبْحَانَ ٱللَّهِ", en: "Glory be to Allah", meaning: "Declaring Allah's perfection" },
  { ar: "ٱللَّهُ أَكْبَرُ", en: "Allah is the Greatest", meaning: "Acknowledging Allah's greatness" },
  { ar: "إِن شَاءَ ٱللَّهُ", en: "If Allah wills", meaning: "Used for future intentions" },
  { ar: "مَا شَاءَ ٱللَّهُ", en: "What Allah has willed", meaning: "Expressing admiration or amazement" },
  { ar: "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِٱللَّهِ", en: "No power except through Allah", meaning: "Seeking strength from Allah" },
  { ar: "تَوَكَّلْتُ عَلَى ٱللَّهِ", en: "I put my trust in Allah", meaning: "Reliance on Allah alone" },
  { ar: "جَزَاكَ ٱللَّهُ خَيْرًا", en: "May Allah reward you with good", meaning: "Thanking someone" },
  { ar: "بَارَكَ ٱللَّهُ فِيكَ", en: "May Allah bless you", meaning: "Invoking blessings on someone" },
  { ar: "أَسْتَغْفِرُ ٱللَّهَ", en: "I seek forgiveness from Allah", meaning: "Seeking Allah's pardon" },
  { ar: "يَا رَبِّ", en: "O my Lord", meaning: "A direct call to Allah" },
  { ar: "رَبَّنَا آتِنَا فِي ٱلدُّنْيَا حَسَنَةً", en: "Our Lord, give us good in this world", meaning: "Quran 2:201" },
  { ar: "حَسْبُنَا ٱللَّهُ وَنِعْمَ ٱلْوَكِيلُ", en: "Sufficient for us is Allah, the best Disposer", meaning: "Quran 3:173" },
  { ar: "رَبِّ ٱشْرَحْ لِي صَدْرِي", en: "My Lord, expand my chest for me", meaning: "Quran 20:25 — Musa's dua" },
  { ar: "رَبِّ زِدْنِي عِلْمًا", en: "My Lord, increase me in knowledge", meaning: "Quran 20:114" },
  { ar: "رَبَّنَا لَا تُزِغْ قُلُوبَنَا", en: "Our Lord, let not our hearts deviate", meaning: "Quran 3:8" },
  { ar: "إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ", en: "We belong to Allah and to Him we return", meaning: "Said upon hearing of loss" },
  { ar: "لَا إِلٰهَ إِلَّا ٱللَّهُ", en: "There is no deity except Allah", meaning: "The declaration of faith" },
  { ar: "صَلَّى ٱللَّهُ عَلَيْهِ وَسَلَّمَ", en: "Peace and blessings upon him", meaning: "Said after mentioning the Prophet ﷺ" },
];

interface Props { language: string; }

export default function QuranPhrasesWidget({ language }: Props) {
  const [phrases, setPhrases] = useState<typeof PHRASES>([]);

  useEffect(() => {
    // Pick 3 random phrases
    const shuffled = [...PHRASES].sort(() => Math.random() - 0.5);
    setPhrases(shuffled.slice(0, 3));
  }, []);

  const refresh = () => {
    const shuffled = [...PHRASES].sort(() => Math.random() - 0.5);
    setPhrases(shuffled.slice(0, 3));
  };

  return (
    <div style={{
      background: "#fff", border: "1px solid rgba(15,45,31,0.1)",
      borderRadius: 18, boxShadow: "0 2px 12px rgba(0,0,0,.06)", overflow: "hidden"
    }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(15,45,31,0.1)",
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>📿</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#0f2d1f", fontFamily: "'Playfair Display',serif" }}>
            {language === "ar" ? "كلمات قرآنية" : "Quranic Phrases"}
          </span>
        </div>
        <button onClick={refresh} style={{ background: "none", border: "none", cursor: "pointer",
          fontSize: 11, fontWeight: 600, color: "#c9a84c" }}>
          {language === "ar" ? "تحديث" : "Refresh"} ↻
        </button>
      </div>
      <div style={{ padding: "14px 16px" }}>
        {phrases.map((p, i) => (
          <div key={i} style={{
            padding: "12px 14px", borderRadius: 12, marginBottom: i < 2 ? 8 : 0,
            background: i === 0 ? "#f0fff4" : "#f8fafb",
            border: `1px solid ${i === 0 ? "#d4e8d4" : "rgba(15,45,31,0.06)"}`,
          }}>
            <div style={{ fontFamily: "'Amiri Quran','Amiri',serif", fontSize: 22, color: "#1a3d24",
              textAlign: "center", lineHeight: 1.8, direction: "rtl", marginBottom: 6 }}>
              {p.ar}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a3d24", textAlign: "center" }}>
              {p.en}
            </div>
            <div style={{ fontSize: 11, color: "#7a9e88", textAlign: "center", marginTop: 2, fontStyle: "italic" }}>
              {p.meaning}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
