// src/lib/timeUtils.ts — Tahleem Academy
// Shared time formatting utilities used across timetable pages.

/** Convert "HH:MM" or "HH:MM:SS" → "H:MM AM/PM" */
export function to12hr(timeStr: string): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** Minutes from now until a "HH:MM" time string.
 *  Negative = past, positive = future. */
export function minutesUntil(timeStr: string): number {
  const now = new Date();
  const [h, m] = timeStr.split(":").map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  return (target.getTime() - now.getTime()) / 60_000;
}

/** Human-readable countdown string: "45m", "1h 12m", "Now" */
export function formatCountdown(minutes: number): string {
  if (minutes <= 0) return "Now";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
}

/** Format seconds as MM:SS (for live class timer) */
export function fmtSeconds(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
