// src/lib/quranCheck.ts
// Word-level Quran recitation checking: normalise Arabic, align expected vs heard words, classify each word.
// Also loads Uthmani text from alquran.cloud (same edition the app already uses elsewhere).

export type WordStatus = "ok" | "check" | "wrong" | "missed" | "extra";
export interface HeardWord { word: string; start?: number | null; end?: number | null }
export interface WordResult {
  index: number;
  expected: string | null;
  heard: string | null;
  status: WordStatus;
  similarity: number;
  start: number | null;
  end: number | null;
  /** "muqattaat" — one of the disconnected opening letters (الٓمٓ, حمٓ …): the transcriber cannot reliably write these. */
  note?: "muqattaat";
}
export interface CheckResult {
  score: number; // 0..1 — ok words + half credit for "check" words, over expected words
  expectedWords: number;
  counts: Record<WordStatus, number>;
  words: WordResult[];
}

/** similarity >= OK_T accepted; between CHECK_T and OK_T = possible pronunciation/spelling difference. */
export const OK_T = 0.8;
export const CHECK_T = 0.6;
/** A 1:1 substitution sitting between two accepted words is graded "check" (not "wrong") from this similarity up:
 *  the audio is weak, so a mis-heard letter or two inside an otherwise correct passage deserves a second listen. */
export const BOUNDED_CHECK_T = 0.5;

const MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640\u200B-\u200F\u202A-\u202E\uFEFF]/g;
const LETTER_MAP: Record<string, string> = {
  "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي",
};

export const normalizeWord = (w: string): string =>
  w.replace(MARKS, "").replace(/[أإآٱىةؤئ]/g, (c) => LETTER_MAP[c]).trim();

const tokens = (text: string): string[] => text.split(/\s+/).filter(Boolean);

/* ── Sound key: "how the word sounds", so spelling / elongation differences stop mattering ─────────────────── */

/** Final ى in the mushaf: alef maqsura (long ā — عَلَىٰ, هُدًى, ٱفْتَرَىٰ) or a real ya (فِى, ٱلَّذِى)? */
function endsWithAlefMaqsura(w: string): boolean {
  const m = w.replace(/\u0640/g, "").match(/([\u064B-\u065F\u0670\u06D6-\u06ED]*)\u0649([\u064B-\u065F\u0670\u06D6-\u06ED]*)$/);
  if (!m) return false;
  const [, lead, trail] = m;
  if (/\u0670/.test(trail)) return true;
  if (/[\u064B-\u0651]/.test(trail)) return false;
  if (/[\u0650\u064D]/.test(lead)) return false;
  return /[\u064E\u064B]/.test(lead);
}

/**
 * Skeleton of a word: hamza / alef / ya / ta-marbuta variants unified, every LONG-VOWEL alef dropped (the Uthmani
 * mushaf writes it as a dagger alef or not at all, the model writes it in full — قال / قَالَ / ءَايَـٰتٌ / آيات are
 * the same sound), the silent alef after waw al-jama'a dropped, doubled letters (shaddah) collapsed.
 * A final alef is kept (ما ≠ م) and so is an initial one.
 */
export function soundKey(w: string): string {
  let s = w
    .replace(/\u0640/g, "")
    .replace(/وٰ/g, "ا")                    // الصلوٰة: the و stands for ā
    .replace(/ٰ/g, "ا")                           // dagger alef = long ā
    .replace(/ى\u0670/g, "")                     // ىٰ (على): ā, no extra letter
    .replace(MARKS, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/ء/g, "")
    .replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/ک/g, "ك").replace(/[یے]/g, "ي")
    .replace(/[^\u0621-\u064A]/g, "")
    .replace(/و(?=ه$)/, "");                      // الصلوة / الزكوة
  const c = [...s];
  let out = "";
  for (let i = 0; i < c.length; i++) {
    if (c[i] === "ا" && i > 0) {
      if (i < c.length - 1) continue;           // medial (long-vowel) alef
      if (c[i - 1] === "و") continue;           // كفروا
    }
    out += c[i];
  }
  return out.replace(/(.)\1+/g, "$1");
}

/* ── Letter-aware similarity: a mis-heard letter that sounds like the right one costs less ──────────────────── */

const CONFUSABLE: string[] = ["تط", "ثسص", "ذزظ", "دض", "حهخ", "قك", "عا", "سص", "غخ", "نم", "بف"];
const confusable = (a: string, b: string) => CONFUSABLE.some((g) => g.includes(a) && g.includes(b));
const WEAK = "اويه";

/** Weighted Levenshtein: look-alike / sound-alike substitution 0.35, weak-letter insert/delete 0.6, else 1. */
function softDistance(a: string, b: string): number {
  const n = a.length, m = b.length;
  let prev = [0];
  for (let j = 1; j <= m; j++) prev[j] = prev[j - 1] + indel(b[j - 1]);
  for (let i = 1; i <= n; i++) {
    const cur = [prev[0] + indel(a[i - 1])];
    for (let j = 1; j <= m; j++) {
      const sub = a[i - 1] === b[j - 1] ? 0 : confusable(a[i - 1], b[j - 1]) ? 0.35 : 1;
      cur[j] = Math.min(prev[j] + indel(a[i - 1]), cur[j - 1] + indel(b[j - 1]), prev[j - 1] + sub);
    }
    prev = cur;
  }
  return prev[m];
}
const indel = (ch: string) => (WEAK.includes(ch) ? 0.6 : 1);

export const similarity = (a: string, b: string): number => {
  if (a === b) return 1;
  const n = a.length, m = b.length;
  if (!n || !m) return 0;
  return Math.max(0, 1 - softDistance(a, b) / Math.max(n, m));
};

/* ── Huruf muqatta'at (الٓمٓ، حمٓ، كٓهيعٓصٓ …) ─────────────────────────────────────────────────────────────── */

/** Letter → how it is SPOKEN. The reciter says "alif lām mīm", never "alm", and the transcriber writes any of
 *  الم / ألم / الف لام ميم / ا ل م — all of them are accepted. */
const LETTER_NAME: Record<string, string> = {
  ا: "الف", ل: "لام", م: "ميم", ص: "صاد", ح: "حا", ي: "يا", س: "سين", ع: "عين",
  ق: "قاف", ك: "كاف", ه: "ها", ط: "طا", ر: "را", ن: "نون",
};
const MUQATTAAT = new Set(["الم", "المص", "الر", "المر", "كهيعص", "طه", "طسم", "طس", "يس", "ص", "حم", "عسق", "ق", "ن"]);

/** letters of an expected token if it is a disconnected-letters token, else null.
 *  Raw text matters: أَلَمْ ("did you not") normalises to the same letters as الٓمٓ, but it carries a fatha. */
function muqattaatLetters(raw: string): string | null {
  const n = normalizeWord(raw);
  if (!MUQATTAAT.has(n)) return null;
  if (/\u0653/.test(raw)) return n;                                   // the madda sign: الٓمٓ
  if (!/[\u064B-\u0652]/.test(raw) && !/^[أإ]/.test(raw)) return n;   // unvocalised, no hamza: الم / طه / يس
  return null;
}

/** Does tokens[from .. from+len) read as the spoken / written form of these letters? Returns the match strength. */
function spelledStrength(letters: string, win: string[]): number {
  const joined = win.map(normalizeWord).join("");
  if (joined === letters) return 1;                                      // الم · ألم · ا ل م
  const names = [...letters].map((c) => LETTER_NAME[c] ?? c);
  const namesJoined = names.join("");
  let best = similarity(joined, namesJoined);                             // الفلاميم · الف لام ميم
  if (win.length === letters.length) {                                    // token per letter, each letter or its name
    const each = win.map((t, i) => {
      const x = normalizeWord(t);
      return Math.max(x === letters[i] ? 1 : 0, similarity(x, names[i]));
    });
    if (each.every((v) => v >= 0.6)) best = Math.max(best, Math.min(...each));
  }
  return best >= 0.75 ? best : 0;
}

/* ── Alignment ────────────────────────────────────────────────────────────────────────────────────────────── */

interface Ref { raw: string; key: string; maq: boolean; muq: string | null }
interface Got extends HeardWord { key: string; }

/** Similarity of an expected word and a heard word (1 = same sound). */
function pairSim(r: Ref, g: Got): number {
  if (r.muq || g.key.startsWith("#")) return r.key === g.key ? 1 : 0;
  let best = similarity(r.key, g.key);
  // ...ى = alef maqsura: the model may write it with a final alef or ya (هدا / علي) or without
  if (r.maq) {
    const stem = r.key.replace(/ي$/, ""), heardStem = g.key.length >= 3 ? g.key.replace(/[اي]$/, "") : g.key;
    best = Math.max(best, similarity(stem, heardStem), similarity(stem, g.key));
  }
  return best;
}

/** Needleman–Wunsch over words. Returns [expectedIdx|null, heardIdx|null] pairs in order. */
function align(exp: Ref[], got: Got[]): Array<[number | null, number | null]> {
  const n = exp.length, m = got.length, GAP = 1;
  const D: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  const P: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0)); // 0 diag, 1 up(missed), 2 left(extra)
  for (let i = 1; i <= n; i++) { D[i][0] = i * GAP; P[i][0] = 1; }
  for (let j = 1; j <= m; j++) { D[0][j] = j * GAP; P[0][j] = 2; }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = D[i - 1][j - 1] + 1 - pairSim(exp[i - 1], got[j - 1]);
      const up = D[i - 1][j] + GAP;
      const left = D[i][j - 1] + GAP;
      if (diag <= up && diag <= left) { D[i][j] = diag; P[i][j] = 0; }
      else if (up <= left) { D[i][j] = up; P[i][j] = 1; }
      else { D[i][j] = left; P[i][j] = 2; }
    }
  }
  const out: Array<[number | null, number | null]> = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const p = P[i][j];
    if (i > 0 && j > 0 && p === 0) { out.push([i - 1, j - 1]); i--; j--; }
    else if (i > 0 && (p === 1 || j === 0)) { out.push([i - 1, null]); i--; }
    else { out.push([null, j - 1]); j--; }
  }
  return out.reverse();
}

/** Collapse spoken / spelled-out opening letters in the transcript into ONE token that equals the expected one. */
function collapseMuqattaat(heard: HeardWord[], refs: Ref[]): Got[] {
  const wanted = [...new Set(refs.filter((r) => r.muq).map((r) => r.muq as string))];
  const out: Got[] = [];
  for (let i = 0; i < heard.length;) {
    let hit: { letters: string; len: number; score: number } | null = null;
    for (const letters of wanted) {
      for (let len = 1; len <= Math.min(letters.length + 1, heard.length - i); len++) {
        const sc = spelledStrength(letters, heard.slice(i, i + len).map((h) => h.word));
        if (sc && (!hit || sc > hit.score || (sc === hit.score && len < hit.len))) hit = { letters, len, score: sc };
      }
    }
    if (hit) {
      const win = heard.slice(i, i + hit.len);
      out.push({ word: win.map((h) => h.word.trim()).join(" "), start: win[0].start ?? null, end: win[win.length - 1].end ?? null, key: "#" + hit.letters });
      i += hit.len;
    } else { out.push({ ...heard[i], key: soundKey(heard[i].word) }); i++; }
  }
  return out.filter((g) => g.key);
}

export function checkRecitation(expectedText: string, heardWords: HeardWord[]): CheckResult {
  const expRaw = tokens(expectedText).filter((w) => normalizeWord(w));
  const refs: Ref[] = expRaw.map((raw) => {
    const muq = muqattaatLetters(raw);
    return { raw, muq, maq: endsWithAlefMaqsura(raw), key: muq ? "#" + muq : soundKey(raw) };
  });
  const got = collapseMuqattaat(heardWords.filter((h) => normalizeWord(h.word)), refs);

  const pairs = align(refs, got);
  const words: WordResult[] = pairs.map(([ei, gi], index) => {
    if (ei !== null && gi === null) {
      return { index, expected: expRaw[ei], heard: null, status: "missed", similarity: 0, start: null, end: null };
    }
    if (ei === null && gi !== null) {
      const g = got[gi!];
      return { index, expected: null, heard: g.word.trim(), status: "extra", similarity: 0, start: g.start ?? null, end: g.end ?? null };
    }
    const g = got[gi!];
    const s = pairSim(refs[ei!], g);
    const status: WordStatus = s >= OK_T ? "ok" : s >= CHECK_T ? "check" : "wrong";
    return {
      index, expected: expRaw[ei!], heard: g.word.trim(), status,
      similarity: Math.round(s * 1000) / 1000, start: g.start ?? null, end: g.end ?? null,
    };
  });

  // A mis-heard word between two accepted words: same place, a few letters off → "check", not "wrong".
  const good = (w?: WordResult) => !w || w.status === "ok";
  words.forEach((w, i) => {
    if (w.status === "wrong" && w.expected !== null && w.similarity >= BOUNDED_CHECK_T && good(words[i - 1]) && good(words[i + 1])) w.status = "check";
  });
  // Opening letters: the transcriber often writes nothing (or garbage) for them → never a hard miss, always "listen again".
  words.forEach((w) => {
    const r = w.expected !== null ? refs.find((x) => x.raw === w.expected) : null;
    if (r?.muq) { w.note = "muqattaat"; if (w.status === "missed" || w.status === "wrong") w.status = "check"; }
  });

  const counts: Record<WordStatus, number> = { ok: 0, check: 0, wrong: 0, missed: 0, extra: 0 };
  words.forEach((w) => counts[w.status]++);
  const total = expRaw.length;
  const score = total ? Math.round(((counts.ok + counts.check * 0.5) / total) * 1000) / 1000 : 0;
  return { score, expectedWords: total, counts, words };
}

/* ───────────────────────── Quran text (alquran.cloud) ───────────────────────── */

export interface SurahInfo { number: number; name: string; englishName: string; numberOfAyahs: number }
export interface Ayah { n: number; text: string }

const BISMILLAH = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";
const BISM_NORM = tokens(BISMILLAH).map(normalizeWord);
const cache = new Map<string, unknown>();

async function getJson<T>(url: string): Promise<T> {
  if (cache.has(url)) return cache.get(url) as T;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  cache.set(url, j);
  return j as T;
}

export async function fetchSurahs(): Promise<SurahInfo[]> {
  const j = await getJson<{ data: SurahInfo[] }>("https://api.alquran.cloud/v1/surah");
  return j.data;
}

/** Ayahs of a surah. alquran.cloud prepends the bismillah to ayah 1 (except surahs 1 and 9) — stripped here. */
export async function fetchAyahs(surah: number): Promise<Ayah[]> {
  const j = await getJson<{ data: { ayahs: Array<{ numberInSurah: number; text: string }> } }>(
    `https://api.alquran.cloud/v1/surah/${surah}/quran-uthmani`,
  );
  return j.data.ayahs.map((a) => {
    let text = a.text;
    if (surah !== 1 && a.numberInSurah === 1) {
      const t = tokens(text);
      if (t.length > 4 && BISM_NORM.every((w, i) => normalizeWord(t[i]) === w)) text = t.slice(4).join(" ");
    }
    return { n: a.numberInSurah, text };
  });
}

/** Expected text for an ayah range; optionally prefixed with the bismillah (when the reciter opens a surah). */
export function buildExpected(ayahs: Ayah[], from: number, to: number, withBismillah = false): string {
  const body = ayahs.filter((a) => a.n >= from && a.n <= to).map((a) => a.text).join(" ");
  return withBismillah ? `${BISMILLAH} ${body}` : body;
}

/** When the ASR gives text but no word list. */
export const wordsFromText = (text: string): HeardWord[] => tokens(text).map((word) => ({ word }));
