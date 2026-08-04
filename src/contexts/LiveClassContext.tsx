/*
  LiveClassContext.tsx — Tahleem Academy
  Manages global live class state. Persists across navigation.

  Back-button strategy (revised):
  ─────────────────────────────────
  • When inCall becomes true, we push ONE guard history entry.
  • popstate fires → we set minimized=true and immediately push
    the guard entry again (so the next back press also minimizes).
  • When leaving class (leaveClass), we do NOT pop history manually —
    we let the browser's natural history handle itself. This avoids
    the double-pop bug that was causing pages to unexpectedly navigate.
  • We do NOT push guard entries from GlobalClassroomOverlay to avoid
    double-sentinel issues.

  Minimize/visibilitychange:
  ─────────────────────────────────
  • NO navigate() calls. The classroom is position:fixed — the React Router
    route under it is always the correct page. Just toggle minimized state.

  Screen-lock keep-alive fix:
  ─────────────────────────────────
  • visibilitychange fires when the screen locks, but stays "hidden" until
    the user unlocks. The old onVis handler only ran wakeAudio() when
    visibilityState === "visible" — so nothing ran during screen lock.
  • We now also listen to:
      pageshow  — fires when Android brings the WebView back to foreground
      resume    — fires in Capacitor Android WebView when app resumes
      focus     — fires when the browser tab regains focus
    These all fire when the user returns from the lock screen, even if
    visibilityState is still "hidden" for a split second.
*/

import {
  createContext, useContext, useState, useCallback, useEffect, useRef,
  type ReactNode,
} from "react";
import { lockReload, unlockReload } from "@/lib/reloadGuard";
import { enterPiPKeepAlive } from "@/hooks/useBackgroundPiP";

const STORAGE_KEY   = "tahleem_live_class";
import { wasBackPressClaimed, claimBackPress } from "@/lib/backPressClaim";

const HISTORY_STATE = "tahleem-live-class";

/* ── SW keep-alive ── */
function useLiveClassKeepAlive(inCall: boolean) {
  useEffect(() => {
    if (!inCall) return;
    const sw = navigator.serviceWorker?.controller;
    sw?.postMessage({ type: "LIVE_CLASS_START" });

    // Ping every 10 s — tighter interval survives Android doze better
    const ping = () => navigator.serviceWorker?.controller?.postMessage({ type: "LIVE_CLASS_KEEPALIVE" });
    const iv = setInterval(ping, 5_000);

    // wakeAudio — called on any wake-up event (return from lock screen, tab focus, etc.)
    // Sends a SW ping AND briefly creates/resumes an AudioContext to unblock any
    // suspended audio pipeline (belt-and-suspenders alongside useBackgroundAudio).
    const wakeAudio = () => {
      ping();
      try {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        const tmpCtx = new AC();
        tmpCtx.resume().then(() => tmpCtx.close()).catch(() => {});
      } catch {}
    };

    // visibilitychange: fires on tab switch AND screen lock.
    // We wake on BOTH transitions — not just "visible" — because:
    //   • going to "hidden" means we need to ensure audio is running
    //   • returning to "visible" means we should definitely resume
    const onVis = () => wakeAudio();

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus",    wakeAudio);  // tab regains focus
    window.addEventListener("pageshow", wakeAudio);  // Android WebView returns from background
    document.addEventListener("resume", wakeAudio);  // Capacitor Android WebView resume

    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus",    wakeAudio);
      window.removeEventListener("pageshow", wakeAudio);
      document.removeEventListener("resume", wakeAudio);
      navigator.serviceWorker?.controller?.postMessage({ type: "LIVE_CLASS_END" });
    };
  }, [inCall]);
}

/* ── Reload safety net: never let an SW update reload the tab mid-class ── */
function useLiveClassReloadGuard(inCall: boolean) {
  useEffect(() => {
    if (!inCall) return;
    lockReload("live-class");
    return () => unlockReload("live-class");
  }, [inCall]);
}

/* ── localStorage helpers ── */
function persist(data: Record<string, any>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}
function clearPersist() {
  try { localStorage.removeItem(STORAGE_KEY); sessionStorage.removeItem(STORAGE_KEY); } catch {}
}
function restore(): LiveClassState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p?.inCall && p?.activeSubject) return { ...p, autoJoin: true, hasConnected: false };
  } catch {}
  return null;
}

/* ── Audio boost preference — persists across classes (small standalone key,
   not tied to the inCall restore logic since it's a lasting preference,
   not per-call state) ── */
const AUDIO_BOOST_KEY = "tahleem_audio_boost";
function restoreAudioBoost(): number {
  try {
    const raw = localStorage.getItem(AUDIO_BOOST_KEY);
    const n = raw ? parseFloat(raw) : NaN;
    if (!isNaN(n) && n >= 1 && n <= 3) return n;
  } catch {}
  return 1; // 1× = no extra boost on top of the VolumeBooster base gain
}

/* ── Types ── */
interface LiveClassState {
  activeSubject: any | null;
  inCall:        boolean;
  minimized:     boolean;
  autoJoin:      boolean;
  micEnabled:    boolean;
  camEnabled:    boolean;
  hasConnected:  boolean;
}
interface LiveClassContextType extends LiveClassState {
  joinClass:       (subject: any, opts?: { autoJoin?: boolean }) => void;
  leaveClass:      () => void;
  setMinimized:    (v: boolean) => void;
  setMicEnabled:   (v: boolean) => void;
  setCamEnabled:   (v: boolean) => void;
  setHasConnected: (v: boolean) => void;
  toggleMicFnRef:  React.MutableRefObject<() => void>;
  toggleCamFnRef:  React.MutableRefObject<() => void>;
  // FIX: "restore" sets mic ON only — safe to call on background return.
  // toggleMicFnRef flips state and must never be used for restoration.
  restoreMicFnRef: React.MutableRefObject<() => void>;
  /** Populated by ClassroomView with its full leaveSession() — saves any
      active recording, writes attendance_logs/class_participants exit rows,
      plays the leave sound, THEN calls onLeave() (=leaveClass()). Lets
      external "leave" triggers (media-notification stop button, foreground
      service, etc.) run the same complete cleanup as the in-app Leave
      button, instead of just yanking the room via bare leaveClass(). */
  leaveSessionFnRef: React.MutableRefObject<() => void>;
  /** Populated by ClassroomView. Returns the live local camera MediaStreamTrack
      (or null if camera is off / not yet published). Used by the background
      Picture-in-Picture keep-alive so it can show the real camera feed when
      video is on, and fall back to a static logo frame when it's audio-only. */
  getLocalCameraTrackRef: React.MutableRefObject<() => MediaStreamTrack | null>;
  /** Extra multiplier (1×–3×) on top of VolumeBooster's base gain — lets a
      student/teacher crank remote voices up further when they're too quiet,
      without needing everyone else to also be loud enough on their own mic. */
  audioBoost:      number;
  setAudioBoost:   (v: number) => void;
}
const LiveClassContext = createContext<LiveClassContextType | null>(null);

const DEFAULT_STATE: LiveClassState = {
  activeSubject: null, inCall: false, minimized: false,
  autoJoin: false, micEnabled: false, camEnabled: false, hasConnected: false,
};

/* ── Provider ── */
export const LiveClassProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<LiveClassState>(() => restore() ?? DEFAULT_STATE);
  const [audioBoost, setAudioBoostState] = useState<number>(() => restoreAudioBoost());
  const guardPushed = useRef(false);

  const setAudioBoost = useCallback((v: number) => {
    setAudioBoostState(v);
    try { localStorage.setItem(AUDIO_BOOST_KEY, String(v)); } catch {}
  }, []);

  const toggleMicFnRef  = useRef<() => void>(() => {});
  const toggleCamFnRef  = useRef<() => void>(() => {});
  const restoreMicFnRef = useRef<() => void>(() => {});
  const leaveSessionFnRef = useRef<() => void>(() => {});
  const getLocalCameraTrackRef = useRef<() => MediaStreamTrack | null>(() => null);

  useLiveClassKeepAlive(state.inCall);
  useLiveClassReloadGuard(state.inCall);

  // Persist call state
  useEffect(() => {
    if (state.inCall && state.activeSubject) {
      persist({ activeSubject: state.activeSubject, inCall: true, minimized: state.minimized });
    } else {
      clearPersist();
    }
  }, [state.inCall, state.minimized, state.activeSubject]);

  // Push ONE guard entry when the call starts (and only once)
  useEffect(() => {
    if (state.inCall && !guardPushed.current) {
      history.pushState({ [HISTORY_STATE]: true }, "");
      guardPushed.current = true;
    }
    if (!state.inCall) {
      guardPushed.current = false;
    }
  }, [state.inCall]);

  // Back button → minimize instead of navigating away.
  // Re-push the guard so the NEXT back press also minimizes.
  //
  // FIX: if a material/Quran panel inside the classroom already claimed this
  // exact back-press (e.g. to minimize itself to a pip, or close a viewer),
  // we must NOT also minimize the whole class here — that was the bug where
  // minimizing a material accidentally minimized/closed the live class too.
  // wasBackPressClaimed() checks a shared flag set synchronously by panels
  // in a capture-phase listener, so it's already up to date by the time this
  // bubble-phase handler runs.
  useEffect(() => {
    if (!state.inCall) return;
    const onPop = (_e: PopStateEvent) => {
      // Always re-push the guard so back button keeps working for next time
      history.pushState({ [HISTORY_STATE]: true }, "");
      if (wasBackPressClaimed()) return; // a panel already handled this press
      // FIX ("back button terminates the overlay instead of minimizing it"):
      // popstate also fires React Router's OWN history listener, which updates
      // location.pathname to whatever the "previous" route now is — and that
      // update can land (and re-render) before this handler's minimize takes
      // effect. GlobalClassroomOverlay watches location.pathname and calls
      // leaveClass() the moment it sees a route outside its allowed prefixes,
      // so a back-press landing on a disallowed route (e.g. a public page)
      // could end the whole call instead of just minimizing it. Claiming the
      // press here tells that effect "this navigation was caused by our own
      // back-press handling, not a real navigate-away" so it skips leaveClass()
      // for this event.
      claimBackPress();
      // Minimize the classroom
      setState(prev => prev.inCall ? { ...prev, minimized: true, autoJoin: false } : prev);
      // Attempt PiP keep-alive — this is a real browser back-navigation event
      // triggered directly by the phone's back gesture/button, so (unlike
      // Capacitor's native backButton bridge event) it has a real chance of
      // counting as a genuine user gesture. Untested on-device; safe to try.
      enterPiPKeepAlive(
        state.camEnabled ? getLocalCameraTrackRef.current?.() ?? null : null
      );
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [state.inCall, state.camEnabled]);

  const joinClass = useCallback((subject: any, opts?: { autoJoin?: boolean }) => {
    clearPersist();
    guardPushed.current = false; // reset so the effect pushes a fresh guard
    // FIX ("class starts before I actually join"): every "Join Class" button
    // across the app (dashboard cards, teaching hub, admin management, deep
    // links, reminder notifications) was calling joinClass with
    // { autoJoin: true }, which made ClassroomView skip ClassLobby entirely
    // and connect to LiveKit the instant this fired — before the user ever
    // saw a mic/camera preview or pressed a real "Join"/"Start" button.
    // `opts.autoJoin` is intentionally ignored here now — autoJoin is only
    // ever true when `restore()` (above) brings back an ALREADY-CONNECTED
    // class after a page refresh, which is the one case where skipping the
    // lobby is correct (the user was already in the room). Every fresh join
    // now always lands on the lobby and requires an explicit tap.
    setState({
      activeSubject: subject, inCall: true, minimized: false,
      autoJoin: false, micEnabled: false,
      camEnabled: false, hasConnected: false,
    });
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const leaveClass = useCallback(() => {
    clearPersist();
    guardPushed.current = false;
    setState(DEFAULT_STATE);
  }, []);

  const setMinimized = useCallback((v: boolean) => {
    setState(prev => {
      const next = { ...prev, minimized: v, autoJoin: false };
      if (next.inCall && next.activeSubject) {
        persist({ activeSubject: next.activeSubject, inCall: true, minimized: v });
      }
      return next;
    });
  }, []);

  const setMicEnabled   = useCallback((v: boolean) => setState(prev => ({ ...prev, micEnabled: v })), []);
  const setCamEnabled   = useCallback((v: boolean) => setState(prev => ({ ...prev, camEnabled: v })), []);
  const setHasConnected = useCallback((v: boolean) => setState(prev => ({ ...prev, hasConnected: v })), []);

  return (
    <LiveClassContext.Provider value={{
      ...state, joinClass, leaveClass, setMinimized,
      setMicEnabled, setCamEnabled, setHasConnected,
      toggleMicFnRef, toggleCamFnRef, restoreMicFnRef, leaveSessionFnRef, getLocalCameraTrackRef,
      audioBoost, setAudioBoost,
    }}>
      {children}
    </LiveClassContext.Provider>
  );
};

export const useLiveClass = () => {
  const ctx = useContext(LiveClassContext);
  if (!ctx) throw new Error("useLiveClass must be used inside LiveClassProvider");
  return ctx;
};

