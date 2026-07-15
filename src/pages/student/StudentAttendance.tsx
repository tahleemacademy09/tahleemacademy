/*
  src/pages/student/StudentAttendance.tsx — Tahleem Academy
  ──────────────────────────────────────────────────────────
  Read-only view of the student's own attendance record, sourced from
  manual_attendance (the teacher-confirmed record — now auto-prefilled
  from live-class join data, see syncManualAttendanceFromSession).

  RLS already allows this: "Students can view own attendance" on
  manual_attendance (student_id = auth.uid()).
*/

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { CheckCircle2, XCircle, Clock, CalendarDays, TrendingUp } from "lucide-react";

const G      = "#0f2d1f";
const GOLD   = "#c9a84c";
const CREAM  = "#faf6ee";
const BORDER = "rgba(15,45,31,0.1)";
const TL     = "#7a9e88";

const STATUS_CONFIG = {
  present: { color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC", icon: CheckCircle2 },
  late:    { color: "#D97706", bg: "#FFFBEB", border: "#FDE68A", icon: Clock },
  absent:  { color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", icon: XCircle },
} as const;
type StatusKey = keyof typeof STATUS_CONFIG;

const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-NG", { weekday: "short", day: "2-digit", month: "short" });

const StudentAttendance = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [subjectFilter, setSubjectFilter] = useState<string>("all");

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["student-attendance", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("manual_attendance")
        .select("id, date, status, notes, subject_id, subjects(title, title_ar)")
        .eq("student_id", user!.id)
        .order("date", { ascending: false })
        .limit(200);
      return (data || []) as any[];
    },
  });

  const subjects = useMemo(() => {
    const map = new Map<string, string>();
    records.forEach(r => { if (r.subject_id) map.set(r.subject_id, r.subjects?.title || t("Subject", "المادة")); });
    return [...map.entries()];
  }, [records, t]);

  const filtered = subjectFilter === "all" ? records : records.filter(r => r.subject_id === subjectFilter);

  const stats = useMemo(() => {
    const present = filtered.filter(r => r.status === "present").length;
    const late    = filtered.filter(r => r.status === "late").length;
    const absent  = filtered.filter(r => r.status === "absent").length;
    const total   = filtered.length;
    const rate    = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return { present, late, absent, total, rate };
  }, [filtered]);

  return (
    <div style={{ padding: "16px", maxWidth: 700, margin: "0 auto", fontFamily: "'Cairo', sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, color: G, margin: "0 0 4px" }}>
        {t("My Attendance", "سجل الحضور")}
      </h1>
      <p style={{ fontSize: 12, color: TL, margin: "0 0 20px" }}>
        {t("Auto-detected from live classes, confirmed by your teacher", "يُكتشف تلقائيًا من الحصص المباشرة، ويؤكده معلمك")}
      </p>

      {/* Summary */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["present", "late", "absent"] as StatusKey[]).map(s => {
          const cfg   = STATUS_CONFIG[s];
          const count = s === "present" ? stats.present : s === "late" ? stats.late : stats.absent;
          const label = s === "present" ? t("Present", "حاضر") : s === "late" ? t("Late", "متأخر") : t("Absent", "غائب");
          return (
            <div key={s} style={{ flex: 1, textAlign: "center", padding: "10px 4px", borderRadius: 12, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: cfg.color }}>{count}</div>
              <div style={{ fontSize: 10, color: cfg.color, fontWeight: 700 }}>{label}</div>
            </div>
          );
        })}
        <div style={{ flex: 1, textAlign: "center", padding: "10px 4px", borderRadius: 12, background: CREAM, border: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: G, display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
            <TrendingUp size={13} />{stats.rate}%
          </div>
          <div style={{ fontSize: 10, color: G, fontWeight: 700 }}>{t("Rate", "المعدل")}</div>
        </div>
      </div>

      {/* Subject filter */}
      {subjects.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
          <button
            onClick={() => setSubjectFilter("all")}
            style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
              cursor: "pointer", border: `1.5px solid ${subjectFilter === "all" ? G : BORDER}`,
              background: subjectFilter === "all" ? G : "#fff", color: subjectFilter === "all" ? "#fff" : G,
            }}
          >
            {t("All Subjects", "كل المواد")}
          </button>
          {subjects.map(([id, title]) => (
            <button
              key={id}
              onClick={() => setSubjectFilter(id)}
              style={{
                padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                cursor: "pointer", border: `1.5px solid ${subjectFilter === id ? G : BORDER}`,
                background: subjectFilter === id ? G : "#fff", color: subjectFilter === id ? "#fff" : G,
              }}
            >
              {title}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: 40, color: TL }}>{t("Loading…", "جاري التحميل…")}</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", background: "#fff", borderRadius: 18, border: `1px dashed ${BORDER}` }}>
          <CalendarDays size={36} style={{ margin: "0 auto 10px", display: "block", opacity: 0.3, color: G }} />
          <p style={{ fontSize: 14, color: TL, margin: 0 }}>{t("No attendance records yet", "لا توجد سجلات حضور بعد")}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(r => {
            const cfg = STATUS_CONFIG[(r.status as StatusKey) || "absent"];
            const Icon = cfg.icon;
            return (
              <div key={r.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                background: "#fff", borderRadius: 14, border: `1.5px solid ${cfg.border}`,
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={16} color={cfg.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.subjects?.title || t("Subject", "المادة")}
                  </p>
                  <p style={{ fontSize: 11, color: TL, margin: "2px 0 0" }}>{fmtDate(r.date)}{r.notes ? ` · ${r.notes}` : ""}</p>
                </div>
                <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, fontWeight: 800, flexShrink: 0 }}>
                  {r.status === "present" ? t("Present", "حاضر") : r.status === "late" ? t("Late", "متأخر") : t("Absent", "غائب")}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentAttendance;
