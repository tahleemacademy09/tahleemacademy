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
import { useEffect, useMemo, useState } from "react";
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
import {
  ArrowLeft, Plus, Loader2, Trash2, Pencil, Save, ScrollText,
  CheckCircle2, XCircle, Clock3, Copy, UserCheck, UserX, Users,
  KeyRound, RotateCcw, Ban, PhoneCall, SkipForward, Trophy,
  BarChart3, Eye, RefreshCcw, Award,
} from "lucide-react";

const G    = "#0f2d1f";
const GM   = "#163d28";
const GOLD = "#c9a84c";

const CATEGORIES = [
  "memorization","narrator","arabic_text","translation","vocabulary",
  "explanation","lessons","comprehension","application","related_principles","identification",
] as const;
const QUESTION_TYPES = [
  "mcq","true_false","short_answer","oral","recitation","translation","explanation","comprehension","continuation",
] as const;
const DIFFICULTIES = ["easy","medium","hard","expert"] as const;

const emptyQuestion = (eventId: string) => ({
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
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const [registrations, setRegistrations] = useState<any[]>([]);
  const [rLoading, setRLoading]           = useState(true);
  const [actingOn, setActingOn]           = useState<string | null>(null);

  const [participants, setParticipants]   = useState<any[]>([]);
  const [pLoading, setPLoading]           = useState(true);

  const [resultsLoading, setResultsLoading] = useState(true);
  const [scoresByParticipant, setScoresByParticipant] = useState<Record<string, any[]>>({});
  const [breakdownFor, setBreakdownFor] = useState<any | null>(null);


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

  useEffect(() => { loadEvent(); loadQuestions(); loadRegistrations(); loadParticipants(); loadResults(); }, [id]);

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

  const removeParticipant = async (participant: any) => {
    if (!window.confirm(`Remove ${participant.participant_name} from this Musabaqah?`)) return;
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


  const callParticipant = async (participant: any) => {
    if (!id) return;
    const { error: e1 } = await supabase.from("general_musabaqah_participants")
      .update({ status: "called" }).eq("id", participant.id);
    const { error: e2 } = await supabase.from("general_musabaqah_events")
      .update({ current_participant_id: participant.id }).eq("id", id);
    if (e1 || e2) {
      toast({ title: "Call failed", description: (e1 || e2)?.message, variant: "destructive" });
      return;
    }
    await supabase.from("general_musabaqah_event_log").insert({
      event_id: id, participant_id: participant.id, action_type: "called",
      description: `${participant.participant_name} called to examination`, created_by: user?.id ?? null,
    });
    toast({ title: `Calling ${participant.participant_name}…` });
    loadParticipants();
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

  const openNewQuestion = () => { setQDraft(emptyQuestion(id!)); setQDialogOpen(true); };
  const openEditQuestion = (q: any) => { setQDraft({ ...q }); setQDialogOpen(true); };

  const saveQuestion = async () => {
    if (!qDraft.question_text.trim()) {
      toast({ title: "Question text is required", variant: "destructive" });
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

  const filteredQuestions = useMemo(
    () => categoryFilter === "all" ? questions : questions.filter(q => q.category === categoryFilter),
    [questions, categoryFilter]
  );

  if (loading || !event) {
    return (
      <div style={{ minHeight: "100%", background: G, display: "flex", justifyContent: "center", alignItems: "center" }}>
        <Loader2 className="animate-spin" color={GOLD} size={28} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100%", background: `linear-gradient(160deg, ${G} 0%, #0a1f12 60%, #050f09 100%)`, padding: "20px 16px 56px", fontFamily: "'Cairo', sans-serif" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <button onClick={() => navigate("/musabaqah/general")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 6, marginBottom: 12, cursor: "pointer", fontSize: 13 }}>
          <ArrowLeft size={14} /> All General Musabaqah events
        </button>

        <div style={{ marginBottom: 16 }}>
          <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 800, margin: 0 }}>{event.title}</h1>
          <p style={{ color: GOLD, fontSize: 13, fontWeight: 600, margin: "4px 0 0" }}>
            {event.subject}{event.topic ? ` — ${event.topic}` : ""}
          </p>
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="questions">
              Question Bank {questions.length > 0 && <Badge className="ml-1.5" variant="secondary">{questions.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="registrations">
              Registrations {registrations.filter(r => r.status === "pending").length > 0 &&
                <Badge className="ml-1.5" style={{ background: "#FBBF24", color: "#1a1400" }}>{registrations.filter(r => r.status === "pending").length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="queue">Queue</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
          </TabsList>

          {/* ── OVERVIEW ─────────────────────────────────────────────── */}
          <TabsContent value="overview" className="mt-4">
            <Card style={{ background: GM, border: "1px solid rgba(201,168,76,0.2)" }}>
              <CardContent className="pt-6 grid gap-4 text-white">
                <Field label="Status">
                  <Select value={event.status} onValueChange={v => saveEvent({ status: v })}>
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
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
                    <Input defaultValue={event.title} onBlur={e => e.target.value !== event.title && saveEvent({ title: e.target.value })} />
                  </Field>
                  <Field label="Subject">
                    <Input defaultValue={event.subject} onBlur={e => e.target.value !== event.subject && saveEvent({ subject: e.target.value })} />
                  </Field>
                </Row2>
                <Row2>
                  <Field label="Topic">
                    <Input defaultValue={event.topic || ""} onBlur={e => e.target.value !== event.topic && saveEvent({ topic: e.target.value || null })} />
                  </Field>
                  <Field label="Target level">
                    <Input defaultValue={event.target_level || ""} onBlur={e => e.target.value !== event.target_level && saveEvent({ target_level: e.target.value || null })} />
                  </Field>
                </Row2>
                <Field label="Description">
                  <Textarea rows={2} defaultValue={event.description || ""} onBlur={e => e.target.value !== event.description && saveEvent({ description: e.target.value || null })} />
                </Field>
                <Field label="Instructions">
                  <Textarea rows={2} defaultValue={event.instructions || ""} onBlur={e => e.target.value !== event.instructions && saveEvent({ instructions: e.target.value || null })} />
                </Field>

                <Row2>
                  <Field label="Competition date">
                    <Input type="date" defaultValue={event.competition_date || ""} onBlur={e => e.target.value !== event.competition_date && saveEvent({ competition_date: e.target.value || null })} />
                  </Field>
                  <Field label="Questions per student">
                    <Input type="number" defaultValue={event.num_questions_per_student}
                      onBlur={e => Number(e.target.value) !== event.num_questions_per_student && saveEvent({ num_questions_per_student: Number(e.target.value) })} />
                  </Field>
                </Row2>
                <Row2>
                  <Field label="Marks per question">
                    <Input type="number" defaultValue={event.marks_per_question}
                      onBlur={e => Number(e.target.value) !== event.marks_per_question && saveEvent({ marks_per_question: Number(e.target.value) })} />
                  </Field>
                  <Field label="Max exam time (sec)">
                    <Input type="number" defaultValue={event.max_exam_time_seconds}
                      onBlur={e => Number(e.target.value) !== event.max_exam_time_seconds && saveEvent({ max_exam_time_seconds: Number(e.target.value) })} />
                  </Field>
                </Row2>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Label style={{ color: "#fff", fontSize: 13 }}>Randomize questions</Label>
                  <Switch checked={event.randomize_questions} onCheckedChange={v => saveEvent({ randomize_questions: v })} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Label style={{ color: "#fff", fontSize: 13 }}>Connection loss pauses timer</Label>
                  <Switch checked={event.connection_loss_pauses_timer} onCheckedChange={v => saveEvent({ connection_loss_pauses_timer: v })} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Label style={{ color: "#fff", fontSize: 13 }}>Leaderboard enabled</Label>
                  <Switch checked={event.leaderboard_enabled} onCheckedChange={v => saveEvent({ leaderboard_enabled: v })} />
                </div>

                {saving && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Saving…</span>}

                <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 12, color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
                  Set status to "Registration Open" so students can find and register for this event.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── QUESTIONS ────────────────────────────────────────────── */}
          <TabsContent value="questions" className="mt-4">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{labelize(c)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={openNewQuestion} style={{ background: GOLD, color: G, fontWeight: 700 }}>
                <Plus size={16} className="mr-1" /> Add Question
              </Button>
            </div>

            {qLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                <Loader2 className="animate-spin" color={GOLD} size={24} />
              </div>
            ) : filteredQuestions.length === 0 ? (
              <Card style={{ background: GM, border: "1px solid rgba(201,168,76,0.2)" }}>
                <CardContent className="pt-6 pb-6 text-center">
                  <ScrollText size={28} color={GOLD} style={{ margin: "0 auto 10px" }} />
                  <p style={{ color: "rgba(255,255,255,0.65)" }}>No questions yet. Add the first one manually — AI generation arrives in Phase 2.</p>
                </CardContent>
              </Card>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {filteredQuestions.map(q => (
                  <Card key={q.id} style={{ background: GM, border: "1px solid rgba(201,168,76,0.15)" }}>
                    <CardContent className="pt-4 pb-4">
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                            <Badge variant="secondary">{labelize(q.category)}</Badge>
                            <Badge variant="outline" style={{ color: "#fff", borderColor: "rgba(255,255,255,0.25)" }}>{labelize(q.question_type)}</Badge>
                            <Badge variant="outline" style={{ color: "#fff", borderColor: "rgba(255,255,255,0.25)" }}>{labelize(q.difficulty)}</Badge>
                            <Badge style={{ background: "rgba(201,168,76,0.15)", color: GOLD, border: "none" }}>{q.marks} marks</Badge>
                            {q.status === "approved"
                              ? <Badge style={{ background: "rgba(74,222,128,0.15)", color: "#4ADE80", border: "none" }}><CheckCircle2 size={11} className="mr-1" />Approved</Badge>
                              : <Badge style={{ background: "rgba(251,191,36,0.15)", color: "#FBBF24", border: "none" }}><Clock3 size={11} className="mr-1" />{labelize(q.status)}</Badge>}
                          </div>
                          <p style={{ color: "#fff", fontSize: 14, margin: 0 }}>{q.question_text}</p>
                          {q.question_text_ar && <p dir="rtl" style={{ color: "rgba(255,255,255,0.8)", fontSize: 15, margin: "4px 0 0" }}>{q.question_text_ar}</p>}
                          {q.expected_answer && <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, margin: "6px 0 0" }}>Expected: {q.expected_answer}</p>}
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
              Manage admitted participants and call the next student. The full live judging room (video, question navigator, scoring) ships in the next chunk — this confirms the queue and call flow end-to-end.
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
                          {["waiting", "admitted"].includes(p.status) && (
                            <Button size="sm" onClick={() => callParticipant(p)} style={{ background: "#60A5FA", color: "#06131f", fontWeight: 700 }}>
                              <PhoneCall size={14} className="mr-1" /> Call
                            </Button>
                          )}
                          {["called", "ready", "in_progress", "paused"].includes(p.status) && (
                            <Button size="sm" onClick={() => navigate(`/musabaqah/general/${id}/exam`)} style={{ background: "#60A5FA", color: "#06131f", fontWeight: 700 }}>
                              Enter Exam Room
                            </Button>
                          )}
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
                <Textarea dir="rtl" rows={2} value={qDraft.question_text_ar} onChange={e => setQDraft({ ...qDraft, question_text_ar: e.target.value })} />
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
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label style={{ fontSize: 12, marginBottom: 4, display: "block", color: "inherit" }}>{label}</Label>
      {children}
    </div>
  );
}
