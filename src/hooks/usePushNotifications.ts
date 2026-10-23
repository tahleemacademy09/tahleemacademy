/*
  src/hooks/usePushNotifications.ts — Tahleem Academy
  ────────────────────────────────────────────────────────────────────────────
  Replaces useTimetableNotifications.ts (misleadingly named — it was never
  timetable-specific, just the generic push bootstrap). All the actual push
  logic now lives in src/lib/push-notifications.ts so it can be shared with
  NotificationPermissionBanner.tsx without duplication.

  Mount once, globally, for every authenticated user — see AppNotifications.tsx.
*/
import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ensureServiceWorker, ensureSubscribed, listenForServiceWorkerMessages } from "@/lib/push-notifications";

export function usePushNotifications() {
  const { user, profile } = useAuth();
  const initRef = useRef(false);
  const swMsgUnsub = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!user || !profile) return;

    if (!initRef.current) {
      initRef.current = true;
      ensureServiceWorker().then((reg) => {
        if (reg) ensureSubscribed(user.id);
      });
    }

    if (swMsgUnsub.current) swMsgUnsub.current();
    swMsgUnsub.current = listenForServiceWorkerMessages(user.id);

    return () => {
      if (swMsgUnsub.current) { swMsgUnsub.current(); swMsgUnsub.current = null; }
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}
