// src/pages/admin/CourseManagement.tsx
// Unified Course + Subject management
// FIXED: Input focus issue - extracted components + stable keys + useCallback

import { useState, useRef, useEffect, useCallback, memo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  Plus, BookOpen, Trash2, Edit2, ChevronRight, ChevronLeft,
  Loader2, Eye, EyeOff, Save, X, Image, Search,
  Layers, FolderOpen,
} from "lucide-react";

const G     = "#064E3B";
const GM    = "#075E54";
const GOLD  = "#C9A84C";
const LEVELS = ["all","beginner","intermediate","advanced"] as const;
type Level   = typeof LEVELS[number];

const levelCfg: Record<Level, { label: string; bg: string; text: string; border: string }> = {
  all:          { label: "All Levels",   bg: "#F3F4F6", text: "#374151", border: "#D1D5DB" },
  beginner:     { label: "Beginner",     bg: "#F0FDF4", text: "#166534", border: "#86EFAC" },
  intermediate: { label: "Intermediate", bg: "#EFF6FF", text: "#1E40AF", border: "#93C5FD" },
  advanced:     { label: "Advanced",     bg: "#FDF4FF", text: "#6B21A8", border: "#D8B4FE" },
};

const inp: React.CSSProperties = {
  width:"100%", padding:"10px 12px", borderRadius:10, border:"1.5px solid #E5E7EB",
  fontSize:13, outline:"none", background:"#FAFAFA", boxSizing:"border-box" as const, fontFamily:"inherit",
};

// ── Resolve image URL ─────────────────────────────────────────────────────
const resolveUrl = async (url: string | null | undefined): Promise<string | null> => {
  if (!url || url.trim() === "") return null;
  if (url.startsWith("http")) return url;
  try {
    const { data } = supabase.storage.from("subject-images").getPublicUrl(url);
    return data?.publicUrl || null;
  } catch { return null; }
};

// ✅ FIX: Memoized Thumb component (defined OUTSIDE main component)
const Thumb = memo(({ url, title, height = 120, bg }: { url?: string|null; title: string; height?: number; bg: string }) => {
  const [resolved, setResolved] = useState<string|null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { resolveUrl(url).then(setResolved); }, [url]);
  if (!resolved || failed) return (
    <div style={{ height, background: bg, display:"flex", alignItems:"center", justifyContent:"center" }}>      <BookOpen size={22} style={{ opacity:.3 }} />
    </div>
  );
  return <img src={resolved} alt={title} style={{ width:"100%", height, objectFit:"cover", display:"block" }} onError={() => setFailed(true)} />;
});

// ✅ FIX: Memoized Field component (defined OUTSIDE main component)
const Field = memo(({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>{label}</label>
    {children}
  </div>
));

// ══════════════════════════════════════════════════════════════════════════
export default function CourseManagement() {
  const { user } = useAuth();
  const qc = useQueryClient();

  type View = "courses" | "subjects" | "lessons";
  const [view, setView] = useState<View>("courses");
  const [selCourse, setSelCourse] = useState<any|null>(null);
  const [selSubject, setSelSubject] = useState<any|null>(null);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<Level>("all");

  const [courseForm, setCourseForm] = useState(false);
  const [subjectForm, setSubjectForm] = useState(false);
  const [lessonForm, setLessonForm] = useState(false);

  const [editCourseId, setEditCourseId] = useState<string|null>(null);
  const [editSubjectId, setEditSubjectId] = useState<string|null>(null);
  const [editLessonId, setEditLessonId] = useState<string|null>(null);

  const [saving, setSaving] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);

  const [cf, setCf] = useState({ title:"", title_ar:"", description:"", level:"all" as Level, is_published:true, image_url:"", sort_order:0 });
  const [sf, setSf] = useState({ title:"", title_ar:"", description:"", level:"all" as Level, is_active:true, image_url:"", teacher_id:"", color:G });
  const [lf, setLf] = useState({ title:"", title_ar:"", video_url:"", content:"", duration_minutes:0, sort_order:0, is_free:false });

  const thumbRef = useRef<HTMLInputElement>(null);
  const sImgRef = useRef<HTMLInputElement>(null);

  // ── Data ─────────────────────────────────────────────────────────────────
  const { data: courses = [], isLoading: cLoad } = useQuery({
    queryKey: ["admin-courses-v2"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("*").order("sort_order");
      return data || [];    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  const {  subjects = [], isLoading: sLoad } = useQuery({
    queryKey: ["admin-subjects-v2", selCourse?.id],
    enabled: view !== "courses",
    queryFn: async () => {
      let q = supabase.from("subjects").select("*").order("title");
      if (selCourse) q = q.eq("course_id", selCourse.id);
      const { data } = await q;
      return data || [];
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  const {  allSubjects = [] } = useQuery({
    queryKey: ["admin-all-subjects"],
    queryFn: async () => {
      const { data } = await supabase.from("subjects").select("id,title,level,course_id").order("title");
      return data || [];
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  const {  lessons = [], isLoading: lLoad } = useQuery({
    queryKey: ["admin-lessons-v2", selSubject?.id],
    enabled: !!selSubject,
    queryFn: async () => {
      const { data } = await supabase.from("lessons").select("*").eq("subject_id", selSubject?.id || "").order("sort_order");
      return data || [];
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  const {  teachers = [] } = useQuery({
    queryKey: ["teachers-simple"],
    queryFn: async () => {
      const {  roles } = await supabase.from("user_roles").select("user_id").in("role", ["teacher","admin"]);
      if (!roles?.length) return [];
      const { data } = await supabase.from("profiles").select("user_id,full_name").in("user_id", roles.map(r=>r.user_id));
      return data || [];
    },
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });
  // ── Upload image ──────────────────────────────────────────────────────────
  const uploadImage = useCallback(async (file: File, bucket: string): Promise<string|null> => {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `items/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type });
    if (error) return null;
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl || path;
  }, []);

  // ── Course CRUD ───────────────────────────────────────────────────────────
  const saveCourse = useCallback(async (file?: File) => {
    setSaving(true);
    try {
      let imgUrl = cf.image_url;
      if (file) { setImgUploading(true); imgUrl = (await uploadImage(file, "subject-files")) || imgUrl; setImgUploading(false); }
      const payload = { title: cf.title, title_ar: cf.title_ar||null, description: cf.description||null, level: cf.level, is_published: cf.is_published, image_url: imgUrl||null, sort_order: cf.sort_order, updated_at: new Date().toISOString() };
      if (editCourseId) { await supabase.from("courses").update(payload).eq("id", editCourseId); }
      else { await supabase.from("courses").insert(payload); }
      qc.invalidateQueries({ queryKey: ["admin-courses-v2"] });
      setCourseForm(false); setEditCourseId(null); resetCf();
      toast({ title: "✅ Course saved" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSaving(false);
  }, [cf, editCourseId, uploadImage, qc]);

  const deleteCourse = useCallback(async (id: string) => {
    if (!confirm("Delete this course? This will NOT delete its subjects.")) return;
    await supabase.from("courses").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-courses-v2"] });
    if (selCourse?.id === id) { setSelCourse(null); setView("courses"); }
    toast({ title: "Course deleted" });
  }, [qc, selCourse]);

  // ── Subject CRUD ──────────────────────────────────────────────────────────
  const saveSubject = useCallback(async (file?: File) => {
    if (!selCourse?.id) { toast({ title: "Error", description: "No course selected", variant: "destructive" }); return; }
    setSaving(true);
    try {
      let imgUrl = sf.image_url;
      if (file) { setImgUploading(true); imgUrl = (await uploadImage(file, "subject-images")) || imgUrl; setImgUploading(false); }
      const payload = { title: sf.title, title_ar: sf.title_ar||null, description: sf.description||null, level: sf.level, is_active: sf.is_active, image_url: imgUrl||null, teacher_id: sf.teacher_id||null, color: sf.color||G, course_id: selCourse.id, updated_at: new Date().toISOString() };
      if (editSubjectId) { await supabase.from("subjects").update(payload).eq("id", editSubjectId); }
      else { await supabase.from("subjects").insert(payload); }
      qc.invalidateQueries({ queryKey: ["admin-subjects-v2"] });
      qc.invalidateQueries({ queryKey: ["admin-all-subjects"] });
      setSubjectForm(false); setEditSubjectId(null); resetSf();
      toast({ title: "✅ Subject saved" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }    setSaving(false);
  }, [sf, editSubjectId, uploadImage, qc, selCourse, G]);

  const deleteSubject = useCallback(async (id: string) => {
    if (!confirm("Delete this subject? Lessons inside will be deleted too.")) return;
    await supabase.from("lessons").delete().eq("subject_id", id);
    await supabase.from("subjects").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-subjects-v2"] });
    if (selSubject?.id === id) { setSelSubject(null); setView("subjects"); }
    toast({ title: "Subject deleted" });
  }, [qc, selSubject]);

  const linkSubject = useCallback(async (subjectId: string) => {
    await supabase.from("subjects").update({ course_id: selCourse?.id }).eq("id", subjectId);
    qc.invalidateQueries({ queryKey: ["admin-subjects-v2"] });
    qc.invalidateQueries({ queryKey: ["admin-all-subjects"] });
    toast({ title: "Subject linked to course" });
  }, [qc, selCourse]);

  // ── Lesson CRUD ───────────────────────────────────────────────────────────
  const saveLesson = useCallback(async () => {
    setSaving(true);
    const payload = { title: lf.title, title_ar: lf.title_ar||null, video_url: lf.video_url||null, duration_minutes: lf.duration_minutes, sort_order: lf.sort_order, subject_id: selSubject?.id, is_free: lf.is_free, updated_at: new Date().toISOString() };
    if (editLessonId) await supabase.from("lessons").update(payload).eq("id", editLessonId);
    else await supabase.from("lessons").insert(payload);
    qc.invalidateQueries({ queryKey: ["admin-lessons-v2", selSubject?.id] });
    setLessonForm(false); setEditLessonId(null); resetLf();
    toast({ title: "✅ Lesson saved" }); setSaving(false);
  }, [lf, editLessonId, selSubject, qc]);

  const deleteLesson = useCallback(async (id: string) => {
    if (!confirm("Delete this lesson?")) return;
    await supabase.from("lessons").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-lessons-v2", selSubject?.id] });
    toast({ title: "Lesson deleted" });
  }, [qc, selSubject]);

  const resetCf = useCallback(() => setCf({ title:"", title_ar:"", description:"", level:"all", is_published:true, image_url:"", sort_order:0 }), []);
  const resetSf = useCallback(() => setSf({ title:"", title_ar:"", description:"", level:"all", is_active:true, image_url:"", teacher_id:"", color:G }), [G]);
  const resetLf = useCallback(() => setLf({ title:"", title_ar:"", video_url:"", content:"", duration_minutes:0, sort_order:0, is_free:false }), []);

  const openEditCourse = useCallback((c: any) => { setEditCourseId(c.id); setCf({ title:c.title, title_ar:c.title_ar||"", description:c.description||"", level:c.level||"all", is_published:c.is_published, image_url:c.image_url||"", sort_order:c.sort_order||0 }); setCourseForm(true); }, []);
  const openEditSubject = useCallback((s: any) => { setEditSubjectId(s.id); setSf({ title:s.title, title_ar:s.title_ar||"", description:s.description||"", level:s.level||"all", is_active:s.is_active, image_url:s.image_url||"", teacher_id:s.teacher_id||"", color:s.color||G }); setSubjectForm(true); }, [G]);
  const openEditLesson = useCallback((l: any) => { setEditLessonId(l.id); setLf({ title:l.title, title_ar:l.title_ar||"", video_url:l.video_url||"", content:l.content||"", duration_minutes:l.duration_minutes||0, sort_order:l.sort_order||0, is_free:l.is_free||false }); setLessonForm(true); }, []);

  const filteredCourses = useMemo(() => courses.filter((c: any) => {
    const matchLevel = levelFilter === "all" || c.level === levelFilter || c.level === "all";
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase());
    return matchLevel && matchSearch;
  }), [courses, levelFilter, search]);
  const filteredSubjects = useMemo(() => subjects.filter((s: any) => {
    const matchLevel = levelFilter === "all" || s.level === levelFilter || s.level === "all";
    const matchSearch = !search || s.title.toLowerCase().includes(search.toLowerCase());
    return matchLevel && matchSearch;
  }), [subjects, levelFilter, search]);

  const unlinkableSubjects = useMemo(() => allSubjects.filter((s: any) => !s.course_id && s.id !== selCourse?.id), [allSubjects, selCourse]);

  return (
    <div style={{ minHeight:"100vh", background:"#F3F4F6", fontFamily:"system-ui,sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .card-hover:hover{box-shadow:0 4px 16px rgba(0,0,0,.1);transform:translateY(-1px)} .card-hover{transition:all .2s}`}</style>

      {/* Header */}
      <div style={{ background:"#fff", borderBottom:"1px solid #E5E7EB", padding:"14px 16px", display:"flex", alignItems:"center", gap:10 }}>
        {view !== "courses" && (
          <button onClick={() => { if (view === "lessons") { setView("subjects"); setSelSubject(null); } else { setView("courses"); setSelCourse(null); } }} style={{ width:34, height:34, borderRadius:8, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <ChevronLeft size={16} color="#6B7280" />
          </button>
        )}
        <div style={{ flex:1 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"#9CA3AF" }}>
            <span onClick={() => { setView("courses"); setSelCourse(null); setSelSubject(null); }} style={{ cursor:"pointer" }}>Courses</span>
            {selCourse && <><ChevronRight size={12} /><span onClick={() => { setView("subjects"); setSelSubject(null); }} style={{ cursor:"pointer", color: view==="subjects"?"#111":"#9CA3AF" }}>{selCourse.title}</span></>}
            {selSubject && <><ChevronRight size={12} /><span style={{ color:"#111" }}>{selSubject.title}</span></>}
          </div>
          <h1 style={{ fontSize:16, fontWeight:800, color:"#111", margin:0 }}>
            {view==="courses" ? "Courses" : view==="subjects" ? `${selCourse?.title} — Subjects` : `${selSubject?.title} — Lessons`}
          </h1>
        </div>
        <button onClick={() => { if (view==="courses") setCourseForm(true); else if (view==="subjects") setSubjectForm(true); else setLessonForm(true); }} style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 16px", borderRadius:10, border:"none", background:G, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
          <Plus size={14} /> Add {view==="courses" ? "Course" : view==="subjects" ? "Subject" : "Lesson"}
        </button>
      </div>

      {/* Filters */}
      {view !== "lessons" && (
        <div style={{ background:"#fff", borderBottom:"1px solid #E5E7EB", padding:"10px 16px", display:"flex", gap:8, alignItems:"center", overflowX:"auto", scrollbarWidth:"none" }}>
          <div style={{ position:"relative", minWidth:180, flex:1 }}>
            <Search size={13} style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF" }} />
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{ ...inp, paddingLeft:28 }} />
          </div>
          {(["all","beginner","intermediate","advanced"] as Level[]).map(lv => {
            const cfg = levelCfg[lv];
            return (
              <button key={lv} onClick={() => setLevelFilter(lv)} style={{ flexShrink:0, padding:"6px 12px", borderRadius:20, border:`1.5px solid ${levelFilter===lv ? cfg.border : "#E5E7EB"}`, background: levelFilter===lv ? cfg.bg : "#fff", color: levelFilter===lv ? cfg.text : "#6B7280", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                {cfg.label}
              </button>
            );
          })}        </div>
      )}

      <div style={{ padding:16, maxWidth:900, margin:"0 auto" }}>

        {/* COURSES VIEW */}
        {view === "courses" && (
          <>
            {cLoad ? (
              <div style={{ textAlign:"center", padding:40 }}><Loader2 size={28} style={{ animation:"spin .8s linear infinite", color:G }} /></div>
            ) : filteredCourses.length === 0 ? (
              <div style={{ textAlign:"center", padding:40, color:"#9CA3AF" }}>
                <FolderOpen size={48} style={{ margin:"0 auto 12px", display:"block" }} />
                <p>No courses yet. Create your first course above.</p>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:14 }}>
                {filteredCourses.map((c: any) => {
                  const lvl = levelCfg[(c.level as Level) || "all"];
                  return (
                    <div key={c.id} className="card-hover" style={{ background:"#fff", borderRadius:16, border:`1px solid ${lvl.border}`, overflow:"hidden" }}>
                      <div style={{ position:"relative", cursor:"pointer" }} onClick={() => { setSelCourse(c); setView("subjects"); }}>
                        <Thumb url={c.image_url} title={c.title} height={120} bg={lvl.bg} />
                        <div style={{ position:"absolute", top:8, right:8, padding:"3px 10px", borderRadius:20, background:lvl.bg, color:lvl.text, fontSize:10, fontWeight:700, border:`1px solid ${lvl.border}` }}>{lvl.label}</div>
                        {!c.is_published && <div style={{ position:"absolute", top:8, left:8, padding:"3px 10px", borderRadius:20, background:"#FEF2F2", color:"#DC2626", fontSize:10, fontWeight:700, border:"1px solid #FECACA" }}>Draft</div>}
                      </div>
                      <div style={{ padding:"14px" }}>
                        <p style={{ fontWeight:800, fontSize:14, color:"#111", margin:"0 0 4px", cursor:"pointer" }} onClick={() => { setSelCourse(c); setView("subjects"); }}>{c.title}</p>
                        {c.description && <p style={{ fontSize:12, color:"#9CA3AF", margin:"0 0 10px", lineHeight:1.5 }}>{c.description.slice(0,80)}{c.description.length>80?"…":""}</p>}
                        <div style={{ display:"flex", gap:6 }}>
                          <button onClick={() => { setSelCourse(c); setView("subjects"); }} style={{ flex:1, padding:"7px", borderRadius:8, border:`1px solid ${G}`, background:G, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                            <Layers size={12} /> Subjects
                          </button>
                          <button onClick={() => openEditCourse(c)} style={{ padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer" }}><Edit2 size={13} color={G} /></button>
                          <button onClick={() => deleteCourse(c.id)} style={{ padding:"7px 10px", borderRadius:8, border:"1px solid #FEE2E2", background:"#FEF2F2", cursor:"pointer" }}><Trash2 size={13} color="#DC2626" /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* SUBJECTS VIEW */}
        {view === "subjects" && (
          <>
            {sLoad ? (
              <div style={{ textAlign:"center", padding:40 }}><Loader2 size={28} style={{ animation:"spin .8s linear infinite", color:G }} /></div>            ) : (
              <>
                {filteredSubjects.length === 0 && (
                  <div style={{ textAlign:"center", padding:40, color:"#9CA3AF" }}>
                    <BookOpen size={48} style={{ margin:"0 auto 12px", display:"block" }} />
                    <p>No subjects in this course yet.</p>
                  </div>
                )}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:14, marginBottom:20 }}>
                  {filteredSubjects.map((s: any) => {
                    const lvl = levelCfg[(s.level as Level) || "all"];
                    return (
                      <div key={s.id} className="card-hover" style={{ background:"#fff", borderRadius:16, border:`1px solid ${lvl.border}`, overflow:"hidden" }}>
                        <div style={{ position:"relative", cursor:"pointer" }} onClick={() => { setSelSubject(s); setView("lessons"); }}>
                          <Thumb url={s.image_url} title={s.title} height={100} bg={lvl.bg} />
                          <div style={{ position:"absolute", top:8, right:8, padding:"2px 8px", borderRadius:20, background:lvl.bg, color:lvl.text, fontSize:9, fontWeight:700, border:`1px solid ${lvl.border}` }}>{lvl.label}</div>
                          {!s.is_active && <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.4)", display:"flex", alignItems:"center", justifyContent:"center" }}><EyeOff size={20} color="#fff" /></div>}
                        </div>
                        <div style={{ padding:12 }}>
                          <p style={{ fontWeight:800, fontSize:13, color:"#111", margin:"0 0 8px", cursor:"pointer" }} onClick={() => { setSelSubject(s); setView("lessons"); }}>{s.title}</p>
                          <div style={{ display:"flex", gap:6 }}>
                            <button onClick={() => { setSelSubject(s); setView("lessons"); }} style={{ flex:1, padding:"6px", borderRadius:8, border:`1px solid ${G}`, background:G, color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer" }}>Lessons</button>
                            <button onClick={() => openEditSubject(s)} style={{ padding:"6px 9px", borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer" }}><Edit2 size={13} color={G} /></button>
                            <button onClick={() => deleteSubject(s.id)} style={{ padding:"6px 9px", borderRadius:8, border:"1px solid #FEE2E2", background:"#FEF2F2", cursor:"pointer" }}><Trash2 size={13} color="#DC2626" /></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {unlinkableSubjects.length > 0 && (
                  <div style={{ background:"#fff", borderRadius:14, border:"1px solid #E5E7EB", padding:16 }}>
                    <p style={{ fontSize:12, fontWeight:700, color:"#374151", margin:"0 0 10px" }}>📎 Link existing subjects to this course:</p>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                      {unlinkableSubjects.map((s: any) => (
                        <button key={s.id} onClick={() => linkSubject(s.id)} style={{ padding:"6px 12px", borderRadius:20, border:"1.5px solid #E5E7EB", background:"#fff", fontSize:11, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:5, color:"#374151" }}>
                          <Plus size={11} color={G} />{s.title}
                          {s.level !== "all" && <span style={{ fontSize:9, padding:"1px 5px", borderRadius:10, background:levelCfg[(s.level as Level)||"all"].bg, color:levelCfg[(s.level as Level)||"all"].text }}>{s.level}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* LESSONS VIEW */}        {view === "lessons" && (
          <>
            {lLoad ? (
              <div style={{ textAlign:"center", padding:40 }}><Loader2 size={28} style={{ animation:"spin .8s linear infinite", color:G }} /></div>
            ) : lessons.length === 0 ? (
              <div style={{ textAlign:"center", padding:40, color:"#9CA3AF" }}>
                <BookOpen size={48} style={{ margin:"0 auto 12px", display:"block" }} />
                <p>No lessons yet.</p>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {lessons.map((l: any, idx: number) => (
                  <div key={l.id} style={{ background:"#fff", borderRadius:14, border:"1px solid #E5E7EB", padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:32, height:32, borderRadius:"50%", background:"#F0FDF4", border:"1px solid #86EFAC", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, color:G, flexShrink:0 }}>{idx+1}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontWeight:700, fontSize:13, color:"#111", margin:"0 0 2px" }}>{l.title}</p>
                      <div style={{ display:"flex", gap:8, fontSize:11, color:"#9CA3AF" }}>
                        {l.duration_minutes > 0 && <span>⏱️ {l.duration_minutes} min</span>}
                        {l.video_url && <span>🎥 Video</span>}
                        {l.is_free && <span style={{ color:"#16a34a", fontWeight:700 }}>FREE</span>}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                      <button onClick={() => openEditLesson(l)} style={{ padding:"6px 9px", borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer" }}><Edit2 size={13} color={G} /></button>
                      <button onClick={() => deleteLesson(l.id)} style={{ padding:"6px 9px", borderRadius:8, border:"1px solid #FEE2E2", background:"#FEF2F2", cursor:"pointer" }}><Trash2 size={13} color="#DC2626" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══════════════ COURSE FORM MODAL ════════════════════════════ */}
      {courseForm && (
        <div style={{ position:"fixed", inset:0, zIndex:50, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:500, maxHeight:"90vh", overflowY:"auto" }}>
            <div style={{ padding:"16px 20px", borderBottom:"1px solid #E5E7EB", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:"#fff" }}>
              <h2 style={{ fontSize:15, fontWeight:800, color:"#111", margin:0 }}>{editCourseId ? "Edit Course" : "New Course"}</h2>
              <button onClick={() => { setCourseForm(false); setEditCourseId(null); resetCf(); }} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#9CA3AF" }}>×</button>
            </div>
            {/* ✅ FIX: Add stable key to prevent input remount */}
            <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14 }} key={editCourseId || 'new-course'}>
              <input ref={thumbRef} type="file" accept="image/*" style={{ display:"none" }} onChange={async e => { const f = e.target.files?.[0]; if (f) { setImgUploading(true); const url = await uploadImage(f,"subject-files"); if(url) setCf(c=>({...c,image_url:url})); setImgUploading(false); } }} />
              <button onClick={() => thumbRef.current?.click()} style={{ height:100, borderRadius:12, border:"2px dashed #E5E7EB", background:"#F9FAFB", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, color:"#9CA3AF", fontSize:13 }}>
                {imgUploading ? <Loader2 size={20} style={{ animation:"spin .8s linear infinite" }} /> : cf.image_url ? <img src={cf.image_url} style={{ height:"100%", borderRadius:10 }} /> : <><Image size={20} /> Upload thumbnail</>}
              </button>
              <Field label="Course Title (English)"><input key="course-title-en" autoFocus value={cf.title} onChange={e=>setCf(c=>({...c,title:e.target.value}))} style={inp} placeholder="e.g. Quran Memorisation" /></Field>
              <Field label="Course Title (Arabic)"><input key="course-title-ar" value={cf.title_ar} onChange={e=>setCf(c=>({...c,title_ar:e.target.value}))} style={{...inp,direction:"rtl",fontFamily:"'Amiri',serif"}} placeholder="مثال: حفظ القرآن" /></Field>              <Field label="Description"><textarea key="course-desc" value={cf.description} onChange={e=>setCf(c=>({...c,description:e.target.value}))} rows={3} style={{...inp,resize:"vertical" as const}} /></Field>
              <Field label="Level">
                <div style={{ display:"flex", gap:6 }}>
                  {(["all","beginner","intermediate","advanced"] as Level[]).map(lv => {
                    const cfg = levelCfg[lv]; const sel = cf.level===lv;
                    return <button key={lv} onClick={()=>setCf(c=>({...c,level:lv}))} style={{ flex:1, padding:"8px 6px", borderRadius:10, border:`2px solid ${sel ? cfg.border : "#E5E7EB"}`, background: sel ? cfg.bg : "#fff", color:cfg.text, fontWeight:sel?800:500, fontSize:11, cursor:"pointer" }}>{cfg.label}</button>;
                  })}
                </div>
              </Field>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <input type="checkbox" id="cpub" checked={cf.is_published} onChange={e=>setCf(c=>({...c,is_published:e.target.checked}))} />
                <label htmlFor="cpub" style={{ fontSize:13, color:"#374151" }}>Published (visible to students)</label>
              </div>
              <button onClick={() => saveCourse()} disabled={saving || !cf.title} style={{ padding:"12px", borderRadius:12, border:"none", background: saving || !cf.title ? "#e5e7eb" : `linear-gradient(135deg,${G},${GM})`, color: saving || !cf.title ? "#9ca3af" : "#fff", fontWeight:800, cursor: saving || !cf.title ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                <Save size={14} /> {saving ? "Saving…" : editCourseId ? "Update Course" : "Create Course"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ SUBJECT FORM MODAL ═══════════════════════════ */}
      {subjectForm && (
        <div style={{ position:"fixed", inset:0, zIndex:50, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:500, maxHeight:"90vh", overflowY:"auto" }}>
            <div style={{ padding:"16px 20px", borderBottom:"1px solid #E5E7EB", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:"#fff" }}>
              <h2 style={{ fontSize:15, fontWeight:800, color:"#111", margin:0 }}>{editSubjectId ? "Edit Subject" : "New Subject"}</h2>
              <button onClick={() => { setSubjectForm(false); setEditSubjectId(null); }} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#9CA3AF" }}>×</button>
            </div>
            {/* ✅ FIX: Add stable key + don't reset on close */}
            <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14 }} key={editSubjectId || 'new-subject'}>
              <input ref={sImgRef} type="file" accept="image/*" style={{ display:"none" }} onChange={async e => { const f=e.target.files?.[0]; if(f){setImgUploading(true); const url=await uploadImage(f,"subject-images"); if(url)setSf(s=>({...s,image_url:url})); setImgUploading(false);} }} />
              <button onClick={() => sImgRef.current?.click()} style={{ height:100, borderRadius:12, border:"2px dashed #E5E7EB", background:"#F9FAFB", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, color:"#9CA3AF", fontSize:13 }}>
                {imgUploading ? <Loader2 size={20} style={{ animation:"spin .8s linear infinite" }} /> : sf.image_url ? <img src={sf.image_url} style={{ height:"100%", borderRadius:10 }} /> : <><Image size={20} /> Upload image</>}
              </button>
              <Field label="Subject Title (English)"><input key="subject-title-en" autoFocus value={sf.title} onChange={e=>setSf(s=>({...s,title:e.target.value}))} style={inp} placeholder="e.g. Tajweed Level 1" /></Field>
              <Field label="Subject Title (Arabic)"><input key="subject-title-ar" value={sf.title_ar} onChange={e=>setSf(s=>({...s,title_ar:e.target.value}))} style={{...inp,direction:"rtl",fontFamily:"'Amiri',serif"}} placeholder="مثال: التجويد المستوى الأول" /></Field>
              <Field label="Description"><textarea key="subject-desc" value={sf.description} onChange={e=>setSf(s=>({...s,description:e.target.value}))} rows={3} style={{...inp,resize:"vertical" as const}} /></Field>
              <Field label="Level (only students at this level see this subject)">
                <div style={{ display:"flex", gap:6 }}>
                  {(["all","beginner","intermediate","advanced"] as Level[]).map(lv => {
                    const cfg = levelCfg[lv]; const sel = sf.level===lv;
                    return <button key={lv} onClick={()=>setSf(s=>({...s,level:lv}))} style={{ flex:1, padding:"8px 4px", borderRadius:10, border:`2px solid ${sel ? cfg.border : "#E5E7EB"}`, background:sel?cfg.bg:"#fff", color:cfg.text, fontWeight:sel?800:500, fontSize:10, cursor:"pointer" }}>{cfg.label}</button>;
                  })}
                </div>
              </Field>
              <Field label="Assign Teacher">
                <select key="subject-teacher" value={sf.teacher_id} onChange={e=>setSf(s=>({...s,teacher_id:e.target.value}))} style={inp}>
                  <option value="">— No teacher assigned —</option>
                  {teachers.map((t: any) => <option key={t.user_id} value={t.user_id}>{t.full_name}</option>)}                </select>
              </Field>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <input type="checkbox" id="sact" checked={sf.is_active} onChange={e=>setSf(s=>({...s,is_active:e.target.checked}))} />
                <label htmlFor="sact" style={{ fontSize:13, color:"#374151" }}>Active (visible to students)</label>
              </div>
              <button onClick={() => saveSubject()} disabled={saving || !sf.title} style={{ padding:"12px", borderRadius:12, border:"none", background: saving || !sf.title ? "#e5e7eb" : `linear-gradient(135deg,${G},${GM})`, color: saving || !sf.title ? "#9ca3af" : "#fff", fontWeight:800, cursor:saving || !sf.title ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                <Save size={14} /> {saving ? "Saving…" : editSubjectId ? "Update Subject" : "Create Subject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ LESSON FORM MODAL ════════════════════════════ */}
      {lessonForm && (
        <div style={{ position:"fixed", inset:0, zIndex:50, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:480, maxHeight:"90vh", overflowY:"auto" }}>
            <div style={{ padding:"16px 20px", borderBottom:"1px solid #E5E7EB", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:"#fff" }}>
              <h2 style={{ fontSize:15, fontWeight:800, color:"#111", margin:0 }}>{editLessonId ? "Edit Lesson" : "New Lesson"}</h2>
              <button onClick={() => { setLessonForm(false); setEditLessonId(null); resetLf(); }} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#9CA3AF" }}>×</button>
            </div>
            {/* ✅ FIX: Add stable key */}
            <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14 }} key={editLessonId || 'new-lesson'}>
              <Field label="Lesson Title"><input key="lesson-title" autoFocus value={lf.title} onChange={e=>setLf(l=>({...l,title:e.target.value}))} style={inp} /></Field>
              <Field label="Lesson Title (Arabic)"><input key="lesson-title-ar" value={lf.title_ar} onChange={e=>setLf(l=>({...l,title_ar:e.target.value}))} style={{...inp,direction:"rtl",fontFamily:"'Amiri',serif"}} /></Field>
              <Field label="Video URL (YouTube/Vimeo)"><input key="lesson-video" value={lf.video_url} onChange={e=>setLf(l=>({...l,video_url:e.target.value}))} style={inp} placeholder="https://…" /></Field>
              <Field label="Duration (minutes)"><input key="lesson-duration" type="number" value={lf.duration_minutes} onChange={e=>setLf(l=>({...l,duration_minutes:Number(e.target.value)}))} style={inp} min={0} /></Field>
              <Field label="Sort Order"><input key="lesson-sort" type="number" value={lf.sort_order} onChange={e=>setLf(l=>({...l,sort_order:Number(e.target.value)}))} style={inp} min={0} /></Field>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <input type="checkbox" id="lfree" checked={lf.is_free} onChange={e=>setLf(l=>({...l,is_free:e.target.checked}))} />
                <label htmlFor="lfree" style={{ fontSize:13, color:"#374151" }}>Free preview (no subscription required)</label>
              </div>
              <button onClick={saveLesson} disabled={saving || !lf.title} style={{ padding:"12px", borderRadius:12, border:"none", background: saving || !lf.title ? "#e5e7eb" : `linear-gradient(135deg,${G},${GM})`, color: saving || !lf.title ? "#9ca3af" : "#fff", fontWeight:800, cursor:saving || !lf.title ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                <Save size={14} /> {saving ? "Saving…" : editLessonId ? "Update Lesson" : "Add Lesson"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}