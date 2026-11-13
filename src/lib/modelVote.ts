/*
  modelVote.ts — one final grade per word from several models (CTC, Tarteel, cloud Whisper).

  Each model's grade is worth: ok = 1, close = 0.5, wrong/missed = 0, multiplied by the model's weight.
  CTC has the highest weight because it checks every reference word against the audio, so it is the one
  that catches skipped words. Whisper and Tarteel tend to "correct" a mistake back to the right word.

    vote ≥ 0.6  → green  (CTC plus any other model, or CTC green alone when only CTC + one model ran)
    vote ≥ 0.4  → amber  (e.g. CTC red but Tarteel and Whisper both heard it, or only CTC accepted it)
    below       → red    (nobody convincing heard it)
*/
import type { Grade, WordResult } from "./recitationCompare";

export type VoteModel = "ctc" | "tarteel" | "whisper_cf";

export const VOTE_WEIGHTS: Record<VoteModel, number> = { ctc: 2, tarteel: 1, whisper_cf: 1 };
const GREEN_AT = 0.6;
const AMBER_AT = 0.4;

const POINTS: Record<Grade, number> = { ok: 1, close: 0.5, wrong: 0, missed: 0 };
const SEVERITY: Grade[] = ["missed", "wrong", "close", "ok"]; // low index = worse

export function voteWord(entries: { model: VoteModel; word: WordResult }[]): WordResult {
  const total = entries.reduce((s, e) => s + (VOTE_WEIGHTS[e.model] ?? 1), 0) || 1;
  const got = entries.reduce((s, e) => s + (VOTE_WEIGHTS[e.model] ?? 1) * POINTS[e.word.grade], 0);
  const v = got / total;
  // the entry to build the result from: best-graded for green/amber, one that says what was heard for red
  const byBest = [...entries].sort((a, b) => SEVERITY.indexOf(b.word.grade) - SEVERITY.indexOf(a.word.grade));
  if (v >= GREEN_AT) return { ...byBest[0].word, status: "correct", grade: "ok", credit: 1, heard: undefined };
  if (v >= AMBER_AT) return { ...byBest[0].word, status: "missing", grade: "close", credit: 0.5 };
  const withHeard = entries.find((e) => e.word.grade === "wrong" && e.word.heard);
  const base = (withHeard ?? byBest[byBest.length - 1]).word;
  return { ...base, status: "missing", grade: base.grade === "wrong" ? "wrong" : "missed", credit: 0 };
}

/** All models must have graded the same reference words (same length). */
export function voteAll(runs: { model: VoteModel; words: WordResult[] }[]): WordResult[] {
  if (!runs.length) return [];
  const n = runs[0].words.length;
  const out: WordResult[] = [];
  for (let i = 0; i < n; i++) out.push(voteWord(runs.map((r) => ({ model: r.model, word: r.words[i] }))));
  return out;
}
