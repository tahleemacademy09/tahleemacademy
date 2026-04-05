// src/pages/student/CourseView.tsx
// Virtual-only: shows Syllabus, Materials, and Session highlights — no video player
import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, BookOpen, FileText, Video, Music, ExternalLink,
  Type, FileSpreadsheet, Download, Calendar, ChevronDown,
  ChevronUp, Clock, Loader2, Image, File,
} from "lucide-react";

const G    = "#064E3B";
const GM   = "#075E54";
const GOLD = "#C9A84C";
const AR   = "'Tajawal','Cairo',sans-serif";

const weekPalette = [
  {bg:"#EFF6FF",border:"#BFDBFE",badge:"#1D4ED8"},
  {bg:"#F0FDF4",border:"#BBF7D0",badge:"#15803D"},
  {bg:"#FDF4FF",border:"#E9D5FF",badge:"#7C3AED"},
  {bg:"#FFF7ED",border:"#FED7AA",badge:"#C2410C"},
  {bg:"#FFF1F2",border:"#FECDD3",badge:"#BE123C"},
  {bg:"#F0FDFA",border:"#99F6E4",badge:"#0F766E"},
];

type MatType = "PDF"|"Video"|"Audio"|"Link"|"Text"|"Image"|"Document";
const matCfg: Record<MatType,{icon:React.ElementType;bg:string;text:string;border:string}> = {
  PDF:      {icon:FileText,        bg:"#FEF2F2",text:"#DC2626",border:"#FECACA"},
  Video:    {icon:Video,           bg:"#F0FDF4",text:"#16A34A",border:"#BBF7D0"},
  Audio:    {icon:Music,           bg:"#FDF4FF",text:"#9333EA",border:"#E9D5FF"},
  Link:     {icon:ExternalLink,    bg:"#F0FDFA",text:"#0D9488",border:"#99F6E4"},
  Text:     {icon:Type,            bg:"#FFFBEB",text:"#B45309",border:"#FDE68A"},
  Image:    {icon:Image,           bg:"#EFF6FF",text:"#2563EB",border:"#BFDBFE"},
  Document: {icon:FileSpreadsheet, bg:"#EFF6FF",text:"#1D4ED8",border:"#BFDBFE"},
};
const fmtSize=(b?:number)=>!b?"":b<1024?`${b}B`:b<1048576?`${(b/1024).toFixed(0)}KB`:`${(b/1048576).toFixed(1)}MB`;

async function openMaterial(fileUrl:string) {
  if (!fileUrl) return;
  if (fileUrl.startsWith("http")) { window.open(fileUrl,"_blank"); return; }
  const {data} = await supabase.storage.from("subject-files").createSignedUrl(fileUrl,3600);
  if (data?.signedUrl) window.open(data.signedUrl,"_blank");
}

const lvlColors: Record<string,string> = {
  beginner:"bg-green-100 text-green-800",
  intermediate:"bg-blue-100 text-blue-800",
  advanced:"bg-purple-100 text-purple-800",
};

type Tab = "syllabus"|"materials"|"sessions";

export default function CourseView() {
  const {courseId} = useParams();
  const {t, language} = useLanguage();
  const {user} = useAuth();
  const [tab, setTab] = useState<Tab>("syllabus");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const {data:course, isLoading:loadCourse} = useQuery({
    queryKey:["course",courseId],
    queryFn:async()=>{
      const {data,error}=await supabase.from("courses").select("*, subjects(id,title,title_ar,description,level,image_url)").eq("id",courseId!).single();
      if(error) throw error; return data;
    },
  });

  // Subject is linked to this course
  const subjectId = (course as any)?.subjects?.id || (course as any)?.subject_id || null;

  const {data:syllabus=[], isLoading:syllLoad} = useQuery({
    queryKey:["student-syllabus",subjectId],
    enabled:!!subjectId,
    queryFn:async()=>{
      const {data}=await supabase.from("subject_syllabus").select("*").eq("subject_id",subjectId!).order("week_number");
      return data||[];
    },
  });

  const {data:materials=[], isLoading:matLoad} = useQuery({
    queryKey:["student-materials",subjectId],
    enabled:!!subjectId,
    queryFn:async()=>{
      const {data}=await supabase.from("subject_materials").select("*").eq("subject_id",subjectId!).order("sort_order").order("created_at",{ascending:false});
      return data||[];
    },
  });

  const {data:sessions=[], isLoading:sessLoad} = useQuery({
    queryKey:["student-sessions",courseId],
    enabled:!!courseId,
    queryFn:async()=>{
      const {data}=await supabase.from("lessons").select("*").eq("course_id",courseId!).order("sort_order");
      return data||[];
    },
  });

  if (loadCourse) return (
    <div className="container mx-auto px-4 py-8 space-y-4">
      <Skeleton className="h-8 w-64"/><Skeleton className="h-48 w-full rounded-2xl"/><Skeleton className="h-64 w-full rounded-2xl"/>
    </div>
  );

  if (!course) return (
    <div className="container mx-auto px-4 py-16 text-center">
      <p className="text-muted-foreground mb-4" style={{fontFamily:AR}}>{language==="ar"?"الدورة غير موجودة":"Course not found"}</p>
      <Link to="/student/courses" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold" style={{background:G}}>
        <ArrowLeft size={14}/> {language==="ar"?"العودة":"Back to Courses"}
      </Link>
    </div>
  );

  const subject = (course as any).subjects;
  const tabDef: {id:Tab;label:string;count:number}[] = [
    {id:"syllabus",  label:language==="ar"?"📋 المنهج":"📋 Syllabus",       count:(syllabus as any[]).length},
    {id:"materials", label:language==="ar"?"📁 المواد":"📁 Materials",       count:(materials as any[]).length},
    {id:"sessions",  label:language==="ar"?"📚 الحصص":"📚 Sessions",         count:(sessions as any[]).length},
  ];

  return (
    <div className="container mx-auto px-4 py-6 space-y-5" style={{maxWidth:740}}>

      {/* Back */}
      <Link to="/student/courses" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14}/> {language==="ar"?"الدورات":"Back to Courses"}
      </Link>

      {/* Hero card */}
      <div style={{background:"#fff",borderRadius:20,border:"1px solid #E5E7EB",overflow:"hidden",boxShadow:"0 2px 12px rgba(0,0,0,.06)"}}>
        {subject?.image_url && (
          <div style={{height:140,overflow:"hidden"}}>
            <img src={subject.image_url} alt={subject.title} style={{width:"100%",height:"100%",objectFit:"cover"}}
              onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>
          </div>
        )}
        <div style={{padding:20}}>
          {language==="ar" ? (
            <>
              {subject?.title_ar && <h1 style={{fontFamily:AR,fontWeight:800,fontSize:20,color:"#111",margin:"0 0 4px",direction:"rtl"}}>{subject.title_ar}</h1>}
              {course.title_ar && <h2 style={{fontFamily:AR,fontWeight:700,fontSize:15,color:GOLD,margin:"0 0 8px",direction:"rtl"}}>{course.title_ar}</h2>}
            </>
          ) : (
            <>
              {course.title && <h1 style={{fontWeight:800,fontSize:20,color:"#111",margin:"0 0 4px"}}>{course.title}</h1>}
              {subject?.title && <h2 style={{fontWeight:600,fontSize:14,color:"#6B7280",margin:"0 0 8px"}}>{subject.title}</h2>}
            </>
          )}
          <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
            {course.level && <span className={`text-xs font-semibold px-3 py-1 rounded-full ${lvlColors[course.level]||"bg-gray-100 text-gray-700"}`}>{course.level}</span>}
            {(syllabus as any[]).length>0 && <span style={{fontSize:12,color:"#9CA3AF"}}>📋 {(syllabus as any[]).length} weeks</span>}
            {(materials as any[]).length>0 && <span style={{fontSize:12,color:"#9CA3AF"}}>📁 {(materials as any[]).length} files</span>}
            {(sessions as any[]).length>0 && <span style={{fontSize:12,color:"#9CA3AF"}}>📚 {(sessions as any[]).length} sessions</span>}
          </div>
          {(course.description||subject?.description) && (
            <p style={{fontSize:13,color:"#6B7280",margin:"10px 0 0",lineHeight:1.6}}>
              {language==="ar" ? (course.description_ar||subject?.description||course.description) : (course.description||subject?.description)}
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{background:"#fff",borderRadius:14,border:"1px solid #E5E7EB",overflow:"hidden"}}>
        <div style={{display:"flex",borderBottom:"1px solid #E5E7EB"}}>
          {tabDef.map(t=>{
            const active=tab===t.id;
            return(
              <button key={t.id} onClick={()=>setTab(t.id)}
                style={{flex:1,padding:"13px 8px",border:"none",background:"none",cursor:"pointer",fontSize:13,fontWeight:active?800:500,color:active?G:"#6B7280",borderBottom:active?`3px solid ${G}`:"3px solid transparent",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                {t.label}
                {t.count>0&&<span style={{background:active?G:"#E5E7EB",color:active?"#fff":"#374151",borderRadius:20,fontSize:10,fontWeight:700,padding:"1px 6px"}}>{t.count}</span>}
              </button>
            );
          })}
        </div>

        <div style={{padding:20}}>

          {/* ── SYLLABUS ── */}
          {tab==="syllabus"&&(
            syllLoad?<div style={{textAlign:"center",padding:32}}><Loader2 size={24} style={{animation:"spin .8s linear infinite",color:G,display:"block",margin:"0 auto"}}/></div>
            :(syllabus as any[]).length===0?(
              <div style={{textAlign:"center",padding:40,color:"#9CA3AF"}}>
                <Calendar size={40} style={{margin:"0 auto 12px",display:"block",opacity:.3}}/>
                <p style={{fontWeight:600,margin:"0 0 4px"}}>{language==="ar"?"لا يوجد منهج بعد":"No syllabus yet"}</p>
                <p style={{fontSize:13,margin:0}}>{language==="ar"?"سيضيف المعلم المنهج قريبًا":"Your teacher will add the weekly plan soon"}</p>
              </div>
            ):(
              <div style={{position:"relative",paddingLeft:26}}>
                <div style={{position:"absolute",left:20,top:22,bottom:22,width:2,background:"linear-gradient(to bottom,#86EFAC,transparent)"}}/>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {(syllabus as any[]).map((s,i)=>{
                    const wc=weekPalette[i%weekPalette.length];
                    const isEx=expanded.has(s.id);
                    const hasD=s.description||(s.objectives&&(s.objectives as string[]).length>0);
                    return(
                      <div key={s.id} style={{display:"flex",gap:12}}>
                        <div style={{position:"relative",zIndex:10,flexShrink:0}}>
                          <div style={{width:40,height:40,borderRadius:"50%",background:wc.badge,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:11}}>W{s.week_number}</div>
                        </div>
                        <div style={{flex:1,borderRadius:14,border:`1.5px solid ${wc.border}`,background:wc.bg,overflow:"hidden"}}>
                          <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",cursor:hasD?"pointer":"default"}}
                            onClick={()=>hasD&&setExpanded(prev=>{const n=new Set(prev);n.has(s.id)?n.delete(s.id):n.add(s.id);return n;})}>
                            <div style={{flex:1}}>
                              <p style={{fontWeight:700,fontSize:13,color:wc.badge,margin:0}}>{s.title}</p>
                              {!isEx&&s.description&&<p style={{fontSize:11,color:wc.badge,opacity:.65,margin:"2px 0 0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.description}</p>}
                            </div>
                            {hasD&&(isEx?<ChevronUp size={14} color={wc.badge}/>:<ChevronDown size={14} color={wc.badge}/>)}
                          </div>
                          {isEx&&hasD&&(
                            <div style={{padding:"10px 14px 14px",borderTop:`1px solid ${wc.border}`}}>
                              {s.description&&<p style={{fontSize:13,color:wc.badge,opacity:.85,lineHeight:1.6,margin:"0 0 10px"}}>{s.description}</p>}
                              {s.objectives&&(s.objectives as string[]).length>0&&(
                                <div>
                                  <p style={{fontSize:10,fontWeight:700,color:wc.badge,textTransform:"uppercase",letterSpacing:".06em",margin:"0 0 8px"}}>
                                    {language==="ar"?"أهداف التعلم":"Learning Objectives"}
                                  </p>
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
              </div>
            )
          )}

          {/* ── MATERIALS ── */}
          {tab==="materials"&&(
            matLoad?<div style={{textAlign:"center",padding:32}}><Loader2 size={24} style={{animation:"spin .8s linear infinite",color:G,display:"block",margin:"0 auto"}}/></div>
            :(materials as any[]).length===0?(
              <div style={{textAlign:"center",padding:40,color:"#9CA3AF"}}>
                <File size={40} style={{margin:"0 auto 12px",display:"block",opacity:.3}}/>
                <p style={{fontWeight:600,margin:"0 0 4px"}}>{language==="ar"?"لا توجد مواد بعد":"No materials yet"}</p>
                <p style={{fontSize:13,margin:0}}>{language==="ar"?"سيرفع المعلم الملفات قريبًا":"Your teacher will upload files soon"}</p>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {(materials as any[]).map((mat:any)=>{
                  const tp=(mat.material_type||"PDF") as MatType;
                  const c=matCfg[tp]||matCfg["PDF"],Icon=c.icon;
                  const canOpen=!!mat.file_url||!!mat.content;
                  return(
                    <div key={mat.id} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",borderRadius:14,border:`1.5px solid ${c.border}`,background:c.bg,cursor:canOpen?"pointer":"default"}}
                      onClick={()=>canOpen&&(mat.content?alert(mat.content):openMaterial(mat.file_url))}>
                      <div style={{width:44,height:44,borderRadius:12,background:`${c.text}18`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={20} style={{color:c.text}}/></div>
                      <div style={{flex:1,minWidth:0}}>
                        <p style={{fontWeight:700,fontSize:13,color:"#111",margin:"0 0 4px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{mat.title}</p>
                        <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
                          <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,background:`${c.text}18`,color:c.text}}>{tp}</span>
                          {mat.file_size&&<span style={{fontSize:11,color:"#9CA3AF"}}>{fmtSize(mat.file_size)}</span>}
                        </div>
                      </div>
                      {canOpen&&(
                        <div style={{display:"flex",gap:6,flexShrink:0}}>
                          <div style={{width:32,height:32,borderRadius:8,background:`${c.text}18`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                            {mat.is_downloadable?<Download size={14} style={{color:c.text}}/>:<ExternalLink size={14} style={{color:c.text}}/>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* ── SESSIONS ── */}
          {tab==="sessions"&&(
            sessLoad?<div style={{textAlign:"center",padding:32}}><Loader2 size={24} style={{animation:"spin .8s linear infinite",color:G,display:"block",margin:"0 auto"}}/></div>
            :(sessions as any[]).length===0?(
              <div style={{textAlign:"center",padding:40,color:"#9CA3AF"}}>
                <BookOpen size={40} style={{margin:"0 auto 12px",display:"block",opacity:.3}}/>
                <p style={{fontWeight:600,margin:"0 0 4px"}}>{language==="ar"?"لا توجد حصص بعد":"No sessions yet"}</p>
                <p style={{fontSize:13,margin:0}}>{language==="ar"?"ستظهر الحصص هنا":"Session details will appear here"}</p>
              </div>
            ):(
              <>
                <div style={{padding:"10px 14px",borderRadius:12,background:"#F0FDF4",border:"1px solid #86EFAC",fontSize:12,color:"#166534",marginBottom:16,display:"flex",gap:8,alignItems:"flex-start"}}>
                  <span style={{fontSize:15}}>📡</span>
                  <span style={{lineHeight:1.5}}>{language==="ar"?"جميع الحصص تُقدَّم مباشرةً عبر الإنترنت. تُعقد الحصص في أوقات محددة مع المعلم.":"All sessions are delivered live online. Join at the scheduled time with your teacher."}</span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {(sessions as any[]).map((l:any,i:number)=>(
                    <div key={l.id} style={{background:"#F9FAFB",borderRadius:14,border:"1px solid #E5E7EB",padding:"14px 16px",display:"flex",gap:12}}>
                      <div style={{width:34,height:34,borderRadius:10,background:"#F0FDF4",border:"1.5px solid #86EFAC",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:G,flexShrink:0,marginTop:2}}>{i+1}</div>
                      <div style={{flex:1,minWidth:0}}>
                        {language==="ar" ? (
                          <>
                            {l.title_ar&&<p style={{fontWeight:700,fontSize:13,color:"#111",margin:"0 0 2px",fontFamily:AR,direction:"rtl"}}>{l.title_ar}</p>}
                            <p style={{fontSize:12,color:"#9CA3AF",margin:"0 0 4px"}}>{l.title}</p>
                          </>
                        ) : (
                          <>
                            <p style={{fontWeight:700,fontSize:13,color:"#111",margin:"0 0 2px"}}>{l.title}</p>
                            {l.title_ar&&<p style={{fontSize:12,color:GOLD,margin:"0 0 4px",direction:"rtl",fontFamily:AR}}>{l.title_ar}</p>}
                          </>
                        )}
                        {/* What you'll learn */}
                        {l.content&&(
                          <div style={{marginTop:8,padding:"10px 12px",borderRadius:10,background:"#fff",border:"1px solid #E5E7EB"}}>
                            <p style={{fontSize:11,fontWeight:700,color:"#374151",margin:"0 0 6px",textTransform:"uppercase",letterSpacing:".05em"}}>
                              {language==="ar"?"ستتعلم في هذه الحصة":"What you'll learn"}
                            </p>
                            {l.content.split("\n").filter(Boolean).map((line:string,j:number)=>(
                              <p key={j} style={{fontSize:12,color:"#374151",margin:"3px 0",display:"flex",alignItems:"flex-start",gap:6}}>
                                <span style={{color:G,fontWeight:700,flexShrink:0,marginTop:1}}>•</span>
                                <span>{line.replace(/^[•\-]\s*/,"")}</span>
                              </p>
                            ))}
                          </div>
                        )}
                        <div style={{display:"flex",gap:10,fontSize:11,color:"#9CA3AF",marginTop:7,flexWrap:"wrap"}}>
                          {l.duration_minutes>0&&<span style={{display:"flex",alignItems:"center",gap:4}}><Clock size={11}/> {l.duration_minutes} {language==="ar"?"د":"min"}</span>}
                          {l.is_free&&<span style={{color:"#16a34a",fontWeight:700}}>{language==="ar"?"مجاني":"FREE"}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )
          )}

        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
