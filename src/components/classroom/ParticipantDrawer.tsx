import { useState, useEffect, useContext, useReducer } from "react";
import { useParticipants, useLocalParticipant, useRoomContext } from "@livekit/components-react";
import { Track } from "livekit-client";
import { ChevronRight, ChevronLeft, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { ParticipantTile, ClassroomAdminContext, queueMediaOp } from "./classroomComponents";
import { toast } from "@/hooks/use-toast";

// Name + mic/camera controls shown under each participant in the side list.
//  • Your own row: toggles your own mic / camera.
//  • Other people's rows (teacher/admin only): mute / unmute their mic and turn their camera off
//    (same force_mute / force_unmute / force_cam_off signals the Participants panel uses).
const ParticipantControlRow = ({ participant, isLocal }: { participant: any; isLocal: boolean }) => {
  const room = useRoomContext();
  const { isPrivileged, camLocked } = useContext(ClassroomAdminContext);
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const evs = ["trackMuted", "trackUnmuted", "trackPublished", "trackUnpublished", "trackSubscribed", "trackUnsubscribed", "participantNameChanged"];
    evs.forEach(e => participant.on?.(e, tick));
    return () => evs.forEach(e => participant.off?.(e, tick));
  }, [participant]);

  const pubOn = (src: any) => {
    const pub = participant.getTrackPublication?.(src);
    return !!pub && !pub.isMuted && !!(pub.track || isLocal);
  };
  const micOn = pubOn(Track.Source.Microphone);
  const camOn = pubOn(Track.Source.Camera);
  const name = participant.name || participant.identity || "User";
  const canControl = isLocal || isPrivileged;
  // Your own camera button is disabled while the class has video turned off.
  const camBlocked = isLocal && !!camLocked;

  const send = (type: string) => {
    try {
      room?.localParticipant?.publishData(
        new TextEncoder().encode(JSON.stringify({ type, target: participant.identity })),
        { reliable: true }
      );
    } catch {}
  };
  const toggleMic = async (e: any) => {
    e.stopPropagation();
    if (isLocal) {
      try { await queueMediaOp(room, () => room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled)); } catch {}
      return;
    }
    send(micOn ? "force_mute" : "force_unmute");
    toast({ title: micOn ? `🔇 ${name} muted` : `🎤 ${name} unmuted` });
  };
  const toggleCam = async (e: any) => {
    e.stopPropagation();
    if (isLocal) {
      if (camBlocked) return;
      try { await queueMediaOp(room, () => room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled)); } catch {}
      return;
    }
    if (camOn) { send("force_cam_off"); toast({ title: `📷 ${name}'s camera turned off` }); }
    else toast({ title: "Only they can turn their camera on", description: `${name} must switch it on themselves.` });
  };
  const btn = (on: boolean, enabled: boolean): React.CSSProperties => ({
    width: 30, height: 30, borderRadius: "50%", border: "none", padding: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: enabled ? "pointer" : "default", opacity: enabled ? 1 : 0.6,
    background: on ? "rgba(255,255,255,.14)" : "rgba(239,68,68,.22)",
    color: on ? "#fff" : "#fca5a5",
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 4px 2px" }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: "#fff", fontFamily: "system-ui,sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: "0 1px 3px rgba(0,0,0,.7)" }}>
        {name}{isLocal ? " (You)" : ""}
      </span>
      <button data-tile-control="true" onClick={canControl ? toggleMic : undefined} title={micOn ? "Mute" : "Unmute"} style={btn(micOn, canControl)}>
        {micOn ? <Mic style={{ width: 15, height: 15 }} /> : <MicOff style={{ width: 15, height: 15 }} />}
      </button>
      <button data-tile-control="true" disabled={camBlocked} onClick={canControl && !camBlocked ? toggleCam : undefined} title={camBlocked ? "Video is turned off for this class" : camOn ? "Turn camera off" : "Camera off"} style={{ ...btn(camOn, canControl && !camBlocked), ...(camBlocked ? { cursor: "not-allowed" } : {}) }}>
        {camOn ? <Video style={{ width: 15, height: 15 }} /> : <VideoOff style={{ width: 15, height: 15 }} />}
      </button>
    </div>
  );
};

const ParticipantDrawer = ({ isMobile, dim = false }: { isMobile: boolean; dim?: boolean }) => {
  const [open, setOpen] = useState(false);
  const { localParticipant } = useLocalParticipant();
  const all = useParticipants();
  const remotes = all.filter(p => p.identity !== localParticipant?.identity);
  const ordered = localParticipant ? [localParticipant, ...remotes] : remotes;
  const width = isMobile ? "min(48vw, 210px)" : "250px";

  return (
    <>
      {/* invisible tap-catcher: tapping the screen slides the drawer away */}
      {open && (
        <div
          onClick={e => { e.stopPropagation(); setOpen(false); }}
          style={{ position: "absolute", inset: 0, zIndex: 56, background: "transparent" }}
        />
      )}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width,
          zIndex: 57,
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform .26s cubic-bezier(.2,.8,.2,1), padding .28s ease",
          background: "rgba(0,0,0,.2)",
          borderRight: "1px solid rgba(255,255,255,.06)",
          paddingTop: dim ? "calc(env(safe-area-inset-top, 0px) + 8px)" : "calc(env(safe-area-inset-top, 0px) + 56px)",
          paddingBottom: dim ? "env(safe-area-inset-bottom, 0px)" : "calc(env(safe-area-inset-bottom, 0px) + 88px)",
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
            textShadow: "0 1px 4px rgba(0,0,0,.8)",
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
              <div key={p.identity} style={{ flexShrink: 0 }}>
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: "4 / 3",
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
                <ParticipantControlRow participant={p} isLocal={p.identity === localParticipant?.identity} />
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
          width: 20,
          height: 36,
          padding: 0,
          border: "none",
          borderRadius: "0 12px 12px 0",
          background: "rgba(0,0,0,.28)",
          color: "#fff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: dim && !open ? 0.45 : 0.75,
        }}
      >
        {open ? <ChevronLeft style={{ width: 16, height: 16 }} /> : <ChevronRight style={{ width: 16, height: 16 }} />}
      </button>
    </>
  );
};

export default ParticipantDrawer;
