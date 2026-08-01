// src/hooks/useVisibleRealtime.ts
//
// WHY: an always-open Realtime WebSocket is the single biggest reason Android
// Chrome / the Capacitor WebView *evicts* a backgrounded tab instead of merely
// suspending it. When the user comes back, the WebView re-creates the document
// from scratch — which looks exactly like "the page reloaded every time I
// minimize for a few seconds". Teachers/admins never saw it because the student
// screens are the ones holding several of these sockets open at once
// (notifications, dashboard alerts, academic levels, Majlis chat/presence).
//
// FIX: keep every Realtime subscription open ONLY while the tab is visible.
// Tear it down on hide, rebuild it on return, and run an optional catch-up
// fetch so nothing is missed while the socket was closed.
//
// Usage:
//   useVisibleRealtime(
//     () => supabase.channel("x").on(...).subscribe(),
//     [userId],
//     () => refetch(),   // optional catch-up on resume
//   );

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

type Chan = ReturnType<typeof supabase.channel>;

export function useVisibleRealtime(
  build: () => Chan | null,
  deps: unknown[],
  onResume?: () => void,
) {
  const buildRef  = useRef(build);
  const resumeRef = useRef(onResume);
  buildRef.current  = build;
  resumeRef.current = onResume;

  useEffect(() => {
    let channel: Chan | null = null;
    let firstOpen = true;

    const open = () => {
      if (channel) return;
      channel = buildRef.current();
      if (!firstOpen) resumeRef.current?.();
      firstOpen = false;
    };
    const close = () => {
      if (!channel) return;
      supabase.removeChannel(channel);
      channel = null;
    };

    if (document.visibilityState === "visible") open();

    const onVisibility = () => {
      if (document.visibilityState === "visible") open();
      else close();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
