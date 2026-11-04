// src/lib/hifdhSchedule.ts
// A level's read-along (memorization) class schedule: several days, each with its own time.
// Stored in hifdh_levels.readalong_schedule as [{ day: 1..7 (Mon..Sun), time: "HH:MM" }].
// Older rows only have readalong_day / readalong_time — treated as a one-entry schedule.

export interface HifdhSlot { day: number; time: string }

export const HF_DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const HF_DAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function levelSlots(l: any): HifdhSlot[] {
  const raw = Array.isArray(l?.readalong_schedule) ? l.readalong_schedule : null;
  const list: HifdhSlot[] = raw
    ? raw.map((e: any) => ({ day: Number(e?.day), time: String(e?.time || "16:00").slice(0, 5) }))
    : l?.readalong_day ? [{ day: Number(l.readalong_day), time: String(l.readalong_time || "16:00").slice(0, 5) }] : [];
  return list.filter((s) => s.day >= 1 && s.day <= 7).sort((a, b) => a.day - b.day);
}

/** "Tue 06:30 · Thu 18:00" */
export const fmtSlots = (l: any) => levelSlots(l).map((s) => `${HF_DAYS_SHORT[s.day - 1]} ${s.time}`).join(" · ");
