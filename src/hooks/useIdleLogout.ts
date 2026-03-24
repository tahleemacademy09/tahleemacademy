/**
 * useIdleLogout — Auto-logs out user after N minutes of inactivity.
 * Tracks mouse, keyboard, touch, and scroll events.
 * Shows a 60-second warning before logout.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const IDLE_MINUTES = 5;
const WARN_SECONDS = 60;

export function useIdleLogout() {
  const { user } = useAuth();
  const idleTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showWarn,  setShowWarn]  = useState(false);
  const [countdown, setCountdown] = useState(WARN_SECONDS);
  const countRef    = useRef(WARN_SECONDS);
  const countInterval = useRef<ReturnType<typeof setInterval> | null>(null);

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
        if (countInterval.current) clearInterval(countInterval.current);
        doLogout();
      }
    }, 1000);
  }, [doLogout]);

  const reset = useCallback(() => {
    if (!user) return;
    // Clear any existing timers
    if (idleTimer.current)   clearTimeout(idleTimer.current);
    if (warnTimer.current)   clearTimeout(warnTimer.current);
    if (countInterval.current) clearInterval(countInterval.current);
    setShowWarn(false);
    countRef.current = WARN_SECONDS;

    // Set idle timer: warn at (IDLE_MINUTES - 1) min, logout at IDLE_MINUTES min
    const warnAt   = (IDLE_MINUTES * 60 - WARN_SECONDS) * 1000;
    const logoutAt = IDLE_MINUTES * 60 * 1000;

    warnTimer.current = setTimeout(startCountdown, warnAt);
    idleTimer.current = setTimeout(doLogout, logoutAt);
  }, [user, startCountdown, doLogout]);

  useEffect(() => {
    if (!user) return;

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    const handler = () => reset();

    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    reset(); // start on mount

    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (idleTimer.current)   clearTimeout(idleTimer.current);
      if (warnTimer.current)   clearTimeout(warnTimer.current);
      if (countInterval.current) clearInterval(countInterval.current);
    };
  }, [user, reset]);

  const stayLoggedIn = useCallback(() => {
    if (countInterval.current) clearInterval(countInterval.current);
    reset();
  }, [reset]);

  return { showWarn, countdown, stayLoggedIn };
}
