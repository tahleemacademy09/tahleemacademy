// src/lib/revealEngine.ts
// Live "read & reveal" matching engine for the Ramadan Programs page.
// Pure TypeScript (no React / DOM) so it can be unit-tested. Feed it the words the speech recogniser hears and it
// advances a cursor through the expected passage, grading each word: ok / close / wrong / missed.
//
// Differences from the first prototype (strict string equality):
//  • sound-based fuzzy matching (reuses quranCheck soundKey/similarity) — ٱللَّه / الله / اللّه all match
//  • look-ahead resync when the reciter skips words, instead of cascading red words
//  • unmatched noise never advances the cursor (a single mis-heard token no longer ruins the next words)
//  • joined / split tokens ("ولم" ↔ "و لم") are handled
//  • interim (not-yet-final) tokens reveal words optimistically but never flag errors
import { normalizeWord, similarity, soundKey, OK_T, CHECK_T } from "./quranCheck";

export type RevealStatus = "pending" | "ok" | "close" | "wrong" | "missed";

export interface RevealWord {
  text: string;      // Uthmani text exactly as displayed
  key: string;       // soundKey of the word
  ayah: number;      // ayah number in the surah (0 = bismillah)
  idxInAyah: number;
}

export interface RevealState {
  status: RevealStatus[];
  heard: (string | null)[];   // what was heard for each word (for the review panel)
  cursor: number;             // index of the next expected word
  junk: string[];             // unmatched tokens since the last match (used to tell "wrong" from "missed")
  blocked: boolean;           // strict mode: a mistake was made at `cursor` and must be corrected before moving on
  errors: number;             // number of mistakes made so far (strict mode)
  fixed: boolean[];           // word was recited correctly only after a mistake
}

export const LOOKAHEAD = 3;

export function buildWords(ayahs: { n: number; text: string }[], bismillah?: string): RevealWord[] {
  const out: RevealWord[] = [];
  const push = (text: string, ayah: number) => {
    const parts = text.split(/\s+/).filter((w) => normalizeWord(w));
    parts.forEach((w, i) => out.push({ text: w, key: soundKey(w), ayah, idxInAyah: i }));
  };
  if (bismillah) push(bismillah, 0);
  ayahs.forEach((a) => push(a.text, a.n));
  return out;
}

export const initialState = (n: number): RevealState => ({
  status: new Array(n).fill("pending"),
  heard: new Array(n).fill(null),
  cursor: 0,
  junk: [],
  blocked: false,
  errors: 0,
  fixed: new Array(n).fill(false),
});

export const cloneState = (s: RevealState): RevealState => ({
  status: s.status.slice(), heard: s.heard.slice(), cursor: s.cursor, junk: s.junk.slice(),
  blocked: s.blocked, errors: s.errors, fixed: s.fixed.slice(),
});

const grade = (sim: number): RevealStatus | null => (sim >= OK_T ? "ok" : sim >= CHECK_T ? "close" : null);

/** Short words (≤2 letters) are too easy to hit by chance, so they need an exact sound match. */
function sim(word: RevealWord, token: string): number {
  if (!token || !word.key) return 0;
  if (word.key.length <= 2 || token.length <= 2) return word.key === token ? 1 : 0;
  return similarity(word.key, token);
}

/** The word the app itself says when it flags a mistake ("خطأ") — if the mic picks it up, ignore it. */
const ERR_KEY = soundKey("خطأ");

/**
 * Advance the state with ONE heard token (mutates `s`). `final` = the recogniser committed this word;
 * only final tokens may flag wrong/missed words in normal mode — interim tokens can only reveal.
 * `strict` = the reader must fix every mistake before the passage moves on (cursor stays on the bad word).
 * `next` is the following token (if any) so a split word can be re-joined.
 * Returns how many tokens were consumed (1 or 2).
 */
function step(words: RevealWord[], s: RevealState, rawToken: string, next: string | undefined, final: boolean, strict: boolean): number {
  const n = words.length;
  if (s.cursor >= n) return 1;
  const token = soundKey(rawToken);
  if (!token || token === ERR_KEY) return 1;

  /** Accept the word at the cursor. After a mistake it counts as "close" (corrected), never a clean "ok". */
  const accept = (g: RevealStatus, heard: string) => {
    const i = s.cursor;
    if (s.blocked) { s.status[i] = "close"; s.fixed[i] = true; s.blocked = false; } else s.status[i] = g;
    s.heard[i] = heard; s.cursor++; s.junk = [];
  };
  const block = (heard: string) => {
    if (!s.blocked) { s.blocked = true; s.errors++; }
    s.heard[s.cursor] = heard;
  };

  // 1. the expected word
  const cur = words[s.cursor];
  const g = grade(sim(cur, token));
  if (g) { accept(g, rawToken); return 1; }

  // 2. the recogniser split one word in two ("و" + "لم" for "ولم") → try joining with the next token
  if (next) {
    const nk = soundKey(next);
    const gj = nk ? grade(sim(cur, token + nk)) : null;
    if (gj) { accept(gj, `${rawToken} ${next}`); return 2; }
  }

  // 3. the recogniser glued two words together → expected word + the following one
  if (s.cursor + 1 < n) {
    const glued = cur.key + words[s.cursor + 1].key;
    if (glued.length >= 5 && similarity(glued, token) >= 0.88) {
      accept("ok", rawToken);
      s.status[s.cursor] = "ok"; s.heard[s.cursor] = rawToken; s.cursor++;
      return 1;
    }
  }

  // 4. a repeat of a word just recited (recognisers repeat; in strict mode the reader restarts the phrase) → ignore
  for (let k = 1; k <= (strict ? 3 : 1) && s.cursor - k >= 0; k++) {
    if (grade(sim(words[s.cursor - k], token)) === "ok") return 1;
  }

  // 5. the reader jumped ahead
  if (strict) {
    // skipped a word → mistake: stay on it until it is said
    if (token.length >= 3) {
      for (let j = s.cursor + 1; j < Math.min(n, s.cursor + 1 + LOOKAHEAD); j++) {
        if (sim(words[j], token) >= OK_T) { block(rawToken); return 1; }
      }
    }
  } else if (final) {
    for (let j = s.cursor + 1; j < Math.min(n, s.cursor + 1 + LOOKAHEAD); j++) {
      if (sim(words[j], token) >= OK_T) {
        for (let k = s.cursor; k < j; k++) {
          const wrong = k === s.cursor && s.junk.length > 0;
          s.status[k] = wrong ? "wrong" : "missed";
          s.heard[k] = wrong ? s.junk.join(" ") : null;
        }
        s.status[j] = "ok"; s.heard[j] = rawToken; s.cursor = j + 1; s.junk = [];
        return 1;
      }
    }
  }

  // 6. a different word was said: remember it (final tokens only, so interim jitter is ignored);
  //    in strict mode that is a mistake and the cursor stays put until it is corrected
  if (final) { s.junk.push(rawToken); if (strict && token.length >= 2) block(rawToken); }
  return 1;
}

/** Feed a list of tokens (mutates `s`). */
export function feed(words: RevealWord[], s: RevealState, tokens: string[], final: boolean, strict = false): RevealState {
  const clean = tokens.filter((t) => soundKey(t));
  for (let i = 0; i < clean.length;) i += step(words, s, clean[i], clean[i + 1], final, strict);
  return s;
}

/** Give up on the current word (tap "skip"): it is graded "missed" and the cursor moves on. */
export function skipWord(words: RevealWord[], s: RevealState): RevealState {
  const out = cloneState(s);
  if (out.cursor < words.length) { out.status[out.cursor] = "missed"; out.heard[out.cursor] = null; out.cursor++; out.junk = []; out.blocked = false; }
  return out;
}

/** Reveal-ahead by hand (testing helper): marks the next word, or the rest of the current ayah, as correct. */
export function manualReveal(words: RevealWord[], s: RevealState, byAyah: boolean): RevealState {
  const out = cloneState(s);
  if (out.cursor >= words.length) return out;
  const ayah = words[out.cursor].ayah;
  do {
    out.status[out.cursor] = "ok"; out.heard[out.cursor] = null; out.cursor++;
  } while (byAyah && out.cursor < words.length && words[out.cursor].ayah === ayah);
  out.junk = []; out.blocked = false;
  return out;
}

export interface RevealSummary {
  errors: number; fixed: number;
  total: number; ok: number; close: number; wrong: number; missed: number; pending: number;
  /** 0..1 — ok + half credit for close, over all words */
  score: number;
  done: boolean;
}

export function summarize(s: RevealState): RevealSummary {
  const c = { ok: 0, close: 0, wrong: 0, missed: 0, pending: 0 };
  s.status.forEach((x) => c[x]++);
  const total = s.status.length;
  return { errors: s.errors, fixed: s.fixed.filter(Boolean).length, total, ...c, score: total ? (c.ok + c.close * 0.5) / total : 0, done: total > 0 && s.cursor >= total };
}

/**
 * Is an ayah visible in "ayah by ayah" mode? An ayah is revealed once the reciter has moved past it
 * (all its words have a grade), so one weak word never hides the rest of the ayah.
 */
export function ayahDone(words: RevealWord[], s: RevealState, ayah: number): boolean {
  let any = false;
  for (let i = 0; i < words.length; i++) {
    if (words[i].ayah !== ayah) continue;
    any = true;
    if (s.status[i] === "pending") return false;
  }
  return any;
}

/** Split a transcript into words. */
export const tokenize = (text: string): string[] => text.split(/\s+/).filter((w) => soundKey(w));

/**
 * Android Chrome (continuous mode) often returns CUMULATIVE results: "قل هو" then "قل هو الله" as separate entries.
 * If `cur` starts with all of `prev` (needs ≥ 2 words, so a legitimate repeat of one word is not swallowed),
 * only the new tail is returned; otherwise `cur` is returned unchanged.
 */
export function stripCumulative(prev: string[], cur: string[]): string[] {
  if (prev.length < 2 || cur.length < prev.length) return cur;
  for (let i = 0; i < prev.length; i++) {
    if (similarity(soundKey(prev[i]), soundKey(cur[i])) < 0.8) return cur;
  }
  return cur.slice(prev.length);
}

/** Heuristic quality of a state, used to choose between the recogniser's alternative transcripts. */
export const stateScore = (s: RevealState): number =>
  s.status.reduce((a, x) => a + (x === "ok" ? 2 : x === "close" ? 1 : x === "wrong" ? -2 : x === "missed" ? -1.5 : 0), 0);

/** First letter of a word including its diacritics — used for the "hint" button. */
export const firstLetter = (w: string): string => w.match(/^[ء-يٱ][ً-ٰٟۖ-ۭ]*/)?.[0] ?? w.slice(0, 1);
