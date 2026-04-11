/*
  LiveClassContext.tsx — Tahleem Academy
  ────────────────────────────────────────
  Global live class state that:
  - Persists across ALL navigation (never unmounts)
  - Survives page refresh via sessionStorage
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
      requireInteraction: true,
      silent: true,
      icon: "/favicon.ico",
    });
    _activeNotif.onclick = () => {
      window.focus();
      onClickReturn();
      closeNotif();
    };
  } catch {}
}

/* ── sessionStorage helpers ── */
function persist(data: object) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}
function clearPersist() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
}
function restore(): LiveClassState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p?.inCall && p?.activeSubject) return { ...p, autoJoin: true };
  } catch {}
  return null;
}

/* ── Types ── */
interface LiveClassState {
  activeSubject: any | null;
  inCall:        boolean;
  minimized:     boolean;
  autoJoin:      boolean;
}
interface LiveClassContextType extends LiveClassState {
  joinClass:    (subject: any) => void;
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

  // Stable ref so notification onclick can call setMinimized without stale closure
  const returnToClassRef = useRef<() => void>(() => {});

  // Persist on every call-state change
  useEffect(() => {
    if (state.inCall && state.activeSubject) {
      persist({ activeSubject: state.activeSubject, inCall: true, minimized: state.minimized });
    } else {
      clearPersist();
    }
  }, [state.inCall, state.minimized, state.activeSubject]);

  // Show/dismiss notification when call is minimized
  useEffect(() => {
    if (state.inCall && state.minimized && state.activeSubject) {
      showNotif(state.activeSubject, () => returnToClassRef.current());
    } else {
      closeNotif();
    }
  }, [state.inCall, state.minimized, state.activeSubject]);

  // Close notification when user comes back to the tab
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") closeNotif(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const joinClass = useCallback((subject: any) => {
    clearPersist();
    setState({ activeSubject: subject, inCall: true, minimized: false, autoJoin: false });
    // Pre-request notification permission so it's ready when needed
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const leaveClass = useCallback(() => {
    closeNotif();
    clearPersist();
    setState({ activeSubject: null, inCall: false, minimized: false, autoJoin: false });
  }, []);

  const setMinimized = useCallback((v: boolean) => {
    setState(prev => ({ ...prev, minimized: v, autoJoin: false }));
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
