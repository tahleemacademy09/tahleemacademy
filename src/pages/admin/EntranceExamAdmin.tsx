/* src/pages/admin/EntranceExamAdmin.tsx — Enhanced with stats, search, manual grading, bulk level assignment */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  FileText, Users, Settings, Plus, Trash2, Download, Eye,
  BookOpen, RotateCcw, UserCog, Search, ChevronRight,
  CheckCircle, XCircle, Loader2, BarChart2, GraduationCap
} from "lucide-react";

const G = "#064E3B";
const ENTRANCE_EXAM_ID = "36ef6492-2515-44ea-b086-67c9cee02475";
const LEVELS = ["beginner","intermediate","advanced"] as const;

const levelFromScore = (pct: number) => pct >= 70 ? "advanced" : pct >= 40 ? "intermediate" : "beginner";
const levelCfg = {
  beginner:     { bg:"#DCFCE7", text:"#166534", border:"#86EFAC", label:"Beginner / مبتدئ",     dot:"🟢" },
  intermediate: { bg:"#FEF9C3", text:"#854D0E", border:"#FDE68A", label:"Intermediate / متوسط", dot:"🟡" },
  advanced:     { bg:"#FEE2E2", text:"#991B1B", border:"#FECACA", label:"Advanced / متقدم",     dot:"🔴" },
};

const EntranceExamAdmin = () => {
  const { toast } = useToast();
  const { language } = useLanguage();
  const navigate = useNavigate();

  const [questions, setQuestions]     = useState<any[]>([]);
  const [subjects, setSubjects]       = useState<any[]>([]);
  const [levelCourses, setLevelCourses] = useState<any[]>([]);
  const [results, setResults]         = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState<"questions"|"mapping"|"results">("results");
  const [search, setSearch]           = useState("");

  // Subject mapping
  const [selectedLevel, setSelectedLevel]   = useState<typeof LEVELS[number]>("beginner");
  const [selectedSubject, setSelectedSubject] = useState("");

  // Level change dialog
  const [levelDialog, setLevelDialog]       = useState(false);
  const [targetResult, setTargetResult]     = useState<any>(null);
  const [newLevel, setNewLevel]             = useState<string>("beginner");
  const [saving, setSaving]                 = useState(false);

  // Bulk level assignment
  const [bulkDialog, setBulkDialog]         = useState(false);
  const [bulkApplying, setBulkApplying]     = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [qRes, subRes, lcRes, attRes] = await Promise.all([
      supabase.from("exam_questions").select("*").eq("exam_id", ENTRANCE_EXAM_ID).order("sort_order"),
      supabase.from("subjects").select("*").eq("is_active",true).order("title"),
      supabase.from("level_courses" as any).select("*, subjects(title, title_ar)"),
      supabase.from("exam_attempts")
        .select("*, profiles!inner(full_name, full_name_ar, avatar_url, level, email)")
        .eq("exam_id", ENTRANCE_EXAM_ID)
        .neq("status","in_progress")
        .order("submitted_at", { ascending:false }),
    ]);
    setQuestions(qRes.data||[]);
    setSubjects(subRes.data||[]);
    setLevelCourses((lcRes.data as any[])||[]);
    setResults((attRes.data as any[])||[]);
    setLoading(false);
  };

  useEffect(()=>{ loadData(); },[]);

  const addSubjectToLevel = async (level: string, subjectId: string) => {
    const { error } = await supabase.from("level_courses" as any).insert({ level, subject_id:subjectId } as any);
    if (error?.code === "23505") { toast({ title:"Already mapped", variant:"destructive" }); return; }
    if (error) { toast({ title:"Error", description:error.message, variant:"destructive" }); return; }
    toast({ title:"Subject added" });
    loadData();
  };

  const removeMapping = async (id: string) => {
    await supabase.from("level_courses" as any).delete().eq("id", id);
    loadData();
  };

  const resetAttempt = async (r: any) => {
    if (!confirm(`Reset ${r.profiles?.full_name}'s entrance exam? They can retake.`)) return;
    await supabase.from("exam_attempts").delete().eq("id", r.id);
    await supabase.from("profiles").update({ has_taken_entrance_exam:false, allow_entrance_retake:true }).eq("user_id", r.user_id);
    toast({ title:"Entrance exam reset" });
    loadData();
  };

  const changeLevel = async () => {
    if (!targetResult) return;
    setSaving(true);
    await supabase.from("profiles").update({ level:newLevel }).eq("user_id", targetResult.user_id);
    toast({ title:`Level changed to ${newLevel}` });
    setSaving(false); setLevelDialog(false);
    loadData();
  };

  const applyAutoLevel = async () => {
    setBulkApplying(true);
    const toUpdate = results.filter(r => {
      const pct = r.total_points ? Math.round((r.score/r.total_points)*100) : 0;
      return levelFromScore(pct) !== r.profiles?.level;
    });
    for (const r of toUpdate) {
      const pct = r.total_points ? Math.round((r.score/r.total_points)*100) : 0;
      await supabase.from("profiles").update({ level:levelFromScore(pct) }).eq("user_id", r.user_id);
    }
    toast({ title:`✅ Applied auto-level to ${toUpdate.length} students` });
    setBulkApplying(false); setBulkDialog(false);
    loadData();
  };

  const exportCSV = () => {
    const header = "Name,Email,Score,Total,Percentage,Suggested Level,Current Level,Date\n";
    const rows = results.map((r:any)=>{
      const p = r.profiles;
      const pct = r.total_points ? Math.round((r.score/r.total_points)*100) : 0;
      return `"${p?.full_name||""}","${p?.email||""}",${r.score||0},${r.total_points||20},${pct}%,${levelFromScore(pct)},${p?.level||""},${r.submitted_at||""}`;
    }).join("\n");
    const blob = new Blob([header+rows], { type:"text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="entrance-exam-results.csv"; a.click();
  };

  const filtered = results.filter(r=>{
    const name = (r.profiles?.full_name||"").toLowerCase();
    return !search || name.includes(search.toLowerCase());
  });

  const levelCounts = LEVELS.reduce((acc,l)=>({
    ...acc,
    [l]: results.filter(r=>{ const pct=r.total_points?Math.round((r.score/r.total_points)*100):0; return levelFromScore(pct)===l; }).length
  }),{} as Record<string,number>);

  const TABS = [
    { id:"results",  label:`Results (${results.length})`, icon:"👥" },
    { id:"mapping",  label:"Level Mapping",               icon:"🗺️" },
    { id:"questions",label:`Questions (${questions.length})`, icon:"📝" },
  ] as const;

  return (
    <div style={{ minHeight:"100vh", background:"#F8F9FA" }}>
      {/* Header */}
      <div style={{ background:"#fff", borderBottom:"1px solid #E5E7EB", padding:"18px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:40, height:40, borderRadius:12, background:"#FFF7ED", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <GraduationCap size={20} color="#D97706"/>
            </div>
            <div>
              <h1 style={{ fontSize:20, fontWeight:800, color:"#111", margin:0 }}>Entrance Exam</h1>
              <p style={{ fontSize:12, color:"#6B7280", margin:0 }}>{results.length} submissions · {questions.length} questions</p>
            </div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>setBulkDialog(true)}
              style={{ padding:"8px 14px", borderRadius:10, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer", fontSize:13, fontWeight:700, color:"#374151", display:"flex", alignItems:"center", gap:6 }}>
              <UserCog size={13}/> Auto-Assign Levels
            </button>
            <button onClick={exportCSV}
              style={{ padding:"8px 14px", borderRadius:10, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer", fontSize:13, fontWeight:700, color:"#374151", display:"flex", alignItems:"center", gap:6 }}>
              <Download size={13}/> Export CSV
            </button>
            <Button onClick={()=>navigate(`/admin/exams/${ENTRANCE_EXAM_ID}/edit`)}
              style={{ background:G, borderRadius:10, gap:6, fontWeight:700 }}>
              <Settings size={14}/> Edit Exam
            </Button>
          </div>
        </div>
      </div>

      <div style={{ padding:"16px", maxWidth:1000, margin:"0 auto" }}>
        {/* Stats */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:10, marginBottom:16 }}>
          {[
            { v:results.length, l:"Total", icon:"📊", bg:"#EFF6FF", c:"#1D4ED8" },
            ...LEVELS.map(l=>({ v:levelCounts[l]||0, l:l.charAt(0).toUpperCase()+l.slice(1), icon:levelCfg[l].dot, bg:levelCfg[l].bg, c:levelCfg[l].text }))
          ].map((s,i)=>(
            <div key={i} style={{ background:s.bg, borderRadius:12, padding:"12px 14px" }}>
              <div style={{ fontSize:20, marginBottom:4 }}>{s.icon}</div>
              <div style={{ fontSize:22, fontWeight:900, color:s.c }}>{s.v}</div>
              <div style={{ fontSize:11, color:s.c, opacity:.7, fontWeight:600 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:4, marginBottom:14, background:"#fff", borderRadius:12, padding:4, border:"1px solid #E5E7EB", width:"fit-content" }}>
          {TABS.map(tab=>(
            <button key={tab.id} onClick={()=>setActiveTab(tab.id as any)}
              style={{ padding:"8px 16px", borderRadius:9, border:"none", cursor:"pointer", fontWeight:700, fontSize:13,
                background:activeTab===tab.id?G:"transparent", color:activeTab===tab.id?"#fff":"#6B7280" }}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* RESULTS TAB */}
        {activeTab==="results"&&(
          <>
            <div style={{ position:"relative", marginBottom:12 }}>
              <Search size={13} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF" }}/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search students…"
                style={{ width:"100%", padding:"9px 10px 9px 30px", borderRadius:10, border:"1.5px solid #E5E7EB", fontSize:13, outline:"none", boxSizing:"border-box" as const }}/>
            </div>
            {loading?<div style={{ textAlign:"center", padding:40 }}><Loader2 size={28} style={{ animation:"spin .8s linear infinite", color:G }}/></div>:(
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {filtered.map(r=>{
                  const p = r.profiles;
                  const pct = r.total_points ? Math.round((r.score/r.total_points)*100) : 0;
                  const suggested = levelFromScore(pct);
                  const current = p?.level;
                  const mismatch = suggested !== current;
                  return (
                    <div key={r.id} style={{ background:"#fff", borderRadius:14, border:`1.5px solid ${mismatch?"#FDE68A":"#E5E7EB"}`, padding:"13px 16px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                      <div style={{ width:38, height:38, borderRadius:10, background:"#F3F4F6", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        {p?.avatar_url?<img src={p.avatar_url} style={{ width:"100%", height:"100%", objectFit:"cover" }} alt=""/>:<span style={{ fontWeight:800, color:"#374151" }}>{(p?.full_name||"?")[0]}</span>}
                      </div>
                      <div style={{ flex:1, minWidth:120 }}>
                        <p style={{ fontWeight:700, fontSize:14, color:"#111", margin:0 }}>{p?.full_name||"Unknown"}</p>
                        <div style={{ display:"flex", gap:6, marginTop:4, flexWrap:"wrap" }}>
                          <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:levelCfg[suggested as keyof typeof levelCfg]?.bg||"#F3F4F6", color:levelCfg[suggested as keyof typeof levelCfg]?.text||"#374151", fontWeight:700 }}>
                            Suggested: {suggested}
                          </span>
                          {current&&<span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:"#F3F4F6", color:"#6B7280", fontWeight:600 }}>
                            Current: {current}
                          </span>}
                          {mismatch&&<span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:"#FEF9C3", color:"#854D0E", fontWeight:700 }}>⚠️ Mismatch</span>}
                        </div>
                      </div>
                      <div style={{ textAlign:"center", minWidth:60 }}>
                        <div style={{ fontSize:20, fontWeight:900, color:pct>=70?"#DC2626":pct>=40?"#D97706":"#16A34A" }}>{pct}%</div>
                        <div style={{ fontSize:10, color:"#9CA3AF" }}>{r.score}/{r.total_points}</div>
                      </div>
                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={()=>navigate(`/student/results/${r.id}`)}
                          style={{ padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer" }}><Eye size={13} color="#6B7280"/></button>
                        <button onClick={()=>{ setTargetResult(r); setNewLevel(current||suggested); setLevelDialog(true); }}
                          style={{ padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer" }}><UserCog size={13} color="#6B7280"/></button>
                        <button onClick={()=>resetAttempt(r)}
                          style={{ padding:"7px 10px", borderRadius:8, border:"1px solid #FDE68A", background:"#FFF7ED", cursor:"pointer" }}><RotateCcw size={13} color="#D97706"/></button>
                      </div>
                    </div>
                  );
                })}
                {filtered.length===0&&<div style={{ textAlign:"center", padding:"48px 24px", background:"#fff", borderRadius:16, border:"2px dashed #E5E7EB" }}><p style={{ color:"#9CA3AF" }}>No results yet</p></div>}
              </div>
            )}
          </>
        )}

        {/* MAPPING TAB */}
        {activeTab==="mapping"&&(
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <p style={{ fontSize:13, color:"#6B7280", margin:0 }}>Configure which subjects students are auto-enrolled in based on their entrance exam result level.</p>
            {LEVELS.map(level=>{
              const mapped = levelCourses.filter((lc:any)=>lc.level===level);
              const cfg = levelCfg[level];
              return (
                <div key={level} style={{ background:"#fff", borderRadius:16, border:`1.5px solid ${cfg.border}`, overflow:"hidden" }}>
                  <div style={{ background:cfg.bg, padding:"12px 16px", display:"flex", alignItems:"center", gap:8, borderBottom:`1px solid ${cfg.border}` }}>
                    <span style={{ fontSize:18 }}>{cfg.dot}</span>
                    <div>
                      <p style={{ fontWeight:800, fontSize:14, color:cfg.text, margin:0 }}>{cfg.label}</p>
                      <p style={{ fontSize:11, color:cfg.text, opacity:.7, margin:0 }}>{mapped.length} subject{mapped.length!==1?"s":""} mapped</p>
                    </div>
                  </div>
                  <div style={{ padding:14 }}>
                    {mapped.length===0?<p style={{ fontSize:12, color:"#9CA3AF", fontStyle:"italic" }}>No subjects mapped yet</p>:(
                      <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:12 }}>
                        {mapped.map((lc:any)=>(
                          <div key={lc.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px", borderRadius:10, background:"#F9FAFB", border:"1px solid #E5E7EB" }}>
                            <p style={{ fontSize:13, fontWeight:600, color:"#374151", margin:0 }}>{language==="ar"?lc.subjects?.title_ar||lc.subjects?.title:lc.subjects?.title}</p>
                            <button onClick={()=>removeMapping(lc.id)} style={{ background:"none", border:"none", cursor:"pointer", padding:4 }}><Trash2 size={14} color="#DC2626"/></button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display:"flex", gap:8 }}>
                      <select value={selectedLevel===level?selectedSubject:""} onChange={e=>{ setSelectedLevel(level); setSelectedSubject(e.target.value); }}
                        style={{ flex:1, padding:"8px 10px", borderRadius:9, border:"1.5px solid #E5E7EB", fontSize:13, outline:"none" }}>
                        <option value="">Select subject to add…</option>
                        {subjects.filter(s=>!mapped.some((lc:any)=>lc.subject_id===s.id)).map(s=>(
                          <option key={s.id} value={s.id}>{s.title}{s.title_ar?` / ${s.title_ar}`:""}</option>
                        ))}
                      </select>
                      <button onClick={()=>{ if(selectedLevel===level&&selectedSubject) addSubjectToLevel(level,selectedSubject); }}
                        disabled={selectedLevel!==level||!selectedSubject}
                        style={{ padding:"8px 14px", borderRadius:9, border:"none", background:G, color:"#fff", cursor:"pointer", fontWeight:700, fontSize:13, opacity:selectedLevel!==level||!selectedSubject?.5:1 }}>
                        <Plus size={14}/>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* QUESTIONS TAB */}
        {activeTab==="questions"&&(
          <>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <p style={{ fontSize:13, color:"#6B7280", margin:0 }}>{questions.length} placement questions</p>
              <Button onClick={()=>navigate(`/admin/exams/${ENTRANCE_EXAM_ID}/edit`)}
                style={{ background:G, borderRadius:10, gap:6, fontWeight:700 }}>
                <BookOpen size={14}/> Edit Questions
              </Button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {questions.map((q,i)=>(
                <div key={q.id} style={{ background:"#fff", borderRadius:12, border:"1px solid #E5E7EB", padding:"12px 14px", display:"flex", gap:10 }}>
                  <span style={{ fontSize:11, fontWeight:800, color:"#9CA3AF", minWidth:24 }}>{i+1}</span>
                  <div style={{ flex:1 }}>
                    <p style={{ fontSize:13, fontWeight:600, color:"#111", margin:0 }}>{q.question_text}</p>
                    {q.question_text_ar&&<p style={{ fontSize:12, color:"#9CA3AF", margin:"3px 0 0", fontFamily:"'Amiri',serif", direction:"rtl" }}>{q.question_text_ar}</p>}
                  </div>
                  <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:"#EFF6FF", color:"#1D4ED8", fontWeight:700, alignSelf:"flex-start", whiteSpace:"nowrap" }}>
                    {q.question_type?.replace("_"," ")||"mcq"}
                  </span>
                </div>
              ))}
              {questions.length===0&&<div style={{ textAlign:"center", padding:"48px 24px", background:"#fff", borderRadius:16, border:"2px dashed #E5E7EB" }}><p style={{ color:"#9CA3AF" }}>No questions yet — add them in the exam editor</p></div>}
            </div>
          </>
        )}
      </div>

      {/* Change Level Dialog */}
      <Dialog open={levelDialog} onOpenChange={v=>!v&&setLevelDialog(false)}>
        <DialogContent style={{ maxWidth:380, borderRadius:20, padding:0 }}>
          <div style={{ background:G, padding:"18px 20px", borderRadius:"20px 20px 0 0" }}>
            <h2 style={{ fontWeight:800, fontSize:16, color:"#fff", margin:0 }}>Assign Level</h2>
            <p style={{ fontSize:11, color:"rgba(255,255,255,.7)", margin:0 }}>{targetResult?.profiles?.full_name}</p>
          </div>
          <div style={{ padding:20 }}>
            <select value={newLevel} onChange={e=>setNewLevel(e.target.value)}
              style={{ width:"100%", padding:"10px 12px", borderRadius:10, border:"1.5px solid #E5E7EB", fontSize:14, outline:"none", marginBottom:14 }}>
              {LEVELS.map(l=><option key={l} value={l}>{levelCfg[l].label}</option>)}
            </select>
            <Button onClick={changeLevel} disabled={saving} style={{ width:"100%", background:G, borderRadius:12, gap:8, fontWeight:700 }}>
              {saving?<><Loader2 size={14} style={{ animation:"spin .8s linear infinite" }}/> Saving…</>:"Save Level"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Auto-Level Dialog */}
      <Dialog open={bulkDialog} onOpenChange={v=>!v&&setBulkDialog(false)}>
        <DialogContent style={{ maxWidth:400, borderRadius:20, padding:20 }}>
          <h3 style={{ fontWeight:800, fontSize:16, color:"#111", marginBottom:10 }}>Auto-Assign Levels</h3>
          <p style={{ fontSize:13, color:"#6B7280", marginBottom:16, lineHeight:1.6 }}>
            This will update the level for all students based on their entrance exam score:<br/>
            🔴 ≥70% → Advanced · 🟡 40–69% → Intermediate · 🟢 &lt;40% → Beginner
          </p>
          <div style={{ padding:"12px 14px", background:"#FFF7ED", borderRadius:12, border:"1px solid #FDE68A", marginBottom:16 }}>
            <p style={{ fontSize:12, color:"#92400E", margin:0 }}>⚠️ {results.filter(r=>{ const pct=r.total_points?Math.round((r.score/r.total_points)*100):0; return levelFromScore(pct)!==r.profiles?.level; }).length} students have a level mismatch</p>
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={()=>setBulkDialog(false)} style={{ flex:1, padding:"11px", borderRadius:12, border:"1.5px solid #E5E7EB", background:"#fff", cursor:"pointer", fontWeight:600 }}>Cancel</button>
            <button onClick={applyAutoLevel} disabled={bulkApplying}
              style={{ flex:1, padding:"11px", borderRadius:12, border:"none", background:G, color:"#fff", cursor:"pointer", fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
              {bulkApplying?<><Loader2 size={14} style={{ animation:"spin .8s linear infinite" }}/> Applying…</>:"Apply Auto-Levels"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export default EntranceExamAdmin;

