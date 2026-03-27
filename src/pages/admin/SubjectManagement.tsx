/* src/pages/admin/SubjectManagement.tsx — Enhanced with course count, enrollment stats, teacher assignment, active toggle */
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import {
  Plus, BookOpen, Trash2, Edit, Upload, Image, X, Loader2,
  Search, Users, GraduationCap, ChevronRight, Eye, EyeOff,
  BookMarked, LayoutGrid, List
} from "lucide-react";

const G = "#064E3B";

const SubjectManagement = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [open, setOpen]         = useState(false);
  const [editId, setEditId]     = useState<string|null>(null);
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string|null>(null);
  const [search, setSearch]     = useState("");
  const [viewMode, setViewMode] = useState<"grid"|"list">("grid");
  const [saving, setSaving]     = useState(false);
  const fileRef                 = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title: "", title_ar: "", description: "", description_ar: "",
    teacher_id: "", is_active: true, image_url: "", level: "",
    color: G,
  });

  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ["admin-subjects-enhanced"],
    queryFn: async () => {
      const { data: subs } = await supabase.from("subjects").select("*").order("created_at", { ascending: false });
      if (!subs?.length) return [];
      const ids = subs.map(s => s.id);
      const [coursesRes, teacherRolesRes] = await Promise.all([
        supabase.from("courses").select("id, subject_id, is_published").in("subject_id", ids),
        supabase.from("user_roles").select("user_id, role").in("role", ["teacher","admin"]),
      ]);
      const courseCounts: Record<string, number> = {};
      (coursesRes.data || []).forEach((c: any) => { courseCounts[c.subject_id] = (courseCounts[c.subject_id]||0)+1; });
      return subs.map(s => ({ ...s, courseCount: courseCounts[s.id]||0 }));
    },
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers-list"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").in("role",["teacher","admin"]);
      if (!roles?.length) return [];
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", roles.map(r=>r.user_id));
      return data || [];
    },
  });

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `subjects/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("subject-images").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("subject-images").getPublicUrl(path);
      setForm(f => ({ ...f, image_url: data.publicUrl }));
      toast({ title: "Image uploaded ✅" });
    } catch (e: any) { toast({ title: "Upload failed", description: e.message, variant: "destructive" }); }
    finally { setUploading(false); }
  };

  const saveSubject = async () => {
    if (!form.title) return;
    setSaving(true);
    try {
      const payload = { title: form.title, title_ar: form.title_ar||null, description: form.description||null,
        description_ar: form.description_ar||null, teacher_id: form.teacher_id||null,
        is_active: form.is_active, image_url: form.image_url||null, created_by: user?.id };
      if (editId) {
        await supabase.from("subjects").update(payload).eq("id", editId);
      } else {
        await supabase.from("subjects").insert({ ...payload, livekit_room_name: `subject-${crypto.randomUUID()}` });
      }
      qc.invalidateQueries({ queryKey: ["admin-subjects-enhanced"] });
      qc.invalidateQueries({ queryKey: ["subjects"] });
      closeDialog();
      toast({ title: "Subject saved" });
    } catch(e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const deleteSubject = async (id: string) => {
    if (!confirm("Delete this subject?")) return;
    await supabase.from("subjects").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-subjects-enhanced"] });
    toast({ title: "Deleted" });
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("subjects").update({ is_active: !current }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-subjects-enhanced"] });
  };

  const closeDialog = () => {
    setOpen(false); setEditId(null); setImagePreview(null);
    setForm({ title:"", title_ar:"", description:"", description_ar:"", teacher_id:"", is_active:true, image_url:"", level:"", color:G });
  };

  const openEdit = (s: any) => {
    setEditId(s.id);
    setForm({ title:s.title, title_ar:s.title_ar||"", description:s.description||"", description_ar:s.description_ar||"",
      teacher_id:s.teacher_id||"", is_active:s.is_active, image_url:s.image_url||"", level:s.level||"", color:s.color||G });
    setImagePreview(s.image_url||null);
    setOpen(true);
  };

  const filtered = subjects.filter(s =>
    s.title.toLowerCase().includes(search.toLowerCase()) || (s.title_ar||"").includes(search)
  );

  const PALETTE = ["#064E3B","#1E40AF","#7C3AED","#DC2626","#D97706","#0F766E","#9D174D","#374151"];

  return (
    <div style={{ minHeight:"100vh", background:"#F8F9FA" }}>
      {/* Header */}
      <div style={{ background:"#fff", borderBottom:"1px solid #E5E7EB", padding:"18px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:40, height:40, borderRadius:12, background:"#ECFDF5", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <BookOpen size={20} color={G}/>
            </div>
            <div>
              <h1 style={{ fontSize:20, fontWeight:800, color:"#111", margin:0 }}>Subject Management</h1>
              <p style={{ fontSize:12, color:"#6B7280", margin:0 }}>{subjects.length} subjects · {subjects.filter(s=>s.is_active).length} active</p>
            </div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>setViewMode(v=>v==="grid"?"list":"grid")}
              style={{ padding:"8px 12px", borderRadius:10, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", gap:6, fontSize:13, fontWeight:600, color:"#374151" }}>
              {viewMode==="grid" ? <List size={14}/> : <LayoutGrid size={14}/>}
            </button>
            <Button onClick={()=>{ setEditId(null); setOpen(true); }}
              style={{ background:G, borderRadius:12, gap:8, fontWeight:700 }}>
              <Plus size={16}/> New Subject
            </Button>
          </div>
        </div>
      </div>

      <div style={{ padding:"20px 16px", maxWidth:1100, margin:"0 auto" }}>
        {/* Stats */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10, marginBottom:18 }}>
          {[
            { v:subjects.length, l:"Total Subjects", icon:"📚", bg:"#EFF6FF", c:"#1D4ED8" },
            { v:subjects.filter(s=>s.is_active).length, l:"Active", icon:"✅", bg:"#F0FDF4", c:"#166534" },
            { v:subjects.reduce((s,sub)=>s+(sub.courseCount||0),0), l:"Total Courses", icon:"📖", bg:"#F5F3FF", c:"#6D28D9" },
            { v:teachers.length, l:"Teachers", icon:"👨‍🏫", bg:"#FFF7ED", c:"#C2410C" },
          ].map((s,i)=>(
            <div key={i} style={{ background:s.bg, borderRadius:12, padding:"12px 14px" }}>
              <div style={{ fontSize:20, marginBottom:4 }}>{s.icon}</div>
              <div style={{ fontSize:22, fontWeight:900, color:s.c }}>{s.v}</div>
              <div style={{ fontSize:11, color:s.c, opacity:.7, fontWeight:600 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ position:"relative", marginBottom:18 }}>
          <Search size={14} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF" }}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search subjects…"
            style={{ width:"100%", padding:"10px 14px 10px 36px", borderRadius:12, border:"1.5px solid #E5E7EB", fontSize:14, outline:"none", background:"#fff", boxSizing:"border-box" as const }}/>
        </div>

        {/* Grid view */}
        {viewMode==="grid" ? (
          isLoading ? (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:14 }}>
              {[1,2,3].map(i=><div key={i} style={{ height:200, background:"#E5E7EB", borderRadius:18, animation:"pulse 1.5s infinite" }}/>)}
            </div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:14 }}>
              {filtered.map(s=>{
                const teacher = teachers.find((tc:any)=>tc.user_id===s.teacher_id);
                return (
                  <div key={s.id} style={{ background:"#fff", borderRadius:18, border:`1.5px solid ${s.is_active?"#E5E7EB":"#FEE2E2"}`, overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,.05)", opacity:s.is_active?1:.75 }}>
                    {/* Header */}
                    <div style={{ height:130, background:s.image_url?`linear-gradient(rgba(0,0,0,.35),rgba(0,0,0,.5)),url(${s.image_url}) center/cover`:`linear-gradient(135deg,${s.color||G},${s.color||G}dd)`, display:"flex", flexDirection:"column", justifyContent:"space-between", padding:"12px 14px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                        <div style={{ width:36, height:36, borderRadius:10, background:"rgba(255,255,255,.2)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <BookOpen size={18} color="#fff"/>
                        </div>
                        <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:20, background:s.is_active?"rgba(34,197,94,.25)":"rgba(239,68,68,.25)", color:"#fff", border:`1px solid ${s.is_active?"rgba(34,197,94,.4)":"rgba(239,68,68,.4)"}` }}>
                          {s.is_active?"Active":"Inactive"}
                        </span>
                      </div>
                      <div>
                        <p style={{ fontWeight:800, fontSize:15, color:"#fff", margin:0 }}>{language==="ar"?s.title_ar||s.title:s.title}</p>
                        {s.title_ar&&language!=="ar"&&<p style={{ fontSize:12, color:"rgba(255,255,255,.7)", margin:"2px 0 0", fontFamily:"'Amiri',serif", direction:"rtl" }}>{s.title_ar}</p>}
                      </div>
                    </div>
                    {/* Body */}
                    <div style={{ padding:"14px 16px" }}>
                      <div style={{ display:"flex", gap:10, marginBottom:12, flexWrap:"wrap" }}>
                        <span style={{ fontSize:11, color:"#6B7280", display:"flex", alignItems:"center", gap:3 }}>
                          <BookMarked size={11}/> {s.courseCount||0} courses
                        </span>
                        {teacher&&<span style={{ fontSize:11, color:"#6B7280", display:"flex", alignItems:"center", gap:3 }}>
                          <Users size={11}/> {(teacher as any).full_name}
                        </span>}
                      </div>
                      {s.description&&<p style={{ fontSize:12, color:"#9CA3AF", margin:"0 0 12px", lineHeight:1.5, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" as const, overflow:"hidden" }}>{s.description}</p>}
                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={()=>openEdit(s)}
                          style={{ flex:1, padding:"7px", borderRadius:9, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:5, fontSize:12, fontWeight:600, color:"#374151" }}>
                          <Edit size={12}/> Edit
                        </button>
                        <button onClick={()=>toggleActive(s.id,s.is_active)}
                          style={{ padding:"7px 10px", borderRadius:9, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer" }}>
                          {s.is_active?<EyeOff size={13} color="#9CA3AF"/>:<Eye size={13} color="#16A34A"/>}
                        </button>
                        <button onClick={()=>navigate(`/admin/subjects/${s.id}`)}
                          style={{ padding:"7px 10px", borderRadius:9, border:`1.5px solid ${G}`, background:G, cursor:"pointer" }}>
                          <ChevronRight size={13} color="#fff"/>
                        </button>
                        <button onClick={()=>deleteSubject(s.id)}
                          style={{ padding:"7px 10px", borderRadius:9, border:"1.5px solid #FECACA", background:"#FEF2F2", cursor:"pointer" }}>
                          <Trash2 size={13} color="#DC2626"/>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!filtered.length&&(
                <div style={{ gridColumn:"1/-1", textAlign:"center", padding:"48px 24px", background:"#fff", borderRadius:16, border:"2px dashed #E5E7EB" }}>
                  <div style={{ fontSize:40, marginBottom:10 }}>📚</div>
                  <p style={{ fontWeight:700, color:"#374151" }}>No subjects yet</p>
                  <p style={{ fontSize:13, color:"#9CA3AF", marginBottom:16 }}>Create your first subject to get started</p>
                  <Button onClick={()=>setOpen(true)} style={{ background:G, borderRadius:10, gap:6 }}><Plus size={14}/> New Subject</Button>
                </div>
              )}
            </div>
          )
        ) : (
          // List view
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {filtered.map(s=>{
              const teacher = teachers.find((tc:any)=>tc.user_id===s.teacher_id);
              return (
                <div key={s.id} style={{ background:"#fff", borderRadius:14, border:"1.5px solid #E5E7EB", padding:"14px 16px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                  <div style={{ width:44, height:44, borderRadius:10, overflow:"hidden", flexShrink:0, background:s.color||G, display:"flex", alignItems:"center", justifyContent:"center" }}>
                    {s.image_url?<img src={s.image_url} style={{ width:"100%", height:"100%", objectFit:"cover" }} alt=""/>:<BookOpen size={20} color="#fff"/>}
                  </div>
                  <div style={{ flex:1, minWidth:150 }}>
                    <p style={{ fontWeight:700, fontSize:14, color:"#111", margin:0 }}>{language==="ar"?s.title_ar||s.title:s.title}</p>
                    <div style={{ display:"flex", gap:8, marginTop:4, flexWrap:"wrap" }}>
                      <span style={{ fontSize:11, color:"#6B7280" }}>📖 {s.courseCount||0} courses</span>
                      {teacher&&<span style={{ fontSize:11, color:"#6B7280" }}>👤 {(teacher as any).full_name}</span>}
                    </div>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, padding:"3px 9px", borderRadius:20, background:s.is_active?"#DCFCE7":"#FEE2E2", color:s.is_active?"#166534":"#991B1B" }}>
                    {s.is_active?"Active":"Inactive"}
                  </span>
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={()=>openEdit(s)} style={{ padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer" }}><Edit size={13} color="#6B7280"/></button>
                    <button onClick={()=>toggleActive(s.id,s.is_active)} style={{ padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer" }}>
                      {s.is_active?<EyeOff size={13} color="#9CA3AF"/>:<Eye size={13} color="#16A34A"/>}
                    </button>
                    <button onClick={()=>deleteSubject(s.id)} style={{ padding:"7px 10px", borderRadius:8, border:"1px solid #FECACA", background:"#FEF2F2", cursor:"pointer" }}><Trash2 size={13} color="#DC2626"/></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Subject Dialog */}
      <Dialog open={open} onOpenChange={v=>{if(!v)closeDialog();}}>
        <DialogContent style={{ maxWidth:540, borderRadius:20, padding:0, maxHeight:"92vh", overflowY:"auto" }}>
          <div style={{ background:G, padding:"18px 20px", borderRadius:"20px 20px 0 0", display:"flex", alignItems:"center", gap:10 }}>
            <BookOpen size={20} color="#fff"/>
            <h2 style={{ fontWeight:800, fontSize:16, color:"#fff", margin:0 }}>{editId?"Edit Subject":"New Subject"}</h2>
          </div>
          <div style={{ padding:20, display:"flex", flexDirection:"column", gap:14 }}>
            {/* Cover image */}
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:8 }}>Cover Image</label>
              <div onClick={()=>fileRef.current?.click()}
                style={{ height:120, borderRadius:14, border:"2px dashed #E5E7EB", background:imagePreview?`url(${imagePreview}) center/cover`:"#FAFAFA", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", position:"relative" }}>
                {uploading&&<div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.4)", display:"flex", alignItems:"center", justifyContent:"center" }}><Loader2 size={24} color="#fff" style={{ animation:"spin .8s linear infinite" }}/></div>}
                {!imagePreview&&<div style={{ textAlign:"center", color:"#9CA3AF" }}><Image size={24} style={{ marginBottom:6 }}/><p style={{ fontSize:12, margin:0 }}>Click to upload</p></div>}
                {imagePreview&&<button onClick={e=>{e.stopPropagation();setImagePreview(null);setForm(f=>({...f,image_url:""}));}} style={{ position:"absolute", top:8, right:8, width:26, height:26, borderRadius:"50%", background:"rgba(0,0,0,.5)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}><X size={13} color="#fff"/></button>}
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleImage}/>
              <Input value={form.image_url} onChange={e=>{setForm(f=>({...f,image_url:e.target.value}));setImagePreview(e.target.value||null);}} placeholder="Or paste image URL…" style={{ marginTop:8, borderRadius:10 }}/>
            </div>
            {/* Color picker */}
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:8 }}>Accent Color</label>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {PALETTE.map(c=>(
                  <button key={c} onClick={()=>setForm(f=>({...f,color:c}))}
                    style={{ width:28, height:28, borderRadius:"50%", background:c, border:`3px solid ${form.color===c?"#111":"transparent"}`, cursor:"pointer", transition:"border .1s" }}/>
                ))}
              </div>
            </div>
            {/* Titles */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div><label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Title (English) *</label><Input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} style={{ borderRadius:10 }}/></div>
              <div><label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>العنوان (عربي)</label><Input dir="rtl" value={form.title_ar} onChange={e=>setForm(f=>({...f,title_ar:e.target.value}))} style={{ borderRadius:10 }}/></div>
            </div>
            <div><label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Description</label><Textarea value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} rows={2} style={{ borderRadius:10 }}/></div>
            <div><label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>الوصف (عربي)</label><Textarea dir="rtl" value={form.description_ar} onChange={e=>setForm(f=>({...f,description_ar:e.target.value}))} rows={2} style={{ borderRadius:10 }}/></div>
            {/* Teacher */}
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#6B7280", display:"block", marginBottom:5 }}>Assign Teacher</label>
              <Select value={form.teacher_id} onValueChange={v=>setForm(f=>({...f,teacher_id:v}))}>
                <SelectTrigger style={{ borderRadius:10 }}><SelectValue placeholder="Select teacher"/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {teachers.map((tc:any)=><SelectItem key={tc.user_id} value={tc.user_id}>{tc.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Active */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", background:"#F9FAFB", borderRadius:12, border:"1px solid #E5E7EB" }}>
              <div><p style={{ fontWeight:700, fontSize:13, color:"#374151", margin:0 }}>Active</p><p style={{ fontSize:11, color:"#9CA3AF", margin:0 }}>Visible to students</p></div>
              <Switch checked={form.is_active} onCheckedChange={v=>setForm(f=>({...f,is_active:v}))}/>
            </div>
            <Button onClick={saveSubject} disabled={!form.title||saving}
              style={{ background:G, borderRadius:12, height:44, gap:8, fontWeight:700, fontSize:14 }}>
              {saving?<><Loader2 size={16} style={{ animation:"spin .8s linear infinite" }}/> Saving…</>:<>{editId?"Save Changes":"Create Subject"}</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
};

export default SubjectManagement;


