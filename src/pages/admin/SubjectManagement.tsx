/*
  src/pages/admin/SubjectManagement.tsx — Tahleem Academy
  ─────────────────────────────────────────────────────────
  Full subject CRUD with multi-level selection (levels TEXT[]),
  teacher assignment, and timetable slot count badges.
*/

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademicLevels, getLevelConfig, getLevelDisplay } from "@/hooks/useAcademicLevels";
import { toast } from "@/hooks/use-toast";
import { Plus, BookOpen, Users, Trash2, Edit, X, Save, Calendar, Lock, Loader2 } from "lucide-react";

const G    = "#0f2d1f";
const GM   = "#1a4731";
const GOLD = "#c9a84c";


interface SubForm {
  title: string; title_ar: string; description: string; description_ar: string;
  teacher_id: string; levels: string[]; is_active: boolean;
  visibility: "all" | "general" | "private";
}
const EMPTY: SubForm = { title:"", title_ar:"", description:"", description_ar:"", teacher_id:"", levels:[], is_active:true, visibility:"all" };

const labelSt: React.CSSProperties = { display:"block", fontSize:12, fontWeight:700, color:"#374151", marginBottom:5 };
const inputSt: React.CSSProperties = { width:"100%", padding:"10px 12px", borderRadius:10, border:"1.5px solid #e5e7eb", fontSize:13, fontFamily:"'Cairo',sans-serif", color:"#111827", background:"#fafafa", outline:"none", boxSizing:"border-box" };

const SubjectManagement = () => {
  const { t, language } = useLanguage();
  const { user }        = useAuth();
  const qc              = useQueryClient();
  const { data: academicLevels = [] } = useAcademicLevels();
  const LEVELS = academicLevels.map(l => {
    const cfg = getLevelConfig(l.slug, academicLevels);
    return { value: l.slug, label: l.name_en, ar: l.name_ar, color: cfg.color };
  });
  const [open,   setOpen]   = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form,   setForm]   = useState<SubForm>(EMPTY);
  const [search, setSearch] = useState("");

  // ── Private student assignment state ───────────────────────────────────
  const [privAssigned, setPrivAssigned] = useState<Set<string>>(new Set()); // student user_ids assigned to current subject
  const [privSaving,   setPrivSaving]   = useState(false);

  const { data: subjects, isLoading } = useQuery({
    queryKey: ["subjects-admin"],
    queryFn: async () => {
      const { data } = await supabase.from("subjects").select("*").order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: teachers } = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").in("role", ["teacher", "admin"]);
      if (!roles?.length) return [];
      const ids = roles.map((r: any) => r.user_id);
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
      return data || [];
    },
  });

  const { data: timetableSlots } = useQuery({
    queryKey: ["timetable-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("subject_timetable").select("subject_id");
      const counts: Record<string, number> = {};
      (data || []).forEach((r: any) => { counts[r.subject_id] = (counts[r.subject_id] || 0) + 1; });
      return counts;
    },
  });

  // All private students (for subject assignment panel)
  const { data: privateStudents } = useQuery({
    queryKey: ["private-students-list"],
    queryFn: async () => {
      const { data: types } = await (supabase as any).from("profiles").select("user_id, full_name, full_name_ar, student_id").eq("student_type", "private");
      return types || [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: SubForm) => {
      const payload = {
        title: values.title, title_ar: values.title_ar || null,
        description: values.description || null, description_ar: values.description_ar || null,
        teacher_id: values.teacher_id || null,
        levels: values.levels,
        level: values.levels[0] || null,
        is_active: values.is_active,
        visibility: values.visibility,
        created_by: user?.id,
        updated_at: new Date().toISOString(),
        ...(!editId && { livekit_room_name: `subject-${crypto.randomUUID()}` }),
      };
      if (editId) {
        const { error } = await supabase.from("subjects").update(payload).eq("id", editId);
        if (error) throw error;
        return editId;
      } else {
        // Return new subject ID so we can apply pending private assignments
        const { data, error } = await supabase.from("subjects").insert(payload).select("id").single();
        if (error) throw error;
        return data.id as string;
      }
    },
    onSuccess: async (subjectId: string) => {
      // Apply any private student assignments that were queued before save
      if (privAssigned.size > 0) {
        const rows = [...privAssigned].map(sid => ({ student_id: sid, subject_id: subjectId, assigned_by: user?.id }));
        await supabase.from("private_student_subjects" as any).upsert(rows as any, { onConflict: "student_id,subject_id" });
      }
      qc.invalidateQueries({ queryKey: ["subjects-admin"] });
      qc.invalidateQueries({ queryKey: ["subjects-active"] });
      closeForm();
      toast({ title: t("Subject saved ✅", "تم حفظ المادة ✅") });
    },
    onError: (e: any) => toast({ title:"Error", description:e.message, variant:"destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subjects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey:["subjects-admin"] }); toast({ title: t("Deleted","تم الحذف") }); },
    onError: (e: any) => toast({ title:"Error", description:e.message, variant:"destructive" }),
  });

  const closeForm = () => { setOpen(false); setEditId(null); setForm(EMPTY); setPrivAssigned(new Set()); };

  const openEdit = (s: any) => {
    setEditId(s.id);
    const lvs: string[] = Array.isArray(s.levels) && s.levels.length > 0 ? s.levels : s.level ? [s.level] : [];
    setForm({ title:s.title||"", title_ar:s.title_ar||"", description:s.description||"", description_ar:s.description_ar||"", teacher_id:s.teacher_id||"", levels:lvs, is_active:s.is_active!==false, visibility:(s.visibility as any)||"all" });
    supabase.from("private_student_subjects" as any).select("student_id").eq("subject_id", s.id)
      .then(({ data }) => setPrivAssigned(new Set((data || []).map((r: any) => r.student_id))));
    setOpen(true);
  };

  const togglePrivStudent = useCallback(async (studentId: string) => {
    if (!editId) return;
    setPrivSaving(true);
    const isAssigned = privAssigned.has(studentId);
    if (isAssigned) {
      await supabase.from("private_student_subjects" as any).delete().eq("student_id", studentId).eq("subject_id", editId);
      setPrivAssigned(prev => { const n = new Set(prev); n.delete(studentId); return n; });
    } else {
      await supabase.from("private_student_subjects" as any).insert({ student_id: studentId, subject_id: editId, assigned_by: user?.id } as any);
      setPrivAssigned(prev => new Set([...prev, studentId]));
    }
    setPrivSaving(false);
  }, [privAssigned, editId, user?.id]);

  const toggleLevel = (lv: string) =>
    setForm(f => ({ ...f, levels: f.levels.includes(lv) ? f.levels.filter(x=>x!==lv) : [...f.levels, lv] }));

  const filtered = (subjects||[]).filter((s:any) => {
    const q = search.toLowerCase();
    return !q || s.title?.toLowerCase().includes(q) || s.title_ar?.includes(q);
  });

  return (
    <div style={{ fontFamily:"'Cairo',sans-serif", background:"#f8fafb", minHeight:"100vh" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');`}</style>

      {/* Header */}
      <div style={{ background:`linear-gradient(135deg,${G},${GM})`, padding:"20px 20px 24px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
              <BookOpen style={{ width:22, height:22, color:GOLD }} />
              <h1 style={{ fontSize:20, fontWeight:900, color:"#fff", margin:0 }}>{t("Subject Management","إدارة المواد")}</h1>
            </div>
            <p style={{ fontSize:12, color:"rgba(255,255,255,.5)", margin:0 }}>{filtered.length} {t("subjects","مواد")}</p>
          </div>
          <button onClick={() => { setEditId(null); setForm(EMPTY); setPrivAssigned(new Set()); setOpen(true); }}
            style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 18px", borderRadius:12, background:GOLD, border:"none", color:G, fontSize:13, fontWeight:900, cursor:"pointer", fontFamily:"'Cairo',sans-serif" }}>
            <Plus style={{ width:16, height:16 }} />{t("Add Subject","إضافة مادة")}
          </button>
        </div>
        <input placeholder={t("Search subjects…","ابحث…")} value={search} onChange={e=>setSearch(e.target.value)}
          style={{ marginTop:14, width:"100%", maxWidth:360, padding:"9px 14px", borderRadius:10, border:"none", fontSize:13, fontFamily:"'Cairo',sans-serif", background:"rgba(255,255,255,.12)", color:"#fff", outline:"none", boxSizing:"border-box" as const }} />
      </div>

      {/* Form modal */}
      {open && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.5)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={closeForm}>
          <div style={{ background:"#fff", borderRadius:20, padding:24, width:"100%", maxWidth:540, maxHeight:"90vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
              <h2 style={{ fontSize:17, fontWeight:800, color:G, margin:0 }}>{editId ? t("Edit Subject","تعديل المادة") : t("New Subject","مادة جديدة")}</h2>
              <button onClick={closeForm} style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af" }}><X style={{ width:20, height:20 }} /></button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div><label style={labelSt}>{t("Title (EN)","العنوان EN")} *</label><input style={inputSt} value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} /></div>
                <div><label style={labelSt}>{t("Title (AR)","العنوان AR")}</label><input style={{...inputSt,direction:"rtl"}} value={form.title_ar} onChange={e=>setForm(f=>({...f,title_ar:e.target.value}))} /></div>
              </div>
              <div><label style={labelSt}>{t("Description","الوصف")}</label><textarea style={{...inputSt,height:64,resize:"vertical"as const}} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} /></div>
              <div><label style={labelSt}>{t("Description AR","الوصف AR")}</label><textarea style={{...inputSt,height:56,resize:"vertical"as const,direction:"rtl"}} value={form.description_ar} onChange={e=>setForm(f=>({...f,description_ar:e.target.value}))} /></div>
              <div>
                <label style={labelSt}>{t("Assign Teacher","تعيين المعلم")}</label>
                <select style={inputSt} value={form.teacher_id} onChange={e=>setForm(f=>({...f,teacher_id:e.target.value}))}>
                  <option value="">{t("No teacher","بدون معلم")}</option>
                  {(teachers||[]).map((tc:any)=>(<option key={tc.user_id} value={tc.user_id}>{tc.full_name||tc.user_id}</option>))}
                </select>
              </div>
              <div>
                <label style={labelSt}>{t("Levels (empty = all students see this subject)","المستويات (فارغ = جميع الطلاب)")}</label>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:6 }}>
                  {LEVELS.map(lv => {
                    const active = form.levels.includes(lv.value);
                    return (
                      <button key={lv.value} type="button" onClick={()=>toggleLevel(lv.value)}
                        style={{ padding:"6px 16px", borderRadius:20, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'Cairo',sans-serif", border:`2px solid ${lv.color}`, background:active?lv.color:"transparent", color:active?"#fff":lv.color, transition:"all .15s" }}>
                        {language==="ar"?lv.ar:lv.label}
                      </button>
                    );
                  })}
                </div>
                {form.levels.length===0 && <p style={{ fontSize:11, color:"#9ca3af", marginTop:5 }}>{t("All students will see this subject","سيرى جميع الطلاب هذه المادة")}</p>}
              </div>
              {/* Visibility */}
              <div>
                <label style={labelSt}>Who can see this subject?</label>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" as const, marginTop:6 }}>
                  {([
                    { value:"all",     label:"All Students",  desc:"General + Private",       color:"#22c55e", bg:"#f0fff4" },
                    { value:"general", label:"Class Students", desc:"Not private students",    color:"#3b82f6", bg:"#eff6ff" },
                    { value:"private", label:"Private Only",   desc:"Assigned privates only",  color:"#7C3AED", bg:"#F3E8FF" },
                  ] as const).map(opt => {
                    const sel = form.visibility === opt.value;
                    return (
                      <button key={opt.value} type="button" onClick={()=>setForm(f=>({...f,visibility:opt.value}))}
                        style={{ flex:1, minWidth:90, padding:"9px 6px", borderRadius:11, cursor:"pointer", border:`2px solid ${sel?opt.color:"#e5e7eb"}`, background:sel?opt.bg:"#f9fafb", textAlign:"center" as const, transition:"all .15s" }}>
                        <div style={{ fontSize:11, fontWeight:800, color:sel?opt.color:"#374151" }}>{opt.label}</div>
                        <div style={{ fontSize:10, color:sel?opt.color+"bb":"#9ca3af", marginTop:2 }}>{opt.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active toggle */}
              <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
                <div onClick={()=>setForm(f=>({...f,is_active:!f.is_active}))}
                  style={{ width:40, height:22, borderRadius:11, background:form.is_active?GM:"#d1d5db", position:"relative", cursor:"pointer", transition:"background .2s" }}>
                  <div style={{ position:"absolute", top:2, left:form.is_active?20:2, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left .2s" }} />
                </div>
                <span style={{ fontSize:13, fontWeight:600, color:G }}>{t("Active","نشط")}</span>
              </label>

              {/* ── Private Student Assignment ── */}
              <div style={{ borderTop:"1.5px solid #E5E7EB", paddingTop:14 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                    <div>
                      <p style={{ fontSize:12, fontWeight:800, color:"#374151", margin:"0 0 2px", display:"flex", alignItems:"center", gap:6 }}>
                        <Lock style={{ width:13, height:13, color:"#7C3AED" }} />
                        Assign to Private Students
                      </p>
                      <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>
                        {privAssigned.size} student{privAssigned.size!==1?"s":""} — private students see only their assigned subjects
                      </p>
                    </div>
                    {privSaving && <Loader2 style={{ width:14, height:14, color:"#7C3AED", animation:"spin 1s linear infinite" }} />}
                  </div>

                  {!privateStudents?.length ? (
                    <div style={{ padding:"12px", borderRadius:10, background:"#F9FAFB", border:"1px solid #E5E7EB", fontSize:11, color:"#9CA3AF", textAlign:"center" }}>
                      No private students yet
                    </div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:200, overflowY:"auto" }}>
                      {privateStudents.map((st: any) => {
                        const isAssigned = privAssigned.has(st.user_id);
                        return (
                          <button key={st.user_id} onClick={() => togglePrivStudent(st.user_id)}
                            style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, border:`1.5px solid ${isAssigned?"#D8B4FE":"#E5E7EB"}`, background:isAssigned?"#F3E8FF":"#fff", cursor:"pointer", textAlign:"left", width:"100%", transition:"all .12s" }}>
                            <div style={{ width:18, height:18, borderRadius:5, border:`2px solid ${isAssigned?"#7C3AED":"#D1D5DB"}`, background:isAssigned?"#7C3AED":"#fff", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                              {isAssigned && <span style={{ color:"#fff", fontSize:11, lineHeight:1 }}>✓</span>}
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <p style={{ fontSize:12, fontWeight:isAssigned?800:500, color:isAssigned?"#7C3AED":"#374151", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                {st.full_name || "Unnamed"}
                              </p>
                              {st.student_id && <p style={{ fontSize:10, color:"#9CA3AF", margin:"1px 0 0" }}>ID: {st.student_id}</p>}
                            </div>
                            {isAssigned && <span style={{ fontSize:9, padding:"2px 7px", borderRadius:9, background:"#7C3AED", color:"#fff", fontWeight:800, flexShrink:0 }}>Assigned</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {!editId && privAssigned.size > 0 && (
                    <p style={{ fontSize:10, color:"#7C3AED", margin:"6px 0 0", fontWeight:700 }}>
                      ✅ {privAssigned.size} student{privAssigned.size!==1?"s":""} will be assigned when you save.
                    </p>
                  )}
                </div>
              <button disabled={!form.title||saveMutation.isPending} onClick={()=>saveMutation.mutate(form)}
                style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:12, borderRadius:12, background:G, border:"none", color:"#fff", fontSize:14, fontWeight:800, cursor:"pointer", fontFamily:"'Cairo',sans-serif", opacity:!form.title?.5:1 }}>
                <Save style={{ width:15, height:15 }} />
                {saveMutation.isPending?t("Saving…","جارٍ الحفظ…"):t("Save Subject","حفظ المادة")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cards */}
      <div style={{ padding:16, maxWidth:900, margin:"0 auto" }}>
        {isLoading ? (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:14 }}>
            {[1,2,3].map(i=><div key={i} style={{ height:160, borderRadius:16, background:"#e5e7eb" }} />)}
          </div>
        ) : filtered.length===0 ? (
          <div style={{ textAlign:"center", padding:"60px 20px", color:"#9ca3af" }}>
            <BookOpen style={{ width:40, height:40, color:"#d1d5db", margin:"0 auto 12px" }} />
            <p style={{ fontSize:14 }}>{t("No subjects yet","لا توجد مواد")}</p>
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:14 }}>
            {filtered.map((s:any) => {
              const sLevels:string[] = Array.isArray(s.levels)&&s.levels.length>0
                ? s.levels
                : s.level && s.level !== "all"
                  ? s.level.split(",").map((x: string) => x.trim()).filter(Boolean)
                  : [];
              const teacherName = (teachers||[]).find((tc:any)=>tc.user_id===s.teacher_id)?.full_name;
              const slotCount = timetableSlots?.[s.id] || 0;
              return (
                <div key={s.id} style={{ background:"#fff", borderRadius:16, border:`1.5px solid ${s.is_active?"#e5e7eb":"#fee2e2"}`, padding:16, display:"flex", flexDirection:"column", gap:10, boxShadow:"0 1px 4px rgba(0,0,0,.04)" }}>
                  <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                    <div style={{ width:40, height:40, borderRadius:10, background:`linear-gradient(135deg,${G},${GM})`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <BookOpen style={{ width:18, height:18, color:GOLD }} />
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:14, fontWeight:800, color:G, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.title}</p>
                      {s.title_ar && <p dir="rtl" style={{ fontSize:12, color:GOLD, margin:"2px 0 0", fontFamily:"'Amiri',serif" }}>{s.title_ar}</p>}
                    </div>
                    <span style={{ fontSize:10, padding:"3px 8px", borderRadius:9, fontWeight:700, background:s.is_active?"#f0fff4":"#fef2f2", color:s.is_active?"#16a34a":"#ef4444", flexShrink:0 }}>
                      {s.is_active?t("Active","نشط"):t("Inactive","معطل")}
                    </span>
                  </div>
                  {s.description && <p style={{ fontSize:12, color:"#6b7280", margin:0, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical"as any, overflow:"hidden", lineHeight:1.5 }}>{s.description}</p>}
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {sLevels.length===0 ? (
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:9, background:"#f0fff4", color:"#22c55e", fontWeight:700 }}>{t("All Levels","جميع المستويات")}</span>
                    ) : sLevels.map(lv => {
                      const lc = LEVELS.find(l=>l.value===lv);
                      return <span key={lv} style={{ fontSize:10, padding:"2px 8px", borderRadius:9, fontWeight:700, background:`${lc?.color}18`, color:lc?.color||"#374151" }}>{language==="ar"?lc?.ar||lv:lc?.label||lv}</span>;
                    })}
                    {teacherName && <span style={{ fontSize:10, padding:"2px 8px", borderRadius:9, background:"#eff6ff", color:"#3b82f6", fontWeight:700, display:"flex", alignItems:"center", gap:4 }}><Users style={{ width:9, height:9 }} />{teacherName}</span>}
                    {slotCount>0 && <span style={{ fontSize:10, padding:"2px 8px", borderRadius:9, background:"#fdf4ff", color:"#9333ea", fontWeight:700, display:"flex", alignItems:"center", gap:4 }}><Calendar style={{ width:9, height:9 }} />{slotCount} {t("slots","حصص")}</span>}
                    {s.visibility === "private" && <span style={{ fontSize:10, padding:"2px 8px", borderRadius:9, background:"#F3E8FF", color:"#7C3AED", fontWeight:700, border:"1px solid #D8B4FE" }}>🔒 Private Only</span>}
                    {s.visibility === "general" && <span style={{ fontSize:10, padding:"2px 8px", borderRadius:9, background:"#eff6ff", color:"#3b82f6", fontWeight:700, border:"1px solid #bfdbfe" }}>👥 Class Students</span>}
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={()=>openEdit(s)} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:8, borderRadius:10, background:"#f0f4f0", border:"none", cursor:"pointer", color:G, fontSize:12, fontWeight:700, fontFamily:"'Cairo',sans-serif" }}>
                      <Edit style={{ width:13, height:13 }} />{t("Edit","تعديل")}
                    </button>
                    <button onClick={()=>{ if(confirm(t("Delete?","حذف؟"))) deleteMutation.mutate(s.id); }}
                      style={{ width:36, height:36, borderRadius:10, background:"#fef2f2", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#ef4444" }}>
                      <Trash2 style={{ width:14, height:14 }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SubjectManagement;
