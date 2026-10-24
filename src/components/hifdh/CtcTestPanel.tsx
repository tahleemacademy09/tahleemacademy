import React, { useState } from "react";
import { ctcStatus, type CtcCheckResult } from "@/lib/ctcEngine";

/** CTC-only test mode: small info card under the word grid — timing, what the model heard, and a copy button. */
interface Props { ctc: CtcCheckResult | null; words: { word: string; grade: string }[]; error?: string }

const CtcTestPanel: React.FC<Props> = ({ ctc, words, error }) => {
  const [copied, setCopied] = useState(false);
  if (!ctc && !error) return null;
  const copy = async () => {
    if (!ctc) return;
    const payload = {
      secs: +ctc.secs.toFixed(1), ms: ctc.ms, partial: !!ctc.partial, covered: ctc.covered, basmalah: ctc.basmalah, greedy: ctc.greedy,
      words: words.map((w, i) => ({ i: i + 1, word: w.word, ctc: ctcStatus(ctc.words[i]?.mean ?? null),
        mean: ctc.words[i]?.mean != null ? +ctc.words[i].mean!.toFixed(2) : null, min: ctc.words[i]?.min != null ? +ctc.words[i].min!.toFixed(2) : null })),
    };
    try { await navigator.clipboard.writeText(JSON.stringify(payload, null, 1)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* noop */ }
  };
  return (
    <div style={{ background: "#18231f", border: "1px solid #2a3a33", borderRadius: 14, padding: 12, color: "#f3f7f5", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#e6c97a" }}>🧪 CTC-only test mode <span style={{ opacity: 0.7, fontWeight: 600 }}>(Tarteel is off)</span></div>
      {error && <div style={{ fontSize: 12, color: "#fca5a5", wordBreak: "break-word" }}>Check failed: {error}</div>}
      {ctc && (
        <>
          <div style={{ fontSize: 12, color: "#9bb0a6" }}>
            Audio {ctc.secs.toFixed(1)} s · checked in {(ctc.ms / 1000).toFixed(1)} s ({(ctc.ms / 1000 / Math.max(ctc.secs, 0.1)).toFixed(2)}× real time){ctc.basmalah ? " · Basmalah ignored" : ""}
          </div>
          <div style={{ fontSize: 11, color: "#9bb0a6", lineHeight: 1.5 }}>Green = heard · yellow = unsure · red struck-through = not heard (skipped). No Tarteel transcript is used.</div>
          <button onClick={copy} style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 700, padding: "6px 10px", borderRadius: 8, border: "1px solid #2a3a33", background: "#0f1a15", color: "#e6c97a", cursor: "pointer" }}>
            {copied ? "Copied ✓" : "Copy results (to send to Claude)"}
          </button>
        </>
      )}
    </div>
  );
};
export default CtcTestPanel;
