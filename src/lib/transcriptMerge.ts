/*
  transcriptMerge.ts
  ────────────────────────────────────────────────────────────────────────
  Joins the transcripts of two consecutive recording chunks that share a few seconds of audio.

  WHY IT CHANGED
  --------------
  The old merge only recognised the overlap when EVERY word of the shared audio was heard identically by both
  chunks. The two chunks hear that audio differently all the time (each one is cut right at the shared audio, so
  its first / last word is sliced in half and heard as another word): one word replaced, skipped or inserted was
  enough to make the whole overlap look "not shared", and the overlapping words were kept TWICE — words in the
  transcript that were only recited once ("وهو يدعى كذب وهو يدعى", "بينات قالوا بالبينات", "ظهره على الدين" …).

  HOW IT WORKS NOW
  ----------------
  The END of the earlier transcript is aligned with the START of the later one (words may differ, be missing or
  be extra). Inside the shared stretch, between the first and the last word both chunks agree on:
    · words both chunks heard  → kept once
    · a word only one chunk heard → kept (a word is never thrown away on weak evidence)
    · two different words in the same place → the chunk with the better context wins (earlier chunk in the first
      half of the stretch, later chunk in the second half)
  Outside it, the sliced edge words are dropped: the earlier chunk's last words and the later chunk's first
  words are the unreliable ones. Everything before / after the shared stretch is kept untouched.
*/
import { soundKey, isNearKey } from "@/lib/recitationCompare";

/** 2 = same sound, 1 = a close variant (one letter off, و/ف/ال or tanween-alef added/dropped, or one contains the other), 0 = different */
function wordSim(a: string, b: string, seam = false): 0 | 1 | 2 {
  if (!a || !b) return 0;
  if (a === b) return 2;
  if (isNearKey(a, b)) return 1;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  // a word sliced by the cut is a piece of the real one: بينات ⊂ بالبينات, رسول ⊂ برسولين (3 letters is enough at the seam itself)
  if (s.length >= (seam ? 3 : 4) && l.includes(s)) return 1;
  return 0;
}

const WINDOW = 30;                          // words of each side that can belong to the overlap
const MATCH = 3, FUZZY = 2, MISMATCH = -2, GAP = -2;

type Op = { t: "M" | "S" | "A" | "B"; ai: number; bj: number };   // match, substitution, a-only word, b-only word

/** Overlap alignment of the end of `ak` with the start of `bk` → the alignment's operations, or null when there is not enough evidence. */
function alignOverlap(ak: string[], bk: string[]): { ops: Op[]; aOff: number } | null {
  const aOff = Math.max(0, ak.length - WINDOW);
  const A = ak.slice(aOff), B = bk.slice(0, WINDOW);
  const n = A.length, m = B.length;
  const W = m + 1;
  const S = new Int32Array((n + 1) * W);     // best score aligning some suffix-start of A..i with B..j
  const D = new Uint8Array((n + 1) * W);     // 0 start, 1 diag, 2 up (A word has no partner), 3 left (B word has no partner)
  const sim = (i: number, j: number) => wordSim(A[i], B[j], i === n - 1 && j === 0);
  for (let j = 1; j <= m; j++) { S[j] = j * GAP; D[j] = 3; }
  for (let i = 1; i <= n; i++) {
    S[i * W] = 0; D[i * W] = 0;                // free start anywhere in A
    for (let j = 1; j <= m; j++) {
      const s = sim(i - 1, j - 1);
      const diag = S[(i - 1) * W + j - 1] + (s === 2 ? MATCH : s === 1 ? FUZZY : MISMATCH);
      const up = S[(i - 1) * W + j] + GAP;
      const left = S[i * W + j - 1] + GAP;
      let best = diag, d = 1;
      if (up > best) { best = up; d = 2; }
      if (left > best) { best = left; d = 3; }
      S[i * W + j] = best; D[i * W + j] = d;
    }
  }
  // the alignment must end at the last word of A; it may end anywhere in B
  let bj = 0, bs = S[n * W];
  for (let j = 1; j <= m; j++) if (S[n * W + j] > bs) { bs = S[n * W + j]; bj = j; }
  if (bj === 0) return null;

  const ops: Op[] = [];
  let i = n, j = bj;
  while (j > 0 && i > 0) {
    const d = D[i * W + j];
    if (d === 0) break;
    if (d === 1) { ops.push({ t: sim(i - 1, j - 1) > 0 ? "M" : "S", ai: i - 1 + aOff, bj: j - 1 }); i--; j--; }
    else if (d === 2) { ops.push({ t: "A", ai: i - 1 + aOff, bj: j }); i--; }
    else { ops.push({ t: "B", ai: i + aOff, bj: j - 1 }); j--; }
  }
  ops.reverse();
  const matches = ops.filter((o) => o.t === "M");
  if (matches.length < 2) return null;
  const first = matches[0], last = matches[matches.length - 1];
  const span = Math.max(last.bj - first.bj + 1, last.ai - first.ai + 1);
  const dense = matches.length >= 3 && matches.length >= 0.6 * span;
  // two shared words are enough when they sit right where the cut is: the very end of `prev`, the very start of `next`
  const atSeam = matches.length === 2 && last.ai === first.ai + 1 && last.bj === first.bj + 1
    && last.ai >= ak.length - 2 && first.bj <= 2;
  if (!dense && !atSeam) return null;
  return { ops: ops.slice(ops.indexOf(first), ops.indexOf(last) + 1), aOff };
}

/** The previous exact-run merge (kept as a fallback for tiny overlaps). */
function mergeExact(a: string[], b: string[], ak: string[], bk: string[]): string {
  let best: { k: number; drops: number; dt: number; sh: number } | null = null;
  for (let dt = 0; dt <= 1; dt++) {
    for (let sh = 0; sh <= 1; sh++) {
      const aEnd = a.length - dt;
      const maxK = Math.min(10, aEnd, b.length - sh);
      for (let k = maxK; k >= 2; k--) {
        let ok = true;
        for (let i = 0; i < k && ok; i++) ok = wordSim(ak[aEnd - k + i], bk[sh + i]) > 0;
        if (ok && (dt + sh === 0 || k >= 3)) {
          const drops = dt + sh;
          if (!best || k > best.k || (k === best.k && drops < best.drops)) best = { k, drops, dt, sh };
          break;
        }
      }
    }
  }
  if (best) return [...a.slice(0, a.length - best.dt), ...b.slice(best.sh + best.k)].join(" ");
  const la = ak[ak.length - 1];
  if (la.length >= 3 && la === bk[0]) return [...a, ...b.slice(1)].join(" ");
  // the word cut in half: the earlier chunk's last word is a piece of / contains the later chunk's first word
  if (la && bk[0] && wordSim(la, bk[0], true) === 1) return [...a.slice(0, -1), ...b].join(" ");
  return [...a, ...b].join(" ");
}

/**
 * Merge `next` onto `prev`. `overlapped` = false when the chunks were cut inside a pause and share no audio:
 * then nothing is duplicated and nothing is ever dropped.
 */
export function mergeHeard(prev: string, next: string, overlapped = true): string {
  const a = prev.trim().split(/\s+/).filter(Boolean);
  const b = next.trim().split(/\s+/).filter(Boolean);
  if (!a.length) return b.join(" ");
  if (!b.length) return a.join(" ");
  if (!overlapped) return [...a, ...b].join(" ");
  const ak = a.map((w) => soundKey(w)), bk = b.map((w) => soundKey(w));

  const al = alignOverlap(ak, bk);
  if (!al) return mergeExact(a, b, ak, bk);

  const { ops } = al;
  const first = ops[0], last = ops[ops.length - 1];
  const mid = (first.bj + last.bj) / 2;                 // first half of the shared stretch → earlier chunk, second half → later chunk
  const shared: string[] = [];
  for (const o of ops) {
    if (o.t === "M") shared.push(a[o.ai]);
    else if (o.t === "A") shared.push(a[o.ai]);          // only the earlier chunk heard it — keep
    else if (o.t === "B") shared.push(b[o.bj]);          // only the later chunk heard it — keep
    else shared.push(o.bj <= mid ? a[o.ai] : b[o.bj]);   // two different words: trust the chunk with the better context
  }
  return [...a.slice(0, first.ai), ...shared, ...b.slice(last.bj + 1)].join(" ");
}
