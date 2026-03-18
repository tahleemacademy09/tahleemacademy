/*  src/pages/student/LearningHub.tsx
    ENHANCED — Courses & Live Classes MERGED into one view.
    Each subject card shows: cover image, courses, live join button,
    recordings/materials/assignments/syllabus tabs all in one place.
    No more switching between two tabs — everything is one hub.

    Routes (unchanged):
      /student/courses           → <LearningHub />
      /student/courses/:courseId → <LearningHub />
      /student/live-classes      → <LearningHub />
*/

import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  BookOpen, Play, Lock, ArrowLeft, CheckCircle, Circle, Clock,
  Video, FileText, ClipboardList, Megaphone, Calendar, ArrowRight,
  ChevronRight, Zap, GraduationCap, Users
} from "lucide-react";
import ClassroomView       from "@/components/classroom/ClassroomView";
import SubjectRecordings   from "@/components/classroom/SubjectRecordings";
import SubjectMaterials    from "@/components/classroom/SubjectMaterials";
import SubjectSyllabus     from "@/components/classroom/SubjectSyllabus";
import SubjectAssignments  from "@/components/classroom/SubjectAssignments";
import SubjectAnnouncements from "@/components/classroom/SubjectAnnouncements";

const G      = "#0f2d1f";
const GM     = "#1a4731";
const GOLD   = "#c9a84c";
const CREAM  = "#faf6ee";
const BORDER = "rgba(15,45,31,0.1)";
const SHADOW = "0 2px 12px rgba(0,0,0,.07)";

// Fallback gradient colours if no image uploaded
const SUBJECT_COLORS: Record<string, [string, string]> = {
  "Arabic Language":  ["#1a4731", "#276749"],
  "Quran":            ["#1a3a5c", "#2b5c8a"],
  "Islamic Studies":  ["#4a2a0a", "#7c4a1e"],
  "Fiqh & Aqeedah":  ["#2a0a4a", "#5c1e7c"],
};

const levelColor = (l: string) => ({
  beginner:     { bg: "#f0fff4", color: "#276749", border: "#9ae6b4" },
  intermediate: { bg: "#fffbeb", color: "#b7791f", border: "#f6d860" },
  advanced:     { bg: "#f5f0ff", color: "#6b46c1", border: "#d6bcfa" },
}[l?.toLowerCase()] || { bg: "#f0fff4", color: "#276749", border: "#9ae6b4" });

interface Props { defaultTab?: "courses" | "live"; }

const LearningHub = ({ defaultTab = "courses" }: Props) => {
  const { courseId }           = useParams();
  const { t, language }        = useLanguage();
  const { user, profile, hasRole } = useAuth();
  const navigate               = useNavigate();
  const qc                     = useQueryClient();
  const isPrivileged           = hasRole("admin") || hasRole("teacher");

  const [selectedSubject, setSelectedSubject] = useState<any>(null);
  const [subjectTab, setSubjectTab]           = useState("courses");
  const [inClass, setInClass]                 = useState(false);
  const [showRejoin, setShowRejoin]           = useState(false);
  const [activeLesson, setActiveLesson]       = useState<string | null>(null);

  const studentLevel = profile?.level || "beginner";
  const lv = (l: string) => ({ beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" }[l] || l);
  const subjectColor = (title: string) => SUBJECT_COLORS[title] || [G, GM];
  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 16, boxShadow: SHADOW, overflow: "hidden", ...ex,
  });

  // ── Queries ──────────────────────────────────────────────────
  const { data: subjects, isLoading: loadSub } = useQuery({
    queryKey: ["subjects-active"],
    queryFn: async () => {
      const { data } = await supabase.from("subjects").select("*").eq("is_active", true).order("created_at");
      return data || [];
    },
  });

  const { data: courses, isLoading: loadCourse } = useQuery({
    queryKey: ["all-courses-published"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("*").eq("is_published", true).order("sort_order");
      return data || [];
    },
  });

  const { data: allLessons } = useQuery({
    queryKey: ["all-lessons"],
    queryFn: async () => {
      const { data } = await supabase.from("lessons").select("id,course_id").order("sort_order");
      return data || [];
    },
  });

  const { data: myProgress } = useQuery({
    queryKey: ["my-progress", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("lesson_progress").select("lesson_id,completed").eq("user_id", user!.id).eq("completed", true);
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

  // Course detail queries
  const { data: courseDetail, isLoading: loadCourseDetail } = useQuery({
    queryKey: ["course", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("*, subjects(title,title_ar,image_url)").eq("id", courseId!).single();
      return data;
    },
  });

  const { data: courseLessons, isLoading: loadLessons } = useQuery({
    queryKey: ["course-lessons", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data } = await supabase.from("lessons").select("*").eq("course_id", courseId!).order("sort_order");
      return data || [];
    },
  });

  const { data: lessonProgress } = useQuery({
    queryKey: ["lesson-progress", courseId, user?.id],
    enabled: !!user && !!courseLessons?.length,
    queryFn: async () => {
      const ids = (courseLessons || []).map((l: any) => l.id);
      if (!ids.length) return [];
      const { data } = await supabase.from("lesson_progress").select("*").eq("user_id", user!.id).in("lesson_id", ids);
      return data || [];
    },
  });

  const markComplete = useMutation({
    mutationFn: async (lessonId: string) => {
      const { error } = await supabase.from("lesson_progress").upsert(
        { user_id: user!.id, lesson_id: lessonId, completed: true, completed_at: new Date().toISOString() },
        { onConflict: "user_id,lesson_id" }
      );
      if (error) throw error;
    },
    onSuccess: (_, lessonId) => {
      qc.invalidateQueries({ queryKey: ["lesson-progress", courseId] });
      qc.invalidateQueries({ queryKey: ["my-progress"] });
      toast({ title: t("Lesson completed! ✅", "تم إكمال الدرس! ✅") });
      if (courseLessons) {
        const idx = courseLessons.findIndex((l: any) => l.id === lessonId);
        if (idx < courseLessons.length - 1) setActiveLesson(courseLessons[idx + 1].id);
      }
    },
  });

  useEffect(() => {
    if (courseLessons && !activeLesson) {
      const completedSet = new Set((lessonProgress || []).filter((p: any) => p.completed).map((p: any) => p.lesson_id));
      const first = courseLessons.find((l: any) => !completedSet.has(l.id));
      setActiveLesson(first?.id || courseLessons[0]?.id || null);
    }
  }, [courseLessons, activeLesson]);

  // Helpers
  const completedSet   = new Set((myProgress || []).map((p: any) => p.lesson_id));
  const getLessonCount = (cid: string) => (allLessons || []).filter((l: any) => l.course_id === cid).length;
  const getDoneCount   = (cid: string) => (allLessons || []).filter((l: any) => l.course_id === cid && completedSet.has(l.id)).length;
  const getPct         = (cid: string) => { const t = getLessonCount(cid); return t > 0 ? Math.round((getDoneCount(cid) / t) * 100) : 0; };
  const isLive         = (sid: string) => liveSessions?.some((s: any) => s.subject_id === sid);

  // ── COURSE DETAIL VIEW ────────────────────────────────────────
  if (courseId && courseDetail) {
    const completedSetCourse = new Set((lessonProgress || []).filter((p: any) => p.completed).map((p: any) => p.lesson_id));
    const totalL   = courseLessons?.length || 0;
    const doneL    = completedSetCourse.size;
    const pct      = totalL > 0 ? Math.round((doneL / totalL) * 100) : 0;
    const active   = courseLessons?.find((l: any) => l.id === activeLesson);
    const subjectTitle = language === "ar"
      ? (courseDetail as any).subjects?.title_ar || (courseDetail as any).subjects?.title
      : (courseDetail as any).subjects?.title;
    const subjectImg = (courseDetail as any).subjects?.image_url;
    const lc = levelColor(courseDetail.level);

    return (
      <div style={{ fontFamily: "'Cairo',sans-serif", background: CREAM, minHeight: "100vh" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Cairo:wght@400;600;700;900&display=swap');`}</style>

        {/* Header with optional image */}
        <div style={{
          background: subjectImg ? `linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.6)), url(${subjectImg}) center/cover` : `linear-gradient(135deg,${G},${GM})`,
          padding: "16px 18px 20px"
        }}>
          <button onClick={() => navigate("/student/courses")}
            style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.7)", background: "none", border: "none", cursor: "pointer", fontSize: 13, marginBottom: 12, fontFamily: "'Cairo',sans-serif" }}>
            <ArrowLeft style={{ width: 14, height: 14 }} />
            {t("Back to Subjects", "العودة للمواد")}
          </button>
          <div style={{ display: "flex", flexWrap: "wrap" as const, alignItems: "center", gap: 8, marginBottom: 6 }}>
            <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>
              {language === "ar" ? courseDetail.title_ar || courseDetail.title : courseDetail.title}
            </h1>
            {courseDetail.level && (
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 700, background: lc.bg, color: lc.color, border: `1px solid ${lc.border}` }}>
                {lv(courseDetail.level)}
              </span>
            )}
            {subjectTitle && (
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.9)" }}>
                {subjectTitle}
              </span>
            )}
          </div>
          {courseDetail.description && (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: "0 0 14px", lineHeight: 1.5 }}>
              {language === "ar" ? courseDetail.description_ar || courseDetail.description : courseDetail.description}
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.2)", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: GOLD, transition: "width .5s" }} />
            </div>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", whiteSpace: "nowrap" as const }}>
              {doneL}/{totalL} {t("completed", "مكتمل")}
            </span>
          </div>
        </div>

        <div style={{ padding: "16px", maxWidth: 720, margin: "0 auto" }}>
          {loadLessons ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#7a9e88", fontSize: 13 }}>Loading lessons…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={card()}>
                <div style={{ padding: "14px 16px", borderBottom: `1px solid ${BORDER}` }}>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 700, color: G }}>{t("Lessons", "الدروس")}</div>
                </div>
                {(!courseLessons || courseLessons.length === 0) ? (
                  <div style={{ padding: "32px", textAlign: "center", color: "#7a9e88", fontSize: 13 }}>{t("No lessons yet", "لا توجد دروس بعد")}</div>
                ) : courseLessons.map((lesson: any, idx: number) => {
                  const isComp = completedSetCourse.has(lesson.id);
                  const isAct  = activeLesson === lesson.id;
                  return (
                    <button key={lesson.id} onClick={() => setActiveLesson(lesson.id)}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: isAct ? "#f0fff4" : "#fff", border: "none", cursor: "pointer", borderBottom: `1px solid ${BORDER}`, textAlign: "left" as const, transition: "background .15s" }}>
                      {isComp
                        ? <CheckCircle style={{ width: 20, height: 20, color: "#276749", flexShrink: 0 }} />
                        : <Circle     style={{ width: 20, height: 20, color: "#cbd5e0", flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: isAct ? 700 : 500, color: isComp ? "#7a9e88" : G, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                          {idx + 1}. {language === "ar" ? lesson.title_ar || lesson.title : lesson.title}
                        </div>
                        {lesson.duration_minutes > 0 && (
                          <div style={{ fontSize: 11, color: "#7a9e88", display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
                            <Clock style={{ width: 10, height: 10 }} />{lesson.duration_minutes} {t("min", "د")}
                          </div>
                        )}
                      </div>
                      {isAct && <ChevronRight style={{ width: 14, height: 14, color: GM }} />}
                    </button>
                  );
                })}
              </div>

              {active ? (
                <div style={card()}>
                  {active.video_url ? (
                    <div style={{ aspectRatio: "16/9", background: "#000" }}>
                      <iframe src={active.video_url} style={{ width: "100%", height: "100%", border: "none" }}
                        allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
                    </div>
                  ) : (
                    <div style={{ aspectRatio: "16/9", background: "#f8fafb", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <Play style={{ width: 44, height: 44, color: "#cbd5e0" }} />
                      <p style={{ fontSize: 13, color: "#7a9e88" }}>{t("No video for this lesson", "لا يوجد فيديو لهذا الدرس")}</p>
                    </div>
                  )}
                  <div style={{ padding: "16px 18px" }}>
                    <h2 style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 700, color: G, marginBottom: 12 }}>
                      {language === "ar" ? active.title_ar || active.title : active.title}
                    </h2>
                    {!completedSetCourse.has(active.id) ? (
                      <button onClick={() => markComplete.mutate(active.id)} disabled={markComplete.isPending}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 22px", borderRadius: 12, background: G, border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo',sans-serif" }}>
                        <CheckCircle style={{ width: 16, height: 16 }} />
                        {markComplete.isPending ? "Saving…" : t("Mark as Complete", "تحديد كمكتمل")}
                      </button>
                    ) : (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 20, background: "#f0fff4", color: "#276749", fontSize: 13, fontWeight: 700, border: "1px solid #9ae6b4" }}>
                        <CheckCircle style={{ width: 14, height: 14 }} />
                        {t("Completed", "مكتمل")}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ ...card({ padding: "40px 20px", textAlign: "center" }) }}>
                  <BookOpen style={{ width: 36, height: 36, color: "#cbd5e0", margin: "0 auto 10px" }} />
                  <p style={{ fontSize: 13, color: "#7a9e88" }}>{t("Select a lesson to begin", "اختر درسًا للبدء")}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── LIVE CLASS VIEW ───────────────────────────────────────────
  if (inClass && selectedSubject) {
    return <ClassroomView subject={selectedSubject} onLeave={() => { setInClass(false); setShowRejoin(true); }} />;
  }

  // ── SUBJECT DETAIL ────────────────────────────────────────────
  if (selectedSubject) {
    const [c1, c2] = subjectColor(selectedSubject.title);
    const subjectImg = selectedSubject.image_url;
    const subCourses = (courses || []).filter((c: any) => c.subject_id === selectedSubject.id);
    const live = isLive(selectedSubject.id);

    const SUBJECT_TABS = [
      { id: "courses",       icon: BookOpen,      label: t("Courses", "الدورات"),          count: subCourses.length },
      { id: "recordings",    icon: Video,         label: t("Recordings", "التسجيلات"),    count: null },
      { id: "syllabus",      icon: Calendar,      label: t("Syllabus", "المنهج"),         count: null },
      { id: "materials",     icon: FileText,      label: t("Materials", "المواد"),        count: null },
      { id: "assignments",   icon: ClipboardList, label: t("Assignments", "الواجبات"),   count: null },
      { id: "announcements", icon: Megaphone,     label: t("Announcements", "الإعلانات"), count: null },
    ];

    return (
      <div style={{ fontFamily: "'Cairo',sans-serif", background: CREAM, minHeight: "100vh" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Cairo:wght@400;600;700;900&display=swap');
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
          @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        `}</style>

        {/* Subject hero header with image support */}
        <div style={{
          background: subjectImg
            ? `linear-gradient(rgba(0,0,0,.5),rgba(0,0,0,.65)), url(${subjectImg}) center/cover`
            : `linear-gradient(135deg,${c1},${c2})`,
          padding: "16px 18px 0"
        }}>
          <button onClick={() => { setSelectedSubject(null); setShowRejoin(false); }}
            style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.7)", background: "none", border: "none", cursor: "pointer", fontSize: 13, marginBottom: 12, fontFamily: "'Cairo',sans-serif" }}>
            <ArrowLeft style={{ width: 14, height: 14 }} />
            {t("Back", "رجوع")}
          </button>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const }}>
                <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>
                  {language === "ar" ? selectedSubject.title_ar || selectedSubject.title : selectedSubject.title}
                </h1>
                {live && <span style={{ fontSize: 10, fontWeight: 800, padding: "4px 10px", borderRadius: 20, background: "#EF4444", color: "#fff", animation: "pulse 1.5s infinite", flexShrink: 0 }}>● LIVE</span>}
              </div>
              {selectedSubject.title_ar && selectedSubject.title_ar !== selectedSubject.title && (
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", margin: "4px 0 0" }} dir="rtl">{selectedSubject.title_ar}</p>
              )}
              {selectedSubject.description && (
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: "6px 0 0", lineHeight: 1.5 }}>{selectedSubject.description}</p>
              )}
            </div>

            {/* Join class button */}
            <button onClick={() => { setInClass(true); setShowRejoin(false); }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 18px", borderRadius: 12, background: GOLD, border: "none", color: G, fontSize: 13, fontWeight: 900, cursor: "pointer", fontFamily: "'Cairo',sans-serif", flexShrink: 0, boxShadow: "0 4px 16px rgba(201,168,76,.4)" }}>
              <Video style={{ width: 15, height: 15 }} />
              {showRejoin && live ? t("Rejoin", "إعادة الانضمام") : isPrivileged ? t("Start", "بدء الفصل") : t("Join", "انضمام")}
            </button>
          </div>

          {/* Sub-tabs */}
          <div style={{ display: "flex", gap: 0, overflowX: "auto", flexShrink: 0, marginTop: 4 }}>
            {SUBJECT_TABS.map(st => (
              <button key={st.id} onClick={() => setSubjectTab(st.id)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "11px 14px", border: "none", background: "none", cursor: "pointer", fontFamily: "'Cairo',sans-serif", fontSize: 12, fontWeight: subjectTab === st.id ? 700 : 400,
                  color: subjectTab === st.id ? "#fff" : "rgba(255,255,255,0.6)",
                  borderBottom: subjectTab === st.id ? "2.5px solid #fff" : "2.5px solid transparent",
                  whiteSpace: "nowrap" as const, flexShrink: 0, transition: "all .15s" }}>
                <st.icon style={{ width: 13, height: 13 }} />
                {st.label}
                {st.count !== null && st.count > 0 && (
                  <span style={{ fontSize: 10, background: "rgba(255,255,255,0.25)", borderRadius: 10, padding: "0 5px", marginLeft: 2 }}>{st.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: "16px", maxWidth: 720, margin: "0 auto" }}>

          {/* ── COURSES SUB-TAB ── */}
          {subjectTab === "courses" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, animation: "fadeUp .3s ease" }}>
              {subCourses.length === 0 ? (
                <div style={{ ...card({ padding: "50px 20px", textAlign: "center" }) }}>
                  <BookOpen style={{ width: 40, height: 40, color: "#cbd5e0", margin: "0 auto 12px" }} />
                  <p style={{ fontSize: 14, color: "#7a9e88" }}>{t("No courses in this subject yet.", "لا توجد دورات في هذه المادة بعد.")}</p>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
                  {subCourses.map((course: any) => {
                    const accessible = course.level?.toLowerCase() === studentLevel?.toLowerCase() || !course.level;
                    const total  = getLessonCount(course.id);
                    const done   = getDoneCount(course.id);
                    const pct    = getPct(course.id);
                    const lc     = levelColor(course.level);
                    const [cc1, cc2] = subjectColor(selectedSubject.title);
                    return (
                      <div key={course.id} style={card({ opacity: accessible ? 1 : 0.7 })}>
                        {/* Thumbnail — course image or subject image or gradient */}
                        <div style={{ height: 100, position: "relative", overflow: "hidden" }}>
                          {course.image_url || subjectImg ? (
                            <img src={course.image_url || subjectImg} alt=""
                              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <div style={{ height: "100%", background: `linear-gradient(135deg,${cc1},${cc2})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <BookOpen style={{ width: 36, height: 36, color: "rgba(255,255,255,0.3)" }} />
                            </div>
                          )}
                          {!accessible && (
                            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <Lock style={{ width: 24, height: 24, color: "rgba(255,255,255,0.7)" }} />
                            </div>
                          )}
                          {pct === 100 && (
                            <div style={{ position: "absolute", top: 8, right: 8, width: 28, height: 28, borderRadius: "50%", background: "#276749", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <CheckCircle style={{ width: 16, height: 16, color: "#fff" }} />
                            </div>
                          )}
                        </div>
                        <div style={{ padding: "14px 14px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 700, background: lc.bg, color: lc.color, border: `1px solid ${lc.border}` }}>
                              {lv(course.level || "beginner")}
                            </span>
                            <span style={{ fontSize: 11, color: "#7a9e88" }}>{total} {t("lessons", "درس")}</span>
                          </div>
                          <h3 style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, fontWeight: 700, color: G, marginBottom: 5, lineHeight: 1.4 }}>
                            {language === "ar" ? course.title_ar || course.title : course.title}
                          </h3>
                          {course.description && (
                            <p style={{ fontSize: 12, color: "#7a9e88", marginBottom: 10, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                              {language === "ar" ? course.description_ar || course.description : course.description}
                            </p>
                          )}
                          {accessible ? (
                            <>
                              {total > 0 && (
                                <div style={{ marginBottom: 10 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#7a9e88", marginBottom: 4 }}>
                                    <span>{done}/{total}</span><span>{pct}%</span>
                                  </div>
                                  <div style={{ height: 5, borderRadius: 3, background: "#f0f4f0", overflow: "hidden" }}>
                                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: `linear-gradient(90deg,${cc1},${GOLD})`, transition: "width .5s" }} />
                                  </div>
                                </div>
                              )}
                              <Link to={`/student/courses/${course.id}`} style={{ textDecoration: "none" }}>
                                <button style={{ width: "100%", padding: "10px 0", borderRadius: 10, background: G, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "'Cairo',sans-serif" }}>
                                  <Play style={{ width: 14, height: 14 }} />
                                  {done > 0 ? t("Continue", "متابعة") : t("Start", "ابدأ")}
                                </button>
                              </Link>
                            </>
                          ) : (
                            <button disabled style={{ width: "100%", padding: "10px 0", borderRadius: 10, background: "#f0f4f0", border: `1px solid ${BORDER}`, color: "#7a9e88", fontSize: 13, fontWeight: 700, cursor: "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "'Cairo',sans-serif" }}>
                              <Lock style={{ width: 13, height: 13 }} />
                              {t("Locked", "مقفل")}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {subjectTab === "recordings"    && <SubjectRecordings    subjectId={selectedSubject.id} />}
          {subjectTab === "syllabus"      && <SubjectSyllabus      subjectId={selectedSubject.id} />}
          {subjectTab === "materials"     && <SubjectMaterials     subjectId={selectedSubject.id} />}
          {subjectTab === "assignments"   && <SubjectAssignments   subjectId={selectedSubject.id} />}
          {subjectTab === "announcements" && <SubjectAnnouncements subjectId={selectedSubject.id} />}
        </div>
      </div>
    );
  }

  // ── MAIN HUB — single merged view ────────────────────────────
  const isLoading = loadSub || loadCourse;
  const anyLive   = (liveSessions || []).length > 0;

  return (
    <div style={{ fontFamily: "'Cairo',sans-serif", background: CREAM, minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Cairo:wght@400;600;700;900&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
      `}</style>

      {/* Page header */}
      <div style={{ background: `linear-gradient(135deg,${G},${GM})`, padding: "22px 18px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <GraduationCap style={{ width: 24, height: 24, color: GOLD }} />
          <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: 26, fontWeight: 700, color: "#fff", margin: 0 }}>
            {t("Learning Hub", "مركز التعلم")}
          </h1>
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: 0 }}>
          {t("Your subjects, courses, live classes & materials — all in one place", "موادك، دوراتك، فصولك الحية ومواد التعلم — كل شيء في مكان واحد")}
        </p>

        {/* Level badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{t("Your level:", "مستواك:")}</span>
          <span style={{ fontSize: 12, padding: "3px 12px", borderRadius: 20, fontWeight: 700, ...levelColor(studentLevel) }}>
            {lv(studentLevel)}
          </span>
          {anyLive && (
            <span style={{ marginLeft: "auto", fontSize: 11, padding: "3px 12px", borderRadius: 20, background: "#EF4444", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", gap: 5, animation: "pulse 1.5s infinite" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />
              {t("Live Now", "مباشر الآن")}
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: "16px", maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Loading skeletons */}
        {isLoading && [1, 2, 3].map(i => (
          <div key={i} style={{ height: 200, borderRadius: 16, background: "linear-gradient(90deg,#e8f0eb 25%,#f0f4f0 50%,#e8f0eb 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }} />
        ))}

        {/* Subject cards */}
        {!isLoading && (subjects || []).map((subject: any) => {
          const [c1, c2]    = subjectColor(subject.title);
          const live         = isLive(subject.id);
          const subCourses   = (courses || []).filter((c: any) => c.subject_id === subject.id);
          const subjectImg   = subject.image_url;
          const totalLessons = subCourses.reduce((s: number, c: any) => s + getLessonCount(c.id), 0);
          const doneLessons  = subCourses.reduce((s: number, c: any) => s + getDoneCount(c.id), 0);
          const overallPct   = totalLessons > 0 ? Math.round((doneLessons / totalLessons) * 100) : 0;

          return (
            <div key={subject.id} style={{ ...card(), animation: "fadeUp .35s ease" }}>
              {/* Subject hero */}
              <div onClick={() => { setSelectedSubject(subject); setSubjectTab("courses"); setShowRejoin(false); }}
                style={{
                  cursor: "pointer",
                  background: subjectImg
                    ? `linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.6)), url(${subjectImg}) center/cover`
                    : `linear-gradient(135deg,${c1},${c2})`,
                  padding: "20px 18px 18px",
                  position: "relative"
                }}>

                {/* LIVE badge */}
                {live && (
                  <span style={{ position: "absolute", top: 14, right: 14, fontSize: 10, fontWeight: 800, padding: "4px 10px", borderRadius: 20, background: "#EF4444", color: "#fff", animation: "pulse 1.5s infinite" }}>
                    ● LIVE
                  </span>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  {/* Subject icon or image thumbnail */}
                  {!subjectImg && (
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <BookOpen style={{ width: 22, height: 22, color: "#fff" }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: "#fff" }}>
                      {language === "ar" ? subject.title_ar || subject.title : subject.title}
                    </div>
                    {subject.title_ar && subject.title_ar !== subject.title && (
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 }} dir="rtl">{subject.title_ar}</div>
                    )}
                  </div>
                </div>

                {/* Stats row */}
                <div style={{ display: "flex", gap: 16, fontSize: 11, color: "rgba(255,255,255,0.7)", marginBottom: totalLessons > 0 ? 12 : 0 }}>
                  {subCourses.length > 0 && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><BookOpen style={{ width: 11, height: 11 }} />{subCourses.length} {t("courses", "دورات")}</span>}
                  {totalLessons > 0 && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Play style={{ width: 11, height: 11 }} />{totalLessons} {t("lessons", "درس")}</span>}
                </div>

                {/* Overall progress bar */}
                {totalLessons > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 5, borderRadius: 3, background: "rgba(255,255,255,0.2)", overflow: "hidden" }}>
                      <div style={{ width: `${overallPct}%`, height: "100%", borderRadius: 3, background: GOLD, transition: "width .5s" }} />
                    </div>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap" as const }}>{overallPct}%</span>
                  </div>
                )}
              </div>

              {/* Body */}
              <div style={{ padding: "14px 16px" }}>
                {subject.description && (
                  <p style={{ fontSize: 12, color: "#7a9e88", marginBottom: 12, lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                    {subject.description}
                  </p>
                )}

                {/* Quick-access chips */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginBottom: 12 }}>
                  {[
                    { icon: Video,        label: t("Recordings", "تسجيلات"), tab: "recordings" },
                    { icon: Calendar,     label: t("Syllabus", "المنهج"),    tab: "syllabus" },
                    { icon: FileText,     label: t("Materials", "مواد"),     tab: "materials" },
                    { icon: ClipboardList,label: t("Tasks", "واجبات"),       tab: "assignments" },
                    { icon: Megaphone,    label: t("News", "إعلانات"),       tab: "announcements" },
                  ].map((item, i) => (
                    <div key={i} onClick={() => { setSelectedSubject(subject); setSubjectTab(item.tab); }}
                      style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 20, border: `1px solid ${BORDER}`, background: "#f8fafb", fontSize: 11, fontWeight: 600, color: G, cursor: "pointer", transition: "all .15s" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#f0fff4"; (e.currentTarget as HTMLElement).style.borderColor = "#9ae6b4"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#f8fafb"; (e.currentTarget as HTMLElement).style.borderColor = BORDER; }}>
                      <item.icon style={{ width: 11, height: 11 }} />
                      {item.label}
                    </div>
                  ))}
                </div>

                {/* CTA row */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => { setSelectedSubject(subject); setSubjectTab("courses"); setShowRejoin(false); }}
                    style={{ flex: 1, padding: "10px 0", borderRadius: 10, background: G, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "'Cairo',sans-serif" }}>
                    <BookOpen style={{ width: 14, height: 14 }} />
                    {subCourses.length > 0 ? t("View Courses", "عرض الدورات") : t("Open Subject", "فتح المادة")}
                  </button>
                  <button
                    onClick={() => { setSelectedSubject(subject); setInClass(true); setShowRejoin(false); }}
                    style={{ padding: "10px 16px", borderRadius: 10, background: live ? "#EF4444" : GOLD, border: "none", color: live ? "#fff" : G, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "'Cairo',sans-serif", flexShrink: 0 }}>
                    <Video style={{ width: 14, height: 14 }} />
                    {live ? t("Join Live", "انضمام") : isPrivileged ? t("Start", "بدء") : t("Class", "الفصل")}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Empty state */}
        {!isLoading && !(subjects || []).length && (
          <div style={{ ...card({ padding: "60px 20px", textAlign: "center" }) }}>
            <GraduationCap style={{ width: 52, height: 52, color: "#cbd5e0", margin: "0 auto 14px" }} />
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, color: G, fontWeight: 700, marginBottom: 6 }}>
              {t("No subjects yet", "لا توجد مواد بعد")}
            </div>
            <p style={{ fontSize: 13, color: "#7a9e88" }}>{t("Check back soon!", "تحقق قريبًا!")}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LearningHub;
