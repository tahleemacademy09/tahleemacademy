/*
  src/pages/student/GeneralMusabaqahEventLeaderboard.tsx
  ─────────────────────────────────────────────────────────────
  Full standalone leaderboard for ONE General Subject Musabaqah
  event — every finalized participant ranked, not just the top
  10 preview embedded in GeneralMusabaqahResult.tsx.

  Visibility rules mirror GeneralMusabaqahResult.tsx:
    - Admin/teacher (judges) can always see it.
    - Students only see it once the event is results_visibility
      === "published" AND leaderboard_enabled is true.

  Route: /student/musabaqah/general/:id/leaderboard
*/
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Loader2, Trophy, Medal, Lock, Calendar, Users } from "lucide-react";

const G    = "#0f2d1f";
const GM   = "#163d28";
const GOLD = "#c9a84c";

const MEDAL_COLORS: Record<number, string> = { 1: "#FFD700", 2: "#C0C0C0", 3: "#CD7F32" };

export default function GeneralMusabaqahEventLeaderboard() {
  const { id: eventId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const isJudge = hasRole("admin") || hasRole("teacher");

  const [event, setEvent]         = useState<any>(null);
  const [rows, setRows]           = useState<any[]>([]);
  const [myParticipantId, setMyParticipantId] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    (async () => {
      if (!eventId) return;
      const { data: ev } = await supabase.from("general_musabaqah_events").select("*").eq("id", eventId).single();
      setEvent(ev);

      if (!isJudge && user) {
        const { data: mine } = await supabase
          .from("general_musabaqah_participants")
          .select("id")
          .eq("event_id", eventId).eq("user_id", user.id).maybeSingle();
        setMyParticipantId(mine?.id ?? null);
      }

      const visible = isJudge || (ev?.results_visibility === "published" && ev?.leaderboard_enabled);
      if (visible) {
        const { data: parts } = await supabase
          .from("general_musabaqah_participants")
          .select("id, participant_name, total_score, status")
          .eq("event_id", eventId)
          .in("status", ["completed", "finalized"])
          .order("total_score", { ascending: false });
        setRows(parts || []);
      }

      setLoading(false);
    })();
  }, [eventId, user, isJudge]);

  if (loading) {
    return <div style={{ minHeight: "100%", background: G, display: "flex", justifyContent: "center", alignItems: "center" }}><Loader2 className="animate-spin" color={GOLD} size={28} /></div>;
  }

  const visible = isJudge || (event?.results_visibility === "published" && event?.leaderboard_enabled);
  const possible = event?.total_marks;

  return (
    <div style={{ minHeight: "100%", background: `linear-gradient(160deg, ${G} 0%, #0a1f12 60%, #050f09 100%)`, padding: "20px 16px 56px", fontFamily: "'Cairo', sans-serif" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 6, marginBottom: 16, cursor: "pointer", fontSize: 13 }}>
          <ArrowLeft size={14} /> Back
        </button>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
          <div>
            <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 800, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
              <Trophy size={20} color={GOLD} /> {event?.title}
            </h1>
            <p style={{ color: GOLD, fontSize: 13, fontWeight: 600, margin: 0 }}>{event?.subject}{event?.topic ? ` — ${event.topic}` : ""}</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, margin: "10px 0 20px", flexWrap: "wrap" }}>
          {event?.competition_date && (
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
              <Calendar size={12} /> {event.competition_date}
            </span>
          )}
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
            <Users size={12} /> {rows.length} finalized participant{rows.length === 1 ? "" : "s"}
          </span>
        </div>

        {!visible ? (
          <Card style={{ background: GM, border: "1px solid rgba(201,168,76,0.2)" }}>
            <CardContent className="pt-8 pb-8 text-center">
              <Lock size={26} color={GOLD} style={{ margin: "0 auto 10px" }} />
              <p style={{ color: "rgba(255,255,255,0.65)" }}>
                {event?.results_visibility !== "published" ? "Results have not been published yet." : "The leaderboard is not enabled for this Musabaqah."}
              </p>
            </CardContent>
          </Card>
        ) : rows.length === 0 ? (
          <Card style={{ background: GM, border: "1px solid rgba(201,168,76,0.2)" }}>
            <CardContent className="pt-8 pb-8 text-center">
              <p style={{ color: "rgba(255,255,255,0.6)" }}>No finalized results yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {rows.map((p, i) => {
              const rank = i + 1;
              const isMe = p.id === myParticipantId;
              const medal = MEDAL_COLORS[rank];
              return (
                <div key={p.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 14px", borderRadius: 12,
                  background: isMe ? "rgba(201,168,76,0.15)" : GM,
                  border: isMe ? "1px solid rgba(201,168,76,0.4)" : rank <= 3 ? `1px solid ${medal}55` : "1px solid rgba(255,255,255,0.06)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: medal ? `${medal}22` : "rgba(255,255,255,0.06)",
                      color: medal || "rgba(255,255,255,0.5)",
                      fontWeight: 800, fontSize: 13, flexShrink: 0,
                    }}>
                      {rank <= 3 ? <Medal size={15} /> : rank}
                    </div>
                    <span style={{ color: "#fff", fontSize: 14, fontWeight: isMe ? 700 : 500 }}>
                      {p.participant_name}{isMe && <span style={{ color: GOLD, fontWeight: 600 }}> (you)</span>}
                    </span>
                  </div>
                  <span style={{ color: GOLD, fontWeight: 800, fontSize: 15 }}>
                    {p.total_score}{possible ? <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 500, fontSize: 12 }}>/{possible}</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 24, textAlign: "center" }}>
          <Button variant="outline" onClick={() => navigate("/musabaqah/general/leaderboard")} style={{ borderColor: "rgba(201,168,76,0.35)", color: GOLD, background: "transparent" }}>
            View All-Time Leaderboard →
          </Button>
        </div>
      </div>
    </div>
  );
}
