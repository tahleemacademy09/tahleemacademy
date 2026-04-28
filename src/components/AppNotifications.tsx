/*
  src/components/AppNotifications.tsx — Tahleem Academy
  ──────────────────────────────────────────────────────
  Renders nothing — mounts notification hooks globally so EVERY
  authenticated user gets reminders regardless of which page they view.

  Hooks mounted here:
  • useTimetableNotifications  — 15-min & 5-min class alerts (all roles)
  • useHifdhAssignmentNotifications — morning / afternoon / evening Hifdh
    revision reminders (students only, fires only when daily log incomplete)
*/
import { useTimetableNotifications } from "@/hooks/useTimetableNotifications";
import { useHifdhAssignmentNotifications } from "@/hooks/useHifdhAssignmentNotifications";

export default function AppNotifications() {
  useTimetableNotifications();
  useHifdhAssignmentNotifications();
  return null;
}
