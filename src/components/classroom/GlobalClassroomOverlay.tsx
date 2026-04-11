/*
  GlobalClassroomOverlay.tsx — Tahleem Academy
  ─────────────────────────────────────────────
  Rendered at App root level (outside all page routing).
  This means the call NEVER unmounts when you navigate —
  the ClassroomView stays mounted and connected even if
  you go to Dashboard, Majlis, or anywhere else.

  When minimized:
  - A floating pill overlay appears on every page
  - The full ClassroomView is hidden (display:none) but still running
  - Clicking the pill brings the full view back
  - Clicking X on the pill ends the call
*/

import { useLiveClass } from "@/contexts/LiveClassContext";
import ClassroomView from "@/components/classroom/ClassroomView";
import { Maximize2, X } from "lucide-react";

const GOLD  = "#c9a84c";
const DARK  = "#08190f";
const RED   = "#ef4444";

export default function GlobalClassroomOverlay() {
  const { activeSubject, inCall, minimized, leaveClass, setMinimized } = useLiveClass();

  // Nothing to show if not in a call
  if (!inCall || !activeSubject) return null;

  return (
    <>
      {/* Full classroom — always mounted while inCall=true, hidden when minimized */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 8000,
          display: minimized ? "none" : "block",
        }}
      >
        <ClassroomView
          subject={activeSubject}
          onLeave={leaveClass}
          onMinimize={() => setMinimized(true)}
        />
      </div>

      {/* Minimized PiP strip — floats over every page */}
      {minimized && (
        <>
          <style>{`
            @keyframes livePulse { 0%,100%{opacity:1} 50%{opacity:.3} }
            @keyframes pipSlideUp { from{transform:translateX(-50%) translateY(20px);opacity:0} to{transform:translateX(-50%) translateY(0);opacity:1} }
          `}</style>
          <div
            style={{
              position: "fixed",
              bottom: 24,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 9000,
              background: `rgba(8,25,15,.97)`,
              border: `1px solid rgba(201,168,76,.45)`,
              borderRadius: 50,
              padding: "10px 18px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              boxShadow: "0 8px 40px rgba(0,0,0,.75), 0 0 0 1px rgba(201,168,76,.15)",
              animation: "pipSlideUp .3s ease",
              minWidth: 260,
              maxWidth: "90vw",
              fontFamily: "'Cairo', sans-serif",
            }}
          >
            {/* Live pulse dot */}
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: RED, flexShrink: 0,
              animation: "livePulse 1.4s ease-in-out infinite",
            }} />

            {/* Subject name */}
            <span style={{
              color: "#fff", fontSize: 13, fontWeight: 700,
              flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {activeSubject.title}
            </span>

            {/* "Live" label */}
            <span style={{
              fontSize: 10, fontWeight: 800, color: RED,
              background: "rgba(239,68,68,.15)",
              border: "1px solid rgba(239,68,68,.3)",
              borderRadius: 8, padding: "2px 7px",
              letterSpacing: ".5px", flexShrink: 0,
            }}>
              LIVE
            </span>

            {/* Return to class */}
            <button
              onClick={() => setMinimized(false)}
              title="Return to class"
              style={{
                width: 36, height: 36, borderRadius: "50%",
                background: GOLD, border: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0,
                boxShadow: "0 2px 12px rgba(201,168,76,.45)",
                transition: "transform .15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.1)")}
              onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
            >
              <Maximize2 style={{ width: 15, height: 15, color: DARK }} />
            </button>

            {/* End call */}
            <button
              onClick={leaveClass}
              title="Leave class"
              style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "rgba(239,68,68,.18)",
                border: "1px solid rgba(239,68,68,.45)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0,
                transition: "background .15s, transform .15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,.4)"; e.currentTarget.style.transform = "scale(1.1)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(239,68,68,.18)"; e.currentTarget.style.transform = "scale(1)"; }}
            >
              <X style={{ width: 15, height: 15, color: RED }} />
            </button>
          </div>
        </>
      )}
    </>
  );
}
