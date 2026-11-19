// src/components/hifdh/DailyReadReveal.tsx
// The recitation screen of the Daily Hifdh Revision: "Read & Reveal".
//
// It replaces everything from the moment the student taps Start Reciting. The page's own interface (header, timer,
// Pause / Finished buttons, result screen, grades, review grid, 75 % gate, quiz …) is unchanged — this component only
// draws the recitation screen and grades the words with the browser's live Arabic speech recognition.
//
//  • The verses to recite are exactly the ones the admin assigned for today (the page passes them in already clipped);
//    the printed Madinah Mushaf page(s) are shown with ONLY those verses covered and uncovered word by word.
//  • Strict mode (as in the admin test): a skipped / wrong word buzzes, says "خطأ" and waits until it is corrected.
//  • The page's own recorder keeps recording the audio on the same microphone. Some phones will not let speech
//    recognition and a recorder share the microphone, so this component watches both and tells the page (see
//    onMicConflict / onAudioSilent) — the recitation is never lost either way.
//  • At Finish it hands the page a grade for every printed word (same order as refTokens of the assigned ayahs), so the
//    page's result screen, saved results and staff review work exactly as before.
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { AlertCircle, Loader2, MicOff, Pause, Play } from "lucide-react";
import { getGlyphPage, loadGlyphFont, type GlyphLine } from "@/components/quran/mushafGlyphs";
import { buildQcfPlanRanges, rangesOf, type QcfPlan } from "@/lib/qcfPlan";
import {
  buildWords, cloneState, feed, initialState, skipWord, stateScore, stripCumulative, summarize, tokenize,
  type RevealState, type RevealStatus, type RevealWord,
} from "@/lib/revealEngine";
import { refTokens, type WordResult } from "@/lib/recitationCompare";
import { gradeAgainstAyahs, type RevealAyah } from "@/lib/revealGrading";
import QcfMushafReveal from "./QcfMushafReveal";
import { TextReader } from "./RecitationReveal";

const G1 = "#0f2d1f", G2 = "#1a3d27", G3 = "#276749";
const GOLD = "#c9a84c", BRD = "#e5ddd3", W = "#ffffff", PASS = "#16a34a", FAIL = "#dc2626";
const ARABIC = "'Amiri Quran','Amiri','Noto Naskh Arabic',serif";

/* ── minimal Web Speech API typings (not in lib.dom) ─────────────────────────────────────────────────────── */
interface SRAlt { transcript: string }
interface SRResult { isFinal: boolean; length: number; [i: number]: SRAlt }
interface SREvent { results: { length: number; [i: number]: SRResult } }
interface SRErrorEvent { error: string }
interface SRInstance {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: SREvent) => void) | null; onerror: ((e: SRErrorEvent) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type SRCtor = new () => SRInstance;
const getSR = (): SRCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};
/** Can this browser run Read & Reveal? (the page falls back to its previous recitation screen when it cannot) */
export const readRevealSupported = (): boolean => {
  try { if (localStorage.getItem("hifdh_reveal") === "0") return false; } catch { /* noop */ }
  return getSR() !== null;
};

/* ── "خطأ": your own recording (public/sounds/khata.mp3) or the device's Arabic voice ───────────────────── */
let khata: HTMLAudioElement | null = null;
let khataBad = false;
let arVoice: SpeechSynthesisVoice | null = null;
/** Call on a user tap: preloads the sound and the Arabic voice so "خطأ" plays with no delay later. */
export function warmKhata() {
  try {
    if (!khata && !khataBad) {
      khata = new Audio("/sounds/khata.mp3");
      khata.preload = "auto"; khata.onerror = () => { khataBad = true; }; khata.load();
    }
    arVoice = window.speechSynthesis?.getVoices().find((v) => v.lang.toLowerCase().startsWith("ar")) ?? arVoice;
  } catch { /* noop */ }
}
function speakTts() {
  try {
    const sy = window.speechSynthesis;
    if (!sy) return;
    if (sy.speaking) sy.cancel();
    const u = new SpeechSynthesisUtterance("خطأ");
    u.lang = "ar-SA"; u.rate = 1; u.volume = 1;
    if (arVoice) u.voice = arVoice;
    sy.speak(u);
  } catch { /* noop */ }
}
function speakKhata() {
  if (khata && !khataBad) { try { khata.currentTime = 0; khata.play().catch(speakTts); return; } catch { /* fall through */ } }
  speakTts();
}

/* ── public types ────────────────────────────────────────────────────────────────────────────────────────── */

export interface RevealFinish {
  /** one grade per printed word, same order and count as refTokens(ayahs.map(a => a.text).join(" ")) */
  words: WordResult[];
  /** what the recogniser heard for each of those words ("" = nothing) */
  heard: string[];
  /** everything the recogniser wrote (final results), joined */
  heardText: string;
  /** how many words were reached at all */
  checked: number;
  mistakes: number;
}
export interface RevealHandle {
  /** stop listening and return the grading — null when nothing has been recited yet */
  finish(): RevealFinish | null;
}

export type { RevealAyah };

const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

export default function DailyReadReveal({
  ayahs, pageNumbers, title, subtitle, dots, backButton, recSecs, paused, onPause, onResume, onFinish, handleRef,
  getMicLevel, onMicConflict, onAudioSilent, audioOn,
}: {
  ayahs: RevealAyah[];
  /** the Mushaf page(s) of today's assignment (the admin's setting — the page decides them) */
  pageNumbers: number[];
  title: string; subtitle: string;
  dots?: { total: number; idx: number } | null;
  backButton: ReactNode;
  recSecs: number;
  paused: boolean;
  onPause: () => void; onResume: () => void;
  /** the Finished button (and the automatic finish once every word has been recited) — the page then calls handleRef.current.finish() */
  onFinish: () => void;
  handleRef: MutableRefObject<RevealHandle | null>;
  /** 0..1 loudness of the page's recorder right now (so a recorder that hears nothing / a recogniser that is deaf can be told apart) */
  getMicLevel: () => number;
  /** speech recognition cannot share the microphone with the recorder: the page stops the recorder and carries on without audio */
  onMicConflict: () => void;
  /** the recogniser hears the student but the recorder only gets silence */
  onAudioSilent: () => void;
  /** is the page's recorder still running (shown to the student) */
  audioOn: boolean;
}) {
  /* ── the words to grade, and the printed pages that hold them ─────────────────────────────────────────── */
  const ranges = useMemo(() => rangesOf(ayahs.map((a) => ({ surah: a.surah.number, ayah: a.numberInSurah }))), [ayahs]);
  const textWords = useMemo<RevealWord[]>(() => {
    const out: RevealWord[] = [];
    for (const a of ayahs) {
      buildWords([{ n: a.numberInSurah, text: refTokens(a.text).join(" ") }]).forEach((w) => out.push({ ...w, surah: a.surah.number }));
    }
    return out;
  }, [ayahs]);

  const [pages, setPages] = useState<number[]>([]);
  const [qcfLines, setQcfLines] = useState<GlyphLine[][]>([]);
  const [mushafFail, setMushafFail] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const pagesKey = pageNumbers.join(",");
  useEffect(() => {
    if (!ayahs.length || !pageNumbers.length) return;
    let alive = true;
    setMushafFail(false);
    (async () => {
      try {
        let lo = Math.min(...pageNumbers), hi = Math.max(...pageNumbers);
        const cache = new Map<number, GlyphLine[]>();
        for (let round = 0; round < 4; round++) {
          if (hi - lo + 1 > 12) throw new Error("range too long");
          const need: number[] = [];
          for (let p = lo; p <= hi; p++) if (!cache.has(p)) need.push(p);
          const got = await Promise.all(need.map(async (p) => {
            const [lines] = await Promise.all([getGlyphPage(p), loadGlyphFont(p)]);
            if (!lines) throw new Error(`page ${p}`);
            return [p, lines] as const;
          }));
          got.forEach(([p, lines]) => cache.set(p, lines));
          const nums = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
          const plan = buildQcfPlanRanges(nums.map((p) => cache.get(p)!), ranges);
          // a verse that runs over onto a neighbouring page → load that page too
          if (plan.needPrev && lo > 1 && round < 3) { lo--; continue; }
          if (plan.needNext && hi < 604 && round < 3) { hi++; continue; }
          if (!plan.words.length) throw new Error("no words");
          if (!alive) return;
          setPages(nums); setQcfLines(nums.map((p) => cache.get(p)!));
          return;
        }
      } catch (e) {
        console.warn("[read&reveal] printed pages unavailable:", e);
        if (alive) { setPages([]); setQcfLines([]); setMushafFail(true); }
      }
    })();
    return () => { alive = false; };
  }, [pagesKey, ayahs, ranges, reloadTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // the words the engine grades come from the SAME data the page is drawn with, so printed word N = heard word N
  const plan: QcfPlan | null = useMemo(
    () => (pages.length && qcfLines.length === pages.length ? buildQcfPlanRanges(qcfLines, ranges) : null),
    [pages, qcfLines, ranges],
  );
  const words = plan && plan.words.length ? plan.words : textWords;
  const wordsRef = useRef(words); wordsRef.current = words;
  const waitingPages = !mushafFail && !plan;

  /* ── session state ─────────────────────────────────────────────────────────────────────────────────── */
  const [rawView, setView] = useState<RevealState>(() => initialState(0));
  const view = useMemo(() => (rawView.status.length === words.length ? rawView : initialState(words.length)), [rawView, words.length]);
  const viewRef = useRef(view); viewRef.current = view;
  const [showAnswer, setShowAnswer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const recRef = useRef<SRInstance | null>(null);
  const listeningRef = useRef(false);
  const committed = useRef<RevealState>(initialState(0));
  const processed = useRef(0);
  const lastFinal = useRef<string[]>([]);
  const heardLog = useRef<string[]>([]);
  const restarts = useRef<number[]>([]);
  const errBuzzed = useRef(0);
  const pendingErr = useRef<string | null>(null);
  const wake = useRef<{ release(): Promise<void> } | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gotResults = useRef(0);          // recogniser results since the last (re)start
  const conflictHandled = useRef(false);
  const silentReported = useRef(false);
  const deafSecs = useRef(0);            // seconds the recorder heard speech while the recogniser heard nothing
  const mutedSecs = useRef(0);           // seconds the recogniser heard words while the recorder heard nothing
  const finishedRef = useRef(false);
  const pausedRef = useRef(paused); pausedRef.current = paused;

  // a fresh word list (pages finished loading) → start the exercise over (nothing has been recited yet at that point)
  useEffect(() => {
    committed.current = initialState(words.length);
    processed.current = 0; lastFinal.current = []; errBuzzed.current = 0; pendingErr.current = null;
    setView(cloneState(committed.current));
  }, [words]);

  const alarm = useCallback(() => {
    import("@/lib/ctcNative").then((m) => m.buzz([0, 500, 120, 500])).catch(() => { try { navigator.vibrate?.([500, 120, 500]); } catch { /* noop */ } });
    speakKhata();
  }, []);

  const hardStop = useCallback(() => {
    listeningRef.current = false;
    const r = recRef.current;
    recRef.current = null;
    if (r) { r.onresult = null; r.onerror = null; r.onend = null; try { r.abort(); } catch { /* noop */ } }
    wake.current?.release().catch(() => undefined); wake.current = null;
  }, []);

  /** Choose the recogniser alternative that advances the passage best (ar-SA often hears the right word as alt #2). */
  function pickAlt(res: SRResult, base: RevealState, final: boolean) {
    let best: { full: string[]; fresh: string[] } | null = null;
    let bestGain = -Infinity;
    const count = final ? res.length : 1;
    for (let a = 0; a < count; a++) {
      const full = tokenize(res[a].transcript);
      const fresh = stripCumulative(lastFinal.current, full);
      const gain = stateScore(feed(wordsRef.current, cloneState(base), fresh, final, true)) - stateScore(base);
      if (gain > bestGain) { bestGain = gain; best = { full, fresh }; }
    }
    return best ?? { full: [], fresh: [] };
  }

  function onResult(e: SREvent) {
    gotResults.current++; deafSecs.current = 0;
    const res = e.results;
    const w = wordsRef.current;
    const c = committed.current;
    while (processed.current < res.length && res[processed.current].isFinal) {
      const pick = pickAlt(res[processed.current], c, true);
      feed(w, c, pick.fresh, true, true);
      if (pick.full.length) { lastFinal.current = pick.full; heardLog.current.push(pick.fresh.join(" ")); }
      processed.current++;
    }
    let shown = c;
    if (processed.current < res.length) {
      shown = cloneState(c);
      for (let i = processed.current; i < res.length; i++) {
        feed(w, shown, stripCumulative(lastFinal.current, tokenize(res[i][0].transcript)), false, true);
      }
    }
    setView(cloneState(shown));

    // A mistake seen in live (partial) text must show up in two consecutive updates (~0.3 s) before it buzzes,
    // so a half-heard word doesn't cause a false alarm; a mistake in committed text buzzes at once.
    if (shown.errors > errBuzzed.current) {
      const key = `${shown.cursor}:${shown.errors}`;
      if (shown === c || pendingErr.current === key) { alarm(); errBuzzed.current = shown.errors; pendingErr.current = null; }
      else pendingErr.current = key;
    } else {
      pendingErr.current = null;
      if (shown === c) errBuzzed.current = c.errors;
    }
    if (summarize(c).done && !finishedRef.current) {
      finishedRef.current = true;
      hardStop();
      doneTimer.current = setTimeout(() => onFinishRef.current(), 900);   // let the last word appear, then finish
    }
  }
  const onFinishRef = useRef(onFinish); onFinishRef.current = onFinish;

  function spawn(SR: SRCtor) {
    const rec = new SR();
    rec.lang = "ar-SA"; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 3;
    processed.current = 0; lastFinal.current = []; gotResults.current = 0;
    rec.onresult = onResult;
    rec.onerror = (ev) => {
      if (ev.error === "audio-capture" && !conflictHandled.current && audioOnRef.current) {
        // the recorder holds the microphone and this phone will not share it: let the page release it, then listen again
        conflictHandled.current = true;
        hardStop();
        onMicConflict();
        setNote("This phone can't record audio and listen at the same time, so this recitation is checked without a recording.");
        setTimeout(() => { if (!pausedRef.current && !finishedRef.current) begin(); }, 500);
        return;
      }
      const fatal: Record<string, string> = {
        "not-allowed": "Microphone permission was denied. Allow the microphone in the browser settings and reload.",
        "service-not-allowed": "The speech service is blocked on this device.",
        "audio-capture": "No microphone found, or another app is using it.",
        "network": "Speech recognition needs an internet connection.",
      };
      const f = fatal[ev.error];
      if (f) { hardStop(); setError(f); onPause(); }
    };
    rec.onend = () => {
      if (!listeningRef.current || recRef.current !== rec) return;
      // Chrome ends sessions on silence — restart, but give up if it keeps dying immediately
      const now = Date.now();
      restarts.current = [...restarts.current.filter((x) => now - x < 4000), now];
      if (restarts.current.length > 5) {
        hardStop();
        if (audioOnRef.current && !conflictHandled.current) {   // most likely the recorder is in the way
          conflictHandled.current = true; onMicConflict();
          setNote("This phone can't record audio and listen at the same time, so this recitation is checked without a recording.");
          setTimeout(() => { if (!pausedRef.current && !finishedRef.current) begin(); }, 500);
        } else { setError("Recognition keeps stopping. Press Resume to try again."); onPause(); }
        return;
      }
      setTimeout(() => { if (listeningRef.current && recRef.current === rec) spawn(SR); }, 200);
    };
    recRef.current = rec;
    try { rec.start(); } catch { hardStop(); setError("Could not start the microphone."); onPause(); }
  }
  const audioOnRef = useRef(audioOn); audioOnRef.current = audioOn;

  function begin() {
    const SR = getSR();
    if (!SR || !wordsRef.current.length) return;
    setError(null);
    hardStop();
    listeningRef.current = true; restarts.current = [];
    (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } })
      .wakeLock?.request("screen").then((l) => { wake.current = l; }).catch(() => undefined);
    spawn(SR);
  }

  // listen while the page's recorder runs and the recitation is not paused (and the printed pages are ready)
  const ready = !waitingPages && words.length > 0;
  useEffect(() => {
    if (!ready || finishedRef.current) return;
    if (paused) { hardStop(); return; }
    warmKhata();
    begin();
    return () => hardStop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, paused]);
  useEffect(() => () => { hardStop(); if (doneTimer.current) clearTimeout(doneTimer.current); }, [hardStop]);

  // Watchdog (1 s): tells apart "the recogniser is deaf" and "the recorder only gets silence" — the two ways the shared microphone can fail.
  useEffect(() => {
    const id = setInterval(() => {
      if (pausedRef.current || finishedRef.current || !listeningRef.current) return;
      const level = getMicLevel();
      if (audioOnRef.current && !conflictHandled.current) {
        deafSecs.current = level > 0.015 && gotResults.current === 0 ? deafSecs.current + 1 : level > 0.015 ? deafSecs.current : 0;
        if (deafSecs.current >= 6) {   // the recorder hears the student clearly, the recogniser nothing at all
          conflictHandled.current = true; hardStop(); onMicConflict();
          setNote("This phone can't record audio and listen at the same time, so this recitation is checked without a recording.");
          setTimeout(() => { if (!pausedRef.current && !finishedRef.current) begin(); }, 500);
        }
      }
      if (audioOnRef.current && !silentReported.current) {
        mutedSecs.current = gotResults.current > 0 && level < 0.004 ? mutedSecs.current + 1 : 0;
        if (mutedSecs.current >= 8) {  // the recogniser hears the student, the recorder gets silence
          silentReported.current = true; onAudioSilent();
          setNote("Your recitation is being checked, but this phone may not be recording the audio.");
        }
      }
    }, 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── the page asks for the grading ─────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    handleRef.current = {
      finish: () => {
        finishedRef.current = true;
        hardStop();
        if (doneTimer.current) { clearTimeout(doneTimer.current); doneTimer.current = null; }
        const s = viewRef.current;
        const w = wordsRef.current;
        const sum = summarize(s);
        const checked = sum.total - sum.pending;
        if (checked === 0) { finishedRef.current = false; setError("Nothing has been recited yet."); return null; }
        const g = gradeAgainstAyahs(ayahs, w, s);
        return { words: g.words, heard: g.heard, heardText: heardLog.current.join(" ").trim(), checked, mistakes: sum.wrong + sum.missed + sum.errors };
      },
    };
    return () => { handleRef.current = null; };
  }, [ayahs, handleRef, hardStop]);

  /* ── screen ────────────────────────────────────────────────────────────────────────────────────────── */
  const sum = summarize(view);
  const mistakes = view.errors;
  const cur = words[Math.min(view.cursor, Math.max(0, words.length - 1))];
  const skip = () => { const n = skipWord(words, committed.current); committed.current = n; setView(cloneState(n)); setShowAnswer(false); };
  const noop = () => undefined;
  const useText = mushafFail;

  return (
    <>
      <style>{`@keyframes rrShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }`}</style>

      {/* header — same as the page's recording header */}
      <div style={{ background: `linear-gradient(160deg,${G1},${G2})`, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        {backButton}
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 14, color: W }}>{title}</p>
          <p style={{ margin: 0, fontSize: 10, color: `${GOLD}cc` }}>{subtitle}</p>
        </div>
        {dots && (
          <div style={{ display: "flex", gap: 4 }}>
            {Array.from({ length: dots.total }, (_, i) => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i < dots.idx ? PASS : i === dots.idx ? GOLD : "rgba(255,255,255,.25)" }} />
            ))}
          </div>
        )}
      </div>

      {/* live info row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", flexShrink: 0, background: W, borderBottom: `1px solid ${BRD}` }}>
        <span style={{ padding: "4px 12px", borderRadius: 20, background: `${PASS}18`, border: `1px solid ${PASS}50`, fontSize: 13, fontWeight: 900, color: PASS, fontVariantNumeric: "tabular-nums" }}>
          {paused ? "⏸" : "🔴"} {fmt(recSecs)}
        </span>
        {mistakes > 0 && (
          <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 800, background: "#FEE2E2", color: "#B91C1C", border: "1px solid #FCA5A5" }}>
            ⚠ {mistakes} {mistakes === 1 ? "mistake" : "mistakes"}
          </span>
        )}
      </div>

      {/* strict-mode mistake banner */}
      {view.blocked && !paused && (
        <div role="alert" style={{ margin: "8px 14px 0", flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 14, background: "#FEF2F2", border: "2px solid #F87171", animation: "rrShake .35s" }}>
          <span style={{ fontFamily: "'Amiri',serif", fontWeight: 900, fontSize: 30, color: "#B91C1C", lineHeight: 1 }}>خطأ</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: "#7F1D1D", lineHeight: 1.4 }}>
            {showAnswer && cur
              ? <span dir="rtl" style={{ fontFamily: ARABIC, fontSize: 24, color: G1 }}>{cur.text}</span>
              : "Say this word correctly to continue."}
          </span>
          <button onClick={() => setShowAnswer((v) => !v)}
            style={{ flexShrink: 0, height: 38, padding: "0 10px", borderRadius: 10, border: "1px solid #FCA5A5", background: W, color: "#991B1B", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            {showAnswer ? "Hide" : "Show word"}
          </button>
          <button onClick={skip}
            style={{ flexShrink: 0, height: 38, padding: "0 10px", borderRadius: 10, border: "1px solid #FCA5A5", background: W, color: "#991B1B", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            Skip
          </button>
        </div>
      )}
      {error && (
        <div role="alert" style={{ margin: "8px 14px 0", flexShrink: 0, display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: 12, background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B", fontSize: 12, fontWeight: 600 }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> <span>{error}</span>
        </div>
      )}
      {note && !error && (
        <div style={{ margin: "8px 14px 0", flexShrink: 0, display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: 12, background: "#FFFBEB", border: "1px solid #FCD34D", color: "#92400E", fontSize: 12, fontWeight: 600 }}>
          <MicOff size={16} style={{ flexShrink: 0, marginTop: 1 }} /> <span>{note}</span>
        </div>
      )}

      {/* the printed Mushaf page(s): only today's assigned verses are covered / uncovered */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", background: "#fff", marginTop: 8 }}>
        {useText ? (
          <TextReader words={words} view={view} mode="word" fontSize={32} started showAll={false} hintOn={false}
            peeked={new Set()} onPeek={noop} showBism={false} />
        ) : waitingPages ? (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            <Loader2 size={30} color={GOLD} className="animate-spin" />
          </div>
        ) : (
          <QcfMushafReveal pageNumbers={pages} pages={qcfLines} plan={plan!} view={view} started showAll={false}
            mode="word" hintOn={false} peeked={new Set()} onPeek={noop} />
        )}
        {mushafFail && (
          <button onClick={() => setReloadTick((n) => n + 1)}
            style={{ position: "absolute", top: 8, insetInlineStart: 8, zIndex: 5, padding: "6px 12px", borderRadius: 10, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#991B1B", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            Printed page didn't load — tap to retry
          </button>
        )}
      </div>

      {/* bottom controls — same buttons as before */}
      <div style={{ padding: "12px 16px", paddingBottom: "max(12px, env(safe-area-inset-bottom))", background: W, borderTop: `1px solid ${BRD}`, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={paused ? onResume : onPause}
            style={{ flexShrink: 0, minWidth: 112, padding: "15px 16px", borderRadius: 14, cursor: "pointer", border: `1.5px solid ${paused ? PASS : BRD}`,
              background: paused ? `linear-gradient(135deg,${G2},${G3})` : W, color: paused ? W : G1, fontWeight: 900, fontSize: 14,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}>
            {paused ? <><Play size={17} /> Resume</> : <><Pause size={17} /> Pause</>}
          </button>
          <button onClick={onFinish} disabled={sum.total - sum.pending === 0}
            style={{ flex: 1, padding: "15px", borderRadius: 14, border: "none", cursor: "pointer", background: FAIL, color: W, fontWeight: 900, fontSize: 14,
              opacity: sum.total - sum.pending === 0 ? 0.55 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}>
            <MicOff size={17} /> Finished — Evaluate
          </button>
        </div>
      </div>
    </>
  );
}

