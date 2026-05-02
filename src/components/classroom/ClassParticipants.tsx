/*
  ClassParticipants.tsx — Tahleem Academy
  Live participant list with teacher mute/cam controls.
*/
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Hand, Mic, MicOff, Video, VideoOff, UserMinus } from "lucide-react";
import { toast } from "@/hooks/use-toast";

let useParticipantsHook: (() => any[]) | null = null;
let useRoomContextHook: (() => any) | null = null;
try {
  const lk = require("@livekit/components-react");
  useParticipantsHook  = lk.useParticipants;
  useRoomContextHook   = lk.useRoomContext;
} catch {
  useParticipantsHook  = () => [];
  useRoomContextHook   = () => null;
}

interface ClassParticipantsProps {
  sessionId: string;
  onMuteStudent?:   (studentId: string) => void;
  onRemoveStudent?: (studentId: string) => void;
}

const ClassParticipants = ({ sessionId, onMuteStudent, onRemoveStudent }: ClassParticipantsProps) => {
  const { t } = useLanguage();
  const { hasRole } = useAuth();
  const isPrivileged = hasRole("admin") || hasRole("teacher");

  const livekitParticipants: any[] = useParticipantsHook ? useParticipantsHook() : [];
  const room = useRoomContextHook ? useRoomContextHook() : null;
  const liveCount = livekitParticipants.length;

  const [dbParticipants, setDbParticipants] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!sessionId) return;
      const { data } = await supabase
        .from("class_participants")
        .select("*, profiles:student_id(full_name, avatar_url, level)")
        .eq("session_id", sessionId).is("left_at", null).order("joined_at");
      setDbParticipants(data || []);
    };
    load();
    const channel = supabase.channel(`participants-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "class_participants", filter: `session_id=eq.${sessionId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  const displayCount = liveCount > 0 ? liveCount : dbParticipants.length;
  const handRaised   = dbParticipants.filter(p => p.hand_raised);

  // Broadcast mute/cam-off command to a specific participant identity
  const broadcastToParticipant = (identity: string, type: string) => {
    if (!room?.localParticipant) return;
    try {
      room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ type, target: identity })),
        { reliable: true }
      );
    } catch {}
  };

  const muteParticipant = async (p: any) => {
    const name = (p as any).profiles?.full_name || "Student";
    // Find LiveKit identity matching this participant
    const lkP = livekitParticipants.find((lp: any) =>
      lp.identity === p.student_id ||
      (lp.name || "").toLowerCase().includes((name || "").toLowerCase().split(" ")[0])
    );
    if (lkP) broadcastToParticipant(lkP.identity, "force_mute");
    // Also update DB
    await supabase.from("class_participants").update({ is_muted: true }).eq("id", p.id);
    onMuteStudent?.(p.student_id);
    toast({ title: `\uD83D\uDD07 ${name} muted` });
  };

  const disableCam = async (p: any) => {
    const name = (p as any).profiles?.full_name || "Student";
    const lkP = livekitParticipants.find((lp: any) =>
      lp.identity === p.student_id ||
      (lp.name || "").toLowerCase().includes((name || "").toLowerCase().split(" ")[0])
    );
    if (lkP) broadcastToParticipant(lkP.identity, "force_cam_off");
    await supabase.from("class_participants").update({ camera_on: false }).eq("id", p.id);
    toast({ title: `\uD83D\uDCF9 ${name}'s camera turned off` });
  };

  const removeParticipant = async (p: any) => {
    await supabase.from("class_participants")
      .update({ left_at: new Date().toISOString() })
      .eq("session_id", sessionId).eq("student_id", p.student_id);
    onRemoveStudent?.(p.student_id);
  };

  const G = "#22c55e";
  const R = "#ef4444";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "'Cairo', sans-serif" }}>
      {/* Header */}
      <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,.07)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
            {t("Participants", "\u0627\u0644\u0645\u0634\u0627\u0631\u0643\u0648\u0646")}
          </span>
          <span style={{ background: "rgba(34,197,94,.18)", color: G, borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>
            {displayCount}
          </span>
          {liveCount > 0 && (
            <span style={{ fontSize: 10, color: G, fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: G, display: "inline-block" }} />
              live
            </span>
          )}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {/* LiveKit-only participants not in DB */}
        {liveCount > dbParticipants.length && livekitParticipants.map((lp: any) => {
          const identity = lp.identity || lp.name || "—";
          const inDb = dbParticipants.some(d =>
            (d.profiles?.full_name || "").toLowerCase() === identity.toLowerCase() ||
            d.student_id === identity
          );
          if (inDb) return null;
          return (
            <div key={identity} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(34,197,94,.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: G, flexShrink: 0 }}>
                {identity[0]?.toUpperCase() || "?"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#e8eaf0", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{identity}</p>
                <p style={{ fontSize: 10, color: G, margin: 0 }}>live</p>
              </div>
              <Mic style={{ width: 12, height: 12, color: G }} />
            </div>
          );
        })}

        {/* DB participants */}
        {dbParticipants.map(p => {
          const profile  = (p as any).profiles;
          const name     = profile?.full_name || "Student";
          const initial  = name[0]?.toUpperCase() || "S";
          const isMuted  = p.is_muted;
          const hasCam   = p.camera_on;

          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,.04)", transition: "background .12s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.04)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(10,124,104,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#4ade80", flexShrink: 0 }}>
                {initial}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#e8eaf0", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{name}</p>
                {profile?.level && (
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,.35)", margin: 0, textTransform: "capitalize" as const }}>{profile.level}</p>
                )}
              </div>
              {/* Status icons */}
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {p.hand_raised && (
                  <span style={{ animation: "hand-bounce 1.2s ease-in-out infinite", fontSize: 13 }}>✋</span>
                )}
                {/* Mic icon — clickable by teacher */}
                <button
                  onClick={isPrivileged ? () => muteParticipant(p) : undefined}
                  title={isPrivileged ? (isMuted ? "Already muted" : "Mute mic") : undefined}
                  style={{ background: "none", border: "none", cursor: isPrivileged ? "pointer" : "default", padding: 3, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", transition: "background .12s" }}
                  onMouseEnter={e => { if (isPrivileged) e.currentTarget.style.background = "rgba(239,68,68,.15)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  {isMuted
                    ? <MicOff style={{ width: 13, height: 13, color: "rgba(239,68,68,.7)" }} />
                    : <Mic    style={{ width: 13, height: 13, color: G }} />
                  }
                </button>
                {/* Cam icon — clickable by teacher */}
                <button
                  onClick={isPrivileged && hasCam ? () => disableCam(p) : undefined}
                  title={isPrivileged ? (hasCam ? "Turn off camera" : "Camera already off") : undefined}
                  style={{ background: "none", border: "none", cursor: isPrivileged && hasCam ? "pointer" : "default", padding: 3, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", transition: "background .12s" }}
                  onMouseEnter={e => { if (isPrivileged && hasCam) e.currentTarget.style.background = "rgba(239,68,68,.15)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  {hasCam
                    ? <Video    style={{ width: 13, height: 13, color: G }} />
                    : <VideoOff style={{ width: 13, height: 13, color: "rgba(255,255,255,.25)" }} />
                  }
                </button>
                {/* Remove (teacher only) */}
                {isPrivileged && (
                  <button
                    onClick={() => removeParticipant(p)}
                    title="Remove participant"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 3, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,.15)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <UserMinus style={{ width: 12, height: 12, color: "rgba(239,68,68,.6)" }} />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {displayCount === 0 && (
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.3)", textAlign: "center", padding: "24px 16px" }}>
            {t("No participants yet", "\u0644\u0627 \u064A\u0648\u062C\u062F \u0645\u0634\u0627\u0631\u0643\u0648\u0646 \u0628\u0639\u062F")}
          </p>
        )}
      </div>

      {/* Hand raised strip */}
      {handRaised.length > 0 && isPrivileged && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,.07)", padding: "10px 14px", flexShrink: 0 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
            <Hand style={{ width: 12, height: 12 }} /> {handRaised.length} hand{handRaised.length !== 1 ? "s" : ""} raised
          </p>
          {handRaised.map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,.65)" }}>{(p as any).profiles?.full_name}</span>
              <button
                onClick={async () => {
                  await supabase.from("class_participants").update({ hand_raised: false, hand_raised_at: null }).eq("id", p.id);
                }}
                style={{ padding: "3px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,.12)", background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.6)", fontSize: 11, cursor: "pointer" }}
              >
                Lower
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClassParticipants;
