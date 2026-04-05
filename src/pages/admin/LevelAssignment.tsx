/*  src/pages/admin/LevelAssignment.tsx  — NEW REGISTRATIONS PANEL (FIXED)
    ──────────────────────────────────────────────────────────────────────
    Issue 7 fixes:
    • ALL students now load from profiles (not filtered by tasjeel step)
    • Click opens FULL details inline — all contact, scores, onboarding in one view
    • Ordered by registration date (newest first)
    • All student information fields are displayed
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
  Heart, Layers, Download, ExternalLink, Search,
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#D4A843";

interface StudentEval {
  user_id:           string;
  full_name:         string;
  full_name_ar:      string;
  email:             string;
  phone:             string;
  country:           string;
  student_id:        string;
  avatar_url:        string;
  current_step:      string;
  payment_status:    string;
  level_assigned:    string | null;
  onboarding:        Record<string, any> | null;
  exam_score:        number | null;
  exam_percentage:   number | null;
  exam_completed:    boolean;
  exam_attempt_id:   string | null;
  exam_title:        string | null;
  exam_passed:       boolean;
  rec_status:        string | null;
  rec_ai_score:      number | null;
  rec_audio_path:    string | null;
  rec_teacher_score: number | null;
  rec_teacher_notes: string | null;
  rec_session_date:  string | null;
  rec_approved:      boolean;
  current_level:     string | null;
  admin_approved:    boolean;
  final_level:       string | null;
  registered_at:     string | null;
}

const LEVELS = ["beginner", "intermediate", "advanced"] as const;
type Level = typeof LEVELS[number];

const LEVEL_CFG: Record<Level, { label: string; labelAr: string; color: string; bg: string; border: string }> = {
  beginner:     { label: "Beginner",     labelAr: "مبتدئ", color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC" },
  intermediate: { label: "Intermediate", labelAr: "متوسط", color: "#2563EB", bg: "#EFF6FF", border: "#93C5FD" },
  advanced:     { label: "Advanced",     labelAr: "متقدم", color: "#7C3AED", bg: "#F5F3FF", border: "#C4B5FD" },
};

const STEP_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  enrollment:       { label: "Just Registered",    color: "#6B7280", bg: "#F9FAFB" },
  payment:          { label: "Awaiting Payment",   color: "#D97706", bg: "#FFFBEB" },
  onboarding:       { label: "Filling Form",       color: "#2563EB", bg: "#EFF6FF" },
  exam:             { label: "Entrance Exam",      color: "#7C3AED", bg: "#F5F3FF" },
  review:           { label: "Under Review",       color: "#D97706", bg: "#FFFBEB" },
  level_assignment: { label: "Awaiting Level",     color: "#EA580C", bg: "#FFF7ED" },
  completed:        { label: "Enrolled ✓",         color: "#16A34A", bg: "#F0FDF4" },
  none:             { label: "No Pipeline Data",   color: "#6B7280", bg: "#F3F4F6" },
};

const scoreColor = (s: number | null) =>
  !s ? "#9ca3af" : s >= 80 ? "#16A34A" : s >= 60 ? "#D97706" : "#DC2626";
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtScore = (s: number | null) => (s !== null ? `${Math.round(s)}%` : "—");

const calcFinal = (exam: number | null, ai: number | null, teacher: number | null): number | null => {
  if (exam === null && ai === null && teacher === null) return null;
  const e = exam ?? 0; const a = ai ?? 0; const t2 = teacher ?? 0;
  const w = (exam !== null ? 0.4 : 0) + (ai !== null ? 0.2 : 0) + (teacher !== null ? 0.4 : 0);
  if (w === 0) return null;
  return Math.round(((e * 0.4) + (a * 0.2) + (t2 * 0.4)) / w);
};

const suggestLevel = (final: number | null): Level => {
  if (!final) return "beginner";
  if (final >= 80) return "advanced";
  if (final >= 60) return "intermediate";
  return "beginner";
};

// ── Small helpers ──────────────────────────────────────────────────────────
const ScorePill = ({ score, label, bg }: { score: number | null; label: string; bg: string }) => (
  <div style={{ background: bg, borderRadius: 8, padding: "5px 10px", textAlign: "center", minWidth: 56 }}>
    <div style={{ fontSize: 14, fontWeight: 900, color: scoreColor(score) }}>{fmtScore(score)}</div>
    <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase" as const }}>{label}</div>
  </div>
);

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: "1px solid #F3F4F6" }}>
    <span style={{ color: "#9CA3AF", fontWeight: 500 }}>{label}</span>
    <span style={{ fontWeight: 700, color: "#374151", textAlign: "right" as const, maxWidth: "60%" }}>{value || "—"}</span>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
const LevelAssignment = () => {
  const { toast }    = useToast();
  const navigate     = useNavigate();
  const [students, setStudents]     = useState<StudentEval[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState<"pending" | "approved" | "all">("all");
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [activeTab, setActiveTab]   = useState<Record<string, string>>({});
  const [assigning, setAssigning]   = useState<string | null>(null);
  const [selectedLevels, setSelectedLevels] = useState<Record<string, Level>>({});
  const [audioUrls, setAudioUrls]   = useState<Record<string, string>>({});
  const [teacherNotes, setTeacherNotes]   = useState<Record<string, string>>({});
  const [teacherScores, setTeacherScores] = useState<Record<string, string>>({});
  const [savingTeacher, setSavingTeacher] = useState<string | null>(null);
  const [searchQ, setSearchQ]       = useState("");

  // ── Load ALL students from profiles (not filtered by tasjeel step) ─────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 1. All profiles with student role
      const { data: studentRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "student");
      const studentUids = (studentRoles || []).map((r: any) => r.user_id);
      if (!studentUids.length) { setStudents([]); setLoading(false); return; }

      // 2. Profiles
      const { data: profRows } = await supabase
        .from("profiles")
        .select("user_id, full_name, full_name_ar, email, phone, country, student_id, avatar_url, level, course_level, created_at")
        .in("user_id", studentUids)
        .order("created_at", { ascending: false });
      const profMap: Record<string, any> = {};
      (profRows || []).forEach((r: any) => { profMap[r.user_id] = r; });

      const uids = Object.keys(profMap);
      if (!uids.length) { setStudents([]); setLoading(false); return; }

      // 3. Tasjeel progress (optional — left join)
      const { data: tasjeelRows } = await (supabase as any)
        .from("tasjeel_progress")
        .select("user_id, current_step, level_assigned, payment_status, created_at")
        .in("user_id", uids);
      const tasjeelMap: Record<string, any> = {};
      (tasjeelRows || []).forEach((r: any) => { tasjeelMap[r.user_id] = r; });

      // 4. Onboarding forms
      const { data: onbRows } = await (supabase as any)
        .from("onboarding_forms")
        .select("*")
        .in("user_id", uids);
      const onbMap: Record<string, any> = {};
      (onbRows || []).forEach((r: any) => { onbMap[r.user_id] = r; });

      // 5. Entrance exam attempts
      const { data: examRows } = await supabase
        .from("exam_attempts")
        .select("id, user_id, score, percentage, status, submitted_at, exams(title, passing_score)")
        .in("user_id", uids)
        .in("status", ["submitted", "graded", "completed"]);
      const examMap: Record<string, any> = {};
      (examRows || []).forEach((r: any) => {
        if (!examMap[r.user_id] || new Date(r.submitted_at) > new Date(examMap[r.user_id].submitted_at))
          examMap[r.user_id] = r;
      });

      // 6. Recitation tests
      const { data: recRows } = await (supabase as any)
        .from("recitation_tests")
        .select("*")
        .in("user_id", uids);
      const recMap: Record<string, any> = {};
      (recRows || []).forEach((r: any) => { recMap[r.user_id] = r; });

      // 7. Build combined objects (newest first — profiles already ordered)
      const built: StudentEval[] = uids.map((uid: string) => {
        const p = profMap[uid] || {};
        const t = tasjeelMap[uid] || {};
        const o = onbMap[uid] || null;
        const e = examMap[uid] || {};
        const r = recMap[uid] || {};
        const examPct = e.percentage ?? (e.score ?? null);
        const examPassing = e.exams?.passing_score ?? 50;
        return {
          user_id:           uid,
          full_name:         p.full_name || "Unknown",
          full_name_ar:      p.full_name_ar || "",
          email:             p.email || "",
          phone:             p.phone || o?.phone || "",
          country:           p.country || o?.country || "",
          student_id:        p.student_id || "—",
          avatar_url:        p.avatar_url || "",
          current_step:      t.current_step || "none",
          payment_status:    t.payment_status || "—",
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
          final_level:       r.final_level || t.level_assigned || p.level || null,
          registered_at:     p.created_at || t.created_at || null,
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
    } catch (err: any) {
      console.error("Load error:", err);
      toast({ title: "Error loading students", description: err.message, variant: "destructive" });
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
      await supabase.from("profiles").update({ level: lvl, course_level: lvl } as any).eq("user_id", student.user_id);
      const { data: recRow } = await (supabase as any).from("recitation_tests").select("id").eq("user_id", student.user_id).maybeSingle();
      if (recRow) {
        await (supabase as any).from("recitation_tests").update({
          final_level: lvl, admin_approved: true,
          admin_approved_at: new Date().toISOString(), status: "approved",
        }).eq("user_id", student.user_id);
      }
      await (supabase as any).from("tasjeel_progress").upsert({
        user_id:           student.user_id,
        current_step:      "completed",
        level_assigned:    lvl,
        level_assigned_at: new Date().toISOString(),
        completed_at:      new Date().toISOString(),
        updated_at:        new Date().toISOString(),
      }, { onConflict: "user_id" });
      await (supabase as any).from("notifications").insert({
        user_id:    student.user_id,
        title:      "🎉 Your Level Has Been Assigned!",
        message:    `Congratulations, ${student.full_name}! You have been placed in the ${LEVEL_CFG[lvl as Level]?.label || lvl} level. Your full dashboard is now unlocked. بارك الله فيك!`,
        type:       "level_assigned",
        is_read:    false,
        created_at: new Date().toISOString(),
        metadata:   JSON.stringify({ level: lvl, action_url: "/student" }),
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
      (s.student_id || "").toLowerCase().includes(q) ||
      (s.phone || "").includes(q) ||
      (s.country || "").toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  const pendingCount  = students.filter(s => !s.admin_approved).length;
  const approvedCount = students.filter(s => s.admin_approved).length;
  const getTab = (uid: string) => activeTab[uid] || "overview";
  const setTab = (uid: string, tab: string) => setActiveTab(p => ({ ...p, [uid]: tab }));

  const inp: React.CSSProperties = {
    width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB",
    fontSize: 13, outline: "none", background: "#fff", boxSizing: "border-box" as const, fontFamily: "inherit",
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", minHeight: "100vh", background: "#F0F4F0" }}>
      <style>{"@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}} @keyframes spin{to{transform:rotate(360deg)}}"}</style>

      {/* ── HEADER ── */}
      <div style={{ background: `linear-gradient(135deg,${G},${GM})`, padding: "24px 20px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: "#fff", margin: "0 0 2px" }}>New Registrations</h1>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,.6)", margin: 0 }}>{students.length} total students · {filtered.length} shown</p>
          </div>
          <button onClick={load} disabled={loading} style={{ padding: "9px 16px", borderRadius: 10, border: "1.5px solid rgba(255,255,255,.3)", background: "rgba(255,255,255,.12)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <RefreshCw size={13} style={{ animation: loading ? "spin .8s linear infinite" : "none" }} /> Refresh
          </button>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
          {[
            { label: "Total Students", val: students.length,  color: "#fff" },
            { label: "Pending Review", val: pendingCount,      color: GOLD },
            { label: "Level Assigned", val: approvedCount,     color: "#22c55e" },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(255,255,255,.1)", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: "relative" }}>
          <Search size={13} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,.5)" }} />
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search by name, email, phone, country…" style={{ ...inp, background: "rgba(255,255,255,.12)", color: "#fff", border: "1.5px solid rgba(255,255,255,.2)", paddingLeft: 34 }} />
        </div>
      </div>

      {/* ── FILTER TABS ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", display: "flex", gap: 0, overflowX: "auto", scrollbarWidth: "none" }}>
        {[
          { k: "all",      label: `All (${students.length})` },
          { k: "pending",  label: `Pending (${pendingCount})` },
          { k: "approved", label: `Assigned (${approvedCount})` },
        ].map(t => (
          <button key={t.k} onClick={() => setFilter(t.k as any)}
            style={{ padding: "12px 20px", border: "none", borderBottom: `3px solid ${filter === t.k ? GM : "transparent"}`, background: "transparent", color: filter === t.k ? G : "#6B7280", fontSize: 13, fontWeight: filter === t.k ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── STUDENT LIST ── */}
      <div style={{ padding: "16px", maxWidth: 860, margin: "0 auto" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: 60 }}>
            <Loader2 size={28} style={{ animation: "spin .8s linear infinite", color: G }} />
            <p style={{ color: "#9ca3af", marginTop: 12 }}>Loading all students…</p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 60, background: "#fff", borderRadius: 18, border: "1px solid #E5E7EB" }}>
            <User size={48} style={{ color: "#d1d5db", margin: "0 auto 12px", display: "block" }} />
            <div style={{ fontWeight: 700, color: "#374151", marginBottom: 6 }}>No students found</div>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>{searchQ ? "Try clearing your search" : "No registrations yet"}</div>
          </div>
        )}

        {!loading && filtered.map(student => {
          const isOpen  = expanded === student.user_id;
          const final   = calcFinal(student.exam_score, student.rec_ai_score, student.rec_teacher_score);
          const suggested = suggestLevel(final);
          const lvl     = selectedLevels[student.user_id] || suggested;
          const lvlCfg  = LEVEL_CFG[lvl];
          const stepCfg = STEP_LABELS[student.current_step] || STEP_LABELS.none;
          const tab     = getTab(student.user_id);

          return (
            <div key={student.user_id} style={{ background: "#fff", borderRadius: 18, boxShadow: "0 2px 12px rgba(0,0,0,.07)", marginBottom: 14, overflow: "hidden", animation: "fadeUp .3s ease", border: student.admin_approved ? "2px solid #86EFAC" : "2px solid #e5e7eb" }}>

              {/* ── STUDENT CARD HEADER ── */}
              <div style={{ padding: "16px 18px", display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer", background: isOpen ? "#FAFAFA" : "#fff" }}
                onClick={() => {
                  const next = isOpen ? null : student.user_id;
                  setExpanded(next);
                  if (next && student.rec_audio_path) resolveAudio(student.rec_audio_path, student.user_id);
                }}>

                {/* Avatar */}
                {student.avatar_url
                  ? <img src={student.avatar_url} style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: `2px solid ${student.admin_approved ? "#86EFAC" : "#e5e7eb"}` }} alt="" />
                  : <div style={{ width: 52, height: 52, borderRadius: "50%", background: `linear-gradient(135deg,${G},${GM})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 20, flexShrink: 0 }}>
                      {student.full_name[0]?.toUpperCase() || "?"}
                    </div>
                }

                {/* Name + details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
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

                  {/* Contact info row — always visible */}
                  <div style={{ fontSize: 12, color: "#6B7280", display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
                    <span>📧 {student.email || "—"}</span>
                    {student.phone && <span>📞 {student.phone}</span>}
                    {student.country && <span>🌍 {student.country}</span>}
                    <span style={{ color: "#9ca3af" }}>ID: {student.student_id}</span>
                    {student.registered_at && <span style={{ color: "#9ca3af" }}>Registered: {fmtDate(student.registered_at)}</span>}
                  </div>

                  {/* Assigned level badge */}
                  {student.admin_approved && student.final_level && (
                    <div style={{ marginTop: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, background: LEVEL_CFG[student.final_level as Level]?.bg || "#F0FDF4", color: LEVEL_CFG[student.final_level as Level]?.color || G, padding: "2px 10px", borderRadius: 20, border: `1px solid ${LEVEL_CFG[student.final_level as Level]?.border || "#86EFAC"}` }}>
                        {LEVEL_CFG[student.final_level as Level]?.label || student.final_level}
                      </span>
                    </div>
                  )}
                </div>

                {/* Score pills — compact */}
                <div style={{ display: "flex", gap: 5, flexShrink: 0, flexDirection: "column", alignItems: "flex-end" }}>
                  <div style={{ display: "flex", gap: 5 }}>
                    <ScorePill score={student.exam_score}        label="Exam"    bg="#FFFBEB" />
                    <ScorePill score={student.rec_ai_score}      label="AI"      bg="#EFF6FF" />
                    <ScorePill score={student.rec_teacher_score} label="Teacher" bg="#F5F3FF" />
                    {final !== null && (
                      <div style={{ background: `${scoreColor(final)}12`, borderRadius: 8, padding: "5px 10px", textAlign: "center", minWidth: 56, border: `1px solid ${scoreColor(final)}30` }}>
                        <div style={{ fontSize: 14, fontWeight: 900, color: scoreColor(final) }}>{final}%</div>
                        <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase" as const }}>Final</div>
                      </div>
                    )}
                  </div>
                </div>

                <ChevronDown size={16} color="#9ca3af" style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .2s", flexShrink: 0, marginTop: 4 }} />
              </div>

              {/* ── EXPANDED FULL DETAILS ── */}
              {isOpen && (
                <div style={{ borderTop: "2px solid #F3F4F6" }}>
                  {/* Tab bar */}
                  <div style={{ display: "flex", borderBottom: "1px solid #E5E7EB", background: "#FAFAFA", overflowX: "auto", scrollbarWidth: "none" }}>
                    {[
                      { id: "overview",   label: "📋 Full Profile" },
                      { id: "onboarding", label: "👤 Onboarding Form", show: !!student.onboarding },
                      { id: "exam",       label: "📝 Entrance Exam" },
                      { id: "recitation", label: "🎤 Recitation" },
                      { id: "assign",     label: "🎓 Assign Level" },
                    ].filter((t: any) => t.show !== false).map(t => (
                      <button key={t.id} onClick={() => setTab(student.user_id, t.id)}
                        style={{ padding: "11px 16px", border: "none", borderBottom: `3px solid ${tab === t.id ? GM : "transparent"}`, background: "transparent", color: tab === t.id ? G : "#6B7280", fontSize: 12, fontWeight: tab === t.id ? 700 : 500, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ padding: 20 }}>

                    {/* ══ FULL PROFILE TAB (Issue 7: shows ALL info) ══ */}
                    {tab === "overview" && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

                        {/* Personal Info */}
                        <div style={{ background: "#F9FAFB", borderRadius: 14, padding: 16, border: "1px solid #E5E7EB" }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: G, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>👤 Personal Information</div>
                          <InfoRow label="Full Name (EN)"    value={student.full_name} />
                          <InfoRow label="Full Name (AR)"    value={student.full_name_ar} />
                          <InfoRow label="Email"             value={student.email} />
                          <InfoRow label="Phone"             value={student.phone} />
                          <InfoRow label="Country"           value={student.country} />
                          <InfoRow label="Student ID"        value={student.student_id} />
                          <InfoRow label="Registered"        value={fmtDate(student.registered_at)} />
                          {student.onboarding && <>
                            <InfoRow label="Date of Birth"   value={student.onboarding.dob || "—"} />
                            <InfoRow label="Gender"          value={student.onboarding.gender || "—"} />
                            <InfoRow label="Occupation"      value={student.onboarding.occupation || "—"} />
                            <InfoRow label="City"            value={student.onboarding.city || "—"} />
                          </>}
                        </div>

                        {/* Pipeline Status */}
                        <div style={{ background: "#F9FAFB", borderRadius: 14, padding: 16, border: "1px solid #E5E7EB" }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: G, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>📊 Registration Status</div>
                          <InfoRow label="Pipeline Step"     value={stepCfg.label} />
                          <InfoRow label="Payment Status"    value={student.payment_status} />
                          <InfoRow label="Current Level"     value={student.current_level || "Not assigned"} />
                          {student.admin_approved && <InfoRow label="Assigned Level" value={LEVEL_CFG[student.final_level as Level]?.label || student.final_level || "—"} />}
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", marginBottom: 8, textTransform: "uppercase" }}>Scores</div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                              {[
                                { label: "Exam (40%)",    score: student.exam_score,        bg: "#FFFBEB" },
                                { label: "AI Rec (20%)",  score: student.rec_ai_score,      bg: "#EFF6FF" },
                                { label: "Teacher (40%)", score: student.rec_teacher_score, bg: "#F5F3FF" },
                                { label: "Final Score",   score: calcFinal(student.exam_score, student.rec_ai_score, student.rec_teacher_score), bg: "#F9FAFB" },
                              ].map(s => (
                                <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: "10px 12px", textAlign: "center", border: "1px solid #E5E7EB" }}>
                                  <div style={{ fontSize: 22, fontWeight: 900, color: scoreColor(s.score) }}>{fmtScore(s.score)}</div>
                                  <div style={{ fontSize: 10, color: "#9ca3af" }}>{s.label}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Academic background (from onboarding) */}
                        {student.onboarding && (
                          <div style={{ background: "#F0FDF4", borderRadius: 14, padding: 16, border: "1px solid #86EFAC", gridColumn: "1 / -1" }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: G, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>📚 Academic Background</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 20px" }}>
                              <InfoRow label="Quran Level"     value={student.onboarding.quran_level || "—"} />
                              <InfoRow label="Tajweed"         value={student.onboarding.tajweed_knowledge || "—"} />
                              <InfoRow label="Arabic Level"    value={student.onboarding.arabic_level || "—"} />
                              <InfoRow label="Islamic Studies" value={student.onboarding.islamic_knowledge || "—"} />
                              <InfoRow label="Years Studying"  value={student.onboarding.years_studying || "—"} />
                              <InfoRow label="Hours/Day"       value={student.onboarding.hours_per_day || "—"} />
                              <InfoRow label="Preferred Time"  value={student.onboarding.preferred_time || "—"} />
                              <InfoRow label="Device"          value={student.onboarding.preferred_device || "—"} />
                              <InfoRow label="Heard From"      value={student.onboarding.heard_from || "—"} />
                            </div>
                            {/* Memorised surahs */}
                            {(student.onboarding.memorized_surahs || []).length > 0 && (
                              <div style={{ marginTop: 10 }}>
                                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 5 }}>Memorised Surahs:</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                  {student.onboarding.memorized_surahs.map((s: string) => <span key={s} style={{ background: "#fff", color: G, fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, border: "1px solid #86EFAC" }}>{s}</span>)}
                                </div>
                              </div>
                            )}
                            {/* Goals */}
                            {(student.onboarding.learning_goals || []).length > 0 && (
                              <div style={{ marginTop: 8 }}>
                                <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 5 }}>Learning Goals:</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                  {student.onboarding.learning_goals.map((g: string) => <span key={g} style={{ background: "#FFF7ED", color: "#EA580C", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, border: "1px solid #FED7AA" }}>{g}</span>)}
                                </div>
                              </div>
                            )}
                            {student.onboarding.extra_notes && (
                              <div style={{ marginTop: 10, background: "#FFFBEB", borderRadius: 8, padding: "8px 12px", border: "1px solid #FDE68A", fontSize: 12, color: "#92400E" }}>
                                <strong>Notes:</strong> {student.onboarding.extra_notes}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Quick assign button at bottom of overview */}
                        {!student.admin_approved && (
                          <div style={{ gridColumn: "1 / -1", background: "#F9FAFB", borderRadius: 14, padding: 16, border: "2px dashed #E5E7EB", textAlign: "center" }}>
                            <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 12 }}>Jump to level assignment:</p>
                            <button onClick={() => setTab(student.user_id, "assign")} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${G},${GM})`, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
                              <GraduationCap size={14} /> Assign Level →
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ══ ONBOARDING FORM TAB ══ */}
                    {tab === "onboarding" && (
                      student.onboarding ? (
                        <div style={{ background: "#FAFAFA", borderRadius: 14, padding: 16, border: "1px solid #E5E7EB" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px" }}>
                            {[
                              ["Phone", student.onboarding.phone],
                              ["Date of Birth", student.onboarding.dob],
                              ["Gender", student.onboarding.gender],
                              ["Country", student.onboarding.country],
                              ["City", student.onboarding.city],
                              ["Occupation", student.onboarding.occupation],
                              ["Quran Level", student.onboarding.quran_level],
                              ["Tajweed", student.onboarding.tajweed_knowledge],
                              ["Arabic Level", student.onboarding.arabic_level],
                              ["Islamic Studies", student.onboarding.islamic_knowledge],
                              ["Years Studying", student.onboarding.years_studying],
                              ["Preferred Time", student.onboarding.preferred_time],
                              ["Hours/Day", student.onboarding.hours_per_day],
                              ["Device", student.onboarding.preferred_device],
                              ["Heard From", student.onboarding.heard_from],
                            ].map(([k, v]) => <InfoRow key={k} label={k} value={v || "—"} />)}
                          </div>
                          {(student.onboarding.memorized_surahs || []).length > 0 && (
                            <div style={{ marginTop: 12 }}>
                              <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 6 }}>Memorised Surahs:</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{student.onboarding.memorized_surahs.map((s: string) => <span key={s} style={{ background: "#F0FDF4", color: G, fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, border: "1px solid #86EFAC" }}>{s}</span>)}</div>
                            </div>
                          )}
                          {student.onboarding.extra_notes && <div style={{ marginTop: 10, background: "#FFFBEB", borderRadius: 8, padding: "8px 10px", border: "1px solid #FDE68A", fontSize: 12, color: "#92400E" }}><strong>Notes:</strong> {student.onboarding.extra_notes}</div>}
                        </div>
                      ) : <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>Onboarding form not yet completed</div>
                    )}

                    {/* ══ EXAM TAB ══ */}
                    {tab === "exam" && (
                      <div style={{ background: "#FFFBEB", borderRadius: 14, padding: 20, border: "1px solid #FDE68A" }}>
                        <div style={{ fontWeight: 800, fontSize: 15, color: "#92400E", marginBottom: 16 }}>📝 Entrance Exam Record</div>
                        {student.exam_completed ? (
                          <div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                              <div style={{ background: "#fff", borderRadius: 12, padding: 16, textAlign: "center" }}>
                                <div style={{ fontSize: 42, fontWeight: 900, color: scoreColor(student.exam_score) }}>{fmtScore(student.exam_score)}</div>
                                <div style={{ fontSize: 12, color: "#9ca3af" }}>Score (40% of final)</div>
                              </div>
                              <div style={{ background: "#fff", borderRadius: 12, padding: 16 }}>
                                <InfoRow label="Exam"   value={student.exam_title || "Entrance Exam"} />
                                <InfoRow label="Status" value={student.exam_passed ? "✅ Passed" : "❌ Below passing score"} />
                                {student.exam_attempt_id && <InfoRow label="Attempt ID" value={student.exam_attempt_id.slice(0, 8) + "…"} />}
                              </div>
                            </div>
                            <button onClick={() => navigate("/admin/grading")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, border: `1.5px solid ${GM}`, background: "#F0FDF4", color: G, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                              <ExternalLink size={13} /> View in Grading Panel
                            </button>
                          </div>
                        ) : (
                          <div style={{ textAlign: "center", padding: 24, color: "#9ca3af" }}>
                            <AlertTriangle size={32} style={{ margin: "0 auto 12px", display: "block", color: "#FCA5A5" }} />
                            <div style={{ fontWeight: 600 }}>Entrance exam not submitted yet</div>
                            <div style={{ fontSize: 12, marginTop: 4 }}>Current step: <strong>{student.current_step}</strong></div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ══ RECITATION TAB ══ */}
                    {tab === "recitation" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <div style={{ background: "#EFF6FF", borderRadius: 14, padding: 20, border: "1px solid #93C5FD" }}>
                          <div style={{ fontWeight: 800, fontSize: 15, color: "#1E3A5F", marginBottom: 16 }}>🎤 Recitation Audio</div>
                          {student.rec_audio_path ? (
                            audioUrls[student.user_id] ? (
                              <div>
                                <audio controls src={audioUrls[student.user_id]} style={{ width: "100%", borderRadius: 10, marginBottom: 12 }} />
                                <div style={{ display: "flex", gap: 8 }}>
                                  <div style={{ flex: 1, background: "#fff", borderRadius: 10, padding: "12px 16px", textAlign: "center" }}>
                                    <div style={{ fontSize: 28, fontWeight: 900, color: scoreColor(student.rec_ai_score) }}>{fmtScore(student.rec_ai_score)}</div>
                                    <div style={{ fontSize: 11, color: "#9ca3af" }}>AI Score (20%)</div>
                                  </div>
                                  <div style={{ flex: 1, background: "#fff", borderRadius: 10, padding: "12px 16px", textAlign: "center" }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: student.rec_approved ? "#16A34A" : "#D97706" }}>{student.rec_approved ? "✓ Approved" : student.rec_status || "Pending"}</div>
                                    <div style={{ fontSize: 11, color: "#9ca3af" }}>Status</div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => resolveAudio(student.rec_audio_path!, student.user_id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", borderRadius: 12, border: "none", background: GM, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                                <Play size={14} /> Load & Play Audio
                              </button>
                            )
                          ) : (
                            <div style={{ textAlign: "center", padding: 24, color: "#9ca3af" }}>No recitation audio submitted</div>
                          )}
                        </div>
                        {/* Teacher eval form */}
                        <div style={{ background: "#F5F3FF", borderRadius: 14, padding: 20, border: "1px solid #C4B5FD" }}>
                          <div style={{ fontWeight: 800, fontSize: 15, color: "#4C1D95", marginBottom: 16 }}>Teacher Evaluation (40% of final)</div>
                          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                            <div style={{ flex: "0 0 130px" }}>
                              <label style={{ fontSize: 12, fontWeight: 600, color: "#4C1D95", display: "block", marginBottom: 4 }}>Score (0–100)</label>
                              <input type="number" min="0" max="100" value={teacherScores[student.user_id] || ""} onChange={e => setTeacherScores(p => ({ ...p, [student.user_id]: e.target.value }))} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #C4B5FD", fontSize: 18, fontWeight: 800, color: "#7C3AED", background: "#fff", outline: "none", boxSizing: "border-box" as const }} placeholder="0–100" />
                            </div>
                            <div style={{ flex: 1 }}>
                              <label style={{ fontSize: 12, fontWeight: 600, color: "#4C1D95", display: "block", marginBottom: 4 }}>Notes</label>
                              <textarea value={teacherNotes[student.user_id] || ""} onChange={e => setTeacherNotes(p => ({ ...p, [student.user_id]: e.target.value }))} rows={3} placeholder="Tajweed observations…" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #C4B5FD", fontSize: 13, color: "#333", background: "#fff", outline: "none", resize: "none", boxSizing: "border-box" as const, fontFamily: "inherit" }} />
                            </div>
                          </div>
                          <button onClick={() => saveTeacherEval(student.user_id)} disabled={savingTeacher === student.user_id} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#7C3AED", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                            {savingTeacher === student.user_id ? <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> Saving…</> : <><Check size={14} /> Save Evaluation</>}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ══ ASSIGN LEVEL TAB ══ */}
                    {tab === "assign" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                          {[
                            { label: "Exam (40%)",    score: student.exam_score,        bg: "#FFFBEB" },
                            { label: "AI Rec (20%)",  score: student.rec_ai_score,      bg: "#EFF6FF" },
                            { label: "Teacher (40%)", score: student.rec_teacher_score, bg: "#F5F3FF" },
                            { label: "Final",         score: final,                     bg: "#F9FAFB" },
                          ].map(s => (
                            <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: "14px", textAlign: "center", border: "1px solid #E5E7EB" }}>
                              <div style={{ fontSize: 26, fontWeight: 900, color: scoreColor(s.score) }}>{fmtScore(s.score)}</div>
                              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{s.label}</div>
                            </div>
                          ))}
                        </div>
                        {student.admin_approved ? (
                          <div style={{ background: "#E8F5E9", borderRadius: 14, padding: 20, border: "2px solid #86EFAC", display: "flex", alignItems: "center", gap: 14 }}>
                            <CheckCircle2 size={28} color="#16A34A" />
                            <div>
                              <div style={{ fontWeight: 800, fontSize: 16, color: "#166534" }}>Level Assigned — {LEVEL_CFG[student.final_level as Level]?.label || student.final_level}</div>
                              <div style={{ fontSize: 13, color: "#4ADE80", marginTop: 2 }}>Dashboard unlocked. Student has been notified.</div>
                            </div>
                          </div>
                        ) : (
                          <div style={{ background: "#F9FAFB", borderRadius: 14, padding: 20, border: "2px solid #E5E7EB" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                              <div style={{ fontWeight: 800, fontSize: 15, color: G, display: "flex", alignItems: "center", gap: 8 }}><GraduationCap size={18} color={G} /> Assign Level</div>
                              {final !== null && <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(final) }}>Suggested: {LEVEL_CFG[suggested].label}</span>}
                            </div>
                            <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
                              {LEVELS.map(l => {
                                const cfg = LEVEL_CFG[l];
                                const sel = lvl === l;
                                const isSuggested = l === suggested;
                                return (
                                  <button key={l} onClick={() => setSelectedLevels(p => ({ ...p, [student.user_id]: l }))}
                                    style={{ flex: 1, padding: "14px 8px", borderRadius: 12, border: `2px solid ${sel ? cfg.color : "#e5e7eb"}`, background: sel ? cfg.bg : "#fff", color: sel ? cfg.color : "#666", fontSize: 13, fontWeight: sel ? 800 : 500, cursor: "pointer", position: "relative" }}>
                                    {isSuggested && <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", fontSize: 9, background: cfg.color, color: "#fff", padding: "2px 8px", borderRadius: 10, whiteSpace: "nowrap" }}>Suggested</div>}
                                    <div style={{ fontSize: 18, marginBottom: 4 }}>{l === "beginner" ? "🌱" : l === "intermediate" ? "📖" : "⭐"}</div>
                                    {cfg.label}
                                    <div style={{ fontSize: 11, color: cfg.color, fontFamily: "'Amiri',serif", marginTop: 2 }}>{cfg.labelAr}</div>
                                  </button>
                                );
                              })}
                            </div>
                            <button onClick={() => assignLevel(student)} disabled={assigning === student.user_id} style={{ width: "100%", padding: "15px", borderRadius: 12, border: "none", background: assigning === student.user_id ? "#9ca3af" : `linear-gradient(135deg,${G},${GM})`, color: "#fff", fontSize: 15, fontWeight: 800, cursor: assigning === student.user_id ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                              {assigning === student.user_id ? <><Loader2 style={{ width: 18, height: 18, animation: "spin .8s linear infinite" }} /> Assigning…</> : <><CheckCircle2 size={18} /> Assign {lvlCfg.label} Level & Notify Student</>}
                            </button>
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
