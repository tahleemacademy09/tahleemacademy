import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BookOpen, Check, Flame, GraduationCap, HeartHandshake, Lock, Moon, RotateCcw, Sparkles, Star, Trophy, X, Zap,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  CHAPTERS, DAYS, RAMADAN_START, RAMADAN_YEAR, TOTAL_DAYS, badgesFor, computeProgress, currentDay, dayCount, dayDone,
  nextRank, rankFor, type Bi, type DayStatus, type JourneyDay, type TaskCat,
} from "@/lib/ramadanJourney";

/* ════════════════════════════════════════════════════════════════════════════════════════════
   Ramadan Journey — a story path of 30 levels. Finish a day's tasks and the traveller walks on to the next one.
   Layout: the path runs BOTTOM → TOP (day 1 at the bottom, the gate of Eid at the top, under the moon).
   ════════════════════════════════════════════════════════════════════════════════════════════ */

const W = 360, STEP = 122, BOTTOM = 130, TOP = 190;
const H = BOTTOM + TOTAL_DAYS * STEP + TOP;
const nodeX = (i: number) => (i >= TOTAL_DAYS ? W / 2 : W / 2 + Math.sin((i + 1) * 0.95) * 100);   // i = 0…29 days, 30 = Eid gate
const nodeY = (i: number) => H - BOTTOM - i * STEP;
const segD = (k: number) => {
  const x1 = nodeX(k), y1 = nodeY(k), x2 = nodeX(k + 1), y2 = nodeY(k + 1);
  return `M ${x1} ${y1} C ${x1} ${y1 - STEP * 0.55}, ${x2} ${y2 + STEP * 0.55}, ${x2} ${y2}`;
};
const pct = (v: number, of: number) => `${(v / of) * 100}%`;

const GOLD = "#fbbf24", GOLD_D = "#b45309", GREEN = "#10b981", GREEN_D = "#064e3b", NIGHT = "#071a33";

const CAT: Record<TaskCat, { icon: typeof BookOpen; color: string; label: Bi }> = {
  quran:     { icon: BookOpen,       color: "#34d399", label: { en: "Qur'an",    ar: "القرآن" } },
  salah:     { icon: Moon,           color: "#a78bfa", label: { en: "Salah & dhikr", ar: "الصلاة والذكر" } },
  charity:   { icon: HeartHandshake, color: "#fb7185", label: { en: "Charity",   ar: "الإحسان" } },
  knowledge: { icon: GraduationCap,  color: "#60a5fa", label: { en: "Knowledge", ar: "العلم" } },
};

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

  const toggle = useCallback((taskId: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      const adding = !next.has(taskId);
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

/* ── small pieces ── */
const buzz = (ms = 12) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };

/** text that is "told" letter by letter — the story feel */
function Told({ text, speed = 16 }: { text: string; speed?: number }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? text.length : 0);
  useEffect(() => {
    if (reduce) { setN(text.length); return; }
    setN(0);
    const id = setInterval(() => setN((v) => { if (v >= text.length) { clearInterval(id); return v; } return v + 1; }), speed);
    return () => clearInterval(id);
  }, [text, speed, reduce]);
  return <>{text.slice(0, n)}<span style={{ opacity: n < text.length ? 0.6 : 0 }}>▍</span></>;
}

/** a burst of sparkles — played when a day is completed */
function Burst({ big = false }: { big?: boolean }) {
  const reduce = useReducedMotion();
  const parts = useMemo(() => Array.from({ length: big ? 46 : 26 }, (_, i) => {
    const a = (i / (big ? 46 : 26)) * Math.PI * 2 + (i % 3) * 0.3;
    const d = 90 + ((i * 37) % 120);
    return { x: Math.cos(a) * d, y: Math.sin(a) * d - 30, r: (i * 53) % 360, c: ["#fbbf24", "#34d399", "#fde68a", "#a7f3d0", "#fb7185"][i % 5], s: 6 + (i % 4) * 2 };
  }), [big]);
  if (reduce) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-24 z-10" aria-hidden>
      {parts.map((p, i) => (
        <motion.span key={i} className="absolute block rounded-sm" style={{ width: p.s, height: p.s * 1.6, background: p.c }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 140], opacity: [1, 1, 0], rotate: p.r, scale: 1 }}
          transition={{ duration: 1.5, ease: "easeOut" }} />
      ))}
    </div>
  );
}

const STARS = (() => {
  let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 70 }, () => ({ x: r() * 100, y: r() * 100, d: 1 + r() * 2.2, t: 2 + r() * 4, o: 0.35 + r() * 0.6 }));
})();

const fmtDate = (day: number) => {
  const [y, m, d] = RAMADAN_START.split("-").map(Number);
  return new Date(y, m - 1, d + day - 1).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
};

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

  return (
    <div dir={dir} className="mx-auto w-full max-w-md px-3 pb-24 pt-3" style={{ color: "#fff" }}>
      <style>{`
        @keyframes rj-twinkle{0%,100%{opacity:var(--o);transform:scale(1)}50%{opacity:.15;transform:scale(.6)}}
        @keyframes rj-pulse{0%{box-shadow:0 0 0 0 rgba(251,191,36,.65)}70%{box-shadow:0 0 0 18px rgba(251,191,36,0)}100%{box-shadow:0 0 0 0 rgba(251,191,36,0)}}
        @keyframes rj-sway{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
        @keyframes rj-glow{0%,100%{filter:drop-shadow(0 0 6px rgba(251,191,36,.6))}50%{filter:drop-shadow(0 0 16px rgba(251,191,36,1))}}
        @media (prefers-reduced-motion: reduce){ .rj-anim{animation:none!important} }
      `}</style>

      {/* ── HUD ── */}
      <div className="sticky top-2 z-30 rounded-2xl p-3 shadow-lg backdrop-blur"
        style={{ background: "rgba(7,26,51,.88)", border: "1px solid rgba(255,255,255,.14)" }}>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center rounded-xl px-3 py-1.5" style={{ background: "rgba(251,146,60,.16)" }} aria-label={t("Daily streak", "سلسلة الأيام")}>
            <Flame size={22} color="#fb923c" className={prog.streak > 0 ? "rj-anim" : ""} style={prog.streak > 0 ? { animation: "rj-glow 2s ease-in-out infinite" } : { opacity: 0.5 }} />
            <span className="text-lg font-black leading-none" style={{ color: "#fdba74" }}>{prog.streak}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-extrabold" style={{ color: GOLD }}>{t(rank.name.en, rank.name.ar)}</span>
              <span className="shrink-0 text-xs font-bold" style={{ color: "#a7f3d0" }}><Zap size={11} className="inline" /> {prog.xp} XP</span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,.12)" }}>
              <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg,${GREEN},${GOLD})` }}
                initial={false} animate={{ width: `${(prog.daysDone / TOTAL_DAYS) * 100}%` }} transition={{ type: "spring", stiffness: 90, damping: 18 }} />
            </div>
            <div className="mt-1 flex justify-between text-[11px]" style={{ color: "rgba(255,255,255,.7)" }}>
              <span>{t(`${prog.daysDone} / ${TOTAL_DAYS} days`, `${prog.daysDone} / ${TOTAL_DAYS} يومًا`)}</span>
              {upNext && <span>{t(`${xpToNext} more day${xpToNext === 1 ? "" : "s"} to ${upNext.name.en}`, `${xpToNext} للوصول إلى «${upNext.name.ar}»`)}</span>}
            </div>
          </div>
          <button onClick={() => setBadgesOpen(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" aria-label={t("Badges", "الأوسمة")}
            style={{ background: "rgba(251,191,36,.16)" }}>
            <Trophy size={20} color={GOLD} />
          </button>
        </div>
      </div>

      {!live && (
        <div className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs" style={{ background: "rgba(251,191,36,.14)", border: "1px solid rgba(251,191,36,.35)", color: "#fde68a" }}>
          <Sparkles size={14} className="shrink-0" />
          <span className="flex-1">{t(`Rehearsal — Ramadan starts ${fmtDate(1)}. Every level is open to try; nothing here is saved to your account.`, `تجربة — يبدأ رمضان ${fmtDate(1)}. كل المراحل مفتوحة للتجربة ولا يُحفظ شيء في حسابك.`)}</span>
          <button onClick={() => { store.reset(); standing.current = 0; setPos({ x: nodeX(0), y: nodeY(0) }); }} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 font-bold" style={{ background: "rgba(0,0,0,.3)" }}>
            <RotateCcw size={12} /> {t("Reset", "إعادة")}
          </button>
        </div>
      )}
      {live && !store.cloud && !store.loading && (
        <p className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.8)" }}>
          {t("Your progress is being saved on this device only for now.", "يُحفظ تقدّمك على هذا الجهاز فقط حاليًا.")}
        </p>
      )}

      {/* ── the world ── */}
      <div dir="ltr" className="relative mt-3 overflow-hidden rounded-3xl" style={{ aspectRatio: `${W} / ${H}`, background: `linear-gradient(0deg,#0a3d2e 0%,#0b2a4a 38%,${NIGHT} 78%,#02081a 100%)`, border: "1px solid rgba(255,255,255,.1)" }}>
        {/* stars */}
        {STARS.map((s, i) => (
          <span key={i} className="rj-anim absolute rounded-full bg-white"
            style={{ left: `${s.x}%`, top: `${s.y * 0.8}%`, width: s.d, height: s.d, ["--o" as any]: s.o, opacity: s.o, animation: `rj-twinkle ${s.t}s ease-in-out ${i % 7 * 0.4}s infinite` }} />
        ))}
        {/* moon + Eid skyline at the top */}
        <div className="absolute left-1/2 -translate-x-1/2" style={{ top: pct(18, H) }}>
          <svg width="150" height="104" viewBox="0 0 150 104" aria-hidden>
            <defs><radialGradient id="rjm" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#fef3c7" /><stop offset="100%" stopColor="#fbbf24" /></radialGradient></defs>
            <circle cx="75" cy="50" r="38" fill="url(#rjm)" opacity=".18" />
            <path d="M92 26a30 30 0 1 0 0 48a24 24 0 1 1 0-48z" fill="url(#rjm)" />
            <path d="M12 104V84l7-10 7 10v20zM30 104V70l10-14 10 14v34zM58 104V58l17-22 17 22v46zM100 104V70l10-14 10 14v34zM124 104V84l7-10 7 10v20z" fill="#0b2a4a" opacity=".9" />
          </svg>
        </div>

        {/* path */}
        <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
          {Array.from({ length: TOTAL_DAYS }, (_, k) => <path key={`b${k}`} ref={(el) => { segRefs.current[k] = el; }} d={segD(k)} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="9" strokeLinecap="round" strokeDasharray="1 14" />)}
          {Array.from({ length: TOTAL_DAYS }, (_, k) => (
            <motion.path key={`l${k}`} d={segD(k)} fill="none" stroke={GOLD} strokeWidth="6" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 5px rgba(251,191,36,.8))" }}
              initial={false} animate={{ pathLength: doneSegments[k] ? 1 : 0, opacity: doneSegments[k] ? 1 : 0 }} transition={{ duration: reduce ? 0 : 0.9, ease: "easeInOut" }} />
          ))}
        </svg>

        {/* chapter banners */}
        {CHAPTERS.map((c, ci) => (
          <div key={ci} className="absolute left-1/2 z-[1] w-[78%] -translate-x-1/2 rounded-2xl px-3 py-2 text-center"
            style={{ top: pct(nodeY(c.from - 1) + STEP * 0.62, H), background: "rgba(2,8,26,.72)", border: "1px solid rgba(251,191,36,.4)" }}>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#a7f3d0" }}>{t(`Chapter ${ci + 1}`, `الفصل ${ci + 1}`)} · {t(`Days ${c.from}–${c.to}`, `الأيام ${c.from}–${c.to}`)}</div>
            <div className="text-sm font-black" style={{ color: GOLD }}>{t(c.name.en, c.name.ar)}</div>
          </div>
        ))}

        {/* nodes */}
        {DAYS.map((d, i) => (
          <Node key={d.day} d={d} i={i} status={prog.statuses[i]} count={dayCount(d, done)} current={prog.travelerDay === d.day} onOpen={() => openNode(d.day)} t={t} />
        ))}
        {/* Eid gate */}
        <button onClick={() => (allDone ? setOpenDay(TOTAL_DAYS + 1) : say(t("Finish all 30 days to open the gate of Eid", "أتمّ الأيام الثلاثين لتفتح باب العيد")))}
          className="absolute z-[2] flex flex-col items-center" style={{ left: pct(nodeX(TOTAL_DAYS), W), top: pct(nodeY(TOTAL_DAYS), H), transform: "translate(-50%,-50%)" }}>
          <span className={`flex h-16 w-16 items-center justify-center rounded-full ${allDone ? "rj-anim" : ""}`}
            style={{ background: allDone ? `radial-gradient(circle,#fef3c7,${GOLD})` : "rgba(255,255,255,.1)", border: `2px solid ${allDone ? "#fff" : "rgba(255,255,255,.3)"}`, animation: allDone ? "rj-pulse 2s infinite" : undefined }}>
            {allDone ? <Trophy size={28} color={GOLD_D} /> : <Lock size={22} color="rgba(255,255,255,.7)" />}
          </span>
          <span className="mt-1 rounded-full px-2 py-0.5 text-[11px] font-black" style={{ background: "rgba(2,8,26,.8)", color: GOLD }}>{t("Eid Mubarak", "عيد مبارك")}</span>
        </button>

        {/* the traveller */}
        <div ref={travelerRef} className="pointer-events-none absolute z-[3]" style={{ left: pct(pos.x, W), top: pct(pos.y, H), transform: "translate(-50%,-135%)" }}>
          <motion.div animate={reduce || walking ? { y: 0 } : { y: [0, -6, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            className="flex h-11 w-11 items-center justify-center rounded-full"
            style={{ background: "radial-gradient(circle at 35% 30%,#fff7d6,#fbbf24 60%,#b45309)", boxShadow: "0 0 22px rgba(251,191,36,.9)", border: "2px solid #fff" }}>
            <Moon size={20} color="#78350f" fill="#78350f" />
          </motion.div>
          <div className="mx-auto mt-0.5 h-1.5 w-5 rounded-full" style={{ background: "rgba(0,0,0,.45)", filter: "blur(2px)" }} />
        </div>
      </div>

      {/* ── today's quest button ── */}
      {!allDone && (
        <div className="sticky bottom-4 z-30 mt-4 flex justify-center">
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => openNode(todayDay)}
            className="rj-anim inline-flex items-center gap-3 rounded-full px-5 py-3 text-sm font-black shadow-xl"
            style={{ background: `linear-gradient(90deg,${GOLD},#f59e0b)`, color: "#422006", animation: "rj-pulse 2.4s infinite" }}>
            <Sparkles size={18} />
            {t(`Day ${todayDay} quest`, `مهمة اليوم ${todayDay}`)} · {dayCount(todayInfo, done)}/{todayInfo.tasks.length}
          </motion.button>
        </div>
      )}

      {/* ── toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-full px-4 py-2 text-sm font-bold shadow-xl" style={{ background: "#fff", color: GREEN_D }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── sheets ── */}
      <AnimatePresence>
        {openDay !== null && openDay <= TOTAL_DAYS && (
          <DaySheet key="day" day={DAYS[openDay - 1]} done={done} toggle={store.toggle} onClose={() => setOpenDay(null)} streak={prog.streak} t={t} dir={dir}
            canEdit={openDay <= unlocked} />
        )}
        {openDay === TOTAL_DAYS + 1 && <Finale key="eid" onClose={() => setOpenDay(null)} xp={prog.xp} best={prog.bestStreak} t={t} dir={dir} />}
        {badgesOpen && <BadgesSheet key="badges" badges={badges} onClose={() => setBadgesOpen(false)} t={t} dir={dir} />}
      </AnimatePresence>
    </div>
  );
}

/* ── one level on the path ── */
function Node({ d, i, status, count, current, onOpen, t }: { d: JourneyDay; i: number; status: DayStatus; count: number; current: boolean; onOpen: () => void; t: (en: string, ar: string) => string }) {
  const x = nodeX(i), y = nodeY(i);
  const right = x < W / 2;                               // label goes toward the middle of the map
  const locked = status === "locked", done = status === "done";
  const bg = done ? `radial-gradient(circle at 35% 30%,#fff7d6,${GOLD})`
    : locked ? "rgba(255,255,255,.08)"
    : status === "partial" ? `conic-gradient(${GREEN} ${(count / d.tasks.length) * 360}deg, rgba(255,255,255,.18) 0)`
    : `linear-gradient(160deg,${GREEN},${GREEN_D})`;
  return (
    <div className="absolute z-[2]" style={{ left: pct(x, W), top: pct(y, H), transform: "translate(-50%,-50%)" }}>
      <motion.button onClick={onOpen} whileTap={{ scale: 0.9 }} whileHover={locked ? undefined : { scale: 1.08 }}
        aria-label={t(`Day ${d.day}: ${d.title.en}`, `اليوم ${d.day}: ${d.title.ar}`)}
        className={`relative flex h-[50px] w-[50px] items-center justify-center rounded-full ${current ? "rj-anim" : ""}`}
        style={{ background: bg, border: `2.5px solid ${done ? "#fff" : locked ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.75)"}`, animation: current ? "rj-pulse 2s infinite" : undefined, boxShadow: d.qadr && !locked ? "0 0 18px rgba(251,191,36,.75)" : undefined }}>
        {status === "partial" && <span className="absolute inset-[5px] rounded-full" style={{ background: GREEN_D }} />}
        <span className="relative">
          {done ? <Check size={24} color={GOLD_D} strokeWidth={3.2} />
            : locked ? <Lock size={17} color="rgba(255,255,255,.55)" />
            : <span className="text-base font-black text-white">{d.day}</span>}
        </span>
        {d.qadr && <Star size={15} fill={GOLD} color={GOLD} className="absolute -right-1 -top-1" style={{ filter: "drop-shadow(0 0 4px #fbbf24)" }} />}
      </motion.button>
      <span className="pointer-events-none absolute top-1/2 w-[112px] -translate-y-1/2 rounded-lg px-1.5 py-1 text-[11px] font-bold leading-tight"
        style={{ [right ? "left" : "right"]: 58, textAlign: right ? "left" : "right", background: "rgba(2,8,26,.62)", color: locked ? "rgba(255,255,255,.45)" : "#fff" } as any}>
        {t(d.title.en, d.title.ar)}
      </span>
    </div>
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

/* ── a day: story + tasks ── */
function DaySheet({ day, done, toggle, onClose, streak, canEdit, t, dir }: {
  day: JourneyDay; done: ReadonlySet<string>; toggle: (id: string) => void; onClose: () => void; streak: number; canEdit: boolean;
  t: (en: string, ar: string) => string; dir: string;
}) {
  const complete = dayDone(day, done);
  const wasComplete = useRef(complete);
  const [celebrate, setCelebrate] = useState(false);
  const [floats, setFloats] = useState<{ id: number; taskId: string; xp: number }[]>([]);
  const fid = useRef(0);
  const total = day.tasks.reduce((a, x) => a + x.xp, 0);
  const next = DAYS[day.day] as JourneyDay | undefined;
  const chapterEnd = CHAPTERS.find((c) => c.to === day.day);

  useEffect(() => {
    if (complete && !wasComplete.current) { setCelebrate(true); buzz(60); }
    if (!complete) setCelebrate(false);
    wasComplete.current = complete;
  }, [complete]);

  const tick = (id: string, xp: number) => {
    if (!canEdit) return;
    const adding = !done.has(id);
    toggle(id);
    if (adding) { buzz(14); const n = ++fid.current; setFloats((f) => [...f, { id: n, taskId: id, xp }]); setTimeout(() => setFloats((f) => f.filter((x) => x.id !== n)), 1100); }
  };

  return (
    <Sheet onClose={onClose} dir={dir} tall>
      {celebrate && <Burst big={!!chapterEnd} />}
      <div className="pr-10">
        <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-extrabold" style={{ background: "rgba(251,191,36,.18)", color: GOLD }}>
          {t(CHAPTERS[day.chapter].name.en, CHAPTERS[day.chapter].name.ar)} · {t(`Day ${day.day}`, `اليوم ${day.day}`)}
        </span>
        {day.qadr && <span className="ms-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold" style={{ background: "rgba(167,139,250,.2)", color: "#ddd6fe" }}><Star size={11} fill="#ddd6fe" /> {t("Odd night — seek Laylatul Qadr", "ليلة وتر — تحرَّ ليلة القدر")}</span>}
        <h2 className="mt-2 text-2xl font-black" style={{ color: "#fff" }}>{t(day.title.en, day.title.ar)}</h2>
      </div>
      <p className="mt-2 min-h-[3.2rem] rounded-2xl px-4 py-3 text-sm leading-relaxed" style={{ background: "rgba(255,255,255,.07)", color: "#e2e8f0", borderInlineStart: `3px solid ${GOLD}` }}>
        <Told key={day.day} text={t(day.story.en, day.story.ar)} />
      </p>

      <div className="mt-4 flex items-center justify-between text-xs font-bold" style={{ color: "rgba(255,255,255,.75)" }}>
        <span>{t("Today's quests", "مهام اليوم")}</span>
        <span>{dayCount(day, done)}/{day.tasks.length} · {total} XP</span>
      </div>
      <ul className="mt-2 space-y-2.5">
        {day.tasks.map((task) => {
          const on = done.has(task.id);
          const C = CAT[task.cat];
          return (
            <li key={task.id} className="relative">
              <motion.button whileTap={canEdit ? { scale: 0.97 } : undefined} onClick={() => tick(task.id, task.xp)} aria-pressed={on} disabled={!canEdit}
                className="flex w-full items-center gap-3 rounded-2xl p-3 text-start"
                style={{ background: on ? "rgba(16,185,129,.2)" : "rgba(255,255,255,.07)", border: `1.5px solid ${on ? GREEN : "rgba(255,255,255,.14)"}`, opacity: canEdit ? 1 : 0.6 }}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${C.color}26` }}><C.icon size={20} color={C.color} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold" style={{ color: C.color }}>{t(C.label.en, C.label.ar)} · +{task.xp} XP</span>
                  <span className="block text-sm font-semibold leading-snug" style={{ color: "#fff", textDecoration: on ? "line-through" : "none", textDecorationColor: "rgba(255,255,255,.5)" }}>{t(task.text.en, task.text.ar)}</span>
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
      {!canEdit && <p className="mt-3 text-center text-xs" style={{ color: "rgba(255,255,255,.6)" }}>{t("This level is not open yet.", "هذه المرحلة لم تُفتح بعد.")}</p>}

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
            {next && <p className="mt-2 text-xs" style={{ color: "rgba(255,255,255,.8)" }}>{t("Next on the road:", "على الطريق بعدها:")} <b>{t(next.title.en, next.title.ar)}</b></p>}
            <button onClick={onClose} className="mt-3 w-full rounded-xl py-2.5 text-sm font-black" style={{ background: GOLD, color: "#422006" }}>
              {next ? t("Continue the journey", "تابع الرحلة") : t("See the gate of Eid", "إلى باب العيد")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
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
