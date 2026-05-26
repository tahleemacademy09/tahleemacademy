/*
  src/components/AppNotifications.tsx — Tahleem Academy
  ──────────────────────────────────────────────────────
  Mounts global hooks and UI for every authenticated user regardless
  of which page they are on.

  • useTimetableNotifications       — 15-min & 5-min class push alerts
  • useHifdhAssignmentNotifications — Hifdh revision reminders
  • InstallPWAPrompt                — "Add to Home Screen" bottom sheet
                                      (Android: native prompt after 20s,
                                       iOS: step-by-step guide after 25s,
                                       already installed: hidden)
*/
import { useTimetableNotifications } from "@/hooks/useTimetableNotifications";
import { useHifdhAssignmentNotifications } from "@/hooks/useHifdhAssignmentNotifications";
import InstallPWAPrompt from "@/components/InstallPWAPrompt";

export default function AppNotifications() {
  useTimetableNotifications();
  useHifdhAssignmentNotifications();
  return <InstallPWAPrompt />;
}
