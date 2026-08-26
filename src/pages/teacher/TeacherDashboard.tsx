// src/pages/teacher/TeacherDashboard.tsx
// Structure mirrors the student dashboard: Arabic hero greeting, Hijri date,
// Quick Actions grid, card sections below. IslamicDailyFeed included.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLiveClass } from "@/contexts/LiveClassContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import IslamicDailyFeed from "@/components/dashboard/IslamicDailyFeed";
import AcademyStatusBanner from "@/components/shared/AcademyStatusBanner";
import {
  Users, UserCheck, BookOpen, Video, ClipboardList,
  Clock, BarChart, CheckSquare, Calendar,
  Mic, GraduationCap, MessageSquare, Radio, Star,
  AlertTriangle, CheckCircle, XCircle, Megaphone,
} from "lucide-react";

const G      = "#0f2d1f";
const GM     = "#1a4731";
const GOLD   = "#c9a84c";
const GOLDE  = "#e4c36a";
const BORDER = "rgba(15,45,31,0.1)";

// ── Hijri helper (same as student dashboard) ─────────────────────────
const toHijri = (date: Date) => {
  try {
    const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", year: "numeric" }).formatToParts(date);
    const d = parts.find(p => p.type === "day")?.value  ?? "0";
    const m = parts.find(p => p.type === "month")?.value ?? "0";
    const y = parts.find(p => p.type === "year")?.value  ?? "0";
    const months = ["محرم","صفر","ربيع الأول","ربيع الثاني","جمادى الأولى","جمادى الآخرة","رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة"];
    return `${d} ${months[parseInt(m) - 1] ?? ""} ${y} هـ`;
  } catch { return ""; }
};

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

const card = {
  background: "#fff", border: `1px solid ${BORDER}`,
  borderRadius: 18, boxShadow: "0 2px 12px rgba(0,0,0,.06)", overflow: "hidden",
} as const;

// ── ScheduleCard ──────────────────────────────────────────────────────
function ScheduleCard({ session, onJoin, t }: { session: any; onJoin: () => void; t: any }) {
  const [msLeft, setMsLeft] = useState(() => getMsUntil(session.scheduled_at, session.start_time));
  useEffect(() => {
    const id = setInterval(() => setMsLeft(getMsUntil(session.scheduled_at, session.start_time)), 30_000);
    return () => clearInterval(id);
  }, [session]);

  const isActive   = session.status === "active";
  const isImminent = msLeft > 0 && msLeft < 15 * 60_000;
  const isTT       = !!session._isTimetable;
  const timeLabel  = session.scheduled_at ? format(new Date(session.scheduled_at), "h:mm a") : session.start_time ? to12hr(session.start_time) : "";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: 13, background: isActive ? "#F0FDF4" : isImminent ? "#FFFBEB" : "#F9FAFB", border: `1px solid ${isActive ? "#86EFAC" : isImminent ? "#FDE68A" : "#E5E7EB"}` }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: isActive ? "#16A34A" : isTT ? GOLD : G, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Video size={15} color="#fff" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: G }}>{session.subjects?.title || "Class"}</span>
          {isActive && <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: "#DC2626", borderRadius: 4, padding: "1px 5px", animation: "tdPulse 2s infinite" }}>🔴 LIVE</span>}
          {isTT && !isActive && <span style={{ fontSize: 9, fontWeight: 700, color: "#D97706", background: "#FEF3C7", borderRadius: 4, padding: "1px 5px" }}>🔁 Recurring</span>}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
          {timeLabel && <span style={{ fontSize: 11, color: "#6B7280" }}>{timeLabel}</span>}
          {!isActive && msLeft !== Infinity && (
            <span style={{ fontSize: 11, fontWeight: 700, color: isImminent ? "#B45309" : "#059669" }}>⏱ {fmtCountdown(msLeft)}</span>
          )}
        </div>
      </div>
      <button onClick={onJoin}
        style={{ flexShrink: 0, padding: "7px 13px", borderRadius: 9, border: "none", background: isActive ? "#16A34A" : isImminent ? "#D97706" : G, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
        {isActive ? t("Join", "انضم") : t("Start", "ابدأ")}
      </button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────
const TeacherDashboard = () => {
  const { t, language } = useLanguage();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { joinClass } = useLiveClass();

  const [stats,           setStats]           = useState({ students: 0, privateStudents: 0, subjects: 0, todayClasses: 0, pendingExams: 0, pendingTests: 0 });
  const [todaySessions,   setTodaySessions]   = useState<any[]>([]);
  const [todayPrivate,    setTodayPrivate]     = useState<any[]>([]);
  const [pendingAttempts, setPendingAttempts]  = useState<any[]>([]);
  const [recentResults,   setRecentResults]    = useState<any[]>([]);
  const [loading,         setLoading]          = useState(true);
  const today    = new Date();
  const hijri    = toHijri(today);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: ttAll } = await supabase.from("subject_timetable" as any).select("subject_id").eq("teacher_id", user.id).eq("is_active", true);
      // Also include subjects the teacher owns directly (subjects.teacher_id) —
      // a subject with no active timetable slot yet was previously invisible
      // here even though the teacher owns it and it may already have students.
      const { data: ownedSubs } = await supabase.from("subjects").select("id").eq("teacher_id", user.id);
      const subjectIds = [...new Set([
        ...((ttAll || []).map((s: any) => s.subject_id).filter(Boolean)),
        ...((ownedSubs || []).map((s: any) => s.id)),
      ])];

      let studentCount = 0, courseIds: string[] = [];
      if (subjectIds.length) {
        const { data: courses } = await supabase.from("courses").select("id").in("subject_id", subjectIds);
        courseIds = (courses || []).map(c => c.id);
        let enrolledUserIds: string[] = [];
        if (courseIds.length) {
          const { data: enrData } = await supabase.from("enrollments").select("user_id").in("course_id", courseIds);
          enrolledUserIds = [...new Set((enrData || []).map((e: any) => e.user_id))];
        }
        // Students aren't individually enrolled per subject in this app — the
        // `enrollments` table only tracks course_id and is effectively unused.
        // Real group-student access is level-based: a non-private student
        // whose level matches one of the teacher's subjects' levels is
        // considered to be taking that subject. Mirrors fetchSubjectRoster()
        // in StudentAssignments.tsx so the count here matches what students
        // actually see and what the "My Students" page lists.
        const { data: subRows } = await supabase.from("subjects").select("level, levels").in("id", subjectIds);
        const allLevels = [...new Set((subRows || []).flatMap((s: any) => (s.levels?.length ? s.levels : (s.level ? [s.level] : []))))];
        let levelUserIds: string[] = [];
        if (allLevels.length) {
          const { data: lvlStudents } = await supabase.from("profiles").select("user_id")
            .eq("role", "student").neq("student_type", "private").in("level", allLevels);
          levelUserIds = (lvlStudents || []).map((p: any) => p.user_id);
        }
        studentCount = new Set([...enrolledUserIds, ...levelUserIds]).size;
      }
      const { count: pvtCount } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("assigned_teacher_id", user.id).eq("student_type", "private");

      const todayStr = today.toISOString().split("T")[0];
      let liveSessions: any[] = [];
      if (subjectIds.length) {
        const { data: s1 } = await supabase.from("live_sessions").select("*,subjects(title,title_ar)").in("subject_id", subjectIds).gte("scheduled_at", `${todayStr}T00:00:00`).lte("scheduled_at", `${todayStr}T23:59:59`);
        liveSessions = s1 || [];
      }
      const { data: hostSess } = await supabase.from("live_sessions").select("*,subjects(title,title_ar)").eq("host_id", user.id).gte("scheduled_at", `${todayStr}T00:00:00`).lte("scheduled_at", `${todayStr}T23:59:59`);
      const seenLive = new Set(liveSessions.map(s => s.id));
      for (const s of (hostSess || [])) { if (!seenLive.has(s.id)) { seenLive.add(s.id); liveSessions.push(s); } }

      const todayIndex = today.getDay();
      const { data: tt } = await supabase.from("subject_timetable" as any).select("id,subject_id,start_time,end_time,subjects(title,title_ar)").eq("day_of_week", todayIndex).eq("is_active", true).eq("teacher_id", user.id);
      const liveSubIds = new Set(liveSessions.map(s => s.subject_id));
      let virtualToday = (tt || [])
        .filter((slot: any) => !liveSubIds.has(slot.subject_id))
        .map((slot: any) => {
          let scheduledAt: string | null = null;
          if (slot.start_time) { const [h, m] = slot.start_time.split(":").map(Number); const d = new Date(today); d.setHours(h, m, 0, 0); scheduledAt = d.toISOString(); }
          return { id: `tt-${slot.id}`, subject_id: slot.subject_id, subjects: slot.subjects, scheduled_at: scheduledAt, start_time: slot.start_time, end_time: slot.end_time, status: "scheduled", _isTimetable: true };
        });
      {
        const best = new Map<string, any>();
        for (const v of virtualToday) {
          const ex = best.get(v.subject_id);
          const vT = v.scheduled_at ? new Date(v.scheduled_at).getTime() : Infinity;
          const eT = ex?.scheduled_at ? new Date(ex.scheduled_at).getTime() : Infinity;
          if (!ex || vT < eT) best.set(v.subject_id, v);
        }
        virtualToday = Array.from(best.values());
      }

      const allToday = [...liveSessions, ...virtualToday].sort((a, b) => {
        const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Infinity;
        const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Infinity;
        return ta - tb;
      });

      const { data: pvtSessions } = await supabase.from("private_sessions").select("*,profiles!private_sessions_student_id_fkey(full_name),subjects(title)").eq("teacher_id", user.id).eq("session_date", todayStr);

      let pendingTests = 0, pendingExams = 0, pendingList: any[] = [];
      if (courseIds.length) {
        const { data: exams } = await supabase.from("exams").select("id,type,title").in("course_id", courseIds);
        const examIds = (exams || []).filter(e => (e.type || "exam") === "exam").map(e => e.id);
        const testIds = (exams || []).filter(e => e.type === "test").map(e => e.id);
        if (examIds.length) { const { count } = await supabase.from("exam_attempts").select("id", { count: "exact", head: true }).in("exam_id", examIds).eq("status", "submitted"); pendingExams = count || 0; }
        if (testIds.length)  { const { count } = await supabase.from("exam_attempts").select("id", { count: "exact", head: true }).in("exam_id", testIds).eq("status", "submitted");  pendingTests  = count || 0; }
        const allExamIds = [...examIds, ...testIds];
        if (allExamIds.length) {
          const { data: p } = await supabase.from("exam_attempts").select("*,profiles!exam_attempts_user_id_fkey(full_name),exams(title,type)").in("exam_id", allExamIds).eq("status", "submitted").order("submitted_at", { ascending: false }).limit(5);
          pendingList = p || [];
        }
      }

      const { data: recent } = await supabase.from("exam_attempts").select("*,profiles!exam_attempts_user_id_fkey(full_name),exams(title,type)").eq("status", "graded").order("submitted_at", { ascending: false }).limit(6);

      setStats({ students: studentCount, privateStudents: pvtCount || 0, subjects: subjectIds.length, todayClasses: allToday.length, pendingExams, pendingTests });
      setTodaySessions(allToday);
      setTodayPrivate(pvtSessions || []);
      setPendingAttempts(pendingList);
      setRecentResults(recent || []);
      setLoading(false);
    })();
  }, [user]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
      <style>{`@keyframes tdSpin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: `4px solid ${GOLD}`, borderTopColor: "transparent", animation: "tdSpin .8s linear infinite" }} />
    </div>
  );

  const QUICK_ACTIONS = [
    { icon: Video,         label: t("My Classes",   "فصولي"),       to: "/teacher/classes",       grad: `linear-gradient(135deg,#4299e1,#2b6cb0)`,         iconColor: "#fff", live: todaySessions.some(s => s.status === "active") },
    { icon: CheckSquare,   label: t("Grading",      "التصحيح"),      to: "/teacher/grading",       grad: `linear-gradient(135deg,#f56565,#c0392b)`,          iconColor: "#fff", live: false },
    { icon: Mic,           label: t("Ḥifẓ",         "الحفظ"),        to: "/teacher/hifdh-tracker", grad: `linear-gradient(135deg,${GOLDE},${GOLD})`,          iconColor: G,      live: false },
    { icon: GraduationCap, label: t("Transcripts",  "السجلات"),      to: "/teacher/transcripts",   grad: `linear-gradient(135deg,${GM},${G})`,               iconColor: "#fff", live: false },
    { icon: MessageSquare, label: t("Al-Majlis",    "المجلس"),       to: "/teacher/majlis",        grad: `linear-gradient(135deg,#9f7aea,#6b46c1)`,          iconColor: "#fff", live: false },
    { icon: Megaphone,     label: t("Announcements","إعلانات"),      to: "/teacher/announcements", grad: `linear-gradient(135deg,#48bb78,#276749)`,           iconColor: "#fff", live: false },
  ];

  const pendingTotal = stats.pendingExams + stats.pendingTests;

  return (
    <div style={{ minHeight: "100vh", background: "#F3F4F6", fontFamily: "system-ui, sans-serif" }}>
      <style>{`
        @keyframes tdSpin   { to { transform: rotate(360deg); } }
        @keyframes tdPulse  { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes livePulse{ 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes fadeUp   { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        .td-qa-tile { text-decoration: none; animation: fadeUp .4s ease both; }
        .td-qa-tile:active > div { transform: scale(.94); }
        .td-card { background:#fff; border-radius:20px; border:1px solid ${BORDER}; overflow:hidden; box-shadow:0 10px 25px -8px rgba(15,45,31,0.10); transition:box-shadow .2s ease; }
        .td-card:hover { box-shadow:0 16px 32px -8px rgba(15,45,31,0.14); }
        .td-card-head { padding:16px 20px; border-bottom:1px solid ${BORDER}; display:flex; align-items:center; justify-content:space-between; }
        .td-card-body { padding:14px 16px; display:flex; flex-direction:column; gap:10px; }
        .td-row { display:flex; align-items:center; gap:11px; padding:12px 14px; border-radius:14px; transition:transform .15s ease; }
        .td-row:hover { transform:translateY(-1px); }
        .td-icon { width:38px; height:38px; border-radius:11px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
      `}</style>

      <AcademyStatusBanner compact />

      {/* ── Hero — same structure as student ─────────────────────── */}
      <div style={{
        background: `linear-gradient(160deg,${G} 0%,${GM} 60%,#1e5c3b 100%)`,
        padding: "22px 18px 28px", position: "relative", overflow: "hidden",
      }}>
        {/* decorative circle */}
        <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "rgba(201,168,76,.06)", pointerEvents: "none" }} />

        {/* Hijri date pill — same as student */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 18 }}>
          <div style={{ flex: 1, maxWidth: 50, height: 1, background: "rgba(255,255,255,.15)" }} />
          <div style={{ background: `linear-gradient(135deg,${GOLDE},${GOLD})`, borderRadius: 30, padding: "7px 18px", display: "inline-flex", alignItems: "center", gap: 8, boxShadow: `0 4px 16px ${GOLD}4d` }}>
            <Calendar size={13} color={G} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: G, fontFamily: "'Amiri',serif", fontWeight: 900, whiteSpace: "nowrap" }} dir="rtl">{hijri}</span>
          </div>
          <div style={{ flex: 1, maxWidth: 50, height: 1, background: "rgba(255,255,255,.15)" }} />
        </div>

        {/* Arabic greeting */}
        <div style={{ textAlign: "center", marginBottom: 6 }}>
          <span style={{
            fontFamily: "'Scheherazade New','Amiri',serif",
            fontSize: 32, fontWeight: 700, color: "#fff", lineHeight: 1.8, display: "block",
            letterSpacing: "0.06em",
            textShadow: `0 2px 24px rgba(201,168,76,0.4),0 0 60px rgba(255,255,255,0.1)`,
            filter: "drop-shadow(0 3px 10px rgba(0,0,0,0.45))",
          }} dir="rtl">
            ٱلسَّلَامُ عَلَيْكُم
          </span>
        </div>

        {/* Name + date */}
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 4px", letterSpacing: "-0.2px" }}>
            {t(`Marhaban, ${profile?.full_name?.split(" ")[0] || "Teacher"}! 👋`,
               `مرحباً، ${profile?.full_name?.split(" ")[0] || "المعلم"}! 👋`)}
          </p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.5)", margin: "0 0 14px", fontWeight: 600 }}>
            {today.toLocaleDateString(language === "ar" ? "ar-SA" : "en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>

        {/* Pending grading alert */}
        {pendingTotal > 0 && (
          <div style={{ margin: "0 auto", maxWidth: 420, padding: "8px 14px", borderRadius: 12, background: "rgba(239,68,68,.15)", border: "1px solid rgba(239,68,68,.28)", display: "flex", alignItems: "center", gap: 10 }}>
            <AlertTriangle size={14} color="#FCA5A5" />
            <span style={{ fontSize: 12, color: "#FCA5A5", fontWeight: 600, flex: 1 }}>
              {pendingTotal} {t("submission(s) need grading", "تقديم ينتظر التصحيح")}
            </span>
            <Link to="/teacher/grading" style={{ color: GOLD, fontSize: 11, fontWeight: 700, textDecoration: "none" }}>{t("Grade →", "صحّح →")}</Link>
          </div>
        )}
      </div>

      {/* ── Quick Actions — same grid as student ──────────────────── */}
      <div style={{ padding: "20px 16px 0" }}>
        <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Star size={13} color={GOLD} fill={GOLD} />
          <span style={{ fontSize: 15, fontWeight: 800, color: G, fontFamily: "'Playfair Display',serif" }}>
            {t("Quick Actions", "الإجراءات السريعة")}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, rowGap: 18 }}>
          {QUICK_ACTIONS.map((a, i) => (
            <Link key={i} to={a.to} className="td-qa-tile" style={{ animationDelay: `${i * 0.05}s` }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
                <div style={{ position: "relative", width: "100%", maxWidth: 58, margin: "0 auto" }}>
                  <div style={{ width: "100%", aspectRatio: "1", borderRadius: 18, background: a.grad, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 16px rgba(15,45,31,0.18)", transition: "transform .15s" }}>
                    <a.icon size={24} color={a.iconColor} />
                  </div>
                  {a.live && (
                    <span style={{ position: "absolute", top: -6, right: -6, display: "flex", alignItems: "center", gap: 3, background: "#ef4444", color: "#fff", fontSize: 8, fontWeight: 800, letterSpacing: "0.04em", borderRadius: 20, padding: "2px 6px", boxShadow: "0 2px 6px rgba(239,68,68,0.5)", border: "1.5px solid #fff", animation: "livePulse 1.6s infinite" }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff" }} />{t("LIVE", "مباشر")}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: G, textAlign: "center", lineHeight: 1.25 }}>{a.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Scrollable cards ─────────────────────────────────────────── */}
      <div style={{ padding: "18px 16px 40px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Today's Schedule */}
        <div className="td-card">
          <div className="td-card-head">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Clock size={15} color={GOLD} />
              <span style={{ fontWeight: 800, fontSize: 15, color: G, fontFamily: "'Playfair Display',serif" }}>{t("Today's Schedule", "جدول اليوم")}</span>
              {(todaySessions.length + todayPrivate.length) > 0 && (
                <span style={{ background: "#DCFCE7", color: "#16A34A", borderRadius: 20, fontSize: 10, fontWeight: 900, padding: "1px 7px" }}>
                  {todaySessions.length + todayPrivate.length}
                </span>
              )}
            </div>
            <Link to="/teacher/timetable" style={{ fontSize: 11, color: GOLD, fontWeight: 700, textDecoration: "none" }}>{t("Full schedule →", "الكامل →")}</Link>
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
                  <ScheduleCard key={s.id} session={s}
                    onJoin={() => joinClass({ id: s.subject_id, title: s.subjects?.title || "Class", title_ar: s.subjects?.title_ar || "" })}
                    t={t} />
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

        {/* Stats summary row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {[
            { label: t("Students",    "الطلاب"),      value: stats.students + stats.privateStudents, color: G,        to: "/teacher/students",  icon: Users },
            { label: t("Subjects",    "المواد"),       value: stats.subjects,                         color: GOLD,     to: "/teacher/subjects",  icon: BookOpen },
            { label: t("Needs Grade", "للتصحيح"),     value: pendingTotal,                           color: "#DC2626", to: "/teacher/grading", icon: CheckSquare },
          ].map(({ label, value, color, to, icon: Icon }, i) => (
            <Link key={i} to={to} style={{ textDecoration: "none" }}>
              <div style={{ background: "#fff", borderRadius: 16, padding: "14px 12px", border: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", gap: 7, boxShadow: "0 8px 20px -8px rgba(15,45,31,0.10)", transition: "transform .15s ease, box-shadow .15s ease" }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 12px 26px -8px rgba(15,45,31,0.16)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 20px -8px rgba(15,45,31,0.10)"; }}
              >
                <div style={{ width: 34, height: 34, borderRadius: 10, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={16} color={color} />
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: G, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 10, color: "#7a9e88", fontWeight: 500 }}>{label}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* Pending Grading */}
        <div className="td-card">
          <div className="td-card-head">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CheckSquare size={15} color="#DC2626" />
              <span style={{ fontWeight: 800, fontSize: 15, color: G, fontFamily: "'Playfair Display',serif" }}>{t("Pending Grading", "بانتظار التصحيح")}</span>
              {pendingTotal > 0 && <span style={{ background: "#FEF2F2", color: "#DC2626", borderRadius: 20, fontSize: 10, fontWeight: 900, padding: "1px 7px" }}>{pendingTotal}</span>}
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
                <button onClick={() => navigate("/teacher/grading")}
                  style={{ padding: "6px 11px", borderRadius: 8, background: "#DC2626", border: "none", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  {t("Grade", "صحّح")}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Results */}
        <div className="td-card">
          <div className="td-card-head">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <BarChart size={15} color={GOLD} />
              <span style={{ fontWeight: 800, fontSize: 15, color: G, fontFamily: "'Playfair Display',serif" }}>{t("Recent Results", "النتائج الأخيرة")}</span>
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

        {/* Islamic Daily Feed — same as student */}
        <IslamicDailyFeed language={language} />

      </div>
    </div>
  );
};

export default TeacherDashboard;
