// src/pages/teacher/TeacherDashboard.tsx
// Professional redesign matching student dashboard's green-gold aesthetic
// FIX: Today's Schedule now queries subject_timetable (recurring) + host_id live_sessions
//      so admin-assigned/timetabled classes always surface correctly.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  Users, UserCheck, BookOpen, Video, FileText, ClipboardList,
  Clock, BarChart, CheckSquare, Calendar, ChevronRight,
  Mic, GraduationCap, MessageSquare, Radio, Trophy, Star,
  AlertTriangle, CheckCircle, XCircle, Bell, TrendingUp, Megaphone,
} from "lucide-react";

// ── Theme ──────────────────────────────────────────────────────────────────
const G     = "#0f2d1f";
const GM    = "#1a4731";
const GOLD  = "#c9a84c";
const CREAM = "#faf6ee";

// ── Islamic teacher-specific verses ────────────────────────────────────────
const TEACHER_VERSES = [
  { ar: "خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ", en: "The best of you are those who learn the Quran and teach it.", ref: "Hadith — Bukhari" },
  { ar: "مَن سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا سَهَّلَ اللهُ لَهُ طَرِيقًا إِلَى الْجَنَّةِ", en: "Whoever takes a path seeking knowledge, Allah will ease for him the path to Paradise.", ref: "Hadith — Muslim" },
  { ar: "رَبِّ زِدْنِي عِلْمًا", en: "My Lord, increase me in knowledge.", ref: "Quran 20:114" },
  { ar: "قُلْ هَلْ يَسْتَوِي الَّذِينَ يَعْلَمُونَ وَالَّذِينَ لَا يَعْلَمُونَ", en: "Say: Are those who know equal to those who do not know?", ref: "Quran 39:9" },
  { ar: "إِنَّ اللَّهَ وَمَلَائِكَتَهُ وَأَهْلَ السَّمَاوَاتِ وَالْأَرْضِ... لَيُصَلُّونَ عَلَى مُعَلِّمِ النَّاسِ الْخَيْرَ", en: "Verily Allah, His angels, the inhabitants of the heavens and earth… send blessings upon the one who teaches people goodness.", ref: "Hadith — Tirmidhi" },
  { ar: "إِذَا مَاتَ ابْنُ آدَمَ انْقَطَعَ عَنْهُ عَمَلُهُ إِلَّا مِنْ ثَلَاثَةٍ... أَوْ عِلْمٍ يُنْتَفَعُ بِهِ", en: "When the son of Adam dies, all his deeds end except three: … or knowledge that is benefited from.", ref: "Hadith — Muslim" },
  { ar: "الْعُلَمَاءُ وَرَثَةُ الْأَنْبِيَاءِ", en: "The scholars are the heirs of the Prophets.", ref: "Hadith — Abu Dawud" },
];

// ── Helper ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, to }: { icon: any; label: string; value: number | string; color: string; to?: string }) {
  const inner = (
    <div style={{
      background: "#fff", borderRadius: 16, padding: "16px",
      border: "1px solid rgba(15,45,31,.08)",
      display: "flex", flexDirection: "column", gap: 8,
      boxShadow: "0 1px 6px rgba(0,0,0,.04)",
      transition: "all .2s", cursor: to ? "pointer" : "default",
    }}
      onMouseEnter={e => { if (to) (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(0,0,0,.1)"; }}
      onMouseLeave={e => { if (to) (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 6px rgba(0,0,0,.04)"; }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 12,
        background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={20} color={color} />
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color: G, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#7a9e88", fontWeight: 500 }}>{label}</div>
    </div>
  );
  return to ? <Link to={to} style={{ textDecoration: "none" }}>{inner}</Link> : inner;
}

// ── to12hr ─────────────────────────────────────────────────────────────────
function to12hr(timeStr: string): string {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ── Main ───────────────────────────────────────────────────────────────────
const TeacherDashboard = () => {
  const { t, language } = useLanguage();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    students: 0, privateStudents: 0, subjects: 0,
    todayClasses: 0, pendingTests: 0, pendingExams: 0,
    totalRecordings: 0, unreadMsgs: 0,
  });
  const [todaySessions, setTodaySessions] = useState<any[]>([]);
  const [todayPrivate, setTodayPrivate] = useState<any[]>([]);
  const [pendingAttempts, setPendingAttempts] = useState<any[]>([]);
  const [recentResults, setRecentResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [verse] = useState(() => TEACHER_VERSES[Math.floor(Math.random() * TEACHER_VERSES.length)]);

  const today = new Date();

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      // ── 1. Teacher's owned subjects ──────────────────────────────────────
      const { data: ownedSubjects } = await supabase
        .from("subjects").select("id, title, title_ar").eq("teacher_id", user.id);
      const ownedSubjectIds = (ownedSubjects || []).map(s => s.id);

      // ── 2. Timetable-assigned subjects (teacher_id on subject_timetable) ─
      const { data: ttSlots } = await supabase
        .from("subject_timetable" as any).select("subject_id").eq("teacher_id", user.id);
      const ttSubjectIds = [...new Set((ttSlots || []).map((s: any) => s.subject_id).filter(Boolean))];

      let extraSubs: any[] = [];
      if (ttSubjectIds.length > 0) {
        const missingIds = ttSubjectIds.filter((id: string) => !ownedSubjectIds.includes(id));
        if (missingIds.length > 0) {
          const { data: es } = await supabase
            .from("subjects").select("id, title, title_ar").in("id", missingIds);
          extraSubs = es || [];
        }
      }
      const allSubjects = [...(ownedSubjects || []), ...extraSubs];
      const subjectIds = allSubjects.map(s => s.id);

      // ── 3. Students via enrollments ──────────────────────────────────────
      let studentCount = 0;
      let courseIds: string[] = [];
      if (subjectIds.length > 0) {
        const { data: courses } = await supabase.from("courses").select("id").in("subject_id", subjectIds);
        courseIds = (courses || []).map(c => c.id);
        if (courseIds.length > 0) {
          const { count } = await supabase.from("enrollments").select("user_id", { count: "exact", head: true }).in("course_id", courseIds);
          studentCount = count || 0;
        }
      }

      // ── 4. Private students ──────────────────────────────────────────────
      const { count: pvtCount } = await supabase.from("profiles").select("id", { count: "exact", head: true })
        .eq("assigned_teacher_id", user.id).eq("student_type", "private");

      // ── 5. Today's live_sessions (all sources) ───────────────────────────
      const todayStr = today.toISOString().split("T")[0];
      let sessionsToday: any[] = [];

      // 5a. Via subject_id (owned + timetable subjects)
      if (subjectIds.length > 0) {
        const { data: s1 } = await supabase.from("live_sessions")
          .select("*, subjects(title, title_ar)").in("subject_id", subjectIds)
          .gte("scheduled_at", todayStr + "T00:00:00")
          .lte("scheduled_at", todayStr + "T23:59:59");
        sessionsToday = s1 || [];

        // fallback to created_at if no scheduled_at sessions
        if (!sessionsToday.length) {
          const { data: s2 } = await supabase.from("live_sessions")
            .select("*, subjects(title, title_ar)").in("subject_id", subjectIds)
            .gte("created_at", todayStr + "T00:00:00")
            .lte("created_at", todayStr + "T23:59:59");
          sessionsToday = s2 || [];
        }
      }

      // 5b. FIX: Also via host_id = teacher (admin may assign directly)
      const { data: hostSessions } = await supabase.from("live_sessions")
        .select("*, subjects(title, title_ar)").eq("host_id", user.id)
        .gte("scheduled_at", todayStr + "T00:00:00")
        .lte("scheduled_at", todayStr + "T23:59:59");

      // Merge + deduplicate live_sessions
      const seenIds = new Set(sessionsToday.map((s: any) => s.id));
      for (const s of (hostSessions || [])) {
        if (!seenIds.has(s.id)) { seenIds.add(s.id); sessionsToday.push(s); }
      }

      // ── 6. FIX: Today's subject_timetable recurring slots ────────────────
      // subject_timetable has day_of_week (0=Sun…6=Sat), start_time, end_time
      const todayIndex = today.getDay();
      let timetableToday: any[] = [];

      if (subjectIds.length > 0) {
        // Slots matching the teacher's subjects today
        const { data: ttToday } = await supabase
          .from("subject_timetable" as any)
          .select("id, subject_id, start_time, end_time, live_url, subjects(title, title_ar)")
          .eq("day_of_week", todayIndex)
          .eq("is_active", true)
          .in("subject_id", subjectIds);
        timetableToday = ttToday || [];
      }

      // Slots where the timetable itself has teacher_id = user.id (independent of subject ownership)
      const { data: ttDirect } = await supabase
        .from("subject_timetable" as any)
        .select("id, subject_id, start_time, end_time, live_url, subjects(title, title_ar)")
        .eq("day_of_week", todayIndex)
        .eq("is_active", true)
        .eq("teacher_id", user.id);

      // Merge timetable slots, dedup by id
      const seenTT = new Set(timetableToday.map((s: any) => s.id));
      for (const s of (ttDirect || [])) {
        if (!seenTT.has(s.id)) { seenTT.add(s.id); timetableToday.push(s); }
      }

      // Convert timetable slots into session-like objects (for uniform rendering)
      // Only include if no explicit live_session already exists for this subject today
      const existingSubjectsToday = new Set(sessionsToday.map((s: any) => s.subject_id));
      const timetableVirtual = timetableToday
        .filter((slot: any) => !existingSubjectsToday.has(slot.subject_id))
        .map((slot: any) => ({
          id: `tt-${slot.id}`,
          subject_id: slot.subject_id,
          subjects: slot.subjects,
          scheduled_at: null,
          start_time: slot.start_time,
          end_time: slot.end_time,
          live_url: slot.live_url,
          status: "timetable",
          _isTimetable: true,
        }));

      const allTodaySessions = [...sessionsToday, ...timetableVirtual];

      // ── 7. Today's private sessions ──────────────────────────────────────
      const { data: pvtSessions } = await supabase.from("private_sessions")
        .select("*, profiles!private_sessions_student_id_fkey(full_name), subjects(title)")
        .eq("teacher_id", user.id).eq("session_date", todayStr);

      // ── 8. Pending grading ───────────────────────────────────────────────
      let pendingTests = 0, pendingExams = 0;
      let pendingAttemptsList: any[] = [];
      if (courseIds.length > 0) {
        const { data: exams } = await supabase.from("exams").select("id, type, title").in("course_id", courseIds);
        const examIds = (exams || []).filter(e => (e.type || "exam") === "exam").map(e => e.id);
        const testIds = (exams || []).filter(e => e.type === "test").map(e => e.id);
        const allIds = [...examIds, ...testIds];
        if (examIds.length > 0) {
          const { count } = await supabase.from("exam_attempts").select("id", { count: "exact", head: true })
            .in("exam_id", examIds).eq("status", "submitted");
          pendingExams = count || 0;
        }
        if (testIds.length > 0) {
          const { count } = await supabase.from("exam_attempts").select("id", { count: "exact", head: true })
            .in("exam_id", testIds).eq("status", "submitted");
          pendingTests = count || 0;
        }
        if (allIds.length > 0) {
          const { data: pending } = await supabase.from("exam_attempts")
            .select("*, profiles!exam_attempts_user_id_fkey(full_name), exams(title, type)")
            .in("exam_id", allIds).eq("status", "submitted")
            .order("submitted_at", { ascending: false }).limit(5);
          pendingAttemptsList = pending || [];
        }
      }

      // ── 9. Recent graded results ─────────────────────────────────────────
      const { data: recent } = await supabase.from("exam_attempts")
        .select("*, profiles!exam_attempts_user_id_fkey(full_name), exams(title, type)")
        .eq("status", "graded").order("submitted_at", { ascending: false }).limit(6);

      // ── 10. Recordings count ─────────────────────────────────────────────
      let recCount = 0;
      if (subjectIds.length > 0) {
        const { count } = await supabase.from("session_recordings")
          .select("id", { count: "exact", head: true }).in("subject_id", subjectIds);
        recCount = count || 0;
      }

      setStats({
        students: studentCount,
        privateStudents: pvtCount || 0,
        subjects: subjectIds.length,
        todayClasses: allTodaySessions.length,
        pendingTests,
        pendingExams,
        totalRecordings: recCount,
        unreadMsgs: 0,
      });
      setTodaySessions(allTodaySessions);
      setTodayPrivate(pvtSessions || []);
      setPendingAttempts(pendingAttemptsList);
      setRecentResults(recent || []);
      setLoading(false);
    };
    fetchData();
  }, [user]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          border: `4px solid ${GOLD}`, borderTopColor: "transparent",
          animation: "spin .8s linear infinite",
        }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  const statCards = [
    { icon: Users, label: t("My Students", "طلابي"), value: stats.students, color: G, to: "/teacher/students" },
    { icon: UserCheck, label: t("Private", "خاصون"), value: stats.privateStudents, color: "#7C3AED", to: "/teacher/private-students" },
    { icon: BookOpen, label: t("Subjects", "مواد"), value: stats.subjects, color: GOLD, to: "/teacher/subjects" },
    { icon: Video, label: t("Today's Classes", "حصص اليوم"), value: stats.todayClasses, color: "#2563EB", to: "/teacher/classes" },
    { icon: CheckSquare, label: t("Pending Exams", "امتحانات معلقة"), value: stats.pendingExams, color: "#DC2626", to: "/teacher/grading" },
    { icon: FileText, label: t("Pending Tests", "تمرينات معلقة"), value: stats.pendingTests, color: "#D97706", to: "/teacher/grading" },
    { icon: Mic, label: t("Recordings", "تسجيلات"), value: stats.totalRecordings, color: "#059669", to: "/teacher/recordings" },
    { icon: GraduationCap, label: t("Transcripts", "كشوف"), value: stats.students, color: "#0891B2", to: "/teacher/transcripts" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "system-ui, sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Hero header ──────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, ${G} 0%, ${GM} 60%, #1e5c3b 100%)`,
        padding: "28px 24px 80px",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, borderRadius: "50%", background: "rgba(201,168,76,.08)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -60, left: -20, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,.04)", pointerEvents: "none" }} />

        <div style={{ position: "relative", maxWidth: 900, margin: "0 auto" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.55)", marginBottom: 10, fontWeight: 500 }}>
            {format(today, "EEEE, MMMM d, yyyy")}
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#fff", margin: "0 0 4px" }}>
            {t("Welcome back", "مرحباً بعودتك")}, {profile?.full_name?.split(" ")[0] || t("Teacher", "المعلم")} 👋
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,.6)", margin: 0 }}>
            {t("May Allah bless your teaching and benefit your students", "بارك الله في علمك ونفع به طلابك")}
          </p>
          <div style={{
            marginTop: 20, padding: "14px 18px", borderRadius: 14,
            background: "rgba(201,168,76,.12)", border: "1px solid rgba(201,168,76,.25)",
            maxWidth: 560,
          }}>
            <div style={{ fontFamily: "'Amiri', serif", fontSize: 17, color: GOLD, direction: "rtl", lineHeight: 1.7, marginBottom: 6 }}>
              {verse.ar}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.7)", fontStyle: "italic" }}>{verse.en}</div>
            <div style={{ fontSize: 10, color: "rgba(201,168,76,.7)", marginTop: 4, fontWeight: 700 }}>— {verse.ref}</div>
          </div>
          {(stats.pendingExams + stats.pendingTests) > 0 && (
            <div style={{
              marginTop: 14, padding: "10px 14px", borderRadius: 12,
              background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.3)",
              display: "flex", alignItems: "center", gap: 10, maxWidth: 400,
            }}>
              <AlertTriangle size={16} color="#FCA5A5" />
              <span style={{ fontSize: 13, color: "#FCA5A5", fontWeight: 600 }}>
                {stats.pendingExams + stats.pendingTests} {t("exam(s) awaiting grading", "امتحان/تمرين ينتظر التصحيح")}
              </span>
              <Link to="/teacher/grading" style={{ color: GOLD, fontSize: 12, fontWeight: 700, textDecoration: "none", marginLeft: "auto" }}>
                {t("Grade now →", "صحّح الآن →")}
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Stats grid ──────────────────────────────────────────── */}
      <div style={{ maxWidth: 900, margin: "-50px auto 0", padding: "0 20px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
          {statCards.map((s, i) => <StatCard key={i} {...s} />)}
        </div>
      </div>

      {/* ── Main content grid ─────────────────────────────────────── */}
      <div style={{ maxWidth: 900, margin: "20px auto", padding: "0 20px 40px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
        className="grid-cols-1 md:grid-cols-2"
      >
        {/* Today's Schedule */}
        <div style={{ background: "#fff", borderRadius: 20, border: "1px solid rgba(15,45,31,.08)", overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,.04)" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Clock size={16} color={GOLD} />
              <span style={{ fontWeight: 800, fontSize: 14, color: G }}>{t("Today's Schedule", "جدول اليوم")}</span>
              {todaySessions.length > 0 && (
                <span style={{ background: "#DCFCE7", color: "#16A34A", borderRadius: 20, fontSize: 10, fontWeight: 900, padding: "1px 6px" }}>
                  {todaySessions.length}
                </span>
              )}
            </div>
            <Link to="/teacher/timetable" style={{ fontSize: 12, color: GOLD, fontWeight: 700, textDecoration: "none" }}>
              {t("Full schedule →", "الجدول الكامل →")}
            </Link>
          </div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {todaySessions.length === 0 && todayPrivate.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#9CA3AF" }}>
                <Calendar size={32} style={{ margin: "0 auto 8px", display: "block", opacity: 0.3 }} />
                <p style={{ fontSize: 13 }}>{t("No classes scheduled today", "لا توجد حصص اليوم")}</p>
              </div>
            ) : (
              <>
                {todaySessions.map((s: any) => {
                  const isActive = s.status === "active";
                  const isTimetable = s._isTimetable === true;
                  const timeLabel = s.scheduled_at
                    ? format(new Date(s.scheduled_at), "h:mm a")
                    : s.start_time ? to12hr(s.start_time) : t("Today", "اليوم");

                  return (
                    <div key={s.id} style={{
                      padding: "12px 14px", borderRadius: 12,
                      background: isActive ? "#F0FDF4" : isTimetable ? "#FFFBEB" : "#F0FDF4",
                      border: `1px solid ${isActive ? "#86EFAC" : isTimetable ? "#FDE68A" : "#BBF7D0"}`,
                      display: "flex", alignItems: "center", gap: 12,
                    }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: isTimetable ? GOLD : G, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Video size={16} color="#fff" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: 13, color: G, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.subjects?.title || "Class"}
                          {isTimetable && (
                            <span style={{ marginLeft: 6, fontSize: 10, background: "#FEF3C7", color: "#D97706", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>
                              {t("Recurring", "متكرر")}
                            </span>
                          )}
                        </p>
                        <p style={{ fontSize: 11, color: "#7a9e88", margin: "2px 0 0" }}>
                          {timeLabel}
                          {s.end_time && ` — ${to12hr(s.end_time)}`}
                          {isActive && <span style={{ color: "#DC2626", fontWeight: 900 }}> • LIVE</span>}
                        </p>
                      </div>
                      <button
                        onClick={() => navigate("/teacher/classes")}
                        style={{
                          padding: "6px 12px", borderRadius: 8,
                          background: isActive ? "#16A34A" : G,
                          border: "none", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer",
                        }}
                      >
                        {isActive ? t("Join Live", "انضم") : t("Start", "ابدأ")}
                      </button>
                    </div>
                  );
                })}
                {todayPrivate.map((s: any) => (
                  <div key={s.id} style={{
                    padding: "12px 14px", borderRadius: 12, background: "#FDF4FF",
                    border: "1px solid #E9D5FF", display: "flex", alignItems: "center", gap: 12,
                  }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "#9333EA", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <UserCheck size={16} color="#fff" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 700, fontSize: 13, color: G, margin: 0 }}>{s.profiles?.full_name || "Student"}</p>
                      <p style={{ fontSize: 11, color: "#7a9e88", margin: "2px 0 0" }}>{s.start_time} — {s.end_time}</p>
                    </div>
                    <span style={{ padding: "4px 8px", borderRadius: 20, background: "#F3E8FF", color: "#9333EA", fontSize: 10, fontWeight: 700 }}>
                      {t("Private", "خاص")}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Pending Grading */}
        <div style={{ background: "#fff", borderRadius: 20, border: "1px solid rgba(15,45,31,.08)", overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,.04)" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CheckSquare size={16} color="#DC2626" />
              <span style={{ fontWeight: 800, fontSize: 14, color: G }}>{t("Pending Grading", "بانتظار التصحيح")}</span>
              {pendingAttempts.length > 0 && (
                <span style={{ background: "#FEF2F2", color: "#DC2626", borderRadius: 20, fontSize: 10, fontWeight: 900, padding: "1px 6px" }}>
                  {stats.pendingExams + stats.pendingTests}
                </span>
              )}
            </div>
            <Link to="/teacher/grading" style={{ fontSize: 12, color: GOLD, fontWeight: 700, textDecoration: "none" }}>
              {t("Grade all →", "صحّح الكل →")}
            </Link>
          </div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {pendingAttempts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#9CA3AF" }}>
                <CheckCircle size={32} style={{ margin: "0 auto 8px", display: "block", opacity: 0.3, color: "#22C55E" }} />
                <p style={{ fontSize: 13 }}>{t("All caught up!", "أحسنت! لا يوجد ما ينتظر")}</p>
              </div>
            ) : pendingAttempts.slice(0, 4).map((a: any) => (
              <div key={a.id} style={{
                padding: "12px 14px", borderRadius: 12, background: "#FEF2F2",
                border: "1px solid #FECACA", display: "flex", alignItems: "center", gap: 12,
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "#DC2626", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <ClipboardList size={16} color="#fff" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: G, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.profiles?.full_name || "Student"}
                  </p>
                  <p style={{ fontSize: 11, color: "#7a9e88", margin: "2px 0 0" }}>
                    {a.exams?.title} • {a.exams?.type === "test" ? t("Test", "تمرين") : t("Exam", "امتحان")}
                  </p>
                </div>
                <button onClick={() => navigate("/teacher/grading")} style={{
                  padding: "6px 12px", borderRadius: 8, background: "#DC2626", border: "none",
                  color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer",
                }}>
                  {t("Grade", "صحّح")}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Results */}
        <div style={{ background: "#fff", borderRadius: 20, border: "1px solid rgba(15,45,31,.08)", overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,.04)" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <BarChart size={16} color={GOLD} />
              <span style={{ fontWeight: 800, fontSize: 14, color: G }}>{t("Recent Results", "النتائج الأخيرة")}</span>
            </div>
            <Link to="/teacher/results" style={{ fontSize: 12, color: GOLD, fontWeight: 700, textDecoration: "none" }}>
              {t("View all →", "عرض الكل →")}
            </Link>
          </div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {recentResults.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#9CA3AF" }}>
                <BarChart size={32} style={{ margin: "0 auto 8px", display: "block", opacity: 0.3 }} />
                <p style={{ fontSize: 13 }}>{t("No results yet", "لا توجد نتائج بعد")}</p>
              </div>
            ) : recentResults.map((r: any) => (
              <div key={r.id} style={{
                padding: "12px 14px", borderRadius: 12,
                background: r.passed ? "#F0FDF4" : "#FEF2F2",
                border: `1px solid ${r.passed ? "#BBF7D0" : "#FECACA"}`,
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: r.passed ? "#22C55E" : "#DC2626",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {r.passed ? <CheckCircle size={16} color="#fff" /> : <XCircle size={16} color="#fff" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: 13, color: G, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.profiles?.full_name || "Student"}
                  </p>
                  <p style={{ fontSize: 11, color: "#7a9e88", margin: "2px 0 0" }}>
                    {r.exams?.title} • {Math.round(r.percentage || 0)}%
                  </p>
                </div>
                <span style={{
                  padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800,
                  background: r.passed ? "#DCFCE7" : "#FEE2E2",
                  color: r.passed ? "#16A34A" : "#DC2626",
                }}>
                  {r.passed ? t("Pass", "ناجح") : t("Fail", "راسب")}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ background: "#fff", borderRadius: 20, border: "1px solid rgba(15,45,31,.08)", overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,.04)" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #F3F4F6" }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: G }}>⚡ {t("Quick Actions", "إجراءات سريعة")}</span>
          </div>
          <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { icon: Video, label: t("Schedule Class", "جدولة حصة"), to: "/teacher/classes", color: "#2563EB" },
              { icon: CheckSquare, label: t("Grade Exams", "تصحيح الامتحانات"), to: "/teacher/grading", color: "#DC2626" },
              { icon: Megaphone, label: t("Announce", "إعلان"), to: "/teacher/announcements", color: G },
              { icon: GraduationCap, label: t("Transcripts", "كشوف النتائج"), to: "/teacher/transcripts", color: GOLD },
              { icon: Calendar, label: t("Attendance", "الحضور"), to: "/teacher/attendance", color: "#059669" },
              { icon: MessageSquare, label: t("Al-Majlis", "المجلس"), to: "/teacher/majlis", color: "#7C3AED" },
              { icon: Star, label: t("Recitation", "جلسات التلاوة"), to: "/teacher/recitation", color: "#D97706" },
              { icon: Radio, label: t("Public Class", "درس عام"), to: "/teacher/public-classes", color: "#0891B2" },
            ].map((action, i) => (
              <Link key={i} to={action.to} style={{ textDecoration: "none" }}>
                <div style={{
                  padding: "12px 14px", borderRadius: 12, background: `${action.color}0D`,
                  border: `1px solid ${action.color}20`,
                  display: "flex", alignItems: "center", gap: 10,
                  cursor: "pointer", transition: "all .15s",
                }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = `${action.color}18`}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = `${action.color}0D`}
                >
                  <action.icon size={16} color={action.color} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: action.color }}>{action.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboard;
