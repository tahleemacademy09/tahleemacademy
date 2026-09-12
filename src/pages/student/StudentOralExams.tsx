// src/pages/student/StudentOralExams.tsx
// ─────────────────────────────────────────────────────────────────────────
// Student side of the live oral exam: see your allocated slot (or pick an
// open one), a countdown to your time, a waiting room once it opens, and
// your live turn — including blindly drawing a question set — once the
// teacher calls you in. Scoring happens on the teacher's side and lands
// straight in the normal exam results once graded.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import { Mic, Clock, Loader2, CheckCircle2, Shuffle, Hourglass, CalendarClock } from "lucide-react";

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
  const [drawnQuestions, setDrawnQuestions] = useState<any[]>([]);
  const [drawing, setDrawing] = useState(false);
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

  useEffect(() => {
    const inProgress = mySlots.find(s => s.status === "in_progress");
    if (!inProgress?.drawn_set_id) { setDrawnQuestions([]); return; }
    supabase.rpc("get_my_drawn_oral_questions" as any, { p_slot_id: inProgress.id }).then(({ data }: any) => setDrawnQuestions(data || []));
  }, [mySlots]);

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}><Loader2 className="animate-spin" style={{ color: G }} /></div>;

  const active = mySlots.find(s => ["waiting", "admitted", "in_progress"].includes(s.status));
  const upcoming = mySlots.filter(s => ["booked"].includes(s.status));
  const completed = mySlots.filter(s => s.status === "completed");

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: 16, paddingBottom: 60 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: G, marginBottom: 4 }}>Oral Exams</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>Your live viva sessions.</p>

      {active && <ActiveSlotCard slot={active} joinedLive={joinedLive} lkToken={lkToken} drawnQuestions={drawnQuestions}
        drawing={drawing} onJoinWaiting={() => joinWaitingRoom(active.id)} onJoinLive={() => joinLive(active.exams.id)}
        onDraw={() => drawSet(active.id)} onLeaveLive={() => setJoinedLive(false)} />}

      {upcoming.length > 0 && (
        <Section title="Upcoming">
          {upcoming.map(s => <SlotRow key={s.id} slot={s} onJoinWaiting={() => joinWaitingRoom(s.id)} />)}
        </Section>
      )}

      {openSlots.length > 0 && (
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

const ActiveSlotCard = ({ slot, joinedLive, lkToken, drawnQuestions, drawing, onJoinWaiting, onJoinLive, onDraw, onLeaveLive }: any) => {
  return (
    <div style={{ background: "#fff", border: `2px solid ${G}`, borderRadius: 14, padding: 16, marginBottom: 20 }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: G, marginBottom: 4 }}>{slot.exams?.title}</div>

      {slot.status === "waiting" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#f59e0b", fontWeight: 700, fontSize: 13 }}>
          <Hourglass size={15} /> Waiting to be admitted…
        </div>
      )}

      {slot.status === "admitted" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#8b5cf6", fontWeight: 700, fontSize: 13 }}>
          <Clock size={15} /> You're in — waiting to be called in for your turn.
        </div>
      )}

      {slot.status === "in_progress" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#dc2626", fontWeight: 800, fontSize: 14 }}>
            <Mic size={16} /> It's your turn!
          </div>

          {!joinedLive ? (
            <button onClick={onJoinLive} style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 10, padding: "12px 16px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>Join the Live Room</button>
          ) : lkToken && (
            <div className="oral-exam-video-room" style={{ position: "relative", borderRadius: 12, overflow: "hidden", height: "75vh", minHeight: 480, background: "#111" }}>
              <LiveKitRoom serverUrl={lkToken.url} token={lkToken.token} connect video={lkToken.can_publish} audio={lkToken.can_publish} onDisconnected={onLeaveLive} style={{ height: "100%" }}>
                <VideoConference />
                <RoomAudioRenderer />
              </LiveKitRoom>
            </div>
          )}

          {!slot.drawn_set_id ? (
            <button onClick={onDraw} disabled={drawing} style={{ background: GOLD, color: "#fff", border: "none", borderRadius: 10, padding: "12px 16px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
              {drawing ? <Loader2 size={14} className="animate-spin" /> : <Shuffle size={14} style={{ verticalAlign: -2 }} />} Draw Your Question Set
            </button>
          ) : (
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 6 }}>Your questions:</p>
              {drawnQuestions.length === 0 ? <Loader2 size={14} className="animate-spin" /> : drawnQuestions.map((q: any) => (
                <div key={q.id} style={{ background: "#f9fafb", borderRadius: 8, padding: 10, marginBottom: 6, fontSize: 13 }}>{q.question_text}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StudentOralExams;
