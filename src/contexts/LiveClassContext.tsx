/*
  LiveClassContext.tsx — Tahleem Academy
  ────────────────────────────────────────
  Global live class state that:
  - Persists across ALL navigation (never unmounts)
  - Survives page refresh AND browser close via localStorage
  - Shows a persistent Android notification when minimized
  - Exposes micEnabled / camEnabled + toggle refs so the
    GlobalClassroomOverlay can show mute buttons in the minimized pill
*/

import {
  createContext, useContext, useState, useCallback, useEffect, useRef,
  type ReactNode,
} from "react";

const STORAGE_KEY = "tahleem_live_class";
const NOTIF_TAG   = "tahleem-live-class";

/* ── Notification helpers ── */
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
      requireInteraction: true,
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

function persist(data: Record<string, any>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

function clearPersist() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}

function restore(): LiveClassState | null {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p?.inCall && p?.activeSubject) {
      return { ...p, autoJoin: true };
    }
  } catch {}
  return null;
}

/* ── Types ── */
interface LiveClassState {
  activeSubject: any | null;
  inCall:        boolean;
  minimized:     boolean;
  autoJoin:      boolean;
  micEnabled:    boolean;
  camEnabled:    boolean;
}

interface LiveClassContextType extends LiveClassState {
  joinClass:      (subject: any) => void;
  leaveClass:     () => void;
  setMinimized:   (v: boolean) => void;
  setMicEnabled:  (v: boolean) => void;
  setCamEnabled:  (v: boolean) => void;
  /** Registered by ClassControls — calls the LiveKit toggle directly */
  toggleMicFnRef: React.MutableRefObject<() => void>;
  toggleCamFnRef: React.MutableRefObject<() => void>;
}

const LiveClassContext = createContext<LiveClassContextType | null>(null);

/* ── Provider ── */
export const LiveClassProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<LiveClassState>(() => {
    const saved = restore();
    return saved ?? {
      activeSubject: null,
      inCall: false,
      minimized: false,
      autoJoin: false,
      micEnabled: false,
      camEnabled: false,
    };
  });

  const toggleMicFnRef = useRef<() => void>(() => {});
  const toggleCamFnRef = useRef<() => void>(() => {});
  const returnToClassRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (state.inCall && state.activeSubject) {
      persist({ activeSubject: state.activeSubject, inCall: true, minimized: state.minimized });
    } else {
      clearPersist();
    }
  }, [state.inCall, state.minimized, state.activeSubject]);

  useEffect(() => {
    if (state.inCall && state.minimized && state.activeSubject) {
      showNotif(state.activeSubject, () => returnToClassRef.current());
    } else {
      closeNotif();
    }
  }, [state.inCall, state.minimized, state.activeSubject]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && !state.minimized) closeNotif();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [state.minimized]);

  const joinClass = useCallback((subject: any) => {
    clearPersist();
    setState({
      activeSubject: subject,
      inCall: true,
      minimized: false,
      autoJoin: false,
      micEnabled: false,
      camEnabled: false,
    });
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const leaveClass = useCallback(() => {
    closeNotif();
    clearPersist();
    setState({ activeSubject: null, inCall: false, minimized: false, autoJoin: false, micEnabled: false, camEnabled: false });
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

  const setMicEnabled = useCallback((v: boolean) => {
    setState(prev => ({ ...prev, micEnabled: v }));
  }, []);

  const setCamEnabled = useCallback((v: boolean) => {
    setState(prev => ({ ...prev, camEnabled: v }));
  }, []);

  returnToClassRef.current = () => setMinimized(false);

  return (
    <LiveClassContext.Provider value={{
      ...state,
      joinClass,
      leaveClass,
      setMinimized,
      setMicEnabled,
      setCamEnabled,
      toggleMicFnRef,
      toggleCamFnRef,
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
