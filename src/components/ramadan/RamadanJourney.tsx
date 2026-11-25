import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BookOpen, Check, Flame, Lock, Moon, RotateCcw, Sparkles, Star, Trophy, X, Zap } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  CHAPTERS, DAYS, RAMADAN_START, RAMADAN_YEAR, TOTAL_DAYS, badgesFor, computeProgress, currentDay, dayCount,
  nextRank, rankFor, type DayStatus, type JourneyDay,
} from "@/lib/ramadanJourney";
import { hasStory, landmarkOf } from "@/lib/ramadanStory";
import StoryReader from "./StoryReader";
import { Burst, GOLD, GOLD_D, GREEN, GREEN_D, Glyph, NIGHT, SceneArt, buzz } from "./JourneyArt";

/* ════════════════════════════════════════════════════════════════════════════════════════════
   Ramadan Journey — a story path of 30 levels. Finish a day's tasks and the traveller walks on to the next one.
   Layout: the path runs BOTTOM → TOP (day 1 at the bottom, the gate of Eid at the top, under the moon).
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/* the road runs TOP → BOTTOM (day 1 first, the star of Eid at the end) in a gentle S: the days alternate left / right */
const W = 360, STEP = 112, PAD = 118, GAP = 64, AMP = 46, NODE = 46;
const chapterOf = (i: number) => Math.min(2, Math.floor(i / 10));                  // i = 0…29 days, 30 = Eid
const nodeX = (i: number) => (i >= TOTAL_DAYS ? W / 2 : W / 2 + (i % 2 === 0 ? -AMP : AMP));
const nodeY = (i: number) => PAD + i * STEP + chapterOf(i) * GAP;
const H = nodeY(TOTAL_DAYS) + 110;
const segD = (k: number) => {
  const x1 = nodeX(k), y1 = nodeY(k), x2 = nodeX(k + 1), y2 = nodeY(k + 1), m = (y2 - y1) * 0.55;
  return `M ${x1} ${y1} C ${x1} ${y1 + m}, ${x2} ${y2 - m}, ${x2} ${y2}`;
};
const pct = (v: number, of: number) => `${(v / of) * 100}%`;

/* ── saving progress: the student's account when possible, this device otherwise ── */
const readLS = (key: string): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); } catch { return new Set(); } };
const writeLS = (key: string, s: Set<string>) => { try { localStorage.setItem(key, JSON.stringify([...s])); } catch { /* private mode */ } };

function useJourneyStore(userId: string | undefined, live: boolean) {
  const key = `ramadan_journey_${live ? "live" : "rehearsal"}_${RAMADAN_YEAR}_${userId ?? "anon"}`;
  const [done, setDone] = useState<Set<string>>(() => readLS(key));
  const [cloud, setCloud] = useState(false);          // true when progress is saved to the account
  const [loading, setLoading] = useState(live);
  const cloudRef = useRef(false);

  useEffect(() => {
    let off = false;
    const local = readLS(key);
    if (!live || !userId) { setDone(local); setCloud(false); cloudRef.current = false; setLoading(false); return; }
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await (supabase as any).from("ramadan_journey_progress").select("task_id").eq("user_id", userId).eq("season", RAMADAN_YEAR);
        if (off) return;
        if (error) throw error;
        const remote = new Set<string>((data ?? []).map((r: { task_id: string }) => r.task_id));
        const missing = [...local].filter((id) => !remote.has(id));   // ticked earlier on this device only → push up
        if (missing.length) {
          const { error: e2 } = await (supabase as any).from("ramadan_journey_progress").upsert(missing.map((task_id) => ({ user_id: userId, season: RAMADAN_YEAR, task_id })), { onConflict: "user_id,season,task_id", ignoreDuplicates: true });
          if (!e2) missing.forEach((id) => remote.add(id));
        }
        const merged = new Set([...remote, ...(missing.length ? missing : [])]);
        setDone(merged); writeLS(key, merged); setCloud(true); cloudRef.current = true;
      } catch {
        if (off) return;
        setDone(local); setCloud(false); cloudRef.current = false;    // table missing / offline: keep going on this device
      } finally { if (!off) setLoading(false); }
    })();
    return () => { off = true; };
  }, [key, live, userId]);

  /** `force` true = make sure it is ticked, false = make sure it is not, undefined = flip */
  const toggle = useCallback((taskId: string, force?: boolean) => {
    setDone((prev) => {
      const adding = force ?? !prev.has(taskId);
      if (adding === prev.has(taskId)) return prev;
      const next = new Set(prev);
      if (adding) next.add(taskId); else next.delete(taskId);
      writeLS(key, next);
      if (live && userId && cloudRef.current) {
        const q = adding
          ? (supabase as any).from("ramadan_journey_progress").upsert({ user_id: userId, season: RAMADAN_YEAR, task_id: taskId }, { onConflict: "user_id,season,task_id", ignoreDuplicates: true })
          : (supabase as any).from("ramadan_journey_progress").delete().eq("user_id", userId).eq("season", RAMADAN_YEAR).eq("task_id", taskId);
        Promise.resolve(q).then((r: { error?: unknown }) => { if (r?.error) { cloudRef.current = false; setCloud(false); } }).catch(() => { cloudRef.current = false; setCloud(false); });
      }
      return next;
    });
  }, [key, live, userId]);

  const reset = useCallback(() => { const e = new Set<string>(); setDone(e); writeLS(key, e); }, [key]);
  return { done, toggle, reset, cloud, loading };
}

/* the look: warm paper, deep green, a thread of gold — and a serif for titles */
const PAPER = "#f6f1e3", INK = "#12372a", MUTED = "#8b8470", LINE = "#cfc3a3", GOLDW = "#e9a93b";
const SERIF = "'Playfair Display','Fraunces',Georgia,'Times New Roman',serif";

const fmtDate = (day: number) => {
  const [y, m, d] = RAMADAN_START.split("-").map(Number);
  return new Date(y, m - 1, d + day - 1).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
};

const clearStoryMemory = () => { try { Object.keys(localStorage).filter((k) => k.startsWith("ramadan_story_")).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ } };

/* ════════════════════════════════ main ════════════════════════════════ */
export default function RamadanJourney() {
  const { t, dir } = useLanguage();
  const { user } = useAuth();
  const reduce = useReducedMotion();
  const today = useMemo(() => currentDay(new Date()), []);
  const live = today >= 1;
  const unlocked = live ? Math.min(today, TOTAL_DAYS) : TOTAL_DAYS;     // before Ramadan: a rehearsal, every level open
  const store = useJourneyStore(user?.id, live);
  const { done } = store;
  const prog = useMemo(() => computeProgress(done, unlocked, live ? today : TOTAL_DAYS), [done, unlocked, today, live]);
  const badges = useMemo(() => badgesFor(prog, done), [prog, done]);
  const rank = rankFor(prog.daysDone), upNext = nextRank(prog.daysDone);

  const [openDay, setOpenDay] = useState<number | null>(null);
  const [badgesOpen, setBadgesOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = (m: string) => { setToast(m); if (toastTimer.current) clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2600); };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  /* ── the traveller walks along the path ── */
  const segRefs = useRef<(SVGPathElement | null)[]>([]);
  const target = prog.travelerDay - 1;                 // node index the traveller should stand on
  const standing = useRef(target);
  const [pos, setPos] = useState({ x: nodeX(target), y: nodeY(target) });
  const [walking, setWalking] = useState(false);
  const travelerRef = useRef<HTMLDivElement | null>(null);

  const scrollToTraveler = useCallback((smooth = true) => {
    travelerRef.current?.scrollIntoView({ behavior: smooth && !reduce ? "smooth" : "auto", block: "center" });
  }, [reduce]);

  useEffect(() => { const id = setTimeout(() => scrollToTraveler(false), 120); return () => clearTimeout(id); }, [scrollToTraveler]);

  useEffect(() => {
    const from = standing.current;
    if (from === target) return;
    const forward = target > from;
    const ks = forward ? Array.from({ length: target - from }, (_, i) => from + i) : Array.from({ length: from - target }, (_, i) => from - 1 - i);
    if (reduce) { setPos({ x: nodeX(target), y: nodeY(target) }); standing.current = target; return; }
    let raf = 0, cancelled = false;
    const per = Math.min(700, 2400 / ks.length);
    setWalking(true);
    let idx = 0, t0 = performance.now();
    const frame = (now: number) => {
      if (cancelled) return;
      const path = segRefs.current[ks[idx]];
      const k = Math.min(1, (now - t0) / per);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;      // ease in-out
      if (path) {
        const len = path.getTotalLength();
        const pt = path.getPointAtLength((forward ? e : 1 - e) * len);
        setPos({ x: pt.x, y: pt.y });
      }
      if (k >= 1) { idx++; t0 = now; if (idx >= ks.length) { standing.current = target; setPos({ x: nodeX(target), y: nodeY(target) }); setWalking(false); scrollToTraveler(); return; } }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    // keep the traveller in view while walking
    const follow = setInterval(() => scrollToTraveler(), 700);
    return () => { cancelled = true; cancelAnimationFrame(raf); clearInterval(follow); setWalking(false); };
  }, [target, reduce, scrollToTraveler]);

  const openNode = (day: number) => {
    if (day > unlocked) { buzz(30); say(t(`Day ${day} opens on ${fmtDate(day)}`, `يُفتح اليوم ${day} في ${fmtDate(day)}`)); return; }
    setOpenDay(day);
  };

  const todayDay = Math.min(prog.travelerDay, unlocked);
  const todayInfo = DAYS[todayDay - 1];
  const allDone = prog.daysDone === TOTAL_DAYS;

  const doneSegments = prog.statuses.map((s) => s === "done");
  const xpToNext = upNext ? upNext.from - prog.daysDone : 0;

  const pctDone = Math.round((prog.daysDone / TOTAL_DAYS) * 100);
  const R = 26, CIRC = 2 * Math.PI * R;

  return (
    <div dir={dir} className="mx-auto w-full max-w-md pb-24 pt-2">
      <style>{`
        @keyframes rj-pulse{0%{box-shadow:0 0 0 0 rgba(233,169,59,.6)}70%{box-shadow:0 0 0 16px rgba(233,169,59,0)}100%{box-shadow:0 0 0 0 rgba(233,169,59,0)}}
        @keyframes rj-glow{0%,100%{filter:drop-shadow(0 0 5px rgba(251,146,60,.5))}50%{filter:drop-shadow(0 0 12px rgba(251,146,60,1))}}
        @media (prefers-reduced-motion: reduce){ .rj-anim{animation:none!important} }
      `}</style>

      <div className="overflow-hidden rounded-[30px]" style={{ background: PAPER, color: INK, boxShadow: "0 12px 40px rgba(18,55,42,.18)" }}>
        {/* ── header ── */}
        <div className="px-5 pb-14 pt-6" style={{ background: "linear-gradient(165deg,#10513a 0%,#0c3a2a 60%,#0a2f23 100%)" }}>
          <p className="text-[11px] font-bold tracking-[0.24em]" style={{ color: GOLDW }}>{t("RAMADAN JOURNEY", "رحلة رمضان")} · {RAMADAN_YEAR}</p>
          <h1 className="mt-2 text-[28px] font-bold leading-[1.15] text-white" style={{ fontFamily: SERIF }}>{t("Walk the road of Ramadan", "سِر في طريق رمضان")}</h1>
          <p className="mt-2 text-[13px]" style={{ color: "rgba(255,255,255,.72)" }}>{t("Tahleem Academy · 30 days · 3 chapters", "أكاديمية تعليم · ٣٠ يومًا · ٣ فصول")}</p>
        </div>

        {/* ── summary card, floating over the header ── */}
        <div className="relative z-10 -mt-10 px-4">
          <div className="rounded-3xl bg-white p-4" style={{ boxShadow: "0 10px 30px rgba(18,55,42,.14)", border: "1px solid rgba(18,55,42,.06)" }}>
            <div className="flex items-center gap-3.5">
              <div className="relative h-[62px] w-[62px] shrink-0" role="img" aria-label={t(`${pctDone}% complete`, `${pctDone}% مكتمل`)}>
                <svg viewBox="0 0 62 62" className="h-full w-full -rotate-90" aria-hidden>
                  <circle cx="31" cy="31" r={R} fill="none" stroke="#efe6cc" strokeWidth="7" />
                  <motion.circle cx="31" cy="31" r={R} fill="none" stroke={GOLDW} strokeWidth="7" strokeLinecap="round" strokeDasharray={CIRC}
                    initial={false} animate={{ strokeDashoffset: CIRC * (1 - prog.daysDone / TOTAL_DAYS) }} transition={{ type: "spring", stiffness: 90, damping: 18 }} />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[14px] font-extrabold" style={{ fontFamily: SERIF }}>{pctDone}%</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[19px] font-bold leading-tight" style={{ fontFamily: SERIF }}>{t(rank.name.en, rank.name.ar)}</p>
                <p className="mt-0.5 text-[12.5px]" style={{ color: MUTED }}>{t(`${prog.daysDone} of ${TOTAL_DAYS} days`, `${prog.daysDone} من ${TOTAL_DAYS} يومًا`)}</p>
              </div>
              <div className="text-end">
                <p className="text-[26px] font-bold leading-none" style={{ color: GOLDW, fontFamily: SERIF }}>{prog.xp}</p>
                <p className="mt-1 text-[11px]" style={{ color: MUTED }}>XP</p>
              </div>
            </div>
            <div className="mt-3.5 flex items-center gap-2 border-t pt-3" style={{ borderColor: "#efe9d8" }}>
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-extrabold" style={{ background: "#fdeedb", color: "#b45309" }} aria-label={t("Daily streak", "سلسلة الأيام")}>
                <Flame size={14} className={prog.streak > 0 ? "rj-anim" : ""} style={prog.streak > 0 ? { animation: "rj-glow 2s ease-in-out infinite" } : { opacity: 0.45 }} /> {prog.streak}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: MUTED }}>
                {upNext ? t(`${xpToNext} more day${xpToNext === 1 ? "" : "s"} to ${upNext.name.en}`, `${xpToNext} للوصول إلى «${upNext.name.ar}»`) : t("Highest rank reached", "بلغتَ أعلى رتبة")}
              </span>
              <button onClick={() => setBadgesOpen(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-extrabold" style={{ background: INK, color: "#fff" }} aria-label={t("Badges", "الأوسمة")}>
                <Trophy size={13} color={GOLDW} /> {t("Badges", "الأوسمة")}
              </button>
            </div>
          </div>

          {!live && (
            <div className="mt-3 flex items-center gap-2 rounded-2xl px-3 py-2 text-xs" style={{ background: "#fbefd0", border: "1px solid #ecd58f", color: "#7c4a12" }}>
              <Sparkles size={14} className="shrink-0" />
              <span className="flex-1">{t(`Rehearsal — Ramadan starts ${fmtDate(1)}. Every level is open to try; nothing here is saved to your account.`, `تجربة — يبدأ رمضان ${fmtDate(1)}. كل المراحل مفتوحة للتجربة ولا يُحفظ شيء في حسابك.`)}</span>
              <button onClick={() => { store.reset(); clearStoryMemory(); standing.current = 0; setPos({ x: nodeX(0), y: nodeY(0) }); }} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 font-bold" style={{ background: "rgba(124,74,18,.12)" }}>
                <RotateCcw size={12} /> {t("Reset", "إعادة")}
              </button>
            </div>
          )}
          {live && !store.cloud && !store.loading && (
            <p className="mt-3 rounded-2xl px-3 py-2 text-xs" style={{ background: "#efe9d8", color: MUTED }}>
              {t("Your progress is being saved on this device only for now.", "يُحفظ تقدّمك على هذا الجهاز فقط حاليًا.")}
            </p>
          )}

          {/* ── tonight's story ── */}
          {!allDone && <StoryCard day={todayInfo} status={prog.statuses[todayDay - 1]} count={dayCount(todayInfo, done)} onOpen={() => openNode(todayDay)} t={t} />}
        </div>

        {/* ── the road ── */}
        <div dir="ltr" className="relative mt-2" style={{ aspectRatio: `${W} / ${H}` }}>
          <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
            {Array.from({ length: TOTAL_DAYS }, (_, k) => <path key={`b${k}`} ref={(el) => { segRefs.current[k] = el; }} d={segD(k)} fill="none" stroke={LINE} strokeWidth="4.5" strokeLinecap="round" strokeDasharray="0.5 11" />)}
            {Array.from({ length: TOTAL_DAYS }, (_, k) => (
              <motion.path key={`l${k}`} d={segD(k)} fill="none" stroke={GOLDW} strokeWidth="5.5" strokeLinecap="round"
                initial={false} animate={{ pathLength: doneSegments[k] ? 1 : 0, opacity: doneSegments[k] ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.9, ease: "easeInOut" }} />
            ))}
          </svg>

          {/* chapter headings */}
          {CHAPTERS.map((c, ci) => {
            const y = ci === 0 ? nodeY(0) - 66 : nodeY(c.from - 2) + (nodeY(c.from - 1) - nodeY(c.from - 2)) / 2;
            return (
              <div key={ci} className="absolute left-1/2 z-[1] w-[84%] -translate-x-1/2 -translate-y-1/2 text-center" style={{ top: pct(y, H) }}>
                <div className="flex items-center gap-2.5">
                  <span className="h-px flex-1" style={{ background: `linear-gradient(90deg,transparent,${GOLDW})` }} />
                  <span className="text-[10px] font-extrabold tracking-[0.2em]" style={{ color: "#a9731a" }}>{t(`CHAPTER ${ci + 1} · DAYS ${c.from}–${c.to}`, `الفصل ${ci + 1} · الأيام ${c.from}–${c.to}`)}</span>
                  <span className="h-px flex-1" style={{ background: `linear-gradient(270deg,transparent,${GOLDW})` }} />
                </div>
                <div className="mt-1 text-[19px] font-bold leading-tight" style={{ fontFamily: SERIF, color: INK }}>{t(c.name.en, c.name.ar)}</div>
              </div>
            );
          })}

          {/* the days */}
          {DAYS.map((d, i) => (
            <Node key={d.day} d={d} i={i} status={prog.statuses[i]} count={dayCount(d, done)} current={prog.travelerDay === d.day} onOpen={() => openNode(d.day)} t={t} />
          ))}

          {/* Eid: the star at the end of the road */}
          <button onClick={() => (allDone ? setOpenDay(TOTAL_DAYS + 1) : say(t("Finish all 30 days to open the gate of Eid", "أتمّ الأيام الثلاثين لتفتح باب العيد")))}
            className="absolute z-[2]" style={{ left: pct(nodeX(TOTAL_DAYS), W), top: pct(nodeY(TOTAL_DAYS), H), transform: "translate(-50%,-50%)" }} aria-label={t("Eid Mubarak", "عيد مبارك")}>
            <span className={`flex items-center justify-center rounded-full ${allDone ? "rj-anim" : ""}`}
              style={{ width: NODE + 8, height: NODE + 8, background: allDone ? `radial-gradient(circle at 35% 30%,#ffe9a8,${GOLDW})` : "#fff", border: `2.5px solid ${allDone ? "#fff" : LINE}`, boxShadow: allDone ? "0 0 22px rgba(233,169,59,.7)" : "0 2px 8px rgba(18,55,42,.08)", animation: allDone ? "rj-pulse 2s infinite" : undefined }}>
              <Star size={24} fill={allDone ? "#7c4a12" : "none"} color={allDone ? "#7c4a12" : INK} />
            </span>
            <span className="mt-1.5 block text-center text-[15px] font-bold" style={{ fontFamily: SERIF, color: INK }}>{t("Eid Mubarak", "عيد مبارك")}</span>
            <span className="block text-center text-[11px]" style={{ color: MUTED }}>{t("The gate of Eid", "باب العيد")}</span>
          </button>

          {/* "you are here": a gold crescent that walks the road */}
          <div ref={travelerRef} className="pointer-events-none absolute z-[3]" style={{ left: pct(pos.x, W), top: pct(pos.y, H), transform: "translate(-50%,-50%)" }}>
            <motion.div animate={reduce || walking ? { scale: 1 } : { scale: [1, 1.07, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="rj-anim flex items-center justify-center rounded-full"
              style={{ width: NODE, height: NODE, background: `radial-gradient(circle at 35% 30%,#ffe9a8,${GOLDW} 70%)`, border: "3px solid #fff", boxShadow: "0 0 0 5px rgba(233,169,59,.28), 0 6px 18px rgba(233,169,59,.55)" }}>
              <Moon size={20} color="#5a3408" fill="#5a3408" />
            </motion.div>
          </div>
        </div>
      </div>

      {/* ── today's story button ── */}
      {!allDone && (
        <div className="sticky bottom-4 z-30 mt-4 flex justify-center">
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => openNode(todayDay)}
            className="inline-flex items-center gap-2.5 rounded-full px-5 py-3 text-sm font-extrabold shadow-xl" style={{ background: INK, color: "#fff", border: `1.5px solid ${GOLDW}` }}>
            <BookOpen size={17} color={GOLDW} />
            {t(`Day ${todayDay} story`, `قصة اليوم ${todayDay}`)} · {dayCount(todayInfo, done)}/{todayInfo.tasks.length}
          </motion.button>
        </div>
      )}

      {/* ── toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-full px-4 py-2 text-sm font-bold shadow-xl" style={{ background: INK, color: "#fff" }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── sheets ── */}
      <AnimatePresence>
        {openDay !== null && openDay <= TOTAL_DAYS && (
          <StoryReader key={`day-${openDay}`} day={DAYS[openDay - 1]} done={done} toggle={store.toggle} onClose={() => setOpenDay(null)}
            streak={prog.streak} userId={user?.id} t={t} dir={dir} canEdit={openDay <= unlocked} />
        )}
        {openDay === TOTAL_DAYS + 1 && <Finale key="eid" onClose={() => setOpenDay(null)} xp={prog.xp} best={prog.bestStreak} t={t} dir={dir} />}
        {badgesOpen && <BadgesSheet key="badges" badges={badges} onClose={() => setBadgesOpen(false)} t={t} dir={dir} />}
      </AnimatePresence>
    </div>
  );
}

/* ── one day on the road: a clean medallion, and its title + date beside it ── */
function Node({ d, i, status, count, current, onOpen, t }: { d: JourneyDay; i: number; status: DayStatus; count: number; current: boolean; onOpen: () => void; t: (en: string, ar: string) => string }) {
  const x = nodeX(i), y = nodeY(i);
  const onLeft = x < W / 2;                              // the label sits on the outside, like the number is on the inside
  const locked = status === "locked", done = status === "done";
  return (
    <div className="absolute z-[2]" style={{ left: pct(x, W), top: pct(y, H), transform: "translate(-50%,-50%)", width: NODE, height: NODE }}>
      <motion.button onClick={onOpen} whileTap={{ scale: 0.92 }} whileHover={locked ? undefined : { scale: 1.06 }}
        aria-label={t(`Day ${d.day}: ${d.title.en}`, `اليوم ${d.day}: ${d.title.ar}`)}
        className="relative flex h-full w-full items-center justify-center rounded-full"
        style={{
          background: done ? "#14452f" : "#fff", color: done ? GOLDW : locked ? "#b9b096" : INK,
          border: done ? "2.5px solid #0e3322" : `2.5px solid ${locked ? "#e3dcc3" : status === "partial" ? GOLDW : LINE}`,
          boxShadow: done ? "0 4px 12px rgba(20,69,47,.35)" : "0 2px 8px rgba(18,55,42,.08)",
        }}>
        {done ? <Check size={22} strokeWidth={3.4} /> : locked ? <Lock size={15} /> : <span className="text-[17px] font-bold" style={{ fontFamily: SERIF }}>{d.day}</span>}
        {d.qadr && !locked && <Star size={15} fill={GOLDW} color={GOLDW} className="absolute -right-1.5 -top-1.5" />}
      </motion.button>
      <div className="pointer-events-none absolute top-1/2 w-[96px] -translate-y-1/2"
        style={{ [onLeft ? "right" : "left"]: `calc(100% + 11px)`, textAlign: onLeft ? "right" : "left", opacity: locked ? 0.55 : 1 } as any}>
        <p className="text-[13.5px] font-bold leading-[1.22]" style={{ fontFamily: SERIF, color: INK }}>{t(d.title.en, d.title.ar)}</p>
        <p className="mt-0.5 text-[10.5px] leading-tight" style={{ color: MUTED }}>
          {current ? t(`Now · ${count}/${d.tasks.length} quests`, `الآن · ${count}/${d.tasks.length}`) : `${t(`Day ${d.day}`, `اليوم ${d.day}`)} · ${fmtDate(d.day)}`}
        </p>
        {current && <span className="mt-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide" style={{ background: "#fbe7b5", color: "#a8650c" }}>+{d.tasks.reduce((a, x) => a + x.xp, 0)} XP</span>}
      </div>
    </div>
  );
}

/* ── the story card at the top: tonight's chapter of the story, with a big way in ── */
function StoryCard({ day, status, count, onOpen, t }: { day: JourneyDay; status: DayStatus; count: number; onOpen: () => void; t: (en: string, ar: string) => string }) {
  const authored = hasStory(day.day);
  const verb = status === "partial" ? t("Continue the story", "تابع القصة") : t("Begin the story", "ابدأ القصة");
  return (
    <motion.button onClick={onOpen} whileTap={{ scale: 0.985 }} className="relative mt-3 block w-full overflow-hidden rounded-3xl text-start" style={{ color: "#fff" }}>
      <SceneArt chapter={day.chapter} kind={landmarkOf(day.day)} height={236} />
      <div className="absolute inset-0 flex flex-col justify-end rounded-3xl p-4" style={{ background: "linear-gradient(0deg,rgba(2,8,26,.95) 0%,rgba(2,8,26,.7) 42%,transparent 78%)" }}>
        <span className="text-[11px] font-bold" style={{ color: "#a7f3d0" }}>{t(CHAPTERS[day.chapter].name.en, CHAPTERS[day.chapter].name.ar)} · {t(`Day ${day.day}`, `اليوم ${day.day}`)}</span>
        <h3 className="mt-0.5 text-2xl font-black leading-tight" style={{ color: GOLD }}>{t(day.title.en, day.title.ar)}</h3>
        <p className="mt-1 line-clamp-2 text-[13px] leading-snug" style={{ color: "rgba(255,255,255,.85)" }}>{t(day.story.en, day.story.ar)}</p>
        <span className="rj-anim mt-3 inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-black" style={{ background: `linear-gradient(90deg,${GOLD},#f59e0b)`, color: "#422006", animation: "rj-pulse 2.4s infinite" }}>
          <BookOpen size={16} /> {verb}
          <span className="font-bold opacity-70">· {authored ? t("scenes, verses & a quiz", "مشاهد وآيات واختبار") : t("quest", "مهمة")} {count}/{day.tasks.length}</span>
        </span>
      </div>
    </motion.button>
  );
}

/* ── bottom sheet shell ── */
function Sheet({ children, onClose, dir, tall = false }: { children: React.ReactNode; onClose: () => void; dir: string; tall?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0" style={{ background: "rgba(2,8,26,.7)" }} onClick={onClose} />
      <motion.div dir={dir} role="dialog" aria-modal="true"
        className="relative w-full max-w-md overflow-y-auto rounded-t-3xl p-5 pb-8"
        style={{ maxHeight: tall ? "94vh" : "88vh", background: `linear-gradient(180deg,#0e2a4d,${NIGHT})`, border: "1px solid rgba(255,255,255,.14)", color: "#fff" }}
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 260, damping: 30 }}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "rgba(255,255,255,.1)" }}><X size={18} /></button>
        {children}
      </motion.div>
    </motion.div>
  );
}

function Finale({ onClose, xp, best, t, dir }: { onClose: () => void; xp: number; best: number; t: (en: string, ar: string) => string; dir: string }) {
  return (
    <Sheet onClose={onClose} dir={dir}>
      <Burst big />
      <div className="py-6 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 12 }}
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-full" style={{ background: `radial-gradient(circle,#fef3c7,${GOLD})`, boxShadow: "0 0 40px rgba(251,191,36,.8)" }}>
          <Trophy size={38} color={GOLD_D} />
        </motion.div>
        <h2 className="mt-4 text-3xl font-black" style={{ color: GOLD }}>{t("Eid Mubarak!", "عيد مبارك!")}</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed" style={{ color: "#e2e8f0" }}>
          {t("You walked the whole road, day after day. Taqabbal Allahu minna wa minkum.", "قطعتَ الطريق كله يومًا بعد يوم. تقبّل الله منا ومنكم.")}
        </p>
        <div className="mt-4 flex justify-center gap-3 text-sm font-bold">
          <span className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,.08)" }}><Zap size={14} className="inline" color={GOLD} /> {xp} XP</span>
          <span className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,.08)" }}><Flame size={14} className="inline" color="#fb923c" /> {t(`Best streak ${best}`, `أطول سلسلة ${best}`)}</span>
        </div>
      </div>
    </Sheet>
  );
}

function BadgesSheet({ badges, onClose, t, dir }: { badges: ReturnType<typeof badgesFor>; onClose: () => void; t: (en: string, ar: string) => string; dir: string }) {
  const Icon = { flame: Flame, star: Star, moon: Moon, trophy: Trophy } as const;
  return (
    <Sheet onClose={onClose} dir={dir}>
      <h2 className="pr-10 text-xl font-black" style={{ color: GOLD }}>{t("Your badges", "أوسمتك")}</h2>
      <p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,.7)" }}>{badges.filter((b) => b.earned).length}/{badges.length}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {badges.map((b) => {
          const I = Icon[b.icon];
          return (
            <div key={b.id} className="flex items-center gap-3 rounded-2xl p-3" style={{ background: b.earned ? "rgba(251,191,36,.16)" : "rgba(255,255,255,.05)", border: `1.5px solid ${b.earned ? GOLD : "rgba(255,255,255,.1)"}`, opacity: b.earned ? 1 : 0.5 }}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: b.earned ? GOLD : "rgba(255,255,255,.1)" }}>
                {b.earned ? <I size={20} color={GOLD_D} /> : <Lock size={16} color="rgba(255,255,255,.6)" />}
              </span>
              <span className="text-xs font-bold leading-tight">{t(b.name.en, b.name.ar)}</span>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
