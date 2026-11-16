// src/components/hifdh/HifdhTestQuestions.tsx
// Admin / teacher review: the test the student took after reciting — every question, the options,
// what the student chose and the right answer. Reads session_data.question_log (saved by HifdhDailyRevisionPage).

import React, { useState } from "react";
import { CheckCircle, XCircle, ChevronDown, ChevronUp, Mic, HelpCircle } from "lucide-react";

const G = "#064E3B";
const PASS = "#16A34A";
const FAIL = "#DC2626";
const AMBER = "#D97706";
const W = "#ffffff";
const FONT = "'Amiri Quran','Amiri','Scheherazade New',serif";

export interface LoggedQuestion {
  id?: number;
  type?: string;
  section?: "A" | "B";
  isErrorFocused?: boolean;
  answer_given?: number | null;
  correct?: boolean;
  // full wording — only present on logs saved after this was added
  prompt?: string;
  promptLabel?: string;
  options?: string[];
  correct_index?: number;
  correct_text?: string;
  listen_text?: string;
  record_prompt?: string;
  prompt_ar?: string;
  prompt_en?: string;
  prompt_sub_en?: string;
  options_en?: string[];
}

const TYPE_LABEL: Record<string, string> = {
  mcq_next: "What comes after this?",
  mcq_blank: "Fill in the missing word",
  mcq_continuation: "Continue from error area",
  record_continue: "Recite — continue from where the reciter stopped",
  record_complete: "Recite the missing verses",
  listen_choose: "Listen, then choose",
  listen_record: "Listen, then recite",
  tafsir_verse: "Tafsir — verse",
  tafsir_meaning: "Tafsir — meaning",
  quiz_fact: "Quiz",
};

const isRec = (t?: string) => t === "record_continue" || t === "record_complete" || t === "listen_record";

interface Props {
  log: LoggedQuestion[] | undefined | null;
  /** the % of the test the student passed with (completed) or last attempted (not passed) */
  score?: number | null;
  /** true when the student did not pass / finish the test */
  attempt?: boolean;
  sectionA?: number | null;
  sectionB?: number | null;
}

export default function HifdhTestQuestions({ log, score, attempt, sectionA, sectionB }: Props) {
  const [open, setOpen] = useState(false);
  const [openQ, setOpenQ] = useState<Set<number>>(new Set());

  if (!log || log.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12,
        background: "#F3F4F6", border: "1.5px dashed #D1D5DB" }}>
        <HelpCircle size={14} color="#9CA3AF" />
        <span style={{ fontSize: 11, color: "#9CA3AF", fontStyle: "italic" }}>
          The student has not taken the test for this session yet
        </span>
      </div>
    );
  }

  const right = log.filter((q) => q.correct).length;
  const pct = score ?? Math.round((right / log.length) * 100);
  const col = pct >= 70 ? PASS : pct >= 50 ? AMBER : FAIL;
  const toggleQ = (i: number) => setOpenQ((p) => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; });

  return (
    <div style={{ background: W, borderRadius: 12, border: "1px solid #E5E7EB", overflow: "hidden" }}>
      <div onClick={() => setOpen((o) => !o)} style={{ padding: "10px 14px", background: `${G}08`, cursor: "pointer",
        display: "flex", alignItems: "center", gap: 8, borderBottom: open ? "1px solid #E5E7EB" : "none" }}>
        <span style={{ fontWeight: 800, fontSize: 12, color: G, flex: 1 }}>
          📝 Test questions{attempt ? " — last attempt (not passed)" : ""}
          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: "#6B7280" }}>
            {right}/{log.length} correct
            {sectionA != null ? ` · A ${sectionA}%` : ""}{sectionB != null ? ` · B ${sectionB}%` : ""}
          </span>
        </span>
        <span style={{ fontWeight: 900, fontSize: 13, color: col }}>{pct}%</span>
        {open ? <ChevronUp size={14} color="#9CA3AF" /> : <ChevronDown size={14} color="#9CA3AF" />}
      </div>

      {open && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {log.map((q, i) => {
            const rec = isRec(q.type);
            const ok = !!q.correct;
            const given = q.answer_given;
            const hasText = !!(q.prompt || q.prompt_ar || q.prompt_en || (q.options && q.options.length));
            const isOpen = openQ.has(i) || !hasText;
            const label = TYPE_LABEL[q.type || ""] || q.promptLabel || "Question";
            return (
              <div key={i} style={{ borderTop: i ? "1px solid #F3F4F6" : "none" }}>
                <div onClick={() => hasText && toggleQ(i)} style={{ padding: "9px 14px", display: "flex", alignItems: "center", gap: 8,
                  cursor: hasText ? "pointer" : "default" }}>
                  {ok ? <CheckCircle size={15} color={PASS} /> : <XCircle size={15} color={FAIL} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1F2937" }}>
                      Q{i + 1} · {label}
                      {q.section && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: "#6B7280" }}>SECTION {q.section}</span>}
                      {q.isErrorFocused && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: AMBER }}>FROM HIS MISTAKES</span>}
                    </div>
                    {!isOpen && q.prompt && (
                      <div style={{ fontSize: 11, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", direction: "rtl", fontFamily: FONT }}>
                        {q.prompt}
                      </div>
                    )}
                    {!hasText && <div style={{ fontSize: 10, color: "#9CA3AF", fontStyle: "italic" }}>Question wording was not saved for this older session</div>}
                  </div>
                  {hasText && (isOpen ? <ChevronUp size={13} color="#9CA3AF" /> : <ChevronDown size={13} color="#9CA3AF" />)}
                </div>

                {isOpen && hasText && (
                  <div style={{ padding: "0 14px 12px 37px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {q.prompt_en && <div style={{ fontSize: 12, color: "#374151" }}>{q.prompt_en}</div>}
                    {q.prompt_ar && <div style={{ fontFamily: FONT, fontSize: 18, direction: "rtl", lineHeight: 1.9, color: "#111827" }}>{q.prompt_ar}</div>}
                    {q.prompt && (!q.prompt_ar || q.prompt_ar !== q.prompt) && (
                      <div style={{ fontFamily: FONT, fontSize: 20, direction: "rtl", lineHeight: 2, color: "#111827",
                        background: "#F9FAFB", borderRadius: 8, padding: "6px 10px" }}>{q.prompt}</div>
                    )}
                    {q.prompt_sub_en && <div style={{ fontSize: 11, color: "#6B7280", fontStyle: "italic" }}>{q.prompt_sub_en}</div>}
                    {q.listen_text && (
                      <div style={{ fontSize: 11, color: "#6B7280" }}>🔊 Reciter played: <span style={{ fontFamily: FONT, fontSize: 16, direction: "rtl", unicodeBidi: "embed" }}>{q.listen_text}</span></div>
                    )}

                    {rec ? (
                      <>
                        {q.record_prompt && (
                          <div style={{ fontSize: 11, color: "#6B7280" }}>
                            Student had to recite: <span style={{ fontFamily: FONT, fontSize: 16, direction: "rtl", unicodeBidi: "embed" }}>{q.record_prompt}</span>
                          </div>
                        )}
                        {q.correct_text && (
                          <div style={{ fontSize: 11, color: "#6B7280" }}>
                            Expected: <span style={{ fontFamily: FONT, fontSize: 16, direction: "rtl", unicodeBidi: "embed" }}>{q.correct_text}</span>
                          </div>
                        )}
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: ok ? PASS : FAIL }}>
                          <Mic size={12} /> {ok ? "Recitation passed" : given == null ? "Not answered" : "Recitation not passed"}
                        </div>
                      </>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {(q.options || []).map((opt, oi) => {
                          const isRight = oi === q.correct_index;
                          const isPicked = oi === given;
                          const bg = isRight ? "#F0FDF4" : isPicked ? "#FEF2F2" : "#FAFAFA";
                          const bd = isRight ? "#86EFAC" : isPicked ? "#FECACA" : "#E5E7EB";
                          return (
                            <div key={oi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8,
                              background: bg, border: `1.5px solid ${bd}` }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontFamily: FONT, fontSize: 18, direction: "rtl", lineHeight: 1.8, color: "#111827" }}>{opt}</div>
                                {q.options_en?.[oi] && <div style={{ fontSize: 10, color: "#6B7280" }}>{q.options_en[oi]}</div>}
                              </div>
                              {isRight && <span style={{ fontSize: 10, fontWeight: 800, color: PASS, flexShrink: 0 }}>✓ Correct</span>}
                              {isPicked && !isRight && <span style={{ fontSize: 10, fontWeight: 800, color: FAIL, flexShrink: 0 }}>Student's answer</span>}
                              {isPicked && isRight && <span style={{ fontSize: 10, fontWeight: 800, color: PASS, flexShrink: 0 }}>· chosen</span>}
                            </div>
                          );
                        })}
                        {given == null && <div style={{ fontSize: 11, fontWeight: 700, color: FAIL }}>Not answered (time ran out or skipped)</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
