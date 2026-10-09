import React, { useMemo } from "react";
import { breakdownRecitation, type WordStatus } from "@/lib/recitationAlign";

interface Props {
  /** Expected words in reading order (original script, with diacritics). */
  words: string[];
  /** Per word: did the page's comparison count it as correct? Same length as `words`. */
  matched: boolean[];
  /** The transcript the Tarteel model produced. */
  heardText: string;
  /** Seconds the model took to transcribe the recording (optional). */
  checkSecs?: number | null;
}

const FONT = "'Amiri Quran','Amiri','Scheherazade New',serif";

// Dark card, tinted word tiles — same look as the Tarteel test page.
const CARD = "#18231f";
const CARD_BORDER = "#2a3a33";
const MUTED = "#9bb0a6";

const STYLE: Record<WordStatus, { bg: string; fg: string; strike?: boolean }> = {
  ok:     { bg: "#173d28", fg: "#86efac" },
  close:  { bg: "#43300f", fg: "#fcd34d" },
  wrong:  { bg: "#44201f", fg: "#fca5a5" },
  missed: { bg: "#44201f", fg: "#fca5a5", strike: true },
};

const RecitationResultGrid: React.FC<Props> = ({ words, matched, heardText, checkSecs }) => {
  const b = useMemo(() => breakdownRecitation(words, heardText, matched), [words, heardText, matched]);

  const stat = (value: string, label: string) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#f3f7f5", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>{label}</div>
    </div>
  );

  const dot = (c: string, label: string) => (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 12, height: 12, borderRadius: 4, display: "inline-block", background: c }} />{label}
    </span>
  );

  return (
    <div style={{ borderRadius: 18, padding: "18px 16px", background: CARD, border: `1px solid ${CARD_BORDER}`, boxShadow: "0 6px 24px rgba(0,0,0,.18)" }}>
      {/* Stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        {stat(`${b.matched} / ${b.total}`, "words matched")}
        {stat(`${b.wer}%`, "word error rate")}
        {checkSecs != null && stat(`${checkSecs.toFixed(1)} s`, "transcribe time")}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 12, color: MUTED, marginBottom: 14 }}>
        {dot("#173d28", "correct")}
        {dot("#43300f", "close")}
        {dot("#44201f", "wrong or missed")}
      </div>

      {/* Word grid */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, direction: "rtl" }}>
        {words.map((w, i) => {
          const s = STYLE[b.status[i]];
          return (
            <span key={i} style={{
              padding: "6px 12px", borderRadius: 10, fontFamily: FONT, fontSize: 24, lineHeight: 1.7, fontWeight: 600,
              background: s.bg, color: s.fg, textDecoration: s.strike ? "line-through" : "none",
            }}>{w}</span>
          );
        })}
      </div>

      {b.extras.length > 0 && (
        <p style={{ margin: "14px 0 0", fontSize: 12, color: MUTED, lineHeight: 1.8 }}>
          Extra words heard: <span style={{ fontFamily: FONT, fontSize: 17, direction: "rtl", unicodeBidi: "embed", color: "#fca5a5" }}>{b.extras.join(" ")}</span>
        </p>
      )}

      {/* What the model heard */}
      <p style={{ margin: "22px 0 8px", fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: MUTED }}>
        What the model heard
      </p>
      <p style={{ margin: 0, fontFamily: FONT, fontSize: 22, lineHeight: 2.1, direction: "rtl", color: "#eef4f1", overflowWrap: "anywhere" }}>
        {heardText.trim() || "(nothing heard)"}
      </p>
    </div>
  );
};

export default RecitationResultGrid;
