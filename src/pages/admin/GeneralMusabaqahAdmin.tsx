/*
  src/pages/admin/GeneralMusabaqahAdmin.tsx
  ─────────────────────────────────────────────────────────────
  Admin landing page for the General Subject Musabaqah module
  (Phase 1 — Section 5 of the spec).

  Lists every general_musabaqah_events row and lets the admin
  create/edit one. Clicking a card opens GeneralMusabaqahEventDetail
  (question bank + registrations + live control room live there).

  Does not touch the existing Quran Musabaqah or Quiz Musabaqah pages.
*/
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, BookOpen, Users, Calendar, Clock, Loader2, ChevronRight,
  Gavel, Settings2, Trash2, ScrollText,
} from "lucide-react";

const G    = "#0f2d1f";
const GM   = "#163d28";
const GOLD = "#c9a84c";

type GMEvent = {
  id: string;
  title: string;
  subject: string;
  topic: string | null;
  status: string;
  competition_date: string | null;
  num_questions_per_student: number;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  created_at: string;
};

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  draft:                 { bg: "rgba(148,163,184,0.15)", text: "#94A3B8", label: "Draft" },
  registration_open:      { bg: "rgba(74,222,128,0.15)",  text: "#4ADE80", label: "Registration Open" },
  registration_closed:    { bg: "rgba(251,191,36,0.15)",  text: "#FBBF24", label: "Registration Closed" },
  in_progress:            { bg: "rgba(96,165,250,0.15)",  text: "#60A5FA", label: "In Progress" },
  paused:                { bg: "rgba(248,113,113,0.15)", text: "#F87171", label: "Paused" },
  completed:              { bg: "rgba(201,168,76,0.15)",  text: GOLD,      label: "Completed" },
  archived:               { bg: "rgba(100,116,139,0.15)", text: "#64748B", label: "Archived" },
};

const emptyDraft = () => ({
  title: "",
  subject: "",
  topic: "",
  description: "",
  instructions: "",
  source_reference: "",
  target_level: "",
  registration_opens_at: "",
  registration_closes_at: "",
  competition_date: "",
  start_time: "",
  timezone: "Africa/Lagos",
  num_questions_per_student: 10,
  question_selection_method: "hybrid",
  marks_per_question: 10,
  max_exam_time_seconds: 900,
  num_judges: 1,
  judge_scoring_system: "single",
  judges_can_modify_marks: true,
  randomize_questions: true,
  allow_question_repeat: false,
  max_attempts: 1,
  connection_loss_pauses_timer: true,
  results_visibility: "private",
  leaderboard_enabled: false,
});

export default function GeneralMusabaqahAdmin() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isStaff = hasRole("admin") || hasRole("teacher");

  const [events, setEvents]     = useState<GMEvent[]>([]);
  const [loading, setLoading]   = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [draft, setDraft]       = useState<any>(emptyDraft());

  useEffect(() => { if (!isStaff) navigate("/student/musabaqah"); }, [isStaff]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("general_musabaqah_events")
      .select("id,title,subject,topic,status,competition_date,num_questions_per_student,registration_opens_at,registration_closes_at,created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load events", description: error.message, variant: "destructive" });
    } else {
      setEvents((data as GMEvent[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setDraft(emptyDraft());
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!draft.title.trim() || !draft.subject.trim()) {
      toast({ title: "Title and subject are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: Record<string, any> = {
      title: draft.title.trim(),
      subject: draft.subject.trim(),
      topic: draft.topic.trim() || null,
      description: draft.description.trim() || null,
      instructions: draft.instructions.trim() || null,
      source_reference: draft.source_reference.trim() || null,
      target_level: draft.target_level.trim() || null,
      registration_opens_at: draft.registration_opens_at || null,
      registration_closes_at: draft.registration_closes_at || null,
      competition_date: draft.competition_date || null,
      start_time: draft.start_time || null,
      timezone: draft.timezone,
      num_questions_per_student: Number(draft.num_questions_per_student) || 10,
      question_selection_method: draft.question_selection_method,
      marks_per_question: Number(draft.marks_per_question) || 10,
      max_exam_time_seconds: Number(draft.max_exam_time_seconds) || 900,
      num_judges: Number(draft.num_judges) || 1,
      judge_scoring_system: draft.judge_scoring_system,
      judges_can_modify_marks: draft.judges_can_modify_marks,
      randomize_questions: draft.randomize_questions,
      allow_question_repeat: draft.allow_question_repeat,
      max_attempts: Number(draft.max_attempts) || 1,
      connection_loss_pauses_timer: draft.connection_loss_pauses_timer,
      results_visibility: draft.results_visibility,
      leaderboard_enabled: draft.leaderboard_enabled,
      created_by: user?.id ?? null,
    };
    const { data, error } = await supabase
      .from("general_musabaqah_events")
      .insert(payload)
      .select("id")
      .single();
    setSaving(false);
    if (error) {
      toast({ title: "Could not create Musabaqah", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Musabaqah created" });
    setDialogOpen(false);
    await load();
    if (data?.id) navigate(`/musabaqah/general/${data.id}`);
  };

  const deleteEvent = async (id: string, title: string) => {
    if (!window.confirm(`Delete "${title}"? This removes all its questions, registrations and results.`)) return;
    const { error } = await supabase.from("general_musabaqah_events").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Musabaqah deleted" });
      setEvents(prev => prev.filter(e => e.id !== id));
    }
  };

  return (
    <div style={{
      minHeight: "100%",
      background: `linear-gradient(160deg, ${G} 0%, #0a1f12 60%, #050f09 100%)`,
      padding: "24px 16px 56px",
      fontFamily: "'Cairo', sans-serif",
    }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 800, margin: 0 }}>General Subject Musabaqah</h1>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: "4px 0 0" }}>
              Hadith, Fiqh, Tawheed, Nahw and any other subject — live oral examinations.
            </p>
          </div>
          <Button onClick={openCreate} style={{ background: GOLD, color: G, fontWeight: 700 }}>
            <Plus size={16} className="mr-1" /> New Musabaqah
          </Button>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
            <Loader2 className="animate-spin" color={GOLD} size={28} />
          </div>
        ) : events.length === 0 ? (
          <Card style={{ background: GM, border: "1px solid rgba(201,168,76,0.2)" }}>
            <CardContent className="pt-6 pb-6 text-center">
              <BookOpen size={32} color={GOLD} style={{ margin: "0 auto 12px" }} />
              <p style={{ color: "rgba(255,255,255,0.7)", marginBottom: 16 }}>
                No General Subject Musabaqah events yet.
              </p>
              <Button onClick={openCreate} style={{ background: GOLD, color: G, fontWeight: 700 }}>
                Create the first one
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {events.map(ev => {
              const sc = STATUS_COLORS[ev.status] || STATUS_COLORS.draft;
              return (
                <Card
                  key={ev.id}
                  onClick={() => navigate(`/musabaqah/general/${ev.id}`)}
                  style={{ background: GM, border: "1px solid rgba(201,168,76,0.2)", cursor: "pointer" }}
                  className="hover:border-[rgba(201,168,76,0.5)] transition-colors"
                >
                  <CardContent className="pt-5 pb-5">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                          <h3 style={{ color: "#fff", fontSize: 17, fontWeight: 700, margin: 0 }}>{ev.title}</h3>
                          <Badge style={{ background: sc.bg, color: sc.text, border: "none" }}>{sc.label}</Badge>
                        </div>
                        <p style={{ color: GOLD, fontSize: 13, fontWeight: 600, margin: "0 0 4px" }}>
                          {ev.subject}{ev.topic ? ` — ${ev.topic}` : ""}
                        </p>
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <Calendar size={12} /> {ev.competition_date || "No date set"}
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <ScrollText size={12} /> {ev.num_questions_per_student} Q/student
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Button
                          variant="ghost" size="icon"
                          onClick={(e) => { e.stopPropagation(); deleteEvent(ev.id, ev.title); }}
                          style={{ color: "rgba(255,255,255,0.4)" }}
                        >
                          <Trash2 size={16} />
                        </Button>
                        <ChevronRight size={20} color="rgba(255,255,255,0.4)" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Create dialog ─────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create General Subject Musabaqah</DialogTitle>
          </DialogHeader>

          <div style={{ display: "grid", gap: 16, paddingTop: 8 }}>
            <Section title="Basic Information" icon={<BookOpen size={14} />}>
              <FieldRow>
                <Field label="Title *">
                  <Input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })}
                    placeholder="e.g. An-Nawawi Hadith Musabaqah" />
                </Field>
                <Field label="Subject *">
                  <Input value={draft.subject} onChange={e => setDraft({ ...draft, subject: e.target.value })}
                    placeholder="Hadith, Fiqh, Tawheed, Nahw..." />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="Topic">
                  <Input value={draft.topic} onChange={e => setDraft({ ...draft, topic: e.target.value })}
                    placeholder="e.g. An-Nawawi Hadith 1–5" />
                </Field>
                <Field label="Target Level">
                  <Input value={draft.target_level} onChange={e => setDraft({ ...draft, target_level: e.target.value })}
                    placeholder="e.g. Intermediate" />
                </Field>
              </FieldRow>
              <Field label="Description">
                <Textarea rows={2} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
              </Field>
              <Field label="Instructions for students">
                <Textarea rows={2} value={draft.instructions} onChange={e => setDraft({ ...draft, instructions: e.target.value })} />
              </Field>
              <Field label="Source / reference material (notes)">
                <Textarea rows={2} value={draft.source_reference} onChange={e => setDraft({ ...draft, source_reference: e.target.value })}
                  placeholder="Describe the source text — full upload/AI grounding comes in Phase 2" />
              </Field>
            </Section>

            <Section title="Schedule" icon={<Calendar size={14} />}>
              <FieldRow>
                <Field label="Registration opens">
                  <Input type="datetime-local" value={draft.registration_opens_at}
                    onChange={e => setDraft({ ...draft, registration_opens_at: e.target.value })} />
                </Field>
                <Field label="Registration closes">
                  <Input type="datetime-local" value={draft.registration_closes_at}
                    onChange={e => setDraft({ ...draft, registration_closes_at: e.target.value })} />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="Competition date">
                  <Input type="date" value={draft.competition_date}
                    onChange={e => setDraft({ ...draft, competition_date: e.target.value })} />
                </Field>
                <Field label="Start time">
                  <Input type="datetime-local" value={draft.start_time}
                    onChange={e => setDraft({ ...draft, start_time: e.target.value })} />
                </Field>
              </FieldRow>
            </Section>

            <Section title="Competition Configuration" icon={<Settings2 size={14} />}>
              <FieldRow>
                <Field label="Questions per student">
                  <Input type="number" min={1} value={draft.num_questions_per_student}
                    onChange={e => setDraft({ ...draft, num_questions_per_student: e.target.value })} />
                </Field>
                <Field label="Marks per question">
                  <Input type="number" min={1} value={draft.marks_per_question}
                    onChange={e => setDraft({ ...draft, marks_per_question: e.target.value })} />
                </Field>
              </FieldRow>
              <FieldRow>
                <Field label="Max exam time (seconds)">
                  <Input type="number" min={60} value={draft.max_exam_time_seconds}
                    onChange={e => setDraft({ ...draft, max_exam_time_seconds: e.target.value })} />
                </Field>
                <Field label="Max attempts">
                  <Input type="number" min={1} value={draft.max_attempts}
                    onChange={e => setDraft({ ...draft, max_attempts: e.target.value })} />
                </Field>
              </FieldRow>
              <Field label="Question selection method">
                <Select value={draft.question_selection_method} onValueChange={v => setDraft({ ...draft, question_selection_method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual (judge chooses)</SelectItem>
                    <SelectItem value="random">Random</SelectItem>
                    <SelectItem value="category_based">Category-based</SelectItem>
                    <SelectItem value="hybrid">Hybrid (recommended)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <ToggleRow label="Randomize questions" checked={draft.randomize_questions}
                onChange={v => setDraft({ ...draft, randomize_questions: v })} />
              <ToggleRow label="Allow question repeat across students" checked={draft.allow_question_repeat}
                onChange={v => setDraft({ ...draft, allow_question_repeat: v })} />
              <ToggleRow label="Connection loss pauses the timer" checked={draft.connection_loss_pauses_timer}
                onChange={v => setDraft({ ...draft, connection_loss_pauses_timer: v })} />
            </Section>

            <Section title="Judges" icon={<Gavel size={14} />}>
              <FieldRow>
                <Field label="Number of judges">
                  <Input type="number" min={1} value={draft.num_judges}
                    onChange={e => setDraft({ ...draft, num_judges: e.target.value })} />
                </Field>
                <Field label="Scoring system">
                  <Select value={draft.judge_scoring_system} onValueChange={v => setDraft({ ...draft, judge_scoring_system: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single judge</SelectItem>
                      <SelectItem value="averaged">Averaged across judges</SelectItem>
                      <SelectItem value="lead_override">Lead judge can override</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldRow>
              <ToggleRow label="Judges can modify marks" checked={draft.judges_can_modify_marks}
                onChange={v => setDraft({ ...draft, judges_can_modify_marks: v })} />
            </Section>

            <Section title="Results" icon={<Users size={14} />}>
              <Field label="Results visibility">
                <Select value={draft.results_visibility} onValueChange={v => setDraft({ ...draft, results_visibility: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Private (admin only)</SelectItem>
                    <SelectItem value="visible_after_completion">Visible after completion</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <ToggleRow label="Enable leaderboard" checked={draft.leaderboard_enabled}
                onChange={v => setDraft({ ...draft, leaderboard_enabled: v })} />
            </Section>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} style={{ background: G, color: "#fff" }}>
              {saving ? <Loader2 size={16} className="animate-spin mr-1" /> : null}
              Create Musabaqah
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── small layout helpers ──────────────────────────────────────────── */
function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, fontWeight: 700, fontSize: 13, color: "#374151" }}>
        {icon} {title}
      </div>
      <div style={{ display: "grid", gap: 10 }}>{children}</div>
    </div>
  );
}
function FieldRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label style={{ fontSize: 12, marginBottom: 4, display: "block" }}>{label}</Label>
      {children}
    </div>
  );
}
function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Label style={{ fontSize: 13 }}>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
