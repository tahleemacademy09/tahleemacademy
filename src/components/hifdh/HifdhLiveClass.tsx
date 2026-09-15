// src/components/hifdh/HifdhLiveClass.tsx
// ─────────────────────────────────────────────────────────────────────────
// Live Hifdh class: teacher runs one video room, calls students up in turn
// to recite Sabaq / Sabqi / Manzil live, scores them, moves to the next.
//
// This is NEW — hifdh_session_queue / hifdh_session_participants existed in
// the schema but nothing ever wrote to them. It reuses the project's
// existing infra rather than inventing new plumbing:
//   - the generic `livekit-token` edge function (same one every other
//     subject's live class uses) for video, keyed off the Hifdh subject
//   - `live_sessions` as the session-of-record (host_id, status, etc.)
//   - `hifdh_session_queue` as the ordered call-up list for that session
//   - `hifdh_session_participants` as the scored recitation log once a
//     student has gone, feeding the same review surfaces as hifdh_sessions
//
// Deliberately NOT folded into the giant shared ClassroomView.tsx (1700+
// lines, used by every other subject) — a standalone screen is safer to
// ship and iterate on without risking regressions elsewhere.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback, useRef } from "react";
import { LiveKitRoom, RoomAudioRenderer, useTracks, VideoTrack } from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
import { supabase } from "@/integrations/supabase/client";
import { Mic, MicOff, Users, PlayCircle, CheckCircle2, XCircle, Radio, Loader2 } from "lucide-react";
import { H_GOLD as GOLD, H_GM as GREEN } from "@/components/hifdh/hifdhTokens";

type Tier = "sabaq" | "sabqi" | "manzil";
const TIERS: { id: Tier; label: string }[] = [
  { id: "sabaq",  label: "Sabaq (new)" },
  { id: "sabqi",  label: "Sabqi (recent)" },
  { id: "manzil", label: "Manzil (old)" },
];

interface QueueRow {
  id: string; student_id: string; queue_position: number;
  status: string | null; tier: Tier; pages_to_recite: string | null;
  student_name?: string;
}

interface Props {
  userId: string | null;
  studentName: string;
  isTeacher: boolean;
}

export default function HifdhLiveClass({ userId, studentName, isTeacher }: Props) {
  const [subjectId, setSubjectId]   = useState<string | null>(null);
  const [sessionId, setSessionId]   = useState<string | null>(null);
  const [status, setStatus]         = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [errorMsg, setErrorMsg]     = useState("");
  const [token, setToken]           = useState<string | null>(null);
  const [wsUrl, setWsUrl]           = useState<string | null>(null);
  const [queue, setQueue]           = useState<QueueRow[]>([]);
  const [myTier, setMyTier]         = useState<Tier>("sabaq");
  const [connected, setConnected]   = useState(false);

  // ── 1. Resolve the Hifdh live subject (flagged is_hifdh_live=true) ──────
  useEffect(() => {
    (supabase as any).from("subjects").select("id, is_active")
      .eq("is_hifdh_live", true).eq("is_active", true).limit(1).maybeSingle()
      .then(({ data }: any) => setSubjectId(data?.id ?? null));
  }, []);

  // ── 2. Find (student) or start (teacher) today's live_sessions row ─────
  const resolveSession = useCallback(async () => {
    if (!subjectId) return null;
    const { data: live } = await (supabase as any).from("live_sessions")
      .select("id").eq("subject_id", subjectId).eq("status", "live").maybeSingle();
    if (live?.id) return live.id as string;
    return null;
  }, [subjectId]);

  // ── 3. Connect: fetch a LiveKit token via the shared edge function ─────
  const connect = useCallback(async () => {
    if (!subjectId) return;
    setStatus("connecting"); setErrorMsg("");
    try {
      const action = isTeacher ? "start_session" : "join";
      const { data, error } = await supabase.functions.invoke("livekit-token", { body: { subject_id: subjectId, action } });
      if (error || !data?.token || !data?.url) {
        if (data?.pending) { setStatus("idle"); setErrorMsg("Waiting for the teacher to start the class."); return; }
        setStatus("error"); setErrorMsg(error?.message || "Could not join the live class."); return;
      }
      setToken(data.token); setWsUrl(data.url);
      const sid = await resolveSession();
      setSessionId(sid);
      setStatus("live");
    } catch (e: any) {
      setStatus("error"); setErrorMsg(e?.message || "Connection failed.");
    }
  }, [subjectId, isTeacher, resolveSession]);

  // ── 4. Queue: load + realtime subscribe once we have a session ─────────
  const loadQueue = useCallback(async () => {
    if (!sessionId) return;
    const { data } = await (supabase as any).from("hifdh_session_queue")
      .select("id, student_id, queue_position, status, tier, pages_to_recite, profiles:student_id(full_name)")
      .eq("session_id", sessionId).order("queue_position", { ascending: true });
    setQueue((data || []).map((r: any) => ({ ...r, student_name: r.profiles?.full_name })));
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    loadQueue();
    const ch = supabase.channel(`hifdh-queue-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "hifdh_session_queue", filter: `session_id=eq.${sessionId}` }, loadQueue)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId, loadQueue]);

  // ── 5. Student: join the queue with a chosen tier ───────────────────────
  const joinQueue = async () => {
    if (!sessionId || !userId) return;
    const nextPos = (queue[queue.length - 1]?.queue_position ?? 0) + 1;
    await (supabase as any).from("hifdh_session_queue").insert({
      session_id: sessionId, student_id: userId, queue_position: nextPos,
      status: "waiting", tier: myTier,
    });
  };

  // ── 6. Teacher: call next / finish current / score ──────────────────────
  const callNext = async (row: QueueRow) => {
    await (supabase as any).from("hifdh_session_queue")
      .update({ status: "active", started_at: new Date().toISOString() }).eq("id", row.id);
  };

  const finishStudent = async (row: QueueRow, approved: boolean, score?: number) => {
    await (supabase as any).from("hifdh_session_queue")
      .update({ status: "done", ended_at: new Date().toISOString() }).eq("id", row.id);
    await (supabase as any).from("hifdh_session_participants").insert({
      session_id: sessionId, student_id: row.student_id, tier: row.tier,
      pages_assigned: row.pages_to_recite, is_approved: approved,
      teacher_score: score ?? null, joined_at: new Date().toISOString(),
      left_at: new Date().toISOString(),
    });
  };

  const myQueueRow = queue.find(q => q.student_id === userId);
  const activeRow  = queue.find(q => q.status === "active");

  // ── UI: not connected yet ───────────────────────────────────────────────
  if (!connected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <Radio size={32} color={GOLD} />
        <div className="text-sm font-bold" style={{ color: GREEN }}>
          {isTeacher ? "Start the live Hifdh class" : "Live Hifdh Class"}
        </div>
        <p className="text-[11px] text-[#7a8a74] max-w-xs">
          {isTeacher
            ? "Students recite Sabaq, Sabqi, and Manzil live, in turn — you call each one up and score them."
            : "Join the queue, then wait your turn to recite live for your teacher."}
        </p>
        {!subjectId && (
          <p className="text-[11px] text-red-500">No live Hifdh subject is configured yet — ask an admin to create it and flag it in Subjects.</p>
        )}
        {errorMsg && <p className="text-[11px] text-red-500">{errorMsg}</p>}
        <button
          disabled={!subjectId || status === "connecting"}
          onClick={async () => { await connect(); setConnected(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-white text-xs font-bold disabled:opacity-50"
          style={{ background: GOLD }}>
          {status === "connecting" ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
          {isTeacher ? "Start Class" : "Join Class"}
        </button>
      </div>
    );
  }

  if (status === "error" || !token || !wsUrl) {
    return <div className="p-6 text-center text-xs text-red-500">{errorMsg || "Could not connect."}</div>;
  }

  return (
    <LiveKitRoom serverUrl={wsUrl} token={token} connect video={isTeacher} audio className="flex flex-1 overflow-hidden" data-lk-theme="default">
      <RoomAudioRenderer />
      <div className="flex-1 flex flex-col overflow-hidden">
        <ActiveSpeakerStage />
        {!isTeacher && (
          <div className="p-3 border-t" style={{ borderColor: "#e8ddd0" }}>
            {myQueueRow ? (
              <div className="text-xs font-semibold text-center" style={{ color: GREEN }}>
                {myQueueRow.status === "active"
                  ? "It's your turn — recite now."
                  : `You're #${queue.filter(q => q.status !== "done").findIndex(q => q.id === myQueueRow.id) + 1} in the queue (${myQueueRow.tier}).`}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <select value={myTier} onChange={e => setMyTier(e.target.value as Tier)}
                  className="text-xs border rounded px-2 py-1 flex-1" style={{ borderColor: "#e8ddd0" }}>
                  {TIERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <button onClick={joinQueue}
                  className="px-3 py-1.5 rounded-full text-white text-xs font-bold" style={{ background: GOLD }}>
                  Join Queue
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Queue sidebar ── */}
      <div className="w-56 shrink-0 border-l overflow-y-auto" style={{ borderColor: "#e8ddd0", background: "#fdf6e3" }}>
        <div className="flex items-center gap-1 px-3 py-2 text-[11px] font-bold" style={{ color: GREEN }}>
          <Users size={12} /> Queue ({queue.filter(q => q.status !== "done").length})
        </div>
        {queue.map(row => (
          <div key={row.id} className="px-3 py-2 border-t text-[11px]" style={{ borderColor: "#e8ddd0", opacity: row.status === "done" ? 0.5 : 1 }}>
            <div className="flex items-center justify-between">
              <span className="font-semibold">{row.student_name || "Student"}</span>
              <span className="text-[9px] uppercase" style={{ color: GOLD }}>{row.tier}</span>
            </div>
            <div className="text-[10px] text-[#7a8a74]">{row.status}</div>
            {isTeacher && row.status !== "done" && (
              <div className="flex gap-1 mt-1">
                {row.status !== "active" && (
                  <button onClick={() => callNext(row)} className="text-[10px] px-2 py-0.5 rounded text-white" style={{ background: GOLD }}>Call up</button>
                )}
                {row.status === "active" && (
                  <>
                    <button onClick={() => finishStudent(row, true, 100)} className="text-[10px] px-2 py-0.5 rounded text-white bg-green-600 flex items-center gap-0.5"><CheckCircle2 size={10} />Pass</button>
                    <button onClick={() => finishStudent(row, false)} className="text-[10px] px-2 py-0.5 rounded text-white bg-red-500 flex items-center gap-0.5"><XCircle size={10} />Retry</button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </LiveKitRoom>
  );
}

// Minimal video stage — shows the currently-publishing camera track(s).
// (Kept separate/small deliberately: full grid/mic-toggle UX from the main
// classroom can be ported in later if this needs to look identical to the
// other live classes; the queue mechanic is the actual new capability.)
function ActiveSpeakerStage() {
  const tracks = useTracks([Track.Source.Camera]);
  return (
    <div className="flex-1 grid grid-cols-2 gap-2 p-2 overflow-y-auto bg-black/90">
      {tracks.map(t => (
        <div key={t.publication.trackSid} className="aspect-video rounded-lg overflow-hidden bg-black">
          <VideoTrack trackRef={t} className="w-full h-full object-cover" />
        </div>
      ))}
      {tracks.length === 0 && (
        <div className="col-span-2 flex items-center justify-center text-white/50 text-xs">Waiting for video…</div>
      )}
    </div>
  );
}
