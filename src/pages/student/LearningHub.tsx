/*
  src/pages/student/LearningHub.tsx
  ──────────────────────────────────────────────────────────────
  Unified page combining: My Courses + Live Classes + CourseView
  Route: /student/courses  AND  /student/live-classes  → both point here

  Update your router:
    <Route path="/student/courses"       element={<LearningHub />} />
    <Route path="/student/courses/:courseId" element={<LearningHub />} />
    <Route path="/student/live-classes"  element={<LearningHub defaultTab="live" />} />
*/

import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  BookOpen, Play, Lock, ArrowLeft, CheckCircle, Circle, Clock,
  Video, FileText, ClipboardList, Megaphone, Calendar, ArrowRight,
  ChevronRight
} from "lucide-react";
import ClassroomView    from "@/components/classroom/ClassroomView";
import SubjectRecordings   from "@/components/classroom/SubjectRecordings";
import SubjectMaterials    from "@/components/classroom/SubjectMaterials";
import SubjectSyllabus     from "@/components/classroom/SubjectSyllabus";
import SubjectAssignments  from "@/components/classroom/SubjectAssignments";
import SubjectAnnouncements from "@/components/classroom/SubjectAnnouncements";

// ─── Theme ────────────────────────────────────────────────────
const G       = "#0f2d1f";   // dark green
const GM      = "#1a4731";   // mid green
const GOLD    = "#c9a84c";
const CREAM   = "#faf6ee";
const BORDER  = "rgba(15,45,31,0.1)";
const SHADOW  = "0 2px 12px rgba(0,0,0,.07)";

const SUBJECT_COLORS: Record<string, [string, string]> = {
  "Arabic Language":   ["#1a4731","#276749"],
  "Quran":             ["#1a3a5c","#2b5c8a"],
  "Islamic Studies":   ["#4a2a0a","#7c4a1e"],
  "Fiqh & Aqeedah":    ["#2a0a4a","#5c1e7c"],
};

const levelColor = (l: string) => ({
  beginner:     { bg:"#f0fff4", color:"#276749", border:"#9ae6b4" },
  intermediate: { bg:"#fffbeb", color:"#b7791f", border:"#f6d860" },
  advanced:     { bg:"#f5f0ff", color:"#6b46c1", border:"#d6bcfa" },
}[l?.toLowerCase()] || { bg:"#f0fff4", color:"#276749", border:"#9ae6b4" });

// ─── Props ────────────────────────────────────────────────────
interface Props { defaultTab?: "courses" | "live"; }

const LearningHub = ({ defaultTab = "courses" }: Props) => {
  const { courseId }    = useParams();
  const { t, language } = useLanguage();
  const { user, profile, hasRole } = useAuth();
  const navigate        = useNavigate();
  const qc              = useQueryClient();
  const isPrivileged    = hasRole("admin") || hasRole("teacher");

  const [tab, setTab]   = useState<"courses"|"live">(defaultTab);

  // Live classes state
  const [selectedSubject, setSelectedSubject] = useState<any>(null);
  const [subjectTab, setSubjectTab]   = useState("recordings");
  const [inClass, setInClass]         = useState(false);
  const [showRejoin, setShowRejoin]   = useState(false);

  // Course view state
  const [activeLesson, setActiveLesson] = useState<string | null>(null);

  const studentLevel = profile?.level || "beginner";
  const lv = (l: string) => ({ beginner:"Beginner", intermediate:"Intermediate", advanced:"Advanced" }[l] || l);

  // ── Queries ──────────────────────────────────────────────
  const { data: subjects, isLoading: loadSub } = useQuery({
    queryKey: ["subjects-active"],
    queryFn: async () => { const { data } = await supabase.from("subjects").select("*").eq("is_active",true).order("created_at"); return data || []; },
  });

  const { data: courses, isLoading: loadCourse } = useQuery({
    queryKey: ["all-courses-published"],
    queryFn: async () => { const { data } = await supabase.from("courses").select("*").eq("is_published",true).order("sort_order"); return data || []; },
  });

  const { data: allLessons } = useQuery({
    queryKey: ["all-lessons"],
    queryFn: async () => { const { data } = await supabase.from("lessons").select("id,course_id").order("sort_order"); return data || []; },
  });

  const { data: myProgress } = useQuery({
    queryKey: ["my-progress", user?.id],
    enabled: !!user,
    queryFn: async () => { const { data } = await supabase.from("lesson_progress").select("lesson_id,completed").eq("user_id",user!.id).eq("completed",true); return data || []; },
  });

  const { data: liveSessions } = useQuery({
    queryKey: ["live-sessions"],
    queryFn: async () => { const { data } = await supabase.from("live_sessions").select("*").eq("status","live"); return data || []; },
    refetchInterval: 5000,
  });

  // Course detail queries (when courseId in URL)
  const { data: courseDetail, isLoading: loadCourseDetail } = useQuery({
    queryKey: ["course", courseId],
    enabled: !!courseId,
    queryFn: async () => { const { data } = await supabase.from("courses").select("*, subjects(title,title_ar)").eq("id",courseId!).single(); return data; },
  });

  const { data: courseLessons, isLoading: loadLessons } = useQuery({
    queryKey: ["course-lessons", courseId],
    enabled: !!courseId,
    queryFn: async () => { const { data } = await supabase.from("lessons").select("*").eq("course_id",courseId!).order("sort_order"); return data || []; },
  });

  const { data: lessonProgress } = useQuery({
    queryKey: ["lesson-progress", courseId, user?.id],
    enabled: !!user && !!courseLessons?.length,
    queryFn: async () => {
      const ids = (courseLessons||[]).map((l:any)=>l.id);
      if (!ids.length) return [];
      const { data } = await supabase.from("lesson_progress").select("*").eq("user_id",user!.id).in("lesson_id",ids);
      return data || [];
    },
  });

  // Mark lesson complete
  const markComplete = useMutation({
    mutationFn: async (lessonId: string) => {
      const { error } = await supabase.from("lesson_progress").upsert({ user_id:user!.id, lesson_id:lessonId, completed:true, completed_at:new Date().toISOString() }, { onConflict:"user_id,lesson_id" });
      if (error) throw error;
    },
    onSuccess: (_, lessonId) => {
      qc.invalidateQueries({ queryKey:["lesson-progress",courseId] });
      qc.invalidateQueries({ queryKey:["my-progress"] });
      toast({ title: t("Lesson completed! ✅","تم إكمال الدرس! ✅") });
      if (courseLessons) {
        const idx = courseLessons.findIndex((l:any)=>l.id===lessonId);
        if (idx < courseLessons.length-1) setActiveLesson(courseLessons[idx+1].id);
      }
    },
  });

  // Set first incomplete lesson
  useEffect(() => {
    if (courseLessons && !activeLesson) {
      const completedSet = new Set((lessonProgress||[]).filter((p:any)=>p.completed).map((p:any)=>p.lesson_id));
      const first = courseLessons.find((l:any)=>!completedSet.has(l.id));
      setActiveLesson(first?.id || courseLessons[0]?.id || null);
    }
  }, [courseLessons, activeLesson]);

  // Helpers
  const completedSet    = new Set((myProgress||[]).map((p:any)=>p.lesson_id));
  const getLessonCount  = (cid:string) => (allLessons||[]).filter((l:any)=>l.course_id===cid).length;
  const getDoneCount    = (cid:string) => (allLessons||[]).filter((l:any)=>l.course_id===cid&&completedSet.has(l.id)).length;
  const getPct          = (cid:string) => { const t=getLessonCount(cid); return t>0?Math.round((getDoneCount(cid)/t)*100):0; };
  const isLive          = (sid:string) => liveSessions?.some((s:any)=>s.subject_id===sid);
  const subjectColor    = (title:string) => SUBJECT_COLORS[title] || [G,GM];

  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background:"#fff", border:`1px solid ${BORDER}`, borderRadius:16,
    boxShadow:SHADOW, overflow:"hidden", ...ex,
  });

  // ── COURSE DETAIL VIEW ────────────────────────────────────
  if (courseId && courseDetail) {
    const completedSetCourse = new Set((lessonProgress||[]).filter((p:any)=>p.completed).map((p:any)=>p.lesson_id));
    const totalL  = courseLessons?.length || 0;
    const doneL   = completedSetCourse.size;
    const pct     = totalL>0?Math.round((doneL/totalL)*100):0;
    const active  = courseLessons?.find((l:any)=>l.id===activeLesson);
    const subjectTitle = language==="ar" ? (courseDetail as any).subjects?.title_ar||(courseDetail as any).subjects?.title : (courseDetail as any).subjects?.title;
    const lc = levelColor(courseDetail.level);

    return (
      <div style={{ fontFamily:"'Cairo',sans-serif", background:CREAM, minHeight:"100vh" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Cairo:wght@400;600;700;900&display=swap');`}</style>

        {/* Header */}
        <div style={{ background:`linear-gradient(135deg,${G},${GM})`, padding:"16px 18px 20px" }}>
          <button onClick={()=>navigate("/student/courses")} style={{ display:"flex", alignItems:"center", gap:6, color:"rgba(255,255,255,0.7)", background:"none", border:"none", cursor:"pointer", fontSize:13, marginBottom:12, fontFamily:"'Cairo',sans-serif" }}>
            <ArrowLeft style={{ width:14,height:14 }} />
            {t("Back to Courses","العودة للدورات")}
          </button>
          <div style={{ display:"flex", flexWrap:"wrap" as const, alignItems:"center", gap:8, marginBottom:6 }}>
            <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:700, color:"#fff", margin:0 }}>
              {language==="ar"?courseDetail.title_ar||courseDetail.title:courseDetail.title}
            </h1>
            {courseDetail.level && (
              <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, fontWeight:700, background:lc.bg, color:lc.color, border:`1px solid ${lc.border}` }}>
                {lv(courseDetail.level)}
              </span>
            )}
            {subjectTitle && <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, background:"rgba(255,255,255,0.15)", color:"rgba(255,255,255,0.9)" }}>{subjectTitle}</span>}
          </div>
          {courseDetail.description && (
            <p style={{ fontSize:13, color:"rgba(255,255,255,0.7)", margin:"0 0 14px", lineHeight:1.5 }}>
              {language==="ar"?courseDetail.description_ar||courseDetail.description:courseDetail.description}
            </p>
          )}
          {/* Progress */}
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ flex:1, height:6, borderRadius:3, background:"rgba(255,255,255,0.2)", overflow:"hidden" }}>
              <div style={{ width:`${pct}%`, height:"100%", borderRadius:3, background:GOLD, transition:"width .5s" }} />
            </div>
            <span style={{ fontSize:12, color:"rgba(255,255,255,0.8)", whiteSpace:"nowrap" as const }}>{doneL}/{totalL} {t("completed","مكتمل")}</span>
          </div>
        </div>

        <div style={{ padding:"16px", maxWidth:720, margin:"0 auto" }}>
          {loadLessons ? (
            <div style={{ textAlign:"center", padding:"40px", color:"#7a9e88", fontSize:13 }}>Loading lessons…</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {/* Lesson list */}
              <div style={card()}>
                <div style={{ padding:"14px 16px", borderBottom:`1px solid ${BORDER}` }}>
                  <div style={{ fontFamily:"'Playfair Display',serif", fontSize:15, fontWeight:700, color:G }}>{t("Lessons","الدروس")}</div>
                </div>
                {(!courseLessons||courseLessons.length===0) ? (
                  <div style={{ padding:"32px", textAlign:"center", color:"#7a9e88", fontSize:13 }}>{t("No lessons yet","لا توجد دروس بعد")}</div>
                ) : courseLessons.map((lesson:any, idx:number) => {
                  const isComp = completedSetCourse.has(lesson.id);
                  const isAct  = activeLesson===lesson.id;
                  return (
                    <button key={lesson.id} onClick={()=>setActiveLesson(lesson.id)}
                      style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:isAct?"#f0fff4":"#fff", border:"none", cursor:"pointer", borderBottom:`1px solid ${BORDER}`, textAlign:"left" as const, transition:"background .15s" }}>
                      {isComp
                        ? <CheckCircle style={{ width:20,height:20,color:"#276749",flexShrink:0 }} />
                        : <Circle style={{ width:20,height:20,color:"#cbd5e0",flexShrink:0 }} />}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight: isAct?700:500, color: isComp?"#7a9e88":G, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
                          {idx+1}. {language==="ar"?lesson.title_ar||lesson.title:lesson.title}
                        </div>
                        {lesson.duration_minutes>0 && (
                          <div style={{ fontSize:11, color:"#7a9e88", display:"flex", alignItems:"center", gap:3, marginTop:2 }}>
                            <Clock style={{ width:10,height:10 }} />{lesson.duration_minutes} {t("min","د")}
                          </div>
                        )}
                      </div>
                      {isAct && <ChevronRight style={{ width:14,height:14,color:GM }} />}
                    </button>
                  );
                })}
              </div>

              {/* Active lesson content */}
              {active ? (
                <div style={card()}>
                  {active.video_url ? (
                    <div style={{ aspectRatio:"16/9", background:"#000" }}>
                      <iframe src={active.video_url} style={{ width:"100%",height:"100%",border:"none" }} allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
                    </div>
                  ) : (
                    <div style={{ aspectRatio:"16/9", background:"#f8fafb", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8 }}>
                      <Play style={{ width:44,height:44,color:"#cbd5e0" }} />
                      <p style={{ fontSize:13,color:"#7a9e88" }}>{t("No video for this lesson","لا يوجد فيديو لهذا الدرس")}</p>
                    </div>
                  )}
                  <div style={{ padding:"16px 18px" }}>
                    <h2 style={{ fontFamily:"'Playfair Display',serif", fontSize:17, fontWeight:700, color:G, marginBottom:12 }}>
                      {language==="ar"?active.title_ar||active.title:active.title}
                    </h2>
                    {!completedSetCourse.has(active.id) ? (
                      <button onClick={()=>markComplete.mutate(active.id)} disabled={markComplete.isPending}
                        style={{ display:"flex", alignItems:"center", gap:8, padding:"11px 22px", borderRadius:12, background:G, border:"none", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'Cairo',sans-serif" }}>
                        <CheckCircle style={{ width:16,height:16 }} />
                        {markComplete.isPending?"Saving…":t("Mark as Complete","تحديد كمكتمل")}
                      </button>
                    ) : (
                      <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"8px 16px", borderRadius:20, background:"#f0fff4", color:"#276749", fontSize:13, fontWeight:700, border:"1px solid #9ae6b4" }}>
                        <CheckCircle style={{ width:14,height:14 }} />
                        {t("Completed","مكتمل")}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ ...card({ padding:"40px 20px", textAlign:"center" }) }}>
                  <BookOpen style={{ width:36,height:36,color:"#cbd5e0",margin:"0 auto 10px" }} />
                  <p style={{ fontSize:13,color:"#7a9e88" }}>{t("Select a lesson to begin","اختر درسًا للبدء")}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── If inside a live class ────────────────────────────────
  if (inClass && selectedSubject) {
    return <ClassroomView subject={selectedSubject} onLeave={()=>{ setInClass(false); setShowRejoin(true); }} />;
  }

  // ── SUBJECT DETAIL (live classes tab) ─────────────────────
  if (selectedSubject) {
    const SUBJECT_TABS = [
      { id:"recordings",    icon:Video,         label:t("Recordings","التسجيلات") },
      { id:"syllabus",      icon:Calendar,      label:t("Syllabus","المنهج") },
      { id:"materials",     icon:FileText,      label:t("Materials","المواد") },
      { id:"assignments",   icon:ClipboardList, label:t("Assignments","الواجبات") },
      { id:"announcements", icon:Megaphone,     label:t("Announcements","الإعلانات") },
    ];
    const [c1,c2] = subjectColor(selectedSubject.title);
    return (
      <div style={{ fontFamily:"'Cairo',sans-serif", background:CREAM, minHeight:"100vh" }}>
        {/* Subject header */}
        <div style={{ background:`linear-gradient(135deg,${c1},${c2})`, padding:"16px 18px 20px" }}>
          <button onClick={()=>setSelectedSubject(null)} style={{ display:"flex", alignItems:"center", gap:6, color:"rgba(255,255,255,0.7)", background:"none", border:"none", cursor:"pointer", fontSize:13, marginBottom:12, fontFamily:"'Cairo',sans-serif" }}>
            <ArrowLeft style={{ width:14,height:14 }} />
            {t("Back","رجوع")}
          </button>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
            <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:22, fontWeight:700, color:"#fff", margin:0, flex:1 }}>
              {selectedSubject.title}
            </h1>
            {isLive(selectedSubject.id) && (
              <span style={{ fontSize:10, fontWeight:800, padding:"4px 10px", borderRadius:20, background:"#EF4444", color:"#fff", animation:"pulse 1.5s infinite" }}>● LIVE</span>
            )}
          </div>
          {selectedSubject.title_ar && <p style={{ fontSize:13, color:"rgba(255,255,255,0.7)", margin:"0 0 14px" }} dir="rtl">{selectedSubject.title_ar}</p>}

          {/* Join/Rejoin button */}
          <button onClick={()=>{ setInClass(true); setShowRejoin(false); }}
            style={{ display:"flex", alignItems:"center", gap:8, padding:"11px 22px", borderRadius:12, background:GOLD, border:"none", color:G, fontSize:14, fontWeight:900, cursor:"pointer", fontFamily:"'Cairo',sans-serif" }}>
            <Video style={{ width:16,height:16 }} />
            {showRejoin&&isLive(selectedSubject.id) ? t("Rejoin Class","إعادة الانضمام") : isPrivileged ? t("Start Class","بدء الفصل") : t("Join Class","انضمام للفصل")}
          </button>
        </div>

        {/* Sub-tabs */}
        <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${BORDER}`, background:"#fff", overflowX:"auto", flexShrink:0 }}>
          {SUBJECT_TABS.map(st=>(
            <button key={st.id} onClick={()=>setSubjectTab(st.id)}
              style={{ display:"flex", alignItems:"center", gap:5, padding:"11px 14px", border:"none", background:"none", cursor:"pointer", fontFamily:"'Cairo',sans-serif", fontSize:12, fontWeight:subjectTab===st.id?700:400,
                color:subjectTab===st.id?G:"#7a9e88",
                borderBottom:subjectTab===st.id?`2.5px solid ${G}`:"2.5px solid transparent",
                whiteSpace:"nowrap" as const, flexShrink:0,
              }}>
              <st.icon style={{ width:13,height:13 }} />
              {st.label}
            </button>
          ))}
        </div>

        <div style={{ padding:"16px", maxWidth:720, margin:"0 auto" }}>
          {subjectTab==="recordings"    && <SubjectRecordings    subjectId={selectedSubject.id} />}
          {subjectTab==="syllabus"      && <SubjectSyllabus      subjectId={selectedSubject.id} />}
          {subjectTab==="materials"     && <SubjectMaterials     subjectId={selectedSubject.id} />}
          {subjectTab==="assignments"   && <SubjectAssignments   subjectId={selectedSubject.id} />}
          {subjectTab==="announcements" && <SubjectAnnouncements subjectId={selectedSubject.id} />}
        </div>
      </div>
    );
  }

  // ── MAIN HUB ──────────────────────────────────────────────
  const isLoading = loadSub || loadCourse;

  return (
    <div style={{ fontFamily:"'Cairo',sans-serif", background:CREAM, minHeight:"100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=Cairo:wght@400;600;700;900&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
      `}</style>

      {/* Page header */}
      <div style={{ background:`linear-gradient(135deg,${G},${GM})`, padding:"22px 18px 18px" }}>
        <h1 style={{ fontFamily:"'Playfair Display',serif", fontSize:26, fontWeight:700, color:"#fff", margin:"0 0 4px" }}>
          {t("Learning Hub","مركز التعلم")}
        </h1>
        <p style={{ fontSize:12, color:"rgba(255,255,255,0.6)", margin:"0 0 16px" }}>
          {t("Courses, live classes & subject materials","الدورات، الفصول الحية، ومواد الموضوعات")}
        </p>
        {/* Tabs */}
        <div style={{ display:"flex", gap:8 }}>
          {([["courses","📚",t("My Courses","دوراتي")],["live","🎥",t("Live Classes","الفصول الحية")]] as const).map(([k,icon,label])=>(
            <button key={k} onClick={()=>setTab(k)}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 18px", borderRadius:24, border:"none", cursor:"pointer", fontSize:13, fontWeight:700, fontFamily:"'Cairo',sans-serif", transition:"all .2s",
                background: tab===k ? GOLD : "rgba(255,255,255,0.12)",
                color: tab===k ? G : "rgba(255,255,255,0.85)",
              }}>
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:"16px", maxWidth:720, margin:"0 auto", display:"flex", flexDirection:"column", gap:20 }}>

        {isLoading && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            {[1,2,3,4].map(i=>(
              <div key={i} style={{ height:180, borderRadius:16, background:"#e8f0eb", animation:"pulse 1.5s infinite" }} />
            ))}
          </div>
        )}

        {/* ── MY COURSES TAB ── */}
        {!isLoading && tab==="courses" && (
          <>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#7a9e88" }}>YOUR LEVEL</div>
              <span style={{ fontSize:12, padding:"3px 10px", borderRadius:10, fontWeight:700, ...levelColor(studentLevel) }}>
                {lv(studentLevel)}
              </span>
            </div>

            {(subjects||[]).map((subject:any) => {
              const subCourses = (courses||[]).filter((c:any)=>c.subject_id===subject.id);
              if (!subCourses.length) return null;
              const [c1,c2] = subjectColor(subject.title);
              return (
                <div key={subject.id}>
                  {/* Subject label */}
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                    <div style={{ width:4, height:22, borderRadius:2, background:c1 }} />
                    <span style={{ fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:700, color:G }}>
                      {language==="ar"?subject.title_ar||subject.title:subject.title}
                    </span>
                    <Link to={`/student/subjects/${subject.id}`} style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:4, fontSize:12, color:c1, textDecoration:"none", fontWeight:600 }}>
                      {t("View All","عرض الكل")} <ArrowRight style={{ width:12,height:12 }} />
                    </Link>
                  </div>

                  {/* Course cards */}
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:14 }}>
                    {subCourses.map((course:any) => {
                      const accessible = course.level?.toLowerCase()===studentLevel?.toLowerCase() || !course.level;
                      const total      = getLessonCount(course.id);
                      const done       = getDoneCount(course.id);
                      const pct        = getPct(course.id);
                      const lc         = levelColor(course.level);
                      return (
                        <div key={course.id} style={card({ opacity: accessible?1:.7 })}>
                          {/* Gradient thumbnail */}
                          <div style={{ height:100, background:`linear-gradient(135deg,${c1},${c2})`, display:"flex", alignItems:"center", justifyContent:"center", position:"relative" }}>
                            <BookOpen style={{ width:36,height:36,color:"rgba(255,255,255,0.3)" }} />
                            {!accessible && (
                              <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                                <Lock style={{ width:24,height:24,color:"rgba(255,255,255,0.7)" }} />
                              </div>
                            )}
                            {pct===100 && (
                              <div style={{ position:"absolute", top:8, right:8, width:28,height:28, borderRadius:"50%", background:"#276749", display:"flex", alignItems:"center", justifyContent:"center" }}>
                                <CheckCircle style={{ width:16,height:16,color:"#fff" }} />
                              </div>
                            )}
                          </div>
                          <div style={{ padding:"14px 14px 16px" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                              <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10, fontWeight:700, background:lc.bg, color:lc.color, border:`1px solid ${lc.border}` }}>
                                {lv(course.level||"beginner")}
                              </span>
                              <span style={{ fontSize:11, color:"#7a9e88" }}>{total} {t("lessons","درس")}</span>
                            </div>
                            <h3 style={{ fontFamily:"'Playfair Display',serif", fontSize:14, fontWeight:700, color:G, marginBottom:5, lineHeight:1.4 }}>
                              {language==="ar"?course.title_ar||course.title:course.title}
                            </h3>
                            {course.description && (
                              <p style={{ fontSize:12, color:"#7a9e88", marginBottom:10, lineHeight:1.5, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" as const, overflow:"hidden" }}>
                                {language==="ar"?course.description_ar||course.description:course.description}
                              </p>
                            )}
                            {accessible ? (
                              <>
                                {total>0 && (
                                  <div style={{ marginBottom:10 }}>
                                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#7a9e88", marginBottom:4 }}>
                                      <span>{done}/{total}</span><span>{pct}%</span>
                                    </div>
                                    <div style={{ height:5, borderRadius:3, background:"#f0f4f0", overflow:"hidden" }}>
                                      <div style={{ width:`${pct}%`, height:"100%", borderRadius:3, background:`linear-gradient(90deg,${c1},${GOLD})`, transition:"width .5s" }} />
                                    </div>
                                  </div>
                                )}
                                <Link to={`/student/courses/${course.id}`} style={{ textDecoration:"none" }}>
                                  <button style={{ width:"100%", padding:"10px 0", borderRadius:10, background:G, border:"none", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6, fontFamily:"'Cairo',sans-serif" }}>
                                    <Play style={{ width:14,height:14 }} />
                                    {done>0?t("Continue","متابعة"):t("Start","ابدأ")}
                                  </button>
                                </Link>
                              </>
                            ) : (
                              <button disabled style={{ width:"100%", padding:"10px 0", borderRadius:10, background:"#f0f4f0", border:`1px solid ${BORDER}`, color:"#7a9e88", fontSize:13, fontWeight:700, cursor:"not-allowed", display:"flex", alignItems:"center", justifyContent:"center", gap:6, fontFamily:"'Cairo',sans-serif" }}>
                                <Lock style={{ width:13,height:13 }} />
                                {t("Locked","مقفل")}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {!isLoading && (subjects||[]).every((s:any)=>(courses||[]).filter((c:any)=>c.subject_id===s.id).length===0) && (
              <div style={{ ...card({ padding:"50px 20px", textAlign:"center" }) }}>
                <BookOpen style={{ width:44,height:44,color:"#cbd5e0",margin:"0 auto 12px" }} />
                <div style={{ fontFamily:"'Playfair Display',serif", fontSize:17, color:G, fontWeight:700, marginBottom:4 }}>{t("No courses yet","لا توجد دورات بعد")}</div>
                <p style={{ fontSize:13, color:"#7a9e88" }}>{t("Check back soon!","تحقق قريبًا!")}</p>
              </div>
            )}
          </>
        )}

        {/* ── LIVE CLASSES TAB ── */}
        {!isLoading && tab==="live" && (
          <>
            {/* Live now banner */}
            {(liveSessions||[]).length>0 && (
              <div style={{ background:`linear-gradient(135deg,#7f1d1d,#c0392b)`, borderRadius:14, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:10,height:10,borderRadius:"50%",background:"#fff",animation:"pulse 1s infinite",flexShrink:0 }} />
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:"#fff" }}>Class is live now!</div>
                  <div style={{ fontSize:11, color:"rgba(255,255,255,0.7)" }}>A session is currently in progress — tap to join</div>
                </div>
              </div>
            )}

            {/* Subjects grid */}
            {(subjects||[]).map((s:any) => {
              const [c1,c2] = subjectColor(s.title);
              const live = isLive(s.id);
              return (
                <div key={s.id} onClick={()=>{ setSelectedSubject(s); setSubjectTab("recordings"); setShowRejoin(false); }}
                  style={{ ...card({ cursor:"pointer", overflow:"hidden" }) }}>
                  {/* Colored header */}
                  <div style={{ background:`linear-gradient(135deg,${c1},${c2})`, padding:"18px 16px", display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:44,height:44,borderRadius:12,background:"rgba(255,255,255,0.15)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                      <BookOpen style={{ width:22,height:22,color:"#fff" }} />
                    </div>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16,fontWeight:700,color:"#fff",marginBottom:2 }}>{s.title}</div>
                      {s.title_ar && <div style={{ fontSize:12,color:"rgba(255,255,255,0.65)" }} dir="rtl">{s.title_ar}</div>}
                    </div>
                    {live && (
                      <span style={{ fontSize:10,fontWeight:800,padding:"4px 10px",borderRadius:20,background:"#EF4444",color:"#fff",flexShrink:0 }}>● LIVE</span>
                    )}
                  </div>
                  {/* Body */}
                  <div style={{ padding:"14px 16px" }}>
                    {s.description && (
                      <p style={{ fontSize:12,color:"#7a9e88",marginBottom:12,lineHeight:1.6,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical" as const,overflow:"hidden" }}>
                        {s.description}
                      </p>
                    )}
                    {/* Quick action tabs row */}
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const }}>
                      {[
                        { icon:Video,       label:t("Recordings","تسجيلات"),  tab:"recordings" },
                        { icon:Calendar,    label:t("Syllabus","المنهج"),      tab:"syllabus" },
                        { icon:FileText,    label:t("Materials","مواد"),       tab:"materials" },
                        { icon:ClipboardList,label:t("Tasks","واجبات"),        tab:"assignments" },
                      ].map((item,i) => (
                        <div key={i} onClick={e=>{ e.stopPropagation(); setSelectedSubject(s); setSubjectTab(item.tab); }}
                          style={{ display:"flex",alignItems:"center",gap:4,padding:"5px 10px",borderRadius:20,border:`1px solid ${BORDER}`,background:"#f8fafb",fontSize:11,fontWeight:600,color:G,cursor:"pointer" }}>
                          <item.icon style={{ width:11,height:11 }} />
                          {item.label}
                        </div>
                      ))}
                    </div>
                    <div style={{ display:"flex",alignItems:"center",justifyContent:"flex-end",marginTop:10 }}>
                      <span style={{ fontSize:11,color:GM,fontWeight:600,display:"flex",alignItems:"center",gap:3 }}>
                        {t("View Subject","عرض المادة")} <ChevronRight style={{ width:13,height:13 }} />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {!isLoading && !(subjects||[]).length && (
              <div style={{ ...card({ padding:"50px 20px", textAlign:"center" }) }}>
                <Video style={{ width:44,height:44,color:"#cbd5e0",margin:"0 auto 12px" }} />
                <div style={{ fontFamily:"'Playfair Display',serif",fontSize:17,color:G,fontWeight:700,marginBottom:4 }}>{t("No subjects yet","لا توجد مواد بعد")}</div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
};

export default LearningHub;
