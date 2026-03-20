/*  src/pages/admin/LevelAssignment.tsx
    Admin Level Assignment Panel
    - Lists all students who completed the 3-stage evaluation
    - Shows entrance exam score, AI recitation score, teacher notes
    - Admin assigns Beginner / Intermediate / Advanced and approves
    - Triggers email notification and unlocks subscription
    Route: /admin/level-assignment  (add to App.tsx admin routes)
*/
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, Clock, XCircle, GraduationCap, Mic,
  FileText, User, Mail, Star, ChevronDown, Loader2,
  RefreshCw, Play, Eye, Check, X as XIcon, Filter
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#D4A843";

interface StudentEval {
  user_id:          string;
  full_name:        string;
  full_name_ar:     string;
  email:            string;
  student_id:       string;
  avatar_url:       string;
  // Entrance exam
  exam_score:       number | null;
  exam_completed:   boolean;
  // Recitation test
  rec_status:       string | null;
  rec_ai_score:     number | null;
  rec_audio_path:   string | null;
  rec_teacher_score: number | null;
  rec_teacher_notes: string | null;
  rec_session_date: string | null;
  // Assignment
  current_level:    string | null;
  admin_approved:   boolean;
  final_level:      string | null;
  registration_paid: boolean;
}

const LEVELS = ["beginner", "intermediate", "advanced"] as const;
type Level = typeof LEVELS[number];

const LEVEL_CFG: Record<Level, { label: string; color: string; bg: string }> = {
  beginner:     { label: "Beginner",     color: "#16A34A", bg: "#F0FDF4" },
  intermediate: { label: "Intermediate", color: "#2563EB", bg: "#EFF6FF" },
  advanced:     { label: "Advanced",     color: "#7C3AED", bg: "#F5F3FF" },
};

const scoreColor = (s: number | null) => !s ? "#9ca3af" : s >= 80 ? "#16A34A" : s >= 60 ? "#D97706" : "#DC2626";
const fmtDate    = (d: string | null) => d ? new Date(d).toLocaleDateString("en-NG", { day:"2-digit", month:"short", year:"numeric" }) : "—";
const fmtScore   = (s: number | null) => s !== null ? `${s}%` : "—";

// Final weighted score: 40% exam + 20% AI + 40% teacher
const calcFinal = (exam: number | null, ai: number | null, teacher: number | null): number | null => {
  if (exam === null && ai === null && teacher === null) return null;
  const e = exam    ?? 0;
  const a = ai      ?? 0;
  const t = teacher ?? 0;
  const weight = (exam !== null ? .4 : 0) + (ai !== null ? .2 : 0) + (teacher !== null ? .4 : 0);
  if (weight === 0) return null;
  return Math.round(((e * .4) + (a * .2) + (t * .4)) / weight);
};

const suggestLevel = (final: number | null): Level => {
  if (!final) return "beginner";
  if (final >= 80) return "advanced";
  if (final >= 60) return "intermediate";
  return "beginner";
};

const LevelAssignment = () => {
  const { toast } = useToast();
  const [students, setStudents]   = useState<StudentEval[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<"all"|"pending"|"approved">("pending");
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [selectedLevels, setSelectedLevels] = useState<Record<string, Level>>({});
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [teacherNotes, setTeacherNotes] = useState<Record<string, string>>({});
  const [teacherScores, setTeacherScores] = useState<Record<string, string>>({});
  const [savingTeacher, setSavingTeacher] = useState<string | null>(null);

  // Load all students with their evaluation data
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Get all profiles with registration paid
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id,full_name,full_name_ar,email,student_id,avatar_url,level")
        .order("created_at", { ascending: false });

      if (!profs) { setStudents([]); return; }

      // Get enrollment data
      const uids = profs.map((p: any) => p.user_id);
      const { data: enrs } = await supabase
        .from("enrollments" as any)
        .select("user_id,registration_paid,level")
        .in("user_id", uids);

      // Get recitation test data
      const { data: recs } = await supabase
        .from("recitation_tests" as any)
        .select("*")
        .in("user_id", uids);

      // Get entrance exam scores (latest attempt per user)
      const { data: exams } = await supabase
        .from("exam_attempts" as any)
        .select("user_id,score,completed_at")
        .in("user_id", uids)
        .eq("exam_type", "entrance")
        .order("completed_at", { ascending: false });

      // Build map
      const enrMap   = Object.fromEntries((enrs  || []).map((e: any) => [e.user_id, e]));
      const recMap   = Object.fromEntries((recs   || []).map((r: any) => [r.user_id, r]));
      const examMap: Record<string, any> = {};
      (exams || []).forEach((e: any) => { if (!examMap[e.user_id]) examMap[e.user_id] = e; });

      const built: StudentEval[] = profs.map((p: any) => {
        const enr = enrMap[p.user_id] || {};
        const rec = recMap[p.user_id] || {};
        const ex  = examMap[p.user_id] || {};
        return {
          user_id:          p.user_id,
          full_name:        p.full_name || "Unknown",
          full_name_ar:     p.full_name_ar || "",
          email:            p.email || "",
          student_id:       p.student_id || "—",
          avatar_url:       p.avatar_url || "",
          exam_score:       ex.score ?? null,
          exam_completed:   !!ex.completed_at,
          rec_status:       rec.status || null,
          rec_ai_score:     rec.ai_score ?? null,
          rec_audio_path:   rec.audio_path || null,
          rec_teacher_score: rec.teacher_score ?? null,
          rec_teacher_notes: rec.teacher_notes || null,
          rec_session_date: rec.stage3_session_date || null,
          current_level:    p.level || enr.level || null,
          admin_approved:   !!rec.admin_approved,
          final_level:      rec.final_level || null,
          registration_paid: !!enr.registration_paid,
        };
      });

      setStudents(built.filter(s => s.registration_paid));

      // Pre-fill teacher notes/scores
      const notes: Record<string, string> = {};
      const scores: Record<string, string> = {};
      built.forEach(s => {
        if (s.rec_teacher_notes) notes[s.user_id] = s.rec_teacher_notes;
        if (s.rec_teacher_score !== null) scores[s.user_id] = String(s.rec_teacher_score);
      });
      setTeacherNotes(notes);
      setTeacherScores(scores);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Resolve audio URL
  const resolveAudio = async (path: string, uid: string) => {
    if (audioUrls[uid]) return;
    if (path.startsWith("data:") || path.startsWith("http")) {
      setAudioUrls(p => ({ ...p, [uid]: path })); return;
    }
    const { data } = await supabase.storage.from("recitation-audio").createSignedUrl(path, 3600);
    if (data?.signedUrl) setAudioUrls(p => ({ ...p, [uid]: data.signedUrl }));
  };

  // Save teacher evaluation
  const saveTeacherEval = async (uid: string) => {
    setSavingTeacher(uid);
    const score = parseInt(teacherScores[uid] || "0");
    const notes = teacherNotes[uid] || "";
    await supabase.from("recitation_tests" as any).update({
      teacher_score: isNaN(score) ? null : score,
      teacher_notes: notes,
      stage3_completed_at: new Date().toISOString(),
      status: "stage3_complete",
    }).eq("user_id", uid);
    await load();
    setSavingTeacher(null);
    toast({ title: "✅ Teacher evaluation saved" });
  };

  // Assign level and approve
  const assignLevel = async (student: StudentEval) => {
    const lvl = selectedLevels[student.user_id] || suggestLevel(calcFinal(student.exam_score, student.rec_ai_score, student.rec_teacher_score));
    setAssigning(student.user_id);
    try {
      // Update profile level
      await supabase.from("profiles").update({ level: lvl } as any).eq("user_id", student.user_id);
      // Update recitation test
      await supabase.from("recitation_tests" as any).update({
        final_level: lvl,
        admin_approved: true,
        admin_approved_at: new Date().toISOString(),
        status: "approved",
      }).eq("user_id", student.user_id);
      // Update enrollment
      await supabase.from("enrollments" as any).update({
        level: lvl, status: "grace",
        grace_end_date: new Date(Date.now() + 7 * 86400000).toISOString(),
      }).eq("user_id", student.user_id);
      // Notify student
      await supabase.from("admin_notifications" as any).insert({
        type: "level_assigned",
        user_id: student.user_id,
        message: `Congratulations! You have been assigned to the ${LEVEL_CFG[lvl].label} level. Please subscribe to begin your classes.`,
        created_at: new Date().toISOString(),
        read: false,
      }).catch(() => {});

      toast({ title: `✅ ${student.full_name} assigned to ${LEVEL_CFG[lvl].label}` });
      await load();
    } catch (e: any) {
      toast({ title: "Assignment failed", description: e.message, variant: "destructive" });
    } finally { setAssigning(null); }
  };

  const filtered = students.filter(s => {
    if (filter === "pending")  return !s.admin_approved;
    if (filter === "approved") return s.admin_approved;
    return true;
  });

  const pendingCount   = students.filter(s => !s.admin_approved).length;
  const approvedCount  = students.filter(s =>  s.admin_approved).length;

  return (
    <div style={{ fontFamily:"'Segoe UI', system-ui, sans-serif", minHeight:"100vh", background:"#F0F4F0" }}>
      <style>{"@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}} @keyframes spin{to{transform:rotate(360deg)}}"}</style>

      {/* Header */}
      <div style={{ background:`linear-gradient(135deg,${G},${GM})`, padding:"32px 24px 24px", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0, opacity:.05, backgroundImage:`url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23fff'%3E%3Cpath d='M30 0l30 30-30 30L0 30z'/%3E%3C/g%3E%3C/svg%3E")` }} />
        <div style={{ position:"relative", maxWidth:900, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:6 }}>
            <GraduationCap size={28} color={GOLD} />
            <h1 style={{ fontSize:24, fontWeight:900, color:"#fff", margin:0 }}>Level Assignment Panel</h1>
          </div>
          <p style={{ color:"rgba(255,255,255,.7)", fontSize:14, margin:0 }}>
            Review evaluation scores and assign levels to students who completed all 3 stages
          </p>
          {/* Stats */}
          <div style={{ display:"flex", gap:12, marginTop:16, flexWrap:"wrap" }}>
            {[
              { label:"Total Registered", val: students.length, color:"#fff" },
              { label:"Pending Assignment", val: pendingCount, color:GOLD },
              { label:"Approved",          val: approvedCount, color:"#22c55e" },
            ].map(s => (
              <div key={s.label} style={{ background:"rgba(255,255,255,.1)", borderRadius:10, padding:"10px 16px", textAlign:"center" }}>
                <div style={{ fontSize:22, fontWeight:900, color:s.color }}>{s.val}</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,.6)" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"20px 16px 40px" }}>

        {/* Filter tabs */}
        <div style={{ display:"flex", gap:8, marginBottom:16 }}>
          {([
            { k:"pending",  label:`Pending (${pendingCount})` },
            { k:"approved", label:`Approved (${approvedCount})` },
            { k:"all",      label:`All (${students.length})` },
          ] as const).map(t => (
            <button key={t.k} onClick={() => setFilter(t.k)}
              style={{ padding:"8px 16px", borderRadius:20, border:`2px solid ${filter === t.k ? GM : "#e5e7eb"}`, background: filter === t.k ? "#F0FDF4" : "#fff", color: filter === t.k ? G : "#666", fontSize:13, fontWeight: filter === t.k ? 700 : 500, cursor:"pointer", transition:"all .15s" }}>
              {t.label}
            </button>
          ))}
          <button onClick={load} style={{ marginLeft:"auto", background:"none", border:"2px solid #e5e7eb", borderRadius:20, padding:"8px 14px", fontSize:12, color:"#666", cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {loading && (
          <div style={{ display:"flex", justifyContent:"center", padding:40 }}>
            <Loader2 style={{ width:32, height:32, color:GM, animation:"spin .8s linear infinite" }} />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ background:"#fff", borderRadius:16, padding:40, textAlign:"center", color:"#9ca3af" }}>
            <GraduationCap size={40} style={{ margin:"0 auto 12px", display:"block", color:"#d1d5db" }} />
            <div style={{ fontSize:16, fontWeight:600 }}>
              {filter === "pending" ? "No students pending assignment" : "No students found"}
            </div>
          </div>
        )}

        {!loading && filtered.map(student => {
          const isOpen    = expanded === student.user_id;
          const final     = calcFinal(student.exam_score, student.rec_ai_score, student.rec_teacher_score);
          const suggested = suggestLevel(final);
          const lvl       = selectedLevels[student.user_id] || suggested;
          const lvlCfg    = LEVEL_CFG[lvl];
          const isAssigning = assigning === student.user_id;

          return (
            <div key={student.user_id} style={{ background:"#fff", borderRadius:16, boxShadow:"0 2px 10px rgba(0,0,0,.06)", marginBottom:12, overflow:"hidden", animation:"fadeUp .3s ease", border: student.admin_approved ? "2px solid #86EFAC" : "2px solid #e5e7eb" }}>

              {/* Student row header */}
              <div style={{ padding:"16px 20px", display:"flex", alignItems:"center", gap:14, cursor:"pointer" }} onClick={() => {
                setExpanded(isOpen ? null : student.user_id);
                if (!isOpen && student.rec_audio_path) resolveAudio(student.rec_audio_path, student.user_id);
              }}>
                {/* Avatar */}
                {student.avatar_url
                  ? <img src={student.avatar_url} style={{ width:44, height:44, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} alt="" />
                  : <div style={{ width:44, height:44, borderRadius:"50%", background:G, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:18, flexShrink:0 }}>
                      {student.full_name[0]?.toUpperCase()}
                    </div>
                }
                {/* Name */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontWeight:700, fontSize:15, color:G }}>{student.full_name}</span>
                    {student.admin_approved && <span style={{ background:"#E8F5E9", color:"#166534", fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:20 }}>✓ Assigned</span>}
                  </div>
                  <div style={{ fontSize:12, color:"#9ca3af" }}>{student.email} · {student.student_id}</div>
                </div>

                {/* Score pills */}
                <div style={{ display:"flex", gap:6, flexShrink:0, flexWrap:"wrap" }}>
                  <div style={{ background:"#FFFBEB", borderRadius:8, padding:"4px 8px", textAlign:"center" }}>
                    <div style={{ fontSize:13, fontWeight:800, color:scoreColor(student.exam_score) }}>{fmtScore(student.exam_score)}</div>
                    <div style={{ fontSize:9, color:"#9ca3af" }}>Exam</div>
                  </div>
                  <div style={{ background:"#EFF6FF", borderRadius:8, padding:"4px 8px", textAlign:"center" }}>
                    <div style={{ fontSize:13, fontWeight:800, color:scoreColor(student.rec_ai_score) }}>{fmtScore(student.rec_ai_score)}</div>
                    <div style={{ fontSize:9, color:"#9ca3af" }}>AI</div>
                  </div>
                  <div style={{ background:"#F5F3FF", borderRadius:8, padding:"4px 8px", textAlign:"center" }}>
                    <div style={{ fontSize:13, fontWeight:800, color:scoreColor(student.rec_teacher_score) }}>{fmtScore(student.rec_teacher_score)}</div>
                    <div style={{ fontSize:9, color:"#9ca3af" }}>Teacher</div>
                  </div>
                  {final !== null && (
                    <div style={{ background:`${scoreColor(final)}15`, borderRadius:8, padding:"4px 8px", textAlign:"center", border:`1px solid ${scoreColor(final)}30` }}>
                      <div style={{ fontSize:13, fontWeight:900, color:scoreColor(final) }}>{final}%</div>
                      <div style={{ fontSize:9, color:"#9ca3af" }}>Final</div>
                    </div>
                  )}
                </div>

                <ChevronDown size={16} color="#9ca3af" style={{ transform: isOpen ? "rotate(180deg)" : "none", transition:"transform .2s", flexShrink:0 }} />
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div style={{ borderTop:"1px solid #f0f0f0", padding:"20px" }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>

                    {/* Entrance exam */}
                    <div style={{ background:"#FFFBEB", borderRadius:12, padding:"14px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                        <FileText size={15} color={GOLD} />
                        <span style={{ fontSize:12, fontWeight:700, color:"#92400E" }}>ENTRANCE EXAM</span>
                      </div>
                      <div style={{ fontSize:28, fontWeight:900, color:scoreColor(student.exam_score) }}>{fmtScore(student.exam_score)}</div>
                      <div style={{ fontSize:11, color:"#A16207" }}>Counts 40% of final score</div>
                      <div style={{ fontSize:11, color: student.exam_completed ? "#16A34A" : "#DC2626", marginTop:4 }}>
                        {student.exam_completed ? "✓ Completed" : "✗ Not completed"}
                      </div>
                    </div>

                    {/* AI score */}
                    <div style={{ background:"#EFF6FF", borderRadius:12, padding:"14px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                        <Mic size={15} color="#2563EB" />
                        <span style={{ fontSize:12, fontWeight:700, color:"#1E3A5F" }}>AI RECITATION</span>
                      </div>
                      <div style={{ fontSize:28, fontWeight:900, color:scoreColor(student.rec_ai_score) }}>{fmtScore(student.rec_ai_score)}</div>
                      <div style={{ fontSize:11, color:"#1D4ED8" }}>Counts 20% of final score</div>
                      {/* Audio player */}
                      {student.rec_audio_path && (
                        <div style={{ marginTop:8 }}>
                          {audioUrls[student.user_id]
                            ? <audio controls src={audioUrls[student.user_id]} style={{ width:"100%", height:32 }} />
                            : <button onClick={() => resolveAudio(student.rec_audio_path!, student.user_id)}
                                style={{ fontSize:11, background:GM, color:"#fff", border:"none", borderRadius:8, padding:"5px 10px", cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
                                <Play size={11} /> Load Audio
                              </button>
                          }
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Teacher evaluation */}
                  <div style={{ background:"#F5F3FF", borderRadius:12, padding:"14px", marginBottom:20 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                      <Eye size={15} color="#7C3AED" />
                      <span style={{ fontSize:12, fontWeight:700, color:"#4C1D95" }}>TEACHER EVALUATION (40%)</span>
                      {student.rec_session_date && <span style={{ marginLeft:"auto", fontSize:11, color:"#7C3AED" }}>Session: {fmtDate(student.rec_session_date)}</span>}
                    </div>
                    <div style={{ display:"flex", gap:12, marginBottom:10 }}>
                      <div style={{ flex:0, minWidth:100 }}>
                        <label style={{ fontSize:12, fontWeight:600, color:"#4C1D95", display:"block", marginBottom:4 }}>Score (0–100)</label>
                        <input type="number" min="0" max="100" value={teacherScores[student.user_id] || ""}
                          onChange={e => setTeacherScores(p => ({ ...p, [student.user_id]: e.target.value }))}
                          style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"2px solid #C4B5FD", fontSize:14, fontWeight:700, color:"#7C3AED", background:"#fff", outline:"none", boxSizing:"border-box" as const }}
                          placeholder="0–100"
                        />
                      </div>
                      <div style={{ flex:1 }}>
                        <label style={{ fontSize:12, fontWeight:600, color:"#4C1D95", display:"block", marginBottom:4 }}>Teacher Notes</label>
                        <textarea value={teacherNotes[student.user_id] || ""}
                          onChange={e => setTeacherNotes(p => ({ ...p, [student.user_id]: e.target.value }))}
                          rows={2} placeholder="Makharij quality, Tajweed observations, recommendations…"
                          style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"2px solid #C4B5FD", fontSize:13, color:"#333", background:"#fff", outline:"none", resize:"none", boxSizing:"border-box" as const, fontFamily:"inherit" }}
                        />
                      </div>
                    </div>
                    <button onClick={() => saveTeacherEval(student.user_id)} disabled={savingTeacher === student.user_id}
                      style={{ padding:"8px 16px", borderRadius:10, border:"none", background:"#7C3AED", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
                      {savingTeacher === student.user_id ? <Loader2 size={12} style={{ animation:"spin .8s linear infinite" }} /> : <Check size={12} />}
                      Save Teacher Evaluation
                    </button>
                  </div>

                  {/* Final score & level assignment */}
                  <div style={{ background: student.admin_approved ? "#E8F5E9" : "#F9FAFB", borderRadius:12, padding:"16px", border: student.admin_approved ? "2px solid #86EFAC" : "2px solid #e5e7eb" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                      <GraduationCap size={18} color={student.admin_approved ? "#16A34A" : G} />
                      <span style={{ fontSize:13, fontWeight:700, color: student.admin_approved ? "#166534" : G }}>
                        {student.admin_approved ? `Level Assigned: ${LEVEL_CFG[student.final_level as Level]?.label || student.final_level}` : "Assign Level"}
                      </span>
                      {final !== null && <span style={{ marginLeft:"auto", fontSize:13, fontWeight:900, color:scoreColor(final) }}>Final score: {final}%</span>}
                    </div>

                    {!student.admin_approved && (
                      <>
                        <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                          {LEVELS.map(l => {
                            const cfg = LEVEL_CFG[l];
                            const sel = lvl === l;
                            const isSuggested = l === suggested;
                            return (
                              <button key={l} onClick={() => setSelectedLevels(p => ({ ...p, [student.user_id]: l }))}
                                style={{ flex:1, padding:"10px 6px", borderRadius:10, border:`2px solid ${sel ? cfg.color : "#e5e7eb"}`, background: sel ? cfg.bg : "#fff", color: sel ? cfg.color : "#666", fontSize:12, fontWeight: sel ? 800 : 500, cursor:"pointer", transition:"all .15s", position:"relative" }}>
                                {isSuggested && <div style={{ position:"absolute", top:-8, left:"50%", transform:"translateX(-50%)", fontSize:9, background:cfg.color, color:"#fff", padding:"1px 6px", borderRadius:8, whiteSpace:"nowrap" as const }}>Suggested</div>}
                                {cfg.label}
                              </button>
                            );
                          })}
                        </div>

                        <button onClick={() => assignLevel(student)} disabled={isAssigning}
                          style={{ width:"100%", padding:"13px", borderRadius:12, border:"none", background: isAssigning ? "#9ca3af" : `linear-gradient(135deg,${G},${GM})`, color:"#fff", fontSize:14, fontWeight:800, cursor: isAssigning ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
                          {isAssigning
                            ? <><Loader2 style={{ width:18, height:18, animation:"spin .8s linear infinite" }} /> Assigning…</>
                            : <><CheckCircle2 size={18} /> Assign {LEVEL_CFG[lvl].label} Level & Notify Student</>
                          }
                        </button>
                      </>
                    )}

                    {student.admin_approved && (
                      <div style={{ display:"flex", alignItems:"center", gap:10, color:"#166534" }}>
                        <CheckCircle2 size={20} />
                        <div>
                          <div style={{ fontWeight:700, fontSize:14 }}>Level assigned and student notified</div>
                          <div style={{ fontSize:12, opacity:.7 }}>Student has been placed in {LEVEL_CFG[student.final_level as Level]?.label} and can now subscribe</div>
                        </div>
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
