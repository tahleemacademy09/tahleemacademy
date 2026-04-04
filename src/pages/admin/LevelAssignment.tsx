/*  src/pages/admin/LevelAssignment.tsx  — NEW REGISTRATIONS PANEL
    ──────────────────────────────────────────────────────────────────
    Central hub for all new student registrations.
    Shows EVERYTHING about each new student:
      • Onboarding form data
      • Entrance exam record + score
      • AI recitation score + audio player
      • Teacher evaluation input (score + notes)
      • Level assignment + approval
    Admin can grade, grade recitation, and assign levels — all in one place.
    Route: /admin/level-assignment
*/

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, Clock, GraduationCap, Mic,
  FileText, User, Mail, Star, ChevronDown, Loader2,
  RefreshCw, Play, Eye, Check, X as XIcon, Filter,
  Phone, Calendar, Globe, BookOpen, Target, AlertTriangle,
  UserCheck, ChevronRight, Award, Music, ClipboardList,
  Heart, Layers, Download, ExternalLink,
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#D4A843";

// ── Types ─────────────────────────────────────────────────────────────────────
interface StudentEval {
  user_id:           string;
  full_name:         string;
  full_name_ar:      string;
  email:             string;
  student_id:        string;
  avatar_url:        string;
  // Tasjeel
  current_step:      string;
  payment_status:    string;
  level_assigned:    string | null;
  // Onboarding form
  onboarding:        Record<string, any> | null;
  // Entrance exam
  exam_score:        number | null;
  exam_percentage:   number | null;
  exam_completed:    boolean;
  exam_attempt_id:   string | null;
  exam_title:        string | null;
  exam_passed:       boolean;
  // Recitation
  rec_status:        string | null;
  rec_ai_score:      number | null;
  rec_audio_path:    string | null;
  rec_teacher_score: number | null;
  rec_teacher_notes: string | null;
  rec_session_date:  string | null;
  rec_approved:      boolean;
  // Level assignment
  current_level:     string | null;
  admin_approved:    boolean;
  final_level:       string | null;
  registered_at:     string | null;
}

const LEVELS = ["beginner", "intermediate", "advanced"] as const;
type Level = typeof LEVELS[number];

const LEVEL_CFG: Record<Level, { label: string; labelAr: string; color: string; bg: string; border: string }> = {
  beginner:     { label: "Beginner",     labelAr: "مبتدئ",    color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC" },
  intermediate: { label: "Intermediate", labelAr: "متوسط",    color: "#2563EB", bg: "#EFF6FF", border: "#93C5FD" },
  advanced:     { label: "Advanced",     labelAr: "متقدم",    color: "#7C3AED", bg: "#F5F3FF", border: "#C4B5FD" },
};

const STEP_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  enrollment:       { label: "Enrolled",         color: "#6B7280", bg: "#F9FAFB" },
  payment:          { label: "Awaiting Payment",  color: "#D97706", bg: "#FFFBEB" },
  onboarding:       { label: "Onboarding",        color: "#2563EB", bg: "#EFF6FF" },
  exam:             { label: "Exam Stage",         color: "#7C3AED", bg: "#F5F3FF" },
  review:           { label: "Under Review",       color: "#D97706", bg: "#FFFBEB" },
  level_assignment: { label: "Awaiting Level",     color: "#EA580C", bg: "#FFF7ED" },
  completed:        { label: "Enrolled ✓",         color: "#16A34A", bg: "#F0FDF4" },
};

const scoreColor = (s: number | null) =>
  !s ? "#9ca3af" : s >= 80 ? "#16A34A" : s >= 60 ? "#D97706" : "#DC2626";
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtScore = (s: number | null) => (s !== null ? `${Math.round(s)}%` : "—");

const calcFinal = (exam: number | null, ai: number | null, teacher: number | null): number | null => {
  if (exam === null && ai === null && teacher === null) return null;
  const e = exam ?? 0; const a = ai ?? 0; const t = teacher ?? 0;
  const w = (exam !== null ? 0.4 : 0) + (ai !== null ? 0.2 : 0) + (teacher !== null ? 0.4 : 0);
  if (w === 0) return null;
  return Math.round(((e * 0.4) + (a * 0.2) + (t * 0.4)) / w);
};

const suggestLevel = (final: number | null): Level => {
  if (!final) return "beginner";
  if (final >= 80) return "advanced";
  if (final >= 60) return "intermediate";
  return "beginner";
};

// ── Score badge ───────────────────────────────────────────────────────────────
const ScorePill = ({ score, label, bg }: { score: number | null; label: string; bg: string }) => (
  <div style={{ background: bg, borderRadius: 8, padding: "5px 10px", textAlign: "center", minWidth: 56 }}>
    <div style={{ fontSize: 14, fontWeight: 900, color: scoreColor(score) }}>{fmtScore(score)}</div>
    <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
  </div>
);

// ── Onboarding field renderer ─────────────────────────────────────────────────
const OnboardingInfo = ({ data }: { data: Record<string, any> }) => {
  const rows: [string, string][] = [
    ["Phone",         data.phone || "—"],
    ["Date of Birth", data.dob || "—"],
    ["Gender",        data.gender || "—"],
    ["Country",       data.country || "—"],
    ["City",          data.city || "—"],
    ["Occupation",    data.occupation || "—"],
    ["Quran Level",   data.quran_level || "—"],
    ["Tajweed",       data.tajweed_knowledge || "—"],
    ["Arabic Level",  data.arabic_level || "—"],
    ["Islamic Studies", data.islamic_knowledge || "—"],
    ["Years Studying", data.years_studying || "—"],
    ["Preferred Time", data.preferred_time || "—"],
    ["Hours/Day",     data.hours_per_day || "—"],
    ["Device",        data.preferred_device || "—"],
    ["Heard From",    data.heard_from || "—"],
  ];
  const memorized: string[] = data.memorized_surahs || [];
  const subjects: string[]  = data.preferred_subjects || [];
  const goals: string[]     = data.learning_goals || [];

  return (
    <div style={{ background: "#FAFAFA", borderRadius: 14, padding: 16, border: "1px solid #E5E7EB" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <ClipboardList size={15} color={G} />
        <span style={{ fontSize: 12, fontWeight: 800, color: G, textTransform: "uppercase", letterSpacing: 0.5 }}>Onboarding Form</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", marginBottom: 12 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ fontSize: 12 }}>
            <span style={{ color: "#9CA3AF", marginRight: 4 }}>{k}:</span>
            <span style={{ fontWeight: 600, color: "#374151" }}>{v}</span>
          </div>
        ))}
      </div>
      {memorized.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>Memorised Surahs:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {memorized.map(s => <span key={s} style={{ background: "#F0FDF4", color: G, fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, border: "1px solid #86EFAC" }}>{s}</span>)}
          </div>
        </div>
      )}
      {subjects.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>Interested Subjects:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {subjects.map(s => <span key={s} style={{ background: "#EFF6FF", color: "#2563EB", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, border: "1px solid #93C5FD" }}>{s}</span>)}
          </div>
        </div>
      )}
      {goals.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>Learning Goals:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {goals.map(g => <span key={g} style={{ background: "#FFF7ED", color: "#EA580C", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, border: "1px solid #FED7AA" }}>{g}</span>)}
          </div>
        </div>
      )}
      {data.extra_notes && (
        <div style={{ marginTop: 10, background: "#FFFBEB", borderRadius: 8, padding: "8px 10px", border: "1px solid #FDE68A", fontSize: 12, color: "#92400E" }}>
          <strong>Notes:</strong> {data.extra_notes}
        </div>
      )}
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const LevelAssignment = () => {
  const { toast }    = useToast();
  const navigate     = useNavigate();
  const [students, setStudents]     = useState<StudentEval[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState<"pending" | "approved" | "all">("pending");
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [activeTab, setActiveTab]   = useState<Record<string, string>>({});
  const [assigning, setAssigning]   = useState<string | null>(null);
  const [selectedLevels, setSelectedLevels] = useState<Record<string, Level>>({});
  const [audioUrls, setAudioUrls]   = useState<Record<string, string>>({});
  const [teacherNotes, setTeacherNotes]   = useState<Record<string, string>>({});
  const [teacherScores, setTeacherScores] = useState<Record<string, string>>({});
  const [savingTeacher, setSavingTeacher] = useState<string | null>(null);
  const [searchQ, setSearchQ]       = useState("");

  // ── Load all pipeline students ─────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 1. All tasjeel progress rows
      const { data: tasjeelRows } = await supabase
        .from("tasjeel_progress" as any)
        .select("user_id, current_step, level_assigned, payment_status, created_at")
        .neq("current_step", "enrollment");  // skip people who haven't even started paying

      if (!tasjeelRows || tasjeelRows.length === 0) { setStudents([]); return; }

      const uids = tasjeelRows.map((r: any) => r.user_id);
      const tasjeelMap: Record<string, any> = {};
      tasjeelRows.forEach((r: any) => { tasjeelMap[r.user_id] = r; });

      // 2. Profiles
      const { data: profRows } = await supabase
        .from("profiles")
        .select("user_id, full_name, full_name_ar, email, student_id, avatar_url, level, course_level")
        .in("user_id", uids);
      const profMap: Record<string, any> = {};
      (profRows || []).forEach((r: any) => { profMap[r.user_id] = r; });

      // 3. Onboarding forms
      const { data: onbRows } = await (supabase as any)
        .from("onboarding_forms")
        .select("*")
        .in("user_id", uids);
      const onbMap: Record<string, any> = {};
      (onbRows || []).forEach((r: any) => { onbMap[r.user_id] = r; });

      // 4. Exam attempts (entrance exam score)
      const { data: examRows } = await supabase
        .from("exam_attempts")
        .select("id, user_id, score, percentage, status, submitted_at, exams(title, passing_score)")
        .in("user_id", uids)
        .in("status", ["submitted", "graded", "completed"]);
      const examMap: Record<string, any> = {};
      (examRows || []).forEach((r: any) => {
        // Keep the latest submitted attempt
        if (!examMap[r.user_id] || new Date(r.submitted_at) > new Date(examMap[r.user_id].submitted_at)) {
          examMap[r.user_id] = r;
        }
      });

      // 5. Recitation tests
      const { data: recRows } = await (supabase as any)
        .from("recitation_tests")
        .select("*")
        .in("user_id", uids);
      const recMap: Record<string, any> = {};
      (recRows || []).forEach((r: any) => { recMap[r.user_id] = r; });

      // 6. Build combined objects
      const built: StudentEval[] = uids.map((uid: string) => {
        const t  = tasjeelMap[uid] || {};
        const p  = profMap[uid]    || {};
        const o  = onbMap[uid]     || null;
        const e  = examMap[uid]    || {};
        const r  = recMap[uid]     || {};

        const examPct = e.percentage ?? (e.score ? e.score : null);
        const examPassing = e.exams?.passing_score ?? 50;

        return {
          user_id:           uid,
          full_name:         p.full_name || "Unknown Student",
          full_name_ar:      p.full_name_ar || "",
          email:             p.email || "",
          student_id:        p.student_id || "—",
          avatar_url:        p.avatar_url || "",
          current_step:      t.current_step || "onboarding",
          payment_status:    t.payment_status || "pending",
          level_assigned:    t.level_assigned || null,
          onboarding:        o,
          exam_score:        examPct,
          exam_percentage:   examPct,
          exam_completed:    !!e.submitted_at,
          exam_attempt_id:   e.id || null,
          exam_title:        e.exams?.title || null,
          exam_passed:       examPct !== null && examPct >= examPassing,
          rec_status:        r.status || null,
          rec_ai_score:      r.ai_score ?? null,
          rec_audio_path:    r.audio_path || null,
          rec_teacher_score: r.teacher_score ?? null,
          rec_teacher_notes: r.teacher_notes || null,
          rec_session_date:  r.stage3_session_date || null,
          rec_approved:      !!r.admin_approved,
          current_level:     p.level || p.course_level || t.level_assigned || null,
          admin_approved:    t.current_step === "completed",
          final_level:       r.final_level || t.level_assigned || null,
          registered_at:     t.created_at || null,
        };
      });

      setStudents(built);

      // Pre-fill teacher fields
      const tnotes: Record<string, string> = {};
      const tscores: Record<string, string> = {};
      built.forEach(s => {
        if (s.rec_teacher_notes) tnotes[s.user_id] = s.rec_teacher_notes;
        if (s.rec_teacher_score !== null) tscores[s.user_id] = String(s.rec_teacher_score);
      });
      setTeacherNotes(tnotes);
      setTeacherScores(tscores);
    } catch (err) {
      console.error("Load error:", err);
      toast({ title: "Error loading students", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // ── Resolve audio URL ──────────────────────────────────────────────────────
  const resolveAudio = async (path: string, uid: string) => {
    if (audioUrls[uid]) return;
    if (!path) return;
    if (path.startsWith("data:") || path.startsWith("http")) {
      setAudioUrls(p => ({ ...p, [uid]: path })); return;
    }
    const { data } = await supabase.storage.from("recitation-audio").createSignedUrl(path, 3600);
    if (data?.signedUrl) setAudioUrls(p => ({ ...p, [uid]: data.signedUrl }));
  };

  // ── Save teacher evaluation ────────────────────────────────────────────────
  const saveTeacherEval = async (uid: string) => {
    setSavingTeacher(uid);
    const score = parseInt(teacherScores[uid] || "0");
    const notes = teacherNotes[uid] || "";
    await (supabase as any).from("recitation_tests").update({
      teacher_score: isNaN(score) ? null : score,
      teacher_notes: notes,
      stage3_completed_at: new Date().toISOString(),
      status: "stage3_complete",
    }).eq("user_id", uid);
    await load();
    setSavingTeacher(null);
    toast({ title: "✅ Teacher evaluation saved" });
  };

  // ── Assign level ───────────────────────────────────────────────────────────
  const assignLevel = async (student: StudentEval) => {
    const lvl = selectedLevels[student.user_id] ||
      suggestLevel(calcFinal(student.exam_score, student.rec_ai_score, student.rec_teacher_score));
    setAssigning(student.user_id);
    try {
      await supabase.from("profiles")
        .update({ level: lvl, course_level: lvl } as any)
        .eq("user_id", student.user_id);

      const { data: recRow } = await (supabase as any)
        .from("recitation_tests").select("id").eq("user_id", student.user_id).maybeSingle();
      if (recRow) {
        await (supabase as any).from("recitation_tests").update({
          final_level: lvl, admin_approved: true,
          admin_approved_at: new Date().toISOString(), status: "approved",
        }).eq("user_id", student.user_id);
      }

      await (supabase as any).from("tasjeel_progress").update({
        current_step:      "completed",
        level_assigned:    lvl,
        level_assigned_at: new Date().toISOString(),
        completed_at:      new Date().toISOString(),
        updated_at:        new Date().toISOString(),
      }).eq("user_id", student.user_id);

      await (supabase as any).from("notifications").insert({
        user_id:    student.user_id,
        title:      "🎉 Your Level Has Been Assigned!",
        message:    `Congratulations, ${student.full_name}! You have been placed in the ${LEVEL_CFG[lvl as Level]?.label || lvl} level. Your full dashboard is now unlocked. بارك الله فيك!`,
        type:       "level_assigned",
        is_read:    false,
        created_at: new Date().toISOString(),
        metadata: JSON.stringify({ level: lvl, action_url: "/student" }),
      });

      toast({ title: `✅ ${student.full_name} assigned to ${LEVEL_CFG[lvl as Level]?.label}` });
      await load();
    } catch (e: any) {
      toast({ title: "Assignment failed", description: e.message, variant: "destructive" });
    } finally {
      setAssigning(null);
    }
  };

  // ── Filter + search ────────────────────────────────────────────────────────
  const filtered = students.filter(s => {
    const matchFilter =
      filter === "all"      ? true :
      filter === "pending"  ? !s.admin_approved :
      s.admin_approved;
    const q = searchQ.toLowerCase();
    const matchSearch = !q ||
      s.full_name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      s.student_id.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  const pendingCount  = students.filter(s => !s.admin_approved).length;
  const approvedCount = students.filter(s =>  s.admin_approved).length;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getTab = (uid: string) => activeTab[uid] || "overview";
  const setTab = (uid: string, tab: string) => setActiveTab(p => ({ ...p, [uid]: tab }));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", minHeight: "100vh", background: "#F0F4F0" }}>
      <style>{"@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}} @keyframes spin{to{transform:rotate(360deg)}}"}</style>

      {/* ── HEADER ── */}
      <div style={{ background: `linear-gradient(135deg,${G},${GM})`, padding: "32px 24px 28px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.04,
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23fff'%3E%3Cpath d='M30 0l30 30-30 30L0 30z'/%3E%3C/g%3E%3C/svg%3E")` }} />
        <div style={{ position: "relative", maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <UserCheck size={22} color={GOLD} />
            </div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, color: "#fff", margin: 0 }}>New Registrations</h1>
              <p style={{ color: "rgba(255,255,255,.65)", fontSize: 13, margin: 0, fontFamily: "'Amiri',serif" }}>
                التسجيل الجديد — Review & assign levels to new students
              </p>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
            {[
              { label: "Total New", val: students.length, color: "#fff" },
              { label: "Pending Review", val: pendingCount, color: GOLD },
              { label: "Level Assigned", val: approvedCount, color: "#22c55e" },
              { label: "With Exam Scores", val: students.filter(s => s.exam_completed).length, color: "#A78BFA" },
              { label: "With Recitation", val: students.filter(s => s.rec_audio_path).length, color: "#38BDF8" },
            ].map(s => (
              <div key={s.label} style={{ background: "rgba(255,255,255,.1)", borderRadius: 12, padding: "10px 18px", textAlign: "center", minWidth: 100 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CONTROLS ── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px 0" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {/* Filter tabs */}
          {([
            { k: "pending",  label: `Pending (${pendingCount})` },
            { k: "approved", label: `Assigned (${approvedCount})` },
            { k: "all",      label: `All (${students.length})` },
          ] as const).map(t => (
            <button key={t.k} onClick={() => setFilter(t.k)}
              style={{ padding: "8px 18px", borderRadius: 20, border: `2px solid ${filter === t.k ? GM : "#e5e7eb"}`, background: filter === t.k ? "#F0FDF4" : "#fff", color: filter === t.k ? G : "#666", fontSize: 13, fontWeight: filter === t.k ? 700 : 500, cursor: "pointer", transition: "all .15s" }}>
              {t.label}
            </button>
          ))}

          {/* Search */}
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Search name, email, ID…"
            style={{ marginLeft: "auto", padding: "8px 14px", borderRadius: 20, border: "2px solid #e5e7eb", fontSize: 13, outline: "none", minWidth: 220 }}
          />

          <button onClick={load}
            style={{ background: "none", border: "2px solid #e5e7eb", borderRadius: 20, padding: "8px 14px", fontSize: 12, color: "#666", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* ── STUDENT LIST ── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 16px 48px" }}>

        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
            <Loader2 style={{ width: 36, height: 36, color: GM, animation: "spin .8s linear infinite" }} />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ background: "#fff", borderRadius: 18, padding: 48, textAlign: "center", color: "#9ca3af" }}>
            <UserCheck size={44} style={{ margin: "0 auto 14px", display: "block", color: "#d1d5db" }} />
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              {filter === "pending" ? "No students pending level assignment" :
               filter === "approved" ? "No students have been assigned levels yet" :
               "No students found"}
            </div>
            <div style={{ fontSize: 13, marginTop: 6, color: "#d1d5db" }}>
              {searchQ && "Try clearing your search filter"}
            </div>
          </div>
        )}

        {!loading && filtered.map(student => {
          const isOpen = expanded === student.user_id;
          const final  = calcFinal(student.exam_score, student.rec_ai_score, student.rec_teacher_score);
          const suggested = suggestLevel(final);
          const lvl    = selectedLevels[student.user_id] || suggested;
          const lvlCfg = LEVEL_CFG[lvl];
          const stepCfg = STEP_LABELS[student.current_step] || STEP_LABELS.onboarding;
          const tab    = getTab(student.user_id);

          return (
            <div key={student.user_id} style={{
              background: "#fff", borderRadius: 18,
              boxShadow: "0 2px 12px rgba(0,0,0,.07)", marginBottom: 14,
              overflow: "hidden", animation: "fadeUp .3s ease",
              border: student.admin_approved ? "2px solid #86EFAC" : "2px solid #e5e7eb",
            }}>

              {/* ── STUDENT ROW HEADER ── */}
              <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", background: isOpen ? "#FAFAFA" : "#fff" }}
                onClick={() => {
                  const next = isOpen ? null : student.user_id;
                  setExpanded(next);
                  if (next && student.rec_audio_path) resolveAudio(student.rec_audio_path, student.user_id);
                }}>

                {/* Avatar */}
                {student.avatar_url
                  ? <img src={student.avatar_url} style={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: `2px solid ${student.admin_approved ? "#86EFAC" : "#e5e7eb"}` }} alt="" />
                  : <div style={{ width: 46, height: 46, borderRadius: "50%", background: `linear-gradient(135deg,${G},${GM})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 18, flexShrink: 0 }}>
                      {student.full_name[0]?.toUpperCase()}
                    </div>
                }

                {/* Name + status */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800, fontSize: 15, color: G }}>{student.full_name}</span>
                    {student.full_name_ar && <span style={{ fontSize: 13, color: "#9ca3af", fontFamily: "'Amiri',serif" }}>{student.full_name_ar}</span>}
                    {student.admin_approved && (
                      <span style={{ background: "#E8F5E9", color: "#166534", fontSize: 10, fontWeight: 800, padding: "2px 10px", borderRadius: 20, display: "flex", alignItems: "center", gap: 4 }}>
                        <CheckCircle2 size={10} /> Level Assigned
                      </span>
                    )}
                    <span style={{ background: stepCfg.bg, color: stepCfg.color, fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 20 }}>
                      {stepCfg.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                    {student.email} · ID: {student.student_id}
                    {student.registered_at && <span> · Registered {fmtDate(student.registered_at)}</span>}
                  </div>
                  {student.admin_approved && student.final_level && (
                    <div style={{ marginTop: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, background: LEVEL_CFG[student.final_level as Level]?.bg || "#F0FDF4", color: LEVEL_CFG[student.final_level as Level]?.color || G, padding: "2px 10px", borderRadius: 20, border: `1px solid ${LEVEL_CFG[student.final_level as Level]?.border || "#86EFAC"}` }}>
                        {LEVEL_CFG[student.final_level as Level]?.label || student.final_level}
                      </span>
                    </div>
                  )}
                </div>

                {/* Score pills */}
                <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                  <ScorePill score={student.exam_score}        label="Exam"    bg="#FFFBEB" />
                  <ScorePill score={student.rec_ai_score}      label="AI Rec"  bg="#EFF6FF" />
                  <ScorePill score={student.rec_teacher_score} label="Teacher" bg="#F5F3FF" />
                  {final !== null && (
                    <div style={{ background: `${scoreColor(final)}12`, borderRadius: 8, padding: "5px 10px", textAlign: "center", minWidth: 56, border: `1px solid ${scoreColor(final)}30` }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: scoreColor(final) }}>{final}%</div>
                      <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase" }}>Final</div>
                    </div>
                  )}
                </div>

                <ChevronDown size={16} color="#9ca3af" style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .2s", flexShrink: 0 }} />
              </div>

              {/* ── EXPANDED DETAIL ── */}
              {isOpen && (
                <div style={{ borderTop: "2px solid #F3F4F6" }}>

                  {/* Tab bar */}
                  <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #E5E7EB", background: "#FAFAFA", overflowX: "auto" }}>
                    {[
                      { id: "overview",    label: "📋 Overview",         show: true },
                      { id: "onboarding",  label: "👤 Onboarding Form",  show: !!student.onboarding },
                      { id: "exam",        label: "📝 Entrance Exam",     show: true },
                      { id: "recitation",  label: "🎤 Recitation",        show: true },
                      { id: "assign",      label: "🎓 Assign Level",      show: true },
                    ].filter(t => t.show).map(t => (
                      <button key={t.id} onClick={() => setTab(student.user_id, t.id)}
                        style={{ padding: "10px 18px", border: "none", borderBottom: `3px solid ${tab === t.id ? GM : "transparent"}`, background: "transparent", color: tab === t.id ? G : "#6B7280", fontSize: 13, fontWeight: tab === t.id ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap", transition: "all .15s" }}>
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ padding: 20 }}>

                    {/* ── OVERVIEW TAB ── */}
                    {tab === "overview" && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
                        {/* Registration info */}
                        <div style={{ background: "#F9FAFB", borderRadius: 14, padding: 16, border: "1px solid #E5E7EB" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                            <User size={14} color={G} />
                            <span style={{ fontSize: 12, fontWeight: 800, color: G, textTransform: "uppercase" }}>Student Info</span>
                          </div>
                          {[
                            ["Email",       student.email],
                            ["Student ID",  student.student_id],
                            ["Step",        student.current_step.replace("_", " ")],
                            ["Registered",  fmtDate(student.registered_at)],
                            ["Payment",     student.payment_status],
                          ].map(([k, v]) => (
                            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                              <span style={{ color: "#9CA3AF" }}>{k}</span>
                              <span style={{ fontWeight: 600, color: "#374151", textAlign: "right", maxWidth: "60%" }}>{v}</span>
                            </div>
                          ))}
                        </div>

                        {/* Exam summary */}
                        <div style={{ background: "#FFFBEB", borderRadius: 14, padding: 16, border: "1px solid #FDE68A" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                            <FileText size={14} color={GOLD} />
                            <span style={{ fontSize: 12, fontWeight: 800, color: "#92400E", textTransform: "uppercase" }}>Entrance Exam</span>
                          </div>
                          <div style={{ fontSize: 32, fontWeight: 900, color: scoreColor(student.exam_score), marginBottom: 4 }}>{fmtScore(student.exam_score)}</div>
                          <div style={{ fontSize: 12, color: "#A16207" }}>
                            {student.exam_title || "Entrance Examination"}
                          </div>
                          <div style={{ fontSize: 12, marginTop: 8, color: student.exam_completed ? "#16A34A" : "#DC2626", fontWeight: 700 }}>
                            {student.exam_completed ? "✓ Submitted" : "✗ Not completed"}
                          </div>
                          {student.exam_passed && <div style={{ fontSize: 11, color: "#16A34A" }}>✓ Passed</div>}
                        </div>

                        {/* Recitation summary */}
                        <div style={{ background: "#EFF6FF", borderRadius: 14, padding: 16, border: "1px solid #93C5FD" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                            <Mic size={14} color="#2563EB" />
                            <span style={{ fontSize: 12, fontWeight: 800, color: "#1E3A5F", textTransform: "uppercase" }}>Recitation</span>
                          </div>
                          <div style={{ fontSize: 32, fontWeight: 900, color: scoreColor(student.rec_ai_score), marginBottom: 4 }}>{fmtScore(student.rec_ai_score)}</div>
                          <div style={{ fontSize: 12, color: "#1D4ED8" }}>AI Score (20% of final)</div>
                          {student.rec_audio_path && (
                            <button onClick={() => resolveAudio(student.rec_audio_path!, student.user_id)}
                              style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 5, fontSize: 11, background: GM, color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>
                              <Play size={11} /> Load Recitation Audio
                            </button>
                          )}
                          {audioUrls[student.user_id] && (
                            <audio controls src={audioUrls[student.user_id]} style={{ width: "100%", marginTop: 8, borderRadius: 8, height: 36 }} />
                          )}
                          {!student.rec_audio_path && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>No audio submitted yet</div>}
                        </div>

                        {/* Final score */}
                        {final !== null && (
                          <div style={{ background: `${scoreColor(final)}08`, borderRadius: 14, padding: 16, border: `1px solid ${scoreColor(final)}25` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                              <Award size={14} color={scoreColor(final)} />
                              <span style={{ fontSize: 12, fontWeight: 800, color: scoreColor(final), textTransform: "uppercase" }}>Final Score</span>
                            </div>
                            <div style={{ fontSize: 40, fontWeight: 900, color: scoreColor(final), marginBottom: 4 }}>{final}%</div>
                            <div style={{ fontSize: 12, color: "#6B7280" }}>Weighted: 40% exam · 20% AI · 40% teacher</div>
                            <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: lvlCfg.color }}>
                              Suggested: {lvlCfg.label}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── ONBOARDING TAB ── */}
                    {tab === "onboarding" && student.onboarding && (
                      <OnboardingInfo data={student.onboarding} />
                    )}
                    {tab === "onboarding" && !student.onboarding && (
                      <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
                        <ClipboardList size={36} style={{ margin: "0 auto 12px", display: "block", opacity: 0.4 }} />
                        <div style={{ fontWeight: 600 }}>Onboarding form not yet completed</div>
                      </div>
                    )}

                    {/* ── EXAM TAB ── */}
                    {tab === "exam" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <div style={{ background: "#FFFBEB", borderRadius: 14, padding: 20, border: "1px solid #FDE68A" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                            <FileText size={18} color={GOLD} />
                            <span style={{ fontSize: 15, fontWeight: 800, color: "#92400E" }}>Entrance Exam Record</span>
                          </div>
                          {student.exam_completed ? (
                            <div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                                <div style={{ background: "#fff", borderRadius: 12, padding: 16, textAlign: "center" }}>
                                  <div style={{ fontSize: 42, fontWeight: 900, color: scoreColor(student.exam_score) }}>{fmtScore(student.exam_score)}</div>
                                  <div style={{ fontSize: 12, color: "#9ca3af" }}>Exam Score (40% of final)</div>
                                </div>
                                <div style={{ background: "#fff", borderRadius: 12, padding: 16 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Details</div>
                                  {[
                                    ["Exam", student.exam_title || "Entrance Exam"],
                                    ["Status", student.exam_passed ? "✅ Passed" : "❌ Below passing"],
                                    ["Attempt ID", student.exam_attempt_id ? student.exam_attempt_id.slice(0, 8) + "…" : "—"],
                                  ].map(([k, v]) => (
                                    <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                                      <span style={{ color: "#9ca3af" }}>{k}:</span>
                                      <span style={{ fontWeight: 600, color: "#374151" }}>{v}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {student.exam_attempt_id && (
                                <button
                                  onClick={() => navigate(`/admin/grading`)}
                                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, border: `1.5px solid ${GM}`, background: "#F0FDF4", color: G, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                                  <ExternalLink size={13} /> View in Grading Panel
                                </button>
                              )}
                            </div>
                          ) : (
                            <div style={{ textAlign: "center", padding: 24, color: "#9ca3af" }}>
                              <AlertTriangle size={32} style={{ margin: "0 auto 12px", display: "block", color: "#FCA5A5" }} />
                              <div style={{ fontWeight: 600, fontSize: 14 }}>Entrance exam not yet submitted</div>
                              <div style={{ fontSize: 12, marginTop: 4 }}>Student is at step: <strong>{student.current_step}</strong></div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── RECITATION TAB ── */}
                    {tab === "recitation" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        {/* Audio */}
                        <div style={{ background: "#EFF6FF", borderRadius: 14, padding: 20, border: "1px solid #93C5FD" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                            <Music size={18} color="#2563EB" />
                            <span style={{ fontSize: 15, fontWeight: 800, color: "#1E3A5F" }}>Recitation Audio</span>
                          </div>
                          {student.rec_audio_path ? (
                            audioUrls[student.user_id] ? (
                              <div>
                                <audio controls src={audioUrls[student.user_id]} style={{ width: "100%", borderRadius: 10, marginBottom: 12 }} />
                                <div style={{ display: "flex", gap: 8 }}>
                                  <div style={{ flex: 1, background: "#fff", borderRadius: 10, padding: "12px 16px", textAlign: "center" }}>
                                    <div style={{ fontSize: 28, fontWeight: 900, color: scoreColor(student.rec_ai_score) }}>{fmtScore(student.rec_ai_score)}</div>
                                    <div style={{ fontSize: 11, color: "#9ca3af" }}>AI Score</div>
                                  </div>
                                  <div style={{ flex: 1, background: "#fff", borderRadius: 10, padding: "12px 16px", textAlign: "center" }}>
                                    <div style={{ fontSize: 12, color: "#6B7280" }}>Status</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: student.rec_approved ? "#16A34A" : "#D97706" }}>
                                      {student.rec_approved ? "✓ Approved" : student.rec_status || "Pending review"}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => resolveAudio(student.rec_audio_path!, student.user_id)}
                                style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", borderRadius: 12, border: "none", background: GM, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                                <Play size={14} /> Load & Play Recitation Audio
                              </button>
                            )
                          ) : (
                            <div style={{ textAlign: "center", padding: 24, color: "#9ca3af" }}>
                              <Mic size={32} style={{ margin: "0 auto 12px", display: "block", opacity: 0.4 }} />
                              <div style={{ fontWeight: 600 }}>No recitation audio submitted yet</div>
                            </div>
                          )}
                        </div>

                        {/* Teacher evaluation form */}
                        <div style={{ background: "#F5F3FF", borderRadius: 14, padding: 20, border: "1px solid #C4B5FD" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                            <Eye size={18} color="#7C3AED" />
                            <span style={{ fontSize: 15, fontWeight: 800, color: "#4C1D95" }}>Teacher Evaluation (40% of final)</span>
                            {student.rec_session_date && (
                              <span style={{ marginLeft: "auto", fontSize: 11, color: "#7C3AED", background: "#EDE9FE", padding: "3px 10px", borderRadius: 20 }}>
                                Session: {fmtDate(student.rec_session_date)}
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                            <div style={{ flex: "0 0 120px" }}>
                              <label style={{ fontSize: 12, fontWeight: 600, color: "#4C1D95", display: "block", marginBottom: 4 }}>Score (0–100)</label>
                              <input type="number" min="0" max="100"
                                value={teacherScores[student.user_id] || ""}
                                onChange={e => setTeacherScores(p => ({ ...p, [student.user_id]: e.target.value }))}
                                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #C4B5FD", fontSize: 16, fontWeight: 800, color: "#7C3AED", background: "#fff", outline: "none", boxSizing: "border-box" as const }}
                                placeholder="0–100" />
                            </div>
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: 12, fontWeight: 600, color: "#4C1D95", display: "block", marginBottom: 4 }}>Teacher Notes</label>
                              <textarea value={teacherNotes[student.user_id] || ""}
                                onChange={e => setTeacherNotes(p => ({ ...p, [student.user_id]: e.target.value }))}
                                rows={3} placeholder="Makharij quality, Tajweed observations, fluency, recommendations…"
                                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #C4B5FD", fontSize: 13, color: "#333", background: "#fff", outline: "none", resize: "none", boxSizing: "border-box" as const, fontFamily: "inherit" }} />
                            </div>
                          </div>
                          <button onClick={() => saveTeacherEval(student.user_id)}
                            disabled={savingTeacher === student.user_id}
                            style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#7C3AED", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                            {savingTeacher === student.user_id
                              ? <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> Saving…</>
                              : <><Check size={14} /> Save Teacher Evaluation</>}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── ASSIGN LEVEL TAB ── */}
                    {tab === "assign" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                        {/* Score summary */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                          {[
                            { label: "Exam (40%)",    score: student.exam_score,        bg: "#FFFBEB" },
                            { label: "AI Rec (20%)",  score: student.rec_ai_score,      bg: "#EFF6FF" },
                            { label: "Teacher (40%)", score: student.rec_teacher_score, bg: "#F5F3FF" },
                            { label: "Final",         score: final,                     bg: final !== null ? `${scoreColor(final)}10` : "#F9FAFB" },
                          ].map(s => (
                            <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: "14px", textAlign: "center", border: "1px solid #E5E7EB" }}>
                              <div style={{ fontSize: 26, fontWeight: 900, color: scoreColor(s.score) }}>{fmtScore(s.score)}</div>
                              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{s.label}</div>
                            </div>
                          ))}
                        </div>

                        {student.admin_approved ? (
                          /* Already assigned */
                          <div style={{ background: "#E8F5E9", borderRadius: 14, padding: 20, border: "2px solid #86EFAC", display: "flex", alignItems: "center", gap: 14 }}>
                            <CheckCircle2 size={28} color="#16A34A" />
                            <div>
                              <div style={{ fontWeight: 800, fontSize: 16, color: "#166534" }}>Level Assigned — {LEVEL_CFG[student.final_level as Level]?.label || student.final_level}</div>
                              <div style={{ fontSize: 13, color: "#4ADE80", marginTop: 2 }}>Student has been notified and their dashboard is now fully unlocked.</div>
                            </div>
                          </div>
                        ) : (
                          /* Level selector + assign button */
                          <div style={{ background: "#F9FAFB", borderRadius: 14, padding: 20, border: "2px solid #E5E7EB" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                              <GraduationCap size={18} color={G} />
                              <span style={{ fontSize: 15, fontWeight: 800, color: G }}>Assign Level</span>
                              {final !== null && (
                                <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: scoreColor(final) }}>
                                  Suggested: {LEVEL_CFG[suggested].label}
                                </span>
                              )}
                            </div>

                            <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
                              {LEVELS.map(l => {
                                const cfg = LEVEL_CFG[l];
                                const sel = lvl === l;
                                const isSuggested = l === suggested;
                                return (
                                  <button key={l}
                                    onClick={() => setSelectedLevels(p => ({ ...p, [student.user_id]: l }))}
                                    style={{
                                      flex: 1, padding: "14px 8px", borderRadius: 12,
                                      border: `2px solid ${sel ? cfg.color : "#e5e7eb"}`,
                                      background: sel ? cfg.bg : "#fff",
                                      color: sel ? cfg.color : "#666",
                                      fontSize: 13, fontWeight: sel ? 800 : 500, cursor: "pointer",
                                      transition: "all .15s", position: "relative",
                                    }}>
                                    {isSuggested && (
                                      <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", fontSize: 9, background: cfg.color, color: "#fff", padding: "2px 8px", borderRadius: 10, whiteSpace: "nowrap" as const }}>
                                        Suggested
                                      </div>
                                    )}
                                    <div style={{ fontSize: 18, marginBottom: 4 }}>
                                      {l === "beginner" ? "🌱" : l === "intermediate" ? "📖" : "⭐"}
                                    </div>
                                    {cfg.label}
                                    <div style={{ fontSize: 11, color: cfg.color, fontFamily: "'Amiri',serif", marginTop: 2 }}>{cfg.labelAr}</div>
                                  </button>
                                );
                              })}
                            </div>

                            <button
                              onClick={() => assignLevel(student)}
                              disabled={assigning === student.user_id}
                              style={{
                                width: "100%", padding: "15px", borderRadius: 12, border: "none",
                                background: assigning === student.user_id ? "#9ca3af" : `linear-gradient(135deg,${G},${GM})`,
                                color: "#fff", fontSize: 15, fontWeight: 800,
                                cursor: assigning === student.user_id ? "not-allowed" : "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                              }}>
                              {assigning === student.user_id
                                ? <><Loader2 style={{ width: 18, height: 18, animation: "spin .8s linear infinite" }} /> Assigning…</>
                                : <><CheckCircle2 size={18} /> Assign {LEVEL_CFG[lvl].label} Level & Notify Student</>}
                            </button>

                            <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 10, textAlign: "center" }}>
                              Student will receive an in-app notification and their dashboard will be unlocked immediately.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LevelAssignment;
