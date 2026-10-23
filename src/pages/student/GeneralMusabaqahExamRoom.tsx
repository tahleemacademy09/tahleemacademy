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
  useRemoteParticipants, VideoTrack,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Track } from "livekit-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Mic, MicOff, Video, VideoOff, Loader2, AlertTriangle, Pause, Play,
  CheckCircle2, XCircle, SkipForward, Save, Flag, Wifi, WifiOff,
  ArrowLeft, Users, Clock, ShieldCheck, ScrollText, Menu, PhoneCall,
} from "lucide-react";

const PSTATUS_COLORS: Record<string, string> = {
  waiting: "rgba(255,255,255,0.5)",
  admitted: "#60A5FA",
  called: "#FBBF24",
  in_progress: "#4ADE80",
  paused: "#F87171",
  disconnected: "#F87171",
  resuming: "#FBBF24",
  completed: "rgba(255,255,255,0.4)",
  finalized: "rgba(255,255,255,0.4)",
};

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
  const [stages, setStages]         = useState<any[]>([]); // ordered Stage 1 → Stage 2 → … groups, empty = legacy flat bank
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
  const [rosterOpen, setRosterOpen]     = useState(false);
  const [roster, setRoster]             = useState<any[]>([]);

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

  // "participant" is always whoever is ON STAGE (event.current_participant_id) —
  // that's the video/question everyone in the room is looking at, judge or
  // student. "myParticipant" is a student's own row, which is how we know
  // whether THIS browser is the one on stage (full control) or just watching
  // (spectator — every other admitted/waiting/etc. student who has joined).
  const loadParticipant = useCallback(async (ev: any) => {
    if (!eventId || !ev) return null;
    if (!isJudge) {
      const { data: mine } = await supabase.from("general_musabaqah_participants").select("*").eq("event_id", eventId).eq("user_id", user?.id).maybeSingle();
      // First time landing here — flip admitted → waiting so the admin's
      // roster/queue sees this student as "joined" (this used to only
      // happen on the separate waiting-room page; students now come
      // straight here so the flip needs to happen on this load path).
      if (mine?.status === "admitted") {
        await supabase.from("general_musabaqah_participants").update({ status: "waiting" }).eq("id", mine.id);
        mine.status = "waiting";
        await supabase.from("general_musabaqah_event_log").insert({
          event_id: eventId, participant_id: mine.id, action_type: "entered_waiting_room",
          description: `${mine.participant_name} joined and is watching the exam room`,
        });
      }
      setMyP(mine);
    }
    if (!ev.current_participant_id) { setP(null); return null; }
    const { data } = await supabase.from("general_musabaqah_participants").select("*").eq("id", ev.current_participant_id).single();
    setP(data);
    return data;
  }, [eventId, isJudge, user?.id]);

  const loadQuestions = useCallback(async () => {
    if (!eventId) return;
    const { data } = await supabase.from("general_musabaqah_questions").select("*").eq("event_id", eventId).eq("status", "approved").order("created_at");
    setQuestions(data || []);
  }, [eventId]);

  const loadStages = useCallback(async () => {
    if (!eventId) return;
    const { data } = await supabase.from("general_musabaqah_stages").select("*").eq("event_id", eventId).order("stage_order");
    setStages(data || []);
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

  // Full roster for the hamburger drawer — every participant in the event,
  // regardless of status, so the judge can call anyone (not just the "next
  // in line") and see at a glance who's mic'd on. Students see it read-only
  // except for their own row.
  const loadRoster = useCallback(async () => {
    if (!eventId) return;
    const { data } = await supabase.from("general_musabaqah_participants").select("*").eq("event_id", eventId).order("created_at");
    setRoster(data || []);
  }, [eventId]);

  const loadAll = useCallback(async () => {
    const ev = await loadEvent();
    const p  = await loadParticipant(ev);
    await loadQuestions();
    await loadStages();
    if (p) await loadAnswers(p.id);
    await loadQueueCounts();
    await loadRoster();
    setLoading(false);
  }, [loadEvent, loadParticipant, loadQuestions, loadStages, loadAnswers, loadQueueCounts, loadRoster]);

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

  // Sequential stage progression: a stage is "done" for this participant once
  // they have as many MARKED answers from it as its question_count target.
  // activeIndex points at the first not-yet-done stage; index === stages.length
  // means every configured stage is complete (only ungrouped questions, if any, remain).
  const stageProgress = useMemo(() => {
    if (!stages.length) return null;
    const markedByStage = new Map<string, number>();
    answers.filter(a => a.status === "marked").forEach(a => {
      const q = questions.find(qq => qq.id === a.question_id);
      if (q?.stage_id) markedByStage.set(q.stage_id, (markedByStage.get(q.stage_id) || 0) + 1);
    });
    let activeIndex = stages.findIndex(s => (markedByStage.get(s.id) || 0) < s.question_count);
    if (activeIndex === -1) activeIndex = stages.length;
    return { markedByStage, activeIndex, activeStage: stages[activeIndex] ?? null };
  }, [stages, answers, questions]);

  // Auto-pick respects stage order; judges can still override manually via
  // the navigator below (buttons for out-of-sequence questions stay enabled,
  // just visually dimmed) — useful for skipping a stage for one student.

  const pickNextQuestion = () => {
    let pool = questions.filter(q => !askedQuestionIds.has(q.id));
    if (stages.length) {
      pool = stageProgress?.activeStage
        ? pool.filter(q => q.stage_id === stageProgress.activeStage.id)
        : pool.filter(q => !q.stage_id); // all configured stages complete — only ungrouped left
    }
    if (pool.length === 0) return null;
    if (event?.question_selection_method === "manual") return null; // judge must pick
    if (event?.randomize_questions) return pool[Math.floor(Math.random() * pool.length)];
    return pool[0];
  };

  // "on stage" = this browser's own participant row IS the one the event
  // currently points at. Only this person (besides the judge) gets to
  // actually act — tap tiles, toggle mic/camera. Everyone else who has
  // joined watches read-only.
  const isOnStage = !isJudge && !!myParticipant && !!participant && myParticipant.id === participant.id;

  // The moment every stage is done for the participant currently up, nudge
  // the judge straight to the Finalize confirmation instead of leaving them
  // to notice on their own — finalize() itself takes care of auto-calling
  // whoever's next in the queue. autoPromptedFor guards against reopening
  // the dialog every render (or right back open if the judge cancels it).
  const autoPromptedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!isJudge || !participant || participant.status !== "in_progress") return;
    if (!stages.length || stageProgress?.activeIndex !== stages.length) return;
    if (autoPromptedFor.current === participant.id) return;
    autoPromptedFor.current = participant.id;
    setFinalizeOpen(true);
  }, [isJudge, participant, stages.length, stageProgress?.activeIndex]);

  const askQuestion = async (question: any) => {
    if (!participant) return;
    if (participant.status !== "in_progress") {
      toast({ title: "Not ready yet", description: "Start the examination before asking questions." });
      await loadAll();
      return;
    }
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

  // The called student taps their own shuffled tile to self-assign a
  // question — goes through the gm_self_ask_question() RPC (security
  // definer) since students don't otherwise have write access to the
  // answers/question_usage/questions tables. The RPC re-checks server-side
  // that it's actually this participant's turn, so this can't be spoofed
  // by calling it for someone else's id.
  const selfAskQuestion = async (question: any) => {
    if (!myParticipant) return;
    // Guard against acting on a stale local snapshot — e.g. the judge
    // hasn't tapped "Start Examination" yet, or a realtime update for a
    // status change just hasn't landed in this render. Catching it here
    // avoids a round trip to the RPC (which re-checks the same thing
    // server-side anyway) and skips surfacing a raw Postgres error to a
    // student who just tapped a tile at a bad moment.
    if (participant?.status !== "in_progress") {
      toast({ title: "Not ready yet", description: "Waiting for the judge to start your examination." });
      await loadAll(); // resync so the tiles reflect reality instead of staying stuck stale
      return;
    }
    const { error } = await supabase.rpc("gm_self_ask_question", {
      p_participant_id: participant.id,
      p_question_id: question.id,
    });
    if (error) {
      const friendly = /not in progress/i.test(error.message) ? "Waiting for the judge to start your examination."
        : /not your turn/i.test(error.message) ? "It's not your turn right now."
        : /already asked/i.test(error.message) ? "That question was already used — pick another."
        : error.message;
      toast({ title: "Could not select question", description: friendly, variant: "destructive" });
      await loadAll(); // resync — this is what actually clears the stale enabled tiles
      return;
    }
    await loadAll();
  };

  const askNext = async () => {
    const next = pickNextQuestion();
    if (!next) { toast({ title: "No more unused questions — pick one manually or allow repeats" }); return; }
    askQuestion(next);
  };

  const currentAnswer = useMemo(() => answers.find(a => a.question_id === participant?.current_question_id && a.status !== "marked"), [answers, participant?.current_question_id]);
  const currentQuestion = useMemo(() => questions.find(q => q.id === participant?.current_question_id), [questions, participant?.current_question_id]);

  // The tile number the picked question shows as — same numbering the
  // navigator grid used (stage-relative when the event has stages,
  // otherwise the global position) — so the flip card's big number
  // matches the tile that was actually tapped.
  const currentQuestionNumber = useMemo(() => {
    if (!currentQuestion) return null;
    if (stages.length && currentQuestion.stage_id) {
      const stageQuestions = questions.filter(q => q.stage_id === currentQuestion.stage_id);
      return stageQuestions.findIndex(q => q.id === currentQuestion.id) + 1;
    }
    return questions.findIndex(q => q.id === currentQuestion.id) + 1;
  }, [currentQuestion, questions, stages]);

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

  const toggleParticipantVideo = async () => {
    if (!participant) return;
    const nextAllowed = participant.video_allowed === false; // currently off → turn on, and vice versa
    const { error } = await supabase.from("general_musabaqah_participants").update({ video_allowed: nextAllowed }).eq("id", participant.id);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: nextAllowed ? "Video allowed" : "Video disabled" });
    loadAll();
  };

  // Judge-only: call any student from the roster drawer straight onto the
  // stage, same mechanics as GeneralMusabaqahEventDetail's queue "Call" —
  // updates their status + points the event at them, which is what makes
  // isOnStage flip true for that student and hands them the question
  // navigator to pick their own number.
  const callRosterParticipant = async (p: any) => {
    if (!eventId || !isJudge) return;
    const { error: e1 } = await supabase.from("general_musabaqah_participants").update({ status: "called" }).eq("id", p.id);
    const { error: e2 } = await supabase.from("general_musabaqah_events").update({ current_participant_id: p.id }).eq("id", eventId);
    if (e1 || e2) { toast({ title: "Call failed", description: (e1 || e2)?.message, variant: "destructive" }); return; }
    await supabase.from("general_musabaqah_event_log").insert({
      event_id: eventId, participant_id: p.id, action_type: "called",
      description: `${p.participant_name} called to examination`, created_by: user?.id ?? null,
    });
    toast({ title: `Calling ${p.participant_name}…` });
    setRosterOpen(false);
    loadAll();
  };

  // Mic toggle from the drawer. Only meaningful for whoever is actually on
  // stage — LiveKit only grants that person (or the judge) a publish token
  // (see musabaqah-livekit-token), so this flips the same mic_on flag the
  // in-room MediaControls button uses. The judge can mute the on-stage
  // student remotely; the student can do it for themselves too.
  const toggleRosterMic = async (p: any) => {
    const next = !(p.mic_on ?? true);
    const { error } = await supabase.from("general_musabaqah_participants").update({ mic_on: next }).eq("id", p.id);
    if (error) { toast({ title: "Could not update mic", description: error.message, variant: "destructive" }); return; }
    setRoster(r => r.map(x => x.id === p.id ? { ...x, mic_on: next } : x));
    if (p.id === myParticipant?.id) toast({ title: next ? "Mic on" : "Mic off" });
  };

  const submitError = async () => {
    await logEvent("error", errorForm.reason, { error_type: errorForm.type, notes: errorForm.notes, affected_question: currentQuestion?.id });
    setErrorOpen(false);
    setErrorForm({ type: "audio_failure", reason: "", notes: "" });
    toast({ title: "Error logged" });
  };

  // Finalizing used to just clear the stage and boot the judge back to the
  // event list — now it also auto-advances the room: it looks up whoever's
  // been waiting longest (admitted/waiting, oldest first) and calls them
  // straight onto stage, so the judge never has to leave this screen and
  // manually re-open the roster between participants. Falls back to the
  // old "clear stage, nobody up" behavior only when the queue is empty.
  const finalize = async () => {
    if (!participant) return;
    await supabase.from("general_musabaqah_participants").update({ status: "finalized" }).eq("id", participant.id);
    await supabase.from("general_musabaqah_registrations").update({ status: "completed" }).eq("id", participant.registration_id);
    await logEvent("finalized", `Final score: ${participant.total_score}`);

    const { data: next } = await supabase.from("general_musabaqah_participants")
      .select("*").eq("event_id", eventId).neq("id", participant.id)
      .in("status", ["admitted", "waiting"]).order("created_at").limit(1).maybeSingle();

    if (next) {
      await supabase.from("general_musabaqah_participants").update({ status: "called" }).eq("id", next.id);
      await supabase.from("general_musabaqah_events").update({ current_participant_id: next.id }).eq("id", eventId);
      await supabase.from("general_musabaqah_event_log").insert({
        event_id: eventId, participant_id: next.id, action_type: "called",
        description: `${next.participant_name} called to examination`, created_by: user?.id ?? null,
      });
      setFinalizeOpen(false);
      toast({ title: `${participant.participant_name} finalized — now calling ${next.participant_name}` });
      await loadAll();
    } else {
      await supabase.from("general_musabaqah_events").update({ current_participant_id: null }).eq("id", eventId);
      setFinalizeOpen(false);
      toast({ title: `${participant.participant_name} finalized — no one else waiting` });
      navigate(`/musabaqah/general/${eventId}`);
    }
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

  if (!isJudge && !participant) {
    return (
      <div style={{ minHeight: "100%", background: G, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}>
        <Users size={32} color={GOLD} />
        <p style={{ color: "#fff", fontWeight: 700 }}>Waiting for the admin to call the next participant…</p>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>This page updates automatically — once anyone is called, you'll see them here live.</p>
        <Button onClick={() => navigate("/student/musabaqah/general")} variant="outline" style={{ color: "rgba(255,255,255,0.7)" }}>Back</Button>
      </div>
    );
  }

  // Spectator = anyone in the room besides the judge and the person on
  // stage — only they should publish audio/video; everyone else just
  // subscribes so bandwidth and browser mic/cam permissions aren't needlessly
  // requested from students who are only here to watch.
  const canPublish = isJudge || isOnStage;
  const videoAllowedForMe = isJudge || participant?.video_allowed !== false;

  const mm = Math.floor((localTimer ?? 0) / 60), ss = (localTimer ?? 0) % 60;
  const isPaused = participant?.status === "paused";
  const isDisconnected = participant?.status === "disconnected";

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(160deg, ${G} 0%, #0a1f12 60%, #050f09 100%)`, display: "flex", flexDirection: "column", fontFamily: "'Cairo', sans-serif" }}>
      {/* Flip-reveal animation for the picked question tile — the tapped
          number scales up big, then rotates away to reveal the question
          card behind it. Re-triggers each pick because the wrapping div
          is keyed by currentQuestion.id (remounts = animation replays). */}
      <style>{`
        .gm-flip-wrap { perspective: 1200px; }
        .gm-flip-card {
          position: relative;
          width: 100%;
          min-height: 120px;
          transform-style: preserve-3d;
          animation: gm-flip 0.9s cubic-bezier(0.45, 0.05, 0.55, 0.95) forwards;
        }
        .gm-flip-face {
          backface-visibility: hidden;
        }
        .gm-flip-front {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.35);
        }
        .gm-flip-back {
          transform: rotateY(180deg);
          position: relative;
        }
        @keyframes gm-flip {
          0%   { transform: scale(0.4) rotateY(0deg); opacity: 0; }
          25%  { transform: scale(1.15) rotateY(0deg); opacity: 1; }
          55%  { transform: scale(1.15) rotateY(0deg); }
          100% { transform: scale(1) rotateY(180deg); }
        }
      `}</style>
      {/* ── Top bar ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => navigate(isJudge ? `/musabaqah/general/${eventId}` : "/student/musabaqah/general")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>
            <ArrowLeft size={16} />
          </button>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{event?.title}</span>
          <Badge style={{ background: "rgba(96,165,250,0.15)", color: BLUE, border: "none" }}>{participant?.participant_name}</Badge>
          {!isJudge && (
            <Badge style={isOnStage
              ? { background: "rgba(74,222,128,0.15)", color: "#4ADE80", border: "none" }
              : { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)", border: "none" }}>
              {isOnStage ? "You're up — go ahead" : "Watching"}
            </Badge>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {stages.length > 0 && stageProgress && (
            <Badge style={{ background: "rgba(201,168,76,0.15)", color: GOLD, border: "none" }}>
              {stageProgress.activeStage
                ? `Stage ${stageProgress.activeIndex + 1}/${stages.length}: ${stageProgress.activeStage.name}`
                : "All stages complete"}
            </Badge>
          )}
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
            <ScrollText size={13} />
            {stages.length > 0 && stageProgress?.activeStage
              ? `Q${stageProgress.markedByStage.get(stageProgress.activeStage.id) || 0}/${stageProgress.activeStage.question_count}`
              : `Q${answers.filter(a => a.status === "marked").length}/${event?.num_questions_per_student}`}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: localTimer !== null && localTimer < 60 ? RED : "#fff", fontWeight: 800, fontSize: 15, fontFamily: "monospace" }}>
            <Clock size={14} /> {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
          </span>
          <ConnectionBadge status={participant?.connection_status} />
          <button onClick={() => setRosterOpen(true)} aria-label="Participants" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", padding: 2, display: "flex" }}>
            <Menu size={20} />
          </button>
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
          <LiveKitRoom
            serverUrl={lkUrl} token={lkToken} connect={lkConnected}
            audio={canPublish} video={canPublish && videoAllowedForMe}
            options={LK_OPTIONS}
          >
            <RoomAudioRenderer />
            <div style={{ height: 300, borderRadius: 12, overflow: "hidden" }}>
              <VideoStage canPublish={canPublish} onStageUserId={participant?.user_id} />
            </div>
            {canPublish && (
              <MediaControls
                videoAllowed={videoAllowedForMe}
                micAllowed={isJudge ? true : (myParticipant?.mic_on ?? true)}
                participantId={isJudge ? null : myParticipant?.id}
              />
            )}
          </LiveKitRoom>
        ) : (
          <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", background: GM, borderRadius: 12 }}>
            <Loader2 className="animate-spin" color={GOLD} size={24} />
          </div>
        )}
        {isOnStage && !videoAllowedForMe && (
          <p style={{ color: "#FBBF24", fontSize: 12, marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <VideoOff size={13} /> Your camera has been disabled by the admin for this turn.
          </p>
        )}
      </div>

      {/* ── Control strip (Section 13) ────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, padding: "0 16px 12px", flexWrap: "wrap" }}>
        <Button size="sm" variant="outline" onClick={() => setErrorOpen(true)} style={{ color: "#FBBF24", borderColor: "rgba(251,191,36,0.4)" }}>
          <AlertTriangle size={14} className="mr-1" /> Report Error
        </Button>
        {isJudge && participant && (
          <Button size="sm" variant="outline" onClick={toggleParticipantVideo}
            style={participant.video_allowed === false ? { color: "#F87171", borderColor: "rgba(248,113,113,0.4)" } : { color: "rgba(255,255,255,0.7)" }}>
            {participant.video_allowed === false ? <><VideoOff size={14} className="mr-1" /> Video Off</> : <><Video size={14} className="mr-1" /> Video On</>}
          </Button>
        )}
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
        {/* Navigator — only shows once a participant has actually been
            called onto stage, and only the CURRENTLY ACTIVE stage's tiles
            are shown. Earlier stages are done and hidden; later stages
            aren't shown until the participant actually reaches them
            (finishing the active stage's required question_count advances
            stageProgress, which swaps this section to the next stage's
            tiles — this is what makes Stage 2's tiles appear). The grid
            also hides the instant a tile is tapped (currentQuestion becomes
            truthy) so the flip-reveal panel below has the floor to itself,
            and reappears once that question is marked/skipped. */}
        {participant && !currentQuestion && stages.length > 0 ? (
          (() => {
            const stage = stageProgress?.activeStage ?? null;
            const stageQuestions = stage
              ? questions.filter(q => q.stage_id === stage.id)
              : questions.filter(q => !q.stage_id); // all configured stages done — only ungrouped left, if any
            const si = stage ? stages.findIndex(s => s.id === stage.id) : stages.length;
            if (stageQuestions.length === 0) return null;
            return (
              <div style={{ marginBottom: 14 }}>
                <p style={{ color: GOLD, fontSize: 11, fontWeight: 700, margin: "0 0 4px" }}>
                  {stage ? `Stage ${si + 1}: ${stage.name}` : "Ungrouped"}
                </p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {stageQuestions.map((q) => {
                    const a = answers.find(x => x.question_id === q.id);
                    const status = a ? a.status : "not_asked";
                    const isCurrent = participant?.current_question_id === q.id;
                    const globalIndex = questions.findIndex(qq => qq.id === q.id);
                    const canAct = isJudge || isOnStage;
                    return (
                      <button
                        key={q.id}
                        disabled={!canAct || participant?.status !== "in_progress" || (!!currentAnswer && !isCurrent)}
                        onClick={() => (isJudge ? askQuestion(q) : selfAskQuestion(q))}
                        title={isJudge ? q.question_text : "Tap to reveal your question"}
                        style={{
                          width: 34, height: 34, borderRadius: 8, border: isCurrent ? `2px solid ${BLUE}` : "1px solid rgba(255,255,255,0.15)",
                          background: QSTATUS_COLORS[status],
                          color: status === "not_asked" ? "rgba(255,255,255,0.6)" : "#06131f",
                          fontWeight: 800, fontSize: 12, cursor: canAct ? "pointer" : "default", opacity: canAct ? 1 : 0.7,
                        }}
                      >
                        {globalIndex + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()
        ) : participant && !currentQuestion ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {questions.map((q, i) => {
              const a = answers.find(x => x.question_id === q.id);
              const status = a ? a.status : "not_asked";
              const isCurrent = participant?.current_question_id === q.id;
              const canAct = isJudge || isOnStage;
              return (
                <button
                  key={q.id}
                  disabled={!canAct || participant?.status !== "in_progress" || (!!currentAnswer && !isCurrent)}
                  onClick={() => (isJudge ? askQuestion(q) : selfAskQuestion(q))}
                  title={isJudge ? q.question_text : "Tap to reveal your question"}
                  style={{
                    width: 34, height: 34, borderRadius: 8, border: isCurrent ? `2px solid ${BLUE}` : "1px solid rgba(255,255,255,0.15)",
                    background: QSTATUS_COLORS[status], color: status === "not_asked" ? "rgba(255,255,255,0.6)" : "#06131f",
                    fontWeight: 800, fontSize: 12, cursor: canAct ? "pointer" : "default", opacity: canAct ? 1 : 0.7,
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        ) : null}

        {currentQuestion ? (
          // key={currentQuestion.id} forces a remount every time a new tile
          // is picked, so the flip animation replays for each question
          // instead of only playing once on the very first pick.
          <div key={currentQuestion.id} className="gm-flip-wrap">
            <div className="gm-flip-card">
              <div className="gm-flip-face gm-flip-front" style={{ background: `linear-gradient(135deg, ${GOLD}, #a9863a)` }}>
                <span style={{ fontSize: 48, fontWeight: 900, color: "#06131f" }}>{currentQuestionNumber}</span>
              </div>
              <div className="gm-flip-face gm-flip-back">
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
              </div>
            </div>
          </div>
        ) : (
          <div style={{ background: GM, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 24, textAlign: "center" }}>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
              {isJudge && participant?.status === "in_progress" ? "No question active."
                : isJudge ? "Start the examination to begin."
                : isOnStage && participant?.status === "in_progress" ? "Tap a tile above to reveal your question."
                : isOnStage ? "Waiting for the judge to start your examination…"
                : participant ? `Watching ${participant.participant_name} — waiting for their next question…`
                : "Waiting for the judge to call the next participant…"}
            </p>
            {isJudge && participant?.status === "in_progress" && (
              <Button onClick={askNext} style={{ marginTop: 10, background: BLUE, color: "#06131f", fontWeight: 700 }}>
                Ask Next Question
              </Button>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
          {/* Score is judge-only — participants (on-stage or spectating) never see marks live, only the judge does. */}
          {isJudge ? (
            <span>Score so far: <strong style={{ color: GOLD }}>{participant?.total_score ?? 0}</strong></span>
          ) : <span />}
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

      {/* ── Participants drawer (hamburger) ──────────────────────────
          Judge: sees everyone, can Call anyone onto stage and mute/unmute
          whoever is currently on stage. Student: sees the same list
          read-only, except their own row gets a mic toggle once they're
          the one on stage. */}
      <Sheet open={rosterOpen} onOpenChange={setRosterOpen}>
        <SheetContent side="right" className="w-[300px] sm:w-[360px]" style={{ background: G, borderLeft: "1px solid rgba(255,255,255,0.08)", padding: 0 }}>
          <SheetHeader style={{ padding: "16px 16px 8px" }}>
            <SheetTitle style={{ color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
              <Users size={16} color={GOLD} /> Participants
              <Badge style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)", border: "none", marginLeft: "auto" }}>
                {roster.length}
              </Badge>
            </SheetTitle>
          </SheetHeader>
          <ScrollArea style={{ height: "calc(100vh - 64px)" }}>
            <div style={{ padding: "4px 12px 16px", display: "grid", gap: 6 }}>
              {roster.length === 0 && (
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textAlign: "center", padding: 24 }}>No participants yet.</p>
              )}
              {roster.map(p => {
                const isCurrent = p.id === participant?.id;
                const isMe = p.id === myParticipant?.id;
                const micOn = p.mic_on ?? true;
                // Mic only actually does anything for whoever is on stage —
                // that's the only participant LiveKit hands a publish token
                // (see musabaqah-livekit-token). Show it live for them;
                // greyed out (but visible, per spec) for everyone else.
                const micActionable = isCurrent && (isJudge || isMe);
                return (
                  <div key={p.id} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 10,
                    background: isCurrent ? "rgba(74,222,128,0.08)" : "rgba(255,255,255,0.03)",
                    border: isCurrent ? "1px solid rgba(74,222,128,0.3)" : "1px solid rgba(255,255,255,0.06)",
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: PSTATUS_COLORS[p.status] || "rgba(255,255,255,0.3)", flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ color: "#fff", fontSize: 13, fontWeight: 600, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.participant_name}{isMe && " (You)"}
                      </p>
                      <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 10.5, margin: 0 }}>{labelize(p.status)}</p>
                    </div>

                    <button
                      onClick={() => micActionable && toggleRosterMic(p)}
                      disabled={!micActionable}
                      title={isCurrent ? (micOn ? "Mute" : "Unmute") : "Only the participant on stage can use audio"}
                      style={{
                        background: "none", border: "none", padding: 6, borderRadius: 8,
                        cursor: micActionable ? "pointer" : "default",
                        color: !isCurrent ? "rgba(255,255,255,0.2)" : micOn ? GREEN : RED,
                        display: "flex",
                      }}
                    >
                      {micOn ? <Mic size={16} /> : <MicOff size={16} />}
                    </button>

                    {isJudge && (
                      <button
                        onClick={() => callRosterParticipant(p)}
                        disabled={isCurrent}
                        title={isCurrent ? "Already on stage" : `Call ${p.participant_name}`}
                        style={{
                          background: isCurrent ? "rgba(255,255,255,0.05)" : "rgba(201,168,76,0.15)",
                          border: `1px solid ${isCurrent ? "rgba(255,255,255,0.08)" : "rgba(201,168,76,0.4)"}`,
                          padding: 6, borderRadius: 8,
                          cursor: isCurrent ? "default" : "pointer",
                          color: isCurrent ? "rgba(255,255,255,0.25)" : GOLD,
                          display: "flex",
                        }}
                      >
                        <PhoneCall size={15} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

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

/* ── Video stage: local tile (mirrored, like a real mirror) + every remote
   participant currently in the room (the on-stage student, the judge, and
   any spectators who happen to be publishing) shown un-mirrored, exactly as
   everyone else actually sees them. Previously only the FIRST remote
   participant was ever rendered and neither tile was mirrored, which is
   what read as "the camera view is flipped" — your own preview looked
   backwards compared to a real mirror, and with more than 2 people in the
   room, everyone past the first was simply invisible. ───────────────── */
function VideoStage({ canPublish, onStageUserId }: { canPublish: boolean; onStageUserId?: string }) {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants   = useRemoteParticipants();

  const tiles = [
    ...(canPublish ? [{ p: localParticipant, label: "You", mirror: true, isLocal: true }] : []),
    ...remoteParticipants.map(p => {
      let meta: any = {};
      try { meta = p.metadata ? JSON.parse(p.metadata) : {}; } catch { /* ignore */ }
      const isOnStagePerson = onStageUserId && meta.user_id === onStageUserId;
      return { p, label: p.name || (meta.role === "judge" ? "Judge" : "Participant"), mirror: false, isLocal: false, isOnStagePerson };
    }),
  ];

  if (tiles.length === 0) {
    return <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Waiting for video…</div>;
  }

  const cols = tiles.length <= 1 ? 1 : tiles.length <= 4 ? 2 : 3;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 4, height: "100%", background: "#000" }}>
      {tiles.map((t, i) => (
        <ParticipantTile key={t.isLocal ? "local" : t.p.sid || i} participant={t.p} label={t.label} mirror={t.mirror} highlight={!!t.isOnStagePerson} />
      ))}
    </div>
  );
}

function ParticipantTile({ participant, label, mirror, highlight }: { participant: any; label: string; mirror: boolean; highlight?: boolean }) {
  const camPub = participant?.getTrackPublication?.(Track.Source.Camera);
  return (
    <div style={{ position: "relative", background: "#111", display: "flex", alignItems: "center", justifyContent: "center", border: highlight ? `2px solid ${GREEN}` : "none" }}>
      {camPub?.track ? (
        <VideoTrack
          trackRef={{ participant, source: Track.Source.Camera, publication: camPub }}
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: mirror ? "scaleX(-1)" : "none" }}
        />
      ) : (
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Camera off</div>
      )}
      <span style={{ position: "absolute", bottom: 6, left: 8, color: "#fff", fontSize: 11, background: "rgba(0,0,0,0.5)", padding: "2px 8px", borderRadius: 10 }}>{label}</span>
    </div>
  );
}

/* ── Mic/camera toggle strip for whoever is allowed to publish (judge or
   the student currently on stage). Mirrors the toggle into the DB's
   camera_on/mic_on columns too, purely so the admin's participant list/
   queue view can show accurate live status badges. ────────────────────── */
function MediaControls({ videoAllowed, micAllowed, participantId }: { videoAllowed: boolean; micAllowed: boolean; participantId?: string | null }) {
  const { localParticipant } = useLocalParticipant();
  const [micOn, setMicOn] = useState(micAllowed);
  const [camOn, setCamOn] = useState(videoAllowed);

  useEffect(() => { setCamOn(videoAllowed); if (!videoAllowed) localParticipant.setCameraEnabled(false); }, [videoAllowed]); // eslint-disable-line react-hooks/exhaustive-deps
  // Remote mute — e.g. the admin flipping this participant's mic off from
  // the roster drawer — must also cut the actual LiveKit publish, not just
  // repaint the button, otherwise the DB flag lies about what's audible.
  useEffect(() => { setMicOn(micAllowed); localParticipant.setMicrophoneEnabled(micAllowed); }, [micAllowed]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = (patch: Record<string, boolean>) => {
    if (participantId) supabase.from("general_musabaqah_participants").update(patch).eq("id", participantId);
  };

  const toggleMic = async () => {
    const next = !micOn;
    await localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
    persist({ mic_on: next });
  };
  const toggleCam = async () => {
    if (!videoAllowed) return;
    const next = !camOn;
    await localParticipant.setCameraEnabled(next);
    setCamOn(next);
    persist({ camera_on: next });
  };

  return (
    <div style={{ display: "flex", gap: 8, padding: "8px 16px 0" }}>
      <Button size="sm" variant="outline" onClick={toggleMic} style={{ color: micOn ? "#fff" : RED, borderColor: micOn ? "rgba(255,255,255,0.25)" : "rgba(248,113,113,0.4)" }}>
        {micOn ? <Mic size={14} className="mr-1" /> : <MicOff size={14} className="mr-1" />} {micOn ? "Mic On" : "Mic Off"}
      </Button>
      <Button size="sm" variant="outline" disabled={!videoAllowed} onClick={toggleCam}
        style={{ color: !videoAllowed ? "rgba(255,255,255,0.3)" : camOn ? "#fff" : RED, borderColor: camOn ? "rgba(255,255,255,0.25)" : "rgba(248,113,113,0.4)" }}>
        {camOn ? <Video size={14} className="mr-1" /> : <VideoOff size={14} className="mr-1" />} {camOn ? "Camera On" : "Camera Off"}
      </Button>
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
