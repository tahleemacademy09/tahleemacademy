/*
  recitationAlign.ts
  ────────────────────────────────────────────────────────────────────────
  Word-by-word breakdown of a recitation: every expected word is classed as
    ok      – heard exactly
    close   – heard, but one letter off
    wrong   – something else was heard in its place
    missed  – not heard at all
  plus the extra words the model heard that are not in the text.

  Ported from the aligner in public/tarteel_browser_test.html.

  IMPORTANT: the page's score badge and its "correct / missing" counts come from
  compareWords() (LCS). To keep one source of truth, `breakdownRecitation` takes
  that result as `matched` and only REFINES it: matched words become ok/close,
  unmatched words become wrong/missed. Matched count therefore always equals the
  badge's correct count.
*/
import { tarteelWordKey, tarteelWords } from "@/lib/tarteelOnDevice";

export type WordStatus = "ok" | "close" | "wrong" | "missed";

export interface RecitationBreakdown {
  status: WordStatus[];
  extras: string[];
  total: number;
  matched: number;   // ok + close
  wrong: number;
  missed: number;
  /** (wrong + missed + extras) / total, as a whole percent */
  wer: number;
}

function lev1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function isClose(a: string, b: string): boolean {
  return a.length >= 4 && b.length >= 4 && lev1(a, b);
}

/** Global alignment (edit-distance style) of expected words against heard words. */
export function alignWords(expectedWords: string[], heardWords: string[]): { status: WordStatus[]; extras: string[] } {
  const E = expectedWords.map(tarteelWordKey);
  const H = heardWords.map(tarteelWordKey);
  const n = E.length, m = H.length;
  const MATCH = 0, CLOSE = 4, WRONG = 12, GAP = 10;
  const sub = (i: number, j: number) => (E[i] === H[j] ? MATCH : isClose(E[i], H[j]) ? CLOSE : WRONG);

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) dp[i][0] = i * GAP;
  for (let j = 1; j <= m; j++) dp[0][j] = j * GAP;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = Math.min(dp[i - 1][j - 1] + sub(i - 1, j - 1), dp[i - 1][j] + GAP, dp[i][j - 1] + GAP);
    }
  }

  const status: WordStatus[] = new Array(n).fill("missed");
  const extras: string[] = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + sub(i - 1, j - 1)) {
      const c = sub(i - 1, j - 1);
      status[i - 1] = c === MATCH ? "ok" : c === CLOSE ? "close" : "wrong";
      i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + GAP) {
      status[i - 1] = "missed";
      i--;
    } else {
      extras.unshift(heardWords[j - 1]);
      j--;
    }
  }
  return { status, extras };
}

/**
 * @param expectedWords words of the page, in order (original script)
 * @param heardText     the transcript
 * @param matched       per expected word: did the page's own comparison count it as correct?
 */
export function breakdownRecitation(expectedWords: string[], heardText: string, matched: boolean[]): RecitationBreakdown {
  const { status: raw, extras } = alignWords(expectedWords, tarteelWords(heardText));
  const status: WordStatus[] = raw.map((s, i) => {
    if (matched[i]) return s === "ok" ? "ok" : "close";   // counted correct by the score → never red
    return s === "missed" ? "missed" : "wrong";            // counted missing by the score → never green
  });
  const total = expectedWords.length;
  const count = (s: WordStatus) => status.filter((x) => x === s).length;
  const wrong = count("wrong"), missed = count("missed");
  return {
    status, extras, total,
    matched: count("ok") + count("close"),
    wrong, missed,
    wer: Math.round((100 * (wrong + missed + extras.length)) / Math.max(total, 1)),
  };
}
