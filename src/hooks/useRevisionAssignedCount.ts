// src/hooks/useRevisionAssignedCount.ts
// Number shown on the student's Hifdh nav item / dashboard tile:
// how many of today's Murājaʿah assignments are still waiting to be done.
//
// An assignment counts as "assigned today" when:
//   • it is active and its programme has started,
//   • today is a working day (not one of its days off),
//   • the programme hasn't run out of days,
//   • and there's no completed log (or teacher override) for today yet.
//
// Uses the same date convention as HifdhDailyRevisionPage (todayISO = UTC date)
// so the badge clears at the same moment the page marks the day as done.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const todayISO = () => new Date().toISOString().split("T")[0];

function parseExtra(notes: any): any {
  try { return JSON.parse(notes || "{}"); } catch { return {}; }
}

function daysOffOf(a: any, extra: any): number[] {
  if (Array.isArray(extra?.daysOff)) return extra.daysOff;
  if (Array.isArray(a.days_off)) return a.days_off;
  return a.weekend_off ? [0] : [];
}

/** Working days from start up to (not including) today. */
function workingDaysBeforeToday(start: string, daysOff: number[]): number {
  const cur = new Date(start + "T00:00:00");
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let n = 0;
  while (cur < now) {
    if (!daysOff.includes(cur.getDay())) n++;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

export function useRevisionAssignedCount(userId: string | undefined, refreshKey?: string) {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!userId) { setCount(0); return; }
    try {
      const today = todayISO();
      const [{ data: asgn }, { data: logs }] = await Promise.all([
        (supabase as any).from("hifdh_daily_assignments")
          .select("*").eq("student_id", userId).eq("active", true),
        (supabase as any).from("hifdh_daily_logs")
          .select("assignment_id, completed, session_data")
          .eq("student_id", userId).eq("log_date", today),
      ]);

      const doneIds = new Set<string>();
      let doneUnlinked = false;
      for (const l of (logs ?? []) as any[]) {
        const done = l.completed || l.session_data?.teacher_override;
        if (!done) continue;
        if (l.assignment_id) doneIds.add(l.assignment_id); else doneUnlinked = true;
      }

      let pending = 0;
      for (const a of (asgn ?? []) as any[]) {
        const extra = parseExtra(a.notes);
        const start: string | undefined = extra.programStart ?? a.program_start ?? a.starts_on;
        if (!start || start > today) continue;                       // not started yet

        const off = daysOffOf(a, extra);
        if (off.includes(new Date(today + "T00:00:00").getDay())) continue; // rest day

        const totalDays = extra.programDays ?? a.program_days ?? 30;
        if (workingDaysBeforeToday(start, off) >= totalDays) continue;      // programme finished

        if (doneIds.has(a.id) || doneUnlinked) continue;             // already done today
        pending++;
      }
      setCount(pending);
    } catch {
      setCount(0);
    }
  }, [userId]);

  // Re-check on mount and whenever the route changes (so it clears after finishing).
  useEffect(() => { load(); }, [load, refreshKey]);

  // Re-check when the app returns to the foreground (e.g. a new day started).
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  return count;
}
