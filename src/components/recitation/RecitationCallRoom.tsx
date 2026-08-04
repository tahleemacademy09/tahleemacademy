// src/components/recitation/RecitationCallRoom.tsx
// ─────────────────────────────────────────────────────────────────────────
// Lightweight, self-contained LiveKit video-call room shared by both the
// student's "Join Your Virtual Session" button and the admin's
// "Join Live Session" button on the Tasjeel (registration) recitation
// evaluation flow.
//
// Both sides pass the SAME roomName (`recitation-eval-${studentUserId}`) so
// they land in the same LiveKit room. Token generation reuses the existing
// `livekit-token` edge function's "Mode A" path (arbitrary room_name), which
// already grants admins/teachers elevated (roomAdmin + roomRecord) claims.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback } from "react";
import { startBackgroundAudio, stopBackgroundAudio, setWakeLockActive } from "@/hooks/useBackgroundAudio";
import { startForegroundService, stopForegroundService } from "@/hooks/useForegroundService";
import { useEffect as useBgEffect } from "react";
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertTriangle, PhoneOff } from "lucide-react";

const G = "#064E3B";

interface RecitationCallRoomProps {
  roomName: string;
  /** Called when the user leaves/disconnects from the call. */
  onLeave: () => void;
}

interface TokenState {
  token: string;
  url: string;
}

const RecitationCallRoom = ({ roomName, onLeave }: RecitationCallRoomProps) => {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tokenData, setTokenData] = useState<TokenState | null>(null);
  const [error, setError] = useState<string>("");

  const fetchToken = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const { data, error: fnError } = await supabase.functions.invoke("livekit-token", {
        body: { room_name: roomName },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      if (!data?.token || !data?.url) throw new Error("No token returned");
      setTokenData({ token: data.token, url: data.url });
      setState("ready");
    } catch (e: any) {
      setError(e?.message || "Could not connect to the session");
      setState("error");
    }
  }, [roomName]);

  useEffect(() => { fetchToken(); }, [fetchToken]);

  if (state === "loading") {
    
  useBgEffect(() => {
    if (state === "ready") {
      startBackgroundAudio("Recitation Session");
      startForegroundService({
        title: "🔴 Live Recitation Session",
        body:  "Tap to return to your session",
        id:    3001,
        color: "#064E3B",
      });
      setWakeLockActive(true);
      return () => {
        stopBackgroundAudio();
        stopForegroundService();
      };
    }
  }, [state]);

  return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 360, gap: 12, color: "#6b7280" }}>
        <Loader2 size={28} style={{ animation: "spin .8s linear infinite", color: G }} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Connecting to the session…</span>
      </div>
    );
  }

  if (state === "error" || !tokenData) {
    
  useBgEffect(() => {
    if (state === "ready") {
      startBackgroundAudio("Recitation Session");
      startForegroundService({
        title: "🔴 Live Recitation Session",
        body:  "Tap to return to your session",
        id:    3001,
        color: "#064E3B",
      });
      setWakeLockActive(true);
      return () => {
        stopBackgroundAudio();
        stopForegroundService();
      };
    }
  }, [state]);

  return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 360, gap: 14, padding: 24, textAlign: "center" }}>
        <AlertTriangle size={28} color="#b91c1c" />
        <p style={{ fontSize: 13, color: "#b91c1c", fontWeight: 600, maxWidth: 360 }}>{error}</p>
        <button
          onClick={fetchToken}
          style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: G, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
        >
          Try Again
        </button>
        <button onClick={onLeave} style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 12, textDecoration: "underline", cursor: "pointer" }}>
          Go Back
        </button>
      </div>
    );
  }

  
  useBgEffect(() => {
    if (state === "ready") {
      startBackgroundAudio("Recitation Session");
      startForegroundService({
        title: "🔴 Live Recitation Session",
        body:  "Tap to return to your session",
        id:    3001,
        color: "#064E3B",
      });
      setWakeLockActive(true);
      return () => {
        stopBackgroundAudio();
        stopForegroundService();
      };
    }
  }, [state]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 480, borderRadius: 16, overflow: "hidden", background: "#111" }}>
      <LiveKitRoom
        serverUrl={tokenData.url}
        token={tokenData.token}
        connect
        video
        audio
        data-lk-theme="default"
        style={{ height: "100%", minHeight: 480 }}
        onDisconnected={onLeave}
      >
        <VideoConference />
        <RoomAudioRenderer />
      </LiveKitRoom>
      <button
        onClick={onLeave}
        title="Leave session"
        style={{
          position: "absolute", top: 12, right: 12, zIndex: 50,
          width: 40, height: 40, borderRadius: "50%", border: "none",
          background: "#dc2626", color: "#fff", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 2px 10px rgba(0,0,0,.35)",
        }}
      >
        <PhoneOff size={18} />
      </button>
    </div>
  );
};

export default RecitationCallRoom;
