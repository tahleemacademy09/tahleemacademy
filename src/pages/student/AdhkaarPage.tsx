/*
  src/pages/student/AdhkaarPage.tsx — Tahleem Academy
  ──────────────────────────────────────────────────────────
  Adhkaar as-Sabāḥ wal-Masā' (Morning & Evening Remembrance) plus
  general du'a categories (Daily Life, Worship, Travel, Difficulty,
  Knowledge, Protection) — unified into a single family/dua picker
  dropdown instead of separate Morning/Evening/Dua tabs. Every entry
  now carries its own short title so it's identifiable at a glance.
  Swipeable dhikr cards with a tap-to-count reader, "Listen" (Arabic
  speech synthesis) plus a link to a full reciter audio source, and
  a per-day local progress ring. No backend table required — progress
  resets with the new civil day and is stored client-side only, per
  device.
*/
import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronRight, ChevronDown, ArrowLeft, Sun, Moon, Volume2, VolumeX,
  Check, RotateCcw, Sparkles, BookOpen, HandHeart, ExternalLink, X,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { MORNING_ADHKAAR, EVENING_ADHKAAR, type Dhikr } from "@/data/adhkaarData";
import { DUA_CATEGORIES, DUAS_BY_CATEGORY } from "@/data/duaData";
import { adhkaarAudioUrls, currentWordIndex, ADHKAAR_WORD_TIMINGS, ADHKAAR_LEAD_WORDS } from "@/data/adhkaarAudio";

const G          = "#0f2d1f";   // deep emerald
const G_MID      = "#153a27";
const G_LIGHT     = "#1f5138";
const GOLD       = "#c9a84c";
const GOLD_LIGHT = "#e4c36a";
const CREAM      = "#faf6ee";
const PAPER      = "#fffdf6";   // adhkar card background (cream paper)
const INK        = "#000000";   // Arabic text
const INK_SOFT   = "#2b2618";   // translation / secondary text
const GOLD_DARK  = "#7a5f12";   // gold readable on cream

interface Family {
  id: string;
  label: string;
  labelAr: string;
  icon: typeof Sun;
  list: Dhikr[];
}

// Every family — Morning & Evening adhkaar plus every du'a category —
// unified into one list so they can all live behind a single dropdown.
const FAMILIES: Family[] = [
  { id: "morning", label: "Morning Adhkaar", labelAr: "أذكار الصباح", icon: Sun, list: MORNING_ADHKAAR },
  { id: "evening", label: "Evening Adhkaar", labelAr: "أذكار المساء", icon: Moon, list: EVENING_ADHKAAR },
  ...DUA_CATEGORIES.map(cat => ({
    id: cat.id,
    label: cat.label,
    labelAr: cat.labelAr,
    icon: HandHeart,
    list: DUAS_BY_CATEGORY[cat.id] ?? [],
  })),
];

// Reputable free audio source (Arabic recitation + translation) for the
// full Hisnul Muslim collection — used as an external "full audio" link
// since we don't bundle/host per-dua reciter files in the app itself.
const EXTERNAL_AUDIO_URL = "https://falah.io/en/hisnul-muslim/";

// Characters removed before the phone's voice reads the text (same as before)
const STRIP_RE = /[﴿﴾]/g;

const todayKey = () => new Date().toISOString().slice(0, 10);
const storageKey = (familyId: string) => `tahleem_adhkaar_${familyId}_${todayKey()}`;

function loadProgress(familyId: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(storageKey(familyId));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveProgress(familyId: string, data: Record<string, number>) {
  try { localStorage.setItem(storageKey(familyId), JSON.stringify(data)); } catch {}
}

export default function AdhkaarPage() {
  const navigate = useNavigate();
  const { t, dir } = useLanguage();

  // Default to Evening Adhkaar after Asr-ish hours (15:00–23:59), Morning otherwise.
  const initialFamilyId = useMemo(() => {
    const h = new Date().getHours();
    return h >= 15 || h < 4 ? "evening" : "morning";
  }, []);

  const [familyId, setFamilyId] = useState<string>(initialFamilyId);
  const family = useMemo(() => FAMILIES.find(f => f.id === familyId) ?? FAMILIES[0], [familyId]);
  const list: Dhikr[] = family.list;

  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState<Record<string, number>>(() => loadProgress(initialFamilyId));
  const [direction, setDirection] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeWord, setActiveWord] = useState(-1);   // word being recited (highlight)

  // Stop whatever is playing — recorded audio or the phone's voice
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.onended = null; audioRef.current.onerror = null; audioRef.current.ontimeupdate = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setActiveWord(-1);
  }, []);

  // Picker (dropdown) state — which family is expanded while choosing.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expandedFamilyId, setExpandedFamilyId] = useState<string>(initialFamilyId);

  useEffect(() => {
    setProgress(loadProgress(familyId));
    stopAudio();
  }, [familyId]);

  const current: Dhikr | undefined = list[index];
  const remaining = current ? Math.max(0, current.repeat - (progress[current.id] ?? 0)) : 0;
  const isDone = remaining === 0;
  const completedCount = list.filter(d => (progress[d.id] ?? 0) >= d.repeat).length;
  const allDone = list.length > 0 && completedCount === list.length;

  const bump = useCallback(() => {
    if (!current) return;
    setProgress(prev => {
      const next = { ...prev, [current.id]: Math.min(current.repeat, (prev[current.id] ?? 0) + 1) };
      saveProgress(familyId, next);
      return next;
    });
    if (navigator.vibrate) navigator.vibrate(8);
  }, [current, familyId]);

  const resetCurrent = useCallback(() => {
    if (!current) return;
    setProgress(prev => {
      const next = { ...prev, [current.id]: 0 };
      saveProgress(familyId, next);
      return next;
    });
  }, [current, familyId]);

  const go = (delta: number) => {
    stopAudio();
    setDirection(delta);
    setIndex(i => Math.max(0, Math.min(list.length - 1, i + delta)));
  };

  // Plays the recorded mp3 for this dhikr if one exists (see
  // src/data/adhkaarAudio.ts), highlighting each word as it is recited;
  // otherwise falls back to the phone's built-in Arabic voice.
  const toggleListen = () => {
    if (!current) return;
    if (speaking) { stopAudio(); return; }

    const words = current.arabic.split(/\s+/).filter(Boolean);
    const timings = ADHKAAR_WORD_TIMINGS[current.id];
    let fellBack = false;

    const speakWithVoice = () => {
      if (fellBack) return;
      fellBack = true;
      audioRef.current = null;
      if (!("speechSynthesis" in window)) { setSpeaking(false); return; }
      const spoken = current.arabic.replace(STRIP_RE, "");
      const utter = new SpeechSynthesisUtterance(spoken);
      utter.lang = "ar-SA";
      utter.rate = 0.85;
      const voices = window.speechSynthesis.getVoices();
      const arVoice = voices.find(v => v.lang?.startsWith("ar"));
      if (arVoice) utter.voice = arVoice;
      // Some voices report the position of each word as they speak
      utter.onboundary = (e) => {
        const before = spoken.slice(0, e.charIndex).split(/\s+/).filter(Boolean).length;
        setActiveWord(Math.min(before, words.length - 1));
      };
      utter.onend = () => { setSpeaking(false); setActiveWord(-1); };
      utter.onerror = () => { setSpeaking(false); setActiveWord(-1); };
      utterRef.current = utter;
      window.speechSynthesis.speak(utter);
      setSpeaking(true);
    };

    const urls = adhkaarAudioUrls(current.id);
    const lead = ADHKAAR_LEAD_WORDS[current.id] ?? 0;
    const audio = new Audio();           // one element, reused for each part
    audio.preload = "auto";
    let part = 0;
    const playPart = () => { audio.src = urls[part]; return audio.play(); };
    audioRef.current = audio;
    audio.ontimeupdate = () => {
      // word highlight follows a single file; multi-part lists play without it
      if (urls.length === 1) setActiveWord(currentWordIndex(audio.currentTime, audio.duration, words, timings, lead));
    };
    audio.onended = () => {
      if (part < urls.length - 1) { part++; playPart().catch(speakWithVoice); return; }
      setSpeaking(false); setActiveWord(-1); audioRef.current = null;
    };
    audio.onerror = speakWithVoice;      // offline or no recording → phone voice
    playPart().then(() => { if (!fellBack) setSpeaking(true); }).catch(speakWithVoice);
  };

  useEffect(() => () => { audioRef.current?.pause(); window.speechSynthesis?.cancel(); }, []);

  const openPicker = () => {
    setExpandedFamilyId(familyId);
    setPickerOpen(true);
  };

  const chooseDua = (fId: string, i: number) => {
    stopAudio();
    setDirection(0);
    if (fId !== familyId) setFamilyId(fId);
    setIndex(i);
    setPickerOpen(false);
  };

  const headerTitle = t(family.label, family.labelAr);
  const headerSubtitle = current
    ? t(current.title, current.titleAr)
    : (["morning", "evening"].includes(family.id)
        ? t("Morning & Evening Remembrance", "أذكار الصباح والمساء")
        : t("Supplications", "أدعية"));

  return (
    <div
      dir={dir}
      className="min-h-screen relative overflow-hidden"
      style={{ background: `radial-gradient(120% 100% at 50% -10%, ${G_LIGHT} 0%, ${G_MID} 45%, ${G} 100%)` }}
    >
      {/* Ambient gold geometric texture, matching brand pattern */}
      <div className="absolute inset-0 geometric-pattern opacity-60 pointer-events-none" />
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl pointer-events-none"
           style={{ background: `radial-gradient(circle, ${GOLD}22, transparent 70%)` }} />
      <div className="absolute -bottom-32 -left-20 w-80 h-80 rounded-full blur-3xl pointer-events-none"
           style={{ background: `radial-gradient(circle, ${GOLD}18, transparent 70%)` }} />

      <div className="relative z-10 max-w-lg mx-auto px-4 pt-5 pb-8 flex flex-col min-h-screen">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={() => navigate(-1)}
            className="h-10 w-10 rounded-full flex items-center justify-center transition active:scale-90"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <ArrowLeft className="h-5 w-5" style={{ color: CREAM }} />
          </button>
          <div className="text-center">
            <div className="text-[15px] font-semibold" style={{ color: CREAM, fontFamily: "'Playfair Display', serif" }}>
              {headerTitle}
            </div>
            <div className="text-[11px]" style={{ color: `${GOLD_LIGHT}cc` }}>
              {headerSubtitle}
            </div>
          </div>
          <div className="h-10 w-10 flex items-center justify-center">
            <Sparkles className="h-4 w-4" style={{ color: `${GOLD}88` }} />
          </div>
        </div>

        {/* Family / Dua dropdown — replaces the old Morning/Evening/Dua tabs */}
        <button
          onClick={openPicker}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-2xl mb-4 transition active:scale-[0.99]"
          style={{ background: "rgba(255,255,255,0.07)", border: `1px solid ${GOLD}30` }}
        >
          <span className="flex items-center gap-2 min-w-0">
            <family.icon className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
            <span className="flex flex-col items-start min-w-0 text-left">
              <span className="text-[13px] font-semibold truncate max-w-[220px]" style={{ color: CREAM }}>
                {t(family.label, family.labelAr)}
              </span>
              {current && (
                <span className="text-[11px] truncate max-w-[220px]" style={{ color: `${GOLD_LIGHT}bb` }}>
                  {t(current.title, current.titleAr)}
                </span>
              )}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0" style={{ color: `${CREAM}99` }} />
        </button>

        {list.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center px-8">
            <p className="text-sm" style={{ color: `${CREAM}99` }}>
              {t("No du'as in this category yet.", "لا توجد أدعية في هذا القسم بعد.")}
            </p>
          </div>
        ) : (
        <>
        {/* Progress pager */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => go(-1)}
            disabled={index === 0}
            className="h-9 w-9 rounded-full flex items-center justify-center disabled:opacity-30 transition active:scale-90"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <ChevronLeft className="h-4 w-4" style={{ color: CREAM }} />
          </button>

          <div className="flex flex-col items-center gap-1.5">
            <span className="px-3 py-1 rounded-full text-[12px] font-medium" style={{ background: "rgba(255,255,255,0.08)", color: `${CREAM}dd` }}>
              {index + 1} {t("of", "من")} {list.length}
            </span>
            <div className="flex gap-1 flex-wrap justify-center max-w-[220px]">
              {list.map((d, i) => (
                <span
                  key={d.id}
                  className="h-1 rounded-full transition-all"
                  style={{
                    width: i === index ? 14 : 5,
                    background: (progress[d.id] ?? 0) >= d.repeat ? GOLD : i === index ? `${GOLD}aa` : "rgba(255,255,255,0.18)",
                  }}
                />
              ))}
            </div>
          </div>

          <button
            onClick={() => go(1)}
            disabled={index === list.length - 1}
            className="h-9 w-9 rounded-full flex items-center justify-center disabled:opacity-30 transition active:scale-90"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <ChevronRight className="h-4 w-4" style={{ color: CREAM }} />
          </button>
        </div>

        {/* Card */}
        <div className="flex-1 flex flex-col">
          <AnimatePresence mode="wait" custom={direction}>
            {allDone ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-1 rounded-3xl flex flex-col items-center justify-center text-center px-8 py-16"
                style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${GOLD}33` }}
              >
                <div className="h-16 w-16 rounded-full flex items-center justify-center mb-4" style={{ background: `${GOLD}22` }}>
                  <Check className="h-8 w-8" style={{ color: GOLD }} />
                </div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: CREAM, fontFamily: "'Playfair Display', serif" }}>
                  {familyId === "morning" ? t("Morning adhkaar complete", "تمت أذكار الصباح")
                    : familyId === "evening" ? t("Evening adhkaar complete", "تمت أذكار المساء")
                    : t("Du'as complete", "تمت الأدعية")}
                </h3>
                <p className="text-sm mb-5" style={{ color: `${CREAM}99` }}>
                  {t("May Allah accept it from you and preserve you today.", "تقبّل الله منك وحفظك اليوم.")}
                </p>
                <button
                  onClick={openPicker}
                  className="px-4 py-2 rounded-xl text-[12.5px] font-medium transition active:scale-95"
                  style={{ background: "rgba(255,255,255,0.08)", color: CREAM }}
                >
                  {t("Choose another", "اختر آخر")}
                </button>
              </motion.div>
            ) : current ? (
              <motion.div
                key={current.id}
                custom={direction}
                initial={{ opacity: 0, x: direction >= 0 ? 40 : -40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction >= 0 ? -40 : 40 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                drag="x"
                dragDirectionLock
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.35}
                onDragEnd={(_, info) => {
                  // swipe left → next, swipe right → previous
                  if ((info.offset.x < -60 || info.velocity.x < -500) && index < list.length - 1) go(1);
                  else if ((info.offset.x > 60 || info.velocity.x > 500) && index > 0) go(-1);
                }}
                className="flex-1 rounded-3xl px-6 py-7 flex flex-col"
                style={{
                  touchAction: "pan-y",
                  background: PAPER,
                  border: `1px solid ${GOLD}66`,
                  boxShadow: `0 20px 60px -20px ${G}`,
                }}
              >
                {/* Title */}
                <h3
                  className="text-center text-[15px] font-semibold mb-4"
                  style={{ color: GOLD_DARK, fontFamily: "'Playfair Display', serif" }}
                >
                  {t(current.title, current.titleAr)}
                </h3>

                {/* Repeat / audio chip row */}
                <div className="flex items-center justify-between mb-5 gap-2">
                  <span
                    className="px-3 py-1 rounded-full text-[11px] font-semibold shrink-0"
                    style={{ background: `${GOLD}2e`, color: GOLD_DARK }}
                  >
                    {current.repeat > 1 ? `${t("Read", "اقرأ")} ${current.repeat}×` : t("Read once", "مرة واحدة")}
                  </span>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={toggleListen} className="flex items-center gap-1.5 text-[11px] font-medium transition active:scale-95"
                            style={{ color: INK_SOFT }}>
                      {speaking ? <VolumeX className="h-3.5 w-3.5" style={{ color: GOLD_DARK }} /> : <Volume2 className="h-3.5 w-3.5" />}
                      {speaking ? t("Stop", "إيقاف") : t("Listen", "استماع")}
                    </button>
                    <a
                      href={EXTERNAL_AUDIO_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] font-medium transition active:scale-95"
                      style={{ color: GOLD_DARK }}
                      title={t("Open reciter audio in browser", "افتح تسجيل القارئ في المتصفح")}
                    >
                      <ExternalLink className="h-3 w-3" />
                      {t("Reciter audio", "صوت القارئ")}
                    </a>
                  </div>
                </div>

                {/* Arabic text */}
                <div className="flex-1 flex items-center justify-center py-2">
                  <p
                    dir="rtl"
                    className="text-center leading-[2.1] px-1"
                    style={{ fontFamily: "'Amiri', serif", fontSize: "1.65rem", color: INK }}
                  >
                    {current.arabic.split(/\s+/).filter(Boolean).map((w, i) => (
                      <Fragment key={i}>
                        {i > 0 && " "}
                        <span style={{
                          background: i === activeWord ? `${GOLD}66` : "transparent",
                          borderRadius: 8, padding: "0 3px", transition: "background .15s",
                        }}>{w}</span>
                      </Fragment>
                    ))}
                  </p>
                </div>

                <p className="text-center italic text-[13px] mt-4 mb-3" style={{ color: GOLD_DARK }}>
                  {current.transliteration}
                </p>

                <p className="text-center text-[13.5px] leading-relaxed mb-3" style={{ color: INK_SOFT }}>
                  {current.translation}
                </p>

                {current.virtue && (
                  <div className="rounded-xl px-3 py-2.5 mb-3 flex gap-2" style={{ background: `${GOLD}14` }}>
                    <BookOpen className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: GOLD_DARK }} />
                    <p className="text-[12px] leading-relaxed" style={{ color: INK_SOFT }}>{current.virtue}</p>
                  </div>
                )}

                <p className="text-center text-[11px]" style={{ color: "#6b6350" }}>{current.reference}</p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* Tap-counter / mark-read control */}
        {!allDone && current && (
          <div className="mt-5 flex items-center gap-3">
            {current.repeat > 1 && (progress[current.id] ?? 0) > 0 && !isDone && (
              <button
                onClick={resetCurrent}
                className="h-14 w-14 shrink-0 rounded-2xl flex items-center justify-center transition active:scale-90"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                <RotateCcw className="h-4 w-4" style={{ color: `${CREAM}aa` }} />
              </button>
            )}
            <button
              onClick={() => {
                if (!isDone) bump();
                if (remaining <= 1 && index < list.length - 1) {
                  setTimeout(() => go(1), 350);
                }
              }}
              className="flex-1 h-14 rounded-2xl flex items-center justify-center gap-2 font-semibold text-[15px] transition active:scale-[0.98]"
              style={{
                background: isDone ? `${GOLD}22` : GOLD,
                color: isDone ? GOLD_LIGHT : G,
                border: isDone ? `1px solid ${GOLD}55` : "none",
              }}
            >
              {isDone ? (
                <><Check className="h-4 w-4" /> {t("Completed", "تم")}</>
              ) : current.repeat > 1 ? (
                <>{t("Tap to count", "اضغط للعدّ")} · {remaining} {t("left", "متبقٍ")}</>
              ) : (
                <><Check className="h-4 w-4" /> {t("Mark as read", "وضع علامة كمقروء")}</>
              )}
            </button>
          </div>
        )}

        {/* Session summary footer */}
        <div className="mt-4 text-center text-[11px]" style={{ color: `${CREAM}66` }}>
          <div className="mb-0.5">{t("Swipe left or right to move between adhkaar", "اسحب يمينًا أو يسارًا للتنقل")}</div>
          {completedCount}/{list.length} {t("completed today", "أُنجزت اليوم")}
        </div>
        </>
        )}
      </div>

      {/* Family / Dua picker sheet */}
      <AnimatePresence>
        {pickerOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="absolute inset-0"
              style={{ background: "rgba(0,0,0,0.55)" }}
              onClick={() => setPickerOpen(false)}
            />
            <motion.div
              dir={dir}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="relative w-full max-w-lg rounded-t-3xl overflow-hidden flex flex-col"
              style={{ background: G_MID, maxHeight: "82vh" }}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0" style={{ borderBottom: `1px solid ${GOLD}22` }}>
                <h3 className="text-[15px] font-semibold" style={{ color: CREAM, fontFamily: "'Playfair Display', serif" }}>
                  {t("Choose a dua", "اختر دعاءً")}
                </h3>
                <button
                  onClick={() => setPickerOpen(false)}
                  className="h-8 w-8 rounded-full flex items-center justify-center transition active:scale-90"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                >
                  <X className="h-4 w-4" style={{ color: CREAM }} />
                </button>
              </div>

              <div className="overflow-y-auto px-3 py-3">
                {FAMILIES.map(f => {
                  const isExpanded = expandedFamilyId === f.id;
                  const famDone = f.list.length > 0 && f.list.every(d => (loadProgress(f.id)[d.id] ?? 0) >= d.repeat);
                  return (
                    <div key={f.id} className="mb-1.5 rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <button
                        onClick={() => setExpandedFamilyId(isExpanded ? "" : f.id)}
                        className="w-full flex items-center justify-between gap-2 px-4 py-3 transition active:scale-[0.99]"
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <f.icon className="h-4 w-4 shrink-0" style={{ color: f.id === familyId ? GOLD : `${GOLD}99` }} />
                          <span className="text-[13.5px] font-medium truncate" style={{ color: f.id === familyId ? GOLD_LIGHT : CREAM }}>
                            {t(f.label, f.labelAr)}
                          </span>
                          {famDone && <Check className="h-3.5 w-3.5 shrink-0" style={{ color: GOLD }} />}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px]" style={{ color: `${CREAM}66` }}>{f.list.length}</span>
                          <ChevronDown
                            className="h-3.5 w-3.5 transition-transform"
                            style={{ color: `${CREAM}99`, transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                          />
                        </span>
                      </button>
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="overflow-hidden"
                          >
                            <div className="px-2 pb-2 flex flex-col gap-0.5">
                              {f.list.map((d, i) => {
                                const done = (loadProgress(f.id)[d.id] ?? 0) >= d.repeat;
                                const isCurrent = f.id === familyId && i === index;
                                return (
                                  <button
                                    key={d.id}
                                    onClick={() => chooseDua(f.id, i)}
                                    className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-left transition active:scale-[0.99]"
                                    style={{ background: isCurrent ? `${GOLD}1f` : "transparent" }}
                                  >
                                    <span className="text-[12.5px] truncate" style={{ color: isCurrent ? GOLD_LIGHT : `${CREAM}dd` }}>
                                      {t(d.title, d.titleAr)}
                                    </span>
                                    {done && <Check className="h-3.5 w-3.5 shrink-0" style={{ color: GOLD }} />}
                                  </button>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
