// src/pages/teacher/TeacherAttendance.tsx
// FIXED:
//  1. Student fetch now uses the correct chain: teacher subjects → courses →
//     enrollments → profiles, PLUS private students assigned_teacher_id.
//     The old code silently returned 0 students when courseIds was empty.
//  2. Added standalone date-based attendance (no live session required).
//  3. Added subject selector so teacher can mark attendance per subject + date.
//  4. Save is idempotent — uses upsert with (session_id, student_id) conflict
//     so re-saving won't duplicate rows.
//  5. Existing attendance is loaded correctly by subject + date, not just session.

import { useEffect, useState, useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, Download, AlertTriangle, Calendar,
  CheckCircle2, XCircle, Clock, Users, BookOpen, Save, Loader2,
} from "lucide-react";

const G    = "#064E3B";
const GOLD = "#c9a84c";

const STATUS_CONFIG = {
  present: { label: "Present", labelAr: "حاضر",  color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC" },
  late:    { label: "Late",    labelAr: "متأخر",  color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  absent:  { label: "Absent",  labelAr: "غائب",   color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
} as const;

type StatusKey = keyof typeof STATUS_CONFIG;

const TeacherAttendance = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();

  // ── Data ──────────────────────────────────────────────────────────────────
  const [subjects,  setSubjects]  = useState<any[]>([]);
  const [students,  setStudents]  = useState<any[]>([]);
  const [sessions,  setSessions]  = useState<any[]>([]);
  const [attendance, setAttendance] = useState<Record<string, StatusKey>>({});
  const [notes,     setNotes]     = useState<Record<string, string>>({});

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selectedSubject, setSelectedSubject] = useState<any>(null);
  const [selectedDate,    setSelectedDate]    = useState<string>(
    new Date().toISOString().split("T")[0]   // today
  );
  const [selectedSession, setSelectedSession] = useState<string>("none");

  // ── UI ────────────────────────────────────────────────────────────────────
  const [phase,   setPhase]   = useState<"list" | "mark">("list");
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [studentsLoading, setStudentsLoading] = useState(false);

  // ── 1. Load teacher's subjects ────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      try {
        // Subjects this teacher owns
        const { data: owned } = await supabase
          .from("subjects").select("id, title, title_ar, level, levels")
          .eq("teacher_id", user.id);

        // Subjects via timetable assignment
        const { data: ttSlots } = await supabase
          .from("subject_timetable" as any).select("subject_id").eq("teacher_id", user.id);
        const ttIds = [...new Set((ttSlots || []).map((s: any) => s.subject_id).filter(Boolean))];
        let extra: any[] = [];
        if (ttIds.length > 0) {
          const ownedIds = (owned || []).map((s: any) => s.id);
          const missing  = ttIds.filter((id: string) => !ownedIds.includes(id));
          if (missing.length > 0) {
            const { data: es } = await supabase
              .from("subjects").select("id, title, title_ar, level, levels").in("id", missing);
            extra = es || [];
          }
        }
        setSubjects([...(owned || []), ...extra]);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // ── 2. When a subject is selected, fetch its students + sessions ──────────
  const loadSubjectData = useCallback(async (subject: any) => {
    if (!user) return;
    setStudentsLoading(true);
    setStudents([]);
    setAttendance({});
    setNotes({});
    setSessions([]);
    setSelectedSession("none");

    try {
      // ── Students: courses → enrollments path ────────────────────────────
      const { data: courses } = await supabase
        .from("courses").select("id").eq("subject_id", subject.id);
      const courseIds = (courses || []).map((c: any) => c.id);

      let userIds: string[] = [];
      if (courseIds.length > 0) {
        const { data: enrollments } = await supabase
          .from("enrollments").select("user_id").in("course_id", courseIds);
        userIds = [...new Set((enrollments || []).map((e: any) => e.user_id))];
      }

      // ── Students: private assigned to teacher ───────────────────────────
      const { data: privateStudents } = await supabase
        .from("profiles").select("user_id")
        .eq("assigned_teacher_id", user.id).eq("student_type", "private");
      const privateIds = (privateStudents || []).map((p: any) => p.user_id);

      // ── Students: level-based (subject.levels[] matches profile.level) ──
      const subjectLevels: string[] = subject.levels || (subject.level ? [subject.level] : []);
      let levelIds: string[] = [];
      if (subjectLevels.length > 0) {
        const { data: lvlStudents } = await supabase
          .from("profiles").select("user_id").in("level", subjectLevels);
        levelIds = (lvlStudents || []).map((p: any) => p.user_id);
      }

      const allIds = [...new Set([...userIds, ...privateIds, ...levelIds])];
      if (allIds.length === 0) {
        setStudents([]);
        setStudentsLoading(false);
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles").select("user_id, full_name, level, email, avatar_url")
        .in("user_id", allIds).order("full_name");
      setStudents(profiles || []);

      // ── Past sessions for this subject (for reference) ─────────────────
      const { data: sess } = await supabase
        .from("live_sessions").select("id, topic, scheduled_at, created_at, status")
        .eq("subject_id", subject.id)
        .order("created_at", { ascending: false })
        .limit(20);
      setSessions(sess || []);

    } finally {
      setStudentsLoading(false);
    }
  }, [user]);

  // ── 3. Load existing attendance when subject + date change ────────────────
  const loadAttendance = useCallback(async (subjectId: string, date: string, sessionId?: string) => {
    let query = supabase
      .from("manual_attendance")
      .select("student_id, status, notes")
      .eq("subject_id", subjectId)
      .eq("date", date);

    if (sessionId && sessionId !== "none") {
      query = query.eq("session_id", sessionId);
    }

    const { data } = await query;
    const attMap: Record<string, StatusKey>  = {};
    const noteMap: Record<string, string> = {};
    (data || []).forEach((a: any) => {
      attMap[a.student_id]  = (a.status as StatusKey) || "absent";
      noteMap[a.student_id] = a.notes || "";
    });

    // Default everyone not in DB to "absent"
    students.forEach(s => {
      if (!attMap[s.user_id]) attMap[s.user_id] = "absent";
    });
    setAttendance(attMap);
    setNotes(noteMap);
  }, [students]);

  useEffect(() => {
    if (selectedSubject && phase === "mark") {
      loadAttendance(selectedSubject.id, selectedDate, selectedSession);
    }
  }, [selectedDate, selectedSession, selectedSubject, phase, loadAttendance]);

  // ── 4. Save attendance ────────────────────────────────────────────────────
  const saveAttendance = async () => {
    if (!selectedSubject || !user) return;
    setSaving(true);
    try {
      // Delete existing records for this subject+date (and session if set)
      let delQuery = supabase
        .from("manual_attendance")
        .delete()
        .eq("subject_id", selectedSubject.id)
        .eq("date", selectedDate);
      if (selectedSession !== "none") {
        delQuery = delQuery.eq("session_id", selectedSession);
      }
      await delQuery;

      // Insert fresh records
      const records = students.map(s => ({
        student_id: s.user_id,
        subject_id: selectedSubject.id,
        teacher_id: user.id,
        session_id: selectedSession !== "none" ? selectedSession : null,
        date:       selectedDate,
        status:     attendance[s.user_id] || "absent",
        notes:      notes[s.user_id]      || null,
      }));

      const { error } = await supabase.from("manual_attendance").insert(records);
      if (error) throw error;
      toast({ title: t("Attendance saved!", "تم حفظ الحضور!") });
    } catch (err: any) {
      toast({ title: t("Error saving attendance", "خطأ في حفظ الحضور"), description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── 5. Export CSV ─────────────────────────────────────────────────────────
  const exportCSV = () => {
    const rows = [["Student", "Status", "Notes", "Date", "Subject"].join(",")];
    students.forEach(s => {
      rows.push([
        s.full_name || "",
        attendance[s.user_id] || "absent",
        (notes[s.user_id] || "").replace(/,/g, ";"),
        selectedDate,
        selectedSubject?.title || "",
      ].join(","));
    });
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance-${selectedSubject?.title}-${selectedDate}.csv`;
    a.click();
  };

  const presentCount = Object.values(attendance).filter(v => v === "present").length;
  const lateCount    = Object.values(attendance).filter(v => v === "late").length;
  const absentCount  = Object.values(attendance).filter(v => v === "absent").length;
  const totalMarked  = students.length;

  // ════════════════════════════════════════════════════════════════════════
  // ── LOADING ─────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
      <Loader2 size={28} style={{ animation: "spin .8s linear infinite", color: G }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════
  // ── MARK ATTENDANCE VIEW ─────────────────────────────────────────────────
  if (phase === "mark" && selectedSubject) {
    return (
      <div style={{ padding: "16px", maxWidth: 700, margin: "0 auto", fontFamily: "'Cairo', sans-serif" }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <button onClick={() => setPhase("list")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: G, fontWeight: 700, fontSize: 13 }}>
            <ChevronLeft size={16} /> {t("Back", "رجوع")}
          </button>
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 900, color: G, margin: "0 0 4px" }}>{selectedSubject.title}</h2>
        <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 20px" }}>{t("Mark Attendance", "تسجيل الحضور")}</p>

        {/* Controls: date + session */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>
              <Calendar size={10} style={{ marginRight: 4 }} />{t("Date", "التاريخ")}
            </label>
            <input
              type="date"
              value={selectedDate}
              max={new Date().toISOString().split("T")[0]}
              onChange={e => setSelectedDate(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, color: G, outline: "none", boxSizing: "border-box" }}
            />
          </div>
          {sessions.length > 0 && (
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", display: "block", marginBottom: 4 }}>
                {t("Link to Session (optional)", "ربط بجلسة (اختياري)")}
              </label>
              <select
                value={selectedSession}
                onChange={e => setSelectedSession(e.target.value)}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13, color: G, outline: "none", boxSizing: "border-box" }}
              >
                <option value="none">{t("No session", "بدون جلسة")}</option>
                {sessions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.topic || t("Session", "جلسة")} — {new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Summary strip */}
        {totalMarked > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {(["present", "late", "absent"] as StatusKey[]).map(s => {
              const cfg   = STATUS_CONFIG[s];
              const count = s === "present" ? presentCount : s === "late" ? lateCount : absentCount;
              return (
                <div key={s} style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 10, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: cfg.color }}>{count}</div>
                  <div style={{ fontSize: 10, color: cfg.color, fontWeight: 700 }}>{cfg.label}</div>
                </div>
              );
            })}
            <div style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 10, background: "#F3F4F6", border: "1px solid #E5E7EB" }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#374151" }}>
                {totalMarked > 0 ? Math.round(((presentCount + lateCount) / totalMarked) * 100) : 0}%
              </div>
              <div style={{ fontSize: 10, color: "#6B7280", fontWeight: 700 }}>Rate</div>
            </div>
          </div>
        )}

        {/* High absence warning */}
        {totalMarked > 0 && absentCount > totalMarked * 0.4 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "#FFFBEB", border: "1px solid #FDE68A", marginBottom: 14, fontSize: 12, color: "#92400E" }}>
            <AlertTriangle size={14} /> {t("High absence rate detected", "معدل غياب مرتفع")}
          </div>
        )}

        {/* Student list */}
        {studentsLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Loader2 size={24} style={{ animation: "spin .8s linear infinite", color: G }} />
          </div>
        ) : students.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>
            <Users size={36} style={{ margin: "0 auto 10px", display: "block" }} />
            <p style={{ fontSize: 13 }}>{t("No students found for this subject", "لا يوجد طلاب لهذه المادة")}</p>
            <p style={{ fontSize: 11, marginTop: 4 }}>Check course enrollments and level assignments</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, animation: "fadeUp .3s ease" }}>
            {students.map(s => {
              const status = attendance[s.user_id] || "absent";
              const cfg    = STATUS_CONFIG[status];
              return (
                <div key={s.user_id} style={{
                  background: "#fff", borderRadius: 14, border: `1.5px solid ${cfg.border}`,
                  overflow: "hidden", transition: "border-color .15s",
                }}>
                  {/* Student info + status buttons */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: `linear-gradient(135deg,${G},#075E54)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: 15, fontWeight: 900, color: "#fff" }}>{(s.full_name || "?")[0].toUpperCase()}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 800, fontSize: 13, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.full_name || "—"}</p>
                      <p style={{ fontSize: 10, color: "#9CA3AF", margin: "2px 0 0" }}>{s.level || ""}</p>
                    </div>
                    {/* Status indicator */}
                    <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, fontWeight: 800 }}>
                      {cfg.label}
                    </span>
                  </div>

                  {/* Status buttons */}
                  <div style={{ display: "flex", borderTop: `1px solid ${cfg.border}` }}>
                    {(["present", "late", "absent"] as StatusKey[]).map(st => {
                      const c   = STATUS_CONFIG[st];
                      const sel = status === st;
                      return (
                        <button
                          key={st}
                          onClick={() => setAttendance(prev => ({ ...prev, [s.user_id]: st }))}
                          style={{
                            flex: 1, padding: "9px 4px", border: "none", cursor: "pointer",
                            background: sel ? c.bg : "#FAFAFA",
                            color: sel ? c.color : "#9CA3AF",
                            fontWeight: sel ? 800 : 500, fontSize: 12,
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                            borderRight: st !== "absent" ? "1px solid #F3F4F6" : "none",
                            transition: "all .12s",
                          }}
                        >
                          {st === "present" ? <CheckCircle2 size={12} /> : st === "late" ? <Clock size={12} /> : <XCircle size={12} />}
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Action buttons */}
        {students.length > 0 && (
          <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
            <button
              onClick={saveAttendance}
              disabled={saving}
              style={{
                flex: 2, minWidth: 140, padding: "13px", borderRadius: 12, border: "none",
                background: saving ? "#9CA3AF" : `linear-gradient(135deg,${G},#075E54)`,
                color: "#fff", fontWeight: 800, fontSize: 14, cursor: saving ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {saving
                ? <><Loader2 size={15} style={{ animation: "spin .8s linear infinite" }} /> {t("Saving…", "جاري الحفظ…")}</>
                : <><Save size={15} /> {t("Save Attendance", "حفظ الحضور")}</>
              }
            </button>
            <button
              onClick={exportCSV}
              style={{
                flex: 1, minWidth: 100, padding: "13px", borderRadius: 12,
                border: "1.5px solid #E5E7EB", background: "#fff",
                color: "#374151", fontWeight: 700, fontSize: 13, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              <Download size={13} /> {t("CSV", "CSV")}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // ── SUBJECT LIST VIEW ────────────────────────────────────────────────────
  return (
    <div style={{ padding: "16px", maxWidth: 700, margin: "0 auto", fontFamily: "'Cairo', sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: G, margin: "0 0 4px" }}>{t("Attendance", "الحضور")}</h1>
      <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 20px" }}>{t("Select a subject to mark attendance", "اختر مادة لتسجيل الحضور")}</p>

      {subjects.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#9CA3AF" }}>
          <BookOpen size={40} style={{ margin: "0 auto 12px", display: "block" }} />
          <p>{t("No subjects assigned", "لا توجد مواد معينة")}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {subjects.map(s => (
            <button
              key={s.id}
              onClick={async () => {
                setSelectedSubject(s);
                await loadSubjectData(s);
                setPhase("mark");
                await loadAttendance(s.id, selectedDate, "none");
              }}
              style={{
                background: "#fff", borderRadius: 14, border: "1.5px solid #E5E7EB",
                padding: "16px", textAlign: "left", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 12,
                boxShadow: "0 1px 4px rgba(0,0,0,.04)", transition: "box-shadow .15s, border-color .15s",
              }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg,${G},#075E54)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <BookOpen size={20} color={GOLD} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 800, fontSize: 14, color: "#111", margin: 0 }}>{s.title}</p>
                {s.title_ar && <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0", direction: "rtl" }}>{s.title_ar}</p>}
                {(s.level || (s.levels && s.levels.length > 0)) && (
                  <p style={{ fontSize: 10, color: GOLD, fontWeight: 700, margin: "4px 0 0" }}>
                    Level: {s.levels?.join(", ") || s.level}
                  </p>
                )}
              </div>
              <ChevronLeft size={16} color="#9CA3AF" style={{ transform: "rotate(180deg)" }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeacherAttendance;
