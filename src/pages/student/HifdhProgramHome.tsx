// src/pages/student/HifdhProgramHome.tsx  (v2 — revision-style layout)
// Dark hero with 4 stat tiles side by side, three tabs (Memorize · Read-Along · Revision),
// portions as side-by-side tiles, page chips like the D1–D7 circles, and the REAL mushaf page
// (same look as Daily Hifdh Revision) instead of page numbers.

import { useRevisionAssignedCount } from "@/hooks/useRevisionAssignedCount";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLiveClass } from "@/contexts/LiveClassContext";
import { useToast } from "@/hooks/use-toast";
import MushafPageView from "@/components/hifdh/MushafPageView";
import { hpPortionLabel, hpPagesOf, hpSegmentFor } from "@/lib/hifdhPortion";
import { Loader2, BookOpen, Repeat, Video, CheckCircle2, Clock, AlertTriangle, Lock, Flame, BarChart3, Layers, ChevronUp, ChevronDown } from "lucide-react";

const hhDb = supabase as any;

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
const hhWhen = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }) : null;

const HH_TASK_LABEL: Record<string, { text: string; color: string }> = {
  pending: { text: "Waiting for read-along", color: HH_MUTED },
  read_cleared: { text: "Ready to memorize", color: HH_AMBER },
  submitted: { text: "Submitted", color: HH_GREEN },
  passed: { text: "Passed", color: HH_OK },
  failed: { text: "Repeat", color: HH_RED },
};

const HhPill = ({ text, color }: { text: string; color: string }) => (
  <span style={{ background: color + "1a", color, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, whiteSpace: "nowrap" }}>{text}</span>
);

const HhBtn = ({ children, onClick, disabled, gold }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; gold?: boolean }) => (
  <button onClick={onClick} disabled={disabled} style={{
    width: "100%", padding: "13px 14px", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800,
    cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
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

/** Page chips side by side, like the D1…D7 circles on the revision screen */
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

type Tab = "memorize" | "readalong" | "revision";

export default function HifdhProgramHome() {
  const { user } = useAuth();
  const { joinClass } = useLiveClass();
  const navigate = useNavigate();
  const { toast } = useToast();
  const week = hhMonday();
  const today = hhIso(new Date());

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("memorize");
  const [program, setProgram] = useState<any>(null);
  const [level, setLevel] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [member, setMember] = useState<any>(null);
  const [group, setGroup] = useState<any>(null);
  const [ustadh, setUstadh] = useState("");
  const [tasks, setTasks] = useState<any[]>([]);
  const [review, setReview] = useState<any>(null);
  const [fines, setFines] = useState<any[]>([]);
  const [revDays, setRevDays] = useState(0);
  const [doneToday, setDoneToday] = useState(false);
  const revisionPending = useRevisionAssignedCount(user?.id, String(doneToday));
  const [busy, setBusy] = useState(false);
  const [selSlot, setSelSlot] = useState<number>(1);
  const [selPage, setSelPage] = useState<number | null>(null);
  const [raPage, setRaPage] = useState<number | null>(null);
  const [focus, setFocus] = useState<null | "memorize" | "readalong">(null);
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

    const [lv, st, mm, tk, rv, fn, lg] = await Promise.all([
      prog.level_id ? hhDb.from("hifdh_levels").select("*").eq("id", prog.level_id).maybeSingle() : Promise.resolve({ data: null }),
      hhDb.from("hifdh_settings").select("*").eq("id", true).maybeSingle(),
      hhDb.from("hifdh_read_group_members").select("*").eq("student_id", sid).eq("week_start", week).limit(1).maybeSingle(),
      hhDb.from("hifdh_memorization_tasks").select("*").eq("student_id", sid).eq("week_start", week).order("slot"),
      hhDb.from("hifdh_weekly_reviews").select("*").eq("student_id", sid).eq("week_start", week).maybeSingle(),
      hhDb.from("hifdh_fines").select("*").eq("student_id", sid).eq("status", "unpaid"),
      hhDb.from("hifdh_daily_logs").select("log_date,completed").eq("student_id", sid).eq("completed", true)
        .gte("log_date", week).lt("log_date", hhNextWeek(week)),
    ]);
    setLevel(lv.data || null);
    setSettings(st.data || null);
    setMember(mm.data || null);
    setTasks(tk.data || []);
    setReview(rv.data || null);
    setFines(fn.data || []);
    const logs: any[] = lg.data || [];
    setRevDays(new Set(logs.map((l) => l.log_date)).size);
    setDoneToday(logs.some((l) => l.log_date === today));

    if (mm.data?.group_id) {
      const { data: g } = await hhDb.from("hifdh_read_groups").select("*").eq("id", mm.data.group_id).maybeSingle();
      setGroup(g || null);
      if (g?.ustadh_id) {
        const { data: pf } = await hhDb.from("profiles").select("full_name").eq("user_id", g.ustadh_id).maybeSingle();
        setUstadh(pf?.full_name || "");
      }
    } else { setGroup(null); }
    setLoading(false);
  }, [user?.id, week, today]);

  useEffect(() => { load(); }, [load]);

  const taskOf = (s: number) => tasks.find((t) => t.slot === s);
  const activeTask = taskOf(selSlot);
  const activePages = useMemo(() => (activeTask ? hpPagesOf(activeTask) : []), [activeTask]);
  const shownPage = selPage && activePages.includes(selPage) ? selPage : activePages[0];

  // when tasks arrive, default to the first session that has work to do
  useEffect(() => {
    if (!tasks.length) return;
    const next = tasks.find((t) => ["read_cleared", "failed"].includes(t.status)) || tasks[0];
    setSelSlot(next.slot);
    setSelPage(null);
  }, [tasks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const raPages = useMemo(() => (member?.page_from && member?.page_to ? hpPagesOf(member) : []), [member]);
  const raShown = raPage && raPages.includes(raPage) ? raPage : raPages[0];

  const submitTask = async (id: string) => {
    setBusy(true);
    const { error } = await hhDb.from("hifdh_memorization_tasks")
      .update({ status: "submitted", submitted_at: new Date().toISOString() }).eq("id", id);
    setBusy(false);
    if (error) toast({ title: "Couldn't submit", description: error.message, variant: "destructive" });
    else { toast({ title: "Submitted to your ustadh" }); load(); }
  };

  const joinReadAlong = async () => {
    if (!group?.live_session_id) return;
    const { data: ls } = await hhDb.from("live_sessions").select("subject_id").eq("id", group.live_session_id).maybeSingle();
    const { data: subject } = ls?.subject_id
      ? await hhDb.from("subjects").select("*").eq("id", ls.subject_id).maybeSingle()
      : { data: null };
    if (!subject) return toast({ title: "Class not available yet", variant: "destructive" });
    joinClass(subject);
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
  const memDays: number[] = settings?.memorization_days || [];
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const doneCount = tasks.filter((t) => ["submitted", "passed"].includes(t.status)).length;
  const showBanner = suspended || fines.length > 0 || program.miss_streak > 0;

  // Pending counts for the tab badges
  const memorizePending = tasks.filter((t) => ["read_cleared", "failed"].includes(t.status)).length;
  const readAlongPending = group && member && ["pending", "repeat"].includes(member.read_status) ? 1 : 0;

  const tabBtn = (id: Tab, label: string, icon: React.ReactNode, badge = 0) => (
    <button key={id} onClick={() => setTab(id)} style={{
      flex: 1, padding: "13px 4px", background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
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
                {level ? `${level.name} · ${Number(level.daily_pages)} page${Number(level.daily_pages) === 1 ? "" : "s"} a day` : "Level not set yet"}
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
        {/* Tabs */}
        {!suspended && (
          <div style={{ display: "flex", background: "#fff", borderBottom: `1px solid ${HH_LINE}` }}>
            {tabBtn("memorize", "Memorize", <BookOpen size={15} />, suspended ? 0 : memorizePending)}
            {tabBtn("readalong", "Read-Along", <Video size={15} />, suspended ? 0 : readAlongPending)}
            {tabBtn("revision", "Revision", <Repeat size={15} />, suspended ? 0 : revisionPending)}
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
                {suspended && <div style={{ fontWeight: 800, color: HH_RED }}>Your Hifdh program is suspended</div>}
                {suspended && <div style={{ color: HH_MUTED }}>Please contact the admin to be reinstated. Your other classes are not affected.</div>}
                {!suspended && program.miss_streak > 0 && (
                  <div><b>{program.miss_streak} missed week{program.miss_streak > 1 ? "s" : ""} in a row.</b> {limit - program.miss_streak} more will suspend the program.</div>
                )}
                {fines.length > 0 && <div style={{ marginTop: suspended || program.miss_streak > 0 ? 4 : 0 }}>Unpaid fine{fines.length > 1 ? "s" : ""}: <b>₦{unpaidTotal.toLocaleString()}</b></div>}
              </div>
            </div>
          )}

          {!suspended && tab === "memorize" && (
            <>
              <div style={{ fontSize: 12, color: HH_MUTED }}>
                {memDays.length ? `Memorization days: ${memDays.map((d) => dayNames[d - 1]).join(" & ")}` : "This week's memorization"}
              </div>

              {/* Sessions side by side */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[1, 2].map((s) => {
                  const t = taskOf(s);
                  const lb = t ? HH_TASK_LABEL[t.status] : null;
                  const on = selSlot === s;
                  return (
                    <button key={s} onClick={() => { setSelSlot(s); setSelPage(null); }} disabled={!t} style={{
                      textAlign: "left", background: "#fff", borderRadius: 16, padding: 12, cursor: t ? "pointer" : "default",
                      border: `2px solid ${on && t ? HH_GOLD : HH_LINE}`, opacity: t ? 1 : 0.6,
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: HH_MUTED, letterSpacing: 0.6 }}>SESSION {s}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: HH_INK, margin: "4px 0 8px", minHeight: 38 }}>
                        {t ? hpPortionLabel(t) : "—"}
                      </div>
                      {lb ? <HhPill text={lb.text} color={lb.color} /> : <HhPill text="Not assigned yet" color={HH_MUTED} />}
                    </button>
                  );
                })}
              </div>

              {!activeTask ? (
                <div style={{ background: "#fff", border: `1px solid ${HH_LINE}`, borderRadius: 14, padding: 14, fontSize: 13, color: HH_MUTED }}>
                  Your portions will appear here once your ustadh assigns them after the read-along.
                </div>
              ) : (
                <div style={{ background: "#fff", border: `1px solid ${HH_LINE}`, borderRadius: 16, padding: "12px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px 8px" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: HH_MUTED }}>{hpPortionLabel(activeTask)}</span>
                    <HhFocusBtn onClick={() => setFocus("memorize")} />
                  </div>
                  {activePages.length > 1 && <HhPageChips pages={activePages} active={shownPage!} onPick={setSelPage} />}
                  {shownPage && <MushafPageView page={shownPage} fontSize={qSize} halves={hpSegmentFor(shownPage, activeTask)} />}
                  {activeTask.status === "read_cleared" && (
                    <div style={{ padding: "6px 4px 2px" }}>
                      <HhBtn gold disabled={busy} onClick={() => submitTask(activeTask.id)}>I've memorized this — submit</HhBtn>
                    </div>
                  )}
                </div>
              )}

              {review && (
                <div style={{ background: "#fff", border: `1px solid ${HH_LINE}`, borderRadius: 14, padding: 14, fontSize: 13 }}>
                  <div style={{ fontWeight: 800, color: HH_INK, marginBottom: 6 }}>This week's review</div>
                  {review.excused ? <HhPill text="Excused" color={HH_MUTED} /> : (
                    <HhPill text={review.grade === "pass" ? "Passed" : review.grade === "repeat" ? "Repeat" : "Not passed"}
                      color={review.grade === "pass" ? HH_OK : review.grade === "repeat" ? HH_AMBER : HH_RED} />
                  )}
                  {review.notes && <div style={{ marginTop: 8, color: HH_MUTED }}>{review.notes}</div>}
                </div>
              )}
            </>
          )}

          {!suspended && tab === "readalong" && (
            <>
              <div style={{ background: "#fff", border: `1px solid ${HH_LINE}`, borderRadius: 16, padding: 14 }}>
                {!group ? (
                  <div style={{ fontSize: 13, color: HH_MUTED }}>You haven't been placed in a read-along group for this week yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 16, color: HH_INK }}>{group.name}</div>
                        <div style={{ fontSize: 12, color: HH_MUTED }}>
                          {ustadh ? `Ustadh ${ustadh}` : "Ustadh not assigned yet"}{group.scheduled_at ? ` · ${hhWhen(group.scheduled_at)}` : ""}
                        </div>
                      </div>
                      {member?.read_status === "passed" && <HhPill text="Read correctly ✓" color={HH_OK} />}
                      {member?.read_status === "repeat" && <HhPill text="Please repeat" color={HH_AMBER} />}
                      {member?.read_status === "pending" && <HhPill text="Not yet marked" color={HH_MUTED} />}
                    </div>
                    {group.live_session_id ? (
                      <HhBtn onClick={joinReadAlong}>Join class</HhBtn>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: HH_MUTED }}>
                        <Clock size={14} /> The class hasn't been scheduled yet
                      </div>
                    )}
                  </div>
                )}
              </div>

              {raPages.length > 0 && (
                <div style={{ background: "#fff", border: `1px solid ${HH_LINE}`, borderRadius: 16, padding: "12px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px 8px" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: HH_MUTED }}>Read-along · {hpPortionLabel(member)}</span>
                    <HhFocusBtn onClick={() => setFocus("readalong")} />
                  </div>
                  {raPages.length > 1 && <HhPageChips pages={raPages} active={raShown!} onPick={setRaPage} />}
                  {raShown && <MushafPageView page={raShown} fontSize={qSize} halves={hpSegmentFor(raShown, member)} />}
                </div>
              )}
            </>
          )}

          {!suspended && tab === "revision" && (
            <div style={{ background: "#fff", border: `1px solid ${HH_LINE}`, borderRadius: 16, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: HH_GREEN + "14", color: HH_GREEN, display: "flex", alignItems: "center", justifyContent: "center" }}><BarChart3 size={22} /></div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: HH_INK }}>Today's Revision</div>
                  <div style={{ fontSize: 12, color: HH_MUTED }}>{revDays} day{revDays === 1 ? "" : "s"} completed this week</div>
                </div>
              </div>
              {doneToday ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: HH_OK, fontWeight: 700, fontSize: 14 }}>
                  <CheckCircle2 size={18} /> Done for today — well done
                </div>
              ) : (
                <HhBtn onClick={() => navigate("/student/hifdh-daily")}>Start today's revision</HhBtn>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Focus mode — only the Quran page, full screen */}
      {focus && (() => {
        const isMem = focus === "memorize";
        const portion = isMem ? activeTask : member;
        const pages = isMem ? activePages : raPages;
        const cur = isMem ? shownPage : raShown;
        const pick = isMem ? setSelPage : setRaPage;
        if (!portion || !cur) return null;
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
                  halves={hpSegmentFor(cur, portion)}
                  fitHeight={64 + (pages.length > 1 ? 64 : 0) + (isMem && activeTask?.status === "read_cleared" ? 84 : 0) + 24}
                  seamless
                  onBackground={setPageBg}
                />
              </div>
            </div>
            {isMem && activeTask?.status === "read_cleared" && (
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
