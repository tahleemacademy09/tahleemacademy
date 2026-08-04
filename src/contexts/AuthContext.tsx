// src/contexts/AuthContext.tsx
// Fixed: removed getSession() duplicate fetch that raced with onAuthStateChange.
// In Supabase JS v2, onAuthStateChange fires INITIAL_SESSION immediately on subscribe
// with the persisted session — so getSession() is redundant and causes a loading flicker
// where roles[] is briefly empty, causing ProtectedRoute to redirect incorrectly.
// Also added: mounted guard, 8s safety timeout so loading never hangs forever,
// and exponential-backoff retry for transient network errors on fetchUserData.
//
// Fix (2026-05-12): timedOutRef guard was blocking SIGNED_IN events that fired after
// the 8s timeout (e.g. user typed slowly then clicked Sign In). This caused the
// "must refresh to login" bug. Now only INITIAL_SESSION is suppressed after timeout;
// genuine new auth events (SIGNED_IN etc.) reset the guard and proceed normally.
//
// Fix (2026-06-18): TOKEN_REFRESHED was setting loading=true and re-running fetchUserData,
// causing the full-page spinner to appear every time the user returned from background.
// Supabase fires TOKEN_REFRESHED silently whenever the JWT is auto-renewed (every ~1hr,
// and immediately on app resume). We already have the user's roles & profile — we only
// need to update the session object. No spinner, no profile re-fetch.

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase, hasPersistedSupabaseSession } from "@/integrations/supabase/client";
import { logDiag } from "@/lib/diagnostics";
import type { User, Session } from "@supabase/supabase-js";

export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url?: string;
  phone?: string;
  onboarding_complete?: boolean;
  onboarding_completed?: boolean;
  has_taken_entrance_exam?: boolean;
  payment_status?: string;
  course_level?: string;
  level?: string;
  [key: string]: unknown;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: string[];
  profile: UserProfile | null;
  mustChangePassword: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<any>;
  signIn: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<void>;
  hasRole: (role: string) => boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user,               setUser]               = useState<User | null>(null);
  const [session,            setSession]            = useState<Session | null>(null);
  const [loading,            setLoading]            = useState(true);
  const [roles,              setRoles]              = useState<string[]>([]);
  const [profile,            setProfile]            = useState<UserProfile | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  // Guards against stale state from unmounted component or concurrent fetches
  const mountedRef  = useRef(true);
  const fetchingRef = useRef<string | null>(null); // userId currently being fetched
  const profileRef  = useRef<UserProfile | null>(null); // mirrors profile state for use in closures

  // FIX (always-reloads-on-resume bug): whether to show the blocking full-page
  // spinner is decided below using this flag, NOT profileRef.current.
  // profileRef.current only gets set if fetchUserData *succeeds* — but on a
  // slow/flaky connection (or a legitimate user with no profile row yet) it
  // can stay null forever. Keying off profileRef.current meant every auth
  // event after that (including the getSession() call the resume/visibility
  // listener below fires every time the user un-minimizes) saw "no profile
  // yet" and set loading=true again, unmounting the entire app behind
  // ProtectedRoute's spinner — indistinguishable from a hard reload to the
  // user, even though nothing actually reloaded.
  // initialLoadDoneRef is set exactly once, after the FIRST fetch attempt
  // finishes (success, final failure, or safety-timeout), and never again —
  // so the blocking spinner can only ever appear once per session.
  const initialLoadDoneRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── FIX: proactive session refresh on resume ───────────────────────────────
  // Root cause of the "randomly logged out" reports: supabase-js's autoRefreshToken
  // relies on an internal setTimeout to renew the JWT a little before it expires.
  // Live classes routinely run 45-60+ minutes, and while the phone is locked or the
  // app is backgrounded, mobile browsers/WebViews throttle or fully suspend JS timers
  // — exactly the same throttling this codebase already works around elsewhere for
  // audio/WakeLock (see LiveClassContext's wakeAudio). That internal refresh timer
  // gets suspended too, so by the time the person unlocks their phone and comes back,
  // the access token has quietly expired. The very next Supabase call then fails with
  // 401, and depending on where that happens it can cascade into what looks like a
  // random logout mid-class.
  //
  // Fix: on every resume signal (tab focus, pageshow, Capacitor resume), explicitly
  // call getSession() — supabase-js checks the token's expiry inside that call and
  // silently refreshes it via the refresh token if needed. This runs the refresh the
  // moment the app is actually alive and has network again, instead of waiting on a
  // timer that may never have fired while suspended. No spinner, no profile re-fetch —
  // onAuthStateChange's existing TOKEN_REFRESHED branch (below) already handles the
  // resulting session update silently.
  useEffect(() => {
    let wakeInFlight = false;
    let lastWakeCheckAt = 0;

    const wakeSession = () => {
      // Android emits visibilitychange, focus, pageshow and Capacitor resume
      // together for one foreground transition. Calling getSession for every
      // signal can start several concurrent refreshes and emit several auth
      // events, making student-only guards appear to remount. Collapse the
      // burst into one non-blocking check.
      const now = Date.now();
      if (wakeInFlight || now - lastWakeCheckAt < 2_000) return;
      wakeInFlight = true;
      lastWakeCheckAt = now;
      supabase.auth.getSession()
        .catch((err) => {
          console.warn("[AuthContext] resume session check failed:", err);
        })
        .finally(() => { wakeInFlight = false; });
    };
    const onVis = () => { if (document.visibilityState === "visible") wakeSession(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", wakeSession);
    window.addEventListener("pageshow", wakeSession);
    document.addEventListener("resume", wakeSession); // Capacitor Android WebView
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", wakeSession);
      window.removeEventListener("pageshow", wakeSession);
      document.removeEventListener("resume", wakeSession);
    };
  }, []);

  // ── Fetch roles + profile with simple retry on network error ──────────────
  const fetchUserData = async (userId: string): Promise<void> => {
    // Skip if a fetch for this user is already in flight
    if (fetchingRef.current === userId) return;
    fetchingRef.current = userId;

    const attempt = async (tries = 0): Promise<void> => {
      try {
        // ── iOS timeout: race each attempt against 5 seconds ─────────────
        // Without this, hanging Supabase connections on iOS keep authLoading=true
        // for the full 8-second safety timeout, which cascades into every hook
        // that waits on authLoading (useTasjeel, usePaymentAccess) and causes
        // the dashboard to appear blank/stuck for 8+ seconds.
        const withTimeout = <T,>(p: Promise<T>) =>
          Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("auth_timeout")), 5000))]);

        const [rolesRes, profileRes] = await withTimeout(Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", userId),
          supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
        ]));
        if (!mountedRef.current || fetchingRef.current !== userId) return;
        if (rolesRes.data)    setRoles(rolesRes.data.map((r) => r.role));
        if (profileRes.data)  {
          profileRef.current = profileRes.data as UserProfile;
          setProfile(profileRes.data as UserProfile);
        }
      } catch (err) {
        console.warn("[AuthContext] fetchUserData error (attempt", tries + 1, "):", err);
        if (tries < 2 && mountedRef.current) {
          // Shorter backoff on iOS: 400ms, 800ms
          await new Promise(r => setTimeout(r, 400 * Math.pow(2, tries)));
          return attempt(tries + 1);
        }
      } finally {
        if (mountedRef.current && fetchingRef.current === userId) {
          fetchingRef.current = null;
          setLoading(false);
        }
        initialLoadDoneRef.current = true;
      }
    };

    await attempt();
  };

  const refreshProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data && mountedRef.current) setProfile(data as UserProfile);
  };

  useEffect(() => {
    // ── Safety timeout — loading must resolve within a bounded time no matter what ──
    // Prevents users getting permanently stuck on the spinner.
    // timedOutRef prevents the slow INITIAL_SESSION fetch from overwriting state
    // after the timeout has already forced loading=false.
    const timedOutRef = { current: false };
    // Set the instant ANY auth event arrives, so a queued safety-timeout
    // callback that fires a tick later never overrides real data that just
    // came in.
    const receivedEventRef = { current: false };

    // FIX (login flash on resume — looks exactly like a reload): the original
    // 8s timeout unconditionally forced loading=false, and ProtectedRoute
    // treats loading=false + user===null as "not signed in" → redirect to
    // /login. On a device that WAS signed in, if onAuthStateChange's very
    // first event just hasn't arrived yet after 8s (typically because the
    // network is still re-establishing right after the app resumes from
    // background — see the WebSocket reconnect failures that accompany
    // this in the console), that redirect fires anyway. Then the instant
    // the real event finally arrives, the person is bounced straight back
    // to /student. Two navigations back-to-back, dashboard unmounted and
    // remounted in between — indistinguishable from a reload even though
    // the page never actually reloaded.
    // Fix: at 8s, only force the logged-out state if there's no persisted
    // session token on this device (i.e. this person was never signed in
    // here, so there's nothing to wait for — send them to /login promptly).
    // If a token IS present, they were signed in — give the slow check a
    // longer grace window instead of assuming they're logged out.
    let safetyTimeout: ReturnType<typeof setTimeout>;
    const scheduleSafetyTimeout = (ms: number, isFinal: boolean) =>
      setTimeout(() => {
        if (!mountedRef.current || receivedEventRef.current) return;

        if (!isFinal && hasPersistedSupabaseSession()) {
          console.warn(
            "[AuthContext] Safety timeout at", ms, "ms — persisted session found on " +
            "this device, extending grace window instead of forcing a logged-out state"
          );
          logDiag("auth_safety_timeout_extended", { atMs: ms });
          safetyTimeout = scheduleSafetyTimeout(12000, true);
          return;
        }

        console.warn("[AuthContext] Safety timeout — forcing loading=false");
        logDiag("auth_safety_timeout_forced_logout", {
          atMs: ms,
          hadPersistedSession: hasPersistedSupabaseSession(),
        });
        timedOutRef.current = true;
        initialLoadDoneRef.current = true; // never show the blocking spinner again this session
        setLoading(false);
      }, ms);
    safetyTimeout = scheduleSafetyTimeout(8000, false);

    // ── Single source of truth: onAuthStateChange ─────────────────────────────
    // In Supabase JS v2 this fires immediately (synchronously) with INITIAL_SESSION
    // so we do NOT need getSession() — calling both causes a double-fetch race.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!receivedEventRef.current) {
        logDiag("auth_state_change_first_event", { event: _event, hasSession: !!sess });
      }
      receivedEventRef.current = true;
      if (!mountedRef.current) return;

      // After the 8s safety timeout we suppress INITIAL_SESSION only — that one
      // was already too slow and loading=false has been forced. But genuine new
      // auth events (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED) must still be
      // processed, otherwise clicking Sign In after ~8s on the page does nothing
      // and the user has to refresh (the "must refresh to login" bug).
      if (timedOutRef.current) {
        if (_event === "INITIAL_SESSION") return;
        timedOutRef.current = false; // reset so subsequent events flow normally
      }

      // ── KEY FIX: TOKEN_REFRESHED must NOT show a spinner ─────────────────────
      // Supabase silently refreshes the JWT in the background (every ~1 hour and
      // immediately when the app returns from background). The user is already
      // authenticated — we just need the new session token, NOT a full profile
      // re-fetch. Setting loading=true here causes ProtectedRoute to render the
      // full-page spinner every single time the user switches back to the app.
      if (_event === "TOKEN_REFRESHED") {
        // Keep the existing User object identity when the account did not
        // change. Numerous student hooks consume `user`; replacing it merely
        // because the access token rotated used to restart their effects and
        // looked like a page remount after returning from the background.
        setSession(sess);
        setUser((current) => {
          const next = sess?.user ?? null;
          return current?.id === next?.id ? current : next;
        });
        return;
      }

      setSession(sess);
      setUser(sess?.user ?? null);

      const mustChange = sess?.user?.user_metadata?.must_change_password === true;
      setMustChangePassword(mustChange);

      if (sess?.user) {
        // Only show the full-page spinner on the true FIRST load of this
        // session. On resume/token-refresh cycles (or if the very first
        // profile fetch happened to be slow/fail), initialLoadDoneRef is
        // already true — setting loading=true here would unmount the entire
        // dashboard and cause the "reload on minimize" bug.
        if (!initialLoadDoneRef.current) setLoading(true);
        fetchUserData(sess.user.id);
      } else {
        // Signed out — clear everything immediately
        fetchingRef.current = null;
        profileRef.current  = null;
        initialLoadDoneRef.current = false;
        setRoles([]);
        setProfile(null);
        setMustChangePassword(false);
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signUp = async (email: string, password: string, fullName: string) =>
    supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/register-continue`,
        data: { full_name: fullName },
      },
    });

  const signIn = async (email: string, password: string) =>
    supabase.auth.signInWithPassword({ email, password });

  const signOut = async () => {
    fetchingRef.current = null;
    initialLoadDoneRef.current = false;
    await supabase.auth.signOut();
    if (mountedRef.current) {
      setUser(null);
      setSession(null);
      setRoles([]);
      setProfile(null);
      setMustChangePassword(false);
    }
  };

  const hasRole = (role: string) => roles.includes(role);

  return (
    <AuthContext.Provider
      value={{
        user, session, loading, roles, profile, mustChangePassword,
        signUp, signIn, signOut, hasRole, refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};