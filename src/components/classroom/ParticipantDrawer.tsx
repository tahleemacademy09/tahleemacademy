import { useState } from "react";
import { useParticipants, useLocalParticipant } from "@livekit/components-react";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { ParticipantTile } from "./classroomComponents";

const ParticipantDrawer = ({ isMobile, dim = false }: { isMobile: boolean; dim?: boolean }) => {
  const [open, setOpen] = useState(false);
  const { localParticipant } = useLocalParticipant();
  const all = useParticipants();
  const remotes = all.filter(p => p.identity !== localParticipant?.identity);
  const ordered = localParticipant ? [localParticipant, ...remotes] : remotes;
  const width = isMobile ? "min(48vw, 210px)" : "250px";

  return (
    <>
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width,
          zIndex: 57,
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform .26s cubic-bezier(.2,.8,.2,1)",
          background: "rgba(20,22,25,.94)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderRight: "1px solid rgba(255,255,255,.08)",
          display: "flex",
          flexDirection: "column",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        <div
          style={{
            padding: "12px 14px 8px",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.4,
            color: "rgba(255,255,255,.65)",
            fontFamily: "system-ui,sans-serif",
            flexShrink: 0,
          }}
        >
          Participants ({ordered.length})
        </div>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
            padding: "4px 8px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {open &&
            ordered.map(p => (
              <div
                key={p.identity}
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "4 / 3",
                  flexShrink: 0,
                  borderRadius: 14,
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,.1)",
                  background: "#111",
                }}
              >
                <ParticipantTile
                  participant={p}
                  isLocal={p.identity === localParticipant?.identity}
                  size="small"
                />
              </div>
            ))}
        </div>
      </div>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={open ? "Hide participants" : "Show participants"}
        style={{
          position: "absolute",
          top: "50%",
          left: open ? width : 0,
          transform: "translateY(-50%)",
          transition: "left .26s cubic-bezier(.2,.8,.2,1), opacity .2s ease",
          zIndex: 58,
          width: 24,
          height: 68,
          padding: 0,
          border: "1px solid rgba(255,255,255,.12)",
          borderLeft: "none",
          borderRadius: "0 14px 14px 0",
          background: "rgba(32,33,36,.78)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          color: "#fff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: dim && !open ? 0.55 : 1,
        }}
      >
        {open ? <ChevronLeft style={{ width: 18, height: 18 }} /> : <ChevronRight style={{ width: 18, height: 18 }} />}
      </button>
    </>
  );
};

export default ParticipantDrawer;
