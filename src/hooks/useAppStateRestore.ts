/*
  src/hooks/useAppStateRestore.ts — Tahleem Academy
  ──────────────────────────────────────────────────
  WHY THIS EXISTS:
  Android WebView kills the JS thread when the app is backgrounded for more
  than ~30–60 seconds (depending on RAM). When the user returns, the WebView
  does a full page reload — losing their route, scroll position, and any
  in-progress form state.

  HOW IT WORKS:
  1. Every 5 seconds (and on Capacitor appStateChange → background) we save:
       - window.location.pathname + search + hash
       - every page's scroll position (keyed by pathname)
  2. On mount (i.e. after a reload), if the saved path differs from the
     current path, we navigate back to it silently.
  3. After restoring scroll, we clear the saved state so stale data never
     persists across deliberate logouts or session changes.

  USAGE — add ONE call in App.tsx inside <BrowserRouter>:
    import { useAppStateRestore } from "@/hooks/useAppStateRestore";
    function AppInner() {
      useAppStateRestore();
      return <Routes>...</Routes>;
    }
    // wrap <AppInner /> inside <BrowserRouter> in App.tsx
*/

import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";

// ── Storage keys ─────────────────────────────────────────────────────────────
const KEY_PATH    = "ta_restore_path";
const KEY_SEARCH  = "ta_restore_search";
const KEY_HASH    = "ta_restore_hash";
const KEY_SCROLLS = "ta_restore_scrolls";  // JSON: { [pathname]: scrollY }
const KEY_SAVED_AT = "ta_restore_saved_at";

// Max age — don't restore state older than 30 minutes (user likely meant to restart)
const MAX_AGE_MS = 30 * 60 * 1000;

// Pages we never auto-restore to (auth, onboarding, payment flows).
// NOTE: these must be kept in sync with the actual route paths in App.tsx —
// several of these had drifted out of sync with the real routes (e.g.
// "/admin-login" vs the real "/admin-secure", "/register-continue" vs the
// real "/auth/register-continue", "/force-change-password" vs the real
// "/change-password", "/student/onboarding" vs the real "/onboarding"),
// which silently made this guard a no-op on exactly the student-pipeline
// pages it was meant to protect.
const SKIP_RESTORE_PATHS = [
  "/login", "/admin-secure", "/register", "/auth/register-continue",
  "/registration-complete", "/reset-password", "/change-password",
  "/onboarding", "/student/payment", "/student/enrollment-payment",
  "/student/entrance-exam",
];

function shouldSkip(path: string): boolean {
  return SKIP_RESTORE_PATHS.some(p => path.startsWith(p));
}

// ── Save current state ────────────────────────────────────────────────────────
function saveState(pathname: string, search: string, hash: string) {
  if (shouldSkip(pathname)) return;
  try {
    sessionStorage.setItem(KEY_PATH,     pathname);
    sessionStorage.setItem(KEY_SEARCH,   search);
    sessionStorage.setItem(KEY_HASH,     hash);
    sessionStorage.setItem(KEY_SAVED_AT, String(Date.now()));

    // Save scroll positions per page
    const existing = JSON.parse(sessionStorage.getItem(KEY_SCROLLS) || "{}");
    existing[pathname] = window.scrollY;
    sessionStorage.setItem(KEY_SCROLLS, JSON.stringify(existing));
  } catch {
    // sessionStorage quota exceeded or private mode — fail silently
  }
}

// ── Restore saved state ───────────────────────────────────────────────────────
function getSavedState() {
  try {
    const savedAt = Number(sessionStorage.getItem(KEY_SAVED_AT) || "0");
    if (!savedAt || Date.now() - savedAt > MAX_AGE_MS) {
      clearSavedState();
      return null;
    }
    const path    = sessionStorage.getItem(KEY_PATH);
    const search  = sessionStorage.getItem(KEY_SEARCH) || "";
    const hash    = sessionStorage.getItem(KEY_HASH) || "";
    const scrolls = JSON.parse(sessionStorage.getItem(KEY_SCROLLS) || "{}");
    if (!path || shouldSkip(path)) return null;
    return { path, search, hash, scrolls };
  } catch {
    return null;
  }
}

function clearSavedState() {
  try {
    [KEY_PATH, KEY_SEARCH, KEY_HASH, KEY_SCROLLS, KEY_SAVED_AT]
      .forEach(k => sessionStorage.removeItem(k));
  } catch {}
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useAppStateRestore() {
  const navigate = useNavigate();
  const location = useLocation();
  const restoredRef  = useRef(false);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 1. On first mount — attempt restore ────────────────────────────────────
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    // Never hijack navigation while sitting on an auth/registration page —
    // those pages (Login.tsx, RegisterContinue.tsx, etc.) own their own
    // post-auth redirect logic (role checks, tasjeel step resolution, payment
    // gating). If this effect ALSO navigates away on mount, the two
    // navigations land back-to-back and look like the page reloading right
    // after login. This is exactly why the bug only ever showed up for
    // students: the student pipeline is the only flow with a page like this
    // (Login.tsx) that does its own competing navigate() on mount — admin
    // has no equivalent multi-step pipeline page racing against this effect.
    if (shouldSkip(location.pathname)) return;

    const saved = getSavedState();
    if (!saved) return;

    const currentPath = location.pathname + location.search + location.hash;
    const savedFull   = saved.path + saved.search + saved.hash;

    // Only restore if we're at the true cold-start root ("/").
    // IMPORTANT: do NOT treat "/login" as a restore trigger. Login.tsx already
    // owns post-auth navigation (it resolves role + tasjeel step and picks the
    // correct destination). If this effect ALSO navigates away from "/login"
    // on mount, both navigations land back-to-back — that double-navigate is
    // exactly what showed up as "the page refreshes right after logging in"
    // for students. Admins never hit this because they sign in at
    // "/admin-secure", not "/login", so this isAtRoot check never matched for
    // them — which is why the bug only ever showed up on the student side.
    const isAtRoot = location.pathname === "/";
    // A normal component remount can happen while the browser is already on
    // the correct deep route. Never navigate in that case (or from one deep
    // route to another stale saved route): navigation itself tears down the
    // student layout and looks like a reload. Restoration is only for a real
    // native/WebView cold start that has fallen back to the root document.
    if (isAtRoot && savedFull !== currentPath) {
      // Navigate back to where user was
      navigate(saved.path + saved.search + saved.hash, { replace: true });

      // Restore scroll after navigation settles
      const scrollY = saved.scrolls[saved.path] || 0;
      if (scrollY > 0) {
        setTimeout(() => window.scrollTo({ top: scrollY, behavior: "instant" }), 300);
        setTimeout(() => window.scrollTo({ top: scrollY, behavior: "instant" }), 800);
      }
    }
    // Clear after restore — next save cycle will write fresh state
    clearSavedState();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. Continuously save current location ──────────────────────────────────
  useEffect(() => {
    // Save immediately on location change
    saveState(location.pathname, location.search, location.hash);
  }, [location.pathname, location.search, location.hash]);

  // ── 3. Periodic save every 5 seconds (captures scroll) ────────────────────
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      saveState(location.pathname, location.search, location.hash);
    }, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [location.pathname, location.search, location.hash]);

  // ── 4. Capacitor appStateChange — save immediately before backgrounding ────
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listener = CapApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) {
        // App going to background — save NOW before WebView is killed
        saveState(location.pathname, location.search, location.hash);
      }
    });

    return () => { listener.then(l => l.remove()).catch(() => {}); };
  }, [location.pathname, location.search, location.hash]);

  // ── 5. Save on page visibility change (tab switching / screen lock) ────────
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        saveState(location.pathname, location.search, location.hash);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [location.pathname, location.search, location.hash]);

  // ── 6. Clear on logout — watch for auth route ─────────────────────────────
  useEffect(() => {
    if (shouldSkip(location.pathname)) clearSavedState();
  }, [location.pathname]);
}
