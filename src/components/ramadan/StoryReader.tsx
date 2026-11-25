import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BookOpen, Check, ChevronLeft, ChevronRight, Flame, GraduationCap, HeartHandshake, Moon, ScrollText, Sparkles, X, Zap,
} from "lucide-react";
import { CHAPTERS, DAYS, RAMADAN_YEAR, dayCount, dayDone, type Bi, type JourneyDay, type TaskCat } from "@/lib/ramadanJourney";
import { hasStory, landmarkOf, questionCount, shuffledIndices, storyFor, type LearnKind, type Scene } from "@/lib/ramadanStory";
import { Burst, GOLD, GOLD_D, GREEN, NIGHT, SceneArt, Told, buzz } from "./JourneyArt";

/* ════════════════════════════════════════════════════════════════════════════════════════════
   StoryReader — a day of the Ramadan Journey, told as a story.
   The student walks through scenes (story → Qur'an / hadith card → question → dhikr → niyyah …) and
   the last scene is the day's real-life deeds. Finishing the scenes ticks the day's story task for them.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

type T = (en: string, ar: string) => string;

const CAT: Record<TaskCat, { icon: typeof BookOpen; color: string; label: Bi }> = {
  quran:     { icon: BookOpen,       color: "#34d399", label: { en: "Qur'an",        ar: "القرآن" } },
  salah:     { icon: Moon,           color: "#a78bfa", label: { en: "Salah & dhikr", ar: "الصلاة والذكر" } },
  charity:   { icon: HeartHandshake, color: "#fb7185", label: { en: "Charity",       ar: "الإحسان" } },
  knowledge: { icon: GraduationCap,  color: "#60a5fa", label: { en: "Knowledge",     ar: "العلم" } },
};
const KIND: Record<LearnKind, { icon: typeof BookOpen; label: Bi }> = {
  ayah:   { icon: BookOpen,   label: { en: "From the Qur'an", ar: "من القرآن الكريم" } },
  hadith: { icon: ScrollText, label: { en: "From the Sunnah", ar: "من السنّة النبوية" } },
  dua:    { icon: Sparkles,   label: { en: "A du'a to learn", ar: "دعاء تتعلمه" } },
};
const ARABIC_FONT = "'Amiri','Noto Naskh Arabic','Cairo',serif";

const readLS = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const writeLS = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

interface SceneProps { t: T; preSolved: boolean; onSolved: (firstTry: boolean) => void; }

/* ── learn: Arabic first, tap to reveal the meaning ── */
function LearnScene({ s, t, preSolved, onSolved }: SceneProps & { s: Extract<Scene, { type: "learn" }> }) {
  const [open, setOpen] = useState(preSolved);
  const K = KIND[s.kind];
  const reveal = () => { if (open) return; setOpen(true); buzz(10); onSolved(true); };
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-xs font-bold" style={{ color: "#a7f3d0" }}>
        <K.icon size={14} /> {t(K.label.en, K.label.ar)}
      </p>
      <motion.div onClick={reveal} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && reveal()}
        whileTap={open ? undefined : { scale: 0.985 }}
        className="relative overflow-hidden rounded-3xl px-5 pb-5 pt-6"
        style={{ background: "linear-gradient(170deg,#fbf3dc,#f0e0b4)", color: "#3b2a12", border: `2px solid ${GOLD}`, boxShadow: "0 10px 30px rgba(0,0,0,.35), inset 0 0 40px rgba(180,83,9,.12)", cursor: open ? "default" : "pointer" }}>
        <h3 className="text-center text-base font-extrabold" style={{ color: "#7c4a12" }}>{t(s.title.en, s.title.ar)}</h3>
        <div className="mx-auto my-3 h-px w-24" style={{ background: "linear-gradient(90deg,transparent,#b45309,transparent)" }} />
        <p dir="rtl" lang="ar" className="text-center" style={{ fontFamily: ARABIC_FONT, fontSize: 27, lineHeight: 2.15, fontWeight: 700 }}>
          {s.kind === "ayah" ? "﴿" : "«"}{s.arabic}{s.kind === "ayah" ? "﴾" : "»"}
        </p>
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div key="m" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
              <div className="mx-auto my-3 h-px w-24" style={{ background: "linear-gradient(90deg,transparent,#b45309,transparent)" }} />
              <p className="text-center text-[15px] leading-relaxed" style={{ color: "#4a3515", fontFamily: "Georgia,'Times New Roman',serif" }}>{t(s.meaning.en, s.meaning.ar)}</p>
              {s.note && <p className="mt-3 rounded-xl px-3 py-2 text-center text-[13px] font-semibold leading-snug" style={{ background: "rgba(180,83,9,.12)", color: "#7c4a12" }}>{t(s.note.en, s.note.ar)}</p>}
              <p className="mt-3 flex flex-wrap items-center justify-center gap-2 text-center text-[11px] font-bold" style={{ color: "#7c4a12" }}>
                <span>{s.source}</span>
                {s.grade && <span className="rounded-full px-2 py-0.5" style={{ background: "#b45309", color: "#fff7d6" }}>{s.grade}</span>}
              </p>
            </motion.div>
          ) : (
            <motion.p key="h" exit={{ opacity: 0 }} className="mt-4 text-center text-xs font-extrabold" style={{ color: "#b45309" }}>
              {t("Tap the scroll to reveal its meaning", "المس اللفافة لتعرف معناها")}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/* ── quiz ── */
function QuizScene({ s, t, preSolved, onSolved }: SceneProps & { s: Extract<Scene, { type: "quiz" }> }) {
  const rightIdx = s.options.findIndex((o) => o.right);
  const [picked, setPicked] = useState<number | null>(preSolved ? rightIdx : null);
  const [wrong, setWrong] = useState<Record<number, number>>({});
  const solved = picked !== null;
  const firstTry = Object.keys(wrong).length === 0;
  const pick = (i: number) => {
    if (solved) return;
    if (s.options[i].right) { setPicked(i); buzz(18); onSolved(firstTry); }
    else { setWrong((w) => ({ ...w, [i]: (w[i] ?? 0) + 1 })); buzz(30); }
  };
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-xs font-bold" style={{ color: "#93c5fd" }}><Zap size={14} /> {t("Test yourself", "اختبر نفسك")}</p>
      <h3 className="text-xl font-black leading-snug">{t(s.q.en, s.q.ar)}</h3>
      <ul className="mt-4 space-y-2.5">
        {s.options.map((o, i) => {
          const isRight = solved && i === picked;
          const isWrong = !!wrong[i];
          return (
            <li key={`${i}-${wrong[i] ?? 0}`}>
              <motion.button onClick={() => pick(i)} disabled={solved && !isRight} whileTap={solved ? undefined : { scale: 0.98 }}
                animate={isWrong && !solved ? { x: [0, -9, 9, -6, 6, 0] } : { x: 0 }} transition={{ duration: 0.35 }}
                className="flex w-full items-center gap-3 rounded-2xl p-3.5 text-start"
                style={{ background: isRight ? "rgba(16,185,129,.22)" : isWrong ? "rgba(244,63,94,.14)" : "rgba(255,255,255,.07)", border: `1.5px solid ${isRight ? GREEN : isWrong ? "#fb7185" : "rgba(255,255,255,.16)"}`, opacity: solved && !isRight ? 0.45 : 1 }}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black"
                  style={{ background: isRight ? GREEN : isWrong ? "#fb7185" : "rgba(255,255,255,.12)" }}>
                  {isRight ? <Check size={16} strokeWidth={3.4} /> : isWrong ? <X size={15} strokeWidth={3.2} /> : String.fromCharCode(65 + i)}
                </span>
                <span className="text-[15px] font-semibold leading-snug">{t(o.text.en, o.text.ar)}</span>
              </motion.button>
            </li>
          );
        })}
      </ul>
      {!solved && Object.keys(wrong).length > 0 && <p className="mt-3 text-center text-xs font-bold" style={{ color: "#fda4af" }}>{t("Not quite — try another answer.", "ليست هذه — جرّب إجابة أخرى.")}</p>}
      <Why show={solved} t={t} text={s.why} firstTry={firstTry} />
    </div>
  );
}

/* ── order ── */
function OrderScene({ s, t, preSolved, onSolved, seed }: SceneProps & { s: Extract<Scene, { type: "order" }>; seed: number }) {
  const n = s.items.length;
  const pool = useMemo(() => shuffledIndices(n, seed), [n, seed]);
  const [picked, setPicked] = useState<number[]>(preSolved ? s.items.map((_, i) => i) : []);
  const [mistakes, setMistakes] = useState(0);
  const [shake, setShake] = useState<{ i: number; n: number } | null>(null);
  const solved = picked.length === n;
  const tapItem = (i: number) => {
    if (solved || picked.includes(i)) return;
    if (i === picked.length) {
      const next = [...picked, i]; setPicked(next); buzz(14);
      if (next.length === n) { buzz(30); onSolved(mistakes === 0); }
    } else { setMistakes((m) => m + 1); setShake((x) => ({ i, n: (x?.n ?? 0) + 1 })); buzz(30); }
  };
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-xs font-bold" style={{ color: "#93c5fd" }}><Zap size={14} /> {t("Put them in order", "رتّبها")}</p>
      <h3 className="text-xl font-black leading-snug">{t(s.q.en, s.q.ar)}</h3>
      <ol className="mt-4 space-y-2">
        {s.items.map((it, k) => (
          <li key={k} className="flex min-h-[52px] items-center gap-3 rounded-2xl px-3" style={{ background: picked[k] !== undefined ? "rgba(16,185,129,.22)" : "rgba(255,255,255,.05)", border: `1.5px ${picked[k] !== undefined ? "solid" : "dashed"} ${picked[k] !== undefined ? GREEN : "rgba(255,255,255,.22)"}` }}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black" style={{ background: picked[k] !== undefined ? GREEN : "rgba(255,255,255,.1)" }}>{k + 1}</span>
            <AnimatePresence>
              {picked[k] !== undefined && <motion.span initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-[15px] font-bold">{t(it.en, it.ar)}</motion.span>}
            </AnimatePresence>
          </li>
        ))}
      </ol>
      {!solved && (
        <div className="mt-5 flex flex-wrap justify-center gap-2.5">
          {pool.filter((i) => !picked.includes(i)).map((i) => (
            <motion.button key={`${i}-${shake?.i === i ? shake.n : 0}`} onClick={() => tapItem(i)} whileTap={{ scale: 0.94 }}
              animate={shake?.i === i ? { x: [0, -9, 9, -6, 6, 0] } : { x: 0 }} transition={{ duration: 0.35 }}
              className="rounded-full px-4 py-2.5 text-sm font-extrabold" style={{ background: "rgba(251,191,36,.18)", border: `1.5px solid ${GOLD}`, color: "#fde68a" }}>
              {t(s.items[i].en, s.items[i].ar)}
            </motion.button>
          ))}
        </div>
      )}
      <Why show={solved} t={t} text={s.why} firstTry={mistakes === 0} />
    </div>
  );
}

/* ── tap counter (dhikr) ── */
function TapScene({ s, t, preSolved, onSolved }: SceneProps & { s: Extract<Scene, { type: "tap" }> }) {
  const [n, setN] = useState(preSolved ? s.count : 0);
  const solved = n >= s.count;
  const R = 74, C = 2 * Math.PI * R;
  const tap = () => {
    if (solved) return;
    const v = n + 1; setN(v); buzz(10);
    if (v >= s.count) { buzz(40); onSolved(true); }
  };
  return (
    <div className="text-center">
      <p className="mb-2 flex items-center justify-center gap-2 text-xs font-bold" style={{ color: "#c4b5fd" }}><Moon size={14} /> {t("Dhikr", "ذكر")}</p>
      <h3 className="text-lg font-black leading-snug">{t(s.q.en, s.q.ar)}</h3>
      <p dir="rtl" lang="ar" className="mt-3" style={{ fontFamily: ARABIC_FONT, fontSize: 30, lineHeight: 1.9, color: "#fde68a", fontWeight: 700 }}>{s.arabic}</p>
      <div className="relative mx-auto mt-3 h-[190px] w-[190px]">
        <svg viewBox="0 0 180 180" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
          <circle cx="90" cy="90" r={R} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="10" />
          <motion.circle cx="90" cy="90" r={R} fill="none" stroke={GOLD} strokeWidth="10" strokeLinecap="round" strokeDasharray={C}
            initial={false} animate={{ strokeDashoffset: C * (1 - n / s.count) }} transition={{ type: "spring", stiffness: 120, damping: 18 }}
            style={{ filter: "drop-shadow(0 0 6px rgba(251,191,36,.8))" }} />
        </svg>
        <motion.button onClick={tap} whileTap={solved ? undefined : { scale: 0.9 }} aria-label={t("Tap to count", "المس للعدّ")}
          className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full"
          style={{ background: solved ? `radial-gradient(circle at 35% 30%,#fff7d6,${GOLD})` : "radial-gradient(circle at 35% 30%,#1d4ed8,#1e1b4b)", border: "2px solid rgba(255,255,255,.7)", color: solved ? GOLD_D : "#fff" }}>
          {solved ? <Check size={46} strokeWidth={3.4} /> : <><span className="text-4xl font-black leading-none">{n}</span><span className="mt-1 text-xs font-bold opacity-80">/ {s.count}</span></>}
        </motion.button>
      </div>
      {s.why && <Why show={solved} t={t} text={s.why} firstTry={false} />}
    </div>
  );
}

/* ── reflect (niyyah) ── */
function ReflectScene({ s, t, preSolved, onSolved, storeKey }: SceneProps & { s: Extract<Scene, { type: "reflect" }>; storeKey: string }) {
  const [sel, setSel] = useState<number | null>(() => { const v = readLS(storeKey); return v !== null && Number(v) < s.options.length ? Number(v) : preSolved ? 0 : null; });
  useEffect(() => { if (sel !== null) onSolved(true); /* a saved choice counts as answered */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const choose = (i: number) => { setSel(i); writeLS(storeKey, String(i)); buzz(14); onSolved(true); };
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-xs font-bold" style={{ color: "#fda4af" }}><HeartHandshake size={14} /> {t("Your niyyah", "نيّتك")}</p>
      <h3 className="text-xl font-black leading-snug">{t(s.q.en, s.q.ar)}</h3>
      {s.lead && <p className="mt-2 text-sm leading-relaxed" style={{ color: "rgba(255,255,255,.78)", borderInlineStart: `3px solid ${GOLD}`, paddingInlineStart: 12 }}>{t(s.lead.en, s.lead.ar)}</p>}
      <ul className="mt-4 space-y-2.5">
        {s.options.map((o, i) => (
          <li key={i}>
            <motion.button onClick={() => choose(i)} whileTap={{ scale: 0.98 }} aria-pressed={sel === i}
              className="flex w-full items-center gap-3 rounded-2xl p-3.5 text-start"
              style={{ background: sel === i ? "rgba(251,191,36,.2)" : "rgba(255,255,255,.07)", border: `1.5px solid ${sel === i ? GOLD : "rgba(255,255,255,.16)"}` }}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: sel === i ? GOLD : "rgba(255,255,255,.12)", color: GOLD_D }}>{sel === i && <Check size={16} strokeWidth={3.4} />}</span>
              <span className="text-[15px] font-semibold leading-snug">{t(o.en, o.ar)}</span>
            </motion.button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** the "why" panel shown once a question is solved */
function Why({ show, text, firstTry, t }: { show: boolean; text: Bi; firstTry: boolean; t: T }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-2xl p-3.5" style={{ background: "rgba(16,185,129,.14)", border: "1px solid rgba(16,185,129,.5)" }}>
          {firstTry && <p className="mb-1 flex items-center gap-1.5 text-xs font-black" style={{ color: GOLD }}><Sparkles size={13} /> {t("First try!", "من أول محاولة!")}</p>}
          <p className="text-sm leading-relaxed" style={{ color: "#d1fae5" }}>{t(text.en, text.ar)}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ════════════════════════════════ the reader ════════════════════════════════ */
export interface StoryReaderProps {
  day: JourneyDay; done: ReadonlySet<string>; toggle: (id: string, force?: boolean) => void; onClose: () => void;
  canEdit: boolean; streak: number; userId?: string; t: T; dir: string;
}

export default function StoryReader({ day, done, toggle, onClose, canEdit, streak, userId, t, dir }: StoryReaderProps) {
  const reduce = useReducedMotion();
  const scenes = useMemo(() => storyFor(day), [day]);
  const authored = hasStory(day.day);
  const total = scenes.length + 1;                                   // + the deeds
  const posKey = `ramadan_story_pos_${RAMADAN_YEAR}_${userId ?? "anon"}_${day.day}`;
  const niyyahKey = (i: number) => `ramadan_story_pick_${RAMADAN_YEAR}_${userId ?? "anon"}_${day.day}_${i}`;
  const complete = dayDone(day, done);

  const [idx, setIdx] = useState(() => {
    if (complete) return 0;
    const v = Number(readLS(posKey));
    return Number.isFinite(v) && v > 0 && v < total ? v : 0;
  });
  const [maxReached, setMaxReached] = useState(idx);
  const [solved, setSolved] = useState<Set<number>>(() => new Set(Array.from({ length: idx }, (_, i) => i)));
  const [firsts, setFirsts] = useState<Set<number>>(new Set());
  const [way, setWay] = useState(1);
  const [celebrate, setCelebrate] = useState(false);
  const [instantText, setInstantText] = useState(false);
  const wasComplete = useRef(complete);
  const questions = questionCount(scenes);
  const isDeeds = idx === scenes.length;
  const scene = isDeeds ? null : scenes[idx];
  const storyTask = day.tasks.find((x) => x.cat === "knowledge");
  const chapter = CHAPTERS[day.chapter];
  const next = DAYS[day.day] as JourneyDay | undefined;
  const chapterEnd = CHAPTERS.find((c) => c.to === day.day);

  useEffect(() => { writeLS(posKey, String(idx)); setInstantText(false); }, [idx, posKey]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [onClose]);

  /* arriving at the deeds means the story was walked: tick the story task (only days that have a real story) */
  useEffect(() => { if (isDeeds && canEdit && authored && storyTask && !done.has(storyTask.id)) toggle(storyTask.id, true); }, [isDeeds, canEdit, authored, storyTask, done, toggle]);
  useEffect(() => {
    if (complete && !wasComplete.current) { setCelebrate(true); buzz(60); }
    if (!complete) setCelebrate(false);
    wasComplete.current = complete;
  }, [complete]);

  const markSolved = useCallback((i: number, firstTry: boolean) => {
    setSolved((s) => (s.has(i) ? s : new Set(s).add(i)));
    if (firstTry) setFirsts((f) => (f.has(i) ? f : new Set(f).add(i)));
  }, []);
  const go = (n: number) => {
    const to = Math.max(0, Math.min(total - 1, n));
    setWay(to >= idx ? 1 : -1); setIdx(to); setMaxReached((m) => Math.max(m, to)); buzz(8);
  };

  const type = scene?.type;
  const canContinue = isDeeds ? false : type === "narrate" || solved.has(idx);
  const hint = !scene ? "" : scene.type === "learn" ? t("Reveal the meaning to continue", "اكشف المعنى للمتابعة")
    : scene.type === "quiz" ? t("Choose an answer", "اختر إجابة") : scene.type === "order" ? t("Tap them in order", "المس بالترتيب")
    : scene.type === "tap" ? t("Finish the count", "أكمل العدّ") : scene.type === "reflect" ? t("Choose one", "اختر واحدًا") : "";
  const slide = reduce ? 0 : 36 * way * (dir === "rtl" ? -1 : 1);
  const score = firsts.size;

  return (
    <motion.div dir={dir} role="dialog" aria-modal="true" aria-label={t(day.title.en, day.title.ar)}
      className="fixed inset-0 z-50 flex flex-col" style={{ background: `linear-gradient(180deg,#0e2a4d,${NIGHT})`, color: "#fff" }}
      initial={{ opacity: 0, y: reduce ? 0 : 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduce ? 0 : 40 }} transition={{ type: "spring", stiffness: 260, damping: 30 }}>
      {celebrate && <Burst big={!!chapterEnd} />}

      {/* header: progress segments + close */}
      <div className="mx-auto w-full max-w-md px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex gap-1" aria-label={t(`Scene ${idx + 1} of ${total}`, `المشهد ${idx + 1} من ${total}`)}>
          {Array.from({ length: total }, (_, i) => (
            <button key={i} onClick={() => i <= maxReached && go(i)} disabled={i > maxReached} aria-label={t(`Go to scene ${i + 1}`, `إلى المشهد ${i + 1}`)}
              className="h-2 flex-1 rounded-full" style={{ background: i < idx ? GOLD : i === idx ? "rgba(251,191,36,.7)" : "rgba(255,255,255,.18)", cursor: i <= maxReached ? "pointer" : "default" }} />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={onClose} aria-label={t("Close", "إغلاق")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,.1)" }}><X size={19} /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-bold" style={{ color: "#a7f3d0" }}>{t(chapter.name.en, chapter.name.ar)} · {t(`Day ${day.day}`, `اليوم ${day.day}`)}</p>
            <h2 className="truncate text-lg font-black leading-tight" style={{ color: GOLD }}>{t(day.title.en, day.title.ar)}</h2>
          </div>
          {idx > 0 && <button onClick={() => go(idx - 1)} aria-label={t("Previous scene", "المشهد السابق")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,.1)" }}><ChevronLeft size={20} style={{ transform: dir === "rtl" ? "scaleX(-1)" : undefined }} /></button>}
        </div>
      </div>

      {/* body */}
      <div className="mx-auto min-h-0 w-full max-w-md flex-1 overflow-y-auto px-4 pb-4 pt-4">
        <AnimatePresence mode="wait" custom={slide} initial={false}>
          <motion.div key={idx} initial={{ opacity: 0, x: slide }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -slide }} transition={{ duration: reduce ? 0 : 0.22 }}>
            {scene?.type === "narrate" && (
              <div>
                <SceneArt chapter={day.chapter} kind={scene.art ?? landmarkOf(day.day)} />
                <button onClick={() => setInstantText(true)} className="mt-4 block w-full rounded-2xl px-4 py-4 text-start text-[16px] leading-[1.85]"
                  style={{ background: "rgba(255,255,255,.07)", color: "#f1f5f9", borderInlineStart: `3px solid ${GOLD}`, fontFamily: "Georgia,'Times New Roman',serif", minHeight: 150 }}>
                  <Told key={idx} text={t(scene.text.en, scene.text.ar)} instant={instantText || idx < maxReached} />
                </button>
              </div>
            )}
            {scene?.type === "learn" && <LearnScene s={scene} t={t} preSolved={solved.has(idx)} onSolved={(f) => markSolved(idx, f)} />}
            {scene?.type === "quiz" && <QuizScene s={scene} t={t} preSolved={solved.has(idx)} onSolved={(f) => markSolved(idx, f)} />}
            {scene?.type === "order" && <OrderScene s={scene} t={t} seed={day.day * 7 + idx} preSolved={solved.has(idx)} onSolved={(f) => markSolved(idx, f)} />}
            {scene?.type === "tap" && <TapScene s={scene} t={t} preSolved={solved.has(idx)} onSolved={(f) => markSolved(idx, f)} />}
            {scene?.type === "reflect" && <ReflectScene s={scene} t={t} storeKey={niyyahKey(idx)} preSolved={solved.has(idx)} onSolved={(f) => markSolved(idx, f)} />}
            {isDeeds && (
              <DeedsScene day={day} done={done} toggle={toggle} canEdit={canEdit} authored={authored} streak={streak} next={next} chapterEnd={chapterEnd}
                score={score} questions={questions} onClose={onClose} t={t} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* footer */}
      {!isDeeds && (
        <div className="mx-auto w-full max-w-md px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
          <motion.button onClick={() => canContinue && go(idx + 1)} disabled={!canContinue} whileTap={canContinue ? { scale: 0.97 } : undefined}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-black"
            style={{ background: canContinue ? `linear-gradient(90deg,${GOLD},#f59e0b)` : "rgba(255,255,255,.1)", color: canContinue ? "#422006" : "rgba(255,255,255,.5)", boxShadow: canContinue ? "0 6px 24px rgba(251,191,36,.35)" : undefined }}>
            {canContinue ? (idx === scenes.length - 1 ? t("On to today's deeds", "إلى أعمال اليوم") : t("Continue", "متابعة")) : hint}
            {canContinue && <ChevronRight size={20} style={{ transform: dir === "rtl" ? "scaleX(-1)" : undefined }} />}
          </motion.button>
        </div>
      )}
    </motion.div>
  );
}

/* ── the last scene: what the road asks of you today (real-life deeds) ── */
function DeedsScene({ day, done, toggle, canEdit, authored, streak, next, chapterEnd, score, questions, onClose, t }: {
  day: JourneyDay; done: ReadonlySet<string>; toggle: (id: string, force?: boolean) => void; canEdit: boolean; authored: boolean; streak: number;
  next?: JourneyDay; chapterEnd?: (typeof CHAPTERS)[number]; score: number; questions: number; onClose: () => void; t: T;
}) {
  const complete = dayDone(day, done);
  const total = day.tasks.reduce((a, x) => a + x.xp, 0);
  const [floats, setFloats] = useState<{ id: number; taskId: string; xp: number }[]>([]);
  const fid = useRef(0);
  const tick = (id: string, xp: number) => {
    if (!canEdit) return;
    const adding = !done.has(id);
    toggle(id);
    if (adding) { buzz(14); const n = ++fid.current; setFloats((f) => [...f, { id: n, taskId: id, xp }]); setTimeout(() => setFloats((f) => f.filter((x) => x.id !== n)), 1100); }
  };
  return (
    <div>
      <SceneArt chapter={day.chapter} kind={landmarkOf(day.day)} height={120} />
      <h3 className="mt-4 text-xl font-black leading-snug">{t("Now carry the story into your day", "والآن احمل القصة إلى يومك")}</h3>
      <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,.75)" }}>
        {authored && t("Story complete", "اكتملت القصة")}{authored && questions > 0 && ` · ${t(`${score}/${questions} first try`, `${score}/${questions} من أول محاولة`)}`}
        {authored && " · "}{dayCount(day, done)}/{day.tasks.length} {t("quests", "مهام")} · {total} XP
      </p>
      <ul className="mt-3 space-y-2.5">
        {day.tasks.map((task) => {
          const on = done.has(task.id);
          const C = CAT[task.cat];
          const auto = authored && task.cat === "knowledge";           // ticked by the story itself
          return (
            <li key={task.id} className="relative">
              <motion.button whileTap={canEdit && !auto ? { scale: 0.97 } : undefined} onClick={() => !auto && tick(task.id, task.xp)} aria-pressed={on} disabled={!canEdit || auto}
                className="flex w-full items-center gap-3 rounded-2xl p-3 text-start"
                style={{ background: on ? "rgba(16,185,129,.2)" : "rgba(255,255,255,.07)", border: `1.5px solid ${on ? GREEN : "rgba(255,255,255,.14)"}`, opacity: canEdit ? 1 : 0.6 }}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${C.color}26` }}><C.icon size={20} color={C.color} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold" style={{ color: C.color }}>{auto ? t("The story", "القصة") : t(C.label.en, C.label.ar)} · +{task.xp} XP</span>
                  <span className="block text-sm font-semibold leading-snug" style={{ textDecoration: on ? "line-through" : "none", textDecorationColor: "rgba(255,255,255,.5)" }}>{t(task.text.en, task.text.ar)}</span>
                </span>
                <motion.span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  animate={{ scale: on ? [1, 1.35, 1] : 1, background: on ? GREEN : "rgba(255,255,255,.08)" }} transition={{ duration: 0.35 }}
                  style={{ border: `2px solid ${on ? "#fff" : "rgba(255,255,255,.3)"}` }}>
                  {on && <Check size={18} color="#fff" strokeWidth={3.4} />}
                </motion.span>
              </motion.button>
              <AnimatePresence>
                {floats.filter((f) => f.taskId === task.id).map((f) => (
                  <motion.span key={f.id} initial={{ opacity: 1, y: 0 }} animate={{ opacity: 0, y: -46 }} exit={{ opacity: 0 }} transition={{ duration: 1 }}
                    className="pointer-events-none absolute end-14 top-2 text-lg font-black" style={{ color: GOLD, textShadow: "0 0 8px rgba(0,0,0,.6)" }}>+{f.xp} XP</motion.span>
                ))}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
      <AnimatePresence>
        {complete && (
          <motion.div initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}
            className="mt-5 rounded-2xl p-4 text-center" style={{ background: "linear-gradient(135deg,rgba(251,191,36,.25),rgba(16,185,129,.2))", border: `1.5px solid ${GOLD}` }}>
            <div className="text-lg font-black" style={{ color: GOLD }}>{t(`Day ${day.day} complete!`, `أتممتَ اليوم ${day.day}!`)}</div>
            <div className="mt-1 flex items-center justify-center gap-3 text-sm font-bold">
              <span><Zap size={14} className="inline" color={GOLD} /> +{total} XP</span>
              <span><Flame size={14} className="inline" color="#fb923c" /> {t(`${streak}-day streak`, `${streak} أيام متتالية`)}</span>
            </div>
            {chapterEnd && <p className="mt-2 text-sm" style={{ color: "#fde68a" }}>{t(`You finished «${chapterEnd.name.en}».`, `أتممتَ «${chapterEnd.name.ar}».`)}</p>}
            {next && (
              <div className="mt-3 rounded-xl p-3 text-start" style={{ background: "rgba(2,8,26,.45)" }}>
                <p className="text-[11px] font-bold" style={{ color: "#a7f3d0" }}>{t("Tomorrow on the road…", "غدًا على الطريق…")}</p>
                <p className="mt-0.5 text-sm font-black" style={{ color: GOLD }}>{t(next.title.en, next.title.ar)}</p>
                <p className="mt-0.5 text-xs leading-snug" style={{ color: "rgba(255,255,255,.8)" }}>{t(next.story.en, next.story.ar)}</p>
              </div>
            )}
            <button onClick={onClose} className="mt-3 w-full rounded-xl py-2.5 text-sm font-black" style={{ background: GOLD, color: "#422006" }}>
              {next ? t("Back to the road", "العودة إلى الطريق") : t("See the gate of Eid", "إلى باب العيد")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {!complete && <button onClick={onClose} className="mt-4 w-full rounded-xl py-2.5 text-sm font-bold" style={{ background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.8)" }}>{t("Back to the road — finish later", "العودة إلى الطريق — أكمل لاحقًا")}</button>}
    </div>
  );
}
