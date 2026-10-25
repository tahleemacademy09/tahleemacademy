import React from "react";
import type { WordResult, Grade } from "@/lib/recitationCompare";
import { tarteelEngine } from "@/lib/tarteelOnDevice";

/**
 * The green / yellow / red word grid. ONE component for everyone: the student's result screen and the admin /
 * teacher review screens render exactly this, from the same graded words (see recitationCompare.ts), so staff
 * always see what the student saw.
 *   green  – heard (a small gold dot = pronounced correctly, written differently in the Uthmani mushaf)
 *   yellow – the right word, one letter off
 *   red    – something else was heard, or the word was not heard (struck through)
 */
interface Props {
  /** The reference words, graded. */
  words: WordResult[];
  /** Words the model heard that are not in the text. */
  extras?: string[];
  /** The transcript the model produced. */
  heardText: string;
  /** Seconds the model took to transcribe the recording (optional, student screen). */
  checkSecs?: number | null;
  /** Marks shown after the last word of an ayah (staff screens). */
  ayahEnds?: { index: number; label: number }[];
  /** Show the on-device engine's "why nothing was heard" diagnostics (student screen only). */
  engineDiagnostics?: boolean;
  /** What the model heard for each word (same order as `words`). When given, it is written under each word. */
  heardWords?: string[];
}

const FONT = "'Amiri Quran','Amiri','Scheherazade New',serif";

// Dark card, tinted word tiles — same look as the Tarteel test page.
const CARD = "#18231f";
const CARD_BORDER = "#2a3a33";
const MUTED = "#9bb0a6";

const STYLE: Record<Grade, { bg: string; fg: string; strike?: boolean }> = {
  ok:     { bg: "#173d28", fg: "#86efac" },
  close:  { bg: "#43300f", fg: "#fcd34d" },
  wrong:  { bg: "#44201f", fg: "#fca5a5" },
  missed: { bg: "#44201f", fg: "#fca5a5", strike: true },
};

const RecitationResultGrid: React.FC<Props> = ({ words, extras = [], heardText, checkSecs, ayahEnds, engineDiagnostics = true, heardWords }) => {
  const total = words.length;
  const count = (g: Grade) => words.filter((w) => w.grade === g).length;
  const ok = count("ok"), close = count("close"), wrong = count("wrong"), missed = count("missed");
  const matched = ok + close;
  const wer = Math.round((100 * (wrong + missed + extras.length)) / Math.max(total, 1));
  const hasTag = words.some((w) => w.tag);
  const endAt = new Map((ayahEnds || []).map((e) => [e.index, e.label]));

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
        {stat(`${matched} / ${total}`, "words matched")}
        {stat(`${wer}%`, "word error rate")}
        {checkSecs != null && stat(`${checkSecs.toFixed(1)} s`, "transcribe time")}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 12, color: MUTED, marginBottom: 14 }}>
        {dot("#173d28", `correct (${ok})`)}
        {dot("#43300f", `one letter off (${close})`)}
        {dot("#44201f", `wrong or missed (${wrong + missed})`)}
        {hasTag && (
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: 7, background: "#e8c97a", display: "inline-block" }} />
            pronounced correctly — spelled differently in the Uthmani text
          </span>
        )}
      </div>

      {/* Word grid */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, direction: "rtl" }}>
        {words.map((w, i) => {
          const s = STYLE[w.grade];
          return (
            <React.Fragment key={i}>
              <span
                title={w.grade === "wrong" && w.heard ? `heard: ${w.heard}` : w.tag ? "Same sound — written differently in the Uthmani text" : undefined}
                style={{
                  position: "relative", padding: "6px 12px", borderRadius: 10, fontFamily: FONT, fontWeight: 600,
                  background: s.bg, color: s.fg,
                  display: heardWords ? "inline-flex" : "inline-block", flexDirection: "column", alignItems: "center",
                }}>
                <span style={{ fontSize: 24, lineHeight: 1.7, textDecoration: s.strike ? "line-through" : "none" }}>{w.word}</span>
                {heardWords && (
                  <span style={{ fontSize: 15, lineHeight: 1.5, direction: "rtl", opacity: 0.8, whiteSpace: "nowrap", marginTop: -2 }}>
                    {heardWords[i] || "—"}
                  </span>
                )}
                {w.tag && <span style={{ position: "absolute", top: 5, right: 5, width: 6, height: 6, borderRadius: 6, background: "#e8c97a" }} />}
              </span>
              {endAt.has(i) && (
                <span style={{ alignSelf: "center", color: "#e8c97a", fontFamily: FONT, fontSize: 16, padding: "0 2px" }}>۝{endAt.get(i)}</span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {extras.length > 0 && (
        <p style={{ margin: "14px 0 0", fontSize: 12, color: MUTED, lineHeight: 1.8 }}>
          Extra words heard: <span style={{ fontFamily: FONT, fontSize: 17, direction: "rtl", unicodeBidi: "embed", color: "#fca5a5" }}>{extras.join(" ")}</span>
        </p>
      )}

      {/* What the model heard */}
      <p style={{ margin: "22px 0 8px", fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: MUTED }}>
        What the model heard
      </p>
      <p style={{ margin: 0, fontFamily: FONT, fontSize: 22, lineHeight: 2.1, direction: "rtl", color: "#eef4f1", overflowWrap: "anywhere" }}>
        {heardText.trim() || "(nothing heard)"}
      </p>
      {engineDiagnostics && !heardText.trim() && (() => {
        const r = tarteelEngine.lastRun;
        if (!r) return null;
        const why =
          r.reason === "no_speech_detected" ? "No speech was detected in the recording — it was silent or far too quiet."
          : r.reason === "too_short" ? "The recording was too short."
          : r.reason === "model_returned_empty" ? "Speech was detected but the model returned no text."
          : r.reason;
        return (
          <p style={{ margin: "10px 0 0", fontSize: 11, color: MUTED, lineHeight: 1.7, direction: "ltr" }}>
            {why} (audio {r.audioSecs.toFixed(1)} s · peak {r.peak.toFixed(3)} · level {r.rms.toFixed(4)}
            {r.gatedSecs != null ? ` · sent to model ${r.gatedSecs.toFixed(1)} s` : ""})
          </p>
        );
      })()}
    </div>
  );
};

export default RecitationResultGrid;
