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
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import ClassroomView        from "@/components/classroom/ClassroomView";
import SubjectRecordings    from "@/components/classroom/SubjectRecordings";
import SubjectMaterials     from "@/components/classroom/SubjectMaterials";
import SubjectSyllabus      from "@/components/classroom/SubjectSyllabus";
import SubjectAssignments   from "@/components/classroom/SubjectAssignments";
import SubjectAnnouncements from "@/components/classroom/SubjectAnnouncements";
import { useTimetableNotifications } from "@/hooks/useTimetableNotifications";

const G    = "#0f2d1f";
const GM   = "#1a4731";
const GOLD = "#c9a84c";

const levelColor = (l: string) =>
  ({ beginner:     { bg:"#f0fff4", color:"#276749", border:"#9ae6b4" },
     intermediate: { bg:"#fffbeb", color:"#b7791f", border:"#f6d860" },
     advanced:     { bg:"#f5f0ff", color:"#6b46c1", border:"#d6bcfa" },
  }[l?.toLowerCase()] || { bg:"#f0fff4", color:"#276749", border:"#9ae6b4" });

const lvLabel = (l: string) =>
  ({ beginner:"Beginner", intermediate:"Intermediate", advanced:"Advanced" }[l] || l);

/**
 * Returns true when a SUBJECT should be visible to the given student level.
 * Priority: new `levels` TEXT[] array > old `level` TEXT (legacy).
 *
 * subject.levels (array):
 *   empty / null → all levels
 *   contains studentLevel → visible
 *   contains 'all'        → visible
 * Fallback subject.level (string):
 *   null / 'all' / '' → all levels
 *   must match exactly
 */
const subjectLevelMatch = (subject: any, studentLevel: string): boolean => {
  const lvs: string[] = subject?.levels ?? [];
  if (lvs.length > 0) {
    return lvs.includes(studentLevel) || lvs.includes("all");
  }
  // Legacy single-level field
  const lv = subject?.level;
  if (!lv || lv === "all") return true;
  return lv === studentLevel;
};

/** Courses are now visible to ALL levels — only subjects are level-filtered. */
const levelMatch = (_itemLevel: string | null | undefined, _studentLevel: string): boolean => true;

interface Props { defaultTab?: "courses" | "live"; }

// ─────────────────────────────────────────────────────────────────────────────
const LearningHub = ({ defaultTab = "courses" }: Props) => {
  const { courseId }               = useParams();
  const { t, language }            = useLanguage();
  const { user, profile, hasRole } = useAuth();
  const navigate                   = useNavigate();
  const qc                         = useQueryClient();
  const isPrivileged               = hasRole("admin") || hasRole("teacher");

  // Active class reminders while browsing Learning Hub
  useTimetableNotifications();

  const [selCourse,       setSelCourse]       = useState<any | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<any | null>(null);
  const [subjectTab,      setSubjectTab]      = useState("lessons");
  const [inClass,         setInClass]         = useState(false);
  const [viewMode,        setViewMode]        = useState<"list" | "grid">("grid");
  const [activeLesson,    setActiveLesson]    = useState<string | null>(null);

  // Student's assigned level (fallback to 'beginner' if not yet set)
  const studentLevel = (profile?.level || profile?.course_level || "beginner") as string;

  // ── Queries ───────────────────────────────────────────────────────────────

  // ALL published courses (we filter client-side so we can show the "nothing for your level" message)
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

  // Apply level filter — admins/teachers see everything
  const courses = isPrivileged
    ? (allCourses || [])
    : (allCourses || []).filter((c: any) => levelMatch(c.level, studentLevel));

  // Subjects for selected course — filtered by student level
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
    : (allCourseSubjects || []).filter((s: any) => subjectLevelMatch(s, studentLevel));

  // Lessons for selected subject
  const { data: subjectLessons, isLoading: loadLessons } = useQuery({
    queryKey: ["subject-lessons", selectedSubject?.id],
    enabled: !!selectedSubject,
    queryFn: async () => {
      const { data } = await supabase
        .from("lessons")
        .select("*")
        .eq("course_id", selectedSubject!.id)
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

  // URL-based course detail (/student/courses/:courseId)
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
    : (allUrlCourseSubjects || []).filter((s: any) => subjectLevelMatch(s, studentLevel));

  // Mark lesson complete
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

  useEffect(() => {
    if (subjectLessons && !activeLesson) {
      const first = subjectLessons.find((l: any) => !completedSet.has(l.id));
      setActiveLesson(first?.id || subjectLessons[0]?.id || null);
    }
  }, [subjectLessons]);

  // ═══════════════════════════════════════════════════════════════════════════
  // URL-BASED COURSE VIEW (/student/courses/:courseId)
  // ═══════════════════════════════════════════════════════════════════════════
  if (courseId && urlCourse) {
    if (!selectedSubject) {
      // No course-level restriction — courses visible to all students
      const courseRestricted = false;

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
            {courseRestricted ? (
              <LevelLockedCard studentLevel={studentLevel} requiredLevel={urlCourse.level} />
            ) : urlCourseSubjects.length === 0 ? (
              <div style={{ background:"#fff", borderRadius:16, padding:"40px 20px", textAlign:"center", border:"1px solid #e5e7eb" }}>
                <BookOpen style={{ width:36, height:36, color:"#d1d5db", margin:"0 auto 12px" }} />
                <p style={{ color:"#9ca3af", fontSize:14 }}>{t("No subjects yet", "لا توجد مواد بعد")}</p>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:14 }}>
                {urlCourseSubjects.map((sub: any) => (
                  <SubjectCard key={sub.id} subject={sub} onClick={() => setSelectedSubject(sub)} live={isLive(sub.id)} language={language} />
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIVE CLASS
  // ═══════════════════════════════════════════════════════════════════════════
  if (inClass && selectedSubject) {
    return <ClassroomView subject={selectedSubject} onLeave={() => setInClass(false)} />;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBJECT DETAIL — with tabs
  // ═══════════════════════════════════════════════════════════════════════════
  if (selectedSubject) {
    const live  = isLive(selectedSubject.id);
    const done  = new Set((myProgress || []).filter((p: any) => p.completed).map((p: any) => p.lesson_id));
    const totalL = (subjectLessons || []).length;
    const doneL  = (subjectLessons || []).filter((l: any) => done.has(l.id)).length;
    const pct    = totalL > 0 ? Math.round((doneL / totalL) * 100) : 0;

    const TABS = [
      { id:"lessons",       icon:BookOpen,      label:t("Lessons","الدروس"),        count:totalL },
      { id:"recordings",    icon:Video,         label:t("Recordings","التسجيلات"),  count:null },
      { id:"syllabus",      icon:Calendar,      label:t("Syllabus","المنهج"),       count:null },
      { id:"materials",     icon:FileText,      label:t("Materials","المواد"),      count:null },
      { id:"assignments",   icon:ClipboardList, label:t("Tasks","الواجبات"),        count:null },
      { id:"announcements", icon:Megaphone,     label:t("News","الإعلانات"),        count:null },
    ];

    const activeL = subjectLessons?.find((l: any) => l.id === activeLesson);

    return (
      <div style={{ fontFamily:"'Cairo',sans-serif", background:"#f8fafb", minHeight:"100vh" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>

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
            {/* Arabic description first */}
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
            {/* English below */}
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

            <button
              onClick={() => setInClass(true)}
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
                <>
                  <div style={{ background:"#fff", borderRadius:16, border:"1px solid #e5e7eb", overflow:"hidden", marginBottom:14 }}>
                    <div style={{ padding:"14px 18px", borderBottom:"1px solid #f0f4f0", fontSize:13, fontWeight:700, color:G }}>
                      {t("Lessons", "الدروس")} ({(subjectLessons||[]).length})
                    </div>
                    {(subjectLessons||[]).map((lesson: any, idx: number) => {
                      const isComp = done.has(lesson.id);
                      const isAct  = activeLesson === lesson.id;
                      return (
                        <button key={lesson.id} onClick={() => setActiveLesson(lesson.id)}
                          style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"12px 18px", background: isAct ? "#f0fff4" : "#fff", border:"none", cursor:"pointer", borderBottom:"1px solid #f0f4f0", textAlign:"left", transition:"background .15s" }}>
                          {isComp
                            ? <CheckCircle style={{ width:19, height:19, color:"#22c55e", flexShrink:0 }} />
                            : <Circle     style={{ width:19, height:19, color:"#d1d5db", flexShrink:0 }} />}
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight: isAct ? 700 : 500, color: isComp ? "#9ca3af" : G, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {idx+1}. {language === "ar" ? lesson.title_ar || lesson.title : lesson.title}
                            </div>
                            {lesson.duration_minutes > 0 && <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}><Clock style={{ width:10, height:10, display:"inline", marginRight:3 }} />{lesson.duration_minutes} {t("min","د")}</div>}
                          </div>
                          {isAct && <ChevronRight style={{ width:14, height:14, color:GM }} />}
                        </button>
                      );
                    })}
                  </div>

                  {activeL && (
                    <div style={{ background:"#fff", borderRadius:16, border:"1px solid #e5e7eb", overflow:"hidden" }}>
                      {activeL.video_url ? (
                        <div style={{ aspectRatio:"16/9", background:"#000" }}>
                          <iframe src={activeL.video_url} style={{ width:"100%", height:"100%", border:"none" }} allowFullScreen />
                        </div>
                      ) : (
                        <div style={{ aspectRatio:"16/9", background:"#f8fafb", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8 }}>
                          <Play style={{ width:44, height:44, color:"#d1d5db" }} />
                          <p style={{ fontSize:13, color:"#9ca3af" }}>{t("No video for this lesson","لا يوجد فيديو")}</p>
                        </div>
                      )}
                      <div style={{ padding:"16px 18px" }}>
                        <h2 style={{ fontSize:16, fontWeight:700, color:G, marginBottom:14 }}>
                          {language === "ar" ? activeL.title_ar || activeL.title : activeL.title}
                        </h2>
                        {!done.has(activeL.id) ? (
                          <button onClick={() => markComplete.mutate(activeL.id)} disabled={markComplete.isPending}
                            style={{ display:"flex", alignItems:"center", gap:8, padding:"11px 22px", borderRadius:12, background:G, border:"none", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                            <CheckCircle style={{ width:15, height:15 }} />
                            {markComplete.isPending ? "Saving…" : t("Mark as Complete","تحديد كمكتمل")}
                          </button>
                        ) : (
                          <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"8px 16px", borderRadius:20, background:"#f0fff4", color:"#22c55e", fontSize:13, fontWeight:700, border:"1px solid #86efac" }}>
                            <CheckCircle style={{ width:14, height:14 }} />{t("Completed","مكتمل")}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
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

  // ═══════════════════════════════════════════════════════════════════════════
  // COURSE SUBJECTS VIEW (after clicking a course card)
  // ═══════════════════════════════════════════════════════════════════════════
  if (selCourse) {
    const lc = levelColor(selCourse.level);
    return (
      <div style={{ fontFamily:"'Cairo',sans-serif", background:"#f8fafb", minHeight:"100vh" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');@keyframes spin{to{transform:rotate(360deg)}};@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
        <div style={{ background: selCourse.image_url ? `linear-gradient(rgba(0,0,0,.5),rgba(0,0,0,.65)),url(${selCourse.image_url}) center/cover` : `linear-gradient(135deg,${G},${GM})`, padding:"14px 16px 20px" }}>
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
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN HUB — COURSE CARDS (level-filtered)
  // ═══════════════════════════════════════════════════════════════════════════
  const anyLive = (liveSessions || []).length > 0;

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

      {/* ── HEADER ── */}
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
          {/* Grid/List toggle */}
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

      {/* ── COURSE CARDS ── */}
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
                        ? <img src={course.image_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                        : <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center" }}><BookOpen style={{ width:32, height:32, color:"rgba(255,255,255,.3)" }} /></div>
                      }
                      {anyLive && <span style={{ position:"absolute", top:8, left:8, fontSize:9, fontWeight:800, padding:"3px 7px", borderRadius:20, background:"#ef4444", color:"#fff", animation:"pulse 1.5s infinite" }}>● LIVE</span>}
                    </div>
                    {/* ALL text BELOW the image */}
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

              // LIST CARD
              return (
                <div key={course.id} className="sc"
                  style={{ background:"#fff", borderRadius:18, border:"1px solid #e5e7eb", overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,.05)", cursor:"pointer" }}
                  onClick={() => setSelCourse(course)}>
                  <div style={{ display:"flex", gap:0 }}>
                    <div style={{ width:100, flexShrink:0, background:`linear-gradient(135deg,${G},${GM})` }}>
                      {course.image_url
                        ? <img src={course.image_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                        : <div style={{ height:"100%", minHeight:90, display:"flex", alignItems:"center", justifyContent:"center" }}><BookOpen style={{ width:24, height:24, color:"rgba(255,255,255,.3)" }} /></div>
                      }
                    </div>
                    <div style={{ flex:1, padding:"14px 16px" }}>
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
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
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
// SubjectCard — text always below image
// ─────────────────────────────────────────────────────────────────────────────
function SubjectCard({ subject, onClick, live, language }: {
  subject: any; onClick: () => void; live: boolean; language: string;
}) {
  const lc   = levelColor(subject.level);
  const name = language === "ar" ? subject.title_ar || subject.title : subject.title;
  return (
    <div className="sc"
      onClick={onClick}
      style={{ background:"#fff", borderRadius:16, border:"1px solid #e5e7eb", overflow:"hidden", cursor:"pointer", boxShadow:"0 2px 8px rgba(0,0,0,.05)" }}>
      {/* Image only — no text overlay */}
      <div style={{ height:110, overflow:"hidden", background:`linear-gradient(135deg,#0f2d1f,#1a4731)`, position:"relative" }}>
        {subject.image_url
          ? <img src={subject.image_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
          : <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center" }}><BookOpen style={{ width:28, height:28, color:"rgba(255,255,255,.25)" }} /></div>
        }
        {live && <span style={{ position:"absolute", top:8, left:8, fontSize:9, fontWeight:800, padding:"3px 7px", borderRadius:20, background:"#ef4444", color:"#fff" }}>● LIVE</span>}
      </div>
      {/* All text below the image */}
      <div style={{ padding:"10px 12px 14px" }}>
        {subject.level && subject.level !== "all" && (
          <span style={{ fontSize:9, padding:"2px 7px", borderRadius:9, fontWeight:700, ...lc, display:"inline-block", marginBottom:5 }}>{subject.level}</span>
        )}
        {/* Arabic title first */}
        {subject.title_ar && (
          <p style={{ fontSize:12, color:GOLD, margin:"0 0 2px", fontFamily:"'Amiri',serif" }} dir="rtl">{subject.title_ar}</p>
        )}
        <h3 style={{ fontSize:13, fontWeight:800, color:"#0f2d1f", margin:"0 0 4px", lineHeight:1.4 }}>{name}</h3>
        {subject.description && (
          <p style={{ fontSize:11, color:"#9ca3af", margin:"0 0 8px", lineHeight:1.5, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" as any, overflow:"hidden" }}>
            {subject.description}
          </p>
        )}
        <button style={{ width:"100%", padding:"7px", borderRadius:9, background:"#0f2d1f", border:"none", color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
          <BookOpen style={{ width:11, height:11 }} />Open Subject
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Level-locked placeholder
// ─────────────────────────────────────────────────────────────────────────────
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