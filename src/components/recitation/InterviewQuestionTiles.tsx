// src/components/recitation/InterviewQuestionTiles.tsx
// ─────────────────────────────────────────────────────────────────────────
// Student-side panel for the virtual interview. The student sees face-down
// tiles; tapping one reveals ONE question picked at random from the bank the
// admin set up (Admin → Recitation Test → Interview Questions).
//
// The student can never read the question bank directly: the question comes
// back from the `reveal_interview_question` RPC only when a tile is tapped,
// and the RPC enforces the tile count / max-reveals limits server-side.
// Must be rendered inside <LiveKitRoom> (it tells the interviewer instantly
// over the data channel when a tile is revealed).
// ─────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import { Loader2, HelpCircle, Check, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { TEAL, TEAL2, GLASSB } from "@/components/classroom/classroomComponents";

interface Revealed {
  tile_index: number;
  question_id: string;
  question_text: string;
  question_text_ar: string | null;
  revealed_at: string;
}
interface State { tiles: number; max: number; revealed: Revealed[] }

const ERRORS: Record<string, string> = {
  limit_reached: "You've reached the maximum number of questions for this interview.",
  no_questions:  "There are no more questions available.",
  no_session:    "Your interview session isn't set up yet. Please tell your instructor.",
  invalid_tile:  "That tile isn't available.",
};

const InterviewQuestionTiles = () => {
  const room = useRoomContext();
  const [state, setState]     = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [busy, setBusy]       = useState<number | null>(null);
  const [focus, setFocus]     = useState<number | null>(null);
  const [flipped, setFlipped] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError("");
    const { data, error: err } = await (supabase as any).rpc("get_interview_state");
    if (err || !data) {
      setError(err?.message || "Could not load your interview questions.");
    } else {
      const revealed: Revealed[] = data.revealed || [];
      setState({ tiles: data.tiles, max: data.max_reveals, revealed });
      setFocus(prev => (prev !== null && revealed.some(r => r.tile_index === prev))
        ? prev
        : (revealed.length ? revealed[revealed.length - 1].tile_index : null));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Interviewer reset this student's questions → reload
  useEffect(() => {
    const h = (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload));
        if (msg.type === "interview_reset") { setFocus(null); load(); }
      } catch { /* ignore */ }
    };
    room.on(RoomEvent.DataReceived, h);
    return () => { room.off(RoomEvent.DataReceived, h); };
  }, [room, load]);

  const reveal = async (i: number) => {
    if (!state || busy !== null) return;
    if (state.revealed.some(r => r.tile_index === i)) { setFocus(i); return; }
    if (state.revealed.length >= state.max) {
      toast({ title: "Question limit reached", description: ERRORS.limit_reached });
      return;
    }
    setBusy(i);
    const { data, error: err } = await (supabase as any).rpc("reveal_interview_question", { _tile_index: i });
    setBusy(null);
    if (err || !data) {
      const key = Object.keys(ERRORS).find(k => (err?.message || "").includes(k));
      toast({ title: "Couldn't reveal this tile", description: key ? ERRORS[key] : (err?.message || "Please try again."), variant: "destructive" });
      load();
      return;
    }
    setState(s => s ? { ...s, revealed: [...s.revealed.filter(r => r.tile_index !== i), data as Revealed] } : s);
    setFocus(i);
    setFlipped(i);
    setTimeout(() => setFlipped(null), 900);
    try {
      room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ type: "interview_reveal", tile_index: i, question_id: (data as Revealed).question_id })),
        { reliable: true },
      );
    } catch { /* interviewer's panel also polls, so this is best-effort */ }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
        <Loader2 size={24} style={{ animation: "cv-spin .8s linear infinite", color: "#86efac" }} />
      </div>
    );
  }
  if (error || !state) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: "#fca5a5", fontSize: 13 }}>
        <p style={{ margin: "0 0 12px" }}>{error || "Something went wrong."}</p>
        <button onClick={() => { setLoading(true); load(); }}
          style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: TEAL, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
          Try again
        </button>
      </div>
    );
  }

  const ordered = [...state.revealed].sort((a, b) => a.revealed_at.localeCompare(b.revealed_at));
  const numberOf = (tile: number) => ordered.findIndex(r => r.tile_index === tile) + 1;
  const current = focus !== null ? state.revealed.find(r => r.tile_index === focus) : undefined;
  const limitHit = state.revealed.length >= state.max;

  return (
    <div style={{ padding: 14, color: "#fff", fontFamily: "'Google Sans','Cairo',sans-serif" }}>
      <style>{`
        @keyframes iv-flip { 0% { transform: rotateY(90deg) scale(.9); opacity:.2 } 100% { transform: rotateY(0) scale(1); opacity:1 } }
        @keyframes iv-pop  { 0% { transform: translateY(6px); opacity:0 } 100% { transform: translateY(0); opacity:1 } }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14 }}>
          <HelpCircle size={16} color="#86efac" /> Interview questions
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: GLASSB, color: "rgba(255,255,255,.8)" }}>
          {state.revealed.length} / {state.max} revealed
        </span>
      </div>

      {/* Current question */}
      <div key={current?.question_id || "none"} style={{
        minHeight: 130, borderRadius: 16, padding: 16, marginBottom: 14,
        background: current ? `linear-gradient(135deg, ${TEAL2}, ${TEAL})` : "rgba(255,255,255,.05)",
        border: current ? "1px solid rgba(134,239,172,.35)" : "1px dashed rgba(255,255,255,.2)",
        animation: current ? "iv-pop .3s ease" : undefined,
        display: "flex", flexDirection: "column", justifyContent: "center",
      }}>
        {current ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, color: "#bbf7d0", marginBottom: 8 }}>
              QUESTION {numberOf(current.tile_index)}
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.55 }}>{current.question_text}</div>
            {current.question_text_ar && (
              <div dir="rtl" style={{ fontSize: 22, lineHeight: 1.9, marginTop: 10, fontFamily: "'Amiri','Cairo',serif", textAlign: "right" }}>
                {current.question_text_ar}
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,.65)", lineHeight: 1.6 }}>
            Choose a tile below to reveal your question.<br />
            <span dir="rtl" style={{ fontFamily: "'Amiri',serif", fontSize: 16 }}>اختر بطاقة لإظهار سؤالك</span>
          </div>
        )}
      </div>

      {/* Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 10 }}>
        {Array.from({ length: state.tiles }, (_, i) => {
          const rev = state.revealed.find(r => r.tile_index === i);
          const isFocus = focus === i;
          const locked = !rev && limitHit;
          return (
            <button key={i} onClick={() => reveal(i)} disabled={busy !== null || locked}
              aria-label={rev ? `Question ${numberOf(i)}` : `Tile ${i + 1}`}
              style={{
                aspectRatio: "1 / 1", borderRadius: 14, cursor: locked ? "not-allowed" : "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
                border: isFocus ? "2px solid #86efac" : "1px solid rgba(255,255,255,.14)",
                background: rev ? "rgba(34,197,94,.16)" : locked ? "rgba(255,255,255,.04)" : `linear-gradient(145deg, ${TEAL}, ${TEAL2})`,
                color: "#fff", fontWeight: 800, opacity: locked ? .45 : 1,
                animation: flipped === i ? "iv-flip .6s ease" : undefined,
                boxShadow: rev || locked ? "none" : "0 4px 14px rgba(6,78,59,.45)",
                transition: "transform .15s ease",
              }}>
              {busy === i ? <Loader2 size={20} style={{ animation: "cv-spin .8s linear infinite" }} />
                : rev ? (<><Check size={18} color="#86efac" /><span style={{ fontSize: 11 }}>Q{numberOf(i)}</span></>)
                : locked ? <Lock size={16} />
                : (<><span style={{ fontSize: 22, lineHeight: 1 }}>?</span><span style={{ fontSize: 11, opacity: .8 }}>{i + 1}</span></>)}
            </button>
          );
        })}
      </div>

      {limitHit && (
        <p style={{ marginTop: 14, fontSize: 12, textAlign: "center", color: "rgba(255,255,255,.6)" }}>
          You've revealed all your questions. Tap a green tile to read one again.
        </p>
      )}
    </div>
  );
};

export default InterviewQuestionTiles;
