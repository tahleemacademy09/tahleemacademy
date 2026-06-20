// src/pages/teacher/TeacherDashboard.tsx
// Mobile-first responsive layout + today-only schedule with live countdown

import { useEffect, useState } from "react";
import AcademyStatusBanner from "@/components/shared/AcademyStatusBanner";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLiveClass } from "@/contexts/LiveClassContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  Users, UserCheck, BookOpen, Video, ClipboardList,
  Clock, BarChart, CheckSquare, Calendar,
  Mic, GraduationCap, MessageSquare, Radio, Star,
  AlertTriangle, CheckCircle, XCircle, Megaphone,
} from "lucide-react";

const G    = "#0f2d1f";
const GM   = "#1a4731";
const GOLD = "#c9a84c";

const VERSES = [
  { ar: "خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ", en: "The best of you are those who learn the Quran and teach it.", ref: "Bukhari" },
  { ar: "مَن سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا سَهَّلَ اللهُ لَهُ طَرِيقًا إِلَى الْجَنَّةِ", en: "Whoever seeks a path of knowledge, Allah eases his path to Paradise.", ref: "Muslim" },
  { ar: "رَبِّ زِدْنِي عِلْمًا", en: "My Lord, increase me in knowledge.", ref: "Quran 20:114" },
  { ar: "الْعُلَمَاءُ وَرَثَةُ الْأَنْبِيَاءِ", en: "The scholars are the heirs of the Prophets.", ref: "Abu Dawud" },
];

function to12hr(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function getMsUntil(scheduledAt: string | null, startTime: string | null): number {
  if (scheduledAt) return new Date(scheduledAt).getTime() - Date.now();
  if (startTime) {
    const [h, m] = startTime.split(":").map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    return d.getTime() - Date.now();
  }
  return Infinity;
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "Starting now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "Starting now";
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`;
}

// ── StatCard ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color, to }: {
  icon: any; label: string; value: number | string; color: string; to?: string;
}) {
  const inner = (
    <div style={{
      background: "#fff", borderRadius: 14, padding: "12px 10px",
      border: "1px solid rgba(15,45,31,.07)",
      display: "flex", flexDirection: "column", gap: 6,
      boxShadow: "0 1px 4px rgba(0,0,0,.04)", cursor: to ? "pointer" : "default",
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={17} color={color} />
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: G, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: "#7a9e88", fontWeight: 500, lineHeight: 1.3 }}>{label}</div>
    </div>
  );
  return to ? <Link to={to} style={{ textDecoration: "none" }}>{inner}</Link> : inner;
}

// ── ScheduleCard — self-ticking countdown ────────────────────────────────────
function ScheduleCard({ session, onJoin, t }: { session: any; onJoin: () => void; t: any }) {
  const [msLeft, setMsLeft] = useState(() => getMsUntil(session.scheduled_at, session.start_time));

  useEffect(() => {
    const id = setInterval(() => setMsLeft(getMsUntil(session.scheduled_at, session.start_time)), 30_000);
    return () => clearInterval(id);
  }, [session.scheduled_at, session.start_time]);

  const isActive   = session.status === "active";
  const isImminent = msLeft > 0 && msLeft < 15 * 60_000;
  const isTT       = !!session._isTimetable;

  const timeLabel = session.scheduled_at
    ? format(new Date(session.scheduled_at), "h:mm a")
    : session.start_time ? to12hr(session.start_time) : "";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "11px 13px", borderRadius: 13,
      background: isActive ? "#F0FDF4" : isImminent ? "#FFFBEB" : "#F9FAFB",
      border: `1px solid ${isActive ? "#86EFAC" : isImminent ? "#FDE68A" : "#E5E7EB"}`,
    }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: isActive ? "#16A34A" : isTT ? GOLD : G, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Video size={15} color="#fff" />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: G }}>
            {session.subjects?.title || "Class"}
          </span>
          {isActive && (
            <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: "#DC2626", borderRadius: 4, padding: "1px 5px", animation: "td-pulse 2s infinite" }}>
              🔴 LIVE
            </span>
          )}
          {isTT && !isActive && (
            <span style={{ fontSize: 9, fontWeight: 700, color: "#D97706", background: "#FEF3C7", borderRadius: 4, padding: "1px 5px" }}>
              🔁 Recurring
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
          {timeLabel && <span style={{ fontSize: 11, color: "#6B7280" }}>{timeLabel}</span>}
          {!isActive && msLeft !== Infinity && (
            <span style={{ fontSize: 11, fontWeight: 700, color: isImminent ? "#B45309" : "#059669" }}>
              ⏱ {fmtCountdown(msLeft)}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={onJoin}
        style={{
          flexShrink: 0, padding: "7px 13px", borderRadius: 9, border: "none",
          background: isActive ? "#16A34A" : isImminent ? "#D97706" : G,
          color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
        }}
      >
        {isActive ? t("Join", "انضم") : t("Start", "ابدأ")}
      </button>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────
const TeacherDashboard = () => {
  const { t } = useLanguage();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { joinClass } = useLiveClass();

  const [stats, setStats] = useState({ students: 0, privateStudents: 0, subjects: 0, todayClasses: 0, pendingTests: 0, pendingExams: 0, totalRecordings: 0 });
  const [todaySessions,   setTodaySessions]   = useState<any[]>([]);
  const [todayPrivate,    setTodayPrivate]     = useState<any[]>([]);
  const [pendingAttempts, setPendingAttempts]  = useState<any[]>([]);
  const [recentResults,   setRecentResults]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [verse] = useState(() => VERSES[Math.floor(Math.random() * VERSES.length)]);
  const today = new Date();

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Subject visibility comes ONLY from the admin timetable
      // (subject_timetable.teacher_id) — not from subjects.teacher_id, which
      // can be stale or set independently of what the admin has actually
      // assigned. Only active assignments count.
      const { data: ttAll } = await supabase.from("subject_timetable" as any).select("subject_id").eq("teacher_id", user.id).eq("is_active", true);
      const subjectIds = [...new Set((ttAll || []).map((s: any) => s.subject_id).filter(Boolean))];

      // Students / courses
      let studentCount = 0, courseIds: string[] = [];
      if (subjectIds.length) {
        const { data: courses } = await supabase.from("courses").select("id").in("subject_id", subjectIds);
        courseIds = (courses || []).map(c => c.id);
        if (courseIds.length) {
          const { count } = await supabase.from("enrollments").select("user_id", { count: "exact", head: true }).in("course_id", courseIds);
          studentCount = count || 0;
        }
      }
      const { count: pvtCount } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("assigned_teacher_id", user.id).eq("student_type", "private");

      // Today's live_sessions
      const todayStr = today.toISOString().split("T")[0];
      let liveSessions: any[] = [];
      if (subjectIds.length) {
        const { data: s1 } = await supabase.from("live_sessions").select("*,subjects(title,title_ar)").in("subject_id", subjectIds).gte("scheduled_at", `${todayStr}T00:00:00`).lte("scheduled_at", `${todayStr}T23:59:59`);
        liveSessions = s1 || [];
      }
      const { data: hostSess } = await supabase.from("live_sessions").select("*,subjects(title,title_ar)").eq("host_id", user.id).gte("scheduled_at", `${todayStr}T00:00:00`).lte("scheduled_at", `${todayStr}T23:59:59`);
      const seenLive = new Set(liveSessions.map(s => s.id));
      for (const s of (hostSess || [])) { if (!seenLive.has(s.id)) { seenLive.add(s.id); liveSessions.push(s); } }

      // TODAY's timetable slots only (day_of_week === today).
      // subjectIds already comes solely from subject_timetable.teacher_id
      // (see above), so a single direct query by teacher_id is both
      // sufficient and authoritative — same pattern as My Timetable.
      const todayIndex = today.getDay();
      const { data: tt } = await supabase.from("subject_timetable" as any).select("id,subject_id,start_time,end_time,subjects(title,title_ar)").eq("day_of_week", todayIndex).eq("is_active", true).eq("teacher_id", user.id);
      const ttToday = tt || [];

      // Virtual sessions from timetable — skip if live_session already exists for subject today
      const liveSubIds = new Set(liveSessions.map(s => s.subject_id));
      let virtualToday = ttToday
        .filter((slot: any) => !liveSubIds.has(slot.subject_id))
        .map((slot: any) => {
          let scheduledAt: string | null = null;
          if (slot.start_time) {
            const [h, m] = slot.start_time.split(":").map(Number);
            const d = new Date(today); d.setHours(h, m, 0, 0);
            scheduledAt = d.toISOString();
          }
          return { id: `tt-${slot.id}`, subject_id: slot.subject_id, subjects: slot.subjects, scheduled_at: scheduledAt, start_time: slot.start_time, end_time: slot.end_time, status: "scheduled", _isTimetable: true };
        });

      // A subject can have several leftover/incorrect timetable rows for the
      // same day (different times). Only show the soonest one per subject so
      // the schedule doesn't repeat the same class card over and over.
      {
        const bestBySubject = new Map<string, any>();
        for (const v of virtualToday) {
          const existing = bestBySubject.get(v.subject_id);
          const vTime = v.scheduled_at ? new Date(v.scheduled_at).getTime() : Infinity;
          const exTime = existing?.scheduled_at ? new Date(existing.scheduled_at).getTime() : Infinity;
          if (!existing || vTime < exTime) bestBySubject.set(v.subject_id, v);
        }
        virtualToday = Array.from(bestBySubject.values());
      }

      const allToday = [...liveSessions, ...virtualToday].sort((a, b) => {
        const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Infinity;
        const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Infinity;
        return ta - tb;
      });

      // Private sessions today
      const { data: pvtSessions } = await supabase.from("private_sessions").select("*,profiles!private_sessions_student_id_fkey(full_name),subjects(title)").eq("teacher_id", user.id).eq("session_date", todayStr);

      // Pending grading
      let pendingTests = 0, pendingExams = 0, pendingList: any[] = [];
      if (courseIds.length) {
        const { data: exams } = await supabase.from("exams").select("id,type,title").in("course_id", courseIds);
        const examIds = (exams || []).filter(e => (e.type || "exam") === "exam").map(e => e.id);
        const testIds = (exams || []).filter(e => e.type === "test").map(e => e.id);
        if (examIds.length) { const { count } = await supabase.from("exam_attempts").select("id", { count: "exact", head: true }).in("exam_id", examIds).eq("status", "submitted"); pendingExams = count || 0; }
        if (testIds.length)  { const { count } = await supabase.from("exam_attempts").select("id", { count: "exact", head: true }).in("exam_id",  testIds).eq("status", "submitted"); pendingTests  = count || 0; }
        const allExamIds = [...examIds, ...testIds];
        if (allExamIds.length) {
          const { data: p } = await supabase.from("exam_attempts").select("*,profiles!exam_attempts_user_id_fkey(full_name),exams(title,type)").in("exam_id", allExamIds).eq("status", "submitted").order("submitted_at", { ascending: false }).limit(5);
          pendingList = p || [];
        }
      }

      // Recent results
      const { data: recent } = await supabase.from("exam_attempts").select("*,profiles!exam_attempts_user_id_fkey(full_name),exams(title,type)").eq("status", "graded").order("submitted_at", { ascending: false }).limit(6);

      // Recordings
      let recCount = 0;
      if (subjectIds.length) {
        const { count } = await supabase.from("session_recordings").select("id", { count: "exact", head: true }).in("subject_id", subjectIds);
        recCount = count || 0;
      }

      setStats({ students: studentCount, privateStudents: pvtCount || 0, subjects: subjectIds.length, todayClasses: allToday.length, pendingTests, pendingExams, totalRecordings: recCount });
      setTodaySessions(allToday);
      setTodayPrivate(pvtSessions || []);
      setPendingAttempts(pendingList);
      setRecentResults(recent || []);
      setLoading(false);
    })();
  }, [user]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
      <style>{`@keyframes td-spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: `4px solid ${GOLD}`, borderTopColor: "transparent", animation: "td-spin .8s linear infinite" }} />
    </div>
  );

  const STAT_CARDS = [
    { icon: Users,         label: t("Students",        "الطلاب"),          value: stats.students + stats.privateStudents, color: G,        to: "/teacher/students" },
    { icon: BookOpen,      label: t("Subjects",        "مواد"),            value: stats.subjects,        color: GOLD,     to: "/teacher/subjects" },
    { icon: Video,         label: t("Today",           "اليوم"),           value: stats.todayClasses,    color: "#2563EB", to: "/teacher/classes" },
    { icon: CheckSquare,   label: t("Needs Grading",   "للتصحيح"),         value: stats.pendingExams + stats.pendingTests, color: "#DC2626", to: "/teacher/grading" },
    { icon: Mic,           label: t("Recordings",      "تسجيلات"),         value: stats.totalRecordings, color: "#059669", to: "/teacher/recordings" },
  ];

  const QUICK_ACTIONS = [
    { icon: Video,         label: t("Schedule",   "جدولة"),       to: "/teacher/classes",       color: "#2563EB" },
    { icon: CheckSquare,   label: t("Grade",      "تصحيح"),       to: "/teacher/grading",       color: "#DC2626" },
    { icon: BookOpen,      label: t("Hifdh",      "الحفظ"),       to: "/teacher/hifdh-tracker", color: "#b7791f" },
    { icon: Megaphone,     label: t("Announce",   "إعلان"),       to: "/teacher/announcements", color: G },
    { icon: GraduationCap, label: t("Transcripts","كشوف"),        to: "/teacher/transcripts",   color: "#0891B2" },
    { icon: Calendar,      label: t("Attendance", "الحضور"),      to: "/teacher/attendance",    color: "#059669" },
    { icon: MessageSquare, label: t("Al-Majlis",  "المجلس"),      to: "/teacher/majlis",        color: "#7C3AED" },
    { icon: Star,          label: t("Recitation", "التلاوة"),     to: "/teacher/recitation",    color: "#D97706" },
    { icon: Radio,         label: t("Public",     "درس عام"),     to: "/teacher/public-classes",color: "#0E7490" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "system-ui, sans-serif" }}>
      <style>{`
        @keyframes td-spin  { to { transform: rotate(360deg); } }
        @keyframes td-pulse { 0%,100%{opacity:1} 50%{opacity:.5} }

        /* Responsive main grid: 1 col mobile → 2 col desktop */
        .td-main  { display:grid; grid-template-columns:1fr; gap:14px; padding:14px 14px 40px; }
        @media(min-width:620px){ .td-main { grid-template-columns:1fr 1fr; } }

        /* Stats: horizontal scroll row on mobile, no wrap, no orphan cells */
        .td-stats { display:flex; gap:8px; padding:0 14px; margin-top:-44px; position:relative; z-index:2; overflow-x:auto; scroll-snap-type:x proximity; -ms-overflow-style:none; scrollbar-width:none; }
        .td-stats::-webkit-scrollbar { display:none; }
        .td-stats > a, .td-stats > div { flex:0 0 84px; scroll-snap-align:start; }
        @media(min-width:600px){ .td-stats { overflow-x:visible; } .td-stats > a, .td-stats > div { flex:1 1 0; } }

        /* Quick actions — slim horizontal pill row */
        .td-qa-row { display:flex; gap:8px; padding:14px 14px 0; overflow-x:auto; scroll-snap-type:x proximity; -ms-overflow-style:none; scrollbar-width:none; }
        .td-qa-row::-webkit-scrollbar { display:none; }
        .td-qa-pill { flex:0 0 auto; scroll-snap-align:start; display:flex; align-items:center; gap:6px; padding:8px 13px; border-radius:20px; font-size:12px; font-weight:700; text-decoration:none; white-space:nowrap; }

        .td-card { background:#fff; border-radius:18px; border:1px solid rgba(15,45,31,.07); overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,.04); }
        .td-card-head { padding:13px 15px; border-bottom:1px solid #F3F4F6; display:flex; align-items:center; justify-content:space-between; }
        .td-card-body { padding:12px 14px; display:flex; flex-direction:column; gap:9px; }
        .td-badge { border-radius:20px; font-size:10px; font-weight:900; padding:1px 7px; }
        .td-row { display:flex; align-items:center; gap:11px; padding:11px 13px; border-radius:13px; }
        .td-icon { width:38px; height:38px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
      `}</style>

      {/* Academy status banner — holiday / maintenance */}
      <AcademyStatusBanner compact />

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div style={{ background: `linear-gradient(135deg,${G} 0%,${GM} 60%,#1e5c3b 100%)`, padding: "22px 18px 66px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: "50%", background: "rgba(201,168,76,.07)", pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", marginBottom: 6 }}>{format(today, "EEEE, MMMM d, yyyy")}</div>
          <h1 style={{ fontSize: 21, fontWeight: 900, color: "#fff", margin: "0 0 2px" }}>
            {t("Welcome back", "مرحباً بعودتك")}, {profile?.full_name?.split(" ")[0] || t("Teacher", "المعلم")} 👋
          </h1>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.5)", margin: "0 0 14px" }}>
            {t("May Allah bless your teaching", "بارك الله في علمك ونفع به طلابك")}
          </p>

          {/* Verse */}
          <div style={{ padding: "11px 15px", borderRadius: 12, background: "rgba(201,168,76,.1)", border: "1px solid rgba(201,168,76,.2)" }}>
            <div style={{ fontFamily: "'Amiri',serif", fontSize: 14, color: GOLD, direction: "rtl", lineHeight: 1.7, marginBottom: 3 }}>{verse.ar}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)", fontStyle: "italic" }}>{verse.en}</div>
            <div style={{ fontSize: 10, color: "rgba(201,168,76,.6)", marginTop: 2, fontWeight: 700 }}>— {verse.ref}</div>
          </div>

          {(stats.pendingExams + stats.pendingTests) > 0 && (
            <div style={{ marginTop: 10, padding: "8px 13px", borderRadius: 10, background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.28)", display: "flex", alignItems: "center", gap: 9 }}>
              <AlertTriangle size={14} color="#FCA5A5" />
              <span style={{ fontSize: 12, color: "#FCA5A5", fontWeight: 600, flex: 1 }}>
                {stats.pendingExams + stats.pendingTests} {t("submission(s) need grading", "تقديم ينتظر التصحيح")}
              </span>
              <Link to="/teacher/grading" style={{ color: GOLD, fontSize: 11, fontWeight: 700, textDecoration: "none" }}>{t("Grade →", "صحّح →")}</Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Stats ────────────────────────────────────────────────── */}
      <div className="td-stats">
        {STAT_CARDS.map((s, i) => <StatCard key={i} {...s} />)}
      </div>

      {/* ── Quick Actions — slim scrollable pill row, not a full card ── */}
      <div className="td-qa-row">
        {QUICK_ACTIONS.map((a, i) => (
          <Link key={i} to={a.to} className="td-qa-pill" style={{ color: a.color, background: `${a.color}0D`, border: `1px solid ${a.color}1A` }}>
            <a.icon size={13} />
            <span>{a.label}</span>
          </Link>
        ))}
      </div>

      {/* ── Cards ────────────────────────────────────────────────── */}
      <div className="td-main">

        {/* Today's Schedule */}
        <div className="td-card">
          <div className="td-card-head">
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Clock size={14} color={GOLD} />
              <span style={{ fontWeight: 800, fontSize: 14, color: G }}>{t("Today's Schedule", "جدول اليوم")}</span>
              {(todaySessions.length + todayPrivate.length) > 0 && (
                <span className="td-badge" style={{ background: "#DCFCE7", color: "#16A34A" }}>
                  {todaySessions.length + todayPrivate.length}
                </span>
              )}
            </div>
            <Link to="/teacher/timetable" style={{ fontSize: 11, color: GOLD, fontWeight: 700, textDecoration: "none" }}>
              {t("Full schedule →", "الكامل →")}
            </Link>
          </div>
          <div className="td-card-body">
            {todaySessions.length === 0 && todayPrivate.length === 0 ? (
              <div style={{ textAlign: "center", padding: "26px 0", color: "#9CA3AF" }}>
                <Calendar size={28} style={{ margin: "0 auto 7px", display: "block", opacity: 0.2 }} />
                <p style={{ fontSize: 13, margin: 0 }}>{t("No classes scheduled today", "لا توجد حصص اليوم")}</p>
              </div>
            ) : (
              <>
                {todaySessions.map(s => (
                  <ScheduleCard
                    key={s.id}
                    session={s}
                    onJoin={() => joinClass({
                      id: s.subject_id,
                      title: s.subjects?.title || "Class",
                      title_ar: s.subjects?.title_ar || "",
                    })}
                    t={t}
                  />
                ))}
                {todayPrivate.map(s => (
                  <div key={s.id} className="td-row" style={{ background: "#FDF4FF", border: "1px solid #E9D5FF" }}>
                    <div className="td-icon" style={{ background: "#9333EA" }}><UserCheck size={15} color="#fff" /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: G }}>{s.profiles?.full_name || "Student"}</div>
                      <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{s.start_time} — {s.end_time}</div>
                    </div>
                    <span style={{ padding: "3px 8px", borderRadius: 20, background: "#F3E8FF", color: "#9333EA", fontSize: 10, fontWeight: 700 }}>{t("Private", "خاص")}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Pending Grading */}
        <div className="td-card">
          <div className="td-card-head">
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <CheckSquare size={14} color="#DC2626" />
              <span style={{ fontWeight: 800, fontSize: 14, color: G }}>{t("Pending Grading", "بانتظار التصحيح")}</span>
              {(stats.pendingExams + stats.pendingTests) > 0 && (
                <span className="td-badge" style={{ background: "#FEF2F2", color: "#DC2626" }}>{stats.pendingExams + stats.pendingTests}</span>
              )}
            </div>
            <Link to="/teacher/grading" style={{ fontSize: 11, color: GOLD, fontWeight: 700, textDecoration: "none" }}>{t("Grade all →", "صحّح →")}</Link>
          </div>
          <div className="td-card-body">
            {pendingAttempts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "26px 0", color: "#9CA3AF" }}>
                <CheckCircle size={28} style={{ margin: "0 auto 7px", display: "block", opacity: 0.22, color: "#22C55E" }} />
                <p style={{ fontSize: 13, margin: 0 }}>{t("All caught up!", "أحسنت!")}</p>
              </div>
            ) : pendingAttempts.slice(0, 4).map(a => (
              <div key={a.id} className="td-row" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
                <div className="td-icon" style={{ background: "#DC2626" }}><ClipboardList size={15} color="#fff" /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: G, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.profiles?.full_name || "Student"}</div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{a.exams?.title} · {a.exams?.type === "test" ? t("Test", "تمرين") : t("Exam", "امتحان")}</div>
                </div>
                <button onClick={() => navigate("/teacher/grading")} style={{ padding: "6px 11px", borderRadius: 8, background: "#DC2626", border: "none", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  {t("Grade", "صحّح")}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Results */}
        <div className="td-card">
          <div className="td-card-head">
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <BarChart size={14} color={GOLD} />
              <span style={{ fontWeight: 800, fontSize: 14, color: G }}>{t("Recent Results", "النتائج الأخيرة")}</span>
            </div>
            <Link to="/teacher/results" style={{ fontSize: 11, color: GOLD, fontWeight: 700, textDecoration: "none" }}>{t("View all →", "عرض →")}</Link>
          </div>
          <div className="td-card-body">
            {recentResults.length === 0 ? (
              <div style={{ textAlign: "center", padding: "26px 0", color: "#9CA3AF" }}>
                <BarChart size={28} style={{ margin: "0 auto 7px", display: "block", opacity: 0.22 }} />
                <p style={{ fontSize: 13, margin: 0 }}>{t("No results yet", "لا توجد نتائج بعد")}</p>
              </div>
            ) : recentResults.map(r => (
              <div key={r.id} className="td-row" style={{ background: r.passed ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${r.passed ? "#BBF7D0" : "#FECACA"}` }}>
                <div className="td-icon" style={{ background: r.passed ? "#22C55E" : "#DC2626" }}>
                  {r.passed ? <CheckCircle size={15} color="#fff" /> : <XCircle size={15} color="#fff" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: G, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.profiles?.full_name || "Student"}</div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{r.exams?.title} · {Math.round(r.percentage || 0)}%</div>
                </div>
                <span style={{ padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 800, background: r.passed ? "#DCFCE7" : "#FEE2E2", color: r.passed ? "#16A34A" : "#DC2626" }}>
                  {r.passed ? t("Pass", "ناجح") : t("Fail", "راسب")}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default TeacherDashboard;
