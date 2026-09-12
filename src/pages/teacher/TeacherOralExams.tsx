// src/pages/teacher/TeacherOralExams.tsx
// ─────────────────────────────────────────────────────────────────────────
// Live oral / viva exams. Self-contained (like Musabaqah) rather than bolted
// onto the written-exam flow: teacher creates an oral exam, sets up time
// slots (allocated to a student, or left open for self-pick), builds one or
// more question-draw "sets" — each organised into manually-added STAGES
// (e.g. Recitation / Tajweed / Meaning), with AI generation (prompt → new
// bilingual questions, or paste → reorganise existing ones into stages) —
// then runs the live room on exam day: admit waiting students, call one in
// at a time, walk them stage by stage, and score them. Everything needed to
// run the room (time slots, question sets, admitted list, next/advance) is
// also reachable from a hamburger drawer right inside the Live Room tab, so
// the teacher never has to leave it mid-session. Scores are written via
// submit_oral_score() straight into exam_attempts/exam_answers, so they show
// up in TeacherGrading/GradingPage/StudentExamResults with no extra plumbing.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import {
  Mic, Plus, Trash2, Clock, Radio, CheckCircle2, XCircle,
  Loader2, ChevronRight, ListChecks, PhoneOff, Shuffle, Send,
  Menu, X, Wand2, ClipboardPaste, Layers, Hash, SkipForward, Settings,
} from "lucide-react";

const G = "#064E3B";
const GM = "#075E54";
const GOLD = "#C9A84C";

type Tab = "setup" | "manage" | "live";

const STATUS_COLORS: Record<string, string> = {
  open: "#9ca3af", booked: "#3b82f6", waiting: "#f59e0b", admitted: "#8b5cf6",
  in_progress: "#dc2626", completed: "#16a34a", no_show: "#6b7280", cancelled: "#6b7280",
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

const TeacherOralExams = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = useState<Tab>("setup");
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>("");

  const [slots, setSlots] = useState<any[]>([]);
  const [sets, setSets] = useState<any[]>([]);
  const [session, setSession] = useState<any>(null);

  const selectedExam = exams.find(e => e.id === selectedExamId);

  const loadExams = useCallback(async () => {
    if (!user) return;
    // subjects.teacher_id is legacy and barely populated — the real source of
    // truth for "which subjects does this teacher teach" is subject_timetable,
    // whose `teacher_ids[]` array also carries co-teachers (see TeacherGrading /
    // TeacherSubjects for the same pattern). Union both so nothing is missed.
    const [{ data: owned }, { data: ttSlots }, { data: examsData }] = await Promise.all([
      supabase.from("subjects").select("id, title, title_ar").eq("teacher_id", user.id),
      supabase.from("subject_timetable" as any).select("subject_id, teacher_id, teacher_ids"),
      supabase.from("exams").select("id, title, title_ar, subject_id, passing_score, exam_mode" as any).eq("exam_mode" as any, "oral").eq("created_by", user.id).order("created_at", { ascending: false }),
    ]);

    const mySubjectIds = new Set<string>((owned || []).map((s: any) => s.id));
    (ttSlots || []).forEach((s: any) => {
      if (s.subject_id && (s.teacher_id === user.id || (Array.isArray(s.teacher_ids) && s.teacher_ids.includes(user.id)))) {
        mySubjectIds.add(s.subject_id);
      }
    });

    const ownedIds = new Set((owned || []).map((s: any) => s.id));
    const missingIds = [...mySubjectIds].filter(id => !ownedIds.has(id));
    let extra: any[] = [];
    if (missingIds.length > 0) {
      const { data: extraSubs } = await supabase.from("subjects").select("id, title, title_ar").in("id", missingIds);
      extra = extraSubs || [];
    }

    setSubjects([...(owned || []), ...extra]);
    setExams((examsData as any) || []);
    if (!selectedExamId && examsData && examsData.length > 0) setSelectedExamId((examsData as any)[0].id);
  }, [user, selectedExamId]);

  const loadStudents = useCallback(async () => {
    const { data: roleRows } = await supabase.from("user_roles").select("user_id").eq("role", "student");
    const ids = (roleRows || []).map((r: any) => r.user_id);
    if (ids.length === 0) return setStudents([]);
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", ids);
    setStudents(profiles || []);
  }, []);

  const loadExamData = useCallback(async () => {
    if (!selectedExamId) { setSlots([]); setSets([]); setSession(null); return; }
    const [{ data: slotsData }, { data: setsData }, { data: sessionData }] = await Promise.all([
      supabase.from("oral_exam_slots" as any).select("*").eq("exam_id", selectedExamId).order("start_at"),
      supabase.from("oral_question_sets" as any)
        .select("*, oral_question_set_stages(id, title, title_ar, sort_order), oral_question_set_items(id, question_id, stage_id, sort_order, exam_questions(id, question_text, question_text_ar, points))")
        .eq("exam_id", selectedExamId).order("created_at"),
      supabase.from("oral_exam_sessions" as any).select("*").eq("exam_id", selectedExamId).maybeSingle(),
    ]);
    setSlots((slotsData as any) || []);
    setSets((setsData as any) || []);
    setSession(sessionData as any);

    // Attach student names to slots for display.
    const studentIds = [...new Set(((slotsData as any) || []).map((s: any) => s.student_id).filter(Boolean))];
    if (studentIds.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", studentIds);
      const byId: Record<string, string> = {};
      (profs || []).forEach((p: any) => { byId[p.user_id] = p.full_name; });
      setSlots(((slotsData as any) || []).map((s: any) => ({ ...s, student_name: s.student_id ? byId[s.student_id] : null })));
    }
  }, [selectedExamId]);

  useEffect(() => { (async () => { setLoading(true); await Promise.all([loadExams(), loadStudents()]); setLoading(false); })(); }, [loadExams, loadStudents]);
  useEffect(() => { loadExamData(); }, [loadExamData]);

  // Live-refresh slots/session while on the Live tab.
  useEffect(() => {
    if (tab !== "live" || !selectedExamId) return;
    const channel = supabase.channel(`oral-exam-${selectedExamId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "oral_exam_slots", filter: `exam_id=eq.${selectedExamId}` }, loadExamData)
      .on("postgres_changes", { event: "*", schema: "public", table: "oral_exam_sessions", filter: `exam_id=eq.${selectedExamId}` }, loadExamData)
      .subscribe();
    const interval = setInterval(loadExamData, 8000);
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, [tab, selectedExamId, loadExamData]);

  // ── Setup: create a new oral exam ─────────────────────────────────────
  const [newExam, setNewExam] = useState({ title: "", subject_id: "", passing_score: "50" });
  const createExam = async () => {
    if (!newExam.title.trim()) return toast({ title: "Enter a title", variant: "destructive" });
    const { data, error } = await supabase.from("exams").insert({
      title: newExam.title.trim(),
      subject_id: newExam.subject_id || null,
      passing_score: Number(newExam.passing_score) || 50,
      exam_mode: "oral", type: "exam", is_published: true, created_by: user!.id,
    } as any).select().single();
    if (error) return toast({ title: "Could not create exam", description: error.message, variant: "destructive" });
    await supabase.from("oral_exam_sessions" as any).insert({ exam_id: data.id, created_by: user!.id });
    toast({ title: "Oral exam created" });
    setNewExam({ title: "", subject_id: "", passing_score: "50" });
    await loadExams();
    setSelectedExamId(data.id);
  };

  // ── Slots ──────────────────────────────────────────────────────────────
  const [slotForm, setSlotForm] = useState({ date: "", time: "", duration: "15", mode: "open", student_id: "", count: "1" });
  const createSlots = async () => {
    if (!selectedExamId) return toast({ title: "Pick or create an exam first", variant: "destructive" });
    if (!slotForm.date || !slotForm.time) return toast({ title: "Pick a date and time", variant: "destructive" });
    const startBase = new Date(`${slotForm.date}T${slotForm.time}`);
    const duration = Number(slotForm.duration) || 15;
    const count = slotForm.mode === "open" ? Math.max(1, Number(slotForm.count) || 1) : 1;

    const rows = Array.from({ length: count }).map((_, i) => {
      const start = new Date(startBase.getTime() + i * duration * 60000);
      const end = new Date(start.getTime() + duration * 60000);
      return {
        exam_id: selectedExamId,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        student_id: slotForm.mode === "allocated" ? slotForm.student_id : null,
        status: slotForm.mode === "allocated" ? "booked" : "open",
        created_by: user!.id,
      };
    });
    if (slotForm.mode === "allocated" && !slotForm.student_id) return toast({ title: "Pick a student to allocate", variant: "destructive" });

    const { error } = await supabase.from("oral_exam_slots" as any).insert(rows);
    if (error) return toast({ title: "Could not create slot(s)", description: error.message, variant: "destructive" });
    toast({ title: count > 1 ? `${count} open slots created` : "Slot created" });
    setSlotForm({ ...slotForm, student_id: "" });
    loadExamData();
  };

  const cancelSlot = async (id: string) => {
    await supabase.from("oral_exam_slots" as any).update({ status: "cancelled" }).eq("id", id);
    loadExamData();
  };

  // ── Question sets ──────────────────────────────────────────────────────
  const [newSetTitle, setNewSetTitle] = useState("");
  const [newQ, setNewQ] = useState<Record<string, { text: string; text_ar: string; points: string }>>({});
  const [newStageTitle, setNewStageTitle] = useState<Record<string, string>>({});
  const [aiMode, setAiMode] = useState<Record<string, "prompt" | "paste">>({});
  const [aiInput, setAiInput] = useState<Record<string, string>>({});
  const [aiCount, setAiCount] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});

  const createSet = async () => {
    if (!newSetTitle.trim() || !selectedExamId) return;
    const { error } = await supabase.from("oral_question_sets" as any).insert({ exam_id: selectedExamId, title: newSetTitle.trim(), created_by: user!.id });
    if (error) return toast({ title: "Could not create set", description: error.message, variant: "destructive" });
    setNewSetTitle("");
    loadExamData();
  };

  const deleteSet = async (id: string) => {
    await supabase.from("oral_question_sets" as any).delete().eq("id", id);
    loadExamData();
  };

  const addStage = async (setId: string) => {
    const title = newStageTitle[setId]?.trim();
    if (!title) return;
    const set = sets.find(s => s.id === setId);
    const sortOrder = (set?.oral_question_set_stages || []).length;
    const { error } = await supabase.from("oral_question_set_stages" as any).insert({ set_id: setId, title, sort_order: sortOrder, created_by: user!.id });
    if (error) return toast({ title: "Could not add stage", description: error.message, variant: "destructive" });
    setNewStageTitle({ ...newStageTitle, [setId]: "" });
    loadExamData();
  };

  const deleteStage = async (stageId: string) => {
    await supabase.from("oral_question_set_stages" as any).delete().eq("id", stageId);
    loadExamData();
  };

  const addQuestion = async (setId: string, stageId: string | null) => {
    const key = `${setId}::${stageId || "none"}`;
    const q = newQ[key];
    if (!q?.text?.trim()) return;
    const { data: question, error } = await supabase.from("exam_questions").insert({
      exam_id: selectedExamId, question_type: "essay", question_text: q.text.trim(),
      question_text_ar: q.text_ar?.trim() || null, points: Number(q.points) || 1, sort_order: 0,
    } as any).select().single();
    if (error) return toast({ title: "Could not add question", description: error.message, variant: "destructive" });
    await supabase.from("oral_question_set_items" as any).insert({ set_id: setId, question_id: question.id, stage_id: stageId });
    setNewQ({ ...newQ, [key]: { text: "", text_ar: "", points: "1" } });
    loadExamData();
  };

  const deleteItem = async (itemId: string) => {
    await supabase.from("oral_question_set_items" as any).delete().eq("id", itemId);
    loadExamData();
  };

  // AI generation: "prompt" = invent bilingual questions from a description;
  // "paste" = clean up + translate + sort pasted questions into stages.
  // Either mode returns the same { stages: [{ title, title_ar, questions: [...] }] }
  // shape from the tahleem-ai edge function, so insertion logic is shared.
  const generateAIQuestions = async (setId: string) => {
    const mode = aiMode[setId] || "prompt";
    const input = aiInput[setId]?.trim();
    if (!input) return toast({ title: mode === "paste" ? "Paste some questions first" : "Describe what you want first", variant: "destructive" });

    const count = aiCount[setId]?.trim() ? Number(aiCount[setId]) : undefined;

    setAiLoading({ ...aiLoading, [setId]: true });
    const { data, error } = await supabase.functions.invoke("tahleem-ai", {
      body: { action: "oral_questions", prompt: input, context: { mode, count } },
    });
    setAiLoading({ ...aiLoading, [setId]: false });

    if (error || data?.error) return toast({ title: "AI generation failed", description: error?.message || data?.error, variant: "destructive" });
    const stages = data?.stages;
    if (!Array.isArray(stages) || stages.length === 0) return toast({ title: "AI didn't return any questions — try rephrasing", variant: "destructive" });

    const set = sets.find(s => s.id === setId);
    let stageOrder = (set?.oral_question_set_stages || []).length;

    for (const st of stages) {
      const { data: stageRow, error: stageErr } = await supabase.from("oral_question_set_stages" as any).insert({
        set_id: setId, title: st.title || `Stage ${stageOrder + 1}`, title_ar: st.title_ar || null, sort_order: stageOrder, created_by: user!.id,
      }).select().single();
      stageOrder++;
      if (stageErr || !stageRow) continue;

      const questions = Array.isArray(st.questions) ? st.questions : [];
      for (let qIdx = 0; qIdx < questions.length; qIdx++) {
        const q = questions[qIdx];
        if (!q?.question_text && !q?.question_text_ar) continue;
        const { data: qRow, error: qErr } = await supabase.from("exam_questions").insert({
          exam_id: selectedExamId, question_type: "essay",
          question_text: q.question_text || "", question_text_ar: q.question_text_ar || null,
          points: Number(q.points) || 1, sort_order: qIdx,
        } as any).select().single();
        if (qErr || !qRow) continue;
        await supabase.from("oral_question_set_items" as any).insert({ set_id: setId, question_id: qRow.id, stage_id: stageRow.id, sort_order: qIdx });
      }
    }

    toast({ title: "Questions added", description: `${stages.length} stage(s) from AI` });
    setAiInput({ ...aiInput, [setId]: "" });
    loadExamData();
  };

  // ── Live room ────────────────────────────────────────────────────────
  const [joinedLive, setJoinedLive] = useState(false);
  const [lkToken, setLkToken] = useState<{ token: string; url: string } | null>(null);
  const [drawnStages, setDrawnStages] = useState<any[]>([]);
  const [scores, setScores] = useState<Record<string, { points: string; feedback: string }>>({});
  const [overallFeedback, setOverallFeedback] = useState("");
  const [submittingScore, setSubmittingScore] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Lock page scroll while the fullscreen live room is up — it's meant to be
  // static, edge-to-edge, with no scrolling behind it.
  useEffect(() => {
    if (tab !== "live" || !selectedExamId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [tab, selectedExamId]);

  const waitingSlots = slots.filter(s => s.status === "waiting");
  const admittedSlots = useMemo(
    () => slots.filter(s => s.status === "admitted").sort((a, b) => (a.queue_number || 0) - (b.queue_number || 0)),
    [slots]
  );
  const currentSlot = slots.find(s => s.id === session?.current_slot_id && s.status === "in_progress");
  const drawnQuestions = useMemo(() => drawnStages.flatMap((st: any) => st.questions || []), [drawnStages]);
  const currentSetStages = useMemo(
    () => currentSlot?.drawn_set_id ? [...(sets.find(s => s.id === currentSlot.drawn_set_id)?.oral_question_set_stages || [])].sort((a, b) => a.sort_order - b.sort_order) : [],
    [currentSlot, sets]
  );

  const admit = async (slotId: string) => {
    const { error } = await supabase.rpc("admit_oral_student" as any, { p_slot_id: slotId });
    if (error) toast({ title: "Could not admit", description: error.message, variant: "destructive" });
    loadExamData();
  };

  const callIn = async (slotId: string) => {
    if (!session) return;
    const { error } = await supabase.rpc("call_oral_student" as any, { p_session_id: session.id, p_slot_id: slotId });
    if (error) return toast({ title: "Could not call student", description: error.message, variant: "destructive" });
    loadExamData();
  };

  const noShow = async (slotId: string) => {
    await supabase.rpc("mark_oral_no_show" as any, { p_slot_id: slotId });
    loadExamData();
  };

  const setStage = async (stageId: string | null) => {
    if (!session) return;
    const { error } = await supabase.rpc("set_oral_stage" as any, { p_session_id: session.id, p_stage_id: stageId });
    if (error) return toast({ title: "Could not change stage", description: error.message, variant: "destructive" });
    loadExamData();
  };

  // Unified "Next" — call in the next admitted student if no one's on stage
  // yet, otherwise walk the current student to their next stage.
  const goNext = async () => {
    if (!currentSlot) {
      const next = admittedSlots[0];
      if (!next) return toast({ title: "No admitted students waiting" });
      return callIn(next.id);
    }
    if (currentSetStages.length === 0) return;
    const idx = currentSetStages.findIndex(st => st.id === session?.current_stage_id);
    const nextStage = currentSetStages[idx + 1];
    if (!nextStage) return toast({ title: "Already on the last stage" });
    await setStage(nextStage.id);
  };

  const joinLiveRoom = async (examIdOverride?: string) => {
    const examId = examIdOverride || selectedExamId;
    if (!examId) return;
    const { data, error } = await supabase.functions.invoke("oral-exam-livekit-token", { body: { exam_id: examId } });
    if (error || data?.error) return toast({ title: "Could not join room", description: error?.message || data?.error, variant: "destructive" });
    setLkToken({ token: data.token, url: data.url });
    setJoinedLive(true);
  };

  // One tap from the exam list (or Manage screen) straight into the full-screen
  // live room — no need to pick the exam, switch tabs, then press Join separately.
  const goLive = (examId: string) => {
    setSelectedExamId(examId);
    setTab("live");
    joinLiveRoom(examId);
  };

  // Fetch the current student's drawn question set (grouped by stage) once they've drawn.
  useEffect(() => {
    if (!currentSlot?.drawn_set_id) { setDrawnStages([]); return; }
    supabase.rpc("get_my_drawn_oral_stages" as any, { p_slot_id: currentSlot.id }).then(({ data }: any) => {
      setDrawnStages(data || []);
      const init: Record<string, { points: string; feedback: string }> = {};
      (data || []).forEach((st: any) => (st.questions || []).forEach((q: any) => { init[q.id] = { points: "", feedback: "" }; }));
      setScores(init);
    });
  }, [currentSlot?.drawn_set_id, currentSlot?.id]);

  const submitScore = async () => {
    if (!currentSlot) return;
    const answers = drawnQuestions.map((q: any) => ({
      question_id: q.id,
      points_awarded: Number(scores[q.id]?.points) || 0,
      feedback: scores[q.id]?.feedback || null,
    }));
    setSubmittingScore(true);
    const { error } = await supabase.rpc("submit_oral_score" as any, { p_slot_id: currentSlot.id, p_answers: answers, p_overall_feedback: overallFeedback || null });
    setSubmittingScore(false);
    if (error) return toast({ title: "Could not save score", description: error.message, variant: "destructive" });
    toast({ title: "Score saved to grading" });
    setOverallFeedback("");
    setDrawnStages([]);
    loadExamData();
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}><Loader2 className="animate-spin" style={{ color: G }} /></div>;

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "setup", label: "Exams", icon: Mic },
    { id: "manage", label: "Manage", icon: Settings },
    { id: "live", label: "Live Room", icon: Radio },
  ];
  // "Manage" and "Live Room" are reached per-exam (via the Manage / Go Live
  // buttons on an exam card), not from the top nav bar — that would just
  // duplicate them. Only "Exams" lives in the always-visible nav.
  const mainNavTabs = tabs.filter(t => t.id === "setup");

  // ── Live Room: a true fullscreen takeover ───────────────────────────────
  // Nothing but the video fills the screen — no header, no nav, no scroll.
  // Everything else (jump-to, waiting/admitted lists, stage picker, scoring)
  // lives in the Control Room drawer, reached via the floating hamburger.
  if (tab === "live" && selectedExamId) {
    return (
      <div style={{ position: "fixed", inset: 0, height: "100dvh", width: "100vw", background: "#0a0a0a", overflow: "hidden", zIndex: 40 }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "linear-gradient(rgba(0,0,0,0.65), transparent)", pointerEvents: "none" }}>
          <button onClick={() => setMenuOpen(true)} style={{ pointerEvents: "auto", display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.16)", border: "none", borderRadius: 20, padding: "8px 14px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", backdropFilter: "blur(6px)" }}>
            <Menu size={16} /> Control Room
          </button>
          {currentSlot && (
            <div style={{ pointerEvents: "auto", display: "flex", alignItems: "center", gap: 6, background: G, color: "#fff", borderRadius: 20, padding: "8px 14px", fontWeight: 800, fontSize: 12, whiteSpace: "nowrap" }}>
              <Hash size={13} /> #{currentSlot.queue_number ?? "—"} · {currentSlot.student_name}
            </div>
          )}
          <button onClick={() => { setJoinedLive(false); setTab("setup"); }} style={{ pointerEvents: "auto", display: "flex", alignItems: "center", gap: 6, background: "rgba(220,38,38,0.85)", border: "none", borderRadius: 20, padding: "8px 12px", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            <X size={14} /> Exit
          </button>
        </div>

        {!joinedLive ? (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <button onClick={() => joinLiveRoom()} style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 14, padding: "16px 24px", fontWeight: 800, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              <Radio size={18} /> Start / Join Live Room
            </button>
          </div>
        ) : lkToken && (
          <div className="oral-exam-video-room" style={{ position: "absolute", inset: 0 }}>
            <LiveKitRoom serverUrl={lkToken.url} token={lkToken.token} connect video={false} audio={false} onDisconnected={() => setJoinedLive(false)} style={{ height: "100%" }}>
              <VideoConference />
              <RoomAudioRenderer />
            </LiveKitRoom>
          </div>
        )}

        {menuOpen && (
          <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 300 }}>
            <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: "min(340px, 88vw)", background: "#fff", boxShadow: "2px 0 16px rgba(0,0,0,0.2)", padding: 18, overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ fontWeight: 800, fontSize: 16, color: G }}><Settings size={16} style={{ verticalAlign: -3 }} /> Control Room</h3>
                <button onClick={() => setMenuOpen(false)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} /></button>
              </div>

              <p style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", marginBottom: 8 }}>Jump to</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                {tabs.filter(t => t.id !== "live").map(t => (
                  <button key={t.id} onClick={() => { setTab(t.id); setMenuOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", textAlign: "left" }}>
                    <t.icon size={14} /> {t.label}
                  </button>
                ))}
              </div>

              <p style={{ fontSize: 11, fontWeight: 800, color: "#f59e0b", textTransform: "uppercase", marginBottom: 8 }}>Waiting ({waitingSlots.length})</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                {waitingSlots.map(s => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "8px 10px", borderRadius: 8, background: "#f9fafb" }}>
                    <span>{s.student_name}</span>
                    <button onClick={() => admit(s.id)} style={{ background: G, color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Admit</button>
                  </div>
                ))}
                {waitingSlots.length === 0 && <p style={{ fontSize: 12, color: "#9ca3af" }}>No one waiting.</p>}
              </div>

              <p style={{ fontSize: 11, fontWeight: 800, color: "#8b5cf6", textTransform: "uppercase", marginBottom: 8 }}>Admitted ({admittedSlots.length})</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                {admittedSlots.map(s => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "8px 10px", borderRadius: 8, background: "#f9fafb" }}>
                    <span><b style={{ color: G }}>#{s.queue_number ?? "—"}</b> {s.student_name}</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => callIn(s.id)} disabled={!!currentSlot} style={{ background: G, color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: currentSlot ? "not-allowed" : "pointer", opacity: currentSlot ? 0.5 : 1 }}>Call in</button>
                      <button onClick={() => noShow(s.id)} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}><XCircle size={12} /></button>
                    </div>
                  </div>
                ))}
                {admittedSlots.length === 0 && <p style={{ fontSize: 12, color: "#9ca3af" }}>None admitted yet.</p>}
              </div>

              {currentSlot && currentSetStages.length > 0 && (
                <>
                  <p style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", marginBottom: 8 }}>Stage</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                    {currentSetStages.map((st: any) => (
                      <button key={st.id} onClick={() => setStage(st.id)} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8,
                        border: `1.5px solid ${session?.current_stage_id === st.id ? "#dc2626" : "#e5e7eb"}`,
                        background: session?.current_stage_id === st.id ? "#fff5f5" : "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", textAlign: "left",
                      }}>
                        {st.title} {session?.current_stage_id === st.id && <CheckCircle2 size={13} color="#dc2626" />}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {currentSlot && (
                <>
                  <p style={{ fontSize: 11, fontWeight: 800, color: "#dc2626", textTransform: "uppercase", marginBottom: 8 }}>On stage: #{currentSlot.queue_number ?? "—"} {currentSlot.student_name}</p>
                  <div style={{ background: "#fff5f5", border: "1.5px solid #fecaca", borderRadius: 10, padding: 10, marginBottom: 20 }}>
                    {!currentSlot.drawn_set_id ? (
                      <p style={{ fontSize: 12, color: "#6b7280" }}><Shuffle size={12} style={{ verticalAlign: -2 }} /> Waiting for the student to draw their question set…</p>
                    ) : drawnStages.length === 0 ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (() => {
                      // One round, one question: only the stage currently on-air is
                      // shown here, not the whole drawn set — advancing the stage
                      // (above) is what reveals the next round's question.
                      const activeStage = drawnStages.find((st: any) => st.stage_id === session?.current_stage_id) || drawnStages[0];
                      const roundIdx = currentSetStages.findIndex((st: any) => st.id === activeStage?.stage_id);
                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {currentSetStages.length > 0 && (
                            <p style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af" }}>Round {roundIdx >= 0 ? roundIdx + 1 : 1} of {currentSetStages.length}</p>
                          )}
                          {activeStage?.stage_title && <p style={{ fontSize: 11, fontWeight: 800, color: "#dc2626", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>{activeStage.stage_title}{activeStage.stage_title_ar ? ` · ${activeStage.stage_title_ar}` : ""}</p>}
                          {(activeStage?.questions || []).map((q: any) => (
                            <div key={q.id} style={{ background: "#fff", borderRadius: 10, padding: 10, border: "1px solid #fecaca", marginBottom: 8 }}>
                              <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{q.question_text} <span style={{ color: "#9ca3af", fontWeight: 400 }}>(max {q.points} pts)</span></p>
                              {q.question_text_ar && <p dir="rtl" style={{ fontSize: 14, fontFamily: "'Amiri', serif", color: "#374151", marginBottom: 6 }}>{q.question_text_ar}</p>}
                              <div style={{ display: "flex", gap: 8 }}>
                                <input type="number" placeholder="Points" max={q.points} value={scores[q.id]?.points || ""} onChange={e => setScores({ ...scores, [q.id]: { ...scores[q.id], points: e.target.value } })} style={{ width: 70, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                                <input placeholder="Feedback (optional)" value={scores[q.id]?.feedback || ""} onChange={e => setScores({ ...scores, [q.id]: { ...scores[q.id], feedback: e.target.value } })} style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                              </div>
                            </div>
                          ))}
                          {(activeStage?.questions || []).length === 0 && <p style={{ fontSize: 12, color: "#9ca3af" }}>No question drawn for this stage.</p>}
                          <input placeholder="Overall feedback (optional)" value={overallFeedback} onChange={e => setOverallFeedback(e.target.value)} style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                          <button onClick={submitScore} disabled={submittingScore} style={{ background: G, color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                            {submittingScore ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} style={{ verticalAlign: -2 }} />} Submit Score
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}

              <button onClick={() => { goNext(); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: GOLD, color: "#fff", border: "none", borderRadius: 10, padding: "12px 14px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                <SkipForward size={15} /> Next
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: 16, paddingBottom: 60, position: "relative" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: G, marginBottom: 4 }}>Oral Exams</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>Schedule, question sets, and the live viva room.</p>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto" }}>
        {mainNavTabs.length > 1 && mainNavTabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} disabled={t.id !== "setup" && !selectedExamId} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 20, border: "none",
            background: tab === t.id ? G : "#f3f4f6", color: tab === t.id ? "#fff" : "#374151", fontWeight: 700, fontSize: 13,
            cursor: (t.id !== "setup" && !selectedExamId) ? "not-allowed" : "pointer", opacity: (t.id !== "setup" && !selectedExamId) ? 0.5 : 1, whiteSpace: "nowrap",
          }}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "setup" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {exams.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {exams.map(e => (
                <div key={e.id} style={{ background: "#fff", border: `1px solid ${selectedExamId === e.id ? G : "#e5e7eb"}`, borderRadius: 14, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: G }}>{e.title}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>{subjects.find(s => s.id === e.subject_id)?.title || "No subject"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setSelectedExamId(e.id); setTab("manage"); }} style={{ display: "flex", alignItems: "center", gap: 6, background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                      <Settings size={14} /> Manage
                    </button>
                    <button onClick={() => goLive(e.id)} style={{ display: "flex", alignItems: "center", gap: 6, background: "#dc2626", color: "#fff", border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                      <Radio size={14} /> Go Live
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Create a new oral exam</h3>
            <input placeholder="Exam title (e.g. Tajweed Viva — Term 1)" value={newExam.title} onChange={e => setNewExam({ ...newExam, title: e.target.value })}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e5e7eb", marginBottom: 8, fontSize: 14 }} />
            <select value={newExam.subject_id} onChange={e => setNewExam({ ...newExam, subject_id: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e5e7eb", marginBottom: 8, fontSize: 14 }}>
              <option value="">No subject</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
            <input placeholder="Passing score %" type="number" value={newExam.passing_score} onChange={e => setNewExam({ ...newExam, passing_score: e.target.value })}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e5e7eb", marginBottom: 12, fontSize: 14 }} />
            <button onClick={createExam} style={{ background: G, color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              <Plus size={14} style={{ verticalAlign: -2 }} /> Create Exam
            </button>
          </div>

          {exams.length === 0 && <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center" }}>No oral exams yet — create one above.</p>}
        </div>
      )}

      {tab === "manage" && selectedExamId && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <button onClick={() => setTab("setup")} style={{ background: "none", border: "none", color: G, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>
              ← Back to Exams
            </button>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: G, margin: 0 }}>{selectedExam?.title}</h2>
            <button onClick={() => goLive(selectedExamId)} style={{ display: "flex", alignItems: "center", gap: 6, background: "#dc2626", color: "#fff", border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
              <Radio size={14} /> Go Live
            </button>
          </div>
        </div>
      )}

      {tab === "manage" && selectedExamId && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>Time Slots</h3>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Add time slot(s)</h3>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button onClick={() => setSlotForm({ ...slotForm, mode: "allocated" })} style={{ flex: 1, padding: 8, borderRadius: 8, border: `2px solid ${slotForm.mode === "allocated" ? G : "#e5e7eb"}`, background: slotForm.mode === "allocated" ? "#ecfdf5" : "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Allocate to a student</button>
              <button onClick={() => setSlotForm({ ...slotForm, mode: "open" })} style={{ flex: 1, padding: 8, borderRadius: 8, border: `2px solid ${slotForm.mode === "open" ? G : "#e5e7eb"}`, background: slotForm.mode === "open" ? "#ecfdf5" : "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Leave open (self-pick)</button>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input type="date" value={slotForm.date} onChange={e => setSlotForm({ ...slotForm, date: e.target.value })} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              <input type="time" value={slotForm.time} onChange={e => setSlotForm({ ...slotForm, time: e.target.value })} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input type="number" placeholder="Duration (min)" value={slotForm.duration} onChange={e => setSlotForm({ ...slotForm, duration: e.target.value })} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              {slotForm.mode === "open" && <input type="number" placeholder="How many slots" value={slotForm.count} onChange={e => setSlotForm({ ...slotForm, count: e.target.value })} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }} />}
            </div>
            {slotForm.mode === "allocated" && (
              <select value={slotForm.student_id} onChange={e => setSlotForm({ ...slotForm, student_id: e.target.value })} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e5e7eb", marginBottom: 8 }}>
                <option value="">Select student…</option>
                {students.map(s => <option key={s.user_id} value={s.user_id}>{s.full_name || s.email}</option>)}
              </select>
            )}
            <button onClick={createSlots} style={{ background: G, color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              <Plus size={14} style={{ verticalAlign: -2 }} /> Add
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {slots.filter(s => s.status !== "cancelled").map(s => (
              <div key={s.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{fmtTime(s.start_at)}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{s.student_name || (s.student_id ? "Student" : "Open — anyone can book")}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: STATUS_COLORS[s.status], padding: "3px 8px", borderRadius: 12 }}>{s.status.replace("_", " ")}</span>
                  <button onClick={() => cancelSlot(s.id)} style={{ background: "none", border: "none", cursor: "pointer" }}><Trash2 size={15} color="#dc2626" /></button>
                </div>
              </div>
            ))}
            {slots.length === 0 && <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center" }}>No slots yet.</p>}
          </div>
        </div>
      )}

      {tab === "manage" && selectedExamId && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>Question Sets</h3>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>New question set</h3>
            <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Each student blindly draws ONE set at random when it's their turn — make several so it's a genuine draw.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <input placeholder="Set title (e.g. Set A)" value={newSetTitle} onChange={e => setNewSetTitle(e.target.value)} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              <button onClick={createSet} style={{ background: G, color: "#fff", border: "none", borderRadius: 10, padding: "0 16px", fontWeight: 700, cursor: "pointer" }}>Add</button>
            </div>
          </div>

          {sets.map((set: any) => {
            const stages = [...(set.oral_question_set_stages || [])].sort((a: any, b: any) => a.sort_order - b.sort_order);
            const itemsByStage: Record<string, any[]> = {};
            (set.oral_question_set_items || []).forEach((it: any) => {
              const k = it.stage_id || "none";
              (itemsByStage[k] = itemsByStage[k] || []).push(it);
            });
            const mode = aiMode[set.id] || "prompt";

            return (
              <div key={set.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h4 style={{ fontWeight: 700, fontSize: 15, color: G }}>{set.title}</h4>
                  <button onClick={() => deleteSet(set.id)} style={{ background: "none", border: "none", cursor: "pointer" }}><Trash2 size={15} color="#dc2626" /></button>
                </div>

                {/* AI generation */}
                <div style={{ background: "#faf8f2", border: `1px solid ${GOLD}55`, borderRadius: 12, padding: 12, marginBottom: 14 }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <button onClick={() => setAiMode({ ...aiMode, [set.id]: "prompt" })} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "6px 8px", borderRadius: 8, border: `1.5px solid ${mode === "prompt" ? GOLD : "#e5e7eb"}`, background: mode === "prompt" ? "#fff8ea" : "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                      <Wand2 size={12} /> Generate from prompt
                    </button>
                    <button onClick={() => setAiMode({ ...aiMode, [set.id]: "paste" })} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "6px 8px", borderRadius: 8, border: `1.5px solid ${mode === "paste" ? GOLD : "#e5e7eb"}`, background: mode === "paste" ? "#fff8ea" : "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                      <ClipboardPaste size={12} /> Paste & reorganise
                    </button>
                  </div>
                  <textarea
                    placeholder={mode === "paste"
                      ? "Paste your existing questions here (English and/or Arabic, any order) — AI will translate the missing language and sort them into stages…"
                      : "Describe the oral exam (subject, topic, level, how many questions) — AI will write bilingual (Arabic + English) questions and group them into stages…"}
                    value={aiInput[set.id] || ""}
                    onChange={e => setAiInput({ ...aiInput, [set.id]: e.target.value })}
                    rows={3}
                    style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, resize: "vertical", marginBottom: 8, fontFamily: "inherit" }}
                  />
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="number" min={1} placeholder="# questions" value={aiCount[set.id] || ""} onChange={e => setAiCount({ ...aiCount, [set.id]: e.target.value })}
                      title="Leave blank to let the AI decide (it will still generate a full batch, not one at a time)"
                      style={{ width: 100, padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                    <button onClick={() => generateAIQuestions(set.id)} disabled={aiLoading[set.id]} style={{ display: "flex", alignItems: "center", gap: 6, background: GOLD, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 12, cursor: aiLoading[set.id] ? "wait" : "pointer" }}>
                      {aiLoading[set.id] ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} {aiLoading[set.id] ? "Generating…" : "Generate"}
                    </button>
                  </div>
                </div>

                {/* Stages */}
                {stages.map((stage: any) => (
                  <StageBlock
                    key={stage.id}
                    label={stage.title}
                    labelAr={stage.title_ar}
                    items={itemsByStage[stage.id] || []}
                    onDeleteStage={() => deleteStage(stage.id)}
                    onDeleteItem={deleteItem}
                    newQ={newQ[`${set.id}::${stage.id}`]}
                    setNewQ={(v: any) => setNewQ({ ...newQ, [`${set.id}::${stage.id}`]: v })}
                    onAdd={() => addQuestion(set.id, stage.id)}
                  />
                ))}
                {(itemsByStage["none"] || []).length > 0 && (
                  <StageBlock
                    label="General (no stage)"
                    items={itemsByStage["none"]}
                    onDeleteItem={deleteItem}
                    newQ={newQ[`${set.id}::none`]}
                    setNewQ={(v: any) => setNewQ({ ...newQ, [`${set.id}::none`]: v })}
                    onAdd={() => addQuestion(set.id, null)}
                  />
                )}
                {stages.length === 0 && (itemsByStage["none"] || []).length === 0 && (
                  <StageBlock
                    label="General"
                    items={[]}
                    onDeleteItem={deleteItem}
                    newQ={newQ[`${set.id}::none`]}
                    setNewQ={(v: any) => setNewQ({ ...newQ, [`${set.id}::none`]: v })}
                    onAdd={() => addQuestion(set.id, null)}
                  />
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <input placeholder="New stage name (e.g. Tajweed Rules)" value={newStageTitle[set.id] || ""} onChange={e => setNewStageTitle({ ...newStageTitle, [set.id]: e.target.value })} style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }} />
                  <button onClick={() => addStage(set.id)} style={{ display: "flex", alignItems: "center", gap: 4, background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 8, padding: "0 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                    <Layers size={13} /> Add Stage
                  </button>
                </div>
              </div>
            );
          })}
          {sets.length === 0 && <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center" }}>No question sets yet.</p>}
        </div>
      )}

    </div>
  );
};

// A single stage's question list + inline "add question" form (English + optional Arabic).
const StageBlock = ({ label, labelAr, items, onDeleteStage, onDeleteItem, newQ, setNewQ, onAdd }: any) => (
  <div style={{ border: "1px solid #f0f0f0", borderRadius: 10, padding: 12, marginBottom: 10, background: "#fcfcfc" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Layers size={13} color={GOLD} />
        <span style={{ fontWeight: 700, fontSize: 13 }}>{label}</span>
        {labelAr && <span dir="rtl" style={{ fontSize: 13, color: "#9ca3af", fontFamily: "'Amiri', serif" }}>· {labelAr}</span>}
      </div>
      {onDeleteStage && <button onClick={onDeleteStage} style={{ background: "none", border: "none", cursor: "pointer" }}><Trash2 size={13} color="#dc2626" /></button>}
    </div>
    {items.map((it: any) => (
      <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>
        <div>
          <div>{it.exam_questions?.question_text} <span style={{ color: "#9ca3af" }}>({it.exam_questions?.points} pts)</span></div>
          {it.exam_questions?.question_text_ar && <div dir="rtl" style={{ fontFamily: "'Amiri', serif", color: "#6b7280", marginTop: 2 }}>{it.exam_questions.question_text_ar}</div>}
        </div>
        <button onClick={() => onDeleteItem(it.id)} style={{ background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}><Trash2 size={13} color="#dc2626" /></button>
      </div>
    ))}
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
      <input placeholder="Question (English)" value={newQ?.text || ""} onChange={e => setNewQ({ text: e.target.value, text_ar: newQ?.text_ar || "", points: newQ?.points || "1" })} style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <input dir="rtl" placeholder="السؤال (عربي) — اختياري" value={newQ?.text_ar || ""} onChange={e => setNewQ({ text: newQ?.text || "", text_ar: e.target.value, points: newQ?.points || "1" })} style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, fontFamily: "'Amiri', serif" }} />
        <input type="number" placeholder="Pts" value={newQ?.points || "1"} onChange={e => setNewQ({ text: newQ?.text || "", text_ar: newQ?.text_ar || "", points: e.target.value })} style={{ width: 60, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }} />
        <button onClick={onAdd} style={{ background: GOLD, color: "#fff", border: "none", borderRadius: 8, padding: "0 14px", fontWeight: 700, cursor: "pointer" }}>+</button>
      </div>
    </div>
  </div>
);

export default TeacherOralExams;
