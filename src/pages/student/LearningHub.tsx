/*  src/pages/student/LearningHub.tsx
    LEVEL LOGIC (updated):
    - COURSES are visible to ALL students regardless of level.
      Level filtering only applies at the subject level.
    - SUBJECTS support BOTH single `level` TEXT (legacy) and
      new `levels` TEXT[] (multi-level). A subject is visible when:
        • levels[] is empty / null  →  all students see it
        • levels[] contains student's level → visible
        • levels[] contains 'all'           → visible
        • Fallback: old `level` TEXT === student's level or 'all'/null
    - Admins/teachers bypass all filters and see everything.
*/
import { useState, useEffect, type CSSProperties, type ReactNode } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  BookOpen, Play, Lock, ArrowLeft, CheckCircle, Circle, Clock,
  Video, FileText, ClipboardList, Megaphone, Calendar,
  ChevronRight, LayoutGrid, List, GraduationCap, Layers,
} from "lucide-react";
import SubjectRecordings    from "@/components/classroom/SubjectRecordings";
import SubjectMaterials     from "@/components/classroom/SubjectMaterials";
import SubjectSyllabus      from "@/components/classroom/SubjectSyllabus";
import SubjectAssignments   from "@/components/classroom/SubjectAssignments";
import SubjectAnnouncements from "@/components/classroom/SubjectAnnouncements";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useLiveClass } from "@/contexts/LiveClassContext";
import { usePrivateStudent } from "@/hooks/usePrivateStudent";
import { useAcademySettings } from "@/hooks/useAcademySettings";

const G    = "#0f2d1f";
const GM   = "#1a4731";
const GOLD = "#c9a84c";

// ── Image that quietly falls back to a placeholder if the URL 404s/errors ──
// (e.g. a stale reference to a since-removed storage file) instead of
// showing the browser's broken-image icon.
const SafeImg = ({ src, alt, style, fallback }: { src: string; alt: string; style?: CSSProperties; fallback: ReactNode }) => {
  const [broken, setBroken] = useState(false);
  if (broken) return <>{fallback}</>;
  return <img src={src} alt={alt} style={style} onError={() => setBroken(true)} />;
};

const levelColor = (l: string) =>
  ({ beginner:     { bg:"#f0fff4", color:"#276749", border:"#9ae6b4" },
     intermediate: { bg:"#fffbeb", color:"#b7791f", border:"#f6d860" },
     advanced:     { bg:"#f5f0ff", color:"#6b46c1", border:"#d6bcfa" },
  }[l?.toLowerCase()] || { bg:"#f0fff4", color:"#276749", border:"#9ae6b4" });

const lvLabel = (l: string) =>
  ({ beginner:"Beginner", intermediate:"Intermediate", advanced:"Advanced" }[l] || l);

const subjectLevelMatch = (subject: any, studentLevel: string): boolean => {
  const lvs: string[] = subject?.levels ?? [];
  if (lvs.length > 0) {
    return lvs.includes(studentLevel) || lvs.includes("all");
  }
  const lv = subject?.level;
  if (!lv || lv === "all") return true;
  return lv === studentLevel;
};

const levelMatch = (itemLevel: string | null | undefined, studentLevel: string): boolean => {
  if (!itemLevel || itemLevel === "all") return true;
  return itemLevel === studentLevel;
};

// Session-gating: a subject with unlock_session set is hidden from students
// (never from admins/teachers) until academy_settings.current_session
// reaches that value. NULL/undefined unlock_session = always visible.
const subjectSessionUnlocked = (subject: any, currentSession: number): boolean => {
  const gate = subject?.unlock_session;
  if (gate === null || gate === undefined) return true;
  return currentSession >= Number(gate);
};

// Very small markdown-ish renderer for lesson.content: plain paragraphs +
// "| a | b |" pipe tables (with a "|---|---|" separator row ignored).
// Deliberately minimal — this is teacher/curriculum reference text, not a
// full CMS field.
const renderLessonContent = (md: string, lang: "en" | "ar") => {
  const lines = (md || "").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines
        .filter((l) => !/^\|[\s-]*\|[\s-:|]*$/.test(l.trim()))
        .map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
      if (rows.length) {
        const [head, ...body] = rows;
        blocks.push(
          <div key={key++} style={{ overflowX: "auto", margin: "10px 0" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }} dir={lang === "ar" ? "rtl" : "ltr"}>
              <thead>
                <tr>
                  {head.map((h, hi) => (
                    <th key={hi} style={{ textAlign: "left", padding: "6px 10px", borderBottom: "2px solid #e5e7eb", color: "#0f2d1f", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => (
                      <td key={ci} style={{ padding: "6px 10px", borderBottom: "1px solid #f0f4f0", color: "#374151" }}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }
    if (line.trim() === "") { i++; continue; }
    blocks.push(<p key={key++} style={{ fontSize: 13.5, lineHeight: 1.6, color: "#374151", margin: "0 0 10px" }}>{line}</p>);
    i++;
  }
  return blocks;
};

interface Props { defaultTab?: "courses" | "live"; }

// ─────────────────────────────────────────────────────────────────────────────
const LearningHub = ({ defaultTab = "courses" }: Props) => {
  const { courseId }               = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, language }            = useLanguage();
  const { user, profile, hasRole } = useAuth();
  const navigate                   = useNavigate();
  const qc                         = useQueryClient();
  const isPrivileged               = hasRole("admin") || hasRole("teacher");
  const { joinClass }              = useLiveClass();
  const { isPrivateStudent, allowGeneralAccess } = usePrivateStudent();
  // Session-gating: subjects with unlock_session set stay hidden from
  // students until academy_settings.current_session catches up.
  const { settings: academySettings } = useAcademySettings();
  const currentSession = parseInt(academySettings.current_session || "1", 10) || 1;

  // ── Private student: load assigned subjects FIRST (used in filters below) ──
  const [privateSubjectIds, setPrivateSubjectIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!isPrivateStudent || !user?.id) { setPrivateSubjectIds(null); return; }
    supabase.from("private_student_subjects" as any)
      .select("subject_id").eq("student_id", user.id)
      .then(({ data }) => setPrivateSubjectIds(new Set((data || []).map((r: any) => r.subject_id))));
  }, [isPrivateStudent, user?.id]);

  // Filter helper: when private + not allowGeneralAccess, only show assigned subjects
  const isSubjectVisible = (subjectId: string): boolean => {
    if (!isPrivateStudent || allowGeneralAccess) return true;
    if (privateSubjectIds === null) return false;
    return privateSubjectIds.has(subjectId);
  };

  usePushNotifications();

  const [selCourse,       setSelCourseRaw]       = useState<any | null>(null);
  const [selectedSubject, setSelectedSubjectRaw] = useState<any | null>(null);
  const [subjectTab,      setSubjectTab]          = useState("syllabus");
  const [viewMode,        setViewMode]            = useState<"list" | "grid">("grid");
  const [activeLesson,    setActiveLesson]        = useState<string | null>(null);

  // Wrappers that also persist navigation state to sessionStorage so that
  // Android minimize + restore (or manual page refresh) keeps the student
  // on the same course/subject instead of bouncing back to the course list.
  const setSelCourse = (course: any | null) => {
    setSelCourseRaw(course);
    if (course) {
      sessionStorage.setItem("hub_selCourse", course.id);
      sessionStorage.removeItem("hub_selSubject");
    } else {
      sessionStorage.removeItem("hub_selCourse");
      sessionStorage.removeItem("hub_selSubject");
    }
  };
  const setSelectedSubject = (subject: any | null) => {
    setSelectedSubjectRaw(subject);
    if (subject) {
      sessionStorage.setItem("hub_selSubject", subject.id);
    } else {
      sessionStorage.removeItem("hub_selSubject");
    }
  };

  const studentLevel = (profile?.level || profile?.course_level || "beginner") as string;

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: allCourses, isLoading: loadCourse } = useQuery({
    queryKey: ["all-courses-published"],
    queryFn: async () => {
      const { data } = await supabase
        .from("courses")
        .select("*")
        .eq("is_published", true)
        .order("sort_order");
      return data || [];
    },
  });

  // ── Private student: also load assigned course IDs ──────────────────────
  const [privateCourseIds, setPrivateCourseIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!isPrivateStudent || !user?.id) { setPrivateCourseIds(null); return; }
    supabase.from("private_student_courses" as any)
      .select("course_id").eq("student_id", user.id)
      .then(({ data }) => setPrivateCourseIds(new Set((data || []).map((r: any) => r.course_id))));
  }, [isPrivateStudent, user?.id]);

  const isCourseVisible = (courseId: string): boolean => {
    if (!isPrivateStudent || allowGeneralAccess) return true;
    if (privateCourseIds === null) return false;
    return privateCourseIds.has(courseId);
  };

  // ── Level-based auto-enrollment (compulsory/optional subjects) ──────────
  // A subject only gets a row here once it's mapped to the student's level
  // via level_courses (see the trigger in the student_subject_enrollments
  // migration). Subjects with no row are unaffected — legacy/self-registered
  // subjects keep working exactly as before.
  const { data: subjectEnrollments } = useQuery({
    queryKey: ["subject-enrollments", user?.id],
    enabled: !!user?.id && !isPrivileged,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_subject_enrollments" as any)
        .select("subject_id, status, is_compulsory")
        .eq("student_id", user!.id);
      if (error) throw error;
      const map: Record<string, { status: "active" | "disenrolled"; is_compulsory: boolean }> = {};
      (data as any[] || []).forEach((r: any) => { map[r.subject_id] = { status: r.status, is_compulsory: r.is_compulsory }; });
      return map;
    },
  });

  const getEnrollment = (subjectId: string) => subjectEnrollments?.[subjectId] ?? null;
  // No row → subject isn't level-mapped, so it's unaffected by this system.
  const isSubjectEnrolled = (subjectId: string): boolean => {
    const e = getEnrollment(subjectId);
    return !e || e.status === "active";
  };

  const [togglingSubjectId, setTogglingSubjectId] = useState<string | null>(null);
  const toggleSubjectEnrollment = async (subjectId: string, makeActive: boolean) => {
    setTogglingSubjectId(subjectId);
    try {
      const { error } = await supabase.rpc("set_subject_enrollment" as any, { p_subject_id: subjectId, p_active: makeActive });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["subject-enrollments", user?.id] });
      toast({
        title: makeActive
          ? (language === "ar" ? "✅ تم إعادة التسجيل" : "✅ Re-enrolled")
          : (language === "ar" ? "تم إلغاء التسجيل" : "Disenrolled"),
      });
    } catch (e: any) {
      toast({ title: language === "ar" ? "فشل الإجراء" : "Action failed", description: e.message, variant: "destructive" });
    } finally {
      setTogglingSubjectId(null);
    }
  };

  const courses = isPrivileged
    ? (allCourses || [])
    : (allCourses || []).filter((c: any) => levelMatch(c.level, studentLevel) && isCourseVisible(c.id));

  const { data: allCourseSubjects, isLoading: loadSubs } = useQuery({
    queryKey: ["course-subjects", selCourse?.id],
    enabled: !!selCourse,
    queryFn: async () => {
      const { data } = await supabase
        .from("subjects")
        .select("*")
        .eq("course_id", selCourse!.id)
        .eq("is_active", true)
        .order("title");
      return data || [];
    },
  });

  const courseSubjects = isPrivileged
    ? (allCourseSubjects || [])
    : (allCourseSubjects || []).filter((s: any) => subjectLevelMatch(s, studentLevel) && isSubjectVisible(s.id) && isSubjectEnrolled(s.id) && subjectSessionUnlocked(s, currentSession));
  // Optional subjects the student disenrolled from — kept out of the main
  // grid (their lessons/materials/assignments are hidden) but still listed
  // separately with a Re-enroll action.
  const disenrolledCourseSubjects = isPrivileged ? [] : (allCourseSubjects || []).filter(
    (s: any) => subjectLevelMatch(s, studentLevel) && isSubjectVisible(s.id) && !isSubjectEnrolled(s.id) && subjectSessionUnlocked(s, currentSession)
  );

  const { data: subjectLessons, isLoading: loadLessons } = useQuery({
    queryKey: ["subject-lessons", selectedSubject?.id],
    enabled: !!selectedSubject,
    queryFn: async () => {
      const { data } = await supabase
        .from("lessons")
        .select("*")
        // FIX: lessons are keyed by subject_id (matches admin CourseManagement's
        // saveLesson, which writes subject_id). This previously queried
        // course_id === subject.id, which never matched anything lessons were
        // actually saved with, so no lesson ever appeared here.
        .eq("subject_id", selectedSubject!.id)
        .order("sort_order");
      return data || [];
    },
  });

  const { data: myProgress } = useQuery({
    queryKey: ["my-progress", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("lesson_progress")
        .select("lesson_id,completed")
        .eq("user_id", user!.id)
        .eq("completed", true);
      return data || [];
    },
  });

  const { data: liveSessions } = useQuery({
    queryKey: ["live-sessions"],
    queryFn: async () => {
      const { data } = await supabase.from("live_sessions").select("*").eq("status", "live");
      return data || [];
    },
    refetchInterval: 5000,
  });

  const { data: allSubjects } = useQuery({
    queryKey: ["all-subjects-flat"],
    queryFn: async () => {
      const { data } = await supabase.from("subjects").select("*").eq("is_active", true);
      return data || [];
    },
  });

  // ── Restore navigation state after refresh / Android minimize ────────────────
  useEffect(() => {
    const savedCourseId  = sessionStorage.getItem("hub_selCourse");
    const savedSubjectId = sessionStorage.getItem("hub_selSubject");
    if (!savedCourseId && !savedSubjectId) return;

    if (savedCourseId && allCourses?.length && !selCourse) {
      const found = (allCourses as any[]).find((c: any) => c.id === savedCourseId);
      if (found) setSelCourseRaw(found);
    }
    if (savedSubjectId && allSubjects?.length && !selectedSubject) {
      const found = (allSubjects as any[]).find((s: any) => s.id === savedSubjectId);
      if (found) setSelectedSubjectRaw(found);
    }
  }, [allCourses, allSubjects]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const subjectId = searchParams.get("subject");
    if (!subjectId || !allSubjects?.length || selectedSubject) return;
    const found = allSubjects.find((s: any) => s.id === subjectId);
    if (found) {
      setSelectedSubject(found);
      setSubjectTab("lessons");
    }
  }, [allSubjects, searchParams]);

  // Auto-join classroom when arriving from a class_ring push notification
  // (?autoJoin=true&subject=<id> deep-link set by schedule-class-reminders)
  useEffect(() => {
    const autoJoin  = searchParams.get("autoJoin") === "true";
    const subjectId = searchParams.get("subject");
    if (!autoJoin || !subjectId || !allSubjects?.length) return;
    const found = allSubjects.find((s: any) => s.id === subjectId);
    if (!found) return;
    // Open the classroom overlay immediately — same as tapping "Join" button
    joinClass(found, { autoJoin: true });
    // Remove the autoJoin param so a refresh doesn't re-trigger
    const next = new URLSearchParams(searchParams);
    next.delete("autoJoin");
    setSearchParams(next, { replace: true });
  }, [allSubjects, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: urlCourse } = useQuery({
    queryKey: ["course", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("*").eq("id", courseId!).single();
      return data;
    },
  });

  const { data: allUrlCourseSubjects } = useQuery({
    queryKey: ["url-course-subjects", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data } = await supabase
        .from("subjects")
        .select("*")
        .eq("course_id", courseId!)
        .eq("is_active", true)
        .order("title");
      return data || [];
    },
  });

  const urlCourseSubjects = isPrivileged
    ? (allUrlCourseSubjects || [])
    : (allUrlCourseSubjects || []).filter((s: any) => subjectLevelMatch(s, studentLevel) && isSubjectVisible(s.id) && isSubjectEnrolled(s.id) && subjectSessionUnlocked(s, currentSession));
  const disenrolledUrlCourseSubjects = isPrivileged ? [] : (allUrlCourseSubjects || []).filter(
    (s: any) => subjectLevelMatch(s, studentLevel) && isSubjectVisible(s.id) && !isSubjectEnrolled(s.id) && subjectSessionUnlocked(s, currentSession)
  );

  const markComplete = useMutation({
    mutationFn: async (lessonId: string) => {
      const { error } = await supabase
        .from("lesson_progress")
        .upsert(
          { user_id: user!.id, lesson_id: lessonId, completed: true, completed_at: new Date().toISOString() },
          { onConflict: "user_id,lesson_id" }
        );
      if (error) throw error;
    },
    onSuccess: (_, lessonId) => {
      qc.invalidateQueries({ queryKey: ["my-progress"] });
      qc.invalidateQueries({ queryKey: ["subject-lessons", selectedSubject?.id] });
      toast({ title: t("Lesson completed! ✅", "تم إكمال الدرس! ✅") });
      if (subjectLessons) {
        const idx = subjectLessons.findIndex((l: any) => l.id === lessonId);
        if (idx < subjectLessons.length - 1) setActiveLesson(subjectLessons[idx + 1].id);
      }
    },
  });

  const completedSet = new Set((myProgress || []).map((p: any) => p.lesson_id));
  const isLive = (sid: string) => liveSessions?.some((s: any) => s.subject_id === sid);

  // Lessons render as a collapsible accordion now — nothing auto-expands on
  // load. activeLesson only gets set when the student taps a lesson row, or
  // when a Syllabus item is clicked (openLessonFromSyllabus below).

  // ═══════════════════════════════════════════════════════════════════════════
  // URL-BASED COURSE VIEW (/student/courses/:courseId)
  // ═══════════════════════════════════════════════════════════════════════════
  if (courseId && urlCourse) {
    if (!selectedSubject) {
      return (
        <div style={{ fontFamily:"'Cairo',sans-serif", background:"#f8fafb", minHeight:"100vh" }}>
          <style>{`@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ background:`linear-gradient(135deg,${G},${GM})`, padding:"14px 16px 20px" }}>
            <button onClick={() => navigate("/student/courses")} style={{ display:"flex", alignItems:"center", gap:6, color:"rgba(255,255,255,.8)", background:"rgba(255,255,255,.12)", border:"none", borderRadius:20, padding:"6px 14px", cursor:"pointer", fontSize:12, marginBottom:14, fontFamily:"'Cairo',sans-serif" }}>
              <ArrowLeft style={{ width:13, height:13 }} />{t("Back", "رجوع")}
            </button>
            <h1 style={{ fontSize:20, fontWeight:900, color:"#fff", margin:"0 0 4px" }}>{language === "ar" ? urlCourse.title_ar || urlCourse.title : urlCourse.title}</h1>
            {urlCourse.title_ar && language !== "ar" && <p style={{ fontSize:14, color:GOLD, margin:"0 0 8px", fontFamily:"serif" }} dir="rtl">{urlCourse.title_ar}</p>}
            {urlCourse.level && <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, fontWeight:700, ...levelColor(urlCourse.level) }}>{lvLabel(urlCourse.level)}</span>}
          </div>
          <div style={{ padding:16, maxWidth:720, margin:"0 auto" }}>
            {urlCourseSubjects.length === 0 ? (
              <div style={{ background:"#fff", borderRadius:16, padding:"40px 20px", textAlign:"center", border:"1px solid #e5e7eb" }}>
                <BookOpen style={{ width:36, height:36, color:"#d1d5db", margin:"0 auto 12px" }} />
                <p style={{ color:"#9ca3af", fontSize:14 }}>{t("No subjects yet", "لا توجد مواد بعد")}</p>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:14 }}>
                {urlCourseSubjects.map((sub: any) => (
                  <SubjectCard
                    key={sub.id} subject={sub} onClick={() => setSelectedSubject(sub)} live={isLive(sub.id)} language={language}
                    enrollment={getEnrollment(sub.id)} onToggleEnrollment={toggleSubjectEnrollment} toggling={togglingSubjectId === sub.id}
                  />
                ))}
              </div>
            )}
            {disenrolledUrlCourseSubjects.length > 0 && (
              <div style={{ marginTop:16, display:"flex", flexDirection:"column", gap:8 }}>
                <p style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase" as const, letterSpacing:0.5 }}>
                  {t("Disenrolled (optional)", "ملغى التسجيل (اختياري)")}
                </p>
                {disenrolledUrlCourseSubjects.map((sub: any) => (
                  <DisenrolledSubjectRow key={sub.id} subject={sub} language={language} toggling={togglingSubjectId === sub.id}
                    onReEnroll={() => toggleSubjectEnrollment(sub.id, true)} />
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBJECT DETAIL — with tabs
  // ═══════════════════════════════════════════════════════════════════════════
  if (selectedSubject) {
    const subjEnrollment = getEnrollment(selectedSubject.id);
    if (!isPrivileged && subjEnrollment?.status === "disenrolled") {
      return (
        <div style={{ fontFamily:"'Cairo',sans-serif", background:"#f8fafb", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div style={{ textAlign:"center", maxWidth:340 }}>
            <Lock style={{ width:40, height:40, color:"#f59e0b", margin:"0 auto 14px" }} />
            <p style={{ fontWeight:800, color:G, marginBottom:6 }}>
              {t("You've disenrolled from this subject", "لقد ألغيت تسجيلك في هذه المادة")}
            </p>
            <p style={{ fontSize:13, color:"#9ca3af", marginBottom:16, lineHeight:1.6 }}>
              {t("Its lessons, materials, assignments and exams are hidden until you re-enroll.",
                 "دروسها ومصادرها وواجباتها واختباراتها مخفية حتى تعيد التسجيل.")}
            </p>
            <button
              onClick={() => toggleSubjectEnrollment(selectedSubject.id, true)}
              style={{ padding:"10px 20px", borderRadius:10, background:G, border:"none", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}
            >
              {t("Re-enroll", "إعادة التسجيل")}
            </button>
            <button
              onClick={() => setSelectedSubject(null)}
              style={{ display:"block", margin:"12px auto 0", background:"none", border:"none", color:"#9ca3af", fontSize:12, cursor:"pointer" }}
            >
              {t("Back", "رجوع")}
            </button>
          </div>
        </div>
      );
    }
    const live  = isLive(selectedSubject.id);
    const done  = new Set((myProgress || []).filter((p: any) => p.completed).map((p: any) => p.lesson_id));
    const totalL = (subjectLessons || []).length;
    const doneL  = (subjectLessons || []).filter((l: any) => done.has(l.id)).length;
    const pct    = totalL > 0 ? Math.round((doneL / totalL) * 100) : 0;

    const TABS = [
      { id:"syllabus",      icon:Calendar,      label:t("Syllabus","المنهج"),       count:null },
      { id:"lessons",       icon:BookOpen,      label:t("Lessons","الدروس"),        count:totalL },
      { id:"assignments",   icon:ClipboardList, label:t("Tasks","الواجبات"),        count:null },
      { id:"materials",     icon:FileText,      label:t("Materials","المواد"),      count:null },
      { id:"recordings",    icon:Video,         label:t("Recordings","التسجيلات"),  count:null },
      { id:"announcements", icon:Megaphone,     label:t("News","الإعلانات"),        count:null },
    ];

    const activeL = subjectLessons?.find((l: any) => l.id === activeLesson);

    // Jump here from a Syllabus item: switch to the Lessons tab and expand
    // that specific lesson in the accordion.
    const openLessonFromSyllabus = (lessonId: string) => {
      setSubjectTab("lessons");
      setActiveLesson(lessonId);
    };

    return (
      <div style={{ fontFamily:"'Cairo',sans-serif", background:"#f8fafb", minHeight:"100vh" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>

        {/* ── Full-screen lesson viewer — opens over everything, own scroll, own back button ── */}
        {activeLesson && activeL && (
          <div style={{ position:"fixed", inset:0, zIndex:1000, background:"#fff", display:"flex", flexDirection:"column" }}>
            <div style={{ background:`linear-gradient(135deg,${G},${GM})`, padding:"14px 16px", display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
              <button
                onClick={() => setActiveLesson(null)}
                style={{ display:"flex", alignItems:"center", gap:6, color:"#fff", background:"rgba(255,255,255,.14)", border:"none", borderRadius:20, padding:"7px 14px", cursor:"pointer", fontSize:12, fontFamily:"'Cairo',sans-serif", flexShrink:0 }}>
                <ArrowLeft style={{ width:13, height:13 }} />{t("Back","رجوع")}
              </button>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:800, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {language === "ar" ? activeL.title_ar || activeL.title : activeL.title}
                </div>
                {activeL.duration_minutes > 0 && (
                  <div style={{ fontSize:11, color:"rgba(255,255,255,.65)", marginTop:1 }}>
                    <Clock style={{ width:10, height:10, display:"inline", marginRight:3 }} />{activeL.duration_minutes} {t("min","د")}
                  </div>
                )}
              </div>
              {done.has(activeL.id) && (
                <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, fontWeight:700, color:"#86efac", flexShrink:0 }}>
                  <CheckCircle style={{ width:14, height:14 }} />{t("Done","مكتمل")}
                </span>
              )}
            </div>

            <div style={{ flex:1, overflowY:"auto", background:"#fbfdfc" }}>
              {activeL.interactive_html ? (
                <iframe
                  srcDoc={activeL.interactive_html}
                  // allow-same-origin is required for the mic (speech recognition) to
                  // get a real, non-opaque origin — without it, getUserMedia is denied
                  // outright in a srcDoc iframe. allow="microphone" is the permissions-
                  // policy grant that actually lets the mic prompt appear at all.
                  sandbox="allow-scripts allow-same-origin"
                  allow="microphone; autoplay"
                  style={{ width:"100%", height:"100%", minHeight:"100%", border:"none", display:"block" }}
                  title={activeL.title}
                />
              ) : activeL.video_url ? (
                <div style={{ aspectRatio:"16/9", background:"#000" }}>
                  <iframe src={activeL.video_url} style={{ width:"100%", height:"100%", border:"none" }} allowFullScreen />
                </div>
              ) : activeL.content ? (
                <div style={{ padding:"18px 20px", maxWidth:720, margin:"0 auto" }}>{renderLessonContent(activeL.content, language === "ar" ? "ar" : "en")}</div>
              ) : (
                <div style={{ height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8 }}>
                  <Play style={{ width:44, height:44, color:"#d1d5db" }} />
                  <p style={{ fontSize:13, color:"#9ca3af" }}>{t("No video for this lesson","لا يوجد فيديو")}</p>
                </div>
              )}
            </div>

            <div style={{ padding:"14px 20px", borderTop:"1px solid #f0f4f0", background:"#fff", flexShrink:0 }}>
              {!done.has(activeL.id) ? (
                <button onClick={() => markComplete.mutate(activeL.id)} disabled={markComplete.isPending}
                  style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"12px 22px", borderRadius:12, background:G, border:"none", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                  <CheckCircle style={{ width:15, height:15 }} />
                  {markComplete.isPending ? "Saving…" : t("Mark as Complete","تحديد كمكتمل")}
                </button>
              ) : (
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"10px 16px", borderRadius:20, background:"#f0fff4", color:"#22c55e", fontSize:13, fontWeight:700, border:"1px solid #86efac" }}>
                  <CheckCircle style={{ width:14, height:14 }} />{t("Completed","مكتمل")}
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ background:`linear-gradient(135deg,${G},${GM})`, padding:"14px 16px 0" }}>
          <button
            onClick={() => { setSelectedSubject(null); setActiveLesson(null); }}
            style={{ display:"flex", alignItems:"center", gap:6, color:"rgba(255,255,255,.8)", background:"rgba(255,255,255,.12)", border:"none", borderRadius:20, padding:"6px 14px", cursor:"pointer", fontSize:12, marginBottom:14, fontFamily:"'Cairo',sans-serif" }}>
            <ArrowLeft style={{ width:13, height:13 }} />{t("Back", "رجوع")}
          </button>

          <div style={{ textAlign:"center", padding:"0 8px 16px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, flexWrap:"wrap", marginBottom:8 }}>
              <h1 style={{ fontSize:20, fontWeight:900, color:"#fff", margin:0 }}>
                {language === "ar" ? selectedSubject.title_ar || selectedSubject.title : selectedSubject.title}
              </h1>
              {live && <span style={{ fontSize:10, fontWeight:800, padding:"3px 9px", borderRadius:20, background:"#ef4444", color:"#fff", animation:"pulse 1.5s infinite" }}>● LIVE</span>}
            </div>
            {selectedSubject.title_ar && (
              <p dir="rtl" style={{ fontSize:14, color:GOLD, margin:"0 0 4px", fontFamily:"'Amiri','Cairo',serif" }}>
                {selectedSubject.title_ar}
              </p>
            )}
            {selectedSubject.description && (
              <p dir="rtl" style={{ fontSize:13, color:"rgba(255,255,255,.75)", margin:"0 0 6px", lineHeight:1.7, fontFamily:"'Amiri','Cairo',serif" }}>
                {selectedSubject.description}
              </p>
            )}
            {selectedSubject.title_ar && selectedSubject.title_ar !== selectedSubject.title && language !== "ar" && (
              <p style={{ fontSize:12, color:"rgba(255,255,255,.55)", margin:0, lineHeight:1.6 }}>
                {selectedSubject.title}
              </p>
            )}

            {totalL > 0 && (
              <div style={{ marginTop:12, display:"flex", alignItems:"center", gap:8, justifyContent:"center" }}>
                <div style={{ width:140, height:5, borderRadius:3, background:"rgba(255,255,255,.2)", overflow:"hidden" }}>
                  <div style={{ width:`${pct}%`, height:"100%", borderRadius:3, background:GOLD }} />
                </div>
                <span style={{ fontSize:11, color:"rgba(255,255,255,.7)" }}>{doneL}/{totalL}</span>
              </div>
            )}

            {/* Join/Start class — uses global LiveClassContext, persists across navigation */}
            <button
              onClick={() => joinClass(selectedSubject)}
              style={{ marginTop:14, display:"inline-flex", alignItems:"center", gap:6, padding:"10px 20px", borderRadius:12, background:GOLD, border:"none", color:G, fontSize:13, fontWeight:900, cursor:"pointer", fontFamily:"'Cairo',sans-serif", boxShadow:"0 4px 12px rgba(201,168,76,.4)" }}>
              <Video style={{ width:14, height:14 }} />
              {live ? t("Join","انضمام") : isPrivileged ? t("Start","بدء") : t("Class","الفصل")}
            </button>
          </div>

          <div style={{ display:"flex", overflowX:"auto", scrollbarWidth:"none" }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setSubjectTab(tab.id)}
                style={{ display:"flex", alignItems:"center", gap:5, padding:"10px 14px", border:"none", background:"none", cursor:"pointer", fontFamily:"'Cairo',sans-serif", fontSize:12, fontWeight: subjectTab===tab.id ? 700 : 400, color: subjectTab===tab.id ? "#fff" : "rgba(255,255,255,.5)", borderBottom: subjectTab===tab.id ? "2.5px solid #fff" : "2.5px solid transparent", whiteSpace:"nowrap", flexShrink:0 }}>
                <tab.icon style={{ width:12, height:12 }} />{tab.label}
                {tab.count !== null && tab.count > 0 && <span style={{ fontSize:9, background:"rgba(255,255,255,.22)", borderRadius:10, padding:"1px 5px", marginLeft:2 }}>{tab.count}</span>}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding:"16px", maxWidth:720, margin:"0 auto" }}>
          {subjectTab === "lessons" && (
            <>
              {loadLessons ? (
                <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}>Loading…</div>
              ) : !(subjectLessons||[]).length ? (
                <div style={{ background:"#fff", borderRadius:16, padding:"40px 20px", textAlign:"center", border:"1px solid #e5e7eb" }}>
                  <BookOpen style={{ width:36, height:36, color:"#d1d5db", margin:"0 auto 12px" }} />
                  <p style={{ color:"#9ca3af", fontSize:14 }}>{t("No lessons yet", "لا توجد دروس بعد")}</p>
                </div>
              ) : (
                <div style={{ background:"#fff", borderRadius:16, border:"1px solid #e5e7eb", overflow:"hidden" }}>
                  <div style={{ padding:"14px 18px", borderBottom:"1px solid #f0f4f0", fontSize:13, fontWeight:700, color:G }}>
                    {t("Lessons", "الدروس")} ({(subjectLessons||[]).length})
                  </div>
                  {(subjectLessons||[]).map((lesson: any, idx: number) => {
                    const isComp = done.has(lesson.id);
                    return (
                      <button key={lesson.id} onClick={() => setActiveLesson(lesson.id)}
                        style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"12px 18px", background:"#fff", border:"none", borderBottom:"1px solid #f0f4f0", cursor:"pointer", textAlign:"left", transition:"background .15s" }}>
                        {isComp
                          ? <CheckCircle style={{ width:19, height:19, color:"#22c55e", flexShrink:0 }} />
                          : <Circle     style={{ width:19, height:19, color:"#d1d5db", flexShrink:0 }} />}
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:500, color: isComp ? "#9ca3af" : G, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {idx+1}. {language === "ar" ? lesson.title_ar || lesson.title : lesson.title}
                          </div>
                          {lesson.duration_minutes > 0 && <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}><Clock style={{ width:10, height:10, display:"inline", marginRight:3 }} />{lesson.duration_minutes} {t("min","د")}</div>}
                        </div>
                        <ChevronRight style={{ width:14, height:14, color:"#d1d5db", flexShrink:0 }} />
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
          {subjectTab === "syllabus"      && <SubjectSyllabus      subjectId={selectedSubject.id} onOpenLesson={openLessonFromSyllabus} />}
          {subjectTab === "recordings"    && <SubjectRecordings    subjectId={selectedSubject.id} />}
          {subjectTab === "materials"     && <SubjectMaterials     subjectId={selectedSubject.id} />}
          {subjectTab === "assignments"   && <SubjectAssignments   subjectId={selectedSubject.id} />}
          {subjectTab === "announcements" && <SubjectAnnouncements subjectId={selectedSubject.id} />}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COURSE SUBJECTS VIEW (after clicking a course card)
  // ═══════════════════════════════════════════════════════════════════════════
  if (selCourse) {
    const lc = levelColor(selCourse.level);
    return (
      <div style={{ fontFamily:"'Cairo',sans-serif", background:"#f8fafb", minHeight:"100vh" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');@keyframes spin{to{transform:rotate(360deg)}};@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
        <div style={{ background: selCourse.image_url ? `linear-gradient(rgba(0,0,0,.5),rgba(0,0,0,.65)),url("${selCourse.image_url}") center/cover, linear-gradient(135deg,${G},${GM})` : `linear-gradient(135deg,${G},${GM})`, padding:"14px 16px 20px" }}>
          <button onClick={() => setSelCourse(null)} style={{ display:"flex", alignItems:"center", gap:6, color:"rgba(255,255,255,.8)", background:"rgba(255,255,255,.12)", border:"none", borderRadius:20, padding:"6px 14px", cursor:"pointer", fontSize:12, marginBottom:14, fontFamily:"'Cairo',sans-serif" }}>
            <ArrowLeft style={{ width:13, height:13 }} />{t("Back","رجوع")}
          </button>
          <h1 style={{ fontSize:20, fontWeight:900, color:"#fff", margin:"0 0 4px" }}>
            {language === "ar" ? selCourse.title_ar || selCourse.title : selCourse.title}
          </h1>
          {selCourse.title_ar && language !== "ar" && <p style={{ fontSize:13, color:GOLD, margin:"0 0 8px", fontFamily:"serif" }} dir="rtl">{selCourse.title_ar}</p>}
          {selCourse.level && selCourse.level !== "all" && (
            <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, fontWeight:700, ...lc }}>{lvLabel(selCourse.level)}</span>
          )}
          {selCourse.description && <p style={{ fontSize:12, color:"rgba(255,255,255,.65)", marginTop:8 }}>{selCourse.description}</p>}
        </div>
        <div style={{ padding:16, maxWidth:720, margin:"0 auto" }}>
          {loadSubs ? (
            <div style={{ textAlign:"center", padding:40, color:"#9ca3af" }}>Loading subjects…</div>
          ) : courseSubjects.length === 0 ? (
            <div style={{ background:"#fff", borderRadius:16, padding:"40px 20px", textAlign:"center", border:"1px solid #e5e7eb" }}>
              <BookOpen style={{ width:36, height:36, color:"#d1d5db", margin:"0 auto 12px" }} />
              <p style={{ color:"#9ca3af", fontSize:14 }}>
                {isPrivileged
                  ? t("No subjects yet", "لا توجد مواد بعد")
                  : t("No subjects available for your level yet", "لا توجد مواد لمستواك بعد")}
              </p>
            </div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:14 }}>
              {courseSubjects.map((sub: any) => (
                <SubjectCard
                  key={sub.id}
                  subject={sub}
                  onClick={() => { setSelectedSubject(sub); setSubjectTab("lessons"); }}
                  live={isLive(sub.id)}
                  language={language}
                  enrollment={getEnrollment(sub.id)}
                  onToggleEnrollment={toggleSubjectEnrollment}
                  toggling={togglingSubjectId === sub.id}
                />
              ))}
            </div>
          )}
          {disenrolledCourseSubjects.length > 0 && (
            <div style={{ marginTop:16, display:"flex", flexDirection:"column", gap:8 }}>
              <p style={{ fontSize:11, fontWeight:700, color:"#9ca3af", textTransform:"uppercase" as const, letterSpacing:0.5 }}>
                {t("Disenrolled (optional)", "ملغى التسجيل (اختياري)")}
              </p>
              {disenrolledCourseSubjects.map((sub: any) => (
                <DisenrolledSubjectRow key={sub.id} subject={sub} language={language} toggling={togglingSubjectId === sub.id}
                  onReEnroll={() => toggleSubjectEnrollment(sub.id, true)} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN HUB — COURSE CARDS
  // ═══════════════════════════════════════════════════════════════════════════
  const anyLive = (liveSessions || []).length > 0;

  // Per-course LIVE check: only show LIVE badge when a subject in THAT specific
  // course has an active live session — not when any session is running globally.
  const isCourseLive = (courseId: string): boolean => {
    const liveSubjectIds = new Set((liveSessions || []).map((ls: any) => ls.subject_id));
    return (allSubjects || []).some(
      (s: any) => s.course_id === courseId && liveSubjectIds.has(s.id)
    );
  };

  // ── PRIVATE STUDENT: load assigned subject IDs ─────────────────────────
  return (
    <div style={{ fontFamily:"'Cairo',sans-serif", background:"#f8fafb", minHeight:"100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
        @keyframes pulse   { 0%,100%{opacity:1}50%{opacity:.4} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer { 0%{background-position:-200% 0}100%{background-position:200% 0} }
        .sc:hover { box-shadow: 0 8px 28px rgba(15,45,31,.13) !important; transform: translateY(-2px) !important; }
        .sc       { transition: box-shadow .2s, transform .2s; }
      `}</style>

      <div style={{ background:`linear-gradient(135deg,${G} 0%,${GM} 100%)`, padding:"20px 18px 22px" }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:5 }}>
              <GraduationCap style={{ width:22, height:22, color:GOLD }} />
              <h1 style={{ fontSize:22, fontWeight:900, color:"#fff", margin:0 }}>{t("Learning Hub","مركز التعلم")}</h1>
            </div>
            <p style={{ fontSize:12, color:"rgba(255,255,255,.5)", margin:"0 0 14px" }}>
              {t("Courses & subjects","الدورات والمواد")}
            </p>
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
              {!isPrivileged && (
                <>
                  <span style={{ fontSize:11, color:"rgba(255,255,255,.5)" }}>{t("Your Level:","مستواك:")}</span>
                  <span style={{ fontSize:11, padding:"3px 12px", borderRadius:20, fontWeight:700, ...levelColor(studentLevel) }}>
                    {lvLabel(studentLevel)}
                  </span>
                </>
              )}
              {isPrivileged && (
                <span style={{ fontSize:11, padding:"3px 12px", borderRadius:20, fontWeight:700, background:"rgba(255,255,255,.15)", color:"#fff" }}>
                  {t("All Levels (Admin/Teacher)","جميع المستويات")}
                </span>
              )}
              {anyLive && (
                <span style={{ marginLeft:4, fontSize:11, padding:"3px 11px", borderRadius:20, background:"#ef4444", color:"#fff", fontWeight:700, display:"flex", alignItems:"center", gap:5, animation:"pulse 1.5s infinite" }}>
                  <span style={{ width:6, height:6, borderRadius:"50%", background:"#fff", display:"inline-block" }} />{t("Live","مباشر")}
                </span>
              )}
            </div>
          </div>
          <div style={{ display:"flex", background:"rgba(255,255,255,.12)", borderRadius:11, padding:3, gap:2 }}>
            <button onClick={() => setViewMode("grid")} style={{ width:36, height:36, borderRadius:8, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", background: viewMode==="grid" ? "#fff" : "transparent", color: viewMode==="grid" ? G : "rgba(255,255,255,.6)", transition:"all .15s" }}>
              <LayoutGrid style={{ width:17, height:17 }} />
            </button>
            <button onClick={() => setViewMode("list")} style={{ width:36, height:36, borderRadius:8, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", background: viewMode==="list" ? "#fff" : "transparent", color: viewMode==="list" ? G : "rgba(255,255,255,.6)", transition:"all .15s" }}>
              <List style={{ width:17, height:17 }} />
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding:"16px", maxWidth:800, margin:"0 auto" }}>
        {loadCourse && (
          <div style={{ display:"grid", gridTemplateColumns: viewMode==="grid" ? "repeat(auto-fill,minmax(180px,1fr))" : "1fr", gap:12 }}>
            {[1,2,3].map(i => <div key={i} style={{ height: viewMode==="grid" ? 220 : 120, borderRadius:16, background:"linear-gradient(90deg,#e5e7eb 25%,#f0f4f0 50%,#e5e7eb 75%)", backgroundSize:"200% 100%", animation:"shimmer 1.4s infinite" }} />)}
          </div>
        )}

        {!loadCourse && courses.length > 0 && (
          <div style={{ display:"grid", gridTemplateColumns: viewMode==="grid" ? "repeat(auto-fill,minmax(180px,1fr))" : "1fr", gap:14, animation:"fadeUp .3s ease" }}>
            {courses.map((course: any) => {
              const lc = levelColor(course.level);
              const courseName = language === "ar" ? course.title_ar || course.title : course.title;

              if (viewMode === "grid") {
                return (
                  <div key={course.id} className="sc"
                    onClick={() => setSelCourse(course)}
                    style={{ background:"#fff", borderRadius:18, border:"1px solid #e5e7eb", overflow:"hidden", cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,.05)" }}>
                    <div style={{ height:120, overflow:"hidden", position:"relative", background:`linear-gradient(135deg,${G},${GM})` }}>
                      {course.image_url
                        ? <SafeImg src={course.image_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}
                            fallback={<div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center" }}><BookOpen style={{ width:32, height:32, color:"rgba(255,255,255,.3)" }} /></div>} />
                        : <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center" }}><BookOpen style={{ width:32, height:32, color:"rgba(255,255,255,.3)" }} /></div>
                      }
                      {isCourseLive(course.id) && <span style={{ position:"absolute", top:8, left:8, fontSize:9, fontWeight:800, padding:"3px 7px", borderRadius:20, background:"#ef4444", color:"#fff", animation:"pulse 1.5s infinite" }}>● LIVE</span>}
                    </div>
                    <div style={{ padding:"10px 12px 14px" }}>
                      {course.level && course.level !== "all" && (
                        <span style={{ fontSize:9, padding:"2px 7px", borderRadius:9, fontWeight:700, ...lc, display:"inline-block", marginBottom:6 }}>{lvLabel(course.level)}</span>
                      )}
                      <h3 style={{ fontSize:13, fontWeight:800, color:G, margin:"0 0 3px", lineHeight:1.4 }}>{courseName}</h3>
                      {course.title_ar && language !== "ar" && (
                        <p style={{ fontSize:11, color:GOLD, margin:"0 0 6px", fontFamily:"serif" }} dir="rtl">{course.title_ar}</p>
                      )}
                      {course.description && (
                        <p style={{ fontSize:11, color:"#9ca3af", margin:"0 0 10px", lineHeight:1.5, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" as any, overflow:"hidden" }}>
                          {course.description}
                        </p>
                      )}
                      <button style={{ width:"100%", padding:"8px", borderRadius:9, background:G, border:"none", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                        <Layers style={{ width:11, height:11 }} />{t("View Subjects","عرض المواد")}
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={course.id} className="sc"
                  style={{ background:"#fff", borderRadius:18, border:"1px solid #e5e7eb", overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,.05)", cursor:"pointer" }}
                  onClick={() => setSelCourse(course)}>
                  <div style={{ width:"100%", height:150, position:"relative", background:`linear-gradient(135deg,${G},${GM})` }}>
                    {course.image_url
                      ? <SafeImg src={course.image_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}
                          fallback={<div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center" }}><BookOpen style={{ width:32, height:32, color:"rgba(255,255,255,.3)" }} /></div>} />
                      : <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center" }}><BookOpen style={{ width:32, height:32, color:"rgba(255,255,255,.3)" }} /></div>
                    }
                    {isCourseLive(course.id) && <span style={{ position:"absolute", top:8, left:8, fontSize:9, fontWeight:800, padding:"3px 7px", borderRadius:20, background:"#ef4444", color:"#fff", animation:"pulse 1.5s infinite" }}>● LIVE</span>}
                  </div>
                  <div style={{ padding:"14px 16px" }}>
                    {course.level && course.level !== "all" && (
                      <span style={{ fontSize:9, padding:"2px 7px", borderRadius:9, fontWeight:700, ...lc, display:"inline-block", marginBottom:6 }}>{lvLabel(course.level)}</span>
                    )}
                    <h3 style={{ fontSize:14, fontWeight:800, color:G, margin:"0 0 2px" }}>{courseName}</h3>
                    {course.title_ar && language !== "ar" && (
                      <p style={{ fontSize:12, color:GOLD, margin:"0 0 4px", fontFamily:"serif" }} dir="rtl">{course.title_ar}</p>
                    )}
                    {course.description && (
                      <p style={{ fontSize:12, color:"#9ca3af", margin:"0 0 10px", lineHeight:1.5, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" as any, overflow:"hidden" }}>
                        {course.description}
                      </p>
                    )}
                    <div style={{ display:"flex", alignItems:"center", gap:6, color:GM, fontSize:12, fontWeight:700 }}>
                      <Layers style={{ width:12, height:12 }} />{t("View Subjects","عرض المواد")} <ChevronRight style={{ width:14, height:14 }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loadCourse && courses.length === 0 && (
          <div style={{ background:"#fff", borderRadius:18, padding:"60px 20px", textAlign:"center", border:"1px solid #e5e7eb" }}>
            <GraduationCap style={{ width:52, height:52, color:"#d1d5db", margin:"0 auto 14px" }} />
            <div style={{ fontSize:17, color:G, fontWeight:700, marginBottom:6 }}>
              {isPrivileged
                ? t("No courses yet", "لا توجد دورات بعد")
                : t("No courses available for your level yet", "لا توجد دورات لمستواك بعد")}
            </div>
            {!isPrivileged && (
              <p style={{ fontSize:13, color:"#9ca3af", marginTop:6 }}>
                {t(
                  `Your current level is "${lvLabel(studentLevel)}". Courses for your level will appear here once the admin publishes them.`,
                  `مستواك الحالي هو "${lvLabel(studentLevel)}". ستظهر هنا الدورات المخصصة لمستواك عند نشرها.`
                )}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
function DisenrolledSubjectRow({ subject, language, onReEnroll, toggling }: {
  subject: any; language: string; onReEnroll: () => void; toggling: boolean;
}) {
  const name = language === "ar" ? subject.title_ar || subject.title : subject.title;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
      background: "#fff", border: "1px dashed #e5e7eb", borderRadius: 12, padding: "10px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <BookOpen style={{ width: 14, height: 14, color: "#9ca3af", flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </span>
        <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 20, background: "#F0FDF4", color: "#15803D", border: "1px solid #86EFAC", flexShrink: 0 }}>
          {language === "ar" ? "اختياري" : "Optional"}
        </span>
      </div>
      <button
        disabled={toggling}
        onClick={onReEnroll}
        style={{
          flexShrink: 0, padding: "6px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700,
          background: "#fff", color: "#15803D", border: "1.5px solid #86EFAC",
          cursor: toggling ? "not-allowed" : "pointer", opacity: toggling ? 0.6 : 1,
        }}
      >
        {language === "ar" ? "إعادة التسجيل" : "Re-enroll"}
      </button>
    </div>
  );
}

function SubjectCard({ subject, onClick, live, language, enrollment, onToggleEnrollment, toggling }: {
  subject: any; onClick: () => void; live: boolean; language: string;
  enrollment?: { status: "active" | "disenrolled"; is_compulsory: boolean } | null;
  onToggleEnrollment?: (subjectId: string, makeActive: boolean) => void;
  toggling?: boolean;
}) {
  const lc   = levelColor(subject.level);
  const name = language === "ar" ? subject.title_ar || subject.title : subject.title;
  return (
    <div className="sc"
      onClick={onClick}
      style={{ background:"#fff", borderRadius:16, border:"1px solid #e5e7eb", overflow:"hidden", cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,.05)" }}>
      <div style={{ height:110, overflow:"hidden", background:`linear-gradient(135deg,#0f2d1f,#1a4731)`, position:"relative" }}>
        {subject.image_url
          ? <SafeImg src={subject.image_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}
              fallback={<div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center" }}><BookOpen style={{ width:28, height:28, color:"rgba(255,255,255,.25)" }} /></div>} />
          : <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center" }}><BookOpen style={{ width:28, height:28, color:"rgba(255,255,255,.25)" }} /></div>
        }
        {live && <span style={{ position:"absolute", top:8, left:8, fontSize:9, fontWeight:800, padding:"3px 7px", borderRadius:20, background:"#ef4444", color:"#fff" }}>● LIVE</span>}
      </div>
      <div style={{ padding:"10px 12px 14px" }}>
        {subject.level && subject.level !== "all" && (
          <span style={{ fontSize:9, padding:"2px 7px", borderRadius:9, fontWeight:700, ...lc, display:"inline-block", marginBottom:5 }}>{subject.level}</span>
        )}
        {enrollment && !enrollment.is_compulsory && (
          <span style={{ fontSize:9, padding:"2px 7px", borderRadius:9, fontWeight:700, background:"#F0FDF4", color:"#15803D", border:"1px solid #86EFAC", display:"inline-block", marginBottom:5, marginLeft:4 }}>
            {language === "ar" ? "اختياري" : "Optional"}
          </span>
        )}
        {subject.title_ar && (
          <p style={{ fontSize:12, color:"#c9a84c", margin:"0 0 2px", fontFamily:"'Amiri',serif" }} dir="rtl">{subject.title_ar}</p>
        )}
        <h3 style={{ fontSize:13, fontWeight:800, color:"#0f2d1f", margin:"0 0 4px", lineHeight:1.4 }}>{name}</h3>
        {subject.description && (
          <p style={{ fontSize:11, color:"#9ca3af", margin:"0 0 8px", lineHeight:1.5, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" as any, overflow:"hidden" }}>
            {subject.description}
          </p>
        )}
        <div style={{ display:"flex", gap:6 }}>
          <button style={{ flex:1, padding:"7px", borderRadius:9, background:"#0f2d1f", border:"none", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
            <BookOpen style={{ width:11, height:11 }} />Open Subject
          </button>
          {enrollment && !enrollment.is_compulsory && onToggleEnrollment && (
            <button
              disabled={toggling}
              onClick={(e) => { e.stopPropagation(); onToggleEnrollment(subject.id, false); }}
              title={language === "ar" ? "إلغاء التسجيل من هذه المادة الاختيارية" : "Disenroll from this optional subject"}
              style={{ padding:"7px 10px", borderRadius:9, background:"#fff", border:"1.5px solid #FCA5A5", color:"#B91C1C", fontSize:11, fontWeight:700, cursor: toggling ? "not-allowed" : "pointer", opacity: toggling ? 0.6 : 1 }}
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LevelLockedCard({ studentLevel, requiredLevel }: { studentLevel: string; requiredLevel: string }) {
  return (
    <div style={{ background:"#fff", borderRadius:16, padding:"40px 20px", textAlign:"center", border:"2px solid #FDE68A" }}>
      <Lock style={{ width:40, height:40, color:"#f59e0b", margin:"0 auto 14px" }} />
      <p style={{ fontWeight:700, fontSize:15, color:"#92400E", marginBottom:8 }}>
        This course is for {lvLabel(requiredLevel)} students
      </p>
      <p style={{ fontSize:13, color:"#9ca3af" }}>
        Your current level is <strong>{lvLabel(studentLevel)}</strong>. Contact your instructor to upgrade your level.
      </p>
    </div>
  );
}

export default LearningHub;
