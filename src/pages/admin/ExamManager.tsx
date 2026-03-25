/* src/pages/admin/ExamManager.tsx — Enhanced with assign-by-level, question count, mobile layout */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Plus, Edit, Trash2, Copy, Clock, Users, Search, BookOpen,
  Send, ChevronRight, Eye, EyeOff, BarChart2, Filter, Loader2,
  CheckCircle2, XCircle, UserCheck
} from "lucide-react";

const G = "#064E3B";
const LEVELS = ["beginner", "intermediate", "advanced"];

const ExamManager = () => {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [exams, setExams]               = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [termFilter, setTermFilter]     = useState("all");
  const [typeFilter, setTypeFilter]     = useState("all");
  const [levelFilter, setLevelFilter]   = useState("all");

  // Assign dialog
  const [assignExam, setAssignExam]     = useState<any|null>(null);
  const [assignMode, setAssignMode]     = useState<"level"|"individual">("level");
  const [assignLevel, setAssignLevel]   = useState("");
  const [assignStudents, setAssignStudents] = useState<any[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [assigning, setAssigning]       = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(false);

  // Stats
  const [counts, setCounts]             = useState<Record<string, { assigned: number; attempts: number }>>({});

  const fetchExams = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("exams")
      .select("*, exam_questions(id)")
      .order("created_at", { ascending: false });
    setExams(data || []);
    setLoading(false);

    if (data?.length) {
      const ids = data.map((e: any) => e.id);
      const [assignRes, attemptRes] = await Promise.all([
        supabase.from("exam_assignments").select("exam_id").in("exam_id", ids),
        supabase.from("exam_attempts").select("exam_id").in("exam_id", ids),
      ]);
      const c: Record<string, { assigned: number; attempts: number }> = {};
      (assignRes.data || []).forEach((a: any) => { c[a.exam_id] = c[a.exam_id] || { assigned: 0, attempts: 0 }; c[a.exam_id].assigned++; });
      (attemptRes.data || []).forEach((a: any) => { c[a.exam_id] = c[a.exam_id] || { assigned: 0, attempts: 0 }; c[a.exam_id].attempts++; });
      setCounts(c);
    }
  };

  useEffect(() => { fetchExams(); }, []);

  const togglePublish = async (id: string, current: boolean) => {
    await supabase.from("exams").update({ is_published: !current }).eq("id", id);
    fetchExams();
    toast({ title: !current ? "Published" : "Unpublished" });
  };

  const deleteExam = async (id: string) => {
    if (!window.confirm("Delete this exam and all its questions/attempts?")) return;
    await supabase.from("exam_questions").delete().eq("exam_id", id);
    await supabase.from("exam_assignments").delete().eq("exam_id", id);
    await supabase.from("exams").delete().eq("id", id);
    toast({ title: "Deleted" });
    fetchExams();
  };

  const duplicateExam = async (exam: any) => {
    const { data: newExam } = await supabase.from("exams").insert({
      title: exam.title + " (Copy)", title_ar: exam.title_ar ? exam.title_ar + " (نسخة)" : null,
      type: exam.type, time_limit_minutes: exam.time_limit_minutes,
      passing_score: exam.passing_score, is_published: false,
      proctoring_enabled: exam.proctoring_enabled, term: exam.term,
      created_by: user?.id,
    }).select("id").single();
    if (newExam?.id) {
      const { data: qs } = await supabase.from("exam_questions").select("*").eq("exam_id", exam.id);
      if (qs?.length) {
        await supabase.from("exam_questions").insert(qs.map(({ id, created_at, ...q }: any) => ({ ...q, exam_id: newExam.id })));
      }
      toast({ title: "Duplicated!" });
      fetchExams();
    }
  };

  // Open assign dialog and load students for individual mode
  const openAssign = async (exam: any) => {
    setAssignExam(exam);
    setAssignMode("level");
    setAssignLevel("");
    setSelectedStudents(new Set());
    setStudentsLoading(true);
    const { data } = await supabase.from("profiles").select("user_id, full_name, level")
      .order("full_name");
    setAssignStudents(data || []);
    setStudentsLoading(false);
  };

  const handleAssign = async () => {
    if (!assignExam) return;
    setAssigning(true);
    try {
      let userIds: string[] = [];

      if (assignMode === "level") {
        if (!assignLevel) { toast({ title: "Select a level", variant: "destructive" }); return; }
        const { data } = await supabase.from("profiles").select("user_id").eq("level", assignLevel);
        userIds = (data || []).map((p: any) => p.user_id);
      } else {
        userIds = [...selectedStudents];
      }

      if (!userIds.length) { toast({ title: "No students found", variant: "destructive" }); return; }

      // Get existing assignments to avoid duplicates
      const { data: existing } = await supabase.from("exam_assignments")
        .select("user_id").eq("exam_id", assignExam.id).in("user_id", userIds);
      const existingIds = new Set((existing || []).map((e: any) => e.user_id));
      const newIds = userIds.filter(id => !existingIds.has(id));

      if (newIds.length) {
        await supabase.from("exam_assignments").insert(
          newIds.map(uid => ({ exam_id: assignExam.id, user_id: uid, assigned_by: user?.id }))
        );
      }

      // Send notification
      const notifTitle = `New exam assigned: ${assignExam.title}`;
      await supabase.from("notifications" as any).insert(
        userIds.map(uid => ({
          user_id: uid, title: notifTitle,
          message: `You have been assigned the exam: ${assignExam.title}`,
          type: "exam_assigned", reference_id: assignExam.id,
        }))
      );

      toast({ title: `✅ Assigned to ${newIds.length} students (${existingIds.size} already assigned)` });
      setAssignExam(null);
      fetchExams();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  };

  const filtered = exams.filter(e => {
    if (termFilter !== "all" && e.term !== termFilter) return false;
    if (typeFilter !== "all" && e.type !== typeFilter) return false;
    if (levelFilter !== "all" && e.level !== levelFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!e.title?.toLowerCase().includes(s) && !(e.title_ar||"").includes(search)) return false;
    }
    return true;
  });

  const qCount = (exam: any) => (exam.exam_questions || []).length;

  return (
    <div style={{ minHeight: "100vh", background: "#F8F9FA" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "#ECFDF5", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BookOpen size={20} color={G} />
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: "#111", margin: 0 }}>Exam Management</h1>
              <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>{exams.length} exams · {exams.filter(e => e.is_published).length} published</p>
            </div>
          </div>
          <Button onClick={() => navigate("/admin/exam-editor")}
            style={{ background: G, borderRadius: 12, gap: 8, fontWeight: 700 }}>
            <Plus size={16} /> New Exam
          </Button>
        </div>
      </div>

      <div style={{ padding: "20px 16px", maxWidth: 1100, margin: "0 auto" }}>
        {/* Filters */}
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB", padding: "14px 16px", marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search exams…"
              style={{ width: "100%", padding: "8px 10px 8px 30px", borderRadius: 9, border: "1.5px solid #E5E7EB", fontSize: 13, outline: "none", boxSizing: "border-box" as const }} />
          </div>
          {[
            { val: termFilter, set: setTermFilter, opts: [["all", "All Terms"], ["first", "First"], ["second", "Second"], ["final", "Final"]] },
            { val: typeFilter, set: setTypeFilter, opts: [["all", "All Types"], ["exam", "Exam"], ["test", "Test"], ["quiz", "Quiz"]] },
          ].map((f, i) => (
            <select key={i} value={f.val} onChange={e => f.set(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: 9, border: "1.5px solid #E5E7EB", fontSize: 13, background: "#fff", color: "#374151", outline: "none", minWidth: 110 }}>
              {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ))}
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 18 }}>
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

        {/* Exam cards */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 48 }}>
            <Loader2 size={32} style={{ animation: "spin .8s linear infinite", color: G }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 24px", background: "#fff", borderRadius: 16, border: "2px dashed #E5E7EB" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
            <p style={{ fontWeight: 700, color: "#374151" }}>No exams found</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map(exam => {
              const qc = qCount(exam);
              const stat = counts[exam.id] || { assigned: 0, attempts: 0 };
              return (
                <div key={exam.id} style={{ background: "#fff", borderRadius: 16, border: "1.5px solid #E5E7EB", padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    {/* Main info */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 800, fontSize: 14, color: "#111" }}>
                          {language === "ar" ? exam.title_ar || exam.title : exam.title}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                          background: exam.is_published ? "#DCFCE7" : "#F3F4F6",
                          color: exam.is_published ? "#166534" : "#6B7280" }}>
                          {exam.is_published ? "Published" : "Draft"}
                        </span>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#EFF6FF", color: "#1D4ED8", fontWeight: 600 }}>
                          {exam.type || "exam"}
                        </span>
                        {exam.term && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#F5F3FF", color: "#6D28D9", fontWeight: 600 }}>{exam.term}</span>}
                      </div>
                      {exam.title_ar && language !== "ar" && (
                        <p style={{ fontSize: 12, color: "#9CA3AF", margin: "2px 0 6px", fontFamily: "'Amiri',serif", direction: "rtl" }}>{exam.title_ar}</p>
                      )}
                      {/* Stats pills */}
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                        {[
                          { icon: "❓", v: qc, l: `question${qc !== 1 ? "s" : ""}`, c: qc === 0 ? "#DC2626" : "#374151" },
                          { icon: "⏱️", v: exam.time_limit_minutes || "—", l: "min" },
                          { icon: "🎯", v: exam.passing_score || 60, l: "% pass" },
                          { icon: "👥", v: stat.assigned, l: "assigned" },
                          { icon: "📊", v: stat.attempts, l: "attempts" },
                        ].map((s, i) => (
                          <span key={i} style={{ fontSize: 11, color: (s as any).c || "#6B7280", display: "flex", alignItems: "center", gap: 3 }}>
                            {s.icon} <strong style={{ color: (s as any).c || "#374151" }}>{s.v}</strong> {s.l}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0 }}>
                      <button onClick={() => openAssign(exam)}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 9, border: "none", background: G, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                        <Send size={12} /> Assign
                      </button>
                      <button onClick={() => navigate(`/admin/exam-editor?id=${exam.id}`)}
                        style={{ padding: "7px 10px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center" }}>
                        <Edit size={13} color="#6B7280" />
                      </button>
                      <button onClick={() => togglePublish(exam.id, exam.is_published)}
                        style={{ padding: "7px 10px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center" }}>
                        {exam.is_published ? <EyeOff size={13} color="#9CA3AF" /> : <Eye size={13} color="#16A34A" />}
                      </button>
                      <button onClick={() => duplicateExam(exam)}
                        style={{ padding: "7px 10px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center" }}>
                        <Copy size={13} color="#6B7280" />
                      </button>
                      <button onClick={() => navigate(`/admin/grading?exam=${exam.id}`)}
                        style={{ padding: "7px 10px", borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center" }}>
                        <BarChart2 size={13} color="#6B7280" />
                      </button>
                      <button onClick={() => deleteExam(exam.id)}
                        style={{ padding: "7px 10px", borderRadius: 9, border: "1.5px solid #FECACA", background: "#FEF2F2", cursor: "pointer", display: "flex", alignItems: "center" }}>
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

      {/* Assign Dialog */}
      <Dialog open={!!assignExam} onOpenChange={v => !v && setAssignExam(null)}>
        <DialogContent style={{ maxWidth: 500, borderRadius: 20, padding: 0 }}>
          <div style={{ background: G, padding: "18px 20px", borderRadius: "20px 20px 0 0", display: "flex", alignItems: "center", gap: 10 }}>
            <Send size={20} color="#fff" />
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 16, color: "#fff", margin: 0 }}>Assign Exam</h2>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,.7)", margin: 0 }}>{assignExam?.title}</p>
            </div>
          </div>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Mode toggle */}
            <div style={{ display: "flex", gap: 8 }}>
              {(["level", "individual"] as const).map(m => (
                <button key={m} onClick={() => setAssignMode(m)}
                  style={{ flex: 1, padding: "9px", borderRadius: 10, border: `2px solid ${assignMode === m ? G : "#E5E7EB"}`, background: assignMode === m ? "#ECFDF5" : "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13, color: assignMode === m ? G : "#6B7280" }}>
                  {m === "level" ? "📚 By Level" : "👤 Individual"}
                </button>
              ))}
            </div>

            {assignMode === "level" && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
                  Select level — all students in this level will be assigned:
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  {LEVELS.map(l => (
                    <button key={l} onClick={() => setAssignLevel(l)}
                      style={{ flex: 1, padding: "10px", borderRadius: 10, border: `2px solid ${assignLevel === l ? G : "#E5E7EB"}`, background: assignLevel === l ? "#ECFDF5" : "#fff", cursor: "pointer", fontWeight: 700, fontSize: 12, color: assignLevel === l ? G : "#374151" }}>
                      {l.charAt(0).toUpperCase() + l.slice(1)}
                    </button>
                  ))}
                </div>
                {assignLevel && (
                  <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>
                    ✅ All {assignLevel} level students will receive this exam
                  </p>
                )}
              </div>
            )}

            {assignMode === "individual" && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>
                  Select students ({selectedStudents.size} selected):
                </p>
                <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #E5E7EB", borderRadius: 12 }}>
                  {studentsLoading ? (
                    <div style={{ padding: 16, textAlign: "center" }}>
                      <Loader2 size={20} style={{ animation: "spin .8s linear infinite", color: G }} />
                    </div>
                  ) : assignStudents.map(s => (
                    <label key={s.user_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #F9FAFB" }}>
                      <input type="checkbox" checked={selectedStudents.has(s.user_id)}
                        onChange={e => {
                          const next = new Set(selectedStudents);
                          e.target.checked ? next.add(s.user_id) : next.delete(s.user_id);
                          setSelectedStudents(next);
                        }} style={{ accentColor: G, width: 15, height: 15 }} />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: 0 }}>{s.full_name}</p>
                        {s.level && <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{s.level}</p>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button onClick={handleAssign} disabled={assigning || (assignMode === "level" && !assignLevel) || (assignMode === "individual" && !selectedStudents.size)}
              style={{ padding: "13px", borderRadius: 12, border: "none", background: G, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: (assigning || (assignMode === "level" && !assignLevel) || (assignMode === "individual" && !selectedStudents.size)) ? .5 : 1 }}>
              {assigning ? <><Loader2 size={16} style={{ animation: "spin .8s linear infinite" }} /> Assigning…</> : <><UserCheck size={16} /> Assign & Notify Students</>}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export default ExamManager;
