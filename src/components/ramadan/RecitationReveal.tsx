// src/components/ramadan/RecitationReveal.tsx
// Admin-only live "Read & Reveal" test (Ramadan Programs page).
// Pick any surah + ayah range → the text is blurred → recite → each word is revealed (and graded) as it is heard.
// Uses the browser Web Speech API (Arabic) for live recognition; matching logic lives in src/lib/revealEngine.ts.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  AlertCircle, Eye, EyeOff, Lightbulb, Loader2, Lock, Mic, Minus, Moon, Plus, RotateCcw, ShieldAlert, SkipForward, Square, Vibrate, Volume2,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { fetchAyahs, fetchSurahs, type Ayah, type SurahInfo } from "@/lib/quranCheck";
import {
  ayahDone, buildWords, cloneState, feed, firstLetter, initialState, manualReveal, skipWord, stateScore, stripCumulative,
  summarize, tokenize, type RevealState, type RevealStatus,
} from "@/lib/revealEngine";

const G = "#064E3B";
const BISMILLAH = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";
const MAX_AYAHS = 40;
const FONT_KEY = "ramadan.reveal.font";
const VIB_KEY = "ramadan.reveal.vibrate";
const STRICT_KEY = "ramadan.reveal.strict";
const VOICE_KEY = "ramadan.reveal.voice";

let khata: HTMLAudioElement | null = null;
let khataBad = false;
let arVoice: SpeechSynthesisVoice | null = null;

/** Call on a user tap (Start): preloads the sound and the Arabic voice so "خطأ" plays with no delay later. */
function warmKhata() {
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

/**
 * Say "خطأ" out loud. Plays /sounds/khata.mp3 if you add your own recording to public/sounds/,
 * otherwise uses the device's Arabic text-to-speech voice.
 */
function speakKhata() {
  if (khata && !khataBad) { try { khata.currentTime = 0; khata.play().catch(speakTts); return; } catch { /* fall through */ } }
  speakTts();
}

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

const lsGet = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

const WORD: Record<Exclude<RevealStatus, "pending">, { bg: string; fg: string; en: string; ar: string }> = {
  ok:     { bg: "#dcfce7", fg: "#14532d", en: "Correct",       ar: "صحيح" },
  close:  { bg: "#fef3c7", fg: "#78350f", en: "Close — review", ar: "قريب — راجع" },
  wrong:  { bg: "#fee2e2", fg: "#7f1d1d", en: "Wrong word",    ar: "كلمة خاطئة" },
  missed: { bg: "#e5e7eb", fg: "#374151", en: "Skipped",       ar: "فاتت" },
};

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

type Mode = "word" | "ayah";

export default function RecitationReveal() {
  const { t, dir } = useLanguage();

  /* ── passage ─────────────────────────────────────────────────── */
  const [surahs, setSurahs] = useState<SurahInfo[]>([]);
  const [surah, setSurah] = useState(112);
  const [ayahs, setAyahs] = useState<Ayah[]>([]);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(4);
  const [withBism, setWithBism] = useState(false);
  const [loadingText, setLoadingText] = useState(true);

  /* ── session ─────────────────────────────────────────────────── */
  const [mode, setMode] = useState<Mode>("word");
  const [fontSize, setFontSize] = useState(() => Number(lsGet(FONT_KEY)) || 32);
  const [vibrate, setVibrate] = useState(() => lsGet(VIB_KEY) !== "0");
  const [strict, setStrict] = useState(() => lsGet(STRICT_KEY) !== "0");
  const [voice, setVoice] = useState(() => lsGet(VOICE_KEY) !== "0");
  const [listening, setListening] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [live, setLive] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rawView, setView] = useState<RevealState>(() => initialState(0));
  const [peeked, setPeeked] = useState<Set<number>>(new Set());
  const [hint, setHint] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const supported = useMemo(() => getSR() !== null, []);
  const total = surahs.find((s) => s.number === surah)?.numberOfAyahs ?? ayahs.length;
  const canBism = surah !== 1 && surah !== 9 && from === 1;

  const words = useMemo(
    () => buildWords(ayahs.filter((a) => a.n >= from && a.n <= to), canBism && withBism ? BISMILLAH : undefined),
    [ayahs, from, to, withBism, canBism],
  );
  // The reset effect runs after the render in which `words` changes — never read a state of the wrong length.
  const view = useMemo(
    () => (rawView.status.length === words.length ? rawView : initialState(words.length)),
    [rawView, words.length],
  );
  const wordsRef = useRef(words);
  wordsRef.current = words;

  const recRef = useRef<SRInstance | null>(null);
  const listeningRef = useRef(false);
  const committed = useRef<RevealState>(initialState(0));
  const processed = useRef(0);
  const lastFinal = useRef<string[]>([]);
  const restarts = useRef<number[]>([]);
  const flags = useRef(0);
  const errBuzzed = useRef(0);
  const pendingErr = useRef<string | null>(null);
  const wake = useRef<{ release(): Promise<void> } | null>(null);

  /* ── Quran text ──────────────────────────────────────────────── */
  useEffect(() => {
    fetchSurahs().then(setSurahs).catch(() =>
      setError(t("Could not load the surah list. Check your connection.", "تعذّر تحميل قائمة السور. تحقّق من الاتصال.")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    setLoadingText(true);
    fetchAyahs(surah)
      .then((a) => {
        if (!alive) return;
        setAyahs(a); setFrom(1); setTo(Math.min(a.length, 4)); setWithBism(surah !== 1 && surah !== 9);
      })
      .catch(() => alive && setError(t("Could not load the surah text.", "تعذّر تحميل نص السورة.")))
      .finally(() => alive && setLoadingText(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surah]);

  /* ── (re)start the exercise whenever the passage changes ────── */
  const resetExercise = useCallback(() => {
    hardStop();
    committed.current = initialState(wordsRef.current.length);
    processed.current = 0; lastFinal.current = []; flags.current = 0; errBuzzed.current = 0; pendingErr.current = null;
    setView(cloneState(committed.current));
    setPeeked(new Set()); setHint(false); setSelected(null); setLive(""); setSeconds(0); setError(null); setShowAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { resetExercise(); }, [words, resetExercise]);

  /* ── timer, hint reset, auto-scroll ─────────────────────────── */
  useEffect(() => {
    if (!listening) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [listening]);

  useEffect(() => { setHint(false); }, [view.cursor]);

  useEffect(() => {
    if (!listening) return;
    document.querySelector(`[data-w="${view.cursor}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [view.cursor, listening]);

  useEffect(() => () => { hardStop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── feedback buzz on a new mistake ─────────────────────────── */
  const vibrateRef = useRef(vibrate); vibrateRef.current = vibrate;
  const strictRef = useRef(strict); strictRef.current = strict;
  const voiceRef = useRef(voice); voiceRef.current = voice;
  /** strong = a strict-mode mistake: long double buzz + "خطأ"; otherwise a short buzz. */
  const alarm = useCallback((strong: boolean) => {
    if (vibrateRef.current) {
      const pattern = strong ? [0, 500, 120, 500] : [0, 120];
      import("@/lib/ctcNative").then((m) => m.buzz(pattern)).catch(() => { try { navigator.vibrate?.(pattern.slice(1)); } catch { /* noop */ } });
    }
    if (strong && voiceRef.current) speakKhata();
  }, []);

  /* ── recognition ─────────────────────────────────────────────── */
  function hardStop() {
    listeningRef.current = false;
    const r = recRef.current;
    recRef.current = null;
    if (r) { r.onresult = null; r.onerror = null; r.onend = null; try { r.abort(); } catch { /* noop */ } }
    wake.current?.release().catch(() => undefined); wake.current = null;
    setListening(false);
  }

  /** Choose the recogniser alternative that advances the passage best (ar-SA often hears the right word as alt #2). */
  function pickAlt(res: SRResult, base: RevealState, final: boolean) {
    let best: { full: string[]; fresh: string[] } | null = null;
    let bestGain = -Infinity;
    const count = final ? res.length : 1;
    for (let a = 0; a < count; a++) {
      const full = tokenize(res[a].transcript);
      const fresh = stripCumulative(lastFinal.current, full);
      const gain = stateScore(feed(wordsRef.current, cloneState(base), fresh, final, strictRef.current)) - stateScore(base);
      if (gain > bestGain) { bestGain = gain; best = { full, fresh }; }
    }
    return best ?? { full: [], fresh: [] };
  }

  function onResult(e: SREvent) {
    const res = e.results;
    const w = wordsRef.current;
    const c = committed.current;
    while (processed.current < res.length && res[processed.current].isFinal) {
      const pick = pickAlt(res[processed.current], c, true);
      feed(w, c, pick.fresh, true, strictRef.current);
      if (pick.full.length) lastFinal.current = pick.full;
      processed.current++;
    }
    let shown = c;
    let text = "";
    if (processed.current < res.length) {
      shown = cloneState(c);
      for (let i = processed.current; i < res.length; i++) {
        const full = tokenize(res[i][0].transcript);
        text += " " + res[i][0].transcript;
        feed(w, shown, stripCumulative(lastFinal.current, full), false, strictRef.current);
      }
    }
    setLive(text.trim());
    setView(cloneState(shown));

    const sum = summarize(c);
    if (strictRef.current) {
      // A mistake seen in live (partial) text must show up in two consecutive updates (~0.3 s) before it buzzes,
      // so a half-heard word doesn't cause a false alarm; a mistake in committed text buzzes at once.
      if (shown.errors > errBuzzed.current) {
        const key = `${shown.cursor}:${shown.errors}`;
        if (shown === c || pendingErr.current === key) { alarm(true); errBuzzed.current = shown.errors; pendingErr.current = null; }
        else pendingErr.current = key;
      } else {
        pendingErr.current = null;
        if (shown === c) errBuzzed.current = c.errors;
      }
    } else {
      const bad = sum.wrong + sum.missed;
      if (bad > flags.current) alarm(false);
      flags.current = bad;
    }
    if (sum.done) { hardStop(); }
  }

  function begin() {
    const SR = getSR();
    if (!SR) { setError(t("Speech recognition is not available in this browser. Use Chrome (HTTPS).", "التعرّف على الصوت غير متاح في هذا المتصفح. استخدم Chrome.")); return; }
    if (!words.length) return;
    if (summarize(committed.current).done) resetExercise();
    setError(null);
    warmKhata();
    listeningRef.current = true; restarts.current = [];
    setListening(true);
    (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } })
      .wakeLock?.request("screen").then((l) => { wake.current = l; }).catch(() => undefined);
    spawn(SR);
  }

  function spawn(SR: SRCtor) {
    const rec = new SR();
    rec.lang = "ar-SA"; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 3;
    processed.current = 0; lastFinal.current = [];
    rec.onresult = onResult;
    rec.onerror = (ev) => {
      const fatal: Record<string, [string, string]> = {
        "not-allowed": ["Microphone permission was denied. Allow the microphone in site settings and reload.", "تم رفض إذن الميكروفون. اسمح به من إعدادات الموقع ثم أعد التحميل."],
        "service-not-allowed": ["The speech service is blocked on this device.", "خدمة التعرّف على الصوت محجوبة على هذا الجهاز."],
        "audio-capture": ["No microphone found, or another app is using it.", "لا يوجد ميكروفون أو أن تطبيقًا آخر يستخدمه."],
        "network": ["Speech recognition needs an internet connection.", "التعرّف على الصوت يحتاج إلى اتصال بالإنترنت."],
      };
      const f = fatal[ev.error];
      if (f) { hardStop(); setError(t(f[0], f[1])); }
    };
    rec.onend = () => {
      if (!listeningRef.current || recRef.current !== rec) return;
      // Chrome ends sessions on silence — restart, but give up if it keeps dying immediately
      const now = Date.now();
      restarts.current = [...restarts.current.filter((x) => now - x < 4000), now];
      if (restarts.current.length > 5) { hardStop(); setError(t("Recognition keeps stopping. Press Start to try again.", "توقّف التعرّف مرارًا. اضغط ابدأ للمحاولة من جديد.")); return; }
      setTimeout(() => { if (listeningRef.current && recRef.current === rec) spawn(SR); }, 200);
    };
    recRef.current = rec;
    try { rec.start(); } catch { hardStop(); setError(t("Could not start the microphone.", "تعذّر تشغيل الميكروفون.")); }
  }

  /* ── manual controls ─────────────────────────────────────────── */
  const apply = (s: RevealState) => { committed.current = s; setView(cloneState(s)); };
  const skip = () => apply(skipWord(words, committed.current));
  const manual = () => apply(manualReveal(words, committed.current, mode === "ayah"));
  const togglePeek = (i: number) => setPeeked((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  /* ── derived ─────────────────────────────────────────────────── */
  const sum = summarize(view);
  const checked = sum.total - sum.pending;
  const pct = sum.total ? Math.round((checked / sum.total) * 100) : 0;
  const scorePct = Math.round(sum.score * 100);
  const showResult = !listening && checked > 0;
  const ayahNumbers = useMemo(() => [...new Set(words.map((w) => w.ayah))], [words]);
  const flagged = words.map((w, i) => ({ w, i })).filter(({ i }) => ["wrong", "missed", "close"].includes(view.status[i]));
  const sel = selected !== null ? { w: words[selected], st: view.status[selected], heard: view.heard[selected] } : null;

  const changeFont = (d: number) => setFontSize((f) => { const n = Math.min(56, Math.max(22, f + d)); lsSet(FONT_KEY, String(n)); return n; });
  const toggleStrict = () => setStrict((v) => { lsSet(STRICT_KEY, v ? "0" : "1"); return !v; });
  const toggleVoice = () => setVoice((v) => { lsSet(VOICE_KEY, v ? "0" : "1"); return !v; });
  const toggleVibrate = () => setVibrate((v) => { lsSet(VIB_KEY, v ? "0" : "1"); return !v; });
  const locked = listening;

  return (
    <div dir={dir} className="mx-auto max-w-2xl space-y-4 p-4">
      {/* Header */}
      <div className="rounded-3xl p-5" style={{ background: "linear-gradient(160deg,#052e16,#14532d)" }}>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: "rgba(255,255,255,.14)" }}>
            <Moon size={24} color="#fde68a" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-black text-white">{t("Read & Reveal", "اقرأ وستظهر")}</h1>
            <p className="text-xs" style={{ color: "rgba(255,255,255,.8)" }}>
              {t("Recite from memory — each word appears as you say it", "اقرأ من الحفظ — تظهر كل كلمة عند نطقها")}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase"
            style={{ background: "#fde68a", color: "#422006" }}>
            <Lock size={11} /> {t("Admin", "مشرف")}
          </span>
        </div>
      </div>

      {/* Passage + options */}
      <div className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
        <label className="block text-xs font-bold text-gray-600">{t("Surah", "السورة")}</label>
        <select value={surah} onChange={(e) => setSurah(Number(e.target.value))} disabled={locked}
          className="h-12 w-full rounded-xl border px-3 text-sm font-semibold disabled:opacity-60">
          {surahs.length === 0 && <option value={112}>…</option>}
          {surahs.map((s) => <option key={s.number} value={s.number}>{s.number}. {s.englishName} — {s.name}</option>)}
        </select>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-600">{t("From ayah", "من الآية")}</label>
            <input type="number" inputMode="numeric" min={1} max={total || 1} value={from} disabled={locked}
              onChange={(e) => {
                const v = Math.min(Math.max(1, Number(e.target.value) || 1), total || 1);
                setFrom(v); setTo((x) => Math.min(Math.max(x, v), v + MAX_AYAHS - 1, total || v));
              }}
              className="h-12 w-full rounded-xl border px-3 text-sm font-semibold disabled:opacity-60" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600">{t("To ayah", "إلى الآية")}</label>
            <input type="number" inputMode="numeric" min={from} max={Math.min(total || 1, from + MAX_AYAHS - 1)} value={to} disabled={locked}
              onChange={(e) => setTo(Math.min(Math.max(from, Number(e.target.value) || from), Math.min(total || 1, from + MAX_AYAHS - 1)))}
              className="h-12 w-full rounded-xl border px-3 text-sm font-semibold disabled:opacity-60" />
          </div>
        </div>

        {canBism && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={withBism} disabled={locked} onChange={(e) => setWithBism(e.target.checked)} className="h-4 w-4" />
            {t("I will start with the Bismillah", "سأبدأ بالبسملة")}
          </label>
        )}

        {/* mode */}
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1" role="tablist" aria-label={t("Reveal mode", "نمط الإظهار")}>
          {([["word", "Word by word", "كلمة بكلمة"], ["ayah", "Ayah by ayah", "آية بآية"]] as const).map(([m, en, ar]) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
              className="h-10 rounded-lg text-sm font-bold transition"
              style={mode === m ? { background: G, color: "#fff" } : { color: "#374151" }}>
              {t(en, ar)}
            </button>
          ))}
        </div>

        {/* display options */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1 rounded-xl border px-1">
            <button onClick={() => changeFont(-4)} aria-label={t("Smaller text", "تصغير الخط")} className="grid h-10 w-10 place-items-center text-gray-700"><Minus size={16} /></button>
            <span className="w-10 text-center text-xs font-bold text-gray-600">{fontSize}</span>
            <button onClick={() => changeFont(4)} aria-label={t("Larger text", "تكبير الخط")} className="grid h-10 w-10 place-items-center text-gray-700"><Plus size={16} /></button>
          </div>
          <button onClick={toggleVibrate} aria-pressed={vibrate}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold"
            style={vibrate ? { background: "#ecfdf5", color: G, borderColor: "#a7f3d0" } : { color: "#6b7280" }}>
            <Vibrate size={15} /> {t("Buzz on mistake", "اهتزاز عند الخطأ")}
          </button>
          <button onClick={toggleStrict} aria-pressed={strict}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold"
            style={strict ? { background: "#fef2f2", color: "#991b1b", borderColor: "#fecaca" } : { color: "#6b7280" }}>
            <ShieldAlert size={15} /> {t("Strict mode", "الوضع الصارم")}
          </button>
          <button onClick={toggleVoice} aria-pressed={voice}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold"
            style={voice ? { background: "#ecfdf5", color: G, borderColor: "#a7f3d0" } : { color: "#6b7280" }}>
            <Volume2 size={15} /> {t("Say “خطأ”", "نطق «خطأ»")}
          </button>
          <button onClick={() => setShowAll((v) => !v)}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold text-gray-700">
            {showAll ? <EyeOff size={15} /> : <Eye size={15} />} {showAll ? t("Hide text", "إخفاء النص") : t("Show text", "إظهار النص")}
          </button>
        </div>
      </div>

      {strict && listening && view.blocked && (
        <div className="flex items-center gap-3 rounded-2xl border-2 border-red-400 bg-red-50 p-3" role="alert">
          <div className="text-3xl font-black text-red-700" style={{ fontFamily: "'Amiri',serif" }}>خطأ</div>
          <div className="min-w-0 flex-1 text-sm font-semibold text-red-900">
            {t("Mistake — say this word correctly to continue.", "خطأ — انطق هذه الكلمة صحيحة لتتابع.")}
          </div>
          <button onClick={() => togglePeek(view.cursor)}
            className="h-10 shrink-0 rounded-xl bg-white px-3 text-xs font-bold text-red-800 ring-1 ring-red-300">
            {peeked.has(view.cursor) ? t("Hide", "إخفاء") : t("Show answer", "أظهر")}
          </button>
        </div>
      )}

      {/* Reading surface */}
      <div className="rounded-2xl border p-4 shadow-sm" style={{ background: "#fffdf5", borderColor: "#e7dfb8" }}>
        <div className="mb-3">
          <div className="flex items-center justify-between text-[11px] font-bold text-gray-600">
            <span>{t("Progress", "التقدّم")}</span>
            <span>{checked}/{sum.total} · {pct}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: G }} />
          </div>
        </div>

        {loadingText ? (
          <div className="py-10 text-center"><Loader2 className="mx-auto animate-spin" size={26} color={G} /></div>
        ) : (
          <div dir="rtl" className="space-y-1" style={{ fontFamily: "'Amiri','Noto Naskh Arabic','Traditional Arabic',serif" }}>
            {ayahNumbers.map((an) => {
              const idx = words.map((w, i) => (w.ayah === an ? i : -1)).filter((i) => i >= 0);
              const hideWhole = mode === "ayah" && !showAll && !ayahDone(words, view, an);
              const done = idx.filter((i) => view.status[i] !== "pending").length;
              return (
                <div key={an} className="border-b border-amber-100 py-2 last:border-0">
                  <div className="leading-[2.3]" style={{ fontSize: fontSize }}>
                    {idx.map((i) => {
                      const w = words[i];
                      const st = view.status[i];
                      const isCur = i === view.cursor && listening;
                      const graded = st !== "pending";
                      const open = showAll || peeked.has(i) || (mode === "word" ? graded : !hideWhole && graded);
                      const style: CSSProperties = { transition: "filter .25s, background .25s, color .25s, opacity .25s" };
                      if (graded && open && !showAll) { style.background = WORD[st].bg; style.color = WORD[st].fg; }
                      if (!open) { style.filter = "blur(8px)"; style.opacity = 0.55; }
                      if (peeked.has(i) && !graded) { style.outline = "2px dashed #d97706"; }
                      if (isCur) { style.outline = "2px solid #d4a017"; style.background = "#fff7d6"; }
                      const isBad = i === view.cursor && view.blocked && listening;
                      if (isBad) { style.outline = "3px solid #dc2626"; style.background = "#fee2e2"; }
                      return (
                        <button key={i} data-w={i} type="button"
                          onClick={() => (graded ? setSelected(i === selected ? null : i) : togglePeek(i))}
                          className={`mx-0.5 inline-block rounded-lg px-1.5 align-middle${i === view.cursor && view.blocked && listening ? " animate-pulse" : ""}`}
                          style={style}
                          aria-label={open ? w.text : t("Hidden word", "كلمة مخفية")}>
                          {open ? w.text : isCur && hint ? `${firstLetter(w.text)}…` : w.text}
                        </button>
                      );
                    })}
                    {an > 0 && <span className="mx-1 select-none text-amber-700" style={{ fontSize: fontSize * 0.6 }}>﴿{an}﴾</span>}
                  </div>
                  {mode === "ayah" && !showAll && hideWhole && (
                    <div dir={dir} className="mt-1 text-[11px] font-semibold text-gray-500">
                      {done}/{idx.length} {t("words recited — ayah appears when finished", "كلمات — تظهر الآية عند الانتهاء")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {listening && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 text-xs text-gray-600" aria-live="polite">
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" /></span>
            <span className="shrink-0 font-bold">{t("Hearing:", "أسمع:")}</span>
            <span dir="rtl" className="min-w-0 flex-1 truncate" style={{ fontSize: 15 }}>{live || "…"}</span>
          </div>
        )}
        <p className="mt-2 text-[11px] text-gray-500">
          {t("Tap a hidden word to peek (not graded). Tap a coloured word to see what was heard.",
             "اضغط على كلمة مخفية للنظر إليها (دون تقييم). اضغط على كلمة ملوّنة لرؤية ما سُمع.")}
        </p>
      </div>

      {sel && sel.st !== "pending" && (
        <div className="rounded-xl border p-3 text-sm" style={{ borderColor: WORD[sel.st].bg, background: "#fff" }}>
          <div className="mb-1 font-bold" style={{ color: WORD[sel.st].fg }}>{selected !== null && view.fixed[selected] ? t("Corrected after a mistake", "صُحّحت بعد خطأ") : t(WORD[sel.st].en, WORD[sel.st].ar)}</div>
          <div className="grid grid-cols-2 gap-2" dir="rtl">
            <div><div className="text-[10px] text-gray-500" dir={dir}>{t("Expected", "المطلوب")}</div><div style={{ fontSize: 22 }}>{sel.w.text}</div></div>
            <div><div className="text-[10px] text-gray-500" dir={dir}>{t("Heard", "المسموع")}</div><div style={{ fontSize: 22 }}>{sel.heard ?? "—"}</div></div>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          <AlertCircle size={18} className="mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}
      {!supported && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {t("Live speech recognition isn't supported here (use Chrome on Android/desktop over HTTPS). The manual controls below still let you test the reveal; for the Android app use the Recording Check tab.",
             "التعرّف المباشر غير مدعوم هنا (استخدم Chrome عبر HTTPS). يمكنك تجربة الإظهار يدويًا بالأزرار أدناه، وفي تطبيق الأندرويد استخدم تبويب فحص التسجيل.")}
        </div>
      )}

      {/* Result */}
      {showResult && (
        <div className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs font-bold text-gray-500">{sum.done ? t("Finished", "اكتمل") : t("So far", "حتى الآن")}</div>
              <div className="text-3xl font-black" style={{ color: G }}>{scorePct}%</div>
            </div>
            <div className="text-end text-xs text-gray-600">{sum.ok}/{sum.total} {t("correct", "صحيحة")}</div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["ok", "close", "wrong", "missed"] as const).filter((k) => sum[k] > 0).map((k) => (
              <span key={k} className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: WORD[k].bg, color: WORD[k].fg }}>
                {t(WORD[k].en, WORD[k].ar)} · {sum[k]}
              </span>
            ))}
            {sum.errors > 0 && (
              <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-800">{t("Mistakes", "الأخطاء")} · {sum.errors}</span>
            )}
            {sum.pending > 0 && (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-600">{t("Not reached", "لم يُقرأ")} · {sum.pending}</span>
            )}
          </div>
          {flagged.length > 0 && (
            <div dir="rtl" className="flex flex-wrap gap-2 rounded-xl p-3" style={{ background: "#fafafa" }}>
              {flagged.map(({ w, i }) => (
                <button key={i} onClick={() => setSelected(i)} className="rounded-lg px-2.5 py-1.5"
                  style={{ background: WORD[view.status[i] as keyof typeof WORD].bg, color: WORD[view.status[i] as keyof typeof WORD].fg, fontSize: 20 }}>
                  {w.text}
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-gray-500">
            {t("Based on the browser's general Arabic speech recogniser — a red or amber word may simply have been misheard. It does not judge tajweed or short vowels, so treat flags as a prompt to listen again, not as a verdict.",
               "يعتمد على مُعرِّف الكلام العربي العام في المتصفح — قد تكون الكلمة الحمراء أو الصفراء أُسيء سماعها فقط. لا يحكم على التجويد أو الحركات، فاعتبر التنبيهات دعوة للاستماع مرة أخرى وليست حكمًا.")}
          </p>
        </div>
      )}

      {/* Manual / testing tools */}
      <details className="rounded-2xl border bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-xs font-bold text-gray-600">{t("Testing tools", "أدوات الاختبار")}</summary>
        <p className="mt-2 text-[11px] text-gray-500">
          {t("Manual reveals are for testing the interface only — they do not count as recognised speech.", "الإظهار اليدوي لاختبار الواجهة فقط — ولا يُحتسب كتلاوة.")}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button onClick={manual} disabled={sum.done || !words.length} className="h-11 rounded-xl border text-sm font-bold disabled:opacity-40">
            {mode === "ayah" ? t("Reveal next ayah", "إظهار الآية التالية") : t("Reveal next word", "إظهار الكلمة التالية")}
          </button>
          <button onClick={skip} disabled={sum.done || !words.length} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-bold disabled:opacity-40">
            <SkipForward size={15} /> {t("Skip word", "تخطّي كلمة")}
          </button>
        </div>
      </details>

      {/* Sticky controls */}
      <div className="sticky bottom-2 z-20 rounded-2xl border bg-white/95 p-2 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2">
          {!listening ? (
            <button onClick={begin} disabled={loadingText || !words.length || !supported}
              className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl text-base font-extrabold text-white disabled:opacity-50"
              style={{ background: G }}>
              <Mic size={20} /> {checked > 0 && !sum.done ? t("Continue", "تابع") : t("Start reciting", "ابدأ التلاوة")}
            </button>
          ) : (
            <button onClick={hardStop}
              className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl text-base font-extrabold text-white"
              style={{ background: "#b91c1c" }}>
              <Square size={18} fill="#fff" /> {t("Stop", "إيقاف")} · {fmtTime(seconds)}
            </button>
          )}
          <button onClick={() => setHint(true)} disabled={!listening || sum.done} aria-label={t("Hint", "تلميح")}
            className="grid h-14 w-14 place-items-center rounded-2xl border disabled:opacity-40"><Lightbulb size={20} color="#b45309" /></button>
          <button onClick={resetExercise} aria-label={t("Restart", "إعادة")}
            className="grid h-14 w-14 place-items-center rounded-2xl border"><RotateCcw size={20} /></button>
        </div>
      </div>
    </div>
  );
}
