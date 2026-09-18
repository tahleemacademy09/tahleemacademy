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
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { lockReload, unlockReload } from "@/lib/reloadGuard";
import { useAcademicLevels } from "@/hooks/useAcademicLevels";
import { LiveKitRoom, VideoConference, RoomAudioRenderer, useRoomContext } from "@livekit/components-react";
import "@livekit/components-styles";
import { CameraUnmirrorEngine, RoomSettingsModal, sendOralSignal } from "@/components/classroom/classroomComponents";
import {
  Mic, Plus, Trash2, Clock, Radio, CheckCircle2, XCircle,
  Loader2, ChevronRight, ListChecks, PhoneOff, Shuffle, Send,
  Menu, X, Wand2, ClipboardPaste, Layers, Hash, SkipForward, Settings,
  Eye, EyeOff, Users, GraduationCap, UserCheck, ShieldCheck, Star,
  Play, Pause, Square, AlertTriangle,
} from "lucide-react";

// Same reused fix as the student side (see StudentOralExams.tsx) — a
// mirrored raw camera feed is baked into what's published, so a teacher
// whose own camera has this driver quirk needs the same opt-in fix for
// students to see them correctly, not just the other way around.
const OralRoomSettingsButton = () => {
  const room = useRoomContext();
  const [open, setOpen] = useState(false);
  return (
    <>
      <CameraUnmirrorEngine />
      <button onClick={() => setOpen(true)} style={{ position: "absolute", top: 56, right: 14, zIndex: 30, pointerEvents: "auto", background: "rgba(255,255,255,0.16)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer", backdropFilter: "blur(6px)" }} title="Settings — camera looks backwards?">
        <Settings size={15} />
      </button>
      {open && <RoomSettingsModal onClose={() => setOpen(false)} room={room} />}
    </>
  );
};

// Headless — mounted inside <LiveKitRoom> purely to hand the connected
// room instance out to liveRoomRef. The Control Room drawer (Start/Stop/
// Error buttons) renders as a SIBLING of <LiveKitRoom>, not a child of it,
// so it can't call useRoomContext() itself; this ref is how its buttons
// reach room.localParticipant.publishData() for the instant "Error" flash.
const OralRoomRefBridge = ({ liveRoomRef }: { liveRoomRef: { current: any } }) => {
  const room = useRoomContext();
  useEffect(() => { liveRoomRef.current = room; return () => { liveRoomRef.current = null; }; }, [room, liveRoomRef]);
  return null;
};

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
  const { data: academicLevels = [] } = useAcademicLevels();
  const location = useLocation();
  // Same component serves both routes — /teacher/oral-exams (own exams only)
  // and /admin/oral-exams (every teacher's oral exams, full control) — same
  // pattern as ExamEditor sharing /teacher/exams/* and /admin/exams/*.
  const isAdminContext = location.pathname.startsWith("/admin");

  const [tab, setTab] = useState<Tab>("setup");
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  // Creator display names, keyed by user_id — only really needed in admin
  // context (to show "by <teacher>" on exams that aren't the admin's own),
  // but harmless to populate either way.
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({});

  const [slots, setSlots] = useState<any[]>([]);
  const [sets, setSets] = useState<any[]>([]);
  const [session, setSession] = useState<any>(null);
  // Sub-tab within "Manage" — mirrors the written-exam editor's
  // Settings/Proctoring/Schedule/Questions layout so oral exams feel like
  // the same product instead of one long stacked page.
  const [manageSubTab, setManageSubTab] = useState<"settings" | "slots" | "questions">("settings");

  const selectedExam = exams.find(e => e.id === selectedExamId);

  const loadExams = useCallback(async () => {
    if (!user) return;

    let subjectsList: any[] = [];
    let examsData: any[] = [];

    if (isAdminContext) {
      // Admin sees EVERY oral exam, across every teacher, unfiltered — this
      // is the whole point of the admin view: oversight + the ability to
      // step in on any teacher's exam, not just their own.
      const [{ data: allSubjects }, { data: ex }] = await Promise.all([
        supabase.from("subjects").select("id, title, title_ar"),
        supabase.from("exams").select("id, title, title_ar, subject_id, passing_score, exam_mode, type, is_published, oral_assignment_mode, level, created_by" as any).eq("exam_mode" as any, "oral").order("created_at", { ascending: false }),
      ]);
      subjectsList = allSubjects || [];
      examsData = (ex as any) || [];
    } else {
      // subjects.teacher_id is legacy and barely populated — the real source of
      // truth for "which subjects does this teacher teach" is subject_timetable,
      // whose `teacher_ids[]` array also carries co-teachers (see TeacherGrading /
      // TeacherSubjects for the same pattern). Union both so nothing is missed.
      const [{ data: owned }, { data: ttSlots }, { data: ex }] = await Promise.all([
        supabase.from("subjects").select("id, title, title_ar").eq("teacher_id", user.id),
        supabase.from("subject_timetable" as any).select("subject_id, teacher_id, teacher_ids"),
        supabase.from("exams").select("id, title, title_ar, subject_id, passing_score, exam_mode, type, is_published, oral_assignment_mode, level, created_by" as any).eq("exam_mode" as any, "oral").eq("created_by", user.id).order("created_at", { ascending: false }),
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
      subjectsList = [...(owned || []), ...extra];
      examsData = (ex as any) || [];
    }

    setSubjects(subjectsList);
    setExams(examsData);

    const creatorIds = [...new Set(examsData.map((e: any) => e.created_by).filter(Boolean))];
    if (creatorIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", creatorIds);
      const byId: Record<string, string> = {};
      (profs || []).forEach((p: any) => { byId[p.user_id] = p.full_name; });
      setCreatorNames(byId);
    }

    if (!selectedExamId && examsData.length > 0) setSelectedExamId(examsData[0].id);
  }, [user, selectedExamId, isAdminContext]);

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
        .select("*, oral_question_set_stages(id, title, title_ar, sort_order, time_limit_seconds), oral_question_set_items(id, question_id, stage_id, sort_order, exam_questions(id, question_text, question_text_ar, points))")
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
  // "type" follows the same CA (continuous-assessment) convention used
  // elsewhere in the platform: a "test" is scored out of 30, a full "exam"
  // out of 70 — see submit_oral_score() in Supabase. This used to be
  // hardcoded to "exam" here, which is why oral tests didn't exist as an
  // option at all.
  const [newExam, setNewExam] = useState<{ title: string; subject_id: string; passing_score: string; type: "test" | "exam" }>({ title: "", subject_id: "", passing_score: "50", type: "exam" });
  const createExam = async () => {
    if (!newExam.title.trim()) return toast({ title: "Enter a title", variant: "destructive" });
    // Created as a draft (is_published: false) — students can't see or book
    // any slots until the teacher explicitly publishes it from Manage, once
    // time slots and question sets are actually ready.
    const { data, error } = await supabase.from("exams").insert({
      title: newExam.title.trim(),
      subject_id: newExam.subject_id || null,
      passing_score: Number(newExam.passing_score) || 50,
      exam_mode: "oral", type: newExam.type, is_published: false, created_by: user!.id,
    } as any).select().single();
    if (error) return toast({ title: "Could not create exam", description: error.message, variant: "destructive" });
    await supabase.from("oral_exam_sessions" as any).insert({ exam_id: data.id, created_by: user!.id });
    toast({ title: "Oral exam created as a draft — publish it from Manage when ready" });
    setNewExam({ title: "", subject_id: "", passing_score: "50", type: "exam" });
    await loadExams();
    setSelectedExamId(data.id);
  };

  // Draft ⇄ published toggle. Publishing is what actually makes the exam's
  // open slots visible/bookable to students at all (see book_oral_slot() and
  // the oral_exam_slots RLS policy) — this is the one control for that.
  const togglePublish = async () => {
    if (!selectedExam) return;
    const next = !selectedExam.is_published;
    const { error } = await supabase.from("exams").update({ is_published: next }).eq("id", selectedExam.id);
    if (error) return toast({ title: "Could not update", description: error.message, variant: "destructive" });
    toast({ title: next ? "Exam published — students can now see it" : "Exam moved back to draft" });
    await loadExams();
  };

  // Who can see/book this exam's open slots — reused by both the Setup list
  // and the Manage screen. 'individual' doesn't touch `level` at all (every
  // slot must be hand-allocated instead); 'level' also writes `level`.
  const setAssignmentMode = async (mode: "all" | "level" | "individual", level?: string) => {
    if (!selectedExam) return;
    const patch: any = { oral_assignment_mode: mode };
    if (mode === "level") patch.level = level || null;
    if (mode !== "level") patch.level = null;
    const { error } = await supabase.from("exams").update(patch).eq("id", selectedExam.id);
    if (error) return toast({ title: "Could not update audience", description: error.message, variant: "destructive" });
    await loadExams();
  };

  // ── Slots ──────────────────────────────────────────────────────────────
  const [slotForm, setSlotForm] = useState({ date: "", time: "", duration: "15", mode: "open", student_id: "", count: "1" });
  // Belt-and-suspenders alongside hiding the "Leave open" button above: if the
  // exam switches to "Individual only" while "open" was already selected,
  // snap the form back so createSlots can never insert an open slot nobody
  // could ever see or book.
  useEffect(() => {
    if (selectedExam?.oral_assignment_mode === "individual" && slotForm.mode === "open") {
      setSlotForm(f => ({ ...f, mode: "allocated" }));
    }
  }, [selectedExam?.oral_assignment_mode, slotForm.mode]);
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
  const [topStageSetId, setTopStageSetId] = useState<string | null>(null);
  const [showSeparateSet, setShowSeparateSet] = useState(false);
  const [aiMode, setAiMode] = useState<Record<string, "prompt" | "paste">>({});
  const [aiInput, setAiInput] = useState<Record<string, string>>({});
  const [aiCount, setAiCount] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  // Same idea as above, but for generating INTO an existing stage (e.g. one
  // just created via "Add Stage") instead of always spinning up a new one.
  // Keyed by stage_id.
  const [stageAiOpen, setStageAiOpen] = useState<Record<string, boolean>>({});
  const [stageAiMode, setStageAiMode] = useState<Record<string, "prompt" | "paste">>({});
  const [stageAiInput, setStageAiInput] = useState<Record<string, string>>({});
  const [stageAiCount, setStageAiCount] = useState<Record<string, string>>({});
  const [stageAiLoading, setStageAiLoading] = useState<Record<string, boolean>>({});

  const createSet = async () => {
    if (!newSetTitle.trim() || !selectedExamId) return;
    // A "Set" is a full alternate version of the whole exam — every student
    // draws exactly ONE set at random, never more than one. Adding a new
    // topic/round to the SAME exam almost always means "Add Stage" inside
    // the existing set instead. This has bitten this exact workflow twice,
    // so confirm loudly before letting a second set slip in by accident.
    if (sets.length > 0) {
      const ok = window.confirm(
        `You already have ${sets.length} question set${sets.length > 1 ? "s" : ""} for this exam.\n\n` +
        `A SET is a full alternate version of the whole exam — each student only ever gets ONE set, picked at random. ` +
        `If you're adding a new topic or round (e.g. "Recitation" after "Memorization") to the SAME exam, use "Add Stage" inside the existing set instead — otherwise students will only ever see one or the other, never both.\n\n` +
        `Continue creating a separate set "${newSetTitle.trim()}" anyway?`
      );
      if (!ok) return;
    }
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
    const set = sets.find(s => s.id === setId);
    const sortOrder = (set?.oral_question_set_stages || []).length;
    // Blank name defaults to "Stage N" (next in line) rather than blocking
    // the add — the teacher can always rename it afterwards, same as any
    // other stage.
    const title = newStageTitle[setId]?.trim() || `Stage ${sortOrder + 1}`;
    const { error } = await supabase.from("oral_question_set_stages" as any).insert({ set_id: setId, title, sort_order: sortOrder, created_by: user!.id });
    if (error) return toast({ title: "Could not add stage", description: error.message, variant: "destructive" });
    setNewStageTitle({ ...newStageTitle, [setId]: "" });
    loadExamData();
  };

  const deleteStage = async (stageId: string) => {
    await supabase.from("oral_question_set_stages" as any).delete().eq("id", stageId);
    loadExamData();
  };

  // Debounced-by-blur update of a stage's per-student time limit. Empty/0 clears it (no timer).
  const setStageTimeLimit = async (stageId: string, minutes: string) => {
    const mins = parseFloat(minutes);
    const seconds = !minutes || isNaN(mins) || mins <= 0 ? null : Math.round(mins * 60);
    const { error } = await supabase.from("oral_question_set_stages" as any).update({ time_limit_seconds: seconds }).eq("id", stageId);
    if (error) toast({ title: "Could not set time limit", description: error.message, variant: "destructive" });
    loadExamData();
  };

  // Rename a stage in place (blur-to-save) — stages are created with a
  // default "Stage N" title, editable at any time afterwards.
  const renameStage = async (stageId: string, title: string) => {
    const clean = title.trim();
    if (!clean) return;
    const { error } = await supabase.from("oral_question_set_stages" as any).update({ title: clean }).eq("id", stageId);
    if (error) toast({ title: "Could not rename stage", description: error.message, variant: "destructive" });
    loadExamData();
  };

  // How many of the exam's overall /30 (test) or /70 (exam) this stage is
  // worth. Blank clears it — submit_oral_score then falls back to scoring
  // proportionally off raw question points instead, the same as before any
  // stage had a weight set.
  const setStageMaxPoints = async (stageId: string, value: string) => {
    const n = parseFloat(value);
    const maxPoints = !value || isNaN(n) || n < 0 ? null : n;
    const { error } = await supabase.from("oral_question_set_stages" as any).update({ max_points: maxPoints }).eq("id", stageId);
    if (error) toast({ title: "Could not set marks", description: error.message, variant: "destructive" });
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

  // Generate into an EXISTING stage (e.g. one added manually via "Add Stage")
  // instead of always creating a brand new one. The oral_questions system
  // prompt always returns exactly one stage — we just take its questions and
  // append them to the stage the teacher already picked, ignoring the AI's
  // own (unused) title for it.
  const generateAIQuestionsForStage = async (setId: string, stageId: string, existingCount: number) => {
    const mode = stageAiMode[stageId] || "prompt";
    const input = stageAiInput[stageId]?.trim();
    if (!input) return toast({ title: mode === "paste" ? "Paste some questions first" : "Describe what you want first", variant: "destructive" });

    const count = stageAiCount[stageId]?.trim() ? Number(stageAiCount[stageId]) : undefined;

    setStageAiLoading({ ...stageAiLoading, [stageId]: true });
    const { data, error } = await supabase.functions.invoke("tahleem-ai", {
      body: { action: "oral_questions", prompt: input, context: { mode, count } },
    });
    setStageAiLoading({ ...stageAiLoading, [stageId]: false });

    if (error || data?.error) return toast({ title: "AI generation failed", description: error?.message || data?.error, variant: "destructive" });
    const questions = data?.stages?.[0]?.questions;
    if (!Array.isArray(questions) || questions.length === 0) return toast({ title: "AI didn't return any questions — try rephrasing", variant: "destructive" });

    let sortOrder = existingCount;
    let added = 0;
    for (const q of questions) {
      if (!q?.question_text && !q?.question_text_ar) continue;
      const { data: qRow, error: qErr } = await supabase.from("exam_questions").insert({
        exam_id: selectedExamId, question_type: "essay",
        question_text: q.question_text || "", question_text_ar: q.question_text_ar || null,
        points: Number(q.points) || 1, sort_order: sortOrder,
      } as any).select().single();
      if (qErr || !qRow) continue;
      await supabase.from("oral_question_set_items" as any).insert({ set_id: setId, question_id: qRow.id, stage_id: stageId, sort_order: sortOrder });
      sortOrder++;
      added++;
    }

    toast({ title: added > 0 ? `${added} question(s) added` : "Nothing was added", variant: added > 0 ? undefined : "destructive" });
    setStageAiInput({ ...stageAiInput, [stageId]: "" });
    setStageAiOpen({ ...stageAiOpen, [stageId]: false });
    loadExamData();
  };

  // ── Live room ────────────────────────────────────────────────────────
  const [joinedLive, setJoinedLive] = useState(false);
  const [lkToken, setLkToken] = useState<{ token: string; url: string } | null>(null);
  const [drawnStages, setDrawnStages] = useState<any[]>([]);
  const [scores, setScores] = useState<Record<string, { points: string; feedback: string }>>({});
  const [overallFeedback, setOverallFeedback] = useState("");
  const [submittingScore, setSubmittingScore] = useState(false);

  // Lock out the "apply update & reload" flow for as long as the teacher is
  // anywhere in Oral Exams — not just once live. A service-worker update
  // landing the moment this tab regains focus after being minimized was
  // silently reloading the page and dropping whatever slots/questions/scores
  // hadn't been saved yet, on Setup and Manage just as much as in the live
  // room. Locked for the whole time the component is mounted; released the
  // instant it unmounts (e.g. navigating to a different page).
  useEffect(() => {
    lockReload("oral-exam-teacher");
    return () => unlockReload("oral-exam-teacher");
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);

  // Lock page scroll while the fullscreen live room is up — it's meant to be
  // static, edge-to-edge, with no scrolling behind it.
  useEffect(() => {
    if (tab !== "live" || !selectedExamId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [tab, selectedExamId]);

  // Gate for "Go Live": published, with at least one time slot and at least
  // one question actually added to a set — otherwise there's a live room
  // with nobody able to book/be called and nothing to draw. This only
  // checks readiness, it never auto-publishes anything.
  const hasAnyQuestion = sets.some((s: any) =>
    (s.oral_question_set_items || []).length > 0
  );
  const examReadyForLive = !!selectedExam?.is_published && slots.length > 0 && hasAnyQuestion;
  const examNotReadyReason = !selectedExam?.is_published
    ? "Publish this exam first"
    : slots.length === 0
    ? "Add at least one time slot first"
    : !hasAnyQuestion
    ? "Add at least one question to a question set first"
    : undefined;

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
  // submit_oral_score() finalizes the WHOLE attempt in one call (creates the
  // exam_attempts row, grades it, marks the slot completed) using every
  // question's score accumulated so far in local `scores` state — it is not
  // meant to be called per-stage. So the Submit button must only appear on
  // the last stage; earlier stages only get "Next" to move on without
  // finalizing anything yet.
  const currentStageIdx = currentSetStages.findIndex(st => st.id === session?.current_stage_id);
  const isLastOralStage = currentSetStages.length === 0 || currentStageIdx === currentSetStages.length - 1;

  // The stage actually on-air right now (not the "no stage picked yet" state
  // right after calling a student in — session.current_stage_id is null then,
  // and there's nothing to score yet). Used to gate leaving a stage without
  // a mark entered.
  const activeOralStage = (currentSlot?.drawn_set_id && session?.current_stage_id)
    ? drawnStages.find((st: any) => st.stage_id === session.current_stage_id)
    : null;
  const activeStageScored = !activeOralStage || (activeOralStage.questions || []).length === 0 ||
    (activeOralStage.questions as any[]).every(q => {
      const v = scores[q.id]?.points;
      return v !== undefined && v !== "" && !isNaN(Number(v));
    });
  const allQuestionsScored = drawnQuestions.every((q: any) => {
    const v = scores[q.id]?.points;
    return v !== undefined && v !== "" && !isNaN(Number(v));
  });

  // Live-recomputed summation for the final review panel — unscored questions
  // count as 0 toward the running total (submit stays blocked by
  // allQuestionsScored until every one actually has a number in it).
  const reviewMaxTotal = drawnQuestions.reduce((sum: number, q: any) => sum + (Number(q.points) || 0), 0);
  const reviewAwardedTotal = drawnQuestions.reduce((sum: number, q: any) => {
    const v = scores[q.id]?.points;
    return sum + (v !== undefined && v !== "" && !isNaN(Number(v)) ? Number(v) : 0);
  }, 0);

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

  // Handle to the connected oral-exam LiveKitRoom, filled in by
  // OralRoomRefBridge (mounted inside <LiveKitRoom>) — see its comment.
  // Only used to send the instant, unpersisted "Error" flash; Start/Stop
  // go through the RPCs below since that state needs to survive a refresh.
  const liveRoomRef = useRef<any>(null);

  const startStageTimer = async () => {
    if (!session) return;
    const { data, error } = await supabase.rpc("start_oral_stage_timer" as any, { p_session_id: session.id });
    if (error) return toast({ title: "Could not start timer", description: error.message, variant: "destructive" });
    setSession(data);
  };

  const stopStageTimer = async () => {
    if (!session) return;
    const { data, error } = await supabase.rpc("stop_oral_stage_timer" as any, { p_session_id: session.id });
    if (error) return toast({ title: "Could not stop timer", description: error.message, variant: "destructive" });
    setSession(data);
  };

  // Fires instantly over the live room's data channel (see
  // OralErrorFlashListener) — nothing written to the database, so there's
  // no round trip to wait on before the student's screen flashes.
  const flashError = () => {
    if (!currentSlot) return;
    sendOralSignal(liveRoomRef.current, "oral_error");
  };

  const setStage = async (stageId: string | null) => {
    if (!session) return;
    // Block leaving the stage currently on-air until it's been marked —
    // this covers both the "Next" button and the manual stage-jump list,
    // since both funnel through here. Jumping back to the stage you're
    // already on (or moving on once it's scored) is unaffected.
    if (currentSlot && stageId !== session.current_stage_id && !activeStageScored) {
      return toast({ title: "Award a mark first", description: "Enter points for this stage's question before moving on.", variant: "destructive" });
    }
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

  // Clear the score sheet the moment a *different* student is on stage —
  // the merge-in effect below only ever adds entries, so without this a new
  // student would inherit leftover (unsubmitted) score keys from whoever
  // was on stage before them.
  useEffect(() => { setScores({}); }, [currentSlot?.id]);

  // Fetch the current student's drawn questions (grouped by stage), and
  // re-fetch whenever the live stage changes — each stage's question is now
  // only drawn once the student actually draws it there (see the student
  // page), so refreshing on every stage advance is what picks up stage 2's
  // question once it exists. Score entries are merged in, never replaced
  // wholesale, so advancing to a new stage can never wipe out marks the
  // teacher already entered for an earlier one.
  useEffect(() => {
    if (!currentSlot?.drawn_set_id) { setDrawnStages([]); return; }
    supabase.rpc("get_my_drawn_oral_stages" as any, { p_slot_id: currentSlot.id }).then(({ data }: any) => {
      setDrawnStages(data || []);
      setScores(prev => {
        const next = { ...prev };
        (data || []).forEach((st: any) => (st.questions || []).forEach((q: any) => {
          if (!next[q.id]) next[q.id] = { points: "", feedback: "" };
        }));
        return next;
      });
    });
    // BUG FIX ("doesn't show the question until refresh"): the realtime
    // subscription below on oral_exam_slots already fires loadExamData() the
    // instant the student draws their stage question (draw_oral_stage_question
    // writes it into slots.drawn_question_ids), and that does refresh `slots`
    // — but `slots` reloading gives `currentSlot` a brand-new object
    // reference with the SAME primitive drawn_set_id/id/current_stage_id
    // values, so this effect's dependency array never actually changed and
    // React never re-ran it. Depending on the drawn_question_ids payload
    // itself (stringified, since it's a jsonb object) is what makes "the
    // student just drew their question for this stage" a real dependency
    // change, so this now refetches the instant that happens instead of
    // only on the next manual reload.
  }, [currentSlot?.drawn_set_id, currentSlot?.id, session?.current_stage_id, JSON.stringify(currentSlot?.drawn_question_ids)]);

  const submitScore = async () => {
    if (!currentSlot) return;
    const unmarked = drawnQuestions.some((q: any) => {
      const v = scores[q.id]?.points;
      return v === undefined || v === "" || isNaN(Number(v));
    });
    if (unmarked) return toast({ title: "Award a mark first", description: "Enter points for every question before submitting.", variant: "destructive" });
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
          <button onClick={() => setMenuOpen(true)} style={{ pointerEvents: "auto", position: "relative", display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.16)", border: "none", borderRadius: 20, padding: "8px 14px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", backdropFilter: "blur(6px)" }}>
            <Menu size={16} /> Control Room
            {/* A student waiting to be admitted is easy to miss while the
                Control Room drawer is closed and the video fills the whole
                screen — this star badge on the always-visible trigger button
                makes it obvious without opening the drawer. */}
            {waitingSlots.length > 0 && (
              <span style={{
                position: "absolute", top: -6, right: -6, display: "flex", alignItems: "center", justifyContent: "center",
                width: 20, height: 20, borderRadius: "50%", background: GOLD, color: "#064E3B",
                boxShadow: "0 0 0 2px rgba(0,0,0,0.5)", animation: "oral-star-pulse 1.5s infinite",
              }} title={`${waitingSlots.length} student${waitingSlots.length > 1 ? "s" : ""} waiting to be admitted`}>
                <Star size={11} fill="#064E3B" />
              </span>
            )}
          </button>
          <style>{`@keyframes oral-star-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.15); } }`}</style>
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
            {/* BUG FIX ("only one video tile showing"): this used to connect with
                video={false} audio={false}, so the teacher's own camera/mic never
                auto-published on join — they'd have to find LiveKit's own tiny
                control-bar icons and tap them manually. The token issued to a
                privileged user (oral-exam-livekit-token) always grants
                canPublish: true, so there's nothing gating this except these two
                props; the student's room already auto-publishes the same way. */}
            <LiveKitRoom serverUrl={lkToken.url} token={lkToken.token} connect video audio onDisconnected={() => setJoinedLive(false)} style={{ height: "100%" }}>
              <VideoConference />
              <RoomAudioRenderer />
              <OralRoomSettingsButton />
              <OralRoomRefBridge liveRoomRef={liveRoomRef} />
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
                  <p style={{ fontSize: 11, fontWeight: 800, color: "#dc2626", textTransform: "uppercase", marginBottom: 8 }}>
                    On stage: #{currentSlot.queue_number ?? "—"} {currentSlot.student_name}
                    {selectedExam?.type === "test" && <span style={{ marginLeft: 6, color: "#9ca3af", fontWeight: 700 }}>· scored /30</span>}
                    {selectedExam?.type === "exam" && <span style={{ marginLeft: 6, color: "#9ca3af", fontWeight: 700 }}>· scored /70</span>}
                  </p>
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
                          {(currentSetStages.length > 0 || activeStage?.time_limit_seconds) && (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              {currentSetStages.length > 0 && <p style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af" }}>Round {roundIdx >= 0 ? roundIdx + 1 : 1} of {currentSetStages.length}</p>}
                              <StageCountdown startedAt={session?.current_stage_started_at} limitSeconds={activeStage?.time_limit_seconds} elapsedSeconds={session?.stage_elapsed_seconds} running={!!session?.stage_timer_running} />
                            </div>
                          )}
                          {/* Start/Stop the stage's own countdown, and flash an
                              instant full-screen "Correction needed" alert on
                              the student's screen — all three work whether or
                              not this stage even has a time limit set. */}
                          <div style={{ display: "flex", gap: 6 }}>
                            {session?.stage_timer_running ? (
                              <button onClick={stopStageTimer} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, background: "#fff", color: "#b45309", border: "1.5px solid #fcd34d", borderRadius: 8, padding: "7px 8px", fontWeight: 800, fontSize: 11.5, cursor: "pointer" }}>
                                <Pause size={12} /> Stop
                              </button>
                            ) : (
                              <button onClick={startStageTimer} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, background: "#fff", color: G, border: `1.5px solid ${G}`, borderRadius: 8, padding: "7px 8px", fontWeight: 800, fontSize: 11.5, cursor: "pointer" }}>
                                <Play size={12} /> {session?.stage_elapsed_seconds ? "Resume" : "Start"}
                              </button>
                            )}
                            <button onClick={flashError} title="Flash a full-screen correction alert on the student's screen" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, padding: "7px 8px", fontWeight: 800, fontSize: 11.5, cursor: "pointer" }}>
                              <AlertTriangle size={12} /> Error
                            </button>
                          </div>
                          {/* Once the last stage has itself been marked, swap this box over to
                              the full review panel below instead of repeating its single
                              question here a second time — the review panel already re-renders
                              every stage's question (including this one) with an editable field. */}
                          {!(isLastOralStage && activeStageScored) && (
                            <>
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
                            </>
                          )}
                          {isLastOralStage ? (
                            activeStageScored ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                <p style={{ fontSize: 11, fontWeight: 800, color: G, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                  Review scores before submitting
                                </p>
                                {drawnStages.map((st: any) => (
                                  <div key={st.stage_id ?? "general"} style={{ background: "#fff", borderRadius: 10, padding: 10, border: "1px solid #e5e7eb" }}>
                                    {st.stage_title && (
                                      <p style={{ fontSize: 10, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", marginBottom: 6 }}>
                                        {st.stage_title}{st.stage_title_ar ? ` · ${st.stage_title_ar}` : ""}
                                      </p>
                                    )}
                                    {(st.questions || []).map((q: any) => (
                                      <div key={q.id} style={{ marginBottom: 8 }}>
                                        <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{q.question_text} <span style={{ color: "#9ca3af", fontWeight: 400 }}>(max {q.points} pts)</span></p>
                                        <div style={{ display: "flex", gap: 8 }}>
                                          <input type="number" placeholder="Points" max={q.points} value={scores[q.id]?.points || ""} onChange={e => setScores({ ...scores, [q.id]: { ...scores[q.id], points: e.target.value } })} style={{ width: 70, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                                          <input placeholder="Feedback (optional)" value={scores[q.id]?.feedback || ""} onChange={e => setScores({ ...scores, [q.id]: { ...scores[q.id], feedback: e.target.value } })} style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "#f9fafb", borderRadius: 8, fontWeight: 800, fontSize: 13, color: G }}>
                                  <span>Total</span>
                                  <span>{reviewAwardedTotal} / {reviewMaxTotal}</span>
                                </div>
                                <input placeholder="Overall feedback (optional)" value={overallFeedback} onChange={e => setOverallFeedback(e.target.value)} style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                                <button onClick={submitScore} disabled={submittingScore || !allQuestionsScored} style={{
                                  color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 800, fontSize: 13,
                                  background: !allQuestionsScored ? "#d1d5db" : G, cursor: !allQuestionsScored ? "not-allowed" : "pointer",
                                }}>
                                  {submittingScore ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} style={{ verticalAlign: -2 }} />}{" "}
                                  {!allQuestionsScored ? "Award marks to submit" : `Submit Score${currentSetStages.length > 1 ? " (all stages)" : ""}`}
                                </button>
                              </div>
                            ) : (
                              <p style={{ fontSize: 11, color: "#9ca3af" }}>Award this stage's mark to see the full review before submitting.</p>
                            )
                          ) : (
                            <p style={{ fontSize: 11, color: "#9ca3af" }}>Scores are kept as you go — tap <b>Next</b> below to move to the next stage. The final score is submitted once you reach the last stage.</p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}

              {!(currentSlot && isLastOralStage) && (
                <button onClick={() => { goNext(); }} disabled={!!currentSlot && !activeStageScored} style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#fff", border: "none",
                  borderRadius: 10, padding: "12px 14px", fontWeight: 800, fontSize: 14,
                  background: (currentSlot && !activeStageScored) ? "#d1d5db" : GOLD,
                  cursor: (currentSlot && !activeStageScored) ? "not-allowed" : "pointer",
                }}>
                  <SkipForward size={15} /> {currentSlot && !activeStageScored ? "Award a mark to continue" : "Next"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: 16, paddingBottom: 60, position: "relative" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: G, marginBottom: 4 }}>{isAdminContext ? "Oral Exams — All Teachers" : "Oral Exams"}</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>{isAdminContext ? "Every teacher's oral exams — schedule, question sets, and the live viva room, all in one place." : "Schedule, question sets, and the live viva room."}</p>

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
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 800, fontSize: 15, color: G }}>{e.title}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, color: GOLD, border: `1px solid ${GOLD}`, borderRadius: 20, padding: "1px 8px", textTransform: "uppercase" }}>
                        {e.type === "test" ? "Test · /30" : e.type === "exam" ? "Exam · /70" : e.type || "Exam"}
                      </span>
                      <span style={{
                        display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 800, textTransform: "uppercase",
                        color: e.is_published ? "#16a34a" : "#9ca3af", border: `1px solid ${e.is_published ? "#16a34a" : "#9ca3af"}`, borderRadius: 20, padding: "1px 8px",
                      }}>
                        {e.is_published ? <Eye size={10} /> : <EyeOff size={10} />} {e.is_published ? "Published" : "Draft"}
                      </span>
                      {isAdminContext && (
                        <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: "#6b46c1", background: "#f5f3ff", borderRadius: 20, padding: "1px 8px" }}>
                          <UserCheck size={10} /> {creatorNames[e.created_by] || (e.created_by === user?.id ? "You" : "Unknown teacher")}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      {subjects.find(s => s.id === e.subject_id)?.title || "No subject"}
                      {" · "}
                      {e.oral_assignment_mode === "individual" ? "Individually assigned" : e.oral_assignment_mode === "level" ? `Level: ${academicLevels.find(l => l.slug === e.level)?.name_en || e.level || "—"}` : "Open to all"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => { setSelectedExamId(e.id); setTab("manage"); }} style={{ display: "flex", alignItems: "center", gap: 6, background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                      <Settings size={14} /> Manage
                    </button>
                    <button
                      onClick={() => e.is_published && goLive(e.id)}
                      disabled={!e.is_published}
                      title={e.is_published ? undefined : "Publish this exam from Manage (after its slots and questions are set up) before going live"}
                      style={{ display: "flex", alignItems: "center", gap: 6, background: e.is_published ? "#dc2626" : "#e5e7eb", color: e.is_published ? "#fff" : "#9ca3af", border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 800, fontSize: 13, cursor: e.is_published ? "pointer" : "not-allowed" }}
                    >
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
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {(["test", "exam"] as const).map(t => (
                <button key={t} type="button" onClick={() => setNewExam({ ...newExam, type: t })} style={{
                  flex: 1, padding: "10px 12px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13,
                  border: `1.5px solid ${newExam.type === t ? G : "#e5e7eb"}`,
                  background: newExam.type === t ? "#ecfdf5" : "#fff", color: newExam.type === t ? G : "#374151",
                }}>
                  {t === "test" ? "Test (out of 30)" : "Exam (out of 70)"}
                </button>
              ))}
            </div>
            <input placeholder="Passing score %" type="number" value={newExam.passing_score} onChange={e => setNewExam({ ...newExam, passing_score: e.target.value })}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e5e7eb", marginBottom: 12, fontSize: 14 }} />
            <button onClick={createExam} style={{ background: G, color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              <Plus size={14} style={{ verticalAlign: -2 }} /> Create Exam
            </button>
          </div>

          {exams.length === 0 && <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center" }}>No oral exams yet — create one above.</p>}
        </div>
      )}

      {tab === "manage" && selectedExamId && (() => {
        const activeSlotsCount = slots.filter(s => s.status !== "cancelled").length;
        const totalStages = sets.reduce((s: number, set: any) => s + (set.oral_question_set_stages?.length || 0), 0);
        const totalQuestions = sets.reduce((s: number, set: any) => s + (set.oral_question_set_items?.length || 0), 0);
        const manageTabs: { id: "settings" | "slots" | "questions"; label: string; icon: any }[] = [
          { id: "settings", label: "Settings", icon: Settings },
          { id: "slots", label: "Slots", icon: Clock },
          { id: "questions", label: "Questions", icon: ListChecks },
        ];
        return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, margin: "-16px -16px 0", paddingTop: 0, maxWidth: "100vw", overflowX: "hidden" }}>
          {/* ── Sticky header — same pattern as the written-exam editor: dark
              green gradient, back button, title, stat pills, primary action.
              Title sits on its own full-width row so it never has to fight
              the stats/button for space; only the stats row scrolls
              horizontally if it's tight, and it never drags the whole page
              with it (page-level overflowX above is clipped). ── */}
          <div style={{ position: "sticky", top: 0, zIndex: 20, background: `linear-gradient(135deg, ${G} 0%, #083320 100%)`, padding: "14px 16px 0", boxShadow: "0 4px 14px rgba(0,0,0,0.15)", maxWidth: "100%", boxSizing: "border-box" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, minWidth: 0 }}>
              <button onClick={() => setTab("setup")} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 10, padding: "8px 12px", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>
                ←
              </button>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <Mic size={15} color={GOLD} style={{ flexShrink: 0 }} />
                  <h1 style={{ fontSize: 16, fontWeight: 900, color: "#fff", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>Edit Oral Exam</h1>
                  {isAdminContext && (
                    <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 800, color: "#064E3B", background: GOLD, borderRadius: 20, padding: "2px 8px", flexShrink: 0, textTransform: "uppercase" }}>
                      <ShieldCheck size={10} /> Admin
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {selectedExam?.title}{isAdminContext && selectedExam?.created_by && selectedExam.created_by !== user?.id ? ` · by ${creatorNames[selectedExam.created_by] || "teacher"}` : ""}
                </p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, overflowX: "auto", flex: 1, minWidth: 0 }}>
                {[
                  { label: "Slots", value: activeSlotsCount, color: GOLD },
                  { label: "Stages", value: totalStages, color: "#93c5fd" },
                  { label: "Q's", value: totalQuestions, color: "#86efac" },
                ].map((stat, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.1)", borderRadius: 10, padding: "6px 10px", textAlign: "center", minWidth: 44, flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 900, lineHeight: 1, color: stat.color }}>{stat.value}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 }}>{stat.label}</div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => examReadyForLive && goLive(selectedExamId)}
                disabled={!examReadyForLive}
                title={examNotReadyReason}
                style={{ display: "flex", alignItems: "center", gap: 6, background: examReadyForLive ? "#dc2626" : "rgba(255,255,255,0.15)", color: examReadyForLive ? "#fff" : "rgba(255,255,255,0.5)", border: "none", borderRadius: 10, padding: "9px 12px", fontWeight: 800, fontSize: 12, cursor: examReadyForLive ? "pointer" : "not-allowed", whiteSpace: "nowrap", flexShrink: 0 }}
              >
                <Radio size={14} /> Go Live
              </button>
            </div>

            {/* Sub-tab bar */}
            <div style={{ display: "flex", gap: 2 }}>
              {manageTabs.map(mt => (
                <button key={mt.id} onClick={() => setManageSubTab(mt.id)} style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "10px 8px", border: "none", borderRadius: "10px 10px 0 0", cursor: "pointer",
                  fontWeight: 700, fontSize: 12, position: "relative",
                  background: manageSubTab === mt.id ? "#fafafa" : "transparent",
                  color: manageSubTab === mt.id ? G : "rgba(255,255,255,0.7)",
                }}>
                  <mt.icon size={13} /> {mt.label}
                  {manageSubTab === mt.id && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: GOLD }} />}
                </button>
              ))}
            </div>
          </div>

          <div style={{ padding: "0 16px 20px", display: "flex", flexDirection: "column", gap: 20 }}>
          {!examReadyForLive && (
            <p style={{ fontSize: 12, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "6px 10px", margin: 0 }}>
              Not ready to go live yet — {examNotReadyReason?.toLowerCase()}.
            </p>
          )}

          {manageSubTab === "settings" && (<>
          {/* Draft/publish + audience — this exam is invisible to students
              (no open slots bookable, individually-allocated slots still
              notify their student directly regardless) until published. */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Visibility</h3>
                <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 0" }}>
                  {selectedExam?.is_published ? "Students can see this exam and book its open slots." : "Hidden from students — set up slots and question sets, then publish."}
                </p>
              </div>
              <button onClick={togglePublish} style={{
                display: "flex", alignItems: "center", gap: 6, border: "none", borderRadius: 10, padding: "8px 14px", fontWeight: 800, fontSize: 13, cursor: "pointer",
                background: selectedExam?.is_published ? "#f3f4f6" : G, color: selectedExam?.is_published ? "#374151" : "#fff",
              }}>
                {selectedExam?.is_published ? <><EyeOff size={14} /> Move to Draft</> : <><Eye size={14} /> Publish</>}
              </button>
            </div>

            <div>
              <p style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", marginBottom: 6 }}>Audience — who can see/book open slots</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {([
                  { mode: "all" as const, label: "Everyone", icon: Users },
                  { mode: "level" as const, label: "By Level", icon: GraduationCap },
                  { mode: "individual" as const, label: "Individual only", icon: UserCheck },
                ]).map(opt => (
                  <button key={opt.mode} onClick={() => setAssignmentMode(opt.mode, selectedExam?.level)} style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12,
                    border: `1.5px solid ${selectedExam?.oral_assignment_mode === opt.mode ? G : "#e5e7eb"}`,
                    background: selectedExam?.oral_assignment_mode === opt.mode ? "#ecfdf5" : "#fff", color: selectedExam?.oral_assignment_mode === opt.mode ? G : "#374151",
                  }}>
                    <opt.icon size={13} /> {opt.label}
                  </button>
                ))}
              </div>
              {selectedExam?.oral_assignment_mode === "level" && (
                <select value={selectedExam?.level || ""} onChange={e => setAssignmentMode("level", e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e5e7eb", marginTop: 8, fontSize: 13 }}>
                  <option value="">Select level…</option>
                  {academicLevels.map(l => <option key={l.slug} value={l.slug}>{l.name_en}</option>)}
                </select>
              )}
              {selectedExam?.oral_assignment_mode === "individual" && (
                <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>Only slots you allocate directly to a student below will exist — no self-pick open slots for this exam.</p>
              )}
            </div>
          </div>
          </>)}

          {manageSubTab === "slots" && (<>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Add time slot(s)</h3>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button onClick={() => setSlotForm({ ...slotForm, mode: "allocated" })} style={{ flex: 1, padding: 8, borderRadius: 8, border: `2px solid ${slotForm.mode === "allocated" ? G : "#e5e7eb"}`, background: slotForm.mode === "allocated" ? "#ecfdf5" : "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Allocate to a student</button>
              {/* "Individual only" audience mode means no self-serve booking exists for
                  this exam at all (enforced server-side in book_oral_slot regardless) —
                  hiding the option here just keeps the teacher from creating open slots
                  that no student could ever actually see or book. */}
              {selectedExam?.oral_assignment_mode !== "individual" && (
                <button onClick={() => setSlotForm({ ...slotForm, mode: "open" })} style={{ flex: 1, padding: 8, borderRadius: 8, border: `2px solid ${slotForm.mode === "open" ? G : "#e5e7eb"}`, background: slotForm.mode === "open" ? "#ecfdf5" : "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Leave open (self-pick)</button>
              )}
            </div>
            {/* All the actual slot settings laid out as one wrapping horizontal
                row of small labeled fields — date, time, duration, count/student
                — instead of a separate stacked row per field. */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase" }}>
                Date
                <input type="date" value={slotForm.date} onChange={e => setSlotForm({ ...slotForm, date: e.target.value })} style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase" }}>
                Time
                <input type="time" value={slotForm.time} onChange={e => setSlotForm({ ...slotForm, time: e.target.value })} style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase" }}>
                Duration (min)
                <input type="number" placeholder="15" value={slotForm.duration} onChange={e => setSlotForm({ ...slotForm, duration: e.target.value })} style={{ width: 90, padding: 10, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }} />
              </label>
              {slotForm.mode === "open" && (
                <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase" }}>
                  How many slots
                  <input type="number" placeholder="1" value={slotForm.count} onChange={e => setSlotForm({ ...slotForm, count: e.target.value })} style={{ width: 90, padding: 10, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }} />
                </label>
              )}
              {slotForm.mode === "allocated" && (
                <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", flex: "1 1 180px" }}>
                  Student
                  <select value={slotForm.student_id} onChange={e => setSlotForm({ ...slotForm, student_id: e.target.value })} style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }}>
                    <option value="">Select student…</option>
                    {students.map(s => <option key={s.user_id} value={s.user_id}>{s.full_name || s.email}</option>)}
                  </select>
                </label>
              )}
              <button onClick={createSlots} style={{ background: G, color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 700, fontSize: 14, cursor: "pointer", height: 38 }}>
                <Plus size={14} style={{ verticalAlign: -2 }} /> Add
              </button>
            </div>
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
          </>)}

          {manageSubTab === "questions" && (<>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
            {sets.length === 0 ? (
              <>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>New question set</h3>
                <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>This becomes the exam's question bank. Add stages/rounds inside it (e.g. Memorization, then Recitation) — every student walks through all of them in order, scored together.</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input placeholder="Set title (e.g. Tajweed Oral Exam)" value={newSetTitle} onChange={e => setNewSetTitle(e.target.value)} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                  <button onClick={createSet} style={{ background: G, color: "#fff", border: "none", borderRadius: 10, padding: "0 16px", fontWeight: 700, cursor: "pointer" }}>Create</button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Add a stage / round</h3>
                <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                  A new topic (e.g. Recitation after Memorization) belongs here, as a stage — it's linked to the set automatically, nothing to fix afterwards.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  {sets.length > 1 && (
                    <select value={topStageSetId || sets[0].id} onChange={e => setTopStageSetId(e.target.value)} style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }}>
                      {sets.map((s: any) => <option key={s.id} value={s.id}>{s.title}</option>)}
                    </select>
                  )}
                  <input
                    placeholder={`Stage name — defaults to "Stage ${((sets.find((s: any) => s.id === (topStageSetId || sets[0].id))?.oral_question_set_stages || []).length) + 1}"`}
                    value={newStageTitle[topStageSetId || sets[0].id] || ""}
                    onChange={e => setNewStageTitle({ ...newStageTitle, [topStageSetId || sets[0].id]: e.target.value })}
                    style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  />
                  <button onClick={() => addStage(topStageSetId || sets[0].id)} style={{ background: G, color: "#fff", border: "none", borderRadius: 10, padding: "0 16px", fontWeight: 700, cursor: "pointer" }}>
                    <Layers size={14} style={{ verticalAlign: -2 }} /> Add Stage
                  </button>
                </div>
                <button onClick={() => setShowSeparateSet(v => !v)} style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 11, marginTop: 10, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                  {showSeparateSet ? "Cancel" : "Advanced: create a separate randomized set instead"}
                </button>
                {showSeparateSet && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #e5e7eb" }}>
                    <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>Only for a genuine alternate version of the WHOLE exam — students get one set or the other, at random, never both.</p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input placeholder="Set title (e.g. Set B)" value={newSetTitle} onChange={e => setNewSetTitle(e.target.value)} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                      <button onClick={createSet} style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 10, padding: "0 16px", fontWeight: 700, cursor: "pointer" }}>Create separate set</button>
                    </div>
                  </div>
                )}
              </>
            )}
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

                {/* Marks allocated across this set's stages, against the exam's
                    overall total (test = /30, exam = /70). Purely a running
                    guide for the teacher — nothing blocks submission if it
                    doesn't add up, stages left blank just fall back to
                    proportional scoring off raw question points. */}
                {stages.length > 0 && (() => {
                  const target = selectedExam?.type === "test" ? 30 : 70;
                  const allocated = stages.reduce((s: number, st: any) => s + (Number(st.max_points) || 0), 0);
                  const allSet = stages.every((st: any) => st.max_points !== null && st.max_points !== undefined);
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, padding: "6px 10px", borderRadius: 8, marginBottom: 10, background: allSet && allocated === target ? "#f0fdf4" : "#fffbeb", color: allSet && allocated === target ? "#16a34a" : "#92702c" }}>
                      <Hash size={12} /> Stage marks: {allocated} / {target}
                      {allSet && allocated !== target && " — doesn't add up to the exam total yet"}
                      {!allSet && " (unset stages default to proportional scoring)"}
                    </div>
                  );
                })()}

                {/* Stages */}
                {stages.map((stage: any) => (
                  <StageBlock
                    key={stage.id}
                    label={stage.title}
                    labelAr={stage.title_ar}
                    items={itemsByStage[stage.id] || []}
                    timeLimitSeconds={stage.time_limit_seconds}
                    maxPoints={stage.max_points}
                    onDeleteStage={() => deleteStage(stage.id)}
                    onSetTimeLimit={(minutes: string) => setStageTimeLimit(stage.id, minutes)}
                    onRename={(title: string) => renameStage(stage.id, title)}
                    onSetMaxPoints={(v: string) => setStageMaxPoints(stage.id, v)}
                    onDeleteItem={deleteItem}
                    newQ={newQ[`${set.id}::${stage.id}`]}
                    setNewQ={(v: any) => setNewQ({ ...newQ, [`${set.id}::${stage.id}`]: v })}
                    onAdd={() => addQuestion(set.id, stage.id)}
                    aiOpen={!!stageAiOpen[stage.id]}
                    onToggleAi={() => setStageAiOpen({ ...stageAiOpen, [stage.id]: !stageAiOpen[stage.id] })}
                    aiMode={stageAiMode[stage.id] || "prompt"}
                    onAiModeChange={(m: "prompt" | "paste") => setStageAiMode({ ...stageAiMode, [stage.id]: m })}
                    aiInput={stageAiInput[stage.id] || ""}
                    onAiInputChange={(v: string) => setStageAiInput({ ...stageAiInput, [stage.id]: v })}
                    aiCount={stageAiCount[stage.id] || ""}
                    onAiCountChange={(v: string) => setStageAiCount({ ...stageAiCount, [stage.id]: v })}
                    aiLoading={!!stageAiLoading[stage.id]}
                    onAiGenerate={() => generateAIQuestionsForStage(set.id, stage.id, (itemsByStage[stage.id] || []).length)}
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
                  <input placeholder={`New stage name — defaults to "Stage ${(set.oral_question_set_stages || []).length + 1}"`} value={newStageTitle[set.id] || ""} onChange={e => setNewStageTitle({ ...newStageTitle, [set.id]: e.target.value })} style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }} />
                  <button onClick={() => addStage(set.id)} style={{ display: "flex", alignItems: "center", gap: 4, background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 8, padding: "0 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                    <Layers size={13} /> Add Stage
                  </button>
                </div>
              </div>
            );
          })}
          {sets.length === 0 && <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center" }}>No question sets yet.</p>}
          </>)}
          </div>
        </div>
        );
      })()}

    </div>
  );
};

// Ticking countdown, shared by the teacher's Control Room and the student's
// live view. Computed from a shared start timestamp + a per-stage limit so
// both sides always agree on the remaining time without any extra syncing.
// Per the product decision: it never auto-advances — just flashes red at 0
// and leaves the teacher to hit Next when ready.
// Manual start/stop: the countdown no longer starts itself the instant a
// stage opens — it sits at the full limit, stopped, until the teacher taps
// Start (startedAt set, running true). Stop freezes it wherever it is
// (elapsedSeconds banks what's run so far) even if time hasn't run out;
// a later Start resumes from that banked amount instead of restarting.
const StageCountdown = ({ startedAt, limitSeconds, elapsedSeconds, running }: {
  startedAt: string | null | undefined; limitSeconds: number | null | undefined;
  elapsedSeconds?: number | null; running?: boolean;
}) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || !startedAt || !limitSeconds) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, startedAt, limitSeconds]);
  if (!limitSeconds) return null;
  const banked = elapsedSeconds || 0;
  const elapsed = running && startedAt ? banked + (now - new Date(startedAt).getTime()) / 1000 : banked;
  const remaining = Math.max(0, Math.ceil(limitSeconds - elapsed));
  const m = Math.floor(remaining / 60), s = remaining % 60;
  const expired = remaining === 0;
  const notStarted = !running && banked === 0;
  const stopped = !running && banked > 0 && !expired;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 900, fontSize: 13,
      color: expired ? "#fff" : notStarted ? "#9ca3af" : stopped ? "#b45309" : remaining <= 10 ? "#dc2626" : "#374151",
      background: expired ? "#dc2626" : stopped ? "#fffbeb" : "transparent",
      padding: expired ? "3px 10px" : stopped ? "3px 8px" : 0, borderRadius: 20,
      animation: expired ? "pulse 1s infinite" : undefined,
    }}>
      {stopped ? <Pause size={13} /> : <Clock size={13} />} {m}:{String(s).padStart(2, "0")}
      {notStarted && <span style={{ fontWeight: 700, fontSize: 10, textTransform: "uppercase" }}>· not started</span>}
    </span>
  );
};

// A single stage's question list + inline "add question" form (English + optional Arabic).
const StageBlock = ({
  label, labelAr, items, timeLimitSeconds, maxPoints, onDeleteStage, onSetTimeLimit, onRename, onSetMaxPoints, onDeleteItem, newQ, setNewQ, onAdd,
  aiOpen, onToggleAi, aiMode, onAiModeChange, aiInput, onAiInputChange, aiCount, onAiCountChange, aiLoading, onAiGenerate,
}: any) => (
  <div style={{ border: "1px solid #f0f0f0", borderRadius: 10, padding: 12, marginBottom: 10, background: "#fcfcfc" }}>
    {/* Settings row — name, time limit, marks, delete all laid out
        horizontally on one line, same pattern as the written-exam editor,
        instead of stacked. Wraps on narrow screens. */}
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 160px", minWidth: 0 }}>
        <Layers size={13} color={GOLD} style={{ flexShrink: 0 }} />
        {onRename ? (
          <input
            defaultValue={label}
            onBlur={e => onRename(e.target.value)}
            style={{ fontWeight: 700, fontSize: 13, border: "1px solid transparent", borderBottom: "1px dashed #d1d5db", padding: "2px 0", background: "transparent", minWidth: 0, flex: 1 }}
          />
        ) : (
          <span style={{ fontWeight: 700, fontSize: 13 }}>{label}</span>
        )}
        {labelAr && <span dir="rtl" style={{ fontSize: 13, color: "#9ca3af", fontFamily: "'Amiri', serif" }}>· {labelAr}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {onSetMaxPoints && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }} title="How many of the exam's overall /30 or /70 this stage is worth. Leave blank to score it proportionally instead.">
            <span style={{ fontSize: 10, color: "#9ca3af" }}>Marks</span>
            <input
              type="number" min={0} step={0.5} placeholder="—"
              defaultValue={maxPoints ?? ""}
              onBlur={e => onSetMaxPoints(e.target.value)}
              style={{ width: 44, padding: "3px 4px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 11, textAlign: "center" }}
            />
          </div>
        )}
        {onSetTimeLimit && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }} title="Time limit for this stage, per student">
            <Clock size={12} color="#9ca3af" />
            <input
              type="number" min={0} step={0.5} placeholder="off"
              defaultValue={timeLimitSeconds ? timeLimitSeconds / 60 : ""}
              onBlur={e => onSetTimeLimit(e.target.value)}
              style={{ width: 44, padding: "3px 4px", borderRadius: 6, border: "1px solid #e5e7eb", fontSize: 11, textAlign: "center" }}
            />
            <span style={{ fontSize: 10, color: "#9ca3af" }}>min</span>
          </div>
        )}
        {onDeleteStage && <button onClick={onDeleteStage} style={{ background: "none", border: "none", cursor: "pointer" }}><Trash2 size={13} color="#dc2626" /></button>}
      </div>
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

    {onToggleAi && (
      <div style={{ marginTop: 10 }}>
        <button onClick={onToggleAi} style={{ display: "flex", alignItems: "center", gap: 6, background: aiOpen ? "#fff8ea" : "#f3f4f6", color: "#92702c", border: `1px solid ${aiOpen ? GOLD : "#e5e7eb"}`, borderRadius: 8, padding: "6px 10px", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
          <Wand2 size={12} /> {aiOpen ? "Hide AI generator" : "Generate with AI"}
        </button>
        {aiOpen && (
          <div style={{ background: "#faf8f2", border: `1px solid ${GOLD}55`, borderRadius: 10, padding: 10, marginTop: 8 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <button onClick={() => onAiModeChange("prompt")} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "6px 8px", borderRadius: 8, border: `1.5px solid ${aiMode === "prompt" ? GOLD : "#e5e7eb"}`, background: aiMode === "prompt" ? "#fff8ea" : "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                <Wand2 size={11} /> Generate from prompt
              </button>
              <button onClick={() => onAiModeChange("paste")} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "6px 8px", borderRadius: 8, border: `1.5px solid ${aiMode === "paste" ? GOLD : "#e5e7eb"}`, background: aiMode === "paste" ? "#fff8ea" : "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                <ClipboardPaste size={11} /> Paste & reorganise
              </button>
            </div>
            <textarea
              placeholder={aiMode === "paste"
                ? "Paste existing questions (English and/or Arabic) — AI will translate the missing language and add them to THIS stage…"
                : `Describe what to add to "${label}" — AI will write bilingual questions and add them to THIS stage…`}
              value={aiInput}
              onChange={e => onAiInputChange(e.target.value)}
              rows={3}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, resize: "vertical", marginBottom: 8, fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="number" min={1} placeholder="# questions" value={aiCount} onChange={e => onAiCountChange(e.target.value)}
                title="Leave blank to let the AI decide (it will still generate a full batch, not one at a time)"
                style={{ width: 100, padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
              <button onClick={onAiGenerate} disabled={aiLoading} style={{ display: "flex", alignItems: "center", gap: 6, background: GOLD, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 12, cursor: aiLoading ? "wait" : "pointer" }}>
                {aiLoading ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} {aiLoading ? "Generating…" : "Generate"}
              </button>
            </div>
          </div>
        )}
      </div>
    )}

    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
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
