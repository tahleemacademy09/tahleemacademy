/*
  src/components/dashboard/DeadlineCountdown.tsx
  ────────────────────────────────────────────────────────────────────────────
  Live "time left" readout for an assignment deadline — the countdown
  "infrastructure" both the student dashboard's Assignments widget and the
  full Assignments page use, so any future spot that needs a deadline
  countdown reuses this instead of a one-off days-left calculation.

  Ticks on its own timer (no parent re-render needed to stay live) and
  escalates color as the deadline gets close: green/neutral with days to
  go, amber under 3 days, red under 24 hours — the same urgency levels the
  Assignments page's "Due in Xd" chip already uses, just kept fresh to the
  minute instead of only updating on page load.
*/
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

interface DeadlineCountdownProps {
  deadline: string;
  t: (en: string, ar: string) => string;
  /** Smaller text/icon for tight spaces like the dashboard widget's list rows. */
  compact?: boolean;
}

export function DeadlineCountdown({ deadline, t, compact = false }: DeadlineCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // 30s is plenty granular for a days/hours/minutes readout without waking
    // the device every second on a screen students may leave open a while.
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const target = new Date(deadline).getTime();
  if (Number.isNaN(target)) return null;
  const diffMs = target - now;
  if (diffMs <= 0) return null; // caller shows an "overdue/locked" state instead

  const totalMinutes = Math.floor(diffMs / 60_000);
  const days    = Math.floor(totalMinutes / 1440);
  const hours   = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const urgent = diffMs < 24 * 60 * 60_000;      // < 1 day left
  const soon   = diffMs < 3 * 24 * 60 * 60_000;  // < 3 days left
  const color  = urgent ? "#c0392b" : soon ? "#b45309" : "#7a9e88";

  const label =
    days > 0  ? `${days}${t("d", "ي")} ${hours}${t("h", "س")}` :
    hours > 0 ? `${hours}${t("h", "س")} ${minutes}${t("m", "د")}` :
                `${minutes}${t("m", "د")}`;

  return (
    <span style={{ fontSize: compact ? 10 : 11, fontWeight: 800, color, display: "flex", alignItems: "center", gap: 4 }}>
      <Clock style={{ width: compact ? 10 : 11, height: compact ? 10 : 11 }} />
      {label} {t("left", "متبقي")}
    </span>
  );
}
