// src/pages/student/RecitationSession.tsx
// ─────────────────────────────────────────────────────────────────────────
// Student-side destination for the "Join Your Virtual Session — LIVE NOW"
// button on TasjeelAwaitingLevel. Reads `?room=recitation-eval-<userId>` and
// connects the student into the interview room, where their admin/instructor
// joins from the mirrored admin page.
//
// The room looks and behaves like the live classroom (see InterviewRoom) and
// adds the interview "Questions" panel: the student taps a tile to reveal a
// question set by the admin.
// ─────────────────────────────────────────────────────────────────────────
import { useSearchParams, useNavigate } from "react-router-dom";
import InterviewRoom from "@/components/recitation/InterviewRoom";
import InterviewQuestionTiles from "@/components/recitation/InterviewQuestionTiles";

const G = "#064E3B";

const RecitationSession = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const roomName = searchParams.get("room");

  const goBack = () => navigate("/student/awaiting-level", { replace: true });

  if (!roomName) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, fontFamily: "'Cairo',sans-serif" }}>
        <p style={{ color: "#6b7280", fontSize: 14 }}>No session link was provided.</p>
        <button onClick={goBack} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: G, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
          Back to Registration Status
        </button>
      </div>
    );
  }

  return (
    <InterviewRoom
      roomName={roomName}
      title="Virtual Interview"
      panels={[{ id: "questions", label: "My questions", node: <InterviewQuestionTiles /> }]}
      onLeave={goBack}
    />
  );
};

export default RecitationSession;
