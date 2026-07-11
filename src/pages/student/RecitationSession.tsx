// src/pages/student/RecitationSession.tsx
// ─────────────────────────────────────────────────────────────────────────
// Student-side destination for the "Join Your Virtual Session — LIVE NOW"
// button on TasjeelAwaitingLevel. Previously this button navigated to
// `/student/live-classes` (the generic LearningHub "live" tab), which never
// read the `room`/`type` query params — so nothing actually happened.
//
// This page reads `?room=recitation-eval-<userId>` and connects the student
// directly into that LiveKit room, where their admin/instructor joins from
// the mirrored admin page.
// ─────────────────────────────────────────────────────────────────────────
import { useSearchParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Video } from "lucide-react";
import RecitationCallRoom from "@/components/recitation/RecitationCallRoom";

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
    <div style={{ minHeight: "100vh", background: "#0b0f0e", fontFamily: "'Cairo',sans-serif", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", color: "#fff" }}>
        <button onClick={goBack} style={{ background: "rgba(255,255,255,.08)", border: "none", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer" }}>
          <ChevronLeft size={18} />
        </button>
        <Video size={18} color="#86EFAC" />
        <span style={{ fontWeight: 700, fontSize: 14 }}>Virtual Recitation Session</span>
      </div>
      <div style={{ flex: 1, padding: "0 12px 12px" }}>
        <RecitationCallRoom roomName={roomName} onLeave={goBack} />
      </div>
    </div>
  );
};

export default RecitationSession;
