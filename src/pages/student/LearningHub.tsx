/*  src/pages/student/LearningHub.tsx
    REDESIGNED — Clean white cards, grid/list toggle,
    uncluttered layout, beautiful subject cards with image support
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
  Video, FileText, ClipboardList, Megaphone, Calendar,
  ChevronRight, LayoutGrid, List, GraduationCap,
} from "lucide-react";
import ClassroomView        from "@/components/classroom/ClassroomView";
import SubjectRecordings    from "@/components/classroom/SubjectRecordings";
import SubjectMaterials     from "@/components/classroom/SubjectMaterials";
import SubjectSyllabus      from "@/components/classroom/SubjectSyllabus";
import SubjectAssignments   from "@/components/classroom/SubjectAssignments";
import SubjectAnnouncements from "@/components/classroom/SubjectAnnouncements";

const G    = "#0f2d1f";
const GM   = "#1a4731";
const GOLD = "#c9a84c";

const SUBJECT_COLORS: Record<string, [string, string]> = {
  "Arabic Language": ["#1a4731", "#276749"],
  "Quran":           ["#1a3a5c", "#2b5c8a"],
  "Islamic Studies": ["#4a2a0a", "#7c4a1e"],
  "Fiqh & Aqeedah":  ["#2a0a4a", "#5c1e7c"],
};
const subjectColor = (t: string) => SUBJECT_COLORS[t] || [G, GM];

const levelColor = (l: string) => ({
  beginner:     { bg: "#f0fff4", color: "#276749", border: "#9ae6b4" },
  intermediate: { bg: "#fffbeb", color: "#b7791f", border: "#f6d860" },
  advanced:     { bg: "#f5f0ff", color: "#6b46c1", border: "#d6bcfa" },
}[l?.toLowerCase()] || { bg: "#f0fff4", color: "#276749", border: "#9ae6b4" });

interface Props { defaultTab?: "courses" | "live"; }

const LearningHub = ({ defaultTab = "courses" }: Props) => {
  const { courseId }               = useParams();
  const { t, language }            = useLanguage();
  const { user, profile, hasRole } = useAuth();
  const navigate                   = useNavigate();
  const qc                         = useQueryClient();
  const isPrivileged               = hasRole("admin") || hasRole("teacher");

  const [selectedSubject, setSelectedSubject] = useState<any>(null);
  const [subjectTab, setSubjectTab]           = useState("courses");
  const [inClass, setInClass]                 = useState(false);
  const [showRejoin, setShowRejoin]           = useState(false);
  const [activeLesson, setActiveLesson]       = useState<string | null>(null);
  const [viewMode, setViewMode]               = useState<"list" | "grid">("list");

  const studentLevel = profile?.level || "beginner";
  const lv = (l: string) => ({ beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" }[l] || l);

  // ── Queries ──────────────────────────────────────────────────
  const { data: subjects,  isLoading: loadSub    } = useQuery({ queryKey: ["subjects-active"],        queryFn: async () => { const { data } = await supabase.from("subjects").select("*").eq("is_active", true).order("created_at"); return data || []; } });
  const { data: courses,   isLoading: loadCourse  } = useQuery({ queryKey: ["all-courses-published"],  queryFn: async () => { const { data } = await supabase.from("courses").select("*").eq("is_published", true).order("sort_order"); return data || []; } });
  const { data: allLessons                        } = useQuery({ queryKey: ["all-lessons"],             queryFn: async () => { const { data } = await supabase.from("lessons").select("id,course_id").order("sort_order"); return data || []; } });
  const { data: myProgress                        } = useQuery({ queryKey: ["my-progress", user?.id],  enabled: !!user, queryFn: async () => { const { data } = await supabase.from("lesson_progress").select("lesson_id,completed").eq("user_id", user!.id).eq("completed", true); return data || []; } });
  const { data: liveSessions                      } = useQuery({ queryKey: ["live-sessions"],           queryFn: async () => { const { data } = await supabase.from("live_sessions").select("*").eq("status", "live"); return data || []; }, refetchInterval: 5000 });

  const { data: courseDetail,  isLoading: loadCourseDetail } = useQuery({ queryKey: ["course", courseId], enabled: !!courseId, queryFn: async () => { const { data } = await supabase.from("courses").select("*, subjects(title,title_ar,image_url)").eq("id", courseId!).single(); return data; } });
  const { data: courseLessons, isLoading: loadLessons      } = useQuery({ queryKey: ["course-lessons", courseId], enabled: !!courseId, queryFn: async () => { const { data } = await supabase.from("lessons").select("*").eq("course_id", courseId!).order("sort_order"); return data || []; } });
  const { data: lessonProgress                             } = useQuery({ queryKey: ["lesson-progress", courseId, user?.id], enabled: !!user && !!courseLessons?.length, queryFn: async () => { const ids = (courseLessons || []).map((l: any) => l.id); if (!ids.length) return []; const { data } = await supabase.from("lesson_progress").select("*").eq("user_id", user!.id).in("lesson_id", ids); return data || []; } });

  const markComplete = useMutation({
    mutationFn: async (lessonId: string) => { const { error } = await supabase.from("lesson_progress").upsert({ user_id: user!.id, lesson_id: lessonId, completed: true, completed_at: new Date().toISOString() }, { onConflict: "user_id,lesson_id" }); if (error) throw error; },
    onSuccess: (_, lessonId) => {
      qc.invalidateQueries({ queryKey: ["lesson-progress", courseId] });
      qc.invalidateQueries({ queryKey: ["my-progress"] });
      toast({ title: t("Lesson completed! ✅", "تم إكمال الدرس! ✅") });
      if (courseLessons) { const idx = courseLessons.findIndex((l: any) => l.id === lessonId); if (idx < courseLessons.length - 1) setActiveLesson(courseLessons[idx + 1].id); }
    },
  });

  useEffect(() => {
    if (courseLessons && !activeLesson) {
      const done  = new Set((lessonProgress || []).filter((p: any) => p.completed).map((p: any) => p.lesson_id));
      const first = courseLessons.find((l: any) => !done.has(l.id));
      setActiveLesson(first?.id || courseLessons[0]?.id || null);
    }
  }, [courseLessons, activeLesson]);

  const completedSet   = new Set((myProgress || []).map((p: any) => p.lesson_id));
  const getLessonCount = (cid: string) => (allLessons || []).filter((l: any) => l.course_id === cid).length;
  const getDoneCount   = (cid: string) => (allLessons || []).filter((l: any) => l.course_id === cid && completedSet.has(l.id)).length;
  const getPct         = (cid: string) => { const tt = getLessonCount(cid); return tt > 0 ? Math.round((getDoneCount(cid) / tt) * 100) : 0; };
  const isLive         = (sid: string) => liveSessions?.some((s: any) => s.subject_id === sid);

  // ═══════════════════════════════════════════════════════════
  // COURSE DETAIL
  // ═══════════════════════════════════════════════════════════
  if (courseId && courseDetail) {
    const done   = new Set((lessonProgress || []).filter((p: any) => p.completed).map((p: any) => p.lesson_id));
    const totalL = courseLessons?.length || 0;
    const doneL  = done.size;
    const pct    = totalL > 0 ? Math.round((doneL / totalL) * 100) : 0;
    const active = courseLessons?.find((l: any) => l.id === activeLesson);
    const subImg = (courseDetail as any).subjects?.image_url;
    const [c1, c2] = subjectColor((courseDetail as any).subjects?.title || "");
    const lc = levelColor(courseDetail.level);

    return (
      <div style={{ fontFamily: "'Cairo',sans-serif", background: "#f8fafb", minHeight: "100vh" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ background: subImg ? `linear-gradient(rgba(0,0,0,.5),rgba(0,0,0,.65)),url(${subImg}) center/cover` : `linear-gradient(135deg,${c1},${c2})`, padding: "14px 16px 20px" }}>
          <button onClick={() => navigate("/student/courses")} style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,.8)", background: "rgba(255,255,255,.12)", border: "none", borderRadius: 20, padding: "6px 14px", cursor: "pointer", fontSize: 12, marginBottom: 14, fontFamily: "'Cairo',sans-serif" }}>
            <ArrowLeft style={{ width: 13, height: 13 }} />{t("Back", "رجوع")}
          </button>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: "#fff", margin: "0 0 8px" }}>{language === "ar" ? courseDetail.title_ar || courseDetail.title : courseDetail.title}</h1>
          {courseDetail.level && <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 700, background: lc.bg, color: lc.color }}>{lv(courseDetail.level)}</span>}
          {totalL > 0 && (
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, height: 5, borderRadius: 3, background: "rgba(255,255,255,.2)", overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: GOLD, transition: "width .5s" }} />
              </div>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,.8)", whiteSpace: "nowrap" as const }}>{doneL}/{totalL}</span>
            </div>
          )}
        </div>
        <div style={{ padding: "16px", maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {loadLessons ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>Loading…</div>
          ) : !courseLessons?.length ? (
            <div style={{ background: "#fff", borderRadius: 16, padding: "40px 20px", textAlign: "center", border: "1px solid #e5e7eb" }}>
              <BookOpen style={{ width: 36, height: 36, color: "#d1d5db", margin: "0 auto 12px" }} />
              <p style={{ color: "#9ca3af", fontSize: 14 }}>{t("No lessons yet", "لا توجد دروس بعد")}</p>
            </div>
          ) : (
            <>
              <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", overflow: "hidden" }}>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #f0f4f0", fontSize: 13, fontWeight: 700, color: G }}>{t("Lessons", "الدروس")} ({courseLessons.length})</div>
                {courseLessons.map((lesson: any, idx: number) => {
                  const isComp = done.has(lesson.id);
                  const isAct  = activeLesson === lesson.id;
                  return (
                    <button key={lesson.id} onClick={() => setActiveLesson(lesson.id)}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", background: isAct ? "#f0fff4" : "#fff", border: "none", cursor: "pointer", borderBottom: "1px solid #f0f4f0", textAlign: "left" as const, transition: "background .15s" }}>
                      {isComp ? <CheckCircle style={{ width: 19, height: 19, color: "#22c55e", flexShrink: 0 }} /> : <Circle style={{ width: 19, height: 19, color: "#d1d5db", flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: isAct ? 700 : 500, color: isComp ? "#9ca3af" : G, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                          {idx + 1}. {language === "ar" ? lesson.title_ar || lesson.title : lesson.title}
                        </div>
                        {lesson.duration_minutes > 0 && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}><Clock style={{ width: 10, height: 10, display: "inline", marginRight: 3 }} />{lesson.duration_minutes} {t("min", "د")}</div>}
                      </div>
                      {isAct && <ChevronRight style={{ width: 14, height: 14, color: GM }} />}
                    </button>
                  );
                })}
              </div>
              {active && (
                <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", overflow: "hidden" }}>
                  {active.video_url ? (
                    <div style={{ aspectRatio: "16/9", background: "#000" }}><iframe src={active.video_url} style={{ width: "100%", height: "100%", border: "none" }} allowFullScreen /></div>
                  ) : (
                    <div style={{ aspectRatio: "16/9", background: "#f8fafb", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <Play style={{ width: 44, height: 44, color: "#d1d5db" }} />
                      <p style={{ fontSize: 13, color: "#9ca3af" }}>{t("No video for this lesson", "لا يوجد فيديو")}</p>
                    </div>
                  )}
                  <div style={{ padding: "16px 18px" }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: G, marginBottom: 14 }}>{language === "ar" ? active.title_ar || active.title : active.title}</h2>
                    {!done.has(active.id) ? (
                      <button onClick={() => markComplete.mutate(active.id)} disabled={markComplete.isPending}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 22px", borderRadius: 12, background: G, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                        <CheckCircle style={{ width: 15, height: 15 }} />{markComplete.isPending ? "Saving…" : t("Mark as Complete", "تحديد كمكتمل")}
                      </button>
                    ) : (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 20, background: "#f0fff4", color: "#22c55e", fontSize: 13, fontWeight: 700, border: "1px solid #86efac" }}>
                        <CheckCircle style={{ width: 14, height: 14 }} />{t("Completed", "مكتمل")}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // LIVE CLASS
  // ═══════════════════════════════════════════════════════════
  if (inClass && selectedSubject) {
    return <ClassroomView subject={selectedSubject} onLeave={() => { setInClass(false); setShowRejoin(true); }} />;
  }

  // ═══════════════════════════════════════════════════════════
  // SUBJECT DETAIL
  // ═══════════════════════════════════════════════════════════
  if (selectedSubject) {
    const [c1, c2]   = subjectColor(selectedSubject.title);
    const subjectImg = selectedSubject.image_url;
    const subCourses = (courses || []).filter((c: any) => c.subject_id === selectedSubject.id);
    const live = isLive(selectedSubject.id);

    const TABS = [
      { id: "courses",       icon: BookOpen,      label: t("Courses", "الدورات"),        count: subCourses.length },
      { id: "recordings",    icon: Video,         label: t("Recordings", "التسجيلات"),  count: null },
      { id: "syllabus",      icon: Calendar,      label: t("Syllabus", "المنهج"),       count: null },
      { id: "materials",     icon: FileText,      label: t("Materials", "المواد"),      count: null },
      { id: "assignments",   icon: ClipboardList, label: t("Tasks", "الواجبات"),        count: null },
      { id: "announcements", icon: Megaphone,     label: t("News", "الإعلانات"),        count: null },
    ];

    return (
      <div style={{ fontFamily: "'Cairo',sans-serif", background: "#f8fafb", minHeight: "100vh" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>

        <div style={{ background: subjectImg ? `linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.6)),url(${subjectImg}) center/cover` : `linear-gradient(135deg,${c1},${c2})`, padding: "14px 16px 0" }}>
          <button onClick={() => { setSelectedSubject(null); setShowRejoin(false); }}
            style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,.8)", background: "rgba(255,255,255,.12)", border: "none", borderRadius: 20, padding: "6px 14px", cursor: "pointer", fontSize: 12, marginBottom: 14, fontFamily: "'Cairo',sans-serif" }}>
            <ArrowLeft style={{ width: 13, height: 13 }} />{t("Back", "رجوع")}
          </button>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" as const }}>
                <h1 style={{ fontSize: 21, fontWeight: 900, color: "#fff", margin: 0 }}>
                  {language === "ar" ? selectedSubject.title_ar || selectedSubject.title : selectedSubject.title}
                </h1>
                {live && <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: "#ef4444", color: "#fff", animation: "pulse 1.5s infinite" }}>● LIVE</span>}
              </div>
              {selectedSubject.description && <p style={{ fontSize: 12, color: "rgba(255,255,255,.6)", margin: "5px 0 0", lineHeight: 1.5 }}>{selectedSubject.description}</p>}
            </div>
            <button onClick={() => { setInClass(true); setShowRejoin(false); }}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 12, background: GOLD, border: "none", color: G, fontSize: 13, fontWeight: 900, cursor: "pointer", fontFamily: "'Cairo',sans-serif", flexShrink: 0, boxShadow: "0 4px 12px rgba(201,168,76,.4)" }}>
              <Video style={{ width: 14, height: 14 }} />
              {live ? t("Join", "انضمام") : isPrivileged ? t("Start", "بدء") : t("Class", "الفصل")}
            </button>
          </div>
          <div style={{ display: "flex", overflowX: "auto", paddingBottom: 0 }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setSubjectTab(tab.id)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "10px 14px", border: "none", background: "none", cursor: "pointer", fontFamily: "'Cairo',sans-serif", fontSize: 12, fontWeight: subjectTab === tab.id ? 700 : 400,
                  color: subjectTab === tab.id ? "#fff" : "rgba(255,255,255,.5)",
                  borderBottom: subjectTab === tab.id ? "2.5px solid #fff" : "2.5px solid transparent",
                  whiteSpace: "nowrap" as const, flexShrink: 0, transition: "all .15s" }}>
                <tab.icon style={{ width: 12, height: 12 }} />{tab.label}
                {tab.count !== null && tab.count > 0 && <span style={{ fontSize: 9, background: "rgba(255,255,255,.22)", borderRadius: 10, padding: "1px 5px", marginLeft: 2 }}>{tab.count}</span>}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: "16px", maxWidth: 720, margin: "0 auto" }}>
          {subjectTab === "courses" && (
            subCourses.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: 16, padding: "40px 20px", textAlign: "center", border: "1px solid #e5e7eb" }}>
                <BookOpen style={{ width: 36, height: 36, color: "#d1d5db", margin: "0 auto 12px" }} />
                <p style={{ color: "#9ca3af", fontSize: 14 }}>{t("No courses yet", "لا توجد دورات بعد")}</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14 }}>
                {subCourses.map((course: any) => {
                  const accessible = course.level?.toLowerCase() === studentLevel?.toLowerCase() || !course.level;
                  const total = getLessonCount(course.id);
                  const pct   = getPct(course.id);
                  const done  = getDoneCount(course.id);
                  const lc    = levelColor(course.level);
                  return (
                    <div key={course.id} style={{ background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", overflow: "hidden", opacity: accessible ? 1 : 0.65, boxShadow: "0 2px 8px rgba(0,0,0,.05)" }}>
                      <div style={{ height: 90, position: "relative" }}>
                        {course.image_url || subjectImg ? <img src={course.image_url || subjectImg} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ height: "100%", background: `linear-gradient(135deg,${c1},${c2})`, display: "flex", alignItems: "center", justifyContent: "center" }}><BookOpen style={{ width: 28, height: 28, color: "rgba(255,255,255,.3)" }} /></div>}
                        {!accessible && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center" }}><Lock style={{ width: 20, height: 20, color: "#fff" }} /></div>}
                        {pct === 100 && <div style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center" }}><CheckCircle style={{ width: 13, height: 13, color: "#fff" }} /></div>}
                      </div>
                      <div style={{ padding: "12px 14px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          {course.level && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 9, fontWeight: 700, background: lc.bg, color: lc.color }}>{lv(course.level)}</span>}
                          {total > 0 && <span style={{ fontSize: 11, color: "#9ca3af" }}>{total} {t("lessons", "درس")}</span>}
                        </div>
                        <h3 style={{ fontSize: 13, fontWeight: 700, color: G, marginBottom: 8, lineHeight: 1.4 }}>{language === "ar" ? course.title_ar || course.title : course.title}</h3>
                        {accessible && total > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9ca3af", marginBottom: 4 }}><span>{done}/{total}</span><span>{pct}%</span></div>
                            <div style={{ height: 4, borderRadius: 2, background: "#f0f4f0", overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: `linear-gradient(90deg,${c1},${GOLD})`, transition: "width .5s" }} /></div>
                          </div>
                        )}
                        {accessible ? (
                          <Link to={`/student/courses/${course.id}`} style={{ textDecoration: "none" }}>
                            <button style={{ width: "100%", padding: "9px", borderRadius: 10, background: G, border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                              <Play style={{ width: 12, height: 12 }} />{done > 0 ? t("Continue", "متابعة") : t("Start", "ابدأ")}
                            </button>
                          </Link>
                        ) : (
                          <button disabled style={{ width: "100%", padding: "9px", borderRadius: 10, background: "#f0f4f0", border: "1px solid #e5e7eb", color: "#9ca3af", fontSize: 12, fontWeight: 700, cursor: "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                            <Lock style={{ width: 12, height: 12 }} />{t("Locked", "مقفل")}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
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

  // ═══════════════════════════════════════════════════════════
  // MAIN HUB
  // ═══════════════════════════════════════════════════════════
  const isLoading = loadSub || loadCourse;
  const anyLive   = (liveSessions || []).length > 0;

  return (
    <div style={{ fontFamily: "'Cairo',sans-serif", background: "#f8fafb", minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
        @keyframes pulse  { 0%,100%{opacity:1}50%{opacity:.4} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer{ 0%{background-position:-200% 0}100%{background-position:200% 0} }
        .sc:hover { box-shadow: 0 8px 28px rgba(15,45,31,.13) !important; transform: translateY(-2px) !important; }
        .sc { transition: box-shadow .2s, transform .2s; }
        .chip:hover { border-color: #9ae6b4 !important; background: #f0fff4 !important; }
        .chip { transition: all .15s; }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ background: `linear-gradient(135deg,${G} 0%,${GM} 100%)`, padding: "20px 18px 22px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
              <GraduationCap style={{ width: 22, height: 22, color: GOLD }} />
              <h1 style={{ fontSize: 22, fontWeight: 900, color: "#fff", margin: 0 }}>{t("Learning Hub", "مركز التعلم")}</h1>
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,.5)", margin: "0 0 14px" }}>
              {t("Subjects, courses & live classes", "المواد، الدورات والفصول الحية")}
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,.5)" }}>{t("Level:", "المستوى:")}</span>
              <span style={{ fontSize: 11, padding: "3px 12px", borderRadius: 20, fontWeight: 700, ...levelColor(studentLevel) }}>{lv(studentLevel)}</span>
              {anyLive && (
                <span style={{ marginLeft: 4, fontSize: 11, padding: "3px 11px", borderRadius: 20, background: "#ef4444", color: "#fff", fontWeight: 700, display: "flex", alignItems: "center", gap: 5, animation: "pulse 1.5s infinite" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", display: "inline-block" }} />
                  {t("Live", "مباشر")}
                </span>
              )}
            </div>
          </div>

          {/* Grid/List toggle */}
          <div style={{ display: "flex", background: "rgba(255,255,255,.12)", borderRadius: 11, padding: 3, gap: 2, marginTop: 4 }}>
            <button onClick={() => setViewMode("list")}
              title="List view"
              style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: viewMode === "list" ? "#fff" : "transparent", color: viewMode === "list" ? G : "rgba(255,255,255,.6)", transition: "all .15s" }}>
              <List style={{ width: 17, height: 17 }} />
            </button>
            <button onClick={() => setViewMode("grid")}
              title="Grid view"
              style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: viewMode === "grid" ? "#fff" : "transparent", color: viewMode === "grid" ? G : "rgba(255,255,255,.6)", transition: "all .15s" }}>
              <LayoutGrid style={{ width: 17, height: 17 }} />
            </button>
          </div>
        </div>
      </div>

      {/* ── CARDS ── */}
      <div style={{ padding: "16px", maxWidth: 800, margin: "0 auto" }}>

        {/* Skeleton */}
        {isLoading && (
          <div style={{ display: "grid", gridTemplateColumns: viewMode === "grid" ? "repeat(auto-fill,minmax(160px,1fr))" : "1fr", gap: 12 }}>
            {[1, 2, 3].map(i => <div key={i} style={{ height: viewMode === "grid" ? 200 : 130, borderRadius: 16, background: "linear-gradient(90deg,#e5e7eb 25%,#f0f4f0 50%,#e5e7eb 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }} />)}
          </div>
        )}

        {!isLoading && (
          <div style={{ display: "grid", gridTemplateColumns: viewMode === "grid" ? "repeat(auto-fill,minmax(160px,1fr))" : "1fr", gap: 14, animation: "fadeUp .3s ease" }}>
            {(subjects || []).map((subject: any) => {
              const [c1, c2]     = subjectColor(subject.title);
              const img          = subject.image_url;
              const live         = isLive(subject.id);
              const subCourses   = (courses || []).filter((c: any) => c.subject_id === subject.id);
              const totalLessons = subCourses.reduce((s: number, c: any) => s + getLessonCount(c.id), 0);
              const doneLessons  = subCourses.reduce((s: number, c: any) => s + getDoneCount(c.id), 0);
              const pct          = totalLessons > 0 ? Math.round((doneLessons / totalLessons) * 100) : 0;
              const subjectName  = language === "ar" ? subject.title_ar || subject.title : subject.title;

              // ════════════════ GRID CARD ════════════════
              if (viewMode === "grid") {
                return (
                  <div key={subject.id} className="sc"
                    style={{ background: "#fff", borderRadius: 18, border: "1px solid #e5e7eb", overflow: "hidden", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,.05)" }}>

                    {/* Image / gradient hero */}
                    <div onClick={() => { setSelectedSubject(subject); setSubjectTab("courses"); }}
                      style={{ height: 110, position: "relative", overflow: "hidden" }}>
                      {img ? (
                        <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ height: "100%", background: `linear-gradient(135deg,${c1},${c2})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <BookOpen style={{ width: 30, height: 30, color: "rgba(255,255,255,.3)" }} />
                        </div>
                      )}
                      {/* Dark overlay + title at bottom */}
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top,rgba(0,0,0,.65) 0%,transparent 55%)" }} />
                      {live && <span style={{ position: "absolute", top: 8, left: 8, fontSize: 9, fontWeight: 800, padding: "3px 7px", borderRadius: 20, background: "#ef4444", color: "#fff", animation: "pulse 1.5s infinite" }}>● LIVE</span>}
                      <div style={{ position: "absolute", bottom: 8, left: 10, right: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#fff", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>
                          {subjectName}
                        </div>
                      </div>
                    </div>

                    {/* Body */}
                    <div style={{ padding: "10px 12px 12px" }}>
                      {subject.title_ar && subject.title_ar !== subject.title && language !== "ar" && (
                        <div style={{ fontSize: 10, color: GOLD, marginBottom: 5, fontFamily: "serif" }} dir="rtl">{subject.title_ar}</div>
                      )}
                      <div style={{ display: "flex", fontSize: 10, color: "#9ca3af", gap: 8, marginBottom: pct > 0 ? 8 : 10 }}>
                        {subCourses.length > 0 && <span>{subCourses.length} {t("courses", "دورات")}</span>}
                        {totalLessons > 0 && <span>· {totalLessons} {t("lessons", "درس")}</span>}
                      </div>
                      {pct > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ height: 4, borderRadius: 2, background: "#f0f4f0", overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: `linear-gradient(90deg,${c1},${GOLD})` }} />
                          </div>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => { setSelectedSubject(subject); setSubjectTab("courses"); }}
                          style={{ flex: 1, padding: "8px 0", borderRadius: 9, background: G, border: "none", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                          <BookOpen style={{ width: 11, height: 11 }} />{t("Open", "فتح")}
                        </button>
                        <button onClick={e => { e.stopPropagation(); setSelectedSubject(subject); setInClass(true); }}
                          style={{ padding: "8px 10px", borderRadius: 9, background: live ? "#ef4444" : GOLD, border: "none", color: live ? "#fff" : G, fontSize: 11, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                          <Video style={{ width: 11, height: 11 }} />{live ? t("Join", "انضم") : t("Class", "فصل")}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              // ════════════════ LIST CARD ════════════════
              return (
                <div key={subject.id} className="sc"
                  style={{ background: "#fff", borderRadius: 18, border: "1px solid #e5e7eb", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,.05)" }}>

                  {/* Hero */}
                  <div onClick={() => { setSelectedSubject(subject); setSubjectTab("courses"); }}
                    style={{
                      background: img ? `linear-gradient(rgba(0,0,0,.38),rgba(0,0,0,.52)),url(${img}) center/cover` : `linear-gradient(135deg,${c1},${c2})`,
                      padding: "18px 18px 16px",
                      cursor: "pointer",
                    }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {!img && (
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <BookOpen style={{ width: 22, height: 22, color: "#fff" }} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 17, fontWeight: 900, color: "#fff" }}>{subjectName}</span>
                          {live && <span style={{ fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 20, background: "#ef4444", color: "#fff", animation: "pulse 1.5s infinite", flexShrink: 0 }}>● LIVE</span>}
                        </div>
                        {subject.title_ar && subject.title_ar !== subject.title && language !== "ar" && (
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,.6)", fontFamily: "serif" }} dir="rtl">{subject.title_ar}</div>
                        )}
                        <div style={{ display: "flex", gap: 12, fontSize: 11, color: "rgba(255,255,255,.55)", marginTop: 5 }}>
                          {subCourses.length > 0 && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><BookOpen style={{ width: 10, height: 10 }} />{subCourses.length} {t("courses", "دورات")}</span>}
                          {totalLessons > 0 && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Play style={{ width: 10, height: 10 }} />{totalLessons} {t("lessons", "درس")}</span>}
                        </div>
                      </div>
                      <ChevronRight style={{ width: 18, height: 18, color: "rgba(255,255,255,.4)", flexShrink: 0 }} />
                    </div>
                    {pct > 0 && (
                      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(255,255,255,.2)", overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: GOLD }} />
                        </div>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,.7)" }}>{pct}%</span>
                      </div>
                    )}
                  </div>

                  {/* Body */}
                  <div style={{ padding: "12px 16px 14px" }}>
                    {subject.description && (
                      <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px", lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any, overflow: "hidden" }}>
                        {subject.description}
                      </p>
                    )}

                    {/* Quick access chips */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, marginBottom: 12 }}>
                      {[
                        { icon: Video,        label: t("Recordings", "تسجيلات"), tab: "recordings" },
                        { icon: Calendar,     label: t("Syllabus", "المنهج"),    tab: "syllabus" },
                        { icon: FileText,     label: t("Materials", "مواد"),     tab: "materials" },
                        { icon: ClipboardList,label: t("Tasks", "واجبات"),       tab: "assignments" },
                        { icon: Megaphone,    label: t("News", "إعلانات"),       tab: "announcements" },
                      ].map((item, i) => (
                        <button key={i} className="chip" onClick={() => { setSelectedSubject(subject); setSubjectTab(item.tab); }}
                          style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 20, border: "1px solid #e5e7eb", background: "#f9fafb", fontSize: 11, fontWeight: 600, color: "#374151", cursor: "pointer" }}>
                          <item.icon style={{ width: 11, height: 11, color: G }} />{item.label}
                        </button>
                      ))}
                    </div>

                    {/* CTA buttons */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => { setSelectedSubject(subject); setSubjectTab("courses"); setShowRejoin(false); }}
                        style={{ flex: 1, padding: "11px 0", borderRadius: 11, background: G, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "'Cairo',sans-serif", boxShadow: "0 2px 8px rgba(15,45,31,.2)" }}>
                        <BookOpen style={{ width: 14, height: 14 }} />
                        {subCourses.length > 0 ? t("View Courses", "عرض الدورات") : t("Open Subject", "فتح المادة")}
                      </button>
                      <button onClick={() => { setSelectedSubject(subject); setInClass(true); setShowRejoin(false); }}
                        style={{ padding: "11px 16px", borderRadius: 11, background: live ? "#ef4444" : GOLD, border: "none", color: live ? "#fff" : G, fontSize: 13, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "'Cairo',sans-serif", flexShrink: 0, boxShadow: live ? "0 2px 8px rgba(239,68,68,.3)" : `0 2px 8px rgba(201,168,76,.3)` }}>
                        <Video style={{ width: 14, height: 14 }} />
                        {live ? t("Join", "انضمام") : isPrivileged ? t("Start", "بدء") : t("Class", "فصل")}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !(subjects || []).length && (
          <div style={{ background: "#fff", borderRadius: 18, padding: "60px 20px", textAlign: "center", border: "1px solid #e5e7eb" }}>
            <GraduationCap style={{ width: 52, height: 52, color: "#d1d5db", margin: "0 auto 14px" }} />
            <div style={{ fontSize: 17, color: G, fontWeight: 700, marginBottom: 6 }}>{t("No subjects yet", "لا توجد مواد بعد")}</div>
            <p style={{ fontSize: 13, color: "#9ca3af" }}>{t("Check back soon!", "تحقق قريبًا!")}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LearningHub;
