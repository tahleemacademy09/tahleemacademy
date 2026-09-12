// src/pages/student/StudentOralExams.tsx
// ─────────────────────────────────────────────────────────────────────────
// Student side of the live oral exam: see your allocated slot (or pick an
// open one), a countdown to your time, a waiting room once it opens (with
// your queue number so you can see where you are in line), and your live
// turn — full-screen video once you join, your question set grouped into
// the teacher's stages, and a "hide" toggle that collapses the question
// card into a small draggable picture-in-picture bubble you can drag out of
// the way while you answer, then tap to bring back. Scoring happens on the
// teacher's side and lands straight in the normal exam results once graded.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import {
  Mic, Clock, Loader2, CheckCircle2, Shuffle, Hourglass, CalendarClock,
  Hash, Minimize2, Maximize2, X, LogOut,
} from "lucide-react";

const G = "#064E3B";
const GOLD = "#C9A84C";

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function useCountdown(target: string | null) {
  const [remaining, setRemaining] = useState<number>(target ? new Date(target).getTime() - Date.now() : 0);
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setRemaining(new Date(target).getTime() - Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return { remaining: 0, label: "" };
  const s = Math.max(0, Math.floor(remaining / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const label = h > 0 ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`;
  return { remaining, label };
}

const StudentOralExams = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [mySlots, setMySlots] = useState<any[]>([]);
  const [openSlots, setOpenSlots] = useState<any[]>([]);
  const [joinedLive, setJoinedLive] = useState(false);
  const [lkToken, setLkToken] = useState<{ token: string; url: string; can_publish: boolean } | null>(null);
  const [drawnStages, setDrawnStages] = useState<any[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [session, setSession] = useState<any>(null);
  const liveExamIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: mine }, { data: open }] = await Promise.all([
      supabase.from("oral_exam_slots" as any).select("*, exams(id, title, title_ar)").eq("student_id", user.id).order("start_at"),
      supabase.from("oral_exam_slots" as any).select("*, exams(id, title, title_ar)").eq("status", "open").order("start_at"),
    ]);
    setMySlots(((mine as any) || []).filter((s: any) => s.status !== "cancelled"));
    setOpenSlots((open as any) || []);
  }, [user]);

  useEffect(() => { (async () => { setLoading(true); await load(); setLoading(false); })(); }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`my-oral-slots-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "oral_exam_slots" }, load)
      .subscribe();
    const interval = setInterval(load, 8000);
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, [user, load]);

  const bookSlot = async (slotId: string) => {
    const { error } = await supabase.rpc("book_oral_slot" as any, { p_slot_id: slotId });
    if (error) return toast({ title: "Could not book that slot", description: error.message, variant: "destructive" });
    toast({ title: "Slot booked" });
    load();
  };

  const joinWaitingRoom = async (slotId: string) => {
    const { error } = await supabase.rpc("join_oral_waiting_room" as any, { p_slot_id: slotId });
    if (error) return toast({ title: "Could not join yet", description: error.message, variant: "destructive" });
    load();
  };

  const joinLive = async (examId: string) => {
    liveExamIdRef.current = examId;
    const { data, error } = await supabase.functions.invoke("oral-exam-livekit-token", { body: { exam_id: examId } });
    if (error || data?.error) return toast({ title: "Could not connect", description: error?.message || data?.error, variant: "destructive" });
    setLkToken({ token: data.token, url: data.url, can_publish: data.can_publish });
    setJoinedLive(true);
  };

  const drawSet = async (slotId: string) => {
    setDrawing(true);
    const { error } = await supabase.rpc("draw_oral_question_set" as any, { p_slot_id: slotId });
    setDrawing(false);
    if (error) return toast({ title: "Could not draw a set", description: error.message, variant: "destructive" });
    load();
  };

  const active = mySlots.find(s => ["waiting", "admitted", "in_progress"].includes(s.status));

  // Fetch the drawn question set grouped by stage, and track which stage the
  // teacher currently has active so we can highlight it.
  useEffect(() => {
    if (!active?.drawn_set_id) { setDrawnStages([]); return; }
    supabase.rpc("get_my_drawn_oral_stages" as any, { p_slot_id: active.id }).then(({ data }: any) => setDrawnStages(data || []));
  }, [active?.drawn_set_id, active?.id]);

  useEffect(() => {
    if (!active?.exam_id) { setSession(null); return; }
    supabase.from("oral_exam_sessions" as any).select("*").eq("exam_id", active.exam_id).maybeSingle().then(({ data }: any) => setSession(data));
    const channel = supabase.channel(`my-oral-session-${active.exam_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "oral_exam_sessions", filter: `exam_id=eq.${active.exam_id}` },
        (payload: any) => setSession(payload.new))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [active?.exam_id]);

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}><Loader2 className="animate-spin" style={{ color: G }} /></div>;

  const upcoming = mySlots.filter(s => ["booked"].includes(s.status));
  const completed = mySlots.filter(s => s.status === "completed");

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: 16, paddingBottom: 60 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: G, marginBottom: 4 }}>Oral Exams</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>Your live viva sessions.</p>

      {active && (
        <ActiveSlotCard
          slot={active} session={session} joinedLive={joinedLive} lkToken={lkToken} drawnStages={drawnStages}
          drawing={drawing} onJoinWaiting={() => joinWaitingRoom(active.id)} onJoinLive={() => joinLive(active.exams.id)}
          onDraw={() => drawSet(active.id)} onLeaveLive={() => setJoinedLive(false)}
        />
      )}

      {upcoming.length > 0 && (
        <Section title="Upcoming">
          {upcoming.map(s => <SlotRow key={s.id} slot={s} onJoinWaiting={() => joinWaitingRoom(s.id)} />)}
        </Section>
      )}

      {/* Once the student already has a slot booked (or is waiting/admitted/on
          for their turn), hide open-slot booking entirely — they can't and
          shouldn't book a second one. */}
      {!active && upcoming.length === 0 && openSlots.length > 0 && (
        <Section title="Open slots — pick your time">
          {openSlots.map(s => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{s.exams?.title}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{fmtTime(s.start_at)}</div>
              </div>
              <button onClick={() => bookSlot(s.id)} style={{ background: GOLD, color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Book</button>
            </div>
          ))}
        </Section>
      )}

      {completed.length > 0 && (
        <Section title="Completed">
          {completed.map(s => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{s.exams?.title}</div>
                <div style={{ fontSize: 12, color: "#16a34a" }}><CheckCircle2 size={12} style={{ verticalAlign: -1 }} /> Graded</div>
              </div>
              {s.attempt_id && <button onClick={() => navigate(`/student/results/${s.attempt_id}`)} style={{ background: "none", border: `1px solid ${G}`, color: G, borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>View result</button>}
            </div>
          ))}
        </Section>
      )}

      {!active && upcoming.length === 0 && openSlots.length === 0 && completed.length === 0 && (
        <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center", marginTop: 40 }}>No oral exams scheduled for you yet.</p>
      )}
    </div>
  );
};

const Section = ({ title, children }: any) => (
  <div style={{ marginBottom: 20 }}>
    <h3 style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>{title}</h3>
    {children}
  </div>
);

const SlotRow = ({ slot, onJoinWaiting }: any) => {
  const { remaining, label } = useCountdown(slot.start_at);
  const canJoin = remaining <= 15 * 60 * 1000;
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{slot.exams?.title}</div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>{fmtTime(slot.start_at)}</div>
      {canJoin ? (
        <button onClick={onJoinWaiting} style={{ background: G, color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Join Waiting Room</button>
      ) : (
        <div style={{ fontSize: 12, color: GOLD, fontWeight: 700 }}><CalendarClock size={12} style={{ verticalAlign: -1 }} /> Starts in {label}</div>
      )}
    </div>
  );
};

// Draggable picture-in-picture bubble. Plain pointer events — no library —
// so it works with touch and mouse alike. Position is clamped to the
// viewport on drag so it can never be dragged fully off-screen.
const DraggablePip = ({ children }: any) => {
  const [pos, setPos] = useState(() => ({ x: Math.max(12, window.innerWidth - 172), y: 84 }));
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const clamp = (x: number, y: number) => ({
    x: Math.min(Math.max(8, x), window.innerWidth - 160),
    y: Math.min(Math.max(8, y), window.innerHeight - 120),
  });

  const onPointerDown = (e: any) => {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: any) => {
    if (!dragRef.current) return;
    setPos(clamp(e.clientX - dragRef.current.dx, e.clientY - dragRef.current.dy));
  };
  const onPointerUp = () => { dragRef.current = null; };

  return (
    <div
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 1200, touchAction: "none", cursor: "grab" }}
    >
      {children}
    </div>
  );
};

const ActiveSlotCard = ({ slot, session, joinedLive, lkToken, drawnStages, drawing, onJoinWaiting, onJoinLive, onDraw, onLeaveLive }: any) => {
  const [pipMode, setPipMode] = useState(false);
  const currentStageId = session?.current_stage_id;

  // Full-screen live takeover once the student has joined the room for
  // their turn — video fills the viewport, question card floats on top
  // either docked at the bottom or collapsed into a draggable bubble.
  if (slot.status === "in_progress" && joinedLive && lkToken) {
    const QuestionPanel = (
      <div style={{ background: "rgba(17,17,17,0.94)", borderRadius: 16, padding: 14, maxHeight: "40vh", overflowY: "auto", backdropFilter: "blur(6px)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>Your questions</span>
          <button onClick={() => setPipMode(true)} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8, padding: 6, cursor: "pointer" }}>
            <Minimize2 size={14} color="#fff" />
          </button>
        </div>
        {!slot.drawn_set_id ? (
          <button onClick={onDraw} disabled={drawing} style={{ background: GOLD, color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer", width: "100%" }}>
            {drawing ? <Loader2 size={14} className="animate-spin" /> : <Shuffle size={14} style={{ verticalAlign: -2 }} />} Draw Your Question Set
          </button>
        ) : drawnStages.length === 0 ? (
          <Loader2 size={16} className="animate-spin" color="#fff" />
        ) : (() => {
          // One round, one question: show only the stage currently live —
          // the teacher advancing the stage is what reveals the next round.
          const activeStage = drawnStages.find((st: any) => st.stage_id === currentStageId) || drawnStages[0];
          const roundIdx = drawnStages.findIndex((st: any) => st.stage_id === activeStage?.stage_id);
          return (
            <div style={{ borderRadius: 10, padding: 8, border: `1.5px solid ${GOLD}` }}>
              {drawnStages.length > 1 && (
                <p style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", marginBottom: 4 }}>Round {roundIdx >= 0 ? roundIdx + 1 : 1} of {drawnStages.length}</p>
              )}
              {activeStage?.stage_title && (
                <p style={{ fontSize: 11, fontWeight: 800, color: GOLD, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
                  ▶ {activeStage.stage_title}{activeStage.stage_title_ar ? ` · ${activeStage.stage_title_ar}` : ""}
                </p>
              )}
              {(activeStage?.questions || []).map((q: any) => (
                <div key={q.id} style={{ marginBottom: 8 }}>
                  <p style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>{q.question_text}</p>
                  {q.question_text_ar && <p dir="rtl" style={{ fontSize: 15, color: "#e5e7eb", fontFamily: "'Amiri', serif", marginTop: 2 }}>{q.question_text_ar}</p>}
                </div>
              ))}
              {(activeStage?.questions || []).length === 0 && (
                <p style={{ fontSize: 12, color: "#9ca3af" }}>Waiting for the examiner to move to this round…</p>
              )}
            </div>
          );
        })()}
      </div>
    );

    return (
      <div className="oral-exam-video-room" style={{ position: "fixed", inset: 0, background: "#000", zIndex: 1000 }}>
        <div style={{ position: "absolute", inset: 0 }}>
          <LiveKitRoom serverUrl={lkToken.url} token={lkToken.token} connect video={lkToken.can_publish} audio={lkToken.can_publish} onDisconnected={onLeaveLive} style={{ height: "100%" }}>
            <VideoConference />
            <RoomAudioRenderer />
          </LiveKitRoom>
        </div>

        {/* Top bar: exam name, queue number, leave */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "linear-gradient(rgba(0,0,0,0.6), transparent)", zIndex: 1100, pointerEvents: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, pointerEvents: "auto" }}>
            <span style={{ background: G, color: "#fff", borderRadius: 20, padding: "5px 12px", fontWeight: 800, fontSize: 12 }}>
              <Hash size={12} style={{ verticalAlign: -1 }} /> #{slot.queue_number ?? "—"}
            </span>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 13, textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>{slot.exams?.title}</span>
          </div>
          <button onClick={onLeaveLive} style={{ pointerEvents: "auto", background: "rgba(220,38,38,0.9)", color: "#fff", border: "none", borderRadius: 20, padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <LogOut size={12} /> Leave
          </button>
        </div>

        {/* Question card — docked full-width at the bottom, or a draggable PiP bubble */}
        {pipMode ? (
          <DraggablePip>
            <div onClick={() => setPipMode(false)} style={{ background: G, color: "#fff", borderRadius: 14, padding: "10px 14px", boxShadow: "0 6px 20px rgba(0,0,0,0.4)", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, minWidth: 140 }}>
              <Maximize2 size={14} />
              <div>
                <div style={{ fontWeight: 800, fontSize: 12 }}>Questions</div>
                <div style={{ fontSize: 10, opacity: 0.85 }}>Tap to expand</div>
              </div>
            </div>
          </DraggablePip>
        ) : (
          // Docked above the live room's own control bar (now visibly styled —
          // see .oral-exam-video-room in index.css) so the two never overlap.
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 68, padding: 12 }}>{QuestionPanel}</div>
        )}
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", border: `2px solid ${G}`, borderRadius: 14, padding: 16, marginBottom: 20 }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: G, marginBottom: 4 }}>{slot.exams?.title}</div>

      {slot.status === "waiting" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#f59e0b", fontWeight: 700, fontSize: 13 }}>
            <Hourglass size={15} /> Waiting to be admitted…
          </div>
        </div>
      )}

      {slot.status === "admitted" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "16px 0" }}>
          <span style={{ fontSize: 12, color: "#8b5cf6", fontWeight: 700 }}>You're in — waiting to be called for your turn</span>
          <div style={{ width: 90, height: 90, borderRadius: "50%", background: "#f5f3ff", border: `3px solid #8b5cf6`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 30, fontWeight: 900, color: "#8b5cf6" }}>{slot.queue_number ?? "—"}</span>
          </div>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>your number</span>
        </div>
      )}

      {slot.status === "in_progress" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#dc2626", fontWeight: 800, fontSize: 14 }}>
            <Mic size={16} /> It's your turn — #{slot.queue_number ?? "—"}!
          </div>
          <button onClick={onJoinLive} style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 10, padding: "12px 16px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>Join the Live Room</button>
        </div>
      )}
    </div>
  );
};

export default StudentOralExams;
