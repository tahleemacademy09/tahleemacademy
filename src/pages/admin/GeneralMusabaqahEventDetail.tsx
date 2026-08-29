/*
  src/pages/admin/GeneralMusabaqahEventDetail.tsx
  ─────────────────────────────────────────────────────────────
  Detail page for one general_musabaqah_events row.

  Tabs:
    Overview  — edit the event's config (same fields as create dialog)
    Questions — manual question bank CRUD (Section 8/34 of the spec).
                AI generation is Phase 2; every question created here
                is manually authored and defaults to "approved".

  Registrations/waiting-room/live judging room are separate pages
  added in later chunks; this page links out to them once available.
*/
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getCompetitionKickoffMs } from "@/lib/musabaqahTiming";
import BigCountdown from "@/components/musabaqah/BigCountdown";
import {
  ArrowLeft, Plus, Loader2, Trash2, Pencil, Save, ScrollText,
  CheckCircle2, XCircle, Clock3, Copy, UserCheck, UserX, Users,
  KeyRound, RotateCcw, Ban, PhoneCall, SkipForward, Trophy,
  BarChart3, Eye, RefreshCcw, Award, Sparkles, ThumbsUp, ThumbsDown,
  Video, VideoOff,
} from "lucide-react";

const G    = "#0f2d1f";
const GM   = "#163d28";
const GOLD = "#c9a84c";
const BLUE_ACCENT = "#60A5FA";
// This page's Overview card is dark green — the shared Switch component's
// theme colors (bg-input / bg-background) are nearly invisible against it.
// Override just here rather than editing the shared component, since Switch
// looks fine on the light backgrounds it's used on elsewhere in the app.
const DARK_SWITCH = "data-[state=unchecked]:bg-white/15 data-[state=unchecked]:border-white/25 data-[state=checked]:bg-[#c9a84c] data-[state=checked]:border-[#c9a84c] [&>span]:bg-white [&>span]:shadow-md";
// The Overview card's CardContent sets text-white so its plain labels/paragraphs
// read on the dark green background — but that white also cascades into Input/
// Textarea/SelectTrigger, which sit on their own light bg-background surface.
// White-on-near-white made every field value invisible. Force these back to
// their own theme-correct foreground color, same "override at the call site"
// approach as DARK_SWITCH above.
const DARK_FIELD = "text-foreground placeholder:text-muted-foreground";

const CATEGORIES = [
  "memorization","narrator","arabic_text","translation","vocabulary",
  "explanation","lessons","comprehension","application","related_principles","identification",
] as const;
const QUESTION_TYPES = [
  "mcq","true_false","short_answer","oral","recitation","translation","explanation","comprehension","continuation",
] as const;
const DIFFICULTIES = ["easy","medium","hard","expert"] as const;

// datetime-local inputs need "YYYY-MM-DDTHH:mm" in the browser's local time;
// the DB gives back an ISO/UTC string. Converting in both directions here
// keeps the Overview tab's Registration/Start fields showing (and saving)
// the same wall-clock time the admin actually typed in, rather than drifting
// by their UTC offset every time the field is edited.
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (val: string) => (val ? new Date(val).toISOString() : null);

const emptyQuestion = (eventId: string, defaultStageId: string | null) => ({
  event_id: eventId,
  category: "memorization",
  question_type: "oral",
  question_text: "",
  question_text_ar: "",
  expected_answer: "",
  source_reference: "",
  marks: 10,
  difficulty: "medium",
  status: "approved",
  // Every question belongs to a stage — no ungrouped questions allowed.
  stage_id: defaultStageId,
});

export default function GeneralMusabaqahEventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { hasRole, user } = useAuth();
  const isStaff = hasRole("admin") || hasRole("teacher");

  const [event, setEvent]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  useEffect(() => { if (!isStaff) navigate("/student/musabaqah"); }, [isStaff]);

  const [questions, setQuestions] = useState<any[]>([]);
  const [qLoading, setQLoading]   = useState(true);
  const [qDialogOpen, setQDialogOpen] = useState(false);
  const [qDraft, setQDraft]       = useState<any>(null);
  const [qSaving, setQSaving]     = useState(false);

  const [registrations, setRegistrations] = useState<any[]>([]);
  const [rLoading, setRLoading]           = useState(true);
  const [actingOn, setActingOn]           = useState<string | null>(null);

  const [participants, setParticipants]   = useState<any[]>([]);
  const [pLoading, setPLoading]           = useState(true);

  // Lets links from elsewhere (e.g. the live exam room's "Finalize
  // Competition" action) land directly on a specific tab, such as
  // ?tab=results to jump straight to the leaderboard after finalizing.
  const initialTab = new URLSearchParams(window.location.search).get("tab");
  const [activeTab, setActiveTab] = useState(initialTab && ["overview", "questions", "registrations", "queue", "results"].includes(initialTab) ? initialTab : "overview");

  const [resultsLoading, setResultsLoading] = useState(true);
  const [scoresByParticipant, setScoresByParticipant] = useState<Record<string, any[]>>({});
  const [breakdownFor, setBreakdownFor] = useState<any | null>(null);

  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiForm, setAiForm] = useState({
    instructions: "",
    count: 10,
    difficulty: "medium",
    language: "both",
    categories: ["memorization", "translation", "explanation", "comprehension"] as string[],
    stage_id: "none" as string,
  });

  // ── Stages (sequential Stage 1 → Stage 2 → … grouping of the bank) ──
  const [stages, setStages] = useState<any[]>([]);
  const [stagesLoading, setStagesLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [stageDraft, setStageDraft] = useState<any>(null);
  const [stageSaving, setStageSaving] = useState(false);


  const loadEvent = async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase.from("general_musabaqah_events").select("*").eq("id", id).single();
    if (error) {
      toast({ title: "Failed to load Musabaqah", description: error.message, variant: "destructive" });
    } else {
      setEvent(data);
    }
    setLoading(false);
  };

  const loadQuestions = async () => {
    if (!id) return;
    setQLoading(true);
    const { data, error } = await supabase
      .from("general_musabaqah_questions")
      .select("*")
      .eq("event_id", id)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load questions", description: error.message, variant: "destructive" });
    } else {
      setQuestions(data || []);
    }
    setQLoading(false);
  };

  const loadStages = async () => {
    if (!id) return;
    setStagesLoading(true);
    const { data, error } = await supabase
      .from("general_musabaqah_stages")
      .select("*")
      .eq("event_id", id)
      .order("stage_order", { ascending: true });
    if (error) toast({ title: "Failed to load stages", description: error.message, variant: "destructive" });
    else setStages(data || []);
    setStagesLoading(false);
  };

  useEffect(() => { loadEvent(); loadQuestions(); loadRegistrations(); loadParticipants(); loadResults(); loadStages(); }, [id]);

  // Every question must belong to a stage — keep the AI form's stage pinned
  // to a real stage once one exists, instead of defaulting to "none".
  useEffect(() => {
    if (stages.length > 0 && (aiForm.stage_id === "none" || !stages.some(s => s.id === aiForm.stage_id))) {
      setAiForm(prev => ({ ...prev, stage_id: stages[0].id }));
    }
  }, [stages]);

  // This page previously only loaded each tab's data once on mount — a
  // student registering (or a participant's status changing) after the
  // admin opened this page never showed up until they navigated away and
  // back. That's what caused "Registrations" to sit on "No registrations
  // yet." even after a student had registered. Every other Musabaqah page
  // (ExamRoom, WaitingRoom) already does this same live-refresh pattern.
  useEffect(() => {
    if (!id) return;
    const ch = supabase.channel(`gm-admin-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "general_musabaqah_registrations", filter: `event_id=eq.${id}` }, () => loadRegistrations())
      .on("postgres_changes", { event: "*", schema: "public", table: "general_musabaqah_participants", filter: `event_id=eq.${id}` }, () => loadParticipants())
      .on("postgres_changes", { event: "*", schema: "public", table: "general_musabaqah_events", filter: `id=eq.${id}` }, () => loadEvent())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  // The same kickoff target used on student Register/Waiting Room pages —
  // see src/lib/musabaqahTiming.ts. Kept here so the "Ready to run" card's
  // countdown and this event's live status can never drift apart.
  const kickoffMs = event ? getCompetitionKickoffMs(event) : null;

  // If another admin/teacher's tab is the one that actually performs the
  // auto-launch DB flip (see autoLaunchCompetition), this tab still needs to
  // follow along the instant it hears about it via realtime — not just the
  // tab that triggered it.
  useEffect(() => {
    if (event?.status === "in_progress" && kickoffMs !== null && Date.now() >= kickoffMs && !autoLaunchedRef.current) {
      autoLaunchedRef.current = true;
      navigate(`/musabaqah/general/${id}/exam`);
    }
  }, [event?.status, kickoffMs]);

  const loadResults = async () => {
    if (!id) return;
    setResultsLoading(true);
    const { data: scores, error } = await supabase
      .from("general_musabaqah_scores")
      .select("*, general_musabaqah_answers(question_id, general_musabaqah_questions(category, marks))")
      .in("participant_id",
        (await supabase.from("general_musabaqah_participants").select("id").eq("event_id", id)).data?.map((p: any) => p.id) || []
      );
    if (error) { toast({ title: "Failed to load results", description: error.message, variant: "destructive" }); setResultsLoading(false); return; }
    const grouped: Record<string, any[]> = {};
    (scores || []).forEach((s: any) => {
      if (!grouped[s.participant_id]) grouped[s.participant_id] = [];
      grouped[s.participant_id].push(s);
    });
    setScoresByParticipant(grouped);
    setResultsLoading(false);
  };

  const loadRegistrations = async () => {
    if (!id) return;
    setRLoading(true);
    const { data, error } = await supabase
      .from("general_musabaqah_registrations")
      .select("*")
      .eq("event_id", id)
      .order("created_at", { ascending: true });
    if (error) toast({ title: "Failed to load registrations", description: error.message, variant: "destructive" });
    else setRegistrations(data || []);
    setRLoading(false);
  };

  const loadParticipants = async () => {
    if (!id) return;
    setPLoading(true);
    const { data, error } = await supabase
      .from("general_musabaqah_participants")
      .select("*, general_musabaqah_access_codes(code)")
      .eq("event_id", id)
      .order("created_at", { ascending: true });
    if (error) toast({ title: "Failed to load participants", description: error.message, variant: "destructive" });
    else setParticipants(data || []);
    setPLoading(false);
  };

  const generateCode = (subject: string) => {
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
    const subjCode = (subject.replace(/[^a-zA-Z]/g, "").toUpperCase() + "XXX").slice(0, 3);
    let rand = "";
    for (let i = 0; i < 5; i++) rand += letters[Math.floor(Math.random() * letters.length)];
    return `TAH-${subjCode}-${rand}`;
  };

  // Section 4/18: approve → generate access code → create the live-session participant record → admitted.
  const approveAndAdmit = async (reg: any) => {
    if (!id || !event) return;
    setActingOn(reg.id);
    try {
      let code = generateCode(event.subject);
      let codeRow: any = null;
      for (let attempt = 0; attempt < 3 && !codeRow; attempt++) {
        const { data, error } = await supabase
          .from("general_musabaqah_access_codes")
          .insert({ registration_id: reg.id, event_id: id, code })
          .select()
          .single();
        if (!error) { codeRow = data; break; }
        if (error.code === "23505") { code = generateCode(event.subject); continue; } // unique violation → retry
        throw error;
      }
      if (!codeRow) throw new Error("Could not generate a unique access code, please try again.");

      const { data: participant, error: pErr } = await supabase
        .from("general_musabaqah_participants")
        .insert({
          event_id: id,
          registration_id: reg.id,
          access_code_id: codeRow.id,
          user_id: reg.user_id,
          participant_name: reg.full_name,
          status: "admitted",
        })
        .select().single();
      if (pErr) throw pErr;

      const { error: rErr } = await supabase
        .from("general_musabaqah_registrations")
        .update({ status: "admitted", reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
        .eq("id", reg.id);
      if (rErr) throw rErr;

      await supabase.from("general_musabaqah_event_log").insert({
        event_id: id, participant_id: participant.id, action_type: "admitted",
        description: `${reg.full_name} approved and admitted`, created_by: user?.id ?? null,
      });

      toast({ title: `${reg.full_name} admitted`, description: `Access code: ${code}` });
      loadRegistrations();
      loadParticipants();
    } catch (err: any) {
      toast({ title: "Approval failed", description: err.message, variant: "destructive" });
    } finally {
      setActingOn(null);
    }
  };

  const [bulkAdmitting, setBulkAdmitting] = useState(false);
  const admitAllPending = async () => {
    const pending = registrations.filter(r => r.status === "pending" || r.status === "waitlisted");
    if (pending.length === 0) return;
    if (!window.confirm(`Admit all ${pending.length} pending/waitlisted registration(s)?`)) return;
    setBulkAdmitting(true);
    for (const reg of pending) {
      await approveAndAdmit(reg); // toasts per-item on success/failure and never throws
    }
    setBulkAdmitting(false);
    toast({ title: `Finished admitting ${pending.length} registration(s)` });
  };

  const setRegistrationStatus = async (reg: any, status: string) => {
    setActingOn(reg.id);
    const { error } = await supabase
      .from("general_musabaqah_registrations")
      .update({ status, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq("id", reg.id);
    setActingOn(null);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else { toast({ title: `${reg.full_name} marked ${labelize(status).toLowerCase()}` }); loadRegistrations(); }
  };

  const revokeCode = async (participant: any) => {
    if (!participant.access_code_id) return;
    if (!window.confirm(`Revoke ${participant.participant_name}'s access code?`)) return;
    const { error } = await supabase.from("general_musabaqah_access_codes")
      .update({ is_active: false, revoked_at: new Date().toISOString(), revoked_reason: "Revoked by admin" })
      .eq("id", participant.access_code_id);
    if (error) toast({ title: "Revoke failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Access code revoked" }); loadParticipants(); }
  };

  const regenerateCode = async (participant: any) => {
    if (!participant.access_code_id || !event) return;
    const newCode = generateCode(event.subject);
    const { error } = await supabase.from("general_musabaqah_access_codes")
      .update({ code: newCode, is_active: true, revoked_at: null, revoked_reason: null })
      .eq("id", participant.access_code_id);
    if (error) toast({ title: "Regenerate failed", description: error.message, variant: "destructive" });
    else { toast({ title: "New code generated", description: newCode }); loadParticipants(); }
  };

  const toggleVideoAllowed = async (participant: any) => {
    const next = !participant.video_allowed;
    const { error } = await supabase.from("general_musabaqah_participants").update({ video_allowed: next }).eq("id", participant.id);
    if (error) { toast({ title: "Update failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: next ? "Video allowed" : "Video disabled for this participant" });
    loadParticipants();
  };

  const removeParticipant = async (participant: any) => {
    if (!window.confirm(`Remove ${participant.participant_name} from this Musabaqah?`)) return;
    // If this participant is currently the event's "current_participant_id" (i.e. they were
    // called), clear that reference first or the delete below hits a foreign key violation.
    if (id) {
      const { error: clearError } = await supabase
        .from("general_musabaqah_events")
        .update({ current_participant_id: null })
        .eq("id", id)
        .eq("current_participant_id", participant.id);
      if (clearError) {
        toast({ title: "Remove failed", description: clearError.message, variant: "destructive" });
        return;
      }
    }
    const { error } = await supabase.from("general_musabaqah_participants").delete().eq("id", participant.id);
    if (error) toast({ title: "Remove failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Participant removed" }); loadParticipants(); }
  };

  // Section 39: controlled reopen — unlocks a finalized/completed exam for correction.
  const reopenExamination = async (participant: any) => {
    if (!window.confirm(`Reopen ${participant.participant_name}'s examination? Their status returns to In Progress.`)) return;
    const { error } = await supabase.from("general_musabaqah_participants").update({ status: "in_progress" }).eq("id", participant.id);
    if (error) { toast({ title: "Reopen failed", description: error.message, variant: "destructive" }); return; }
    await supabase.from("general_musabaqah_registrations").update({ status: "admitted" }).eq("id", participant.registration_id);
    await supabase.from("general_musabaqah_event_log").insert({
      event_id: id, participant_id: participant.id, action_type: "reopened",
      description: `${participant.participant_name}'s examination reopened by admin`, created_by: user?.id ?? null,
    });
    toast({ title: "Examination reopened" });
    loadParticipants(); loadResults();
  };

  const publishResults = async () => {
    await saveEvent({ results_visibility: "published" });
  };

  const categoryBreakdown = (participantId: string) => {
    const rows = scoresByParticipant[participantId] || [];
    const byCategory: Record<string, { earned: number; possible: number }> = {};
    rows.forEach(r => {
      const cat = r.general_musabaqah_answers?.general_musabaqah_questions?.category || "other";
      if (!byCategory[cat]) byCategory[cat] = { earned: 0, possible: 0 };
      byCategory[cat].earned += Number(r.score);
      byCategory[cat].possible += Number(r.max_score);
    });
    return byCategory;
  };


  // Note: calling a student onto the stage now only happens from inside the
  // live exam room (roster drawer → callRosterParticipant), not from this
  // page. This page's job is admitting/managing participants, nothing more.

  // Section: one-tap launch — validates the event is actually ready, flips it
  // to "in_progress" so it's locked in as live, then drops the admin straight
  // into the Queue tab where they call students one by one.
  // Auto-launch: the instant the synced kickoff time arrives, flip the event
  // live and jump every staff member who has this page open straight into
  // the exam room — no manual "Start Competition" click needed. Uses a
  // status-conditional update so if several admins have this page open at
  // once, only the first one actually flips it; everyone else picks up the
  // change via the realtime event subscription below and navigates too.
  const autoLaunchedRef = useRef(false);
  const autoLaunchCompetition = async () => {
    if (autoLaunchedRef.current || !event) return;
    if (!["registration_open", "registration_closed"].includes(event.status)) return;
    autoLaunchedRef.current = true;

    const approvedCount = questions.filter(q => q.status === "approved").length;
    if (approvedCount === 0 || participants.length === 0) return; // nothing to run — leave status as-is, admin can start manually once ready

    const { error, count } = await supabase.from("general_musabaqah_events")
      .update({ status: "in_progress" }, { count: "exact" })
      .eq("id", id)
      .eq("status", event.status);
    if (!error) {
      setEvent((prev: any) => ({ ...prev, status: "in_progress" }));
      toast({ title: "Competition auto-launched", description: "Kickoff time reached — the live exam room is now open." });
    }
    navigate(`/musabaqah/general/${id}/exam`);
  };

  const startCompetition = async () => {
    const approvedCount = questions.filter(q => q.status === "approved").length;
    const pendingCount = questions.filter(q => q.status === "pending_review").length;
    const admittedCount = participants.length;

    if (approvedCount === 0) {
      toast({ title: "No approved questions yet", description: "Add or approve at least one question in the Question Bank before starting.", variant: "destructive" });
      setActiveTab("questions");
      return;
    }
    if (admittedCount === 0) {
      toast({ title: "No admitted participants yet", description: "Approve at least one registration before starting.", variant: "destructive" });
      setActiveTab("registrations");
      return;
    }
    if (pendingCount > 0 && !window.confirm(`${pendingCount} question(s) are still awaiting review and won't be used. Start anyway?`)) {
      setActiveTab("questions");
      return;
    }

    if (!["in_progress", "paused"].includes(event.status)) {
      await saveEvent({ status: "in_progress" });
    }
    toast({ title: "Competition started", description: "Call students from the live exam room." });
    navigate(`/musabaqah/general/${id}/exam`);
  };

  const saveEvent = async (patch: Record<string, any>) => {
    if (!id) return;
    setSaving(true);
    const { error } = await supabase.from("general_musabaqah_events").update(patch).eq("id", id);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      setEvent((prev: any) => ({ ...prev, ...patch }));
      toast({ title: "Saved" });
    }
  };

  const openNewQuestion = () => {
    if (stages.length === 0) {
      toast({ title: "Add a stage first", description: "Every question must belong to a stage — create one under Stages above.", variant: "destructive" });
      return;
    }
    setQDraft(emptyQuestion(id!, stages[0].id));
    setQDialogOpen(true);
  };
  const openEditQuestion = (q: any) => { setQDraft({ ...q }); setQDialogOpen(true); };

  // Quick reassignment from the question card — no need to open the full edit dialog.
  const moveQuestionToStage = async (qid: string, newStageId: string) => {
    setQuestions(prev => prev.map(q => q.id === qid ? { ...q, stage_id: newStageId } : q));
    const { error } = await supabase.from("general_musabaqah_questions").update({ stage_id: newStageId }).eq("id", qid);
    if (error) { toast({ title: "Move failed", description: error.message, variant: "destructive" }); loadQuestions(); return; }
    toast({ title: "Question moved" });
  };

  const saveQuestion = async () => {
    if (!qDraft.question_text.trim()) {
      toast({ title: "Question text is required", variant: "destructive" });
      return;
    }
    if (!qDraft.stage_id) {
      toast({ title: "Stage is required", description: "Every question must belong to a stage.", variant: "destructive" });
      return;
    }
    setQSaving(true);
    const payload = {
      event_id: id,
      category: qDraft.category,
      question_type: qDraft.question_type,
      question_text: qDraft.question_text.trim(),
      question_text_ar: qDraft.question_text_ar?.trim() || null,
      expected_answer: qDraft.expected_answer?.trim() || null,
      source_reference: qDraft.source_reference?.trim() || null,
      marks: Number(qDraft.marks) || 10,
      difficulty: qDraft.difficulty,
      status: qDraft.status || "approved",
      stage_id: qDraft.stage_id,
    };
    const isEdit = !!qDraft.id;
    const { error } = isEdit
      ? await supabase.from("general_musabaqah_questions").update(payload).eq("id", qDraft.id)
      : await supabase.from("general_musabaqah_questions").insert(payload);
    setQSaving(false);
    if (error) {
      toast({ title: "Could not save question", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: isEdit ? "Question updated" : "Question added" });
    setQDialogOpen(false);
    loadQuestions();
  };

  const duplicateQuestion = async (q: any) => {
    const { id: _drop, created_at, updated_at, times_used, last_used_at, ...rest } = q;
    const { error } = await supabase.from("general_musabaqah_questions").insert(rest);
    if (error) toast({ title: "Duplicate failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Question duplicated" }); loadQuestions(); }
  };

  const deleteQuestion = async (qid: string) => {
    if (!window.confirm("Delete this question?")) return;
    const { error } = await supabase.from("general_musabaqah_questions").delete().eq("id", qid);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else setQuestions(prev => prev.filter(q => q.id !== qid));
  };

  // ── Stage CRUD ─────────────────────────────────────────────────────
  const emptyStage = () => ({ name: "", categories: [] as string[], difficulty: "medium", question_count: 5, time_limit_seconds: "" });
  const openNewStage = () => { setStageDraft(emptyStage()); setStageDialogOpen(true); };
  const openEditStage = (s: any) => { setStageDraft({ ...s, categories: Array.isArray(s.categories) ? s.categories : [], time_limit_seconds: s.time_limit_seconds ? Math.round(s.time_limit_seconds / 60) : "" }); setStageDialogOpen(true); };

  const saveStage = async () => {
    if (!id || !stageDraft.name.trim()) {
      toast({ title: "Stage name is required", variant: "destructive" });
      return;
    }
    setStageSaving(true);
    const isEdit = !!stageDraft.id;
    const payload = {
      event_id: id,
      name: stageDraft.name.trim(),
      categories: stageDraft.categories,
      difficulty: stageDraft.difficulty,
      question_count: Number(stageDraft.question_count) || 1,
      // Form field holds minutes for readability; stored column is seconds.
      // Blank/0 means "no override" — falls back to the event's overall exam timer.
      time_limit_seconds: stageDraft.time_limit_seconds ? Math.round(Number(stageDraft.time_limit_seconds) * 60) : null,
      ...(isEdit ? {} : { stage_order: stages.length }),
    };
    const { error } = isEdit
      ? await supabase.from("general_musabaqah_stages").update(payload).eq("id", stageDraft.id)
      : await supabase.from("general_musabaqah_stages").insert(payload);
    setStageSaving(false);
    if (error) {
      toast({ title: "Could not save stage", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: isEdit ? "Stage updated" : "Stage added" });
    setStageDialogOpen(false);
    loadStages();
  };

  const deleteStage = async (s: any) => {
    const attachedQuestions = questions.filter(q => q.stage_id === s.id);
    const fallback = stages.find(other => other.id !== s.id);

    if (attachedQuestions.length > 0 && !fallback) {
      toast({
        title: "Can't delete the only stage",
        description: `${attachedQuestions.length} question(s) belong to "${s.name}" and every question must belong to a stage. Add another stage first, or delete these questions.`,
        variant: "destructive",
      });
      return;
    }

    const confirmMsg = attachedQuestions.length > 0
      ? `Delete "${s.name}"? ${attachedQuestions.length} question(s) will be moved into "${fallback!.name}".`
      : `Delete "${s.name}"?`;
    if (!window.confirm(confirmMsg)) return;

    if (attachedQuestions.length > 0 && fallback) {
      const { error: moveErr } = await supabase.from("general_musabaqah_questions")
        .update({ stage_id: fallback.id }).eq("stage_id", s.id);
      if (moveErr) { toast({ title: "Could not move questions", description: moveErr.message, variant: "destructive" }); return; }
    }

    const { error } = await supabase.from("general_musabaqah_stages").delete().eq("id", s.id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: attachedQuestions.length > 0 ? `Stage deleted — questions moved to "${fallback!.name}"` : "Stage deleted" });
    loadStages();
    loadQuestions();
  };

  const moveStage = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= stages.length) return;
    const a = stages[index], b = stages[target];
    setStages(prev => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    await Promise.all([
      supabase.from("general_musabaqah_stages").update({ stage_order: b.stage_order }).eq("id", a.id),
      supabase.from("general_musabaqah_stages").update({ stage_order: a.stage_order }).eq("id", b.id),
    ]);
    loadStages();
  };

  // ── AI question generation (Phase 2, Section 6/7/32) ──────────────────
  // Reuses the existing tahleem-ai edge function's generic "generate" action
  // (systemPrompt + prompt → { text }) rather than adding a new function.
  const buildAiSystemPrompt = () => `You are an expert Islamic and Arabic studies examiner writing oral examination questions for "${event.subject}"${event.topic ? ` on the topic "${event.topic}"` : ""}.
${event.source_reference ? `Source/reference material to ground every question in: ${event.source_reference}` : ""}
${event.instructions ? `Examiner instructions: ${event.instructions}` : ""}
Target student level: ${event.target_level || "general"}.

Respond with ONLY a raw JSON array (no markdown fences, no prose) of question objects. Each object must have exactly these fields:
{
  "category": one of memorization|narrator|arabic_text|translation|vocabulary|explanation|lessons|comprehension|application|related_principles|identification,
  "question_type": one of oral|recitation|translation|explanation|comprehension|continuation|short_answer|true_false|mcq,
  "question_text": string (English),
  "question_text_ar": string or null (Arabic version, only if meaningfully different from English — MUST be fully vocalized with correct Arabic diacritics/tashkeel (fatha, damma, kasra, sukoon, shaddah, tanween) on every word, never bare/undotted Arabic text),
  "expected_answer": string — a model answer / rubric note for the judge,
  "source_reference": string — which part of the source this draws from,
  "marks": number,
  "difficulty": one of easy|medium|hard|expert,
  "confidence": number between 0 and 1 — your own confidence this question is accurate and well-formed
}
Do not invent content outside the given subject/topic/source. Every "question_text_ar" value must carry full Arabic diacritics (tashkeel) throughout — this is a hard requirement, not optional styling. Never wrap the array in a parent object.`;

  const buildAiUserPrompt = () => {
    const catList = aiForm.categories.length ? aiForm.categories.join(", ") : "any suitable categories";
    const stage = aiForm.stage_id !== "none" ? stages.find(s => s.id === aiForm.stage_id) : null;
    return `${stage ? `These questions are for the stage "${stage.name}" of the examination — keep them consistent with that stage's focus. ` : ""}Generate ${aiForm.count} questions. Draw only from categories: ${catList}. Target difficulty: ${aiForm.difficulty}. ${
      aiForm.language === "arabic" ? "Write question_text primarily in Arabic (still fill question_text_ar), fully vocalized with tashkeel." :
      aiForm.language === "both" ? "Provide both English (question_text) and Arabic (question_text_ar) for every question, with question_text_ar fully vocalized with tashkeel." :
      "English only — leave question_text_ar null."
    } ${aiForm.instructions.trim() ? `Additional instructions: ${aiForm.instructions.trim()}` : ""} Marks per question should default to ${event.marks_per_question}.`;
  };

  const generateWithAI = async () => {
    if (!event || !id) return;
    if (!aiForm.stage_id || aiForm.stage_id === "none") {
      toast({ title: "Stage is required", description: "Every question must belong to a stage.", variant: "destructive" });
      return;
    }
    setAiGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("tahleem-ai", {
        body: { action: "generate", prompt: buildAiUserPrompt(), context: { systemPrompt: buildAiSystemPrompt() } },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      let raw = (data?.text || "").trim();
      raw = raw.replace(/^```(json)?/i, "").replace(/```$/, "").trim(); // strip stray fences defensively
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("AI did not return a question array");

      const validCategories = new Set(CATEGORIES);
      const validTypes = new Set(QUESTION_TYPES);
      const validDifficulties = new Set(DIFFICULTIES);
      const autoApprove = !!event.ai_auto_approve_questions;

      const rows = parsed
        .filter((q: any) => q.question_text && validCategories.has(q.category))
        .map((q: any) => ({
          event_id: id,
          category: q.category,
          question_type: validTypes.has(q.question_type) ? q.question_type : "oral",
          question_text: String(q.question_text).slice(0, 2000),
          question_text_ar: q.question_text_ar ? String(q.question_text_ar).slice(0, 2000) : null,
          expected_answer: q.expected_answer ? String(q.expected_answer).slice(0, 2000) : null,
          source_reference: q.source_reference ? String(q.source_reference).slice(0, 500) : null,
          marks: Number(q.marks) > 0 ? Number(q.marks) : event.marks_per_question,
          difficulty: validDifficulties.has(q.difficulty) ? q.difficulty : aiForm.difficulty,
          status: autoApprove ? "approved" : "pending_review",
          ai_generated: true,
          ai_confidence: typeof q.confidence === "number" ? Math.max(0, Math.min(1, q.confidence)) : null,
          stage_id: aiForm.stage_id,
        }));

      if (rows.length === 0) throw new Error("AI returned no usable questions — try adjusting the instructions.");

      const { error: insErr } = await supabase.from("general_musabaqah_questions").insert(rows);
      if (insErr) throw insErr;

      toast({
        title: `${rows.length} question${rows.length === 1 ? "" : "s"} generated`,
        description: autoApprove ? "Auto-approved and added to the bank." : "Sent to the review queue below.",
      });
      setAiDialogOpen(false);
      loadQuestions();
    } catch (err: any) {
      toast({ title: "AI generation failed", description: err.message, variant: "destructive" });
    } finally {
      setAiGenerating(false);
    }
  };

  const approveQuestion = async (qid: string) => {
    const { error } = await supabase.from("general_musabaqah_questions").update({ status: "approved" }).eq("id", qid);
    if (error) toast({ title: "Approve failed", description: error.message, variant: "destructive" });
    else loadQuestions();
  };
  const [approvingAll, setApprovingAll] = useState(false);
  const approveAllQuestions = async () => {
    const pendingIds = questions.filter(q => q.status === "pending_review").map(q => q.id);
    if (pendingIds.length === 0) return;
    if (!window.confirm(`Approve all ${pendingIds.length} pending question(s)? Review them individually first if you're unsure.`)) return;
    setApprovingAll(true);
    const { error } = await supabase.from("general_musabaqah_questions").update({ status: "approved" }).in("id", pendingIds);
    setApprovingAll(false);
    if (error) toast({ title: "Approve all failed", description: error.message, variant: "destructive" });
    else { toast({ title: `${pendingIds.length} question(s) approved` }); loadQuestions(); }
  };
  const rejectQuestion = async (qid: string) => {
    const { error } = await supabase.from("general_musabaqah_questions").update({ status: "rejected" }).eq("id", qid);
    if (error) toast({ title: "Reject failed", description: error.message, variant: "destructive" });
    else loadQuestions();
  };

  // Regenerate: re-ask the AI for one question in this exact category/difficulty, replacing the content in place.
  const regenerateQuestion = async (q: any) => {
    if (!event) return;
    setActingOn(q.id);
    try {
      const sys = buildAiSystemPrompt();
      const prompt = `Generate exactly 1 question. Category: ${q.category}. Difficulty: ${q.difficulty}. Question type: ${q.question_type}. ${aiForm.instructions.trim()}`;
      const { data, error } = await supabase.functions.invoke("tahleem-ai", { body: { action: "generate", prompt, context: { systemPrompt: sys } } });
      if (error) throw new Error(error.message);
      let raw = (data?.text || "").trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(raw);
      const item = Array.isArray(parsed) ? parsed[0] : parsed;
      if (!item?.question_text) throw new Error("AI did not return a usable question");

      const { error: updErr } = await supabase.from("general_musabaqah_questions").update({
        question_text: String(item.question_text).slice(0, 2000),
        question_text_ar: item.question_text_ar ? String(item.question_text_ar).slice(0, 2000) : null,
        expected_answer: item.expected_answer ? String(item.expected_answer).slice(0, 2000) : q.expected_answer,
        source_reference: item.source_reference ? String(item.source_reference).slice(0, 500) : q.source_reference,
        status: event.ai_auto_approve_questions ? "approved" : "pending_review",
        ai_confidence: typeof item.confidence === "number" ? Math.max(0, Math.min(1, item.confidence)) : null,
      }).eq("id", q.id);
      if (updErr) throw updErr;
      toast({ title: "Question regenerated" });
      loadQuestions();
    } catch (err: any) {
      toast({ title: "Regenerate failed", description: err.message, variant: "destructive" });
    } finally {
      setActingOn(null);
    }
  };

  const filteredQuestions = useMemo(
    () => questions
      .filter(q => stageFilter === "all" || q.stage_id === stageFilter),
    [questions, stageFilter]
  );

  if (loading || !event) {
    return (
      <div style={{ minHeight: "100%", background: G, display: "flex", justifyContent: "center", alignItems: "center" }}>
        <Loader2 className="animate-spin" color={GOLD} size={28} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100%", width: "100%", maxWidth: "100vw", overflowX: "hidden", background: `linear-gradient(160deg, ${G} 0%, #0a1f12 60%, #050f09 100%)`, padding: "20px 16px 56px", fontFamily: "'Cairo', sans-serif", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <button onClick={() => navigate("/musabaqah/general")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 6, marginBottom: 12, cursor: "pointer", fontSize: 13 }}>
          <ArrowLeft size={14} /> All General Musabaqah events
        </button>

        <div style={{ marginBottom: 16 }}>
          <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 800, margin: 0 }}>{event.title}</h1>
          <p style={{ color: GOLD, fontSize: 13, fontWeight: 600, margin: "4px 0 0" }}>
            {event.subject}{event.topic ? ` — ${event.topic}` : ""}
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div style={{ overflowX: "auto", overflowY: "hidden", WebkitOverflowScrolling: "touch", marginBottom: 2 }}>
            <TabsList className="flex-nowrap w-max">
              <TabsTrigger className="whitespace-nowrap" value="overview">Overview</TabsTrigger>
              <TabsTrigger className="whitespace-nowrap" value="questions">
                Question Bank {questions.length > 0 && <Badge className="ml-1.5" variant="secondary">{questions.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger className="whitespace-nowrap" value="registrations">
                Registrations {registrations.filter(r => r.status === "pending").length > 0 &&
                  <Badge className="ml-1.5" style={{ background: "#FBBF24", color: "#1a1400" }}>{registrations.filter(r => r.status === "pending").length}</Badge>}
              </TabsTrigger>
              <TabsTrigger className="whitespace-nowrap" value="queue">Queue</TabsTrigger>
              <TabsTrigger className="whitespace-nowrap" value="results">Results</TabsTrigger>
            </TabsList>
          </div>

          {/* ── OVERVIEW ─────────────────────────────────────────────── */}
          <TabsContent value="overview" className="mt-4">
            <Card style={{ background: GM, border: "1px solid rgba(201,168,76,0.2)" }}>
              <CardContent className="pt-6 grid gap-4 text-white">
                <Field label="Status">
                  <Select value={event.status} onValueChange={v => saveEvent({ status: v })}>
                    <SelectTrigger className={`w-56 ${DARK_FIELD}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="registration_open">Registration Open</SelectItem>
                      <SelectItem value="registration_closed">Registration Closed</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Row2>
                  <Field label="Title">
                    <Input className={DARK_FIELD} defaultValue={event.title} onBlur={e => e.target.value !== event.title && saveEvent({ title: e.target.value })} />
                  </Field>
                  <Field label="Subject">
                    <Input className={DARK_FIELD} defaultValue={event.subject} onBlur={e => e.target.value !== event.subject && saveEvent({ subject: e.target.value })} />
                  </Field>
                </Row2>
                <Row2>
                  <Field label="Topic">
                    <Input className={DARK_FIELD} defaultValue={event.topic || ""} onBlur={e => e.target.value !== event.topic && saveEvent({ topic: e.target.value || null })} />
                  </Field>
                  <Field label="Target level">
                    <Input className={DARK_FIELD} defaultValue={event.target_level || ""} onBlur={e => e.target.value !== event.target_level && saveEvent({ target_level: e.target.value || null })} />
                  </Field>
                </Row2>
                <Field label="Description">
                  <Textarea className={DARK_FIELD} rows={2} defaultValue={event.description || ""} onBlur={e => e.target.value !== event.description && saveEvent({ description: e.target.value || null })} />
                </Field>
                <Field label="Instructions">
                  <Textarea className={DARK_FIELD} rows={2} defaultValue={event.instructions || ""} onBlur={e => e.target.value !== event.instructions && saveEvent({ instructions: e.target.value || null })} />
                </Field>

                <Row2>
                  <Field label="Registration opens">
                    <Input className={DARK_FIELD} type="datetime-local" defaultValue={toLocalInput(event.registration_opens_at)}
                      onBlur={e => fromLocalInput(e.target.value) !== event.registration_opens_at && saveEvent({ registration_opens_at: fromLocalInput(e.target.value) })} />
                  </Field>
                  <Field label="Registration closes">
                    <Input className={DARK_FIELD} type="datetime-local" defaultValue={toLocalInput(event.registration_closes_at)}
                      onBlur={e => fromLocalInput(e.target.value) !== event.registration_closes_at && saveEvent({ registration_closes_at: fromLocalInput(e.target.value) })} />
                  </Field>
                </Row2>
                <Row2>
                  <Field label="Competition date">
                    <Input className={DARK_FIELD} type="date" defaultValue={event.competition_date || ""} onBlur={e => e.target.value !== event.competition_date && saveEvent({ competition_date: e.target.value || null })} />
                  </Field>
                  <Field label="Start time">
                    <Input className={DARK_FIELD} type="datetime-local" defaultValue={toLocalInput(event.start_time)}
                      onBlur={e => fromLocalInput(e.target.value) !== event.start_time && saveEvent({ start_time: fromLocalInput(e.target.value) })} />
                  </Field>
                </Row2>
                <Row2>
                  <Field label="Questions per student">
                    <Input className={DARK_FIELD} type="number" defaultValue={event.num_questions_per_student}
                      onBlur={e => Number(e.target.value) !== event.num_questions_per_student && saveEvent({ num_questions_per_student: Number(e.target.value) })} />
                  </Field>
                  <div />
                </Row2>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: -6 }}>
                  Once "Registration closes" has passed, registered students see a live countdown to "Start time" (or the start of "Competition date" if no start time is set).
                </div>
                <Row2>
                  <Field label="Marks per question">
                    <Input className={DARK_FIELD} type="number" defaultValue={event.marks_per_question}
                      onBlur={e => Number(e.target.value) !== event.marks_per_question && saveEvent({ marks_per_question: Number(e.target.value) })} />
                  </Field>
                  <Field label="Max exam time (sec)">
                    <Input className={DARK_FIELD} type="number" defaultValue={event.max_exam_time_seconds}
                      onBlur={e => Number(e.target.value) !== event.max_exam_time_seconds && saveEvent({ max_exam_time_seconds: Number(e.target.value) })} />
                  </Field>
                </Row2>
                <Row2>
                  <Field label="Time per question (sec)">
                    <Input className={DARK_FIELD} type="number" defaultValue={event.question_time_seconds ?? 60}
                      onBlur={e => Number(e.target.value) !== event.question_time_seconds && saveEvent({ question_time_seconds: Number(e.target.value) })} />
                  </Field>
                  <div />
                </Row2>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: -6 }}>
                  This is the per-question countdown in the live exam room — it stays paused after a question is revealed until the judge taps "Start Timer" (so the judge can read the question aloud first).
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Label style={{ color: "#fff", fontSize: 13 }}>Randomize questions</Label>
                  <Switch checked={event.randomize_questions} onCheckedChange={v => saveEvent({ randomize_questions: v })} className={DARK_SWITCH} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Label style={{ color: "#fff", fontSize: 13 }}>Connection loss pauses timer</Label>
                  <Switch checked={event.connection_loss_pauses_timer} onCheckedChange={v => saveEvent({ connection_loss_pauses_timer: v })} className={DARK_SWITCH} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Label style={{ color: "#fff", fontSize: 13 }}>Leaderboard enabled</Label>
                  <Switch checked={event.leaderboard_enabled} onCheckedChange={v => saveEvent({ leaderboard_enabled: v })} className={DARK_SWITCH} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Label style={{ color: "#fff", fontSize: 13 }}>Auto-approve AI questions</Label>
                  <Switch checked={!!event.ai_auto_approve_questions} onCheckedChange={v => saveEvent({ ai_auto_approve_questions: v })} className={DARK_SWITCH} />
                </div>

                {saving && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Saving…</span>}

                <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 12, color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
                  Set status to "Registration Open" so students can find and register for this event.
                </div>
              </CardContent>
            </Card>

            {/* ── Start Competition ─────────────────────────────────────
                One tap once Overview/Question Bank/Registrations are set:
                checks there's something to run, locks the event to
                in_progress, and jumps straight to the calling queue.
                The countdown below is synced to the same kickoff target
                used on the student Register/Waiting Room pages, and
                auto-launches the moment it hits zero — no click needed. */}
            <Card style={{ background: GM, border: "1px solid rgba(201,168,76,0.35)", marginTop: 14 }}>
              <CardContent className="pt-5 pb-5">
                {["registration_open", "registration_closed"].includes(event.status) && kickoffMs !== null && Date.now() < kickoffMs && (
                  <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <BigCountdown targetMs={kickoffMs} color={GOLD} label="Auto-launches in" onArrive={autoLaunchCompetition} />
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <p style={{ color: "#fff", fontWeight: 700, fontSize: 14, margin: 0 }}>Ready to run the live exam?</p>
                    <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, margin: "4px 0 0" }}>
                      {questions.filter(q => q.status === "approved").length} approved question{questions.filter(q => q.status === "approved").length === 1 ? "" : "s"} ·{" "}
                      {participants.length} admitted participant{participants.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Button onClick={startCompetition} style={{ background: GOLD, color: G, fontWeight: 800 }}>
                    <PhoneCall size={16} className="mr-1.5" /> Start Competition
                  </Button>
                </div>
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, margin: "10px 0 0" }}>
                  This sets status to "In Progress" and takes you straight into the live exam room, where you call admitted students one at a time. Each called student self-picks a question tile and the timer (Max exam time above) starts automatically. At kickoff time it also launches on its own — for anyone else with this page open (co-admin/judge) too — as long as there's at least one approved question and one admitted participant.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── QUESTIONS ────────────────────────────────────────────── */}
          <TabsContent value="questions" className="mt-4">
            {/* Stages — ordered sections the live exam progresses through */}
            <Card style={{ background: GM, border: "1px solid rgba(201,168,76,0.2)", marginBottom: 14 }}>
              <CardContent className="pt-4 pb-4">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: stages.length ? 10 : 0, gap: 8, flexWrap: "wrap" }}>
                  <div>
                    <p style={{ color: "#fff", fontWeight: 700, fontSize: 13, margin: 0 }}>Stages</p>
                    <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, margin: "2px 0 0" }}>
                      {stages.length
                        ? "Students must finish a stage's questions before the next one unlocks in the live exam room. Every question belongs to a stage."
                        : "Add at least one stage — every question in the bank must belong to one."}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={openNewStage} style={{ color: GOLD, borderColor: "rgba(201,168,76,0.4)" }}>
                    <Plus size={14} className="mr-1" /> Add Stage
                  </Button>
                </div>
                {stagesLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 10 }}>
                    <Loader2 className="animate-spin" color={GOLD} size={18} />
                  </div>
                ) : stages.length > 0 && (
                  <div style={{ display: "grid", gap: 8 }}>
                    {stages.map((s, i) => {
                      const count = questions.filter(q => q.stage_id === s.id).length;
                      return (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 10px", flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                            <Badge style={{ background: "rgba(201,168,76,0.15)", color: GOLD, border: "none" }}>Stage {i + 1}</Badge>
                            <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
                              {labelize(s.difficulty)} · {s.question_count} question{s.question_count === 1 ? "" : "s"}/student · {count} in bank
                              {s.time_limit_seconds ? ` · ${Math.round(s.time_limit_seconds / 60)} min timer` : " · uses event timer"}
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                            <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => moveStage(i, -1)} style={{ color: "rgba(255,255,255,0.5)" }}>↑</Button>
                            <Button variant="ghost" size="icon" disabled={i === stages.length - 1} onClick={() => moveStage(i, 1)} style={{ color: "rgba(255,255,255,0.5)" }}>↓</Button>
                            <Button variant="ghost" size="icon" onClick={() => openEditStage(s)} style={{ color: "rgba(255,255,255,0.5)" }}><Pencil size={14} /></Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteStage(s)} style={{ color: "rgba(255,255,255,0.5)" }}><Trash2 size={14} /></Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {stages.length > 0 && (
                  <Select value={stageFilter} onValueChange={setStageFilter}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All stages</SelectItem>
                      {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="outline" disabled={stages.length === 0} onClick={() => setAiDialogOpen(true)} style={{ color: BLUE_ACCENT, borderColor: "rgba(96,165,250,0.4)" }}>
                  <Sparkles size={16} className="mr-1" /> Generate with AI
                </Button>
                <Button onClick={openNewQuestion} style={{ background: GOLD, color: G, fontWeight: 700 }}>
                  <Plus size={16} className="mr-1" /> Add Question
                </Button>
              </div>
            </div>

            {stages.length === 0 && (
              <div style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 10, padding: "8px 12px", marginBottom: 12, color: "#FBBF24", fontSize: 12 }}>
                Add a stage above before adding questions — every question must belong to one.
              </div>
            )}

            {questions.some(q => q.status === "pending_review") && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 10, padding: "8px 12px", marginBottom: 12 }}>
                <span style={{ color: "#FBBF24", fontSize: 12 }}>
                  {questions.filter(q => q.status === "pending_review").length} AI-generated question(s) awaiting your review — never enter the live exam until approved.
                </span>
                <Button size="sm" disabled={approvingAll} onClick={approveAllQuestions} style={{ background: "#4ADE80", color: "#06301a", fontWeight: 700, flexShrink: 0 }}>
                  {approvingAll ? <Loader2 size={13} className="animate-spin mr-1" /> : <ThumbsUp size={13} className="mr-1" />} Approve All
                </Button>
              </div>
            )}

            {qLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                <Loader2 className="animate-spin" color={GOLD} size={24} />
              </div>
            ) : filteredQuestions.length === 0 ? (
              <Card style={{ background: GM, border: "1px solid rgba(201,168,76,0.2)" }}>
                <CardContent className="pt-6 pb-6 text-center">
                  <ScrollText size={28} color={GOLD} style={{ margin: "0 auto 10px" }} />
                  <p style={{ color: "rgba(255,255,255,0.65)" }}>No questions yet. Add one manually or generate a batch with AI.</p>
                </CardContent>
              </Card>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {filteredQuestions.map(q => (
                  <Card key={q.id} style={{ background: GM, border: q.status === "pending_review" ? "1px solid rgba(251,191,36,0.4)" : "1px solid rgba(201,168,76,0.15)" }}>
                    <CardContent className="pt-4 pb-4">
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6, alignItems: "center" }}>
                            {stages.length > 1 ? (
                              <Select value={q.stage_id} onValueChange={v => moveQuestionToStage(q.id, v)}>
                                <SelectTrigger className="h-6 px-2 text-xs w-auto" style={{ background: "rgba(201,168,76,0.15)", color: GOLD, border: "none" }}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            ) : (
                              stages.find(s => s.id === q.stage_id) && (
                                <Badge style={{ background: "rgba(201,168,76,0.15)", color: GOLD, border: "none" }}>
                                  {stages.find(s => s.id === q.stage_id)?.name}
                                </Badge>
                              )
                            )}
                            <Badge variant="secondary">{labelize(q.category)}</Badge>
                            <Badge variant="outline" style={{ color: "#fff", borderColor: "rgba(255,255,255,0.25)" }}>{labelize(q.question_type)}</Badge>
                            <Badge variant="outline" style={{ color: "#fff", borderColor: "rgba(255,255,255,0.25)" }}>{labelize(q.difficulty)}</Badge>
                            <Badge style={{ background: "rgba(201,168,76,0.15)", color: GOLD, border: "none" }}>{q.marks} marks</Badge>
                            {q.ai_generated && (
                              <Badge style={{ background: "rgba(96,165,250,0.15)", color: BLUE_ACCENT, border: "none" }}>
                                <Sparkles size={11} className="mr-1" />AI{q.ai_confidence != null ? ` ${Math.round(q.ai_confidence * 100)}%` : ""}
                              </Badge>
                            )}
                            {q.status === "approved"
                              ? <Badge style={{ background: "rgba(74,222,128,0.15)", color: "#4ADE80", border: "none" }}><CheckCircle2 size={11} className="mr-1" />Approved</Badge>
                              : q.status === "rejected"
                              ? <Badge style={{ background: "rgba(248,113,113,0.15)", color: "#F87171", border: "none" }}><XCircle size={11} className="mr-1" />Rejected</Badge>
                              : <Badge style={{ background: "rgba(251,191,36,0.15)", color: "#FBBF24", border: "none" }}><Clock3 size={11} className="mr-1" />{labelize(q.status)}</Badge>}
                          </div>
                          <p style={{ color: "#fff", fontSize: 14, margin: 0 }}>{q.question_text}</p>
                          {q.question_text_ar && <p dir="rtl" style={{ color: "rgba(255,255,255,0.8)", fontSize: 17, lineHeight: 1.8, margin: "4px 0 0", fontFamily: "'Amiri', 'Noto Naskh Arabic', serif" }}>{q.question_text_ar}</p>}
                          {q.expected_answer && <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, margin: "6px 0 0" }}>Expected: {q.expected_answer}</p>}

                          {q.status === "pending_review" && (
                            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                              <Button size="sm" disabled={actingOn === q.id} onClick={() => approveQuestion(q.id)} style={{ background: "#4ADE80", color: "#06301a", fontWeight: 700 }}>
                                <ThumbsUp size={13} className="mr-1" /> Approve
                              </Button>
                              <Button size="sm" variant="outline" disabled={actingOn === q.id} onClick={() => regenerateQuestion(q)}>
                                {actingOn === q.id ? <Loader2 size={13} className="animate-spin mr-1" /> : <Sparkles size={13} className="mr-1" />} Regenerate
                              </Button>
                              <Button size="sm" variant="outline" disabled={actingOn === q.id} onClick={() => rejectQuestion(q.id)} style={{ color: "#F87171", borderColor: "rgba(248,113,113,0.4)" }}>
                                <ThumbsDown size={13} className="mr-1" /> Reject
                              </Button>
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                          <Button variant="ghost" size="icon" onClick={() => duplicateQuestion(q)} style={{ color: "rgba(255,255,255,0.5)" }}><Copy size={15} /></Button>
                          <Button variant="ghost" size="icon" onClick={() => openEditQuestion(q)} style={{ color: "rgba(255,255,255,0.5)" }}><Pencil size={15} /></Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteQuestion(q.id)} style={{ color: "rgba(255,255,255,0.5)" }}><Trash2 size={15} /></Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── REGISTRATIONS ────────────────────────────────────────── */}
          <TabsContent value="registrations" className="mt-4">
            {registrations.some(r => r.status === "pending" || r.status === "waitlisted") && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                <Button size="sm" disabled={bulkAdmitting} onClick={admitAllPending} style={{ background: "#4ADE80", color: "#06301a", fontWeight: 700 }}>
                  {bulkAdmitting ? <Loader2 size={14} className="animate-spin mr-1" /> : <UserCheck size={14} className="mr-1" />}
                  Admit All
                </Button>
              </div>
            )}
            {rLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                <Loader2 className="animate-spin" color={GOLD} size={24} />
              </div>
            ) : registrations.length === 0 ? (
              <Card style={{ background: GM, border: "1px solid rgba(201,168,76,0.2)" }}>
                <CardContent className="pt-6 pb-6 text-center">
                  <Users size={28} color={GOLD} style={{ margin: "0 auto 10px" }} />
                  <p style={{ color: "rgba(255,255,255,0.65)" }}>No registrations yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {registrations.map(reg => (
                  <Card key={reg.id} style={{ background: GM, border: "1px solid rgba(201,168,76,0.15)" }}>
                    <CardContent className="pt-4 pb-4">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{reg.full_name}</span>
                            <RegStatusBadge status={reg.status} />
                          </div>
                          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, margin: 0 }}>
                            {reg.level_class ? `${reg.level_class} · ` : ""}{reg.phone || "No phone on file"}
                          </p>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {reg.status === "pending" && (
                            <>
                              <Button size="sm" disabled={actingOn === reg.id} onClick={() => approveAndAdmit(reg)}
                                style={{ background: "#4ADE80", color: "#06301a", fontWeight: 700 }}>
                                {actingOn === reg.id ? <Loader2 size={14} className="animate-spin mr-1" /> : <UserCheck size={14} className="mr-1" />}
                                Approve & Admit
                              </Button>
                              <Button size="sm" variant="outline" disabled={actingOn === reg.id} onClick={() => setRegistrationStatus(reg, "waitlisted")}>
                                Waitlist
                              </Button>
                              <Button size="sm" variant="outline" disabled={actingOn === reg.id} onClick={() => setRegistrationStatus(reg, "rejected")}
                                style={{ color: "#F87171", borderColor: "rgba(248,113,113,0.4)" }}>
                                <UserX size={14} className="mr-1" /> Reject
                              </Button>
                            </>
                          )}
                          {reg.status === "waitlisted" && (
                            <Button size="sm" disabled={actingOn === reg.id} onClick={() => approveAndAdmit(reg)}
                              style={{ background: "#4ADE80", color: "#06301a", fontWeight: 700 }}>
                              Approve & Admit
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── QUEUE ────────────────────────────────────────────────── */}
          <TabsContent value="queue" className="mt-4">
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginBottom: 12 }}>
              Calling students onto the stage happens from inside the live exam room (roster drawer), not here. This tab is just for admitting and managing participants before and during the event.
            </div>
            {pLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                <Loader2 className="animate-spin" color={GOLD} size={24} />
              </div>
            ) : participants.length === 0 ? (
              <Card style={{ background: GM, border: "1px solid rgba(201,168,76,0.2)" }}>
                <CardContent className="pt-6 pb-6 text-center">
                  <Users size={28} color={GOLD} style={{ margin: "0 auto 10px" }} />
                  <p style={{ color: "rgba(255,255,255,0.65)" }}>No admitted participants yet — approve a registration first.</p>
                </CardContent>
              </Card>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {participants.map(p => (
                  <Card key={p.id} style={{ background: GM, border: "1px solid rgba(201,168,76,0.15)" }}>
                    <CardContent className="pt-4 pb-4">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{p.participant_name}</span>
                            <ParticipantStatusBadge status={p.status} />
                          </div>
                          {p.general_musabaqah_access_codes?.code && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                              <KeyRound size={12} />
                              <span style={{ fontFamily: "monospace" }}>{p.general_musabaqah_access_codes.code}</span>
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {p.status === "waiting" && (
                            <>
                              <Badge style={{ background: "rgba(96,165,250,0.15)", color: "#60A5FA", border: "none" }}>Joined — waiting to be called</Badge>
                              <Button size="sm" variant="outline" onClick={() => navigate(`/musabaqah/general/${id}/exam`)}>
                                Go to Exam Room
                              </Button>
                            </>
                          )}
                          {p.status === "admitted" && (
                            <Badge style={{ background: "rgba(148,163,184,0.15)", color: "#94A3B8", border: "none" }}>Not joined yet</Badge>
                          )}
                          {["called", "ready", "in_progress", "paused"].includes(p.status) && (
                            <Button size="sm" onClick={() => navigate(`/musabaqah/general/${id}/exam`)} style={{ background: "#60A5FA", color: "#06131f", fontWeight: 700 }}>
                              Enter Exam Room
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => toggleVideoAllowed(p)}
                            style={p.video_allowed === false ? { color: "#F87171", borderColor: "rgba(248,113,113,0.4)" } : {}}>
                            {p.video_allowed === false ? <><VideoOff size={14} className="mr-1" /> Video Off</> : <><Video size={14} className="mr-1" /> Video On</>}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => regenerateCode(p)}>
                            <RotateCcw size={14} className="mr-1" /> New Code
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => revokeCode(p)} style={{ color: "#F87171", borderColor: "rgba(248,113,113,0.4)" }}>
                            <Ban size={14} className="mr-1" /> Revoke
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => removeParticipant(p)} style={{ color: "rgba(255,255,255,0.4)" }}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── RESULTS ──────────────────────────────────────────────── */}
          <TabsContent value="results" className="mt-4">
            <ResultsPanel
              event={event}
              registrations={registrations}
              participants={participants}
              scoresByParticipant={scoresByParticipant}
              resultsLoading={resultsLoading}
              onViewBreakdown={setBreakdownFor}
              onReopen={reopenExamination}
              onPublish={publishResults}
              onVisibilityChange={(v: string) => saveEvent({ results_visibility: v })}
              onToggleLeaderboard={(v: boolean) => saveEvent({ leaderboard_enabled: v })}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* ── AI generation dialog ──────────────────────────────────────── */}
      <Dialog open={aiDialogOpen} onOpenChange={(o) => !aiGenerating && setAiDialogOpen(o)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle><Sparkles size={16} className="inline mr-1" /> Generate Questions with AI</DialogTitle>
          </DialogHeader>
          <div style={{ display: "grid", gap: 12 }}>
            <p style={{ fontSize: 12, color: "#6b7280", background: "#f9fafb", padding: 10, borderRadius: 8 }}>
              Grounded in this event's subject ({event?.subject}{event?.topic ? ` — ${event.topic}` : ""}) and the source/instructions you set in Overview.
              {event?.ai_auto_approve_questions
                ? " Auto-approve is ON — generated questions go straight into the live bank."
                : " Generated questions land in a review queue below — nothing reaches students until you approve it."}
            </p>
            {stages.length > 0 && (
              <Field label="Stage">
                <Select value={aiForm.stage_id} onValueChange={v => {
                  const stage = stages.find(s => s.id === v);
                  setAiForm({
                    ...aiForm,
                    stage_id: v,
                    ...(stage ? { categories: Array.isArray(stage.categories) && stage.categories.length ? stage.categories : aiForm.categories, difficulty: stage.difficulty, count: stage.question_count } : {}),
                  });
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Row2>
              <Field label="How many questions">
                <Input type="number" min={1} max={30} value={aiForm.count} onChange={e => setAiForm({ ...aiForm, count: Number(e.target.value) })} />
              </Field>
              <Field label="Difficulty">
                <Select value={aiForm.difficulty} onValueChange={v => setAiForm({ ...aiForm, difficulty: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DIFFICULTIES.map(d => <SelectItem key={d} value={d}>{labelize(d)}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </Row2>
            <Field label="Language">
              <Select value={aiForm.language} onValueChange={v => setAiForm({ ...aiForm, language: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="english">English only</SelectItem>
                  <SelectItem value="both">English + Arabic</SelectItem>
                  <SelectItem value="arabic">Arabic-led</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Categories to draw from">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {CATEGORIES.map(c => {
                  const active = aiForm.categories.includes(c);
                  return (
                    <button key={c} type="button"
                      onClick={() => setAiForm({ ...aiForm, categories: active ? aiForm.categories.filter(x => x !== c) : [...aiForm.categories, c] })}
                      style={{
                        padding: "4px 10px", borderRadius: 16, fontSize: 12, cursor: "pointer",
                        border: active ? "1.5px solid " + GOLD : "1px solid #d1d5db",
                        background: active ? "rgba(201,168,76,0.12)" : "transparent",
                        color: active ? "#92720f" : "#6b7280",
                      }}>
                      {labelize(c)}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Additional instructions (optional)">
              <Textarea rows={3} value={aiForm.instructions} onChange={e => setAiForm({ ...aiForm, instructions: e.target.value })}
                placeholder="e.g. Focus on memorization and translation, keep questions suitable for intermediate students." />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={aiGenerating} onClick={() => setAiDialogOpen(false)}>Cancel</Button>
            <Button onClick={generateWithAI} disabled={aiGenerating} style={{ background: BLUE_ACCENT, color: "#06131f", fontWeight: 700 }}>
              {aiGenerating ? <Loader2 size={16} className="animate-spin mr-1" /> : <Sparkles size={16} className="mr-1" />}
              {aiGenerating ? "Generating…" : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Score breakdown dialog ────────────────────────────────────── */}
      <Dialog open={!!breakdownFor} onOpenChange={(o) => !o && setBreakdownFor(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{breakdownFor?.participant_name} — Result Breakdown</DialogTitle>
          </DialogHeader>
          {breakdownFor && (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ textAlign: "center", padding: "8px 0" }}>
                <p style={{ fontSize: 32, fontWeight: 900, color: G, margin: 0 }}>{breakdownFor.total_score}</p>
                <p style={{ color: "#6b7280", fontSize: 13 }}>total marks</p>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {Object.entries(categoryBreakdown(breakdownFor.id)).map(([cat, v]: [string, any]) => (
                  <div key={cat}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                      <span>{labelize(cat)}</span>
                      <span>{v.earned}/{v.possible}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: "#e5e7eb", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${v.possible ? (v.earned / v.possible) * 100 : 0}%`, background: GOLD }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {(scoresByParticipant[breakdownFor.id] || []).map((s: any) => (
                  <div key={s.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, fontSize: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                      <span>{labelize(s.correctness || "")}</span>
                      <span>{s.score}/{s.max_score}</span>
                    </div>
                    {s.comment && <p style={{ color: "#6b7280", margin: "4px 0 0" }}>{s.comment}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Question dialog ───────────────────────────────────────────── */}
      <Dialog open={qDialogOpen} onOpenChange={setQDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{qDraft?.id ? "Edit Question" : "Add Question"}</DialogTitle>
          </DialogHeader>
          {qDraft && (
            <div style={{ display: "grid", gap: 12 }}>
              <Row2>
                <Field label="Category">
                  <Select value={qDraft.category} onValueChange={v => setQDraft({ ...qDraft, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{labelize(c)}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Question type">
                  <Select value={qDraft.question_type} onValueChange={v => setQDraft({ ...qDraft, question_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{QUESTION_TYPES.map(t => <SelectItem key={t} value={t}>{labelize(t)}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </Row2>

              <Field label="Question (English)">
                <Textarea rows={2} value={qDraft.question_text} onChange={e => setQDraft({ ...qDraft, question_text: e.target.value })} />
              </Field>
              <Field label="Question (Arabic) — optional">
                <Textarea dir="rtl" rows={2} placeholder="مشكول بالتشكيل الكامل" style={{ fontFamily: "'Amiri', 'Noto Naskh Arabic', serif", fontSize: 16 }} value={qDraft.question_text_ar} onChange={e => setQDraft({ ...qDraft, question_text_ar: e.target.value })} />
              </Field>
              <Field label="Expected answer / rubric notes for the judge">
                <Textarea rows={2} value={qDraft.expected_answer} onChange={e => setQDraft({ ...qDraft, expected_answer: e.target.value })} />
              </Field>
              <Field label="Source reference">
                <Input value={qDraft.source_reference} onChange={e => setQDraft({ ...qDraft, source_reference: e.target.value })} placeholder="e.g. An-Nawawi Hadith 1" />
              </Field>

              <Row2>
                <Field label="Marks">
                  <Input type="number" min={1} value={qDraft.marks} onChange={e => setQDraft({ ...qDraft, marks: e.target.value })} />
                </Field>
                <Field label="Difficulty">
                  <Select value={qDraft.difficulty} onValueChange={v => setQDraft({ ...qDraft, difficulty: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DIFFICULTIES.map(d => <SelectItem key={d} value={d}>{labelize(d)}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </Row2>

              <Field label="Stage">
                <Select value={qDraft.stage_id || ""} onValueChange={v => setQDraft({ ...qDraft, stage_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose a stage" /></SelectTrigger>
                  <SelectContent>
                    {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveQuestion} disabled={qSaving} style={{ background: G, color: "#fff" }}>
              {qSaving ? <Loader2 size={16} className="animate-spin mr-1" /> : <Save size={16} className="mr-1" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Stage dialog ───────────────────────────────────────────────── */}
      <Dialog open={stageDialogOpen} onOpenChange={setStageDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{stageDraft?.id ? "Edit Stage" : "Add Stage"}</DialogTitle>
          </DialogHeader>
          {stageDraft && (
            <div style={{ display: "grid", gap: 12 }}>
              <Field label="Stage name">
                <Input value={stageDraft.name} onChange={e => setStageDraft({ ...stageDraft, name: e.target.value })} placeholder="e.g. Memorization" />
              </Field>
              <Row2>
                <Field label="Difficulty">
                  <Select value={stageDraft.difficulty} onValueChange={v => setStageDraft({ ...stageDraft, difficulty: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DIFFICULTIES.map(d => <SelectItem key={d} value={d}>{labelize(d)}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Questions per student">
                  <Input type="number" min={1} value={stageDraft.question_count} onChange={e => setStageDraft({ ...stageDraft, question_count: e.target.value })} />
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
                    How many questions from this stage's bank a student must answer before advancing — not the bank size. For a "pick one tile, answer it, move on" format, use 1.
                  </p>
                </Field>
              </Row2>
              <Field label="Time limit for this stage (minutes)">
                <Input type="number" min={0} value={stageDraft.time_limit_seconds} onChange={e => setStageDraft({ ...stageDraft, time_limit_seconds: e.target.value })} placeholder="Uses the event's overall exam timer" />
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
                  Countdown a participant gets once this stage becomes active. Leave blank to fall back to the event's overall exam time limit.
                </p>
              </Field>
              <Field label="Categories for this stage">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {CATEGORIES.map(c => {
                    const active = stageDraft.categories.includes(c);
                    return (
                      <button key={c} type="button"
                        onClick={() => setStageDraft({ ...stageDraft, categories: active ? stageDraft.categories.filter((x: string) => x !== c) : [...stageDraft.categories, c] })}
                        style={{
                          padding: "4px 10px", borderRadius: 16, fontSize: 12, cursor: "pointer",
                          border: active ? "1.5px solid " + GOLD : "1px solid #d1d5db",
                          background: active ? "rgba(201,168,76,0.12)" : "transparent",
                          color: active ? "#92720f" : "#6b7280",
                        }}>
                        {labelize(c)}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStageDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveStage} disabled={stageSaving} style={{ background: G, color: "#fff" }}>
              {stageSaving ? <Loader2 size={16} className="animate-spin mr-1" /> : <Save size={16} className="mr-1" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResultsPanel({
  event, registrations, participants, scoresByParticipant, resultsLoading,
  onViewBreakdown, onReopen, onPublish, onVisibilityChange, onToggleLeaderboard,
}: any) {
  const finalized = participants.filter((p: any) => ["completed", "finalized"].includes(p.status));
  const waiting = participants.filter((p: any) => ["admitted", "waiting"].includes(p.status));
  const examining = participants.filter((p: any) => ["called", "ready", "in_progress", "paused"].includes(p.status));
  const avgScore = finalized.length ? (finalized.reduce((s: number, p: any) => s + Number(p.total_score || 0), 0) / finalized.length) : 0;
  const leaderboard = [...finalized].sort((a: any, b: any) => Number(b.total_score) - Number(a.total_score));

  const totalPossible = (p: any) => {
    const rows = scoresByParticipant[p.id] || [];
    if (rows.length) return rows.reduce((s: number, r: any) => s + Number(r.max_score), 0);
    return event?.total_marks || (event?.num_questions_per_student || 0) * (event?.marks_per_question || 0);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Dashboard summary (Section 40) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10 }}>
        <StatCard label="Registered" value={registrations.length} />
        <StatCard label="Waiting" value={waiting.length} />
        <StatCard label="Examining" value={examining.length} />
        <StatCard label="Completed" value={finalized.length} />
        <StatCard label="Average Score" value={avgScore ? avgScore.toFixed(1) : "—"} accent />
      </div>

      {/* Publication controls (Section 29) */}
      <Card style={{ background: GM, border: "1px solid rgba(201,168,76,0.2)" }}>
        <CardContent className="pt-4 pb-4">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div>
              <p style={{ color: "#fff", fontWeight: 700, fontSize: 13, margin: 0 }}>Results visibility</p>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, margin: "2px 0 0" }}>
                {event?.results_visibility === "published" ? "Published — students can see their results and the leaderboard." :
                 event?.results_visibility === "visible_after_completion" ? "Students see their own result once finalized." :
                 "Private — only staff can see results."}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Select value={event?.results_visibility} onValueChange={onVisibilityChange}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="visible_after_completion">Visible after completion</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
              {event?.results_visibility !== "published" && (
                <Button size="sm" onClick={onPublish} style={{ background: GOLD, color: G, fontWeight: 700 }}>
                  <Trophy size={14} className="mr-1" /> Publish
                </Button>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 12 }}>
            <Label style={{ color: "#fff", fontSize: 13 }}>Leaderboard enabled</Label>
            <Switch checked={!!event?.leaderboard_enabled} onCheckedChange={onToggleLeaderboard} />
          </div>
        </CardContent>
      </Card>

      {/* Per-participant results */}
      {resultsLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 30 }}>
          <Loader2 className="animate-spin" color={GOLD} size={22} />
        </div>
      ) : finalized.length === 0 ? (
        <Card style={{ background: GM, border: "1px solid rgba(201,168,76,0.2)" }}>
          <CardContent className="pt-6 pb-6 text-center">
            <BarChart3 size={26} color={GOLD} style={{ margin: "0 auto 8px" }} />
            <p style={{ color: "rgba(255,255,255,0.6)" }}>No finalized results yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {finalized.map((p: any) => {
            const possible = totalPossible(p);
            const pct = possible ? Math.round((Number(p.total_score) / possible) * 100) : 0;
            const passed = event?.passing_score != null ? Number(p.total_score) >= Number(event.passing_score) : null;
            return (
              <Card key={p.id} style={{ background: GM, border: "1px solid rgba(201,168,76,0.15)" }}>
                <CardContent className="pt-4 pb-4">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ color: "#fff", fontWeight: 700 }}>{p.participant_name}</span>
                        {passed !== null && (
                          <Badge style={{ background: passed ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)", color: passed ? "#4ADE80" : "#F87171", border: "none" }}>
                            {passed ? "Passed" : "Below passing"}
                          </Badge>
                        )}
                      </div>
                      <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{p.total_score}/{possible} · {pct}%</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Button size="sm" variant="outline" onClick={() => onViewBreakdown(p)}>
                        <Eye size={14} className="mr-1" /> Breakdown
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onReopen(p)} style={{ color: "rgba(255,255,255,0.5)" }}>
                        <RefreshCcw size={14} className="mr-1" /> Reopen
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Leaderboard preview */}
      {event?.leaderboard_enabled && leaderboard.length > 0 && (
        <div>
          <p style={{ color: GOLD, fontWeight: 700, fontSize: 13, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <Award size={15} /> Leaderboard
          </p>
          <div style={{ display: "grid", gap: 6 }}>
            {leaderboard.slice(0, 10).map((p: any, i: number) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 8, background: i === 0 ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.03)" }}>
                <span style={{ color: "#fff", fontSize: 13 }}>#{i + 1} {p.participant_name}</span>
                <span style={{ color: GOLD, fontWeight: 700, fontSize: 13 }}>{p.total_score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
function StatCard({ label, value, accent }: { label: string; value: any; accent?: boolean }) {
  return (
    <div style={{ background: GM, border: "1px solid rgba(201,168,76,0.2)", borderRadius: 10, padding: "12px 10px", textAlign: "center" }}>
      <p style={{ color: accent ? GOLD : "#fff", fontSize: 20, fontWeight: 900, margin: 0 }}>{value}</p>
      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, margin: "2px 0 0" }}>{label}</p>
    </div>
  );
}
function labelize(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
function RegStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; c: string }> = {
    pending:      { bg: "rgba(251,191,36,0.15)", c: "#FBBF24" },
    approved:     { bg: "rgba(74,222,128,0.15)", c: "#4ADE80" },
    admitted:     { bg: "rgba(74,222,128,0.15)", c: "#4ADE80" },
    rejected:     { bg: "rgba(248,113,113,0.15)", c: "#F87171" },
    waitlisted:   { bg: "rgba(251,191,36,0.15)", c: "#FBBF24" },
    completed:    { bg: "rgba(201,168,76,0.15)", c: GOLD },
    disqualified: { bg: "rgba(248,113,113,0.15)", c: "#F87171" },
  };
  const s = map[status] || { bg: "rgba(148,163,184,0.15)", c: "#94A3B8" };
  return <Badge style={{ background: s.bg, color: s.c, border: "none" }}>{labelize(status)}</Badge>;
}
function ParticipantStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; c: string }> = {
    admitted:     { bg: "rgba(148,163,184,0.15)", c: "#94A3B8" },
    waiting:      { bg: "rgba(148,163,184,0.15)", c: "#94A3B8" },
    called:       { bg: "rgba(74,222,128,0.15)", c: "#4ADE80" },
    ready:        { bg: "rgba(74,222,128,0.15)", c: "#4ADE80" },
    in_progress:  { bg: "rgba(96,165,250,0.15)", c: "#60A5FA" },
    paused:       { bg: "rgba(248,113,113,0.15)", c: "#F87171" },
    disconnected: { bg: "rgba(248,113,113,0.15)", c: "#F87171" },
    resuming:     { bg: "rgba(251,191,36,0.15)", c: "#FBBF24" },
    completed:    { bg: "rgba(201,168,76,0.15)", c: GOLD },
    finalized:    { bg: "rgba(201,168,76,0.15)", c: GOLD },
    disqualified: { bg: "rgba(248,113,113,0.15)", c: "#F87171" },
  };
  const s = map[status] || { bg: "rgba(148,163,184,0.15)", c: "#94A3B8" };
  return <Badge style={{ background: s.bg, color: s.c, border: "none" }}>{labelize(status)}</Badge>;
}
function Row2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-2.5">{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <Label style={{ fontSize: 12, marginBottom: 4, display: "block", color: "inherit" }}>{label}</Label>
      {children}
    </div>
  );
}
