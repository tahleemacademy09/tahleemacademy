// src/pages/teacher/TeacherHifdhProgram.tsx
// Ustadh screen for the Hifdh Program.
//   Tab 1 "Read-Along": schedule/start the group's live class (normal classroom), then tick each
//          student "Read correctly" (unlocks memorization) or "Repeat".
//   Tab 2 "Weekly Grading": one tap per student — Pass / Repeat / Fail / Excused.
// Admins see every group; teachers see only groups assigned to them.

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLiveClass } from "@/contexts/LiveClassContext";
import { useToast } from "@/hooks/use-toast";
import { SURAHS } from "@/components/hifdh/surahData";
import { hpUnit, hpFromUnit, hpUnitsFor, hpUnitsOf, hpPortionFromUnits, hpPortionLabel, HP_AMOUNTS } from "@/lib/hifdhPortion";
import { Loader2, Video, Check, RotateCcw, ChevronLeft, ChevronRight, BookOpen, ClipboardCheck } from "lucide-react";

const tpDb = supabase as any;

const TP_GREEN = "#064E3B";
const TP_GOLD = "#C9A84C";
const TP_INK = "#1a1a2e";
const TP_MUTED = "#6b7a72";
const TP_LINE = "#e3e9e5";
const TP_BG = "#f6f8f6";
const TP_RED = "#DC2626";
const TP_OK = "#16A34A";
const TP_AMBER = "#D97706";

const tpIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const tpMonday = (d = new Date()) => {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return tpIso(x);
};
const tpShift = (iso: string, w: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return tpMonday(new Date(y, m - 1, d + 7 * w));
};
const tpPretty = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};
const tpWhen = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
const tpLocalInput = () => {
  const d = new Date(Date.now() + 3600_000);
  d.setMinutes(0, 0, 0);
  return `${tpIso(d)}T${String(d.getHours()).padStart(2, "0")}:00`;
};

const TpCard = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ background: "#fff", border: `1px solid ${TP_LINE}`, borderRadius: 14, padding: 14, ...style }}>{children}</div>
);
const TpPill = ({ text, color }: { text: string; color: string }) => (
  <span style={{ background: color + "1a", color, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 99, whiteSpace: "nowrap" }}>{text}</span>
);
const TpBtn = ({ children, onClick, disabled, color = TP_GREEN, ghost, small }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; color?: string; ghost?: boolean; small?: boolean;
}) => (
  <button onClick={onClick} disabled={disabled} style={{
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
    border: ghost ? `1px solid ${color}` : "none", background: ghost ? "#fff" : color, color: ghost ? color : "#fff",
    borderRadius: 10, padding: small ? "8px 10px" : "11px 14px", fontSize: small ? 12 : 13, fontWeight: 800, flex: small ? undefined : 1,
  }}>{children}</button>
);
const TpNum = (p: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input type="number" {...p} style={{ width: 62, border: `1px solid ${TP_LINE}`, borderRadius: 8, padding: "7px 6px", fontSize: 13, textAlign: "center", ...(p.style || {}) }} />
);

const TP_TASK: Record<string, { text: string; color: string }> = {
  pending: { text: "Not cleared", color: TP_MUTED },
  read_cleared: { text: "Read ✓", color: TP_AMBER },
  submitted: { text: "Submitted", color: TP_GREEN },
  passed: { text: "Passed", color: TP_OK },
  failed: { text: "Failed", color: TP_RED },
};

export default function TeacherHifdhProgram() {
  const { user, hasRole } = useAuth();
  const { joinClass } = useLiveClass();
  const { toast } = useToast();
  const isAdmin = hasRole ? hasRole("admin") : false;

  const [week, setWeek] = useState(tpMonday());
  const [tab, setTab] = useState<"readalong" | "grading">("readalong");
  const [slot, setSlot] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [settings, setSettings] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [program, setProgram] = useState<Record<string, any>>({});
  const [levels, setLevels] = useState<Record<string, any>>({});
  const [tasks, setTasks] = useState<any[]>([]);
  const [reviews, setReviews] = useState<Record<string, any>>({});
  const [logs, setLogs] = useState<Record<string, { days: number; avg: number | null }>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<Record<string, { start: number; units: number }>>({});
  const [when, setWhen] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const nameOf = (id: string) => names[id] || "Student";

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const st = await tpDb.from("hifdh_settings").select("*").eq("id", true).maybeSingle();
    setSettings(st.data || null);

    let gq = tpDb.from("hifdh_read_groups").select("*").eq("week_start", week).order("name");
    if (!isAdmin) gq = gq.eq("ustadh_id", user.id);
    const { data: gs } = await gq;
    const gList: any[] = gs || [];
    setGroups(gList);

    const gids = gList.map((g) => g.id);
    const { data: ms } = gids.length
      ? await tpDb.from("hifdh_read_group_members").select("*").in("group_id", gids)
      : { data: [] };
    const mList: any[] = ms || [];
    setMembers(mList);

    const sids = Array.from(new Set<string>(mList.map((m) => m.student_id)));
    if (sids.length) {
      const weekEnd = tpShift(week, 1);
      const [pf, pg, lv, tk, rv, lg] = await Promise.all([
        tpDb.from("profiles").select("user_id,full_name").in("user_id", sids),
        tpDb.from("hifdh_program").select("*").in("student_id", sids).order("created_at", { ascending: false }),
        tpDb.from("hifdh_levels").select("*"),
        tpDb.from("hifdh_memorization_tasks").select("*").in("student_id", sids).eq("week_start", week),
        tpDb.from("hifdh_weekly_reviews").select("*").in("student_id", sids).eq("week_start", week),
        tpDb.from("hifdh_daily_logs").select("student_id,completed,avg_score,log_date").in("student_id", sids).gte("log_date", week).lt("log_date", weekEnd),
      ]);
      const nm: Record<string, string> = {};
      (pf.data || []).forEach((p: any) => (nm[p.user_id] = p.full_name || "Unnamed"));
      setNames(nm);
      const pm: Record<string, any> = {};
      (pg.data || []).forEach((p: any) => { if (!pm[p.student_id]) pm[p.student_id] = p; });
      setProgram(pm);
      const lm: Record<string, any> = {};
      (lv.data || []).forEach((l: any) => (lm[l.id] = l));
      setLevels(lm);
      setTasks(tk.data || []);
      const rm: Record<string, any> = {};
      (rv.data || []).forEach((r: any) => (rm[r.student_id] = r));
      setReviews(rm);
      const agg: Record<string, { days: number; sum: number; n: number }> = {};
      (lg.data || []).forEach((l: any) => {
        const a = (agg[l.student_id] ||= { days: 0, sum: 0, n: 0 });
        if (l.completed) a.days += 1;
        if (l.avg_score != null) { a.sum += Number(l.avg_score); a.n += 1; }
      });
      const out: Record<string, { days: number; avg: number | null }> = {};
      Object.entries(agg).forEach(([k, v]) => (out[k] = { days: v.days, avg: v.n ? Math.round(v.sum / v.n) : null }));
      setLogs(out);
    } else {
      setTasks([]); setReviews({}); setLogs({}); setProgram({});
    }
    setLoading(false);
  }, [user?.id, isAdmin, week]);

  useEffect(() => { load(); }, [load]);

  const taskFor = (sid: string, s: number) => tasks.find((t) => t.student_id === sid && t.slot === s);

  // Suggested portion for a student in the chosen session: one memorization day = the level's daily pages
  // (½ page → half a page, 1 page → one page …), starting right after where the student is.
  const suggest = (sid: string, s: number): { start: number; units: number } => {
    const existing = taskFor(sid, s);
    if (existing) {
      const u = hpUnitsOf(existing);
      return { start: u.start, units: u.end - u.start + 1 };
    }
    const prog = program[sid];
    const units = hpUnitsFor(levels[prog?.level_id]?.daily_pages ?? 0.5);
    const base = hpUnit(prog?.current_page ?? 1, prog?.current_half ?? 0);
    const first = taskFor(sid, 1);
    const start = s === 2 ? (first ? hpUnitsOf(first).end + 1 : base + units) : base;
    return { start, units };
  };
  const rangeOf = (sid: string) => edit[`${sid}:${slot}`] || suggest(sid, slot);
  const surahTag = (page: number) => {
    let hit: any = SURAHS[0];
    for (const sr of SURAHS as any[]) { if (sr.page <= page) hit = sr; else break; }
    return hit.arabicName || hit.nameAr;
  };

  const guard = async (fn: () => Promise<any>, okMsg?: string) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res?.error) throw res.error;
      if (okMsg) toast({ title: okMsg });
      await load();
    } catch (e: any) {
      toast({ title: "Something went wrong", description: e?.message || String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  /* ───── read-along actions ───── */
  const schedule = (g: any) => {
    if (!settings?.readalong_subject_id) {
      return toast({ title: "Hifdh class subject not set", description: "Ask the admin to choose it in Hifdh Program → Settings.", variant: "destructive" });
    }
    const at = new Date(when[g.id] || tpLocalInput()).toISOString();
    guard(async () => {
      const ins = await tpDb.from("live_sessions").insert({
        subject_id: settings.readalong_subject_id, host_id: user!.id, status: "scheduled", scheduled_at: at,
        duration_minutes: 60, topic: `Hifdh read-along — ${g.name}`, topic_ar: `قراءة جماعية — ${g.name}`, is_recorded: false,
      }).select("id").single();
      if (ins.error) return ins;
      await tpDb.from("subjects").update({ next_session_at: at }).eq("id", settings.readalong_subject_id);
      return tpDb.from("hifdh_read_groups").update({ live_session_id: ins.data.id, scheduled_at: at, ustadh_id: g.ustadh_id || user!.id }).eq("id", g.id);
    }, "Read-along scheduled");
  };

  const startClass = async (g: any) => {
    const { data: ls } = await tpDb.from("live_sessions").select("subject_id").eq("id", g.live_session_id).maybeSingle();
    const sid = ls?.subject_id || settings?.readalong_subject_id;
    if (!sid) return toast({ title: "Class not found", variant: "destructive" });
    const { data: sub } = await tpDb.from("subjects").select("id,title,title_ar").eq("id", sid).maybeSingle();
    await tpDb.from("hifdh_read_groups").update({ status: "live" }).eq("id", g.id);
    joinClass({ id: sid, title: sub?.title || "Hifdh Read-Along", title_ar: sub?.title_ar || "" });
  };

  const mark = (m: any, result: "passed" | "repeat") => {
    const r = hpPortionFromUnits(rangeOf(m.student_id).start, rangeOf(m.student_id).units);
    const existing = taskFor(m.student_id, slot);
    if (existing && ["submitted", "passed"].includes(existing.status)) {
      return toast({ title: "Already submitted", description: "This portion has already been memorized and submitted.", variant: "destructive" });
    }
    const cleared = result === "passed";
    guard(async () => {
      const up = await tpDb.from("hifdh_memorization_tasks").upsert({
        student_id: m.student_id, week_start: week, slot, ...r,
        status: cleared ? "read_cleared" : "pending",
        read_cleared_at: cleared ? new Date().toISOString() : null, read_cleared_by: cleared ? user!.id : null,
      }, { onConflict: "student_id,week_start,slot" });
      if (up.error) return up;
      return tpDb.from("hifdh_read_group_members").update({
        read_status: result, marked_by: user!.id, marked_at: new Date().toISOString(), ...r,
      }).eq("id", m.id);
    });
  };

  /* ───── grading ───── */
  const grade = (sid: string, g: "pass" | "repeat" | "fail" | "excused") =>
    guard(() => tpDb.rpc("hifdh_grade_week", {
      p_student: sid, p_week: week, p_grade: g === "excused" ? "pass" : g, p_excused: g === "excused", p_notes: notes[sid] || null,
    }), "Saved");

  const students = useMemo(() => {
    const seen = new Set<string>();
    const out: { sid: string; group: string }[] = [];
    groups.forEach((g) => members.filter((m) => m.group_id === g.id).forEach((m) => {
      if (!seen.has(m.student_id)) { seen.add(m.student_id); out.push({ sid: m.student_id, group: g.name }); }
    }));
    return out.sort((a, b) => nameOf(a.sid).localeCompare(nameOf(b.sid)));
  }, [groups, members, names]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ───── UI ───── */
  const ReadAlong = (
    <div style={{ display: "grid", gap: 10 }}>
      <TpCard>
        <div style={{ fontSize: 12, fontWeight: 700, color: TP_MUTED, marginBottom: 8 }}>Which session this week?</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[1, 2].map((s) => (
            <button key={s} onClick={() => setSlot(s as 1 | 2)} style={{
              flex: 1, padding: "10px 0", borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: "pointer",
              border: `1px solid ${slot === s ? TP_GREEN : TP_LINE}`, background: slot === s ? TP_GREEN : "#fff", color: slot === s ? "#fff" : TP_INK,
            }}>Session {s}</button>
          ))}
        </div>
      </TpCard>

      {groups.length === 0 && <TpCard><div style={{ color: TP_MUTED, fontSize: 13 }}>No read-along groups {isAdmin ? "for this week yet." : "are assigned to you this week."}</div></TpCard>}

      {groups.map((g) => {
        const ms = members.filter((m) => m.group_id === g.id);
        return (
          <TpCard key={g.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 800, color: TP_GREEN, fontSize: 15 }}>{g.name}</div>
              <div style={{ fontSize: 12, color: TP_MUTED }}>{ms.length} student{ms.length === 1 ? "" : "s"}</div>
            </div>

            {g.live_session_id ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: TP_MUTED, flex: 1 }}>{tpWhen(g.scheduled_at)}</div>
                <TpBtn small disabled={busy} onClick={() => startClass(g)}><Video size={14} /> Open class</TpBtn>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <input type="datetime-local" value={when[g.id] || tpLocalInput()} onChange={(e) => setWhen({ ...when, [g.id]: e.target.value })}
                  style={{ flex: 1, minWidth: 180, border: `1px solid ${TP_LINE}`, borderRadius: 10, padding: "8px 10px", fontSize: 13 }} />
                <TpBtn small disabled={busy} onClick={() => schedule(g)}>Schedule class</TpBtn>
              </div>
            )}

            <div style={{ display: "grid", gap: 8 }}>
              {ms.map((m) => {
                const r = rangeOf(m.student_id);
                const t = taskFor(m.student_id, slot);
                const lb = TP_TASK[t?.status || "pending"];
                const locked = t && ["submitted", "passed"].includes(t.status);
                return (
                  <div key={m.id} style={{ border: `1px solid ${TP_LINE}`, borderRadius: 12, padding: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: TP_INK }}>{nameOf(m.student_id)}</div>
                      <TpPill text={lb.text} color={lb.color} />
                    </div>
                    <div style={{ margin: "8px 0", fontSize: 12, color: TP_MUTED }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <div style={{ marginBottom: 3 }}>Starts at page</div>
                          <div style={{ display: "flex", gap: 4 }}>
                            <TpNum value={hpFromUnit(r.start).page} disabled={!!locked} min={1} max={604}
                              onChange={(e) => setEdit({ ...edit, [`${m.student_id}:${slot}`]: { ...r, start: hpUnit(Math.min(604, Math.max(1, Number(e.target.value) || 1)), hpFromUnit(r.start).half) } })} />
                            <select disabled={!!locked} value={hpFromUnit(r.start).half}
                              onChange={(e) => setEdit({ ...edit, [`${m.student_id}:${slot}`]: { ...r, start: hpUnit(hpFromUnit(r.start).page, Number(e.target.value)) } })}
                              style={{ border: `1px solid ${TP_LINE}`, borderRadius: 8, fontSize: 12, padding: "6px 4px", background: "#fff", flex: 1, minWidth: 0 }}>
                              <option value={0}>1st half</option>
                              <option value={1}>2nd half</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <div style={{ marginBottom: 3 }}>Amount</div>
                          <select disabled={!!locked} value={r.units}
                            onChange={(e) => setEdit({ ...edit, [`${m.student_id}:${slot}`]: { ...r, units: Number(e.target.value) } })}
                            style={{ border: `1px solid ${TP_LINE}`, borderRadius: 8, fontSize: 12, padding: "7px 4px", background: "#fff", width: "100%" }}>
                            {(HP_AMOUNTS.some((a) => a.units === r.units) ? HP_AMOUNTS : [...HP_AMOUNTS, { units: r.units, label: `${r.units / 2} pages` }]).map((a) => (
                              <option key={a.units} value={a.units}>{a.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div style={{ marginTop: 8, color: TP_INK, fontWeight: 700, fontSize: 13 }}>
                        {hpPortionLabel(hpPortionFromUnits(r.start, r.units))}
                        <span style={{ fontFamily: "'Amiri Quran','Amiri',serif", fontSize: 15, fontWeight: 400, color: TP_MUTED }}> · {surahTag(hpFromUnit(r.start).page)}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <TpBtn small color={TP_OK} disabled={busy || !!locked} onClick={() => mark(m, "passed")}><Check size={14} /> Read correctly</TpBtn>
                      <TpBtn small color={TP_AMBER} ghost disabled={busy || !!locked} onClick={() => mark(m, "repeat")}><RotateCcw size={14} /> Repeat</TpBtn>
                    </div>
                  </div>
                );
              })}
            </div>
          </TpCard>
        );
      })}
    </div>
  );

  const Grading = (
    <div style={{ display: "grid", gap: 10 }}>
      <TpCard>
        <div style={{ fontSize: 13, color: TP_MUTED }}>
          Grade each student once this week{settings?.review_days?.length ? " (review days: " + settings.review_days.map((d: number) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d - 1]).join(", ") + ")" : ""}.
          Pass moves them to the next pages. Fail means they repeat the same portion and receive the fine at close-out.
        </div>
      </TpCard>

      {students.length === 0 && <TpCard><div style={{ color: TP_MUTED, fontSize: 13 }}>No students to grade this week.</div></TpCard>}

      {students.map(({ sid, group }) => {
        const rv = reviews[sid];
        const lg = logs[sid];
        const tk = tasks.filter((t) => t.student_id === sid).sort((a, b) => a.slot - b.slot);
        const current = rv ? (rv.excused ? "excused" : rv.grade) : null;
        const btn = (label: string, val: "pass" | "repeat" | "fail" | "excused", color: string) => (
          <button key={val} disabled={busy} onClick={() => grade(sid, val)} style={{
            flex: 1, padding: "10px 4px", borderRadius: 10, fontSize: 12, fontWeight: 800, cursor: "pointer",
            border: `1px solid ${color}`, background: current === val ? color : "#fff", color: current === val ? "#fff" : color,
          }}>{label}</button>
        );
        return (
          <TpCard key={sid}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 800, color: TP_INK, fontSize: 14 }}>{nameOf(sid)}</div>
                <div style={{ fontSize: 11, color: TP_MUTED }}>{group} · page {program[sid]?.current_page ?? "–"}</div>
              </div>
              {current && <TpPill text={current === "excused" ? "Excused" : current === "pass" ? "Passed" : current === "repeat" ? "Repeat" : "Failed"}
                color={current === "pass" ? TP_OK : current === "fail" ? TP_RED : current === "repeat" ? TP_AMBER : TP_MUTED} />}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0", fontSize: 12, color: TP_MUTED }}>
              <TpPill text={`Revision: ${lg?.days ?? 0} day${(lg?.days ?? 0) === 1 ? "" : "s"}${lg?.avg != null ? ` · avg ${lg.avg}%` : ""}`} color={TP_GREEN} />
              {tk.map((t) => (
                <TpPill key={t.id} color={TP_TASK[t.status]?.color || TP_MUTED}
                  text={`S${t.slot} · ${hpPortionLabel(t)} · ${TP_TASK[t.status]?.text || t.status}`} />
              ))}
              {tk.length === 0 && <TpPill text="No memorization portions" color={TP_MUTED} />}
            </div>
            <input placeholder="Note for the student (optional)" value={notes[sid] ?? rv?.notes ?? ""} onChange={(e) => setNotes({ ...notes, [sid]: e.target.value })}
              style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${TP_LINE}`, borderRadius: 10, padding: "9px 10px", fontSize: 13, marginBottom: 10 }} />
            <div style={{ display: "flex", gap: 6 }}>
              {btn("Pass", "pass", TP_OK)}{btn("Repeat", "repeat", TP_AMBER)}{btn("Fail", "fail", TP_RED)}{btn("Excuse", "excused", TP_MUTED)}
            </div>
          </TpCard>
        );
      })}
    </div>
  );

  return (
    <div style={{ background: TP_BG, minHeight: "100%", padding: 14, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: TP_GREEN }}>Hifdh Program</div>
        <div style={{ fontSize: 12, color: TP_MUTED }}>Read-along groups and weekly grading</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 12 }}>
        <button aria-label="Previous week" onClick={() => setWeek(tpShift(week, -1))} style={{ border: "none", background: "none", cursor: "pointer" }}><ChevronLeft /></button>
        <div style={{ fontWeight: 700, fontSize: 13, color: TP_INK }}>Week of {tpPretty(week)}{week === tpMonday() ? " (this week)" : ""}</div>
        <button aria-label="Next week" onClick={() => setWeek(tpShift(week, 1))} style={{ border: "none", background: "none", cursor: "pointer" }}><ChevronRight /></button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, background: "#fff", padding: 4, borderRadius: 12, border: `1px solid ${TP_LINE}` }}>
        {([["readalong", "Read-Along", <BookOpen size={14} key="a" />], ["grading", "Weekly Grading", <ClipboardCheck size={14} key="b" />]] as const).map(([id, label, icon]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 4px", borderRadius: 9, border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 700, background: tab === id ? TP_GREEN : "transparent", color: tab === id ? "#fff" : TP_MUTED,
          }}>{icon}{label}</button>
        ))}
      </div>

      {loading ? <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 className="animate-spin" color={TP_GOLD} /></div>
        : tab === "readalong" ? ReadAlong : Grading}
    </div>
  );
}
