// src/pages/student/HifdhProgramHome.tsx  (v3 — two tabs: Memorization · Review)
// Memorization: this week's page(s) (shown automatically, sized by the admin-set level), the
//   admin-set memorization days, and a Join button that opens the Quran Memorization live class.
// Review: what the student has memorized + the ustadh assigned for the weekly live review,
//   with a Join button on the assigned day.

import { useRevisionAssignedCount } from "@/hooks/useRevisionAssignedCount";
import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLiveClass } from "@/contexts/LiveClassContext";
import { useToast } from "@/hooks/use-toast";
import MushafPageView from "@/components/hifdh/MushafPageView";
import { hpPortionLabel, hpPagesOf, hpSegmentFor, hpUnitsFor, hpReviewRange } from "@/lib/hifdhPortion";
import {
  Loader2, BookOpen, Video, CheckCircle2, AlertTriangle, Lock, Flame, Layers,
  ChevronRight, ArrowLeft, Users, BarChart3,
} from "lucide-react";

const hhDb = supabase as any;
const DailyRevision = lazy(() => import("./HifdhDailyRevisionPage"));

const HH_DARK = "#0f2e1f";
const HH_GREEN = "#064E3B";
const HH_GOLD = "#C9A84C";
const HH_INK = "#1a1a2e";
const HH_MUTED = "#6b7a72";
const HH_LINE = "#e3e9e5";
const HH_BG = "#f6f8f6";
const HH_RED = "#DC2626";
const HH_OK = "#16A34A";
const HH_AMBER = "#D97706";

const hhIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hhMonday = () => {
  const x = new Date();
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return hhIso(x);
};
const hhNextWeek = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return hhIso(new Date(y, m - 1, d + 7));
};
/** Today as 1 = Monday … 7 = Sunday (the numbering the admin settings use) */
const hhTodayN = () => ((new Date().getDay() + 6) % 7) + 1;
const HH_DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hhTime = (t?: string | null) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

const HH_TASK_LABEL: Record<string, { text: string; color: string }> = {
  pending: { text: "Getting ready", color: HH_MUTED },
  read_cleared: { text: "Memorize this", color: HH_AMBER },
  submitted: { text: "Waiting for your ustadh", color: HH_GREEN },
  passed: { text: "Memorized ✓", color: HH_OK },
  failed: { text: "Repeat this page", color: HH_RED },
};
const HH_CAN_SUBMIT = ["read_cleared", "failed"];

const HhPill = ({ text, color }: { text: string; color: string }) => (
  <span style={{ background: color + "1a", color, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, whiteSpace: "nowrap" }}>{text}</span>
);

const HhBtn = ({ children, onClick, disabled, gold }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; gold?: boolean }) => (
  <button onClick={onClick} disabled={disabled} style={{
    width: "100%", padding: "14px 14px", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800,
    cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    background: gold ? HH_GOLD : HH_GREEN, color: gold ? HH_INK : "#fff",
  }}>{children}</button>
);

const HhStat = ({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) => (
  <div style={{ flex: 1, background: "#ffffff12", border: "1px solid #ffffff22", borderRadius: 14, padding: "10px 4px", textAlign: "center", color: "#fff" }}>
    <div style={{ display: "flex", justifyContent: "center", marginBottom: 2 }}>{icon}</div>
    <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
    <div style={{ fontSize: 10, letterSpacing: 0.6, opacity: 0.7, marginTop: 2 }}>{label}</div>
  </div>
);

const HhPageChips = ({ pages, active, onPick }: { pages: number[]; active: number; onPick: (p: number) => void }) => (
  <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 2px 6px" }}>
    {pages.map((p) => (
      <button key={p} onClick={() => onPick(p)} aria-label={`Page ${p}`} style={{
        flex: "0 0 auto", width: 38, height: 38, borderRadius: "50%", cursor: "pointer", fontSize: 13, fontWeight: 800,
        border: `2px solid ${p === active ? HH_GOLD : HH_LINE}`, background: p === active ? "#fbf3da" : "#f1f3f2",
        color: p === active ? HH_INK : HH_MUTED,
      }}>{p}</button>
    ))}
  </div>
);

/** The page is always shown whole; this says which half of it is the student's portion */
const hhHalfHint = (page: number, p: { page_from: number; page_to: number; half_from?: number | null; half_to?: number | null }) => {
  const [a, b] = hpSegmentFor(page, p);
  if (a === 0 && b === 1) return null;
  return a === 0 ? "top half of this page" : "bottom half of this page";
};
const HhHint = ({ text }: { text: string | null }) => text ? (
  <div style={{ margin: "0 0 4px", padding: "4px 10px", borderRadius: 10, background: "#fbf3da", border: `1px solid ${HH_GOLD}88`, color: "#78350F", fontSize: 11, fontWeight: 700 }}>
    Your portion: the {text}
  </div>
) : null;


/** Full-screen shell: title bar on top, content below (module-level so children never remount) */
const HhScreen = ({ title, onBack, right, bg, children }: { title: string; onBack: () => void; right?: React.ReactNode; bg: string; children: React.ReactNode }) => (
  <div style={{ position: "fixed", inset: 0, zIndex: 250, background: bg, display: "flex", flexDirection: "column" }}>
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", paddingTop: "calc(8px + env(safe-area-inset-top, 0px))",
      background: HH_DARK, color: "#fff",
    }}>
      <button onClick={onBack} aria-label="Back" style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: "#ffffff1f", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><ArrowLeft size={18} /></button>
      <div style={{ flex: 1, fontWeight: 800, fontSize: 15 }}>{title}</div>
      {right}
    </div>
    {children}
  </div>
);

/** Page navigator + hint + Quran page (+ optional footer) */
const HhQuran = ({ portion, pages, cur, pick, bg, qSize, onBg, topExtra = 0, footer, footerH = 0 }: {
  portion: any; pages: number[]; cur?: number; pick: (p: number) => void; bg: string; qSize: number; onBg: (c: string) => void;
  topExtra?: number; footer?: React.ReactNode; footerH?: number;
}) => {
  const hint = cur ? hhHalfHint(cur, portion) : null;
  return (
    <>
      {pages.length > 1 && cur && <div style={{ padding: "4px 10px 0", background: bg }}><HhPageChips pages={pages} active={cur} onPick={pick} /></div>}
      {hint && <div style={{ padding: "0 10px", background: bg }}><HhHint text={hint} /></div>}
      <div style={{ flex: 1, overflowY: "auto", padding: "2px 6px 8px", display: "flex", flexDirection: "column" }}>
        <div style={{ margin: "auto 0", width: "100%" }}>
          {cur && (
            <MushafPageView
              page={cur} fontSize={qSize} seamless onBackground={onBg}
              fitHeight={topExtra + 52 + (pages.length > 1 ? 58 : 0) + (hint ? 32 : 0) + footerH + 16}
            />
          )}
        </div>
      </div>
      {footer}
    </>
  );
};

type View = null | "memorize" | "daily" | "weekly";

export default function HifdhProgramHome() {
  const { user } = useAuth();
  const { joinClass } = useLiveClass();
  const navigate = useNavigate();
  const { toast } = useToast();
  const week = hhMonday();
  const today = hhIso(new Date());
  const todayN = hhTodayN();

  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>(null);
  const [program, setProgram] = useState<any>(null);
  const [level, setLevel] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [liveSubject, setLiveSubject] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [review, setReview] = useState<any>(null);
  const [fines, setFines] = useState<any[]>([]);
  const [reviewAsg, setReviewAsg] = useState<any>(null);
  const [reviewUstadh, setReviewUstadh] = useState("");
  const [revDays, setRevDays] = useState(0);
  const [doneToday, setDoneToday] = useState(false);
  const revisionPending = useRevisionAssignedCount(user?.id, String(doneToday));
  const [busy, setBusy] = useState(false);
  const [selSlot, setSelSlot] = useState<number>(1);
  const [selPage, setSelPage] = useState<number | null>(null);
  const [recPage, setRecPage] = useState<number | null>(null);
  const [pageBg, setPageBg] = useState("#fffdf6");
  const [qSize, setQSize] = useState<number>(() => {
    try { return Number(localStorage.getItem("hifdh_qsize")) || 26; } catch { return 26; }
  });
  const bump = (d: number) => setQSize((v) => {
    const n = Math.min(40, Math.max(20, v + d));
    try { localStorage.setItem("hifdh_qsize", String(n)); } catch { /* ignore */ }
    return n;
  });

  const load = useCallback(async () => {
    if (!user?.id) return;
    const sid = user.id;
    const { data: prog } = await hhDb.from("hifdh_program").select("*").eq("student_id", sid)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    setProgram(prog || null);
    if (!prog) { setLoading(false); return; }

    // make sure this week's portions exist (sized by the level, placed at the student's position)
    if (prog.status === "active") await hhDb.rpc("hifdh_ensure_week", { p_student: sid });

    const [lv, st, tk, rc, rv, fn, lg, ra] = await Promise.all([
      prog.level_id ? hhDb.from("hifdh_levels").select("*").eq("id", prog.level_id).maybeSingle() : Promise.resolve({ data: null }),
      hhDb.from("hifdh_settings").select("*").eq("id", true).maybeSingle(),
      hhDb.from("hifdh_memorization_tasks").select("*").eq("student_id", sid).eq("week_start", week).order("slot"),
      hhDb.from("hifdh_memorization_tasks").select("*").eq("student_id", sid).eq("status", "passed")
        .order("week_start", { ascending: true }).order("slot", { ascending: true }).limit(500),
      hhDb.from("hifdh_weekly_reviews").select("*").eq("student_id", sid).eq("week_start", week).maybeSingle(),
      hhDb.from("hifdh_fines").select("*").eq("student_id", sid).eq("status", "unpaid"),
      hhDb.from("hifdh_daily_logs").select("log_date,completed").eq("student_id", sid).eq("completed", true)
        .gte("log_date", week).lt("log_date", hhNextWeek(week)),
      hhDb.from("hifdh_review_assignments").select("*").eq("student_id", sid).eq("week_start", week).maybeSingle(),
    ]);
    setLevel(lv.data || null);
    setSettings(st.data || null);
    setTasks(tk.data || []);
    setRecent(rc.data || []);
    setReview(rv.data || null);
    setFines(fn.data || []);
    setReviewAsg(ra.data || null);
    const logs: any[] = lg.data || [];
    setRevDays(new Set(logs.map((l) => l.log_date)).size);
    setDoneToday(logs.some((l) => l.log_date === today));

    if (ra.data?.ustadh_id) {
      const { data: rp } = await hhDb.from("profiles").select("full_name").eq("user_id", ra.data.ustadh_id).maybeSingle();
      setReviewUstadh(rp?.full_name || "");
    } else setReviewUstadh("");

    const liveId = st.data?.readalong_subject_id;
    if (liveId) {
      const [sb, tt] = await Promise.all([
        hhDb.from("subjects").select("*").eq("id", liveId).maybeSingle(),
        hhDb.from("subject_timetable").select("day_of_week,start_time").eq("subject_id", liveId).eq("is_active", true),
      ]);
      setLiveSubject(sb.data || null);
      setSlots(tt.data || []);
    }
    setLoading(false);
  }, [user?.id, week, today]);

  useEffect(() => { load(); }, [load]);

  const taskOf = (s: number) => tasks.find((t) => t.slot === s);
  const activeTask = taskOf(selSlot);
  const activePages = useMemo(() => (activeTask ? hpPagesOf(activeTask) : []), [activeTask]);
  const shownPage = selPage && activePages.includes(selPage) ? selPage : activePages[0];

  // default to the first session that still needs work
  useEffect(() => {
    if (!tasks.length) return;
    const next = tasks.find((t) => HH_CAN_SUBMIT.includes(t.status)) || tasks[0];
    setSelSlot(next.slot);
    setSelPage(null);
  }, [tasks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // everything memorized in the current round of 5 pages
  const recTask = useMemo(() => hpReviewRange(recent), [recent]);
  const recPages = useMemo(() => (recTask ? hpPagesOf(recTask) : []), [recTask]);
  const recShown = recPage && recPages.includes(recPage) ? recPage : recPages[0];

  const submitTask = async (id: string) => {
    setBusy(true);
    const { error } = await hhDb.from("hifdh_memorization_tasks")
      .update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", id);
    setBusy(false);
    if (error) toast({ title: "Couldn't submit", description: error.message, variant: "destructive" });
    else { toast({ title: "Submitted to your ustadh" }); load(); }
  };

  const joinLive = () => {
    if (!liveSubject) return toast({ title: "Class not available yet", variant: "destructive" });
    joinClass(liveSubject);
  };

  // Weekly review: every ustadh has their own private room, so each ustadh's students meet only together
  const joinReview = async () => {
    if (!reviewAsg?.ustadh_id) return toast({ title: "Your ustadh isn't assigned yet", variant: "destructive" });
    setBusy(true);
    const { data, error } = await hhDb.rpc("hifdh_review_room", { p_ustadh: reviewAsg.ustadh_id });
    setBusy(false);
    if (error || !data) return toast({ title: "Couldn't open the review room", description: error?.message, variant: "destructive" });
    joinClass(data);
  };

  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Loader2 className="animate-spin" color={HH_GOLD} /></div>;
  }

  if (!program) {
    return (
      <div style={{ padding: 20, maxWidth: 520, margin: "0 auto", textAlign: "center", color: HH_MUTED }}>
        <BookOpen size={36} color={HH_GOLD} style={{ marginBottom: 10 }} />
        <div style={{ fontWeight: 800, fontSize: 18, color: HH_INK, marginBottom: 6 }}>Hifdh Program</div>
        You're not enrolled in the Hifdh program yet. Please speak to the admin.
      </div>
    );
  }

  const suspended = program.status === "suspended";
  const unpaidTotal = fines.reduce((n, f) => n + Number(f.amount), 0);
  const limit = settings?.streak_limit ?? 3;
  const memDays: number[] = (settings?.memorization_days || []).slice().sort((a: number, b: number) => a - b);
  const doneCount = tasks.filter((t) => ["submitted", "passed"].includes(t.status)).length;
  const showBanner = suspended || fines.length > 0 || program.miss_streak > 0;
  const perSession = level ? hpUnitsFor(level.daily_pages) : 1;
  const amountLabel = perSession === 1 ? "½ page" : perSession % 2 === 0 ? `${perSession / 2} page${perSession === 2 ? "" : "s"}` : `${Math.floor(perSession / 2)}½ pages`;

  const slotTime = (dayN: number) => hhTime(slots.find((s) => s.day_of_week === dayN % 7)?.start_time);
  const isMemDay = memDays.includes(todayN);
  const nextMemDay = memDays.find((d) => d > todayN) ?? memDays[0];
  // Weekly review is open on ANY of the admin's review days (default Fri–Sun) — from the first
  // to the last — until the deadline (end of the last review day). The assigned day is only a suggestion.
  const reviewDays: number[] = ((settings?.review_days?.length ? settings.review_days : [5, 6, 7]) as number[]).slice().sort((a, b) => a - b);
  const rvFirst = reviewDays[0];
  const rvLast = reviewDays[reviewDays.length - 1];
  const reviewOpen = !!reviewAsg && !review && todayN >= rvFirst && todayN <= rvLast;
  const reviewClosed = !!reviewAsg && !review && todayN > rvLast;
  const memorizePending = tasks.filter((t) => HH_CAN_SUBMIT.includes(t.status)).length;
  const nextRevDay = reviewDays.find((d) => d > todayN) ?? rvFirst;
  const ustadhName = reviewUstadh ? `Ustadh ${reviewUstadh.replace(/^Ustadh\s+/i, "")}` : "Ustadh not assigned yet";

  const reviewStatus = review
    ? { text: "Done ✓", color: HH_OK }
    : reviewOpen ? { text: `Open until ${HH_DAY_SHORT[rvLast - 1]}`, color: HH_GREEN }
    : reviewClosed ? { text: "Closed", color: HH_RED }
    : { text: `Opens ${HH_DAY_SHORT[nextRevDay - 1]}`, color: HH_MUTED };

  /* ───── small building blocks ───── */
  const Chip = ({ onClick, children, on, disabled }: { onClick?: () => void; children: React.ReactNode; on?: boolean; disabled?: boolean }) => (
    <button onClick={onClick} disabled={disabled} style={{
      textAlign: "left", background: "#fff", borderRadius: 12, padding: "6px 9px", minWidth: 0, cursor: disabled ? "default" : "pointer",
      border: `2px solid ${on ? HH_GOLD : HH_LINE}`, opacity: disabled ? 0.55 : 1,
    }}>{children}</button>
  );

  const JoinBtn = ({ onClick, disabled, label }: { onClick?: () => void; disabled?: boolean; label: string }) => (
    <button onClick={onClick} disabled={disabled} style={{
      border: "none", borderRadius: 12, padding: "0 12px", height: 46, whiteSpace: "nowrap", fontSize: 12, fontWeight: 800,
      display: "inline-flex", alignItems: "center", gap: 6, cursor: disabled ? "default" : "pointer",
      background: disabled ? "#e8ece9" : HH_GREEN, color: disabled ? HH_MUTED : "#fff",
    }}><Video size={15} />{label}</button>
  );

  const TextSize = () => (
    <div style={{ display: "flex", gap: 6 }}>
      <button onClick={() => bump(-2)} aria-label="Smaller text" style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${HH_LINE}`, background: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>A−</button>
      <button onClick={() => bump(2)} aria-label="Larger text" style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${HH_LINE}`, background: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>A+</button>
    </div>
  );

  /* ───── overview card ───── */
  const OCard = ({ icon, title, sub, pill, badge, onClick, accent }: {
    icon: React.ReactNode; title: string; sub: string; pill?: { text: string; color: string }; badge?: number; onClick: () => void; accent?: boolean;
  }) => (
    <button onClick={onClick} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: "pointer",
      background: "#fff", borderRadius: 16, padding: 14, border: `2px solid ${accent ? HH_GOLD : HH_LINE}`,
    }}>
      <div style={{ position: "relative", width: 44, height: 44, borderRadius: 13, background: HH_GREEN + "14", color: HH_GREEN, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
        {!!badge && <span style={{ position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "#ef4444", color: "#fff", fontSize: 11, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{badge}</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: HH_INK }}>{title}</div>
        <div style={{ fontSize: 12, color: HH_MUTED, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
        {pill && <div style={{ marginTop: 6 }}><HhPill text={pill.text} color={pill.color} /></div>}
      </div>
      <ChevronRight size={20} color={HH_MUTED} />
    </button>
  );

  const taskPill = (t?: any) => (t ? HH_TASK_LABEL[t.status] : null);
  const memSub = tasks.length
    ? tasks.map((t) => hpPortionLabel(t).replace(/^Page /, "P")).join("  ·  ")
    : "Your page for this week will appear here";
  const memNext = isMemDay ? `Class today${slotTime(todayN) ? ` · ${slotTime(todayN)}` : ""}` : nextMemDay ? `Next class ${HH_DAY_SHORT[nextMemDay - 1]}` : "Days not set";

  return (
    <div style={{ background: HH_BG, minHeight: "100%" }}>
      {/* Hero */}
      <div style={{ background: `linear-gradient(160deg,${HH_DARK},#14402c)`, padding: "16px 14px 18px", color: "#fff" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>Hifdh Program</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                {level ? `${level.name} · ${amountLabel} per session` : "Level not set yet"}
              </div>
            </div>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 22, color: HH_GOLD }}>برنامج الحفظ</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <HhStat icon={<Layers size={16} color={HH_GOLD} />} value={program.current_page} label="PAGE" />
            <HhStat icon={<CheckCircle2 size={16} color="#4ade80" />} value={`${doneCount}/2`} label="DONE" />
            <HhStat icon={<AlertTriangle size={16} color={program.miss_streak ? "#f87171" : "#ffffff88"} />} value={program.miss_streak} label="MISSED" />
            <HhStat icon={<Flame size={16} color="#fb923c" />} value={`${revDays}d`} label="REVISION" />
          </div>
        </div>
      </div>

      {/* Overview */}
      <div style={{ maxWidth: 560, margin: "0 auto", padding: 14, display: "grid", gap: 12 }}>
        {showBanner && (
          <div style={{
            borderRadius: 14, padding: 12, fontSize: 13, display: "flex", gap: 10, alignItems: "flex-start",
            background: suspended ? "#fef2f2" : "#fffbeb", border: `1px solid ${suspended ? "#fecaca" : "#fde68a"}`, color: HH_INK,
          }}>
            {suspended ? <Lock size={18} color={HH_RED} /> : <AlertTriangle size={18} color={HH_AMBER} />}
            <div>
              {suspended && <div style={{ fontWeight: 800, color: HH_RED }}>Your Hifdh program is on hold</div>}
              {suspended && <div style={{ color: HH_MUTED }}>Please contact the admin to be reinstated. Your other classes are not affected.</div>}
              {!suspended && program.miss_streak > 0 && (
                <div><b>{program.miss_streak} missed week{program.miss_streak > 1 ? "s" : ""} in a row.</b> {Math.max(0, limit - program.miss_streak)} more will put the program on hold.</div>
              )}
              {fines.length > 0 && <div style={{ marginTop: suspended || program.miss_streak > 0 ? 4 : 0 }}>Unpaid fine{fines.length > 1 ? "s" : ""}: <b>₦{unpaidTotal.toLocaleString()}</b></div>}
            </div>
          </div>
        )}

        {!suspended && (
          <>
            <OCard
              accent={memorizePending > 0}
              icon={<BookOpen size={22} />} title="Memorization" badge={memorizePending}
              sub={`${memSub}`}
              pill={{ text: `${doneCount}/2 done · ${memNext}`, color: doneCount >= 2 ? HH_OK : HH_GREEN }}
              onClick={() => setView("memorize")}
            />
            <OCard
              icon={<BarChart3 size={22} />} title="Daily revision"
              sub={doneToday ? "Done today ✓" : `${revDays} day${revDays === 1 ? "" : "s"} this week`}
              pill={doneToday ? { text: "Done today", color: HH_OK } : { text: "Pending today", color: HH_AMBER }}
              badge={doneToday ? 0 : revisionPending > 0 ? revisionPending : 0}
              onClick={() => setView("daily")}
            />
            <OCard
              accent={reviewOpen}
              icon={<Users size={22} />} title="Weekly review"
              sub={reviewAsg ? ustadhName : "Live with your ustadh"}
              pill={reviewAsg ? reviewStatus : { text: "Not assigned yet", color: HH_MUTED }}
              badge={reviewOpen ? 1 : 0}
              onClick={() => setView("weekly")}
            />
          </>
        )}
      </div>

      {/* ───────── MEMORIZATION · full screen ───────── */}
      {view === "memorize" && !suspended && (
        <HhScreen bg={pageBg} title="Memorization" onBack={() => setView(null)} right={<TextSize />}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) auto", gap: 6, padding: "8px 10px", background: pageBg }}>
            {[1, 2].map((s) => {
              const t = taskOf(s);
              const lb = taskPill(t);
              const dayN = memDays[s - 1];
              return (
                <Chip key={s} on={selSlot === s && !!t} disabled={!t} onClick={() => { setSelSlot(s); setSelPage(null); }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: HH_MUTED, letterSpacing: 0.5 }}>
                    S{s}{dayN ? ` · ${HH_DAY_SHORT[dayN - 1].toUpperCase()}` : ""}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: HH_INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {t ? hpPortionLabel(t).replace("Page ", "P").replace(" · ", " ") : "—"}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: lb?.color || HH_MUTED }}>{lb ? lb.text : "Not ready"}</div>
                </Chip>
              );
            })}
            <JoinBtn
              onClick={joinLive} disabled={!isMemDay}
              label={isMemDay ? `Join${slotTime(todayN) ? ` · ${slotTime(todayN).replace(":00", "")}` : ""}` : nextMemDay ? HH_DAY_SHORT[nextMemDay - 1] : "—"}
            />
          </div>
          {!activeTask ? (
            <div style={{ padding: 20, fontSize: 13, color: HH_MUTED, textAlign: "center" }}>Your page for this week will show here.</div>
          ) : (
            <HhQuran bg={pageBg} qSize={qSize} onBg={setPageBg}
              portion={activeTask} pages={activePages} cur={shownPage} pick={setSelPage}
              topExtra={62}
              footerH={HH_CAN_SUBMIT.includes(activeTask.status) ? 76 : 0}
              footer={HH_CAN_SUBMIT.includes(activeTask.status) ? (
                <div style={{ padding: 10, paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))", background: pageBg, borderTop: "1px solid rgba(0,0,0,.06)" }}>
                  <HhBtn gold disabled={busy} onClick={() => submitTask(activeTask.id)}>
                    {activeTask.status === "failed" ? "I've repeated it — submit again" : "I've memorized this — submit"}
                  </HhBtn>
                </div>
              ) : undefined}
            />
          )}
        </HhScreen>
      )}

      {/* ───────── DAILY REVISION · full screen ───────── */}
      {view === "daily" && !suspended && (
        <HhScreen bg={pageBg} title="Daily revision" onBack={() => setView(null)}>
          <div style={{ flex: 1, overflowY: "auto", background: "#fff" }}>
            <Suspense fallback={<div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 className="animate-spin" color={HH_GOLD} /></div>}>
              <div style={{ minWidth: 0, maxWidth: "100vw", overflowX: "clip" }}><DailyRevision embedded /></div>
            </Suspense>
          </div>
        </HhScreen>
      )}

      {/* ───────── WEEKLY REVIEW · full screen ───────── */}
      {view === "weekly" && !suspended && (
        <HhScreen bg={pageBg} title="Weekly review" onBack={() => setView(null)} right={<TextSize />}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: pageBg }}>
            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${HH_LINE}`, borderRadius: 12, padding: "0 10px", height: 46 }}>
              <Users size={16} color={HH_GREEN} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: HH_INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ustadhName}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: reviewStatus.color }}>{reviewStatus.text}</div>
              </div>
            </div>
            {reviewAsg && !review && (
              <JoinBtn onClick={joinReview} disabled={!reviewOpen || busy} label={reviewOpen ? "Join" : reviewClosed ? "Closed" : HH_DAY_SHORT[nextRevDay - 1]} />
            )}
            {review && <HhPill text="Done ✓" color={HH_OK} />}
          </div>
          {!recTask ? (
            <div style={{ padding: 20, fontSize: 13, color: HH_MUTED, textAlign: "center" }}>
              Portions appear here once your ustadh marks them memorized.
            </div>
          ) : (
            <HhQuran bg={pageBg} qSize={qSize} onBg={setPageBg} portion={recTask} pages={recPages} cur={recShown} pick={setRecPage} topExtra={62} />
          )}
        </HhScreen>
      )}
    </div>
  );
}
