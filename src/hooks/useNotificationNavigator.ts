/*
  src/hooks/useNotificationNavigator.ts — Tahleem Academy
  ─────────────────────────────────────────────────────────
  Listens for the custom "tahleem:notification-navigate" event dispatched by
  useTimetableNotifications when the user taps a push notification.

  Using a custom event (instead of window.location.href) lets us navigate via
  React Router so the SPA doesn't do a full-page reload and the user lands
  directly on the classroom/page without losing app state.

  Must be mounted inside <BrowserRouter> so useNavigate() works.
*/

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

declare global {
  interface Window {
    __tahleemNotifNavigated?: boolean;
  }
}

export function useNotificationNavigator() {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: Event) => {
      const { path } = (e as CustomEvent<{ path: string }>).detail;
      if (!path) return;
      // Mark as handled so the setTimeout fallback in useTimetableNotifications doesn't fire
      window.__tahleemNotifNavigated = true;
      setTimeout(() => { window.__tahleemNotifNavigated = false; }, 2000);
      navigate(path, { replace: false });
    };
    window.addEventListener("tahleem:notification-navigate", handler);
    return () => window.removeEventListener("tahleem:notification-navigate", handler);
  }, [navigate]);
}
