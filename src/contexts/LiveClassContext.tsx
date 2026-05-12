/*
  LiveClassContext.tsx — Tahleem Academy
  Manages global live class state. Persists across navigation.
  Handles back-button interception and browser-minimize → overlay.
*/

import {
  createContext, useContext, useState, useCallback, useEffect, useRef,
  type ReactNode,
} from "react";

const STORAGE_KEY   = "tahleem_live_class";
const HISTORY_STATE = "tahleem-live-class";

/* ── SW keep-alive: pings the service worker every 20s during a live class
   to prevent the browser from suspending the tab and killing WebRTC.     */
function useLiveClassKeepAlive(inCall: boolean) {
  useEffect(() => {
    if (!inCall) return;
    const sw = navigator.serviceWorker?.controller;
    // Tell SW a live class started
    sw?.postMessage({ type: "LIVE_CLASS_START" });

    const ping = () => {
      navigator.serviceWorker?.controller?.postMessage({ type: "LIVE_CLASS_KEEPALIVE" });
    };
    // Ping every 20 seconds
    const iv = setInterval(ping, 20_000);
    // Also ping immediately when tab becomes visible again (wake from background)
    const onVis = () => { if (document.visibilityState === "visible") ping(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      navigator.serviceWorker?.controller?.postMessage({ type: "LIVE_CLASS_END" });
    };
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
  micEnabled:    boolean;
  camEnabled:    boolean;
}
interface LiveClassContextType extends LiveClassState {
  joinClass:      (subject: any) => void;
  leaveClass:     () => void;
  setMinimized:   (v: boolean) => void;
  setMicEnabled:  (v: boolean) => void;
  setCamEnabled:  (v: boolean) => void;
  toggleMicFnRef: React.MutableRefObject<() => void>;
  toggleCamFnRef: React.MutableRefObject<() => void>;
}
const LiveClassContext = createContext<LiveClassContextType | null>(null);

/* ── Provider ── */
export const LiveClassProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<LiveClassState>(() => {
    const saved = restore();
    return saved ?? { activeSubject: null, inCall: false, minimized: false, autoJoin: false, micEnabled: false, camEnabled: false };
  });

  const toggleMicFnRef = useRef<() => void>(() => {});
  const toggleCamFnRef = useRef<() => void>(() => {});

  // SW keep-alive during live class
  useLiveClassKeepAlive(state.inCall);

  // Persist call state
  useEffect(() => {
    if (state.inCall && state.activeSubject) {
      persist({ activeSubject: state.activeSubject, inCall: true, minimized: state.minimized });
    } else {
      clearPersist();
    }
  }, [state.inCall, state.minimized, state.activeSubject]);

  // Push a history entry when call starts so back button can be intercepted
  useEffect(() => {
    if (state.inCall && !state.minimized) {
      // Push a "guard" state so popstate fires before leaving the page
      history.pushState({ [HISTORY_STATE]: true }, "");
    }
  }, [state.inCall]);

  // Back button → minimize instead of navigating away
  useEffect(() => {
    if (!state.inCall) return;
    const onPop = (e: PopStateEvent) => {
      if (!e.state?.[HISTORY_STATE]) {
        history.pushState({ [HISTORY_STATE]: true }, "");
      }
      setState(prev => (prev.inCall ? { ...prev, minimized: true, autoJoin: false } : prev));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [state.inCall]);

  const joinClass = useCallback((subject: any) => {
    clearPersist();
    setState({ activeSubject: subject, inCall: true, minimized: false, autoJoin: false, micEnabled: false, camEnabled: false });
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const leaveClass = useCallback(() => {
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
    // When restoring from minimized, push guard state again
    if (!v) history.pushState({ [HISTORY_STATE]: true }, "");
  }, []);

  const setMicEnabled = useCallback((v: boolean) => setState(prev => ({ ...prev, micEnabled: v })), []);
  const setCamEnabled = useCallback((v: boolean) => setState(prev => ({ ...prev, camEnabled: v })), []);

  return (
    <LiveClassContext.Provider value={{
      ...state, joinClass, leaveClass, setMinimized,
      setMicEnabled, setCamEnabled, toggleMicFnRef, toggleCamFnRef,
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
