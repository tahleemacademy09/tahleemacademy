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
import {
  ArrowLeft, Mic, MicOff, BookOpen, CalendarDays, Clock, Trophy,
  Star, CheckCircle, CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  Flame, Target, TrendingUp, Play, RefreshCcw, Heart, Loader2,
  BookMarked, BarChart2, Lock, ShieldCheck, Bell, Eye,
  SkipBack, SkipForward,
} from "lucide-react";

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
  // Global ayah number (1-6236) used to fetch professional Quran audio from CDN
  listenAyahNum?: number;
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
        return verses.map((v: any) => ({
          number: v.verse_number ?? 0,
          numberInSurah: v.verse_number ?? 0,
          text: v.text_uthmani ?? v.words?.map((w: any) => w.text_uthmani ?? w.text).join(" ") ?? "",
          surah: {
            number: v.chapter_id ?? 0,
            name: "",
            englishName: v.chapter_id ? "" : "",
          },
          words: (v.words ?? [])
            .filter((w: any) => w.char_type_name !== "end")
            .map((w: any) => ({
              text: w.text_uthmani ?? w.text ?? "",
              line_number: w.line_number ?? 0,
            })),
        }));
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
  // Split on whitespace — keep originals for display, normalize for matching
  const origRef = refText.split(/\s+/).filter(Boolean);
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
  const makeRecordContinue = (i: number, pool: Ayah[], sec: "A"|"B", isErr=false): Question | null => {
    if (i >= pool.length - 1) return null;
    const cur  = pool[i];
    const next = pool[i + 1];
    const curFull  = fullVerse(cur);
    if (used.has(key("rec", curFull))) return null;
    used.add(key("rec", curFull));
    // Student must recite the next verse (and optionally the one after)
    const expected = [fullVerse(next), pool[i+2] ? fullVerse(pool[i+2]) : ""].filter(Boolean).join(" ");
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
      listenText: curFull,           // full verse text fed to TTS
      listenAyahNum: ayah.number,    // CDN audio number
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
  for (const a of errorAyahs.slice(0, 4)) {
    const q = makeMcqBlank(a, true, allAyahs, "A");
    if (q) qs.push(q);
  }

  // 2. Error continuation — what comes after error verses
  errorAyahs.forEach(a => {
    const idx = allAyahs.indexOf(a);
    if (idx < 0 || idx >= allAyahs.length-1) return;
    if (qs.filter(q=>q.section==="A"&&q.type==="mcq_continuation").length >= 2) return;
    const q = makeMcqContinuation(idx, allAyahs, "A");
    if (q) qs.push(q);
  });

  // 3. Record-continue from error areas
  errorAyahs.slice(0,2).forEach(a => {
    const idx = allAyahs.indexOf(a);
    if (idx < 0 || idx >= allAyahs.length-2) return;
    const q = makeRecordContinue(idx, allAyahs, "A", true);
    if (q) qs.push(q);
  });

  // 4. MCQ next — across today's pages (spread evenly)
  const stepA = Math.max(1, Math.floor(allAyahs.length / 3));
  for (let i = 0; i < allAyahs.length-1 && qs.filter(q=>q.section==="A"&&q.type==="mcq_next").length < 3; i += stepA) {
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
    // MCQ next
    for (let i = 0; i < juzAyahs.length-1 && qs.filter(q=>q.section==="B"&&q.type==="mcq_next").length < 3; i += stepB) {
      const q = makeMcqNext(i, juzAyahs, "B");
      if (q) qs.push(q);
    }
    // MCQ blanks
    const stepB2 = Math.max(1, Math.floor(juzAyahs.length / 3));
    for (let i = 0; i < juzAyahs.length && qs.filter(q=>q.section==="B"&&q.type==="mcq_blank").length < 2; i += stepB2) {
      const q = makeMcqBlank(juzAyahs[i], false, juzAyahs, "B");
      if (q) qs.push(q);
    }
    // Record continue from juz
    const recIdx = Math.floor(juzAyahs.length / 2);
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
    const speeds = [0.75, 1, 1.25, 1.5];
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
  // TTS / listen state
  const [isSpeaking,   setIsSpeaking]   = useState(false);
  const [listenDone,   setListenDone]   = useState(false);
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

  // ── PROGRESSIVE REVEAL ────────────────────────────────────────────────────
  // Words on the Quran page start blurred and reveal progressively as the
  // student recites. Two reveal mechanisms work together:
  //   1. TIME-BASED (recSecs): a word reveals automatically every N seconds
  //      so the page always advances even if SpeechRecognition is unavailable.
  //   2. SPEECH-BASED (SpeechRecognition): each interim / final transcript
  //      result bumps the reveal index by the number of words spoken so far,
  //      giving instant, voice-driven reveals when the browser supports it.
  // Both mechanisms write to revealedWordCount; the max of the two always wins.
  const [revealedWordCount, setRevealedWordCount] = useState(0);
  const recognitionRef = useRef<any>(null);
  // Seconds-per-word pacing: reveal one word every ~2 s by default.
  // Words revea                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           