// src/pages/teacher/TeacherOralExams.tsx
// ─────────────────────────────────────────────────────────────────────────
// Live oral / viva exams. Self-contained (like Musabaqah) rather than bolted
// onto the written-exam flow: teacher creates an oral exam, sets up time
// slots (allocated to a student, or left open for self-pick), builds one or
// more question-draw "sets", then runs the live room on exam day — admit
// waiting students, call one in at a time, and score them. Scores are
// written via submit_oral_score() straight into exam_attempts/exam_answers,
// so they show up in TeacherGrading/GradingPage/StudentExamResults with no
// extra plumbing.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import {
  Mic, Plus, Trash2, Users, Clock, Radio, CheckCircle2, XCircle,
  Loader2, ChevronRight, ListChecks, PhoneOff, Shuffle, Send,
} from "lucide-react";

const G = "#064E3B";
const GM = "#075E54";
const GOLD = "#C9A84C";

type Tab = "setup" | "slots" | "sets" | "live";

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
      supabase.from("oral_question_sets" as any).select("*, oral_question_set_items(id, question_id, exam_questions(id, question_text, points))").eq("exam_id", selectedExamId).order("created_at"),
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
  const [newQuestion, setNewQuestion] = useState<Record<string, { text: string; points: string }>>({});

  const createSet = async () => {
    if (!newSetTitle.trim() || !selectedExamId) return;
    const { error } = await supabase.from("oral_question_sets" as any).insert({ exam_id: selectedExamId, title: newSetTitle.trim(), created_by: user!.id });
    if (error) return toast({ title: "Could not create set", description: error.message, variant: "destructive" });
    setNewSetTitle("");
    loadExamData();
  };

  const addQuestionToSet = async (setId: string) => {
    const q = newQuestion[setId];
    if (!q?.text?.trim()) return;
    const { data: question, error } = await supabase.from("exam_questions").insert({
      exam_id: selectedExamId, question_type: "essay", question_text: q.text.trim(), points: Number(q.points) || 1, sort_order: 0,
    }).select().single();
    if (error) return toast({ title: "Could not add question", description: error.message, variant: "destructive" });
    await supabase.from("oral_question_set_items" as any).insert({ set_id: setId, question_id: question.id });
    setNewQuestion({ ...newQuestion, [setId]: { text: "", points: "1" } });
    loadExamData();
  };

  const deleteSet = async (id: string) => {
    await supabase.from("oral_question_sets" as any).delete().eq("id", id);
    loadExamData();
  };

  // ── Live room ────────────────────────────────────────────────────────
  const [joinedLive, setJoinedLive] = useState(false);
  const [lkToken, setLkToken] = useState<{ token: string; url: string } | null>(null);
  const [drawnQuestions, setDrawnQuestions] = useState<any[]>([]);
  const [scores, setScores] = useState<Record<string, { points: string; feedback: string }>>({});
  const [overallFeedback, setOverallFeedback] = useState("");
  const [submittingScore, setSubmittingScore] = useState(false);

  const waitingSlots = slots.filter(s => s.status === "waiting");
  const admittedSlots = slots.filter(s => s.status === "admitted");
  const currentSlot = slots.find(s => s.id === session?.current_slot_id && s.status === "in_progress");

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

  const joinLiveRoom = async () => {
    const { data, error } = await supabase.functions.invoke("oral-exam-livekit-token", { body: { exam_id: selectedExamId } });
    if (error || data?.error) return toast({ title: "Could not join room", description: error?.message || data?.error, variant: "destructive" });
    setLkToken({ token: data.token, url: data.url });
    setJoinedLive(true);
  };

  // Fetch the current student's drawn question set once they've drawn.
  useEffect(() => {
    if (!currentSlot?.drawn_set_id) { setDrawnQuestions([]); return; }
    supabase.rpc("get_my_drawn_oral_questions" as any, { p_slot_id: currentSlot.id }).then(({ data }: any) => {
      setDrawnQuestions(data || []);
      const init: Record<string, { points: string; feedback: string }> = {};
      (data || []).forEach((q: any) => { init[q.id] = { points: "", feedback: "" }; });
      setScores(init);
    });
  }, [currentSlot?.drawn_set_id, currentSlot?.id]);

  const submitScore = async () => {
    if (!currentSlot) return;
    const answers = drawnQuestions.map(q => ({
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
    setDrawnQuestions([]);
    loadExamData();
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}><Loader2 className="animate-spin" style={{ color: G }} /></div>;

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "setup", label: "Exams", icon: Mic },
    { id: "slots", label: "Time Slots", icon: Clock },
    { id: "sets", label: "Question Sets", icon: ListChecks },
    { id: "live", label: "Live Room", icon: Radio },
  ];

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: 16, paddingBottom: 60 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: G, marginBottom: 4 }}>Oral Exams</h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>Schedule, question sets, and the live viva room.</p>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 20, border: "none",
            background: tab === t.id ? G : "#f3f4f6", color: tab === t.id ? "#fff" : "#374151", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
          }}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {exams.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <select value={selectedExamId} onChange={e => setSelectedExamId(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 14, fontWeight: 600 }}>
            {exams.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        </div>
      )}

      {tab === "setup" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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

      {tab === "slots" && selectedExamId && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

      {tab === "sets" && selectedExamId && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>New question set</h3>
            <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Each student blindly draws ONE set at random when it's their turn — make several so it's a genuine draw.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <input placeholder="Set title (e.g. Set A)" value={newSetTitle} onChange={e => setNewSetTitle(e.target.value)} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              <button onClick={createSet} style={{ background: G, color: "#fff", border: "none", borderRadius: 10, padding: "0 16px", fontWeight: 700, cursor: "pointer" }}>Add</button>
            </div>
          </div>

          {sets.map((set: any) => (
            <div key={set.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h4 style={{ fontWeight: 700, fontSize: 14, color: G }}>{set.title}</h4>
                <button onClick={() => deleteSet(set.id)} style={{ background: "none", border: "none", cursor: "pointer" }}><Trash2 size={15} color="#dc2626" /></button>
              </div>
              {(set.oral_question_set_items || []).map((it: any) => (
                <div key={it.id} style={{ fontSize: 13, padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>
                  {it.exam_questions?.question_text} <span style={{ color: "#9ca3af" }}>({it.exam_questions?.points} pts)</span>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input placeholder="Add a question…" value={newQuestion[set.id]?.text || ""} onChange={e => setNewQuestion({ ...newQuestion, [set.id]: { text: e.target.value, points: newQuestion[set.id]?.points || "1" } })} style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }} />
                <input type="number" placeholder="Pts" value={newQuestion[set.id]?.points || "1"} onChange={e => setNewQuestion({ ...newQuestion, [set.id]: { text: newQuestion[set.id]?.text || "", points: e.target.value } })} style={{ width: 60, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }} />
                <button onClick={() => addQuestionToSet(set.id)} style={{ background: GOLD, color: "#fff", border: "none", borderRadius: 8, padding: "0 12px", fontWeight: 700, cursor: "pointer" }}>+</button>
              </div>
            </div>
          ))}
          {sets.length === 0 && <p style={{ color: "#9ca3af", fontSize: 13, textAlign: "center" }}>No question sets yet.</p>}
        </div>
      )}

      {tab === "live" && selectedExamId && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {!joinedLive ? (
            <button onClick={joinLiveRoom} style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 12, padding: "14px 20px", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
              <Radio size={16} style={{ verticalAlign: -3 }} /> Start / Join Live Room
            </button>
          ) : lkToken && (
            <div style={{ borderRadius: 14, overflow: "hidden", height: 360 }}>
              <LiveKitRoom serverUrl={lkToken.url} token={lkToken.token} connect video={false} audio={false} onDisconnected={() => setJoinedLive(false)} style={{ height: "100%" }}>
                <VideoConference />
                <RoomAudioRenderer />
              </LiveKitRoom>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
              <h4 style={{ fontSize: 12, fontWeight: 800, color: "#f59e0b", marginBottom: 8 }}><Users size={13} style={{ verticalAlign: -2 }} /> Waiting ({waitingSlots.length})</h4>
              {waitingSlots.map(s => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "6px 0" }}>
                  <span>{s.student_name}</span>
                  <button onClick={() => admit(s.id)} style={{ background: G, color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Admit</button>
                </div>
              ))}
              {waitingSlots.length === 0 && <p style={{ fontSize: 12, color: "#9ca3af" }}>No one waiting.</p>}
            </div>
            <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
              <h4 style={{ fontSize: 12, fontWeight: 800, color: "#8b5cf6", marginBottom: 8 }}><CheckCircle2 size={13} style={{ verticalAlign: -2 }} /> Admitted ({admittedSlots.length})</h4>
              {admittedSlots.map(s => (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "6px 0" }}>
                  <span>{s.student_name}</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => callIn(s.id)} disabled={!!currentSlot} style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: currentSlot ? "not-allowed" : "pointer", opacity: currentSlot ? 0.5 : 1 }}>Call in</button>
                    <button onClick={() => noShow(s.id)} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer" }}><XCircle size={12} /></button>
                  </div>
                </div>
              ))}
              {admittedSlots.length === 0 && <p style={{ fontSize: 12, color: "#9ca3af" }}>None admitted yet.</p>}
            </div>
          </div>

          {currentSlot && (
            <div style={{ background: "#fff5f5", border: "2px solid #dc2626", borderRadius: 14, padding: 16 }}>
              <h3 style={{ fontWeight: 800, color: "#dc2626", fontSize: 14, marginBottom: 8 }}><Mic size={15} style={{ verticalAlign: -3 }} /> On stage: {currentSlot.student_name}</h3>
              {!currentSlot.drawn_set_id ? (
                <p style={{ fontSize: 13, color: "#6b7280" }}><Shuffle size={13} style={{ verticalAlign: -2 }} /> Waiting for the student to draw their question set…</p>
              ) : drawnQuestions.length === 0 ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {drawnQuestions.map((q: any) => (
                    <div key={q.id} style={{ background: "#fff", borderRadius: 10, padding: 10, border: "1px solid #fecaca" }}>
                      <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{q.question_text} <span style={{ color: "#9ca3af", fontWeight: 400 }}>(max {q.points} pts)</span></p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input type="number" placeholder="Points" max={q.points} value={scores[q.id]?.points || ""} onChange={e => setScores({ ...scores, [q.id]: { ...scores[q.id], points: e.target.value } })} style={{ width: 80, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }} />
                        <input placeholder="Feedback (optional)" value={scores[q.id]?.feedback || ""} onChange={e => setScores({ ...scores, [q.id]: { ...scores[q.id], feedback: e.target.value } })} style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }} />
                      </div>
                    </div>
                  ))}
                  <input placeholder="Overall feedback (optional)" value={overallFeedback} onChange={e => setOverallFeedback(e.target.value)} style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }} />
                  <button onClick={submitScore} disabled={submittingScore} style={{ background: G, color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                    {submittingScore ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} style={{ verticalAlign: -2 }} />} Submit Score
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TeacherOralExams;
