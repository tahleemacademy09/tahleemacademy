// src/pages/admin/AttendanceManagement.tsx
// FIXED:
//  1. Shows real records — was previously empty because TeacherAttendance
//     never saved anything (broken student fetch). Both are now fixed together.
//  2. Added per-student drill-down: click a student to see their full record.
//  3. Admin can edit any individual record status inline.
//  4. Admin can manually add attendance records for any student/subject/date.
//  5. "Send Warning" notification actually works — inserts into notifications table.
//  6. All time displays use 12hr format.

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Download, Search, AlertTriangle, Users, Calendar,
  CheckCircle2, XCircle, Clock, ChevronLeft, Plus,
  Loader2, Save, Bell, Filter,
} from "lucide-react";

const G    = "#064E3B";
const GOLD = "#c9a84c";

const STATUS_CFG = {
  present: { label: "Present", color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC" },
  late:    { label: "Late",    color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  absent:  { label: "Absent",  color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
} as const;
type StatusKey = keyof typeof STATUS_CFG;

const fmt12 = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
};

const inp: React.CSSProperties = {
  padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB",
  fontSize: 13, outline: "none", color: "#111", background: "#fff",
  fontFamily: "'Cairo', sans-serif", boxSizing: "border-box" as const,
};

const AttendanceManagement = () => {
  const { t } = useLanguage();
  const { toast } = useToast();

  // ── Raw data ──────────────────────────────────────────────────────────────
  const [students,   setStudents]   = useState<any[]>([]);
  const [subjects,   setSubjects]   = useState<any[]>([]);
  const [records,    setRecords]    = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [search,         setSearch]         = useState("");
  const [subjectFilter,  setSubjectFilter]  = useState("all");
  const [statusFilter,   setStatusFilter]   = useState("all");

  // ── Drill-down view ───────────────────────────────────────────────────────
  const [drillStudent,   setDrillStudent]   = useState<any>(null);
  const [drillRecords,   setDrillRecords]   = useState<any[]>([]);
  const [drillLoading,   setDrillLoading]   = useState(false);

  // ── Add record panel ──────────────────────────────────────────────────────
  const [showAdd,        setShowAdd]        = useState(false);
  const [addForm,        setAddForm]        = useState({ student_id: "", subject_id: "", date: new Date().toISOString().split("T")[0], status: "present" as StatusKey });
  const [adding,         setAdding]         = useState(false);

  // ── Sending warning ───────────────────────────────────────────────────────
  const [sending,        setSending]        = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const [{ data: studs }, { data: subs }, { data: att }] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, level, email").order("full_name"),
        supabase.from("subjects").select("id, title"),
        supabase.from("manual_attendance")
          .select("*, subjects(title), profiles:student_id(full_name, level)")
          .order("date", { ascending: false })
          .limit(2000),
      ]);
      setStudents(studs || []);
      setSubjects(subs || []);
      setRecords(att || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── Student → attendance summary ──────────────────────────────────────────
  const summary = useMemo(() => {
    const map = new Map<string, { name: string; level: string; present: number; late: number; absent: number; total: number }>();
    records.forEach(a => {
      if (subjectFilter !== "all" && a.subject_id !== subjectFilter) return;
      const s = students.find(st => st.user_id === a.student_id);
      const name  = a.profiles?.full_name || s?.full_name || "Unknown";
      const level = a.profiles?.level     || s?.level     || "";
      if (search && !name.toLowerCase().includes(search.toLowerCase())) return;
      if (!map.has(a.student_id)) {
        map.set(a.student_id, { name, level, present: 0, late: 0, absent: 0, total: 0 });
      }
      const e = map.get(a.student_id)!;
      e.total++;
      if (a.status === "present") e.present++;
      else if (a.status === "late") e.late++;
      else e.absent++;
    });

    return Array.from(map.entries())
      .map(([userId, d]) => ({
        userId,
        ...d,
        percentage: d.total > 0 ? Math.round(((d.present + d.late) / d.total) * 100) : 0,
      }))
      .filter(s => statusFilter === "all" || (statusFilter === "poor" && s.percentage < 60) || (statusFilter === "fair" && s.percentage >= 60 && s.percentage < 80) || (statusFilter === "good" && s.percentage >= 80))
      .sort((a, b) => a.percentage - b.percentage);
  }, [records, students, subjectFilter, search, statusFilter]);

  const poorCount = summary.filter(s => s.percentage < 60).length;

  // ── Drill-down: load one student's records ─────────────────────────────
  const openDrill = async (s: any) => {
    setDrillStudent(s);
    setDrillLoading(true);
    const { data } = await supabase
      .from("manual_attendance")
      .select("*, subjects(title)")
      .eq("student_id", s.userId)
      .order("date", { ascending: false });
    setDrillRecords(data || []);
    setDrillLoading(false);
  };

  // ── Inline edit a record ──────────────────────────────────────────────────
  const editRecord = async (id: string, newStatus: StatusKey) => {
    await supabase.from("manual_attendance").update({ status: newStatus }).eq("id", id);
    setDrillRecords(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    setRecords(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    toast({ title: t("Updated", "تم التحديث") });
  };

  // ── Add a manual record ───────────────────────────────────────────────────
  const addRecord = async () => {
    if (!addForm.student_id || !addForm.subject_id) {
      toast({ title: "Select student and subject", variant: "destructive" }); return;
    }
    setAdding(true);
    try {
      // Determine teacher_id from subject
      const sub = subjects.find(s => s.id === addForm.subject_id);
      const { data: subFull } = await supabase.from("subjects").select("teacher_id").eq("id", addForm.subject_id).maybeSingle();
      const teacherId = (subFull as any)?.teacher_id || "00000000-0000-0000-0000-000000000000";

      const { error } = await supabase.from("manual_attendance").insert({
        student_id: addForm.student_id,
        subject_id: addForm.subject_id,
        teacher_id: teacherId,
        date:       addForm.date,
        status:     addForm.status,
        session_id: null,
      });
      if (error) throw error;
      toast({ title: t("Record added", "تمت الإضافة") });
      setShowAdd(false);
      setAddForm({ student_id: "", subject_id: "", date: new Date().toISOString().split("T")[0], status: "present" });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  // ── Send warning ──────────────────────────────────────────────────────────
  const sendWarning = async (s: typeof summary[0]) => {
    setSending(s.userId);
    try {
      await supabase.from("notifications").insert({
        user_id: s.userId,
        title:   "⚠️ Attendance Warning",
        message: `Your attendance is currently at ${s.percentage}% (${s.present + s.late} of ${s.total} sessions). Please improve your attendance to avoid academic probation.`,
        type:    "warning",
        is_read: false,
      });
      toast({ title: t("Warning sent", "تم إرسال التحذير") });
    } catch (err: any) {
      toast({ title: "Error sending warning", description: err.message, variant: "destructive" });
    } finally {
      setSending(null);
    }
  };

  // ── Export CSV ────────────────────────────────────────────────────────────
  const exportCSV = () => {
    const rows = [["Student", "Level", "Present", "Late", "Absent", "Total", "Percentage"].join(",")];
    summary.forEach(s => rows.push([s.name, s.level, s.present, s.late, s.absent, s.total, `${s.percentage}%`].join(",")));
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "attendance-report.csv"; a.click();
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
      <Loader2 size={28} style={{ animation: "spin .8s linear infinite", color: G }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════
  // ── DRILL-DOWN VIEW ──────────────────────────────────────────────────────
  if (drillStudent) {
    const pct = drillStudent.percentage;
    const pctColor = pct < 60 ? "#DC2626" : pct < 80 ? "#D97706" : "#16A34A";
    return (
      <div style={{ padding: 16, maxWidth: 700, margin: "0 auto", fontFamily: "'Cairo', sans-serif" }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <button onClick={() => setDrillStudent(null)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: G, fontWeight: 700, fontSize: 13, marginBottom: 20 }}>
          <ChevronLeft size={16} /> {t("Back", "رجوع")}
        </button>

        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E5E7EB", padding: 20, marginBottom: 16, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: `linear-gradient(135deg,${G},#075E54)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{(drillStudent.name || "?")[0].toUpperCase()}</span>
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 900, fontSize: 16, color: "#111", margin: 0 }}>{drillStudent.name}</p>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>Level: {drillStudent.level || "—"}</p>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: pctColor }}>{pct}%</div>
            <div style={{ fontSize: 10, color: "#9CA3AF" }}>Attendance</div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[["present", drillStudent.present], ["late", drillStudent.late], ["absent", drillStudent.absent]].map(([st, count]: any) => {
            const cfg = STATUS_CFG[st as StatusKey];
            return (
              <div key={st} style={{ flex: 1, textAlign: "center", padding: "10px 4px", borderRadius: 12, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: cfg.color }}>{count}</div>
                <div style={{ fontSize: 10, color: cfg.color, fontWeight: 700 }}>{cfg.label}</div>
              </div>
            );
          })}
        </div>

        {drillLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Loader2 size={24} style={{ animation: "spin .8s linear infinite", color: G }} />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {drillRecords.map(r => {
              const cfg = STATUS_CFG[(r.status as StatusKey)] || STATUS_CFG.absent;
              return (
                <div key={r.id} style={{ background: "#fff", borderRadius: 12, border: `1.5px solid ${cfg.border}`, overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 700, fontSize: 12, color: "#111", margin: 0 }}>{(r.subjects as any)?.title || "—"}</p>
                      <p style={{ fontSize: 10, color: "#9CA3AF", margin: "2px 0 0" }}>
                        {new Date(r.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                    <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, fontWeight: 800 }}>{cfg.label}</span>
                  </div>
                  {/* Edit buttons */}
                  <div style={{ display: "flex", borderTop: `1px solid ${cfg.border}` }}>
                    {(["present", "late", "absent"] as StatusKey[]).map(st => {
                      const c = STATUS_CFG[st];
                      const sel = r.status === st;
                      return (
                        <button key={st} onClick={() => editRecord(r.id, st)} style={{
                          flex: 1, padding: "7px 4px", border: "none", cursor: "pointer",
                          background: sel ? c.bg : "#FAFAFA", color: sel ? c.color : "#9CA3AF",
                          fontWeight: sel ? 800 : 500, fontSize: 11,
                          borderRight: st !== "absent" ? "1px solid #F3F4F6" : "none",
                          transition: "all .12s",
                        }}>
                          {st === "present" ? <CheckCircle2 size={10} style={{ marginRight: 3, verticalAlign: "middle" }} /> : st === "late" ? <Clock size={10} style={{ marginRight: 3, verticalAlign: "middle" }} /> : <XCircle size={10} style={{ marginRight: 3, verticalAlign: "middle" }} />}
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {drillRecords.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF", fontSize: 13 }}>No records found</div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── MAIN VIEW ────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 16, maxWidth: 800, margin: "0 auto", fontFamily: "'Cairo', sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: G, margin: 0 }}>{t("Attendance", "الحضور")}</h1>
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: "2px 0 0" }}>{records.length} records · {summary.length} students tracked</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowAdd(v => !v)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${G},#075E54)`, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            <Plus size={13} /> Add Record
          </button>
          <button onClick={exportCSV} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", color: "#374151" }}>
            <Download size={13} /> CSV
          </button>
        </div>
      </div>

      {/* Add Record Panel */}
      {showAdd && (
        <div style={{ background: "#F0FDF4", borderRadius: 16, border: "1.5px solid #86EFAC", padding: 16, marginBottom: 16, animation: "fadeUp .3s ease" }}>
          <p style={{ fontWeight: 800, fontSize: 13, color: G, margin: "0 0 12px" }}>➕ Add Manual Attendance Record</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <select value={addForm.student_id} onChange={e => setAddForm(f => ({ ...f, student_id: e.target.value }))} style={{ ...inp, flex: "1 1 160px" }}>
              <option value="">Select Student…</option>
              {students.map(s => <option key={s.user_id} value={s.user_id}>{s.full_name || s.email}</option>)}
            </select>
            <select value={addForm.subject_id} onChange={e => setAddForm(f => ({ ...f, subject_id: e.target.value }))} style={{ ...inp, flex: "1 1 160px" }}>
              <option value="">Select Subject…</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
            <input type="date" value={addForm.date} max={new Date().toISOString().split("T")[0]} onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))} style={{ ...inp, flex: "1 1 130px" }} />
            <select value={addForm.status} onChange={e => setAddForm(f => ({ ...f, status: e.target.value as StatusKey }))} style={{ ...inp, flex: "1 1 110px" }}>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={addRecord} disabled={adding} style={{ flex: 2, padding: "10px", borderRadius: 10, border: "none", background: adding ? "#9CA3AF" : G, color: "#fff", fontWeight: 800, fontSize: 13, cursor: adding ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {adding ? <Loader2 size={13} style={{ animation: "spin .8s linear infinite" }} /> : <Save size={13} />} Save
            </button>
            <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#fff", color: "#374151", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
        {[
          { label: "Students Tracked", value: summary.length, color: G },
          { label: "Poor Attendance (<60%)", value: poorCount, color: "#DC2626" },
          { label: "Total Records", value: records.length, color: "#7C3AED" },
        ].map((stat, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 14, border: "1px solid #E5E7EB", padding: "14px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ position: "relative", flex: "2 1 180px" }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students…" style={{ ...inp, paddingLeft: 30, width: "100%" }} />
        </div>
        <select value={subjectFilter} onChange={e => setSubjectFilter(e.target.value)} style={{ ...inp, flex: "1 1 140px" }}>
          <option value="all">All Subjects</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inp, flex: "1 1 120px" }}>
          <option value="all">All Statuses</option>
          <option value="good">Good (≥80%)</option>
          <option value="fair">Fair (60–79%)</option>
          <option value="poor">Poor (&lt;60%)</option>
        </select>
      </div>

      {/* Poor attendance alerts */}
      {poorCount > 0 && (
        <div style={{ background: "#FEF2F2", borderRadius: 14, border: "1.5px solid #FECACA", padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <AlertTriangle size={14} color="#DC2626" />
            <span style={{ fontSize: 13, fontWeight: 800, color: "#DC2626" }}>{poorCount} students with poor attendance</span>
          </div>
          {summary.filter(s => s.percentage < 60).slice(0, 8).map(s => (
            <div key={s.userId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(220,38,38,.1)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{s.name}</span>
                <span style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 6 }}>{s.level}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 900, color: "#DC2626" }}>{s.percentage}%</span>
              <button
                onClick={() => sendWarning(s)}
                disabled={sending === s.userId}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, border: "1px solid #FECACA", background: "#fff", cursor: sending === s.userId ? "wait" : "pointer", fontSize: 11, fontWeight: 700, color: "#DC2626", opacity: sending === s.userId ? .5 : 1 }}
              >
                {sending === s.userId ? <Loader2 size={10} style={{ animation: "spin .8s linear infinite" }} /> : <Bell size={10} />}
                Warn
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Summary table */}
      {summary.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#9CA3AF" }}>
          <Users size={40} style={{ margin: "0 auto 12px", display: "block" }} />
          <p style={{ fontSize: 13 }}>No attendance records yet.</p>
          <p style={{ fontSize: 11, marginTop: 4 }}>Teachers can mark attendance in the Attendance section, or use Add Record above.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {summary.map(s => {
            const pct = s.percentage;
            const color = pct < 60 ? "#DC2626" : pct < 80 ? "#D97706" : "#16A34A";
            const bg    = pct < 60 ? "#FEF2F2" : pct < 80 ? "#FFFBEB" : "#F0FDF4";
            const bdr   = pct < 60 ? "#FECACA" : pct < 80 ? "#FDE68A" : "#86EFAC";
            return (
              <button
                key={s.userId}
                onClick={() => openDrill(s)}
                style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #E5E7EB", padding: "14px 16px", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, width: "100%", transition: "box-shadow .15s" }}
              >
                <div style={{ width: 42, height: 42, borderRadius: 11, background: `linear-gradient(135deg,${G},#075E54)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 17, fontWeight: 900, color: "#fff" }}>{(s.name || "?")[0].toUpperCase()}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 800, fontSize: 13, color: "#111", margin: 0 }}>{s.name}</p>
                  <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                    {s.level && <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: "#FFFBEB", color: "#92400E", border: "1px solid #FDE68A", fontWeight: 700 }}>{s.level}</span>}
                    <span style={{ fontSize: 10, color: "#16A34A" }}>✓ {s.present} present</span>
                    {s.late > 0 && <span style={{ fontSize: 10, color: "#D97706" }}>⏱ {s.late} late</span>}
                    <span style={{ fontSize: 10, color: "#DC2626" }}>✗ {s.absent} absent</span>
                    <span style={{ fontSize: 10, color: "#9CA3AF" }}>/ {s.total} total</span>
                  </div>
                </div>
                <div style={{ textAlign: "center", padding: "6px 12px", borderRadius: 10, background: bg, border: `1px solid ${bdr}`, flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color }}>{pct}%</div>
                  <div style={{ fontSize: 9, color, fontWeight: 700 }}>{pct < 60 ? "Poor" : pct < 80 ? "Fair" : "Good"}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AttendanceManagement;
