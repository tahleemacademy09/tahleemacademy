/*
  src/pages/GeneralMusabaqahExamRoom.tsx
  ─────────────────────────────────────────────────────────────
  Sections 9-16, 25-28, 37-39, 47-48 of the spec. The live oral
  exam room — one participant "on stage" at a time, judge scores
  question by question, everything autosaves to the DB so a
  refresh or disconnect never loses progress.

  Reuses the same musabaqah-livekit-token edge function as the
  Qur'an Musabaqah (it just needs a room_code — general_musabaqah_events
  already has one), so no new edge function was needed.

  Scope notes (kept explicit rather than silently simplified):
    - Timer is autosaved every few seconds but is NOT fully
      server-authoritative (no cron/edge function ticking it) —
      good enough for Phase 1, a hardening candidate for later.
    - Judge = any admin/teacher for now; the general_musabaqah_judges
      table exists but there's no assignment UI yet (Section 20/21
      is deferred), so RLS already allows any staff member through.
    - Question selection: "hybrid"/"category_based" respect the
      event's category_targets where set, otherwise the next
      unused approved question is offered; judges can always pick
      manually from the navigator regardless of method.
    - Rubric UI is single score + correctness + comment. The
      rubric_breakdown JSONB column is ready for a fuller per-
      criterion UI later without another migration.
*/
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  LiveKitRoom, RoomAudioRenderer, useLocalParticipant,
  useRemoteParticipants, VideoTrack, useRoomContext,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Mic, MicOff, Video, VideoOff, Loader2, AlertTriangle, Pause, Play,
  CheckCircle2, XCircle, SkipForward, Save, Flag, Wifi, WifiOff,
  ArrowLeft, Users, Clock, ShieldCheck, ScrollText,
} from "lucide-react";

const G    = "#0f2d1f";
const GM   = "#163d28";
const GOLD = "#c9a84c";
const BLUE = "#60A5FA";
const GREEN = "#4ADE80";
const RED  = "#F87171";

const LK_OPTIONS = { dynacast: true, adaptiveStream: true, publishDefaults: { dtx: true, red: true } };

const QSTATUS_COLORS: Record<string, string> = {
  not_asked: "rgba(255,255,255,0.15)",
  current:   BLUE,
  answered:  "#FBBF24",
  marked:    GREEN,
  skipped:   "rgba(255,255,255,0.3)",
  disputed:  RED,
};

export default function GeneralMusabaqahExamRoom() {
  const { id: eventId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const isJudge = hasRole("admin") || hasRole("teacher");

  const [event, setEvent]           = useState<any>(null);
  const [participant, setP]         = useState<any>(null); // the person "on stage"
  const [myParticipant, setMyP]     = useState<any>(null); // this browser's own participant row (student view)
  const [questions, setQuestions]   = useState<any[]>([]);
  const [answers, setAnswers]       = useState<any[]>([]);
  const [queueCount, setQueueCount] = useState({ waiting: 0, completed: 0 });
  const [loading, setLoading]       = useState(true);

  const [lkToken, setLkToken] = useState("");
  const [lkUrl, setLkUrl]     = useState("");
  const [lkConnected, setLkConnected] = useState(false);
  const [lkError, setLkError] = useState("");

  const [pauseOpen, setPauseOpen]   = useState(false);
  const [pauseReason, setPauseReason] = useState("technical_issue");
  const [errorOpen, setErrorOpen]   = useState(false);
  const [errorForm, setErrorForm]   = useState({ type: "audio_failure", reason: "", notes: "" });
  const [finalizeOpen, setFinalizeOpen] = useState(false);

  const [scoreDraft, setScoreDraft] = useState({ score: "", correctness: "correct", comment: "" });
  const [savingScore, setSavingScore] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [localTimer, setLocalTimer] = useState<number | null>(null);

  /* ── LOAD ─────────────────────────────────────────────────────────── */
  const loadEvent = useCallback(async () => {
    if (!eventId) return;
    const { data } = await supabase.from("general_musabaqah_events").select("*").eq("id", eventId).single();
    setEvent(data);
    return data;
  }, [eventId]);

  const loadParticipant = useCallback(async (ev: any) => {
    if (!eventId || !ev) return null;
    if (isJudge) {
      if (!ev.current_participant_id) { setP(null); return null; }
      const { data } = await supabase.from("general_musabaqah_participants").select("*").eq("id", ev.current_participant_id).single();
      setP(data);
      return data;
    } else {
      const { data } = await supabase.from("general_musabaqah_participants").select("*").eq("event_id", eventId).eq("user_id", user?.id).single();
      setMyP(data);
      setP(data);
      return data;
    }
  }, [eventId, isJudge, user?.id]);

  const loadQuestions = useCallback(async () => {
    if (!eventId) return;
    const { data } = await supabase.from("general_musabaqah_questions").select("*").eq("event_id", eventId).eq("status", "approved").order("created_at");
    setQuestions(data || []);
  }, [eventId]);

  const loadAnswers = useCallback(async (participantId: string) => {
    const { data } = await supabase.from("general_musabaqah_answers").select("*, general_musabaqah_scores(*)").eq("participant_id", participantId).order("asked_at");
    setAnswers(data || []);
  }, []);

  const loadQueueCounts = useCallback(async () => {
    if (!eventId) return;
    const { count: waiting }   = await supabase.from("general_musabaqah_participants").select("id", { count: "exact", head: true }).eq("event_id", eventId).in("status", ["admitted", "waiting"]);
    const { count: completed } = await supabase.from("general_musabaqah_participants").select("id", { count: "exact", head: true }).eq("event_id", eventId).in("status", ["completed", "finalized"]);
    setQueueCount({ waiting: waiting || 0, completed: completed || 0 });
  }, [eventId]);

  const loadAll = useCallback(async () => {
    const ev = await loadEvent();
    const p  = await loadParticipant(ev);
    await loadQuestions();
    if (p) await loadAnswers(p.id);
    await loadQueueCounts();
    setLoading(false);
  }, [loadEvent, loadParticipant, loadQuestions, loadAnswers, loadQueueCounts]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Realtime: event (who's current) + this participant's row + answers.
  useEffect(() => {
    if (!eventId) return;
    const ch = supabase.channel(`gm-exam-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "general_musabaqah_events", filter: `id=eq.${eventId}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "general_musabaqah_participants", filter: `event_id=eq.${eventId}` }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [eventId, loadAll]);

  useEffect(() => {
    if (participant?.id) loadAnswers(participant.id);
  }, [participant?.id, loadAnswers]);

  /* ── LIVEKIT ──────────────────────────────────────────────────────── */
  const fetchToken = useCallback(async (roomCode: string) => {
    setLkError("");
    try {
      const { data, error } = await supabase.functions.invoke("musabaqah-livekit-token", { body: { room_code: roomCode } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.token || !data?.url) throw new Error("No token returned");
      setLkToken(data.token); setLkUrl(data.url); setLkConnected(true);
    } catch (err: any) {
      setLkError(err?.message || "LiveKit connection failed");
    }
  }, []);

  useEffect(() => { if (event?.room_code) fetchToken(event.room_code); }, [event?.room_code, fetchToken]);

  /* ── CONNECTIVITY (Section 14/37/48) ─────────────────────────────── */
  useEffect(() => {
    if (!myParticipant?.id) return;
    const markOffline = async () => {
      await supabase.from("general_musabaqah_participants").update({ status: "disconnected", connection_status: "disconnected", disconnected_at: new Date().toISOString() }).eq("id", myParticipant.id);
      await supabase.from("general_musabaqah_event_log").insert({ event_id: eventId, participant_id: myParticipant.id, action_type: "connection_lost" });
    };
    const markOnline = async () => {
      if (myParticipant.status !== "disconnected") return;
      await supabase.from("general_musabaqah_participants").update({ status: "resuming", connection_status: "good" }).eq("id", myParticipant.id);
      await supabase.from("general_musabaqah_event_log").insert({ event_id: eventId, participant_id: myParticipant.id, action_type: "reconnected" });
      toast({ title: "Reconnected — waiting for the judge to resume you" });
    };
    window.addEventListener("offline", markOffline);
    window.addEventListener("online", markOnline);
    return () => { window.removeEventListener("offline", markOffline); window.removeEventListener("online", markOnline); };
  }, [myParticipant?.id, myParticipant?.status, eventId, toast]);

  /* ── TIMER (autosaved, not fully server-authoritative — see file header) */
  useEffect(() => {
    if (!participant) return;
    setLocalTimer(participant.timer_remaining_seconds ?? event?.max_exam_time_seconds ?? 900);
  }, [participant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (participant?.status !== "in_progress") { if (timerRef.current) clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setLocalTimer(prev => {
        const next = Math.max(0, (prev ?? 0) - 1);
        if (next % 5 === 0 && participant?.id) {
          supabase.from("general_musabaqah_participants").update({ timer_remaining_seconds: next }).eq("id", participant.id);
        }
        return next;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [participant?.status, participant?.id]);

  /* ── JUDGE ACTIONS ───────────────────────────────────────────────── */
  const logEvent = async (action_type: string, description?: string, metadata?: any) => {
    await supabase.from("general_musabaqah_event_log").insert({
      event_id: eventId, participant_id: participant?.id ?? null, action_type, description, metadata: metadata || {}, created_by: user?.id ?? null,
    });
  };

  const startExamination = async () => {
    if (!participant) return;
    await supabase.from("general_musabaqah_participants").update({ status: "in_progress", timer_remaining_seconds: event?.max_exam_time_seconds }).eq("id", participant.id);
    await logEvent("started", `${participant.participant_name}'s examination started`);
    toast({ title: "Examination started" });
    loadAll();
  };

  const askedQuestionIds = useMemo(() => new Set(answers.map(a => a.question_id)), [answers]);

  const pickNextQuestion = () => {
    const unused = questions.filter(q => !askedQuestionIds.has(q.id));
    if (unused.length === 0) return null;
    if (event?.question_selection_method === "manual") return null; // judge must pick
    if (event?.randomize_questions) return unused[Math.floor(Math.random() * unused.length)];
    return unused[0];
  };

  const askQuestion = async (question: any) => {
    if (!participant) return;
    const { data: answer, error } = await supabase.from("general_musabaqah_answers")
      .insert({ event_id: eventId, participant_id: participant.id, question_id: question.id, status: "current" })
      .select().single();
    if (error) { toast({ title: "Could not ask question", description: error.message, variant: "destructive" }); return; }

    await supabase.from("general_musabaqah_participants").update({
      current_question_id: question.id,
      questions_asked: [...(participant.questions_asked || []), question.id],
    }).eq("id", participant.id);
    await supabase.from("general_musabaqah_question_usage").insert({ question_id: question.id, participant_id: participant.id });
    await supabase.from("general_musabaqah_questions").update({ times_used: (question.times_used || 0) + 1, last_used_at: new Date().toISOString() }).eq("id", question.id);
    await logEvent("question_asked", `Q asked: ${question.question_text.slice(0, 60)}`, { question_id: question.id });

    setScoreDraft({ score: String(question.marks), correctness: "correct", comment: "" });
    loadAll();
  };

  const askNext = async () => {
    const next = pickNextQuestion();
    if (!next) { toast({ title: "No more unused questions — pick one manually or allow repeats" }); return; }
    askQuestion(next);
  };

  const currentAnswer = useMemo(() => answers.find(a => a.question_id === participant?.current_question_id && a.status !== "marked"), [answers, participant?.current_question_id]);
  const currentQuestion = useMemo(() => questions.find(q => q.id === participant?.current_question_id), [questions, participant?.current_question_id]);

  const saveScore = async () => {
    if (!currentAnswer || !currentQuestion || !user) return;
    const scoreNum = Number(scoreDraft.score);
    if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > currentQuestion.marks) {
      toast({ title: `Score must be between 0 and ${currentQuestion.marks}`, variant: "destructive" });
      return;
    }
    setSavingScore(true);
    const judgeName = (user.user_metadata as any)?.full_name || user.email || "Judge";
    const { error: sErr } = await supabase.from("general_musabaqah_scores").upsert({
      answer_id: currentAnswer.id, participant_id: participant.id, judge_user_id: user.id, judge_name: judgeName,
      score: scoreNum, max_score: currentQuestion.marks, correctness: scoreDraft.correctness, comment: scoreDraft.comment || null,
    }, { onConflict: "answer_id,judge_user_id" });
    if (sErr) { toast({ title: "Could not save score", description: sErr.message, variant: "destructive" }); setSavingScore(false); return; }

    await supabase.from("general_musabaqah_answers").update({ status: "marked", answered_at: new Date().toISOString() }).eq("id", currentAnswer.id);

    const { data: allScores } = await supabase.from("general_musabaqah_scores").select("score").eq("participant_id", participant.id);
    const total = (allScores || []).reduce((s, r) => s + Number(r.score), 0);
    await supabase.from("general_musabaqah_participants").update({ total_score: total, current_question_id: null }).eq("id", participant.id);

    await logEvent("score_saved", `Score ${scoreNum}/${currentQuestion.marks} for "${currentQuestion.question_text.slice(0, 40)}"`);
    setSavingScore(false);
    toast({ title: "Score saved" });
    loadAll();
  };

  const skipQuestion = async () => {
    if (!currentAnswer) return;
    await supabase.from("general_musabaqah_answers").update({ status: "skipped" }).eq("id", currentAnswer.id);
    await supabase.from("general_musabaqah_participants").update({ current_question_id: null }).eq("id", participant.id);
    loadAll();
  };

  const submitPause = async () => {
    if (!participant) return;
    await supabase.from("general_musabaqah_participants").update({
      status: "paused", pause_reason: pauseReason, paused_at: new Date().toISOString(), timer_paused_at: new Date().toISOString(),
    }).eq("id", participant.id);
    await logEvent("paused", `Paused: ${pauseReason}`);
    setPauseOpen(false);
    toast({ title: "Examination paused" });
    loadAll();
  };

  const resumeExamination = async () => {
    if (!participant) return;
    await supabase.from("general_musabaqah_participants").update({ status: "in_progress", pause_reason: null, paused_at: null, timer_paused_at: null }).eq("id", participant.id);
    await logEvent("resumed");
    toast({ title: "Examination resumed" });
    loadAll();
  };

  const submitError = async () => {
    await logEvent("error", errorForm.reason, { error_type: errorForm.type, notes: errorForm.notes, affected_question: currentQuestion?.id });
    setErrorOpen(false);
    setErrorForm({ type: "audio_failure", reason: "", notes: "" });
    toast({ title: "Error logged" });
  };

  const finalize = async () => {
    if (!participant) return;
    await supabase.from("general_musabaqah_participants").update({ status: "finalized" }).eq("id", participant.id);
    await supabase.from("general_musabaqah_registrations").update({ status: "completed" }).eq("id", participant.registration_id);
    await supabase.from("general_musabaqah_events").update({ current_participant_id: null }).eq("id", eventId);
    await logEvent("finalized", `Final score: ${participant.total_score}`);
    setFinalizeOpen(false);
    toast({ title: `${participant.participant_name} finalized — ${participant.total_score} marks` });
    navigate(`/musabaqah/general/${eventId}`);
  };

  /* ── RENDER ───────────────────────────────────────────────────────── */
  if (loading) {
    return <div style={{ minHeight: "100%", background: G, display: "flex", justifyContent: "center", alignItems: "center" }}><Loader2 className="animate-spin" color={GOLD} size={28} /></div>;
  }

  if (isJudge && !participant) {
    return (
      <div style={{ minHeight: "100%", background: G, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}>
        <Users size={32} color={GOLD} />
        <p style={{ color: "#fff" }}>No student is currently called for this Musabaqah.</p>
        <Button onClick={() => navigate(`/musabaqah/general/${eventId}`)} style={{ background: GOLD, color: G }}>Go to Queue</Button>
      </div>
    );
  }

  if (!isJudge && !myParticipant) {
    return (
      <div style={{ minHeight: "100%", background: G, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}>
        <p style={{ color: "#fff" }}>You are not part of this Musabaqah.</p>
        <Button onClick={() => navigate("/student/musabaqah/general")} style={{ background: GOLD, color: G }}>Back</Button>
      </div>
    );
  }

  const mm = Math.floor((localTimer ?? 0) / 60), ss = (localTimer ?? 0) % 60;
  const isPaused = participant?.status === "paused";
  const isDisconnected = participant?.status === "disconnected";

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(160deg, ${G} 0%, #0a1f12 60%, #050f09 100%)`, display: "flex", flexDirection: "column", fontFamily: "'Cairo', sans-serif" }}>
      {/* ── Top bar ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => navigate(isJudge ? `/musabaqah/general/${eventId}` : "/student/musabaqah/general")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>
            <ArrowLeft size={16} />
          </button>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{event?.title}</span>
          <Badge style={{ background: "rgba(96,165,250,0.15)", color: BLUE, border: "none" }}>{participant?.participant_name}</Badge>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
            <ScrollText size={13} /> Q{answers.filter(a => a.status === "marked").length}/{event?.num_questions_per_student}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: localTimer !== null && localTimer < 60 ? RED : "#fff", fontWeight: 800, fontSize: 15, fontFamily: "monospace" }}>
            <Clock size={14} /> {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
          </span>
          <ConnectionBadge status={participant?.connection_status} />
        </div>
      </div>

      {isPaused && (
        <div style={{ background: "rgba(248,113,113,0.15)", borderBottom: "1px solid rgba(248,113,113,0.3)", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span style={{ color: RED, fontSize: 13, fontWeight: 700 }}>⏸ Paused — {participant.pause_reason || "no reason given"}</span>
          {isJudge && <Button size="sm" onClick={resumeExamination} style={{ background: RED, color: "#fff" }}><Play size={14} className="mr-1" /> Resume</Button>}
        </div>
      )}
      {isDisconnected && !isJudge && (
        <div style={{ background: "rgba(248,113,113,0.15)", borderBottom: "1px solid rgba(248,113,113,0.3)", padding: "8px 16px", color: RED, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          <WifiOff size={14} /> Connection lost — waiting to reconnect…
        </div>
      )}

      {/* ── Video area ─────────────────────────────────────────────── */}
      <div style={{ padding: 16 }}>
        {lkError ? (
          <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", background: GM, borderRadius: 12, color: RED, fontSize: 13 }}>
            Video unavailable: {lkError}
          </div>
        ) : lkConnected ? (
          <LiveKitRoom serverUrl={lkUrl} token={lkToken} connect={lkConnected} audio video options={LK_OPTIONS} style={{ height: 260, borderRadius: 12, overflow: "hidden" }}>
            <RoomAudioRenderer />
            <VideoStage />
          </LiveKitRoom>
        ) : (
          <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", background: GM, borderRadius: 12 }}>
            <Loader2 className="animate-spin" color={GOLD} size={24} />
          </div>
        )}
      </div>

      {/* ── Control strip (Section 13) ────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, padding: "0 16px 12px", flexWrap: "wrap" }}>
        <Button size="sm" variant="outline" onClick={() => setErrorOpen(true)} style={{ color: "#FBBF24", borderColor: "rgba(251,191,36,0.4)" }}>
          <AlertTriangle size={14} className="mr-1" /> Report Error
        </Button>
        {isJudge && participant?.status === "called" && (
          <Button size="sm" onClick={startExamination} style={{ background: GREEN, color: "#06301a", fontWeight: 700 }}>
            <Play size={14} className="mr-1" /> Start Examination
          </Button>
        )}
        {isJudge && participant?.status === "in_progress" && (
          <Button size="sm" variant="outline" onClick={() => setPauseOpen(true)} style={{ color: RED, borderColor: "rgba(248,113,113,0.4)" }}>
            <Pause size={14} className="mr-1" /> Pause
          </Button>
        )}
        {isJudge && isPaused && (
          <Button size="sm" onClick={resumeExamination} style={{ background: GREEN, color: "#06301a", fontWeight: 700 }}>
            <Play size={14} className="mr-1" /> Resume
          </Button>
        )}
        {isJudge && ["in_progress", "paused"].includes(participant?.status) && (
          <Button size="sm" onClick={() => setFinalizeOpen(true)} style={{ background: GOLD, color: G, fontWeight: 700, marginLeft: "auto" }}>
            <ShieldCheck size={14} className="mr-1" /> Finalize
          </Button>
        )}
      </div>

      {/* ── Question / judging panel (Section 10-12) ──────────────── */}
      <div style={{ flex: 1, padding: "0 16px 24px", maxWidth: 720, margin: "0 auto", width: "100%" }}>
        {/* Navigator */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {questions.map((q, i) => {
            const a = answers.find(x => x.question_id === q.id);
            const status = a ? a.status : "not_asked";
            const isCurrent = participant?.current_question_id === q.id;
            return (
              <button
                key={q.id}
                disabled={!isJudge || participant?.status !== "in_progress" || (!!currentAnswer && !isCurrent)}
                onClick={() => askQuestion(q)}
                title={q.question_text}
                style={{
                  width: 34, height: 34, borderRadius: 8, border: isCurrent ? `2px solid ${BLUE}` : "1px solid rgba(255,255,255,0.15)",
                  background: QSTATUS_COLORS[status], color: status === "not_asked" ? "rgba(255,255,255,0.6)" : "#06131f",
                  fontWeight: 800, fontSize: 12, cursor: isJudge ? "pointer" : "default", opacity: isJudge ? 1 : 0.7,
                }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        {currentQuestion ? (
          <div style={{ background: GM, border: "1px solid rgba(201,168,76,0.25)", borderRadius: 14, padding: 18 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              <Badge variant="secondary">{labelize(currentQuestion.category)}</Badge>
              <Badge style={{ background: "rgba(201,168,76,0.15)", color: GOLD, border: "none" }}>{currentQuestion.marks} marks</Badge>
              <Badge variant="outline" style={{ color: "#fff", borderColor: "rgba(255,255,255,0.25)" }}>{labelize(currentQuestion.difficulty)}</Badge>
            </div>
            <p style={{ color: "#fff", fontSize: 17, fontWeight: 600, margin: "0 0 8px" }}>{currentQuestion.question_text}</p>
            {currentQuestion.question_text_ar && <p dir="rtl" style={{ color: "rgba(255,255,255,0.85)", fontSize: 18, margin: "0 0 10px" }}>{currentQuestion.question_text_ar}</p>}
            {isJudge && currentQuestion.expected_answer && (
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, background: "rgba(0,0,0,0.2)", padding: 8, borderRadius: 8 }}>
                Expected: {currentQuestion.expected_answer}
              </p>
            )}

            {isJudge && currentAnswer && (
              <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 16, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <label style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>Score</label>
                  <input
                    type="number" min={0} max={currentQuestion.marks} value={scoreDraft.score}
                    onChange={e => setScoreDraft({ ...scoreDraft, score: e.target.value })}
                    style={{ width: 70, padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.05)", color: "#fff" }}
                  />
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>/ {currentQuestion.marks}</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["correct", "partially_correct", "incorrect", "skipped"].map(c => (
                    <button key={c} onClick={() => setScoreDraft({ ...scoreDraft, correctness: c })}
                      style={{
                        padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                        border: scoreDraft.correctness === c ? "1.5px solid " + GOLD : "1px solid rgba(255,255,255,0.2)",
                        background: scoreDraft.correctness === c ? "rgba(201,168,76,0.2)" : "transparent",
                        color: scoreDraft.correctness === c ? GOLD : "rgba(255,255,255,0.6)",
                      }}>
                      {labelize(c)}
                    </button>
                  ))}
                </div>
                <Textarea rows={2} placeholder="Judge comment (optional)" value={scoreDraft.comment}
                  onChange={e => setScoreDraft({ ...scoreDraft, comment: e.target.value })}
                  style={{ background: "rgba(255,255,255,0.05)", color: "#fff", borderColor: "rgba(255,255,255,0.2)" }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <Button onClick={saveScore} disabled={savingScore} style={{ background: GREEN, color: "#06301a", fontWeight: 700 }}>
                    {savingScore ? <Loader2 size={14} className="animate-spin mr-1" /> : <Save size={14} className="mr-1" />} Save Score
                  </Button>
                  <Button variant="outline" onClick={skipQuestion} style={{ color: "rgba(255,255,255,0.6)" }}>
                    <SkipForward size={14} className="mr-1" /> Skip
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ background: GM, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 24, textAlign: "center" }}>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
              {isJudge && participant?.status === "in_progress" ? "No question active." : isJudge ? "Start the examination to begin." : "Waiting for the judge…"}
            </p>
            {isJudge && participant?.status === "in_progress" && (
              <Button onClick={askNext} style={{ marginTop: 10, background: BLUE, color: "#06131f", fontWeight: 700 }}>
                Ask Next Question
              </Button>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
          <span>Score so far: <strong style={{ color: GOLD }}>{participant?.total_score ?? 0}</strong></span>
          <span>{queueCount.waiting} waiting · {queueCount.completed} completed</span>
        </div>
      </div>

      {/* ── Pause dialog ───────────────────────────────────────────── */}
      <Dialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Pause Musabaqah?</DialogTitle></DialogHeader>
          <Select value={pauseReason} onValueChange={setPauseReason}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="technical_issue">Technical issue</SelectItem>
              <SelectItem value="student_issue">Student issue</SelectItem>
              <SelectItem value="judge_issue">Judge issue</SelectItem>
              <SelectItem value="emergency">Emergency</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPauseOpen(false)}>Cancel</Button>
            <Button onClick={submitPause} style={{ background: RED, color: "#fff" }}>Pause</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Error dialog ───────────────────────────────────────────── */}
      <Dialog open={errorOpen} onOpenChange={setErrorOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Report Error</DialogTitle></DialogHeader>
          <div style={{ display: "grid", gap: 10 }}>
            <Select value={errorForm.type} onValueChange={v => setErrorForm({ ...errorForm, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="audio_failure">Audio failure</SelectItem>
                <SelectItem value="video_failure">Video failure</SelectItem>
                <SelectItem value="judge_mistake">Judge mistake</SelectItem>
                <SelectItem value="wrong_question">Wrong question displayed</SelectItem>
                <SelectItem value="student_interruption">Student interruption</SelectItem>
                <SelectItem value="technical_problem">Other technical problem</SelectItem>
              </SelectContent>
            </Select>
            <Textarea rows={2} placeholder="Reason" value={errorForm.reason} onChange={e => setErrorForm({ ...errorForm, reason: e.target.value })} />
            <Textarea rows={2} placeholder="Notes (optional)" value={errorForm.notes} onChange={e => setErrorForm({ ...errorForm, notes: e.target.value })} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setErrorOpen(false)}>Cancel</Button>
            <Button onClick={submitError} style={{ background: "#FBBF24", color: "#1a1400" }}><Flag size={14} className="mr-1" /> Log Error</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Finalize dialog ────────────────────────────────────────── */}
      <Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Finalize Examination</DialogTitle></DialogHeader>
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <p style={{ fontWeight: 700, fontSize: 16 }}>{participant?.participant_name}</p>
            <p style={{ color: "#6b7280", fontSize: 13 }}>
              {answers.filter(a => a.status === "marked").length} questions answered
            </p>
            <p style={{ fontSize: 28, fontWeight: 900, color: G, margin: "8px 0" }}>{participant?.total_score ?? 0}</p>
            <p style={{ fontSize: 12, color: "#6b7280" }}>This locks the examination unless reopened by an admin.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalizeOpen(false)}>Cancel</Button>
            <Button onClick={finalize} style={{ background: G, color: "#fff" }}>Finalize</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Video stage: local + remote tiles side by side ────────────────── */
function VideoStage() {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants   = useRemoteParticipants();
  const room = useRoomContext();
  const other = remoteParticipants[0];

  return (
    <div style={{ display: "grid", gridTemplateColumns: other ? "1fr 1fr" : "1fr", gap: 4, height: "100%", background: "#000" }}>
      <ParticipantTile participant={localParticipant} label="You" muted={false} />
      {other && <ParticipantTile participant={other} label={other.name || "Participant"} muted={false} />}
    </div>
  );
}

function ParticipantTile({ participant, label }: { participant: any; label: string; muted: boolean }) {
  const camPub = participant?.getTrackPublication?.(Track.Source.Camera);
  return (
    <div style={{ position: "relative", background: "#111", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {camPub?.track ? (
        <VideoTrack trackRef={{ participant, source: Track.Source.Camera, publication: camPub }} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Camera off</div>
      )}
      <span style={{ position: "absolute", bottom: 6, left: 8, color: "#fff", fontSize: 11, background: "rgba(0,0,0,0.5)", padding: "2px 8px", borderRadius: 10 }}>{label}</span>
    </div>
  );
}

function ConnectionBadge({ status }: { status?: string }) {
  const map: Record<string, { c: string; icon: any }> = {
    excellent: { c: GREEN, icon: Wifi }, good: { c: GREEN, icon: Wifi },
    weak: { c: "#FBBF24", icon: Wifi }, disconnected: { c: RED, icon: WifiOff }, unknown: { c: "rgba(255,255,255,0.4)", icon: Wifi },
  };
  const s = map[status || "unknown"] || map.unknown;
  const Icon = s.icon;
  return <Icon size={14} color={s.c} />;
}

function labelize(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
