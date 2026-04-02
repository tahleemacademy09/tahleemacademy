import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  Plus, BookOpen, Trash2, Edit, Video, Eye, EyeOff,
  ChevronRight, ChevronLeft, GripVertical, Clock, Layers,
  Save, X, Search, Check, Upload, Image, Link, FileText,
  MoreVertical, Globe, Lock, Loader2
} from "lucide-react";

const LEVELS = ["beginner", "intermediate", "advanced"] as const;
type Level = typeof LEVELS[number];

const levelCfg: Record<Level, { bg: string; text: string; border: string; dot: string }> = {
  beginner:     { bg:"#F0FDF4", text:"#166534", border:"#86EFAC", dot:"#22C55E" },
  intermediate: { bg:"#EFF6FF", text:"#1E40AF", border:"#93C5FD", dot:"#3B82F6" },
  advanced:     { bg:"#FDF4FF", text:"#6B21A8", border:"#D8B4FE", dot:"#A855F7" },
};

const G = "#064E3B";

// Resolve both full URLs and Supabase storage paths to a displayable URL
const resolveImageUrl = (url: string | null | undefined): string | null => {
  if (!url || url.trim() === "") return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const { data: d1 } = supabase.storage.from("subject-files").getPublicUrl(url);
  if (d1?.publicUrl) return d1.publicUrl;
  const { data: d2 } = supabase.storage.from("subject-images").getPublicUrl(url);
  return d2?.publicUrl || null;
};

// Thumbnail component with useState error fallback — never shows broken img tag
const CourseThumb = ({
  url, title, height = 140, lv,
}: { url?: string | null; title: string; height?: number; lv: typeof levelCfg[Level] }) => {
  const [failed, setFailed] = useState(false);
  const resolved = resolveImageUrl(url);
  if (!resolved || failed) {
    return (
      <div style={{ height, background: `linear-gradient(135deg,${lv.border},${lv.bg})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <BookOpen size={height > 80 ? 28 : 18} color={lv.text} style={{ opacity: 0.35 }} />
      </div>
    );
  }
  return (
    <img src={resolved} alt={title}
      style={{ width: "100%", height, objectFit: "cover", display: "block" }}
      onError={() => setFailed(true)} />
  );
};

const CourseManagement = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const qc = useQueryClient();

  // View state
  const [view, setView]         = useState<"list"|"detail">("list");
  const [selectedCourse, setSelectedCourse] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"lessons"|"content">("lessons");
  const [search, setSearch]     = useState("");

  // Dialogs
  const [courseOpen, setCourseOpen]   = useState(false);
  const [lessonOpen, setLessonOpen]   = useState(false);
  const [editCourseId, setEditCourseId] = useState<string|null>(null);
  const [editLessonId, setEditLessonId] = useState<string|null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{type:"course"|"lesson", id:string, name:string}|null>(null);

  // Course form
  const [cf, setCf] = useState({
    title:"", title_ar:"", description:"", description_ar:"",
    level:"beginner" as Level, subject_id:"", is_published:false, sort_order:0,
    image_url:"",
  });

  // Lesson form
  const [lf, setLf] = useState({
    title:"", title_ar:"", video_url:"", content:"",
    duration_minutes:0, sort_order:0, is_free:false,
  });

  // Thumbnail upload
  const [thumbFile, setThumbFile] = useState<File|null>(null);
  const [thumbUploading, setThumbUploading] = useState(false);
  const thumbRef = useRef<HTMLInputElement>(null);

  /* ── Queries ───────────────────────────────────────── */
  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => {
      const { data } = await supabase.from("subjects").select("*").order("title");
      return data || [];
    },
  });

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["admin-courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses")
        .select("*, subjects(title,title_ar)").order("sort_order");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: lessons = [], isLoading: lessonsLoading } = useQuery({
    queryKey: ["admin-lessons", selectedCourse?.id],
    enabled: !!selectedCourse,
    queryFn: async () => {
      const { data } = await supabase.from("lessons")
        .select("*").eq("course_id", selectedCourse.id).order("sort_order");
      return data || [];
    },
  });

  /* ── Mutations ─────────────────────────────────────── */
  const saveCourse = useMutation({
    mutationFn: async () => {
      let thumbUrl = cf.image_url;

      // Upload thumbnail if file selected
      if (thumbFile) {
        setThumbUploading(true);
        const ext  = thumbFile.name.split(".").pop();
        const path = `course-thumbnails/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("subject-files").upload(path, thumbFile);
        if (!upErr) {
          const { data } = supabase.storage.from("subject-files").getPublicUrl(path);
          thumbUrl = data.publicUrl;
        }
        setThumbUploading(false);
      }

      const payload = {
        title: cf.title, title_ar: cf.title_ar || null,
        description: cf.description || null, description_ar: cf.description_ar || null,
        level: cf.level, subject_id: cf.subject_id || null,
        is_published: cf.is_published, sort_order: cf.sort_order,
        image_url: thumbUrl || null,
        created_by: user?.id,
      };

      if (editCourseId) {
        const { error } = await supabase.from("courses").update(payload).eq("id", editCourseId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("courses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-courses"] });
      setCourseOpen(false); setEditCourseId(null); setThumbFile(null);
      resetCf();
      toast({ title: t("Course saved", "تم حفظ الدورة") });
    },
    onError: (e: any) => toast({ title:"Error", description:e.message, variant:"destructive" }),
  });

  const deleteCourse = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-courses"] });
      if (selectedCourse && deleteConfirm?.id === selectedCourse.id) {
        setView("list"); setSelectedCourse(null);
      }
      setDeleteConfirm(null);
      toast({ title: t("Deleted", "تم الحذف") });
    },
  });

  const saveLesson = useMutation({
    mutationFn: async () => {
      const payload = {
        title: lf.title, title_ar: lf.title_ar || null,
        video_url: lf.video_url || null,
        duration_minutes: lf.duration_minutes,
        sort_order: lf.sort_order,
        course_id: selectedCourse.id,
      };
      if (editLessonId) {
        const { error } = await supabase.from("lessons").update(payload).eq("id", editLessonId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("lessons").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-lessons", selectedCourse?.id] });
      setLessonOpen(false); setEditLessonId(null); resetLf();
      toast({ title: t("Lesson saved", "تم حفظ الدرس") });
    },
    onError: (e: any) => toast({ title:"Error", description:e.message, variant:"destructive" }),
  });

  const deleteLesson = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lessons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-lessons", selectedCourse?.id] });
      setDeleteConfirm(null);
      toast({ title: t("Deleted", "تم الحذف") });
    },
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, v }: { id:string; v:boolean }) => {
      const { error } = await supabase.from("courses").update({ is_published: v }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id, v }) => {
      qc.invalidateQueries({ queryKey: ["admin-courses"] });
      if (selectedCourse?.id === id) setSelectedCourse((p: any) => ({ ...p, is_published: v }));
    },
  });

  /* ── Helpers ───────────────────────────────────────── */
  const resetCf = () => setCf({ title:"", title_ar:"", description:"", description_ar:"", level:"beginner", subject_id:"", is_published:false, sort_order:0, image_url:"" });
  const resetLf = () => setLf({ title:"", title_ar:"", video_url:"", content:"", duration_minutes:0, sort_order:0, is_free:false });

  const openEditCourse = (c: any) => {
    setEditCourseId(c.id);
    setCf({ title:c.title, title_ar:c.title_ar||"", description:c.description||"", description_ar:c.description_ar||"", level:c.level||"beginner", subject_id:c.subject_id||"", is_published:c.is_published, sort_order:c.sort_order||0, image_url:c.image_url||"" });
    setCourseOpen(true);
  };

  const openEditLesson = (l: any) => {
    setEditLessonId(l.id);
    setLf({ title:l.title, title_ar:l.title_ar||"", video_url:l.video_url||"", content:l.content||"", duration_minutes:l.duration_minutes||0, sort_order:l.sort_order||0, is_free:l.is_free||false });
    setLessonOpen(true);
  };

  const openCourseDetail = (c: any) => {
    setSelectedCourse(c); setView("detail"); setActiveTab("lessons");
  };

  const filtered = courses.filter((c: any) =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    (c.title_ar||"").includes(search)
  );

  const totalLessons = lessons.length;
  const totalMins    = lessons.reduce((s: number, l: any) => s + (l.duration_minutes||0), 0);

  /* ══════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight:"100vh", background:"#F8F9FA", fontFamily:"'Inter',system-ui,sans-serif" }}>

      {/* ── LIST VIEW ─────────────────────────────── */}
      {view === "list" && (
        <>
          {/* Header */}
          <div style={{ background:"#fff", borderBottom:"1px solid #E5E7EB", padding:"20px 24px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:40, height:40, borderRadius:12, background:"#ECFDF5", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <BookOpen size={20} color={G} />
                </div>
                <div>
                  <h1 style={{ fontSize:20, fontWeight:800, color:"#111", margin:0 }}>Course Management</h1>
                  <p style={{ fontSize:12, color:"#6B7280", margin:0 }}>{courses.length} courses · {courses.filter((c:any)=>c.is_published).length} published</p>
                </div>
              </div>
              <Button onClick={() => { setEditCourseId(null); resetCf(); setCourseOpen(true); }}
                style={{ background:G, borderRadius:12, gap:8, fontWeight:700 }}>
                <Plus size={16} /> New Course
              </Button>
            </div>
          </div>

          <div style={{ padding:24 }}>
            {/* Search */}
            <div style={{ position:"relative", marginBottom:20, maxWidth:400 }}>
              <Search size={14} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF" }} />
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search courses…"
                style={{ width:"100%", padding:"10px 14px 10px 36px", borderRadius:12, border:"1.5px solid #E5E7EB", fontSize:13, color:"#111", outline:"none", background:"#fff", boxSizing:"border-box" as const }} />
            </div>

            {/* Stats bar */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:24 }}>
              {[
                { label:"Total Courses", value:courses.length, icon:"📚", color:"#EFF6FF", border:"#BFDBFE", text:"#1D4ED8" },
                { label:"Published",     value:courses.filter((c:any)=>c.is_published).length, icon:"🌐", color:"#F0FDF4", border:"#86EFAC", text:"#166534" },
                { label:"Draft",         value:courses.filter((c:any)=>!c.is_published).length, icon:"✏️", color:"#FFF7ED", border:"#FED7AA", text:"#C2410C" },
              ].map((s,i) => (
                <div key={i} style={{ background:s.color, border:`1px solid ${s.border}`, borderRadius:14, padding:"14px 16px" }}>
                  <div style={{ fontSize:22, marginBottom:4 }}>{s.icon}</div>
                  <div style={{ fontSize:22, fontWeight:900, color:s.text }}>{s.value}</div>
                  <div style={{ fontSize:11, color:s.text, opacity:.7, fontWeight:600 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Course cards */}
            {isLoading ? (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:14 }}>
                {[1,2,3].map(i=><div key={i} style={{ height:180, background:"#E5E7EB", borderRadius:16, animation:"pulse 1.5s infinite" }}/>)}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign:"center", padding:"64px 24px" }}>
                <div style={{ fontSize:48, marginBottom:12 }}>📚</div>
                <p style={{ fontWeight:700, color:"#374151", marginBottom:6 }}>No courses yet</p>
                <p style={{ fontSize:13, color:"#9CA3AF" }}>Create your first course to get started</p>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:14 }}>
                {filtered.map((course: any) => {
                  const lv = levelCfg[course.level as Level] || levelCfg.beginner;
                  const subj = (course as any).subjects;
                  return (
                    <div key={course.id}
                      onClick={() => openCourseDetail(course)}
                      style={{ background:"#fff", borderRadius:16, border:"1.5px solid #E5E7EB", overflow:"hidden", cursor:"pointer", transition:"all .15s", boxShadow:"0 1px 4px rgba(0,0,0,.04)" }}
                      onMouseEnter={e=>(e.currentTarget as any).style.boxShadow="0 8px 24px rgba(0,0,0,.1)"}
                      onMouseLeave={e=>(e.currentTarget as any).style.boxShadow="0 1px 4px rgba(0,0,0,.04)"}>

                      {/* Thumbnail */}
                      <CourseThumb url={course.image_url} title={course.title} lv={lv} />

                      <div style={{ padding:"14px 16px" }}>
                        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8, marginBottom:8 }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            <p style={{ fontWeight:800, fontSize:14, color:"#111", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{course.title}</p>
                            {course.title_ar && <p style={{ fontSize:12, color:"#9CA3AF", margin:"2px 0 0", fontFamily:"'Amiri',serif", direction:"rtl" }}>{course.title_ar}</p>}
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:20, background:course.is_published?"#DCFCE7":"#F3F4F6", color:course.is_published?"#166534":"#6B7280", flexShrink:0 }}>
                            {course.is_published ? <Globe size={10}/> : <Lock size={10}/>}
                            {course.is_published?"Published":"Draft"}
                          </div>
                        </div>

                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:12 }}>
                          <span style={{ fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:20, background:lv.bg, color:lv.text, border:`1px solid ${lv.border}` }}>
                            {course.level}
                          </span>
                          {subj && <span style={{ fontSize:11, color:"#9CA3AF" }}>{subj.title}</span>}
                        </div>

                        {/* Action row */}
                        <div style={{ display:"flex", gap:6 }} onClick={e=>e.stopPropagation()}>
                          <button onClick={()=>openEditCourse(course)} style={{ flex:1, padding:"7px", borderRadius:9, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:5, fontSize:12, fontWeight:600, color:"#374151" }}>
                            <Edit size={13}/> Edit
                          </button>
                          <button onClick={()=>togglePublish.mutate({id:course.id,v:!course.is_published})} style={{ padding:"7px 10px", borderRadius:9, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                            {course.is_published ? <EyeOff size={13} color="#9CA3AF"/> : <Eye size={13} color="#16A34A"/>}
                          </button>
                          <button onClick={()=>setDeleteConfirm({type:"course",id:course.id,name:course.title})} style={{ padding:"7px 10px", borderRadius:9, border:"1.5px solid #FECACA", background:"#FEF2F2", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                            <Trash2 size={13} color="#DC2626"/>
                          </button>
                          <button onClick={()=>openCourseDetail(course)} style={{ padding:"7px 10px", borderRadius:9, border:`1.5px solid ${G}`, background:G, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                            <ChevronRight size={13} color="#fff"/>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── DETAIL VIEW ───────────────────────────── */}
      {view === "detail" && selectedCourse && (
        <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh" }}>
          {/* Detail header */}
          <div style={{ background:G, padding:"14px 20px", display:"flex", alignItems:"center", gap:12 }}>
            <button onClick={()=>setView("list")} style={{ background:"rgba(255,255,255,.15)", border:"none", borderRadius:8, padding:"8px 10px", color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:6, fontSize:12, fontWeight:600 }}>
              <ChevronLeft size={16}/> All Courses
            </button>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ fontWeight:800, fontSize:15, color:"#fff", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{selectedCourse.title}</p>
              <p style={{ fontSize:11, color:"rgba(255,255,255,.65)", margin:0 }}>{totalLessons} lessons · {totalMins} min total</p>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>togglePublish.mutate({id:selectedCourse.id,v:!selectedCourse.is_published})}
                style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px", borderRadius:9, border:"1px solid rgba(255,255,255,.3)", background:"rgba(255,255,255,.12)", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:600 }}>
                {selectedCourse.is_published ? <><EyeOff size={12}/> Unpublish</> : <><Globe size={12}/> Publish</>}
              </button>
              <button onClick={()=>openEditCourse(selectedCourse)}
                style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px", borderRadius:9, border:"1px solid rgba(255,255,255,.3)", background:"rgba(255,255,255,.12)", color:"#fff", cursor:"pointer", fontSize:12, fontWeight:600 }}>
                <Edit size={12}/> Edit
              </button>
            </div>
          </div>

          {/* Course info strip */}
          <div style={{ background:"#fff", borderBottom:"1px solid #E5E7EB", padding:"16px 20px" }}>
            <div style={{ display:"flex", flexWrap:"wrap", gap:16, alignItems:"center" }}>
              {selectedCourse.image_url && (
                <div style={{ width:64, height:64, borderRadius:10, overflow:"hidden", flexShrink:0 }}>
                  <CourseThumb url={selectedCourse.image_url} title={selectedCourse.title} height={64} lv={levelCfg[selectedCourse.level as Level] || levelCfg.beginner} />
                </div>
              )}
              <div style={{ flex:1, minWidth:200 }}>
                {selectedCourse.description && <p style={{ fontSize:13, color:"#6B7280", margin:0, lineHeight:1.6 }}>{selectedCourse.description}</p>}
                <div style={{ display:"flex", gap:8, marginTop:8, flexWrap:"wrap" }}>
                  {[
                    selectedCourse.level,
                    (selectedCourse as any).subjects?.title,
                    selectedCourse.is_published ? "Published" : "Draft",
                  ].filter(Boolean).map((tag: string, i: number) => (
                    <span key={i} style={{ fontSize:11, padding:"2px 9px", borderRadius:20, background:"#F3F4F6", color:"#374151", fontWeight:600 }}>{tag}</span>
                  ))}
                </div>
              </div>
              <div style={{ display:"flex", gap:20 }}>
                {[{ v:totalLessons, l:"Lessons" },{ v:totalMins+"m", l:"Duration" }].map((s,i)=>(
                  <div key={i} style={{ textAlign:"center" }}>
                    <div style={{ fontSize:22, fontWeight:900, color:G }}>{s.v}</div>
                    <div style={{ fontSize:11, color:"#9CA3AF" }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ background:"#fff", borderBottom:"1px solid #E5E7EB", display:"flex" }}>
            {(["lessons","content"] as const).map(tab=>(
              <button key={tab} onClick={()=>setActiveTab(tab)}
                style={{ padding:"14px 20px", border:"none", background:"none", cursor:"pointer", fontSize:13, fontWeight:600, color:activeTab===tab?G:"#6B7280", borderBottom:activeTab===tab?`2px solid ${G}`:"2px solid transparent", transition:"all .15s" }}>
                {tab==="lessons"?`📹 Lessons (${totalLessons})`:"📋 Course Info"}
              </button>
            ))}
          </div>

          <div style={{ padding:20, flex:1 }}>

            {/* LESSONS TAB */}
            {activeTab === "lessons" && (
              <div style={{ maxWidth:720 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                  <p style={{ fontSize:13, color:"#6B7280", margin:0 }}>{totalLessons} lesson{totalLessons!==1?"s":""} in this course</p>
                  <Button size="sm" onClick={()=>{ setEditLessonId(null); setLf({ ...lf, sort_order: totalLessons+1 }); setLessonOpen(true); }}
                    style={{ background:G, borderRadius:10, gap:6, fontWeight:700 }}>
                    <Plus size={14}/> Add Lesson
                  </Button>
                </div>

                {lessonsLoading ? (
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>{[1,2,3].map(i=><div key={i} style={{ height:64, background:"#E5E7EB", borderRadius:12, marginBottom:8, animation:"pulse 1.5s infinite" }}/>)}</div>
                ) : lessons.length === 0 ? (
                  <div style={{ textAlign:"center", padding:"48px 24px", background:"#fff", borderRadius:16, border:"2px dashed #E5E7EB" }}>
                    <div style={{ fontSize:40, marginBottom:10 }}>📹</div>
                    <p style={{ fontWeight:700, color:"#374151" }}>No lessons yet</p>
                    <p style={{ fontSize:12, color:"#9CA3AF", marginBottom:16 }}>Add your first lesson to this course</p>
                    <Button size="sm" onClick={()=>{ setEditLessonId(null); resetLf(); setLessonOpen(true); }}
                      style={{ background:G, borderRadius:10, gap:6 }}>
                      <Plus size={14}/> Add First Lesson
                    </Button>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {(lessons as any[]).map((lesson, idx) => (
                      <div key={lesson.id} style={{ background:"#fff", borderRadius:14, border:"1.5px solid #E5E7EB", padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
                        <div style={{ width:32, height:32, borderRadius:8, background:"#ECFDF5", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          <span style={{ fontSize:12, fontWeight:800, color:G }}>{idx+1}</span>
                        </div>
                        <div style={{ width:36, height:36, borderRadius:9, background:"#F3F4F6", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          <Video size={16} color="#6B7280"/>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ fontWeight:700, fontSize:13, color:"#111", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{lesson.title}</p>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:2 }}>
                            {lesson.duration_minutes>0 && (
                              <span style={{ fontSize:11, color:"#9CA3AF", display:"flex", alignItems:"center", gap:3 }}>
                                <Clock size={10}/> {lesson.duration_minutes}m
                              </span>
                            )}
                            {lesson.video_url && <span style={{ fontSize:11, color:"#16A34A", fontWeight:600 }}>✓ Video</span>}
                          </div>
                        </div>
                        <div style={{ display:"flex", gap:6 }}>
                          <button onClick={()=>openEditLesson(lesson)} style={{ width:32, height:32, borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                            <Edit size={13} color="#6B7280"/>
                          </button>
                          <button onClick={()=>setDeleteConfirm({type:"lesson",id:lesson.id,name:lesson.title})} style={{ width:32, height:32, borderRadius:8, border:"1px solid #FECACA", background:"#FEF2F2", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                            <Trash2 size={13} color="#DC2626"/>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* COURSE INFO TAB */}
            {activeTab === "content" && (
              <div style={{ maxWidth:640, background:"#fff", borderRadius:16, border:"1px solid #E5E7EB", padding:24 }}>
                <div style={{ display:"grid", gap:16 }}>
                  {[
                    { l:"Title (EN)", v:selectedCourse.title },
                    { l:"Title (AR)", v:selectedCourse.title_ar },
                    { l:"Description", v:selectedCourse.description },
                    { l:"Description (AR)", v:selectedCourse.description_ar },
                    { l:"Level", v:selectedCourse.level },
                    { l:"Subject", v:(selectedCourse as any).subjects?.title },
                  ].filter(r=>r.v).map((row,i)=>(
                    <div key={i}>
                      <p style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:.5, marginBottom:4 }}>{row.l}</p>
                      <p style={{ fontSize:14, color:"#374151", margin:0, direction: row.l.includes("AR")?"rtl":"ltr", fontFamily: row.l.includes("AR")?"'Amiri',serif":"inherit" }}>{row.v}</p>
                    </div>
                  ))}
                  <div>
                    <p style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:.5, marginBottom:4 }}>Status</p>
                    <span style={{ fontSize:13, fontWeight:700, padding:"4px 12px", borderRadius:20, background:selectedCourse.is_published?"#DCFCE7":"#F3F4F6", color:selectedCourse.is_published?"#166534":"#6B7280" }}>
                      {selectedCourse.is_published?"✓ Published":"Draft"}
                    </span>
                  </div>
                  <Button onClick={()=>openEditCourse(selectedCourse)} style={{ background:G, borderRadius:12, gap:8 }}>
                    <Edit size={14}/> Edit Course Details
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ COURSE DIALOG ════════════════════════════ */}
      <Dialog open={courseOpen} onOpenChange={v=>{ setCourseOpen(v); if(!v){ setEditCourseId(null); setThumbFile(null); resetCf(); } }}>
        <DialogContent style={{ maxWidth:560, maxHeight:"92vh", overflowY:"auto", borderRadius:20, padding:0 }}>
          <div style={{ background:G, padding:"18px 20px", borderRadius:"20px 20px 0 0" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <BookOpen size={20} color="#fff"/>
              <h2 style={{ fontWeight:800, fontSize:16, color:"#fff", margin:0 }}>{editCourseId?"Edit Course":"New Course"}</h2>
            </div>
          </div>
          <div style={{ padding:20, display:"flex", flexDirection:"column", gap:16 }}>

            {/* Thumbnail */}
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:8 }}>Cover Image</label>
              <div
                onClick={()=>thumbRef.current?.click()}
                style={{ borderRadius:14, border:"2px dashed #E5E7EB", background:"#FAFAFA", cursor:"pointer", overflow:"hidden", height:120, display:"flex", alignItems:"center", justifyContent:"center", transition:"border-color .15s" }}
                onMouseEnter={e=>(e.currentTarget as any).style.borderColor=G}
                onMouseLeave={e=>(e.currentTarget as any).style.borderColor="#E5E7EB"}>
                {thumbFile ? (
                  <img src={URL.createObjectURL(thumbFile)} style={{ width:"100%", height:"100%", objectFit:"cover" }} alt=""/>
                ) : cf.image_url ? (
                  <img src={cf.image_url} style={{ width:"100%", height:"100%", objectFit:"cover" }} alt=""/>
                ) : (
                  <div style={{ textAlign:"center", color:"#9CA3AF" }}>
                    <Image size={28} style={{ marginBottom:6 }}/>
                    <p style={{ fontSize:12, margin:0 }}>Click to upload cover image</p>
                  </div>
                )}
              </div>
              <input ref={thumbRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>setThumbFile(e.target.files?.[0]||null)}/>
            </div>

            {/* Title fields */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:6 }}>Title (English) *</label>
                <Input value={cf.title} onChange={e=>setCf({...cf,title:e.target.value})} placeholder="e.g. Quran Memorisation" style={{ borderRadius:10 }}/>
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:6 }}>العنوان (عربي)</label>
                <Input value={cf.title_ar} onChange={e=>setCf({...cf,title_ar:e.target.value})} dir="rtl" placeholder="مثال: حفظ القرآن" style={{ borderRadius:10 }}/>
              </div>
            </div>

            {/* Description */}
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:6 }}>Description (English)</label>
              <Textarea value={cf.description} onChange={e=>setCf({...cf,description:e.target.value})} rows={3} placeholder="What will students learn…" style={{ borderRadius:10 }}/>
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:6 }}>الوصف (عربي)</label>
              <Textarea value={cf.description_ar} onChange={e=>setCf({...cf,description_ar:e.target.value})} dir="rtl" rows={2} style={{ borderRadius:10 }}/>
            </div>

            {/* Level + Subject */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:6 }}>Level</label>
                <Select value={cf.level} onValueChange={v=>setCf({...cf,level:v as Level})}>
                  <SelectTrigger style={{ borderRadius:10 }}><SelectValue/></SelectTrigger>
                  <SelectContent>
                    {LEVELS.map(l=>(
                      <SelectItem key={l} value={l}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ width:8, height:8, borderRadius:"50%", background:levelCfg[l].dot }}/>
                          {l.charAt(0).toUpperCase()+l.slice(1)}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:6 }}>Subject</label>
                <Select value={cf.subject_id} onValueChange={v=>setCf({...cf,subject_id:v})}>
                  <SelectTrigger style={{ borderRadius:10 }}><SelectValue placeholder="Select subject"/></SelectTrigger>
                  <SelectContent>
                    {subjects.map((s:any)=><SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Sort order + Publish */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", background:"#F9FAFB", borderRadius:12, border:"1px solid #E5E7EB" }}>
              <div>
                <p style={{ fontWeight:700, fontSize:13, color:"#374151", margin:0 }}>Publish Course</p>
                <p style={{ fontSize:11, color:"#9CA3AF", margin:0 }}>Visible to enrolled students</p>
              </div>
              <Switch checked={cf.is_published} onCheckedChange={v=>setCf({...cf,is_published:v})}/>
            </div>

            <Button onClick={()=>saveCourse.mutate()} disabled={!cf.title||saveCourse.isPending||thumbUploading}
              style={{ background:G, borderRadius:12, height:44, gap:8, fontWeight:700, fontSize:14 }}>
              {(saveCourse.isPending||thumbUploading) ? <><Loader2 size={16} style={{ animation:"spin .8s linear infinite" }}/> Saving…</> : <><Save size={16}/> {editCourseId?"Save Changes":"Create Course"}</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ LESSON DIALOG ════════════════════════════ */}
      <Dialog open={lessonOpen} onOpenChange={v=>{ setLessonOpen(v); if(!v){ setEditLessonId(null); resetLf(); } }}>
        <DialogContent style={{ maxWidth:500, borderRadius:20, padding:0 }}>
          <div style={{ background:"#1E40AF", padding:"18px 20px", borderRadius:"20px 20px 0 0" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <Video size={20} color="#fff"/>
              <h2 style={{ fontWeight:800, fontSize:16, color:"#fff", margin:0 }}>{editLessonId?"Edit Lesson":"New Lesson"}</h2>
            </div>
          </div>
          <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:6 }}>Title (English) *</label>
                <Input value={lf.title} onChange={e=>setLf({...lf,title:e.target.value})} style={{ borderRadius:10 }} placeholder="Lesson title"/>
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:6 }}>العنوان (عربي)</label>
                <Input value={lf.title_ar} onChange={e=>setLf({...lf,title_ar:e.target.value})} dir="rtl" style={{ borderRadius:10 }}/>
              </div>
            </div>

            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:6 }}>Video URL</label>
              <div style={{ position:"relative" }}>
                <Link size={13} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF" }}/>
                <Input value={lf.video_url} onChange={e=>setLf({...lf,video_url:e.target.value})} style={{ paddingLeft:34, borderRadius:10 }} placeholder="https://youtube.com/embed/..."/>
              </div>
              {lf.video_url && (
                <p style={{ fontSize:11, color:"#16A34A", marginTop:4, display:"flex", alignItems:"center", gap:4 }}>
                  <Check size={11}/> Video URL added
                </p>
              )}
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:6 }}>Duration (min)</label>
                <Input type="number" value={lf.duration_minutes} onChange={e=>setLf({...lf,duration_minutes:parseInt(e.target.value)||0})} style={{ borderRadius:10 }}/>
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:6 }}>Sort Order</label>
                <Input type="number" value={lf.sort_order} onChange={e=>setLf({...lf,sort_order:parseInt(e.target.value)||0})} style={{ borderRadius:10 }}/>
              </div>
            </div>

            <Button onClick={()=>saveLesson.mutate()} disabled={!lf.title||saveLesson.isPending}
              style={{ background:"#1E40AF", borderRadius:12, height:44, gap:8, fontWeight:700 }}>
              {saveLesson.isPending ? <><Loader2 size={16} style={{ animation:"spin .8s linear infinite" }}/> Saving…</> : <><Save size={16}/> {editLessonId?"Save Changes":"Add Lesson"}</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ DELETE CONFIRM ════════════════════════════ */}
      <Dialog open={!!deleteConfirm} onOpenChange={v=>!v&&setDeleteConfirm(null)}>
        <DialogContent style={{ maxWidth:380, borderRadius:20, textAlign:"center", padding:28 }}>
          <div style={{ width:56, height:56, borderRadius:"50%", background:"#FEF2F2", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
            <Trash2 size={24} color="#DC2626"/>
          </div>
          <h3 style={{ fontWeight:800, fontSize:16, color:"#111", marginBottom:8 }}>Delete {deleteConfirm?.type}?</h3>
          <p style={{ fontSize:13, color:"#6B7280", marginBottom:20 }}>
            "<strong>{deleteConfirm?.name}</strong>" will be permanently deleted. This cannot be undone.
          </p>
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={()=>setDeleteConfirm(null)} style={{ flex:1, padding:"11px", borderRadius:12, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer", fontWeight:600, fontSize:13 }}>Cancel</button>
            <button onClick={()=>{ if(!deleteConfirm) return; deleteConfirm.type==="course"?deleteCourse.mutate(deleteConfirm.id):deleteLesson.mutate(deleteConfirm.id); }}
              style={{ flex:1, padding:"11px", borderRadius:12, border:"none", background:"#DC2626", color:"#fff", cursor:"pointer", fontWeight:700, fontSize:13 }}>
              Delete
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
};

export default CourseManagement;
