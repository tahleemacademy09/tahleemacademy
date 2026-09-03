/*
  src/components/majlis/MajlisCallRoom.tsx — Tahleem Academy
  ──────────────────────────────────────────────────────────────────
  A real multi-party discussion room for an Al-Majlis channel — every
  participant can publish audio/video, unlike the one-to-many Agora
  "Go Live" broadcast (see admin/live.tsx). Deliberately kept small
  and self-contained (no whiteboard/materials/homework/recording —
  those belong to the subject classroom, not a discussion room).

  Talks to the `majlis-livekit-token` edge function, which scopes the
  LiveKit room to the channel (not a subject) and tracks call presence
  in `majlis_calls`.
*/

import { useEffect, useRef, useState } from "react";
import {
  LiveKitRoom, useRoomContext, RoomAudioRenderer, StartAudio,
  useParticipants, useLocalParticipant, useTracks,
} from "@livekit/components-react";
// @ts-ignore
import "@livekit/components-styles";
import { Track } from "livekit-client";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Loader2, Users, X } from "lucide-react";

const G = "#0f2d1f";
const GOLD = "#c9a84c";

interface MajlisCallRoomProps {
  channelId: string;
  channelName: string;
  isPrivileged: boolean; // admin/teacher — can end the call for everyone
  onLeave: () => void;
}

export default function MajlisCallRoom({ channelId, channelName, isPrivileged, onLeave }: MajlisCallRoomProps) {
  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: fnErr } = await supabase.functions.invoke("majlis-livekit-token", {
        body: { channel_id: channelId, action: "join" },
      });
      if (cancelled) return;
      if (fnErr || data?.error) {
        setError(data?.error || fnErr?.message || "Could not join the Majlis call");
        return;
      }
      setToken(data.token);
      setUrl(data.url);
    })();
    return () => { cancelled = true; };
  }, [channelId]);

  const endForEveryone = async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    try {
      await supabase.functions.invoke("majlis-livekit-token", { body: { channel_id: channelId, action: "end" } });
    } catch { /* best effort */ }
    onLeave();
  };

  if (error) {
    return (
      <div style={overlayStyle}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 320, textAlign: "center" }}>
          <div style={{ fontSize: 15, color: "#c0392b", marginBottom: 16 }}>{error}</div>
          <button onClick={onLeave} style={{ background: G, color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", cursor: "pointer" }}>Close</button>
        </div>
      </div>
    );
  }

  if (!token || !url) {
    return (
      <div style={overlayStyle}>
        <Loader2 style={{ width: 32, height: 32, color: "#fff", animation: "spin 1s linear infinite" }} />
        <div style={{ color: "#fff", marginTop: 12, fontSize: 14 }}>Joining the Majlis…</div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <LiveKitRoom
        token={token}
        serverUrl={url}
        connect
        video
        audio
        style={{ width: "100%", height: "100%" }}
        onDisconnected={onLeave}
      >
        <RoomAudioRenderer />
        <StartAudio label="Tap to enable audio" />
        <MajlisCallInner channelName={channelName} isPrivileged={isPrivileged} onLeave={onLeave} onEndForEveryone={endForEveryone} />
      </LiveKitRoom>
    </div>
  );
}

function MajlisCallInner({
  channelName, isPrivileged, onLeave, onEndForEveryone,
}: { channelName: string; isPrivileged: boolean; onLeave: () => void; onEndForEveryone: () => void }) {
  const room = useRoomContext();
  const participants = useParticipants();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: false });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "rgba(0,0,0,.4)", color: "#fff" }}>
        <Users size={18} color={GOLD} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{channelName} — Majlis</div>
          <div style={{ fontSize: 12, opacity: .75 }}>{participants.length} in the call</div>
        </div>
        <button onClick={onLeave} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 6 }}><X size={20} /></button>
      </div>

      {/* Video grid */}
      <div style={{
        flex: 1, display: "grid", gap: 8, padding: 10, overflow: "auto",
        gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, Math.ceil(Math.sqrt(participants.length || 1))))}, 1fr)`,
      }}>
        {participants.map((p) => {
          const camTrack = tracks.find((t) => t.participant.identity === p.identity);
          return (
            <div key={p.identity} style={{
              position: "relative", background: "#1a1a1a", borderRadius: 12, overflow: "hidden",
              aspectRatio: "4/3", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {camTrack && !camTrack.publication?.isMuted ? (
                <VideoTile trackRef={camTrack} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: G, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700 }}>
                  {(p.name || p.identity || "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div style={{ position: "absolute", bottom: 6, left: 8, color: "#fff", fontSize: 12, background: "rgba(0,0,0,.5)", padding: "2px 8px", borderRadius: 8 }}>
                {p.name || "Member"}{p.identity === localParticipant.identity ? " (You)" : ""}
              </div>
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", justifyContent: "center", gap: 14, padding: "14px 0 22px", background: "rgba(0,0,0,.4)" }}>
        <ControlBtn active={isMicrophoneEnabled} onClick={() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)} onIcon={<Mic size={22} />} offIcon={<MicOff size={22} />} />
        <ControlBtn active={isCameraEnabled} onClick={() => localParticipant.setCameraEnabled(!isCameraEnabled)} onIcon={<Video size={22} />} offIcon={<VideoOff size={22} />} />
        <button onClick={() => room.disconnect()} style={{ width: 52, height: 52, borderRadius: "50%", background: "#c0392b", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <PhoneOff size={22} />
        </button>
        {isPrivileged && (
          <button onClick={() => { toast({ title: "Majlis call ended for everyone" }); onEndForEveryone(); }} style={{ padding: "0 16px", height: 52, borderRadius: 26, background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            End for Everyone
          </button>
        )}
      </div>
    </div>
  );
}

function VideoTile({ trackRef }: { trackRef: any }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!ref.current || !trackRef?.publication?.track) return;
    trackRef.publication.track.attach(ref.current);
    return () => { trackRef.publication?.track?.detach(); };
  }, [trackRef]);
  return <video ref={ref} autoPlay playsInline muted={false} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
}

function ControlBtn({ active, onClick, onIcon, offIcon }: { active: boolean; onClick: () => void; onIcon: React.ReactNode; offIcon: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      width: 52, height: 52, borderRadius: "50%", border: "none", cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: active ? "rgba(255,255,255,.15)" : "#c0392b", color: "#fff",
    }}>
      {active ? onIcon : offIcon}
    </button>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 9999, background: "#000",
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
};
