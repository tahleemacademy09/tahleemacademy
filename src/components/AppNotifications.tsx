/*
  src/components/AppNotifications.tsx — Tahleem Academy
  ──────────────────────────────────────────────────────
  Renders nothing — just mounts the timetable notification hook
  globally so EVERY authenticated user (student, teacher, admin)
  gets 15-min and 5-min class reminders on their device,
  regardless of which page they are currently viewing.

  Usage in App.tsx (inside <AuthProvider> + <BrowserRouter>):
    <AppNotifications />
    <GlobalClassroomOverlay />
    <IdleWarningModal />
*/
import { useTimetableNotifications } from "@/hooks/useTimetableNotifications";

export default function AppNotifications() {
  useTimetableNotifications();
  return null;
}
