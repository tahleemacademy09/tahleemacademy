// src/pages/student/HifdhDailyRevisionPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Standalone Daily Hifdh Revision page — completely separate from Murojah
//
//  Route: /student/hifdh-daily
//
//  Sections:
//    • Today   — today's pages, start session CTA, week progress strip
//    • Schedule — full day-by-day programme timeline
//    • History  — past sessions with scores and breakdown
//
//  Session flow (full-screen overlay):
//    intro → reading (recite aloud, AI listens) → page_result (≥75% gate)
//    → testing (MCQ, ≥75% gate) → complete (submit + notify)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useHifdhSettings, DEFAULT_HIFDH_SETTINGS } from "@/hooks/useHifdhSettings";
import {
  ArrowLeft, Mic, MicOff, BookOpen, CalendarDays, Clock, Trophy,
  Star, CheckCircle, CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  Flame, Target, TrendingUp, Play, RefreshCcw, Heart, Loader2,
  BookMarked, BarChart2, Lock, ShieldCheck, Bell, Eye,
  SkipBack, SkipForward, Timer as TimerIcon, Camera,
} from "lucide-react";
// Per-surah CDN audio (everyayah.com) — keyed by (surahNum, verseNumInSurah), NOT the
// global 1-6236 ayah id. Using this avoids the "wrong page audio" bug where the old
// islamic.network URL was built from an in-surah verse number misread as a global id,
// which made low verse numbers (1-7) always resolve to Surah Al-Fatihah audio.
import { audioUrl as quranAyahAudioUrl, SURAHS } from "@/components/hifdh/surahData";
// Face-capture proctoring — same engine used by HifdhTest.tsx / ExamTaking.tsx.
import { useProctoring } from "@/hooks/useProctoring";
import ProctoringOverlay from "@/components/exam/ProctoringOverlay";

// ── Lazy surah lookup ─────────────────────────────────────────────────────
// Building this map at module init time (`const X = Object.fromEntries(SURAHS.map(...))`)
// caused a production TDZ crash ("Cannot access 'le' before initialization") because
// Rollup scope-hoists this chunk together with surahData and the init order of the
// cross-module `SURAHS` binding is not guaranteed. A Proxy defers the lookup until
// after all module bindings have initialized, eliminating the TDZ entirely.
const SURAH_NAME_BY_NUM: Record<number, { name: string; arabicName: string }> =
  new Proxy({} as Record<number, { name: string; arabicName: string }>, {
    get(_t, key) {
      const num = Number(key);
      if (!Number.isFinite(num)) return undefined;
      const s = SURAHS.find(x => x.num === num);
      return s ? { name: s.name, arabicName: s.arabicName } : undefined;
    },
  });

/* ── Design tokens ──────────────────────────────────────────────── */
const G0   = "#061409";
const G1   = "#0f2d1f";
const G2   = "#1a3d27";
const G3   = "#276749";
const GOLD = "#c9a84c";
const GOLD_L = "#e6c97a";
const W    = "#ffffff";
const WARM = "#faf8f4";
const BRD  = "#e5ddd3";
const INK  = "#1a1209";
const PASS = "#16a34a";
const FAIL = "#dc2626";
const AMBER = "#d97706";
const PURPLE = "#7c3aed";
// ─────────────────────────────────────────────────────────────────────────────
// IndexedDB helpers — persist partial recording blobs across page refreshes.
// sessionStorage cannot hold binary data of this size; IDB has no practical limit.
// ─────────────────────────────────────────────────────────────────────────────
const IDB_NAME  = "tahleem_hifdh_audio";
const IDB_STORE = "partial_blobs";

function _openAudioIDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = e =>
      (e.target as IDBOpenDBRequest).result.createObjectStore(IDB_STORE);
    req.onsuccess = e => res((e.target as IDBOpenDBRequest).result);
    req.onerror   = () => rej(req.error);
  });
}
async function idbSaveBlob(key: string, blob: Blob): Promise<void> {
  try {
    const db = await _openAudioIDB();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(blob, key);
      tx.oncomplete = () => { db.close(); res(); };
      tx.onerror    = () => { db.close(); rej(tx.error); };
    });
  } catch { /* non-critical */ }
}
async function idbLoadBlob(key: string): Promise<Blob | null> {
  try {
    const db = await _openAudioIDB();
    return await new Promise<Blob | null>((res, rej) => {
      const tx  = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => { db.close(); res(req.result ?? null); };
      req.onerror   = () => { db.close(); rej(req.error); };
    });
  } catch { return null; }
}
async function idbDeleteBlob(key: string): Promise<void> {
  try {
    const db = await _openAudioIDB();
    await new Promise<void>(res => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => { db.close(); res(); };
      tx.onerror    = () => { db.close(); res(); };
    });
  } catch { /* non-critical */ }
}

const PASS_THRESHOLD = 55;
const TEST_PASS_THRESHOLD = 55;

/* ── Interfaces ─────────────────────────────────────────────────── */
interface Assignment {
  id: string; student_id: string;
  mode: "juz" | "hizb" | "surah";
  selected_items: number[]; daily_pages: number;
  program_start?: string; starts_on?: string;
  days_off?: number[];     weekend_off?: boolean;
  program_days?: number;   notes?: string;
}
interface DailyLog {
  id: string; log_date: string; completed: boolean;
  avg_score: number | null; pages_revised: number | null;
  duration_secs: number | null;
  acknowledged_at?: string | null;
  session_data?: {
    page_results?: PageResult[]; errors?: any[];
    audio_url?: string | null;
    recitation_score?: number; test_score?: number;
    pages_done?: number[];
  };
}
interface AyahWord { text: string; line_number: number; }
interface Ayah {
  number: number; numberInSurah: number; text: string;
  surah: { number: number; name: string; englishName: string };
  words?: AyahWord[];
}
interface PageResult {
  pageNum: number; score: number; errorWords: string[]; ayahs: Ayah[];
  ayahCorrectness?: boolean[]; transcript?: string;
}
interface Question {
  id: number;
  // mcq = multiple choice  |  record = student records answer  |  listen_record = play audio then record
  type: "mcq_next" | "mcq_blank" | "mcq_continuation" | "record_continue" | "record_complete" | "listen_choose";
  section: "A" | "B";
  isErrorFocused?: boolean;
  // For MCQ
  prompt: string; promptLabel: string;
  options: string[]; correct: number; correctText: string;
  // For LISTEN questions: a fragment of an ayah to play (TTS via Web Speech or stored text)
  listenText?: string;
  // Global ayah number (1-6236) — used as fallback CDN key when surah+verse CDN fails.
  listenGlobalNum?: number;
  // Surah number + in-surah verse number — used together to build the correct
  // per-surah CDN audio URL (fixes the bug where listen questions played Al-Fatihah
  // audio regardless of which page/surah the question was actually about).
  listenAyahNum?: number;
  listenSurahNum?: number;
  // For RECORD questions: what the student should recite
  recordPrompt?: string;
  // Snippet of just a few words, not full verse
  snippet?: boolean;
}
type Phase = "intro"|"pre_test_review"|"reading"|"page_result"|"proctor_intro"|"testing"|"test_result"|"complete";
type MainTab = "today"|"schedule"|"history";

/* ── Day descriptor ─────────────────────────────────────────────── */
interface ProgramDay {
  dayNum: number; date: string; isWorkingDay: boolean;
  pages: number[]; status: "done"|"missed"|"today"|"future";
  log?: DailyLog;
}

/* ── Quran page maps (Madani Mushaf, 604 pages) ─────────────────── */
const JUZ_START_PAGES: Record<number, number> = {
  1:1,   2:22,  3:42,  4:62,  5:82,  6:102, 7:122, 8:142, 9:162, 10:182,
  11:202,12:222,13:242,14:262,15:282,16:302,17:322,18:342,19:362,20:382,
  21:402,22:422,23:442,24:462,25:482,26:502,27:522,28:542,29:562,30:582,
};

// Hizb = half a Juz (~10 pages each). 60 hizbs total.
function getHizbStartPage(h: number): number {
  const juz = Math.ceil(h / 2);
  const isSecond = h % 2 === 0;
  return (JUZ_START_PAGES[juz] ?? 1) + (isSecond ? 10 : 0);
}

const SURAH_START_PAGES: Record<number, number> = {
  1:1,   2:2,   3:50,  4:77,  5:106, 6:128, 7:151, 8:177, 9:187, 10:208,
  11:221,12:235,13:249,14:255,15:262,16:267,17:282,18:293,19:305,20:312,
  21:322,22:332,23:342,24:350,25:359,26:367,27:377,28:385,29:396,30:404,
  31:411,32:415,33:418,34:428,35:434,36:440,37:446,38:453,39:458,40:467,
  41:477,42:483,43:489,44:496,45:499,46:502,47:507,48:511,49:515,50:518,
  51:520,52:523,53:526,54:528,55:531,56:534,57:537,58:542,59:545,60:549,
  61:551,62:553,63:554,64:556,65:558,66:560,67:562,68:564,69:566,70:568,
  71:570,72:572,73:574,74:575,75:577,76:578,77:580,78:582,79:583,80:585,
  81:586,82:587,83:587,84:589,85:590,86:591,87:591,88:592,89:593,90:594,
  91:595,92:595,93:596,94:596,95:597,96:597,97:598,98:598,99:599,100:599,
  101:600,102:601,103:601,104:601,105:602,106:602,107:602,108:603,109:603,110:603,
  111:603,112:604,113:604,114:604,
};

/**
 * Returns the absolute Quran page number where the assignment content begins.
 * For Juz 28 → 542, so day 1 = page 542, day 2 = page 543, etc.
 */
function getAssignmentStartPage(a: Assignment): number {
  const first = a.selected_items?.[0];
  if (!first) return 1;
  if (a.mode === "juz")   return JUZ_START_PAGES[first]  ?? 1;
  if (a.mode === "hizb")  return getHizbStartPage(first);
  if (a.mode === "surah") return SURAH_START_PAGES[first] ?? 1;
  return 1;
}

/* ── Helpers ────────────────────────────────────────────────────── */
function getStartDate(a: Assignment): string|undefined {
  return a.program_start || a.starts_on || undefined;
}
function getDaysOff(a: Assignment): number[] {
  if (Array.isArray(a.days_off)) return a.days_off;
  return a.weekend_off ? [0] : [];
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}
function todayISO(): string { return new Date().toISOString().split("T")[0]; }

/** Working days elapsed from startDate up to (not including) today */
function workingDaysElapsed(startDate: string, daysOff: number[]): number {
  const start = new Date(startDate + "T00:00:00");
  const now   = new Date(); now.setHours(0,0,0,0);
  let count = 0; const cur = new Date(start);
  while (cur < now) {
    if (!daysOff.includes(cur.getDay())) count++;
    cur.setDate(cur.getDate()+1);
  }
  return count;
}

/** Build full programme day list with correct absolute Quran page numbers */
function buildProgramDays(
  a: Assignment,
  logs: DailyLog[],
  today: string,
): ProgramDay[] {
  const startDate = getStartDate(a);
  if (!startDate) return [];
  const base       = getAssignmentStartPage(a);  // e.g. Juz 28 → page 542
  const daysOff    = getDaysOff(a);
  const totalDays  = a.program_days ?? 30;
  const logMap     = new Map(logs.map(l => [l.log_date, l]));
  const days: ProgramDay[] = [];
  let workDayIdx = 0;
  let calDay = 0;

  while (workDayIdx < totalDays) {
    const date      = addDays(startDate, calDay);
    const dayOfWeek = new Date(date+"T00:00:00").getDay();
    const isWork    = !daysOff.includes(dayOfWeek);
    if (isWork) {
      const offset = Math.floor(workDayIdx * a.daily_pages);
      const pages  = Array.from({length: a.daily_pages}, (_, i) => base + offset + i)
                          .filter(p => p >= 1 && p <= 604);
      const log    = logMap.get(date);
      const status: ProgramDay["status"] =
        date < today  ? (log?.completed || log?.session_data?.teacher_override ? "done" : "missed")
        : date===today ? "today"
        : "future";
      days.push({ dayNum: workDayIdx+1, date, isWorkingDay: true, pages, status, log });
      workDayIdx++;
    }
    calDay++;
    if (calDay > totalDays*3) break;
  }
  return days;
}

/** Today's absolute Quran page numbers, offset from the Juz/Hizb/Surah start */
function getTodayPages(a: Assignment): number[] {
  const base      = getAssignmentStartPage(a);   // e.g. Juz 28 → 542
  const startDate = getStartDate(a);
  const elapsed   = startDate ? workingDaysElapsed(startDate, getDaysOff(a)) : 0;
  const offset    = Math.floor(elapsed * a.daily_pages); // pages already covered
  return Array.from({length: a.daily_pages}, (_, i) => base + offset + i)
              .filter(p => p >= 1 && p <= 604);
}

/* ── Quran fetcher ──────────────────────────────────────────────── */
async function fetchPageAyahs(page: number): Promise<Ayah[]> {
  // Primary: qurancdn (quran.com) API — includes per-word line_number for authentic mushaf layout
  try {
    const r = await fetch(
      `https://api.qurancdn.com/api/qdc/verses/by_page/${page}?words=true&per_page=50&fields=text_uthmani`,
    );
    if (r.ok) {
      const j = await r.json();
      const verses: any[] = j?.verses ?? [];
      if (verses.length > 0) {
        return verses.map((v: any) => {
          const meta = SURAH_NAME_BY_NUM[v.chapter_id ?? 0];
          return {
          // NOTE: `number` here is the global 1-6236 ayah id when available from the API,
          // but we no longer rely on it for audio playback (see quranAyahAudioUrl below) —
          // audio is keyed off surah.number + numberInSurah instead, which is always correct.
          number: v.id ?? v.verse_number ?? 0,
          numberInSurah: v.verse_number ?? 0,
          text: v.text_uthmani ?? v.words?.map((w: any) => w.text_uthmani ?? w.text).join(" ") ?? "",
          surah: {
            number: v.chapter_id ?? 0,
            name: meta?.arabicName ?? "",
            englishName: meta?.name ?? "",
          },
          words: (v.words ?? [])
            .filter((w: any) => w.char_type_name !== "end")
            .map((w: any) => ({
              text: w.text_uthmani ?? w.text ?? "",
              line_number: w.line_number ?? 0,
            })),
          };
        });
      }
    }
  } catch { /* fall through */ }
  // Fallback: alquran.cloud (no line data, layout will still work)
  const r = await fetch(`https://api.alquran.cloud/v1/page/${page}/quran-uthmani`);
  if (!r.ok) return [];
  const j = await r.json();
  return (j?.data?.ayahs ?? []) as Ayah[];
}

/* ── Arabic scoring ─────────────────────────────────────────────── */

/* ── Strip Waqf stop/pause signs from Arabic ─────────────────── */
const WAQF_REGEX = /[\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED۝\u06DE\u0615]/g;
function stripWaqf(text: string): string {
  return text.replace(WAQF_REGEX, "").replace(/\s+/g, " ").trim();
}


/**
 * normalizeArabic — strips tashkeel and unifies character variants so that
 * the ar.uthmani API text and Groq/Whisper transcripts can be compared reliably.
 *
 * Key fixes vs the naïve stripDiacritics approach:
 *  • Dagger Alef \u0670 → Alef \u0627 (represents a long-vowel 'a' in Uthmani script).
 *  • Alef Wasla ٱ \u0671 → \u0627  (every definite article "ال").
 *  • Alef Hamza Above/Below / Alef Madda → \u0627.
 *  • Hamzated Waw ؤ \u0624 → و  (Whisper often drops or swaps the hamza over waw).
 *  • Hamzated Ya  ئ \u0626 → ي  (same reason).
 *  • Standalone Hamza ء \u0621 → removed (frequently not captured in recitation).
 *  • Alef Maqsura ى → Ya ي  (Groq always uses Ya).
 *  • Ta Marbuta ة → Ha ه.
 *  • Small Waw ۥ / Small Ya ۦ (Uthmani-only) → their full counterparts.
 *  • Tatweel / Kashida ـ stripped.
 *  • Quranic stop/pause/ayah-end markers stripped.
 */
function normalizeArabic(t: string): string {
  return stripWaqf(t)
    // 1. Dagger alef → regular alef FIRST (before bulk strip removes it)
    .replace(/\u0670/g, "\u0627")
    // 2. Strip tashkeel + Quranic annotation combining characters
    .replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, "")
    // 3. All Alef variants → plain Alef ا
    .replace(/[\u0671\u0622\u0623\u0625]/g, "\u0627")
    // 4. Hamzated Waw ؤ → و  (Whisper may omit the hamza component)
    .replace(/\u0624/g, "\u0648")
    // 5. Hamzated Ya  ئ → ي
    .replace(/\u0626/g, "\u064A")
    // 6. Standalone Hamza ء → remove (often dropped in natural recitation / STT)
    .replace(/\u0621/g, "")
    // 7. Alef Maqsura ى → Ya ي
    .replace(/\u0649/g, "\u064A")
    // 8. Ta Marbuta ة → Ha ه
    .replace(/\u0629/g, "\u0647")
    // 9. Strip Tatweel / Kashida ـ
    .replace(/\u0640/g, "")
    // 10. Uthmani small Waw ۥ → و  and small Ya ۦ → ي
    .replace(/\u06E5/g, "\u0648")
    .replace(/\u06E6/g, "\u064A")
    // 11. Strip Quranic end-of-ayah ۝ and rub-el-hizb ۞ markers
    .replace(/[۝\u06DE]/g, "");
}

// Keep the old name as an alias so nothing else in the file needs to change
function stripDiacritics(t: string): string { return normalizeArabic(t); }

// ─────────────────────────────────────────────────────────────────────────────
// Levenshtein edit distance — used for fuzzy matching of Quranic words.
// Whisper often produces a 1-2 character difference from the written form due
// to tajweed rules (idgham, ikhfaa, qalqalah) or emphatic letter substitution.
// This lets us match those close-but-not-identical pairs as correct.
// ─────────────────────────────────────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  // Rolling two-row DP — O(n) space
  let prev = Array.from({length: b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i-1] === b[j-1]
        ? prev[j-1]
        : 1 + Math.min(prev[j], curr[j-1], prev[j-1]);
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * wordsMatch — single source of truth for whether two normalised Arabic words
 * are considered the same.  Strategy (in priority order):
 *
 *  1. Exact match after normalisation.
 *  2. 3-char prefix overlap — handles long-vowel insertions, e.g.
 *     "الرحمان" (ref, after dagger-alef expand) vs "الرحمن" (Whisper).
 *  3. Edit distance ≤ 1 for words ≥ 4 chars — handles single char drop/swap
 *     due to tajweed rules (e.g. idgham drops the nun: "منهم" → "مهم").
 *  4. Edit distance ≤ 2 for words ≥ 7 chars — handles two-char differences
 *     that commonly arise from emphatic-letter substitution in STT output.
 */
function wordsMatch(rw: string, gw: string): boolean {
  if (rw === gw) return true;
  const minLen = Math.min(rw.length, gw.length);
  // 3-char prefix (existing behaviour, kept)
  if (minLen >= 3 &&
      (rw.startsWith(gw.slice(0, 3)) || gw.startsWith(rw.slice(0, 3)))) return true;
  // Edit distance
  if (minLen >= 4) {
    const d = levenshtein(rw, gw);
    if (d <= 1) return true;
    if (minLen >= 7 && d <= 2) return true;
  }
  return false;
}

// ── Word-by-word comparison ───────────────────────────────────────────────────
// Stores the ORIGINAL diacritic form of each reference word so the result
// grid can display full tashkeel while still using normalised text for matching.
interface WordResult { word: string; status: "correct" | "missing"; }
function compareWords(refText: string, gotText: string): WordResult[] {
  // Split on whitespace — keep originals for display, normalize for matching.
  // FILTER OUT waqf-only tokens (e.g. a lone "صلے", "ۚ", "ۖ" that ended up as
  // its own whitespace-separated token in the source text). These are pause/stop
  // marks, not actual recited words — a reciter cannot "say" them, so they must
  // never be scored as missing/incorrect. We detect them by checking that
  // stripping waqf characters from the token leaves nothing behind.
  const origRef = refText.split(/\s+/).filter(Boolean).filter(w => stripWaqf(w).length > 0);
  const normRef = origRef.map(w => normalizeArabic(w));
  const normGot = normalizeArabic(gotText).split(/\s+/).filter(Boolean);

  const results: WordResult[] = [];
  const usedGot = new Set<number>();

  for (let ri = 0; ri < normRef.length; ri++) {
    const rw = normRef[ri];
    let found = false;
    for (let i = 0; i < normGot.length; i++) {
      if (usedGot.has(i)) continue;
      const gw = normGot[i];
      const match = wordsMatch(rw, gw);
      if (match) {
        // Store the original (with diacritics) so the UI renders full tashkeel
        results.push({ word: origRef[ri], status: "correct" });
        usedGot.add(i);
        found = true;
        break;
      }
    }
    if (!found) results.push({ word: origRef[ri], status: "missing" });
  }
  return results;
}

/**
 * scoreText — sliding-window approach so Whisper's occasional verse-skip
 * doesn't penalise the whole recitation. We align the transcript against
 * the reference in 10-word windows and pick the best alignment per window,
 * which absorbs gaps caused by Whisper skipping a verse mid-transcription.
 */
function scoreText(transcript: string, ayahs: Ayah[], _recSecs: number): number {
  const refWords = ayahs.map(a => normalizeArabic(a.text)).join(" ").split(/\s+/).filter(Boolean);
  const gotWords = normalizeArabic(transcript).split(/\s+/).filter(Boolean);
  if (!refWords.length) return 0;
  if (!gotWords.length)  return 0;

  // Score per ayah independently, then average weighted by ayah length.
  // This prevents a skipped ayah from "using up" gotPtr and penalising later ayahs.
  let totalRef = 0; let totalMatched = 0;
  let gotSearchStart = 0; // advance forward-only after each ayah

  for (const ayah of ayahs) {
    const refW = normalizeArabic(ayah.text).split(/\s+/).filter(Boolean);
    if (!refW.length) continue;
    totalRef += refW.length;

    // Search the ENTIRE remaining transcript for this ayah's words.
    // We use a generous forward window (3× ayah length) but never go backward.
    const searchEnd = Math.min(gotWords.length, gotSearchStart + refW.length * 4 + 20);
    const window    = gotWords.slice(gotSearchStart, searchEnd);

    // Greedy LCS within window
    let matched = 0; let gj = 0; let lastHit = -1;
    for (const rw of refW) {
      for (let k = gj; k < window.length; k++) {
        if (wordsMatch(rw, window[k])) { matched++; lastHit = k; gj = k + 1; break; }
      }
    }
    totalMatched += matched;

    // Advance gotSearchStart to just after the last matched word of this ayah.
    // If nothing matched (skipped ayah), don't advance — next ayah searches same region.
    if (lastHit >= 0) gotSearchStart += lastHit + 1;
  }

  return totalRef > 0 ? Math.round((totalMatched / totalRef) * 100) : 0;
}

// getErrorWords — uses per-ayah comparison so a skipped verse in the
// transcript doesn't flag every word in it as an error
function getErrorWords(transcript: string, ayahs: Ayah[]): string[] {
  const errors: string[] = [];
  for (const ayah of ayahs) {
    const words = compareWords(ayah.text, transcript);
    // Only flag words that genuinely weren't found anywhere in the transcript
    const missing = words.filter(w => w.status === "missing").map(w => w.word);
    // If >90% of the ayah is missing, Whisper likely just skipped the verse —
    // treat it as partially heard (soft error) rather than total miss
    const missFrac = words.length > 0 ? missing.length / words.length : 0;
    if (missFrac < 0.9) {
      errors.push(...missing);
    } else {
      // Verse fully skipped by Whisper — only flag the first few words as errors
      errors.push(...missing.slice(0, 2));
    }
  }
  return errors;
}

/* Per-ayah correctness: true (green) / false (red).
   Uses the same forward-only window as scoreText so a skipped ayah
   doesn't steal matches from the ayahs that follow it. */
function getAyahCorrectness(transcript: string, ayahs: Ayah[], _recSecs?: number): boolean[] {
  const gotWords = normalizeArabic(transcript).split(/\s+/).filter(Boolean);
  let gotSearchStart = 0;
  return ayahs.map(a => {
    const refW = normalizeArabic(a.text).split(/\s+/).filter(Boolean);
    if (!refW.length) return true;
    const searchEnd = Math.min(gotWords.length, gotSearchStart + refW.length * 4 + 20);
    const window    = gotWords.slice(gotSearchStart, searchEnd);
    let matched = 0; let gj = 0; let lastHit = -1;
    for (const rw of refW) {
      for (let k = gj; k < window.length; k++) {
        if (wordsMatch(rw, window[k])) { matched++; lastHit = k; gj = k + 1; break; }
      }
    }
    if (lastHit >= 0) gotSearchStart += lastHit + 1;
    return refW.length > 0 && (matched / refW.length) >= 0.4;
  });
}
function shuffle<T>(arr:T[]): T[] {
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function buildQuestions(results: PageResult[], juzAyahs: Ayah[] = []): Question[] {
  const allAyahs = results.flatMap(r => r.ayahs ?? []).filter(a => a && a.text);
  const errorWords = results.flatMap(r => r.errorWords);
  const used = new Set<string>(); // dedup: key = type+promptSlice
  const qs: Question[] = [];
  let id = 0;

  const key = (type: string, text: string) => `${type}::${normalizeArabic(text).slice(0,12)}`;

  // ── helpers ────────────────────────────────────────────────────
  // Full verse text (no waqf marks) — always show complete verses for meaning
  const fullVerse = (ayah: Ayah): string => stripWaqf(ayah.text);

  // For listen/MCQ: show the COMPLETE current verse as prompt,
  // ask the student to choose the COMPLETE next verse.
  // Never split mid-verse — Quranic meaning is only complete at verse boundaries.

  // MCQ blank: blank ONE word from a snippet (not full verse)
  const makeMcqBlank = (ayah: Ayah, isErr: boolean, pool: Ayah[], sec: "A"|"B"): Question | null => {
    const words = stripWaqf(ayah.text).split(" ").filter(Boolean);
    if (words.length < 4) return null;
    // Pick blank position inside middle of ayah
    const bi = isErr
      ? (() => {
          const idx = words.findIndex(w =>
            errorWords.some(ew => normalizeArabic(w).includes(normalizeArabic(stripWaqf(ew)).slice(0,3)))
          );
          return idx >= 0 ? idx : 1 + Math.floor(Math.random() * (words.length - 2));
        })()
      : 1 + Math.floor(Math.random() * (words.length - 2));
    const cw = words[bi];
    // Show only ±2 words context, not full verse
    const ctxStart = Math.max(0, bi - 2);
    const ctxEnd   = Math.min(words.length, bi + 3);
    const ctxWords = words.slice(ctxStart, ctxEnd).map((w, i) => (ctxStart + i === bi ? "____" : w));
    const ctxText = (ctxStart > 0 ? "…" : "") + ctxWords.join(" ") + (ctxEnd < words.length ? "…" : "");
    if (used.has(key("blank", ctxText))) return null;
    used.add(key("blank", ctxText));
    const wPool = pool.flatMap(a => stripWaqf(a.text).split(" ")).filter(w =>
      w !== cw && normalizeArabic(w).length > 2 && normalizeArabic(w) !== normalizeArabic(cw)
    );
    const wrongs = shuffle([...new Set(wPool)]).slice(0, 3);
    if (wrongs.length < 2) return null;
    const opts = shuffle([cw, ...wrongs]);
    return { id:id++, type:"mcq_blank", section:sec, isErrorFocused:isErr, snippet:true,
      prompt: ctxText,
      promptLabel: `${sec==="A"?"§A Today":"§B Review"} · ${ayah.surah.englishName} ${ayah.numberInSurah}`,
      options: opts, correct: opts.indexOf(cw), correctText: cw };
  };

  // ── MCQ NEXT ─────────────────────────────────────────────────────────────
  // Show the COMPLETE verse[i] as prompt (full meaning preserved).
  // Correct answer = COMPLETE verse[i+1] (the very next verse).
  // Distractors = other complete verses from the pool.
  // Rules:
  //   • Always start from verse beginning — no mid-verse cuts.
  //   • Long verses (>12 words): show first 10 words + "…" so it fits on screen,
  //     but options always show the full next verse.
  const makeMcqNext = (i: number, pool: Ayah[], sec: "A"|"B"): Question | null => {
    if (i >= pool.length - 1) return null;
    const cur  = pool[i];
    const next = pool[i + 1];
    const curFull  = fullVerse(cur);
    const nextFull = fullVerse(next);
    if (used.has(key("next", curFull))) return null;
    used.add(key("next", curFull));
    const distract = shuffle(pool.filter((_,j) => j !== i+1 && j !== i)).slice(0, 3);
    if (distract.length < 2) return null;
    const opts = shuffle([nextFull, ...distract.map(a => fullVerse(a))]);
    return { id:id++, type:"mcq_next", section:sec, snippet:false,
      prompt: curFull,
      promptLabel: `${sec==="A"?"§A Today":"§B Review"} · ${cur.surah.englishName} ${cur.numberInSurah} — What comes after this?`,
      options: opts, correct: opts.indexOf(nextFull), correctText: nextFull };
  };

  // ── MCQ CONTINUATION (error-focused) ─────────────────────────────────────
  // Same as mcq_next but flagged as error-focused for UI colouring.
  const makeMcqContinuation = (i: number, pool: Ayah[], sec: "A"|"B"): Question | null => {
    if (i >= pool.length - 1) return null;
    const cur  = pool[i];
    const next = pool[i + 1];
    const curFull  = fullVerse(cur);
    const nextFull = fullVerse(next);
    if (used.has(key("cont", curFull))) return null;
    used.add(key("cont", curFull));
    const distract = shuffle(pool.filter((_,j) => j !== i+1 && j !== i)).slice(0, 3);
    if (distract.length < 2) return null;
    const opts = shuffle([nextFull, ...distract.map(a => fullVerse(a))]);
    return { id:id++, type:"mcq_continuation", section:sec, isErrorFocused:true, snippet:false,
      prompt: curFull,
      promptLabel: `§A Error Area · ${cur.surah.englishName} ${cur.numberInSurah} — What comes after this?`,
      options: opts, correct: opts.indexOf(nextFull), correctText: nextFull };
  };

  // ── RECORD CONTINUE ────────────────────────────────────────────────────────
  // Show complete verse[i] as prompt, student recites verse[i+1] from memory.
  // IMPORTANT: the expected answer must match exactly what the prompt asks for
  // ("recite the next verse" — singular). Previously this also required the
  // verse AFTER that to be recited, so a student who correctly recited only the
  // next verse (as instructed) was scored ~50% even with a perfect transcript.
  const makeRecordContinue = (i: number, pool: Ayah[], sec: "A"|"B", isErr=false): Question | null => {
    if (i >= pool.length - 1) return null;
    const cur  = pool[i];
    const next = pool[i + 1];
    const curFull  = fullVerse(cur);
    if (used.has(key("rec", curFull))) return null;
    used.add(key("rec", curFull));
    // Student must recite exactly the next verse — matches the recordPrompt text below.
    const expected = fullVerse(next);
    return { id:id++, type:"record_continue", section:sec, isErrorFocused:isErr, snippet:false,
      prompt: curFull,
      promptLabel: `${sec==="A"?"§A Today":"§B Review"} · ${cur.surah.englishName} ${cur.numberInSurah} — Recite what comes after`,
      options: [], correct: -1, correctText: expected,
      recordPrompt: `After this verse — recite the next verse` };
  };

  // ── LISTEN + CHOOSE ────────────────────────────────────────────────────────
  // Play the COMPLETE verse[i] via audio (reciter reads the whole verse).
  // Student chooses the COMPLETE verse[i+1] from 4 options.
  // This is the correct design: hear a full verse → identify what follows.
  const makeListenChoose = (i: number, pool: Ayah[], sec: "A"|"B"): Question | null => {
    if (i >= pool.length - 1) return null;   // need i+1
    const ayah = pool[i];
    const next  = pool[i + 1];
    const curFull  = fullVerse(ayah);
    const nextFull = fullVerse(next);
    if (used.has(key("listen", curFull))) return null;
    used.add(key("listen", curFull));
    if (!nextFull) return null;
    const distract = shuffle(pool.filter((_,j) => j !== i && j !== i+1)).slice(0, 3);
    if (distract.length < 2) return null;
    const opts = shuffle([nextFull, ...distract.map(a => fullVerse(a))]);
    return { id:id++, type:"listen_choose", section:sec, snippet:false,
      listenText: curFull,
      listenGlobalNum: ayah.number,            // global 1-6236 — fallback CDN key
      listenAyahNum: ayah.numberInSurah,        // in-surah verse number
      listenSurahNum: ayah.surah.number,
      prompt: curFull,
      promptLabel: `${sec==="A"?"§A Today":"§B Review"} · 👂 Listen to the verse — what comes next?`,
      options: opts, correct: opts.indexOf(nextFull), correctText: nextFull,
      recordPrompt: undefined };
  };

  // ── SECTION A: TODAY'S PAGES ─────────────────────────────────────
  // 1. Error-focused blanks (most important — errors from recitation)
  const errorAyahs = allAyahs.filter(a =>
    errorWords.some(ew => normalizeArabic(a.text).includes(normalizeArabic(stripWaqf(ew)).slice(0,3)))
  );
  for (const a of shuffle(errorAyahs).slice(0, 4)) {
    const q = makeMcqBlank(a, true, allAyahs, "A");
    if (q) qs.push(q);
  }

  // 2. Error continuation — what comes after error verses
  shuffle(errorAyahs).forEach(a => {
    const idx = allAyahs.indexOf(a);
    if (idx < 0 || idx >= allAyahs.length-1) return;
    if (qs.filter(q=>q.section==="A"&&q.type==="mcq_continuation").length >= 2) return;
    const q = makeMcqContinuation(idx, allAyahs, "A");
    if (q) qs.push(q);
  });

  // 3. Record-continue from error areas
  shuffle(errorAyahs).slice(0,2).forEach(a => {
    const idx = allAyahs.indexOf(a);
    if (idx < 0 || idx >= allAyahs.length-2) return;
    const q = makeRecordContinue(idx, allAyahs, "A", true);
    if (q) qs.push(q);
  });

  // 4. MCQ next — across today's pages (spread evenly, random starting offset
  //    each attempt so repeats don't always test the exact same verses)
  const stepA = Math.max(1, Math.floor(allAyahs.length / 3));
  const startA = allAyahs.length > 1 ? Math.floor(Math.random() * Math.min(stepA, allAyahs.length - 1)) : 0;
  for (let i = startA; i < allAyahs.length-1 && qs.filter(q=>q.section==="A"&&q.type==="mcq_next").length < 3; i += stepA) {
    const q = makeMcqNext(i, allAyahs, "A");
    if (q) qs.push(q);
  }

  // 5. Listen+choose from today (1-2 questions)
  const listenIndices = shuffle(allAyahs.map((_,i)=>i)).slice(0,2);
  for (const li of listenIndices) {
    if (qs.filter(q=>q.section==="A"&&q.type==="listen_choose").length >= 1) break;
    const q = makeListenChoose(li, allAyahs, "A");
    if (q) qs.push(q);
  }

  // ── SECTION B: JUZ REVIEW ──────────────────────────────────────
  if (juzAyahs.length >= 3) {
    const stepB = Math.max(1, Math.floor(juzAyahs.length / 3));
    const startB = juzAyahs.length > 1 ? Math.floor(Math.random() * Math.min(stepB, juzAyahs.length - 1)) : 0;
    // MCQ next
    for (let i = startB; i < juzAyahs.length-1 && qs.filter(q=>q.section==="B"&&q.type==="mcq_next").length < 3; i += stepB) {
      const q = makeMcqNext(i, juzAyahs, "B");
      if (q) qs.push(q);
    }
    // MCQ blanks
    const stepB2 = Math.max(1, Math.floor(juzAyahs.length / 3));
    const startB2 = juzAyahs.length > 1 ? Math.floor(Math.random() * Math.min(stepB2, juzAyahs.length)) : 0;
    for (let i = startB2; i < juzAyahs.length && qs.filter(q=>q.section==="B"&&q.type==="mcq_blank").length < 2; i += stepB2) {
      const q = makeMcqBlank(juzAyahs[i], false, juzAyahs, "B");
      if (q) qs.push(q);
    }
    // Record continue from juz — random position each attempt instead of
    // always the exact midpoint
    const recIdx = juzAyahs.length > 1 ? Math.floor(Math.random() * (juzAyahs.length - 1)) : 0;
    const qRec = makeRecordContinue(recIdx, juzAyahs, "B");
    if (qRec) qs.push(qRec);
    // Listen+choose from juz
    const juzListenIdx = shuffle(juzAyahs.map((_,i)=>i)).slice(0,2);
    for (const li of juzListenIdx) {
      if (qs.filter(q=>q.section==="B"&&q.type==="listen_choose").length >= 1) break;
      const q = makeListenChoose(li, juzAyahs, "B");
      if (q) qs.push(q);
    }
  }

  const sA = shuffle(qs.filter(q=>q.section==="A"));
  const sB = shuffle(qs.filter(q=>q.section==="B"));
  return [...sA, ...sB];
}


/* ── Per-question timer — time limit scales with question complexity ──────
   MCQ "what comes next"/"fill blank" questions just need recognition, so they
   get less time. Listen questions need time to hear the audio first. Record
   questions need the most time since the student must recall and recite from
   memory (and longer still for error-focused / continuation questions, which
   tend to be harder). */
function questionTimeLimit(q: Question): number {
  switch (q.type) {
    case "mcq_blank":        return 20;                     // single-word recognition
    case "mcq_next":         return 25;                     // recognise the next full verse
    case "mcq_continuation": return 30;                     // harder — error-focused area
    case "listen_choose":    return 40;                     // includes time to listen first
    case "record_continue":  return q.isErrorFocused ? 60 : 45; // recall + recite from memory
    case "record_complete":  return 75;                     // multi-verse recall + recite
    default:                 return 30;
  }
}

/* ── Encouragement messages ─────────────────────────────────────── */
const RETRY_MSGS = [
  "لا تستسلم! Take a breath, read the page again carefully, then recite once more. You can do it! 💪",
  "Every Hafidh has moments of struggle — this is yours to overcome. Review the verses and try again.",
  "Allah loves effort. Re-read the page with your full attention, then recite boldly.",
  "Patience brings success. Look at the words once more and recite with confidence.",
  "Great hifdh is built one patient attempt at a time. Review, focus, and try again!",
];
const HADITHS = [
  {ar:"خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ", en:"The best among you are those who learn the Qur'an and teach it.", ref:"Sahih Bukhari 5027"},
  {ar:"اقْرَؤُوا الْقُرْآنَ فَإِنَّهُ يَأْتِي يَوْمَ الْقِيَامَةِ شَفِيعًا لِأَصْحَابِهِ", en:"Recite the Qur'an, for it will come as an intercessor on the Day of Resurrection.", ref:"Sahih Muslim 804"},
  {ar:"الْمَاهِرُ بِالْقُرْآنِ مَعَ السَّفَرَةِ الْكِرَامِ الْبَرَرَةِ", en:"The one proficient in the Qur'an will be with the noble, righteous scribes.", ref:"Sahih Bukhari 4937"},
];

/* ── Utility formatting ─────────────────────────────────────────── */
function fmtSecs(s:number): string {
  if(s<60) return `${s}s`;
  return `${Math.floor(s/60)}m ${s%60}s`;
}
function fmtDate(d:string): string {
  return new Date(d+"T00:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"});
}
function scoreColor(s:number): string {
  return s>=80?"#16a34a":s>=60?"#d97706":"#dc2626";
}

/* ══════════════════════════════════════════════════════════════════
   SESSION OVERLAY — full-screen recitation session
═══════════════════════════════════════════════════════════════════*/

/* ═══════════════════════════════════════════════════════════════
   FULL AUDIO PLAYER — seekable, shows duration
═══════════════════════════════════════════════════════════════ */
// ─────────────────────────────────────────────────────────────────────────────
// FullAudioPlayer — feature-rich player for student recitation playback.
//
// Uses `new Audio()` (HTMLAudioElement outside React DOM) to avoid the
// ref-timing race that caused silent playback on Android after mic recording
// flipped the audio session to earpiece mode.  RAF-based progress gives smooth
// seek bar updates.  Speed control + ±15 s skip match standard player UX.
// ─────────────────────────────────────────────────────────────────────────────
function FullAudioPlayer({ url, label = "Your Recitation" }: { url: string; label?: string }) {
  // ── AudioContext-based player ─────────────────────────────────────────────
  // We deliberately avoid HTMLAudioElement for post-recording playback on Android.
  // After getUserMedia(), Android Chrome locks the audio session to
  // MODE_IN_COMMUNICATION (earpiece). HTMLAudioElement.play() is silent even though
  // the UI shows playback — this persists even after createMediaElementSource tricks.
  //
  // The ONLY 100% reliable fix: decode the blob into PCM and play via
  // AudioBufferSourceNode. AudioContext.destination ALWAYS maps to STREAM_MUSIC
  // (loudspeaker) on Android, completely bypassing the communication audio route.
  //
  // For remote URLs (signed storage URLs) we fetch the bytes first, then decode.
  // ─────────────────────────────────────────────────────────────────────────

  const ctxRef    = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const startedAtRef  = useRef<number>(0);   // ctx.currentTime when playback started
  const offsetRef     = useRef<number>(0);   // seconds into buffer at last pause
  const rafRef        = useRef<number | null>(null);

  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [curTime,  setCurTime]  = useState(0);
  const [loaded,   setLoaded]   = useState(false);
  const [error,    setError]    = useState(false);
  const [speed,    setSpeed]    = useState(1);

  const getCtx = () => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      ctxRef.current = new AudioCtx();
    }
    return ctxRef.current;
  };

  const stopRAF = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  const startRAF = useCallback((ctx: AudioContext, buffer: AudioBuffer) => {
    const tick = () => {
      const elapsed = (ctx.currentTime - startedAtRef.current) * speed;
      const current = Math.min(offsetRef.current + elapsed, buffer.duration);
      setCurTime(current);
      setProgress(buffer.duration > 0 ? current / buffer.duration : 0);
      if (current < buffer.duration) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // Reached end
        setPlaying(false);
        setCurTime(0); setProgress(0);
        offsetRef.current = 0;
        stopRAF();
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [speed, stopRAF]);

  const stopSource = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
  }, []);

  // Load + decode audio whenever URL changes
  useEffect(() => {
    setLoaded(false); setError(false); setPlaying(false);
    setProgress(0); setCurTime(0); setDuration(0);
    stopRAF(); stopSource();
    offsetRef.current = 0;
    bufferRef.current = null;
    if (!url) return;

    let cancelled = false;
    (async () => {
      try {
        let arrayBuf: ArrayBuffer;

        if (url.startsWith("blob:")) {
          // Blob URLs can only be fetched if they were created in this same
          // page session. A revoked/stale blob URL throws a NetworkError.
          // We catch that specifically and set error so the UI can show a
          // helpful message instead of crashing.
          try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            arrayBuf = await resp.arrayBuffer();
          } catch (blobErr) {
            // Blob URL is stale (page was refreshed / navigated away).
            // Show a soft error — don't crash the rest of the session.
            if (!cancelled) {
              console.warn("FullAudioPlayer: blob URL no longer valid (page refreshed?):", blobErr);
              setError(true);
            }
            return;
          }
        } else {
          // Remote https: URL — normal fetch
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          arrayBuf = await resp.arrayBuffer();
        }

        if (cancelled) return;
        const ctx = getCtx();
        // Resume context so decodeAudioData works (required on some mobile browsers)
        if (ctx.state === "suspended") await ctx.resume();
        const decoded = await ctx.decodeAudioData(arrayBuf);
        if (cancelled) return;
        bufferRef.current = decoded;
        setDuration(decoded.duration);
        setLoaded(true);
      } catch (e) {
        if (!cancelled) { console.warn("FullAudioPlayer decode error:", e); setError(true); }
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRAF(); stopSource();
      ctxRef.current?.close().catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async () => {
    const buffer = bufferRef.current;
    if (!buffer) return;

    if (playing) {
      // Pause: record current offset so resume starts from here
      const ctx = getCtx();
      const elapsed = (ctx.currentTime - startedAtRef.current) * speed;
      offsetRef.current = Math.min(offsetRef.current + elapsed, buffer.duration);
      stopSource(); stopRAF();
      setPlaying(false);
    } else {
      // Play (or resume)
      const ctx = getCtx();
      if (ctx.state === "suspended") await ctx.resume();
      stopSource(); // clean up any lingering source

      // If at end, restart from beginning
      if (offsetRef.current >= buffer.duration - 0.05) offsetRef.current = 0;

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = speed;
      src.connect(ctx.destination);
      src.onended = () => {
        // Only reset if this source wasn't manually stopped
        if (sourceRef.current === src) {
          stopRAF();
          setPlaying(false);
          setCurTime(0); setProgress(0);
          offsetRef.current = 0;
          sourceRef.current = null;
        }
      };
      src.start(0, offsetRef.current);
      sourceRef.current = src;
      startedAtRef.current = ctx.currentTime;
      setPlaying(true);
      startRAF(ctx, buffer);
    }
  };

  const skip = (secs: number) => {
    const buffer = bufferRef.current; if (!buffer) return;
    const ctx = getCtx();
    if (playing) {
      const elapsed = (ctx.currentTime - startedAtRef.current) * speed;
      offsetRef.current = Math.max(0, Math.min(buffer.duration, offsetRef.current + elapsed + secs));
      stopSource(); stopRAF(); setPlaying(false);
      // Restart from new position
      setTimeout(() => toggle(), 0);
    } else {
      offsetRef.current = Math.max(0, Math.min(buffer.duration, offsetRef.current + secs));
      setCurTime(offsetRef.current);
      setProgress(buffer.duration > 0 ? offsetRef.current / buffer.duration : 0);
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const buffer = bufferRef.current; if (!buffer) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const clientX = "touches" in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    offsetRef.current = fraction * buffer.duration;
    setCurTime(offsetRef.current);
    setProgress(fraction);
    if (playing) { stopSource(); stopRAF(); setPlaying(false); setTimeout(() => toggle(), 0); }
  };

  const cycleSpeed = () => {
    const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    setSpeed(next);
    if (sourceRef.current) sourceRef.current.playbackRate.value = next;
  };

  const fmt = (s: number) =>
    (!isFinite(s) || isNaN(s)) ? "0:00"
      : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div style={{ background: `linear-gradient(135deg,${G1}08,${G2}14)`,
      border: `1.5px solid ${GOLD}55`, borderRadius: 16, padding: "14px 16px" }}>

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%",
          background: `linear-gradient(135deg,${G2},${G3})`,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Mic size={17} color={GOLD}/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: G1,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</p>
          <p style={{ margin: 0, fontSize: 10, color: "#9CA3AF" }}>
            {error ? "⚠ Recording unavailable (page was refreshed)" : loaded ? `${fmt(duration)} · ${speed}×` : "Loading audio…"}
          </p>
        </div>
        <button onClick={cycleSpeed}
          style={{ padding: "4px 10px", borderRadius: 20, border: `1.5px solid ${GOLD}88`,
            background: "transparent", color: GOLD, fontSize: 11, fontWeight: 800,
            cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
          {speed}×
        </button>
      </div>

      {/* Controls row: skip-back | play-pause | skip-forward */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, marginBottom: 12 }}>
        <button onClick={() => skip(-15)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 6,
            color: G2, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
          <SkipBack size={20} color={G2}/>
          <span style={{ fontSize: 8, color: "#9CA3AF", fontWeight: 700 }}>15s</span>
        </button>

        <button onClick={toggle} disabled={!loaded && !error}
          style={{ width: 54, height: 54, borderRadius: "50%", border: "none",
            cursor: loaded ? "pointer" : "not-allowed",
            background: loaded ? `linear-gradient(135deg,${GOLD},${GOLD_L})` : "#E5E7EB",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: loaded ? `0 4px 16px ${GOLD}66` : "none", flexShrink: 0 }}>
          {playing
            ? <span style={{ display: "flex", gap: 4 }}>
                <span style={{ width: 4, height: 16, background: "#1C3A2F", borderRadius: 2 }}/>
                <span style={{ width: 4, height: 16, background: "#1C3A2F", borderRadius: 2 }}/>
              </span>
            : <Play size={20} color={loaded ? "#1C3A2F" : "#9CA3AF"} style={{ marginLeft: 3 }}/>}
        </button>

        <button onClick={() => skip(15)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 6,
            color: G2, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
          <SkipForward size={20} color={G2}/>
          <span style={{ fontSize: 8, color: "#9CA3AF", fontWeight: 700 }}>15s</span>
        </button>
      </div>

      {/* Seek bar */}
      <div onClick={seek} onTouchStart={seek}
        style={{ height: 8, borderRadius: 4, background: "#E5E7EB",
          cursor: loaded ? "pointer" : "default", overflow: "hidden", position: "relative", marginBottom: 4 }}>
        <div style={{ height: "100%", borderRadius: 4,
          background: `linear-gradient(to right,${GOLD},${GOLD_L})`,
          width: `${progress * 100}%`, transition: "width 0.05s linear" }}/>
      </div>

      {/* Time stamps */}
      <div style={{ display: "flex", justifyContent: "space-between",
        fontSize: 9, color: "#9CA3AF", fontWeight: 600 }}>
        <span>{fmt(curTime)}</span>
        <span>{loaded ? fmt(duration) : "--:--"}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PROCTORING INTRO — countdown + instructions before test
═══════════════════════════════════════════════════════════════ */
function ProctoringIntro({onReady,countA,countB}:{onReady:()=>void;countA:number;countB:number}) {
  const [cd,setCd]=useState(10);
  const [ready,setReady]=useState(false);
  useEffect(()=>{if(cd<=0){setReady(true);return;}const t=setTimeout(()=>setCd(x=>x-1),1000);return()=>clearTimeout(t);},[cd]);
  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 20px",gap:16,overflowY:"auto",background:`linear-gradient(160deg,${G0},${G1})`}}>
      <div style={{width:68,height:68,borderRadius:"50%",background:"#7c3aed22",border:"3px solid #7c3aed",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 32px #7c3aed44"}}><ShieldCheck size={30} color="#7c3aed"/></div>
      <div style={{textAlign:"center"}}>
        <p style={{margin:"0 0 4px",fontWeight:900,fontSize:20,color:W}}>Proctored Test</p>
        <p style={{margin:0,fontSize:12,color:"rgba(255,255,255,.5)"}}>اختبار الحفظ تحت المراقبة</p>
      </div>
      <div style={{width:"100%",maxWidth:340,background:"rgba(255,255,255,.06)",borderRadius:16,padding:"16px",border:"1px solid rgba(255,255,255,.1)"}}>
        <p style={{margin:"0 0 12px",fontSize:10,fontWeight:800,color:`${GOLD}cc`,textTransform:"uppercase",letterSpacing:.8}}>Before You Begin</p>
        {["🎯 Quiet, focused environment","📵 Do Not Disturb mode on","🚫 Do NOT switch tabs — it will be flagged","📖 Do NOT look at the Qur'an","🤍 Answer honestly — this tests your hifdh"].map((t,i)=>(
          <div key={i} style={{display:"flex",gap:8,padding:"7px 0",borderBottom:i<4?"1px solid rgba(255,255,255,.06)":"none",alignItems:"flex-start"}}>
            <p style={{margin:0,fontSize:12,color:"rgba(255,255,255,.7)",lineHeight:1.5}}>{t}</p>
          </div>
        ))}
      </div>
      <div style={{width:"100%",maxWidth:340,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{padding:"12px",borderRadius:12,background:`${GOLD}18`,border:`1px solid ${GOLD}44`,textAlign:"center"}}>
          <p style={{margin:0,fontWeight:900,fontSize:22,color:GOLD}}>{countA}</p>
          <p style={{margin:0,fontSize:9,fontWeight:700,color:`${GOLD}88`,textTransform:"uppercase"}}>Section A</p>
          <p style={{margin:0,fontSize:9,color:`${GOLD}66`}}>Today's Pages</p>
        </div>
        <div style={{padding:"12px",borderRadius:12,background:"#7c3aed18",border:"1px solid #7c3aed44",textAlign:"center"}}>
          <p style={{margin:0,fontWeight:900,fontSize:22,color:"#7c3aed"}}>{countB}</p>
          <p style={{margin:0,fontSize:9,fontWeight:700,color:"#7c3aed88",textTransform:"uppercase"}}>Section B</p>
          <p style={{margin:0,fontSize:9,color:"#7c3aed66"}}>Juz Review</p>
        </div>
      </div>
      {!ready?(
        <div style={{padding:"16px 24px",borderRadius:14,background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",textAlign:"center",width:"100%",maxWidth:340}}>
          <p style={{margin:"0 0 6px",fontSize:11,color:"rgba(255,255,255,.5)",fontWeight:600}}>Concentrate — test begins in</p>
          <p style={{margin:0,fontWeight:900,fontSize:48,color:GOLD,lineHeight:1}}>{cd}</p>
        </div>
      ):(
        <button onClick={onReady} style={{width:"100%",maxWidth:340,padding:"15px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",background:`linear-gradient(135deg,${GOLD},${GOLD_L})`,color:G0,fontWeight:900,fontSize:15,boxShadow:`0 4px 20px ${GOLD}55`}}>
          ✅ I am Focused — Begin Test
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PRE-TEST REVIEW — listen to recording + see errors before test
═══════════════════════════════════════════════════════════════ */
function PreTestReview({audioUrl,pageResults,onContinue}:{audioUrl:string|null;pageResults:PageResult[];onContinue:()=>void}) {
  const errorWords=pageResults.flatMap(r=>r.errorWords);
  const avgScore=pageResults.length?Math.round(pageResults.reduce((s,r)=>s+r.score,0)/pageResults.length):0;
  const sc=avgScore>=80?"#16a34a":avgScore>=55?"#d97706":"#dc2626";
  return(
    <div style={{flex:1,overflowY:"auto",padding:"16px 16px 32px",display:"flex",flexDirection:"column",gap:14}}>
      <div style={{borderRadius:18,background:`linear-gradient(135deg,${G1},${G2})`,padding:"16px",border:`1px solid ${GOLD}33`}}>
        <p style={{margin:"0 0 2px",fontSize:10,fontWeight:700,color:`${GOLD}aa`,textTransform:"uppercase",letterSpacing:.6}}>Pre-Test Review</p>
        <p style={{margin:"0 0 4px",fontWeight:900,fontSize:18,color:W}}>Listen Before the Test</p>
        <p style={{margin:0,fontSize:11,color:"rgba(255,255,255,.55)"}}>Review your recitation — note where you need to focus</p>
      </div>
      {audioUrl
        ?<FullAudioPlayer url={audioUrl} label="Your Complete Recitation — Full Playback"/>
        :<div style={{padding:"16px",borderRadius:12,background:`${AMBER}10`,border:`1px solid ${AMBER}33`,textAlign:"center"}}><p style={{margin:0,fontSize:13,color:AMBER,fontWeight:700}}>Audio not available — check connection</p></div>
      }
      <div style={{background:W,borderRadius:14,border:`1px solid ${BRD}`,padding:"14px"}}>
        <p style={{margin:"0 0 10px",fontSize:10,fontWeight:800,color:G3,textTransform:"uppercase",letterSpacing:.5}}>Recitation Summary</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div style={{padding:"12px",borderRadius:12,textAlign:"center",background:`${sc}10`,border:`1.5px solid ${sc}33`}}>
            <p style={{margin:0,fontWeight:900,fontSize:28,color:sc}}>{avgScore}%</p>
            <p style={{margin:0,fontSize:9,fontWeight:700,color:"#6B7280",textTransform:"uppercase"}}>Avg Recitation</p>
          </div>
          <div style={{padding:"12px",borderRadius:12,textAlign:"center",background:"#FEF2F244",border:"1.5px solid #FECACA"}}>
            <p style={{margin:0,fontWeight:900,fontSize:28,color:FAIL}}>{errorWords.length}</p>
            <p style={{margin:0,fontSize:9,fontWeight:700,color:"#6B7280",textTransform:"uppercase"}}>Error Words</p>
          </div>
        </div>
      </div>
      {errorWords.length>0&&(
        <div style={{background:W,borderRadius:14,border:`1px solid ${BRD}`,padding:"14px"}}>
          <p style={{margin:"0 0 10px",fontSize:10,fontWeight:800,color:FAIL,textTransform:"uppercase",letterSpacing:.5}}>⚠️ Focus on These Words During Test</p>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,direction:"rtl"}}>
            {errorWords.slice(0,20).map((w,i)=><span key={i} style={{padding:"4px 10px",borderRadius:8,background:"#FEF2F2",border:"1px solid #FECACA",fontFamily:"'Amiri',serif",fontSize:15,color:FAIL,fontWeight:600}}>{stripWaqf(w)}</span>)}
          </div>
          <p style={{margin:"8px 0 0",fontSize:11,color:AMBER,fontWeight:600}}>📋 Test questions will specifically target these areas</p>
        </div>
      )}
      <button onClick={onContinue} style={{padding:"15px",borderRadius:14,border:"none",cursor:"pointer",background:`linear-gradient(135deg,${GOLD},${GOLD_L})`,color:G0,fontWeight:900,fontSize:15,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:`0 4px 16px ${GOLD}55`}}>
        <ShieldCheck size={18}/> Proceed to Proctored Test
      </button>
    </div>
  );
}

interface SessionProps {
  assignment: Assignment;
  userId: string;
  todayPages: number[];
  onClose: (completed?: boolean) => void;
  todayLog?: DailyLog | null;
}

function SessionOverlay({ assignment, userId, todayPages, onClose, todayLog }: SessionProps) {
  // Admin-configured Hifdh settings (pass mark + "Hifdh Proctoring" on/off).
  // Falls back to the module defaults (55%) until loaded.
  const { settings: hifdhSettings } = useHifdhSettings();
  const PASS_THRESHOLD      = hifdhSettings.pass_mark ?? DEFAULT_HIFDH_SETTINGS.pass_mark;
  const TEST_PASS_THRESHOLD = PASS_THRESHOLD;
  const hifdhProctoringEnabled = hifdhSettings.proctoring_enabled;

  // ── Face-capture (webcam) proctoring for the testing phase ──────────────
  // Reuses the same engine that powers HifdhTest.tsx / ExamTaking.tsx. Gated by
  // the admin "Hifdh Proctoring" toggle so it only requests the camera when the
  // school has actually enabled proctored testing.
  const proctoringConfig = React.useMemo(() => ({
    attemptId: `${assignment.id}-${todayISO()}`,
    userId,
    proctoring_enabled: true,
    webcam_required: true,
    screenshot_interval_seconds: 30,
    max_warnings: 5,
    auto_submit_on_violation: false,
    tab_switch_limit: 3,
    sessionType: "hifdh" as const,
    contextLabel: `Hifdh Daily Revision — ${todayISO()}`,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [assignment.id, userId]);

  // If recitation is done today but quiz not yet completed, start directly at quiz
  // Only resume to quiz if recitation is done AND score passed the threshold.
  // A 2% score means they failed recitation — they should redo it, not skip to quiz.
  const recitationAlreadyDone = !!(
    todayLog &&
    !todayLog.completed &&
    todayLog.session_data?.recitation_score != null &&
    todayLog.session_data.recitation_score >= PASS_THRESHOLD
  );

  const [phase,        setPhase]       = useState<Phase>(recitationAlreadyDone ? "proctor_intro" : "intro");
  const procState = useProctoring(
    proctoringConfig,
    phase === "testing" && !!hifdhProctoringEnabled && !!userId,
  );
  const [pageIdx,      setPageIdx]     = useState(0);
  const [pageAyahs,    setPageAyahs]   = useState<Ayah[]>([]);
  const [fetchingPage, setFetchingPage] = useState(false);
  // PageResults saved to DB have stripped ayah data (text, numberInSurah, surahName, surahNum).
  // buildQuestions() needs full Ayah objects with surah.number / surah.englishName.
  // Reconstruct them here so .text and .surah.* don't crash when building quiz questions.
  const rebuildPageResults = (raw: any[]): PageResult[] =>
    (raw ?? []).map((r: any) => ({
      ...r,
      ayahs: (r.ayahs ?? []).map((a: any) => ({
        number:        a.number ?? 0,
        numberInSurah: a.numberInSurah ?? 0,
        text:          a.text ?? "",
        surah: {
          number:      a.surahNum ?? 0,
          name:        a.surahName ?? "",
          englishName: a.surahName ?? "",
        },
      })),
      errorWords:      r.errorWords ?? [],
      ayahCorrectness: r.ayahCorrectness ?? [],
      transcript:      r.transcript ?? "",
    }));

  const [pageResults,  setPageResults] = useState<PageResult[]>(
    recitationAlreadyDone
      ? rebuildPageResults(todayLog?.session_data?.page_results ?? [])
      : []
  );
  const [score,        setScore]       = useState<number|null>(null);
  const [errorWords,   setErrorWords]  = useState<string[]>([]);
  const [retryCount,   setRetryCount]  = useState(0);
  const [retryMsg,     setRetryMsg]    = useState("");
  const [questions,    setQuestions]   = useState<Question[]>([]);
  const [juzAyahs,     setJuzAyahs]    = useState<Ayah[]>([]);
  const [qIdx,         setQIdx]        = useState(0);
  const [answers,      setAnswers]     = useState<(number|null)[]>([]);
  const [recitationScore, setRecitationScore] = useState<number|null>(
    recitationAlreadyDone ? (todayLog?.session_data?.recitation_score ?? null) : null
  );
  const [testScore,    setTestScore]   = useState<number|null>(null);
  const [sectionAScore,setSectionAScore] = useState<number|null>(null);
  const [sectionBScore,setSectionBScore] = useState<number|null>(null);
  const [finalScore,   setFinalScore]  = useState(0);
  const [tabSwitchCount,setTabSwitchCount] = useState(0);
  const [focusWarning, setFocusWarning] = useState(false);
  const [savedAudioUrl,setSavedAudioUrl] = useState<string|null>(
    recitationAlreadyDone ? (todayLog?.session_data?.audio_url ?? null) : null
  );
  // Record-type question state
  const [qRecording,   setQRecording]   = useState(false);
  const [qRecSecs,     setQRecSecs]     = useState(0);
  const [qRecChunks,   setQRecChunks]   = useState<Blob[]>([]);
  const [qRecResult,   setQRecResult]   = useState<{transcript:string;score:number}|null>(null);
  const [qRecDone,     setQRecDone]     = useState(false);
  const qRecTimerRef  = useRef<any>(null);
  const qMediaRecRef  = useRef<MediaRecorder|null>(null);
  // Per-question complexity-based countdown timer (testing phase)
  const [qTimeLeft,    setQTimeLeft]    = useState(0);
  const qCountdownRef  = useRef<any>(null);
  // TTS / listen state
  const [isSpeaking,   setIsSpeaking]   = useState(false);
  const [listenDone,   setListenDone]   = useState(false);
  const [listenError,    setListenError]    = useState(false);
  const [listenErrorUrl, setListenErrorUrl] = useState("");
  // Ref to the currently-playing CDN audio so we can stop it when question changes
  const listenAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isRecording,  setIsRecording] = useState(false);
  const [recSecs,      setRecSecs]     = useState(0);
  // Seconds from a previous partial recording — timer starts here on "Continue Recording"
  const [carryOverSecs, setCarryOverSecs] = useState(0);
  const [submitting,   setSubmitting]  = useState(false);
  const [audioUrl,     setAudioUrl]    = useState<string|null>(null);
  const [lastTranscript, setLastTranscript] = useState("");
  const [ayahCorrectness, setAyahCorrectness] = useState<boolean[]>([]);
  // True when transcription returned nothing because no API key is configured
  const [noApiWarning, setNoApiWarning] = useState(false);
  const hadith = HADITHS[Math.floor(Math.random()*HADITHS.length)];
  const sessionStart = useRef(Date.now());
  const timerRef     = useRef<any>(null);
  const mediaRecRef  = useRef<MediaRecorder|null>(null);
  const audioChunks  = useRef<Blob[]>([]);
  const audioBlobRef       = useRef<Blob|null>(null);
  const audioStorageUrlRef = useRef<string|null>(null);
  const pageAyahsRef = useRef<Ayah[]>([]);
  const recSecsRef   = useRef(0);
  const wakeLockRef  = useRef<any>(null);

  // ── ROLLING TRANSCRIPTION (Groq) ──────────────────────────────────────────
  // The Quran page is hidden while recording (see QuranPage render guard below),
  // so there's no on-screen word reveal to drive anymore — WebSpeech-based live
  // reveal has been removed entirely. What WebSpeech was never needed for (word
  // reveal) is separate from what made scoring slow: uploading the WHOLE
  // recording to Groq only after the student taps stop. To fix that we run a
  // second, short-lived MediaRecorder alongside the main one that restarts
  // every ROLL_INTERVAL_MS, sending each self-contained segment to Groq in the
  // background WHILE the student keeps reciting. By the time they tap
  // "Finished", only the last few seconds still need transcribing.
  const ROLL_INTERVAL_MS = 12000;
  const chunkRecRef = useRef<MediaRecorder | null>(null);
  const chunkRestartTimerRef = useRef<any>(null);
  const rollingTranscriptRef = useRef<string>("");
  const stylePromptRef = useRef<string>("");
  const chunkFinalWaiterRef = useRef<(() => void) | null>(null);

  // ── WAKE LOCK: keep screen on for entire session ─────────────────────────
  useEffect(() => {
    const acquire = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
        }
      } catch { /* browser doesn't support or user denied */ }
    };
    acquire();
    const onVisible = () => { if (document.visibilityState === "visible") acquire(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  const SESSION_KEY = `hifdh_session_${userId}_${todayISO()}`;

  // ── PERSIST progress to sessionStorage ───────────────────────────────────
  // IMPORTANT: Skip the very first run so the RESTORE effect below can read
  // the saved session before this effect clears it (React runs effects in
  // definition order — persist fires before restore on the initial mount).
  const isFirstPersistRun = useRef(true);
  useEffect(() => {
    if (isFirstPersistRun.current) { isFirstPersistRun.current = false; return; }
    if (phase === "intro" || phase === "complete") { sessionStorage.removeItem(SESSION_KEY); return; }
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        phase, pageIdx, pageResults, recitationScore,
        recSecs: recSecsRef.current,          // ← timer continuity
        savedAudioUrl: savedAudioUrl ?? null,
        questions: questions.length > 0 ? questions : undefined,
        juzAyahs:  juzAyahs.length  > 0 ? juzAyahs  : undefined,
        savedAt: Date.now(),
      }));
    } catch { /* quota exceeded */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pageIdx, pageResults, recitationScore]);

  // ── RETURN BANNER state ───────────────────────────────────────────────────
  const [returnBanner, setReturnBanner] = useState<"recitation"|"test"|null>(null);

  // ── RESTORE SESSION on mount ─────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (Date.now() - saved.savedAt > 2 * 60 * 60 * 1000) { sessionStorage.removeItem(SESSION_KEY); return; }
      if (["reading","page_result","pre_test_review","proctor_intro"].includes(saved.phase)) {
        setPageIdx(saved.pageIdx ?? 0);
        setPageResults(saved.pageResults ?? []);
        if (saved.recitationScore) setRecitationScore(saved.recitationScore);
        if (saved.savedAudioUrl) setSavedAudioUrl(saved.savedAudioUrl);
        if (saved.recSecs)   setCarryOverSecs(saved.recSecs);   // ← resume timer
        setPhase("reading");
        setReturnBanner("recitation");
        // Attempt to restore the partial audio blob saved to IndexedDB mid-recording
        const blobKey = `${userId}_${todayISO()}_partial`;
        idbLoadBlob(blobKey).then(blob => {
          if (blob) { audioChunks.current = [blob]; }
        });
      } else if (["testing","test_result"].includes(saved.phase)) {
        setPageIdx(saved.pageIdx ?? 0);
        setPageResults(saved.pageResults ?? []);
        if (saved.recitationScore) setRecitationScore(saved.recitationScore);
        if (saved.savedAudioUrl) setSavedAudioUrl(saved.savedAudioUrl);
        if (saved.questions) { setQuestions(saved.questions); setAnswers(new Array(saved.questions.length).fill(null)); }
        if (saved.juzAyahs) setJuzAyahs(saved.juzAyahs);
        setPhase("proctor_intro");
        setReturnBanner("test");
      }
    } catch { sessionStorage.removeItem(SESSION_KEY); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── VISIBILITY CHANGE during session: stop recording, show resume banner ─
  useEffect(() => {
    const handleReturn = () => {
      if (document.visibilityState !== "visible") return;
      if (isRecording) { handleStop(); setReturnBanner("recitation"); return; }
      if (phase === "testing") setReturnBanner("test");
    };
    document.addEventListener("visibilitychange", handleReturn);
    return () => document.removeEventListener("visibilitychange", handleReturn);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isRecording]);

  /* ── fetch ayahs when phase=reading ── */
  useEffect(() => {
    if (phase!=="reading") return;
    const pn = todayPages[pageIdx];
    if (!pn) return;
    setFetchingPage(true); setPageAyahs([]);
    fetchPageAyahs(pn).then(a => { setPageAyahs(a); pageAyahsRef.current = a; setFetchingPage(false); });
  }, [phase, pageIdx, todayPages]);

  /* ── keep recSecsRef in sync so mr.onstop can read it ── */
  useEffect(() => { recSecsRef.current = recSecs; }, [recSecs]);

  /* ── save partial log whenever a page evaluation lands ── */
  /* This lets the admin see the attempt even if the student never passes */
  useEffect(() => {
    if (phase !== "page_result" || score === null) return;
    const today = todayISO();
    const last  = lastResultRef.current;
    // Build word-level results using compareWords (same as مراجعة)
    const ref       = pageAyahsRef.current.map((a:any)=>a.text).join(" ");
    const wordRes   = compareWords(ref, last?.tx ?? "");
    (async () => {
      try {
        // Preserve teacher override: if teacher already reviewed this log, keep their score and override flag
        const existingTeacherOverride = todayLog?.session_data?.teacher_override;
        const { error } = await (supabase as any).from("hifdh_daily_logs").upsert({
          student_id:    userId,
          assignment_id: assignment?.id,
          log_date:      today,
          pages_revised: todayPages.length,
          avg_score:     existingTeacherOverride ? existingTeacherOverride.score : score,
          duration_secs: recSecsRef.current,
          completed:     false,          // always save — even on failed/retry attempts
          session_data: {
            recitation_score: score,
            test_score:       null,
            pages_done:       todayPages.slice(0, pageIdx + 1),
            // audioStorageUrlRef is guaranteed populated before setScore fires (see mr.onstop fix)
            audio_url:        audioStorageUrlRef.current,
            page_results: [
              ...pageResults,
              {
                pageNum:         todayPages[pageIdx],
                score,
                transcript:      last?.tx ?? "",
                word_results:    wordRes,  // full word-level detail for admin
                ayahCorrectness: last?.ayahCorrectness ?? [],
                errorWords,
              },
            ],
            // Flag for admin/teacher dashboards only — never shown to the student.
            // Lets staff see at a glance that this page's score is unreliable
            // because no transcription engine returned text (e.g. API outage).
            ...(noApiWarning ? { transcription_failed: true, transcription_failed_reason: lastTranscribeErrorRef.current || "unknown" } : {}),
            // Preserve teacher override so it isn't wiped by re-attempts
            ...(existingTeacherOverride ? { teacher_override: existingTeacherOverride } : {}),
          },
        }, { onConflict: "student_id,log_date" });
        if (error) console.warn("[HifdhDaily] interim save error:", error);
      } catch(e) { console.warn("[HifdhDaily] interim save exception:", e); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, score]);


  /* ── Proctoring: detect tab switches during test ─────────────── */
  useEffect(()=>{
    if(phase!=="testing") return;
    const handler=()=>{
      if(document.hidden){
        setTabSwitchCount(c=>c+1);
        setFocusWarning(true);
        setTimeout(()=>setFocusWarning(false), 4000);
      }
    };
    document.addEventListener("visibilitychange",handler);
    return()=>document.removeEventListener("visibilitychange",handler);
  },[phase]);

  /* ── Hifdh Proctoring (admin-controlled, default OFF) ───────────────────
     When enabled in Admin Settings → Hifdh → Hifdh Proctoring, this extends
     focus-mode protection across the ENTIRE session — recitation ("reading"/
     recording) AND the questions/test ("testing") phase — not just the quiz:
       • Detects tab/app switching (flags it, same counter used by teachers)
       • Blocks copy, cut, paste and right-click so students can't look up
         answers or paste in text
     This is intentionally separate from the camera-based useProctoring hook
     (used elsewhere for exams) — Hifdh sessions are voice-based and don't
     need a webcam, just focus protection. */
  useEffect(() => {
    if (!hifdhProctoringEnabled) return;
    if (phase !== "reading" && phase !== "testing") return;
    const onHidden = () => {
      if (document.hidden) {
        setTabSwitchCount(c => c + 1);
        setFocusWarning(true);
        setTimeout(() => setFocusWarning(false), 4000);
      }
    };
    const block = (e: Event) => e.preventDefault();
    document.addEventListener("visibilitychange", onHidden);
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("paste", block);
    document.addEventListener("contextmenu", block);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("paste", block);
      document.removeEventListener("contextmenu", block);
    };
  }, [hifdhProctoringEnabled, phase]);

  /* ── Fetch juz ayahs for Section B (lazy, from assignment start up to today) ──
     Bounded below by `base` (the admin-assigned starting point — e.g. Juz 1 page 1)
     and above by `todayFirst` (never reaches into pages not yet revised).
     Capped to the most recent MAX_LOOKBACK pages for performance on long programmes,
     while still allowing review of any page within that window, not just the last 3. */
  const fetchJuzAyahs = useCallback(async () => {
    if (juzAyahs.length > 0) return juzAyahs;
    const MAX_LOOKBACK = 20;
    const base = (() => {
      const a = assignment;
      const first = a.selected_items?.[0];
      if (!first) return 1;
      if (a.mode === "juz") return ({1:1,2:22,3:42,4:62,5:82,6:102,7:122,8:142,9:162,10:182,11:202,12:222,13:242,14:262,15:282,16:302,17:322,18:342,19:362,20:382,21:402,22:422,23:442,24:462,25:482,26:502,27:522,28:542,29:562,30:582} as any)[first] ?? 1;
      return 1;
    })();
    const todayFirst = todayPages[0] ?? 1;
    const pagesToFetch: number[] = [];
    for (let p = Math.max(base, todayFirst - MAX_LOOKBACK); p < todayFirst; p++) {
      if (p >= 1 && p <= 604) pagesToFetch.push(p);
    }
    if (!pagesToFetch.length) return [];
    const results = await Promise.all(pagesToFetch.map(fetchPageAyahs));
    const flat = results.flat();
    setJuzAyahs(flat);
    return flat;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment, todayPages, juzAyahs]);

  const startRecording = useCallback(async () => {
    try {
      setAudioUrl(null); setSavedAudioUrl(null); audioChunks.current = []; audioBlobRef.current = null; audioStorageUrlRef.current = null;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,    // boosts quiet recitation to an audible level
          sampleRate: 48000,
          channelCount: 1,
        }
      });
      const mime = ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg"].find(t => {
        try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
      }) || "";
      const mr = new MediaRecorder(stream, mime ? {
        mimeType: mime,
        audioBitsPerSecond: 192000,   // 192 kbps — clearer audio for Quranic evaluation & playback
      } : { audioBitsPerSecond: 192000 });
      const blobKey = `${userId}_${todayISO()}_partial`;
      mr.ondataavailable = (e) => {
        if (e.data?.size > 0) {
          audioChunks.current.push(e.data);
          // Persist the accumulated blob to IndexedDB after each chunk so that
          // a page refresh doesn't lose partial audio (IDB survives navigation).
          const partial = new Blob(audioChunks.current, { type: mime || "audio/webm" });
          idbSaveBlob(blobKey, partial);
        }
      };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(timerRef.current);

        // Audio routing is handled inside FullAudioPlayer/AudioPlayerWidget via AudioContext.decodeAudioData().
        const blob = new Blob(audioChunks.current, { type: mime || "audio/webm" });
        audioBlobRef.current = blob;
        const localUrl = URL.createObjectURL(blob);
        setAudioUrl(localUrl);
        setSavedAudioUrl(localUrl);
        const capturedSecs = recSecsRef.current;
        const ayahs = pageAyahsRef.current;
        setPhase("page_result");
        setScore(null);

        // Upload audio to storage — defined inline so it can close over blob/userId/today.
        // Returns a signed URL (time-limited, auth-independent) so admin playback works
        // even on private buckets. The local blob URL is kept for immediate student playback
        // and is NEVER replaced with the storage URL (avoids 403 on private buckets).
        const uploadAudioToStorage = async (): Promise<string|null> => {
          try {
            const today = todayISO();
            const ext   = blob.type.includes("mp4") ? "mp4" : "webm";
            const path  = `${userId}/${today}_${Date.now()}.${ext}`;
            const { error: upErr } = await (supabase as any).storage
              .from("hifdh-daily-audio")
              .upload(path, blob, { contentType: blob.type, upsert: true });
            if (!upErr) {
              // Use createSignedUrl (works on private buckets) instead of getPublicUrl
              // which silently returns a broken URL when the bucket has no public policy.
              const { data: signedData } = await (supabase as any).storage
                .from("hifdh-daily-audio")
                .createSignedUrl(path, 60 * 60 * 24); // 24-hour signed URL for admin review
              return signedData?.signedUrl ?? null;
            }
          } catch { /* bucket may not exist yet — silent fail */ }
          return null;
        };

        // Run transcription AND storage upload in parallel.
        // setScore must only fire AFTER both resolve — otherwise the interim-save
        // useEffect fires while audioStorageUrlRef is still null (the race condition).
        Promise.all([finalizeTranscript(blob, pageAyahsRef.current), uploadAudioToStorage()]).then(([tx, storageUrl]) => {
          audioStorageUrlRef.current = storageUrl;
          // ── DO NOT call setSavedAudioUrl(storageUrl) here ────────────────────────────────────────
          // savedAudioUrl is already set to the local blob URL (line above Promise.all).
          // Replacing it with the remote URL caused silent playback failure:
          //   • getPublicUrl returns a URL even for private buckets → 403 when fetched
          //   • FullAudioPlayer fires an error event → player stuck on "⚠ Tap ▶ to retry"
          // The local blob URL is valid for the lifetime of this page session and always
          // plays immediately. The signed storage URL is only needed for admin/DB saving.

          // If no transcription API is configured, show a soft-fail:
          // score 0 but with a clear message rather than silent 0%.
          if (tx === "__NO_API__") {
            setLastTranscript("");
            lastResultRef.current = { tx: "", ayahCorrectness: [] };
            setScore(0);
            setErrorWords([]);
            setAyahCorrectness([]);
            setNoApiWarning(true); // show "Transcription unavailable" banner
            console.warn("[HifdhDaily] Transcription failed — reason:", lastTranscribeErrorRef.current);
            idbDeleteBlob(`${userId}_${todayISO()}_partial`);
            setCarryOverSecs(0);
            return;
          }

          const sc   = scoreText(tx, ayahs, capturedSecs);
          const errs = getErrorWords(tx, ayahs);
          const corr = getAyahCorrectness(tx, ayahs, capturedSecs);
          setLastTranscript(tx);
          lastResultRef.current = { tx, ayahCorrectness: corr };
          setScore(sc); setErrorWords(errs); setAyahCorrectness(corr);
          // Partial blob no longer needed — clean up IDB and reset carry-over
          idbDeleteBlob(`${userId}_${todayISO()}_partial`);
          setCarryOverSecs(0);
        });
      };
      mr.start(200);
      mediaRecRef.current = mr;
      setIsRecording(true);
      setRecSecs(carryOverSecs);           // resume from previous session's elapsed time
      recSecsRef.current = carryOverSecs;
      timerRef.current = setInterval(() => {
        setRecSecs(s => s + 1);
      }, 1000);

      // ── Rolling Groq transcription — kick off the chunk recorder ──────────
      rollingTranscriptRef.current = "";
      stylePromptRef.current = buildStylePrompt(pageAyahsRef.current);
      startChunkRecorder(stream, mime);
      chunkRestartTimerRef.current = setInterval(() => {
        // Refresh the vocabulary hint in case ayahs finished loading late.
        stylePromptRef.current = buildStylePrompt(pageAyahsRef.current);
        restartChunkRecorder(stream, mime);
      }, ROLL_INTERVAL_MS);
    } catch {
      alert("Mic access denied. Please allow microphone access and try again.");
    }
  }, []);

  // ── Vocabulary-hint prompt builder (shared by rolling chunks + fallback) ──
  const buildStylePrompt = (ayahs?: Ayah[]): string => {
    if (ayahs && ayahs.length > 0) {
      const hint = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ " +
        ayahs.slice(0, 2).map(a => a.text).join(" ");
      return hint.slice(0, 220); // Whisper prompt cap
    }
    return "قرآن كريم بالتشكيل الكامل. تلاوة قرآنية بالرسم العثماني.";
  };

  // ── One self-contained MediaRecorder segment → one Groq call ─────────────
  // Each restart produces a fully independent, decodable audio file (unlike
  // slicing an ongoing recorder's chunks, which lack a container header after
  // the first piece), so every segment can be sent to Groq on its own.
  const startChunkRecorder = (stream: MediaStream, mime: string) => {
    const mr2 = new MediaRecorder(stream, mime ? {
      mimeType: mime, audioBitsPerSecond: 128000,
    } : { audioBitsPerSecond: 128000 });
    const localChunks: Blob[] = [];
    mr2.ondataavailable = (e) => { if (e.data?.size > 0) localChunks.push(e.data); };
    mr2.onstop = () => {
      const segBlob = new Blob(localChunks, { type: mime || "audio/webm" });
      const waiter = chunkFinalWaiterRef.current;
      chunkFinalWaiterRef.current = null;
      const finish = () => { if (waiter) waiter(); };
      if (segBlob.size < 3000) { finish(); return; } // near-silent/empty segment
      transcribeAudio(segBlob, undefined, stylePromptRef.current).then(txt => {
        if (txt && txt !== "__NO_API__") {
          rollingTranscriptRef.current = (rollingTranscriptRef.current + " " + txt).trim();
        }
      }).finally(finish);
    };
    chunkRecRef.current = mr2;
    try { mr2.start(); } catch { chunkRecRef.current = null; }
  };

  const restartChunkRecorder = (stream: MediaStream, mime: string) => {
    const old = chunkRecRef.current;
    if (old && old.state !== "inactive") { try { old.stop(); } catch { /* noop */ } }
    startChunkRecorder(stream, mime);
  };

  // Stops the chunk recorder and waits for its final segment's Groq call to
  // resolve (and append to rollingTranscriptRef) before returning.
  const stopChunkRecorderAndWait = (): Promise<void> => {
    clearInterval(chunkRestartTimerRef.current);
    return new Promise((resolve) => {
      const cr = chunkRecRef.current;
      if (!cr || cr.state === "inactive") { resolve(); return; }
      chunkFinalWaiterRef.current = resolve;
      try { cr.stop(); } catch { chunkFinalWaiterRef.current = null; resolve(); }
    });
  };

  const lastTranscribeErrorRef = useRef<string>("");

  // Groq-only, single-shot transcription of one audio blob. Used for:
  //   - each rolling chunk during recording (segment-sized blobs)
  //   - the short "answer this question" recordings elsewhere on this page
  //   - the one-off fallback inside finalizeTranscript if no chunk ever succeeded
  // Deepgram has been removed: Groq alone was already the preferred/winning
  // result almost every time, and racing two providers on every short chunk
  // would double the API calls for no real accuracy benefit.
  // `promptOverride` lets rolling chunks reuse a prompt built once per segment
  // instead of recomputing it from `ayahs` on every call.
  const transcribeAudio = async (blob: Blob, ayahs?: Ayah[], promptOverride?: string): Promise<string> => {
    lastTranscribeErrorRef.current = "";
    const ext = blob.type.includes("mp4") ? "mp4"
      : blob.type.includes("ogg") ? "ogg"
      : "webm";
    const stylePrompt = promptOverride ?? buildStylePrompt(ayahs);

    const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL;
    const SUPABASE_KEY =
      (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
      (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      lastTranscribeErrorRef.current = "groq_supabase_env_missing";
      return "__NO_API__";
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], `recitation.${ext}`, { type: blob.type || "audio/webm" }));
      fd.append("prompt", stylePrompt);
      const r = await fetch(`${SUPABASE_URL}/functions/v1/groq-transcribe`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_KEY}`,
          apikey: SUPABASE_KEY,
        },
        body: fd,
        signal: controller.signal,
      });
      const json = await r.json().catch(() => ({}));
      if (r.ok) {
        const txt = (json.text ?? "").trim();
        return txt; // may legitimately be "" (silence) — caller decides what to do
      }
      lastTranscribeErrorRef.current = `groq_http_${r.status}`;
      console.error(`[HifdhDaily] groq-transcribe failed: HTTP ${r.status}`, json?.error ?? "");
      return "__NO_API__";
    } catch (e: any) {
      lastTranscribeErrorRef.current = e?.name === "AbortError" ? "groq_timeout" : "groq_network_or_cors_error";
      console.error("[HifdhDaily] groq-transcribe fetch failed:", e);
      return "__NO_API__";
    } finally {
      clearTimeout(timeout);
    }
  };

  // Combines whatever the rolling chunks already transcribed with the final
  // tail segment, so only ~12s (at most) of audio is left to transcribe at
  // the moment the student taps "Finished" — not the whole page.
  const finalizeTranscript = async (fullBlob: Blob, ayahs?: Ayah[]): Promise<string> => {
    await stopChunkRecorderAndWait();
    const full = rollingTranscriptRef.current.trim();
    if (full) return full;
    // Safety net: no rolling chunk ever succeeded (e.g. flaky network for the
    // whole session) — fall back to one full-recording Groq call so the
    // student still gets a result instead of nothing.
    const fallback = await transcribeAudio(fullBlob, ayahs);
    return fallback && fallback !== "__NO_API__" && fallback.length > 5 ? fallback : "__NO_API__";
  };

  const lastResultRef = useRef<{ tx: string; ayahCorrectness: boolean[] } | null>(null);

  const handleStop = () => {
    setIsRecording(false);
    clearInterval(timerRef.current);
    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
      mediaRecRef.current.stop(); // triggers mr.onstop → finalizeTranscript → setScore
    }
    mediaRecRef.current = null;
    // mr.onstop handles setPhase("page_result") + setScore(null) + fill
  };

  // Reset per-question record state when question changes
  useEffect(() => {
    // Stop any CDN audio or TTS that was playing for the previous question
    stopListenAudio();
    setQRecording(false); setQRecSecs(0); setQRecChunks([]); setQRecResult(null); setQRecDone(false);
    setListenDone(false);
    setListenError(false);
    setListenErrorUrl("");
    clearInterval(qRecTimerRef.current);
    if (qMediaRecRef.current && qMediaRecRef.current.state !== "inactive") {
      try { qMediaRecRef.current.stop(); } catch {}
    }
    qMediaRecRef.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIdx]);

  const startQRecording = async () => {
    try {
      setQRecChunks([]); setQRecResult(null); setQRecDone(false); setQRecSecs(0);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus","audio/webm","audio/mp4"].find(t => {
        try { return MediaRecorder.isTypeSupported(t); } catch { return false; }
      }) || "";
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => { if (e.data?.size > 0) chunks.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(qRecTimerRef.current);
        setQRecording(false);
        const blob = new Blob(chunks, { type: mime || "audio/webm" });
        const tx = await transcribeAudio(blob, pageAyahsRef.current);
        const q = questions[qIdx];
        // Score against the expected answer
        const expected = q.correctText || "";
        const expWords = normalizeArabic(expected).split(/\s+/).filter(Boolean);
        const gotWords = normalizeArabic(tx).split(/\s+/).filter(Boolean);
        let matched = 0;
        const used2 = new Set<number>();
        for (const ew of expWords) {
          for (let i = 0; i < gotWords.length; i++) {
            if (used2.has(i)) continue;
            const gw = gotWords[i];
            if (wordsMatch(ew, gw)) {
              matched++; used2.add(i); break;
            }
          }
        }
        const sc = expWords.length > 0 ? Math.round((matched / expWords.length) * 100) : (tx.trim().length > 5 ? 70 : 10);
        setQRecResult({ transcript: tx, score: sc });
        setQRecDone(true);
        // Auto-mark answer: score >= 60 = correct (index 0 = pass sentinel)
        const a = [...answers]; a[qIdx] = sc >= 60 ? 0 : 1; setAnswers(a);
      };
      mr.start(200);
      qMediaRecRef.current = mr;
      setQRecording(true);
      qRecTimerRef.current = setInterval(() => setQRecSecs(s => s+1), 1000);
    } catch { alert("Mic access denied"); }
  };

  const stopQRecording = () => {
    clearInterval(qRecTimerRef.current);
    const mr = qMediaRecRef.current;
    if (mr && mr.state !== "inactive") {
      // FIX BUG 5: Null the ref inside onstop, not before stop(), to avoid race condition
      // where onstop fires after the ref is already null.
      const prevOnStop = mr.onstop;
      mr.onstop = async (e) => {
        qMediaRecRef.current = null;
        if (prevOnStop) prevOnStop.call(mr, e);
      };
      mr.stop();
    } else {
      qMediaRecRef.current = null;
    }
  };

  // ── playListenAudio ────────────────────────────────────────────────────────
  // Listen questions must ALWAYS play the actual Mishary Alafasy Qur'an
  // recitation from the CDN — never a generic Web Speech TTS voice, which
  // mispronounces Arabic and has none of the correct tajweed. If the CDN
  // genuinely fails, we surface a retry state rather than substituting TTS.
  // ──────────────────────────────────────────────────────────────────────────
  const stopListenAudio = () => {
    if (listenAudioRef.current) {
      listenAudioRef.current.pause(); listenAudioRef.current.src = "";
      listenAudioRef.current = null;
    }
    setIsSpeaking(false);
  };

  const playListenAudio = (text: string, surahNum?: number, numberInSurah?: number, globalNum?: number) => {
    stopListenAudio();
    setListenError(false);
    setListenErrorUrl("");
    if (!(surahNum && surahNum > 0 && numberInSurah && numberInSurah > 0)) {
      console.error("[HifdhDaily] listen_choose missing surah/ayah —",
        "surahNum:", surahNum, "numberInSurah:", numberInSurah, "globalNum:", globalNum);
      setListenError(true);
      setListenErrorUrl("missing verse data (surahNum=" + (surahNum??0) + " ayah=" + (numberInSurah??0) + ")");
      return;
    }
    // play() must be called synchronously inside the click-handler user-gesture.
    const primaryUrl = quranAyahAudioUrl(surahNum, numberInSurah, "Alafasy_128kbps");
    const fallbackUrl = globalNum && globalNum > 0
      ? `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${globalNum}.mp3`
      : null;
    console.log("[HifdhDaily] playListenAudio primary:", primaryUrl, "fallback:", fallbackUrl);

    const doPlay = (url: string, isFallback: boolean) => {
      const audio = new Audio(url);
      listenAudioRef.current = audio;
      setIsSpeaking(true);
      audio.onended = () => { setIsSpeaking(false); setListenDone(true); listenAudioRef.current = null; };
      audio.onerror = () => {
        console.error("[HifdhDaily] CDN failed:", url, "code:", audio.error?.code);
        listenAudioRef.current = null;
        if (!isFallback && fallbackUrl) {
          doPlay(fallbackUrl, true);
        } else {
          setIsSpeaking(false);
          setListenError(true);
          setListenErrorUrl(primaryUrl);
        }
      };
      audio.play().catch((e) => {
        console.error("[HifdhDaily] play() rejected:", e?.name, url);
        listenAudioRef.current = null;
        if (!isFallback && fallbackUrl) {
          doPlay(fallbackUrl, true);
        } else {
          setIsSpeaking(false);
          setListenError(true);
          setListenErrorUrl(primaryUrl);
        }
      });
    };
    doPlay(primaryUrl, false);
  };

  const acceptPage = () => {
    const last = lastResultRef.current || { tx: "", ayahCorrectness: [] };
    const r: PageResult={
      pageNum:todayPages[pageIdx], score:score!, errorWords, ayahs:pageAyahs,
      ayahCorrectness: last.ayahCorrectness,
      transcript: last.tx,
    };
    const newResults=[...pageResults,r];
    setPageResults(newResults); setRetryCount(0); setScore(null);
    const next=pageIdx+1;
    if(next<todayPages.length){ setPageIdx(next); setPhase("reading"); }
    else {
      const avgRec = Math.round(newResults.reduce((s,pr)=>s+pr.score,0)/newResults.length);
      setRecitationScore(avgRec);
      // Go to pre-test review so student can listen to their recording
      fetchJuzAyahs().then(()=>{ setPhase("pre_test_review"); });
    }
  };

  const retryPage = () => {
    setRetryMsg(RETRY_MSGS[retryCount%RETRY_MSGS.length]);
    setScore(null); setRetryCount(c=>c+1); setRecSecs(0); setRevealedWordCount(0); setPhase("reading");
  };

  const pickAnswer=(i:number)=>{ const a=[...answers]; a[qIdx]=i; setAnswers(a); };
  const nextQ=()=>{
    // For record questions, ensure at least attempted
    const q = questions[qIdx];
    if ((q?.type==="record_continue"||q?.type==="record_complete") && answers[qIdx]===null) {
      // Auto-mark as attempted with 0 score if not recorded
      const a=[...answers]; a[qIdx]=1; setAnswers(a);
    }
    if(qIdx<questions.length-1) setQIdx(i=>i+1); else gradeTest();
  };

  // ── Per-question countdown timer ─────────────────────────────────────────
  // Resets whenever the active question changes; time budget scales with the
  // question's complexity (see questionTimeLimit). On expiry the question is
  // auto-submitted: in-progress recordings are stopped (their transcript is
  // still scored), unanswered MCQs are left blank (scored as incorrect), and
  // the test advances to the next question automatically.
  const nextQRef = useRef(nextQ);
  useEffect(() => { nextQRef.current = nextQ; });

  useEffect(() => {
    clearInterval(qCountdownRef.current);
    if (phase !== "testing" || testScore !== null || !questions[qIdx]) { setQTimeLeft(0); return; }
    const limit = questionTimeLimit(questions[qIdx]);
    setQTimeLeft(limit);
    qCountdownRef.current = setInterval(() => {
      setQTimeLeft(t => {
        if (t <= 1) {
          clearInterval(qCountdownRef.current);
          // Time's up — stop any in-progress recording, then auto-advance.
          if (qMediaRecRef.current && qMediaRecRef.current.state !== "inactive") {
            try { qMediaRecRef.current.stop(); } catch {}
          }
          setTimeout(() => nextQRef.current(), 50);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(qCountdownRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIdx, phase, questions.length]);

  const gradeTest=()=>{
    const sA = questions.filter(q=>q.section==="A");
    const sB = questions.filter(q=>q.section==="B");
    const calcSc=(qs:Question[])=>{
      if(!qs.length) return null;
      let pts=0; let total=0;
      qs.forEach(q=>{
        const ai=questions.indexOf(q);
        const a=answers[ai];
        const isRec=q.type==="record_continue"||q.type==="record_complete";
        if(isRec){
          // record answer: 0=pass(correct), 1=fail
          pts+=(a===0?1:0); total+=1;
        } else {
          pts+=(a===q.correct?1:0); total+=1;
        }
      });
      return total>0?Math.round((pts/total)*100):null;
    };
    const sa=calcSc(sA); const sb=calcSc(sB);
    setSectionAScore(sa); setSectionBScore(sb);
    // Overall
    let totalPts=0; let totalQ=0;
    questions.forEach((q,i)=>{
      const a=answers[i];
      const isRec=q.type==="record_continue"||q.type==="record_complete";
      totalPts+=(isRec?(a===0?1:0):(a===q.correct?1:0)); totalQ+=1;
    });
    const pct=totalQ>0?Math.round((totalPts/totalQ)*100):100;
    setTestScore(pct); setPhase("test_result");
    if(pct>=TEST_PASS_THRESHOLD) submitSession(pct, sa, sb);
  };
  const retryTest=()=>{
    setAnswers(new Array(questions.length).fill(null)); setQIdx(0); setTestScore(null);
    setPhase("proctor_intro");
  };

  const submitSession=async(tScore:number, sA:number|null=null, sB:number|null=null)=>{
    setSubmitting(true);
    const recAvg = recitationScore ?? (pageResults.length?Math.round(pageResults.reduce((s,r)=>s+r.score,0)/pageResults.length):tScore);
    const overall=Math.round((recAvg+tScore)/2);
    setFinalScore(overall);
    const today=todayISO();
    const dur=Math.round((Date.now()-sessionStart.current)/1000);

    // Audio was already uploaded in mr.onstop via Promise.all — just read the ref.
    const audioStorageUrl: string|null = audioStorageUrlRef.current;

    // Preserve teacher override: if teacher already reviewed before re-completion, don't wipe their score
    const existingTeacherOverride = todayLog?.session_data?.teacher_override;
    const finalAvgScore = existingTeacherOverride ? existingTeacherOverride.score : overall;

    try {
      await (supabase as any).from("hifdh_daily_logs").upsert({
        student_id:userId, assignment_id:assignment?.id,
        log_date:today, pages_revised:todayPages.length,
        avg_score:finalAvgScore, duration_secs:dur, completed:true,
        session_data:{
          recitation_score:recAvg, test_score:tScore,
          section_a_score: sA, section_b_score: sB,
          pages_done:todayPages,
          audio_url: audioStorageUrl,
          page_results:pageResults.map(r=>({
            pageNum:r.pageNum, score:r.score, errorWords:r.errorWords,
            ayahCorrectness: r.ayahCorrectness,
            transcript: r.transcript,
            ayahs: r.ayahs.map(a=>({
              text:a.text, numberInSurah:a.numberInSurah,
              surahName:a.surah?.englishName, surahNum:a.surah?.number,
            })),
          })),
          errors:pageResults.flatMap(r=>r.errorWords.map(w=>({word:w,page:r.pageNum}))).slice(0,20),
          proctoring: {
            tab_switches: tabSwitchCount,
            flagged: tabSwitchCount > 0,
            test_started_at: new Date().toISOString(),
          },
          question_log: questions.map((q,i)=>({
            id: q.id,
            type: q.type,
            section: q.section,
            isErrorFocused: q.isErrorFocused || false,
            answer_given: answers[i] ?? null,
            correct: answers[i] === q.correct,
          })),
          // Preserve teacher override so it isn't wiped on re-completion
          ...(existingTeacherOverride ? { teacher_override: existingTeacherOverride } : {}),
        },
      },{onConflict:"student_id,log_date"});

      // Notify admins and assigned teacher
      const {data:pf}=await supabase.from("profiles").select("full_name,assigned_teacher_id").eq("user_id" as any,userId).maybeSingle();
      const name=(pf as any)?.full_name||"A student";
      const assignedTeacher=(pf as any)?.assigned_teacher_id;
      const modeLabel=assignment.mode==="juz"?"Juz":assignment.mode==="hizb"?"Hizb":"Surah";
      const items=assignment.selected_items.slice(0,3).join(", ");
      const msg=`${modeLabel} ${items} — Recitation: ${recAvg}% · Test: ${tScore}% · Overall: ${overall}% · ${todayPages.length} page${todayPages.length>1?"s":""} done`;
      const notifBase={title:`📖 ${name} completed Daily Hifdh Revision`,message:msg,type:"hifdh_complete",read:false,created_at:new Date().toISOString()};
      const {data:admins}=await supabase.from("profiles").select("user_id").eq("role","admin" as any);
      const recipients=[...(admins||[]).map((a:any)=>a.user_id)];
      if(assignedTeacher && !recipients.includes(assignedTeacher)) recipients.push(assignedTeacher);
      for(const uid of recipients){
        await (supabase as any).from("notifications").insert({...notifBase,user_id:uid});
      }
    } catch(e){ console.error("Submit error",e); }
    setSubmitting(false); setPhase("complete");
  };

  /* ── Shared UI atoms ── */
  const BackBtn=({onClick}:{onClick:()=>void})=>(
    <button onClick={onClick} style={{width:36,height:36,borderRadius:10,border:"none",cursor:"pointer",
      background:"rgba(255,255,255,.12)",color:W,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <ArrowLeft size={18}/>
    </button>
  );
  const ScoreRing=({pct}:{pct:number})=>{
    const pass=pct>=PASS_THRESHOLD;
    const col=pass?PASS:FAIL;
    const R=42; const C=2*Math.PI*R;
    return (
      <svg width={108} height={108} viewBox="0 0 108 108" style={{display:"block",margin:"0 auto 12px"}}>
        <circle cx={54} cy={54} r={R} fill="none" stroke={col+"22"} strokeWidth={10}/>
        <circle cx={54} cy={54} r={R} fill="none" stroke={col} strokeWidth={10}
          strokeDasharray={C} strokeDashoffset={C*(1-pct/100)}
          strokeLinecap="round" transform="rotate(-90 54 54)"
          style={{transition:"stroke-dashoffset .7s ease"}}/>
        <text x={54} y={50} textAnchor="middle" dominantBaseline="middle"
          fill={col} fontSize={22} fontWeight={900}>{pct}%</text>
        <text x={54} y={68} textAnchor="middle" dominantBaseline="middle"
          fill={col} fontSize={9} fontWeight={700}>{pass?"PASSED ✓":"TRY AGAIN"}</text>
      </svg>
    );
  };

  /* ── Wave bars ── */
  const Wave=()=>(
    <div style={{display:"flex",alignItems:"center",gap:3}}>
      {[14,22,32,40,28,36,20,30,16,24,38,18].map((h,i)=>(
        <div key={i} style={{
          width:4,height:h,borderRadius:3,background:PASS,
          animation:`wavePulse ${0.5+i*0.06}s ease-in-out ${i*0.05}s infinite`,
        }}/>
      ))}
    </div>
  );

  /* ── Quran page display — Mushaf-style ── */
  //
  // UNDERLINE RULES:
  //   Before recording  → NO underlines
  //   While recording   → NO underlines (blur/reveal only)
  //   After evaluation  → green=correct, red=missed
  //     (only when phase==="page_result" AND score !== null)
  //
  // BISMILLAH: rendered centred on its own line, separated from body.
  // LAYOUT: direction rtl, textAlign right (not justify), lineHeight 3.2.
  const QuranPage = () => {
    // Word statuses — only after final evaluation
    const evaluationReady = phase === "page_result" && score !== null && lastTranscript.length > 0;

    // ── Build flat token list, each token knows its mushaf line_number ──────
    type WordToken = {
      word: string; globalIdx: number; isLast: boolean;
      numberInSurah: number; isBismWord: boolean; line: number;
    };
    const tokens: WordToken[] = [];

    // Detect Bismillah opening
    const firstAyahNorm = pageAyahs.length > 0 ? normalizeArabic(pageAyahs[0].text) : "";
    const isBism = firstAyahNorm.length > 5 && firstAyahNorm.startsWith(normalizeArabic("بسم الله"));

    // Track global line progression from qurancdn word data
    let globalLine = 1;
    pageAyahs.forEach((a, ai) => {
      const rawWords = a.text.split(/\s+/).filter(Boolean);
      rawWords.forEach((w, wi) => {
        // Use qurancdn line_number when available; fallback to tracked global line
        const apiWord = a.words?.[wi];
        const lineNum = apiWord?.line_number ?? globalLine;
        globalLine = lineNum; // keep tracking for fallback
        tokens.push({
          word: w,
          globalIdx: tokens.length,
          isLast: wi === rawWords.length - 1,
          numberInSurah: a.numberInSurah,
          isBismWord: isBism && ai === 0,
          line: lineNum,
        });
      });
    });

    // ── Word statuses ────────────────────────────────────────────────────────
    // The Quran page only renders when NOT recording (see the render guard
    // below), so the only statuses that ever matter here are the post-
    // evaluation ones: green=correct, red=missing.
    type WordStatus = "correct" | "partial" | "missing" | "pending" | "none";
    const wordStatuses: WordStatus[] = tokens.map(() => "none");
    if (evaluationReady) {
      const ref = pageAyahs.map(a => a.text).join(" ");
      compareWords(ref, lastTranscript).forEach((r, i) => {
        if (i < wordStatuses.length) wordStatuses[i] = r.status === "correct" ? "correct" : "missing";
      });
    }

    // Bismillah lives on its own line — keep separate
    const bismTokens = tokens.filter(t => t.isBismWord);
    const hasBism = bismTokens.length > 0;
    // All non-Bismillah tokens, in reading order — rendered as one flowing
    // justified paragraph (see "Mushaf body" below) instead of per-line blocks.
    const bodyTokens = tokens.filter(t => !t.isBismWord);

    const renderWord = (tok: WordToken) => {
      const st = wordStatuses[tok.globalIdx];
      // Color logic
      let color = "#1a0a00";
      let bg = "transparent";
      let blur = "none";
      let opacity = 1;
      let border = "none";

      if (evaluationReady) {
        if (st === "correct") { color = "#15803d"; bg = "#dcfce733"; border = "2px solid #16a34a"; }
        else if (st === "missing") { color = "#b91c1c"; bg = "#fee2e233"; border = "2px solid #dc2626"; }
      }

      return (
        <span key={tok.globalIdx} style={{
          display: "inline-block",
          color,
          background: bg,
          filter: blur,
          opacity,
          borderBottom: border,
          paddingBottom: border !== "none" ? 2 : 0,
          borderRadius: 3,
          margin: "0 1px",
          transition: "color 0.35s ease, background 0.35s ease, filter 0.4s ease, opacity 0.4s ease",
        }}>{tok.word}</span>
      );
    };

    const renderAyahNum = (tok: WordToken) => {
      return (
        <span key={`n${tok.globalIdx}`} style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 24, height: 24, borderRadius: "50%",
          border: `1.5px solid ${GOLD}`, background: "#fffdf6",
          fontSize: 10, color: GOLD, fontFamily: "'Amiri',serif",
          margin: "0 4px", verticalAlign: "middle", lineHeight: 1,
          filter: "none",
          opacity: 1,
          transition: "filter 0.4s ease, opacity 0.4s ease",
          flexShrink: 0,
        }}>{tok.numberInSurah}</span>
      );
    };

    if (fetchingPage) return (
      <div style={{display:"flex",justifyContent:"center",padding:40}}>
        <Loader2 size={28} color={GOLD} style={{animation:"spin .9s linear infinite"}}/>
      </div>
    );
    if (!pageAyahs.length) return (
      <div style={{padding:24,textAlign:"center",color:"#9CA3AF",fontSize:13}}>
        Could not load page — check internet connection.
      </div>
    );

    // ── Authentic Mushaf border pattern ──────────────────────────────────
    // A physical Mushaf has: thick outer gold border → gap → thin inner border
    // The page number sits centred at the top inside a medallion ornament.
    // Each line of text is fully justified (space-between) to fill the width,
    // matching the Madani Mushaf column layout exactly.
    return (
      <div style={{
        background: "#fdf8ee",
        borderRadius: 4,
        // Layered border: thick outer gold, narrow cream gap, thin inner gold
        border: `3px solid ${GOLD}cc`,
        boxShadow: `0 0 0 6px #fdf8ee, 0 0 0 7px ${GOLD}66, 0 6px 28px rgba(0,0,0,.18)`,
        overflow: "hidden",
        position: "relative",
        fontFamily: "'Amiri Quran','Amiri',serif",
      }}>
        {/* ── Corner rosettes (decorative) ── */}
        {["topLeft","topRight","bottomLeft","bottomRight"].map(corner => (
          <div key={corner} style={{
            position:"absolute",
            top: corner.startsWith("top") ? -1 : undefined,
            bottom: corner.startsWith("bottom") ? -1 : undefined,
            left: corner.endsWith("Left") ? -1 : undefined,
            right: corner.endsWith("Right") ? -1 : undefined,
            width: 18, height: 18,
            background: GOLD,
            clipPath: "polygon(50% 0%,100% 50%,50% 100%,0% 50%)",
            zIndex: 2,
          }}/>
        ))}

        {/* ── Page number medallion (top centre) ── */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"center",
          padding:"8px 0 4px",
          background: `linear-gradient(to bottom,${GOLD}28,${GOLD}08)`,
          borderBottom: `1px solid ${GOLD}55`,
          gap: 10,
        }}>
          <span style={{color:`${GOLD}99`,fontSize:14}}>❧</span>
          <span style={{fontFamily:"'Amiri',serif",fontSize:12,fontWeight:700,color:GOLD,letterSpacing:2}}>
            {todayPages[pageIdx]}
          </span>
          <span style={{color:`${GOLD}99`,fontSize:14}}>❧</span>
        </div>

        {/* ── Surah name banner (when page starts a new surah) ── */}
        {pageAyahs[0]?.surah?.englishName && (
          <div style={{
            textAlign:"center",
            padding:"3px 10px",
            fontSize:10,
            fontWeight:700,
            color:`${GOLD}bb`,
            letterSpacing:1,
            fontFamily:"'Cairo',sans-serif",
            background: `linear-gradient(to right,transparent,${GOLD}10,transparent)`,
          }}>
            {pageAyahs[0].surah.englishName.toUpperCase()}
            {pageAyahs[pageAyahs.length-1]?.surah?.number !== pageAyahs[0]?.surah?.number &&
              ` — ${pageAyahs[pageAyahs.length-1].surah.englishName.toUpperCase()}`}
          </div>
        )}

        {/* ── Legend row (shown only after evaluation — QuranPage doesn't
              render while recording, so there's no "live" state to show) ── */}
        {evaluationReady && (
          <div style={{
            padding:"3px 14px",
            background:"#faf6ea",
            borderBottom:`1px solid ${GOLD}22`,
            display:"flex", alignItems:"center", justifyContent:"center", gap:16,
          }}>
            {evaluationReady && (
              <>
                <span style={{fontSize:9,color:"#15803d",fontWeight:800,display:"flex",alignItems:"center",gap:3}}>
                  <span style={{width:14,height:2.5,background:"#16a34a",borderRadius:1,display:"inline-block"}}/>
                  Correct
                </span>
                <span style={{fontSize:9,color:"#dc2626",fontWeight:800,display:"flex",alignItems:"center",gap:3}}>
                  <span style={{width:14,height:2.5,background:"#dc2626",borderRadius:1,display:"inline-block"}}/>
                  Missed
                </span>
              </>
            )}
          </div>
        )}

        {/* ── Inner gold rule ── */}
        <div style={{height:1,background:`linear-gradient(to right,transparent,${GOLD}88,transparent)`,margin:"0 14px"}}/>

        {/* ── Quran text body ── */}
        <div style={{padding:"14px 16px 10px"}}>

          {/* Bismillah — centred, visually distinct */}
          {hasBism && (
            <div style={{
              direction:"rtl",
              textAlign:"center",
              fontSize: 26,
              lineHeight: 3.0,
              marginBottom: 10,
              paddingBottom: 10,
              borderBottom: `1px solid ${GOLD}44`,
              letterSpacing: 1,
            }}>
              {bismTokens.map(tok => (
                <span key={tok.globalIdx} style={{display:"inline-block", margin:"0 1px"}}>
                  {renderWord(tok)}
                  {tok.isLast && renderAyahNum(tok)}
                </span>
              ))}
            </div>
          )}

          {/* ── Mushaf body: one flowing, justified paragraph (wraps naturally —
               same layout as the entrance exam recitation screen) ──────────────
               Previously this rendered one fixed-width flex row per mushaf line
               with `flexWrap:"nowrap"`, which forced lines wider than the
               viewport to overflow horizontally and get cut off on narrow
               phone screens. A single justified block avoids that entirely. */}
          <div style={{
            direction: "rtl",
            textAlign: "justify",
            lineHeight: 3.2,
            fontSize: 23,
            letterSpacing: 0.5,
            wordBreak: "normal",
            overflowWrap: "normal",
          }}>
            {bodyTokens.map(tok => (
              <React.Fragment key={tok.globalIdx}>
                <span style={{display: "inline-block"}}>
                  {renderWord(tok)}
                  {tok.isLast && renderAyahNum(tok)}
                </span>
                {" "}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ── Inner gold rule (bottom) ── */}
        <div style={{height:1,background:`linear-gradient(to right,transparent,${GOLD}88,transparent)`,margin:"0 14px"}}/>

        {/* ── Page footer ornament ── */}
        <div style={{
          padding:"5px 0",
          textAlign:"center",
          color:`${GOLD}99`,
          fontSize:12,
          letterSpacing:6,
        }}>
          ❦
        </div>
      </div>
    );
  };


  /* ════ RENDER PHASES ════ */
  return (
    <div style={{position:"fixed",inset:0,zIndex:200,background:WARM,display:"flex",flexDirection:"column",
      fontFamily:"'Cairo',sans-serif",overscrollBehavior:"none"}}>
      <style>{`
        @keyframes spin  { to{transform:rotate(360deg)} }
        @keyframes wavePulse { 0%,100%{transform:scaleY(.4)} 50%{transform:scaleY(1)} }
        @keyframes micPulse { 0%{transform:scale(.85);opacity:.9} 100%{transform:scale(1.6);opacity:0} }
        @keyframes slideUp { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&family=Cairo:wght@400;600;700;800;900&display=swap');
        .ar-word { unicode-bidi: isolate; display: inline; }
      `}</style>

      {/* ── Focus Warning ── */}
      {focusWarning&&(
        <div style={{position:"fixed",top:0,left:0,right:0,zIndex:9999,background:FAIL,padding:"10px 16px",textAlign:"center"}}>
          <p style={{margin:0,fontWeight:900,fontSize:13,color:W}}>⚠️ Tab switch detected! ({tabSwitchCount}×) — Stay focused on the test</p>
        </div>
      )}

      {/* ── Return Banner: student navigated away and came back ── */}
      {returnBanner&&(
        <div style={{position:"fixed",inset:0,zIndex:9998,background:"rgba(0,0,0,.72)",
          display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:W,borderRadius:24,padding:"28px 24px",maxWidth:340,width:"100%",
            boxShadow:"0 24px 60px rgba(0,0,0,.4)",textAlign:"center"}}>
            {returnBanner==="recitation"?(
              <>
                <div style={{width:64,height:64,borderRadius:"50%",background:`${GOLD}18`,
                  border:`3px solid ${GOLD}`,display:"flex",alignItems:"center",justifyContent:"center",
                  margin:"0 auto 16px"}}>
                  <Mic size={28} color={GOLD}/>
                </div>
                <p style={{margin:"0 0 6px",fontWeight:900,fontSize:18,color:G1}}>Welcome Back!</p>
                <p style={{margin:"0 0 18px",fontSize:13,color:"#6B7280",lineHeight:1.6}}>
                  Your recitation session is still active.<br/>
                  You can <strong>continue recording</strong> from where you were, or <strong>start fresh</strong> for this page.
                </p>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <button onClick={()=>{setReturnBanner(null); startRecording();}}
                    style={{padding:"14px",borderRadius:12,border:"none",cursor:"pointer",
                      background:`linear-gradient(135deg,${G2},${G3})`,color:W,
                      fontWeight:900,fontSize:14,fontFamily:"inherit",
                      display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                    <Mic size={16}/> Continue Recording
                  </button>
                  <button onClick={()=>{
                    audioChunks.current=[]; audioBlobRef.current=null;
                    setScore(null); setRetryCount(0); setRecSecs(0); setCarryOverSecs(0);
                    idbDeleteBlob(`${userId}_${todayISO()}_partial`);
                    setReturnBanner(null); startRecording();
                  }} style={{padding:"13px",borderRadius:12,border:`1.5px solid ${GOLD}`,
                    cursor:"pointer",background:"transparent",color:GOLD,
                    fontWeight:800,fontSize:14,fontFamily:"inherit",
                    display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                    <RefreshCcw size={15}/> Start This Page Again
                  </button>
                </div>
              </>
            ):(
              <>
                <div style={{width:64,height:64,borderRadius:"50%",background:`${FAIL}12`,
                  border:`3px solid ${FAIL}`,display:"flex",alignItems:"center",justifyContent:"center",
                  margin:"0 auto 16px"}}>
                  <ShieldCheck size={28} color={FAIL}/>
                </div>
                <p style={{margin:"0 0 6px",fontWeight:900,fontSize:18,color:G1}}>Test Interrupted</p>
                <p style={{margin:"0 0 18px",fontSize:13,color:"#6B7280",lineHeight:1.6}}>
                  You left the test screen. For fairness, the test must <strong>start from scratch</strong>.
                  Your recitation progress is saved.
                </p>
                <button onClick={()=>{
                  setReturnBanner(null);
                  setAnswers(new Array(questions.length).fill(null));
                  setQIdx(0); setTestScore(null);
                  setPhase("proctor_intro");
                }} style={{width:"100%",padding:"14px",borderRadius:12,border:"none",cursor:"pointer",
                  background:`linear-gradient(135deg,${FAIL},#b91c1c)`,color:W,
                  fontWeight:900,fontSize:14,fontFamily:"inherit",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                  <RefreshCcw size={15}/> Restart Test
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ INTRO ══ */}
      {phase==="intro"&&(
        <>
          <div style={{background:`linear-gradient(160deg,${G1},${G2})`,padding:"14px 16px",
            display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
            <BackBtn onClick={()=>onClose(false)}/>
            <div style={{flex:1}}>
              <p style={{margin:0,fontWeight:900,fontSize:15,color:W}}>Daily Hifdh Session</p>
              <p style={{margin:0,fontSize:10,color:`${GOLD}cc`}}>
                {assignment.mode==="juz"?"Juz":assignment.mode==="hizb"?"Hizb":"Surah"}{" "}
                {assignment.selected_items.slice(0,3).join(", ")} · {assignment.daily_pages} page{assignment.daily_pages>1?"s":""}/day
              </p>
            </div>
            <div style={{fontFamily:"'Amiri',serif",color:GOLD,fontSize:"1.4em"}}>﷽</div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"16px 16px 28px",display:"flex",flexDirection:"column",gap:14}}>

            {/* Today's pages card */}
            <div style={{borderRadius:20,overflow:"hidden",background:`linear-gradient(135deg,${G1},${G2})`,
              border:`1px solid ${GOLD}33`,boxShadow:"0 8px 32px rgba(0,0,0,.2)"}}>
              <div style={{padding:"18px 18px 14px",textAlign:"center"}}>
                <div style={{fontFamily:"'Amiri',serif",color:GOLD,fontSize:"1.5em",marginBottom:6}}>
                  بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                </div>
                <p style={{margin:0,fontSize:11,color:"rgba(255,255,255,.5)",fontWeight:600}}>TODAY'S REVISION</p>
                <div style={{margin:"12px 0",padding:"14px",background:"rgba(255,255,255,.06)",borderRadius:14,
                  border:`1px solid ${GOLD}22`}}>
                  <p style={{margin:0,fontWeight:900,fontSize:26,color:W,letterSpacing:-.5}}>
                    Page{todayPages.length>1?"s":""}{" "}
                    {todayPages[0]}{todayPages.length>1?` – ${todayPages[todayPages.length-1]}`:""}
                  </p>
                  <p style={{margin:"4px 0 0",fontSize:11,color:`${GOLD}aa`}}>
                    of the Holy Qur'an
                  </p>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {[
                    {label:"Mode",    value:assignment.mode==="juz"?"Juz":assignment.mode==="hizb"?"Hizb":"Surah"},
                    {label:"Section", value:assignment.selected_items.slice(0,3).join(", ")+(assignment.selected_items.length>3?"…":"")},
                  ].map(s=>(
                    <div key={s.label} style={{padding:"8px",background:"rgba(255,255,255,.06)",borderRadius:10,
                      border:`1px solid rgba(255,255,255,.08)`}}>
                      <p style={{margin:0,fontSize:9,fontWeight:700,color:"rgba(255,255,255,.4)",
                        textTransform:"uppercase",letterSpacing:.5}}>{s.label}</p>
                      <p style={{margin:"2px 0 0",fontWeight:800,fontSize:13,color:W}}>{s.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* How it works */}
            <div style={{background:W,borderRadius:16,border:`1px solid ${BRD}`,padding:"14px 16px"}}>
              <p style={{margin:"0 0 12px",fontSize:10,fontWeight:800,color:G3,textTransform:"uppercase",letterSpacing:.6}}>
                Session Flow
              </p>
              {[
                {emoji:"📖",title:"Read the page",sub:"Study the Qur'an text shown on screen"},
                {emoji:"🎙️",title:"Recite aloud",sub:`AI listens — score ≥${PASS_THRESHOLD}% to continue; retry if below`},
                {emoji:"🎯",title:"Answer questions",sub:"MCQ from today's pages — ≥75% to pass"},
                {emoji:"✅",title:"Submit & done",sub:"Your teacher is notified automatically"},
              ].map((s,i)=>(
                <div key={i} style={{display:"flex",gap:12,padding:"9px 0",
                  borderBottom:i<3?"1px solid #F3F4F6":"none"}}>
                  <div style={{width:36,height:36,borderRadius:10,background:`${G1}0d`,
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>
                    {s.emoji}
                  </div>
                  <div style={{paddingTop:2}}>
                    <p style={{margin:0,fontWeight:700,fontSize:13,color:G1}}>{s.title}</p>
                    <p style={{margin:0,fontSize:11,color:"#9CA3AF"}}>{s.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {assignment.notes&&(
              <div style={{padding:"12px 14px",borderRadius:12,background:`${GOLD}10`,
                border:`1px solid ${GOLD}33`}}>
                <p style={{margin:"0 0 4px",fontSize:10,fontWeight:800,color:"#92400E",
                  textTransform:"uppercase",letterSpacing:.5}}>📝 Teacher's Note</p>
                <p style={{margin:0,fontSize:12,color:"#78350F",lineHeight:1.6}}>{assignment.notes}</p>
              </div>
            )}

            <button onClick={()=>setPhase("reading")}
              style={{padding:"15px",borderRadius:14,border:"none",cursor:"pointer",fontFamily:"inherit",
                background:`linear-gradient(135deg,${G2},${G3})`,color:W,fontWeight:900,fontSize:15,
                boxShadow:`0 4px 16px ${G1}66`,letterSpacing:.3}}>
              Begin Session →
            </button>
          </div>
        </>
      )}

      {/* ══ READING ══ */}
      {phase==="reading"&&(
        <>
          <div style={{background:`linear-gradient(160deg,${G1},${G2})`,padding:"14px 16px",
            display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
            <BackBtn onClick={()=>{if(mediaRecRef.current&&mediaRecRef.current.state!=="inactive"){mediaRecRef.current.stop();mediaRecRef.current=null;}setIsRecording(false);clearInterval(timerRef.current);setPhase("intro");}}/>
            <div style={{flex:1}}>
              <p style={{margin:0,fontWeight:800,fontSize:14,color:W}}>
                Page {todayPages[pageIdx]} — Recite Aloud
              </p>
              <p style={{margin:0,fontSize:10,color:`${GOLD}cc`}}>
                Page {pageIdx+1} of {todayPages.length}{retryCount>0?` · Attempt ${retryCount+1}`:""}
              </p>
            </div>
            {/* Page dots */}
            <div style={{display:"flex",gap:4}}>
              {todayPages.map((_,i)=>(
                <div key={i} style={{width:8,height:8,borderRadius:"50%",
                  background:i<pageIdx?PASS:i===pageIdx?GOLD:"rgba(255,255,255,.25)"}}/>
              ))}
            </div>
          </div>

          <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",
            padding:"10px 14px 90px"}}>

            {retryMsg&&retryCount>0&&(
              <div style={{marginBottom:10,padding:"10px 12px",borderRadius:12,background:`${GOLD}12`,
                border:`1.5px solid ${GOLD}44`,animation:"slideUp .3s ease"}}>
                <div style={{display:"flex",gap:8,alignItems:"flex-start"}}>
                  <Heart size={16} color={GOLD} style={{flexShrink:0,marginTop:1}}/>
                  <p style={{margin:0,fontSize:12,fontWeight:600,color:"#92400E",lineHeight:1.6}}>{retryMsg}</p>
                </div>
              </div>
            )}

            {/* Recording indicator — shown ALONE while recording. The Quran page
                is intentionally hidden during recitation: the student should be
                reciting from memory, not reading along with a blurred page, and
                the previous blurred-word layout was confusing/distracting. */}
            {isRecording && (
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                gap:22,padding:"48px 20px",minHeight:"50vh"}}>
                <div style={{position:"relative",width:128,height:128,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <div style={{position:"absolute",inset:0,borderRadius:"50%",
                    background:`${PASS}22`,animation:"micPulse 1.6s ease-out infinite"}}/>
                  <div style={{position:"absolute",inset:14,borderRadius:"50%",
                    background:`${PASS}33`,animation:"micPulse 1.6s ease-out infinite .3s"}}/>
                  <div style={{width:84,height:84,borderRadius:"50%",
                    background:`linear-gradient(135deg,${G2},${G3})`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    boxShadow:`0 6px 24px ${G1}66`}}>
                    <Mic size={36} color={GOLD}/>
                  </div>
                </div>
                <Wave/>
                <p style={{margin:0,fontWeight:800,fontSize:15,color:G1}}>Listening…</p>
                <span style={{padding:"5px 16px",borderRadius:20,
                  background:`${PASS}18`,border:`1px solid ${PASS}50`,
                  fontSize:14,fontWeight:900,color:PASS,fontVariantNumeric:"tabular-nums"}}>
                  🔴 {Math.floor(recSecs/60).toString().padStart(2,"0")}:{(recSecs%60).toString().padStart(2,"0")}
                </span>
                <p style={{margin:0,fontSize:11,color:"#9CA3AF",textAlign:"center",maxWidth:260,lineHeight:1.6}}>
                  Recite Page {todayPages[pageIdx]} from memory. Tap below when finished to get your score.
                </p>
              </div>
            )}
            {/* Quran page — visible only BEFORE recording starts, for preview */}
            {!isRecording && !retryCount && (
              <div style={{marginBottom:10,padding:"8px 12px",borderRadius:10,
                background:"#FFFBEB",border:"1px solid #FDE68A",
                display:"flex",alignItems:"center",gap:8}}>
                <Target size={13} color={AMBER}/>
                <span style={{fontSize:11,fontWeight:700,color:AMBER}}>
                  Recite the full page clearly — need ≥{PASS_THRESHOLD}% to proceed
                </span>
              </div>
            )}
            {!isRecording && <QuranPage/>}
          </div>

          {/* Sticky bottom */}
          <div style={{padding:"12px 16px",background:W,borderTop:`1px solid ${BRD}`,flexShrink:0}}>
            {!isRecording
              ?(
                <button onClick={startRecording}
                  style={{width:"100%",padding:"15px",borderRadius:14,border:"none",cursor:"pointer",
                    background:`linear-gradient(135deg,${G2},${G3})`,color:W,fontWeight:900,fontSize:14,
                    display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"inherit"}}>
                  <Mic size={17}/> Start Reciting
                </button>
              ):(
                <button onClick={handleStop}
                  style={{width:"100%",padding:"15px",borderRadius:14,border:"none",cursor:"pointer",
                    background:FAIL,color:W,fontWeight:900,fontSize:14,
                    display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"inherit"}}>
                  <MicOff size={17}/> Finished — Evaluate My Recitation
                </button>
              )
            }
          </div>
        </>
      )}

      {/* ══ PAGE RESULT — transcribing loader ══ */}
      {phase==="page_result"&&score===null&&(
        <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
          justifyContent:"center",gap:16,background:G0,padding:32}}>
          <Loader2 size={40} color={GOLD} style={{animation:"spin .9s linear infinite"}}/>
          <p style={{margin:0,color:"#e5c76b",fontWeight:700,fontSize:15,textAlign:"center"}}>
            Analysing your recitation…
          </p>
          <p style={{margin:0,color:"#6B7280",fontSize:12,textAlign:"center"}}>
            Using AI to check your Arabic — this takes a few seconds
          </p>
        </div>
      )}

      {/* ══ PAGE RESULT ══ */}
      {phase==="page_result"&&score!==null&&(()=>{
        /* ── Build word results exactly as مراجعة does ── */
        const ref       = pageAyahs.map((a:any)=>a.text).join(" ");
        const wordRes   = compareWords(ref, lastTranscript);
        const correct   = wordRes.filter(w=>w.status==="correct").length;
        const missing   = wordRes.filter(w=>w.status==="missing").length;

        /* scoreColor buckets matching مراجعة */
        const sc = score>=85
          ? {bg:"#f0fdf4",border:"#16a34a",text:"#15803d"}
          : score>=70
          ? {bg:"#fefce8",border:"#ca8a04",text:"#854d0e"}
          : score>=50
          ? {bg:"#fff7ed",border:"#ea580c",text:"#9a3412"}
          : {bg:"#fef2f2",border:"#dc2626",text:"#991b1b"};

        const label = score>=85 ? "ممتاز — Excellent! 🌟"
          : score>=70 ? "جيد جداً — Very Good ✓"
          : score>=50 ? "جيد — Good, keep going 💪"
          : "يحتاج مراجعة — Needs more revision 🔄";

        return (
          <>
            {/* Header */}
            <div style={{background:`linear-gradient(160deg,${G1},${G2})`,padding:"14px 16px",
              display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
              <BackBtn onClick={()=>setPhase("reading")}/>
              <div style={{flex:1}}>
                <p style={{margin:0,fontWeight:800,fontSize:14,color:W}}>
                  Page {todayPages[pageIdx]} — Result
                </p>
                <p style={{margin:0,fontSize:10,color:`${GOLD}cc`}}>
                  {score>=PASS_THRESHOLD?"Passed ✓":"Below pass mark — review & record again"}
                </p>
              </div>
              <div style={{padding:"6px 14px",borderRadius:20,fontWeight:900,fontSize:15,
                background:score>=PASS_THRESHOLD?PASS:FAIL,color:W,
                boxShadow:`0 2px 10px ${score>=PASS_THRESHOLD?PASS:FAIL}55`}}>
                {score}%
              </div>
            </div>

            {/* Scrollable body — exact مراجعة card sequence */}
            <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",
              padding:"14px 14px 100px",display:"flex",flexDirection:"column",gap:12,
              background:"#f9f9f9",animation:"fadeIn .3s ease"}}>

              {/* 1 ── Score card (identical to مراجعة) */}
              <div style={{borderRadius:18,padding:"20px 16px",textAlign:"center",
                background:sc.bg,border:`2px solid ${sc.border}`}}>
                <div style={{fontSize:52,fontWeight:900,color:sc.text,lineHeight:1}}>{score}%</div>
                <div style={{fontSize:13,fontWeight:700,color:sc.text,marginTop:6}}>{label}</div>
                <div style={{display:"flex",justifyContent:"center",gap:20,marginTop:10,
                  fontSize:12,color:sc.text+"aa"}}>
                  <span>✅ {correct} correct</span>
                  <span>❌ {missing} missing</span>
                </div>
              </div>

              {/* 2 ── Full audio playback — student can review before test */}
              {(savedAudioUrl||audioUrl)&&(
                <div style={{marginBottom:4}}>
                  <p style={{margin:"0 0 6px",fontSize:10,fontWeight:800,color:G3,textTransform:"uppercase",letterSpacing:.5}}>🎙️ Your Recitation — Listen & Review</p>
                  <FullAudioPlayer url={savedAudioUrl||audioUrl||""} label={`Page ${todayPages[pageIdx]} Recitation`}/>
                </div>
              )}

              {/* 3 ── Word-by-Word Analysis (exact مراجعة layout) */}
              {wordRes.length>0&&(
                <div style={{borderRadius:14,padding:"14px",
                  background:"#ffffff08",border:`1px solid ${GOLD}22`,backgroundColor:"#fff"}}>
                  <p style={{margin:"0 0 10px",fontSize:12,fontWeight:800,color:GOLD}}>
                    Word-by-Word Analysis
                  </p>
                  {/* Parchment word-pill container — direction rtl, exact مراجعة */}
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,padding:"12px",
                    borderRadius:12,background:"#fffdf6",direction:"rtl"}}>
                    {wordRes.map((w,i)=>(
                      <span key={i} style={{
                        padding:"4px 10px",borderRadius:6,
                        fontFamily:"'Amiri Quran','Amiri',serif",
                        fontSize:17,fontWeight:600,
                        background: w.status==="correct" ? "#dcfce7" : "#fee2e2",
                        color:      w.status==="correct" ? "#166534" : "#dc2626",
                      }}>
                        {w.word}
                      </span>
                    ))}
                  </div>
                  {/* Legend */}
                  <div style={{display:"flex",gap:14,marginTop:8,fontSize:11,color:"#6B7280"}}>
                    <span style={{display:"flex",alignItems:"center",gap:5}}>
                      <span style={{width:9,height:9,borderRadius:"50%",display:"inline-block",
                        background:"#16a34a"}}/>Correct
                    </span>
                    <span style={{display:"flex",alignItems:"center",gap:5}}>
                      <span style={{width:9,height:9,borderRadius:"50%",display:"inline-block",
                        background:"#dc2626"}}/>Missing
                    </span>
                  </div>
                </div>
              )}

              {/* 4 ── Your Recitation transcript (exact مراجعة) —
                   rendered from the matched MUSHAF words (origRef, full tashkeel),
                   not the raw STT output, so the script matches the Qur'an exactly.
                   Missing words are simply omitted here (they're already shown
                   in red above); only what you actually said is shown, in Quran script. */}
              {lastTranscript&&(
                <div style={{borderRadius:14,padding:"14px",
                  background:"#ffffff",border:`1px solid ${GOLD}22`}}>
                  <p style={{margin:"0 0 8px",fontSize:12,fontWeight:800,color:GOLD}}>
                    Your Recitation (matched words)
                  </p>
                  <p style={{margin:0,fontSize:14,lineHeight:2.1,direction:"rtl",
                    fontFamily:"'Amiri Quran','Amiri',serif",color:"#1a1a1a",wordBreak:"break-word"}}>
                    {wordRes.filter(w=>w.status==="correct").map(w=>w.word).join(" ")}
                  </p>
                </div>
              )}

              {/* 5 ── Transcription unavailable — student-friendly message only.
                     Technical detail (which API/key) is for admins/teachers, not
                     students — it's saved as transcription_failed in session_data
                     and surfaced on the admin/teacher review pages instead. */}
              {noApiWarning && (
                <div style={{padding:"12px 14px",borderRadius:12,
                  background:"#FFF7ED",border:"1.5px solid #FED7AA",
                  display:"flex",gap:10,alignItems:"flex-start"}}>
                  <span style={{fontSize:18,flexShrink:0}}>⚠️</span>
                  <div>
                    <p style={{margin:"0 0 4px",fontSize:12,fontWeight:800,color:AMBER}}>
                      Couldn't Score This Recitation
                    </p>
                    <p style={{margin:0,fontSize:11,color:"#78350F",lineHeight:1.6}}>
                      Your audio was recorded and saved safely, but we weren't able to score it right now.
                      Please try recording again in a moment.
                    </p>
                  </div>
                </div>
              )}

              {/* 6 ── Encouragement / retry hint when below threshold */}
              {score<PASS_THRESHOLD&&(
                <div style={{padding:"12px 14px",borderRadius:12,
                  background:`${GOLD}0e`,border:`1.5px solid ${GOLD}44`,
                  display:"flex",gap:10,alignItems:"center"}}>
                  <Heart size={18} color={GOLD} style={{flexShrink:0}}/>
                  <p style={{margin:0,fontSize:12,color:"#92400E",fontWeight:600,lineHeight:1.6}}>
                    Study the <span style={{color:FAIL,fontWeight:800}}>red words</span> above,
                    then record again — every attempt builds your hifdh! 🌟
                  </p>
                </div>
              )}
            </div>

            {/* Sticky bottom button */}
            <div style={{padding:"12px 16px",background:W,borderTop:`1px solid ${BRD}`,flexShrink:0}}>
              {score>=PASS_THRESHOLD?(
                <button onClick={acceptPage}
                  style={{width:"100%",padding:"15px",borderRadius:14,border:"none",cursor:"pointer",
                    background:`linear-gradient(135deg,${PASS},#15803d)`,color:W,
                    fontWeight:900,fontSize:15,fontFamily:"inherit",
                    display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                    boxShadow:`0 4px 16px ${PASS}44`}}>
                  <CheckCircle2 size={18}/>
                  {pageIdx+1<todayPages.length?"Continue to Next Page →":"Proceed to Test →"}
                </button>
              ):(
                <button onClick={retryPage}
                  style={{width:"100%",padding:"15px",borderRadius:14,border:"none",cursor:"pointer",
                    background:`linear-gradient(135deg,${FAIL},#b91c1c)`,color:W,
                    fontWeight:900,fontSize:15,fontFamily:"inherit",
                    display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                    boxShadow:`0 4px 16px ${FAIL}44`}}>
                  <Mic size={18}/>
                  Record Again — Need {PASS_THRESHOLD}% to pass
                </button>
              )}
            </div>
          </>
        );
      })()}


      {/* ══ PRE-TEST REVIEW ══ */}
      {phase==="pre_test_review"&&(
        <>
          <div style={{background:`linear-gradient(160deg,${G1},${G2})`,padding:"14px 16px",
            display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
            <div style={{width:36,height:36,borderRadius:10,background:`${GOLD}22`,
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              <Eye size={18} color={GOLD}/>
            </div>
            <div style={{flex:1}}>
              <p style={{margin:0,fontWeight:800,fontSize:14,color:W}}>Pre-Test Review</p>
              <p style={{margin:0,fontSize:10,color:`${GOLD}cc`}}>Listen to your recitation first</p>
            </div>
          </div>
          <PreTestReview
            audioUrl={savedAudioUrl}
            pageResults={pageResults}
            onContinue={()=>setPhase("proctor_intro")}
          />
        </>
      )}

      {/* ══ PROCTOR INTRO ══ */}
      {phase==="proctor_intro"&&(
        <>
          <div style={{background:`linear-gradient(160deg,${G1},${G2})`,padding:"14px 16px",
            display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
            <div style={{width:36,height:36,borderRadius:10,background:"#7c3aed22",
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              <ShieldCheck size={18} color="#7c3aed"/>
            </div>
            <div style={{flex:1}}>
              <p style={{margin:0,fontWeight:800,fontSize:14,color:W}}>Test Proctoring</p>
              <p style={{margin:0,fontSize:10,color:`${GOLD}cc`}}>Read carefully before beginning</p>
            </div>
          </div>
          <ProctoringIntro
            countA={questions.length>0?questions.filter(q=>q.section==="A").length:buildQuestions(pageResults,juzAyahs).filter(q=>q.section==="A").length}
            countB={questions.length>0?questions.filter(q=>q.section==="B").length:buildQuestions(pageResults,juzAyahs).filter(q=>q.section==="B").length}
            onReady={()=>{
              if(questions.length===0){
                const qs=buildQuestions(pageResults,juzAyahs);
                setQuestions(qs);
                setAnswers(new Array(qs.length).fill(null));
                setQIdx(0); setTestScore(null);
              }
              setPhase("testing");
            }}
          />
        </>
      )}

      {/* ══ TESTING ══ */}
      {phase==="testing"&&testScore===null&&(
        questions.length>0?(
          <>
            {hifdhProctoringEnabled&&(
              <ProctoringOverlay
                cameraReady={procState.cameraReady}
                faceDetected={procState.faceDetected}
                integrityScore={procState.integrityScore}
                suspicionLevel={procState.suspicionLevel}
                strikes={procState.strikes}
                maxStrikes={procState.maxStrikes}
                violations={procState.violations}
                lastWarningType={procState.lastWarningType}
                audioMonitoring={procState.audioMonitoring}
                recentViolations={procState.recentViolations}
                getStream={procState.getStream}
                attemptId={proctoringConfig.attemptId}
                onPointDeduction={()=>{}}
              />
            )}
            <div style={{background:`linear-gradient(160deg,${G1},${G2})`,padding:"14px 16px",
              display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
              <div style={{width:36,height:36,borderRadius:10,background:`${GOLD}22`,
                display:"flex",alignItems:"center",justifyContent:"center"}}>
                <Target size={18} color={GOLD}/>
              </div>
              <div style={{flex:1}}>
                <p style={{margin:0,fontWeight:800,fontSize:14,color:W}}>
                  {questions[qIdx]?.section==="A"?"Section A":"Section B"} — Q{qIdx+1}/{questions.length}
                </p>
                <p style={{margin:0,fontSize:10,color:`${GOLD}cc`}}>
                  {questions[qIdx]?.section==="A"?"Today's pages (error-focused)":"Juz review from start"}
                </p>
              </div>
              <div style={{padding:"3px 10px",borderRadius:8,fontSize:10,fontWeight:900,
                background:questions[qIdx]?.section==="A"?`${GOLD}22`:"#7c3aed22",
                color:questions[qIdx]?.section==="A"?GOLD:"#7c3aed",
                border:`1px solid ${questions[qIdx]?.section==="A"?GOLD:"#7c3aed"}44`}}>
                §{questions[qIdx]?.section}
              </div>
              {qTimeLeft>0&&(
                <div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 9px",borderRadius:8,
                  background:qTimeLeft<=10?"#dc262633":`${GOLD}1a`,
                  border:`1px solid ${qTimeLeft<=10?"#dc262666":`${GOLD}44`}`}}>
                  <TimerIcon size={11} color={qTimeLeft<=10?"#dc2626":GOLD}/>
                  <span style={{fontSize:11,fontWeight:900,fontVariantNumeric:"tabular-nums",
                    color:qTimeLeft<=10?"#dc2626":GOLD}}>
                    0:{qTimeLeft.toString().padStart(2,"0")}
                  </span>
                </div>
              )}
            </div>

            <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"16px 16px 28px",
              display:"flex",flexDirection:"column",gap:14,overscrollBehavior:"contain"}}>
              {/* Error-focus badge */}
              {questions[qIdx]?.isErrorFocused&&(
                <div style={{padding:"8px 12px",borderRadius:10,background:"#FEF2F210",border:"1px solid #FECACA",display:"flex",alignItems:"center",gap:6}}>
                  <AlertCircle size={13} color={FAIL}/>
                  <p style={{margin:0,fontSize:11,fontWeight:700,color:FAIL}}>This question targets an area where you made errors during recitation</p>
                </div>
              )}
              {/* Section divider */}
              {qIdx>0&&questions[qIdx]?.section!==questions[qIdx-1]?.section&&(
                <div style={{padding:"10px 12px",borderRadius:10,background:"#7c3aed18",border:"1px solid #7c3aed33",display:"flex",alignItems:"center",gap:8}}>
                  <BookMarked size={14} color="#7c3aed"/>
                  <p style={{margin:0,fontSize:12,fontWeight:800,color:"#7c3aed"}}>Section B: Juz Review — Questions from the beginning of your programme</p>
                </div>
              )}
              {/* Progress bar */}
              <div style={{height:4,borderRadius:4,background:"#E5E7EB",overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:4,
                  background:`linear-gradient(to right,${GOLD},${G3})`,
                  width:`${((qIdx+1)/questions.length)*100}%`,transition:"width .3s"}}/>
              </div>
              {/* Dot row */}
              <div style={{display:"flex",gap:6,justifyContent:"center"}}>
                {questions.map((_,i)=>(
                  <div key={i} style={{width:9,height:9,borderRadius:"50%",
                    background:i<qIdx?PASS:i===qIdx?GOLD:BRD,transition:"background .2s"}}/>
                ))}
              </div>

              {(()=>{
                const q=questions[qIdx]; const ans=answers[qIdx];
                const isRecQ = q.type==="record_continue"||q.type==="record_complete";
                const isListenQ = q.type==="listen_choose";

                // ── Type label ───────────────────────────────────
                const typeLabel =
                  q.type==="mcq_next"       ?"🔤 What comes after this?"
                  :q.type==="mcq_blank"     ?"✏️ Fill in the missing word"
                  :q.type==="mcq_continuation"?"⚠️ Continue from error area"
                  :q.type==="record_continue"?"🎙️ Continue from where the reciter stopped"
                  :q.type==="record_complete"?"🎙️ Record the missing verses"
                  :q.type==="listen_choose" ?"👂 Listen — what comes after the reciter stops?"
                  :"What comes next?";

                return(
                  <div style={{background:W,borderRadius:16,border:`1px solid ${BRD}`,
                    boxShadow:"0 2px 12px rgba(0,0,0,.07)"}}>
                    {/* Header */}
                    <div style={{padding:"14px 16px",background:`${G1}0a`,borderBottom:`1px solid ${BRD}`}}>
                      <p style={{margin:"0 0 4px",fontSize:9,fontWeight:800,color:"#9CA3AF",
                        textTransform:"uppercase",letterSpacing:.5}}>{q.promptLabel}</p>
                      <p style={{margin:"0 0 8px",fontSize:11,fontWeight:700,
                        color:isRecQ?GOLD:isListenQ?PURPLE:G2}}>{typeLabel}</p>
                      {/* Prompt snippet — middle of verse, not full */}
                      {isListenQ?(
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <button onClick={()=>playListenAudio(q.listenText||q.prompt, q.listenSurahNum, q.listenAyahNum, q.listenGlobalNum)}
                            disabled={isSpeaking}
                            style={{flexShrink:0,width:48,height:48,borderRadius:"50%",border:"none",cursor:"pointer",
                              background:isSpeaking?`${PURPLE}22`:`linear-gradient(135deg,${PURPLE},#6d28d9)`,
                              display:"flex",alignItems:"center",justifyContent:"center",
                              boxShadow:isSpeaking?"none":`0 3px 12px ${PURPLE}55`}}>
                            {isSpeaking
                              ?<span style={{display:"flex",gap:2}}>
                                  {[8,13,10].map((h,i)=><span key={i} style={{width:3,height:h,background:PURPLE,borderRadius:2}}/>)}
                               </span>
                              :<Play size={16} color={W} style={{marginLeft:2}}/>}
                          </button>
                          <div>
                            <p style={{margin:0,fontSize:12,fontWeight:700,color:listenError?FAIL:PURPLE}}>
                              {isSpeaking?"Playing…":listenError
                                ?`⚠ Audio failed — tap to retry${listenErrorUrl?" ("+listenErrorUrl+")":""}`
                                :listenDone?"✓ Heard — now choose what comes next":"Tap to hear — then choose the continuation"}
                            </p>
                            {listenDone&&!listenError&&<p style={{margin:"2px 0 0",fontSize:10,color:"#9CA3AF"}}>You can replay it</p>}
                          </div>
                        </div>
                      ):(
                        <p style={{margin:0,fontSize:q.snippet?20:17,direction:"rtl",
                          fontFamily:"'Amiri Quran','Amiri',serif",color:INK,lineHeight:2.8}}>
                          {q.prompt}
                        </p>
                      )}
                    </div>

                    {/* ── MCQ options ── */}
                    {!isRecQ&&(
                      <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:8}}>
                        {q.options.map((opt,oi)=>(
                          <button key={oi} onClick={()=>pickAnswer(oi)}
                            style={{
                              width:"100%",padding:"12px 14px",borderRadius:12,cursor:"pointer",
                              textAlign:"right",direction:"rtl",fontFamily:"'Amiri',serif",
                              fontSize:15,lineHeight:2.0,color:INK,
                              border:`2px solid ${ans===oi?G2:BRD}`,
                              background:ans===oi?`${G1}0e`:WARM,
                              fontWeight:ans===oi?700:400,transition:"all .15s",
                            }}>
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* ── Record answer ── */}
                    {isRecQ&&(
                      <div style={{padding:"14px",display:"flex",flexDirection:"column",gap:12}}>
                        <div style={{padding:"10px 12px",borderRadius:10,
                          background:`${GOLD}0d`,border:`1px solid ${GOLD}33`}}>
                          <p style={{margin:0,fontSize:12,color:"#78350F",fontWeight:600,lineHeight:1.6}}>
                            🎙️ {q.recordPrompt||"Record what comes after the shown text"}
                          </p>
                        </div>
                        {!qRecDone&&(
                          <button
                            onClick={qRecording?stopQRecording:startQRecording}
                            style={{padding:"14px",borderRadius:12,border:"none",cursor:"pointer",
                              background:qRecording
                                ?`linear-gradient(135deg,${FAIL},#b91c1c)`
                                :`linear-gradient(135deg,${G2},${G3})`,
                              color:W,fontWeight:900,fontSize:14,fontFamily:"inherit",
                              display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                            {qRecording
                              ?<><MicOff size={16}/> Stop — {Math.floor(qRecSecs/60).toString().padStart(2,"0")}:{(qRecSecs%60).toString().padStart(2,"0")}</>
                              :<><Mic size={16}/> Start Recording Answer</>}
                          </button>
                        )}
                        {qRecDone&&qRecResult&&(
                          <div style={{padding:"12px",borderRadius:12,
                            background:qRecResult.score>=60?"#F0FDF4":"#FEF2F2",
                            border:`1px solid ${qRecResult.score>=60?"#BBF7D0":"#FECACA"}`}}>
                            <p style={{margin:"0 0 5px",fontWeight:800,fontSize:13,
                              color:qRecResult.score>=60?PASS:FAIL}}>
                              {qRecResult.score>=60?"✓ Good recitation!":"✗ Needs more practice"}
                              {" "}— {qRecResult.score}% match
                            </p>
                            {qRecResult.transcript&&(
                              <p style={{margin:0,fontSize:12,direction:"rtl",
                                fontFamily:"'Amiri',serif",color:"#374151",lineHeight:2}}>
                                {qRecResult.transcript.slice(0,120)}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {(()=>{
                const q=questions[qIdx];
                const isRecQ=q?.type==="record_continue"||q?.type==="record_complete";
                const isListenQ=q?.type==="listen_choose";
                const canNext = isRecQ ? qRecDone : isListenQ ? (answers[qIdx]!==null) : answers[qIdx]!==null;
                const skipAllowed = isRecQ && !qRecDone; // allow skip for record q
                return(
                  <div style={{display:"flex",gap:8}}>
                    {skipAllowed&&(
                      <button onClick={()=>{const a=[...answers];a[qIdx]=1;setAnswers(a);setTimeout(nextQ,50);}}
                        style={{flex:"0 0 auto",padding:"12px 14px",borderRadius:14,border:`1.5px solid ${BRD}`,
                          cursor:"pointer",background:W,color:"#9CA3AF",fontWeight:700,fontSize:12,fontFamily:"inherit"}}>
                        Skip
                      </button>
                    )}
                    <button onClick={nextQ} disabled={!canNext}
                      style={{flex:1,padding:"14px",borderRadius:14,border:"none",cursor:canNext?"pointer":"not-allowed",
                        background:canNext?`linear-gradient(135deg,${G2},${G3})`:"#D1D5DB",
                        color:W,fontWeight:900,fontSize:14,fontFamily:"inherit",transition:"background .2s"}}>
                      {qIdx<questions.length-1?"Next Question →":"Finish Test"}
                    </button>
                  </div>
                );
              })()}
            </div>
          </>
        ):(
          /* No questions — submit directly */
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
            justifyContent:"center",padding:32,gap:16}}>
            <CheckCircle2 size={40} color={PASS}/>
            <p style={{fontWeight:800,fontSize:15,color:G1,margin:0}}>Not enough verses for MCQ</p>
            <p style={{fontSize:12,color:"#9CA3AF",margin:0,textAlign:"center"}}>
              Pages too short to generate questions — submitting your session now.
            </p>
            <button onClick={()=>submitSession(100, null, null)}
              style={{padding:"14px 32px",borderRadius:14,border:"none",cursor:"pointer",
                background:`linear-gradient(135deg,${G2},${G3})`,color:W,fontWeight:900,fontSize:14,fontFamily:"inherit"}}>
              Submit Session ✓
            </button>
          </div>
        )
      )}

      {/* ══ TEST RESULT ══ */}
      {phase==="test_result"&&testScore!==null&&(
        <>
          <div style={{background:`linear-gradient(160deg,${G1},${G2})`,padding:"14px 16px",
            display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
            <p style={{margin:0,fontWeight:800,fontSize:15,color:W,flex:1}}>Test Result</p>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:"20px 16px 28px",
            display:"flex",flexDirection:"column",gap:14,animation:"fadeIn .3s ease"}}>
            <ScoreRing pct={testScore}/>
            <div style={{textAlign:"center",marginBottom:4}}>
              <p style={{margin:0,fontWeight:900,fontSize:18,color:testScore>=TEST_PASS_THRESHOLD?PASS:FAIL}}>
                {testScore>=TEST_PASS_THRESHOLD?"ممتاز! Test Passed!":"يحتاج مراجعة — Below Pass Mark"}
              </p>
              <p style={{margin:"5px 0 0",fontSize:12,color:"#6B7280"}}>
                {testScore>=TEST_PASS_THRESHOLD
                  ?"MashaAllah! Submitting your session…"
                  :`Score below ${TEST_PASS_THRESHOLD}% — review answers and retry`}
              </p>
            </div>

            {/* ── Separate Recitation + Test score breakdown ── */}
            <div style={{background:W,borderRadius:16,border:`1px solid ${BRD}`,padding:"14px 16px"}}>
              <p style={{margin:"0 0 12px",fontSize:10,fontWeight:800,color:G3,textTransform:"uppercase",letterSpacing:.5}}>Score Breakdown</p>
              {[
                {label:"Recitation Score", sublabel:"How well you recited", value:recitationScore??0, icon:"🎙️"},
                ...(sectionAScore!=null?[{label:"Test — Section A", sublabel:"Today's pages", value:sectionAScore, icon:"🎯"}]:[]),
                ...(sectionBScore!=null?[{label:"Test — Section B", sublabel:"Juz review", value:sectionBScore, icon:"📚"}]:[]),
                {label:"Test Overall", sublabel:"Combined sections", value:testScore, icon:"📊"},
              ].map((s,i)=>{
                const col=s.value>=80?"#16a34a":s.value>=65?"#d97706":"#dc2626";
                return(
                  <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",borderRadius:12,marginBottom:8,background:`${col}08`,border:`1.5px solid ${col}22`}}>
                    <div>
                      <p style={{margin:0,fontWeight:800,fontSize:13,color:G1}}>{s.icon} {s.label}</p>
                      <p style={{margin:0,fontSize:10,color:"#9CA3AF"}}>{s.sublabel}</p>
                    </div>
                    <span style={{fontWeight:900,fontSize:22,color:col}}>{s.value}%</span>
                  </div>
                );
              })}
            </div>

            {/* Proctoring report */}
            {tabSwitchCount>0&&(
              <div style={{padding:"10px 12px",borderRadius:12,background:"#FEF2F2",border:"1.5px solid #FECACA",display:"flex",gap:8,alignItems:"center"}}>
                <AlertCircle size={14} color={FAIL}/>
                <p style={{margin:0,fontSize:12,color:FAIL,fontWeight:600}}>{tabSwitchCount} tab switch{tabSwitchCount!==1?"es":""} detected — flagged for teacher review</p>
              </div>
            )}

            {/* Question breakdown */}
            <div style={{background:W,borderRadius:14,border:`1px solid ${BRD}`,padding:"12px 14px"}}>
              <p style={{margin:"0 0 10px",fontSize:9,fontWeight:800,color:"#9CA3AF",
                textTransform:"uppercase",letterSpacing:.5}}>Question Breakdown</p>
              {questions.map((q,i)=>{
                const ua=answers[i];
                const isRecQBreak=q.type==="record_continue"||q.type==="record_complete";
                const ok=isRecQBreak ? ua===0 : ua===q.correct;
                return(
                  <div key={q.id} style={{display:"flex",gap:10,padding:"8px 0",
                    borderBottom:i<questions.length-1?"1px solid #F3F4F6":"none"}}>
                    <div style={{width:24,height:24,borderRadius:"50%",flexShrink:0,
                      background:ok?"#DCFCE7":"#FEE2E2",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:11,fontWeight:900,color:ok?PASS:FAIL}}>
                      {ok?"✓":"✗"}
                    </div>
                    <div style={{flex:1}}>
                      <p style={{margin:0,fontSize:11,fontWeight:600,color:"#374151"}}>Q{i+1}: {q.promptLabel}</p>
                      {!ok&&(
                        <p style={{margin:"3px 0 0",fontSize:13,color:PASS,direction:"rtl",fontFamily:"'Amiri',serif"}}>
                          ✓ {q.correctText.slice(0,60)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {testScore>=TEST_PASS_THRESHOLD
              ?(
                submitting
                  ?<div style={{display:"flex",justifyContent:"center",padding:20}}>
                    <Loader2 size={28} color={GOLD} style={{animation:"spin .9s linear infinite"}}/>
                  </div>
                  :<div style={{padding:"12px",borderRadius:12,background:"#F0FDF4",
                    border:"1px solid #BBF7D0",textAlign:"center"}}>
                    <p style={{margin:0,fontSize:12,color:PASS,fontWeight:700}}>
                      ✅ Submitting your session…
                    </p>
                  </div>
              ):(
                <>
                  <div style={{padding:"12px 14px",borderRadius:12,background:`${GOLD}0d`,border:`1px solid ${GOLD}33`}}>
                    <p style={{margin:0,fontSize:12,color:"#92400E",fontWeight:600,lineHeight:1.6}}>
                      💪 You can do better! Review the correct answers above and take the test again.
                    </p>
                  </div>
                  <button onClick={retryTest}
                    style={{padding:"14px",borderRadius:14,border:"none",cursor:"pointer",
                      background:`linear-gradient(135deg,${AMBER},#b45309)`,color:W,
                      fontWeight:900,fontSize:14,fontFamily:"inherit"}}>
                    🔄 Retry Test
                  </button>
                </>
              )
            }
          </div>
        </>
      )}

      {/* ══ COMPLETE ══ */}
      {phase==="complete"&&(
        <div style={{flex:1,overflowY:"auto",
          background:`linear-gradient(160deg,${G0} 0%,${G1} 40%,${G2} 100%)`,
          display:"flex",flexDirection:"column",alignItems:"center",
          justifyContent:"center",padding:"32px 20px",gap:20}}>

          {/* Trophy */}
          <div style={{width:100,height:100,borderRadius:"50%",
            background:`${GOLD}1a`,border:`3px solid ${GOLD}`,
            display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:`0 0 40px ${GOLD}33`}}>
            <Trophy size={44} color={GOLD}/>
          </div>

          <div style={{textAlign:"center"}}>
            <p style={{margin:0,fontWeight:900,fontSize:24,color:W,letterSpacing:-.5}}>
              اليوم مكتمل! 🎉
            </p>
            <p style={{margin:"6px 0 0",fontSize:14,color:"rgba(255,255,255,.6)"}}>
              Today's Hifdh session is complete — JazakAllahu khairan!
            </p>
          </div>

          {/* ── Separate Recitation + Test scores ── */}
          <div style={{width:"100%",maxWidth:360,display:"flex",flexDirection:"column",gap:10}}>
            <p style={{margin:0,fontSize:10,fontWeight:800,color:`${GOLD}99`,textTransform:"uppercase",letterSpacing:.6,textAlign:"center"}}>Your Results</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[
                {label:"Recitation",value:`${recitationScore??0}%`},
                {label:"Test",value:`${testScore??0}%`},
              ].map(s=>{
                const v=parseInt(s.value);
                const col=v>=80?"#86EFAC":v>=65?GOLD:"#FCA5A5";
                return(
                  <div key={s.label} style={{background:"rgba(255,255,255,.08)",borderRadius:14,padding:"14px 8px",textAlign:"center",border:"1px solid rgba(255,255,255,.1)"}}>
                    <p style={{margin:0,fontWeight:900,fontSize:24,color:col}}>{s.value}</p>
                    <p style={{margin:"3px 0 0",fontSize:9,fontWeight:700,color:"rgba(255,255,255,.4)",textTransform:"uppercase"}}>{s.label}</p>
                  </div>
                );
              })}
            </div>
            <div style={{background:"rgba(255,255,255,.08)",borderRadius:16,padding:"14px",textAlign:"center",border:`1px solid ${GOLD}33`}}>
              <p style={{margin:0,fontWeight:900,fontSize:28,color:finalScore>=80?"#86EFAC":finalScore>=65?GOLD:"#FCA5A5"}}>{finalScore}%</p>
              <p style={{margin:"3px 0 0",fontSize:10,fontWeight:700,color:"rgba(255,255,255,.4)",textTransform:"uppercase"}}>Final Combined Score</p>
            </div>
            <div style={{background:"rgba(255,255,255,.06)",borderRadius:12,padding:"10px",textAlign:"center"}}>
              <p style={{margin:0,fontWeight:800,fontSize:13,color:"rgba(255,255,255,.5)"}}>
                Pages Done: <span style={{color:GOLD}}>{todayPages.length}</span>
                {" · "}Duration: <span style={{color:"#93C5FD"}}>{fmtSecs(Math.round((Date.now()-sessionStart.current)/1000))}</span>
              </p>
            </div>
          </div>

          {/* Hadith */}
          <div style={{width:"100%",maxWidth:360,background:"rgba(255,255,255,.06)",borderRadius:18,
            padding:"18px 16px",border:`1px solid ${GOLD}33`,textAlign:"center"}}>
            <p style={{margin:"0 0 10px",fontFamily:"'Amiri',serif",fontSize:16,color:GOLD,
              direction:"rtl",lineHeight:2.2}}>{hadith.ar}</p>
            <p style={{margin:"0 0 5px",fontSize:12,color:"rgba(255,255,255,.6)",fontStyle:"italic",
              lineHeight:1.6}}>{hadith.en}</p>
            <p style={{margin:0,fontSize:10,color:`${GOLD}88`,fontWeight:700}}>— {hadith.ref}</p>
          </div>

          <div style={{width:"100%",maxWidth:360,padding:"11px 16px",borderRadius:12,
            background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.1)",textAlign:"center"}}>
            <p style={{margin:0,fontSize:12,color:"rgba(255,255,255,.55)"}}>
              📨 Your teacher has been notified. Come back tomorrow for the next page, biiznillah!
            </p>
          </div>

          <button onClick={()=>onClose(true)}
            style={{width:"100%",maxWidth:360,padding:"14px",borderRadius:14,
              border:`2px solid ${GOLD}`,background:"transparent",color:GOLD,
              fontWeight:900,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
            Return to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}

/* ── AudioPlayerWidget ──────────────────────────────────────────── */
// Shares the same AudioContext-decode approach as FullAudioPlayer.
// HTMLAudioElement is never used — AudioContext always routes to speaker on Android.
function AudioPlayerWidget({url,label="Recitation Recording"}:{url:string;label?:string}) {
  const ctxRef       = useRef<AudioContext|null>(null);
  const sourceRef    = useRef<AudioBufferSourceNode|null>(null);
  const bufferRef    = useRef<AudioBuffer|null>(null);
  const startedAtRef = useRef<number>(0);
  const offsetRef    = useRef<number>(0);
  const rafRef       = useRef<number|null>(null);

  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [curTime,  setCurTime]  = useState(0);
  const [loaded,   setLoaded]   = useState(false);
  const [error,    setError]    = useState(false);
  const [speed,    setSpeed]    = useState(1);

  const getCtx=()=>{
    if(!ctxRef.current||ctxRef.current.state==="closed"){
      const AC=(window as any).AudioContext||(window as any).webkitAudioContext;
      ctxRef.current=new AC();
    }
    return ctxRef.current;
  };
  const stopRAF=useCallback(()=>{
    if(rafRef.current){cancelAnimationFrame(rafRef.current);rafRef.current=null;}
  },[]);
  const stopSource=useCallback(()=>{
    if(sourceRef.current){try{sourceRef.current.stop();}catch{}sourceRef.current.disconnect();sourceRef.current=null;}
  },[]);
  const startRAF=useCallback((ctx:AudioContext,buf:AudioBuffer,spd:number)=>{
    const tick=()=>{
      const elapsed=(ctx.currentTime-startedAtRef.current)*spd;
      const cur=Math.min(offsetRef.current+elapsed,buf.duration);
      setCurTime(cur); setProgress(buf.duration>0?cur/buf.duration:0);
      if(cur<buf.duration){rafRef.current=requestAnimationFrame(tick);}
      else{setPlaying(false);setCurTime(0);setProgress(0);offsetRef.current=0;stopRAF();}
    };
    rafRef.current=requestAnimationFrame(tick);
  },[stopRAF]);

  useEffect(()=>{
    setLoaded(false);setError(false);setPlaying(false);
    setProgress(0);setCurTime(0);setDuration(0);
    stopRAF();stopSource();offsetRef.current=0;bufferRef.current=null;
    if(!url) return;
    let cancelled=false;
    (async()=>{
      try{
        let ab: ArrayBuffer;
        if (url.startsWith("blob:")) {
          try {
            const resp=await fetch(url);
            if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
            ab=await resp.arrayBuffer();
          } catch(blobErr) {
            if(!cancelled){console.warn("AudioPlayerWidget: blob URL stale (page refreshed?):",blobErr);setError(true);}
            return;
          }
        } else {
          const resp=await fetch(url);
          if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
          ab=await resp.arrayBuffer();
        }
        if(cancelled) return;
        const ctx=getCtx();
        if(ctx.state==="suspended") await ctx.resume();
        const decoded=await ctx.decodeAudioData(ab);
        if(cancelled) return;
        bufferRef.current=decoded;
        setDuration(decoded.duration);setLoaded(true);
      }catch(e){if(!cancelled){console.warn("AudioPlayerWidget decode error:",e);setError(true);}}
    })();
    return()=>{cancelled=true;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[url]);

  useEffect(()=>()=>{stopRAF();stopSource();ctxRef.current?.close().catch(()=>{});},[]);// eslint-disable-line

  const toggle=async()=>{
    const buffer=bufferRef.current; if(!buffer) return;
    if(playing){
      const ctx=getCtx();
      const elapsed=(ctx.currentTime-startedAtRef.current)*speed;
      offsetRef.current=Math.min(offsetRef.current+elapsed,buffer.duration);
      stopSource();stopRAF();setPlaying(false);
    }else{
      const ctx=getCtx();
      if(ctx.state==="suspended") await ctx.resume();
      stopSource();
      if(offsetRef.current>=buffer.duration-0.05) offsetRef.current=0;
      const src=ctx.createBufferSource();
      src.buffer=buffer; src.playbackRate.value=speed; src.connect(ctx.destination);
      src.onended=()=>{if(sourceRef.current===src){stopRAF();setPlaying(false);setCurTime(0);setProgress(0);offsetRef.current=0;sourceRef.current=null;}};
      src.start(0,offsetRef.current);
      sourceRef.current=src; startedAtRef.current=ctx.currentTime;
      setPlaying(true); startRAF(ctx,buffer,speed);
    }
  };
  const skip=(secs:number)=>{
    const buffer=bufferRef.current; if(!buffer) return;
    const ctx=getCtx();
    if(playing){
      const elapsed=(ctx.currentTime-startedAtRef.current)*speed;
      offsetRef.current=Math.max(0,Math.min(buffer.duration,offsetRef.current+elapsed+secs));
      stopSource();stopRAF();setPlaying(false);
      setTimeout(()=>toggle(),0);
    }else{
      offsetRef.current=Math.max(0,Math.min(buffer.duration,offsetRef.current+secs));
      setCurTime(offsetRef.current);
      setProgress(buffer.duration>0?offsetRef.current/buffer.duration:0);
    }
  };
  const seek=(e:React.MouseEvent<HTMLDivElement>|React.TouchEvent<HTMLDivElement>)=>{
    const buffer=bufferRef.current; if(!buffer) return;
    const rect=(e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const cx="touches" in e?e.touches[0].clientX:e.clientX;
    const frac=Math.max(0,Math.min(1,(cx-rect.left)/rect.width));
    offsetRef.current=frac*buffer.duration;
    setCurTime(offsetRef.current);setProgress(frac);
    if(playing){stopSource();stopRAF();setPlaying(false);setTimeout(()=>toggle(),0);}
  };
  const cycleSpeed=()=>{
    const speeds=[0.75,1,1.25,1.5];
    const next=speeds[(speeds.indexOf(speed)+1)%speeds.length];
    setSpeed(next); if(sourceRef.current) sourceRef.current.playbackRate.value=next;
  };
  const fmt=(s:number)=>(!isFinite(s)||isNaN(s))?"0:00":`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;

  return(
    <div style={{background:`linear-gradient(135deg,${G1}08,${G2}14)`,
      border:`1.5px solid ${GOLD}55`,borderRadius:16,padding:"14px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
        <div style={{width:36,height:36,borderRadius:"50%",
          background:`linear-gradient(135deg,${G2},${G3})`,
          display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <Mic size={15} color={GOLD}/>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <p style={{margin:0,fontWeight:800,fontSize:12,color:G1,
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</p>
          <p style={{margin:0,fontSize:10,color:"#9CA3AF"}}>
            {error?"⚠ Recording unavailable (page refreshed)":loaded?`${fmt(duration)} · ${speed}×`:"Loading…"}
          </p>
        </div>
        <button onClick={cycleSpeed} style={{padding:"3px 8px",borderRadius:20,
          border:`1.5px solid ${GOLD}88`,background:"transparent",color:GOLD,
          fontSize:10,fontWeight:800,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
          {speed}×
        </button>
      </div>

      {/* Controls */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,marginBottom:10}}>
        <button onClick={()=>skip(-15)} style={{background:"none",border:"none",cursor:"pointer",
          padding:4,display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
          <SkipBack size={18} color={G2}/>
          <span style={{fontSize:7,color:"#9CA3AF",fontWeight:700}}>15s</span>
        </button>
        <button onClick={toggle} style={{width:46,height:46,borderRadius:"50%",border:"none",
          cursor:"pointer",background:`linear-gradient(135deg,${GOLD},${GOLD_L})`,
          display:"flex",alignItems:"center",justifyContent:"center",
          boxShadow:`0 3px 12px ${GOLD}55`,flexShrink:0}}>
          {playing
            ?<span style={{display:"flex",gap:3}}>
               <span style={{width:4,height:14,background:"#1C3A2F",borderRadius:2}}/>
               <span style={{width:4,height:14,background:"#1C3A2F",borderRadius:2}}/>
             </span>
            :<Play size={16} color="#1C3A2F" style={{marginLeft:2}}/>}
        </button>
        <button onClick={()=>skip(15)} style={{background:"none",border:"none",cursor:"pointer",
          padding:4,display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
          <SkipForward size={18} color={G2}/>
          <span style={{fontSize:7,color:"#9CA3AF",fontWeight:700}}>15s</span>
        </button>
      </div>

      {/* Seek bar */}
      <div onClick={seek} onTouchStart={seek}
        style={{height:6,borderRadius:3,background:"#E5E7EB",
          cursor:"pointer",overflow:"hidden",marginBottom:4}}>
        <div style={{height:"100%",borderRadius:3,
          background:`linear-gradient(to right,${GOLD},${GOLD_L})`,
          width:`${progress*100}%`,transition:"width 0.05s linear"}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",
        fontSize:9,color:"#9CA3AF",fontWeight:600}}>
        <span>{fmt(curTime)}</span>
        <span>{loaded?fmt(duration):"--:--"}</span>
      </div>
    </div>
  );
}

/* ── DayDetailModal ─────────────────────────────────────────────── */
function DayDetailModal({day,totalPagesInProg,pagesReadSoFar,onClose}:{
  day:ProgramDay; totalPagesInProg:number; pagesReadSoFar:number; onClose:()=>void;
}) {
  const log=day.log;
  const sd=log?.session_data;
  const pageResults:PageResult[]=sd?.page_results??[];
  const audioUrl:string|null=sd?.audio_url??null;
  const pagesLeft=Math.max(0,totalPagesInProg-pagesReadSoFar);

  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:500,
      background:"rgba(0,0,0,.6)",backdropFilter:"blur(6px)",
      display:"flex",alignItems:"flex-end",justifyContent:"center",
      fontFamily:"'Cairo',sans-serif"}}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:560,
        background:WARM,borderRadius:"24px 24px 0 0",
        maxHeight:"88dvh",overflowY:"auto",
        boxShadow:"0 -8px 48px rgba(0,0,0,.35)",
        animation:"slideUp .25s ease"}}>

        {/* Handle */}
        <div style={{display:"flex",justifyContent:"center",padding:"10px 0 0"}}>
          <div style={{width:40,height:4,borderRadius:2,background:"#D1D5DB"}}/>
        </div>

        {/* Header */}
        <div style={{
          background:(day.status==="done"||log?.session_data?.teacher_override)
            ?"linear-gradient(135deg,#14532d,#166534)"
            :"linear-gradient(135deg,#7f1d1d,#991b1b)",
          margin:"10px 12px",borderRadius:18,padding:"16px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div>
              <p style={{margin:0,fontSize:10,fontWeight:700,color:"rgba(255,255,255,.5)",
                textTransform:"uppercase",letterSpacing:.5}}>
                Day {day.dayNum} — {fmtDate(day.date)}
              </p>
              <p style={{margin:"3px 0 0",fontWeight:900,fontSize:18,color:W}}>
                {day.status==="done"?"✓ Session Complete":log?.session_data?.teacher_override?"✓ Session Reviewed":"✗ Missed Session"}
              </p>
            </div>
            {(day.status==="done"||log?.session_data?.teacher_override)&&log?.avg_score!=null&&(
              <div style={{width:56,height:56,borderRadius:"50%",
                background:"rgba(255,255,255,.12)",
                border:`2px solid ${scoreColor(log.avg_score)}`,
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                <p style={{margin:0,fontWeight:900,fontSize:16,color:W}}>{log.avg_score}%</p>
                <p style={{margin:0,fontSize:7,color:"rgba(255,255,255,.5)",fontWeight:700}}>SCORE</p>
              </div>
            )}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {[
              {label:"Pages", value:`${day.pages[0]}${day.pages.length>1?`–${day.pages[day.pages.length-1]}`:""}` },
              {label:"Time",  value:fmtSecs(log?.duration_secs)},
              {label:"Recit.",value:(sd as any)?.teacher_override?`${(sd as any).teacher_override.score}%`:sd?.recitation_score!=null?`${sd.recitation_score}%`:"—"},
            ].map(s=>(
              <div key={s.label} style={{background:"rgba(255,255,255,.1)",borderRadius:10,
                padding:"8px",textAlign:"center"}}>
                <p style={{margin:0,fontWeight:900,fontSize:14,color:W}}>{s.value}</p>
                <p style={{margin:0,fontSize:8,fontWeight:700,color:"rgba(255,255,255,.4)",
                  textTransform:"uppercase"}}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{padding:"0 16px 32px",display:"flex",flexDirection:"column",gap:12}}>
          {/* Teacher override — show as simple feedback note, score already reflected in header */}
          {(sd as any)?.teacher_override?.teacher_feedback&&(
            <div style={{padding:"12px 14px",borderRadius:12,
              background:`${PASS}08`,border:`1px solid ${PASS}30`,
              display:"flex",alignItems:"flex-start",gap:10}}>
              <CheckCircle size={14} color={PASS} style={{flexShrink:0,marginTop:2}}/>
              <div>
                <p style={{margin:"0 0 2px",fontSize:10,fontWeight:700,color:PASS,textTransform:"uppercase",letterSpacing:.4}}>
                  Teacher Feedback
                </p>
                <p style={{margin:0,fontSize:12,color:"#374151",lineHeight:1.6,fontStyle:"italic"}}>
                  "{(sd as any).teacher_override.teacher_feedback}"
                </p>
              </div>
            </div>
          )}

          {/* Pages read / left */}
          <div style={{background:W,borderRadius:16,border:`1px solid ${BRD}`,padding:"14px 16px"}}>
            <p style={{margin:"0 0 10px",fontSize:10,fontWeight:800,color:G3,
              textTransform:"uppercase",letterSpacing:.5}}>Programme Status</p>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div style={{padding:"12px",borderRadius:12,
                background:`${PASS}10`,border:`1.5px solid ${PASS}33`,textAlign:"center"}}>
                <p style={{margin:0,fontWeight:900,fontSize:22,color:PASS}}>{pagesReadSoFar}</p>
                <p style={{margin:0,fontSize:9,fontWeight:700,color:"#6B7280",textTransform:"uppercase"}}>Pages Read</p>
              </div>
              <div style={{padding:"12px",borderRadius:12,
                background:`${GOLD}10`,border:`1.5px solid ${GOLD}33`,textAlign:"center"}}>
                <p style={{margin:0,fontWeight:900,fontSize:22,color:AMBER}}>{pagesLeft}</p>
                <p style={{margin:0,fontSize:9,fontWeight:700,color:"#6B7280",textTransform:"uppercase"}}>Pages Left</p>
              </div>
            </div>
          </div>

          {/* Per-page scores */}
          {pageResults.length>0&&(
            <div style={{background:W,borderRadius:16,border:`1px solid ${BRD}`,padding:"14px 16px"}}>
              <p style={{margin:"0 0 10px",fontSize:10,fontWeight:800,color:G3,
                textTransform:"uppercase",letterSpacing:.5}}>Per-Page Scores</p>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {pageResults.map((pr,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:12,
                    padding:"10px 12px",borderRadius:12,
                    background:`${scoreColor(pr.score)}08`,
                    border:`1.5px solid ${scoreColor(pr.score)}30`}}>
                    <div style={{width:46,height:46,borderRadius:"50%",flexShrink:0,
                      background:`${scoreColor(pr.score)}18`,
                      border:`2.5px solid ${scoreColor(pr.score)}`,
                      display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{fontWeight:900,fontSize:11,color:scoreColor(pr.score)}}>{pr.score}%</span>
                    </div>
                    <div style={{flex:1}}>
                      <p style={{margin:0,fontWeight:800,fontSize:13,color:G1}}>Page {pr.pageNum}</p>
                      {pr.errorWords&&pr.errorWords.length>0
                        ?<p style={{margin:"2px 0 0",fontSize:10,color:FAIL,fontWeight:600,direction:"rtl"}}>
                           ✗ {pr.errorWords.slice(0,5).join("، ")}
                           {pr.errorWords.length>5?` +${pr.errorWords.length-5} more`:""}
                         </p>
                        :<p style={{margin:"2px 0 0",fontSize:10,color:PASS,fontWeight:600}}>✓ No errors detected</p>
                      }
                    </div>
                    <div style={{padding:"4px 10px",borderRadius:8,fontSize:9,fontWeight:900,
                      textTransform:"uppercase" as const,
                      background:pr.score>=70?`${PASS}18`:pr.score>=50?`${AMBER}18`:`${FAIL}18`,
                      color:scoreColor(pr.score)}}>
                      {pr.score>=70?"Excellent":pr.score>=50?"Good":"Retry"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Audio player */}
          {audioUrl&&(
            <div style={{background:W,borderRadius:16,border:`1px solid ${BRD}`,padding:"14px 16px"}}>
              <p style={{margin:"0 0 10px",fontSize:10,fontWeight:800,color:G3,
                textTransform:"uppercase",letterSpacing:.5}}>Recitation Audio</p>
              <AudioPlayerWidget url={audioUrl} label={`Day ${day.dayNum} — Page ${day.pages[0]}`}/>
            </div>
          )}

          {/* Missed explanation — hide if teacher has already reviewed/overridden */}
          {day.status==="missed"&&!(log?.session_data as any)?.teacher_override&&(
            <div style={{padding:"14px 16px",borderRadius:16,
              background:`${FAIL}08`,border:`1.5px solid ${FAIL}30`}}>
              <p style={{margin:"0 0 4px",fontSize:12,fontWeight:800,color:FAIL}}>
                Session was not completed
              </p>
              <p style={{margin:0,fontSize:11,color:"#6B7280",lineHeight:1.6}}>
                No session was recorded for this day. This counts against your streak.
              </p>
            </div>
          )}

          <button onClick={onClose} style={{width:"100%",padding:"14px",borderRadius:14,
            border:`1.5px solid ${BRD}`,background:W,color:G1,fontWeight:800,fontSize:14,
            cursor:"pointer",fontFamily:"inherit"}}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════*/
export default function HifdhDailyRevisionPage() {
  const navigate = useNavigate();
  const [loading,      setLoading]      = useState(true);
  const [userId,       setUserId]       = useState<string|null>(null);
  const [studentName,  setStudentName]  = useState("Student");
  // Multi-assignment support: all active assignments
  const [assignments,  setAssignments]  = useState<Assignment[]>([]);
  const [activeAssignIdx, setActiveAssignIdx] = useState(0);
  const [allLogs,      setAllLogs]      = useState<DailyLog[]>([]); // unfiltered — all assignments
  const [logs,         setLogs]         = useState<DailyLog[]>([]);
  const [todayLog,     setTodayLog]     = useState<DailyLog|null>(null);
  const [tab,          setTab]          = useState<MainTab>("today");
  const [showSession,  setShowSession]  = useState(false);
  const [historyOpen,  setHistoryOpen]  = useState<string|null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedDay,  setSelectedDay]  = useState<ProgramDay|null>(null);
  const [overrideNotif, setOverrideNotif] = useState<{score:number;feedback:string;teacher:string}|null>(null);
  const today = todayISO();

  // Derived: current active assignment (the one student is viewing/doing session for)
  const assignment = assignments[activeAssignIdx] ?? null;

  /* ── Load data ── */
  useEffect(()=>{
    supabase.auth.getUser().then(async({data})=>{
      if(!data?.user) return;
      const uid=data.user.id;
      setUserId(uid);

      const [{data:pf},{data:asgnAll},{data:lgs}] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("user_id" as any,uid).maybeSingle(),
        (supabase as any).from("hifdh_daily_assignments")
          .select("*").eq("student_id",uid).eq("active",true).order("created_at",{ascending:true}),
        (supabase as any).from("hifdh_daily_logs")
          .select("*").eq("student_id",uid)
          .order("log_date",{ascending:false}).limit(60),
      ]);

      if((pf as any)?.full_name) setStudentName((pf as any).full_name);
      // Enrich all active assignments
      const enrichedAll: Assignment[] = ((asgnAll as any[]) ?? []).map((asgn: any) => {
        let extra: any = {};
        try { extra = JSON.parse(asgn.notes || "{}"); } catch {}
        return {
          ...asgn,
          program_start: extra.programStart ?? asgn.program_start ?? asgn.starts_on,
          program_days:  extra.programDays  ?? asgn.program_days,
          days_off:      extra.daysOff      ?? asgn.days_off ?? [],
        } as Assignment;
      });
      setAssignments(enrichedAll);
      setActiveAssignIdx(0);
      // Store all logs — the activeAssignIdx useEffect below filters them per programme
      setAllLogs((lgs??[]) as DailyLog[]);
      setLoading(false);
    });
  },[today]);

  // ── Re-filter logs whenever the active programme tab changes or new logs arrive ──
  useEffect(()=>{
    if(assignments.length === 0) return;
    const activeId = assignments[activeAssignIdx]?.id ?? null;
    const filtered = activeId
      ? allLogs.filter(l => l.assignment_id === activeId)
      : allLogs;
    setLogs(filtered);
    const todLog = filtered.find(l => l.log_date === today) ?? null;
    setTodayLog(todLog);
    setOverrideNotif(null);
    if(todLog?.session_data?.teacher_override && !todLog.acknowledged_at){
      const ov = todLog.session_data.teacher_override;
      setOverrideNotif({score:ov.score, feedback:ov.teacher_feedback||"", teacher:ov.reviewed_by||"Teacher"});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[activeAssignIdx, allLogs, assignments]);

  const dismissOverride = useCallback(async()=>{
    setOverrideNotif(null);
    if(!todayLog) return;
    try { await (supabase as any).from("hifdh_daily_logs").update({acknowledged_at:new Date().toISOString()}).eq("id",todayLog.id); } catch {}
  },[todayLog]);

  /* ── Derived ── */
  const todayPages   = assignment ? getTodayPages(assignment)        : [];
  const programDays  = assignment ? buildProgramDays(assignment,logs,today) : [];
  const doneDays     = programDays.filter(d=>d.status==="done");
  const missedDays   = programDays.filter(d=>d.status==="missed");
  const totalDays    = assignment?.program_days ?? 0;
  const pct          = totalDays>0 ? Math.round((doneDays.length/totalDays)*100) : 0;

  // Streak: consecutive completed days back from yesterday
  const sortedLogs = [...logs].filter(l=>l.completed).sort((a,b)=>b.log_date.localeCompare(a.log_date));
  let streak = todayLog?.completed ? 1 : 0;
  let prev = new Date(today); prev.setDate(prev.getDate()-1);
  for(const l of sortedLogs){
    if(l.log_date===prev.toISOString().split("T")[0]){streak++;prev.setDate(prev.getDate()-1);}
    else if(l.log_date===today) continue;
    else break;
  }

  const avgScore = logs.filter(l=>l.avg_score!==null).length>0
    ? Math.round(logs.filter(l=>l.avg_score!==null).reduce((s,l)=>s+(l.avg_score??0),0)/logs.filter(l=>l.avg_score!==null).length)
    : null;

  const todayDone  = !!todayLog?.completed;
  const startDate  = assignment ? getStartDate(assignment) : null;
  const dayOfProg  = assignment && startDate
    ? workingDaysElapsed(startDate, getDaysOff(assignment))+1 : 0;

  // Last 7 days for week strip
  const last7 = Array.from({length:7},(_,i)=>{
    const d=new Date(today+"T00:00:00"); d.setDate(d.getDate()-(6-i));
    const ds=d.toISOString().split("T")[0];
    const log=logs.find(l=>l.log_date===ds);
    const isToday=ds===today;
    return {date:ds,log,isToday,dayName:d.toLocaleDateString("en-GB",{weekday:"short"})};
  });

  function handleSessionClose(completed=false) {
    setShowSession(false);
    if(completed) {
      // Refresh
      supabase.auth.getUser().then(async({data})=>{
        if(!data?.user) return;
        const uid=data.user.id;
        const [{data:lgs}]=await Promise.all([
          (supabase as any).from("hifdh_daily_logs")
            .select("*").eq("student_id",uid)
            .order("log_date",{ascending:false}).limit(60),
        ]);
        const fetchedLogs2=(lgs??[]) as DailyLog[];
        setAllLogs(fetchedLogs2);
        // allLogs update triggers the activeAssignIdx useEffect to re-filter logs+todayLog
      });
    }
  }

  /* ── Loading ── */
  if(loading) return(
    <div style={{minHeight:"100dvh",background:G1,display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",gap:14}}>
      <div style={{width:56,height:56,borderRadius:"50%",border:`3px solid ${GOLD}33`,
        borderTopColor:GOLD,animation:"spin .9s linear infinite"}}/>
      <p style={{color:GOLD,fontFamily:"'Cairo',sans-serif",fontWeight:700,fontSize:13}}>
        Loading your Hifdh schedule…
      </p>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  /* ── No assignment ── */
  if(assignments.length === 0) return(
    <div style={{minHeight:"100dvh",background:WARM,fontFamily:"'Cairo',sans-serif",
      display:"flex",flexDirection:"column"}}>
      <div style={{background:`linear-gradient(160deg,${G1},${G2})`,padding:"14px 16px",
        display:"flex",alignItems:"center",gap:12}}>
        <button onClick={()=>navigate(-1)}
          style={{width:36,height:36,borderRadius:10,border:"none",cursor:"pointer",
            background:"rgba(255,255,255,.12)",color:W,display:"flex",alignItems:"center",
            justifyContent:"center"}}>
          <ArrowLeft size={18}/>
        </button>
        <p style={{margin:0,fontWeight:900,fontSize:15,color:W}}>Daily Hifdh Revision</p>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"center",padding:32,gap:16,textAlign:"center"}}>
        <div style={{width:80,height:80,borderRadius:"50%",background:`${G1}0d`,
          display:"flex",alignItems:"center",justifyContent:"center"}}>
          <BookOpen size={34} color={G3}/>
        </div>
        <p style={{margin:0,fontWeight:800,fontSize:17,color:G1}}>No Programme Assigned</p>
        <p style={{margin:0,fontSize:13,color:"#6B7280",lineHeight:1.7,maxWidth:280}}>
          Your teacher hasn't assigned a daily Hifdh revision programme yet.
          Please check back later or contact your teacher.
        </p>
        <button onClick={()=>navigate(-1)}
          style={{marginTop:8,padding:"12px 28px",borderRadius:12,border:`1.5px solid ${G2}`,
            background:W,color:G1,fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>
          Go Back
        </button>
      </div>
    </div>
  );

  /* ══════════════════ MAIN RENDER ══════════════════════════════ */
  return (
    <>
      <style>{`
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes slideUp { from{transform:translateY(10px);opacity:0} to{transform:translateY(0);opacity:1} }
        @import url('https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Amiri:wght@400;700&family=Cairo:wght@400;600;700;800;900&display=swap');
        * { box-sizing:border-box; }
      `}</style>

      {/* Session overlay */}
      {showSession&&userId&&assignment&&(
        <SessionOverlay
          assignment={assignment}
          userId={userId}
          todayPages={todayPages}
          onClose={handleSessionClose}
          todayLog={todayLog}
        />
      )}

      <div style={{minHeight:"100dvh",background:WARM,display:"flex",flexDirection:"column",
        fontFamily:"'Cairo',sans-serif",maxWidth:600,margin:"0 auto"}}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{flexShrink:0,background:`linear-gradient(165deg,${G0} 0%,${G1} 60%,${G2} 100%)`,
          padding:"0 0 20px",overflow:"hidden",position:"relative"}}>
          {/* Geometric decoration */}
          <div style={{position:"absolute",top:-40,right:-40,width:180,height:180,
            borderRadius:"50%",border:`1px solid ${GOLD}18`,opacity:.6}}/>
          <div style={{position:"absolute",top:-20,right:-20,width:120,height:120,
            borderRadius:"50%",border:`1px solid ${GOLD}12`}}/>
          <div style={{position:"absolute",bottom:-30,left:-30,width:140,height:140,
            borderRadius:"50%",border:`1px solid ${GOLD}10`}}/>

          {/* Nav bar */}
          <div style={{padding:"14px 16px",display:"flex",alignItems:"center",gap:12,
            position:"relative",zIndex:1}}>
            <button onClick={()=>navigate(-1)}
              style={{width:36,height:36,borderRadius:10,border:"none",cursor:"pointer",
                background:"rgba(255,255,255,.1)",color:W,
                display:"flex",alignItems:"center",justifyContent:"center"}}>
              <ArrowLeft size={18}/>
            </button>
            <div style={{flex:1}}>
              <p style={{margin:0,fontWeight:900,fontSize:15,color:W,letterSpacing:-.2}}>
                Daily Hifdh Revision
              </p>
              <p style={{margin:0,fontSize:10,color:`${GOLD}aa`}}>
                مراجعة الحفظ اليومية — {studentName}
              </p>
            </div>
            <div style={{fontFamily:"'Amiri',serif",color:GOLD,fontSize:"1.3em"}}>﷽</div>
          </div>

          {/* Stats strip */}
          <div style={{padding:"0 16px",position:"relative",zIndex:1,
            display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
            {[
              {icon:<Flame size={14} color={GOLD}/>,   label:"Streak",  value:`${streak}d`,  sub:"days"},
              {icon:<CheckCircle2 size={14} color="#86EFAC"/>, label:"Done", value:String(doneDays.length), sub:`of ${totalDays}`},
              {icon:<AlertCircle size={14} color="#FCA5A5"/>,  label:"Missed",value:String(missedDays.length),sub:"days"},
              {icon:<BarChart2 size={14} color="#93C5FD"/>, label:"Avg",   value:avgScore!=null?`${avgScore}%`:"—",sub:"score"},
            ].map(s=>(
              <div key={s.label} style={{background:"rgba(255,255,255,.07)",borderRadius:12,
                padding:"10px 6px",textAlign:"center",border:"1px solid rgba(255,255,255,.08)"}}>
                <div style={{display:"flex",justifyContent:"center",marginBottom:4}}>{s.icon}</div>
                <p style={{margin:0,fontWeight:900,fontSize:16,color:W,lineHeight:1}}>{s.value}</p>
                <p style={{margin:"2px 0 0",fontSize:8,color:"rgba(255,255,255,.4)",fontWeight:600,
                  textTransform:"uppercase",letterSpacing:.3}}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────── */}
        <div style={{flexShrink:0,background:W,borderBottom:`1px solid ${BRD}`,
          display:"flex",padding:"0 4px"}}>
          {([["today","Today","📅"],["schedule","Schedule","📋"],["history","History","📊"]] as const).map(([t,label,emoji])=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{flex:1,padding:"12px 6px",border:"none",cursor:"pointer",background:"transparent",
                fontFamily:"inherit",fontWeight:tab===t?800:600,fontSize:12,
                color:tab===t?G2:"#9CA3AF",
                borderBottom:tab===t?`2.5px solid ${G2}`:"2.5px solid transparent",
                transition:"all .15s"}}>
              {emoji} {label}
            </button>
          ))}
        </div>

        {/* ── Content ──────────────────────────────────────────── */}
        <div style={{flex:1,overflowY:"auto",padding:"14px 14px 32px",
          display:"flex",flexDirection:"column",gap:12}}>

          {/* ════ TAB: TODAY ════ */}
          {tab==="today"&&(
            <>
          {/* ── Multi-assignment switcher (shown only when >1 active assignment) ── */}
          {assignments.length > 1 && (
            <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4,scrollbarWidth:"none" as any}}>
              {assignments.map((a, i) => {
                const modeLabel = a.mode==="juz"?"Juz":a.mode==="hizb"?"Hizb":"Surah";
                const items = (a.selected_items||[]).slice(0,3).join(", ")+(a.selected_items?.length>3?"…":"");
                const isActive = i === activeAssignIdx;
                return (
                  <button key={a.id} onClick={()=>{ setActiveAssignIdx(i); setShowSession(false); }}
                    style={{flexShrink:0,padding:"8px 14px",borderRadius:12,border:`2px solid ${isActive?GOLD:BRD}`,
                      background:isActive?`linear-gradient(135deg,${G1},${G2})`:W,
                      color:isActive?W:G2,fontWeight:800,fontSize:11,cursor:"pointer",
                      fontFamily:"inherit",transition:"all .15s",
                      boxShadow:isActive?`0 2px 12px ${G1}44`:"none"}}>
                    <span style={{color:isActive?GOLD_L:"#9CA3AF",fontSize:9,display:"block",fontWeight:700,
                      textTransform:"uppercase",letterSpacing:.4,marginBottom:2}}>
                      Programme {i+1}
                    </span>
                    {modeLabel} {items}
                  </button>
                );
              })}
            </div>
          )}

              {/* Today's hero card */}
              <div style={{borderRadius:20,overflow:"hidden",
                background:todayDone
                  ?`linear-gradient(135deg,#14532d,#166534)`
                  :`linear-gradient(135deg,${G1},${G2})`,
                border:todayDone?"1px solid #22c55e33":`1px solid ${GOLD}33`,
                boxShadow:todayDone?"0 4px 24px rgba(22,163,74,.15)":`0 4px 24px ${G1}44`,
                animation:"slideUp .35s ease"}}>
                <div style={{padding:"20px 18px"}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",
                    marginBottom:14}}>
                    <div>
                      <p style={{margin:0,fontSize:10,fontWeight:700,
                        color:todayDone?"rgba(255,255,255,.5)":"rgba(255,255,255,.5)",
                        textTransform:"uppercase",letterSpacing:.6}}>TODAY'S REVISION</p>
                      <p style={{margin:"3px 0 0",fontWeight:900,fontSize:22,color:W,letterSpacing:-.5}}>
                        {todayDone?"Session Complete! ✓":`Day ${dayOfProg} of ${totalDays}`}
                      </p>
                    </div>
                    {todayDone
                      ?<div style={{width:44,height:44,borderRadius:12,background:"rgba(255,255,255,.12)",
                          display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <CheckCircle2 size={24} color="#86efac"/>
                       </div>
                      :<div style={{textAlign:"center"}}>
                        <p style={{margin:0,fontWeight:900,fontSize:26,color:GOLD}}>{todayPages[0]}</p>
                        <p style={{margin:0,fontSize:8,fontWeight:700,color:`${GOLD}88`,
                          textTransform:"uppercase",letterSpacing:.5}}>
                          {todayPages.length>1?`–${todayPages[todayPages.length-1]}`:""} PAGE
                        </p>
                       </div>
                    }
                  </div>

                  {/* Program progress bar */}
                  <div style={{marginBottom:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",
                      marginBottom:5,fontSize:10,color:"rgba(255,255,255,.5)",fontWeight:600}}>
                      <span>Program Progress</span>
                      <span>{pct}%</span>
                    </div>
                    <div style={{height:6,borderRadius:4,background:"rgba(255,255,255,.15)",overflow:"hidden"}}>
                      <div style={{height:"100%",borderRadius:4,
                        background:todayDone?"#22c55e":`linear-gradient(to right,${GOLD},${GOLD_L})`,
                        width:`${pct}%`,transition:"width .5s"}}/>
                    </div>
                    <div style={{marginTop:4,display:"flex",justifyContent:"space-between",
                      fontSize:9,color:"rgba(255,255,255,.35)",fontWeight:600}}>
                      <span>{doneDays.length} days done</span>
                      <span>{totalDays-doneDays.length} remaining</span>
                    </div>
                  </div>

                  {todayDone?(
                    <>
                      {todayLog?.avg_score!=null&&(
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
                          {[
                            {label:"Recitation", value:`${todayLog.session_data?.recitation_score??todayLog.avg_score}%`, color:scoreColor(todayLog.session_data?.recitation_score??todayLog.avg_score)},
                            {label:"Test",       value:`${todayLog.session_data?.test_score??0}%`, color:scoreColor(todayLog.session_data?.test_score??0)},
                            {label:"Overall",    value:`${todayLog.avg_score}%`, color:scoreColor(todayLog.avg_score)},
                          ].map(s=>(
                            <div key={s.label} style={{background:"rgba(255,255,255,.1)",borderRadius:10,
                              padding:"8px",textAlign:"center"}}>
                              <p style={{margin:0,fontWeight:900,fontSize:15,color:(s as any).color||W}}>{s.value}</p>
                              <p style={{margin:0,fontSize:8,fontWeight:700,color:"rgba(255,255,255,.4)",
                                textTransform:"uppercase"}}>{s.label}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{padding:"10px 14px",borderRadius:12,background:"rgba(255,255,255,.08)",
                        textAlign:"center"}}>
                        <p style={{margin:0,fontSize:12,color:"rgba(255,255,255,.6)"}}>
                          Come back tomorrow for your next page, biiznillah! 🌙
                        </p>
                      </div>
                    </>
                  ):(
                    <>
                      <div style={{display:"flex",gap:8,marginBottom:14}}>
                        <div style={{flex:1,padding:"10px",background:"rgba(255,255,255,.07)",
                          borderRadius:12,border:"1px solid rgba(255,255,255,.08)"}}>
                          <p style={{margin:0,fontSize:9,fontWeight:700,color:"rgba(255,255,255,.4)",
                            textTransform:"uppercase",letterSpacing:.4}}>Mode</p>
                          <p style={{margin:"2px 0 0",fontWeight:800,fontSize:13,color:W}}>
                            {assignment.mode==="juz"?"Juz":assignment.mode==="hizb"?"Hizb":"Surah"}
                            {" "}{assignment.selected_items.slice(0,3).join(", ")}
                            {assignment.selected_items.length>3?"…":""}
                          </p>
                        </div>
                        <div style={{flex:1,padding:"10px",background:"rgba(255,255,255,.07)",
                          borderRadius:12,border:"1px solid rgba(255,255,255,.08)"}}>
                          <p style={{margin:0,fontSize:9,fontWeight:700,color:"rgba(255,255,255,.4)",
                            textTransform:"uppercase",letterSpacing:.4}}>Pages Today</p>
                          <p style={{margin:"2px 0 0",fontWeight:900,fontSize:13,color:GOLD}}>
                            {todayPages[0]}{todayPages.length>1?`–${todayPages[todayPages.length-1]}`:""}
                          </p>
                        </div>
                      </div>
                    {/* Smart CTA: if recitation done but quiz pending, show Resume Quiz */}
                    {todayLog && !todayLog.completed && (todayLog.session_data?.recitation_score ?? 0) >= PASS_THRESHOLD ? (
                      <>
                        <div style={{padding:"10px 12px",borderRadius:10,background:`${AMBER}12`,border:`1px solid ${AMBER}33`,marginBottom:8}}>
                          <p style={{margin:0,fontSize:12,fontWeight:700,color:AMBER}}>
                            ✅ Recitation passed ({todayLog.session_data?.recitation_score}%) — Complete your quiz to finish today's session!
                          </p>
                        </div>
                        <button onClick={()=>setShowSession(true)}
                          style={{width:"100%",padding:"15px",borderRadius:14,border:"none",cursor:"pointer",
                            background:`linear-gradient(135deg,${PURPLE},#6d28d9)`,
                            color:W,fontWeight:900,fontSize:15,fontFamily:"inherit",
                            display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                            boxShadow:`0 4px 20px ${PURPLE}55`}}>
                          <Target size={18}/> Resume — Take the Quiz Now
                        </button>
                      </>
                    ) : (
                      <button onClick={()=>setShowSession(true)}
                        style={{width:"100%",padding:"15px",borderRadius:14,border:"none",cursor:"pointer",
                          background:`linear-gradient(135deg,${GOLD},${GOLD_L})`,
                          color:G0,fontWeight:900,fontSize:15,fontFamily:"inherit",
                          display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                          boxShadow:`0 4px 20px ${GOLD}55`}}>
                        <Mic size={18}/> Start Today's Session
                      </button>
                    )}
                    </>
                  )}
                </div>
              </div>

              {/* All-Days History Strip */}
              <div style={{background:W,borderRadius:16,border:`1px solid ${BRD}`,
                padding:"14px 14px 12px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <p style={{margin:0,fontSize:10,fontWeight:800,color:G3,
                    textTransform:"uppercase",letterSpacing:.5}}>Daily History — Tap to view</p>
                  <div style={{display:"flex",gap:10,fontSize:9,fontWeight:700}}>
                    <span style={{color:PASS}}>✓ {doneDays.length}</span>
                    <span style={{color:FAIL}}>✗ {missedDays.length}</span>
                    <span style={{color:"#9CA3AF"}}>• {totalDays-doneDays.length-missedDays.length}</span>
                  </div>
                </div>
                <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:8,
                  scrollbarWidth:"none" as any}}>
                  {programDays.map((day)=>{
                    const isDone  =day.status==="done";
                    const isMiss  =day.status==="missed";
                    const isToday2=day.status==="today";
                    const clickable=isDone||isMiss;
                    const bg  =isDone?`${PASS}20`:isMiss?`${FAIL}15`:isToday2?`${GOLD}18`:"#F3F4F6";
                    const bdr =isDone?PASS:isMiss?FAIL:isToday2?GOLD:"#E5E7EB";
                    return(
                      <div key={day.date}
                        onClick={()=>clickable&&setSelectedDay(day)}
                        style={{flexShrink:0,display:"flex",flexDirection:"column",
                          alignItems:"center",gap:3,cursor:clickable?"pointer":"default"}}>
                        <div style={{width:36,height:36,borderRadius:"50%",
                          background:bg,border:`2px solid ${bdr}`,
                          display:"flex",alignItems:"center",justifyContent:"center",
                          boxShadow:isToday2?`0 0 0 3px ${GOLD}33`:undefined,
                          transition:"transform .1s"}}
                          onMouseEnter={e=>{if(clickable)(e.currentTarget as HTMLDivElement).style.transform="scale(1.15)";}}
                          onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.transform="scale(1)";}}>
                          {isDone
                            ?<CheckCircle2 size={13} color={PASS}/>
                            :isMiss
                            ?<AlertCircle size={12} color={FAIL}/>
                            :isToday2
                            ?<Play size={11} color={GOLD}/>
                            :<span style={{fontSize:8,fontWeight:700,color:"#C4C4C4"}}>{day.dayNum}</span>}
                        </div>
                        <span style={{fontSize:7,fontWeight:700,
                          color:isToday2?G2:"#9CA3AF",textTransform:"uppercase"}}>
                          {isToday2?"Now":`D${day.dayNum}`}
                        </span>
                        {isDone&&day.log?.avg_score!=null&&(
                          <span style={{fontSize:7,fontWeight:800,color:scoreColor(day.log.avg_score)}}>
                            {day.log.avg_score}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p style={{margin:"4px 0 0",fontSize:9,color:"#9CA3AF",textAlign:"center"}}>
                  Tap ✓ or ✗ to see session details & audio
                </p>
              </div>

              {/* Assignment info */}
              {startDate&&(
                <div style={{background:W,borderRadius:16,border:`1px solid ${BRD}`,padding:"14px"}}>
                  <p style={{margin:"0 0 10px",fontSize:10,fontWeight:800,color:G3,
                    textTransform:"uppercase",letterSpacing:.5}}>Programme Details</p>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    {[
                      {label:"Started",  value:fmtDate(startDate)},
                      {label:"Total Days",value:String(totalDays)},
                      {label:"Pages/Day", value:String(assignment.daily_pages)},
                      {label:"Day Off",value:getDaysOff(assignment).length>0?["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][getDaysOff(assignment)[0]]:"None"},
                      {label:"Pass Mark",value:`${PASS_THRESHOLD}%`},
                    ].map(s=>(
                      <div key={s.label} style={{padding:"10px 12px",borderRadius:12,
                        background:`${G1}06`,border:`1px solid ${BRD}`}}>
                        <p style={{margin:0,fontSize:9,fontWeight:700,color:"#9CA3AF",
                          textTransform:"uppercase",letterSpacing:.4}}>{s.label}</p>
                        <p style={{margin:"3px 0 0",fontWeight:800,fontSize:13,color:G1}}>{s.value}</p>
                      </div>
                    ))}
                  </div>
                  {assignment.notes&&(
                    <div style={{marginTop:10,padding:"10px 12px",borderRadius:10,
                      background:`${GOLD}0d`,border:`1px solid ${GOLD}33`}}>
                      <p style={{margin:0,fontSize:10,fontWeight:700,color:"#92400E"}}>📝 Teacher's Note</p>
                      <p style={{margin:"3px 0 0",fontSize:12,color:"#78350F"}}>{assignment.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ════ TAB: SCHEDULE ════ */}
          {tab==="schedule"&&(
            <>
              {/* Overall progress */}
              <div style={{background:`linear-gradient(135deg,${G1},${G2})`,borderRadius:18,
                padding:"16px",border:`1px solid ${GOLD}22`,animation:"slideUp .3s ease"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div>
                    <p style={{margin:0,fontWeight:900,fontSize:15,color:W}}>Programme Overview</p>
                    <p style={{margin:0,fontSize:11,color:"rgba(255,255,255,.5)"}}>
                      {startDate?`Started ${fmtDate(startDate)}`:""}
                    </p>
                  </div>
                  <div style={{textAlign:"center"}}>
                    <p style={{margin:0,fontWeight:900,fontSize:28,color:GOLD}}>{pct}%</p>
                    <p style={{margin:0,fontSize:9,fontWeight:700,color:`${GOLD}88`,textTransform:"uppercase"}}>
                      Complete
                    </p>
                  </div>
                </div>
                <div style={{height:8,borderRadius:4,background:"rgba(255,255,255,.15)",overflow:"hidden"}}>
                  <div style={{height:"100%",borderRadius:4,width:`${pct}%`,
                    background:`linear-gradient(to right,${GOLD},${GOLD_L})`,transition:"width .5s"}}/>
                </div>
                <div style={{marginTop:8,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                  {[
                    {label:"Done",   value:doneDays.length,  color:"#86EFAC"},
                    {label:"Missed", value:missedDays.length, color:"#FCA5A5"},
                    {label:"Left",   value:totalDays-doneDays.length-missedDays.length, color:"rgba(255,255,255,.4)"},
                  ].map(s=>(
                    <div key={s.label} style={{background:"rgba(255,255,255,.07)",borderRadius:8,
                      padding:"6px",textAlign:"center"}}>
                      <p style={{margin:0,fontWeight:800,fontSize:14,color:s.color}}>{s.value}</p>
                      <p style={{margin:0,fontSize:8,fontWeight:700,color:"rgba(255,255,255,.3)",
                        textTransform:"uppercase"}}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Day list */}
              <div style={{background:W,borderRadius:16,border:`1px solid ${BRD}`,overflow:"hidden"}}>
                <button onClick={()=>setScheduleOpen(o=>!o)}
                  style={{width:"100%",padding:"13px 14px",border:"none",cursor:"pointer",
                    background:"transparent",display:"flex",alignItems:"center",gap:8,fontFamily:"inherit"}}>
                  <CalendarDays size={14} color={G3}/>
                  <span style={{flex:1,textAlign:"left",fontSize:11,fontWeight:800,color:G1,
                    textTransform:"uppercase",letterSpacing:.5}}>
                    Day-by-Day Schedule ({programDays.length} days)
                  </span>
                  {scheduleOpen?<ChevronUp size={14} color="#9CA3AF"/>:<ChevronDown size={14} color="#9CA3AF"/>}
                </button>

                {scheduleOpen&&(
                  <div style={{borderTop:`1px solid ${BRD}`,maxHeight:420,overflowY:"auto"}}>
                    {programDays.map((day,i)=>{
                      const isDone  = day.status==="done";
                      const isMiss  = day.status==="missed";
                      const isToday = day.status==="today";
                      const isFuture= day.status==="future";
                      const dotColor= isDone?PASS:isMiss?FAIL:isToday?GOLD:"#E5E7EB";
                      return(
                        <div key={day.date}
                          style={{padding:"10px 14px",borderBottom:i<programDays.length-1?`1px solid #F9FAFB`:"none",
                            background:isToday?`${GOLD}08`:isDone?`${PASS}05`:"transparent",
                            display:"flex",alignItems:"center",gap:10}}>
                          <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,
                            background:isDone?`${PASS}18`:isMiss?`${FAIL}12`:isToday?`${GOLD}18`:"#F3F4F6",
                            border:`2px solid ${dotColor}`,
                            display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,
                            color:dotColor}}>
                            {isDone?"✓":isMiss?"!":String(day.dayNum)}
                          </div>
                          <div style={{flex:1}}>
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <span style={{fontWeight:700,fontSize:12,color:isToday?G1:"#374151"}}>
                                {isToday?"📅 TODAY — ":""}{fmtDate(day.date)}
                              </span>
                              {isToday&&<span style={{padding:"1px 7px",borderRadius:6,background:GOLD,
                                color:G0,fontSize:8,fontWeight:900}}>NOW</span>}
                            </div>
                            <div style={{fontSize:11,color:"#9CA3AF",marginTop:1}}>
                              Page{day.pages.length>1?"s":""}{" "}
                              {day.pages[0]}{day.pages.length>1?`–${day.pages[day.pages.length-1]}`:""}
                              {day.log?.avg_score!=null&&(
                                <span style={{marginLeft:8,fontWeight:700,
                                  color:scoreColor(day.log.avg_score)}}>
                                  {day.log.avg_score}%
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{padding:"2px 8px",borderRadius:8,fontSize:9,fontWeight:800,
                            background:isDone?`${PASS}18`:isMiss?`${FAIL}12`:isToday?`${GOLD}18`:"#F3F4F6",
                            color:isDone?PASS:isMiss?FAIL:isToday?AMBER:"#9CA3AF"}}>
                            {isDone?"Done":isMiss?"Missed":isToday?"Today":"—"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ════ TAB: HISTORY ════ */}
          {tab==="history"&&(
            <>
              {/* Summary bar */}
              <div style={{background:`linear-gradient(135deg,${G1},${G2})`,borderRadius:18,
                padding:"14px 16px",border:`1px solid ${GOLD}22`,animation:"slideUp .3s ease"}}>
                <p style={{margin:"0 0 10px",fontWeight:900,fontSize:14,color:W}}>Overall Performance</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                  {[
                    {label:"Sessions",  value:String(logs.filter(l=>l.completed).length), icon:<CheckCircle2 size={13} color="#86EFAC"/>},
                    {label:"Avg Score", value:avgScore!=null?`${avgScore}%`:"—",          icon:<Star size={13} color={GOLD}/>},
                    {label:"Best Streak",value:`${streak}d`,                              icon:<Flame size={13} color="#FCA5A5"/>},
                  ].map(s=>(
                    <div key={s.label} style={{background:"rgba(255,255,255,.08)",borderRadius:12,
                      padding:"10px 8px",textAlign:"center",border:"1px solid rgba(255,255,255,.08)"}}>
                      <div style={{display:"flex",justifyContent:"center",marginBottom:4}}>{s.icon}</div>
                      <p style={{margin:0,fontWeight:900,fontSize:18,color:W}}>{s.value}</p>
                      <p style={{margin:"2px 0 0",fontSize:8,fontWeight:700,color:"rgba(255,255,255,.4)",
                        textTransform:"uppercase"}}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Log list */}
              {logs.filter(l=>l.completed).length===0?(
                <div style={{background:W,borderRadius:16,border:`1px solid ${BRD}`,
                  padding:"32px",textAlign:"center"}}>
                  <TrendingUp size={32} color="#D1D5DB" style={{margin:"0 auto 10px"}}/>
                  <p style={{margin:0,fontWeight:700,fontSize:13,color:"#9CA3AF"}}>No sessions yet</p>
                  <p style={{margin:"5px 0 0",fontSize:12,color:"#D1D5DB"}}>
                    Start your first session to see history here.
                  </p>
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {logs.filter(l=>l.completed).map(log=>(
                    <div key={log.id} style={{background:W,borderRadius:14,
                      border:`1px solid ${BRD}`,overflow:"hidden"}}>
                      <button onClick={()=>setHistoryOpen(h=>h===log.id?null:log.id)}
                        style={{width:"100%",padding:"12px 14px",border:"none",cursor:"pointer",
                          background:"transparent",display:"flex",alignItems:"center",gap:10,
                          fontFamily:"inherit"}}>
                        <div style={{width:36,height:36,borderRadius:10,flexShrink:0,
                          background:log.avg_score!=null?`${scoreColor(log.avg_score)}18`:"#F3F4F6",
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:13,fontWeight:900,color:log.avg_score!=null?scoreColor(log.avg_score):"#9CA3AF"}}>
                          {log.avg_score!=null?`${log.avg_score}%`:"✓"}
                        </div>
                        <div style={{flex:1,textAlign:"left"}}>
                          <p style={{margin:0,fontWeight:700,fontSize:13,color:"#111827"}}>
                            {fmtDate(log.log_date)}
                          </p>
                          <p style={{margin:0,fontSize:10,color:"#9CA3AF"}}>
                            {log.pages_revised??todayPages.length} page{(log.pages_revised??1)!==1?"s":""} revised
                            {log.duration_secs?` · ${fmtSecs(log.duration_secs)}`:""}
                          </p>
                        </div>
                        {log.session_data?.teacher_override&&(
                          <span style={{fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:6,background:"#EDE9FE",color:"#7c3aed"}}>📝 Reviewed</span>
                        )}
                        {historyOpen===log.id?<ChevronUp size={14} color="#9CA3AF"/>:<ChevronDown size={14} color="#9CA3AF"/>}
                      </button>

                      {historyOpen===log.id&&(
                        <div style={{padding:"0 14px 14px",borderTop:`1px solid #F3F4F6`,
                          animation:"slideUp .2s ease"}}>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:10}}>
                            {[
                              {label:"Recitation",value:`${log.session_data?.recitation_score??log.avg_score??0}%`},
                              {label:"Test",value:`${log.session_data?.test_score??0}%`},
                              {label:"Duration",value:log.duration_secs?fmtSecs(log.duration_secs):"—"},
                            ].map(s=>(
                              <div key={s.label} style={{background:WARM,borderRadius:10,padding:"8px",
                                textAlign:"center",border:`1px solid ${BRD}`}}>
                                <p style={{margin:0,fontWeight:800,fontSize:14,color:G1}}>{s.value}</p>
                                <p style={{margin:0,fontSize:8,fontWeight:700,color:"#9CA3AF",
                                  textTransform:"uppercase"}}>{s.label}</p>
                              </div>
                            ))}
                          </div>
                          {/* Page breakdown */}
                          {log.session_data?.page_results&&log.session_data.page_results.length>0&&(
                            <div style={{marginTop:10}}>
                              <p style={{margin:"0 0 6px",fontSize:9,fontWeight:800,color:"#9CA3AF",
                                textTransform:"uppercase",letterSpacing:.5}}>Page Scores</p>
                              {log.session_data.page_results.map((r:any)=>(
                                <div key={r.pageNum} style={{display:"flex",alignItems:"center",
                                  gap:8,padding:"5px 0",borderBottom:`1px solid #F3F4F6`}}>
                                  <span style={{fontSize:11,fontWeight:700,color:"#374151",minWidth:50}}>
                                    Page {r.pageNum}
                                  </span>
                                  <div style={{flex:1,height:6,borderRadius:4,background:"#F3F4F6",overflow:"hidden"}}>
                                    <div style={{height:"100%",borderRadius:4,
                                      width:`${r.score}%`,background:scoreColor(r.score)}}/>
                                  </div>
                                  <span style={{fontSize:11,fontWeight:800,color:scoreColor(r.score),minWidth:36}}>
                                    {r.score}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          {log.session_data?.errors&&log.session_data.errors.length>0&&(
                            <div style={{marginTop:10,padding:"10px 12px",borderRadius:10,
                              background:"#FFF7ED",border:"1px solid #FED7AA"}}>
                              <p style={{margin:"0 0 6px",fontSize:9,fontWeight:800,color:AMBER,
                                textTransform:"uppercase"}}>Error Words</p>
                              <div style={{display:"flex",flexWrap:"wrap",gap:4,direction:"rtl"}}>
                                {log.session_data.errors.slice(0,12).map((e:any,i:number)=>(
                                  <span key={i} style={{padding:"3px 9px",borderRadius:7,
                                    background:"#FFEDD5",color:AMBER,
                                    fontSize:13,fontFamily:"'Amiri',serif"}}>{e.word}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {selectedDay&&(
        <DayDetailModal
          day={selectedDay}
          totalPagesInProg={totalDays*(assignment?.daily_pages??1)}
          pagesReadSoFar={doneDays.length*(assignment?.daily_pages??1)}
          onClose={()=>setSelectedDay(null)}
        />
      )}
    </>
  );
}
