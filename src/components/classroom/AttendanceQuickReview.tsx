/*  src/components/classroom/AttendanceQuickReview.tsx
    Pops up for the teacher/admin the instant a live class ends, so attendance
    gets marked while it's fresh instead of via a notification they might not
    see until later. Pre-checks students who actually joined the room
    (class_participants — ground truth from the live session), teacher can
    flip anyone before saving. Writes straight to `manual_attendance`
    (same table/shape as TeacherAttendance.tsx and syncManualAttendanceFromSession).
*/

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { CheckCircle2, Circle, Loader2, X, Users } from "lucide-react";

const G = "#0f2d1f";
const GOLD = "#c9a84c";
const BORDER = "rgba(15,45,31,0.1)";

interface Props {
  sessionId: string;
  subject: any;
  onDone: () => void;
}

interface Row {
  student_id: string;
  full_name: string;
  avatar_url?: string | null;
  present: boolean;
}

const AttendanceQuickReview = ({ sessionId, subject, onDone }: Props) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!sessionId || !subject?.id) { setLoading(false); return; }
      const subjectId = subject.id;
      const teacherId = subject.teacher_id || user?.id;

      // Ground truth: who actually joined this live session.
      // class_participants is the primary source, but it can come back empty
      // (RLS on the teacher's read path, or a student whose bookkeeping write
      // failed while the call itself worked), which used to render the sheet as
      // "no student attended". attendance_logs is written on the same join, so
      // we merge both and only trust "nobody joined" when both are empty.
      const [{ data: participants, error: pErr }, { data: attLogs, error: aErr }] = await Promise.all([
        supabase.from("class_participants").select("student_id").eq("session_id", sessionId),
        supabase.from("attendance_logs").select("user_id").eq("session_id", sessionId),
      ]);
      if (pErr) console.warn("[AttendanceQuickReview] class_participants:", pErr.message);
      if (aErr) console.warn("[AttendanceQuickReview] attendance_logs:", aErr.message);
      const joinedIds = new Set<string>([
        ...(participants || []).map((p: any) => p.student_id),
        ...(attLogs || []).map((a: any) => a.user_id),
      ].filter(Boolean));

      // Full roster for this subject (enrolled + level-matched + private students)
      const { data: courses } = await supabase.from("courses").select("id").eq("subject_id", subjectId);
      const courseIds = (courses || []).map((c: any) => c.id);
      let enrolledIds: string[] = [];
      if (courseIds.length > 0) {
        const { data: enr } = await supabase.from("enrollments").select("user_id").in("course_id", courseIds);
        enrolledIds = [...new Set((enr || []).map((e: any) => e.user_id))];
      }
      const { data: privateStudents } = await supabase
        .from("profiles").select("user_id").eq("assigned_teacher_id", teacherId).eq("student_type", "private");
      const privateIds = (privateStudents || []).map((p: any) => p.user_id);
      const subjectLevels: string[] = subject.levels?.length ? subject.levels : (subject.level ? [subject.level] : []);
      let levelIds: string[] = [];
      if (subjectLevels.length > 0) {
        // No role filter here — some profiles rows have a null/legacy role and
        // were silently dropped, emptying the roster for whole levels.
        const { data: lvl } = await supabase.from("profiles").select("user_id").in("level", subjectLevels);
        levelIds = (lvl || []).map((p: any) => p.user_id);
      }
      const rosterIds = [...new Set([...enrolledIds, ...privateIds, ...levelIds, ...joinedIds])]
        .filter(id => id && id !== teacherId);   // never list the teacher as a student
      if (rosterIds.length === 0) { if (!cancelled) { setRows([]); setLoading(false); } return; }

      const { data: profiles, error: profErr } = await supabase
        .from("profiles").select("user_id, full_name, avatar_url").in("user_id", rosterIds);
      if (profErr) console.warn("[AttendanceQuickReview] profiles:", profErr.message);

      const nameById = new Map<string, any>((profiles || []).map((p: any) => [p.user_id, p]));
      // Build from rosterIds (not the profiles result) so a student whose
      // profile row isn't readable still shows up and can be marked present.
      const built: Row[] = rosterIds
        .map((id) => {
          const p = nameById.get(id);
          return {
            student_id: id,
            full_name: p?.full_name || (joinedIds.has(id) ? `Student ${id.slice(0, 6)}` : "Student"),
            avatar_url: p?.avatar_url ?? null,
            present: joinedIds.has(id),
          };
        })
        .sort((a, b) => Number(b.present) - Number(a.present) || a.full_name.localeCompare(b.full_name));

      if (!cancelled) { setRows(built); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [sessionId, subject, user]);

  const toggle = (id: string) => setRows(rs => rs.map(r => r.student_id === id ? { ...r, present: !r.present } : r));
  const presentCount = rows.filter(r => r.present).length;

  const save = async () => {
    if (!subject?.id || !user) return;
    setSaving(true);
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const teacherId = subject.teacher_id || user.id;
      const records = rows.map(r => ({
        session_id: sessionId, subject_id: subject.id, teacher_id: teacherId,
        student_id: r.student_id, date: todayStr, status: r.present ? "present" : "absent",
      }));
      if (records.length > 0) {
        await supabase.from("manual_attendance").upsert(records, { onConflict: "session_id,student_id" });
      }
    } finally {
      setSaving(false);
      onDone();
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 480, maxHeight: "84vh", background: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ background: G, padding: "18px 20px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#fff", fontWeight: 800, fontSize: 16 }}>
              <Users size={17} color={GOLD} />
              {t("Mark Attendance", "تسجيل الحضور")}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.65)", marginTop: 2 }}>
              {subject?.title || t("Class", "الحصة")} — {t("just ended", "انتهت للتو")}
            </div>
          </div>
          <button onClick={onDone} style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,.15)", border: "none", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ padding: "10px 20px", borderBottom: `1px solid ${BORDER}`, fontSize: 12.5, color: "#4a7c59", flexShrink: 0 }}>
          {loading
            ? t("Loading roster...", "جارٍ تحميل القائمة...")
            : t(`${presentCount} of ${rows.length} marked present — tap a name to change it`, `${presentCount} من ${rows.length} حاضر — اضغط على الاسم للتغيير`)}
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
              <Loader2 className="animate-spin" size={24} color={GOLD} />
            </div>
          ) : rows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#9CA3AF", fontSize: 13 }}>
              {t("No students found for this subject.", "لم يتم العثور على طلاب لهذه المادة.")}
            </div>
          ) : rows.map(r => (
            <button key={r.student_id} onClick={() => toggle(r.student_id)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", border: "none", borderBottom: `1px solid #F9FAFB`, background: r.present ? "#F0FDF4" : "#fff", cursor: "pointer", textAlign: "left" }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: r.present ? "#DCFCE7" : "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: r.present ? "#16A34A" : "#9CA3AF", flexShrink: 0 }}>
                {r.full_name[0]?.toUpperCase() || "S"}
              </div>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: G }}>{r.full_name}</span>
              {r.present ? <CheckCircle2 size={20} color="#16A34A" /> : <Circle size={20} color="#D1D5DB" />}
            </button>
          ))}
        </div>

        <div style={{ padding: "14px 20px", borderTop: `1px solid ${BORDER}`, flexShrink: 0, display: "flex", gap: 10 }}>
          <button onClick={onDone} style={{ flex: 1, padding: "13px", borderRadius: 13, border: `1.5px solid ${BORDER}`, background: "#fff", fontWeight: 700, fontSize: 13.5, color: "#6B7280", cursor: "pointer" }}>
            {t("Skip for now", "تخطي الآن")}
          </button>
          <button onClick={save} disabled={saving || loading} style={{ flex: 2, padding: "13px", borderRadius: 13, border: "none", background: G, color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: saving || loading ? .7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {saving && <Loader2 className="animate-spin" size={15} />}
            {saving ? t("Saving...", "جارٍ الحفظ...") : t("Save Attendance", "حفظ الحضور")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AttendanceQuickReview;
