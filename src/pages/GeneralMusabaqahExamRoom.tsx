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
  ArrowLeft, ArrowRight, Users, Clock, ScrollText, Menu, PhoneCall,
  TimerReset, Square, Trophy,
  Zap, Hand, Settings, MessageCircle, Send,
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

// videoCaptureDefaults forces the browser to actually request a portrait
// camera stream and the front-facing lens, so the feed isn't landscape
// regardless of how the phone is held. A previous version of this asked
// for a tight 9:16 (480x854) ratio, which on most Android front cameras
// isn't a native sensor mode — the driver satisfies it by digitally
// cropping the sensor's wider natural field of view down to that narrow
// strip, which is what showed up as an extreme, chest-and-forehead-cutting
// zoom on the self-view. 3:4 (480x640) is a gentler portrait ratio that
// most front cameras support natively without cropping in, so more of the
// person (face down to chest) stays in frame while still being portrait
// rather than landscape.
const LK_OPTIONS = {
  dynacast: true,
  adaptiveStream: true,
  publishDefaults: { dtx: true, red: true },
  videoCaptureDefaults: {
    resolution: { width: 480, height: 640, frameRate: 24 },
    facingMode: "user" as const,
  },
};

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
  // Imperative bridge into whatever LiveKit local participant is currently
  // connected, so code outside the LiveKitRoom tree (the roster drawer's own
  // mic toggle) can flip the real mic the instant someone taps it, rather
  // than only writing the DB flag and waiting for it to echo back through
  // realtime. Populated by <MicBridge> below whenever the room is connected.
  const localMicControlRef = useRef<((on: boolean) => void) | null>(null);

  // Who's actually got a live connection to this room right now (browser
  // tab open, realtime channel joined) — independent of exam status like
  // "waiting"/"admitted"/"called". Tracked via Supabase Presence on the
  // same gm-exam-{eventId} channel below; drives the green online dot in
  // the Participants drawer.
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  // Room-wide text chat — separate drawer from Participants. Loaded once
  // in loadAll(), then kept live via a postgres_changes INSERT listener on
  // the same gm-exam-{eventId} channel (see below). unreadChat only counts
  // up while the drawer is closed, so people get a badge instead of
  // needing to keep it open.
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatOpenRef = useRef(false);
  useEffect(() => { chatOpenRef.current = chatOpen; if (chatOpen) setUnreadChat(0); }, [chatOpen]);
  // Auto-scroll to the newest message whenever the drawer is open and the
  // list grows.
  useEffect(() => {
    if (!chatOpen) return;
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight });
  }, [chatOpen, chatMessages.length]);

  const [scoreDraft, setScoreDraft] = useState({ score: "", correctness: "correct", comment: "" });
  const [savingScore, setSavingScore] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [localTimer, setLocalTimer] = useState<number | null>(null);

  // Video layout — which tiles are shown and how they're arranged. Only
  // the judge and whoever is on stage are ever eligible tiles now (see
  // VideoStage); this just controls arrangement, not who's included.

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

  const loadChatMessages = useCallback(async () => {
    if (!eventId) return;
    const { data } = await supabase.from("general_musabaqah_chat_messages").select("*").eq("event_id", eventId).order("created_at").limit(200);
    setChatMessages(data || []);
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
    await loadChatMessages();
    setLoading(false);
  }, [loadEvent, loadParticipant, loadQuestions, loadStages, loadAnswers, loadUsedQuestions, loadQueueCounts, loadRoster, loadChatMessages]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Realtime: event (who's current) + this participant's row + answers.
  useEffect(() => {
    if (!eventId) return;
    const ch = supabase.channel(`gm-exam-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "general_musabaqah_events", filter: `id=eq.${eventId}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "general_musabaqah_participants", filter: `event_id=eq.${eventId}` }, () => loadAll())
      // Chat: append new messages live instead of a full loadAll() reload
      // (which would also needlessly re-fetch the last 200 messages on
      // every keystroke-worth of chat activity). Dedup by id in case the
      // sender's own optimistic path and the realtime echo both land.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "general_musabaqah_chat_messages", filter: `event_id=eq.${eventId}` }, (payload: any) => {
        const row = payload?.new;
        if (!row) return;
        setChatMessages(prev => prev.some(m => m.id === row.id) ? prev : [...prev, row]);
        if (!chatOpenRef.current) setUnreadChat(n => n + 1);
      })
      // Ephemeral Error/Stop flash — see activeSignal above. Broadcast (not
      // a DB table) since it's a live "everyone look now" cue, not state
      // that needs to persist or survive a refresh.
      .on("broadcast", { event: "gm_signal" }, ({ payload }: any) => {
        if (payload?.kind !== "error" && payload?.kind !== "stop") return;
        setActiveSignal({ kind: payload.kind, id: Date.now() });
      })
      // Presence: every client that has this room open tracks itself under
      // its own user id. "sync" fires with the full current set whenever
      // anyone joins/leaves, so onlineIds just gets rebuilt from that —
      // no manual add/remove bookkeeping needed.
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        const ids = new Set<string>(
          Object.values(state).flat().map((m: any) => m.user_id).filter(Boolean)
        );
        setOnlineIds(ids);
      })
      .subscribe(async (status: string) => {
        if (status === "SUBSCRIBED" && user?.id) {
          await ch.track({ user_id: user.id, online_at: new Date().toISOString() });
        }
      });
    gmChannelRef.current = ch;
    return () => { supabase.removeChannel(ch); gmChannelRef.current = null; };
  }, [eventId, loadAll, user?.id]);

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

  // Mic toggle from the drawer. Anyone who's joined the room (not just
  // whoever is on stage) can publish audio now — see musabaqah-livekit-
  // token, which grants a publish token to any non-finished participant so
  // people can chat, not only perform their turn. This flips the same
  // mic_on flag the in-room MediaControls button uses. Every participant
  // can do this for themselves; the judge can also mute/unmute anyone
  // remotely for moderation.
  const toggleRosterMic = async (p: any) => {
    const next = !(p.mic_on ?? false);
    const isSelf = p.id === myParticipant?.id;
    // Flip the actual LiveKit mic immediately instead of waiting on the DB
    // round-trip through realtime — that round-trip still happens (below)
    // and is what makes this reach the *other* side (a remote student the
    // judge just muted), but for your own row it used to only update the
    // roster badge and rely on the echo coming back before your mic really
    // changed, which could lag or silently miss if realtime hiccuped. This
    // is exactly the "I toggled it myself and it didn't actually work" gap.
    if (isSelf) localMicControlRef.current?.(next);
    const { error } = await supabase.from("general_musabaqah_participants").update({ mic_on: next }).eq("id", p.id);
    if (error) {
      if (isSelf) localMicControlRef.current?.(!next); // revert the instant local change
      toast({ title: "Could not update mic", description: error.message, variant: "destructive" });
      return;
    }
    setRoster(r => r.map(x => x.id === p.id ? { ...x, mic_on: next } : x));
    if (isSelf) toast({ title: next ? "Mic on" : "Mic off" });
  };

  const sendChatMessage = async () => {
    const text = chatInput.trim();
    if (!text || !eventId || !user?.id || sendingChat) return;
    setSendingChat(true);
    const senderName = isJudge ? "Judge" : (myParticipant?.participant_name || "Participant");
    const { error } = await supabase.from("general_musabaqah_chat_messages").insert({
      event_id: eventId, sender_id: user.id, sender_name: senderName, sender_role: isJudge ? "judge" : "participant", message: text,
    });
    setSendingChat(false);
    if (error) { toast({ title: "Message failed", description: error.message, variant: "destructive" }); return; }
    setChatInput("");
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

  // Ends the whole competition (not just whoever is on stage). This used to
  // publish results and boot everyone out of the room in the same instant —
  // no ceremony, no announcement, just a redirect. Now it instead opens the
  // in-room results announcement (event.status = "revealing"): everyone
  // stays in the room and watches positions get called out one at a time,
  // last place first, building up to the winner. Only endCeremony() below
  // (after the winner is revealed) actually publishes results and moves
  // everyone on.
  const finalizeEvent = async () => {
    if (!eventId || !isJudge) return;
    setFinalizingEvent(true);

    // Sweep up any participant the judge never explicitly finalized —
    // otherwise their status stays stuck and they never see their result
    // even after the event is published.
    const { data: stragglers } = await supabase
      .from("general_musabaqah_participants")
      .select("id, registration_id")
      .eq("event_id", eventId)
      .not("status", "in", "(finalized,completed,disqualified,no_show)");

    if (stragglers && stragglers.length > 0) {
      await supabase.from("general_musabaqah_participants")
        .update({ status: "finalized" })
        .in("id", stragglers.map(s => s.id));
      await supabase.from("general_musabaqah_registrations")
        .update({ status: "completed" })
        .in("id", stragglers.map(s => s.registration_id));
    }

    const { error } = await supabase.from("general_musabaqah_events").update({
      status: "revealing", reveal_index: 0, current_participant_id: null,
    }).eq("id", eventId);
    setFinalizingEvent(false);
    if (error) { toast({ title: "Could not start the results announcement", description: error.message, variant: "destructive" }); return; }
    await logEvent("results_ceremony_started", "Judge began the results announcement");
    setFinalizeEventOpen(false);
    setRosterOpen(false);
    toast({ title: "Announcing results…" });
    // No navigate here on purpose — everyone (judge + students) transitions
    // into the ceremony view in place via the realtime event-row update.
  };

  // Ranking for the results ceremony — everyone who actually finished,
  // best score first. Recomputed from the same roster the Participants
  // drawer already keeps live, so it updates the instant a straggler above
  // gets swept into "finalized".
  const rankedParticipants = useMemo(() => (
    roster
      .filter(p => ["completed", "finalized"].includes(p.status))
      .slice()
      .sort((a, b) => Number(b.total_score ?? 0) - Number(a.total_score ?? 0))
  ), [roster]);

  const showCeremony = event?.status === "revealing";
  const ceremonyRevealIndex = Math.min(event?.reveal_index ?? 0, Math.max(rankedParticipants.length - 1, 0));
  const ceremonyWinnerRevealed = rankedParticipants.length > 0 && ceremonyRevealIndex >= rankedParticipants.length - 1;

  // Advances the ceremony to the next (better) position. Writing to the
  // event row is all that's needed — every connected client (judge and
  // every student) is already subscribed to it, so they all advance in
  // lockstep off the same realtime update.
  const revealNextPosition = async () => {
    if (!isJudge || !eventId) return;
    const next = Math.min((event?.reveal_index ?? -1) + 1, Math.max(rankedParticipants.length - 1, 0));
    await supabase.from("general_musabaqah_events").update({ reveal_index: next }).eq("id", eventId);
  };

  // The real finish line: only after the winner has been announced does this
  // actually publish results and let everyone move on to their own result /
  // the leaderboard.
  const endCeremony = async () => {
    if (!eventId || !isJudge) return;
    setFinalizingEvent(true);
    const { error } = await supabase.from("general_musabaqah_events").update({
      status: "completed", results_visibility: "published", leaderboard_enabled: true,
    }).eq("id", eventId);
    setFinalizingEvent(false);
    if (error) { toast({ title: "Could not conclude the competition", description: error.message, variant: "destructive" }); return; }
    await logEvent("event_finalized", "Competition finalized by admin — results published");
    toast({ title: "Competition concluded — results published" });
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

  // NEW: unlike saveTimerSettings above (which only sets the template for
  // whichever question starts *next*), this pushes a new value straight
  // onto the clock that's actually running right now, for whoever is
  // on stage — this is the "change it live, not just from the overview
  // screen" behaviour.
  const applyCurrentTimerNow = async (seconds: number) => {
    if (!participant?.id || !Number.isFinite(seconds) || seconds < 0) return;
    setSavingSettings(true);
    setLocalTimer(seconds);
    setTimerFrozen(false);
    const { error } = await supabase.from("general_musabaqah_participants").update({ timer_remaining_seconds: seconds }).eq("id", participant.id);
    setSavingSettings(false);
    if (error) { toast({ title: "Could not update the running timer", description: error.message, variant: "destructive" }); return; }
    await logEvent("timer_adjusted", `Judge set the live timer to ${seconds}s`);
    toast({ title: `Timer set to ${seconds}s` });
  };

  // "Refresh timer" — resets the clock straight back to its full configured
  // duration and clears any stuck/frozen state, so a judge can restart it
  // from a clean slate mid-class if something glitched (a missed Stop, a
  // dropped connection, a timer that never started). Available any time the
  // competition is live, not only from the pre-class overview settings.
  const refreshCurrentTimer = async () => {
    if (!participant?.id) return;
    const limit = stageProgress?.activeStage?.time_limit_seconds ?? event?.max_exam_time_seconds ?? 900;
    setLocalTimer(limit);
    setTimerFrozen(false);
    setQuestionTimerActive(false);
    if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    const { error } = await supabase.from("general_musabaqah_participants").update({ timer_remaining_seconds: limit, question_timer_started_at: null }).eq("id", participant.id);
    if (error) { toast({ title: "Could not refresh timer", description: error.message, variant: "destructive" }); return; }
    await logEvent("timer_refreshed", "Judge refreshed the timer to start it again");
    toast({ title: "Timer refreshed" });
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

  // Anyone who's joined the room and hasn't finished their turn can
  // publish audio (not just the judge and whoever's on stage) — the room
  // doubles as a general chat, so participants can unmute themselves to
  // talk even when it isn't their turn. musabaqah-livekit-token grants the
  // matching publish token server-side for the same set of people.
  const canChat = !isJudge && !!myParticipant && !["completed", "finalized"].includes(myParticipant.status);
  const canPublish = isJudge || isOnStage || canChat;
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
    <div style={{ height: "100dvh", background: `linear-gradient(160deg, ${G} 0%, #0a1f12 60%, #050f09 100%)`, display: "flex", flexDirection: "column", fontFamily: "'Cairo', sans-serif", overflow: "hidden" }}>
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
        /* Two-camera video stage: always a side-by-side split (two equal
           columns), on both mobile and desktop. This used to flip to
           stacked rows on desktop, which is what read as "desktop isn't
           splitting the screen into two" — the split was technically still
           happening, just top/bottom inside an already-narrow half-width
           pane, so it rarely looked like two clear boxes. Side-by-side
           columns everywhere keeps the two tiles unambiguous, and also
           gives left/right slots that can be swapped (see gm-video-grid
           order below). */
        .gm-video-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr;
          gap: 3px;
          width: 100%;
          height: 100%;
        }
        /* Full-screen camera/question split. Mobile: stacked halves, camera
           on top. Desktop: side-by-side halves, camera on the left,
           question on the right (order follows DOM order — video pane
           markup comes first — so no explicit left/right rule is needed,
           just a direction flip). Root page height must be a real 100dvh
           (not just min-height) for the 50%/flex-1 math below to resolve
           against an actual bounded height instead of growing forever. */
        .gm-live-split {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
          width: 100%;
        }
        .gm-video-pane {
          position: relative;
          width: 100%;
          height: 50%;
          flex-shrink: 0;
          overflow: hidden;
          background: #000;
        }
        .gm-content-pane {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 50%;
          min-height: 0;
          overflow: hidden;
        }
        @media (min-width: 768px) {
          .gm-live-split {
            flex-direction: row;
          }
          .gm-video-pane, .gm-content-pane {
            width: 50%;
            height: 100%;
          }
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
            {activeSignal.kind === "error" ? "MISTAKE" : "STOP"}
          </span>
        </div>
      )}
      {/* ── Fixed top: header + (when live) video area, pinned together as
          one sticky unit so neither scrolls out of view — only the question/
          judging panel below them scrolls. ─────────────────────────────── */}
      <div style={{ position: "sticky", top: 0, zIndex: 25, background: G }}>
      {/* Header text rows still cap at 720px so long labels don't stretch
          into unreadable full-bleed lines on a wide desktop window — but
          the video area below breaks out of that cap on purpose (see its
          own comment) since two side-by-side cameras should actually use
          the screen's width, not sit narrow in a centered column. */}
      <div style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
      {/* Row 1 — kept to a single, never-wrapping line: back button, event
          title (truncates instead of wrapping), and just "Stage X/Y" (no
          stage name — that used to make this whole header wrap onto 2-3
          lines on narrow phones). Everything else that was here moved down
          to the swipeable strip below. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px 6px", flexWrap: "nowrap", overflow: "hidden" }}>
        <button onClick={() => navigate(isJudge ? `/musabaqah/general/${eventId}` : "/student/musabaqah/general")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", flexShrink: 0 }}>
          <ArrowLeft size={16} />
        </button>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{event?.title}</span>
        {stages.length > 0 && stageProgress && (
          <Badge style={{ background: "rgba(201,168,76,0.15)", color: GOLD, border: "none", flexShrink: 0, whiteSpace: "nowrap" }}>
            {stageProgress.activeStage ? `Stage ${stageProgress.activeIndex + 1}/${stages.length}` : "All stages complete"}
          </Badge>
        )}
      </div>
      {/* Row 2 — everything that used to crowd/wrap row 1: full stage name,
          participant badges, question count, connection status, and the
          icon buttons. One line, horizontally scrollable (swipe left) so
          it never wraps either — same nowrap+overflow-x pattern as the
          Error/Stop control strip further down. */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "0 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexWrap: "nowrap", overflowX: "auto" }}>
        {stages.length > 0 && stageProgress?.activeStage && (
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, flexShrink: 0, whiteSpace: "nowrap" }}>{stageProgress.activeStage.name}</span>
        )}
        <Badge style={{ background: "rgba(96,165,250,0.15)", color: BLUE, border: "none", flexShrink: 0, whiteSpace: "nowrap" }}>{participant?.participant_name}</Badge>
        {!isJudge && (
          <Badge style={{
            flexShrink: 0, whiteSpace: "nowrap",
            ...(isOnStage
              ? { background: "rgba(74,222,128,0.15)", color: "#4ADE80", border: "none" }
              : { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)", border: "none" }),
          }}>
            {isOnStage ? "You're up — go ahead" : "Watching"}
          </Badge>
        )}
        <span style={{ display: "flex", alignItems: "center", gap: 5, color: "rgba(255,255,255,0.6)", fontSize: 12, flexShrink: 0, whiteSpace: "nowrap" }}>
          <ScrollText size={13} />
          {stages.length > 0 && stageProgress?.activeStage
            ? `Q${stageProgress.markedByStage.get(stageProgress.activeStage.id) || 0}/${QUESTIONS_PER_STAGE}`
            : `Q${answers.filter(a => a.status === "marked").length}/${event?.num_questions_per_student}`}
        </span>
        <span style={{ flexShrink: 0 }}><ConnectionBadge status={participant?.connection_status} /></span>
        {isJudge && (
          <button onClick={() => setSettingsOpen(true)} aria-label="Timer settings" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", padding: 2, display: "flex", flexShrink: 0 }}>
            <Settings size={18} />
          </button>
        )}
        <button onClick={() => setChatOpen(true)} aria-label="Chat" style={{ position: "relative", background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", padding: 2, display: "flex", flexShrink: 0 }}>
          <MessageCircle size={18} />
          {unreadChat > 0 && (
            <span style={{ position: "absolute", top: -4, right: -4, minWidth: 14, height: 14, padding: "0 3px", borderRadius: 7, background: GOLD, color: G, fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {unreadChat > 9 ? "9+" : unreadChat}
            </span>
          )}
        </button>
        <button onClick={() => setRosterOpen(true)} aria-label="Participants" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", padding: 2, display: "flex", flexShrink: 0 }}>
          <Menu size={20} />
        </button>
      </div>
      </div>
      </div>

      {/* ── Not started yet (Section 1): nobody's camera/mic connects and
          no questions can be asked until the judge presses this. Everyone
          who has navigated here (called or not) sees this instead of a
          live video feed. Sits here, fully outside the live split below,
          now that camera + question share one gm-live-split unit — it
          can no longer sit between the two panes. ─────────────────────── */}
      {!competitionLive && !showCeremony && event?.status !== "completed" && (
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

      {/* ── Concluded: the judge is auto-navigated away by endCeremony, but
          students stay on this page, so give them a real end state instead
          of leaving them stuck on the old "waiting to start" spinner. ───── */}
      {!competitionLive && !showCeremony && event?.status === "completed" && (
        <div style={{ padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, textAlign: "center" }}>
          <Trophy size={26} color={GOLD} />
          <p style={{ color: "#fff", fontSize: 15, fontWeight: 700, margin: 0 }}>Competition concluded — results are published.</p>
          <Button onClick={() => navigate("/student/musabaqah/general")} style={{ background: GOLD, color: G, fontWeight: 800 }}>
            View Your Result
          </Button>
        </div>
      )}


      {/* ── Results ceremony (Finalize Competition lands here first): stays
          in the room instead of booting everyone straight to a results
          page. The judge calls out positions one at a time, last place
          first, building up to the winner — everyone watches the same
          reveal together via the event row's realtime updates. ─────────── */}
      {showCeremony && (
        <ResultsCeremony
          ranked={rankedParticipants}
          revealIndex={ceremonyRevealIndex}
          isJudge={isJudge}
          onRevealNext={revealNextPosition}
          onEnd={endCeremony}
          ending={finalizingEvent}
          totalMarks={event?.total_marks}
          eventTitle={event?.title}
        />
      )}


      {/* ── Live layout: camera pane + question pane, split so together
          they always fill exactly the rest of the screen below the
          header. Mobile stacks them (camera on top, question below);
          desktop places camera on the left, question on the right — see
          .gm-live-split in the stylesheet above. ───────────────────────── */}
      {competitionLive && (
      <div className="gm-live-split">
      <div className="gm-video-pane">
        {lkError ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: GM, color: RED, fontSize: 13 }}>
            Video unavailable: {lkError}
          </div>
        ) : lkConnected ? (
          <LiveKitRoom
            serverUrl={lkUrl} token={lkToken} connect={lkConnected}
            audio={false} video={false}
            options={LK_OPTIONS}
          >
            <RoomAudioRenderer />
            <MicBridge registerRef={localMicControlRef} />
            {/* Fills the entire gm-video-pane (half the screen — top half on
                mobile, left half on desktop). The grid split direction for
                two on-stage cameras (columns on mobile, rows on desktop)
                lives in VideoStage/.gm-video-grid below. */}
            <div style={{
              position: "relative", width: "100%", height: "100%",
              overflow: "hidden", background: "#000",
            }}>
              <VideoStage canPublish={canPublish} onStageUserId={participant?.user_id} />
              {canPublish && (
                <MediaControls
                  videoAllowed={videoAllowedForMe}
                  videoOn={cameraOnForMe}
                  micAllowed={isJudge ? false : (myParticipant?.mic_on ?? false)}
                  participantId={isJudge ? null : myParticipant?.id}
                />
              )}
              {/* Overall exam clock — draggable so it can be dragged clear
                  of a face/roster button it happens to land on. Starts
                  centered over the video like before; position is local to
                  this viewer only and resets on remount. */}
              <DraggableClock mm={mm} ss={ss} low={localTimer !== null && localTimer < 60} />
            </div>
          </LiveKitRoom>
        ) : (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: GM }}>
            <Loader2 className="animate-spin" color={GOLD} size={24} />
          </div>
        )}
        {isOnStage && !videoAllowedForMe && (
          <p style={{ position: "absolute", left: 8, right: 8, bottom: 8, color: "#FBBF24", fontSize: 11, margin: 0, display: "flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.55)", padding: "4px 8px", borderRadius: 6, zIndex: 6 }}>
            <VideoOff size={13} /> Camera disabled by admin for this turn.
          </p>
        )}
      </div>

      <div className="gm-content-pane">
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

      {/* ── Control strip (Section 13) ──────────────────────────────
          Kept to two buttons for the judge mid-turn: Mistake and Stop both
          fire a full-screen colour+icon flash (yellow lightning / red
          hand) to everyone in the room via sendSignal(), purely to get
          attention. Neither one ends or finalizes the turn by itself —
          finalizing still only happens automatically once every stage is
          complete (see the autoPromptedFor effect above):
            - Mistake (formerly labelled "Error") is NOT a technical fault
              report — it's the judge's live signal to the participant that
              they made a mistake in what they just said, the moment it
              happens, same as a real muhawarah judge would speak up. It
              also still opens the log dialog below so the judge can record
              what the mistake was, for the record.
            - Stop (handleStop) additionally freezes the countdown clock
              immediately and pre-loads it with the next stage's duration,
              ready to go once that stage actually starts. It does NOT
              change participant.status or advance the stage itself.
          Start Timer sits between the two — same button/handler that used
          to live down in the question card, moved up here so the judge
          doesn't have to scroll to it, and so it visually reads as "flag a
          mistake → start the clock → stop" in one line.
          nowrap + overflow-x so they always sit on one line on mobile
          instead of wrapping to a second row. */}
      <div style={{ display: "flex", gap: 8, padding: "12px 16px 12px", flexWrap: "nowrap", overflowX: "auto", flexShrink: 0 }}>
        <Button size="sm" variant="outline" onClick={() => { sendSignal("error"); setErrorOpen(true); }} style={{ flexShrink: 0, background: "rgba(255,255,255,0.04)", color: "#FBBF24", borderColor: "rgba(251,191,36,0.4)" }}>
          <AlertTriangle size={14} className="mr-1" /> Mistake
        </Button>
        {isJudge && currentQuestion && revealedQuestion && !questionTimerActive && (questionTimeLeft ?? 0) > 0 && (
          <Button size="sm" onClick={startQuestionTimer} style={{ flexShrink: 0, background: BLUE, color: "#06131f", fontWeight: 700 }}>
            <Play size={14} className="mr-1" /> Start Timer
          </Button>
        )}
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
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 24px", maxWidth: 720, margin: "0 auto", width: "100%" }}>
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

                {/* Judge's "Start Timer" button now lives in the control
                    strip above (between Error and Stop) instead of here —
                    see Section 13 — so it stays reachable without scrolling
                    down to the question card first. */}
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
                    {/* Score-suggestion presets: each one both sets the
                        correctness tag AND fills in the score box from the
                        question's mark allocation, so marking a clear-cut
                        answer is one tap instead of typing a number. The
                        judge can still edit the score box manually
                        afterward — these are a starting point, not a
                        lock. Replaces the old plain correctness toggle
                        (which didn't touch the score) and drops "skipped"
                        from this row since that's its own Skip button
                        below. */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {([
                        { c: "correct", label: "Correct", fraction: 1 },
                        { c: "partially_correct", label: "Partly Correct", fraction: 0.75 },
                        { c: "partially_incorrect", label: "Partly Incorrect", fraction: 0.25 },
                        { c: "incorrect", label: "Incorrect", fraction: 0 },
                      ] as const).map(({ c, label, fraction }) => (
                        <button key={c} onClick={() => setScoreDraft({ ...scoreDraft, correctness: c, score: String(Math.round(currentQuestion.marks * fraction)) })}
                          style={{
                            padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                            border: scoreDraft.correctness === c ? "1.5px solid " + GOLD : "1px solid rgba(255,255,255,0.2)",
                            background: scoreDraft.correctness === c ? "rgba(201,168,76,0.2)" : "transparent",
                            color: scoreDraft.correctness === c ? GOLD : "rgba(255,255,255,0.6)",
                          }}>
                          {label}
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
      </div>
      </div>
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
          any participant's mic for moderation. Student: sees the same
          list, with a mic toggle on their own row at all times (not just
          while on stage) so the room can be used for general chat. */}
      <Sheet open={rosterOpen} onOpenChange={setRosterOpen}>
        <SheetContent side="right" className="w-[300px] sm:w-[360px]" style={{ background: G, borderLeft: "1px solid rgba(255,255,255,0.08)", padding: 0, display: "flex", flexDirection: "column", height: "100dvh" }}>
          <SheetHeader style={{ padding: "16px 16px 8px", flexShrink: 0 }}>
            <SheetTitle style={{ color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
              <Users size={16} color={GOLD} /> Participants
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.45)", marginLeft: "auto" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: GREEN, flexShrink: 0 }} />
                {onlineIds.size} online
              </span>
              <Badge style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)", border: "none" }}>
                {roster.length}
              </Badge>
            </SheetTitle>
          </SheetHeader>
          {/* flex:1 + minHeight:0 — not a hardcoded calc(100vh - Npx) —
              so this area fills exactly whatever space is left between the
              header and the action bar below, on any screen size. The old
              fixed-height version reserved a huge chunk of the sheet for
              the list regardless of how few participants there were,
              which shoved End Turn / Finalize Competition down past the
              bottom of the visible drawer — clipped on mobile, invisible
              entirely on a laptop where the sheet is shorter relative to
              that hardcoded number. */}
          <ScrollArea style={{ flex: 1, minHeight: 0 }}>
            <div style={{ padding: "4px 12px 16px", display: "grid", gap: 6 }}>
              {roster.length === 0 && (
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textAlign: "center", padding: 24 }}>No participants yet.</p>
              )}
              {roster.map(p => {
                const isCurrent = p.id === participant?.id;
                const isMe = p.id === myParticipant?.id;
                const micOn = p.mic_on ?? false;
                const isOnline = !!p.user_id && onlineIds.has(p.user_id);
                // Anyone (not just whoever's on stage) can publish audio now
                // — see musabaqah-livekit-token, which grants a publish
                // token to any non-finished participant so people can chat.
                // A participant can always control their own mic; the judge
                // can also mute/unmute anyone remotely for moderation.
                const micActionable = isMe || isJudge;
                return (
                  <div key={p.id} style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 10,
                    background: isCurrent ? "rgba(74,222,128,0.08)" : "rgba(255,255,255,0.03)",
                    border: isCurrent ? "1px solid rgba(74,222,128,0.3)" : "1px solid rgba(255,255,255,0.06)",
                  }}>
                    <div style={{ position: "relative", width: 8, height: 8, flexShrink: 0 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: PSTATUS_COLORS[p.status] || "rgba(255,255,255,0.3)" }} />
                      {/* Presence dot — genuinely connected to the room right
                          now (Realtime presence), separate from exam status
                          above (which can say "waiting"/"admitted" etc. even
                          while offline). */}
                      {isOnline && (
                        <div title="Online" style={{ position: "absolute", bottom: -3, right: -3, width: 6, height: 6, borderRadius: "50%", background: GREEN, border: `1.5px solid ${G}` }} />
                      )}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ color: "#fff", fontSize: 13, fontWeight: 600, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.participant_name}{isMe && " (You)"}
                      </p>
                      <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 10.5, margin: 0 }}>{labelize(p.status)}</p>
                    </div>

                    <button
                      onClick={() => micActionable && toggleRosterMic(p)}
                      disabled={!micActionable}
                      title={isMe ? (micOn ? "Mute yourself" : "Unmute yourself") : isJudge ? (micOn ? "Mute" : "Unmute") : "Mic status"}
                      style={{
                        background: "none", border: "none", padding: 6, borderRadius: 8,
                        cursor: micActionable ? "pointer" : "default",
                        opacity: micActionable ? 1 : 0.4,
                        color: micOn ? GREEN : RED,
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
              such squeeze. flexShrink:0 keeps this bar at its natural
              height and pinned right under the scroll area — it's a flex
              sibling now, not something the list's height can push away. */}
          {isJudge && (
            <div style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
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

      {/* ── Chat drawer ──────────────────────────────────────────────
          Room-wide text chat — everyone who's joined (judge + every
          participant, regardless of stage) can read and post. Realtime
          INSERT listener (see the gm-exam-{eventId} channel above) keeps
          this live across every open tab. */}
      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetContent side="right" className="w-[300px] sm:w-[360px]" style={{ background: G, borderLeft: "1px solid rgba(255,255,255,0.08)", padding: 0, display: "flex", flexDirection: "column", height: "100dvh" }}>
          <SheetHeader style={{ padding: "16px 16px 8px", flexShrink: 0 }}>
            <SheetTitle style={{ color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
              <MessageCircle size={16} color={GOLD} /> Chat
            </SheetTitle>
          </SheetHeader>
          <div ref={chatScrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            {chatMessages.length === 0 && (
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textAlign: "center", padding: 24 }}>No messages yet — say something.</p>
            )}
            {chatMessages.map(m => {
              const mine = m.sender_id === user?.id;
              return (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                  <span style={{ fontSize: 10, color: m.sender_role === "judge" ? GOLD : "rgba(255,255,255,0.4)", marginBottom: 2, padding: "0 2px" }}>
                    {mine ? "You" : m.sender_name}{m.sender_role === "judge" && !mine ? " · Judge" : ""}
                  </span>
                  <div style={{
                    maxWidth: "80%", padding: "7px 11px", borderRadius: 12,
                    background: mine ? "rgba(201,168,76,0.18)" : "rgba(255,255,255,0.06)",
                    border: mine ? "1px solid rgba(201,168,76,0.35)" : "1px solid rgba(255,255,255,0.08)",
                    color: "#fff", fontSize: 13, wordBreak: "break-word", whiteSpace: "pre-wrap",
                  }}>
                    {m.message}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
            <Input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
              placeholder="Message the room…"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
            />
            <Button onClick={sendChatMessage} disabled={!chatInput.trim() || sendingChat} style={{ background: GOLD, color: G, flexShrink: 0, padding: "0 12px" }}>
              <Send size={15} />
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Finalize whole competition dialog ─────────────────────── */}
      <Dialog open={finalizeEventOpen} onOpenChange={setFinalizeEventOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Announce results?</DialogTitle></DialogHeader>
          <p style={{ color: "#6b7280", fontSize: 13 }}>
            This locks all scores and starts the results announcement in the room — positions get called out one at a time, last place first, up to the winner. Results only get published once you end it after announcing 1st place.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalizeEventOpen(false)}>Cancel</Button>
            <Button onClick={finalizeEvent} disabled={finalizingEvent} style={{ background: GOLD, color: G, fontWeight: 700 }}>
              {finalizingEvent ? <Loader2 size={14} className="animate-spin mr-1" /> : <Trophy size={14} className="mr-1" />} Finalize & Announce Results
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

      {/* ── Mistake dialog — logs what the judge flagged (default option
          is "Participant made a mistake" since that's the primary use;
          the technical-fault options stay available for the rare case
          this doubles as an actual error report). ─────────────────── */}
      <Dialog open={errorOpen} onOpenChange={setErrorOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Flag a Mistake</DialogTitle></DialogHeader>
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
            <Button onClick={submitError} style={{ background: "#FBBF24", color: "#1a1400" }}><Flag size={14} className="mr-1" /> Log Mistake</Button>
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
   show up alongside the admin's. Every tile that does render is shown at
   equal size, side by side, full height — there used to be a "spotlight"
   option that blew one tile up to fill the whole box and squeezed the
   other into a small corner overlay, which read as if only one camera was
   actually working. An even split makes it obvious both feeds are live. ── */
function VideoStage({ canPublish, onStageUserId }: { canPublish: boolean; onStageUserId?: string }) {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants   = useRemoteParticipants();

  // Which tile sits in the left/first slot — a viewer can tap "Swap sides"
  // on either tile to flip who's left vs right. Purely local to this
  // viewer's screen (not synced), and keyed by userId so it survives
  // re-renders/track updates rather than resetting every time.
  const [leftUserId, setLeftUserId] = useState<string | null>(null);

  const metaOf = (p: any) => {
    try { return p.metadata ? JSON.parse(p.metadata) : {}; } catch { return {}; }
  };
  const localMeta = metaOf(localParticipant);
  const isLocalOnStage = !!onStageUserId && localMeta.user_id === onStageUserId;
  const isLocalJudge = localMeta.role === "judge";

  const allTiles = [
    ...(canPublish ? [{ id: localMeta.user_id || "me", p: localParticipant, label: "You", mirror: true, isLocal: true, isJudgeTile: isLocalJudge, isOnStagePerson: isLocalOnStage }] : []),
    ...remoteParticipants.map(p => {
      const meta = metaOf(p);
      const isOnStagePerson = !!onStageUserId && meta.user_id === onStageUserId;
      const isJudgeTile = meta.role === "judge";
      return { id: meta.user_id || p.sid, p, label: p.name || (isJudgeTile ? "Judge" : "Participant"), mirror: false, isLocal: false, isJudgeTile, isOnStagePerson };
    }),
  ];

  // Only the judge tile(s) and the one on-stage participant's tile ever
  // render — every other spectator is filtered out here, regardless of
  // whether they happen to be publishing.
  let tiles = allTiles.filter(t => t.isJudgeTile || t.isOnStagePerson);

  // Apply the viewer's chosen left/right order, if they've swapped at
  // least once. Falls back to natural order (judge first) otherwise.
  if (leftUserId && tiles.length === 2 && tiles[0].id !== leftUserId) {
    tiles = [tiles[1], tiles[0]];
  }

  if (tiles.length === 0) {
    return <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Waiting for video…</div>;
  }

  if (tiles.length === 1) {
    return (
      <div style={{ position: "relative", width: "100%", height: "100%", background: "#111" }}>
        <ParticipantTile participant={tiles[0].p} label={tiles[0].label} mirror={tiles[0].mirror} highlight={!!tiles[0].isOnStagePerson} />
      </div>
    );
  }

  // Grid split (see .gm-video-grid, defined once in the page's <style>
  // block): always two side-by-side columns, on mobile and desktop alike.
  return (
    <div className="gm-video-grid">
      {tiles.map((t, i) => (
        <div
          key={t.isLocal ? "local" : t.p.sid || i}
          style={{ position: "relative", width: "100%", height: "100%", background: "#111" }}
        >
          <ParticipantTile participant={t.p} label={t.label} mirror={t.mirror} highlight={!!t.isOnStagePerson} />
          {/* Swap-sides handle — tap to send this tile to the other slot.
              Only shown when there are two tiles to reorder. */}
          <button
            onClick={() => setLeftUserId(tiles[i === 0 ? 1 : 0].id)}
            aria-label={i === 0 ? "Move to right" : "Move to left"}
            title={i === 0 ? "Move to right" : "Move to left"}
            style={{
              position: "absolute", top: 6, [i === 0 ? "right" : "left"]: 6, zIndex: 6,
              width: 26, height: 26, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.35)",
              background: "rgba(0,0,0,0.55)", color: "#fff", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, lineHeight: 1,
            }}
          >
            {i === 0 ? "→" : "←"}
          </button>
        </div>
      ))}
    </div>
  );
}

/* ── Draggable exam clock — starts centered over the video, and can be
   dragged anywhere within the video pane so it never sits stuck on top of
   a face or a control button. Position is per-viewer and local-only (not
   synced), reset on remount, same pattern used for the draggable PiP tile
   stack elsewhere in the app. */
function DraggableClock({ mm, ss, low }: { mm: number; ss: number; low: boolean }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    (e.currentTarget as HTMLSpanElement).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, origX: offset.x, origY: offset.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
    setOffset({ x: d.origX + dx, y: d.origY + dy });
  };
  const onPointerUp = () => { drag.current = null; };

  return (
    <span
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      style={{
        position: "absolute", top: "50%", left: "50%",
        transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
        display: "flex", alignItems: "center", gap: 6,
        color: low ? RED : "#fff",
        fontWeight: 800, fontSize: 22, fontFamily: "monospace",
        background: "rgba(0,0,0,0.45)", padding: "6px 14px", borderRadius: 10,
        touchAction: "none", cursor: "grab", zIndex: 5, userSelect: "none",
      }}
    >
      <Clock size={18} /> {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
    </span>
  );
}

function ParticipantTile({ participant, label, mirror, highlight }: { participant: any; label: string; mirror: boolean; highlight?: boolean }) {
  const camPub = participant?.getTrackPublication?.(Track.Source.Camera);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#111", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", border: highlight ? `2px solid ${GREEN}` : "none", boxSizing: "border-box" }}>
      {camPub?.track ? (
        <VideoTrack
          trackRef={{ participant, source: Track.Source.Camera, publication: camPub }}
          /* object-fit: contain — cover was cropping in tight enough to cut
             off the top of the head and the chin, since "fill the tile
             completely" and "keep the whole person in frame while they're
             just holding the phone up naturally" pull in opposite
             directions. Contain always shows the full picture (face down
             to chest) at its natural size; the gentler 3:4 capture ratio
             in LK_OPTIONS keeps any leftover letterboxing minimal since it
             already roughly matches the tile's shape. */
          style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000", transform: mirror ? "scaleX(-1)" : "none" }}
        />
      ) : (
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Camera off</div>
      )}
      <span style={{ position: "absolute", bottom: 6, left: 8, color: "#fff", fontSize: 11, background: "rgba(0,0,0,0.5)", padding: "2px 8px", borderRadius: 10 }}>{label}</span>
    </div>
  );
}

// Registers this connection's real setMicrophoneEnabled into a ref owned by
// the parent page, so the roster drawer (which lives outside the LiveKitRoom
// tree) can flip a mic instantly instead of only writing the DB and waiting
// for the change to come back through realtime. Renders nothing.
function MicBridge({ registerRef }: { registerRef: { current: ((on: boolean) => void) | null } }) {
  const { localParticipant } = useLocalParticipant();
  useEffect(() => {
    registerRef.current = (on: boolean) => { localParticipant.setMicrophoneEnabled(on); };
    return () => { registerRef.current = null; };
  }, [localParticipant, registerRef]);
  return null;
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

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

// Full-room results announcement shown after "Finalize Competition". Judge
// calls positions one at a time, worst to best, so the winner lands last —
// every connected client (judge + all students) renders off the same
// event.reveal_index via realtime, so everyone sees the same position at
// the same time.
function ResultsCeremony({ ranked, revealIndex, isJudge, onRevealNext, onEnd, ending, totalMarks, eventTitle }: {
  ranked: any[]; revealIndex: number; isJudge: boolean; onRevealNext: () => void; onEnd: () => void;
  ending: boolean; totalMarks?: number | null; eventTitle?: string;
}) {
  const total = ranked.length;

  if (total === 0) {
    return (
      <div style={{ padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>No finalized participants to announce.</p>
        {isJudge && (
          <Button onClick={onEnd} disabled={ending} style={{ background: GOLD, color: G, fontWeight: 800 }}>
            {ending ? <Loader2 className="animate-spin mr-1" size={14} /> : <Trophy size={14} className="mr-1" />} End Competition
          </Button>
        )}
      </div>
    );
  }

  const idx = Math.max(total - 1 - revealIndex, 0); // index into `ranked` for the position currently on screen
  const current = ranked[idx];
  const rank = idx + 1; // 1-based position
  const isWinner = rank === 1;
  const alreadyAnnounced = ranked.slice(idx + 1); // worse positions, already called before this one

  return (
    <div style={{ padding: "28px 20px 44px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center" }}>
      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, margin: 0, fontFamily: "'Amiri','Noto Naskh Arabic',serif" }}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
      <p style={{ color: GOLD, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", margin: 0 }}>Results Announcement</p>
      <h2 style={{ color: "#fff", fontSize: 15, margin: 0, fontWeight: 700 }}>{eventTitle}</h2>

      <div style={{
        marginTop: 6, padding: "24px 28px", borderRadius: 16, minWidth: 260,
        background: isWinner ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${isWinner ? GOLD : "rgba(255,255,255,0.1)"}`,
      }}>
        {isWinner && <Trophy size={30} color={GOLD} style={{ marginBottom: 8 }} />}
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, margin: "0 0 4px", fontWeight: 600 }}>
          {isWinner ? "In first place, by the tawfīq of Allah —" : `In ${ordinal(rank)} place —`}
        </p>
        <p style={{ color: "#fff", fontSize: 26, fontWeight: 800, margin: "0 0 8px" }}>{current.participant_name}</p>
        <p style={{ color: GOLD, fontSize: 18, fontWeight: 700, margin: 0 }}>
          {current.total_score}{totalMarks != null ? `/${totalMarks}` : ""} <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: 600 }}>marks</span>
        </p>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, margin: "12px 0 0", fontStyle: "italic" }}>
          {isWinner ? "بارك الله فيهم وتقبل منهم — may Allah bless and accept their effort" : "بارك الله فيهم — may Allah bless their effort"}
        </p>
      </div>

      {alreadyAnnounced.length > 0 && (
        <div style={{ marginTop: 6, width: "100%", maxWidth: 320 }}>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, margin: "0 0 6px" }}>Announced so far</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {alreadyAnnounced.map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.55)", padding: "4px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
                <span>{ordinal(ranked.indexOf(p) + 1)} — {p.participant_name}</span>
                <span>{p.total_score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isJudge ? (
        <div style={{ marginTop: 16 }}>
          {!isWinner ? (
            <Button onClick={onRevealNext} style={{ background: GOLD, color: G, fontWeight: 800 }}>
              Reveal Next Position <ArrowRight size={15} className="ml-1" />
            </Button>
          ) : (
            <Button onClick={onEnd} disabled={ending} style={{ background: GOLD, color: G, fontWeight: 800 }}>
              {ending ? <Loader2 className="animate-spin mr-1" size={14} /> : <Trophy size={14} className="mr-1" />} End Competition
            </Button>
          )}
        </div>
      ) : (
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 16 }}>
          {isWinner ? "Alhamdulillāh — the judge will conclude the competition shortly." : "Waiting for the judge to reveal the next position…"}
        </p>
      )}
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
