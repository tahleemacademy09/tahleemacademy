// src/components/ramadan/RecitationChecker.tsx
// Admin-only Qur'an recitation checker (Ramadan Programs page).
// Pick surah + ayah range → record → word-by-word result (correct / close / wrong / missed / extra).
// Audio is sent to the `recitation-check` Cloudflare Worker, which verifies the admin role server-side.
import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Square, RotateCcw, Loader2, AlertCircle, Moon, Lock } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import {
  buildExpected, checkRecitation, fetchAyahs, fetchSurahs, wordsFromText,
  type Ayah, type CheckResult, type HeardWord, type SurahInfo, type WordResult, type WordStatus,
} from "@/lib/quranCheck";
import { blobToWav16k } from "@/lib/toWav16k";

const G = "#064E3B";
const ENDPOINT = (import.meta.env.VITE_RECITATION_CHECK_URL as string | undefined) || "";
const MAX_SECONDS = 90;
const MAX_AYAHS = 10;

const STATUS: Record<WordStatus, { bg: string; fg: string; en: string; ar: string }> = {
  ok:     { bg: "#dcfce7", fg: "#14532d", en: "Correct",        ar: "صحيح" },
  check:  { bg: "#fef3c7", fg: "#78350f", en: "Close — review", ar: "قريب — راجع" },
  wrong:  { bg: "#fee2e2", fg: "#7f1d1d", en: "Wrong word",     ar: "كلمة خاطئة" },
  missed: { bg: "#e5e7eb", fg: "#374151", en: "Missed",         ar: "فاتت" },
  extra:  { bg: "#ede9fe", fg: "#4c1d95", en: "Extra word",     ar: "كلمة زائدة" },
};

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function RecitationChecker() {
  const { t, dir } = useLanguage();

  const [surahs, setSurahs] = useState<SurahInfo[]>([]);
  const [surah, setSurah] = useState(1);
  const [ayahs, setAyahs] = useState<Ayah[]>([]);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const [withBism, setWithBism] = useState(false);
  const [loadingText, setLoadingText] = useState(true);

  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [heardText, setHeardText] = useState("");
  const [selected, setSelected] = useState<WordResult | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const info = surahs.find((s) => s.number === surah);
  const total = info?.numberOfAyahs ?? ayahs.length;

  /* ── Quran text ─────────────────────────────────────────────── */
  useEffect(() => {
    fetchSurahs().then(setSurahs).catch(() =>
      setError(t("Could not load the surah list. Check your connection.", "تعذّر تحميل قائمة السور. تحقّق من الاتصال.")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    setLoadingText(true);
    fetchAyahs(surah)
      .then((a) => { if (alive) { setAyahs(a); setFrom(1); setTo(1); setWithBism(surah !== 1 && surah !== 9); } })
      .catch(() => alive && setError(t("Could not load the surah text.", "تعذّر تحميل نص السورة.")))
      .finally(() => alive && setLoadingText(false));
    resetAttempt();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surah]);

  const canBism = surah !== 1 && surah !== 9 && from === 1;
  const expected = useMemo(
    () => (ayahs.length ? buildExpected(ayahs, from, to, canBism && withBism) : ""),
    [ayahs, from, to, withBism, canBism],
  );

  /* ── Recording ──────────────────────────────────────────────── */
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  useEffect(() => { if (recording && seconds >= MAX_SECONDS) stop(); }, [seconds, recording]); // eslint-disable-line

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  useEffect(() => () => { recRef.current?.stream.getTracks().forEach((tr) => tr.stop()); }, []);

  function resetAttempt() {
    setBlob(null); setAudioUrl(null); setResult(null); setHeardText(""); setSelected(null); setSeconds(0); setError(null);
  }

  async function start() {
    resetAttempt();
    try {
      // Plain default constraints — custom capture settings made recognition worse in earlier testing.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const b = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        setBlob(b);
        setAudioUrl(URL.createObjectURL(b));
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch {
      setError(t("Microphone access was denied or is unavailable.", "تعذّر الوصول إلى الميكروفون."));
    }
  }

  function stop() {
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    setRecording(false);
  }

  /* ── Check ──────────────────────────────────────────────────── */
  async function check() {
    if (!blob || !expected) return;
    if (!ENDPOINT) {
      setError(t("Checker is not configured (missing VITE_RECITATION_CHECK_URL).", "المدقّق غير مهيأ (VITE_RECITATION_CHECK_URL مفقود)."));
      return;
    }
    setBusy(true); setError(null); setResult(null); setSelected(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("auth");
      const wav = await blobToWav16k(blob);
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "audio/wav" },
        body: wav,
      });
      if (res.status === 403) throw new Error("forbidden");
      if (res.status === 400) throw new Error("short");
      if (!res.ok) throw new Error("server");
      const data = (await res.json()) as { text?: string; words?: HeardWord[] };
      const heard = data.words?.length ? data.words : wordsFromText(data.text || "");
      setHeardText(data.text || heard.map((w) => w.word).join(" "));
      setResult(checkRecitation(expected, heard));
    } catch (e) {
      const m = (e as Error).message;
      setError(
        m === "forbidden" ? t("This tool is for admins only.", "هذه الأداة للمشرفين فقط.")
        : m === "short" ? t("Recording too short — please recite again.", "التسجيل قصير جدًا — أعد التلاوة.")
        : m === "auth" ? t("Please sign in again.", "يرجى تسجيل الدخول من جديد.")
        : t("Could not check the recitation. Try again.", "تعذّر فحص التلاوة. حاول مرة أخرى."),
      );
    } finally {
      setBusy(false);
    }
  }

  const pct = result ? Math.round(result.score * 100) : 0;

  return (
    <div dir={dir} className="mx-auto max-w-xl space-y-4 p-4">
      {/* Header */}
      <div className="rounded-3xl p-5" style={{ background: "linear-gradient(160deg,#052e16,#14532d)" }}>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ background: "rgba(255,255,255,.14)" }}>
            <Moon size={24} color="#fde68a" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-black text-white">{t("Recitation Checker", "مدقّق التلاوة")}</h1>
            <p className="text-xs" style={{ color: "rgba(255,255,255,.8)" }}>
              {t("Ramadan Programs · word-by-word check", "برامج رمضان · فحص كلمة بكلمة")}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase"
            style={{ background: "#fde68a", color: "#422006" }}>
            <Lock size={11} /> {t("Admin", "مشرف")}
          </span>
        </div>
      </div>

      {/* Passage picker */}
      <div className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
        <label className="block text-xs font-bold text-gray-600">{t("Surah", "السورة")}</label>
        <select value={surah} onChange={(e) => setSurah(Number(e.target.value))} disabled={recording || busy}
          className="h-12 w-full rounded-xl border px-3 text-sm font-semibold">
          {surahs.length === 0 && <option value={1}>…</option>}
          {surahs.map((s) => (
            <option key={s.number} value={s.number}>{s.number}. {s.englishName} — {s.name}</option>
          ))}
        </select>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-600">{t("From ayah", "من الآية")}</label>
            <input type="number" inputMode="numeric" min={1} max={total || 1} value={from} disabled={recording || busy}
              onChange={(e) => {
                const v = Math.min(Math.max(1, Number(e.target.value) || 1), total || 1);
                setFrom(v); if (to < v) setTo(v); if (to > v + MAX_AYAHS - 1) setTo(v + MAX_AYAHS - 1);
                resetAttempt();
              }}
              className="h-12 w-full rounded-xl border px-3 text-sm font-semibold" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600">{t("To ayah", "إلى الآية")}</label>
            <input type="number" inputMode="numeric" min={from} max={Math.min(total || 1, from + MAX_AYAHS - 1)} value={to}
              disabled={recording || busy}
              onChange={(e) => {
                const v = Math.min(Math.max(from, Number(e.target.value) || from), Math.min(total || 1, from + MAX_AYAHS - 1));
                setTo(v); resetAttempt();
              }}
              className="h-12 w-full rounded-xl border px-3 text-sm font-semibold" />
          </div>
        </div>
        <p className="text-[11px] text-gray-500">
          {t(`Up to ${MAX_AYAHS} ayahs per check.`, `حتى ${MAX_AYAHS} آيات في كل فحص.`)}
        </p>

        {canBism && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={withBism} disabled={recording || busy}
              onChange={(e) => { setWithBism(e.target.checked); resetAttempt(); }} className="h-4 w-4" />
            {t("I will start with the Bismillah", "سأبدأ بالبسملة")}
          </label>
        )}

        <div dir="rtl" className="rounded-xl p-4 text-center leading-[2.4]" style={{ background: "#f0fdf4", fontSize: 22, color: "#111" }}>
          {loadingText ? <Loader2 className="mx-auto animate-spin" size={22} color={G} /> : expected}
        </div>
      </div>

      {/* Recorder */}
      <div className="space-y-3 rounded-2xl border bg-white p-4 text-center shadow-sm">
        {!recording ? (
          <button onClick={start} disabled={busy || loadingText || !expected}
            className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-extrabold text-white disabled:opacity-50"
            style={{ background: G }}>
            {blob ? <RotateCcw size={20} /> : <Mic size={20} />}
            {blob ? t("Record again", "سجّل من جديد") : t("Start reciting", "ابدأ التلاوة")}
          </button>
        ) : (
          <button onClick={stop}
            className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-extrabold text-white"
            style={{ background: "#b91c1c" }}>
            <Square size={18} fill="#fff" /> {t("Stop", "إيقاف")} · {fmtTime(seconds)}
          </button>
        )}
        {recording && (
          <p className="text-xs text-gray-500">
            {t(`Recording… max ${MAX_SECONDS}s. Recite the passage above.`, `جارٍ التسجيل… الحد الأقصى ${MAX_SECONDS} ثانية.`)}
          </p>
        )}

        {audioUrl && !recording && (
          <>
            <audio src={audioUrl} controls className="w-full" />
            <button onClick={check} disabled={busy}
              className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-extrabold disabled:opacity-60"
              style={{ background: "#fde68a", color: "#422006" }}>
              {busy ? <><Loader2 size={20} className="animate-spin" /> {t("Checking…", "جارٍ الفحص…")}</> : t("Check recitation", "افحص التلاوة")}
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs font-bold text-gray-500">{t("Words matched", "الكلمات الصحيحة")}</div>
              <div className="text-3xl font-black" style={{ color: G }}>{pct}%</div>
            </div>
            <div className="text-end text-xs text-gray-600">
              {result.counts.ok}/{result.expectedWords} {t("correct", "صحيحة")}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(STATUS) as WordStatus[]).filter((k) => result.counts[k] > 0).map((k) => (
              <span key={k} className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: STATUS[k].bg, color: STATUS[k].fg }}>
                {t(STATUS[k].en, STATUS[k].ar)} · {result.counts[k]}
              </span>
            ))}
          </div>

          <div dir="rtl" className="flex flex-wrap gap-2 rounded-xl p-3" style={{ background: "#fafafa" }}>
            {result.words.map((w) => (
              <button key={w.index} onClick={() => setSelected(w)}
                className="rounded-lg px-2.5 py-1.5"
                style={{
                  background: STATUS[w.status].bg, color: STATUS[w.status].fg, fontSize: 20,
                  outline: selected?.index === w.index ? `2px solid ${G}` : "none",
                  textDecoration: w.status === "missed" ? "line-through" : "none",
                }}>
                {w.expected ?? w.heard}
              </button>
            ))}
          </div>

          {selected && (
            <div className="rounded-xl border p-3 text-sm" style={{ borderColor: STATUS[selected.status].bg }}>
              <div className="mb-1 font-bold" style={{ color: STATUS[selected.status].fg }}>
                {t(STATUS[selected.status].en, STATUS[selected.status].ar)}
              </div>
              <div className="grid grid-cols-2 gap-2" dir="rtl">
                <div><div className="text-[10px] text-gray-500" dir={dir}>{t("Expected", "المطلوب")}</div><div style={{ fontSize: 20 }}>{selected.expected ?? "—"}</div></div>
                <div><div className="text-[10px] text-gray-500" dir={dir}>{t("Heard", "المسموع")}</div><div style={{ fontSize: 20 }}>{selected.heard ?? "—"}</div></div>
              </div>
              {selected.start !== null && (
                <div className="mt-1 text-[11px] text-gray-500">{t("At", "عند")} {selected.start.toFixed(1)}s</div>
              )}
            </div>
          )}

          <details className="text-sm text-gray-700">
            <summary className="cursor-pointer text-xs font-bold text-gray-600">{t("What the model heard", "ما سمعه النموذج")}</summary>
            <p dir="rtl" className="mt-2 rounded-xl bg-gray-50 p-3 leading-loose" style={{ fontSize: 18 }}>{heardText || "—"}</p>
          </details>

          <p className="text-[11px] leading-relaxed text-gray-500">
            {t("Word-level check only — it does not judge tajweed rules or short vowels. Treat amber/red words as a prompt to listen again.",
               "فحص على مستوى الكلمات فقط — لا يحكم على أحكام التجويد أو الحركات. اعتبر الكلمات الصفراء والحمراء تنبيهًا للاستماع مرة أخرى.")}
          </p>
        </div>
      )}
    </div>
  );
}
