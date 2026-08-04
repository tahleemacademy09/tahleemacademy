/*
  src/pages/student/LiveNow.tsx — Tahleem Academy
  ──────────────────────────────────────────────────────────
  Separate nav item alongside Jadwal (Timetable). Shows ONLY classes that
  are ACTUALLY live right now (live_sessions.status === "live") — ground
  truth from the room itself, not a schedule-time guess like the "LIVE"
  badges on the Timetable page. Empty state when nothing is live.

  Respects the same access rules used everywhere else in the app:
    • Admin/teacher (isPrivileged) see every live session, unfiltered.
    • General students only see sessions whose level matches theirs
      (or has no level / "all").
    • Private students only see sessions for subjects assigned to them,
      unless their admin has toggled allow_general_access on.

  Join re-uses the SAME global LiveClassContext every other "Join" button
  in the app uses — tapping Join here opens the classroom overlay
  immediately, from wherever the student is standing.
*/

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePrivateStudent } from "@/hooks/usePrivateStudent";
import { useLiveClass } from "@/contexts/LiveClassContext";
import { Video, Radio, Users, UserCheck, Sparkles } from "lucide-react";

const G    = "#0f2d1f";
const GM   = "#1a4731";
const GOLD = "#c9a84c";

// ─── Live Class Card ────────────────────────────────────────────────────────
function LiveClassCard({
  session, subject, teacherName, onJoin, t, language,
}: {
  session: any; subject: any; teacherName?: string;
  onJoin: () => void; t: any; language: string;
}) {
  const title = language === "ar" ? subject?.title_ar || subject?.title : subject?.title;

  return (
    <div style={{
      background: "#fff", borderRadius: 18,
      border: "1.5px solid #DC2626",
      padding: "16px", display: "flex", gap: 14, alignItems: "center",
      boxShadow: "0 0 0 3px #DC262622, 0 2px 10px rgba(0,0,0,.05)",
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14, flexShrink: 0,
        background: `linear-gradient(135deg,${G},${GM})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}>
        {subject?.image_url
          ? <img src={subject.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <Video style={{ width: 22, height: 22, color: GOLD }} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 9, fontWeight: 900, padding: "2px 7px", borderRadius: 9,
            background: "#FEE2E2", color: "#DC2626",
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%", background: "#DC2626",
              animation: "pulse 1.2s ease-in-out infinite",
            }} />
            {t("LIVE", "مباشر")}
          </span>
          {typeof session.participant_count === "number" && session.participant_count > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "#9ca3af", fontWeight: 700 }}>
              <Users style={{ width: 10, height: 10 }} /> {session.participant_count}
            </span>
          )}
        </div>
        <p style={{ fontSize: 14, fontWeight: 800, color: G, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title || t("Live Class", "حصة مباشرة")}
        </p>
        {session.topic && (
          <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {session.topic}
          </p>
        )}
        {teacherName && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#6b7280", fontSize: 11, marginTop: 4 }}>
            <UserCheck style={{ width: 10, height: 10 }} /> {teacherName}
          </div>
        )}
      </div>

      <button onClick={onJoin} style={{
        display: "flex", alignItems: "center", gap: 6, padding: "11px 16px",
        borderRadius: 13, border: "none", background: "#DC2626", color: "#fff",
        fontSize: 12, fontWeight: 900, cursor: "pointer", flexShrink: 0,
      }}>
        <Video style={{ width: 13, height: 13 }} /> {t("Join", "انضمام")}
      </button>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function LiveNow() {
  const { user, profile, hasRole } = useAuth();
  const { t, language }            = useLanguage();
  const navigate                   = useNavigate();
  const { joinClass }              = useLiveClass();
  const { isPrivateStudent, allowGeneralAccess } = usePrivateStudent();

  const isPrivileged = hasRole("admin") || hasRole("teacher");
  const studentLevel = (profile as any)?.level || (profile as any)?.course_level || "beginner";
  const needsSubjectRestriction = isPrivateStudent && !allowGeneralAccess && !isPrivileged;

  // ── 1. Live sessions — ground truth, polled every 5s ──────────────────────
  const { data: liveSessions, isLoading: loadingSessions } = useQuery({
    queryKey: ["live-now-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_sessions")
        .select("*")
        .eq("status", "live")
        .order("started_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 5000,
  });

  // ── 2. Subjects for the live sessions we got back ─────────────────────────
  const subjectIds = useMemo(
    () => [...new Set((liveSessions || []).map((s: any) => s.subject_id).filter(Boolean))],
    [liveSessions]
  );

  const { data: subjects } = useQuery({
    queryKey: ["live-now-subjects", subjectIds],
    enabled: subjectIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("subjects")
        .select("id, title, title_ar, image_url")
        .in("id", subjectIds);
      return data || [];
    },
  });
  const subjectMap = useMemo(() => {
    const m: Record<string, any> = {};
    (subjects || []).forEach((s: any) => { m[s.id] = s; });
    return m;
  }, [subjects]);

  // ── 3. Teacher names for the hosts of those sessions ───────────────────────
  const hostIds = useMemo(
    () => [...new Set((liveSessions || []).map((s: any) => s.host_id).filter(Boolean))],
    [liveSessions]
  );
  const { data: teachers } = useQuery({
    queryKey: ["live-now-teachers", hostIds],
    enabled: hostIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", hostIds);
      return data || [];
    },
  });
  const teacherMap = useMemo(() => {
    const m: Record<string, string> = {};
    (teachers || []).forEach((tc: any) => { m[tc.user_id] = tc.full_name; });
    return m;
  }, [teachers]);

  // ── 4. Private students: which subjects are they assigned to? ─────────────
  const { data: privateSubjectIds } = useQuery({
    queryKey: ["live-now-private-subjects", user?.id],
    enabled: needsSubjectRestriction && !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("private_student_subjects" as any)
        .select("subject_id")
        .eq("student_id", user!.id);
      return new Set((data || []).map((r: any) => r.subject_id));
    },
  });

  // ── 5. Filter down to sessions this student is actually allowed to see ────
  const visibleSessions = (liveSessions || []).filter((s: any) => {
    if (isPrivileged) return true;
    if (needsSubjectRestriction) {
      if (!privateSubjectIds) return false; // still loading — don't flash unauthorized rows
      return privateSubjectIds.has(s.subject_id);
    }
    if (!s.level || s.level === "all") return true;
    return s.level === studentLevel;
  });

  const handleJoin = (session: any) => {
    const subject = subjectMap[session.subject_id];
    if (!subject) { navigate(`/student/live-classes?subject=${session.subject_id}&autoJoin=true`); return; }
    joinClass(subject);
  };

  const isLoading = loadingSessions || (needsSubjectRestriction && privateSubjectIds === undefined);

  return (
    <div style={{ fontFamily: "'Cairo', sans-serif", background: "#f8fafb", minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
      `}</style>

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg,${G},${GM})`, padding: "20px 18px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
          <Radio style={{ width: 22, height: 22, color: "#F87171" }} />
          <h1 style={{ fontSize: 21, fontWeight: 900, color: "#fff", margin: 0 }}>{t("Live Now", "مباشر الآن")}</h1>
        </div>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,.5)", margin: 0 }}>
          {t("Classes happening right now — tap Join to enter", "الحصص الجارية الآن — اضغط انضمام للدخول")}
        </p>
      </div>

      <div style={{ padding: "16px", maxWidth: 720, margin: "0 auto" }}>
        {isLoading ? (
          <div style={{ textAlign: "center", padding: 50, color: "#9ca3af" }}>{t("Loading…", "جارٍ التحميل…")}</div>
        ) : visibleSessions.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 18, padding: "60px 20px", textAlign: "center", border: "1px solid #e5e7eb" }}>
            <Sparkles style={{ width: 40, height: 40, color: "#d1d5db", margin: "0 auto 12px" }} />
            <p style={{ color: "#6b7280", fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>
              {t("Nothing live right now", "لا توجد حصة مباشرة حالياً")}
            </p>
            <p style={{ color: "#9ca3af", fontSize: 12, margin: 0 }}>
              {t("Check your Jadwal for upcoming classes.", "راجع الجدول الدراسي لمعرفة الحصص القادمة.")}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {visibleSessions.map((session: any) => (
              <LiveClassCard
                key={session.id}
                session={session}
                subject={subjectMap[session.subject_id]}
                teacherName={session.host_id ? teacherMap[session.host_id] : undefined}
                onJoin={() => handleJoin(session)}
                t={t}
                language={language}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
