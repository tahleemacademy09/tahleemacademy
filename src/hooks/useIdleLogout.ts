/**
 * useIdleLogout — Auto-logs out user after 30 minutes of inactivity.
 * Accepts an optional `inCall` flag — when true the timers are suspended
 * so the user is never kicked out during a live class.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const IDLE_MINUTES = 30;
const WARN_SECONDS = 60;

export function useIdleLogout(inCall = false) {
  const { user }      = useAuth();
  const idleTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showWarn,  setShowWarn]  = useState(false);
  const [countdown, setCountdown] = useState(WARN_SECONDS);
  const countRef      = useRef(WARN_SECONDS);
  const countInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAll = useCallback(() => {
    if (idleTimer.current)     clearTimeout(idleTimer.current);
    if (warnTimer.current)     clearTimeout(warnTimer.current);
    if (countInterval.current) clearInterval(countInterval.current);
  }, []);

  const doLogout = useCallback(async () => {
    setShowWarn(false);
    await supabase.auth.signOut();
    window.location.href = "/login?reason=idle";
  }, []);

  const startCountdown = useCallback(() => {
    setShowWarn(true);
    countRef.current = WARN_SECONDS;
    setCountdown(WARN_SECONDS);
    countInterval.current = setInterval(() => {
      countRef.current--;
      setCountdown(countRef.current);
      if (countRef.current <= 0) {
        clearInterval(countInterval.current!);
        doLogout();
      }
    }, 1000);
  }, [doLogout]);

  const reset = useCallback(() => {
    if (!user || inCall) return; // never reset during a live call
    clearAll();
    setShowWarn(false);
    countRef.current = WARN_SECONDS;
    const warnAt   = (IDLE_MINUTES * 60 - WARN_SECONDS) * 1000;
    const logoutAt = IDLE_MINUTES * 60 * 1000;
    warnTimer.current = setTimeout(startCountdown, warnAt);
    idleTimer.current = setTimeout(doLogout, logoutAt);
  }, [user, inCall, clearAll, startCountdown, doLogout]);

  // Suspend timers while in a call; resume when call ends
  useEffect(() => {
    if (inCall) {
      clearAll();
      setShowWarn(false);
    } else {
      reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inCall]);

  useEffect(() => {
    if (!user || inCall) return;
    const events  = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    const handler = () => reset();
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    reset();
    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      clearAll();
    };
  }, [user, inCall, reset, clearAll]);

  const stayLoggedIn = useCallback(() => {
    if (countInterval.current) clearInterval(countInterval.current);
    reset();
  }, [reset]);

  return { showWarn, countdown, stayLoggedIn };
}
