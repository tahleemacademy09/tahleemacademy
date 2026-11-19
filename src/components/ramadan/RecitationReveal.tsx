// src/components/ramadan/RecitationReveal.tsx
// Admin-only live "Read & Reveal" test (Ramadan Programs page). Same flow as the Daily Hifdh Revision:
//   Setup (settings)  →  Reading (full-screen printed Mushaf page, Pause / Finish at the bottom)  →  Result page
// • The printed Madinah Mushaf page is shown with the SELECTED verses sharp and every other verse on the page blurred.
// • While reciting, the selected verses are covered and uncovered word by word as each word is heard.
// • Strict mode: a skipped / wrong word buzzes, says "خطأ" and stops the reveal until it is corrected.
// Live recognition = browser Web Speech API (Arabic); matching logic lives in src/lib/revealEngine.ts.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  AlertCircle, ArrowLeft, Lightbulb, Loader2, Lock, Mic, MicOff, Minus, Moon, Pause, Play, Plus, RotateCcw,
  Settings as SettingsIcon, SkipForward, Vibrate, X,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { fetchAyahs, fetchSurahs, normalizeWord, type Ayah, type SurahInfo } from "@/lib/quranCheck";
import { getAyahPage, getPageText } from "@/lib/quranTextApi";
import {
  ayahDone, buildWords, cloneState, feed, firstLetter, initialState, manualReveal, skipWord, stateScore, stripCumulative,
  summarize, tokenize, type RevealState, type RevealStatus, type RevealWord,
} from "@/lib/revealEngine";
import MushafPager, { type RevealProgress } from "./MushafPager";

/* ── palette (same as the Daily Hifdh Revision screen) ───────────────────────────────────────────────────── */
const G0 = "#061409", G1 = "#0f2d1f", G2 = "#1a3d27", G3 = "#276749";
const GOLD = "#c9a84c", WARM = "#faf8f4", BRD = "#e5ddd3", W = "#ffffff";
const PASS = "#16a34a", FAIL = "#dc2626";
const BISMILLAH = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";
const MAX_AYAHS = 40;
const ARABIC = "'Amiri Quran','Amiri','Noto Naskh Arabic',serif";

/* ── settings (saved on this device) ─────────────────────────────────────────────────────────────────────── */
type Mode = "word" | "ayah";
interface Settings {
  surah: number; from: number; to: number; withBism: boolean;
  mode: Mode;
  /** keep the selected verses visible while reciting (instead of covering them) */
  showText: boolean;
  /** use the printed Mushaf page (off = plain text view) */
  printed: boolean;
  strict: boolean; exact: boolean; vibrate: boolean; voice: boolean;
  fontSize: number;
}
const DEFAULTS: Settings = {
  surah: 112, from: 1, to: 4, withBism: true, mode: "word", showText: false, printed: true,
  strict: true, exact: true, vibrate: true, voice: true, fontSize: 32,
};
const SETTINGS_KEY = "ramadan.reveal.settings.v2";
const loadSettings = (): Settings => {
  try {
    const j = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    if (j && typeof j === "object") return { ...DEFAULTS, ...j };
  } catch { /* first run / private mode */ }
  return { ...DEFAULTS };
};
const saveSettings = (s: Settings) => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ } };

/* ── "خطأ": your own recording (public/sounds/khata.mp3) or the device's Arabic voice ───────────────────── */
let khata: HTMLAudioElement | null = null;
let khataBad = false;
let arVoice: SpeechSynthesisVoice | null = null;

/** Call on a user tap: preloads the sound and the Arabic voice so "خطأ" plays with no delay later. */
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

const WORD: Record<Exclude<RevealStatus, "pending">, { bg: string; fg: string; en: string; ar: string }> = {
  ok:     { bg: "#dcfce7", fg: "#14532d", en: "Correct",        ar: "صحيح" },
  close:  { bg: "#fef3c7", fg: "#78350f", en: "Close — review", ar: "قريب — راجع" },
  wrong:  { bg: "#fee2e2", fg: "#7f1d1d", en: "Wrong word",     ar: "كلمة خاطئة" },
  missed: { bg: "#e5e7eb", fg: "#374151", en: "Skipped",        ar: "فاتت" },
};
const fmtTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

/* ═══════════════════════════ small UI pieces ═══════════════════════════ */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ background: W, borderRadius: 16, border: `1px solid ${BRD}`, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", background: `${G1}0d`, borderBottom: `1px solid ${BRD}` }}>
        <p style={{ margin: 0, fontWeight: 800, fontSize: 11, color: G1, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</p>
      </div>
      <div style={{ padding: "6px 14px 12px", display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );
}

function Toggle({ on, onClick, label, hint, disabled }: { on: boolean; onClick: () => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "11px 0", border: "none", background: "transparent",
        borderBottom: "1px solid #f3f4f6", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1, textAlign: "start", fontFamily: "inherit" }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 700, fontSize: 13, color: G1 }}>{label}</span>
        {hint && <span style={{ display: "block", fontSize: 11, color: "#6b7280", lineHeight: 1.45, marginTop: 1 }}>{hint}</span>}
      </span>
      <span style={{ flexShrink: 0, width: 44, height: 26, borderRadius: 99, background: on ? PASS : "#d1d5db", position: "relative", transition: "background .2s" }}>
        <span style={{ position: "absolute", top: 3, insetInlineStart: on ? 21 : 3, width: 20, height: 20, borderRadius: "50%", background: W, boxShadow: "0 1px 3px rgba(0,0,0,.3)", transition: "inset-inline-start .2s" }} />
      </span>
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div role="tablist" style={{ display: "grid", gridTemplateColumns: `repeat(${options.length},1fr)`, gap: 4, padding: 4, borderRadius: 12, background: "#f3f4f6", margin: "10px 0 4px" }}>
      {options.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={value === v} onClick={() => onChange(v)}
          style={{ height: 38, borderRadius: 9, border: "none", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
            background: value === v ? G2 : "transparent", color: value === v ? W : "#374151" }}>
          {label}
        </button>
      ))}
    </div>
  );
}

const fieldStyle: CSSProperties = { height: 46, width: "100%", borderRadius: 12, border: `1px solid ${BRD}`, padding: "0 12px", fontSize: 14, fontWeight: 700, background: W, color: G1, fontFamily: "inherit" };
const labelStyle: CSSProperties = { display: "block", fontSize: 11, fontWeight: 800, color: "#6b7280", margin: "10px 0 4px" };

/* ═══════════════════════════ settings panel (setup screen + in-session sheet) ═══════════════════════════ */

interface PanelProps {
  S: Settings; set: (p: Partial<Settings>) => void;
  surahs: SurahInfo[]; total: number; loading: boolean; wordCount: number;
  showQuran: boolean; canBism: boolean; pickSurah: (n: number) => void;
  onTestAlarm: () => void;
  manual?: { reveal: () => void; skip: () => void; disabled: boolean };
  t: (en: string, ar: string) => string;
}

function SettingsPanel({ S, set, surahs, total, loading, wordCount, showQuran, canBism, pickSurah, onTestAlarm, manual, t }: PanelProps) {
  const maxTo = Math.min(total || 1, S.from + MAX_AYAHS - 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {showQuran && (
        <Section title={t("Quran", "القرآن")}>
          <label style={labelStyle}>{t("Surah", "السورة")}</label>
          <select value={S.surah} onChange={(e) => pickSurah(Number(e.target.value))} style={fieldStyle}>
            {surahs.length === 0 && <option value={S.surah}>…</option>}
            {surahs.map((s) => <option key={s.number} value={s.number}>{s.number}. {s.englishName} — {s.name}</option>)}
          </select>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>{t("From ayah", "من الآية")}</label>
              <input type="number" inputMode="numeric" min={1} max={total || 1} value={S.from} style={fieldStyle}
                onChange={(e) => {
                  const v = Math.min(Math.max(1, Number(e.target.value) || 1), total || 1);
                  set({ from: v, to: Math.min(Math.max(S.to, v), v + MAX_AYAHS - 1, total || v), withBism: v === 1 ? S.withBism : false });
                }} />
            </div>
            <div>
              <label style={labelStyle}>{t("To ayah", "إلى الآية")}</label>
              <input type="number" inputMode="numeric" min={S.from} max={maxTo} value={S.to} style={fieldStyle}
                onChange={(e) => set({ to: Math.min(Math.max(S.from, Number(e.target.value) || S.from), maxTo) })} />
            </div>
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "#6b7280" }}>
            {loading ? t("Loading text…", "جارٍ تحميل النص…") : t(`${wordCount} words · up to ${MAX_AYAHS} ayahs per session`, `${wordCount} كلمة · حتى ${MAX_AYAHS} آية في الجلسة`)}
          </p>
          {canBism && (
            <div style={{ marginTop: 6 }}>
              <Toggle on={S.withBism} onClick={() => set({ withBism: !S.withBism })} label={t("I will start with the Bismillah", "سأبدأ بالبسملة")} />
            </div>
          )}
        </Section>
      )}

      <Section title={t("Reveal", "الإظهار")}>
        <Segmented value={S.mode} onChange={(mode) => set({ mode })}
          options={[["word", t("Word by word", "كلمة بكلمة")], ["ayah", t("Ayah by ayah", "آية بآية")]]} />
        <Toggle on={S.printed} onClick={() => set({ printed: !S.printed })} label={t("Printed Mushaf page", "صفحة المصحف المطبوعة")}
          hint={t("Selected verses sharp, all other verses on the page blurred. Off = plain text view.", "الآيات المختارة واضحة وبقية آيات الصفحة مموّهة. الإيقاف = عرض نصي.")} />
        <Toggle on={S.showText} onClick={() => set({ showText: !S.showText })} label={t("Keep text visible while reciting", "إبقاء النص ظاهرًا أثناء التلاوة")}
          hint={t("Off = the selected verses are covered and appear as you recite them.", "الإيقاف = تُغطّى الآيات المختارة وتظهر أثناء قراءتها.")} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0 0" }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: G1 }}>{t("Text size (text view)", "حجم الخط (العرض النصي)")}</span>
          <span style={{ display: "inline-flex", alignItems: "center", border: `1px solid ${BRD}`, borderRadius: 12 }}>
            <button onClick={() => set({ fontSize: Math.max(22, S.fontSize - 4) })} aria-label="−" style={{ width: 40, height: 38, border: "none", background: "transparent", cursor: "pointer" }}><Minus size={15} /></button>
            <span style={{ width: 34, textAlign: "center", fontSize: 12, fontWeight: 800, color: "#4b5563" }}>{S.fontSize}</span>
            <button onClick={() => set({ fontSize: Math.min(56, S.fontSize + 4) })} aria-label="+" style={{ width: 40, height: 38, border: "none", background: "transparent", cursor: "pointer" }}><Plus size={15} /></button>
          </span>
        </div>
      </Section>

      <Section title={t("Mistakes", "الأخطاء")}>
        <Toggle on={S.strict} onClick={() => set({ strict: !S.strict })} label={t("Strict mode", "الوضع الصارم")}
          hint={t("A skipped or wrong word buzzes, says “خطأ”, and you cannot move on until you say it correctly.", "الكلمة المتروكة أو الخاطئة تهتز وتنطق «خطأ» ولا يمكنك المتابعة حتى تنطقها صحيحة.")} />
        <Toggle on={S.exact} disabled={!S.strict} onClick={() => set({ exact: !S.exact })} label={t("Exact letters", "حروف دقيقة")}
          hint={t("A missing or replaced letter counts as a mistake. Turn off if correct words get flagged.", "الحرف الناقص أو المبدَّل يُعدّ خطأ. أوقفه إذا ظهرت أخطاء على كلمات صحيحة.")} />
        <Toggle on={S.vibrate} onClick={() => set({ vibrate: !S.vibrate })} label={t("Buzz on mistake", "اهتزاز عند الخطأ")} />
        <Toggle on={S.voice} onClick={() => set({ voice: !S.voice })} label={t("Say “خطأ” aloud", "نطق «خطأ» بصوت عالٍ")}
          hint={t("Uses public/sounds/khata.mp3 if you add it, otherwise the phone's Arabic voice.", "يستخدم الملف public/sounds/khata.mp3 إن أضفته، وإلا صوت الهاتف العربي.")} />
        <button onClick={onTestAlarm}
          style={{ marginTop: 10, height: 42, borderRadius: 12, border: `1.5px solid ${BRD}`, background: W, fontWeight: 800, fontSize: 13, color: G1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}>
          <Vibrate size={16} /> {t("Test buzz & voice", "جرّب الاهتزاز والصوت")}
        </button>
      </Section>

      {manual && (
        <Section title={t("Testing tools", "أدوات الاختبار")}>
          <p style={{ margin: "8px 0 8px", fontSize: 11, color: "#6b7280" }}>
            {t("For testing the interface only — manual reveals do not count as recited.", "لاختبار الواجهة فقط — الإظهار اليدوي لا يُحتسب تلاوة.")}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button onClick={manual.reveal} disabled={manual.disabled}
              style={{ height: 42, borderRadius: 12, border: `1.5px solid ${BRD}`, background: W, fontWeight: 800, fontSize: 12, cursor: "pointer", opacity: manual.disabled ? 0.4 : 1, fontFamily: "inherit" }}>
              {S.mode === "ayah" ? t("Reveal next ayah", "إظهار الآية التالية") : t("Reveal next word", "إظهار الكلمة التالية")}
            </button>
            <button onClick={manual.skip} disabled={manual.disabled}
              style={{ height: 42, borderRadius: 12, border: `1.5px solid ${BRD}`, background: W, fontWeight: 800, fontSize: 12, cursor: "pointer", opacity: manual.disabled ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit" }}>
              <SkipForward size={14} /> {t("Skip word", "تخطّي كلمة")}
            </button>
          </div>
        </Section>
      )}
    </div>
  );
}

/* ═══════════════════════════ plain-text reader (fallback / "printed page" off) ═══════════════════════════ */

function TextReader({ words, view, mode, fontSize, started, showAll, hintOn, peeked, onPeek }: {
  words: RevealWord[]; view: RevealState; mode: Mode; fontSize: number; started: boolean; showAll: boolean; hintOn: boolean;
  peeked: Set<number>; onPeek: (i: number) => void;
}) {
  const ayahNumbers = useMemo(() => [...new Set(words.map((w) => w.ayah))], [words]);
  useEffect(() => {
    if (started) document.querySelector(`[data-w="${view.cursor}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [view.cursor, started]);
  return (
    <div style={{ position: "absolute", inset: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "12px 14px 24px", background: "#fffdf5" }}>
      <div dir="rtl" style={{ fontFamily: ARABIC }}>
        {ayahNumbers.map((an) => {
          const idx = words.map((w, i) => (w.ayah === an ? i : -1)).filter((i) => i >= 0);
          const hideWhole = mode === "ayah" && !showAll && started && !ayahDone(words, view, an);
          return (
            <div key={an} style={{ borderBottom: "1px solid #f5e9c4", padding: "6px 0" }}>
              <div style={{ lineHeight: 2.3, fontSize }}>
                {idx.map((i) => {
                  const w = words[i];
                  const st = view.status[i];
                  const graded = st !== "pending";
                  const isCur = started && i === view.cursor;
                  const bad = isCur && view.blocked;
                  const open = showAll || !started || peeked.has(i) || (graded && !hideWhole);
                  const style: CSSProperties = { transition: "filter .25s, background .25s, opacity .25s", border: "none", fontFamily: "inherit", fontSize: "inherit", cursor: "pointer", margin: "0 2px", padding: "0 6px", borderRadius: 8, display: "inline-block", color: "#000", background: "transparent" };
                  if (graded && open && started && !showAll) { style.background = WORD[st as keyof typeof WORD].bg; style.color = WORD[st as keyof typeof WORD].fg; }
                  if (!open) { style.filter = "blur(8px)"; style.opacity = 0.55; }
                  if (peeked.has(i) && !graded) style.outline = "2px dashed #d97706";
                  if (isCur) { style.outline = "2px solid #d4a017"; style.background = "#fff7d6"; }
                  if (bad) { style.outline = "3px solid #dc2626"; style.background = "#fee2e2"; }
                  return (
                    <button key={i} data-w={i} type="button" onClick={() => !graded && onPeek(i)} style={style}>
                      {open ? w.text : isCur && hintOn ? `${firstLetter(w.text)}…` : w.text}
                    </button>
                  );
                })}
                {an > 0 && <span style={{ margin: "0 4px", color: "#b8860b", fontSize: fontSize * 0.6 }}>﴿{an}﴾</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════ main component ═══════════════════════════ */

type Phase = "setup" | "reading" | "result";

export default function RecitationReveal() {
  const { t, dir } = useLanguage();

  /* ── settings ────────────────────────────────────────────────── */
  const [S, setS] = useState<Settings>(loadSettings);
  const set = useCallback((p: Partial<Settings>) => setS((prev) => { const n = { ...prev, ...p }; saveSettings(n); return n; }), []);
  const strictRef = useRef(S.strict); strictRef.current = S.strict;
  const exactRef = useRef(S.exact); exactRef.current = S.exact;
  const vibrateRef = useRef(S.vibrate); vibrateRef.current = S.vibrate;
  const voiceRef = useRef(S.voice); voiceRef.current = S.voice;

  /* ── quran text ──────────────────────────────────────────────── */
  const [surahs, setSurahs] = useState<SurahInfo[]>([]);
  const [ayahs, setAyahs] = useState<Ayah[]>([]);
  const [loadingText, setLoadingText] = useState(true);
  const total = surahs.find((s) => s.number === S.surah)?.numberOfAyahs ?? ayahs.length;
  const surahInfo = surahs.find((s) => s.number === S.surah);
  const canBism = S.surah !== 1 && S.surah !== 9 && S.from === 1;

  const [phase, setPhase] = useState<Phase>("setup");
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const pickSurah = useCallback((n: number) => {
    const info = surahs.find((s) => s.number === n);
    set({ surah: n, from: 1, to: Math.min(info?.numberOfAyahs ?? 4, 4), withBism: n !== 1 && n !== 9 });
  }, [surahs, set]);

  useEffect(() => {
    fetchSurahs().then(setSurahs).catch(() =>
      setError(t("Could not load the surah list. Check your connection.", "تعذّر تحميل قائمة السور. تحقّق من الاتصال.")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    setLoadingText(true);
    fetchAyahs(S.surah)
      .then((a) => { if (alive) setAyahs(a); })
      .catch(() => alive && setError(t("Could not load the surah text.", "تعذّر تحميل نص السورة.")))
      .finally(() => alive && setLoadingText(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S.surah]);

  // keep the range valid once the surah length is known
  useEffect(() => {
    if (!total) return;
    if (S.from > total || S.to > total || S.to < S.from) {
      const from = Math.min(Math.max(1, S.from), total);
      set({ from, to: Math.min(Math.max(from, S.to), total) });
    }
  }, [total, S.from, S.to, set]);

  const words = useMemo(
    () => buildWords(ayahs.filter((a) => a.n >= S.from && a.n <= S.to), canBism && S.withBism ? BISMILLAH : undefined),
    [ayahs, S.from, S.to, S.withBism, canBism],
  );
  const wordsRef = useRef(words); wordsRef.current = words;

  /* ── Mushaf pages that hold the selected verses ──────────────── */
  const [pages, setPages] = useState<number[]>([]);
  const [ayahPage, setAyahPage] = useState<Record<string, number>>({});
  const [loadingPages, setLoadingPages] = useState(false);
  const [mushafFail, setMushafFail] = useState(false);
  const [viewIdx, setViewIdx] = useState(0);

  useEffect(() => {
    if (phase === "setup" || !S.printed || !ayahs.length) return;
    let alive = true;
    setLoadingPages(true);
    (async () => {
      try {
        const [p1, p2] = await Promise.all([getAyahPage(S.surah, S.from), getAyahPage(S.surah, S.to)]);
        const lo = Math.min(p1, p2), hi = Math.max(p1, p2);
        const map: Record<string, number> = {};
        const list: number[] = [];
        for (let p = lo; p <= hi && list.length < 8; p++) {
          const verses = await getPageText(p, false);
          verses.forEach((v) => { map[`${v.surah}:${v.ayah}`] = p; });
          list.push(p);
        }
        if (!alive) return;
        setPages(list); setAyahPage(map); setViewIdx(0); setMushafFail(false);
      } catch {
        if (alive) { setPages([]); setMushafFail(true); }
      } finally {
        if (alive) setLoadingPages(false);
      }
    })();
    return () => { alive = false; };
  }, [phase === "setup", S.printed, ayahs, S.surah, S.from, S.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const blurRange = useMemo(
    () => ({ from: { surah: S.surah, ayah: S.from }, to: { surah: S.surah, ayah: S.to } }),
    [S.surah, S.from, S.to],
  );
  const onUnavailable = useCallback(() => setMushafFail(true), []);

  /* ── session state ───────────────────────────────────────────── */
  const [listening, setListening] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [live, setLive] = useState("");
  const [rawView, setView] = useState<RevealState>(() => initialState(0));
  const [peeked, setPeeked] = useState<Set<number>>(new Set());
  const [hint, setHint] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const supported = useMemo(() => getSR() !== null, []);

  // The reset effect runs after the render in which `words` changes — never read a state of the wrong length.
  const view = useMemo(
    () => (rawView.status.length === words.length ? rawView : initialState(words.length)),
    [rawView, words.length],
  );

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
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hardStop = useCallback(() => {
    listeningRef.current = false;
    const r = recRef.current;
    recRef.current = null;
    if (r) { r.onresult = null; r.onerror = null; r.onend = null; try { r.abort(); } catch { /* noop */ } }
    wake.current?.release().catch(() => undefined); wake.current = null;
    setListening(false);
  }, []);

  const resetExercise = useCallback(() => {
    hardStop();
    if (doneTimer.current) { clearTimeout(doneTimer.current); doneTimer.current = null; }
    committed.current = initialState(wordsRef.current.length);
    processed.current = 0; lastFinal.current = []; flags.current = 0; errBuzzed.current = 0; pendingErr.current = null;
    setView(cloneState(committed.current));
    setPaused(false); setPeeked(new Set()); setHint(false); setShowAnswer(false); setSelected(null); setLive(""); setSeconds(0); setError(null);
  }, [hardStop]);
  useEffect(() => { resetExercise(); }, [words, resetExercise]);

  useEffect(() => {
    if (!listening) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [listening]);

  useEffect(() => { setHint(false); setShowAnswer(false); }, [view.cursor]);
  useEffect(() => () => { hardStop(); if (doneTimer.current) clearTimeout(doneTimer.current); }, [hardStop]);

  // follow the recitation across Mushaf pages
  useEffect(() => {
    if (!pages.length || !(listening || paused)) return;
    const w = words[Math.min(view.cursor, words.length - 1)];
    if (!w) return;
    const pg = ayahPage[`${S.surah}:${w.ayah}`] ?? pages[0];
    const i = pages.indexOf(pg);
    if (i >= 0) setViewIdx(i);
  }, [view.cursor, pages, ayahPage, listening, paused, words, S.surah]);

  /* ── feedback ─────────────────────────────────────────────────── */
  /** strong = a strict-mode mistake: long double buzz + "خطأ"; otherwise a short buzz. */
  const alarm = useCallback((strong: boolean) => {
    if (vibrateRef.current) {
      const pattern = strong ? [0, 500, 120, 500] : [0, 120];
      import("@/lib/ctcNative").then((m) => m.buzz(pattern)).catch(() => { try { navigator.vibrate?.(pattern.slice(1)); } catch { /* noop */ } });
    }
    if (strong && voiceRef.current) speakKhata();
  }, []);
  const testAlarm = useCallback(() => {
    warmKhata();
    if (vibrateRef.current) { import("@/lib/ctcNative").then((m) => m.buzz([0, 500, 120, 500])).catch(() => { try { navigator.vibrate?.([500, 120, 500]); } catch { /* noop */ } }); }
    if (voiceRef.current) speakKhata();
  }, []);

  /* ── recognition ─────────────────────────────────────────────── */
  /** Choose the recogniser alternative that advances the passage best (ar-SA often hears the right word as alt #2). */
  function pickAlt(res: SRResult, base: RevealState, final: boolean) {
    let best: { full: string[]; fresh: string[] } | null = null;
    let bestGain = -Infinity;
    const count = final ? res.length : 1;
    for (let a = 0; a < count; a++) {
      const full = tokenize(res[a].transcript);
      const fresh = stripCumulative(lastFinal.current, full);
      const gain = stateScore(feed(wordsRef.current, cloneState(base), fresh, final, strictRef.current, exactRef.current)) - stateScore(base);
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
      feed(w, c, pick.fresh, true, strictRef.current, exactRef.current);
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
        feed(w, shown, stripCumulative(lastFinal.current, full), false, strictRef.current, exactRef.current);
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
    if (sum.done) {
      hardStop();
      // let the last word appear, then show the result page
      doneTimer.current = setTimeout(() => setPhase("result"), 900);
    }
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
      if (f) { hardStop(); setPaused(true); setError(t(f[0], f[1])); }
    };
    rec.onend = () => {
      if (!listeningRef.current || recRef.current !== rec) return;
      // Chrome ends sessions on silence — restart, but give up if it keeps dying immediately
      const now = Date.now();
      restarts.current = [...restarts.current.filter((x) => now - x < 4000), now];
      if (restarts.current.length > 5) { hardStop(); setPaused(true); setError(t("Recognition keeps stopping. Press Resume to try again.", "توقّف التعرّف مرارًا. اضغط متابعة للمحاولة من جديد.")); return; }
      setTimeout(() => { if (listeningRef.current && recRef.current === rec) spawn(SR); }, 200);
    };
    recRef.current = rec;
    try { rec.start(); } catch { hardStop(); setPaused(true); setError(t("Could not start the microphone.", "تعذّر تشغيل الميكروفون.")); }
  }

  function begin() {
    const SR = getSR();
    if (!SR) { setError(t("Speech recognition is not available in this browser. Use Chrome (HTTPS).", "التعرّف على الصوت غير متاح في هذا المتصفح. استخدم Chrome.")); return; }
    if (!words.length) return;
    setError(null);
    warmKhata();
    listeningRef.current = true; restarts.current = [];
    setListening(true); setPaused(false);
    (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } })
      .wakeLock?.request("screen").then((l) => { wake.current = l; }).catch(() => undefined);
    spawn(SR);
  }
  const pauseRec = () => { hardStop(); setPaused(true); };

  /** Finished — Evaluate: stop listening and move to the result page. */
  function finish() {
    hardStop();
    setPaused(false);
    const checked = view.status.filter((x) => x !== "pending").length;
    if (checked === 0) { setError(t("Nothing has been recited yet.", "لم تُقرأ أي كلمة بعد.")); return; }
    committed.current = cloneState(view);
    setPhase("result");
  }

  /* ── navigation ──────────────────────────────────────────────── */
  const startSession = () => { resetExercise(); setMushafFail(false); setViewIdx(0); setPhase("reading"); };
  const sum = summarize(view);
  const checked = sum.total - sum.pending;
  const started = listening || paused || checked > 0;
  const leave = () => {
    if (started && !sum.done && !window.confirm(t("Leave this session? Your progress will be lost.", "مغادرة الجلسة؟ سيضيع تقدّمك."))) return;
    resetExercise(); setShowSettings(false); setPhase("setup");
  };

  const apply = (s: RevealState) => { committed.current = s; setView(cloneState(s)); };
  const manual = { reveal: () => apply(manualReveal(words, committed.current, S.mode === "ayah")), skip: () => apply(skipWord(words, committed.current)), disabled: sum.done || !words.length };
  const togglePeek = (i: number) => setPeeked((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  /* ── what the printed page uncovers ──────────────────────────── */
  const progress = useMemo<RevealProgress>(() => {
    const agg = new Map<number, { m: number; n: number; lm: number; ln: number }>();
    words.forEach((w, i) => {
      if (w.ayah === 0) return;
      const a = agg.get(w.ayah) ?? { m: 0, n: 0, lm: 0, ln: 0 };
      const L = normalizeWord(w.text).length || 1;
      a.n++; a.ln += L;
      if (view.status[i] !== "pending") { a.m++; a.lm += L; }
      agg.set(w.ayah, a);
    });
    const out: RevealProgress = {};
    agg.forEach((a, ay) => {
      if (a.m === 0) return;
      if (S.mode === "ayah" && a.m < a.n) return;   // ayah by ayah: uncover only when the whole ayah has been recited
      out[`${S.surah}:${ay}`] = { m: a.m, n: a.n, f: a.lm / a.ln };
    });
    return out;
  }, [words, view, S.mode, S.surah]);

  const useText = !S.printed || mushafFail;
  const scorePct = Math.round(sum.score * 100);
  const title = `${surahInfo?.englishName ?? `${t("Surah", "سورة")} ${S.surah}`} · ${S.from}${S.to !== S.from ? `–${S.to}` : ""}`;
  const pagesLabel = pages.length ? (pages.length > 1 ? `${pages[0]}–${pages[pages.length - 1]}` : String(pages[0])) : "";
  const panelProps: PanelProps = { S, set, surahs, total, loading: loadingText, wordCount: words.length, showQuran: true, canBism, pickSurah, onTestAlarm: testAlarm, t };
  const cur = words[Math.min(view.cursor, words.length - 1)];
  const mistakes = S.strict ? view.errors : sum.wrong + sum.missed;
  const flagged = words.map((w, i) => ({ w, i })).filter(({ i }) => ["wrong", "missed", "close"].includes(view.status[i]));
  const sel = selected !== null ? { w: words[selected], st: view.status[selected], heard: view.heard[selected], fixed: view.fixed[selected] } : null;

  /* ═════════════════════════ SETUP ═════════════════════════ */
  if (phase === "setup") {
    return (
      <div dir={dir} className="mx-auto max-w-2xl space-y-4 p-4 pb-8">
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

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            <AlertCircle size={18} className="mt-0.5 shrink-0" /> <span>{error}</span>
          </div>
        )}
        {!supported && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {t("Live speech recognition isn't supported here (use Chrome on Android/desktop over HTTPS). You can still open the session and test the reveal with the manual tools; in the Android app use the Recording Check tab.",
               "التعرّف المباشر غير مدعوم هنا (استخدم Chrome عبر HTTPS). يمكنك فتح الجلسة وتجربة الإظهار بالأدوات اليدوية، وفي تطبيق الأندرويد استخدم تبويب فحص التسجيل.")}
          </div>
        )}

        <SettingsPanel {...panelProps} />

        <button onClick={startSession} disabled={loadingText || !words.length}
          style={{ width: "100%", padding: 16, borderRadius: 14, border: "none", cursor: loadingText || !words.length ? "wait" : "pointer", opacity: loadingText || !words.length ? 0.55 : 1,
            background: `linear-gradient(135deg,${G2},${G3})`, color: W, fontWeight: 900, fontSize: 15, boxShadow: `0 4px 16px ${G1}55`, fontFamily: "inherit" }}>
          {loadingText ? t("Loading…", "جارٍ التحميل…") : t("Begin session →", "ابدأ الجلسة ←")}
        </button>
      </div>
    );
  }

  /* ═════════════════════════ full-screen overlay (reading / result) ═════════════════════════ */
  const header = (titleText: string, sub: string, right?: ReactNode) => (
    <div style={{ background: `linear-gradient(160deg,${G1},${G2})`, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
      <button onClick={phase === "result" ? () => { resetExercise(); setPhase("setup"); } : leave} aria-label={t("Back", "رجوع")}
        style={{ width: 38, height: 38, borderRadius: 12, border: "none", background: "rgba(255,255,255,.14)", color: W, display: "grid", placeItems: "center", cursor: "pointer" }}>
        <ArrowLeft size={18} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 800, fontSize: 14, color: W, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{titleText}</p>
        <p style={{ margin: 0, fontSize: 10, color: `${GOLD}dd` }}>{sub}</p>
      </div>
      {right}
    </div>
  );

  return (
    <div dir={dir} style={{ position: "fixed", inset: 0, zIndex: 200, background: WARM, display: "flex", flexDirection: "column", fontFamily: "'Cairo',sans-serif" }}>
      <style>{`
        @keyframes rrPulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes rrSlide { from{transform:translateY(8px);opacity:0} to{transform:none;opacity:1} }
        @keyframes rrShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }
      `}</style>

      {/* ════════ READING ════════ */}
      {phase === "reading" && (
        <>
          {header(title, `${pagesLabel ? `${t("Page", "صفحة")} ${pagesLabel} · ` : ""}${words.length} ${t("words", "كلمة")}${S.strict ? ` · ${t("Strict", "صارم")}` : ""}`,
            <button onClick={() => setShowSettings(true)} aria-label={t("Settings", "الإعدادات")}
              style={{ width: 38, height: 38, borderRadius: 12, border: "none", background: "rgba(255,255,255,.14)", color: W, display: "grid", placeItems: "center", cursor: "pointer" }}>
              <SettingsIcon size={18} />
            </button>)}

          {/* live info row */}
          {started && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", flexShrink: 0, background: W, borderBottom: `1px solid ${BRD}` }}>
              <span style={{ padding: "4px 12px", borderRadius: 20, background: `${PASS}18`, border: `1px solid ${PASS}50`, fontSize: 13, fontWeight: 900, color: PASS, fontVariantNumeric: "tabular-nums" }}>
                {paused ? "⏸" : "🔴"} {fmtTime(seconds)}
              </span>
              {mistakes > 0 && (
                <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 800, background: "#FEE2E2", color: "#B91C1C", border: "1px solid #FCA5A5" }}>
                  ⚠ {mistakes} {mistakes === 1 ? t("mistake", "خطأ") : t("mistakes", "أخطاء")}
                </span>
              )}
              <span dir="rtl" style={{ flex: 1, minWidth: 0, textAlign: "end", fontSize: 13, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: ARABIC }}>
                {hint && cur ? `${firstLetter(cur.text)}…` : live}
              </span>
              <button onClick={() => setHint(true)} disabled={!listening || sum.done} aria-label={t("Hint", "تلميح")}
                style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 10, border: `1px solid ${BRD}`, background: W, display: "grid", placeItems: "center", opacity: !listening ? 0.4 : 1, cursor: "pointer" }}>
                <Lightbulb size={17} color="#b45309" />
              </button>
            </div>
          )}

          {/* strict-mode mistake banner */}
          {S.strict && view.blocked && (listening || paused) && (
            <div role="alert" style={{ margin: "8px 14px 0", flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 14, background: "#FEF2F2", border: "2px solid #F87171", animation: "rrShake .35s" }}>
              <span style={{ fontFamily: "'Amiri',serif", fontWeight: 900, fontSize: 30, color: "#B91C1C", lineHeight: 1 }}>خطأ</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: "#7F1D1D", lineHeight: 1.4 }}>
                {showAnswer && cur
                  ? <span dir="rtl" style={{ fontFamily: ARABIC, fontSize: 24, color: G1 }}>{cur.text}</span>
                  : t("Say this word correctly to continue.", "انطق هذه الكلمة صحيحة لتتابع.")}
              </span>
              <button onClick={() => setShowAnswer((v) => !v)}
                style={{ flexShrink: 0, height: 38, padding: "0 12px", borderRadius: 10, border: "1px solid #FCA5A5", background: W, color: "#991B1B", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                {showAnswer ? t("Hide", "إخفاء") : t("Show answer", "أظهر")}
              </button>
            </div>
          )}
          {error && (
            <div role="alert" style={{ margin: "8px 14px 0", flexShrink: 0, display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: 12, background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B", fontSize: 12, fontWeight: 600 }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> <span>{error}</span>
            </div>
          )}

          {/* the page */}
          <div style={{ flex: 1, minHeight: 0, position: "relative", background: "#fff", marginTop: 8 }}>
            {useText ? (
              <TextReader words={words} view={view} mode={S.mode} fontSize={S.fontSize} started={started} showAll={S.showText}
                hintOn={hint} peeked={peeked} onPeek={togglePeek} />
            ) : loadingPages || !pages.length ? (
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                <Loader2 size={30} color={GOLD} className="animate-spin" />
              </div>
            ) : (
              <MushafPager key={pages.join(",")} pages={pages} viewIdx={viewIdx} onView={setViewIdx}
                coverUnrevealed={started && !S.showText} revealProgress={progress} blurRange={blurRange} onUnavailable={onUnavailable} />
            )}
          </div>

          {/* fixed bottom controls — same place as the Daily Hifdh Revision */}
          <div style={{ padding: "12px 16px", paddingBottom: "max(12px, env(safe-area-inset-bottom))", background: W, borderTop: `1px solid ${BRD}`, flexShrink: 0 }}>
            {!started && !supported && (
              <p style={{ margin: "0 0 8px", fontSize: 11, color: "#B45309", textAlign: "center" }}>
                {t("Live recognition isn't available in this browser — use Chrome over HTTPS.", "التعرّف المباشر غير متاح في هذا المتصفح — استخدم Chrome عبر HTTPS.")}
              </p>
            )}
            {!started && (
              <p style={{ margin: "0 0 8px", fontSize: 11, color: "#6b7280", textAlign: "center" }}>
                {t("Read the highlighted verses, then tap Start Reciting and recite from memory.", "اقرأ الآيات الواضحة ثم اضغط ابدأ التلاوة وسمّع من الحفظ.")}
              </p>
            )}
            {!listening && !paused && checked === 0 ? (
              <button onClick={begin} disabled={!words.length || (!useText && (loadingPages || !pages.length))}
                style={{ width: "100%", padding: 15, borderRadius: 14, border: "none", cursor: "pointer", background: `linear-gradient(135deg,${G2},${G3})`, color: W, fontWeight: 900, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit", opacity: !words.length || (!useText && (loadingPages || !pages.length)) ? 0.55 : 1 }}>
                <Mic size={17} /> {t("Start Reciting", "ابدأ التلاوة")}
              </button>
            ) : (
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={listening ? pauseRec : begin} disabled={sum.done}
                  style={{ flexShrink: 0, minWidth: 112, padding: "15px 16px", borderRadius: 14, cursor: "pointer", border: `1.5px solid ${listening ? BRD : PASS}`,
                    background: listening ? W : `linear-gradient(135deg,${G2},${G3})`, color: listening ? G1 : W, fontWeight: 900, fontSize: 14,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}>
                  {listening ? <><Pause size={17} /> {t("Pause", "إيقاف مؤقت")}</> : <><Play size={17} /> {t("Resume", "متابعة")}</>}
                </button>
                <button onClick={finish}
                  style={{ flex: 1, padding: 15, borderRadius: 14, border: "none", cursor: "pointer", background: FAIL, color: W, fontWeight: 900, fontSize: 14,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}>
                  <MicOff size={17} /> {t("Finished — Evaluate", "انتهيت — قيّم")}
                </button>
              </div>
            )}
          </div>

          {/* in-session settings sheet */}
          {showSettings && (
            <div style={{ position: "absolute", inset: 0, zIndex: 20, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "flex-end" }} onClick={() => setShowSettings(false)}>
              <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxHeight: "86%", overflowY: "auto", background: WARM, borderRadius: "20px 20px 0 0", padding: 14, animation: "rrSlide .25s ease" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <p style={{ margin: 0, fontWeight: 900, fontSize: 15, color: G1 }}>{t("Settings", "الإعدادات")}</p>
                  <button onClick={() => setShowSettings(false)} aria-label={t("Close", "إغلاق")}
                    style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${BRD}`, background: W, display: "grid", placeItems: "center", cursor: "pointer" }}><X size={16} /></button>
                </div>
                <SettingsPanel {...panelProps} showQuran={false} manual={manual} />
                <p style={{ margin: "10px 0 0", fontSize: 11, color: "#6b7280" }}>
                  {t("To change the surah or ayahs, go back to the setup screen.", "لتغيير السورة أو الآيات ارجع إلى شاشة الإعداد.")}
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════ RESULT ════════ */}
      {phase === "result" && (
        <>
          {header(t("Result", "النتيجة"), title)}
          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            {/* score */}
            <div style={{ textAlign: "center", padding: "8px 0 2px" }}>
              <div style={{ width: 132, height: 132, borderRadius: "50%", margin: "0 auto", display: "grid", placeItems: "center",
                background: `conic-gradient(${scorePct >= 70 ? PASS : scorePct >= 40 ? "#d97706" : FAIL} ${scorePct * 3.6}deg, #e5e7eb 0deg)` }}>
                <div style={{ width: 108, height: 108, borderRadius: "50%", background: W, display: "grid", placeItems: "center" }}>
                  <span style={{ fontWeight: 900, fontSize: 32, color: G1 }}>{scorePct}%</span>
                </div>
              </div>
              <p style={{ margin: "10px 0 0", fontWeight: 800, fontSize: 16, color: sum.done ? PASS : "#92400E" }}>
                {sum.done ? t("ممتاز! You finished the passage", "ممتاز! أتممت المقطع") : t("Stopped before the end", "توقّفت قبل النهاية")}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>
                {sum.ok} / {sum.total} {t("words correct", "كلمة صحيحة")} · {fmtTime(seconds)}
              </p>
            </div>

            {/* chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
              {(["ok", "close", "wrong", "missed"] as const).filter((k) => sum[k] > 0).map((k) => (
                <span key={k} style={{ padding: "5px 12px", borderRadius: 99, fontSize: 11, fontWeight: 800, background: WORD[k].bg, color: WORD[k].fg }}>
                  {t(WORD[k].en, WORD[k].ar)} · {sum[k]}
                </span>
              ))}
              {sum.fixed > 0 && <span style={{ padding: "5px 12px", borderRadius: 99, fontSize: 11, fontWeight: 800, background: "#e0f2fe", color: "#075985" }}>{t("Corrected", "صُحّحت")} · {sum.fixed}</span>}
              {sum.errors > 0 && <span style={{ padding: "5px 12px", borderRadius: 99, fontSize: 11, fontWeight: 800, background: "#fee2e2", color: "#991b1b" }}>{t("Mistakes", "الأخطاء")} · {sum.errors}</span>}
              {sum.pending > 0 && <span style={{ padding: "5px 12px", borderRadius: 99, fontSize: 11, fontWeight: 800, background: "#f3f4f6", color: "#4b5563" }}>{t("Not reached", "لم يُقرأ")} · {sum.pending}</span>}
            </div>

            {/* full review */}
            <div style={{ background: W, borderRadius: 14, border: `1.5px solid #E5E7EB`, padding: "12px 14px" }}>
              <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 800, color: G1 }}>📖 {t("Full review — tap a word", "المراجعة الكاملة — اضغط على كلمة")}</p>
              <div dir="rtl" style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {words.map((w, i) => {
                  const st = view.status[i];
                  const c = st === "pending" ? { bg: "#f3f4f6", fg: "#9ca3af" } : WORD[st];
                  return (
                    <button key={i} onClick={() => setSelected(i === selected ? null : i)}
                      style={{ padding: "4px 10px", borderRadius: 8, border: selected === i ? `2px solid ${G1}` : "2px solid transparent", fontSize: 17, fontFamily: ARABIC, background: c.bg, color: c.fg, cursor: "pointer" }}>
                      {w.text}
                    </button>
                  );
                })}
              </div>
              {sel && (
                <div style={{ marginTop: 12, borderRadius: 12, border: `1px solid ${sel.st === "pending" ? "#e5e7eb" : WORD[sel.st].bg}`, padding: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6, color: sel.st === "pending" ? "#6b7280" : WORD[sel.st].fg }}>
                    {sel.st === "pending" ? t("Not reached", "لم يُقرأ") : sel.fixed ? t("Corrected after a mistake", "صُحّحت بعد خطأ") : t(WORD[sel.st].en, WORD[sel.st].ar)}
                  </div>
                  <div dir="rtl" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div><div dir={dir} style={{ fontSize: 10, color: "#6b7280" }}>{t("Expected", "المطلوب")}</div><div style={{ fontFamily: ARABIC, fontSize: 24 }}>{sel.w.text}</div></div>
                    <div><div dir={dir} style={{ fontSize: 10, color: "#6b7280" }}>{t("Heard", "المسموع")}</div><div style={{ fontFamily: ARABIC, fontSize: 24 }}>{sel.heard ?? "—"}</div></div>
                  </div>
                </div>
              )}
              <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 10, color: "#6b7280", flexWrap: "wrap" }}>
                <span>🟢 {t("Correct", "صحيح")}: {sum.ok}</span>
                <span>🟡 {t("Close / corrected", "قريب / مُصحَّح")}: {sum.close}</span>
                <span>🔴 {t("Needs attention", "يحتاج مراجعة")}: {sum.wrong + sum.missed}</span>
              </div>
            </div>

            {flagged.length === 0 && sum.done && (
              <div style={{ padding: 14, borderRadius: 14, background: `${PASS}12`, border: `1.5px solid ${PASS}44`, color: "#14532d", fontSize: 13, fontWeight: 700, textAlign: "center" }}>
                {t("No mistakes found — well done! 🌟", "لا أخطاء — أحسنت! 🌟")}
              </div>
            )}

            <p style={{ margin: 0, fontSize: 11, lineHeight: 1.6, color: "#6b7280" }}>
              {t("Based on the browser's general Arabic speech recogniser — a flagged word may simply have been misheard. It does not judge tajweed or short vowels, so treat flags as a prompt to listen again, not as a verdict.",
                 "يعتمد على مُعرِّف الكلام العربي العام في المتصفح — قد تكون الكلمة المُعلَّمة أُسيء سماعها فقط. لا يحكم على التجويد أو الحركات، فاعتبر التنبيهات دعوة للاستماع مرة أخرى وليست حكمًا.")}
            </p>

            <button onClick={() => { resetExercise(); setPhase("reading"); }}
              style={{ padding: 15, borderRadius: 14, border: "none", cursor: "pointer", background: `linear-gradient(135deg,${G2},${G3})`, color: W, fontWeight: 900, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}>
              <RotateCcw size={17} /> {t("Recite again", "أعد التلاوة")}
            </button>
            <button onClick={() => { resetExercise(); setPhase("setup"); }}
              style={{ padding: 14, borderRadius: 14, border: `1.5px solid ${BRD}`, cursor: "pointer", background: W, color: G1, fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}>
              <SettingsIcon size={16} /> {t("Change settings / passage", "تغيير الإعدادات / المقطع")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
