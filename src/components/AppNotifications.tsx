/*
  src/components/AppNotifications.tsx — Tahleem Academy
  ──────────────────────────────────────────────────────
  Mounts global notification infrastructure for every authenticated user,
  regardless of which page they're on.

  • usePushNotifications      — service worker + push subscription bootstrap,
                                 SW message listener (resubscribe / click-nav)
  • useNotificationNavigator  — deep-links push notification taps via
                                 React Router (no full-page reload)
  • InstallPWAPrompt          — "Add to Home Screen" bottom sheet

  Note: useHifdhAssignmentNotifications (client-side polling reminders) has
  been removed as part of the notifications rebuild. Event-specific reminders
  (Hifdh, class rings, etc.) will come back as their own scoped DB triggers
  that insert into `notifications` directly — see the migration file for why.
*/
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useNotificationNavigator } from "@/hooks/useNotificationNavigator";
import InstallPWAPrompt from "@/components/InstallPWAPrompt";

export default function AppNotifications() {
  usePushNotifications();
  useNotificationNavigator();
  return <InstallPWAPrompt />;
}
