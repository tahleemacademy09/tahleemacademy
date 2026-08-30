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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Mic, MicOff, Video, VideoOff, Loader2, AlertTriangle, Play,
  CheckCircle2, XCircle, SkipForward, Save, Flag, Wifi, WifiOff,
  ArrowLeft, Users, Clock, ScrollText, Menu, PhoneCall,
  LayoutGrid, Rows3, Columns2, TimerReset, Square, Trophy,
  Zap, Hand, Settings,
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
// Any tile whose question has already been asked (any status other than
// not_asked) turns grey — one clear "this number is taken" signal instead of
// having to read several different status colors to know what's pickable.
const TAKEN_GREY = "rgba(120,130,140,0.45)";

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
  // Event-wide "has any participant used this question" set — see
  // loadUsedQuestions. Distinct from answers (which is scoped to whoever is
  // currently on stage) so a tile can show as taken/grey for participant B
  // even though participant A — not B — is the one who actually answered it.
  const [usedQuestionIds, setUsedQuestionIds] = useState<Set<string>>(new Set());
  const [queueCount, setQueueCount] = useState({ waiting: 0, completed: 0 });
  const [loading, setLoading]       = useState(true);

  const [lkToken, setLkToken] = useState("");
  const [lkUrl, setLkUrl]     = useState("");
  const [lkConnected, setLkConnected] = useState(false);
  const [lkError, setLkError] = useState("");

  const [pauseOpen, setPauseOpen]   = useState(false);
  const [pauseReason, setPauseReason] = useState("technical_issue");
  const [errorOpen, setErrorOpen]   = useState(false);
  const [errorForm, setErrorForm]   = useState({ type: "recitation_mistake", reason: "", notes: "" });
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [rosterOpen, setRosterOpen]     = useState(false);
  const [roster, setRoster]             = useState<any[]>([]);
  // Whole-competition finalize (hamburger) — distinct from finalizeOpen,
  // which only finalizes whoever is currently on stage.
  const [finalizeEventOpen, setFinalizeEventOpen] = useState(false);
  // Live-room timer settings — the per-question timer (question_time_seconds)
  // previously could only be changed from the separate event setup admin
  // page before the competition started. This lets the judge open it right
  // here mid-room without leaving the exam room, and saves straight to the
  // same event row / column that page uses.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const questionTimeInputRef = useRef<HTMLInputElement>(null);
  const [finalizingEvent, setFinalizingEvent]     = useState(false);

  // Live "signal" flash (Error / Stop) — broadcast to everyone in the room
  // (participant, spectators, other judges) as a full-screen colour+icon
  // flash. Ephemeral only: it does NOT log anything or change any status
  // by itself — Error still opens the log dialog below for the judge to
  // record details, and Stop is signal-only (it does not end or finalize
  // the participant's turn; that still only happens automatically once
  // every stage is complete, or was previously via the Stop button before
  // this change).
  const [activeSignal, setActiveSignal] = useState<{ kind: "error" | "stop"; id: number } | null>(null);
  const gmChannelRef = useRef<any>(null);

  const [scoreDraft, setScoreDraft] = useState({ score: "", correctness: "correct", comment: "" });
  const [savingScore, setSavingScore] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [localTimer, setLocalTimer] = useState<number | null>(null);

  // Video layout — which tiles are shown and how they're arranged. Only
  // the judge and whoever is on stage are ever eligible tiles now (see
  // VideoStage); this just controls arrangement, not who's included.
  const [viewLayout, setViewLayout] = useState<"grid" | "spotlight_stage" | "spotlight_admin">("grid");

  // Per-question timer (Section 4/5 of the fix request): distinct from the
  // overall exam clock above. It sits at rest after a question is revealed
  // so the judge can read it out loud, then only starts once the judge taps
  // "Start Timer" — that's the participant's actual cue to start answering.
  const [questionTimerActive, setQuestionTimerActive] = useState(false);
  const [questionTimeLeft, setQuestionTimeLeft] = useState<number | null>(null);
  const [timeUpFlash, setTimeUpFlash] = useState(false);
  const questionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Replaces the old CSS 3D flip (backface-visibility flips are unreliable
  // in Android WebView, which is what was showing the tile rotated upside
  // down instead of ever revealing the question). This is a plain state
  // flag: show the big number briefly, then swap to the question card.
  const [revealedQuestion, setRevealedQuestion] = useState(false);

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
    if (!eventId) return [];
    const { data } = await supabase.from("general_musabaqah_questions").select("*").eq("event_id", eventId).eq("status", "approved").order("created_at");
    setQuestions(data || []);
    return data || [];
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

  // Question usage across the WHOLE event, not just the participant
  // currently on stage — a question one participant already used must show
  // as taken/grey for the next participant reaching that same stage too, so
  // nobody gets asked the same question twice. general_musabaqah_answers is
  // scoped per-participant (used for tile status/scoring of whoever's up
  // right now); general_musabaqah_question_usage is the event-wide record
  // every askQuestion/selfAskQuestion call already writes to, so it's the
  // right source for "has ANY participant used this one".
  const loadUsedQuestions = useCallback(async (eventQuestions: any[]) => {
    const ids = eventQuestions.map(q => q.id);
    if (!ids.length) { setUsedQuestionIds(new Set()); return; }
    const { data } = await supabase.from("general_musabaqah_question_usage").select("question_id").in("question_id", ids);
    setUsedQuestionIds(new Set((data || []).map((r: any) => r.question_id)));
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
    const qs = await loadQuestions();
    await loadStages();
    if (p) await loadAnswers(p.id);
    await loadUsedQuestions(qs);
    await loadQueueCounts();
    await loadRoster();
    setLoading(false);
  }, [loadEvent, loadParticipant, loadQuestions, loadStages, loadAnswers, loadUsedQuestions, loadQueueCounts, loadRoster]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Realtime: event (who's current) + this participant's row + answers.
  useEffect(() => {
    if (!eventId) return;
    const ch = supabase.channel(`gm-exam-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "general_musabaqah_events", filter: `id=eq.${eventId}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "general_musabaqah_participants", filter: `event_id=eq.${eventId}` }, () => loadAll())
      // Ephemeral Error/Stop flash — see activeSignal above. Broadcast (not
      // a DB table) since it's a live "everyone look now" cue, not state
      // that needs to persist or survive a refresh.
      .on("broadcast", { event: "gm_signal" }, ({ payload }: any) => {
        if (payload?.kind !== "error" && payload?.kind !== "stop") return;
        setActiveSignal({ kind: payload.kind, id: Date.now() });
      })
      .subscribe();
    gmChannelRef.current = ch;
    return () => { supabase.removeChannel(ch); gmChannelRef.current = null; };
  }, [eventId, loadAll]);

  // Auto-clear the flash a few seconds after it appears.
  useEffect(() => {
    if (!activeSignal) return;
    const t = setTimeout(() => setActiveSignal(null), 3200);
    return () => clearTimeout(t);
  }, [activeSignal]);

  // Fires the flash for everyone (including the sender, who won't get their
  // own broadcast back by default) — purely visual, no DB write.
  const sendSignal = useCallback((kind: "error" | "stop") => {
    gmChannelRef.current?.send({ type: "broadcast", event: "gm_signal", payload: { kind } });
    setActiveSignal({ kind, id: Date.now() });
  }, []);

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

  // Gated on the event actually being live — otherwise everyone in the room
  // (called or not) would connect to LiveKit and start publishing/pulling
  // camera feeds before the admin has pressed Start Competition at all.
  useEffect(() => {
    const live = event?.status === "in_progress" || event?.status === "paused";
    if (event?.room_code && live) fetchToken(event.room_code);
  }, [event?.room_code, event?.status, fetchToken]);

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
  // Frozen by the Stop button below — halts the countdown immediately and
  // stays frozen until the active stage genuinely advances (see the
  // stageTimerState effect further down, which clears it and hands the
  // participant a fresh countdown for whatever stage comes next).
  const [timerFrozen, setTimerFrozen] = useState(false);
  useEffect(() => {
    if (!participant) return;
    setLocalTimer(participant.timer_remaining_seconds ?? event?.max_exam_time_seconds ?? 900);
    setTimerFrozen(false);
  }, [participant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // The visible clock is now fully tied to the per-question timer: it
    // never runs on its own just because the participant is "in_progress".
    // It only counts down while the judge has actually pressed "Start
    // Timer" for the question currently on screen (questionTimerActive) —
    // not while a question is being read aloud, not while the participant
    // is picking a tile, and not at any other idle moment. It stops the
    // instant the per-question timer stops, whether that's because time
    // ran out (questionTimerActive flips false on its own) or because the
    // judge pressed Stop (timerFrozen, set by handleStop below, which also
    // kills questionTimerActive so both clocks halt together).
    if (participant?.status !== "in_progress" || !questionTimerActive || timerFrozen) { if (timerRef.current) clearInterval(timerRef.current); return; }
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
  }, [participant?.status, participant?.id, participant?.current_question_id, questionTimerActive, timerFrozen]);

  /* ── PER-QUESTION TIMER (server-synced) ────────────────────────────
     Resets every time a new question is revealed (or cleared): the clock
     starts idle so the judge can read the question out loud, and the
     flip-reveal replaces the fragile CSS 3D flip with a plain timed swap
     from "big number" to "question card".

     The countdown itself is now driven by participant.question_timer_
     started_at — a real timestamp written to the DB the moment the judge
     presses "Start Timer" — instead of a boolean that only ever lived in
     the judge's own browser tab. Every client in the room (judge, the
     on-stage participant, spectators) is already subscribed to
     participant-row changes for other things (current question, status,
     etc.), so the same realtime update that carries the new timestamp is
     what makes the countdown start ticking in sync everywhere at once,
     not just for whoever tapped the button. */
  const currentQuestionIdForTimer = participant?.current_question_id ?? null;
  const questionDurationSeconds = event?.question_time_seconds ?? 60;
  const timerStartedAtMs = participant?.question_timer_started_at
    ? new Date(participant.question_timer_started_at).getTime()
    : null;

  useEffect(() => {
    setTimeUpFlash(false);
    setRevealedQuestion(false);
    if (!currentQuestionIdForTimer) return;
    const t = setTimeout(() => setRevealedQuestion(true), 550);
    return () => clearTimeout(t);
  }, [currentQuestionIdForTimer]);

  const playTick = useCallback((freq: number) => {
    try {
      const ctx = audioCtxRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.18);
    } catch { /* audio unavailable — non-fatal */ }
  }, []);

  // Recomputed from wall-clock elapsed time against timerStartedAtMs each
  // tick (rather than decrementing a counter), so every device converges
  // on the same remaining seconds regardless of small network/render
  // delays in when each one actually received the started_at update.
  const lastTickLeftRef = useRef<number | null>(null);
  useEffect(() => {
    if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    if (!currentQuestionIdForTimer) { setQuestionTimerActive(false); setQuestionTimeLeft(null); return; }
    if (!timerStartedAtMs) { setQuestionTimerActive(false); setQuestionTimeLeft(questionDurationSeconds); return; }
    lastTickLeftRef.current = null;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - timerStartedAtMs) / 1000);
      const left = Math.max(0, questionDurationSeconds - elapsed);
      setQuestionTimeLeft(left);
      if (left !== lastTickLeftRef.current && left >= 1 && left <= 3) playTick(left === 1 ? 440 : 880); // tik-tak on 3, 2, 1
      lastTickLeftRef.current = left;
      if (left <= 0) {
        setTimeUpFlash(true);
        setQuestionTimerActive(false);
        if (questionTimerRef.current) clearInterval(questionTimerRef.current);
      }
    };
    setQuestionTimerActive(true);
    tick();
    questionTimerRef.current = setInterval(tick, 1000);
    return () => { if (questionTimerRef.current) clearInterval(questionTimerRef.current); };
  }, [currentQuestionIdForTimer, timerStartedAtMs, questionDurationSeconds]); // eslint-disable-line react-hooks/exhaustive-deps

  const startQuestionTimer = async () => {
    if (!currentQuestionIdForTimer || questionTimerActive || (questionTimeLeft ?? 0) <= 0 || !participant?.id) return;
    await supabase.from("general_musabaqah_participants").update({ question_timer_started_at: new Date().toISOString() }).eq("id", participant.id);
    await logEvent("question_timer_started", "Judge started the per-question timer — participant may answer now");
    loadAll();
  };

  /* ── JUDGE ACTIONS ───────────────────────────────────────────────── */
  const logEvent = async (action_type: string, description?: string, metadata?: any) => {
    await supabase.from("general_musabaqah_event_log").insert({
      event_id: eventId, participant_id: participant?.id ?? null, action_type, description, metadata: metadata || {}, created_by: user?.id ?? null,
    });
  };

  const startExamination = async () => {
    if (!participant) return;
    // Seed the very first stage's own time limit if it has one configured,
    // otherwise fall back to the event's overall exam timer — matches what
    // the per-stage reset effect below does for every later transition.
    const firstStage = [...stages].sort((a, b) => a.stage_order - b.stage_order)[0];
    const initialLimit = firstStage?.time_limit_seconds ?? event?.max_exam_time_seconds ?? 900;
    // Set the visible countdown immediately — the sync effect above only
    // re-reads timer_remaining_seconds when participant.id changes, which it
    // doesn't here (same participant, called → in_progress), so without this
    // the on-screen clock kept whatever stale value it had (often 0 left over
    // from a previous turn) instead of the fresh stage duration.
    setLocalTimer(initialLimit);
    await supabase.from("general_musabaqah_participants").update({ status: "in_progress", timer_remaining_seconds: initialLimit }).eq("id", participant.id);
    await logEvent("started", `${participant.participant_name}'s examination started`);
    toast({ title: "Examination started" });
    loadAll();
  };

  // Gate for Section 1 of the fix request: everyone can be in the room
  // (video area, roster, etc. stay reachable) but nobody's camera/mic
  // connects and no questions can be asked until the judge explicitly
  // flips this on. Distinct from startExamination (which starts one
  // called student's clock) — this is the room-wide "go live" switch.
  const competitionLive = event?.status === "in_progress" || event?.status === "paused";
  const startCompetitionFromRoom = async () => {
    if (!eventId || !isJudge) return;
    const { error } = await supabase.from("general_musabaqah_events").update({ status: "in_progress" }).eq("id", eventId);
    if (error) { toast({ title: "Could not start competition", description: error.message, variant: "destructive" }); return; }
    await logEvent("competition_started", "Competition started by admin");
    toast({ title: "Competition started" });
    loadAll();
  };


  // Sequential stage progression: a stage is "done" for this participant once
  // they have as many MARKED answers from it as its question_count target.
  // activeIndex points at the first not-yet-done stage; index === stages.length
  // means every configured stage is complete (only ungrouped questions, if any, remain).
  // Each stage offers a bank of question tiles (question_count, set by the
  // admin) to pick from, but the participant only ever answers ONE of them
  // per stage — picking one, having the judge mark it, and moving on is
  // what completes the stage, regardless of how many tiles were on offer.
  const QUESTIONS_PER_STAGE = 1;
  const stageProgress = useMemo(() => {
    if (!stages.length) return null;
    const markedByStage = new Map<string, number>();
    answers.filter(a => a.status === "marked").forEach(a => {
      const q = questions.find(qq => qq.id === a.question_id);
      if (q?.stage_id) markedByStage.set(q.stage_id, (markedByStage.get(q.stage_id) || 0) + 1);
    });
    let activeIndex = stages.findIndex(s => (markedByStage.get(s.id) || 0) < QUESTIONS_PER_STAGE);
    if (activeIndex === -1) activeIndex = stages.length;
    return { markedByStage, activeIndex, activeStage: stages[activeIndex] ?? null };
  }, [stages, answers, questions]);

  // Stop: freezes the countdown immediately (the interval effect above
  // checks timerFrozen) and pre-loads the clock with the NEXT stage's
  // duration so it's ready to go the moment that stage actually starts.
  // The freeze itself is lifted automatically by the stageTimerState effect
  // below once the active stage genuinely advances. This never changes
  // participant.status or ends/finalizes the turn — see the Stop button's
  // own comment for that history.
  const handleStop = () => {
    sendSignal("stop");
    setTimerFrozen(true);
    // Also kill the per-question timer — locally right away for the judge's
    // own screen, and by clearing question_timer_started_at in the DB so
    // the participant's and any spectator's screens stop counting too,
    // not just the judge's.
    setQuestionTimerActive(false);
    if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    const nextStage = stageProgress ? stages[stageProgress.activeIndex + 1] : null;
    const resetLimit = nextStage?.time_limit_seconds ?? event?.max_exam_time_seconds ?? 900;
    setLocalTimer(resetLimit);
    if (participant?.id) {
      supabase.from("general_musabaqah_participants").update({ timer_remaining_seconds: resetLimit, question_timer_started_at: null }).eq("id", participant.id);
    }
  };

  // Per-stage timer: each stage can have its own time_limit_seconds (set by
  // the admin, falls back to the event's overall max_exam_time_seconds when
  // unset). We only want to hand the participant a *fresh* countdown when
  // the active stage genuinely advances mid-session — not on first mount or
  // a reconnect, where the earlier load effect above has already restored
  // whatever time was actually left from timer_remaining_seconds. The ref
  // tracks (participant, stage) pairs so we can tell those two cases apart.
  const stageTimerState = useRef<{ participantId: string | null; stageId: string | null }>({ participantId: null, stageId: null });
  useEffect(() => {
    if (!participant || participant.status !== "in_progress") {
      stageTimerState.current = { participantId: null, stageId: null };
      return;
    }
    const activeStageId = stageProgress?.activeStage?.id ?? null;
    const sameParticipant = stageTimerState.current.participantId === participant.id;
    if (sameParticipant && stageTimerState.current.stageId === activeStageId) return;

    if (!sameParticipant) {
      // First time tracking this participant this session — just note
      // where they are without touching the clock.
      stageTimerState.current = { participantId: participant.id, stageId: activeStageId };
      return;
    }

    // Same participant, stage moved on — fresh countdown for the new stage,
    // and clear any manual Stop freeze so the new stage's clock actually runs.
    stageTimerState.current = { participantId: participant.id, stageId: activeStageId };
    const limit = stageProgress?.activeStage?.time_limit_seconds ?? event?.max_exam_time_seconds ?? 900;
    setLocalTimer(limit);
    setTimerFrozen(false);
    supabase.from("general_musabaqah_participants").update({ timer_remaining_seconds: limit }).eq("id", participant.id);
  }, [participant?.id, participant?.status, stageProgress?.activeStage?.id]);

  // Question selection is self-serve only now: the participant on stage taps
  // their own tile to reveal a question (selfAskQuestion below). There is no
  // judge-side auto-pick anymore — a button that silently picked a number
  // for the student was confusing and skipped the point of the tile reveal,
  // so it was removed along with pickNextQuestion/askNext.

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

  // Direct judge-side question assignment was removed along with "Ask Next
  // Question" — see the note near pickNextQuestion above. Only
  // selfAskQuestion (the participant tapping their own tile) creates an
  // answer row now.

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
    // Note: current_question_id is deliberately NOT cleared here anymore.
    // The question (now marked) stays on screen and the tile grid stays
    // hidden until the judge explicitly taps "Next" (advanceAfterMark) —
    // that's the only thing that reveals the next stage's tiles now,
    // instead of them reappearing the instant a score is saved.
    await supabase.from("general_musabaqah_participants").update({ total_score: total }).eq("id", participant.id);

    await logEvent("score_saved", `Score ${scoreNum}/${currentQuestion.marks} for "${currentQuestion.question_text.slice(0, 40)}"`);
    setSavingScore(false);
    toast({ title: "Score saved" });
    loadAll();
  };

  // Judge-only: advances past the just-marked question once they're ready.
  // Clearing current_question_id is what reveals the tile grid again —
  // by then stageProgress has already recomputed off the freshly marked
  // answer, so the grid that appears is the NEXT stage's, in sequence.
  const advanceAfterMark = async () => {
    if (!participant) return;
    await supabase.from("general_musabaqah_participants").update({ current_question_id: null }).eq("id", participant.id);
    await logEvent("advanced", "Judge moved on after recording the score");
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
    const next = !(p.mic_on ?? false);
    const { error } = await supabase.from("general_musabaqah_participants").update({ mic_on: next }).eq("id", p.id);
    if (error) { toast({ title: "Could not update mic", description: error.message, variant: "destructive" }); return; }
    setRoster(r => r.map(x => x.id === p.id ? { ...x, mic_on: next } : x));
    if (p.id === myParticipant?.id) toast({ title: next ? "Mic on" : "Mic off" });
  };

  const submitError = async () => {
    await logEvent("error", errorForm.reason, { error_type: errorForm.type, notes: errorForm.notes, affected_question: currentQuestion?.id });
    setErrorOpen(false);
    setErrorForm({ type: "recitation_mistake", reason: "", notes: "" });
    toast({ title: "Error logged" });
  };

  // Finalizing clears the stage; the judge picks who's next manually from
  // the roster drawer's Call button — no auto-advance, so they stay in
  // control of pacing/order instead of the room deciding for them.
  const finalize = async () => {
    if (!participant) return;
    await supabase.from("general_musabaqah_participants").update({ status: "finalized" }).eq("id", participant.id);
    await supabase.from("general_musabaqah_registrations").update({ status: "completed" }).eq("id", participant.registration_id);
    await supabase.from("general_musabaqah_events").update({ current_participant_id: null }).eq("id", eventId);
    await logEvent("finalized", `Final score: ${participant.total_score}`);
    setFinalizeOpen(false);
    toast({ title: `${participant.participant_name} finalized` });
    setRosterOpen(true); // hand the judge straight to the roster to call whoever's next
    await loadAll();
  };

  // Ends the whole competition (not just whoever is on stage): locks the
  // event, publishes results/leaderboard, and drops the judge straight into
  // the admin Results tab so scores + leaderboard are right there.
  const finalizeEvent = async () => {
    if (!eventId || !isJudge) return;
    setFinalizingEvent(true);
    const { error } = await supabase.from("general_musabaqah_events").update({
      status: "completed", results_visibility: "published", leaderboard_enabled: true, current_participant_id: null,
    }).eq("id", eventId);
    setFinalizingEvent(false);
    if (error) { toast({ title: "Could not finalize competition", description: error.message, variant: "destructive" }); return; }
    await logEvent("event_finalized", "Competition finalized by admin — results published");
    setFinalizeEventOpen(false);
    setRosterOpen(false);
    toast({ title: "Competition finalized — results published" });
    navigate(`/musabaqah/general/${eventId}?tab=results`);
  };

  // Saves the per-question timer straight from the live room. Same column
  // (question_time_seconds) the pre-event admin settings page writes, so
  // whichever one was used most recently wins — nothing else needs to
  // change since the room already reads event.question_time_seconds live
  // via the general_musabaqah_events realtime subscription.
  const saveTimerSettings = async (seconds: number) => {
    if (!eventId || !isJudge || !Number.isFinite(seconds) || seconds <= 0) return;
    setSavingSettings(true);
    const { error } = await supabase.from("general_musabaqah_events").update({ question_time_seconds: seconds }).eq("id", eventId);
    setSavingSettings(false);
    if (error) { toast({ title: "Could not save timer setting", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Question timer set to ${seconds}s` });
    setSettingsOpen(false);
  };

  /* ── RENDER ───────────────────────────────────────────────────────── */
  if (loading) {
    return <div style={{ minHeight: "100%", background: G, display: "flex", justifyContent: "center", alignItems: "center" }}><Loader2 className="animate-spin" color={GOLD} size={28} /></div>;
  }

  if (isJudge && !event) {
    return (
      <div style={{ minHeight: "100%", background: G, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}>
        <Users size={32} color={GOLD} />
        <p style={{ color: "#fff" }}>Musabaqah not found.</p>
        <Button onClick={() => navigate(`/musabaqah/general`)} style={{ background: GOLD, color: G }}>Back</Button>
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

  // Note: a student with no one on stage yet no longer gets bounced to a
  // static "waiting" screen — they stay in this room (see the video area
  // below) so they can see/hear the admin's live introduction the moment
  // the competition auto-launches, same as the judge.

  // Spectator = anyone in the room besides the judge and the person on
  // stage — only they should publish audio/video; everyone else just
  // subscribes so bandwidth and browser mic/cam permissions aren't needlessly
  // requested from students who are only here to watch.
  const canPublish = isJudge || isOnStage;
  const videoAllowedForMe = isJudge || participant?.video_allowed !== false;
  // Whether the camera should actually be ON right now — separate from
  // videoAllowedForMe above, which is just the admin's permission gate.
  // Defaults to off (mirrors the mic_on default a few lines up) so camera
  // and mic both start muted/off until the person taps to turn them on;
  // judges have no persisted participant row so always start off too.
  const cameraOnForMe = isJudge ? false : (myParticipant?.camera_on ?? false);

  const mm = Math.floor((localTimer ?? 0) / 60), ss = (localTimer ?? 0) % 60;
  const isPaused = participant?.status === "paused";
  const isDisconnected = participant?.status === "disconnected";

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(160deg, ${G} 0%, #0a1f12 60%, #050f09 100%)`, display: "flex", flexDirection: "column", fontFamily: "'Cairo', sans-serif" }}>
      {/* Reveal animation for the picked question tile. Previously this was
          a CSS 3D flip (rotateY + backface-visibility) — unreliable in
          Android WebView, which is what read as "the tile just turns
          upside down and never shows the question": the back face's
          counter-rotation wasn't being composited correctly, so only the
          same front number kept rendering, rotated. Replaced with a plain
          scale/opacity pop that doesn't depend on any 3D compositing, so
          it renders identically everywhere. */}
      <style>{`
        .gm-reveal-number {
          animation: gm-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .gm-reveal-question {
          animation: gm-fade-in 0.35s ease-out both;
        }
        @keyframes gm-pop {
          0%   { transform: scale(0.5); opacity: 0; }
          70%  { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes gm-fade-in {
          0%   { transform: scale(0.96); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .gm-timeup-flash { animation: gm-timeup-flash 0.6s ease-in-out 3; }
        @keyframes gm-timeup-flash {
          0%, 100% { background-color: rgba(248,113,113,0); }
          50% { background-color: rgba(248,113,113,0.55); }
        }
        .gm-signal-flash { animation: gm-signal-fade 3.2s ease-in-out both; }
        @keyframes gm-signal-fade {
          0%   { opacity: 0; }
          8%   { opacity: 1; }
          82%  { opacity: 1; }
          100% { opacity: 0; }
        }
        .gm-signal-icon { animation: gm-signal-pulse 0.65s ease-in-out infinite; }
        @keyframes gm-signal-pulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.18); }
        }
      `}</style>
      {timeUpFlash && (
        <div className="gm-timeup-flash" style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 60 }} />
      )}
      {/* Live Error/Stop signal — full-screen colour + icon flash, visible to
          everyone in the room (participant, spectators, other judges).
          pointer-events: none so it never blocks taps on whatever's
          underneath while it's fading. */}
      {activeSignal && (
        <div
          key={activeSignal.id}
          className="gm-signal-flash"
          style={{
            position: "fixed", inset: 0, zIndex: 90, pointerEvents: "none",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18,
            background: activeSignal.kind === "error" ? "rgba(251,191,36,0.94)" : "rgba(248,113,113,0.94)",
          }}
        >
          {activeSignal.kind === "error" ? (
            <Zap size={100} color="#3a2c00" strokeWidth={2.5} className="gm-signal-icon" />
          ) : (
            <Hand size={100} color="#3a0a0a" strokeWidth={2.5} className="gm-signal-icon" />
          )}
          <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: 1.5, color: activeSignal.kind === "error" ? "#3a2c00" : "#3a0a0a" }}>
            {activeSignal.kind === "error" ? "ERROR FLAGGED" : "STOP"}
          </span>
        </div>
      )}
      {/* ── Fixed top: header + (when live) video area, pinned together as
          one sticky unit so neither scrolls out of view — only the question/
          judging panel below them scrolls. ─────────────────────────────── */}
      <div style={{ position: "sticky", top: 0, zIndex: 25, background: G }}>
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
              ? `Q${stageProgress.markedByStage.get(stageProgress.activeStage.id) || 0}/${QUESTIONS_PER_STAGE}`
              : `Q${answers.filter(a => a.status === "marked").length}/${event?.num_questions_per_student}`}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: localTimer !== null && localTimer < 60 ? RED : "#fff", fontWeight: 800, fontSize: 15, fontFamily: "monospace" }}>
            <Clock size={14} /> {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
          </span>
          <ConnectionBadge status={participant?.connection_status} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button aria-label="Video layout" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", padding: 2, display: "flex" }}>
                <LayoutGrid size={18} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setViewLayout("grid")}><Columns2 size={14} className="mr-2" /> Side by side</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setViewLayout("spotlight_stage")}><Rows3 size={14} className="mr-2" /> Spotlight participant</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setViewLayout("spotlight_admin")}><Rows3 size={14} className="mr-2" /> Spotlight admin</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {isJudge && (
            <button onClick={() => setSettingsOpen(true)} aria-label="Timer settings" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", padding: 2, display: "flex" }}>
              <Settings size={18} />
            </button>
          )}
          <button onClick={() => setRosterOpen(true)} aria-label="Participants" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", padding: 2, display: "flex" }}>
            <Menu size={20} />
          </button>
        </div>
      </div>

      {/* ── Video area ─────────────────────────────────────────────── */}
      {competitionLive && (
      <div style={{ padding: 16 }}>
        {lkError ? (
          <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", background: GM, borderRadius: 12, color: RED, fontSize: 13 }}>
            Video unavailable: {lkError}
          </div>
        ) : lkConnected ? (
          <LiveKitRoom
            serverUrl={lkUrl} token={lkToken} connect={lkConnected}
            audio={false} video={false}
            options={LK_OPTIONS}
          >
            <RoomAudioRenderer />
            {/* position:relative so the mic/camera icons can float inside
                the video box itself instead of sitting as a row below it.
                Box is sized portrait (3:4, capped by maxHeight) to roughly
                match a phone front camera's stream. Tile below now uses
                object-fit:contain (not cover) — cover was still cropping
                the feed to fill the box, which is why someone had to lean
                back out of frame just to appear inside it. Contain always
                shows the whole picture, letterboxing rather than cropping
                when the stream's actual aspect ratio doesn't exactly match
                the box. */}
            <div style={{ position: "relative", width: "100%", aspectRatio: "3 / 4", maxHeight: "70vh", borderRadius: 12, overflow: "hidden" }}>
              <VideoStage canPublish={canPublish} onStageUserId={participant?.user_id} layout={viewLayout} />
              {canPublish && (
                <MediaControls
                  videoAllowed={videoAllowedForMe}
                  videoOn={cameraOnForMe}
                  micAllowed={isJudge ? false : (myParticipant?.mic_on ?? false)}
                  participantId={isJudge ? null : myParticipant?.id}
                />
              )}
            </div>
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
      )}
      </div>

      {/* ── Not started yet (Section 1): nobody's camera/mic connects and
          no questions can be asked until the judge presses this. Everyone
          who has navigated here (called or not) sees this instead of a
          live video feed. ────────────────────────────────────────────── */}
      {!competitionLive && (
        <div style={{ padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center" }}>
          {isJudge ? (
            <>
              <p style={{ color: "#fff", fontSize: 15, fontWeight: 700, margin: 0 }}>Everyone's in the room — start when ready.</p>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, margin: 0, maxWidth: 320 }}>
                Cameras and mics stay off for everyone until you press start.
              </p>
              <Button onClick={startCompetitionFromRoom} style={{ background: GOLD, color: G, fontWeight: 800 }}>
                <Play size={16} className="mr-1.5" /> Start Competition
              </Button>
            </>
          ) : (
            <>
              <Loader2 className="animate-spin" color={GOLD} size={22} />
              <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: 0 }}>Waiting for the admin to start the competition…</p>
            </>
          )}
        </div>
      )}

      {isJudge && competitionLive && !participant && (
        <div style={{ background: "rgba(201,168,76,0.12)", borderBottom: "1px solid rgba(201,168,76,0.3)", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span style={{ color: GOLD, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
            <Users size={14} /> No student called yet — you're live for everyone waiting. Do your introduction, then call the first student.
          </span>
          <Button size="sm" onClick={() => setRosterOpen(true)} style={{ background: GOLD, color: G, fontWeight: 700 }}>
            <PhoneCall size={13} className="mr-1" /> Call a student
          </Button>
        </div>
      )}
      {!isJudge && competitionLive && !participant && (
        <div style={{ background: "rgba(96,165,250,0.1)", borderBottom: "1px solid rgba(96,165,250,0.25)", padding: "8px 16px", color: BLUE, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          <Users size={14} /> Waiting for the admin to call the next participant — you'll see it here live, no need to refresh.
        </div>
      )}
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

      {competitionLive && (
      <>
      {/* ── Control strip (Section 13) ──────────────────────────────
          Kept to two buttons for the judge mid-turn: Error and Stop both
          fire a full-screen colour+icon flash (yellow lightning / red
          hand) to everyone in the room via sendSignal(), purely to get
          attention. Neither one ends or finalizes the turn by itself —
          finalizing still only happens automatically once every stage is
          complete (see the autoPromptedFor effect above):
            - Error also still opens the log dialog below, so the judge
              can record what happened for the record.
            - Stop (handleStop) additionally freezes the countdown clock
              immediately and pre-loads it with the next stage's duration,
              ready to go once that stage actually starts. It does NOT
              change participant.status or advance the stage itself.
          nowrap + overflow-x so they always sit on one line on mobile
          instead of wrapping to a second row. */}
      <div style={{ display: "flex", gap: 8, padding: "0 16px 12px", flexWrap: "nowrap", overflowX: "auto" }}>
        <Button size="sm" variant="outline" onClick={() => { sendSignal("error"); setErrorOpen(true); }} style={{ flexShrink: 0, background: "rgba(255,255,255,0.04)", color: "#FBBF24", borderColor: "rgba(251,191,36,0.4)" }}>
          <AlertTriangle size={14} className="mr-1" /> Error
        </Button>
        {isJudge && participant?.status === "called" && (
          <Button size="sm" onClick={startExamination} style={{ flexShrink: 0, background: GREEN, color: "#06301a", fontWeight: 700 }}>
            <Play size={14} className="mr-1" /> Start Examination
          </Button>
        )}
        {isJudge && isPaused && (
          <Button size="sm" onClick={resumeExamination} style={{ flexShrink: 0, background: GREEN, color: "#06301a", fontWeight: 700 }}>
            <Play size={14} className="mr-1" /> Resume
          </Button>
        )}
        {isJudge && ["in_progress", "paused"].includes(participant?.status) && (
          <Button size="sm" onClick={handleStop} style={{ flexShrink: 0, background: RED, color: "#fff", fontWeight: 700, marginLeft: "auto" }}>
            <Square size={14} className="mr-1" /> Stop
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
                  {stageQuestions.map((q, stageIndex) => {
                    const a = answers.find(x => x.question_id === q.id);
                    const status = a ? a.status : "not_asked";
                    const isCurrent = participant?.current_question_id === q.id;
                    // Judges are view-only on the tile grid now — they see the
                    // same progress everyone else does but can't tap a number
                    // for the participant. Only the participant on stage picks
                    // their own tile.
                    const canAct = isOnStage;
                    // Taken if THIS participant already has an answer for it,
                    // OR any other participant already used it earlier in the
                    // competition (usedQuestionIds is event-wide) — a question
                    // only ever gets asked once across everybody, stage by
                    // stage, so it must show grey for every later participant
                    // too, not just reset back to available for them.
                    const taken = status !== "not_asked" || usedQuestionIds.has(q.id);
                    return (
                      <button
                        key={q.id}
                        disabled={!canAct || taken || participant?.status !== "in_progress" || (!!currentAnswer && !isCurrent)}
                        onClick={() => (canAct ? selfAskQuestion(q) : undefined)}
                        title={taken ? "Already picked" : isJudge ? "View only — the participant picks their own number" : "Tap to reveal your question"}
                        style={{
                          width: 34, height: 34, borderRadius: 8, border: isCurrent ? `2px solid ${BLUE}` : "1px solid rgba(255,255,255,0.15)",
                          background: taken ? TAKEN_GREY : QSTATUS_COLORS[status],
                          color: taken ? "rgba(255,255,255,0.5)" : status === "not_asked" ? "rgba(255,255,255,0.6)" : "#06131f",
                          fontWeight: 800, fontSize: 12, cursor: canAct && !taken ? "pointer" : "default", opacity: canAct ? 1 : 0.7,
                        }}
                      >
                        {stageIndex + 1}
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
              const canAct = isOnStage;
              const taken = status !== "not_asked" || usedQuestionIds.has(q.id);
              return (
                <button
                  key={q.id}
                  disabled={!canAct || taken || participant?.status !== "in_progress" || (!!currentAnswer && !isCurrent)}
                  onClick={() => (canAct ? selfAskQuestion(q) : undefined)}
                  title={taken ? "Already picked" : isJudge ? "View only — the participant picks their own number" : "Tap to reveal your question"}
                  style={{
                    width: 34, height: 34, borderRadius: 8, border: isCurrent ? `2px solid ${BLUE}` : "1px solid rgba(255,255,255,0.15)",
                    background: taken ? TAKEN_GREY : QSTATUS_COLORS[status],
                    color: taken ? "rgba(255,255,255,0.5)" : status === "not_asked" ? "rgba(255,255,255,0.6)" : "#06131f",
                    fontWeight: 800, fontSize: 12, cursor: canAct && !taken ? "pointer" : "default", opacity: canAct ? 1 : 0.7,
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
          // is picked, so the reveal replays for each question instead of
          // only playing once on the very first pick.
          <div key={currentQuestion.id}>
            {!revealedQuestion ? (
              <div className="gm-reveal-number" style={{ minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 14, background: `linear-gradient(135deg, ${GOLD}, #a9863a)`, boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}>
                <span style={{ fontSize: 48, fontWeight: 900, color: "#06131f" }}>{currentQuestionNumber}</span>
              </div>
            ) : (
              <div className="gm-reveal-question" style={{ background: GM, border: "1px solid rgba(201,168,76,0.25)", borderRadius: 14, padding: 18 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
                  <Badge variant="secondary">{labelize(currentQuestion.category)}</Badge>
                  <Badge style={{ background: "rgba(201,168,76,0.15)", color: GOLD, border: "none" }}>{currentQuestion.marks} marks</Badge>
                  <Badge variant="outline" style={{ color: "#fff", borderColor: "rgba(255,255,255,0.25)" }}>{labelize(currentQuestion.difficulty)}</Badge>
                  {/* ── Per-question timer (Section 4/5) ─────────────────
                      Sits idle right after reveal — the judge reads the
                      question aloud, then taps Start Timer, which is the
                      participant's actual cue to begin answering. */}
                  {questionTimeLeft !== null && (
                    <Badge
                      style={{
                        marginLeft: "auto", fontFamily: "monospace", fontWeight: 800,
                        background: questionTimeLeft <= 3 ? "rgba(248,113,113,0.2)" : "rgba(255,255,255,0.08)",
                        color: questionTimeLeft <= 3 ? RED : "#fff", border: "none",
                      }}
                    >
                      <Clock size={12} className="mr-1" /> {questionTimeLeft}s
                    </Badge>
                  )}
                </div>
                <p style={{ color: "#fff", fontSize: 17, fontWeight: 600, margin: "0 0 8px" }}>{currentQuestion.question_text}</p>
                {currentQuestion.question_text_ar && <p dir="rtl" style={{ color: "rgba(255,255,255,0.85)", fontSize: 20, lineHeight: 1.9, margin: "0 0 10px", fontFamily: "'Amiri', 'Noto Naskh Arabic', serif" }}>{currentQuestion.question_text_ar}</p>}
                {isJudge && currentQuestion.expected_answer && (
                  <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, background: "rgba(0,0,0,0.2)", padding: 8, borderRadius: 8 }}>
                    Expected: {currentQuestion.expected_answer}
                  </p>
                )}

                {isJudge && !questionTimerActive && (questionTimeLeft ?? 0) > 0 && (
                  <Button onClick={startQuestionTimer} style={{ marginTop: 12, background: BLUE, color: "#06131f", fontWeight: 700 }}>
                    <Play size={14} className="mr-1" /> Start Timer
                  </Button>
                )}
                {!isJudge && !questionTimerActive && (questionTimeLeft ?? 0) > 0 && (
                  <p style={{ marginTop: 12, color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Waiting for the judge to start the timer…</p>
                )}
                {questionTimeLeft === 0 && (
                  <p style={{ marginTop: 12, color: RED, fontSize: 13, fontWeight: 700 }}>⏱ Time's up!</p>
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
                      <Button variant="outline" onClick={skipQuestion} style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.6)", borderColor: "rgba(255,255,255,0.2)" }}>
                        <SkipForward size={14} className="mr-1" /> Skip
                      </Button>
                    </div>
                  </div>
                )}
                {/* Score recorded — tiles stay hidden until the judge taps
                    Next, which is what actually advances to the next
                    stage's tile grid (see advanceAfterMark above). */}
                {isJudge && !currentAnswer && (
                  <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 16 }}>
                    <Button onClick={advanceAfterMark} style={{ background: GOLD, color: "#06131f", fontWeight: 700 }}>
                      <SkipForward size={14} className="mr-1" /> Next
                    </Button>
                  </div>
                )}
                {!isJudge && !currentAnswer && (
                  <p style={{ marginTop: 12, color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Waiting for the judge to move on…</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ background: GM, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 24, textAlign: "center" }}>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
              {isJudge && participant?.status === "in_progress" ? "Waiting for the participant to pick their number."
                : isJudge ? "Start the examination to begin."
                : isOnStage && participant?.status === "in_progress" ? "Tap a tile above to reveal your question."
                : isOnStage ? "Waiting for the judge to start your examination…"
                : participant ? `Watching ${participant.participant_name} — waiting for their next question…`
                : "Waiting for the judge to call the next participant…"}
            </p>
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
      </>
      )}

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
          <ScrollArea style={{ height: isJudge ? "calc(100vh - 128px)" : "calc(100vh - 64px)" }}>
            <div style={{ padding: "4px 12px 16px", display: "grid", gap: 6 }}>
              {roster.length === 0 && (
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textAlign: "center", padding: 24 }}>No participants yet.</p>
              )}
              {roster.map(p => {
                const isCurrent = p.id === participant?.id;
                const isMe = p.id === myParticipant?.id;
                const micOn = p.mic_on ?? false;
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
          {/* Ends the whole event, not just one participant — kept at the
              bottom, separated from the roster list, since it's the most
              consequential action in this drawer. End Turn sits above it:
              same finalize dialog Stop used to open, now reachable here
              instead, for cutting the on-stage participant's turn short
              manually (disqualification, early stop, etc.) instead of
              only ever finalizing automatically once every stage is done.
              Stacked full-width (not side by side) — the drawer is only
              300px wide, and "Finalize Competition" alongside "End Turn"
              in a flex row had no room to fit: each button defaults to a
              min-width based on its own content, so the row simply grew
              past the drawer's edge and the label ran off-screen instead
              of wrapping or shrinking. Full-width stacked rows have no
              such squeeze. */}
          {isJudge && (
            <div style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: 8 }}>
              {["in_progress", "paused"].includes(participant?.status) && (
                <Button onClick={() => { setRosterOpen(false); setFinalizeOpen(true); }} variant="outline" style={{ width: "100%", borderColor: "rgba(248,113,113,0.4)", color: RED, fontWeight: 700 }}>
                  <Square size={15} className="mr-1.5" /> End Turn
                </Button>
              )}
              <Button onClick={() => setFinalizeEventOpen(true)} style={{ width: "100%", background: GOLD, color: G, fontWeight: 800 }}>
                <Trophy size={15} className="mr-1.5" /> Finalize Competition
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Finalize whole competition dialog ─────────────────────── */}
      <Dialog open={finalizeEventOpen} onOpenChange={setFinalizeEventOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Finalize the whole competition?</DialogTitle></DialogHeader>
          <p style={{ color: "#6b7280", fontSize: 13 }}>
            This ends the competition for everyone, locks all scores, and publishes the results and leaderboard to participants. This can't be undone from here.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalizeEventOpen(false)}>Cancel</Button>
            <Button onClick={finalizeEvent} disabled={finalizingEvent} style={{ background: GOLD, color: G, fontWeight: 700 }}>
              {finalizingEvent ? <Loader2 size={14} className="animate-spin mr-1" /> : <Trophy size={14} className="mr-1" />} Finalize & View Results
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Live timer settings dialog ────────────────────────────── */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Timer settings</DialogTitle></DialogHeader>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Per-question time limit (seconds)</label>
            <Input
              key={event?.question_time_seconds}
              ref={questionTimeInputRef}
              type="number" min={5}
              defaultValue={event?.question_time_seconds ?? 60}
              onKeyDown={e => { if (e.key === "Enter") saveTimerSettings(Number(questionTimeInputRef.current?.value)); }}
            />
            <p style={{ color: "#6b7280", fontSize: 12, margin: 0 }}>
              How long a participant has to answer once you start their question timer. Takes effect on the next question started — it doesn't change a timer already running.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
            <Button
              disabled={savingSettings}
              onClick={() => saveTimerSettings(Number(questionTimeInputRef.current?.value))}
              style={{ background: GOLD, color: G, fontWeight: 700 }}
            >
              {savingSettings ? <Loader2 size={14} className="animate-spin mr-1" /> : <TimerReset size={14} className="mr-1" />} Save
            </Button>
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
                <SelectItem value="recitation_mistake">Participant made a mistake</SelectItem>
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

/* ── Video stage: only the judge and whoever is actually on stage are ever
   shown — everyone else who has joined but not been called is a pure
   spectator and should not appear as a tile to anyone (Section 2 of the
   fix request). Previously every remote participant who happened to be
   publishing was rendered, which is what let an uncalled student's camera
   show up alongside the admin's. `layout` controls arrangement only:
   "grid" (side by side), or a spotlight on one side with the other as a
   small corner tile. ─────────────────────────────────────────────────── */
type StageLayout = "grid" | "spotlight_stage" | "spotlight_admin";
function VideoStage({ canPublish, onStageUserId, layout = "grid" }: { canPublish: boolean; onStageUserId?: string; layout?: StageLayout }) {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants   = useRemoteParticipants();

  const metaOf = (p: any) => {
    try { return p.metadata ? JSON.parse(p.metadata) : {}; } catch { return {}; }
  };
  const localMeta = metaOf(localParticipant);
  const isLocalOnStage = !!onStageUserId && localMeta.user_id === onStageUserId;
  const isLocalJudge = localMeta.role === "judge";

  const allTiles = [
    ...(canPublish ? [{ p: localParticipant, label: "You", mirror: true, isLocal: true, isJudgeTile: isLocalJudge, isOnStagePerson: isLocalOnStage }] : []),
    ...remoteParticipants.map(p => {
      const meta = metaOf(p);
      const isOnStagePerson = !!onStageUserId && meta.user_id === onStageUserId;
      const isJudgeTile = meta.role === "judge";
      return { p, label: p.name || (isJudgeTile ? "Judge" : "Participant"), mirror: false, isLocal: false, isJudgeTile, isOnStagePerson };
    }),
  ];

  // Only the judge tile(s) and the one on-stage participant's tile ever
  // render — every other spectator is filtered out here, regardless of
  // whether they happen to be publishing.
  const tiles = allTiles.filter(t => t.isJudgeTile || t.isOnStagePerson);

  if (tiles.length === 0) {
    return <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Waiting for video…</div>;
  }

  if (layout !== "grid" && tiles.length === 2) {
    const wantJudgeBig = layout === "spotlight_admin";
    const big = tiles.find(t => (wantJudgeBig ? t.isJudgeTile : t.isOnStagePerson)) ?? tiles[0];
    const small = tiles.find(t => t !== big) ?? tiles[1];
    return (
      <div style={{ position: "relative", height: "100%", background: "#000" }}>
        <div style={{ position: "absolute", inset: 0 }}>
          <ParticipantTile participant={big.p} label={big.label} mirror={big.mirror} highlight={!!big.isOnStagePerson} />
        </div>
        {/* aspectRatio was 4/3 (landscape) against a portrait phone-camera
            stream, which cropped the corner tile hard. 3/4 matches the
            source better. */}
        <div style={{ position: "absolute", bottom: 10, right: 10, width: "28%", maxWidth: 140, aspectRatio: "3/4", borderRadius: 8, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>
          <ParticipantTile participant={small.p} label={small.label} mirror={small.mirror} highlight={!!small.isOnStagePerson} />
        </div>
      </div>
    );
  }

  // Stacked as rows, not side-by-side columns: the surrounding box is now
  // sized portrait (see the video area's aspectRatio:"3/4" above) to match
  // a phone's front-camera stream, so splitting it into side-by-side
  // columns would squeeze each tile into an unnaturally narrow strip and
  // crop even more aggressively than before. Stacking keeps each tile's
  // full width, which stays much closer to that portrait source ratio.
  const rows = tiles.length <= 1 ? 1 : 2;
  return (
    <div style={{ display: "grid", gridTemplateRows: `repeat(${rows}, 1fr)`, gap: 4, height: "100%", background: "#000" }}>
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
          style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000", transform: mirror ? "scaleX(-1)" : "none" }}
        />
      ) : (
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Camera off</div>
      )}
      <span style={{ position: "absolute", bottom: 6, left: 8, color: "#fff", fontSize: 11, background: "rgba(0,0,0,0.5)", padding: "2px 8px", borderRadius: 10 }}>{label}</span>
    </div>
  );
}

/* ── Mic/camera toggle — icon-only floating buttons that sit inside the
   video box itself (bottom-left corner) instead of a row underneath it, so
   they're quick to tap without taking up page real estate. Mirrors the
   toggle into the DB's camera_on/mic_on columns too, purely so the admin's
   participant list/queue view can show accurate live status badges. ───── */
function MediaControls({ videoAllowed, videoOn, micAllowed, participantId }: { videoAllowed: boolean; videoOn: boolean; micAllowed: boolean; participantId?: string | null }) {
  const { localParticipant } = useLocalParticipant();
  // Both start false — camera and mic are off by default until the person
  // taps to enable them (see videoOn/micAllowed callers above).
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);

  // videoAllowed is purely the admin's permission gate (can this person use
  // video at all) — it should only ever be able to force the camera OFF,
  // never turn it on by itself. videoOn is the actual current on/off state.
  useEffect(() => {
    if (!videoAllowed) { setCamOn(false); localParticipant.setCameraEnabled(false); return; }
    setCamOn(videoOn);
    localParticipant.setCameraEnabled(videoOn);
  }, [videoAllowed, videoOn]); // eslint-disable-line react-hooks/exhaustive-deps
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

  const iconBtn = (active: boolean, disabled?: boolean) => ({
    width: 34, height: 34, borderRadius: "50%" as const, display: "flex", alignItems: "center", justifyContent: "center",
    border: "none", cursor: disabled ? "default" : "pointer",
    background: disabled ? "rgba(255,255,255,0.15)" : active ? "rgba(255,255,255,0.18)" : RED,
    color: disabled ? "rgba(255,255,255,0.4)" : "#fff",
    backdropFilter: "blur(4px)",
  });

  return (
    <div style={{ position: "absolute", bottom: 10, left: 10, display: "flex", gap: 8, zIndex: 5 }}>
      <button onClick={toggleMic} aria-label={micOn ? "Mute" : "Unmute"} style={iconBtn(micOn)}>
        {micOn ? <Mic size={16} /> : <MicOff size={16} />}
      </button>
      <button onClick={toggleCam} disabled={!videoAllowed} aria-label={camOn ? "Turn camera off" : "Turn camera on"} style={iconBtn(camOn, !videoAllowed)}>
        {camOn ? <Video size={16} /> : <VideoOff size={16} />}
      </button>
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
