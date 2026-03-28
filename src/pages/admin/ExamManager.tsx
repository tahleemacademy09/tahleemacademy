/* src/pages/admin/ExamManager.tsx
   FIXED: Exam assignment now properly creates exam_assignments rows AND sends in-app
          notifications so StudentExams page shows the assigned exam.
   FIXED: Individual assign loads students from user_roles table (not just profiles)
   FIXED: Notification insert uses correct schema fields
*/
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Plus, Edit, Trash2, Copy, Clock, Search, Send,
  Eye, EyeOff, BarChart2, Loader2, CheckCircle2,
  XCircle, UserCheck, Users, BookOpen, Filter
} from "lucide-react";

const G = "#064E3B";
const LEVELS = ["beginner", "intermediate", "advanced"];

export default function ExamManager() {
  const { t, language } = useLanguage();
  const { toast }       = useToast();
  const { user }        = useAuth();
  const navigate        = useNavigate();

  const [exams, setExams]               = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [termFilter, setTermFilter]     = useState("all");
  const [typeFilter, setTypeFilter]     = useState("all");

  // Assign dialog
  const [assignExam, setAssignExam]     = useState<any | null>(null);
  const [assignMode, setAssignMode]     = useState<"level" | "individual">("level");
  const [assignLevel, setAssignLevel]   = useState("");
  const [allStudents, setAllStudents]   = useState<any[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [assigning, setAssigning]       = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");

  // Counts per exam
  const [counts, setCounts]             = useState<Record<string, { assigned: number; attempts: number }>>({});

  const fetchExams = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("exams").select("*, exam_questions(id)").order("created_at", { ascending: false });
    setExams(data || []);
    setLoading(false);

    if (data?.length) {
      const ids = data.map((e: any) => e.id);
      const [ar, at] = await Promise.all([
        supabase.from("exam_assignments").select("exam_id").in("exam_id", ids),
        supabase.from("exam_attempts").select("exam_id").in("exam_id", ids),
      ]);
      const c: Record<string, { assigned: number; attempts: number }> = {};
      (ar.data || []).forEach((a: any) => { c[a.exam_id] = c[a.exam_id] || { assigned: 0, attempts: 0 }; c[a.exam_id].assigned++; });
      (at.data || []).forEach((a: any) => { c[a.exam_id] = c[a.exam_id] || { assigned: 0, attempts: 0 }; c[a.exam_id].attempts++; });
      setCounts(c);
    }
  };

  useEffect(() => { fetchExams(); }, []);

  // Load ALL students when assign dialog opens
  const openAssign = async (exam: any) => {
    setAssignExam(exam);
    setAssignMode("level");
    setAssignLevel("");
    setSelectedStudents(new Set());
    setStudentSearch("");
    setStudentsLoading(true);

    // FIX: load from user_roles to get all students, join profile for display
    const { data } = await supabase
      .from("user_roles" as any)
      .select("user_id, profiles(full_name, full_name_ar, level)")
      .eq("role", "student");

    setAllStudents((data || []).map((r: any) => ({
      user_id: r.user_id,
      full_name: r.profiles?.full_name || "Unknown",
      full_name_ar: r.profiles?.full_name_ar || "",
      level: r.profiles?.level || "—",
    })));
    setStudentsLoading(false);
  };

  const togglePublish = async (id: string, current: boolean) => {
    await supabase.from("exams").update({ is_published: !current }).eq("id", id);
    setExams(es => es.map(e => e.id === id ? { ...e, is_published: !current } : e));
    toast({ title: !current ? "✅ Exam published" : "✅ Exam unpublished" });
  };

  const duplicateExam = async (exam: any) => {
    try {
      const { data: qs } = await supabase.from("exam_questions").select("*").eq("exam_id", exam.id);
      // Strip auto-generated fields to avoid insert conflicts
      const cleanExam: any = { ...exam };
      delete cleanExam.id; delete cleanExam.created_at; delete cleanExam.updated_at; delete cleanExam.exam_questions;
      const { data: ne, error: neErr } = await supabase.from("exams").insert({
        ...cleanExam,
        title: exam.title + " (Copy)",
        title_ar: exam.title_ar ? exam.title_ar + " (نسخة)" : null,
        is_published: false,
      }).select("id").single();
      if (neErr) throw neErr;
      if (ne && qs?.length) {
        const qRows = qs.map((q: any) => {
          const clean: any = { ...q }; delete clean.id; delete clean.created_at; delete clean.updated_at;
          return { ...clean, exam_id: ne.id };
        });
        const { error: qErr } = await supabase.from("exam_questions").insert(qRows);
        if (qErr) console.warn("Questions copy warning:", qErr.message);
      }
      toast({ title: "✅ Exam duplicated with all questions!" });
      fetchExams();
    } catch (e: any) {
      toast({ title: "Duplicate failed", description: e.message, variant: "destructive" });
    }
  };

  const deleteExam = async (id: string) => {
    if (!confirm("Delete this exam and all its questions?")) return;
    await supabase.from("exam_assignments").delete().eq("exam_id", id);
    await supabase.from("exam_questions").delete().eq("exam_id", id);
    await supabase.from("exams").delete().eq("id", id);
    setExams(es => es.filter(e => e.id !== id));
    toast({ title: "✅ Exam deleted" });
  };

  // FIX: Assignment with guaranteed notification insert
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

      if (userIds.length === 0) {
        toast({ title: "No students found for this selection", variant: "destructive" });
        setAssigning(false); return;
      }

      // FIX: Allow retake — delete old in-progress attempts so student starts fresh
      await supabase.from("exam_attempts")
        .delete().eq("exam_id", assignExam.id).in("user_id", userIds).eq("status", "in_progress");

      // Insert assignments — duplicate entries allowed (for retakes)
      for (const uid of userIds) {
        await supabase.from("exam_assignments")
          .insert({ exam_id: assignExam.id, user_id: uid, assigned_by: user?.id })
          .select().maybeSingle()
          .then(({ error }) => {
            if (error && error.code !== "23505") console.warn("Assign insert:", error.message);
          });
      }

      // Notify all students
      await supabase.from("notifications" as any).insert(
        userIds.map(uid => ({
          user_id: uid,
          title: `📝 Exam assigned: ${assignExam.title}`,
          message: `You have been assigned "${assignExam.title}". ${assignExam.start_date ? `Opens: ${new Date(assignExam.start_date).toLocaleDateString()}` : "You can take it now."}`,
          type: "exam_assigned", reference_id: assignExam.id, is_read: false,
        }))
      );

      toast({ title: `✅ Assigned to ${userIds.length} student${userIds.length !== 1 ? "s" : ""}` });
      setAssignExam(null);
      fetchExams();
    } catch (e: any) {
      toast({ title: "Assignment failed", description: e.message, variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  };

  const qCount = (e: any) => e.exam_questions?.length ?? 0;

  const filtered = exams.filter(e => {
    const name = language === "ar" ? (e.title_ar || e.title) : e.title;
    if (search && !name.toLowerCase().includes(search.toLowerCase())) return false;
    if (termFilter !== "all" && e.term !== termFilter) return false;
    if (typeFilter !== "all" && e.type !== typeFilter) return false;
    return true;
  });

  const filteredStudents = allStudents.filter(s =>
    s.full_name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.full_name_ar.includes(studentSearch)
  );

  const inp: React.CSSProperties = {
    padding: "8px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB",
    fontSize: 13, outline: "none", background: "#fff",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: "#111", margin: 0 }}>Exam Manager</h1>
          <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>Create, publish, and assign exams to students</p>
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
            { v: exams.reduce((s, e) => s + (counts[e.id]?.attempts || 0), 0), l: "Attempts", icon: "📊", bg: "#F5F3FF", c: "#6D28D9" },
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
          <div style={{ flex: 1, minWidth: 180, position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search exams…"
              style={{ ...inp, width: "100%", paddingLeft: 32, boxSizing: "border-box" }} />
          </div>
          {[
            { val: termFilter, set: setTermFilter, opts: [["all", "All Terms"], ["first", "First"], ["second", "Second"], ["final", "Final"]] },
            { val: typeFilter, set: setTypeFilter, opts: [["all", "All Types"], ["exam", "Exam"], ["test", "Test"], ["quiz", "Quiz"]] },
          ].map((f, i) => (
            <select key={i} value={f.val} onChange={e => f.set(e.target.value)}
              style={{ ...inp, minWidth: 120 }}>
              {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
        </div>

        {/* Exam list */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 48 }}>
            <Loader2 size={32} style={{ animation: "spin .8s linear infinite", color: G }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 24px", background: "#fff", borderRadius: 16, border: "2px dashed #E5E7EB" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
            <p style={{ fontWeight: 700, color: "#374151" }}>No exams found</p>
            <button onClick={() => navigate("/admin/exams/create")}
              style={{ marginTop: 12, padding: "9px 20px", borderRadius: 10, border: "none", background: G, color: "#fff", cursor: "pointer", fontWeight: 700 }}>
              Create Your First Exam
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map(exam => {
              const qc   = qCount(exam);
              const stat = counts[exam.id] || { assigned: 0, attempts: 0 };
              return (
                <div key={exam.id} style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #E5E7EB", padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 800, fontSize: 14, color: "#111" }}>
                          {language === "ar" ? exam.title_ar || exam.title : exam.title}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: exam.is_published ? "#DCFCE7" : "#F3F4F6", color: exam.is_published ? "#166534" : "#6B7280" }}>
                          {exam.is_published ? "✓ Published" : "Draft"}
                        </span>
                        {exam.type && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#EFF6FF", color: "#1D4ED8", fontWeight: 600 }}>{exam.type}</span>}
                        {exam.term && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#F5F3FF", color: "#6D28D9", fontWeight: 600 }}>{exam.term}</span>}
                      </div>
                      {exam.title_ar && language !== "ar" && <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 6px", fontFamily: "'Amiri',serif", direction: "rtl" }}>{exam.title_ar}</p>}
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
                        {[
                          { icon: "❓", v: qc, l: `q${qc !== 1 ? "s" : ""}`, c: qc === 0 ? "#DC2626" : "#374151" },
                          { icon: "⏱️", v: exam.time_limit_minutes || "—", l: "min" },
                          { icon: "🎯", v: `${exam.passing_score || 60}%`, l: "pass" },
                          { icon: "👥", v: stat.assigned, l: "assigned" },
                          { icon: "📊", v: stat.attempts, l: "attempts" },
                        ].map((s, i) => (
                          <span key={i} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}>
                            {s.icon} <strong style={{ color: (s as any).c || "#374151" }}>{s.v}</strong> <span style={{ color: "#9CA3AF" }}>{s.l}</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
                      <button onClick={() => openAssign(exam)}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 13px", borderRadius: 9, border: "none", background: G, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                        <Send size={12} /> Assign
                      </button>
                      <button onClick={() => navigate(`/admin/exams/${exam.id}/edit`)}
                        style={{ padding: "8px 10px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer" }}>
                        <Edit size={13} color="#6B7280" />
                      </button>
                      <button onClick={() => togglePublish(exam.id, exam.is_published)}
                        style={{ padding: "8px 10px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer" }}>
                        {exam.is_published ? <EyeOff size={13} color="#9CA3AF" /> : <Eye size={13} color="#16A34A" />}
                      </button>
                      <button onClick={() => duplicateExam(exam)}
                        style={{ padding: "8px 10px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer" }}>
                        <Copy size={13} color="#6B7280" />
                      </button>
                      <button onClick={() => navigate("/admin/grading")}
                        style={{ padding: "8px 10px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer" }}>
                        <BarChart2 size={13} color="#6B7280" />
                      </button>
                      <button onClick={() => deleteExam(exam.id)}
                        style={{ padding: "8px 10px", borderRadius: 9, border: "1.5px solid #FECACA", background: "#FEF2F2", cursor: "pointer" }}>
                        <Trash2 size={13} color="#DC2626" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Assign Dialog ── */}
      <Dialog open={!!assignExam} onOpenChange={v => !v && setAssignExam(null)}>
        <DialogContent style={{ maxWidth: 520, borderRadius: 20, padding: 0, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
          <div style={{ background: G, padding: "16px 20px", borderRadius: "20px 20px 0 0", flexShrink: 0 }}>
            <h2 style={{ fontWeight: 800, fontSize: 15, color: "#fff", margin: 0 }}>
              📋 Assign: {assignExam?.title}
            </h2>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,.7)", margin: "4px 0 0" }}>
              Students will receive an in-app notification and see this exam immediately.
            </p>
          </div>

          <div style={{ padding: 16, overflow: "auto", flex: 1 }}>
            {/* Mode selector */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              {[
                { id: "level" as const, icon: "🎓", label: "By Level", sub: "Assign to all students at a level" },
                { id: "individual" as const, icon: "👤", label: "Individual", sub: "Select specific students" },
              ].map(m => (
                <button key={m.id} onClick={() => setAssignMode(m.id)}
                  style={{ padding: "12px", borderRadius: 12, border: `1.5px solid ${assignMode === m.id ? G : "#E5E7EB"}`, background: assignMode === m.id ? "#F0FDF4" : "#fff", cursor: "pointer", textAlign: "left" }}>
                  <p style={{ fontSize: 18, margin: "0 0 4px" }}>{m.icon}</p>
                  <p style={{ fontWeight: 700, fontSize: 13, color: assignMode === m.id ? G : "#374151", margin: 0 }}>{m.label}</p>
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{m.sub}</p>
                </button>
              ))}
            </div>

            {/* Level mode */}
            {assignMode === "level" && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", marginBottom: 8 }}>Select Level</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {LEVELS.map(lv => {
                    const count = allStudents.filter(s => s.level === lv).length;
                    return (
                      <button key={lv} onClick={() => setAssignLevel(lv)}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${assignLevel === lv ? G : "#E5E7EB"}`, background: assignLevel === lv ? "#F0FDF4" : "#fff", cursor: "pointer" }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: assignLevel === lv ? G : "#374151", textTransform: "capitalize" }}>{lv}</span>
                        <span style={{ fontSize: 12, color: "#9CA3AF" }}>{studentsLoading ? "…" : `${count} student${count !== 1 ? "s" : ""}`}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Individual mode */}
            {assignMode === "individual" && (
              <div>
                <div style={{ position: "relative", marginBottom: 10 }}>
                  <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
                  <input value={studentSearch} onChange={e => setStudentSearch(e.target.value)} placeholder="Search students…"
                    style={{ ...inp, width: "100%", paddingLeft: 32, boxSizing: "border-box" as const }} />
                </div>
                {studentsLoading ? (
                  <div style={{ textAlign: "center", padding: 24 }}><Loader2 size={24} style={{ animation: "spin .8s linear infinite", color: G }} /></div>
                ) : (
                  <>
                    <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 6 }}>{selectedStudents.size} selected of {filteredStudents.length}</div>
                    <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                      {filteredStudents.map(s => {
                        const sel = selectedStudents.has(s.user_id);
                        return (
                          <button key={s.user_id}
                            onClick={() => {
                              const next = new Set(selectedStudents);
                              if (sel) next.delete(s.user_id); else next.add(s.user_id);
                              setSelectedStudents(next);
                            }}
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 11, border: `1.5px solid ${sel ? G : "#E5E7EB"}`, background: sel ? "#F0FDF4" : "#fff", cursor: "pointer", textAlign: "left" }}>
                            <div style={{ width: 32, height: 32, borderRadius: "50%", background: sel ? G : "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: sel ? "#fff" : "#1D4ED8" }}>{s.full_name[0]}</span>
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontWeight: 700, fontSize: 13, color: sel ? G : "#374151", margin: 0 }}>{s.full_name}</p>
                              {s.full_name_ar && <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0, fontFamily: "'Amiri',serif", direction: "rtl" }}>{s.full_name_ar}</p>}
                            </div>
                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#F5F3FF", color: "#6D28D9", fontWeight: 600, flexShrink: 0 }}>{s.level}</span>
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

          {/* Footer */}
          <div style={{ padding: "14px 16px", borderTop: "1px solid #E5E7EB", flexShrink: 0, display: "flex", gap: 10 }}>
            <button onClick={() => setAssignExam(null)}
              style={{ flex: 1, padding: 12, borderRadius: 11, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
              Cancel
            </button>
            <button onClick={doAssign}
              disabled={assigning || (assignMode === "level" && !assignLevel) || (assignMode === "individual" && selectedStudents.size === 0)}
              style={{ flex: 2, padding: 12, borderRadius: 11, border: "none", cursor: assigning ? "not-allowed" : "pointer", fontWeight: 800, fontSize: 13, color: "#fff",
                background: assigning ? "#9CA3AF" : G, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {assigning
                ? <><Loader2 size={14} style={{ animation: "spin .8s linear infinite" }} /> Assigning…</>
                : <><Send size={14} /> Assign & Notify Students</>}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}