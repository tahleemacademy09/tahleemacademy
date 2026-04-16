/*
  LiveClassContext.tsx — Tahleem Academy
  ────────────────────────────────────────
  Global live class state that:
  - Persists across ALL navigation (never unmounts)
  - Survives page refresh AND browser close via localStorage
  - Shows a persistent Android notification when minimized
  - Requests notification permission when joining so the class
    shows in the notification shade even when browser is minimized
*/

import {
  createContext, useContext, useState, useCallback, useEffect, useRef,
  type ReactNode,
} from "react";

const STORAGE_KEY = "tahleem_live_class";
const NOTIF_TAG   = "tahleem-live-class";

/* ── Notification helpers (module-level so they survive re-renders) ── */
let _activeNotif: Notification | null = null;

function closeNotif() {
  try { _activeNotif?.close(); } catch {}
  _activeNotif = null;
}

async function showNotif(subject: any, onClickReturn: () => void) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission().catch(() => {});
  }
  if (Notification.permission !== "granted") return;
  closeNotif();
  try {
    _activeNotif = new Notification("📡 Tahleem Academy — Live Class", {
      body: `${subject?.title || "Class"} is in progress. Tap to return.`,
      tag: NOTIF_TAG,
      requireInteraction: true,  // This makes the notification stay until user interacts
      silent: true,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
    });
    _activeNotif.onclick = () => {
      window.focus();
      onClickReturn();
      closeNotif();
    };
  } catch {}
}
/* ── localStorage helpers (survives complete browser close) ── */
function persist(data: object) {
  try { 
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.log("[LiveClassContext] Persisted to localStorage:", data);
  } catch (e) {
    console.warn("[LiveClassContext] Failed to persist:", e);
  }
}

function clearPersist() {
  try { 
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    console.log("[LiveClassContext] Cleared persistence");
  } catch {}
}

function restore(): LiveClassState | null {
  try {
    // Try localStorage first (survives browser close)
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Fall back to sessionStorage (current session only)
      raw = sessionStorage.getItem(STORAGE_KEY);
    }
    if (!raw) return null;
    
    const p = JSON.parse(raw);
    console.log("[LiveClassContext] Restored from storage:", p);
    
    if (p?.inCall && p?.activeSubject) {
      return { ...p, autoJoin: true };
    }
  } catch (e) {
    console.warn("[LiveClassContext] Failed to restore:", e);
  }
  return null;
}

/* ── Types ── */
interface LiveClassState {
  activeSubject: any | null;
  inCall:        boolean;
  minimized:     boolean;
  autoJoin:      boolean;
}

interface LiveClassContextType extends LiveClassState {  joinClass:    (subject: any) => void;
  leaveClass:   () => void;
  setMinimized: (v: boolean) => void;
}

const LiveClassContext = createContext<LiveClassContextType | null>(null);

/* ── Provider ── */
export const LiveClassProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<LiveClassState>(() => {
    const saved = restore();
    return saved ?? { activeSubject: null, inCall: false, minimized: false, autoJoin: false };
  });

  const returnToClassRef = useRef<() => void>(() => {});

  // Persist on every call-state change (both localStorage and sessionStorage)
  useEffect(() => {
    if (state.inCall && state.activeSubject) {
      const data = { 
        activeSubject: state.activeSubject, 
        inCall: true, 
        minimized: state.minimized 
      };
      persist(data);
      // Also save to sessionStorage as backup
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {}
    } else {
      clearPersist();
    }
  }, [state.inCall, state.minimized, state.activeSubject]);

  // Show/dismiss notification when call is minimized
  useEffect(() => {
    if (state.inCall && state.minimized && state.activeSubject) {
      console.log("[LiveClassContext] Showing notification for:", state.activeSubject.title);
      showNotif(state.activeSubject, () => returnToClassRef.current());
    } else {
      closeNotif();
    }
  }, [state.inCall, state.minimized, state.activeSubject]);

  // Keep notification alive even if page loses focus
  useEffect(() => {
    const onVis = () => {
      console.log("[LiveClassContext] Visibility changed:", document.visibilityState);
      // DON'T close notification when coming back to tab — let it persist
      // Only close if we're not minimized      if (document.visibilityState === "visible" && !state.minimized) {
        closeNotif();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [state.minimized]);

  const joinClass = useCallback((subject: any) => {
    console.log("[LiveClassContext] Joining class:", subject.title);
    clearPersist();
    setState({ activeSubject: subject, inCall: true, minimized: false, autoJoin: false });
    
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const leaveClass = useCallback(() => {
    console.log("[LiveClassContext] Leaving class");
    closeNotif();
    clearPersist();
    setState({ activeSubject: null, inCall: false, minimized: false, autoJoin: false });
  }, []);

  const setMinimized = useCallback((v: boolean) => {
    console.log("[LiveClassContext] Setting minimized to:", v);
    setState(prev => {
      const newState = { ...prev, minimized: v, autoJoin: false };
      // Persist immediately
      if (newState.inCall && newState.activeSubject) {
        persist({ 
          activeSubject: newState.activeSubject, 
          inCall: true, 
          minimized: v 
        });
      }
      return newState;
    });
  }, []);

  returnToClassRef.current = () => setMinimized(false);

  return (
    <LiveClassContext.Provider value={{ ...state, joinClass, leaveClass, setMinimized }}>
      {children}
    </LiveClassContext.Provider>
  );
};
export const useLiveClass = () => {
  const ctx = useContext(LiveClassContext);
  if (!ctx) throw new Error("useLiveClass must be used inside LiveClassProvider");
  return ctx;
};