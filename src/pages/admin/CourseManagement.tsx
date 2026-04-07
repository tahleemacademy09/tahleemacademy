// src/pages/admin/CourseManagement.tsx
// Hierarchy: Courses → Subjects → [📋 Syllabus | 📁 Materials | ▶️ Lessons]
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import SubjectMaterialsHub from "@/components/classroom/SubjectMaterialsHub";
import {
  Plus, BookOpen, Trash2, Edit2, ChevronRight, ChevronLeft,
  Loader2, EyeOff, Save, Image, Search, Layers, FolderOpen,
  FileText, Video, Music, ExternalLink, Type, FileSpreadsheet,
  Upload, Download, File, Check, Calendar, ChevronDown, ChevronUp, X, AlertCircle,
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
    const url=await uploadImg(fi,"subject-files");
    if(url)setF(c=>({...c,image_url:url}));setUp(false);
  },[]);
  return(
    <div style={{position:"fixed",inset:0,zIndex:50,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:500,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid #E5E7EB",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:"#fff"}}>
          <h2 style={{fontSize:15,fontWeight:800,color:"#111",margin:0}}>{ed?"Edit Course":"New Course"}</h2>
          <button type="button" onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"#9CA3AF"}}>×</button>
        </div>
        <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
          <input ref={ref} type="file" accept="image/*" style={{display:"none"}} onChange={handleFile}/>
          <button type="button" onClick={()=>ref.current?.click()} style={{height:100,borderRadius:12,border:"2px dashed #E5E7EB",background:"#F9FAFB",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,color:"#9CA3AF",fontSize:13}}>
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
          <button type="button" onClick={()=>onSave(f)} disabled={busy||!f.title}
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
    const url=await uploadImg(fi,"subject-images");
    if(url)setF(s=>({...s,image_url:url}));setUp(false);
  },[]);
  return(
    <div style={{position:"fixed",inset:0,zIndex:50,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:500,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid #E5E7EB",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:"#fff"}}>
          <h2 style={{fontSize:15,fontWeight:800,color:"#111",margin:0}}>{ed?"Edit Subject":"New Subject"}</h2>
          <button type="button" onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"#9CA3AF"}}>×</button>
        </div>
        <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
          <input ref={ref} type="file" accept="image/*" style={{display:"none"}} onChange={handleFile}/>
          <button type="button" onClick={()=>ref.current?.click()} style={{height:100,borderRadius:12,border:"2px dashed #E5E7EB",background:"#F9FAFB",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,color:"#9CA3AF",fontSize:13}}>
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
          <button type="button" onClick={()=>onSave(f)} disabled={busy||!f.title}
            style={{padding:"12px",borderRadius:12,border:"none",background:busy||!f.title?"#e5e7eb":`linear-gradient(135deg,${G},${GM})`,color:busy||!f.title?"#9ca3af":"#fff",fontWeight:800,cursor:busy||!f.title?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <Save size={14}/> {busy?"Saving…":ed?"Update Subject":"Create Subject"}
          </button>
        </div>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════
// LESSON MODAL  (virtual lessons: title + description of what to learn)
// ══════════════════════════════════════════════════════════════════════════
const LessonModal=React.memo(({ed,onClose,onSave,busy}:{ed?:any;onClose:()=>void;onSave:(p:any)=>Promise<void>;busy:boolean})=>{
  const [f,setF]=useState({
    title:ed?.title||"",title_ar:ed?.title_ar||"",
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
          <button type="button" onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"#9CA3AF"}}>×</button>
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
          <button type="button" onClick={()=>onSave(f)} disabled={busy||!f.title}
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
          <button type="button" onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"#9CA3AF"}}>×</button>
        </div>
        <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
          <div style={{display:"grid",gridTemplateColumns:"76px 1fr",gap:12}}>
            <Fld label="Week #"><input type="number" value={f.week_number} onChange={e=>setF(s=>({...s,week_number:parseInt(e.target.value)||1}))} style={inp} min={1}/></Fld>
            <Fld label="Title *"><input value={f.title} onChange={e=>setF(s=>({...s,title:e.target.value}))} style={inp} placeholder="e.g. Surah Al-Fatiha (1–7)" autoFocus/></Fld>
          </div>
          <Fld label="Description"><textarea value={f.description} onChange={e=>setF(s=>({...s,description:e.target.value}))} rows={3} style={{...inp,resize:"vertical"}} placeholder="What will students learn this week?"/></Fld>
          <Fld label="Learning Objectives (one per line)">
            <textarea value={f.objectives} onChange={e=>setF(s=>({...s,objectives:e.target.value}))} rows={4} style={{...inp,resize:"vertical",fontFamily:"monospace",fontSize:12}} placeholder={"Listen to each ayah 5 times\nRecite each ayah 10 times\nMemorize by end of week"}/>
          </Fld>
          <button type="button" onClick={()=>onSave(f)} disabled={busy||!f.title}
            style={{padding:"12px",borderRadius:12,border:"none",background:busy||!f.title?"#e5e7eb":`linear-gradient(135deg,${G},${GM})`,color:busy||!f.title?"#9ca3af":"#fff",fontWeight:800,cursor:busy||!f.title?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <Save size={14}/> {busy?"Saving…":ed?"Save Changes":"Add Week"}
          </button>
        </div>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════
// MATERIAL MODAL
// ══════════════════════════════════════════════════════════════════════════
// MATERIAL MODAL — Enhanced with real progress, preview & drag-and-drop
// ══════════════════════════════════════════════════════════════════════════
function autoDetectType(file: File): MatType {
  const t = file.type.toLowerCase(), e = file.name.split(".").pop()?.toLowerCase() || "";
  if (t.includes("pdf") || e === "pdf") return "PDF";
  if (t.includes("video") || ["mp4","webm","mov","m4v","avi"].includes(e)) return "Video";
  if (t.includes("audio") || ["mp3","wav","m4a","aac","ogg","flac"].includes(e)) return "Audio";
  if (t.includes("image") || ["jpg","jpeg","png","gif","webp","svg","avif"].includes(e)) return "Image";
  if (["doc","docx","xls","xlsx","ppt","pptx","odt","ods"].includes(e)) return "Document";
  return "PDF";
}

const TYPE_ACCEPT: Record<MatType,string> = {
  PDF: ".pdf", Video: "video/*,.mp4,.webm,.mov", Audio: "audio/*,.mp3,.wav,.m4a",
  Image: "image/*", Document: ".doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods",
  Link: "", Text: "",
};

const MaterialModal=React.memo(({ed,subjectId,sortOrder,onClose,onSaved}:{ed?:any;subjectId:string;sortOrder:number;onClose:()=>void;onSaved:()=>void})=>{
  const {user}=useAuth();
  const [f,setF]=useState({
    title:       ed?.title||"",
    material_type:(ed?.material_type||"PDF") as MatType,
    file_url:    ed?.file_url||"",
    content:     ed?.content||"",
    is_downloadable: ed?.is_downloadable??true,
    sort_order:  ed?.sort_order??sortOrder,
  });
  const [file,       setFile]       = useState<File|null>(null);
  const [preview,    setPreview]    = useState<string|null>(null); // data-URL for images
  const [pct,        setPct]        = useState(0);          // 0–100
  const [phase,      setPhase]      = useState<"idle"|"uploading"|"saving"|"done"|"error">("idle");
  const [drag,       setDrag]       = useState(false);
  const [dragCount,  setDragCount]  = useState(0);
  const [saveErr,    setSaveErr]    = useState("");
  const fileRef  = useRef<HTMLInputElement>(null);
  const dragRef  = useRef<HTMLDivElement>(null);

  const cfg  = matCfg[f.material_type];
  const Icon = cfg.icon;
  const needFile = f.material_type!=="Link" && f.material_type!=="Text";
  const needUrl  = f.material_type==="Link";
  const needText = f.material_type==="Text";
  const busy = phase==="uploading"||phase==="saving";

  /* ── pick file ───────────────────────────────────────── */
  const pickFile = useCallback((fi: File) => {
    const detected = autoDetectType(fi);
    setFile(fi);
    setF(m => ({ ...m, material_type: detected, title: m.title || fi.name.replace(/\.[^/.]+$/,"") }));
    setSaveErr("");
    // generate image preview
    if (fi.type.startsWith("image/")) {
      const r = new FileReader();
      r.onload = ev => setPreview(ev.target?.result as string);
      r.readAsDataURL(fi);
    } else {
      setPreview(null);
    }
  }, []);

  const clearFile = useCallback(() => {
    setFile(null); setPreview(null); setPct(0); setPhase("idle");
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  /* ── drag & drop ─────────────────────────────────────── */
  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragCount(c => c + 1);
    setDrag(true);
  }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragCount(c => {
      const next = c - 1;
      if (next <= 0) setDrag(false);
      return next;
    });
  }, []);
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
  }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDrag(false); setDragCount(0);
    const fi = e.dataTransfer.files?.[0];
    if (fi) pickFile(fi);
  }, [pickFile]);

  /* ── upload with real XHR progress ──────────────────── */
  const uploadWithProgress = useCallback((path: string, fi: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      const { data: { session } } = { data: { session: null } } as any; // placeholder
      // Use Supabase storage REST endpoint directly for XHR progress
      const SUPABASE_URL = (supabase as any).supabaseUrl as string;
      const SUPABASE_KEY = (supabase as any).supabaseKey as string;

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/subject-files/${path}`);
      xhr.setRequestHeader("Authorization", `Bearer ${SUPABASE_KEY}`);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.setRequestHeader("Cache-Control", "3600");

      xhr.upload.addEventListener("progress", (ev) => {
        if (ev.lengthComputable) setPct(Math.round((ev.loaded / ev.total) * 90));
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) { setPct(95); resolve(); }
        else {
          try { const err = JSON.parse(xhr.responseText); reject(new Error(err.error||err.message||"Upload failed")); }
          catch { reject(new Error(`Upload failed (${xhr.status})`)); }
        }
      });
      xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
      xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));

      const form = new FormData();
      form.append("", fi, fi.name);
      xhr.send(form);
    });
  }, []);

  /* ── save ────────────────────────────────────────────── */
  const doSave = async () => {
    setSaveErr("");
    if (!f.title.trim())                                              { setSaveErr("Title is required."); return; }
    if (needFile && !file && !f.file_url.trim())                     { setSaveErr("Please select a file or paste a URL."); return; }
    if (needUrl  && !f.file_url.trim())                              { setSaveErr("Please enter a URL."); return; }
    if (needText && !f.content.trim())                               { setSaveErr("Content cannot be empty."); return; }

    setPhase("uploading"); setPct(5);

    try {
      let fileUrl = f.file_url.trim(), fileType = "", fileSize = 0;

      if (needFile && file) {
        const ext  = file.name.split(".").pop() || "bin";
        const path = `materials/${subjectId}/${crypto.randomUUID()}.${ext}`;

        // Try XHR-with-progress first, fall back to supabase SDK
        try {
          await uploadWithProgress(path, file);
        } catch {
          // Fallback: SDK upload (no progress bar but reliable)
          setPct(50);
          const { error } = await supabase.storage
            .from("subject-files")
            .upload(path, file, { cacheControl:"3600", upsert:false });
          if (error) throw new Error("Storage: " + error.message);
        }
        fileUrl  = path;
        fileType = file.type;
        fileSize = file.size;
      }

      setPct(97); setPhase("saving");

      const payload: any = {
        subject_id:      subjectId,
        title:           f.title.trim(),
        material_type:   f.material_type,
        file_url:        fileUrl || null,
        content:         needText ? f.content.trim() : null,
        is_downloadable: f.is_downloadable,
        sort_order:      f.sort_order,
        ...(fileType ? { file_type: fileType } : {}),
        ...(fileSize ? { file_size: fileSize } : {}),
      };
      if (!ed?.id && user) payload.uploaded_by = user.id;

      const { error: dbErr } = ed?.id
        ? await supabase.from("subject_materials").update(payload).eq("id", ed.id)
        : await supabase.from("subject_materials").insert(payload);
      if (dbErr) throw new Error("Database: " + dbErr.message);

      setPct(100); setPhase("done");
      toast({ title: "✅ Material saved successfully" });
      setTimeout(() => onSaved(), 600);
    } catch (e: any) {
      setPhase("error"); setPct(0);
      setSaveErr(e.message || "Upload failed.");
      toast({ title: "Upload Error", description: e.message, variant:"destructive" });
    }
  };

  /* ── file icon / preview card ────────────────────────── */
  const FileCard = () => {
    if (!file) return null;
    const isImg = file.type.startsWith("image/");
    return (
      <div style={{ borderRadius:14, overflow:"hidden", border:`2px solid ${cfg.border}`, background:cfg.bg }}>
        {isImg && preview && (
          <img src={preview} alt="preview" style={{ width:"100%", maxHeight:140, objectFit:"cover", display:"block" }} />
        )}
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 16px" }}>
          <div style={{ width:44, height:44, borderRadius:12, background:"#fff", border:`1.5px solid ${cfg.border}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <Icon size={22} color={cfg.text} />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ fontWeight:700, fontSize:13, color:"#111", margin:"0 0 2px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{file.name}</p>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <span style={{ fontSize:11, color:cfg.text, fontWeight:700, background:"#fff", padding:"1px 7px", borderRadius:20, border:`1px solid ${cfg.border}` }}>{f.material_type}</span>
              <span style={{ fontSize:11, color:"#9CA3AF" }}>{fmtSize(file.size)}</span>
            </div>
          </div>
          {!busy && (
            <button type="button" onClick={e=>{ e.stopPropagation(); clearFile(); }}
              style={{ width:30, height:30, borderRadius:8, border:`1px solid ${cfg.border}`, background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <X size={14} color={cfg.text} />
            </button>
          )}
        </div>
      </div>
    );
  };

  /* ── progress bar ────────────────────────────────────── */
  const ProgressBar = () => {
    if (phase==="idle" || phase==="error") return null;
    const label = phase==="saving" ? "Saving to database…" : phase==="done" ? "Done! ✓" : `Uploading… ${pct}%`;
    const barColor = phase==="done" ? "#16A34A" : phase==="saving" ? GOLD : G;
    return (
      <div style={{ padding:"12px 16px", borderRadius:12, background:"#F0FDF4", border:"1px solid #BBF7D0" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8, alignItems:"center" }}>
          <span style={{ fontSize:12, fontWeight:700, color:"#166534" }}>{label}</span>
          <span style={{ fontSize:12, fontWeight:800, color:barColor }}>{pct}%</span>
        </div>
        <div style={{ height:8, background:"#D1FAE5", borderRadius:99, overflow:"hidden" }}>
          <div style={{ height:"100%", borderRadius:99, background:`linear-gradient(90deg,${barColor},${barColor}bb)`, width:`${pct}%`, transition:"width 0.3s ease" }} />
        </div>
        {phase==="uploading" && file && (
          <p style={{ fontSize:11, color:"#6B7280", margin:"6px 0 0" }}>
            {Math.round((pct / 100) * file.size / 1024)} KB / {Math.round(file.size / 1024)} KB
          </p>
        )}
      </div>
    );
  };

  /* ── render ──────────────────────────────────────────── */
  return (
    <>
      <style>{`
        @keyframes mm-fadein{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes mm-spin{to{transform:rotate(360deg)}}
        @keyframes mm-pulse{0%,100%{opacity:1}50%{opacity:.55}}
        .mm-type-btn{transition:all .15s ease;cursor:pointer;}
        .mm-type-btn:hover{transform:translateY(-2px);}
        .mm-drop-zone{transition:all .2s ease;}
        .mm-submit{transition:all .2s ease;}
        .mm-submit:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 8px 28px rgba(6,78,59,.38)!important;}
      `}</style>

      {/* Backdrop */}
      <div
        onClick={e=>{ if(e.target===e.currentTarget && !busy) onClose(); }}
        style={{ position:"fixed", inset:0, zIndex:60, background:"rgba(0,0,0,.55)", display:"flex", alignItems:"flex-end", justifyContent:"center" }}
      >
        {/* Sheet */}
        <div style={{ background:"#fff", borderRadius:"24px 24px 0 0", width:"100%", maxWidth:520, maxHeight:"95vh", overflowY:"auto", animation:"mm-fadein .22s ease" }}
          onClick={e=>e.stopPropagation()}>

          {/* Header */}
          <div style={{ background:`linear-gradient(135deg,${G},${GM})`, padding:"18px 20px", borderRadius:"24px 24px 0 0", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:2 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:"rgba(255,255,255,.15)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <Upload size={20} color="#fff" />
              </div>
              <div>
                <h2 style={{ color:"#fff", fontWeight:800, fontSize:17, margin:0 }}>{ed ? "Edit Material" : "Upload Material"}</h2>
                <p style={{ color:"rgba(255,255,255,.65)", fontSize:12, margin:"2px 0 0" }}>
                  {ed ? "Update this resource" : "Add a file, link or text for students"}
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose} disabled={busy}
              style={{ width:34, height:34, borderRadius:9, border:"1px solid rgba(255,255,255,.25)", background:"rgba(255,255,255,.12)", color:"#fff", cursor:busy?"not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center", opacity:busy?.5:1 }}>
              <X size={16} color="#fff" />
            </button>
          </div>

          <div style={{ padding:"22px 20px 32px", display:"flex", flexDirection:"column", gap:18 }}>

            {/* Error banner */}
            {saveErr && (
              <div style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"13px 15px", borderRadius:12, background:"#FEF2F2", border:"1.5px solid #FECACA" }}>
                <AlertCircle size={16} color="#DC2626" style={{ marginTop:1, flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:13, color:"#B91C1C", margin:0, fontWeight:700 }}>Upload failed</p>
                  <p style={{ fontSize:12, color:"#DC2626", margin:"3px 0 0", opacity:.85 }}>{saveErr}</p>
                </div>
                <button type="button" onClick={()=>setSaveErr("")} style={{ background:"none", border:"none", cursor:"pointer", color:"#9CA3AF" }}><X size={14}/></button>
              </div>
            )}

            {/* Title */}
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:7 }}>
                Title <span style={{ color:"#EF4444" }}>*</span>
              </label>
              <input
                value={f.title}
                onChange={e=>{ setF(m=>({...m,title:e.target.value})); setSaveErr(""); }}
                placeholder="e.g. Week 1 Worksheet"
                autoFocus
                disabled={busy}
                style={{ ...inp, fontSize:14, padding:"12px 14px", borderRadius:12, border:`1.5px solid ${f.title?"#E5E7EB":"#FECACA"}` }}
              />
            </div>

            {/* Type selector */}
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:10 }}>Type</label>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                {MATERIAL_TYPES.map(mt => {
                  const c = matCfg[mt], Ic = c.icon, sel = f.material_type === mt;
                  return (
                    <button type="button" key={mt} className="mm-type-btn"
                      onClick={()=>{ if(!busy) setF(m=>({...m,material_type:mt})); }}
                      style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:7, padding:"12px 4px", borderRadius:14,
                        border:`2px solid ${sel?c.text:"#EBEBEB"}`, background:sel?c.bg:"#FAFAFA",
                        boxShadow:sel?`0 2px 12px ${c.text}22`:"none", opacity:busy?.6:1 }}>
                      <div style={{ width:34, height:34, borderRadius:9, background:sel?c.text:"#E5E7EB", display:"flex", alignItems:"center", justifyContent:"center", transition:"all .15s" }}>
                        <Ic size={16} color={sel?"#fff":"#9CA3AF"} />
                      </div>
                      <span style={{ fontSize:10, fontWeight:sel?700:500, color:sel?c.text:"#9CA3AF" }}>{mt}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* File zone */}
            {needFile && (
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:10 }}>File</label>

                {file ? (
                  <FileCard />
                ) : (
                  /* Drop zone */
                  <div ref={dragRef} className="mm-drop-zone"
                    onClick={()=>{ if(!busy) fileRef.current?.click(); }}
                    onDragEnter={onDragEnter} onDragLeave={onDragLeave}
                    onDragOver={onDragOver}   onDrop={onDrop}
                    style={{
                      padding:"32px 20px", borderRadius:18, textAlign:"center", cursor:busy?"not-allowed":"pointer",
                      border:`2.5px dashed ${drag?G:"#D1D5DB"}`,
                      background:drag?"linear-gradient(135deg,#ECFDF5,#F0FDF4)":"#FAFAFA",
                      boxShadow:drag?`0 0 0 4px ${G}22`:"none",
                      transform:drag?"scale(1.01)":"scale(1)",
                    }}>
                    <input ref={fileRef} type="file" style={{ display:"none" }} accept={TYPE_ACCEPT[f.material_type]||"*/*"}
                      onChange={e=>{ const fi=e.target.files?.[0]; if(fi) pickFile(fi); }} />

                    <div style={{ width:60, height:60, borderRadius:18, margin:"0 auto 16px", background:drag?cfg.bg:"#F3F4F6", border:`2px solid ${drag?cfg.border:"#E5E7EB"}`, display:"flex", alignItems:"center", justifyContent:"center", transition:"all .2s" }}>
                      {drag
                        ? <Icon size={28} color={cfg.text} />
                        : <Upload size={28} color="#9CA3AF" />
                      }
                    </div>
                    <p style={{ fontWeight:800, fontSize:14, color:drag?G:"#374151", margin:"0 0 6px", transition:"color .2s" }}>
                      {drag ? "Drop to upload!" : "Tap to browse or drag file here"}
                    </p>
                    <p style={{ fontSize:12, color:"#9CA3AF", margin:0 }}>
                      {f.material_type==="PDF" && "PDF files"}
                      {f.material_type==="Video" && "MP4 · WebM · MOV · AVI"}
                      {f.material_type==="Audio" && "MP3 · WAV · M4A · AAC · FLAC"}
                      {f.material_type==="Image" && "JPG · PNG · GIF · WebP · SVG"}
                      {f.material_type==="Document" && "Word · Excel · PowerPoint · ODF"}
                    </p>
                  </div>
                )}

                {/* URL fallback */}
                <div style={{ display:"flex", alignItems:"center", gap:10, margin:"14px 0 8px" }}>
                  <div style={{ flex:1, height:1, background:"#E5E7EB" }} />
                  <span style={{ fontSize:11, color:"#9CA3AF", fontWeight:600, whiteSpace:"nowrap" }}>or paste a URL</span>
                  <div style={{ flex:1, height:1, background:"#E5E7EB" }} />
                </div>
                <input value={f.file_url} disabled={busy}
                  onChange={e=>setF(m=>({...m,file_url:e.target.value}))}
                  style={{ ...inp, borderRadius:12, padding:"11px 14px" }} placeholder="https://…" />
              </div>
            )}

            {/* Link URL */}
            {needUrl && (
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:7 }}>
                  URL <span style={{ color:"#EF4444" }}>*</span>
                </label>
                <input value={f.file_url} disabled={busy}
                  onChange={e=>{ setF(m=>({...m,file_url:e.target.value})); setSaveErr(""); }}
                  style={{ ...inp, borderRadius:12, padding:"11px 14px" }} placeholder="https://…" />
              </div>
            )}

            {/* Text content */}
            {needText && (
              <div>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:7 }}>
                  Content <span style={{ color:"#EF4444" }}>*</span>
                </label>
                <textarea value={f.content} disabled={busy} rows={6}
                  onChange={e=>{ setF(m=>({...m,content:e.target.value})); setSaveErr(""); }}
                  style={{ ...inp, borderRadius:12, padding:"11px 14px", resize:"vertical" }}
                  placeholder="Type your text content here…" />
              </div>
            )}

            {/* Progress */}
            <ProgressBar />

            {/* Allow download toggle */}
            <div onClick={()=>{ if(!busy) setF(m=>({...m,is_downloadable:!m.is_downloadable})); }}
              style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 16px", borderRadius:14, cursor:busy?"not-allowed":"pointer",
                background:f.is_downloadable?"#F0FDF4":"#F9FAFB", border:`1.5px solid ${f.is_downloadable?"#A7F3D0":"#E5E7EB"}`, transition:"all .2s" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:38, height:38, borderRadius:10, background:f.is_downloadable?"#D1FAE5":"#F3F4F6", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <Download size={17} color={f.is_downloadable?G:"#9CA3AF"} />
                </div>
                <div>
                  <p style={{ fontWeight:700, fontSize:13, color:"#374151", margin:0 }}>Allow Download</p>
                  <p style={{ fontSize:11, color:"#9CA3AF", margin:"2px 0 0" }}>
                    {f.is_downloadable ? "Students can save this file" : "View only — no download"}
                  </p>
                </div>
              </div>
              {/* Custom pill toggle */}
              <div style={{ width:46, height:26, borderRadius:99, background:f.is_downloadable?G:"#CBD5E1", position:"relative", transition:"background .2s", flexShrink:0 }}>
                <div style={{ width:20, height:20, borderRadius:99, background:"#fff", position:"absolute", top:3, left:f.is_downloadable?23:3, transition:"left .2s", boxShadow:"0 1px 4px rgba(0,0,0,.2)" }} />
              </div>
            </div>

            {/* Submit */}
            <button type="button" className="mm-submit" onClick={doSave} disabled={busy||phase==="done"}
              style={{ width:"100%", padding:"15px", borderRadius:14, border:"none",
                background:busy||phase==="done"?"#E5E7EB":`linear-gradient(135deg,${G},${GM})`,
                color:busy||phase==="done"?"#9CA3AF":"#fff", fontWeight:800, fontSize:15,
                cursor:busy||phase==="done"?"not-allowed":"pointer",
                display:"flex", alignItems:"center", justifyContent:"center", gap:10,
                boxShadow:busy||phase==="done"?"none":"0 4px 18px rgba(6,78,59,.28)" }}>
              {phase==="uploading" && <><Loader2 size={18} style={{ animation:"mm-spin .8s linear infinite" }}/> Uploading {pct}%…</>}
              {phase==="saving"    && <><Loader2 size={18} style={{ animation:"mm-spin .8s linear infinite" }}/> Saving…</>}
              {phase==="done"      && <><Check size={18}/> Saved!</>}
              {phase==="error"     && <><Upload size={18}/> Retry Upload</>}
              {phase==="idle"      && <><Upload size={18}/> {ed ? "Save Changes" : "Upload Material"}</>}
            </button>

          </div>
        </div>
      </div>
    </>
  );
});

// ══════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════
export default function CourseManagement() {
  const qc = useQueryClient();
  const { subjectId: urlSubjectId } = useParams<{ subjectId?: string }>();
  type View = "courses"|"subjects"|"content";

  const [view,       setView]       = useState<View>("courses");
  const [selCourse,  setSelCourse]  = useState<any>(null);
  const [selSubject, setSelSubject] = useState<any>(null);
  const [tab,        setTab]        = useState<ContentTab>("materials");
  const [search,     setSearch]     = useState("");
  const [lvlFilter,  setLvlFilter]  = useState<Level>("all");
  const [sortBy,     setSortBy]     = useState<SortKey>("sort_order");
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());

  // ── Auto-navigate to subject when URL has :subjectId ──────────────────
  useEffect(() => {
    if (!urlSubjectId) return;
    (async () => {
      const { data: subj } = await supabase.from("subjects").select("*").eq("id", urlSubjectId).single();
      if (!subj) return;
      if (subj.course_id) {
        const { data: course } = await supabase.from("courses").select("*").eq("id", subj.course_id).single();
        if (course) setSelCourse(course);
      }
      setSelSubject(subj);
      setView("content");
      setTab("materials");
    })();
  }, [urlSubjectId]);

  // modal state
  const [showCourse,   setShowCourse]   = useState(false);
  const [showSubject,  setShowSubject]  = useState(false);
  const [showLesson,   setShowLesson]   = useState(false);
  const [showSyllabus, setShowSyllabus] = useState(false);
  const [showMaterial, setShowMaterial] = useState(false);
  const [edCourse,   setEdCourse]   = useState<any>(null);
  const [edSubject,  setEdSubject]  = useState<any>(null);
  const [edLesson,   setEdLesson]   = useState<any>(null);
  const [edSyllabus, setEdSyllabus] = useState<any>(null);
  const [edMaterial, setEdMaterial] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────
  const {data:courses=[],isLoading:cLoad}=useQuery({queryKey:["adm-courses"],queryFn:async()=>{const {data}=await supabase.from("courses").select("*").order("sort_order");return data||[];}});
  const {data:subjects=[],isLoading:sLoad}=useQuery({queryKey:["adm-subjects",selCourse?.id],enabled:view!=="courses",queryFn:async()=>{let q=supabase.from("subjects").select("*").order("title");if(selCourse)q=q.eq("course_id",selCourse.id);const {data}=await q;return data||[];}});
  const {data:allSubjects=[]}=useQuery({queryKey:["adm-all-subjects"],queryFn:async()=>{const {data}=await supabase.from("subjects").select("id,title,level,course_id").order("title");return data||[];}});
  const {data:lessons=[],isLoading:lLoad}=useQuery({queryKey:["adm-lessons",selSubject?.id],enabled:!!selSubject,queryFn:async()=>{const {data}=await supabase.from("lessons").select("*").eq("course_id",selSubject?.id||"").order("sort_order");return data||[];}});
  const {data:syllabus=[],isLoading:syllLoad}=useQuery({queryKey:["adm-syllabus",selSubject?.id],enabled:!!selSubject,queryFn:async()=>{const {data}=await supabase.from("subject_syllabus").select("*").eq("subject_id",selSubject!.id).order("week_number");return data||[];}});
  const {data:materials=[],isLoading:matLoad}=useQuery({queryKey:["adm-materials",selSubject?.id],enabled:!!selSubject,queryFn:async()=>{const {data}=await supabase.from("subject_materials").select("*").eq("subject_id",selSubject!.id).order("sort_order").order("created_at",{ascending:false});return data||[];}});
  const {data:teachers=[]}=useQuery({queryKey:["teachers-simple"],queryFn:async()=>{const {data:roles}=await supabase.from("user_roles").select("user_id").in("role",["teacher","admin"]);if(!roles?.length)return[];const {data}=await supabase.from("profiles").select("user_id,full_name").in("user_id",roles.map((r:any)=>r.user_id));return data||[];}});

  // ── CRUD helpers ─────────────────────────────────────────────────────────
  const saveCourse=useCallback(async(p:any)=>{
    setBusy(true);
    try{
      const d={title:p.title,title_ar:p.title_ar||null,description:p.description||null,level:p.level,is_published:p.is_published,image_url:p.image_url||null,sort_order:p.sort_order,updated_at:new Date().toISOString()};
      const {error:courseErr}=edCourse?await supabase.from("courses").update(d).eq("id",edCourse.id):await supabase.from("courses").insert(d);
      if(courseErr) throw courseErr;
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
      const d:any={title:p.title,title_ar:p.title_ar||null,description:p.description||null,level:p.level,is_active:p.is_active,image_url:p.image_url||null,teacher_id:p.teacher_id||null,course_id:selCourse?.id||null,updated_at:new Date().toISOString()};
      const {error:subjErr}=edSubject?await supabase.from("subjects").update(d).eq("id",edSubject.id):await supabase.from("subjects").insert(d);
      if(subjErr) throw subjErr;
      qc.invalidateQueries({queryKey:["adm-subjects"]});qc.invalidateQueries({queryKey:["adm-all-subjects"]});
      setShowSubject(false);setEdSubject(null);toast({title:"✅ Subject saved"});
    }catch(e:any){toast({title:"Error",description:e.message,variant:"destructive"});}
    setBusy(false);
  },[edSubject,selCourse,qc]);

  const delSubject=async(id:string)=>{
    if(!confirm("Delete subject and all its content?")) return;
    await supabase.from("lessons").delete().eq("course_id",id);
    await supabase.from("subjects").delete().eq("id",id);
    qc.invalidateQueries({queryKey:["adm-subjects"]});
    if(selSubject?.id===id){setSelSubject(null);setView("subjects");}
    toast({title:"Subject deleted"});
  };

  const saveLesson=useCallback(async(p:any)=>{
    setBusy(true);
    try{
      const d={title:p.title,title_ar:p.title_ar||null,duration_minutes:p.duration_minutes,sort_order:p.sort_order,course_id:selSubject?.id,is_free:p.is_free};
      const {error:lessonErr}=edLesson?await supabase.from("lessons").update(d).eq("id",edLesson.id):await supabase.from("lessons").insert(d);
      if(lessonErr) throw lessonErr;
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
      const {error:syllErr}=edSyllabus?await supabase.from("subject_syllabus").update(d).eq("id",edSyllabus.id):await supabase.from("subject_syllabus").insert(d);
      if(syllErr) throw syllErr;
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
          <button type="button" onClick={()=>{if(view==="content"){setView("subjects");setSelSubject(null);}else{setView("courses");setSelCourse(null);}}}
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
        <button type="button" onClick={doAdd} style={{display:"flex",alignItems:"center",gap:6,padding:"9px 16px",borderRadius:10,border:"none",background:G,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
          <Plus size={14}/> {addLabel}
        </button>
      </div>

      {/* Content tabs (only in content view) */}
      {view==="content"&&(
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

      {/* Filters (not content view) */}
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
              const lv=lvlCfg[(c.level as Level)||"all"];
              return(
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
                      <button type="button" onClick={()=>{setSelCourse(c);setView("subjects");}} style={{flex:1,padding:"7px",borderRadius:8,border:`1px solid ${G}`,background:G,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                        <Layers size={12}/> Manage
                      </button>
                      <button type="button" onClick={()=>{setEdCourse(c);setShowCourse(true);}} style={{padding:"7px 10px",borderRadius:8,border:"1px solid #E5E7EB",background:"#fff",cursor:"pointer"}}><Edit2 size={13} color={G}/></button>
                      <button type="button" onClick={()=>delCourse(c.id)} style={{padding:"7px 10px",borderRadius:8,border:"1px solid #FEE2E2",background:"#FEF2F2",cursor:"pointer"}}><Trash2 size={13} color="#DC2626"/></button>
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
                        <button type="button" onClick={()=>{setSelSubject(s);setView("content");setTab("syllabus");}}
                          style={{flex:1,padding:"7px",borderRadius:8,border:`1px solid ${G}`,background:G,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                          <ChevronRight size={12}/> Open
                        </button>
                        <button type="button" onClick={()=>{setEdSubject(s);setShowSubject(true);}} style={{padding:"7px 9px",borderRadius:8,border:"1px solid #E5E7EB",background:"#fff",cursor:"pointer"}}><Edit2 size={13} color={G}/></button>
                        <button type="button" onClick={()=>delSubject(s.id)} style={{padding:"7px 9px",borderRadius:8,border:"1px solid #FEE2E2",background:"#FEF2F2",cursor:"pointer"}}><Trash2 size={13} color="#DC2626"/></button>
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

        {/* ═══ CONTENT (Syllabus / Materials / Lessons) ══════ */}
        {view==="content"&&selSubject&&(
          <div style={{maxWidth:720,margin:"0 auto"}}>
            {/* Subject banner */}
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

            {/* ── SYLLABUS ──────────────────────────────────── */}
            {tab==="syllabus"&&(
              <div style={{background:"#fff",borderRadius:16,padding:20}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
                  <div><h3 style={{fontWeight:800,fontSize:15,color:"#111",margin:"0 0 2px"}}>Weekly Syllabus</h3><p style={{fontSize:12,color:"#9CA3AF",margin:0}}>Week-by-week course outline</p></div>
                  <button type="button" onClick={()=>{setEdSyllabus(null);setShowSyllabus(true);}} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:10,border:"none",background:G,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}><Plus size={13}/> Add Week</button>
                </div>
                {syllLoad?<div style={{textAlign:"center",padding:40}}><Loader2 size={24} style={{animation:"spin .8s linear infinite",color:G}}/></div>
                :(syllabus as any[]).length===0?<div style={{textAlign:"center",padding:48,color:"#9CA3AF"}}><Calendar size={44} style={{margin:"0 auto 14px",display:"block",opacity:.3}}/><p style={{fontWeight:600,margin:"0 0 4px"}}>No weeks added yet</p><p style={{fontSize:13,margin:0}}>Build the weekly plan for students</p></div>
                :<div style={{position:"relative",paddingLeft:28}}>
                  <div style={{position:"absolute",left:21,top:22,bottom:22,width:2,background:"linear-gradient(to bottom,#86EFAC,transparent)"}}/>
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>
                    {(syllabus as any[]).map((s,i)=>{
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
                                <button type="button" onClick={()=>{setEdSyllabus(s);setShowSyllabus(true);}} style={{width:28,height:28,borderRadius:8,border:"none",background:`${wc.badge}20`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Edit2 size={12} color={wc.badge}/></button>
                                <button type="button" onClick={()=>delSyllabus(s.id)} style={{width:28,height:28,borderRadius:8,border:"none",background:"#FEF2F2",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Trash2 size={12} color="#DC2626"/></button>
                                {hasD&&<button type="button" onClick={()=>setExpanded(prev=>{const n=new Set(prev);n.has(s.id)?n.delete(s.id):n.add(s.id);return n;})} style={{width:28,height:28,borderRadius:8,border:"none",background:`${wc.badge}20`,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{isEx?<ChevronUp size={13} color={wc.badge}/>:<ChevronDown size={13} color={wc.badge}/>}</button>}
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

            {/* ── MATERIALS ─────────────────────────────────── */}
            {tab==="materials"&&selSubject&&(
              <SubjectMaterialsHub
                subjectId={selSubject.id}
                subjectTitle={selSubject.title}
              />
            )}

            {/* ── LESSONS / SESSIONS ────────────────────────── */}
            {tab==="lessons"&&(
              <div style={{background:"#fff",borderRadius:16,padding:20}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                  <div><h3 style={{fontWeight:800,fontSize:15,color:"#111",margin:"0 0 2px"}}>Live Sessions</h3><p style={{fontSize:12,color:"#9CA3AF",margin:0}}>What students will learn in each session</p></div>
                  <button type="button" onClick={()=>{setEdLesson(null);setShowLesson(true);}} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:10,border:"none",background:G,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer"}}><Plus size={13}/> Add Session</button>
                </div>
                {/* Info banner */}
                <div style={{padding:"10px 14px",borderRadius:12,background:"#F0FDF4",border:"1px solid #86EFAC",fontSize:12,color:"#166534",marginBottom:16,display:"flex",gap:8,alignItems:"flex-start"}}>
                  <span style={{fontSize:16}}>ℹ️</span>
                  <span>All lessons are delivered as live virtual sessions. Each entry below describes what students will learn in that session.</span>
                </div>
                {lLoad?<div style={{textAlign:"center",padding:40}}><Loader2 size={24} style={{animation:"spin .8s linear infinite",color:G}}/></div>
                :(lessons as any[]).length===0?<div style={{textAlign:"center",padding:48,color:"#9CA3AF"}}><BookOpen size={44} style={{margin:"0 auto 14px",display:"block",opacity:.3}}/><p style={{fontWeight:600,margin:"0 0 4px"}}>No sessions yet</p><p style={{fontSize:13,margin:0}}>Describe what each live session will cover</p></div>
                :<div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {(lessons as any[]).map((l:any,i:number)=>(
                    <div key={l.id} style={{background:"#F9FAFB",borderRadius:14,border:"1px solid #E5E7EB",padding:"14px 16px",display:"flex",gap:12}}>
                      <div style={{width:34,height:34,borderRadius:10,background:"#F0FDF4",border:"1.5px solid #86EFAC",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:G,flexShrink:0,marginTop:1}}>{i+1}</div>
                      <div style={{flex:1,minWidth:0}}>
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
                        <button type="button" onClick={()=>{setEdLesson(l);setShowLesson(true);}} style={{width:30,height:30,borderRadius:8,border:"1px solid #E5E7EB",background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Edit2 size={12} color={G}/></button>
                        <button type="button" onClick={()=>delLesson(l.id)} style={{width:30,height:30,borderRadius:8,border:"1px solid #FEE2E2",background:"#FEF2F2",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><Trash2 size={12} color="#DC2626"/></button>
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
