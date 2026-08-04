import AcademyStatusBanner from "@/components/shared/AcademyStatusBanner";
import NotificationPermissionBanner from "@/components/NotificationPermissionBanner";
import { useImpersonation } from "@/hooks/useImpersonation";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import IslamicDailyFeed from "@/components/dashboard/IslamicDailyFeed";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePrivateStudent } from "@/hooks/usePrivateStudent";
import { useVisibleRealtime } from "@/hooks/useVisibleRealtime";
import { supabase } from "@/integrations/supabase/client";
import {
  Clock, BookOpen, ClipboardList, Bell, TrendingUp, Calendar,
  GraduationCap, MessageCircle, ArrowRight, Video, Star, ChevronLeft,
  ChevronRight, AlertTriangle, Mic, Lock, ClipboardCheck
} from "lucide-react";

const toHijri = (date: Date) => {
  try {
    const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      day: "numeric", month: "numeric", year: "numeric"
    }).formatToParts(date);
    const d = parts.find(p => p.type === "day")?.value ?? "0";
    const m = parts.find(p => p.type === "month")?.value ?? "0";
    const y = parts.find(p => p.type === "year")?.value ?? "0";
    const months = ["محرم","صفر","ربيع الأول","ربيع الثاني","جمادى الأولى","جمادى الآخرة","رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة"];
    const monthName = months[parseInt(m) - 1] ?? "";
    return { day: parseInt(d), month: monthName, year: parseInt(y), full: `${d} ${monthName} ${y} هـ` };
  } catch {
    return { day: 0, month: "", year: 0, full: "" };
  }
};

/** Convert "HH:MM:SS" → "H:MM AM/PM" */
const to12hr = (timeStr: string): string => {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
};

/** Minutes from now until HH:MM time string (negative = past) */
const minsUntilTime = (timeStr: string): number => {
  const now = new Date();
  const [h, m] = timeStr.split(":").map(Number);
  const t = new Date(); t.setHours(h, m, 0, 0);
  return (t.getTime() - now.getTime()) / 60_000;
};

const gradePoint = (pct: number): number => {
  if (pct >= 85) return 4.0; if (pct >= 75) return 3.5;
  if (pct >= 65) return 3.0; if (pct >= 55) return 2.0;
  if (pct >= 45) return 1.0; return 0.0;
};

const DARK_GREEN  = "#0f2d1f";
const MID_GREEN   = "#1a4731";
const GOLD        = "#c9a84c";
const GOLD_LIGHT  = "#e4c36a";
const CREAM       = "#faf6ee";
const TEXT_DARK   = "#0f2d1f";
const TEXT_MED    = "#4a7c59";
const TEXT_LIGHT  = "#7a9e88";
const BORDER      = "rgba(15,45,31,0.1)";

/* ── Assignment Preview Widget ─────────────────────────────────────────── */
const AssignmentPreview = ({ userId, t, language, navigate }: { userId: string; t: any; language: string; navigate: any }) => {
  const [items, setItems] = useState<any[]>([]);
  const [subs, setSubs]   = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    const fetch = async () => {
      // Get student level first
      const { data: profileData } = await supabase.from("profiles").select("level").eq("user_id", userId).single();
      const studentLevel: string | null = (profileData as any)?.level || null;

      // NOTE: enrollments.course_id (not subject_id) is the real column —
      // every other query against this table filters/selects by course_id.
      // The subject_id version was returning a 400 from PostgREST every time.
      const { data: enrollments } = await supabase.from("enrollments").select("course_id").eq("user_id", userId);
      const { data: ttSlots }     = await supabase.from("subject_timetable" as any).select("subject_id, levels").eq("is_active", true);
      const ttIds = (ttSlots||[]).filter((s:any) => {
        if (!s.levels || s.levels.length === 0) return true;
        if (!studentLevel) return false;
        return s.levels.includes(studentLevel);
      }).map((s:any)=>s.subject_id);
      const ids = [...new Set([...(enrollments||[]).map((e:any)=>e.course_id), ...ttIds])].filter(Boolean);
      if (!ids.length) { setLoading(false); return; }
      const { data: asgn } = await supabase.from("subject_assignments").select("*, subjects(id,title,title_ar,level,levels)").in("subject_id", ids).order("deadline",{ascending:true}).limit(10);
      const list = (asgn || []).filter((a:any) => {
        const subj = a.subjects;
        if (!subj) return true;
        const sl: string[] = subj.levels || (subj.level ? [subj.level] : []);
        if (sl.length === 0) return true;
        if (!studentLevel) return false;
        return sl.includes(studentLevel);
      }).slice(0, 5);
      setItems(list);
      if (list.length) {
        const { data: s } = await supabase.from("assignment_submissions").select("*").eq("user_id", userId).in("assignment_id", list.map((a:any)=>a.id));
        const m: Record<string,any> = {};
        (s||[]).forEach((sub:any) => { m[sub.assignment_id] = sub; });
        setSubs(m);
      }
      setLoading(false);
    };
    fetch();
  }, [userId]);

  const pending = items.filter(a => !subs[a.id] && new Date(a.deadline||"9999") > new Date());
  const overdue = items.filter(a => !subs[a.id] && a.deadline && new Date(a.deadline) < new Date());
  if (!loading && items.length === 0) return null;

  return (
    <div style={{ background:"#fff", border:`1px solid ${BORDER}`, borderRadius:18, boxShadow:"0 2px 12px rgba(0,0,0,.06)", overflow:"hidden" }}>
      <div style={{ padding:"14px 18px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <ClipboardCheck style={{ width:16, height:16, color:MID_GREEN }} />
          <span style={{ fontSize:15, fontWeight:800, color:TEXT_DARK, fontFamily:"'Playfair Display',serif" }}>{t("Assignments","الواجبات")}</span>
          {overdue.length > 0 && <span style={{ background:"#c0392b", color:"#fff", fontSize:10, fontWeight:800, padding:"2px 7px", borderRadius:20 }}>{overdue.length} {t("overdue","متأخر")}</span>}
          {pending.length > 0 && <span style={{ background:GOLD+"22", color:GOLD, fontSize:10, fontWeight:800, padding:"2px 7px", borderRadius:20, border:`1px solid ${GOLD}44` }}>{pending.length} {t("due","قادم")}</span>}
        </div>
        <button onClick={()=>navigate("/student/assignments")} style={{ fontSize:11, fontWeight:700, color:GOLD, background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
          {t("View all","عرض الكل")} <ArrowRight style={{ width:12, height:12 }} />
        </button>
      </div>
      <div style={{ padding:"10px 14px", display:"flex", flexDirection:"column", gap:8 }}>
        {loading ? (
          <div style={{ height:60, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div style={{ width:24, height:24, borderRadius:"50%", border:`3px solid ${MID_GREEN}`, borderTopColor:"transparent", animation:"spin .7s linear infinite" }} />
          </div>
        ) : items.slice(0,4).map((a:any) => {
          const sub  = subs[a.id];
          const late = !sub && a.deadline && new Date(a.deadline) < new Date();
          const done = sub?.status === "graded";
          const sent = !!sub && !done;
          const title = language === "ar" ? (a.title_ar||a.title) : a.title;
          return (
            <div key={a.id} onClick={()=>navigate("/student/assignments")} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 10px", borderRadius:12, background: late?"#fff5f5": done?"#f0fdf4": sent?"#eff6ff":"#f8fafb", border:`1px solid ${late?"#fca5a5": done?"#86efac": sent?"#93c5fd":BORDER}`, cursor:"pointer" }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background: late?"#c0392b": done?"#276749": sent?"#1d4ed8":GOLD, flexShrink:0 }} />
              <span style={{ fontSize:13, fontWeight:700, color:TEXT_DARK, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{title}</span>
              {late  && <span style={{ fontSize:10, fontWeight:800, color:"#c0392b" }}>{t("Late","متأخر")}</span>}
              {done  && <span style={{ fontSize:10, fontWeight:800, color:"#276749" }}>{sub.grade ?? "✓"}</span>}
              {sent  && <span style={{ fontSize:10, fontWeight:800, color:"#1d4ed8" }}>{t("Sent","أُرسل")}</span>}
              {!sub && !late && a.deadline && <span style={{ fontSize:10, color:TEXT_LIGHT }}>{new Date(a.deadline).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const StudentDashboard = () => {
  const { t, language } = useLanguage();
  const { user, profile, refreshProfile } = useAuth();
  const { effectiveUserId, isImpersonating } = useImpersonation();
  const { isPrivateStudent, allowGeneralAccess } = usePrivateStudent();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [stats, setStats] = useState({ enrollments: 0, attemptsDone: 0, avgScore: 0, pendingGrading: 0, cgpa: 0 });
  const [upcomingExams, setUpcomingExams] = useState<any[]>([]);
  const [recentResults, setRecentResults] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [liveSubjects, setLiveSubjects] = useState<any[]>([]);
  const [allExamsForCalendar, setAllExamsForCalendar] = useState<any[]>([]);
  const [subjectAssignments, setSubjectAssignments] = useState<any[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showAllNotifs, setShowAllNotifs] = useState(false);
  const [greetingSpoken, setGreetingSpoken] = useState(false);
  const [impersonatedProfile, setImpersonatedProfile] = useState<any>(null);
  const [todayClasses, setTodayClasses] = useState<any[]>([]);
  const [nowTick, setNowTick] = useState(new Date());
  const [privateSubjectIds, setPrivateSubjectIds] = useState<Set<string>>(new Set());

  // Tick every 30s so countdowns stay fresh
  useEffect(() => {
    const iv = setInterval(() => setNowTick(new Date()), 30_000);
    return () => clearInterval(iv);
  }, []);

  // Load impersonated student's profile
  useEffect(() => {
    if (!isImpersonating) return;
    supabase.from("profiles").select("*").eq("user_id", effectiveUserId).maybeSingle()
      .then(({ data }) => { if (data) setImpersonatedProfile(data); });
  }, [isImpersonating, effectiveUserId]);

  const displayProfile = isImpersonating ? impersonatedProfile : profile;

  // ── Voice greeting — short, simple, works everywhere ─────────
  useEffect(() => {
    if (!profile?.full_name || greetingSpoken || loading || isImpersonating) return;
    // Use sessionStorage to prevent double-play across re-renders and hot reloads
    const key = 'tahleem-greeted-' + (user?.id || '');
    if (sessionStorage.getItem(key)) { setGreetingSpoken(true); return; }

    const firstName = (profile.full_name || 'student').split(' ')[0];
    const doSpeak = (voices: SpeechSynthesisVoice[]) => {
      window.speechSynthesis.cancel();
      const pick = (filters: ((v: SpeechSynthesisVoice) => boolean)[]) => {
        for (const f of filters) { const v = voices.find(f); if (v) return v; }
        return voices[0] || null;
      };

      // Strictly Arabic male voices only
      const bestVoice = pick([
        v => /Majed|Maged|Hatem|Tarik|Basem|Mehdi|Hamed|Naief|Mohammed|Ahmad|Omar|Khalid|Ali|Zaid/i.test(v.name) && v.lang.startsWith('ar'),
        v => v.lang === 'ar-SA' && !(/female|Laila|Amira|Fatima|Maryam|Salma|Hala|Lana/i.test(v.name)),
        v => v.lang === 'ar-EG' && !(/female|Laila|Amira|Fatima|Maryam|Salma|Hala|Lana/i.test(v.name)),
        v => v.lang.startsWith('ar') && !(/female|Laila|Amira|Fatima|Maryam|Salma|Hala|Lana/i.test(v.name)),
        v => v.lang.startsWith('ar'),
      ]);

      // Only speak if we found an Arabic voice — skip otherwise to avoid non-Arabic accent
      if (!bestVoice || !bestVoice.lang.startsWith('ar')) {
        sessionStorage.setItem(key, '1');
        setGreetingSpoken(true);
        return;
      }

      const text = "السلام عليكم ورحمة الله " + firstName + " أهلًا وسهلًا بك في أكاديمية التحليم";
      const u = new SpeechSynthesisUtterance(text);
      u.lang   = 'ar-SA';
      u.rate   = 0.68;
      u.pitch  = 0.42;
      u.volume = 0.9;
      u.voice  = bestVoice;
      window.speechSynthesis.speak(u);
      sessionStorage.setItem(key, '1');
      setGreetingSpoken(true);
    };

    const trySpeak = () => {
      if (!window.speechSynthesis) return;
      const vs = window.speechSynthesis.getVoices();
      if (vs.length > 0) {
        doSpeak(vs);
      } else {
        const h = () => {
          window.speechSynthesis.removeEventListener('voiceschanged', h);
          doSpeak(window.speechSynthesis.getVoices());
        };
        window.speechSynthesis.addEventListener('voiceschanged', h);
        setTimeout(() => {
          window.speechSynthesis.removeEventListener('voiceschanged', h);
          if (!sessionStorage.getItem(key)) doSpeak(window.speechSynthesis.getVoices());
        }, 2000);
      }
    };

    const onGesture = () => {
      document.removeEventListener('click',      onGesture);
      document.removeEventListener('touchstart', onGesture);
      document.removeEventListener('keydown',    onGesture);
      setTimeout(trySpeak, 150);
    };
    document.addEventListener('click',      onGesture, { once: true });
    document.addEventListener('touchstart', onGesture, { once: true });
    document.addEventListener('keydown',    onGesture, { once: true });

    return () => {
      document.removeEventListener('click',      onGesture);
      document.removeEventListener('touchstart', onGesture);
      document.removeEventListener('keydown',    onGesture);
    };
  }, [profile?.full_name, greetingSpoken, loading, user?.id]);

  const hijri = toHijri(new Date());
  const today = new Date();

  // Is any of today's scheduled classes happening right now?
  const hasLiveClassNow = todayClasses.some((slot: any) => {
    const startMins = minsUntilTime(slot.start_time);
    const endMins   = minsUntilTime(slot.end_time);
    return startMins <= 0 && endMins > 0;
  });

  useEffect(() => {
    if (!effectiveUserId) return;
    const fetchData = async () => {
      setFetchError(null);
      if (!isImpersonating) await refreshProfile().catch(() => {});
      try {
        const uid = effectiveUserId;

        // ── iOS-safe timeout: 13 simultaneous queries can hang on slow
        // cellular. Race the whole batch against a 12-second deadline so
        // the spinner never freezes forever on iPhone.
        const withTimeout = <T,>(p: Promise<T>, ms = 12000): Promise<T> =>
          Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

        const [enrollRes, gradedAttemptsRes, pendingAttemptsRes, notifsRes, assignmentsRes,
          recentRes, allAttemptsRes, subjectsRes, calendarExamsRes, subAssignmentsRes, ttRes,
          privateSubjectsRes, studentProfileRes] = await withTimeout(Promise.all([
          supabase.from("enrollments").select("id").eq("user_id", uid),
          supabase.from("exam_attempts").select("percentage").eq("user_id", uid).eq("status", "graded"),
          supabase.from("exam_attempts").select("id").eq("user_id", uid).eq("status", "submitted"),
          supabase.from("notifications").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(20),
          supabase.from("exam_assignments").select("exam_id, exams(*)").eq("user_id", uid),
          supabase.from("exam_attempts").select("*, exams(title, title_ar)").eq("user_id", uid).in("status", ["graded", "submitted"]).order("submitted_at", { ascending: false }).limit(5),
          supabase.from("exam_attempts").select("exam_id, status, percentage").eq("user_id", uid),
          supabase.from("subjects").select("*").eq("is_active", true).limit(4),
          supabase.from("exams").select("id, title, title_ar, start_date, end_date, time_limit_minutes").eq("is_published", true),
          supabase.from("subject_assignments").select("id, title, deadline, subject_id, subjects(title, title_ar, level, levels)"),
          supabase.from("subject_timetable" as any).select("*, subjects(id, title, title_ar, levels, level, visibility)").eq("day_of_week", new Date().getDay()).eq("is_active", true).order("start_time"),
          (supabase as any).from("private_student_subjects").select("subject_id").eq("student_id", uid),
          supabase.from("profiles").select("level, student_type, assigned_teacher_id").eq("user_id", uid).maybeSingle(),
        ]));
      const gradedAttempts = gradedAttemptsRes.data || [];
      const avg = gradedAttempts.length > 0 ? gradedAttempts.reduce((s, a) => s + (Number(a.percentage) || 0), 0) / gradedAttempts.length : 0;
      const totalGP = gradedAttempts.reduce((sum, a) => sum + gradePoint(Number(a.percentage) || 0), 0);
      const cgpa = gradedAttempts.length > 0 ? totalGP / gradedAttempts.length : 0;
      const attemptCounts: Record<string, number> = {};
      (allAttemptsRes.data || []).forEach((a: any) => { if (a.status !== "in_progress") attemptCounts[a.exam_id] = (attemptCounts[a.exam_id] || 0) + 1; });
      const allAssigned = (assignmentsRes.data || []).map((a: any) => a.exams).filter((e: any) => e && e.is_published);      const upcoming = allAssigned.filter((e: any) => (attemptCounts[e.id] || 0) < (e.max_attempts || 1));
      setStats({ enrollments: enrollRes.data?.length || 0, attemptsDone: gradedAttempts.length, avgScore: Math.round(avg), pendingGrading: pendingAttemptsRes.data?.length || 0, cgpa });
      setUpcomingExams(upcoming.slice(0, 5));
      setRecentResults(recentRes.data || []);
      setNotifications(notifsRes.data || []);
      setLiveSubjects(subjectsRes.data || []);
      setAllExamsForCalendar(calendarExamsRes.data || []);
      const studentProfileData = studentProfileRes?.data ?? null;
      const studentLevelForCalendar = (studentProfileData as any)?.level || (displayProfile as any)?.level || null;
      const filteredSubjAsgn = (subAssignmentsRes.data || []).filter((a: any) => {
        const subj = a.subjects;
        if (!subj) return true;
        const sl: string[] = subj.levels || (subj.level ? [subj.level] : []);
        if (sl.length === 0) return true;
        if (!studentLevelForCalendar) return false;
        return sl.includes(studentLevelForCalendar);
      });
      setSubjectAssignments(filteredSubjAsgn);

      // ── Filter timetable slots to only what this student should see ────
      // Get student's level and private subject IDs first
      const privateIds = new Set<string>((privateSubjectsRes?.data || []).map((r: any) => String(r.subject_id)));
      setPrivateSubjectIds(privateIds);

      const studentLevel     = (studentProfileData as any)?.level || (displayProfile as any)?.level || null;
      const studentType      = (studentProfileData as any)?.student_type || "group";

      const allTtSlots: any[] = ttRes.data || [];
      const filteredSlots = allTtSlots.filter(slot => {
        const subj = slot.subjects as any;

        // Private student: show only their assigned private subjects
        // (plus general-access subjects if allowGeneralAccess is true)
        if (studentType === "private") {
          const isPrivateSubject = privateIds.has(slot.subject_id);
          if (isPrivateSubject) return true;
          // If private student doesn't have general access, hide all group slots
          if (!allowGeneralAccess) return false;
        }

        // Slot has explicit level restrictions — check student's level matches
        const slotLevels: string[] = slot.levels || [];
        const subjLevels: string[] = subj?.levels || (subj?.level ? [subj.level] : []);
        const allLevels = [...new Set([...slotLevels, ...subjLevels])];

        if (allLevels.length > 0 && studentLevel) {
          return allLevels.includes(studentLevel);
        }

        // No level restriction → visible to all group students
        return true;
      });

      setTodayClasses(filteredSlots);
        setLoading(false);
      } catch (err) {
        console.error("Dashboard data fetch error:", err);
        setFetchError(t(
          "Unable to load your dashboard. Please check your connection and try again.",
          "تعذّر تحميل لوحة التحكم. يرجى التحقق من اتصالك والمحاولة مجدداً."
        ));
        setLoading(false);
      }
    };
    fetchData();
  }, [effectiveUserId]);

  // ── Realtime notifications — live updates ─────────
  // Realtime socket kept open ONLY while the tab is visible. A backgrounded tab
  // holding an open WebSocket is what makes Android evict it outright, which on
  // return looks exactly like a full page reload (students only — the staff
  // dashboards don't stack several of these sockets).
  useVisibleRealtime(
    () => {
      if (!effectiveUserId) return null;
      return supabase
        .channel('student-notifications')
        .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${effectiveUserId}` },
        (payload) => {
          setNotifications(prev => [payload.new as any, ...prev]);
          // Browser notification if permitted — guard 'Notification in window'
          // first: some Capacitor/WebView contexts don't define it at all, and
          // referencing it directly throws a ReferenceError that ErrorBoundary
          // catches and silently reloads the whole page on.
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(payload.new.title || 'Tahleem Academy', {
              body: payload.new.message || '',
              icon: '/favicon.ico',
            });
          }
        }
      )
        .subscribe();
    },
    [effectiveUserId],
  );

  useEffect(() => {
    if (!effectiveUserId) return;
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [effectiveUserId]);

  const calendarYear = calendarMonth.getFullYear();
  const calendarMonthIdx = calendarMonth.getMonth();
  const daysInMonth = new Date(calendarYear, calendarMonthIdx + 1, 0).getDate();
  const firstDayOfWeek = new Date(calendarYear, calendarMonthIdx, 1).getDay();
  const getEventsForDay = (day: number) => {
    const dateStr = `${calendarYear}-${String(calendarMonthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const events: { type: string; title: string; color: string }[] = [];
    allExamsForCalendar.forEach(e => { if (e.start_date?.startsWith(dateStr)) events.push({ type: 'exam', title: e.title_ar || e.title, color: '#c0392b' }); });
    subjectAssignments.forEach(a => { if (a.deadline?.startsWith(dateStr)) events.push({ type: 'assignment', title: a.title, color: GOLD }); });
    return events;
  };
  const prevMonth = () => setCalendarMonth(new Date(calendarYear, calendarMonthIdx - 1, 1));
  const nextMonth = () => setCalendarMonth(new Date(calendarYear, calendarMonthIdx + 1, 1));
  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };
  const unreadCount = notifications.filter(n => !n.is_read).length;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - ((stats.cgpa / 4.0) * circumference);

  const card: React.CSSProperties = {
    background: "#fff", border: `1px solid ${BORDER}`,
    borderRadius: 18, boxShadow: "0 2px 12px rgba(0,0,0,.06)", overflow: "hidden",
  };

  const sectionTitle = (en: string, ar: string) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: TEXT_DARK, fontFamily: "'Playfair Display', serif" }}>{t(en, ar)}</div>    </div>
  );

  // ── Loading / Pending State ─────────
  if (loading) return (
    <div style={{ background: CREAM, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: "4px solid #064E3B", borderTopColor: "transparent", animation: "spin .7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (fetchError) return (
    <div className="container mx-auto flex flex-col items-center justify-center px-4 py-24 text-center">
      <AlertTriangle className="mb-4 h-12 w-12 text-destructive" aria-hidden="true" />
      <h2 className="mb-2 text-xl font-bold">{t("Something went wrong", "حدث خطأ ما")}</h2>
      <p className="mb-6 max-w-sm text-muted-foreground">{fetchError}</p>
      <Button onClick={() => { setLoading(true); setFetchError(null); }}>
        {t("Try Again", "حاول مجدداً")}
      </Button>
    </div>
  );

  return (
    <div style={{ background: CREAM, minHeight: "100vh", fontFamily: "'Cairo', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;700&family=Amiri+Quran&family=Amiri:wght@400;700&family=Cairo:wght@400;600;700;900&family=Playfair+Display:wght@500;700&display=swap');
        .dwani-text {
          font-family: 'Scheherazade New', 'Amiri Quran', 'Amiri', serif !important;
        }
        .qa-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .qa-scroll::-webkit-scrollbar { display: none; }
        .qa-tile { transition: transform .15s ease; }
        .qa-tile:active { transform: scale(0.94); }
        @keyframes livePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.45); }
          50% { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 40px", display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Academy status banner — holiday / maintenance */}
        <AcademyStatusBanner />
        <NotificationPermissionBanner />

        <div style={{
          background: `linear-gradient(160deg, ${DARK_GREEN} 0%, ${MID_GREEN} 50%, #1a5c35 100%)`,
          borderRadius: 22, overflow: "hidden", position: "relative",
          boxShadow: "0 8px 32px rgba(15,45,31,0.25)"
        }}>
          <div style={{ position:"absolute", top:-50, right:-50, width:180, height:180, borderRadius:"50%", background:"rgba(255,255,255,0.03)", pointerEvents:"none" }} />
          <div style={{ position:"absolute", bottom:-40, left:-40, width:140, height:140, borderRadius:"50%", background:"rgba(255,255,255,0.03)", pointerEvents:"none" }} />
          <div style={{ position:"absolute", top:"40%", right:-20, width:80, height:80, borderRadius:"50%", background:"rgba(201,168,76,0.06)", pointerEvents:"none" }} />

          <div style={{ padding: "20px 20px 0", position:"relative", zIndex:1 }}>
            {/* Top row: Bismillah (always centered) + Level/Type badge (flush right) */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", gap:10, position:"relative", minHeight:20 }}>
              <span className="dwani-text" style={{ position:"absolute", left:"50%", top:"50%", transform:"translate(-50%, -50%)", fontSize:13, color:"rgba(255,255,255,0.9)", fontWeight:700, letterSpacing:"0.06em", textShadow:"0 1px 6px rgba(0,0,0,0.3)", whiteSpace:"nowrap" as const }}>
                بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
              </span>
              {/* Level / Type badge */}
              {(() => {
                const rawLevel = (displayProfile as any)?.level || (displayProfile as any)?.course_level;
                if (isPrivateStudent) {
                  const hasAccess = allowGeneralAccess;
                  return (
                    <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, fontWeight:800, padding:"4px 10px", borderRadius:20, flexShrink:0,
                      background: hasAccess ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.12)",
                      color:"#fff", border:"1px solid rgba(255,255,255,0.25)", backdropFilter:"blur(4px)", lineHeight:1 }}>
                      <Lock style={{ width:9, height:9, flexShrink:0 }} />
                      <span style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:1 }}>
                        <span>{hasAccess ? "Private + General" : "Private"}</span>
                        <span style={{ fontFamily:"'Amiri',serif", fontSize:9, opacity:0.85 }}>{hasAccess ? "خاص + عام" : "خاص"}</span>
                      </span>
                    </span>
                  );
                }
                const levelLabels: Record<string,{en:string;ar:string;bg:string;color:string}> = {
                  beginner:     { en:"Beginner",     ar:"مبتدئ",  bg:"rgba(34,197,94,0.2)",  color:"#86efac" },
                  intermediate: { en:"Intermediate", ar:"متوسط",  bg:"rgba(251,191,36,0.2)", color:"#fde68a" },
                  advanced:     { en:"Advanced",     ar:"متقدم",  bg:"rgba(239,68,68,0.2)",  color:"#fca5a5" },
                  tamhidi:      { en:"Tamhidi",      ar:"تمهيدي", bg:"rgba(99,102,241,0.2)", color:"#c7d2fe" },
                };
                const lc = rawLevel
                  ? (levelLabels[rawLevel] || { en: rawLevel, ar: rawLevel, bg:"rgba(255,255,255,0.12)", color:"rgba(255,255,255,0.8)" })
                  : { en: "Level not set", ar: "لم يُحدد المستوى", bg:"rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.7)" };
                return (
                  <span style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:1, fontSize:10, fontWeight:800, padding:"4px 10px", borderRadius:20, flexShrink:0,
                    background:lc.bg, color:lc.color, border:`1px solid ${lc.color}44`, lineHeight:1 }}>
                    <span>{lc.en}</span>
                    <span style={{ fontFamily:"'Amiri',serif", fontSize:9, opacity:0.9 }}>{lc.ar}</span>
                  </span>
                );
              })()}
            </div>

            {/* Hijri date — its own centered line */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, margin:"16px 0 18px" }}>
              <div style={{ flex:1, maxWidth:50, height:"1px", background:"rgba(255,255,255,0.18)" }} />
              <div style={{ background:`linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD})`, borderRadius:30, padding:"7px 18px", display:"inline-flex", alignItems:"center", gap:8, boxShadow:`0 4px 16px ${GOLD}4d` }}>
                <Calendar style={{ width:13, height:13, color:DARK_GREEN, flexShrink:0 }} />
                <span style={{ fontSize:13, color:DARK_GREEN, fontFamily:"'Amiri',serif", fontWeight:900, whiteSpace:"nowrap" as const }} dir="rtl">{hijri.full}</span>
              </div>
              <div style={{ flex:1, maxWidth:50, height:"1px", background:"rgba(255,255,255,0.18)" }} />
            </div>

            <div style={{ textAlign:"center", paddingBottom:4 }}>
              <div style={{ margin:"0 auto 8px", textAlign:"center" }}>
                <span className="dwani-text" style={{
                  fontSize: 30,
                  fontWeight: 700,
                  color: "#fff",
                  lineHeight: 1.8,
                  display: "block",
                  letterSpacing: "0.08em",
                  textShadow: `0 2px 24px rgba(201,168,76,0.4), 0 0 60px rgba(255,255,255,0.1)`,
                  filter: "drop-shadow(0 3px 10px rgba(0,0,0,0.45))",
                }} dir="rtl">
                  ٱلسَّلَامُ عَلَيْكُم
                </span>
              </div>
              <p style={{ fontSize:18, fontWeight:700, color:"#fff", margin:"0 0 4px", letterSpacing:"-0.2px" }}>
                {t(`Marhaban, ${displayProfile?.full_name || "Student"}! 👋`, `مرحباً، ${displayProfile?.full_name || "طالب"}! 👋`)}
              </p>
              <p style={{ fontSize:12, color:"rgba(255,255,255,0.5)", margin:0, fontWeight:600 }}>
                {today.toLocaleDateString(language === "ar" ? "ar-SA" : "en-US", { weekday:"long", month:"long", day:"numeric" })}
              </p>
            </div>
          </div>
        </div>

        {/* ── Quick Actions ── */}
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
            <Star style={{ width:13, height:13, color:GOLD, fill:GOLD, flexShrink:0 }} />
            <span style={{ fontSize:15, fontWeight:800, color:TEXT_DARK, fontFamily:"'Playfair Display',serif" }}>
              {t("Quick Actions", "الإجراءات السريعة")}
            </span>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, rowGap:18 }}>
            {([
              { to:"/student/hifdh-daily",  icon:Mic,           label:t("Daily Hifdh","الحفظ اليومي"),  grad:`linear-gradient(135deg, ${MID_GREEN}, ${DARK_GREEN})`,  iconColor:"#fff", show: true, live:false },
              { to:"/student/live-classes", icon:Video,         label:t("Live Classes","الفصول الحية"), grad:"linear-gradient(135deg,#4299e1,#2b6cb0)",               iconColor:"#fff", show: !isPrivateStudent || allowGeneralAccess, live: hasLiveClassNow },
              { to:"/student/exams",        icon:ClipboardList, label:t("My Exams","امتحاناتي"),        grad:"linear-gradient(135deg,#48bb78,#276749)",               iconColor:"#fff", show: true, live:false },
              { to:"/student/transcripts",  icon:GraduationCap, label:t("Transcripts","السجلات"),       grad:`linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD})`,       iconColor:DARK_GREEN, show: true, live:false },
              { to:"/student/majlis",       icon:MessageCircle, label:t("Al-Majlis","المجلس"),          grad:"linear-gradient(135deg,#9f7aea,#6b46c1)",               iconColor:"#fff", show: true, live:false },
              { to:"/student/courses",      icon:BookOpen,      label:t("Courses","الدروس"),            grad:"linear-gradient(135deg,#f56565,#c0392b)",               iconColor:"#fff", show: true, live:false },
            ] as const).filter(a => a.show).map((action, i) => (
              <Link to={action.to} key={i} className="qa-tile" style={{ textDecoration:"none" }}>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:7 }}>
                  <div style={{ position:"relative", width:"100%", maxWidth:58, margin:"0 auto" }}>
                    <div style={{ width:"100%", aspectRatio:"1", borderRadius:18, background:action.grad, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 6px 16px rgba(15,45,31,0.18)" }}>
                      <action.icon style={{ width:24, height:24, color:action.iconColor }} />
                    </div>
                    {action.live && (
                      <span style={{
                        position:"absolute", top:-6, right:-6, display:"flex", alignItems:"center", gap:3,
                        background:"#ef4444", color:"#fff", fontSize:8, fontWeight:800, letterSpacing:"0.04em",
                        borderRadius:20, padding:"2px 6px", boxShadow:"0 2px 6px rgba(239,68,68,0.5)",
                        border:"1.5px solid #fff", animation:"livePulse 1.6s infinite",
                      }}>
                        <span style={{ width:5, height:5, borderRadius:"50%", background:"#fff" }} />
                        {t("LIVE","مباشر")}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, color:TEXT_DARK, textAlign:"center", lineHeight:1.25 }}>{action.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Assignments Preview ── */}
        <AssignmentPreview userId={effectiveUserId} t={t} language={language} navigate={navigate} />

        {/* ── Islamic Daily Feed (Quran · Hadith · Tawheed · Seerah · Events · News) ── */}
        <IslamicDailyFeed language={language} />

        {/* ── Today's Classes ── */}
        {todayClasses.length > 0 && (!isPrivateStudent || allowGeneralAccess) && (() => {
          const handleJoinClass = async (slot: any) => {
            if (slot.live_url) { window.open(slot.live_url, "_blank", "noopener"); return; }
            if (!slot.subject_id) return;
            const todayStr = new Date().toISOString().split("T")[0];
            const { data: existing } = await supabase.from("live_sessions").select("id").eq("subject_id", slot.subject_id).in("status", ["live","scheduled","active"]).limit(1).maybeSingle();
            if (!existing) await supabase.from("live_sessions").insert({ subject_id: slot.subject_id, scheduled_at: `${todayStr}T${slot.start_time}`, duration_minutes: slot.duration_minutes||60, status: "scheduled", chat_enabled: true, hand_raise_enabled: true, recording_enabled: true, whiteboard_enabled: false, waiting_room_enabled: false } as any);
            navigate(`/student/live-classes?subject=${slot.subject_id}&autoJoin=true`);
          };
          return (
          <div style={card}>
            <div style={{ padding:"16px 18px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <Video style={{ width:16, height:16, color:MID_GREEN }} />
                <span style={{ fontSize:15, fontWeight:800, color:TEXT_DARK, fontFamily:"'Playfair Display',serif" }}>{t("Today's Classes","حصص اليوم")}</span>
              </div>
              <button onClick={() => navigate("/student/timetable")} style={{ fontSize:11, fontWeight:600, color:GOLD, background:"none", border:"none", cursor:"pointer" }}>
                {t("Full schedule","الجدول الكامل")}
              </button>
            </div>
            <div style={{ padding:"12px 16px", display:"flex", flexDirection:"column", gap:8 }}>
              {todayClasses.map((slot: any) => {
                const mins    = minsUntilTime(slot.start_time);
                const isNow   = mins >= -30 && mins <= 0;
                const isSoon  = mins > 0 && mins <= 15;
                const isPast  = mins < -30;
                const canJoin = isNow || isSoon;
                const title   = language === "ar" ? slot.subjects?.title_ar || slot.subjects?.title : slot.subjects?.title;
                const minsRnd = Math.round(Math.abs(mins));
                return (
                  <div key={slot.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:12, background: isNow ? "#f0fff4" : isSoon ? "#fffbeb" : "#f8fafb", border:`1px solid ${isNow ? "#9ae6b4" : isSoon ? "#f6d860" : BORDER}`, opacity: isPast ? .5 : 1 }}>
                    <div style={{ flexShrink:0, textAlign:"center", minWidth:52 }}>
                      <div style={{ fontSize:13, fontWeight:900, color: isNow ? MID_GREEN : TEXT_DARK }}>{to12hr(slot.start_time)}</div>
                      {isNow  && (
                        <span style={{ display:"inline-flex", alignItems:"center", gap:3, fontSize:9, fontWeight:800, color:"#16a34a" }}>
                          <span style={{ width:6, height:6, borderRadius:"50%", background:"#22c55e", animation:"livePulse 1.6s infinite" }} />
                          {t("LIVE","مباشر")}
                        </span>
                      )}
                      {isSoon && <span style={{ fontSize:9, fontWeight:700, color:"#b7791f" }}>{minsRnd}m</span>}
                      {isPast && <span style={{ fontSize:9, color:TEXT_LIGHT }}>{t("Ended","انتهى")}</span>}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:13, fontWeight:700, color:TEXT_DARK, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{title}</p>
                      <p style={{ fontSize:11, color:TEXT_LIGHT, margin:"2px 0 0" }}>
                        {to12hr(slot.start_time)} – {to12hr(slot.end_time)}
                        {slot.duration_minutes ? ` · ${slot.duration_minutes}m` : ""}
                      </p>
                    </div>
                    {!isPast && (
                      canJoin ? (
                        <button onClick={() => handleJoinClass(slot)} style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 14px", borderRadius:10, border:"none", background: isNow ? `linear-gradient(135deg, ${MID_GREEN}, ${DARK_GREEN})` : `linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD})`, color: isNow ? "#fff" : DARK_GREEN, fontSize:11, fontWeight:800, cursor:"pointer", flexShrink:0, boxShadow: isNow ? "0 4px 12px rgba(15,45,31,0.25)" : `0 4px 12px ${GOLD}55` }}>
                          <Video style={{ width:11, height:11 }} />
                          {t("Join","انضمام")}
                        </button>
                      ) : (
                        <div style={{ fontSize:9, color:TEXT_LIGHT, flexShrink:0, textAlign:"center" }}>
                          <Clock style={{ width:10, height:10, display:"block", margin:"0 auto 2px" }} />
                          {minsRnd > 60 ? `${Math.floor(minsRnd/60)}h` : `${minsRnd}m`}
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          );
        })()}

        {/* ── Academic Snapshot ── */}
        <div style={card}>
          <div style={{ padding:"16px 18px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:8 }}>
            <TrendingUp style={{ width:16, height:16, color:MID_GREEN }} />
            <span style={{ fontSize:15, fontWeight:800, color:TEXT_DARK, fontFamily:"'Playfair Display',serif" }}>
              {t("Academic Snapshot", "نظرة أكاديمية")}
            </span>
          </div>
          <div style={{ padding:"18px 16px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:18, flexWrap:"wrap" as const }}>
              <div style={{ position:"relative", flexShrink:0 }}>
                <svg width={110} height={110} style={{ transform:"rotate(-90deg)" }}>
                  <circle cx={55} cy={55} r={45} stroke={BORDER} strokeWidth={9} fill="none" />
                  <circle cx={55} cy={55} r={45} stroke={GOLD} strokeWidth={9} fill="none"
                    strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                    style={{ transition:"stroke-dashoffset 1s ease" }} />
                </svg>
                <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                  <span style={{ fontSize:22, fontWeight:900, color:TEXT_DARK, fontFamily:"'Playfair Display',serif" }}>{stats.cgpa.toFixed(2)}</span>
                  <span style={{ fontSize:10, fontWeight:600, color:TEXT_LIGHT }}>CGPA</span>
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, flex:1 }}>
                {[
                  { icon:BookOpen, label:t("Enrollments","التسجيلات"), value:stats.enrollments, color:"#276749", grad:"linear-gradient(135deg,#48bb78,#276749)", link:"/student/courses" },
                  { icon:ClipboardList, label:t("Graded Exams","اختبارات مصححة"), value:stats.attemptsDone, color:"#b7791f", grad:`linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD})`, link:"/student/exams" },
                  { icon:TrendingUp, label:t("Avg Score","متوسط الدرجات"), value:`${stats.avgScore}%`, color:"#2b6cb0", grad:"linear-gradient(135deg,#4299e1,#2b6cb0)", link:"/student/transcripts" },
                  { icon:Bell, label:t("Pending","بانتظار المراجعة"), value:stats.pendingGrading, color:"#c0392b", grad:"linear-gradient(135deg,#f56565,#c0392b)", link:"/student/exams" },
                ].map((s,i) => (
                  <div key={i} onClick={() => navigate(s.link)} className="qa-tile"
                    style={{ textAlign:"center", borderRadius:14, background:"#fff", padding:"12px 8px", cursor:"pointer", border:`1px solid ${BORDER}`, boxShadow:"0 2px 8px rgba(0,0,0,.04)" }}>
                    <div style={{ width:34, height:34, borderRadius:10, background:s.grad, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 7px", boxShadow:`0 3px 10px ${s.color}33` }}>
                      <s.icon style={{ width:16, height:16, color: s.color === "#b7791f" ? DARK_GREEN : "#fff" }} />
                    </div>
                    <div style={{ fontSize:20, fontWeight:900, color:TEXT_DARK }}>{s.value}</div>
                    <div style={{ fontSize:10, fontWeight:600, color:TEXT_LIGHT, marginTop:2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>        </div>

        {/* ── Academic Calendar ── */}
        <div style={card}>
          <div style={{ padding:"16px 18px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <Calendar style={{ width:16, height:16, color:MID_GREEN }} />
              <span style={{ fontSize:15, fontWeight:800, color:TEXT_DARK, fontFamily:"'Playfair Display',serif" }}>{t("Academic Calendar","التقويم الأكاديمي")}</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <button onClick={prevMonth} style={{ width:28, height:28, borderRadius:8, border:`1px solid ${BORDER}`, background:"#f8fafb", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <ChevronLeft style={{ width:14, height:14, color:TEXT_MED }} />
              </button>
              <div style={{ textAlign:"center", minWidth:100 }}>
                <div style={{ fontSize:12, fontWeight:700, color:TEXT_DARK }}>
                  {calendarMonth.toLocaleDateString(language==="ar"?"ar-SA":"en-US", { month:"long", year:"numeric" })}
                </div>
                <div style={{ fontSize:9, color:TEXT_LIGHT }} dir="rtl">                  {(() => { const h=toHijri(new Date(calendarYear,calendarMonthIdx,15)); return `${h.month} ${h.year} هـ`; })()}
                </div>
              </div>
              <button onClick={nextMonth} style={{ width:28, height:28, borderRadius:8, border:`1px solid ${BORDER}`, background:"#f8fafb", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <ChevronRight style={{ width:14, height:14, color:TEXT_MED }} />
              </button>
            </div>
          </div>
          <div style={{ padding:"14px 14px" }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:6 }}>
              {(language==="ar" ? ["أحد","إثن","ثلا","أرب","خمي","جمع","سبت"] : ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]).map(d=>(
                <div key={d} style={{ textAlign:"center", fontSize:10, fontWeight:600, color:TEXT_LIGHT, padding:"4px 0" }}>{d}</div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
              {Array.from({length:firstDayOfWeek}).map((_,i)=><div key={`e${i}`} style={{ height:40 }} />)}
              {Array.from({length:daysInMonth}).map((_,i)=>{
                const day=i+1; const events=getEventsForDay(day);
                const isToday=day===today.getDate()&&calendarMonthIdx===today.getMonth()&&calendarYear===today.getFullYear();
                const hijriDay=toHijri(new Date(calendarYear,calendarMonthIdx,day));
                return (
                  <div key={day} title={events.map(e=>e.title).join(", ")}
                    style={{ height:40, borderRadius:8, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", position:"relative",
                      background:isToday?DARK_GREEN:events.length>0?"#f0fff4":"transparent",
                      border: isToday?`1px solid ${DARK_GREEN}`:events.length>0?`1px solid #9ae6b4`:`1px solid transparent`,
                    }}>
                    <span style={{ fontSize:12, fontWeight:isToday||events.length>0?700:400, color:isToday?"#fff":TEXT_DARK, lineHeight:1 }}>{day}</span>
                    <span style={{ fontSize:8, color:isToday?"rgba(255,255,255,0.6)":TEXT_LIGHT, lineHeight:1, marginTop:1 }} dir="rtl">{hijriDay.day}</span>
                    {events.length>0 && (
                      <div style={{ display:"flex", gap:2, position:"absolute", bottom:3 }}>
                        {events.slice(0,3).map((e,ei)=><div key={ei} style={{ width:4, height:4, borderRadius:"50%", background:e.color }} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ display:"flex", gap:14, marginTop:12, flexWrap:"wrap" as const }}>
              {[["#c0392b","Exam","امتحان"],[GOLD,"Assignment","واجب"],[DARK_GREEN,"Today","اليوم"]].map(([col,en,ar],i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:TEXT_LIGHT }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:col }} />
                  <span style={{ fontWeight:600, color:TEXT_DARK }}>{t(en,ar)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
