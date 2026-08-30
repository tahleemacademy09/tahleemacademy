/*
  src/pages/student/MusabaqahOverallLeaderboard.tsx
  ─────────────────────────────────────────────────────────────
  "Hall of Fame" — combines every published General Subject
  Musabaqah event into one view:
    1. All-time standings: each participant's total points,
       events entered, and medal counts, aggregated by user_id
       across every published event.
    2. Event history: every published event with its date,
       subject, participant count, and top 3 finishers.

  Only pulls from events where results_visibility === "published"
  (admin/teacher additionally sees non-published events, greyed
  out, so they know results are pending rather than missing).

  Route: /musabaqah/general/leaderboard
*/
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Loader2, Trophy, Medal, Calendar, Users, Crown } from "lucide-react";

const G    = "#0f2d1f";
const GM   = "#163d28";
const GOLD = "#c9a84c";

const MEDAL_COLORS: Record<number, string> = { 1: "#FFD700", 2: "#C0C0C0", 3: "#CD7F32" };

interface StandingRow {
  user_id: string;
  participant_name: string;
  totalPoints: number;
  events: number;
  gold: number;
  silver: number;
  bronze: number;
  bestRank: number;
}

interface EventRow {
  id: string;
  title: string;
  subject: string;
  competition_date: string | null;
  participantCount: number;
  top3: { participant_name: string; total_score: number }[];
  published: boolean;
}

export default function MusabaqahOverallLeaderboard() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const isJudge = hasRole("admin") || hasRole("teacher");

  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [events, setEvents]       = useState<EventRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [view, setView]           = useState<"standings" | "events">("standings");

  useEffect(() => {
    (async () => {
      let evQuery = supabase
        .from("general_musabaqah_events")
        .select("id, title, subject, competition_date, results_visibility, leaderboard_enabled")
        .order("competition_date", { ascending: false });

      if (!isJudge) evQuery = evQuery.eq("results_visibility", "published").eq("leaderboard_enabled", true);

      const { data: evs } = await evQuery;
      const eventIds = (evs || []).map(e => e.id);

      if (eventIds.length === 0) { setLoading(false); return; }

      const { data: parts } = await supabase
        .from("general_musabaqah_participants")
        .select("event_id, user_id, participant_name, total_score, status")
        .in("event_id", eventIds)
        .in("status", ["completed", "finalized"])
        .order("total_score", { ascending: false });

      const byEvent: Record<string, typeof parts> = {};
      (parts || []).forEach(p => { (byEvent[p.event_id] ||= []).push(p); });

      // Event history rows, each with its own ranked top 3
      const evRows: EventRow[] = (evs || [])
        .filter(e => isJudge || e.results_visibility === "published")
        .map(e => {
          const list = byEvent[e.id] || [];
          return {
            id: e.id, title: e.title, subject: e.subject, competition_date: e.competition_date,
            participantCount: list.length,
            top3: list.slice(0, 3).map(p => ({ participant_name: p.participant_name, total_score: p.total_score })),
            published: e.results_visibility === "published",
          };
        });
      setEvents(evRows);

      // All-time standings, only from fully published events
      const publishedIds = new Set((evs || []).filter(e => e.results_visibility === "published").map(e => e.id));
      const agg: Record<string, StandingRow> = {};
      Object.entries(byEvent).forEach(([evId, list]) => {
        if (!publishedIds.has(evId)) return;
        list.forEach((p, i) => {
          const rank = i + 1;
          const key = p.user_id || p.participant_name;
          if (!agg[key]) agg[key] = { user_id: key, participant_name: p.participant_name, totalPoints: 0, events: 0, gold: 0, silver: 0, bronze: 0, bestRank: Infinity };
          agg[key].totalPoints += Number(p.total_score) || 0;
          agg[key].events += 1;
          agg[key].bestRank = Math.min(agg[key].bestRank, rank);
          if (rank === 1) agg[key].gold += 1;
          else if (rank === 2) agg[key].silver += 1;
          else if (rank === 3) agg[key].bronze += 1;
        });
      });
      const standingRows = Object.values(agg).sort((a, b) =>
        b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || b.totalPoints - a.totalPoints
      );
      setStandings(standingRows);

      setLoading(false);
    })();
  }, [isJudge]);

  if (loading) {
    return <div style={{ minHeight: "100%", background: G, display: "flex", justifyContent: "center", alignItems: "center" }}><Loader2 className="animate-spin" color={GOLD} size={28} /></div>;
  }

  return (
    <div style={{ minHeight: "100%", background: `linear-gradient(160deg, ${G} 0%, #0a1f12 60%, #050f09 100%)`, padding: "20px 16px 56px", fontFamily: "'Cairo', sans-serif" }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 6, marginBottom: 16, cursor: "pointer", fontSize: 13 }}>
          <ArrowLeft size={14} /> Back
        </button>

        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 18, margin: "0 auto 12px",
            background: `linear-gradient(135deg, ${GOLD}, #8a6b28)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 8px 28px rgba(201,168,76,0.4)",
          }}>
            <Crown size={30} color="#0f2d1f" />
          </div>
          <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 900, margin: "0 0 4px", fontFamily: "'Playfair Display', serif" }}>Musābaqah Hall of Fame</h1>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, margin: 0 }}>All-time standings across every General Subject Musābaqah</p>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 18, justifyContent: "center" }}>
          <button onClick={() => setView("standings")} style={{
            padding: "8px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
            border: view === "standings" ? `1px solid ${GOLD}` : "1px solid rgba(255,255,255,0.15)",
            background: view === "standings" ? "rgba(201,168,76,0.15)" : "transparent",
            color: view === "standings" ? GOLD : "rgba(255,255,255,0.6)",
          }}>Standings</button>
          <button onClick={() => setView("events")} style={{
            padding: "8px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
            border: view === "events" ? `1px solid ${GOLD}` : "1px solid rgba(255,255,255,0.15)",
            background: view === "events" ? "rgba(201,168,76,0.15)" : "transparent",
            color: view === "events" ? GOLD : "rgba(255,255,255,0.6)",
          }}>Event History</button>
        </div>

        {view === "standings" ? (
          standings.length === 0 ? (
            <Card style={{ background: GM, border: "1px solid rgba(201,168,76,0.2)" }}>
              <CardContent className="pt-8 pb-8 text-center">
                <p style={{ color: "rgba(255,255,255,0.6)" }}>No published results yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {standings.map((s, i) => {
                const rank = i + 1;
                const medal = MEDAL_COLORS[rank];
                return (
                  <div key={s.user_id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 14px", borderRadius: 12, background: GM,
                    border: rank <= 3 ? `1px solid ${medal}55` : "1px solid rgba(255,255,255,0.06)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: medal ? `${medal}22` : "rgba(255,255,255,0.06)",
                        color: medal || "rgba(255,255,255,0.5)", fontWeight: 800, fontSize: 13,
                      }}>
                        {rank <= 3 ? <Medal size={15} /> : rank}
                      </div>
                      <div>
                        <p style={{ color: "#fff", fontSize: 14, fontWeight: 700, margin: 0 }}>{s.participant_name}</p>
                        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, margin: "2px 0 0" }}>
                          {s.events} event{s.events === 1 ? "" : "s"}
                          {s.gold ? ` · 🥇${s.gold}` : ""}{s.silver ? ` · 🥈${s.silver}` : ""}{s.bronze ? ` · 🥉${s.bronze}` : ""}
                        </p>
                      </div>
                    </div>
                    <span style={{ color: GOLD, fontWeight: 800, fontSize: 15 }}>{s.totalPoints}<span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 500, fontSize: 11 }}> pts</span></span>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          events.length === 0 ? (
            <Card style={{ background: GM, border: "1px solid rgba(201,168,76,0.2)" }}>
              <CardContent className="pt-8 pb-8 text-center">
                <p style={{ color: "rgba(255,255,255,0.6)" }}>No events yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {events.map(e => (
                <Card key={e.id} style={{ background: GM, border: "1px solid rgba(201,168,76,0.2)", cursor: "pointer" }}
                  onClick={() => navigate(`/student/musabaqah/general/${e.id}/leaderboard`)}>
                  <CardContent className="pt-4 pb-4">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div>
                        <p style={{ color: "#fff", fontSize: 15, fontWeight: 700, margin: 0 }}>{e.title}</p>
                        <p style={{ color: GOLD, fontSize: 12, margin: "2px 0 0" }}>{e.subject}</p>
                      </div>
                      {!e.published && <Badge style={{ background: "rgba(248,113,113,0.15)", color: "#F87171", border: "none" }}>Unpublished</Badge>}
                    </div>
                    <div style={{ display: "flex", gap: 14, fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: e.top3.length ? 10 : 0 }}>
                      {e.competition_date && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Calendar size={11} /> {e.competition_date}</span>}
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Users size={11} /> {e.participantCount}</span>
                    </div>
                    {e.top3.length > 0 && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {e.top3.map((p, i) => (
                          <span key={i} style={{
                            fontSize: 11, padding: "4px 9px", borderRadius: 999,
                            background: `${MEDAL_COLORS[i + 1]}18`, color: MEDAL_COLORS[i + 1], fontWeight: 600,
                          }}>
                            {["🥇", "🥈", "🥉"][i]} {p.participant_name} — {p.total_score}
                          </span>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
