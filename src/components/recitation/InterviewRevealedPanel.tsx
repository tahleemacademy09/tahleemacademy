// src/components/recitation/InterviewRevealedPanel.tsx
// ─────────────────────────────────────────────────────────────────────────
// Interviewer-side panel: shows, live, which questions the student has
// revealed (newest first) so the interviewer knows what the student is
// answering. Refreshes instantly from the student's data-channel message and
// also polls every 8s as a fallback. Admins can reset the student's tiles.
// Must be rendered inside <LiveKitRoom>.
// ─────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import { Loader2, HelpCircle, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { TEAL, TEAL2, GLASSB } from "@/components/classroom/classroomComponents";

interface Row {
  id: string;
  tile_index: number;
  revealed_at: string;
  interview_questions: { question_text: string; question_text_ar: string | null; category: string | null } | null;
}

const fmt = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const InterviewRevealedPanel = ({ studentId }: { studentId: string | null }) => {
  const room = useRoomContext();
  const { hasRole } = useAuth();
  const [rows, setRows]       = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) { setLoading(false); return; }
    const { data, error } = await (supabase as any)
      .from("interview_reveals")
      .select("id, tile_index, revealed_at, interview_questions(question_text, question_text_ar, category)")
      .eq("student_id", studentId)
      .order("revealed_at", { ascending: true });
    if (!error) setRows((data || []) as Row[]);
    setLoading(false);
  }, [studentId]);

  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  useEffect(() => {
    const h = (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg.type === "interview_reveal") load();
      } catch { /* ignore */ }
    };
    room.on(RoomEvent.DataReceived, h);
    return () => { room.off(RoomEvent.DataReceived, h); };
  }, [room, load]);

  const reset = async () => {
    if (!studentId || !window.confirm("Reset this student's revealed questions? They will be able to pick tiles again.")) return;
    setResetting(true);
    const { error } = await (supabase as any).from("interview_reveals").delete().eq("student_id", studentId);
    setResetting(false);
    if (error) { toast({ title: "Could not reset", description: error.message, variant: "destructive" }); return; }
    try {
      room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ type: "interview_reset" })), { reliable: true });
    } catch { /* student will pick it up on next load */ }
    setRows([]);
    toast({ title: "Questions reset" });
  };

  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
      <Loader2 size={24} style={{ animation: "cv-spin .8s linear infinite", color: "#86efac" }} />
    </div>;
  }

  const newestFirst = [...rows].reverse();

  return (
    <div style={{ padding: 14, color: "#fff", fontFamily: "'Google Sans','Cairo',sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14 }}>
          <HelpCircle size={16} color="#86efac" /> Student's questions
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: GLASSB, color: "rgba(255,255,255,.8)" }}>
          {rows.length} revealed
        </span>
      </div>

      {newestFirst.length === 0 ? (
        <div style={{ border: "1px dashed rgba(255,255,255,.2)", borderRadius: 14, padding: 20, textAlign: "center", fontSize: 13, color: "rgba(255,255,255,.6)", lineHeight: 1.6 }}>
          The student hasn't revealed any question yet.<br />Questions appear here as soon as they tap a tile.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {newestFirst.map((r, idx) => {
            const q = r.interview_questions;
            const latest = idx === 0;
            return (
              <div key={r.id} style={{
                borderRadius: 14, padding: 14,
                background: latest ? `linear-gradient(135deg, ${TEAL2}, ${TEAL})` : "rgba(255,255,255,.06)",
                border: latest ? "1px solid rgba(134,239,172,.35)" : "1px solid rgba(255,255,255,.1)",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 800, letterSpacing: .6, color: latest ? "#bbf7d0" : "rgba(255,255,255,.5)", marginBottom: 6 }}>
                  <span>Q{rows.length - idx} · TILE {r.tile_index + 1}{q?.category ? ` · ${q.category.toUpperCase()}` : ""}</span>
                  <span>{fmt(r.revealed_at)}{latest ? " · LATEST" : ""}</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.5 }}>{q?.question_text || "—"}</div>
                {q?.question_text_ar && (
                  <div dir="rtl" style={{ fontSize: 20, lineHeight: 1.9, marginTop: 6, fontFamily: "'Amiri','Cairo',serif", textAlign: "right" }}>{q.question_text_ar}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {hasRole("admin") && rows.length > 0 && (
        <button onClick={reset} disabled={resetting}
          style={{ marginTop: 14, width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,.18)", background: "transparent", color: "rgba(255,255,255,.75)", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {resetting ? <Loader2 size={13} style={{ animation: "cv-spin .8s linear infinite" }} /> : <RotateCcw size={13} />} Reset student's questions
        </button>
      )}
    </div>
  );
};

export default InterviewRevealedPanel;
