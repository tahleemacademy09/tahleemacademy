/*
  src/lib/musabaqahTiming.ts
  ─────────────────────────────────────────────────────────────
  Single source of truth for "when does this Musabaqah actually
  start" and "when does registration close". Every page that shows
  a countdown (student Register, student Waiting Room, admin Event
  Detail) was computing this independently and slightly differently
  — this is why the dates could feel out of sync across pages.
  Import these two functions everywhere instead of recalculating.
*/

export type GMEventTiming = {
  registration_opens_at?: string | null;
  registration_closes_at?: string | null;
  competition_date?: string | null;
  start_time?: string | null;
};

// The moment registration stops accepting new sign-ups.
export function getRegistrationCloseMs(event: GMEventTiming): number | null {
  if (!event?.registration_closes_at) return null;
  const d = new Date(event.registration_closes_at);
  return isNaN(d.getTime()) ? null : d.getTime();
}

export function getRegistrationOpenMs(event: GMEventTiming): number | null {
  if (!event?.registration_opens_at) return null;
  const d = new Date(event.registration_opens_at);
  return isNaN(d.getTime()) ? null : d.getTime();
}

// The moment the live competition actually kicks off — the single target
// every countdown/auto-launch across the app ticks toward.
//
// competition_date is always the authoritative day; start_time only ever
// contributes its clock time. This matters because admins sometimes leave
// start_time on whatever date the field defaulted to when the event was
// created — treating start_time as authoritative would then silently point
// the countdown at a stale day instead of the real event date.
export function getCompetitionKickoffMs(event: GMEventTiming): number | null {
  if (!event?.competition_date) {
    if (!event?.start_time) return null;
    const d = new Date(event.start_time);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  let timeOfDay = "00:00:00";
  if (event.start_time) {
    const t = new Date(event.start_time);
    if (!isNaN(t.getTime())) timeOfDay = t.toTimeString().slice(0, 8);
  }
  const d = new Date(`${event.competition_date}T${timeOfDay}`);
  return isNaN(d.getTime()) ? null : d.getTime();
}

// Millisecond-precision breakdown for a "very big" countdown display.
export function formatCountdownParts(ms: number) {
  const clamped = Math.max(0, ms);
  const totalMs = Math.floor(clamped);
  const days = Math.floor(totalMs / 86_400_000);
  const hours = Math.floor((totalMs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  return { days, hours, minutes, seconds, millis, isZero: clamped <= 0 };
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const pad3 = (n: number) => String(n).padStart(3, "0");

// "2d 03:14:07.428" style — big-display-ready, no rounding, ms always shown.
export function formatCountdownBig(ms: number): string {
  const p = formatCountdownParts(ms);
  const dayPart = p.days > 0 ? `${p.days}d ` : "";
  return `${dayPart}${pad2(p.hours)}:${pad2(p.minutes)}:${pad2(p.seconds)}.${pad3(p.millis)}`;
}
