/*
  LiveClassContext.tsx — Tahleem Academy
  ────────────────────────────────────────
  Global call state that persists across ALL page navigation AND page refreshes.
  State is saved to sessionStorage so refresh / browser-minimize / re-open
  restores the live class automatically.

  Usage:
    const { joinClass, leaveClass, setMinimized } = useLiveClass();
    joinClass(subject)  → starts the call globally
    leaveClass()        → ends the call from anywhere
    setMinimized(true)  → shrinks to PiP overlay
*/

import {
  createContext, useContext, useState, useCallback, useEffect,
  type ReactNode,
} from "react";

const STORAGE_KEY = "tahleem_live_class";

interface LiveClassState {
  activeSubject: any | null;
  inCall:        boolean;
  minimized:     boolean;
  autoJoin:      boolean; // true when state was restored from sessionStorage
}

interface LiveClassContextType extends LiveClassState {
  joinClass:    (subject: any) => void;
  leaveClass:   () => void;
  setMinimized: (v: boolean) => void;
}

const LiveClassContext = createContext<LiveClassContextType | null>(null);

/** Try to restore saved class state from sessionStorage */
function loadSaved(): LiveClassState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.inCall && parsed.activeSubject) {
        return { ...parsed, autoJoin: true };
      }
    }
  } catch {}
  return { activeSubject: null, inCall: false, minimized: false, autoJoin: false };
}

export const LiveClassProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<LiveClassState>(loadSaved);

  // Persist to sessionStorage whenever call state changes
  useEffect(() => {
    if (state.inCall && state.activeSubject) {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
          activeSubject: state.activeSubject,
          inCall:        state.inCall,
          minimized:     state.minimized,
          autoJoin:      false, // never persist autoJoin=true
        }));
      } catch {}
    } else {
      try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
    }
  }, [state.inCall, state.minimized, state.activeSubject]);

  const joinClass = useCallback((subject: any) => {
    setState({ activeSubject: subject, inCall: true, minimized: false, autoJoin: false });
  }, []);

  const leaveClass = useCallback(() => {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
    setState({ activeSubject: null, inCall: false, minimized: false, autoJoin: false });
  }, []);

  const setMinimized = useCallback((v: boolean) => {
    setState(prev => ({ ...prev, minimized: v }));
  }, []);

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
