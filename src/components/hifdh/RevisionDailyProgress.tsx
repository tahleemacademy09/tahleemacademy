// src/components/hifdh/RevisionDailyProgress.tsx
// Student-facing daily revision progress panel
// Shows: today's assignment, pages done/remaining, score, streak,
//        last 7 days history, error verse summary, acknowledgment status

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BookMarked, Flame, CheckCircle2, Clock, ChevronRight,
  AlertTriangle, TrendingUp, Star, RefreshCcw, Target
} from "lucide-react";

const G    = "#1a3d24";
const GM   = "#276749";
const GOLD = "#c9a84c";
const W    = "#ffffff";
const WARM = "#faf8f4";
const BRD  = "#e8ddd0";
const INK  = "#1a1a1a";

interface Props {
  userId: string | null;
  onGoToRevision: () => void;
}

interface Assignment {
  id: string; mode: string; selected_items: number[];
  daily_pages: number; notes?: string;
  // Support both field name variants stored by different admin RPCs
  program_start?: string;
  starts_on?: string;
  days_off?: number[];     // explicit array: [0]=Sunday off, etc.
  weekend_off?: boolean;   // legacy boolean: true = Sunday (0) is off
}
interface DailyLog {
  id: string; log_date: string; pages_revised: number;
  avg_score: number | null; duration_secs: number;
  completed: boolean; acknowledged_at: string | null; ack_note: string | null;
  session_data?: any;
}

const toAr = (n: number) =>
  String(n).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[+d]);

// ── Helpers ─────────────────────────────────────────────────────
function getStartDate(a: Assignment): string | undefined {
  return a.program_start || a.starts_on || undefined;
}

function getDaysOff(a: Assignment): number[] {
  if (Array.isArray(a.days_off)) return a.days_off;
  if (a.weekend_off === true)  return [0];
  if (a.weekend_off === false) return [];
  return [];
}

function workingDaysElapsed(startDate: string, daysOff: number[]): number {
  const start = new Date(startDate + "T00:00:00");
  const now   = new Date(); now.setHours(0, 0, 0, 0);
  let count = 0;
  const cur = new Date(start);
  while (cur < now) {
    if (!daysOff.includes(cur.getDay())) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function isWorkingDay(dateStr: string, daysOff: number[]): boolean {
  return !daysOff.includes(new Date(dateStr + "T00:00:00").getDay());
}

function tomorrowDateStr(): string {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

function workingDaysElapsedUpTo(startDate: string, targetDate: string, daysOff: number[]): number {
  const start  = new Date(startDate + "T00:00:00");
  const target = new Date(targetDate + "T00:00:00");
  let count = 0;
  const cur = new Date(start);
  while (cur < target) {
    if (!daysOff.includes(cur.getDay())) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

const scoreColor = (s: number) =>
  s >= 80 ? "#16a34a" : s >= 60 ? "#b7791f" : "#dc2626";

const fmtSecs = (s: number) =>
  s >= 3600
    ? `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
    : `${Math.floor(s/60)}m ${s%60}s`;

const dayLabels = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export default function RevisionDailyProgress({ userId, onGoToRevision }: Props) {
  const [assignment,  setAssignment]  = useState<Assignment | null>(null);
  const [todayLog,    setTodayLog]    = useState<DailyLog | null>(null);
  const [weekLogs,    setWeekLogs]    = useState<DailyLog[]>([]);
  const [streak,      setStreak]      = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [totalPages,  setTotalPages]  = useState(0);
  const [tomorrowPage, setTomorrowPage] = useState<number | null>(null);
  const [todayPage,    setTodayPage]    = useState<number | null>(null);
  const [missedCount,  setMissedCount]  = useState(0);

  const today = new Date().toISOString().split("T")[0];

  // Build past 7 dates
  const past7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split("T")[0];
  });

  useEffect(() => {
    if (!userId) return;
    setLoading(true);

    Promise.all([
      // Active assignment
      (supabase as any).from("hifdh_daily_assignments")
        .select("*").eq("student_id", userId).eq("active", true).maybeSingle(),
      // Last 30 logs for streak calc
      (supabase as any).from("hifdh_daily_logs")
        .select("*").eq("student_id", userId)
        .order("log_date", { ascending: false }).limit(30),
    ]).then(([{ data: asgn }, { data: logs }]) => {
      if (asgn) setAssignment(asgn);

      const allLogs: DailyLog[] = logs ?? [];
      const todayEntry = allLogs.find(l => l.log_date === today) ?? null;
      setTodayLog(todayEntry);
      setWeekLogs(allLogs.filter(l => past7.includes(l.log_date)));

      // ── Compute missed days in past 7 (working days with no log) ──
      if (asgn) {
        const daysOff   = getDaysOff(asgn);
        const startDate = getStartDate(asgn);
        const logDates  = new Set(allLogs.map(l => l.log_date));
        let missed = 0;
        past7.forEach(d => {
          if (d >= today) return;
          if (!isWorkingDay(d, daysOff)) return;
          if (!logDates.has(d)) missed++;
        });
        setMissedCount(missed);

        // ── Today's page position ──
        if (startDate) {
          const elapsedToday = workingDaysElapsed(startDate, daysOff);
          const page = Math.floor(elapsedToday * asgn.daily_pages) + 1;
          setTodayPage(page);
        }

        // ── Tomorrow's page position ──
        if (startDate) {
          const tmrw = tomorrowDateStr();
          if (isWorkingDay(tmrw, daysOff)) {
            const elapsed = workingDaysElapsedUpTo(startDate, tmrw, daysOff);
            const page = Math.floor(elapsed * asgn.daily_pages) + 1;
            setTomorrowPage(page);
          } else {
            setTomorrowPage(null);
          }
        }
      }

      // Streak: consecutive days with completed=true going back from yesterday
      let s = todayEntry?.completed ? 1 : 0;
      const sortedDates = allLogs
        .filter(l => l.completed && l.log_date < today)
        .map(l => l.log_date)
        .sort()
        .reverse();
      let prev = new Date(today);
      for (const d of sortedDates) {
        prev.setDate(prev.getDate() - 1);
        if (d === prev.toISOString().split("T")[0]) s++;
        else break;
      }
      setStreak(s);

      setLoading(false);
    });
  }, [userId]);

  // Build total pages from assignment
  useEffect(() => {
    if (!assignment) return;
    // Simple approximation: juz=20p, hizb=10p, surah=varies
    const n = assignment.selected_items.length;
    const pages = assignment.mode === "juz"  ? n * 20
                : assignment.mode === "hizb" ? n * 10
                : n * 3;
    setTotalPages(pages);
  }, [assignment]);

  if (loading) return (
    <div style={{ display:"flex", justifyContent:"center", padding:32 }}>
      <div style={{ width:24, height:24, borderRadius:"50%", border:`3px solid ${BRD}`,
        borderTopColor:G, animation:"spin .8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const pagesLeft   = assignment
    ? Math.max(0, assignment.daily_pages - (todayLog?.pages_revised ?? 0))
    : 0;
  const pct = assignment
    ? Math.min(100, Math.round(((todayLog?.pages_revised ?? 0) / assignment.daily_pages) * 100))
    : 0;
  const isDone      = todayLog?.completed ?? false;
  const isAcked     = !!todayLog?.acknowledged_at;
  const errors      = todayLog?.session_data?.errors ?? [];
  const transcript  = todayLog?.session_data?.transcript ?? "";
  const score       = todayLog?.avg_score;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Today's Assignment Card ────────────────────────────────── */}
      {assignment ? (
        <div style={{ borderRadius:20, overflow:"hidden",
          border: isDone ? "2px solid #16a34a44" : `2px solid ${GOLD}44`,
          boxShadow: isDone ? "0 2px 16px rgba(22,163,74,.1)" : `0 2px 16px rgba(201,168,76,.12)` }}>

          {/* Header strip */}
          <div style={{ padding:"12px 16px", display:"flex", alignItems:"center", gap:10,
            background: isDone ? "linear-gradient(135deg,#14532d,#166534)"
                               : `linear-gradient(135deg,${G},${GM})` }}>
            <div style={{ width:40, height:40, borderRadius:12,
              background: isDone ? "rgba(255,255,255,.12)" : `${GOLD}22`,
              display:"flex", alignItems:"center", justifyContent:"center" }}>
              {isDone
                ? <CheckCircle2 size={20} color="#86efac" />
                : <BookMarked   size={20} color={GOLD}    />
              }
            </div>
            <div style={{ flex:1 }}>
              <div style={{ color:isDone?"#86efac":GOLD, fontWeight:800, fontSize:13 }}>
                {isDone ? "✅ Today Complete!" : "📋 Today's Revision"}
              </div>
              <div style={{ color:"rgba(255,255,255,.6)", fontSize:10, marginTop:1,
                fontFamily:"'Amiri',serif" }}>
                {assignment.mode === "juz"  ? `Juz ${assignment.selected_items.join(", ")}` :
                 assignment.mode === "hizb" ? `Hizb ${assignment.selected_items.join(", ")}` :
                 `${assignment.selected_items.length} Surah(s)`}
                {" · "}{assignment.daily_pages} page{assignment.daily_pages!==1?"s":""}/day
                {todayPage !== null && ` · Pg ${todayPage}${assignment.daily_pages > 1 ? `–${todayPage + assignment.daily_pages - 1}` : ""}`}
              </div>
            </div>
            {isAcked && (
              <div style={{ padding:"3px 10px", borderRadius:10, background:"#7c3aed",
                fontSize:10, fontWeight:800, color:"#fff" }}>
                ✓ Acked
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div style={{ padding:"14px 16px", background:W }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
              <span style={{ fontSize:11, fontWeight:700, color:G }}>
                {todayLog?.pages_revised ?? 0} / {assignment.daily_pages} pages
              </span>
              <span style={{ fontSize:11, fontWeight:800,
                color: isDone ? "#16a34a" : GOLD }}>{pct}%</span>
            </div>
            <div style={{ height:8, borderRadius:4, background:"#f0ede8", overflow:"hidden" }}>
              <div style={{ height:"100%", borderRadius:4, transition:"width .5s",
                width:`${pct}%`,
                background: isDone
                  ? "linear-gradient(to right,#16a34a,#22c55e)"
                  : `linear-gradient(to right,${G},${GM})` }} />
            </div>
            {!isDone && pagesLeft > 0 && (
              <div style={{ marginTop:6, fontSize:10, color:"#9aab94" }}>
                {pagesLeft} page{pagesLeft!==1?"s":""} remaining today
              </div>
            )}

            {/* Today stats row */}
            {todayLog && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr",
                gap:8, marginTop:12 }}>
                {[
                  { label:"Score",
                    value: score!=null ? `${score}%` : "—",
                    color: score!=null ? scoreColor(score) : "#9aab94",
                    icon: <Star size={13} /> },
                  { label:"Time",
                    value: todayLog.duration_secs ? fmtSecs(todayLog.duration_secs) : "—",
                    color: G, icon: <Clock size={13} /> },
                  { label:"Errors",
                    value: errors.length > 0 ? `${errors.length} verse${errors.length!==1?"s":""}` : "None",
                    color: errors.length > 0 ? "#dc2626" : "#16a34a",
                    icon: <AlertTriangle size={13} /> },
                ].map(stat => (
                  <div key={stat.label} style={{ background:WARM, borderRadius:10,
                    padding:"8px", textAlign:"center", border:`1px solid ${BRD}` }}>
                    <div style={{ display:"flex", justifyContent:"center",
                      marginBottom:3, color:stat.color }}>{stat.icon}</div>
                    <div style={{ fontSize:13, fontWeight:800, color:stat.color }}>{stat.value}</div>
                    <div style={{ fontSize:9, color:"#9aab94", fontWeight:600 }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Teacher note if acknowledged */}
            {isAcked && todayLog?.ack_note && (
              <div style={{ marginTop:12, padding:"10px 12px", borderRadius:10,
                background:"#f3e8ff", border:"1px solid #c4b5fd",
                display:"flex", alignItems:"flex-start", gap:8 }}>
                <span style={{ fontSize:16 }}>👨‍🏫</span>
                <div>
                  <div style={{ fontSize:10, fontWeight:800, color:"#7c3aed", marginBottom:2 }}>
                    Teacher Note
                  </div>
                  <div style={{ fontSize:12, color:"#4c1d95", fontFamily:"'Amiri',serif" }}>
                    {todayLog.ack_note}
                  </div>
                </div>
              </div>
            )}

            {/* CTA */}
            <button onClick={onGoToRevision}
              style={{ marginTop:14, width:"100%", padding:"13px",
                borderRadius:12, border:"none", cursor:"pointer",
                background: isDone
                  ? `linear-gradient(135deg,${G},${GM})`
                  : `linear-gradient(135deg,${GOLD},#e8c97a)`,
                color: isDone ? GOLD : G,
                fontWeight:800, fontSize:14, display:"flex",
                alignItems:"center", justifyContent:"center", gap:8 }}>
              <RefreshCcw size={16} />
              {isDone ? "Revise Again" : "Start Today's Revision"}
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      ) : (
        /* No assignment yet */
        <div style={{ padding:"18px 16px", borderRadius:16, border:`1.5px dashed ${BRD}`,
          background:WARM, textAlign:"center" }}>
          <BookMarked size={28} color={GOLD} style={{ margin:"0 auto 8px" }} />
          <div style={{ fontWeight:700, fontSize:13, color:G, marginBottom:4 }}>
            No Revision Assigned Yet
          </div>
          <div style={{ fontSize:11, color:"#9aab94" }}>
            Your teacher will assign your daily revision content
          </div>
          <button onClick={onGoToRevision}
            style={{ marginTop:12, padding:"9px 20px", borderRadius:10,
              border:`1.5px solid ${G}`, background:W, color:G,
              fontWeight:700, fontSize:12, cursor:"pointer" }}>
            Browse & Revise Freely
          </button>
        </div>
      )}

      {/* ── Streak & Summary ─────────────────────────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        {/* Streak */}
        <div style={{ borderRadius:16, padding:"14px", background:W,
          border:`1px solid ${BRD}`, textAlign:"center" }}>
          <Flame size={24} color={streak > 0 ? "#f97316" : "#d1d5db"}
            style={{ margin:"0 auto 6px" }} />
          <div style={{ fontSize:28, fontWeight:900,
            color: streak > 0 ? "#f97316" : "#d1d5db",
            fontFamily:"'Amiri',serif" }}>
            {toAr(streak)}
          </div>
          <div style={{ fontSize:10, fontWeight:700, color:"#9aab94" }}>Day Streak 🔥</div>
          {streak === 0 && (
            <div style={{ fontSize:9, color:"#c0b0a0", marginTop:4 }}>
              Complete today to start!
            </div>
          )}
        </div>

        {/* Total coverage */}
        <div style={{ borderRadius:16, padding:"14px", background:W,
          border:`1px solid ${BRD}`, textAlign:"center" }}>
          <Target size={24} color={G} style={{ margin:"0 auto 6px" }} />
          <div style={{ fontSize:28, fontWeight:900, color:G,
            fontFamily:"'Amiri',serif" }}>
            {toAr(weekLogs.filter(l=>l.completed).length)}
          </div>
          <div style={{ fontSize:10, fontWeight:700, color:"#9aab94" }}>Days Done (7d)</div>
          <div style={{ fontSize:9, color:"#c0b0a0", marginTop:4 }}>
            of {toAr(7)} days this week
          </div>
        </div>
      </div>

      {/* ── 7-Day History ─────────────────────────────────────────── */}
      <div style={{ borderRadius:16, padding:"14px", background:W, border:`1px solid ${BRD}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:12 }}>
          <div style={{ width:3, height:14, borderRadius:2, background:GOLD }} />
          <span style={{ fontSize:10, fontWeight:800, color:GOLD,
            letterSpacing:1.2, textTransform:"uppercase" as const }}>Last 7 Days</span>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
          {past7.map((date) => {
            const log      = weekLogs.find(l => l.log_date === date);
            const isToday  = date === today;
            const isFuture = date > today;
            const daysOff  = assignment?.days_off ?? [];
            const isOff    = !isWorkingDay(date, daysOff);
            const done     = log?.completed;
            const partial  = log && !log.completed;
            const missed   = !isFuture && !isToday && !isOff && !log;
            const sc       = log?.avg_score;
            return (
              <div key={date} style={{ display:"flex", flexDirection:"column",
                alignItems:"center", gap:4 }}>
                <div style={{ width:"100%", aspectRatio:"1",
                  borderRadius:10, display:"flex", flexDirection:"column",
                  alignItems:"center", justifyContent:"center",
                  border: isToday ? `2px solid ${GOLD}` : "none",
                  background: done    ? (sc != null ? `${scoreColor(sc)}22` : "#16a34a18")
                            : partial ? "#fff7ed"
                            : missed  ? "#FEF2F2"
                            : isOff   ? "#F3F4F6"
                            : WARM,
                  position:"relative" as const }}>
                  {done ? (
                    <>
                      <CheckCircle2 size={14} color={sc != null ? scoreColor(sc) : "#16a34a"} />
                      {sc != null && (
                        <div style={{ fontSize:8, fontWeight:800, marginTop:2, color:scoreColor(sc) }}>{sc}%</div>
                      )}
                    </>
                  ) : partial ? (
                    <div style={{ fontSize:9, color:"#f59e0b", fontWeight:700 }}>…</div>
                  ) : missed ? (
                    <div style={{ fontSize:11, color:"#DC2626", fontWeight:800 }}>✗</div>
                  ) : isOff ? (
                    <div style={{ fontSize:10, color:"#D1D5DB" }}>—</div>
                  ) : (
                    <div style={{ width:6, height:6, borderRadius:"50%",
                      background: isToday ? GOLD : "#e8ddd0" }} />
                  )}
                </div>
                <div style={{ fontSize:8, fontWeight:600,
                  color: isToday ? GOLD : "#9aab94" }}>
                  {dayLabels[new Date(date + "T00:00:00").getDay()]}
                </div>
              </div>
            );
          })}
        </div>

        {/* Missed-day warning */}
        {missedCount > 0 && (
          <div style={{ marginTop:8, padding:"8px 10px", borderRadius:10,
            background:"#FEF2F2", border:"1px solid #FECACA",
            display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:14 }}>⚠️</span>
            <div>
              <span style={{ fontSize:11, fontWeight:800, color:"#DC2626" }}>
                {missedCount} missed day{missedCount > 1 ? "s" : ""} this week
              </span>
              <span style={{ fontSize:10, color:"#B91C1C", marginLeft:6 }}>
                — your plan auto-advances each working day
              </span>
            </div>
          </div>
        )}

        {/* Legend */}
        <div style={{ display:"flex", gap:12, marginTop:8, flexWrap:"wrap" as const }}>
          {[
            { color:"#16a34a", label:"Completed" },
            { color:"#f59e0b", label:"Partial"   },
            { color:"#DC2626", label:"Missed"    },
            { color:"#D1D5DB", label:"Day off"   },
          ].map(l => (
            <div key={l.label} style={{ display:"flex", alignItems:"center", gap:4 }}>
              <div style={{ width:8, height:8, borderRadius:2, background:l.color }} />
              <span style={{ fontSize:9, color:"#9aab94" }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Error Verses Summary ──────────────────────────────────── */}
      {errors.length > 0 && (
        <div style={{ borderRadius:16, padding:"14px", background:W,
          border:"1.5px solid #fca5a5" }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
            <AlertTriangle size={14} color="#dc2626" />
            <span style={{ fontSize:11, fontWeight:800, color:"#dc2626" }}>
              Today's Error Verses ({errors.length})
            </span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {errors.map((err: any, i: number) => (
              <div key={i} style={{ padding:"8px 10px", borderRadius:10,
                background:"#fff5f5", border:"1px solid #fecaca",
                display:"flex", alignItems:"flex-start", gap:8 }}>
                <div style={{ width:24, height:24, borderRadius:6, background:"#fee2e2",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  flexShrink:0, fontSize:11, fontWeight:800, color:"#dc2626" }}>
                  {err.ayah}
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:"#991b1b",
                    fontFamily:"'Amiri',serif", marginBottom:4 }}>
                    {err.surahAr} — آية {toAr(err.ayah)}
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap" as const, gap:3 }}>
                    {(err.missing ?? []).map((w: string, j: number) => (
                      <span key={j} style={{ padding:"1px 7px", borderRadius:6,
                        background:"#fee2e2", color:"#dc2626",
                        fontSize:11, fontFamily:"'Amiri',serif" }}>
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={onGoToRevision}
            style={{ marginTop:10, width:"100%", padding:"10px", borderRadius:10,
              border:"none", background:"#dc2626", color:W,
              fontWeight:800, fontSize:12, cursor:"pointer" }}>
            Practice Error Verses →
          </button>
        </div>
      )}

      {/* ── Transcript Preview ────────────────────────────────────── */}
      {transcript && (
        <div style={{ borderRadius:16, padding:"14px", background:W,
          border:`1px solid ${BRD}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
            <div style={{ width:3, height:14, borderRadius:2, background:GOLD }} />
            <span style={{ fontSize:10, fontWeight:800, color:GOLD,
              letterSpacing:1.2, textTransform:"uppercase" as const }}>
              Today's Recitation (Transcribed)
            </span>
          </div>
          <p style={{ fontSize:13, color:INK, lineHeight:2, direction:"rtl",
            fontFamily:"'Amiri',serif", textAlign:"right" as const,
            maxHeight:120, overflow:"hidden",
            WebkitMaskImage:"linear-gradient(to bottom,black 70%,transparent)" as any }}>
            {transcript}
          </p>
        </div>
      )}

      {/* ── Tomorrow's Plan ──────────────────────────────────────── */}
      {assignment && (() => {
        const daysOff = assignment.days_off ?? [];
        const tmrw    = tomorrowDateStr();
        const tmrwIsOff = !isWorkingDay(tmrw, daysOff);

        if (tmrwIsOff) {
          return (
            <div style={{ borderRadius:16, padding:"14px 16px", background:W,
              border:`1px solid ${BRD}`, display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ fontSize:28, lineHeight:1 }}>🌙</div>
              <div>
                <div style={{ fontWeight:800, fontSize:13, color:G, marginBottom:2 }}>
                  Tomorrow is a Day Off
                </div>
                <div style={{ fontSize:11, color:"#9aab94" }}>
                  No revision scheduled — enjoy your rest and come back refreshed!
                </div>
              </div>
            </div>
          );
        }

        // Calculate page position for tomorrow
        const startPage = tomorrowPage ?? 1;
        const endPage   = startPage + assignment.daily_pages - 1;
        const modeLabel = assignment.mode === "juz"  ? "Juz"
                        : assignment.mode === "hizb" ? "Hizb" : "Surah";

        return (
          <div style={{ borderRadius:16, overflow:"hidden",
            border:`1.5px solid ${GOLD}44`, background:W }}>

            {/* Header */}
            <div style={{ padding:"10px 14px", background:`linear-gradient(135deg,${G}0d,${GOLD}18)`,
              borderBottom:`1px solid ${GOLD}33`,
              display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:30, height:30, borderRadius:8, background:`${GOLD}22`,
                display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ fontSize:16 }}>📅</span>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:800, fontSize:12, color:G }}>Tomorrow's Revision Plan</div>
                <div style={{ fontSize:10, color:"#9aab94" }}>
                  {new Date(tmrw + "T00:00:00").toLocaleDateString("en-GB",
                    { weekday:"long", day:"numeric", month:"short" })}
                </div>
              </div>
              <div style={{ padding:"3px 10px", borderRadius:10, background:`${GOLD}22`,
                fontSize:10, fontWeight:800, color:G }}>
                {assignment.daily_pages} pages
              </div>
            </div>

            {/* Body */}
            <div style={{ padding:"12px 14px", display:"flex", gap:10, flexWrap:"wrap" as const }}>
              {[
                { label:"Section",    value:`${modeLabel} ${assignment.selected_items.slice(0,3).join(", ")}${assignment.selected_items.length > 3 ? "…" : ""}` },
                { label:"Page range", value: tomorrowPage ? `p. ${startPage} – ${endPage}` : "Auto" },
                { label:"Target",     value:`${assignment.daily_pages} pages` },
              ].map(item => (
                <div key={item.label} style={{ flex:1, minWidth:70, textAlign:"center" as const,
                  background:WARM, borderRadius:10, padding:"8px 6px",
                  border:`1px solid ${BRD}` }}>
                  <div style={{ fontSize:9, color:"#9aab94", fontWeight:600, marginBottom:2 }}>{item.label}</div>
                  <div style={{ fontSize:12, fontWeight:800, color:G }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Auto-advance note */}
            <div style={{ padding:"0 14px 12px" }}>
              <div style={{ padding:"8px 10px", borderRadius:10,
                background:`${GOLD}0d`, border:`1px solid ${GOLD}33`,
                fontSize:11, color:"#7a6930", fontWeight:600, lineHeight:1.5 }}>
                💡 Your plan auto-advances every working day — even if a session is missed, the next day starts from the correct page position.
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Motivational footer ───────────────────────────────────── */}
      <div style={{ borderRadius:16, padding:"14px 16px", textAlign:"center",
        background:`linear-gradient(135deg,${G}0a,${GOLD}0a)`,
        border:`1px solid ${GOLD}22` }}>
        <div style={{ fontFamily:"'Amiri',serif", fontSize:15, color:G,
          fontWeight:700, marginBottom:4, direction:"rtl" }}>
          {streak >= 7  ? "ماشاالله! أسبوع كامل من المراجعة 🏆" :
           streak >= 3  ? "أحسنت! استمر في المراجعة 🌟" :
           isDone       ? "بارك الله فيك! أكملت مراجعة اليوم ✓" :
                          "لا تنس مراجعة حفظك اليوم 📖"}
        </div>
        <div style={{ fontSize:10, color:"#9aab94" }}>
          {streak >= 7  ? "One full week — keep the momentum!" :
           streak >= 3  ? `${streak}-day streak — you're doing great!` :
           isDone       ? "Come back tomorrow for another session" :
                          "Consistency is the key to strong hifdh"}
        </div>
      </div>

    </div>
  );
}
