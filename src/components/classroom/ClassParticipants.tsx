/*
  ClassParticipants.tsx — Tahleem Academy
  Upgraded: per-student mute/unmute, spotlight, hand queue call-on, speaking indicators
*/
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Hand, Mic, MicOff, Video, VideoOff, UserMinus, Pin, PinOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";
// BUG FIX ("participant count always shows 0 even with more users online"):
// this used to load useParticipants/useRoomContext via a runtime require()
// wrapped in try/catch. require() doesn't exist in the browser — Vite ships
// an ES module bundle, not CommonJS — so that call threw a ReferenceError on
// every single render, every time, and the catch branch silently replaced
// both hooks with `() => []` / `() => null`. livekitParticipants was
// therefore ALWAYS an empty array and liveCount ALWAYS 0, no matter how many
// people were actually in the room — the whole live-count path was dead code
// from day one. Plain static imports (used everywhere else this hook is
// consumed in the app) work correctly since this component is only ever
// rendered inside a <LiveKitRoom> provider.
import { useParticipants, useRoomContext } from "@livekit/components-react";

interface ClassParticipantsProps {
  sessionId:       string;
  onMuteStudent?:  (studentId: string) => void;
  onRemoveStudent?:(studentId: string) => void;
  isPrivileged?:   boolean;
  room?:           any;
  onSpotlight?:    (identity: string) => void;
  spotlightId?:    string | null;
}

const ClassParticipants = ({ sessionId, onMuteStudent, onRemoveStudent, isPrivileged: isPrivilegedProp, room: roomProp, onSpotlight, spotlightId }: ClassParticipantsProps) => {
  const { t } = useLanguage();
  const { hasRole } = useAuth();
  const isPrivileged = isPrivilegedProp ?? (hasRole("admin") || hasRole("teacher"));

  const livekitParticipants: any[] = useParticipants();
  const roomCtx = useRoomContext();
  const room = roomProp || roomCtx;
  const liveCount = livekitParticipants.length;

  const [dbParticipants, setDbParticipants] = useState<any[]>([]);
  const [mutingId,       setMutingId]       = useState<string | null>(null);

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
  const handRaised   = dbParticipants.filter(p => p.hand_raised).sort((a, b) =>
    new Date(a.hand_raised_at||0).getTime() - new Date(b.hand_raised_at||0).getTime()
  );

  const broadcastToParticipant = (identity: string, type: string) => {
    const r = room;
    if (!r?.localParticipant) return;
    try {
      r.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ type, target: identity })),
        { reliable: true }
      );
    } catch {}
  };

  // Find LiveKit identity for a DB participant
  const findLkIdentity = (p: any): string | null => {
    const name = p.profiles?.full_name || "";
    const lkP = livekitParticipants.find((lp: any) =>
      lp.identity === p.student_id ||
      (lp.name || "").toLowerCase() === name.toLowerCase() ||
      (lp.name || "").toLowerCase().includes(name.toLowerCase().split(" ")[0])
    );
    return lkP?.identity || null;
  };

  const isMutedLk = (p: any): boolean => {
    const identity = findLkIdentity(p);
    if (!identity) return p.is_muted;
    const lkP = livekitParticipants.find(lp => lp.identity === identity);
    return !lkP?.isMicrophoneEnabled;
  };

  const muteParticipant = async (p: any) => {
    const name = p.profiles?.full_name || "Student";
    setMutingId(p.id);
    const identity = findLkIdentity(p);
    if (identity) broadcastToParticipant(identity, "force_mute");
    await supabase.from("class_participants").update({ is_muted: true }).eq("id", p.id);
    onMuteStudent?.(p.student_id);
    toast({ title: `🔇 ${name} muted` });
    setTimeout(() => setMutingId(null), 800);
  };

  const unmuteParticipant = async (p: any) => {
    const name = p.profiles?.full_name || "Student";
    const identity = findLkIdentity(p);
    if (identity) broadcastToParticipant(identity, "force_unmute");
    await supabase.from("class_participants").update({ is_muted: false }).eq("id", p.id);
    toast({ title: `🎤 ${name} unmuted` });
  };

  const disableCam = async (p: any) => {
    const name = p.profiles?.full_name || "Student";
    const identity = findLkIdentity(p);
    if (identity) broadcastToParticipant(identity, "force_cam_off");
    await supabase.from("class_participants").update({ camera_on: false }).eq("id", p.id);
    toast({ title: `📷 ${name}'s camera turned off` });
  };

  const removeParticipant = async (p: any) => {
    await supabase.from("class_participants")
      .update({ left_at: new Date().toISOString() })
      .eq("session_id", sessionId).eq("student_id", p.student_id);
    onRemoveStudent?.(p.student_id);
  };

  const callOnHand = (p: any) => {
    const identity = findLkIdentity(p);
    if (identity && onSpotlight) {
      onSpotlight(identity);
      toast({ title: `📌 Spotlighting ${p.profiles?.full_name || "student"}`, duration: 2000 });
    }
    // Lower their hand
    supabase.from("class_participants").update({ hand_raised: false, hand_raised_at: null }).eq("id", p.id);
  };

  const G = "#22c55e";

  const ParticipantRow = ({ p, lkP }: { p: any; lkP?: any }) => {
    const name    = p.profiles?.full_name || lkP?.name || "Student";
    const initial = name[0]?.toUpperCase() || "S";
    const mutedLk = isMutedLk(p);
    const hasCam  = p.camera_on;
    const speaking = lkP?.isSpeaking;
    const isSpot  = spotlightId && (findLkIdentity(p) === spotlightId);

    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,.04)", transition: "background .12s", background: isSpot ? "rgba(26,115,232,.1)" : "transparent" }}
        onMouseEnter={e => (e.currentTarget.style.background = isSpot ? "rgba(26,115,232,.12)" : "rgba(255,255,255,.04)")}
        onMouseLeave={e => (e.currentTarget.style.background = isSpot ? "rgba(26,115,232,.1)" : "transparent")}
      >
        <div style={{ position: "relative", width: 32, height: 32, flexShrink: 0 }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: speaking ? "rgba(26,115,232,.3)" : "rgba(10,124,104,.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700, color: speaking ? "#8ab4f8" : "#4ade80",
            boxShadow: speaking ? "0 0 0 2px #1a73e8" : "none",
            transition: "all .3s",
          }}>
            {initial}
          </div>
          {speaking && (
            <div style={{ position: "absolute", bottom: -2, right: -2, width: 10, height: 10, borderRadius: "50%", background: "#1a73e8", border: "1.5px solid #202124" }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: isSpot ? "#8ab4f8" : "#e8eaf0", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
            {name} {isSpot ? "📌" : ""}
          </p>
          {p.profiles?.level && (
            <p style={{ fontSize: 10, color: "rgba(255,255,255,.35)", margin: 0, textTransform: "capitalize" as const }}>{p.profiles.level}</p>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          {p.hand_raised && (
            <span style={{ animation: "hand-bounce 1.2s ease-in-out infinite", fontSize: 13 }}>✋</span>
          )}
          {/* Spotlight toggle */}
          {isPrivileged && onSpotlight && (
            <button onClick={() => onSpotlight(findLkIdentity(p) || p.student_id)}
              title={isSpot ? "Remove spotlight" : "Spotlight this participant"}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 3, borderRadius: 6, color: isSpot ? "#8ab4f8" : "rgba(255,255,255,.25)" }}>
              {isSpot ? <PinOff style={{ width: 12, height: 12 }} /> : <Pin style={{ width: 12, height: 12 }} />}
            </button>
          )}
          {/* Mic toggle — mute AND unmute */}
          <button
            onClick={isPrivileged ? (mutedLk ? () => unmuteParticipant(p) : () => muteParticipant(p)) : undefined}
            title={isPrivileged ? (mutedLk ? "Unmute" : "Mute mic") : undefined}
            disabled={mutingId === p.id}
            style={{ background: "none", border: "none", cursor: isPrivileged ? "pointer" : "default", padding: 3, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", opacity: mutingId === p.id ? 0.5 : 1 }}>
            {mutedLk
              ? <MicOff style={{ width: 13, height: 13, color: "rgba(239,68,68,.7)" }} />
              : <Mic    style={{ width: 13, height: 13, color: G }} />
            }
          </button>
          {/* Cam toggle */}
          <button
            onClick={isPrivileged && hasCam ? () => disableCam(p) : undefined}
            title={isPrivileged ? (hasCam ? "Turn off camera" : "Camera off") : undefined}
            style={{ background: "none", border: "none", cursor: isPrivileged && hasCam ? "pointer" : "default", padding: 3, borderRadius: 6, display: "flex", alignItems: "center" }}>
            {hasCam
              ? <Video    style={{ width: 13, height: 13, color: G }} />
              : <VideoOff style={{ width: 13, height: 13, color: "rgba(255,255,255,.25)" }} />
            }
          </button>
          {/* Remove */}
          {isPrivileged && (
            <button onClick={() => removeParticipant(p)} title="Remove participant"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 3, borderRadius: 6, display: "flex", alignItems: "center" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,.15)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <UserMinus style={{ width: 12, height: 12, color: "rgba(239,68,68,.6)" }} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "system-ui,sans-serif" }}>
      {/* Header */}
      <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,.07)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{t("Participants", "المشاركون")}</span>
          <span style={{ background: "rgba(34,197,94,.18)", color: G, borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{displayCount}</span>
          {liveCount > 0 && (
            <span style={{ fontSize: 10, color: G, fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: G, display: "inline-block", animation: "rec-pulse 2s ease-in-out infinite" }} /> live
            </span>
          )}
        </div>
      </div>

      {/* Hand queue strip — ordered by time raised */}
      {handRaised.length > 0 && isPrivileged && (
        <div style={{ borderBottom: "1px solid rgba(255,255,255,.07)", padding: "8px 14px", flexShrink: 0, background: "rgba(251,191,36,.04)" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
            ✋ {handRaised.length} raised (in order)
          </p>
          {handRaised.map((p, i) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "#fbbf24", fontWeight: 700, width: 16 }}>{i + 1}.</span>
              <span style={{ flex: 1, fontSize: 12, color: "rgba(255,255,255,.75)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.profiles?.full_name}</span>
              <button onClick={() => callOnHand(p)}
                style={{ padding: "2px 8px", borderRadius: 6, border: "1px solid rgba(26,115,232,.3)", background: "rgba(26,115,232,.15)", color: "#8ab4f8", fontSize: 10, cursor: "pointer", fontWeight: 700 }}>
                Call On
              </button>
              <button onClick={async () => await supabase.from("class_participants").update({ hand_raised: false, hand_raised_at: null }).eq("id", p.id)}
                style={{ padding: "2px 6px", borderRadius: 6, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.06)", color: "rgba(255,255,255,.4)", fontSize: 10, cursor: "pointer" }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Participants list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {/* DB participants */}
        {dbParticipants.map(p => {
          const identity = findLkIdentity(p);
          const lkP = livekitParticipants.find(lp => lp.identity === identity);
          return <ParticipantRow key={p.id} p={p} lkP={lkP} />;
        })}

        {/* LiveKit-only (guests not in DB) */}
        {livekitParticipants.filter(lp => {
          return !dbParticipants.some(d =>
            d.student_id === lp.identity ||
            (d.profiles?.full_name || "").toLowerCase() === (lp.name || "").toLowerCase()
          );
        }).map((lp: any) => (
          <div key={lp.identity} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(34,197,94,.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: G }}>
              {(lp.name || lp.identity || "?")[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#e8eaf0", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{lp.name || lp.identity}</p>
              <p style={{ fontSize: 10, color: G, margin: 0 }}>guest · live</p>
            </div>
            {lp.isMicrophoneEnabled ? <Mic style={{ width: 12, height: 12, color: G }} /> : <MicOff style={{ width: 12, height: 12, color: "rgba(239,68,68,.5)" }} />}
            {lp.isCameraEnabled ? <Video style={{ width: 12, height: 12, color: G }} /> : <VideoOff style={{ width: 12, height: 12, color: "rgba(255,255,255,.2)" }} />}
          </div>
        ))}

        {displayCount === 0 && (
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.3)", textAlign: "center", padding: "24px 16px" }}>
            {t("No participants yet", "لا يوجد مشاركون بعد")}
          </p>
        )}
      </div>
    </div>
  );
};

export default ClassParticipants;
