/*
  src/pages/student/GeneralMusabaqahWaitingRoom.tsx
  ─────────────────────────────────────────────────────────────
  Section 17 of the spec. A student who has been admitted lands
  here — never directly in the live exam room. Shows their queue
  position and who is currently being examined, updated live via
  Supabase Realtime on general_musabaqah_participants.

  When the admin/judge calls this student (Chunk 4 wires up the
  actual "Call Next" control), their own participant row flips to
  status 'called' and this page shows the call banner + Join button.
  The live exam room itself (video/judging) is Chunk 4/5.
*/
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Users, Loader2, PhoneCall, Wifi, WifiOff, Hourglass, LogIn, Eye } from "lucide-react";

const G    = "#0f2d1f";
const GM   = "#163d28";
const BLUE = "#60A5FA";
const GOLD = "#c9a84c";

const ACTIVE_STATUSES = ["waiting", "called", "ready", "in_progress", "paused", "disconnected", "resuming"];

export default function GeneralMusabaqahWaitingRoom() {
  const { id: eventId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [event, setEvent]         = useState<any>(null);
  const [myParticipant, setMyP]   = useState<any>(null);
  const [queue, setQueue]         = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [joining, setJoining]     = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ticking clock for the pre-competition countdown.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadAll = async () => {
    if (!eventId || !user) return;

    const { data: ev } = await supabase.from("general_musabaqah_events").select("*").eq("id", eventId).single();
    setEvent(ev);

    const { data: mine } = await supabase
      .from("general_musabaqah_participants")
      .select("*")
      .eq("event_id", eventId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!mine) {
      toast({ title: "You have not been admitted to this Musabaqah", variant: "destructive" });
      navigate("/student/musabaqah/general");
      return;
    }

    // No more auto-flip on mount — a student only enters the active queue
    // once they explicitly press "Join Competition" below, and that button
    // itself only appears once the competition's start time has arrived.
    setMyP(mine);

    const { data: allActive } = await supabase
      .from("general_musabaqah_participants")
      .select("id,participant_name,status,created_at")
      .eq("event_id", eventId)
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: true });
    setQueue(allActive || []);

    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [eventId, user]);

  // Competition start = start_time if set, else midnight of competition_date.
  const competitionStartMs = event ? (
    event.start_time ? new Date(event.start_time).getTime()
    : event.competition_date ? new Date(`${event.competition_date}T00:00:00`).getTime()
    : null
  ) : null;
  const hasStarted = competitionStartMs === null ? true : now >= competitionStartMs; // no date set → don't block

  const formatCountdown = (ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const joinCompetition = async () => {
    if (!myParticipant) return;
    setJoining(true);
    const { error } = await supabase.from("general_musabaqah_participants")
      .update({ status: "waiting", joined_at: new Date().toISOString() })
      .eq("id", myParticipant.id);
    setJoining(false);
    if (error) { toast({ title: "Could not join", description: error.message, variant: "destructive" }); return; }
    await supabase.from("general_musabaqah_event_log").insert({
      event_id: eventId, participant_id: myParticipant.id, action_type: "joined_competition",
      description: `${myParticipant.participant_name} joined the competition`,
    });
    toast({ title: "You're in! Waiting to be called…" });
    loadAll();
  };

  // Realtime: react to any participant change in this event (queue reshuffles, being called).
  useEffect(() => {
    if (!eventId) return;
    const channel = supabase
      .channel(`gm-waiting-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "general_musabaqah_participants", filter: `event_id=eq.${eventId}` },
        () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [eventId]);

  // Lightweight connection heartbeat so admin can see "excellent/disconnected" in real time (Section 37).
  useEffect(() => {
    if (!myParticipant?.id) return;
    heartbeatRef.current = setInterval(() => {
      supabase.from("general_musabaqah_participants")
        .update({ connection_status: navigator.onLine ? "good" : "disconnected" })
        .eq("id", myParticipant.id);
    }, 15000);
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
  }, [myParticipant?.id]);

  if (loading || !event || !myParticipant) {
    return (
      <div style={{ minHeight: "100%", background: G, display: "flex", justifyContent: "center", alignItems: "center" }}>
        <Loader2 className="animate-spin" color={GOLD} size={28} />
      </div>
    );
  }

  const currentIdx = queue.findIndex(p => ["called", "ready", "in_progress"].includes(p.status));
  const current    = currentIdx >= 0 ? queue[currentIdx] : null;
  const myIdx      = queue.findIndex(p => p.id === myParticipant.id);
  const aheadCount = current ? Math.max(0, myIdx - (currentIdx + 1)) : myIdx;
  const isMeCalled = ["called", "ready", "in_progress"].includes(myParticipant.status);

  return (
    <div style={{ minHeight: "100%", background: `linear-gradient(160deg, ${G} 0%, #0a1f12 60%, #050f09 100%)`, padding: "20px 16px 56px", fontFamily: "'Cairo', sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <button onClick={() => navigate("/student/musabaqah/general")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 6, marginBottom: 16, cursor: "pointer", fontSize: 13 }}>
          <ArrowLeft size={14} /> Back
        </button>

        <h1 style={{ color: "#fff", fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>{event.title}</h1>
        <p style={{ color: BLUE, fontSize: 13, fontWeight: 600, margin: "0 0 20px" }}>{event.subject}{event.topic ? ` — ${event.topic}` : ""}</p>

        {myParticipant.status === "admitted" ? (
          !hasStarted ? (
            <Card style={{ background: GM, border: "1px solid rgba(201,168,76,0.3)" }}>
              <CardContent className="pt-8 pb-8 text-center">
                <Hourglass size={30} color={GOLD} style={{ margin: "0 auto 12px" }} />
                <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginBottom: 4 }}>Competition starts in</p>
                <p style={{ color: GOLD, fontSize: 32, fontWeight: 900, margin: "0 0 14px", fontFamily: "monospace" }}>
                  {formatCountdown((competitionStartMs as number) - now)}
                </p>
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
                  You'll be able to join the moment the competition begins. This page updates automatically.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card style={{ background: "linear-gradient(135deg, rgba(96,165,250,0.15), rgba(96,165,250,0.05))", border: "1.5px solid rgba(96,165,250,0.5)" }}>
              <CardContent className="pt-8 pb-8 text-center">
                <LogIn size={30} color={BLUE} style={{ margin: "0 auto 12px" }} />
                <h2 style={{ color: "#fff", fontSize: 17, fontWeight: 800, margin: "0 0 6px" }}>The competition has started</h2>
                <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginBottom: 18 }}>
                  Join now to take your place in the live queue.
                </p>
                <Button onClick={joinCompetition} disabled={joining} style={{ background: BLUE, color: "#06131f", fontWeight: 800, fontSize: 15, padding: "10px 28px" }}>
                  {joining ? <Loader2 size={16} className="animate-spin mr-1" /> : null} Join Competition
                </Button>
              </CardContent>
            </Card>
          )
        ) : isMeCalled ? (
          <Card style={{ background: "linear-gradient(135deg, rgba(74,222,128,0.15), rgba(74,222,128,0.05))", border: "1.5px solid #4ADE80" }}>
            <CardContent className="pt-8 pb-8 text-center">
              <PhoneCall size={32} color="#4ADE80" style={{ margin: "0 auto 12px" }} />
              <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 800, margin: "0 0 6px" }}>You have been called!</h2>
              <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginBottom: 18 }}>
                Get ready — check your camera, microphone and connection.
              </p>
              <Button
                onClick={() => navigate(`/musabaqah/general/${eventId}/exam`)}
                style={{ background: "#4ADE80", color: "#06301a", fontWeight: 800, fontSize: 15, padding: "10px 28px" }}
              >
                Join Examination
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card style={{ background: GM, border: "1px solid rgba(96,165,250,0.25)" }}>
            <CardContent className="pt-8 pb-8 text-center">
              <Users size={30} color={BLUE} style={{ margin: "0 auto 10px" }} />
              <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginBottom: 4 }}>Status</p>
              <h2 style={{ color: "#fff", fontSize: 17, fontWeight: 800, margin: "0 0 20px" }}>Waiting for your turn</h2>

              <div style={{ display: "flex", justifyContent: "center", gap: 28, marginBottom: 20 }}>
                <div>
                  <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, margin: "0 0 4px" }}>Current Participant</p>
                  <p style={{ color: current ? "#fff" : "rgba(255,255,255,0.4)", fontSize: 15, fontWeight: 700, margin: 0 }}>
                    {current ? current.participant_name : "Not started yet"}
                  </p>
                </div>
                <div>
                  <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, margin: "0 0 4px" }}>Your Position</p>
                  <p style={{ color: GOLD, fontSize: 22, fontWeight: 900, margin: 0 }}>{myIdx >= 0 ? myIdx + 1 : "—"}</p>
                </div>
              </div>

              <Badge style={{ background: "rgba(96,165,250,0.15)", color: BLUE, border: "none" }}>
                {aheadCount > 0 ? `${aheadCount} student${aheadCount === 1 ? "" : "s"} ahead of you` : "You're next"}
              </Badge>

              {current && (
                <div style={{ marginTop: 18 }}>
                  <Button variant="outline" onClick={() => navigate(`/musabaqah/general/${eventId}/exam`)} style={{ color: "#fff", borderColor: "rgba(255,255,255,0.25)" }}>
                    <Eye size={14} className="mr-1" /> Watch Live
                  </Button>
                </div>
              )}

              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 20 }}>
                Please remain available. This page updates automatically — no need to refresh.
              </p>
            </CardContent>
          </Card>
        )}

        {queue.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Queue</p>
            <div style={{ display: "grid", gap: 6 }}>
              {queue.map((p, i) => (
                <div key={p.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 12px", borderRadius: 8,
                  background: p.id === myParticipant.id ? "rgba(201,168,76,0.12)" : "rgba(255,255,255,0.03)",
                  border: p.id === myParticipant.id ? "1px solid rgba(201,168,76,0.35)" : "1px solid transparent",
                }}>
                  <span style={{ color: "#fff", fontSize: 13 }}>
                    {i + 1}. {p.participant_name} {p.id === myParticipant.id && <span style={{ color: GOLD }}>(you)</span>}
                  </span>
                  <StatusChip status={p.status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { c: string; label: string }> = {
    waiting:      { c: "#94A3B8", label: "Waiting" },
    called:       { c: "#4ADE80", label: "Called" },
    ready:        { c: "#4ADE80", label: "Ready" },
    in_progress:  { c: "#60A5FA", label: "Examining" },
    paused:       { c: "#F87171", label: "Paused" },
    disconnected: { c: "#F87171", label: "Disconnected" },
    resuming:     { c: "#FBBF24", label: "Resuming" },
  };
  const s = map[status] || { c: "#94A3B8", label: status };
  return <span style={{ fontSize: 11, color: s.c, fontWeight: 700 }}>{s.label}</span>;
}
