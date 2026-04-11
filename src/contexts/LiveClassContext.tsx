/*
  LiveClassContext.tsx — Tahleem Academy
  ────────────────────────────────────────
  Global call state that persists across ALL page navigation.
  The ClassroomView is mounted at App root level (not inside any page),
  so navigating to dashboard, majlis, anywhere — the call stays alive.
  
  Usage:
    const { joinClass, leaveClass, setMinimized } = useLiveClass();
    joinClass(subject)  → starts the call globally
    leaveClass()        → ends the call from anywhere
    setMinimized(true)  → shrinks to PiP overlay
*/

import {
  createContext, useContext, useState, useCallback,
  type ReactNode,
} from "react";

interface LiveClassState {
  activeSubject: any | null;
  inCall:        boolean;
  minimized:     boolean;
}

interface LiveClassContextType extends LiveClassState {
  joinClass:    (subject: any) => void;
  leaveClass:   () => void;
  setMinimized: (v: boolean) => void;
}

const LiveClassContext = createContext<LiveClassContextType | null>(null);

export const LiveClassProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<LiveClassState>({
    activeSubject: null,
    inCall:        false,
    minimized:     false,
  });

  const joinClass = useCallback((subject: any) => {
    setState({ activeSubject: subject, inCall: true, minimized: false });
  }, []);

  const leaveClass = useCallback(() => {
    setState({ activeSubject: null, inCall: false, minimized: false });
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
