// src/pages/admin/CourseManagement.tsx
// Fixes: 1) Subject/Course form focus loss on Android (forms extracted as isolated memo components)
//        2) Sorting options for Courses view
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  Plus, BookOpen, Trash2, Edit2, ChevronRight, ChevronLeft,
  Loader2, Eye, EyeOff, Save, X, Image, Search,
  Layers, FolderOpen, ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#C9A84C";
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

type SortKey = "sort_order" | "title_asc" | "title_desc" | "level";

const resolveUrl = async (url: string | null | undefined): Promise<string | null> => {
  if (!url || url.trim() === "") return null;
  if (url.startsWith("http")) return url;
  try {
    const { data } = supabase.storage.from("subject-images").getPublicUrl(url);
    return data?.publicUrl || null;
  } catch { return null; }
};

const Thumb = ({ url, title, height = 120, bg }: { url?: string|null; title: string; height?: number; bg: string }) => {
  const [resolved, setResolved] = useState<string|null>(null);
  const [failed,   setFailed]   = useState(false);
  useEffect(() => { resolveUrl(url).then(setResolved); }, [url]);
  if (!resolved || failed) return (
    <div style={{ height, background: bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <BookOpen size={22} style={{ opacity:.3 }} />
    </div>
  );
  return <img src={resolved} alt={title} style={{ width:"100%", height, objectFit:"cover", display:"block" }} onError={() => setFailed(true)} />;
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label style={{ fontSize:11, fontWeight:700, color:"#374151", display:"block", marginBottom:4 }}>{label}</label>
    {children}
  </div>
);

// ── Upload helper (shared) ─────────────────────────────────────────────────
async function uploadImage(file: File, bucket: string): Promise<string|null> {
  const ext  = file.name.split(".").pop() || "jpg";
  const path = `items/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type });
  if (error) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || path;
}

// ══════════════════════════════════════════════════════════════════════════
// COURSE FORM MODAL — isolated state so parent re-renders don't steal focus
// ══════════════════════════════════════════════════════════════════════════
interface CourseFormProps {
  editData?: any;
  onClose: () => void;
  onSave: (payload: any, file?: File) => Promise<void>;
  saving: boolean;
}

const CourseFormModal = React.memo(({ editData, onClose, onSave, saving }: CourseFormProps) => {
  const [cf, setCf] = useState({
    title:        editData?.title        || "",
    title_ar:     editData?.title_ar     || "",
    description:  editData?.description  || "",
    level:        (editData?.level       || "all") as Level,
    is_published: editData?.is_published ?? true,
    image_url:    editData?.image_url    || "",
    sort_order:   editData?.sort_order   || 0,
  });
  const [imgUploading, setImgUploading] = useState(false);
  const thumbRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImgUploading(true);
    const url = await uploadImage(f, "subject-files");
    if (url) setCf(c => ({ ...c, image_url: url }));
    setImgUploading(false);
  }, []);

  return (
    <div style={{ position:"fixed", inset:0, zIndex:50, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:500, maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ padding:"16px 20px", borderBottom:"1px solid #E5E7EB", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:"#fff" }}>
          <h2 style={{ fontSize:15, fontWeight:800, color:"#111", margin:0 }}>{editData ? "Edit Course" : "New Course"}</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#9CA3AF" }}>×</button>
        </div>
        <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14 }}>
          <input ref={thumbRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleFileChange} />
          <button onClick={() => thumbRef.current?.click()} style={{ height:100, borderRadius:12, border:"2px dashed #E5E7EB", background:"#F9FAFB", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, color:"#9CA3AF", fontSize:13 }}>
            {imgUploading ? <Loader2 size={20} style={{ animation:"spin .8s linear infinite" }} /> : cf.image_url ? <img src={cf.image_url} alt="" style={{ height:"100%", borderRadius:10 }} /> : <><Image size={20} /> Upload thumbnail</>}
          </button>
          <Field label="Course Title (English)">
            <input value={cf.title} onChange={e => setCf(c => ({ ...c, title: e.target.value }))} style={inp} placeholder="e.g. Quran Memorisation" autoFocus />
          </Field>
          <Field label="Course Title (Arabic)">
            <input value={cf.title_ar} onChange={e => setCf(c => ({ ...c, title_ar: e.target.value }))} style={{ ...inp, direction:"rtl", fontFamily:"'Amiri',serif" }} placeholder="مثال: حفظ القرآن" />
          </Field>
          <Field label="Description">
            <textarea value={cf.description} onChange={e => setCf(c => ({ ...c, description: e.target.value }))} rows={3} style={{ ...inp, resize:"vertical" as const }} />
          </Field>
          <Field label="Level">
            <div style={{ display:"flex", gap:6 }}>
              {(["all","beginner","intermediate","advanced"] as Level[]).map(lv => {
                const cfg = levelCfg[lv]; const sel = cf.level === lv;
                return <button key={lv} onClick={() => setCf(c => ({ ...c, level: lv }))} style={{ flex:1, padding:"8px 6px", borderRadius:10, border:`2px solid ${sel ? cfg.border : "#E5E7EB"}`, background: sel ? cfg.bg : "#fff", color:cfg.text, fontWeight:sel?800:500, fontSize:11, cursor:"pointer" }}>{cfg.label}</button>;
              })}
            </div>
          </Field>
          <Field label="Sort Order (lower = first)">
            <input type="number" value={cf.sort_order} onChange={e => setCf(c => ({ ...c, sort_order: Number(e.target.value) }))} style={inp} min={0} />
          </Field>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <input type="checkbox" id="cpub" checked={cf.is_published} onChange={e => setCf(c => ({ ...c, is_published: e.target.checked }))} />
            <label htmlFor="cpub" style={{ fontSize:13, color:"#374151" }}>Published (visible to students)</label>
          </div>
          <button
            onClick={() => onSave(cf)}
            disabled={saving || !cf.title}
            style={{ padding:"12px", borderRadius:12, border:"none", background: saving || !cf.title ? "#e5e7eb" : `linear-gradient(135deg,${G},${GM})`, color: saving || !cf.title ? "#9ca3af" : "#fff", fontWeight:800, cursor: saving || !cf.title ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            <Save size={14} /> {saving ? "Saving…" : editData ? "Update Course" : "Create Course"}
          </button>
        </div>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════
// SUBJECT FORM MODAL — isolated state
// ══════════════════════════════════════════════════════════════════════════
interface SubjectFormProps {
  editData?: any;
  teachers: any[];
  onClose: () => void;
  onSave: (payload: any) => Promise<void>;
  saving: boolean;
}

const SubjectFormModal = React.memo(({ editData, teachers, onClose, onSave, saving }: SubjectFormProps) => {
  const [sf, setSf] = useState({
    title:       editData?.title       || "",
    title_ar:    editData?.title_ar    || "",
    description: editData?.description || "",
    level:       (editData?.level      || "all") as Level,
    is_active:   editData?.is_active   ?? true,
    image_url:   editData?.image_url   || "",
    teacher_id:  editData?.teacher_id  || "",
    color:       editData?.color       || G,
  });
  const [imgUploading, setImgUploading] = useState(false);
  const sImgRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImgUploading(true);
    const url = await uploadImage(f, "subject-images");
    if (url) setSf(s => ({ ...s, image_url: url }));
    setImgUploading(false);
  }, []);

  return (
    <div style={{ position:"fixed", inset:0, zIndex:50, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:500, maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ padding:"16px 20px", borderBottom:"1px solid #E5E7EB", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:"#fff" }}>
          <h2 style={{ fontSize:15, fontWeight:800, color:"#111", margin:0 }}>{editData ? "Edit Subject" : "New Subject"}</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#9CA3AF" }}>×</button>
        </div>
        <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14 }}>
          <input ref={sImgRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleFileChange} />
          <button onClick={() => sImgRef.current?.click()} style={{ height:100, borderRadius:12, border:"2px dashed #E5E7EB", background:"#F9FAFB", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, color:"#9CA3AF", fontSize:13 }}>
            {imgUploading ? <Loader2 size={20} style={{ animation:"spin .8s linear infinite" }} /> : sf.image_url ? <img src={sf.image_url} alt="" style={{ height:"100%", borderRadius:10 }} /> : <><Image size={20} /> Upload image</>}
          </button>

          {/* ── KEY FIX: inputs are inside this isolated component, so parent ── */}
          {/* ── re-renders NEVER cause focus loss on Android.                  ── */}
          <Field label="Subject Title (English)">
            <input
              value={sf.title}
              onChange={e => setSf(s => ({ ...s, title: e.target.value }))}
              style={inp}
              placeholder="e.g. Tajweed Level 1"
              autoFocus
            />
          </Field>
          <Field label="Subject Title (Arabic)">
            <input
              value={sf.title_ar}
              onChange={e => setSf(s => ({ ...s, title_ar: e.target.value }))}
              style={{ ...inp, direction:"rtl", fontFamily:"'Amiri',serif" }}
              placeholder="مثال: التجويد المستوى الأول"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={sf.description}
              onChange={e => setSf(s => ({ ...s, description: e.target.value }))}
              rows={3}
              style={{ ...inp, resize:"vertical" as const }}
            />
          </Field>
          <Field label="Level (only students at this level see this subject)">
            <div style={{ display:"flex", gap:6 }}>
              {(["all","beginner","intermediate","advanced"] as Level[]).map(lv => {
                const cfg = levelCfg[lv]; const sel = sf.level === lv;
                return <button key={lv} onClick={() => setSf(s => ({ ...s, level: lv }))} style={{ flex:1, padding:"8px 4px", borderRadius:10, border:`2px solid ${sel ? cfg.border : "#E5E7EB"}`, background:sel?cfg.bg:"#fff", color:cfg.text, fontWeight:sel?800:500, fontSize:10, cursor:"pointer" }}>{cfg.label}</button>;
              })}
            </div>
          </Field>
          <Field label="Assign Teacher">
            <select value={sf.teacher_id} onChange={e => setSf(s => ({ ...s, teacher_id: e.target.value }))} style={inp}>
              <option value="">— No teacher assigned —</option>
              {teachers.map((t: any) => <option key={t.user_id} value={t.user_id}>{t.full_name}</option>)}
            </select>
          </Field>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <input type="checkbox" id="sact" checked={sf.is_active} onChange={e => setSf(s => ({ ...s, is_active: e.target.checked }))} />
            <label htmlFor="sact" style={{ fontSize:13, color:"#374151" }}>Active (visible to students)</label>
          </div>
          <button
            onClick={() => onSave(sf)}
            disabled={saving || !sf.title}
            style={{ padding:"12px", borderRadius:12, border:"none", background: saving || !sf.title ? "#e5e7eb" : `linear-gradient(135deg,${G},${GM})`, color: saving || !sf.title ? "#9ca3af" : "#fff", fontWeight:800, cursor:saving || !sf.title ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            <Save size={14} /> {saving ? "Saving…" : editData ? "Update Subject" : "Create Subject"}
          </button>
        </div>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════
// LESSON FORM MODAL — isolated state
// ══════════════════════════════════════════════════════════════════════════
interface LessonFormProps {
  editData?: any;
  onClose: () => void;
  onSave: (payload: any) => Promise<void>;
  saving: boolean;
}

const LessonFormModal = React.memo(({ editData, onClose, onSave, saving }: LessonFormProps) => {
  const [lf, setLf] = useState({
    title:             editData?.title             || "",
    title_ar:          editData?.title_ar          || "",
    video_url:         editData?.video_url         || "",
    content:           editData?.content           || "",
    duration_minutes:  editData?.duration_minutes  || 0,
    sort_order:        editData?.sort_order        || 0,
    is_free:           editData?.is_free           || false,
  });

  return (
    <div style={{ position:"fixed", inset:0, zIndex:50, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:480, maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ padding:"16px 20px", borderBottom:"1px solid #E5E7EB", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:"#fff" }}>
          <h2 style={{ fontSize:15, fontWeight:800, color:"#111", margin:0 }}>{editData ? "Edit Lesson" : "New Lesson"}</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#9CA3AF" }}>×</button>
        </div>
        <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14 }}>
          <Field label="Lesson Title">
            <input value={lf.title} onChange={e => setLf(l => ({ ...l, title: e.target.value }))} style={inp} autoFocus />
          </Field>
          <Field label="Lesson Title (Arabic)">
            <input value={lf.title_ar} onChange={e => setLf(l => ({ ...l, title_ar: e.target.value }))} style={{ ...inp, direction:"rtl", fontFamily:"'Amiri',serif" }} />
          </Field>
          <Field label="Video URL (YouTube/Vimeo)">
            <input value={lf.video_url} onChange={e => setLf(l => ({ ...l, video_url: e.target.value }))} style={inp} placeholder="https://…" />
          </Field>
          <Field label="Duration (minutes)">
            <input type="number" value={lf.duration_minutes} onChange={e => setLf(l => ({ ...l, duration_minutes: Number(e.target.value) }))} style={inp} min={0} />
          </Field>
          <Field label="Sort Order">
            <input type="number" value={lf.sort_order} onChange={e => setLf(l => ({ ...l, sort_order: Number(e.target.value) }))} style={inp} min={0} />
          </Field>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <input type="checkbox" id="lfree" checked={lf.is_free} onChange={e => setLf(l => ({ ...l, is_free: e.target.checked }))} />
            <label htmlFor="lfree" style={{ fontSize:13, color:"#374151" }}>Free preview (no subscription required)</label>
          </div>
          <button
            onClick={() => onSave(lf)}
            disabled={saving || !lf.title}
            style={{ padding:"12px", borderRadius:12, border:"none", background: saving || !lf.title ? "#e5e7eb" : `linear-gradient(135deg,${G},${GM})`, color: saving || !lf.title ? "#9ca3af" : "#fff", fontWeight:800, cursor:saving || !lf.title ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            <Save size={14} /> {saving ? "Saving…" : editData ? "Update Lesson" : "Add Lesson"}
          </button>
        </div>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════
export default function CourseManagement() {
  const { user } = useAuth();
  const qc       = useQueryClient();

  type View = "courses" | "subjects" | "lessons";
  const [view,          setView]          = useState<View>("courses");
  const [selCourse,     setSelCourse]     = useState<any|null>(null);
  const [selSubject,    setSelSubject]    = useState<any|null>(null);
  const [search,        setSearch]        = useState("");
  const [levelFilter,   setLevelFilter]   = useState<Level>("all");
  const [sortBy,        setSortBy]        = useState<SortKey>("sort_order");  // ← Issue 3: sort

  // Forms
  const [courseForm,    setCourseForm]    = useState(false);
  const [subjectForm,   setSubjectForm]   = useState(false);
  const [lessonForm,    setLessonForm]    = useState(false);
  const [editCourseData,  setEditCourseData]  = useState<any|null>(null);
  const [editSubjectData, setEditSubjectData] = useState<any|null>(null);
  const [editLessonData,  setEditLessonData]  = useState<any|null>(null);
  const [saving, setSaving] = useState(false);

  // ── Data ─────────────────────────────────────────────────────────────────
  const { data: courses = [], isLoading: cLoad } = useQuery({
    queryKey: ["admin-courses-v2"],
    queryFn:  async () => { const { data } = await supabase.from("courses").select("*").order("sort_order"); return data || []; },
  });

  const { data: subjects = [], isLoading: sLoad } = useQuery({
    queryKey: ["admin-subjects-v2", selCourse?.id],
    enabled:  view !== "courses",
    queryFn:  async () => {
      let q = supabase.from("subjects").select("*").order("title");
      if (selCourse) q = q.eq("course_id", selCourse.id);
      const { data } = await q;
      return data || [];
    },
  });

  const { data: allSubjects = [] } = useQuery({
    queryKey: ["admin-all-subjects"],
    queryFn:  async () => { const { data } = await supabase.from("subjects").select("id,title,level,course_id").order("title"); return data || []; },
  });

  const { data: lessons = [], isLoading: lLoad } = useQuery({
    queryKey: ["admin-lessons-v2", selSubject?.id],
    enabled:  !!selSubject,
    queryFn:  async () => { const { data } = await supabase.from("lessons").select("*").eq("course_id", selSubject?.id || "").order("sort_order"); return data || []; },
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers-simple"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").in("role", ["teacher","admin"]);
      if (!roles?.length) return [];
      const { data } = await supabase.from("profiles").select("user_id,full_name").in("user_id", roles.map((r: any) => r.user_id));
      return data || [];
    },
  });

  // ── Course CRUD ───────────────────────────────────────────────────────────
  const saveCourse = useCallback(async (payload: any) => {
    setSaving(true);
    try {
      const data = { title: payload.title, title_ar: payload.title_ar||null, description: payload.description||null, level: payload.level, is_published: payload.is_published, image_url: payload.image_url||null, sort_order: payload.sort_order, updated_at: new Date().toISOString() };
      if (editCourseData) { await supabase.from("courses").update(data).eq("id", editCourseData.id); }
      else                { await supabase.from("courses").insert(data); }
      qc.invalidateQueries({ queryKey: ["admin-courses-v2"] });
      setCourseForm(false); setEditCourseData(null);
      toast({ title: "✅ Course saved" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSaving(false);
  }, [editCourseData, qc]);

  const deleteCourse = async (id: string) => {
    if (!confirm("Delete this course? Subjects inside will NOT be deleted.")) return;
    await supabase.from("courses").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-courses-v2"] });
    if (selCourse?.id === id) { setSelCourse(null); setView("courses"); }
    toast({ title: "Course deleted" });
  };

  // ── Subject CRUD ──────────────────────────────────────────────────────────
  const saveSubject = useCallback(async (payload: any) => {
    setSaving(true);
    try {
      const data = { title: payload.title, title_ar: payload.title_ar||null, description: payload.description||null, level: payload.level, is_active: payload.is_active, image_url: payload.image_url||null, teacher_id: payload.teacher_id||null, color: payload.color||G, course_id: selCourse?.id||null, updated_at: new Date().toISOString() } as any;
      if (editSubjectData) { await supabase.from("subjects").update(data).eq("id", editSubjectData.id); }
      else                 { await supabase.from("subjects").insert(data); }
      qc.invalidateQueries({ queryKey: ["admin-subjects-v2"] });
      qc.invalidateQueries({ queryKey: ["admin-all-subjects"] });
      setSubjectForm(false); setEditSubjectData(null);
      toast({ title: "✅ Subject saved" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSaving(false);
  }, [editSubjectData, selCourse, qc]);

  const deleteSubject = async (id: string) => {
    if (!confirm("Delete this subject? Lessons inside will be deleted too.")) return;
    await supabase.from("lessons").delete().eq("course_id", id);
    await supabase.from("subjects").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-subjects-v2"] });
    if (selSubject?.id === id) { setSelSubject(null); setView("subjects"); }
    toast({ title: "Subject deleted" });
  };

  const linkSubject = async (subjectId: string) => {
    await supabase.from("subjects").update({ course_id: selCourse?.id } as any).eq("id", subjectId);
    qc.invalidateQueries({ queryKey: ["admin-subjects-v2"] });
    qc.invalidateQueries({ queryKey: ["admin-all-subjects"] });
    toast({ title: "Subject linked to course" });
  };

  // ── Lesson CRUD ───────────────────────────────────────────────────────────
  const saveLesson = useCallback(async (payload: any) => {
    setSaving(true);
    try {
      const data = { title: payload.title, title_ar: payload.title_ar||null, video_url: payload.video_url||null, duration_minutes: payload.duration_minutes, sort_order: payload.sort_order, course_id: selSubject?.id, is_free: payload.is_free, updated_at: new Date().toISOString() };
      if (editLessonData) { await supabase.from("lessons").update(data).eq("id", editLessonData.id); }
      else                { await supabase.from("lessons").insert(data); }
      qc.invalidateQueries({ queryKey: ["admin-lessons-v2", selSubject?.id] });
      setLessonForm(false); setEditLessonData(null);
      toast({ title: "✅ Lesson saved" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    setSaving(false);
  }, [editLessonData, selSubject, qc]);

  const deleteLesson = async (id: string) => {
    if (!confirm("Delete this lesson?")) return;
    await supabase.from("lessons").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-lessons-v2", selSubject?.id] });
    toast({ title: "Lesson deleted" });
  };

  // ── Sorting (Issue 3) ─────────────────────────────────────────────────────
  const sortCourses = (list: any[]) => {
    const s = [...list];
    if (sortBy === "sort_order") return s.sort((a,b) => (a.sort_order||0) - (b.sort_order||0));
    if (sortBy === "title_asc")  return s.sort((a,b) => a.title.localeCompare(b.title));
    if (sortBy === "title_desc") return s.sort((a,b) => b.title.localeCompare(a.title));
    if (sortBy === "level") {
      const o: Record<string,number> = { beginner:0, intermediate:1, advanced:2, all:3 };
      return s.sort((a,b) => (o[a.level]||0) - (o[b.level]||0));
    }
    return s;
  };

  const filteredCourses = sortCourses(courses.filter((c: any) => {
    const matchLevel  = levelFilter === "all" || c.level === levelFilter || c.level === "all";
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase());
    return matchLevel && matchSearch;
  }));

  const filteredSubjects = subjects.filter((s: any) => {
    const matchLevel  = levelFilter === "all" || s.level === levelFilter || s.level === "all";
    const matchSearch = !search || s.title.toLowerCase().includes(search.toLowerCase());
    return matchLevel && matchSearch;
  });

  const unlinkableSubjects = allSubjects.filter((s: any) => !s.course_id);

  return (
    <div style={{ minHeight:"100vh", background:"#F3F4F6", fontFamily:"system-ui,sans-serif" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .card-hover:hover{box-shadow:0 4px 16px rgba(0,0,0,.1);transform:translateY(-1px)} .card-hover{transition:all .2s}`}</style>

      {/* ── Header ─────────────────────────────────────────────── */}
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
        <button
          onClick={() => { if (view==="courses") setCourseForm(true); else if (view==="subjects") setSubjectForm(true); else setLessonForm(true); }}
          style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 16px", borderRadius:10, border:"none", background:G, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
          <Plus size={14} /> Add {view==="courses" ? "Course" : view==="subjects" ? "Subject" : "Lesson"}
        </button>
      </div>

      {/* ── Filters + Sort ───────────────────────────────────── */}
      {view !== "lessons" && (
        <div style={{ background:"#fff", borderBottom:"1px solid #E5E7EB", padding:"10px 16px", display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <div style={{ position:"relative", minWidth:160, flex:1 }}>
            <Search size={13} style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF" }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ ...inp, paddingLeft:28 }} />
          </div>
          {(["all","beginner","intermediate","advanced"] as Level[]).map(lv => {
            const cfg = levelCfg[lv];
            return (
              <button key={lv} onClick={() => setLevelFilter(lv)} style={{ flexShrink:0, padding:"6px 12px", borderRadius:20, border:`1.5px solid ${levelFilter===lv ? cfg.border : "#E5E7EB"}`, background: levelFilter===lv ? cfg.bg : "#fff", color: levelFilter===lv ? cfg.text : "#6B7280", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                {cfg.label}
              </button>
            );
          })}
          {/* ── Sort selector (only on courses view) ── */}
          {view === "courses" && (
            <select value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)} style={{ ...inp, width:"auto", minWidth:130, flexShrink:0 }}>
              <option value="sort_order">Sort: Manual</option>
              <option value="title_asc">Sort: A → Z</option>
              <option value="title_desc">Sort: Z → A</option>
              <option value="level">Sort: By Level</option>
            </select>
          )}
        </div>
      )}

      <div style={{ padding:16, maxWidth:900, margin:"0 auto" }}>

        {/* ═══════ COURSES VIEW ════════════════════════════════ */}
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
                        <p style={{ fontWeight:800, fontSize:14, color:"#111", margin:"0 0 2px", cursor:"pointer" }} onClick={() => { setSelCourse(c); setView("subjects"); }}>{c.title}</p>
                        {c.title_ar && <p style={{ fontWeight:600, fontSize:12, color:GOLD, margin:"0 0 4px", direction:"rtl", fontFamily:"'Amiri',serif" }}>{c.title_ar}</p>}
                        {c.description && <p style={{ fontSize:12, color:"#9CA3AF", margin:"0 0 10px", lineHeight:1.5 }}>{c.description.slice(0,80)}{c.description.length>80?"…":""}</p>}
                        <div style={{ display:"flex", gap:6 }}>
                          <button onClick={() => { setSelCourse(c); setView("subjects"); }} style={{ flex:1, padding:"7px", borderRadius:8, border:`1px solid ${G}`, background:G, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                            <Layers size={12} /> Subjects
                          </button>
                          <button onClick={() => { setEditCourseData(c); setCourseForm(true); }} style={{ padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer" }}><Edit2 size={13} color={G} /></button>
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

        {/* ═══════ SUBJECTS VIEW ═══════════════════════════════ */}
        {view === "subjects" && (
          <>
            {sLoad ? (
              <div style={{ textAlign:"center", padding:40 }}><Loader2 size={28} style={{ animation:"spin .8s linear infinite", color:G }} /></div>
            ) : (
              <>
                {filteredSubjects.length === 0 && (
                  <div style={{ textAlign:"center", padding:40, color:"#9CA3AF" }}>
                    <BookOpen size={48} style={{ margin:"0 auto 12px", display:"block" }} />
                    <p>No subjects in this course yet. Add one above.</p>
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
                          <p style={{ fontWeight:800, fontSize:13, color:"#111", margin:"0 0 2px", cursor:"pointer" }} onClick={() => { setSelSubject(s); setView("lessons"); }}>{s.title}</p>
                          {s.title_ar && <p style={{ fontWeight:600, fontSize:11, color:GOLD, margin:"0 0 6px", direction:"rtl", fontFamily:"'Amiri',serif" }}>{s.title_ar}</p>}
                          <div style={{ display:"flex", gap:6 }}>
                            <button onClick={() => { setSelSubject(s); setView("lessons"); }} style={{ flex:1, padding:"6px", borderRadius:8, border:`1px solid ${G}`, background:G, color:"#fff", fontSize:11, fontWeight:700, cursor:"pointer" }}>Lessons</button>
                            <button onClick={() => { setEditSubjectData(s); setSubjectForm(true); }} style={{ padding:"6px 9px", borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer" }}><Edit2 size={13} color={G} /></button>
                            <button onClick={() => deleteSubject(s.id)} style={{ padding:"6px 9px", borderRadius:8, border:"1px solid #FEE2E2", background:"#FEF2F2", cursor:"pointer" }}><Trash2 size={13} color="#DC2626" /></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Link unlinked subjects */}
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

        {/* ═══════ LESSONS VIEW ════════════════════════════════ */}
        {view === "lessons" && (
          <>
            {lLoad ? (
              <div style={{ textAlign:"center", padding:40 }}><Loader2 size={28} style={{ animation:"spin .8s linear infinite", color:G }} /></div>
            ) : lessons.length === 0 ? (
              <div style={{ textAlign:"center", padding:40, color:"#9CA3AF" }}>
                <BookOpen size={48} style={{ margin:"0 auto 12px", display:"block" }} />
                <p>No lessons yet. Add the first lesson above.</p>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {(lessons as any[]).map((l: any, idx: number) => (
                  <div key={l.id} style={{ background:"#fff", borderRadius:14, border:"1px solid #E5E7EB", padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:32, height:32, borderRadius:"50%", background:"#F0FDF4", border:"1px solid #86EFAC", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:800, color:G, flexShrink:0 }}>{idx+1}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontWeight:700, fontSize:13, color:"#111", margin:"0 0 2px" }}>{l.title}</p>
                      {l.title_ar && <p style={{ fontSize:11, color:GOLD, margin:"0 0 2px", direction:"rtl", fontFamily:"'Amiri',serif" }}>{l.title_ar}</p>}
                      <div style={{ display:"flex", gap:8, fontSize:11, color:"#9CA3AF" }}>
                        {l.duration_minutes > 0 && <span>⏱️ {l.duration_minutes} min</span>}
                        {l.video_url && <span>🎥 Video</span>}
                        {l.is_free && <span style={{ color:"#16a34a", fontWeight:700 }}>FREE</span>}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                      <button onClick={() => { setEditLessonData(l); setLessonForm(true); }} style={{ padding:"6px 9px", borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer" }}><Edit2 size={13} color={G} /></button>
                      <button onClick={() => deleteLesson(l.id)} style={{ padding:"6px 9px", borderRadius:8, border:"1px solid #FEE2E2", background:"#FEF2F2", cursor:"pointer" }}><Trash2 size={13} color="#DC2626" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modals — isolated memo components, no focus loss ─── */}
      {courseForm && (
        <CourseFormModal
          editData={editCourseData}
          onClose={() => { setCourseForm(false); setEditCourseData(null); }}
          onSave={saveCourse}
          saving={saving}
        />
      )}
      {subjectForm && (
        <SubjectFormModal
          editData={editSubjectData}
          teachers={teachers as any[]}
          onClose={() => { setSubjectForm(false); setEditSubjectData(null); }}
          onSave={saveSubject}
          saving={saving}
        />
      )}
      {lessonForm && (
        <LessonFormModal
          editData={editLessonData}
          onClose={() => { setLessonForm(false); setEditLessonData(null); }}
          onSave={saveLesson}
          saving={saving}
        />
      )}
    </div>
  );
}
