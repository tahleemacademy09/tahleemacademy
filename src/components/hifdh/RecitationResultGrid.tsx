import React, { useMemo } from "react";
import { breakdownRecitation, type WordStatus } from "@/lib/recitationAlign";

interface Props {
  /** Expected words in reading order (original script, with diacritics). */
  words: string[];
  /** Per word: did the page's comparison count it as correct? Same length as `words`. */
  matched: boolean[];
  /** The transcript the model produced. */
  heardText: string;
  /** Seconds from tapping Stop to the result appearing (optional). */
  checkSecs?: number | null;
}

const GOLD = "#c9a84c";
const FONT = "'Amiri Quran','Amiri',serif";

const STYLE: Record<WordStatus, { bg: string; fg: string; strike?: boolean }> = {
  ok:     { bg: "#dcfce7", fg: "#166534" },
  close:  { bg: "#fef3c7", fg: "#92400e" },
  wrong:  { bg: "#fee2e2", fg: "#dc2626" },
  missed: { bg: "#fee2e2", fg: "#dc2626", strike: true },
};

const RecitationResultGrid: React.FC<Props> = ({ words, matched, heardText, checkSecs }) => {
  const b = useMemo(() => breakdownRecitation(words, heardText, matched), [words, heardText, matched]);

  const stat = (value: string, label: string) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: "#1a1209", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#6B7280" }}>{label}</div>
    </div>
  );

  const dot = (c: string, label: string) => (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, display: "inline-block", background: c }} />{label}
    </span>
  );

  return (
    <div style={{ borderRadius: 14, padding: 14, backgroundColor: "#fff", border: `1px solid ${GOLD}22` }}>
      {/* Stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        {stat(`${b.matched} / ${b.total}`, "words matched")}
        {stat(`${b.wer}%`, "word error rate")}
        {checkSecs != null && stat(`${checkSecs.toFixed(1)} s`, "check time")}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", fontSize: 11, color: "#6B7280", marginBottom: 10 }}>
        {dot("#16a34a", "correct")}
        {dot("#d97706", "close")}
        {dot("#dc2626", "wrong or missed")}
      </div>

      {/* Word grid */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 8px", padding: 12, borderRadius: 12, background: "#fffdf6", direction: "rtl" }}>
        {words.map((w, i) => {
          const s = STYLE[b.status[i]];
          return (
            <span key={i} style={{
              padding: "4px 10px", borderRadius: 8, fontFamily: FONT, fontSize: 18, fontWeight: 600,
              background: s.bg, color: s.fg, textDecoration: s.strike ? "line-through" : "none",
            }}>{w}</span>
          );
        })}
      </div>

      {b.extras.length > 0 && (
        <p style={{ margin: "10px 0 0", fontSize: 12, color: "#6B7280", lineHeight: 1.7 }}>
          Extra words heard: <span style={{ fontFamily: FONT, fontSize: 15, direction: "rtl", unicodeBidi: "embed" }}>{b.extras.join(" ")}</span>
        </p>
      )}

      {/* What the model heard */}
      <p style={{ margin: "14px 0 6px", fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: GOLD }}>
        What the model heard
      </p>
      <p style={{ margin: 0, fontFamily: FONT, fontSize: 17, lineHeight: 2, direction: "rtl", color: "#1a1a1a", overflowWrap: "anywhere" }}>
        {heardText.trim() || "(nothing heard)"}
      </p>
    </div>
  );
};

export default RecitationResultGrid;
