// src/pages/admin/CourseManagement.tsx
// Hierarchy: Courses → Subjects → [📋 Syllabus | 📁 Materials | ▶️ Lessons]
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import {
  Plus, BookOpen, Trash2, Edit2, ChevronRight, ChevronLeft,
  Loader2, EyeOff, Save, Image, Search, Layers, FolderOpen,
  FileText, Video, Music, ExternalLink, Type, FileSpreadsheet,
  Upload, Download, File, Check, Calendar, ChevronDown, ChevronUp, X,
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#C9A84C";
type Level  = "all"|"beginner"|"intermediate"|"advanced";
type MatType = "PDF"|"Video"|"Audio"|"Link"|"Text"|"Image"|"Document";
type SortKey = "sort_order"|"title_asc"|"title_desc"|"level";
type ContentTab = "syllabus"|"materials"|"lessons";

const MATERIAL_TYPES: MatType[] = ["PDF","Video","Audio","Link","Text","Image","Document"];

const lvlCfg: Record<Level,{label:string;bg:string;text:string;border:string}> = {
  all:          {label:"All Levels",   bg:"#F3F4F6",text:"#374151",border:"#D1D5DB"},
  beginner:     {label:"Beginner",     bg:"#F0FDF4",text:"#166534",border:"#86EFAC"},
  intermediate: {label:"Intermediate", bg:"#EFF6FF",text:"#1E40AF",border:"#93C5FD"},
  advanced:     {label:"Advanced",     bg:"#FDF4FF",text:"#6B21A8",border:"#D8B4FE"},
};

const weekPalette = [
  {bg:"#EFF6FF",border:"#BFDBFE",badge:"#1D4ED8"},
  {bg:"#F0FDF4",border:"#BBF7D0",badge:"#15803D"},
  {bg:"#FDF4FF",border:"#E9D5FF",badge:"#7C3AED"},
  {bg:"#FFF7ED",border:"#FED7AA",badge:"#C2410C"},
  {bg:"#FFF1F2",border:"#FECDD3",badge:"#BE123C"},
  {bg:"#F0FDFA",border:"#99F6E4",badge:"#0F766E"},
];

const matCfg: Record<MatType,{icon:React.ElementType;bg:string;text:string;border:string}> = {
  PDF:      {icon:FileText,        bg:"#FEF2F2",text:"#DC2626",border:"#FECACA"},
  Video:    {icon:Video,           bg:"#F0FDF4",text:"#16A34A",border:"#BBF7D0"},
  Audio:    {icon:Music,           bg:"#FDF4FF",text:"#9333EA",border:"#E9D5FF"},
  Link:     {icon:ExternalLink,    bg:"#F0FDFA",text:"#0D9488",border:"#99F6E4"},
  Text:     {icon:Type,            bg:"#FFFBEB",text:"#B45309",border:"#FDE68A"},
  Image:    {icon:Image,           bg:"#EFF6FF",text:"#2563EB",border:"#BFDBFE"},
  Document: {icon:FileSpreadsheet, bg:"#EFF6FF",text:"#1D4ED8",border:"#BFDBFE"},
};
const fmtSize = (b?:number) => !b?"":b<1024?`${b}B`:b<1048576?`${(b/1024).toFixed(0)}KB`:`${(b/1048576).toFixed(1)}MB`;

const inp: React.CSSProperties = {
  width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #E5E7EB",
  fontSize:13,outline:"none",background:"#FAFAFA",boxSizing:"border-box",fontFamily:"inherit",
};

async function resolveImg(url?:string|null):Promise<string|null> {
  if (!url||!url.trim()) return null;
  if (url.startsWith("http")) return url;
  const {data} = supabase.storage.from("subject-images").getPublicUrl(url);
  return data?.publicUrl||null;
}
async function signedUrl(path:string):Promise<string> {
  if (path.startsWith("http")) return path;
  const {data} = await supabase.storage.from("subject-files").createSignedUrl(path,3600);
  return data?.signedUrl||path;
}
async function uploadImg(file:File,bucket:string):Promise<string|null> {
  const ext=file.name.split(".").pop()||"jpg";
  const path=`items/${crypto.randomUUID()}.${ext}`;
  const {error} = await supabase.storage.from(bucket).upload(path,file,{upsert:true,contentType:file.type});
  if (error) return null;
  const {data} = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl||path;
}

// ── Shared UI ─────────────────────────────────────────────────────────────
const Thumb=({url,title,height=120,bg}:{url?:string|null;title:string;height?:number;bg:string})=>{
  const [src,setSrc]=useState<string|null>(null);
  const [err,setErr]=useState(false);
  useEffect(()=>{resolveImg(url).then(setSrc);},[url]);
  if (!src||err) return <div style={{height,background:bg,display:"flex",alignItems:"center",justifyContent:"center"}}><BookOpen size={22} style={{opacity:.3}}/></div>;
  return <img src={src} alt={title} style={{width:"100%",height,objectFit:"cover",display:"block"}} onError={()=>setErr(true)}/>;
};
const Fld=({label,children}:{label:string;children:React.ReactNode})=>(
  <div><label style={{fontSize:11,fontWeight:700,color:"#374151",display:"block",marginBottom:4}}>{label}</label>{children}</div>
);

// ══════════════════════════════════════════════════════════════════════════
// COURSE MODAL
// ══════════════════════════════════════════════════════════════════════════
const CourseModal=React.memo(({ed,onClose,onSave,busy}:{ed?:any;onClose:()=>void;onSave:(p:any)=>Promise<void>;busy:boolean})=>{
  const [f,setF]=useState({title:ed?.title||"",title_ar:ed?.title_ar||"",description:ed?.description||"",level:(ed?.level||"all") as Level,is_published:ed?.is_published??true,image_url:ed?.image_url||"",sort_order:ed?.sort_order||0});
  const [up,setUp]=useState(false);
  const ref=useRef<HTMLInputElement>(null);
  const handleFile=useCallback(async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const fi=e.target.files?.[0];if(!fi)return;setUp(true);
    const url=await uploadImg(fi,"subject-files");    if(url)setF(c=>({...c,image_url:url}));setUp(false);
  },[]);
  return(
    <div style={{position:"fixed",inset:0,zIndex:50,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:500,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid #E5E7EB",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:"#fff"}}>
          <h2 style={{fontSize:15,fontWeight:800,color:"#111",margin:0}}>{ed?"Edit Course":"New Course"}</h2>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"#9CA3AF"}}>×</button>
        </div>
        <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
          <input ref={ref} type="file" accept="image/*" style={{display:"none"}} onChange={handleFile}/>
          <button onClick={()=>ref.current?.click()} style={{height:100,borderRadius:12,border:"2px dashed #E5E7EB",background:"#F9FAFB",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,color:"#9CA3AF",fontSize:13}}>
            {up?<Loader2 size={20} style={{animation:"spin .8s linear infinite"}}/>:f.image_url?<img src={f.image_url} alt="" style={{height:"100%",borderRadius:10}}/>:<><Image size={20}/> Upload thumbnail</>}
          </button>
          <Fld label="Course Title (English)"><input value={f.title} onChange={e=>setF(c=>({...c,title:e.target.value}))} style={inp} placeholder="e.g. Quran Memorisation" autoFocus/></Fld>
          <Fld label="Course Title (Arabic)"><input value={f.title_ar} onChange={e=>setF(c=>({...c,title_ar:e.target.value}))} style={{...inp,direction:"rtl",fontFamily:"'Amiri',serif"}} placeholder="مثال: حفظ القرآن"/></Fld>
          <Fld label="Description"><textarea value={f.description} onChange={e=>setF(c=>({...c,description:e.target.value}))} rows={3} style={{...inp,resize:"vertical"}}/></Fld>
          <Fld label="Level">
            <div style={{display:"flex",gap:6}}>
              {(["all","beginner","intermediate","advanced"] as Level[]).map(lv=>{
                const c=lvlCfg[lv],sel=f.level===lv;
                return <button key={lv} onClick={()=>setF(x=>({...x,level:lv}))} style={{flex:1,padding:"8px 4px",borderRadius:10,border:`2px solid ${sel?c.border:"#E5E7EB"}`,background:sel?c.bg:"#fff",color:c.text,fontWeight:sel?800:500,fontSize:10,cursor:"pointer"}}>{c.label}</button>;
              })}
            </div>
          </Fld>
          <Fld label="Sort Order"><input type="number" value={f.sort_order} onChange={e=>setF(c=>({...c,sort_order:Number(e.target.value)}))} style={inp} min={0}/></Fld>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <input type="checkbox" id="cpub" checked={f.is_published} onChange={e=>setF(c=>({...c,is_published:e.target.checked}))}/>
            <label htmlFor="cpub" style={{fontSize:13,color:"#374151"}}>Published (visible to students)</label>
          </div>
          <button onClick={()=>onSave(f)} disabled={busy||!f.title}
            style={{padding:"12px",borderRadius:12,border:"none",background:busy||!f.title?"#e5e7eb":`linear-gradient(135deg,${G},${GM})`,color:busy||!f.title?"#9ca3af":"#fff",fontWeight:800,cursor:busy||!f.title?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <Save size={14}/> {busy?"Saving…":ed?"Update Course":"Create Course"}
          </button>
        </div>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════
// SUBJECT MODAL
// ══════════════════════════════════════════════════════════════════════════
const SubjectModal=React.memo(({ed,teachers,onClose,onSave,busy}:{ed?:any;teachers:any[];onClose:()=>void;onSave:(p:any)=>Promise<void>;busy:boolean})=>{
  const [f,setF]=useState({title:ed?.title||"",title_ar:ed?.title_ar||"",description:ed?.description||"",level:(ed?.level||"all") as Level,is_active:ed?.is_active??true,image_url:ed?.image_url||"",teacher_id:ed?.teacher_id||""});
  const [up,setUp]=useState(false);
  const ref=useRef<HTMLInputElement>(null);
  const handleFile=useCallback(async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const fi=e.target.files?.[0];if(!fi)return;setUp(true);
    const url=await uploadImg(fi,"subject-images");    if(url)setF(s=>({...s,image_url:url}));setUp(false);
  },[]);
  return(
    <div style={{position:"fixed",inset:0,zIndex:50,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:500,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid #E5E7EB",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:"#fff"}}>
          <h2 style={{fontSize:15,fontWeight:800,color:"#111",margin:0}}>{ed?"Edit Subject":"New Subject"}</h2>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"#9CA3AF"}}>×</button>
        </div>
        <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
          <input ref={ref} type="file" accept="image/*" style={{display:"none"}} onChange={handleFile}/>
          <button onClick={()=>ref.current?.click()} style={{height:100,borderRadius:12,border:"2px dashed #E5E7EB",background:"#F9FAFB",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,color:"#9CA3AF",fontSize:13}}>
            {up?<Loader2 size={20} style={{animation:"spin .8s linear infinite"}}/>:f.image_url?<img src={f.image_url} alt="" style={{height:"100%",borderRadius:10}}/>:<><Image size={20}/> Upload image</>}
          </button>
          <Fld label="Subject Title (English)"><input value={f.title} onChange={e=>setF(s=>({...s,title:e.target.value}))} style={inp} placeholder="e.g. Tajweed Level 1" autoFocus/></Fld>
          <Fld label="Subject Title (Arabic)"><input value={f.title_ar} onChange={e=>setF(s=>({...s,title_ar:e.target.value}))} style={{...inp,direction:"rtl",fontFamily:"'Amiri',serif"}} placeholder="مثال: التجويد المستوى الأول"/></Fld>
          <Fld label="Description"><textarea value={f.description} onChange={e=>setF(s=>({...s,description:e.target.value}))} rows={3} style={{...inp,resize:"vertical"}}/></Fld>
          <Fld label="Level">
            <div style={{display:"flex",gap:6}}>
              {(["all","beginner","intermediate","advanced"] as Level[]).map(lv=>{
                const c=lvlCfg[lv],sel=f.level===lv;
                return <button key={lv} onClick={()=>setF(s=>({...s,level:lv}))} style={{flex:1,padding:"8px 4px",borderRadius:10,border:`2px solid ${sel?c.border:"#E5E7EB"}`,background:sel?c.bg:"#fff",color:c.text,fontWeight:sel?800:500,fontSize:10,cursor:"pointer"}}>{c.label}</button>;
              })}
            </div>
          </Fld>
          <Fld label="Assign Teacher">
            <select value={f.teacher_id} onChange={e=>setF(s=>({...s,teacher_id:e.target.value}))} style={inp}>
              <option value="">— No teacher assigned —</option>
              {teachers.map((t:any)=><option key={t.user_id} value={t.user_id}>{t.full_name}</option>)}
            </select>
          </Fld>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <input type="checkbox" id="sact" checked={f.is_active} onChange={e=>setF(s=>({...s,is_active:e.target.checked}))}/>
            <label htmlFor="sact" style={{fontSize:13,color:"#374151"}}>Active (visible to students)</label>
          </div>
          <button onClick={()=>onSave(f)} disabled={busy||!f.title}
            style={{padding:"12px",borderRadius:12,border:"none",background:busy||!f.title?"#e5e7eb":`linear-gradient(135deg,${G},${GM})`,color:busy||!f.title?"#9ca3af":"#fff",fontWeight:800,cursor:busy||!f.title?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <Save size={14}/> {busy?"Saving…":ed?"Update Subject":"Create Subject"}
          </button>
        </div>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════
// LESSON MODAL
// ══════════════════════════════════════════════════════════════════════════
const LessonModal=React.memo(({ed,onClose,onSave,busy}:{ed?:any;onClose:()=>void;onSave:(p:any)=>Promise<void>;busy:boolean})=>{
  const [f,setF]=useState({    title:ed?.title||"",title_ar:ed?.title_ar||"",
    content:ed?.content||"",
    duration_minutes:ed?.duration_minutes||0,
    sort_order:ed?.sort_order||0,
    is_free:ed?.is_free||false,
  });
  return(
    <div style={{position:"fixed",inset:0,zIndex:50,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid #E5E7EB",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:"#fff"}}>
          <h2 style={{fontSize:15,fontWeight:800,color:"#111",margin:0}}>{ed?"Edit Lesson":"New Lesson"}</h2>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"#9CA3AF"}}>×</button>
        </div>
        <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
          <div style={{padding:"10px 14px",borderRadius:12,background:"#F0FDF4",border:"1px solid #86EFAC",fontSize:12,color:"#166534"}}>
            ℹ️ Lessons are live virtual sessions — describe what students will learn or cover in this session.
          </div>
          <Fld label="Session Title"><input value={f.title} onChange={e=>setF(l=>({...l,title:e.target.value}))} style={inp} placeholder="e.g. Introduction to Makharij" autoFocus/></Fld>
          <Fld label="Session Title (Arabic)"><input value={f.title_ar} onChange={e=>setF(l=>({...l,title_ar:e.target.value}))} style={{...inp,direction:"rtl",fontFamily:"'Amiri',serif"}} placeholder="مثال: مقدمة في المخارج"/></Fld>
          <Fld label="What students will learn / Session outline">
            <textarea value={f.content} onChange={e=>setF(l=>({...l,content:e.target.value}))} rows={5}
              style={{...inp,resize:"vertical"}} placeholder={"• Rules of Noon Sakinah\n• Practice recitation of Ayat 1–7\n• Q&A session"}/>
          </Fld>
          <Fld label="Estimated Duration (minutes)"><input type="number" value={f.duration_minutes} onChange={e=>setF(l=>({...l,duration_minutes:Number(e.target.value)}))} style={inp} min={0}/></Fld>
          <Fld label="Sort Order"><input type="number" value={f.sort_order} onChange={e=>setF(l=>({...l,sort_order:Number(e.target.value)}))} style={inp} min={0}/></Fld>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <input type="checkbox" id="lfree" checked={f.is_free} onChange={e=>setF(l=>({...l,is_free:e.target.checked}))}/>
            <label htmlFor="lfree" style={{fontSize:13,color:"#374151"}}>Free preview (visible without enrolment)</label>
          </div>
          <button onClick={()=>onSave(f)} disabled={busy||!f.title}
            style={{padding:"12px",borderRadius:12,border:"none",background:busy||!f.title?"#e5e7eb":`linear-gradient(135deg,${G},${GM})`,color:busy||!f.title?"#9ca3af":"#fff",fontWeight:800,cursor:busy||!f.title?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <Save size={14}/> {busy?"Saving…":ed?"Update Lesson":"Add Lesson"}
          </button>
        </div>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════
// SYLLABUS MODAL
// ══════════════════════════════════════════════════════════════════════════
const SyllabusModal=React.memo(({ed,nextWeek,onClose,onSave,busy}:{ed?:any;nextWeek:number;onClose:()=>void;onSave:(p:any)=>Promise<void>;busy:boolean})=>{
  const [f,setF]=useState({week_number:ed?.week_number||nextWeek,title:ed?.title||"",description:ed?.description||"",objectives:ed?.objectives?(ed.objectives as string[]).join("\n"):""});
  return(
    <div style={{position:"fixed",inset:0,zIndex:60,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid #E5E7EB",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:"#fff"}}>
          <h2 style={{fontSize:15,fontWeight:800,color:"#111",margin:0,display:"flex",alignItems:"center",gap:8}}><Calendar size={16} color={G}/> {ed?"Edit Week":"Add Week"}</h2>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"#9CA3AF"}}>×</button>        </div>
        <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
          <div style={{display:"grid",gridTemplateColumns:"76px 1fr",gap:12}}>
            <Fld label="Week #"><input type="number" value={f.week_number} onChange={e=>setF(s=>({...s,week_number:parseInt(e.target.value)||1}))} style={inp} min={1}/></Fld>
            <Fld label="Title *"><input value={f.title} onChange={e=>setF(s=>({...s,title:e.target.value}))} style={inp} placeholder="e.g. Surah Al-Fatiha (1–7)" autoFocus/></Fld>
          </div>
          <Fld label="Description"><textarea value={f.description} onChange={e=>setF(s=>({...s,description:e.target.value}))} rows={3} style={{...inp,resize:"vertical"}} placeholder="What will students learn this week?"/></Fld>
          <Fld label="Learning Objectives (one per line)">
            <textarea value={f.objectives} onChange={e=>setF(s=>({...s,objectives:e.target.value}))} rows={4} style={{...inp,resize:"vertical",fontFamily:"monospace",fontSize:12}} placeholder={"Listen to each ayah 5 times\nRecite each ayah 10 times\nMemorize by end of week"}/>
          </Fld>
          <button onClick={()=>onSave(f)} disabled={busy||!f.title}
            style={{padding:"12px",borderRadius:12,border:"none",background:busy||!f.title?"#e5e7eb":`linear-gradient(135deg,${G},${GM})`,color:busy||!f.title?"#9ca3af":"#fff",fontWeight:800,cursor:busy||!f.title?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <Save size={14}/> {busy?"Saving…":ed?"Save Changes":"Add Week"}
          </button>
        </div>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════
// MATERIAL MODAL - BUILD-SAFE VERSION
// ══════════════════════════════════════════════════════════════════════════
const MaterialModal = React.memo(({ ed, subjectId, sortOrder, onClose, onSaved }: {
  ed?: any;
  subjectId: string;
  sortOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [f, setF] = useState({
    title: ed?.title || "",
    material_type: (ed?.material_type || "PDF") as MatType,
    file_url: ed?.file_url || "",
    content: ed?.content || "",
    is_downloadable: ed?.is_downloadable ?? true,
    sort_order: ed?.sort_order ?? sortOrder
  });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const getFileName = (fullName: string): string => {
    const lastDot = fullName.lastIndexOf(".");
    return lastDot > 0 ? fullName.substring(0, lastDot) : fullName;
  };

  const handleFileSelect = (selectedFile: File | null) => {
    if (!selectedFile) return;    setFile(selectedFile);
    if (!f.title) {
      const name = getFileName(selectedFile.name);
      setF((prev: any) => {
        const updated = { ...prev };
        updated.title = name;
        return updated;
      });
    }
  };

  const doSave = async () => {
    if (!f.title) {
      toast({ title: "Error", description: "Please enter a title", variant: "destructive" });
      return;
    }
    
    setUploading(true);
    try {
      let fileUrl = f.file_url;
      let fileType = "";
      let fileSize = 0;
      
      if (file) {
        const ext = file.name.split(".").pop() || "bin";
        const path = `materials/${subjectId}/${crypto.randomUUID()}.${ext}`;
        
        const { error: uploadError } = await supabase.storage
          .from("subject-files")
          .upload(path, file, { upsert: true, contentType: file.type });
          
        if (uploadError) {
          console.error("Upload error:", uploadError);
          throw new Error(`Failed to upload file: ${uploadError.message}`);
        }
        
        fileUrl = path;
        fileType = file.type;
        fileSize = file.size;
      }
      
      const payload: any = {
        subject_id: subjectId,
        title: f.title,
        material_type: f.material_type,
        file_url: fileUrl || null,
        content: f.content || null,
        is_downloadable: f.is_downloadable,
        sort_order: f.sort_order,
        ...(fileType ? { file_type: fileType } : {}),        ...(fileSize ? { file_size: fileSize } : {}),
      };
      
      let saveError;
      if (ed?.id) {
        const { error } = await supabase
          .from("subject_materials")
          .update(payload)
          .eq("id", ed.id);
        saveError = error;
      } else {
        const { error } = await supabase
          .from("subject_materials")
          .insert(payload);
        saveError = error;
      }
      
      if (saveError) {
        console.error("Save error:", saveError);
        throw new Error(`Failed to save material: ${saveError.message}`);
      }
      
      toast({ title: "✅ Material saved successfully" });
      onSaved();
      onClose();
    } catch (e: any) {
      console.error("Error in doSave:", e);
      toast({
        title: "❌ Error",
        description: e.message || "Failed to save material",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E5E7EB", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff" }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: "#111", margin: 0, display: "flex", alignItems: "center", gap: 8 }}><Upload size={15} color={G} /> {ed ? "Edit Material" : "Upload Material"}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9CA3AF" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <Fld label="Title *"><input value={f.title} onChange={e => setF(m => ({ ...m, title: e.target.value }))} style={inp} placeholder="e.g. Week 1 Worksheet" autoFocus /></Fld>
          
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8 }}>Type</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>              {MATERIAL_TYPES.map(mt => {
                const c = matCfg[mt], Icon = c.icon, sel = f.material_type === mt;
                return (
                  <button key={mt} onClick={() => setF(m => ({ ...m, material_type: mt }))}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "10px 4px", borderRadius: 12, border: `2px solid ${sel ? c.text : "#E5E7EB"}`, background: sel ? c.bg : "#fff", color: sel ? c.text : "#6B7280", fontSize: 10, fontWeight: sel ? 700 : 500, cursor: "pointer" }}>
                    <Icon size={15} />{mt}
                  </button>
                );
              })}
            </div>
          </div>
          
          {f.material_type !== "Link" && f.material_type !== "Text" && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8 }}>File Upload</label>
              <div 
                style={{ border: `2px dashed ${drag ? G : "#D1D5DB"}`, borderRadius: 16, padding: 20, textAlign: "center", cursor: "pointer", background: drag ? "#F0FDF4" : "#FAFAFA" }}
                onClick={() => ref.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  const fi = e.dataTransfer.files?.[0] || null;
                  handleFileSelect(fi);
                }}
              >
                <input 
                  ref={ref} 
                  type="file" 
                  style={{ display: "none" }} 
                  accept="*/*"
                  onChange={(e) => {
                    const fi = e.target.files?.[0] || null;
                    handleFileSelect(fi);
                  }} 
                />
                {file ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: "#D1FAE5", display: "flex", alignItems: "center", justifyContent: "center" }}><Check size={18} color="#16A34A" /></div>
                    <div style={{ textAlign: "left" }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#374151", margin: 0 }}>{file.name}</p>
                      <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{fmtSize(file.size)}</p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setFile(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF" }}><X size={15} /></button>
                  </div>
                ) : (
                  <>
                    <Upload size={26} style={{ color: "#D1D5DB", margin: "0 auto 8px", display: "block" }} />
                    <p style={{ fontSize: 13, color: "#6B7280", fontWeight: 500, margin: "0 0 4px" }}>Drop file here or tap to browse</p>                    <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>PDF, Word, Images, Audio, Video — all formats</p>
                  </>
                )}
              </div>
              {f.file_url && !file && (
                <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "#F0FDF4", border: "1px solid #86EFAC", fontSize: 11, color: "#166534", display: "flex", alignItems: "center", gap: 6 }}>
                  <Check size={14} /> Current file: {f.file_url.split("/").pop()}
                </div>
              )}
              <p style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", margin: "8px 0 0" }}>— or paste a URL —</p>
              <input value={f.file_url} onChange={e => setF(m => ({ ...m, file_url: e.target.value }))} style={{ ...inp, marginTop: 6 }} placeholder="https://…" />
            </div>
          )}
          
          {f.material_type === "Link" && <Fld label="URL *"><input value={f.file_url} onChange={e => setF(m => ({ ...m, file_url: e.target.value }))} style={inp} placeholder="https://…" /></Fld>}
          {f.material_type === "Text" && <Fld label="Content"><textarea value={f.content} onChange={e => setF(m => ({ ...m, content: e.target.value }))} rows={5} style={{ ...inp, resize: "vertical" }} /></Fld>}
          
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: 12, background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
            <div><p style={{ fontSize: 13, fontWeight: 600, color: "#374151", margin: 0 }}>Allow Download</p><p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>Students can save this file</p></div>
            <Switch checked={f.is_downloadable} onCheckedChange={v => setF(m => ({ ...m, is_downloadable: v }))} />
          </div>
          
          <button onClick={doSave} disabled={!f.title || uploading}
            style={{ padding: "13px", borderRadius: 12, border: "none", background: !f.title || uploading ? "#e5e7eb" : `linear-gradient(135deg,${G},${GM})`, color: !f.title || uploading ? "#9ca3af" : "#fff", fontWeight: 800, cursor: !f.title || uploading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 14 }}>
            {uploading ? <><Loader2 size={15} style={{ animation: "spin .8s linear infinite" }} /> Uploading…</> : <><Upload size={14} /> {ed ? "Save Changes" : "Upload Material"}</>}
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
  const qc = useQueryClient();
  type View = "courses"|"subjects"|"content";

  const [view,       setView]       = useState<View>("courses");
  const [selCourse,  setSelCourse]  = useState<any>(null);
  const [selSubject, setSelSubject] = useState<any>(null);
  const [tab,        setTab]        = useState<ContentTab>("syllabus");
  const [search,     setSearch]     = useState("");
  const [lvlFilter,  setLvlFilter]  = useState<Level>("all");
  const [sortBy,     setSortBy]     = useState<SortKey>("sort_order");
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());

  const [showCourse,   setShowCourse]   = useState(false);
  const [showSubject,  setShowSubject]  = useState(false);  const [showLesson,   setShowLesson]   = useState(false);
  const [showSyllabus, setShowSyllabus] = useState(false);
  const [showMaterial, setShowMaterial] = useState(false);
  const [edCourse,   setEdCourse]   = useState<any>(null);
  const [edSubject,  setEdSubject]  = useState<any>(null);
  const [edLesson,   setEdLesson]   = useState<any>(null);
  const [edSyllabus, setEdSyllabus] = useState<any>(null);
  const [edMaterial, setEdMaterial] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────
  const {courses=[],isLoading:cLoad}=useQuery({queryKey:["adm-courses"],queryFn:async()=>{const {data}=await supabase.from("courses").select("*").order("sort_order");return data||[];}});
  const {subjects=[],isLoading:sLoad}=useQuery({queryKey:["adm-subjects",selCourse?.id],enabled:view!=="courses",queryFn:async()=>{let q=supabase.from("subjects").select("*").order("title");if(selCourse)q=q.eq("course_id",selCourse.id);const {data}=await q;return data||[];}});
  const {allSubjects=[]}=useQuery({queryKey:["adm-all-subjects"],queryFn:async()=>{const {data}=await supabase.from("subjects").select("id,title,level,course_id").order("title");return data||[];}});
  const {lessons=[],isLoading:lLoad}=useQuery({queryKey:["adm-lessons",selSubject?.id],enabled:!!selSubject,queryFn:async()=>{const {data}=await supabase.from("lessons").select("*").eq("subject_id",selSubject?.id||"").order("sort_order");return data||[];}});
  const {syllabus=[],isLoading:syllLoad}=useQuery({queryKey:["adm-syllabus",selSubject?.id],enabled:!!selSubject,queryFn:async()=>{const {data}=await supabase.from("subject_syllabus").select("*").eq("subject_id",selSubject!.id).order("week_number");return data||[];}});
  const {materials=[],isLoading:matLoad}=useQuery({queryKey:["adm-materials",selSubject?.id],enabled:!!selSubject,queryFn:async()=>{const {data}=await supabase.from("subject_materials").select("*").eq("subject_id",selSubject!.id).order("sort_order").order("created_at",{ascending:false});return data||[];}});
  const {teachers=[]}=useQuery({queryKey:["teachers-simple"],queryFn:async()=>{const {roles}=await supabase.from("user_roles").select("user_id").in("role",["teacher","admin"]);if(!roles?.length)return[];const {data}=await supabase.from("profiles").select("user_id,full_name").in("user_id",roles.map((r:any)=>r.user_id));return data||[];}});

  // ── CRUD helpers ─────────────────────────────────────────────────────────
  const saveCourse=useCallback(async(p:any)=>{
    setBusy(true);
    try{
      const d={title:p.title,title_ar:p.title_ar||null,description:p.description||null,level:p.level,is_published:p.is_published,image_url:p.image_url||null,sort_order:p.sort_order,updated_at:new Date().toISOString()};
      edCourse?await supabase.from("courses").update(d).eq("id",edCourse.id):await supabase.from("courses").insert(d);
      qc.invalidateQueries({queryKey:["adm-courses"]});setShowCourse(false);setEdCourse(null);
      toast({title:"✅ Course saved"});
    }catch(e:any){toast({title:"Error",description:e.message,variant:"destructive"});}
    setBusy(false);
  },[edCourse,qc]);

  const delCourse=async(id:string)=>{
    if(!confirm("Delete this course?")) return;
    await supabase.from("courses").delete().eq("id",id);
    qc.invalidateQueries({queryKey:["adm-courses"]});
    if(selCourse?.id===id){setSelCourse(null);setView("courses");}
    toast({title:"Course deleted"});
  };

  const saveSubject=useCallback(async(p:any)=>{
    setBusy(true);
    try{
      const d:any={title:p.title,title_ar:p.title_ar||null,description:p.description||null,level:p.level,is_active:p.is_active,image_url:p.image_url||null,teacher_id:p.teacher_id||null,color:G,course_id:selCourse?.id||null,updated_at:new Date().toISOString()};
      edSubject?await supabase.from("subjects").update(d).eq("id",edSubject.id):await supabase.from("subjects").insert(d);
      qc.invalidateQueries({queryKey:["adm-subjects"]});qc.invalidateQueries({queryKey:["adm-all-subjects"]});
      setShowSubject(false);setEdSubject(null);toast({title:"✅ Subject saved"});
    }catch(e:any){toast({title:"Error",description:e.message,variant:"destructive"});}
    setBusy(false);
  },[edSubject,selCourse,qc]);
  const delSubject=async(id:string)=>{
    if(!confirm("Delete subject and all its content?")) return;
    await supabase.from("lessons").delete().eq("subject_id",id);
    await supabase.from("subjects").delete().eq("id",id);
    qc.invalidateQueries({queryKey:["adm-subjects"]});
    if(selSubject?.id===id){setSelSubject(null);setView("subjects");}
    toast({title:"Subject deleted"});
  };

  const saveLesson=useCallback(async(p:any)=>{
    setBusy(true);
    try{
      const d={title:p.title,title_ar:p.title_ar||null,content:p.content||null,video_url:null,duration_minutes:p.duration_minutes,sort_order:p.sort_order,subject_id:selSubject?.id,is_free:p.is_free,updated_at:new Date().toISOString()};
      edLesson?await supabase.from("lessons").update(d).eq("id",edLesson.id):await supabase.from("lessons").insert(d);
      qc.invalidateQueries({queryKey:["adm-lessons",selSubject?.id]});
      setShowLesson(false);setEdLesson(null);toast({title:"✅ Lesson saved"});
    }catch(e:any){toast({title:"Error",description:e.message,variant:"destructive"});}
    setBusy(false);
  },[edLesson,selSubject,qc]);

  const delLesson=async(id:string)=>{
    if(!confirm("Delete this lesson?")) return;
    await supabase.from("lessons").delete().eq("id",id);
    qc.invalidateQueries({queryKey:["adm-lessons",selSubject?.id]});toast({title:"Lesson deleted"});
  };

  const saveSyllabus=useCallback(async(p:any)=>{
    setBusy(true);
    try{
      const d={subject_id:selSubject!.id,week_number:p.week_number,title:p.title,description:p.description||null,objectives:p.objectives?p.objectives.split("\n").filter(Boolean):null};
      edSyllabus?await supabase.from("subject_syllabus").update(d).eq("id",edSyllabus.id):await supabase.from("subject_syllabus").insert(d);
      qc.invalidateQueries({queryKey:["adm-syllabus",selSubject!.id]});qc.invalidateQueries({queryKey:["syllabus"]});
      setShowSyllabus(false);setEdSyllabus(null);toast({title:"✅ Week saved"});
    }catch(e:any){toast({title:"Error",description:e.message,variant:"destructive"});}
    setBusy(false);
  },[edSyllabus,selSubject,qc]);

  const delSyllabus=async(id:string)=>{
    if(!confirm("Delete this week?")) return;
    await supabase.from("subject_syllabus").delete().eq("id",id);
    qc.invalidateQueries({queryKey:["adm-syllabus",selSubject?.id]});toast({title:"Week deleted"});
  };

  const delMaterial=async(mat:any)=>{
    if(!confirm("Delete this material?")) return;
    if(mat.file_url&&!mat.file_url.startsWith("http")) await supabase.storage.from("subject-files").remove([mat.file_url]);
    await supabase.from("subject_materials").delete().eq("id",mat.id);
    qc.invalidateQueries({queryKey:["adm-materials",selSubject?.id]});toast({title:"Material deleted"});
  };
  // ── Filtering / sorting ───────────────────────────────────────────────────
  const sortList=(list:any[])=>{
    const s=[...list];
    if(sortBy==="title_asc") return s.sort((a,b)=>a.title.localeCompare(b.title));
    if(sortBy==="title_desc") return s.sort((a,b)=>b.title.localeCompare(a.title));
    if(sortBy==="level"){const o:any={beginner:0,intermediate:1,advanced:2,all:3};return s.sort((a,b)=>(o[a.level]||0)-(o[b.level]||0));}
    return s.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  };
  const fCourses  = sortList(courses.filter((c:any)=>(lvlFilter==="all"||c.level===lvlFilter||c.level==="all")&&(!search||c.title.toLowerCase().includes(search.toLowerCase()))));
  const fSubjects = subjects.filter((s:any)=>(lvlFilter==="all"||s.level===lvlFilter||s.level==="all")&&(!search||s.title.toLowerCase().includes(search.toLowerCase())));
  const unlinked  = allSubjects.filter((s:any)=>!s.course_id);

  const addLabel = view==="courses"?"Add Course":view==="subjects"?"Add Subject":tab==="syllabus"?"Add Week":tab==="materials"?"Upload":"Add Lesson";
  const doAdd=()=>{
    if(view==="courses") setShowCourse(true);
    else if(view==="subjects") setShowSubject(true);
    else if(tab==="syllabus"){setEdSyllabus(null);setShowSyllabus(true);}
    else if(tab==="materials"){setEdMaterial(null);setShowMaterial(true);}
    else{setEdLesson(null);setShowLesson(true);}
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:"#F3F4F6",fontFamily:"system-ui,sans-serif"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} .chov:hover{box-shadow:0 4px 14px rgba(0,0,0,.09);transform:translateY(-1px)} .chov{transition:all .18s}`}</style>

      {/* Header */}
      <div style={{background:"#fff",borderBottom:"1px solid #E5E7EB",padding:"14px 16px",display:"flex",alignItems:"center",gap:10}}>
        {view!=="courses"&&(
          <button onClick={()=>{if(view==="content"){setView("subjects");setSelSubject(null);}else{setView("courses");setSelCourse(null);}}}
            style={{width:34,height:34,borderRadius:8,border:"1.5px solid #E5E7EB",background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <ChevronLeft size={16} color="#6B7280"/>
          </button>
        )}
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:"#9CA3AF",flexWrap:"wrap"}}>
            <span style={{cursor:"pointer"}} onClick={()=>{setView("courses");setSelCourse(null);setSelSubject(null);}}>Courses</span>
            {selCourse&&<><ChevronRight size={11}/><span style={{cursor:"pointer",color:view==="subjects"?"#111":"#9CA3AF"}} onClick={()=>{setView("subjects");setSelSubject(null);}}>{selCourse.title}</span></>}
            {selSubject&&<><ChevronRight size={11}/><span style={{color:"#111"}}>{selSubject.title}</span></>}
          </div>
          <h1 style={{fontSize:16,fontWeight:800,color:"#111",margin:0}}>
            {view==="courses"?"Courses":view==="subjects"?`${selCourse?.title} — Subjects`:selSubject?.title}
          </h1>
        </div>
        <button onClick={doAdd} style={{display:"flex",alignItems:"center",gap:6,padding:"9px 16px",borderRadius:10,border:"none",background:G,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
          <Plus size={14}/> {addLabel}
        </button>
      </div>

      {/* Content tabs */}      {view==="content"&&(
        <div style={{background:"#fff",borderBottom:"1px solid #E5E7EB",padding:"0 16px",display:"flex",gap:0}}>
          {([
            {id:"syllabus",label:"📋 Syllabus",count:(syllabus as any[]).length},
            {id:"materials",label:"📁 Materials",count:(materials as any[]).length},
            {id:"lessons",label:"📚 Sessions",count:(lessons as any[]).length},
          ] as {id:ContentTab;label:string;count:number}[]).map(t=>{
            const active=tab===t.id;
            return(
              <button key={t.id} onClick={()=>setTab(t.id)}
                style={{padding:"12px 16px",border:"none",background:"none",cursor:"pointer",fontSize:13,fontWeight:active?800:500,color:active?G:"#6B7280",borderBottom:active?`3px solid ${G}`:"3px solid transparent",display:"flex",alignItems:"center",gap:7}}>
                {t.label}
                {t.count>0&&<span style={{background:active?G:"#E5E7EB",color:active?"#fff":"#374151",borderRadius:20,fontSize:10,fontWeight:700,padding:"1px 6px"}}>{t.count}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Filters */}
      {view!=="content"&&(
        <div style={{background:"#fff",borderBottom:"1px solid #E5E7EB",padding:"10px 16px",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{position:"relative",minWidth:160,flex:1}}>
            <Search size={13} style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",color:"#9CA3AF"}}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{...inp,paddingLeft:28}}/>
          </div>
          {(["all","beginner","intermediate","advanced"] as Level[]).map(lv=>{
            const c=lvlCfg[lv];
            return <button key={lv} onClick={()=>setLvlFilter(lv)} style={{flexShrink:0,padding:"6px 12px",borderRadius:20,border:`1.5px solid ${lvlFilter===lv?c.border:"#E5E7EB"}`,background:lvlFilter===lv?c.bg:"#fff",color:lvlFilter===lv?c.text:"#6B7280",fontSize:11,fontWeight:700,cursor:"pointer"}}>{c.label}</button>;
          })}
          {view==="courses"&&(
            <select value={sortBy} onChange={e=>setSortBy(e.target.value as SortKey)} style={{...inp,width:"auto",minWidth:130,flexShrink:0}}>
              <option value="sort_order">Sort: Manual</option>
              <option value="title_asc">Sort: A → Z</option>
              <option value="title_desc">Sort: Z → A</option>
              <option value="level">Sort: By Level</option>
            </select>
          )}
        </div>
      )}

      <div style={{padding:16,maxWidth:900,margin:"0 auto"}}>

        {/* ═══ COURSES ═══════════════════════════════════════ */}
        {view==="courses"&&(
          cLoad?<div style={{textAlign:"center",padding:40}}><Loader2 size={28} style={{animation:"spin .8s linear infinite",color:G}}/></div>
          :fCourses.length===0?<div style={{textAlign:"center",padding:40,color:"#9CA3AF"}}><FolderOpen size={48} style={{margin:"0 auto 12px",display:"block"}}/><p>No courses yet. Create your first course above.</p></div>
          :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
            {fCourses.map((c:any)=>{
              const lv=lvlCfg[(c.level as Level)||"all"];              return(
                <div key={c.id} className="chov" style={{background:"#fff",borderRadius:16,border:`1px solid ${lv.border}`,overflow:"hidden"}}>
                  <div style={{position:"relative",cursor:"pointer"}} onClick={()=>{setSelCourse(c);setView("subjects");}}>
                    <Thumb url={c.image_url} title={c.title} height={120} bg={lv.bg}/>
                    <div style={{position:"absolute",top:8,right:8,padding:"3px 10px",borderRadius:20,background:lv.bg,color:lv.text,fontSize:10,fontWeight:700,border:`1px solid ${lv.border}`}}>{lv.label}</div>
                    {!c.is_published&&<div style={{position:"absolute",top:8,left:8,padding:"3px 10px",borderRadius:20,background:"#FEF2F2",color:"#DC2626",fontSize:10,fontWeight:700,border:"1px solid #FECACA"}}>Draft</div>}
                  </div>
                  <div style={{padding:14}}>
                    <p style={{fontWeight:800,fontSize:14,color:"#111",margin:"0 0 2px",cursor:"pointer"}} onClick={()=>{setSelCourse(c);setView("subjects");}}>{c.title}</p>
                    {c.title_ar&&<p style={{fontWeight:600,fontSize:12,color:GOLD,margin:"0 0 4px",direction:"rtl",fontFamily:"'Amiri',serif"}}>{c.title_ar}</p>}
                    {c.description&&<p style={{fontSize:12,color:"#9CA3AF",margin:"0 0 10px",lineHeight:1.5}}>{c.description.slice(0,80)}{c.description.length>80?"…":""}</p>}
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>{setSelCourse(c);setView("subjects");}} style={{flex:1,padding:"7px",borderRadius:8,border:`1px solid ${G}`,background:G,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                        <Layers size={12}/> Manage
                      </button>
                      <button onClick={()=>{setEdCourse(c);setShowCourse(true);}} style={{padding:"7px 10px",borderRadius:8,border:"1px solid #E5E7EB",background:"#fff",cursor:"pointer"}}><Edit2 size={13} color={G}/></button>
                      <button onClick={()=>delCourse(c.id)} style={{padding:"7px 10px",borderRadius:8,border:"1px solid #FEE2E2",background:"#FEF2F2",cursor:"pointer"}}><Trash2 size={13} color="#DC2626"/></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ SUBJECTS ══════════════════════════════════════ */}
        {view==="subjects"&&(
          sLoad?<div style={{textAlign:"center",padding:40}}><Loader2 size={28} style={{animation:"spin .8s linear infinite",color:G}}/></div>
          :<>
            {fSubjects.length===0&&<div style={{textAlign:"center",padding:40,color:"#9CA3AF"}}><BookOpen size={48} style={{margin:"0 auto 12px",display:"block"}}/><p>No subjects in this course yet.</p></div>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14,marginBottom:20}}>
              {fSubjects.map((s:any)=>{
                const lv=lvlCfg[(s.level as Level)||"all"];
                return(
                  <div key={s.id} className="chov" style={{background:"#fff",borderRadius:16,border:`1px solid ${lv.border}`,overflow:"hidden"}}>
                    <div style={{position:"relative"}}>
                      <Thumb url={s.image_url} title={s.title} height={100} bg={lv.bg}/>
                      <div style={{position:"absolute",top:8,right:8,padding:"2px 8px",borderRadius:20,background:lv.bg,color:lv.text,fontSize:9,fontWeight:700,border:`1px solid ${lv.border}`}}>{lv.label}</div>
                      {!s.is_active&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.4)",display:"flex",alignItems:"center",justifyContent:"center"}}><EyeOff size={20} color="#fff"/></div>}
                    </div>
                    <div style={{padding:12}}>
                      <p style={{fontWeight:800,fontSize:13,color:"#111",margin:"0 0 2px"}}>{s.title}</p>
                      {s.title_ar&&<p style={{fontWeight:600,fontSize:11,color:GOLD,margin:"0 0 6px",direction:"rtl",fontFamily:"'Amiri',serif"}}>{s.title_ar}</p>}
                      {s.description&&<p style={{fontSize:11,color:"#9CA3AF",margin:"0 0 10px",lineHeight:1.4}}>{s.description.slice(0,60)}{s.description.length>60?"…":""}</p>}
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={()=>{setSelSubject(s);setView("content");setTab("syllabus");}}
                          style={{flex:1,padding:"7px",borderRadius:8,border:`1px solid ${G}`,background:G,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                          <ChevronRight size={12}/> Open
                        </button>
                        <button onClick={()=>{setEdSubject(s);setShowSubject(true);}} style={{padding:"7px 9px",borderRadius:8,border:"1px solid #E5E7EB",background:"#fff",cursor:"pointer"}}><Edit2 size={13} color={G}/></button>                        <button onClick={()=>delSubject(s.id)} style={{padding:"7px 9px",borderRadius:8,border:"1px solid #FEE2E2",background:"#FEF2F2",cursor:"pointer"}}><Trash2 size={13} color="#DC2626"/></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {unlinked.length>0&&(
              <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",padding:16}}>
                <p style={{fontSize:12,fontWeight:700,color:"#374151",margin:"0 0 10px"}}>📎 Link existing unlinked subjects:</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {unlinked.map((s:any)=>(
                    <button key={s.id} onClick={async()=>{await supabase.from("subjects").update({course_id:selCourse?.id} as any).eq("id",s.id);qc.invalidateQueries({queryKey:["adm-subjects"]});qc.invalidateQueries({queryKey:["adm-all-subjects"]});toast({title:"Subject linked"});}}
                      style={{padding:"6px 12px",borderRadius:20,border:"1.5px solid #E5E7EB",background:"#fff",fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5,color:"#374151"}}>
                      <Plus size={11} color={G}/>{s.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══ CONTENT ═══════════════════════════════════════ */}
        {view==="content"&&selSubject&&(
          <div style={{maxWidth:720,margin:"0 auto"}}>
            <div style={{background:"#fff",borderRadius:16,border:`1px solid ${lvlCfg[(selSubject.level as Level)||"all"].border}`,padding:"16px 20px",marginBottom:20,display:"flex",alignItems:"center",gap:14}}>
              {selSubject.image_url&&<img src={selSubject.image_url} alt="" style={{width:52,height:52,borderRadius:12,objectFit:"cover",flexShrink:0}} onError={e=>{(e.target as any).style.display="none";}}/>}
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontWeight:800,fontSize:15,color:"#111",margin:"0 0 2px"}}>{selSubject.title}</p>
                {selSubject.title_ar&&<p style={{fontWeight:600,fontSize:12,color:GOLD,margin:"0 0 3px",direction:"rtl",fontFamily:"'Amiri',serif"}}>{selSubject.title_ar}</p>}
                {selSubject.description&&<p style={{fontSize:12,color:"#9CA3AF",margin:0,lineHeight:1.4}}>{selSubject.description}</p>}
              </div>
              <span style={{flexShrink:0,padding:"4px 12px",borderRadius:20,fontSize:11,fontWeight:700,background:lvlCfg[(selSubject.level as Level)||"all"].bg,color:lvlCfg[(selSubject.level as Level)||"all"].text,border:`1px solid ${lvlCfg[(selSubject.level as Level)||"all"].border}`}}>
                {lvlCfg[(selSubject.level as Level)||"all"].label}
              </span>
            </div>

            {/* SYLLABUS */}
            {tab==="syllabus"&&(
              <div style={{background:"#fff",borderRadius:16,padding:20}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
                  <div><h3 style={{fontWeight:800,fontSize:15,color:"#111",margin:"0 0 2px"}}>Weekly Syllabus</h3><p style={{fontSize:12,color:"#9CA3AF",margin:0}}>Week-by-week course outline</p></div>
                  <button onClick={()=>{setEdSyllabus(null);setShowSyllabus(true);}} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:10,border:"none",background:G,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}><Plus size={13}/> Add Week</button>
                </div>
                {syllLoad?<div style={{textAlign:"center",padding:40}}><Loader2 size={24} style={{animation:"spin .8s linear infinite",color:G}}/></div>
                :(syllabus as any[]).length===0?<div style={{textAlign:"center",padding:48,color:"#9CA3AF"}}><Calendar size={44} style={{margin:"0 auto 14px",display:"block",opacity:.3}}/><p style={{fontWeight:600,margin:"0 0 4px"}}>No weeks added yet</p><p style={{fontSize:13,margin:0}}>Build the weekly plan for students</p></div>
                :<div style={{position:"relative",paddingLeft:28}}>
                  <div style={{position:"absolute",left:21,top:22,bottom:22,width:2,background:"linear-gradient(to bottom,#86EFAC,transparent)"}}/>
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>                    {(syllabus as any[]).map((s,i)=>{
                      const wc=weekPalette[i%weekPalette.length],isEx=expanded.has(s.id),hasD=s.description||(s.objectives&&(s.objectives as string[]).length>0);
                      return(
                        <div key={s.id} style={{display:"flex",gap:12}}>
                          <div style={{position:"relative",zIndex:10,flexShrink:0}}>
                            <div style={{width:42,height:42,borderRadius:"50%",background:wc.badge,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:11}}>W{s.week_number}</div>
                          </div>
                          <div style={{flex:1,borderRadius:16,border:`1.5px solid ${wc.border}`,background:wc.bg,overflow:"hidden"}}>
                            <div style={{display:"flex",alignItems:"center",gap:10,padding:"13px 14px"}}>
                              <div style={{flex:1,cursor:hasD?"pointer":"default"}} onClick={()=>hasD&&setExpanded(prev=>{const n=new Set(prev);n.has(s.id)?n.delete(s.id):n.add(s.id);return n;})}>
                                <p style={{fontWeight:700,fontSize:13,color:wc.badge,margin:0}}>{s.title}</p>
                                {!isEx&&s.description&&<p style={{fontSize:11,color:wc.badge,opacity:.65,margin:"2px 0 0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.description}</p>}
                              </div>
                              <div style={{display:"flex",gap:4,flexShrink:0}}>
                                <button onClick={()=>{setEdSyllabus(s);setShowSyllabus(true);}} style={{width:28,height:28,borderRadius:8,border:"none",background:`${wc.badge}20`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Edit2 size={12} color={wc.badge}/></button>
                                <button onClick={()=>delSyllabus(s.id)} style={{width:28,height:28,borderRadius:8,border:"none",background:"#FEF2F2",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Trash2 size={12} color="#DC2626"/></button>
                                {hasD&&<button onClick={()=>setExpanded(prev=>{const n=new Set(prev);n.has(s.id)?n.delete(s.id):n.add(s.id);return n;})} style={{width:28,height:28,borderRadius:8,border:"none",background:`${wc.badge}20`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{isEx?<ChevronUp size={13} color={wc.badge}/>:<ChevronDown size={13} color={wc.badge}/>}</button>}
                              </div>
                            </div>
                            {isEx&&hasD&&(
                              <div style={{padding:"12px 14px 14px",borderTop:`1px solid ${wc.border}`}}>
                                {s.description&&<p style={{fontSize:13,color:wc.badge,opacity:.85,lineHeight:1.6,margin:"0 0 10px"}}>{s.description}</p>}
                                {s.objectives&&(s.objectives as string[]).length>0&&(
                                  <div>
                                    <p style={{fontSize:10,fontWeight:700,color:wc.badge,textTransform:"uppercase",letterSpacing:".06em",margin:"0 0 8px"}}>Objectives</p>
                                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                                      {(s.objectives as string[]).map((obj:string,j:number)=>(
                                        <div key={j} style={{display:"flex",alignItems:"flex-start",gap:8}}>
                                          <div style={{width:20,height:20,borderRadius:"50%",background:wc.badge,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:10,fontWeight:700,flexShrink:0,marginTop:1}}>{j+1}</div>
                                          <span style={{fontSize:13,color:wc.badge,opacity:.9,lineHeight:1.5}}>{obj}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>}
              </div>
            )}

            {/* MATERIALS */}
            {tab==="materials"&&(
              <div style={{background:"#fff",borderRadius:16,padding:20}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>                  <div><h3 style={{fontWeight:800,fontSize:15,color:"#111",margin:"0 0 2px"}}>Materials & Resources</h3><p style={{fontSize:12,color:"#9CA3AF",margin:0}}>{(materials as any[]).length} files</p></div>
                  <button onClick={()=>{setEdMaterial(null);setShowMaterial(true);}} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:10,border:"none",background:G,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}><Upload size={13}/> Upload</button>
                </div>
                {matLoad?<div style={{textAlign:"center",padding:40}}><Loader2 size={24} style={{animation:"spin .8s linear infinite",color:G}}/></div>
                :(materials as any[]).length===0?<div style={{textAlign:"center",padding:48,color:"#9CA3AF"}}><File size={44} style={{margin:"0 auto 14px",display:"block",opacity:.3}}/><p style={{fontWeight:600,margin:"0 0 4px"}}>No materials yet</p><p style={{fontSize:13,margin:0}}>Upload files and links for students</p></div>
                :<div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {(materials as any[]).map((mat:any)=>{
                    const tp=(mat.material_type||"PDF") as MatType;
                    const c=matCfg[tp]||matCfg["PDF"],Icon=c.icon;
                    return(
                      <div key={mat.id} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",borderRadius:14,border:`1.5px solid ${c.border}`,background:c.bg}}>
                        <div style={{width:44,height:44,borderRadius:12,background:`${c.text}18`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={20} style={{color:c.text}}/></div>
                        <div style={{flex:1,minWidth:0}}>
                          <p style={{fontWeight:700,fontSize:13,color:"#111",margin:"0 0 4px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{mat.title}</p>
                          <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
                            <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,background:`${c.text}18`,color:c.text}}>{tp}</span>
                            {mat.file_size&&<span style={{fontSize:11,color:"#9CA3AF"}}>{fmtSize(mat.file_size)}</span>}
                            {mat.is_downloadable&&<span style={{fontSize:10,color:"#9CA3AF"}}>• Downloadable</span>}
                          </div>
                        </div>
                        <div style={{display:"flex",gap:4,flexShrink:0}}>
                          {mat.file_url&&<button title="Open" onClick={async()=>{const u=await signedUrl(mat.file_url);window.open(u,"_blank");}} style={{width:32,height:32,borderRadius:8,border:"1px solid #E5E7EB",background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><FileText size={13} color="#6B7280"/></button>}
                          {mat.is_downloadable&&mat.file_url&&<button title="Download" onClick={async()=>{const u=await signedUrl(mat.file_url);const a=document.createElement("a");a.href=u;a.download=mat.title;a.click();}} style={{width:32,height:32,borderRadius:8,border:"1px solid #E5E7EB",background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Download size={13} color="#6B7280"/></button>}
                          <button onClick={()=>{setEdMaterial(mat);setShowMaterial(true);}} style={{width:32,height:32,borderRadius:8,border:"1px solid #E5E7EB",background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Edit2 size={13} color={G}/></button>
                          <button onClick={()=>delMaterial(mat)} style={{width:32,height:32,borderRadius:8,border:"1px solid #FEE2E2",background:"#FEF2F2",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Trash2 size={13} color="#DC2626"/></button>
                        </div>
                      </div>
                    );
                  })}
                </div>}
              </div>
            )}

            {/* LESSONS */}
            {tab==="lessons"&&(
              <div style={{background:"#fff",borderRadius:16,padding:20}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                  <div><h3 style={{fontWeight:800,fontSize:15,color:"#111",margin:"0 0 2px"}}>Live Sessions</h3><p style={{fontSize:12,color:"#9CA3AF",margin:0}}>What students will learn in each session</p></div>
                  <button onClick={()=>{setEdLesson(null);setShowLesson(true);}} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:10,border:"none",background:G,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}><Plus size={13}/> Add Session</button>
                </div>
                <div style={{padding:"10px 14px",borderRadius:12,background:"#F0FDF4",border:"1px solid #86EFAC",fontSize:12,color:"#166534",marginBottom:16,display:"flex",gap:8,alignItems:"flex-start"}}>
                  <span style={{fontSize:16}}>ℹ️</span>
                  <span>All lessons are delivered as live virtual sessions. Each entry below describes what students will learn in that session.</span>
                </div>
                {lLoad?<div style={{textAlign:"center",padding:40}}><Loader2 size={24} style={{animation:"spin .8s linear infinite",color:G}}/></div>
                :(lessons as any[]).length===0?<div style={{textAlign:"center",padding:48,color:"#9CA3AF"}}><BookOpen size={44} style={{margin:"0 auto 14px",display:"block",opacity:.3}}/><p style={{fontWeight:600,margin:"0 0 4px"}}>No sessions yet</p><p style={{fontSize:13,margin:0}}>Describe what each live session will cover</p></div>
                :<div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {(lessons as any[]).map((l:any,i:number)=>(
                    <div key={l.id} style={{background:"#F9FAFB",borderRadius:14,border:"1px solid #E5E7EB",padding:"14px 16px",display:"flex",gap:12}}>
                      <div style={{width:34,height:34,borderRadius:10,background:"#F0FDF4",border:"1.5px solid #86EFAC",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:G,flexShrink:0,marginTop:1}}>{i+1}</div>                      <div style={{flex:1,minWidth:0}}>
                        <p style={{fontWeight:700,fontSize:13,color:"#111",margin:"0 0 2px"}}>{l.title}</p>
                        {l.title_ar&&<p style={{fontSize:11,color:GOLD,margin:"0 0 4px",direction:"rtl",fontFamily:"'Amiri',serif"}}>{l.title_ar}</p>}
                        {l.content&&(
                          <div style={{marginTop:6,padding:"8px 10px",borderRadius:10,background:"#fff",border:"1px solid #E5E7EB"}}>
                            {l.content.split("\n").filter(Boolean).map((line:string,j:number)=>(
                              <p key={j} style={{fontSize:12,color:"#374151",margin:"2px 0",display:"flex",alignItems:"flex-start",gap:6}}>
                                <span style={{color:G,fontWeight:700,flexShrink:0}}>•</span>{line.replace(/^•\s*/,"")}
                              </p>
                            ))}
                          </div>
                        )}
                        <div style={{display:"flex",gap:8,fontSize:11,color:"#9CA3AF",marginTop:6,flexWrap:"wrap"}}>
                          {l.duration_minutes>0&&<span>⏱ {l.duration_minutes} min</span>}
                          {l.is_free&&<span style={{color:"#16a34a",fontWeight:700}}>FREE</span>}
                        </div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
                        <button onClick={()=>{setEdLesson(l);setShowLesson(true);}} style={{width:30,height:30,borderRadius:8,border:"1px solid #E5E7EB",background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Edit2 size={12} color={G}/></button>
                        <button onClick={()=>delLesson(l.id)} style={{width:30,height:30,borderRadius:8,border:"1px solid #FEE2E2",background:"#FEF2F2",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Trash2 size={12} color="#DC2626"/></button>
                      </div>
                    </div>
                  ))}
                </div>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCourse&&<CourseModal ed={edCourse} onClose={()=>{setShowCourse(false);setEdCourse(null);}} onSave={saveCourse} busy={busy}/>}
      {showSubject&&<SubjectModal ed={edSubject} teachers={teachers as any[]} onClose={()=>{setShowSubject(false);setEdSubject(null);}} onSave={saveSubject} busy={busy}/>}
      {showLesson&&<LessonModal ed={edLesson} onClose={()=>{setShowLesson(false);setEdLesson(null);}} onSave={saveLesson} busy={busy}/>}
      {showSyllabus&&<SyllabusModal ed={edSyllabus} nextWeek={(syllabus as any[]).length+1} onClose={()=>{setShowSyllabus(false);setEdSyllabus(null);}} onSave={saveSyllabus} busy={busy}/>}
      {showMaterial&&selSubject&&<MaterialModal ed={edMaterial} subjectId={selSubject.id} sortOrder={(materials as any[]).length} onClose={()=>{setShowMaterial(false);setEdMaterial(null);}} onSaved={()=>{setShowMaterial(false);setEdMaterial(null);qc.invalidateQueries({queryKey:["adm-materials",selSubject.id]});}}/>}
    </div>
  );
}