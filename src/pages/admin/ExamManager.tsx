/* src/pages/admin/ExamManager.tsx
   FIX: 0 students — two-step query (user_roles then profiles) instead of broken JOIN
   NEW: Exams grouped by level with colour badges
   NEW: Export questions as CSV per exam
   NEW: Apply-all bulk settings (points + difficulty) to every question in an exam
*/
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Plus, Edit, Trash2, Copy, Search, Send,
  Eye, EyeOff, BarChart2, Loader2, CheckCircle2,
  Download, Settings,
} from "lucide-react";

const G = "#064E3B";
const LEVELS = ["beginner", "intermediate", "advanced"];
const LC: Record<string, { bg: string; c: string; border: string }> = {
  beginner:     { bg: "#F0FDF4", c: "#166534", border: "#86EFAC" },
  intermediate: { bg: "#EFF6FF", c: "#1D4ED8", border: "#93C5FD" },
  advanced:     { bg: "#FDF4FF", c: "#7E22CE", border: "#D8B4FE" },
};

export default function ExamManager() {
  const { language } = useLanguage();
  const { toast }    = useToast();
  const { user }     = useAuth();
  const navigate     = useNavigate();

  const [exams, setExams]           = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [termFilter, setTermFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [counts, setCounts]         = useState<Record<string, { assigned: number; attempts: number }>>({});

  // Assign dialog
  const [assignExam, setAssignExam]         = useState<any | null>(null);
  const [assignMode, setAssignMode]         = useState<"level" | "individual">("level");
  const [assignLevel, setAssignLevel]       = useState("");
  const [allStudents, setAllStudents]       = useState<any[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [assigning, setAssigning]           = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch]   = useState("");

  // Bulk settings dialog
  const [bulkDialog, setBulkDialog] = useState(false);
  const [bulkExamId, setBulkExamId] = useState<string | null>(null);
  const [bulkPoints, setBulkPoints] = useState(1);
  const [bulkDiff, setBulkDiff]     = useState("medium");
  const [applying, setApplying]     = useState(false);

  const fetchExams = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("exams").select("*, exam_questions(id)").order("created_at", { ascending: false });
    setExams(data || []);
    setLoading(false);
    if (data?.length) {
      const ids = data.map((e: any) => e.id);
      const [ar, at] = await Promise.all([
        supabase.from("exam_assignments").select("exam_id").in("exam_id", ids),
        supabase.from("exam_attempts").select("exam_id").in("exam_id", ids),
      ]);
      const c: Record<string, { assigned: number; attempts: number }> = {};
      (ar.data||[]).forEach((a:any)=>{ c[a.exam_id]=c[a.exam_id]||{assigned:0,attempts:0}; c[a.exam_id].assigned++; });
      (at.data||[]).forEach((a:any)=>{ c[a.exam_id]=c[a.exam_id]||{assigned:0,attempts:0}; c[a.exam_id].attempts++; });
      setCounts(c);
    }
  }, []);

  useEffect(() => { fetchExams(); }, [fetchExams]);

  // FIX: two-step query — user_roles JOIN profiles breaks in Supabase without FK config
  const openAssign = async (exam: any) => {
    setAssignExam(exam); setAssignMode("level"); setAssignLevel("");
    setSelectedStudents(new Set()); setStudentSearch(""); setStudentsLoading(true);
    try {
      // Step 1: get student user_ids
      const { data: roles } = await supabase.from("user_roles" as any).select("user_id").eq("role", "student");
      const ids = (roles||[]).map((r:any) => r.user_id);
      if (!ids.length) { setAllStudents([]); setStudentsLoading(false); return; }
      // Step 2: fetch matching profiles
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name, full_name_ar, level").in("user_id", ids);
      setAllStudents((profs||[]).map((p:any) => ({ user_id: p.user_id, full_name: p.full_name||"Unknown", full_name_ar: p.full_name_ar||"", level: p.level||"—" })));
    } catch (e: any) { toast({ title: "Error loading students", description: e.message, variant: "destructive" }); }
    setStudentsLoading(false);
  };

  const togglePublish = async (id: string, cur: boolean) => {
    await supabase.from("exams").update({ is_published: !cur }).eq("id", id);
    setExams(es => es.map(e => e.id===id ? {...e, is_published: !cur} : e));
    toast({ title: !cur ? "✅ Published" : "✅ Unpublished" });
  };

  const duplicateExam = async (exam: any) => {
    const { data: qs } = await supabase.from("exam_questions").select("*").eq("exam_id", exam.id);
    const { data: ne } = await supabase.from("exams").insert({ ...exam, id: undefined, title: exam.title+" (Copy)", is_published: false, created_at: undefined, updated_at: undefined }).select().single();
    if (ne && qs?.length) await supabase.from("exam_questions").insert(qs.map((q:any) => ({ ...q, id: undefined, exam_id: ne.id })));
    toast({ title: "✅ Duplicated" }); fetchExams();
  };

  const deleteExam = async (id: string) => {
    if (!confirm("Delete this exam and all questions?")) return;
    await supabase.from("exam_assignments").delete().eq("exam_id", id);
    await supabase.from("exam_questions").delete().eq("exam_id", id);
    await supabase.from("exams").delete().eq("id", id);
    setExams(es => es.filter(e => e.id !== id));
    toast({ title: "✅ Deleted" });
  };

  const exportCSV = async (exam: any) => {
    const { data: qs } = await supabase.from("exam_questions").select("*").eq("exam_id", exam.id).order("sort_order");
    if (!qs?.length) { toast({ title: "No questions to export", variant: "destructive" }); return; }
    const header = "question_type,question_text,question_text_ar,correct_answer,points,difficulty,option_a,option_b,option_c,option_d,explanation";
    const rows = qs.map((q:any) => {
      const o = Array.isArray(q.options) ? q.options : [];
      return [q.question_type, `"${(q.question_text||"").replace(/"/g,'""')}"`, `"${(q.question_text_ar||"").replace(/"/g,'""')}"`,
        `"${q.correct_answer||""}"`, q.points, q.difficulty,
        `"${o[0]?.text||""}"`, `"${o[1]?.text||""}"`, `"${o[2]?.text||""}"`, `"${o[3]?.text||""}"`,
        `"${q.explanation||""}"`].join(",");
    });
    const blob = new Blob([[header,...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `${exam.title.replace(/\s+/g,"_")}_questions.csv`; a.click();
    toast({ title: `✅ Exported ${qs.length} questions` });
  };

  const applyBulk = async () => {
    if (!bulkExamId) return;
    setApplying(true);
    const { error } = await supabase.from("exam_questions").update({ points: bulkPoints, difficulty: bulkDiff }).eq("exam_id", bulkExamId);
    setApplying(false); setBulkDialog(false);
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else toast({ title: `✅ Applied to all questions — ${bulkPoints} pts · ${bulkDiff}` });
  };

  const doAssign = async () => {
    if (!assignExam) return;
    setAssigning(true);
    try {
      let userIds: string[] = [];
      if (assignMode === "level") {
        if (!assignLevel) { toast({ title: "Select a level", variant: "destructive" }); setAssigning(false); return; }
        userIds = allStudents.filter(s => s.level === assignLevel).map(s => s.user_id);
      } else {
        userIds = Array.from(selectedStudents);
      }
      if (!userIds.length) { toast({ title: "No students found", variant: "destructive" }); setAssigning(false); return; }

      const { data: existing } = await supabase.from("exam_assignments").select("user_id").eq("exam_id", assignExam.id).in("user_id", userIds);
      const existingSet = new Set((existing||[]).map((r:any) => r.user_id));
      const newIds = userIds.filter(id => !existingSet.has(id));

      if (newIds.length > 0) {
        const { error: aErr } = await supabase.from("exam_assignments").insert(newIds.map(uid => ({ exam_id: assignExam.id, user_id: uid, assigned_by: user?.id })));
        if (aErr) throw aErr;
        await supabase.from("notifications" as any).insert(newIds.map(uid => ({
          user_id: uid, title: `📝 New exam: ${assignExam.title}`,
          message: `You have been assigned "${assignExam.title}". ${assignExam.start_date ? `Opens: ${new Date(assignExam.start_date).toLocaleDateString()}` : "You can take it now."}`,
          type: "exam_assigned", reference_id: assignExam.id, is_read: false,
        })));
      }
      toast({ title: `✅ Assigned to ${newIds.length} student${newIds.length!==1?"s":""}`, description: existingSet.size>0 ? `${existingSet.size} already had it` : undefined });
      setAssignExam(null); fetchExams();
    } catch (e: any) { toast({ title: "Assignment failed", description: e.message, variant: "destructive" }); }
    finally { setAssigning(false); }
  };

  const qCount = (e: any) => e.exam_questions?.length ?? 0;
  const filtered = exams.filter(e => {
    const name = language==="ar" ? (e.title_ar||e.title) : e.title;
    if (search && !name.toLowerCase().includes(search.toLowerCase())) return false;
    if (termFilter!=="all" && e.term!==termFilter) return false;
    if (typeFilter!=="all" && e.type!==typeFilter) return false;
    if (levelFilter!=="all" && e.level!==levelFilter) return false;
    return true;
  });
  const filteredStudents = allStudents.filter(s => s.full_name.toLowerCase().includes(studentSearch.toLowerCase()) || s.full_name_ar.includes(studentSearch));

  // Group exams by level for display
  const groups: Record<string, any[]> = {};
  filtered.forEach(e => { const k = e.level||"unset"; if (!groups[k]) groups[k] = []; groups[k].push(e); });
  const displayGroups = levelFilter!=="all" ? [[levelFilter, filtered]] as [string,any[]][] : Object.entries(groups) as [string,any[]][];

  const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none", background: "#fff" };

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: "#111", margin: 0 }}>Exam Manager</h1>
          <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>{exams.length} exams · create, assign, export</p>
        </div>
        <button onClick={() => navigate("/admin/exams/create")}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 11, border: "none", background: G, color: "#fff", cursor: "pointer", fontWeight: 800, fontSize: 13 }}>
          <Plus size={15} /> New Exam
        </button>
      </div>

      <div style={{ padding: 16, maxWidth: 800, margin: "0 auto" }}>
        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
          {[
            { v: exams.length, l: "Total", icon: "📋", bg: "#EFF6FF", c: "#1D4ED8" },
            { v: exams.filter(e => e.is_published).length, l: "Published", icon: "🌐", bg: "#F0FDF4", c: "#166534" },
            { v: exams.filter(e => !e.is_published).length, l: "Draft", icon: "✏️", bg: "#FFF7ED", c: "#C2410C" },
            { v: Object.values(counts).reduce((s,c)=>s+c.attempts,0), l: "Attempts", icon: "📊", bg: "#F5F3FF", c: "#6D28D9" },
          ].map((s, i) => (
            <div key={i} style={{ background: s.bg, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: s.c }}>{s.v}</div>
              <div style={{ fontSize: 11, color: s.c, opacity: .7, fontWeight: 600 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160, position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search exams…" style={{ ...inp, width: "100%", paddingLeft: 32, boxSizing: "border-box" as const }} />
          </div>
          {[
            { val: termFilter, set: setTermFilter, opts: [["all","All Terms"],["first","First"],["second","Second"],["final","Final"],["mock","Mock"]] },
            { val: typeFilter, set: setTypeFilter, opts: [["all","All Types"],["exam","Exam"],["test","Test"],["quiz","Quiz"]] },
            { val: levelFilter, set: setLevelFilter, opts: [["all","All Levels"],...LEVELS.map(l=>[l,l.charAt(0).toUpperCase()+l.slice(1)])] },
          ].map((f, i) => (
            <select key={i} value={f.val} onChange={e => f.set(e.target.value)} style={{ ...inp, minWidth: 110 }}>
              {f.opts.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 48 }}><Loader2 size={32} style={{ animation: "spin .8s linear infinite", color: G }} /></div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 24px", background: "#fff", borderRadius: 16, border: "2px dashed #E5E7EB" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
            <p style={{ fontWeight: 700, color: "#374151" }}>No exams found</p>
            <button onClick={() => navigate("/admin/exams/create")} style={{ marginTop: 12, padding: "9px 20px", borderRadius: 10, border: "none", background: G, color: "#fff", cursor: "pointer", fontWeight: 700 }}>Create Your First Exam</button>
          </div>
        ) : displayGroups.map(([level, groupExams]) => {
          const lc = LC[level] || { bg: "#F9FAFB", c: "#374151", border: "#E5E7EB" };
          return (
            <div key={level} style={{ marginBottom: 20 }}>
              {levelFilter === "all" && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ padding: "4px 14px", borderRadius: 20, background: lc.bg, border: `1.5px solid ${lc.border}`, fontSize: 12, fontWeight: 800, color: lc.c, textTransform: "capitalize" }}>
                    {level === "unset" ? "📋 No Level Set" : `🎓 ${level}`}
                  </div>
                  <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>{groupExams.length} exam{groupExams.length!==1?"s":""}</span>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {groupExams.map(exam => {
                  const qc = qCount(exam);
                  const stat = counts[exam.id] || { assigned: 0, attempts: 0 };
                  const elc = LC[exam.level] || { bg: "#F9FAFB", c: "#6B7280", border: "#E5E7EB" };
                  return (
                    <div key={exam.id} style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #E5E7EB", padding: 16 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 800, fontSize: 14, color: "#111" }}>{language==="ar" ? exam.title_ar||exam.title : exam.title}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: exam.is_published?"#DCFCE7":"#F3F4F6", color: exam.is_published?"#166534":"#6B7280" }}>{exam.is_published?"✓ Published":"Draft"}</span>
                            {exam.type && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#EFF6FF", color: "#1D4ED8", fontWeight: 600 }}>{exam.type}</span>}
                            {exam.term && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#F5F3FF", color: "#6D28D9", fontWeight: 600 }}>{exam.term}</span>}
                            {exam.level && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: elc.bg, color: elc.c, fontWeight: 700, border: `1px solid ${elc.border}`, textTransform: "capitalize" }}>{exam.level}</span>}
                          </div>
                          {exam.title_ar && language!=="ar" && <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 6px", fontFamily: "'Amiri',serif", direction: "rtl" }}>{exam.title_ar}</p>}
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
                            {[{icon:"❓",v:qc,l:`q${qc!==1?"s":""}`,c:qc===0?"#DC2626":"#374151"},{icon:"⏱️",v:exam.time_limit_minutes||"—",l:"min"},{icon:"🎯",v:`${exam.passing_score||60}%`,l:"pass"},{icon:"👥",v:stat.assigned,l:"assigned"},{icon:"📊",v:stat.attempts,l:"attempts"}]
                              .map((s,i) => <span key={i} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}>{s.icon} <strong style={{ color: (s as any).c||"#374151" }}>{s.v}</strong> <span style={{ color: "#9CA3AF" }}>{s.l}</span></span>)}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
                          <button onClick={() => openAssign(exam)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 13px", borderRadius: 9, border: "none", background: G, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}><Send size={12} /> Assign</button>
                          <button onClick={() => navigate(`/admin/exams/${exam.id}/edit`)} style={{ padding: "8px 10px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer" }} title="Edit"><Edit size={13} color="#6B7280" /></button>
                          <button onClick={() => togglePublish(exam.id, exam.is_published)} style={{ padding: "8px 10px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer" }}>{exam.is_published ? <EyeOff size={13} color="#9CA3AF" /> : <Eye size={13} color="#16A34A" />}</button>
                          <button onClick={() => duplicateExam(exam)} style={{ padding: "8px 10px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer" }} title="Duplicate"><Copy size={13} color="#6B7280" /></button>
                          <button onClick={() => { setBulkExamId(exam.id); setBulkDialog(true); }} style={{ padding: "8px 10px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer" }} title="Apply settings to all questions"><Settings size={13} color="#6B7280" /></button>
                          <button onClick={() => exportCSV(exam)} style={{ padding: "8px 10px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, color: "#374151" }} title="Export questions as CSV"><Download size={13} color="#6B7280" /> CSV</button>
                          <button onClick={() => navigate("/admin/grading")} style={{ padding: "8px 10px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer" }} title="Grading"><BarChart2 size={13} color="#6B7280" /></button>
                          <button onClick={() => deleteExam(exam.id)} style={{ padding: "8px 10px", borderRadius: 9, border: "1.5px solid #FECACA", background: "#FEF2F2", cursor: "pointer" }} title="Delete"><Trash2 size={13} color="#DC2626" /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Assign Dialog */}
      <Dialog open={!!assignExam} onOpenChange={v => !v && setAssignExam(null)}>
        <DialogContent style={{ maxWidth: 520, borderRadius: 20, padding: 0, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
          <div style={{ background: G, padding: "16px 20px", borderRadius: "20px 20px 0 0", flexShrink: 0 }}>
            <h2 style={{ fontWeight: 800, fontSize: 15, color: "#fff", margin: 0 }}>📋 Assign: {assignExam?.title}</h2>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,.7)", margin: "4px 0 0" }}>Students receive an in-app notification and see this exam immediately.</p>
          </div>
          <div style={{ padding: 16, overflow: "auto", flex: 1 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              {[{id:"level" as const,icon:"🎓",label:"By Level",sub:"All students at one level"},{id:"individual" as const,icon:"👤",label:"Individual",sub:"Pick specific students"}]
                .map(m => (
                  <button key={m.id} onClick={() => setAssignMode(m.id)} style={{ padding: "12px", borderRadius: 12, border: `1.5px solid ${assignMode===m.id?G:"#E5E7EB"}`, background: assignMode===m.id?"#F0FDF4":"#fff", cursor: "pointer", textAlign: "left" }}>
                    <p style={{ fontSize: 18, margin: "0 0 4px" }}>{m.icon}</p>
                    <p style={{ fontWeight: 700, fontSize: 13, color: assignMode===m.id?G:"#374151", margin: 0 }}>{m.label}</p>
                    <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{m.sub}</p>
                  </button>
                ))}
            </div>

            {assignMode === "level" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {LEVELS.map(lv => {
                  const count = allStudents.filter(s => s.level===lv).length;
                  const lc = LC[lv];
                  return (
                    <button key={lv} onClick={() => setAssignLevel(lv)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${assignLevel===lv?lc.c:"#E5E7EB"}`, background: assignLevel===lv?lc.bg:"#fff", cursor: "pointer" }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: assignLevel===lv?lc.c:"#374151", textTransform: "capitalize" }}>🎓 {lv}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 20, background: count>0?lc.bg:"#F3F4F6", color: count>0?lc.c:"#9CA3AF" }}>
                        {studentsLoading ? "…" : `${count} student${count!==1?"s":""}`}
                      </span>
                    </button>
                  );
                })}
                {!studentsLoading && allStudents.length===0 && (
                  <div style={{ padding: "12px 14px", borderRadius: 12, background: "#FFF7ED", border: "1px solid #FED7AA", fontSize: 12, color: "#C2410C" }}>
                    ⚠️ No students found. Ensure students have accounts and are assigned a level in their profile.
                  </div>
                )}
              </div>
            )}

            {assignMode === "individual" && (
              <div>
                <div style={{ position: "relative", marginBottom: 10 }}>
                  <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
                  <input value={studentSearch} onChange={e => setStudentSearch(e.target.value)} placeholder="Search students…" style={{ ...inp, width: "100%", paddingLeft: 32, boxSizing: "border-box" as const }} />
                </div>
                {studentsLoading ? (
                  <div style={{ textAlign: "center", padding: 24 }}><Loader2 size={24} style={{ animation: "spin .8s linear infinite", color: G }} /></div>
                ) : filteredStudents.length===0 ? (
                  <div style={{ padding: 16, borderRadius: 12, background: "#FFF7ED", border: "1px solid #FED7AA", fontSize: 12, color: "#C2410C", textAlign: "center" }}>No students found.</div>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: "#9CA3AF" }}>{selectedStudents.size} selected</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setSelectedStudents(new Set(filteredStudents.map((s:any)=>s.user_id)))} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer", color: G, fontWeight: 700 }}>All</button>
                        <button onClick={() => setSelectedStudents(new Set())} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer", color: "#9CA3AF" }}>None</button>
                      </div>
                    </div>
                    <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                      {filteredStudents.map((s:any) => {
                        const sel = selectedStudents.has(s.user_id);
                        const lc = LC[s.level] || { bg: "#F5F3FF", c: "#6D28D9" };
                        return (
                          <button key={s.user_id} onClick={() => { const n=new Set(selectedStudents); if(sel)n.delete(s.user_id);else n.add(s.user_id); setSelectedStudents(n); }}
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 11, border: `1.5px solid ${sel?G:"#E5E7EB"}`, background: sel?"#F0FDF4":"#fff", cursor: "pointer", textAlign: "left" }}>
                            <div style={{ width: 32, height: 32, borderRadius: "50%", background: sel?G:"#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: sel?"#fff":"#1D4ED8" }}>{s.full_name[0]}</span>
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontWeight: 700, fontSize: 13, color: sel?G:"#374151", margin: 0 }}>{s.full_name}</p>
                              {s.full_name_ar && <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0, fontFamily: "'Amiri',serif", direction: "rtl" }}>{s.full_name_ar}</p>}
                            </div>
                            {s.level && s.level!=="—" && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: lc.bg, color: lc.c, fontWeight: 700, flexShrink: 0, textTransform: "capitalize" }}>{s.level}</span>}
                            {sel && <CheckCircle2 size={16} color={G} />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <div style={{ padding: "14px 16px", borderTop: "1px solid #E5E7EB", flexShrink: 0, display: "flex", gap: 10 }}>
            <button onClick={() => setAssignExam(null)} style={{ flex: 1, padding: 12, borderRadius: 11, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>Cancel</button>
            <button onClick={doAssign} disabled={assigning||(assignMode==="level"&&!assignLevel)||(assignMode==="individual"&&selectedStudents.size===0)}
              style={{ flex: 2, padding: 12, borderRadius: 11, border: "none", cursor: assigning?"not-allowed":"pointer", fontWeight: 800, fontSize: 13, color: "#fff", background: assigning?"#9CA3AF":G, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {assigning ? <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> Assigning…</> : <><Send size={14} /> Assign & Notify</>}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Settings Dialog */}
      <Dialog open={bulkDialog} onOpenChange={v => !v && setBulkDialog(false)}>
        <DialogContent style={{ maxWidth: 380, borderRadius: 20, padding: 0 }}>
          <div style={{ background: G, padding: "16px 20px", borderRadius: "20px 20px 0 0" }}>
            <h2 style={{ fontWeight: 800, fontSize: 15, color: "#fff", margin: 0 }}>⚙️ Apply to ALL Questions</h2>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,.7)", margin: "4px 0 0" }}>Overrides points & difficulty for every question in this exam.</p>
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>Points per Question</label>
              <input type="number" min={0} value={bulkPoints} onChange={e => setBulkPoints(Number(e.target.value))} style={{ ...inp, width: "100%", boxSizing: "border-box" as const }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>Difficulty</label>
              <div style={{ display: "flex", gap: 8 }}>
                {["easy","medium","hard"].map(d => (
                  <button key={d} onClick={() => setBulkDiff(d)} style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: `1.5px solid ${bulkDiff===d?G:"#E5E7EB"}`, background: bulkDiff===d?"#F0FDF4":"#fff", cursor: "pointer", fontWeight: 700, fontSize: 12, color: bulkDiff===d?G:"#9CA3AF", textTransform: "capitalize" }}>{d}</button>
                ))}
              </div>
            </div>
            <button onClick={applyBulk} disabled={applying} style={{ padding: "12px 0", borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 800, color: "#fff", background: applying?"#9CA3AF":G, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {applying ? <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> Applying…</> : "✅ Apply to All Questions"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
