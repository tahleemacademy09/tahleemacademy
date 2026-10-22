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
import { hpPortionLabel, hpPagesOf, hpSegmentFor, hpUnitsFor, hpReviewRange, hpUnitsLabel, HP_REVIEW_CYCLE } from "@/lib/hifdhPortion";
import {
  Loader2, BookOpen, Repeat, Video, CheckCircle2, Clock, AlertTriangle, Lock, Flame, Layers,
  ChevronUp, ChevronDown, Users, CalendarDays, BarChart3,
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
const HH_DAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
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

const HhFocusBtn = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} aria-label="Focus on the page" style={{
    display: "inline-flex", alignItems: "center", gap: 4, border: `1px solid ${HH_LINE}`, background: "#fff", borderRadius: 99,
    padding: "5px 10px 5px 8px", fontSize: 12, fontWeight: 700, color: HH_INK, cursor: "pointer",
  }}><ChevronUp size={16} /> Focus</button>
);

const HhPageChips = ({ pages, active, onPick }: { pages: number[]; active: number; onPick: (p: number) => void }) => (
  <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "4px 2px 10px" }}>
    {pages.map((p) => (
      <button key={p} onClick={() => onPick(p)} aria-label={`Page ${p}`} style={{
        flex: "0 0 auto", width: 44, height: 44, borderRadius: "50%", cursor: "pointer", fontSize: 13, fontWeight: 800,
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
  <div style={{ margin: "0 4px 8px", padding: "7px 10px", borderRadius: 10, background: "#fbf3da", border: `1px solid ${HH_GOLD}88`, color: "#78350F", fontSize: 12, fontWeight: 700 }}>
    Your portion: the {text}
  </div>
) : null;

const HhCard = ({ children, pad = 14 }: { children: React.ReactNode; pad?: number | string }) => (
  <div style={{ background: "#fff", border: `1px solid ${HH_LINE}`, borderRadius: 16, padding: pad }}>{children}</div>
);

type Tab = "memorize" | "review";
type RevMode = "daily" | "weekly";

export default function HifdhProgramHome() {
  const { user } = useAuth();
  const { joinClass } = useLiveClass();
  const navigate = useNavigate();
  const { toast } = useToast();
  const week = hhMonday();
  const today = hhIso(new Date());
  const todayN = hhTodayN();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("memorize");
  const [revMode, setRevMode] = useState<RevMode>("daily");
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
  const [focus, setFocus] = useState<null | "memorize" | "review">(null);
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
  const reviewToday = !!reviewAsg && reviewAsg.review_day === todayN;
  const memorizePending = tasks.filter((t) => HH_CAN_SUBMIT.includes(t.status)).length;
  const reviewBadge = reviewToday ? 1 : 0;

  const tabBtn = (id: Tab, label: string, icon: React.ReactNode, badge = 0) => (
    <button key={id} onClick={() => setTab(id)} style={{
      flex: 1, padding: "13px 4px", background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700,
      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      color: tab === id ? HH_INK : HH_MUTED, borderBottom: `3px solid ${tab === id ? HH_GREEN : "transparent"}`,
    }}>{icon}{label}{badge > 0 && (
      <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "#ef4444", color: "#fff", fontSize: 11, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>{badge}</span>
    )}</button>
  );

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

      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        {!suspended && (
          <div style={{ display: "flex", background: "#fff", borderBottom: `1px solid ${HH_LINE}` }}>
            {tabBtn("memorize", "Memorization", <BookOpen size={16} />, memorizePending)}
            {tabBtn("review", "Review", <Repeat size={16} />, reviewBadge)}
          </div>
        )}

        <div style={{ padding: 14, display: "grid", gap: 12, alignContent: "start" }}>
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

          {/* ───────────── MEMORIZATION ───────────── */}
          {!suspended && tab === "memorize" && (
            <>
              {/* Live class */}
              <HhCard>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: HH_GREEN + "14", color: HH_GREEN, display: "flex", alignItems: "center", justifyContent: "center" }}><Video size={22} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 16, color: HH_INK }}>Quran Memorization class</div>
                    <div style={{ fontSize: 12, color: HH_MUTED }}>
                      {memDays.length ? memDays.map((d) => `${HH_DAY_SHORT[d - 1]}${slotTime(d) ? ` ${slotTime(d)}` : ""}`).join(" · ") : "Days not set yet"}
                    </div>
                  </div>
                </div>
                {isMemDay ? (
                  <div style={{ display: "grid", gap: 6 }}>
                    <HhBtn onClick={joinLive}><Video size={16} /> Join class{slotTime(todayN) ? ` · ${slotTime(todayN)}` : ""}</HhBtn>
                    <div style={{ fontSize: 12, color: HH_MUTED, textAlign: "center" }}>You can join now and wait in the room — your ustadh will come in.</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: HH_MUTED, background: HH_BG, borderRadius: 12, padding: "11px 12px" }}>
                    <Clock size={15} />
                    {nextMemDay
                      ? <span>Opens on <b style={{ color: HH_INK }}>{HH_DAY[nextMemDay - 1]}{slotTime(nextMemDay) ? ` at ${slotTime(nextMemDay)}` : ""}</b></span>
                      : <span>Your class day hasn't been set yet</span>}
                  </div>
                )}
              </HhCard>

              {/* This week's portions */}
              <div style={{ fontSize: 12, color: HH_MUTED, padding: "2px 2px 0" }}>
                This week's memorization · {amountLabel} each session
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[1, 2].map((s) => {
                  const t = taskOf(s);
                  const lb = t ? HH_TASK_LABEL[t.status] : null;
                  const on = selSlot === s;
                  const dayN = memDays[s - 1];
                  return (
                    <button key={s} onClick={() => { setSelSlot(s); setSelPage(null); }} disabled={!t} style={{
                      textAlign: "left", background: "#fff", borderRadius: 16, padding: 12, cursor: t ? "pointer" : "default",
                      border: `2px solid ${on && t ? HH_GOLD : HH_LINE}`, opacity: t ? 1 : 0.6,
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: HH_MUTED, letterSpacing: 0.6 }}>
                        SESSION {s}{dayN ? ` · ${HH_DAY_SHORT[dayN - 1].toUpperCase()}` : ""}
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: HH_INK, margin: "4px 0 8px", minHeight: 38 }}>
                        {t ? hpPortionLabel(t) : "—"}
                      </div>
                      {lb ? <HhPill text={lb.text} color={lb.color} /> : <HhPill text="Not ready yet" color={HH_MUTED} />}
                    </button>
                  );
                })}
              </div>

              {!activeTask ? (
                <HhCard>
                  <div style={{ fontSize: 13, color: HH_MUTED }}>
                    Your page for this week will show here. If it doesn't appear, pull to refresh or ask the admin to check your level.
                  </div>
                </HhCard>
              ) : (
                <HhCard pad="12px 10px">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px 8px" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: HH_MUTED }}>{hpPortionLabel(activeTask)}</span>
                    <HhFocusBtn onClick={() => setFocus("memorize")} />
                  </div>
                  {activePages.length > 1 && <HhPageChips pages={activePages} active={shownPage!} onPick={setSelPage} />}
                  {shownPage && <HhHint text={hhHalfHint(shownPage, activeTask)} />}
                  {shownPage && <MushafPageView page={shownPage} fontSize={qSize} />}
                  {HH_CAN_SUBMIT.includes(activeTask.status) && (
                    <div style={{ padding: "6px 4px 2px" }}>
                      <HhBtn gold disabled={busy} onClick={() => submitTask(activeTask.id)}>
                        {activeTask.status === "failed" ? "I've repeated it — submit again" : "I've memorized this — submit"}
                      </HhBtn>
                    </div>
                  )}
                  <div style={{ padding: "8px 6px 2px", fontSize: 12, color: activeTask.status === "failed" ? HH_RED : HH_MUTED }}>
                    {activeTask.status === "passed" ? "Your ustadh marked this memorized. Well done."
                      : activeTask.status === "failed" ? "Your ustadh asked you to repeat this. You move on only when it is marked memorized."
                      : activeTask.status === "submitted" ? "Sent. Recite it in the live class — you move on once your ustadh marks it memorized."
                      : "Memorize it, then recite it to your ustadh in the live class. You move on once it is marked memorized."}
                  </div>
                </HhCard>
              )}
            </>
          )}

          {/* ───────────── REVIEW ───────────── */}
          {!suspended && tab === "review" && (
            <>
              {/* Daily revision | Weekly review — side by side */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {([
                  ["daily", "Daily revision", doneToday ? "Done today ✓" : `${revDays} day${revDays === 1 ? "" : "s"} this week`, <BarChart3 size={20} key="d" />],
                  ["weekly", "Weekly review", reviewAsg ? `${HH_DAY_SHORT[reviewAsg.review_day - 1]}${reviewUstadh ? ` · ${reviewUstadh}` : ""}` : "Live with ustadh", <Users size={20} key="w" />],
                ] as const).map(([id, title, sub2, icon]) => {
                  const on = revMode === id;
                  return (
                    <button key={id} onClick={() => setRevMode(id)} style={{
                      textAlign: "left", background: on ? "#fff" : "#f1f3f2", borderRadius: 16, padding: 12, cursor: "pointer",
                      border: `2px solid ${on ? HH_GOLD : HH_LINE}`,
                    }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: HH_GREEN + "14", color: HH_GREEN, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>{icon}</div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: HH_INK }}>{title}</div>
                      <div style={{ fontSize: 11, color: HH_MUTED, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub2}</div>
                    </button>
                  );
                })}
              </div>

              {/* Daily: the Daily Hifdh Revision page, right here */}
              {revMode === "daily" && (
                <Suspense fallback={<div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 className="animate-spin" color={HH_GOLD} /></div>}>
                  <div style={{ margin: "0 -14px" }}><DailyRevision embedded /></div>
                </Suspense>
              )}

              {revMode === "weekly" && (
                <>
              {/* 2 · Weekly review → live class with the assigned ustadh */}
              <HhCard>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: HH_GREEN + "14", color: HH_GREEN, display: "flex", alignItems: "center", justifyContent: "center" }}><Users size={22} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 16, color: HH_INK }}>Weekly review · live</div>
                    <div style={{ fontSize: 12, color: HH_MUTED }}>Recite what you memorized to your assigned ustadh</div>
                  </div>
                  {review && (review.excused
                    ? <HhPill text="Excused" color={HH_MUTED} />
                    : <HhPill text={review.grade === "pass" ? "Passed" : review.grade === "repeat" ? "Repeat" : "Not passed"}
                        color={review.grade === "pass" ? HH_OK : review.grade === "repeat" ? HH_AMBER : HH_RED} />)}
                </div>

                {reviewAsg ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", gap: 8, fontSize: 13, color: HH_INK, flexWrap: "wrap" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: HH_BG, borderRadius: 10, padding: "8px 10px" }}>
                        <Users size={14} color={HH_GREEN} /> {reviewUstadh ? `Ustadh ${reviewUstadh}` : "Ustadh not assigned yet"}
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: HH_BG, borderRadius: 10, padding: "8px 10px" }}>
                        <CalendarDays size={14} color={HH_GREEN} /> {HH_DAY[reviewAsg.review_day - 1]}{slotTime(reviewAsg.review_day) ? ` · ${slotTime(reviewAsg.review_day)}` : ""}
                      </span>
                    </div>
                    {review ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, color: HH_OK, fontWeight: 700, fontSize: 14 }}>
                        <CheckCircle2 size={18} /> This week's review is done
                      </div>
                    ) : reviewToday ? (
                      <>
                        <HhBtn disabled={busy} onClick={joinReview}><Video size={16} /> Join weekly review{reviewUstadh ? ` with ${reviewUstadh}` : ""}</HhBtn>
                        <div style={{ fontSize: 12, color: HH_MUTED, textAlign: "center" }}>You can join now and wait in the room — your ustadh will come in.</div>
                      </>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: HH_MUTED, background: HH_BG, borderRadius: 12, padding: "11px 12px" }}>
                        <Clock size={15} /> Join opens on <b style={{ color: HH_INK }}>{HH_DAY[reviewAsg.review_day - 1]}</b>
                      </div>
                    )}
                    {review?.notes && <div style={{ fontSize: 13, color: HH_MUTED }}>{review.notes}</div>}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: HH_MUTED, background: HH_BG, borderRadius: 12, padding: "11px 12px" }}>
                    Your review ustadh and day (
                    {(settings?.review_days || [5, 6, 7]).map((d: number) => HH_DAY_SHORT[d - 1]).join(", ")}
                    ) will be assigned soon.
                  </div>
                )}
              </HhCard>

              {/* Review portion: all memorized parts in the current round of 5 pages */}
              <div style={{ fontSize: 12, color: HH_MUTED, padding: "2px 2px 0" }}>What you will recite in your review</div>
              {!recTask ? (
                <HhCard>
                  <div style={{ fontSize: 13, color: HH_MUTED }}>
                    Portions appear here once your ustadh marks them memorized. Your review then covers everything you have memorized, up to 5 pages, before it starts again.
                  </div>
                </HhCard>
              ) : (
                <HhCard pad="12px 10px">
                  <div style={{ padding: "0 4px 10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: HH_INK }}>{hpPortionLabel(recTask)}</span>
                      <HhFocusBtn onClick={() => setFocus("review")} />
                    </div>
                    <div style={{ fontSize: 12, color: HH_MUTED, margin: "4px 0 8px" }}>
                      Round {recTask.round} · {hpUnitsLabel(recTask.units)} of 5 pages
                    </div>
                    <div style={{ height: 8, borderRadius: 99, background: HH_LINE, overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(100, (recTask.units / HP_REVIEW_CYCLE) * 100)}%`, height: "100%", background: recTask.units >= HP_REVIEW_CYCLE ? HH_OK : HH_GOLD }} />
                    </div>
                    {recTask.units >= HP_REVIEW_CYCLE && (
                      <div style={{ fontSize: 12, color: HH_OK, fontWeight: 700, marginTop: 6 }}>5 pages complete — your next memorized portion starts a new round.</div>
                    )}
                  </div>
                  {recPages.length > 1 && <HhPageChips pages={recPages} active={recShown!} onPick={setRecPage} />}
                  {recShown && <HhHint text={hhHalfHint(recShown, recTask)} />}
                  {recShown && <MushafPageView page={recShown} fontSize={qSize} />}
                </HhCard>
              )}

                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Focus mode — only the Quran page, full screen */}
      {focus && (() => {
        const isMem = focus === "memorize";
        const portion = isMem ? activeTask : recTask;
        const pages = isMem ? activePages : recPages;
        const cur = isMem ? shownPage : recShown;
        const pick = isMem ? setSelPage : setRecPage;
        if (!portion || !cur) return null;
        const showSubmit = isMem && activeTask && HH_CAN_SUBMIT.includes(activeTask.status);
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 250, background: pageBg, display: "flex", flexDirection: "column" }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: pageBg, borderBottom: "1px solid rgba(0,0,0,.06)",
              padding: "10px 12px", paddingTop: "calc(10px + env(safe-area-inset-top, 0px))",
            }}>
              <button onClick={() => setFocus(null)} aria-label="Show details" style={{
                display: "inline-flex", alignItems: "center", gap: 4, border: `1px solid ${HH_LINE}`, background: "#fff", borderRadius: 99,
                padding: "6px 12px 6px 8px", fontSize: 12, fontWeight: 700, color: HH_INK, cursor: "pointer",
              }}><ChevronDown size={16} /> Details</button>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={() => { setQSize(26); try { localStorage.setItem("hifdh_qsize", "26"); } catch { /* ignore */ } }} aria-label="Fit page" style={{ height: 34, padding: "0 10px", borderRadius: 10, border: `1px solid ${HH_LINE}`, background: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>Fit</button>
                <button onClick={() => bump(-2)} aria-label="Smaller text" style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${HH_LINE}`, background: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>A−</button>
                <button onClick={() => bump(2)} aria-label="Larger text" style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${HH_LINE}`, background: "#fff", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>A+</button>
              </div>
            </div>
            {hhHalfHint(cur, portion) && (
              <div style={{ background: pageBg, padding: "6px 12px 0" }}><HhHint text={hhHalfHint(cur, portion)} /></div>
            )}
            {pages.length > 1 && (
              <div style={{ background: pageBg, padding: "6px 12px 0", borderBottom: "1px solid rgba(0,0,0,.06)" }}>
                <HhPageChips pages={pages} active={cur} onPick={pick} />
              </div>
            )}
            <div style={{ flex: 1, overflowY: "auto", padding: "6px 6px 10px", display: "flex", flexDirection: "column" }}>
              <div style={{ margin: "auto 0", width: "100%" }}>
                <MushafPageView
                  page={cur}
                  fontSize={qSize}
                  fitHeight={64 + (pages.length > 1 ? 64 : 0) + (hhHalfHint(cur, portion) ? 44 : 0) + (showSubmit ? 84 : 0) + 24}
                  seamless
                  onBackground={setPageBg}
                />
              </div>
            </div>
            {showSubmit && activeTask && (
              <div style={{ padding: 12, paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))", background: pageBg, borderTop: "1px solid rgba(0,0,0,.06)" }}>
                <HhBtn gold disabled={busy} onClick={() => submitTask(activeTask.id)}>I've memorized this — submit</HhBtn>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
