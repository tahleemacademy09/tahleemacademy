/*
  src/pages/student/GeneralMusabaqahResult.tsx
  ─────────────────────────────────────────────────────────────
  Sections 28/29 of the spec. A student's own result, gated by
  the event's results_visibility:
    private                  → not shown, ever, to students
    visible_after_completion → shown once THIS student is finalized
    published                → shown, plus the leaderboard if enabled
*/
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Loader2, Award, Lock } from "lucide-react";

const G    = "#0f2d1f";
const GM   = "#163d28";
const GOLD = "#c9a84c";

export default function GeneralMusabaqahResult() {
  const { id: eventId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [event, setEvent]     = useState<any>(null);
  const [me, setMe]           = useState<any>(null);
  const [scores, setScores]   = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!eventId || !user) return;
      const { data: ev } = await supabase.from("general_musabaqah_events").select("*").eq("id", eventId).single();
      setEvent(ev);

      const { data: mine } = await supabase
        .from("general_musabaqah_participants")
        .select("*")
        .eq("event_id", eventId).eq("user_id", user.id).maybeSingle();
      setMe(mine);

      // Results only unlock once the admin has finalized the WHOLE event
      // (results_visibility flips to "published" at that point, alongside
      // event.status → "completed"). Finishing your own turn is not enough
      // on its own — you can be done and everyone else still competing.
      const visible = ev?.results_visibility === "published";

      if (mine && visible) {
        const { data: s } = await supabase
          .from("general_musabaqah_scores")
          .select("*, general_musabaqah_answers(question_id, general_musabaqah_questions(category, marks))")
          .eq("participant_id", mine.id);
        setScores(s || []);
      }

      if (ev?.leaderboard_enabled && ev?.results_visibility === "published") {
        const { data: lb } = await supabase
          .from("general_musabaqah_participants")
          .select("id, participant_name, total_score")
          .eq("event_id", eventId)
          .in("status", ["completed", "finalized"])
          .order("total_score", { ascending: false })
          .limit(10);
        setLeaderboard(lb || []);
      }

      setLoading(false);
    })();
  }, [eventId, user]);

  if (loading) {
    return <div style={{ minHeight: "100%", background: G, display: "flex", justifyContent: "center", alignItems: "center" }}><Loader2 className="animate-spin" color={GOLD} size={28} /></div>;
  }

  const visible = event?.results_visibility === "published";

  const byCategory: Record<string, { earned: number; possible: number }> = {};
  scores.forEach(s => {
    const cat = s.general_musabaqah_answers?.general_musabaqah_questions?.category || "other";
    if (!byCategory[cat]) byCategory[cat] = { earned: 0, possible: 0 };
    byCategory[cat].earned += Number(s.score);
    byCategory[cat].possible += Number(s.max_score);
  });
  const possible = scores.reduce((s, r) => s + Number(r.max_score), 0) || event?.total_marks || 0;
  const passed = event?.passing_score != null && me ? Number(me.total_score) >= Number(event.passing_score) : null;

  return (
    <div style={{ minHeight: "100%", background: `linear-gradient(160deg, ${G} 0%, #0a1f12 60%, #050f09 100%)`, padding: "20px 16px 56px", fontFamily: "'Cairo', sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <button onClick={() => navigate("/student/musabaqah/general")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 6, marginBottom: 16, cursor: "pointer", fontSize: 13 }}>
          <ArrowLeft size={14} /> Back
        </button>

        <h1 style={{ color: "#fff", fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>{event?.title}</h1>
        <p style={{ color: GOLD, fontSize: 13, fontWeight: 600, margin: "0 0 20px" }}>{event?.subject}{event?.topic ? ` — ${event.topic}` : ""}</p>

        {!me ? (
          <Card style={{ background: GM, border: "1px solid rgba(201,168,76,0.2)" }}>
            <CardContent className="pt-6 pb-6 text-center">
              <p style={{ color: "rgba(255,255,255,0.6)" }}>You are not registered for this Musabaqah.</p>
            </CardContent>
          </Card>
        ) : !visible ? (
          <Card style={{ background: GM, border: "1px solid rgba(201,168,76,0.2)" }}>
            <CardContent className="pt-8 pb-8 text-center">
              <Lock size={26} color={GOLD} style={{ margin: "0 auto 10px" }} />
              <p style={{ color: "rgba(255,255,255,0.65)" }}>
                {["completed", "finalized"].includes(me.status) ? "Results have not been published yet." : "Your examination isn't finished yet."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card style={{ background: GM, border: "1px solid rgba(201,168,76,0.2)" }}>
              <CardContent className="pt-8 pb-8 text-center">
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, margin: "0 0 6px" }}>Your Score</p>
                <p style={{ color: GOLD, fontSize: 40, fontWeight: 900, margin: 0 }}>{me.total_score}<span style={{ fontSize: 18, color: "rgba(255,255,255,0.4)" }}>/{possible}</span></p>
                {passed !== null && (
                  <Badge className="mt-3" style={{ background: passed ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)", color: passed ? "#4ADE80" : "#F87171", border: "none" }}>
                    {passed ? "Passed" : "Below passing score"}
                  </Badge>
                )}
              </CardContent>
            </Card>

            {Object.keys(byCategory).length > 0 && (
              <div style={{ marginTop: 20 }}>
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 700, marginBottom: 8, textTransform: "uppercase" }}>Category Performance</p>
                <div style={{ display: "grid", gap: 10 }}>
                  {Object.entries(byCategory).map(([cat, v]) => (
                    <div key={cat}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#fff", marginBottom: 3 }}>
                        <span>{cat.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</span>
                        <span>{v.earned}/{v.possible}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${v.possible ? (v.earned / v.possible) * 100 : 0}%`, background: GOLD }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {leaderboard.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <p style={{ color: GOLD, fontWeight: 700, fontSize: 13, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <Award size={15} /> Leaderboard
                </p>
                <div style={{ display: "grid", gap: 6 }}>
                  {leaderboard.map((p, i) => (
                    <div key={p.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 8,
                      background: p.id === me.id ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.03)",
                      border: p.id === me.id ? "1px solid rgba(201,168,76,0.35)" : "1px solid transparent",
                    }}>
                      <span style={{ color: "#fff", fontSize: 13 }}>#{i + 1} {p.participant_name} {p.id === me.id && <span style={{ color: GOLD }}>(you)</span>}</span>
                      <span style={{ color: GOLD, fontWeight: 700, fontSize: 13 }}>{p.total_score}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 24, textAlign: "center" }}>
              <Button
                variant="outline"
                onClick={() => navigate(`/student/musabaqah/general/${eventId}/leaderboard`)}
                style={{ borderColor: "rgba(201,168,76,0.35)", color: GOLD, background: "transparent" }}
              >
                View Full Leaderboard →
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
