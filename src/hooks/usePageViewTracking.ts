/*
  usePageViewTracking.ts — Tahleem Academy
  Fires on every route change (public + student + teacher + admin) and logs
  a row to `page_views`. Mounted once at the app root (see <PageViewTracker />
  in App.tsx) — do not mount it more than once, it'll double-log visits.
*/
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const VISITOR_KEY = "tahleem_visitor_id";
const SESSION_KEY  = "tahleem_session_id";

function getOrCreateId(storage: Storage, key: string): string {
  try {
    let id = storage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      storage.setItem(key, id);
    }
    return id;
  } catch {
    // Private-browsing storage quota errors etc. — fall back to a
    // per-call random id rather than crashing the page.
    return crypto.randomUUID();
  }
}

function getDeviceType(): string {
  const w = window.innerWidth;
  if (w < 640) return "mobile";
  if (w < 1024) return "tablet";
  return "desktop";
}

// Admin viewing their own analytics page (or navigating around the admin
// section generally) shouldn't inflate the "visitor" numbers — skip logging
// while impersonating/previewing isn't handled here, only excludes the
// analytics page itself from self-counting noise.
const EXCLUDED_PREFIXES = ["/admin/analytics"];

export function usePageViewTracking() {
  const location = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    const path = location.pathname;
    if (EXCLUDED_PREFIXES.some(p => path.startsWith(p))) return;

    const visitorId = getOrCreateId(localStorage, VISITOR_KEY);
    const sessionId = getOrCreateId(sessionStorage, SESSION_KEY);

    supabase.from("page_views" as any).insert({
      path,
      referrer: document.referrer || null,
      visitor_id: visitorId,
      session_id: sessionId,
      user_id: user?.id || null,
      device_type: getDeviceType(),
      user_agent: navigator.userAgent,
    }).then(({ error }) => {
      if (error) console.warn("[PageViewTracking] failed to log view:", error.message);
    });
    // Re-fires if auth resolves AFTER the first paint of a given path (e.g.
    // session restore completing a beat after the initial route renders) —
    // that's intentional, so a logged-in user's first view of a session
    // still ends up correctly attributed instead of logged as anonymous.
  }, [location.pathname, user?.id]);
}
