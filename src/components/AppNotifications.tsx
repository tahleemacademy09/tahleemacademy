/*
  src/components/AppNotifications.tsx — Tahleem Academy
  ──────────────────────────────────────────────────────
  Mounts global hooks and UI for every authenticated user regardless
  of which page they are on.

  • useTimetableNotifications       — push subscription + class ring alerts
  • useHifdhAssignmentNotifications — Hifdh revision reminders
  • useNotificationNavigator        — deep-links push notification taps via
                                      React Router (no full-page reload)
  • InstallPWAPrompt                — "Add to Home Screen" bottom sheet
*/
import { useTimetableNotifications } from "@/hooks/useTimetableNotifications";
import { useHifdhAssignmentNotifications } from "@/hooks/useHifdhAssignmentNotifications";
import { useNotificationNavigator } from "@/hooks/useNotificationNavigator";
import InstallPWAPrompt from "@/components/InstallPWAPrompt";

export default function AppNotifications() {
  useTimetableNotifications();
  useHifdhAssignmentNotifications();
  useNotificationNavigator();
  return <InstallPWAPrompt />;
}
