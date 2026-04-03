/* src/pages/admin/EntranceExamAdmin.tsx — COMPLETE FIXED VERSION */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  FileText, Users, Settings, Plus, Trash2, Download, Eye,
  BookOpen, RotateCcw, UserCog, Search, ChevronRight,
  CheckCircle, XCircle, Loader2, BarChart2, GraduationCap,
  Edit2, ArrowUp, ArrowDown, X, Save
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

type QuestionType = "mcq" | "true_false" | "essay" | "short_answer" | "fill_blank";
type Difficulty = "easy" | "medium" | "hard";

interface Question {
  id?: string;
  exam_id: string;
  question_text: string;
  question_text_ar: string;
  question_type: QuestionType;
  difficulty: Difficulty;
  points: number;
  options?: any[];
  correct_answer?: string;
  sort_order: number;
}

const EntranceExamAdmin = () => {
  const { toast } = useToast();
  const { language } = useLanguage();  const { user } = useAuth();
  const navigate = useNavigate();

  const [questions, setQuestions]     = useState<Question[]>([]);
  const [subjects, setSubjects]       = useState<any[]>([]);
  const [levelCourses, setLevelCourses] = useState<any[]>([]);
  const [results, setResults]         = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState<"questions"|"mapping"|"results">("results");
  const [search, setSearch]           = useState("");

  // Question Editor State
  const [editDialog, setEditDialog]   = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [form, setForm] = useState<Partial<Question>>({
    question_text: "",
    question_text_ar: "",
    question_type: "mcq",
    difficulty: "easy",
    points: 5,
    options: [],
    correct_answer: "",
  });

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
      supabase.from("level_courses").select("*, subjects(title, title_ar)"),
      supabase.from("exam_attempts")
        .select(`
          *,
          profiles!inner(
            full_name,            full_name_ar,
            avatar_url,
            level,
            email,
            has_taken_entrance_exam,
            onboarding_completed
          )
        `)
        .eq("exam_id", ENTRANCE_EXAM_ID)
        .neq("status","in_progress")
        .order("submitted_at", { ascending:false }),
    ]);
    setQuestions((qRes.data as any[])||[]);
    setSubjects(subRes.data||[]);
    setLevelCourses((lcRes.data as any[])||[]);
    setResults((attRes.data as any[])||[]);
    setLoading(false);
  };

  useEffect(()=>{ loadData(); },[]);

  // ── Question Editor Functions ───────────────────────────────────
  const openEdit = (q?: Question) => {
    if (q) {
      setEditingQuestion(q);
      setForm({ ...q });
    } else {
      setEditingQuestion(null);
      setForm({
        question_text: "",
        question_text_ar: "",
        question_type: "mcq",
        difficulty: "easy",
        points: 5,
        options: [
          { id: "a", text: "", text_ar: "" },
          { id: "b", text: "", text_ar: "" },
          { id: "c", text: "", text_ar: "" },
          { id: "d", text: "", text_ar: "" },
        ],
        correct_answer: "",
      });
    }
    setEditDialog(true);
  };

  const saveQuestion = async () => {
    if (!form.question_text?.trim()) {
      toast({ title: "Question text required", variant: "destructive" });
      return;    }

    setSavingQuestion(true);
    try {
      const qData = {
        exam_id: ENTRANCE_EXAM_ID,
        question_text: form.question_text,
        question_text_ar: form.question_text_ar,
        question_type: form.question_type,
        difficulty: form.difficulty,
        points: form.points,
        options: form.question_type === "mcq" ? form.options : null,
        correct_answer: form.correct_answer,
        sort_order: editingQuestion?.sort_order || questions.length + 1,
      };

      if (editingQuestion?.id) {
        await supabase.from("exam_questions").update(qData).eq("id", editingQuestion.id);
        toast({ title: "✅ Question updated" });
      } else {
        await supabase.from("exam_questions").insert(qData);
        toast({ title: "✅ Question added" });
      }

      setEditDialog(false);
      loadData();
    } catch (err: any) {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    } finally {
      setSavingQuestion(false);
    }
  };

  const deleteQuestion = async (id: string) => {
    if (!confirm("Delete this question?")) return;
    await supabase.from("exam_questions").delete().eq("id", id);
    toast({ title: "🗑️ Question deleted" });
    loadData();
  };

  const moveQuestion = async (index: number, direction: "up" | "down") => {
    const newQuestions = [...questions];
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newQuestions.length) return;

    const temp = newQuestions[index].sort_order;
    newQuestions[index].sort_order = newQuestions[newIndex].sort_order;
    newQuestions[newIndex].sort_order = temp;

    await supabase.from("exam_questions").update({ sort_order: newQuestions[index].sort_order }).eq("id", newQuestions[index].id);    await supabase.from("exam_questions").update({ sort_order: newQuestions[newIndex].sort_order }).eq("id", newQuestions[newIndex].id);

    setQuestions(newQuestions);
    toast({ title: "📋 Order updated" });
  };

  const addOption = () => {
    const newOptions = [...(form.options || []), { id: String.fromCharCode(97 + form.options!.length), text: "", text_ar: "" }];
    setForm({ ...form, options: newOptions });
  };

  const removeOption = (idx: number) => {
    const newOptions = form.options?.filter((_, i) => i !== idx) || [];
    setForm({ ...form, options: newOptions });
  };

  const updateOption = (idx: number, field: string, value: string) => {
    const newOptions = [...(form.options || [])];
    newOptions[idx] = { ...newOptions[idx], [field]: value };
    setForm({ ...form, options: newOptions });
  };

  // ── Admin Functions ───────────────────────────────────
  const addSubjectToLevel = async (level: string, subjectId: string) => {
    const { error } = await supabase.from("level_courses").insert({ level, subject_id:subjectId });
    if (error?.code === "23505") { toast({ title:"Already mapped", variant:"destructive" }); return; }
    if (error) { toast({ title:"Error", description:error.message, variant:"destructive" }); return; }
    toast({ title:"Subject added" });
    loadData();
  };

  const removeMapping = async (id: string) => {
    await supabase.from("level_courses").delete().eq("id", id);
    loadData();
  };

  const resetAttempt = async (r: any) => {
    if (!confirm(`Reset ${r.profiles?.full_name}'s entrance exam? They can retake.`)) return;
    await supabase.from("exam_attempts").delete().eq("id", r.id);
    await supabase.from("profiles").update({ has_taken_entrance_exam:false, allow_entrance_retake:true }).eq("user_id", r.user_id);
    toast({ title:"Entrance exam reset" });
    loadData();
  };

  // ✅ FIXED: Complete level assignment with auto-enrollment
  const changeLevel = async () => {
    if (!targetResult) return;
    setSaving(true);
    
    try {      // 1. Update profile level
      await supabase.from("profiles").update({ 
        level: newLevel,
        has_taken_entrance_exam: true,
        onboarding_completed: true
      }).eq("user_id", targetResult.user_id);
      
      // 2. Update exam attempt status
      await supabase.from("exam_attempts").update({
        status: "reviewed",
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString()
      }).eq("id", targetResult.id);
      
      // 3. Auto-enroll in level_courses subjects
      const { data: levelCourses } = await supabase
        .from("level_courses")
        .select("subject_id")
        .eq("level", newLevel);
      
      if (levelCourses && levelCourses.length > 0) {
        const subjectIds = levelCourses.map((lc: any) => lc.subject_id);
        
        const { data: courses } = await supabase
          .from("courses")
          .select("id, subject_id")
          .in("subject_id", subjectIds)
          .eq("is_published", true);
        
        if (courses) {
          for (const course of courses) {
            await supabase
              .from("enrollments")
              .upsert({
                user_id: targetResult.user_id,
                course_id: course.id,
                enrolled_at: new Date().toISOString(),
                status: "active"
              }, {
                onConflict: "user_id,course_id"
              });
          }
        }
      }
      
      // 4. Create notification for student
      await supabase.from("notifications").insert({
        user_id: targetResult.user_id,
        title: "Level Assigned!",
        message: `You've been placed in ${newLevel} level. Check your dashboard to start learning.`,        type: "level_assigned",
        is_read: false,
        created_at: new Date().toISOString()
      });
      
      toast({ title: `✅ Level assigned: ${newLevel}` });
      setSaving(false);
      setLevelDialog(false);
      loadData();
      
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setSaving(false);
    }
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
    const header = "Name,Email,Score,Total,Percentage,Suggested Level,Current Level,Status,Date\n";
    const rows = results.map((r:any)=>{
      const p = r.profiles;
      const pct = r.total_points ? Math.round((r.score/r.total_points)*100) : 0;
      return `"${p?.full_name||""}","${p?.email||""}",${r.score||0},${r.total_points||20},${pct}%,${levelFromScore(pct)},${p?.level||""},${r.status||""},${r.submitted_at||""}`;
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
    ...acc,    [l]: results.filter(r=>{ const pct=r.total_points?Math.round((r.score/r.total_points)*100):0; return levelFromScore(pct)===l; }).length
  }),{} as Record<string,number>);

  const totalPoints = questions.reduce((sum, q) => sum + (q.points || 0), 0);

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
              <p style={{ fontSize:12, color:"#6B7280", margin:0 }}>{results.length} submissions · {questions.length} questions · {totalPoints} pts</p>
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
            </div>          ))}
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
                          {/* ✅ NEW: Status badge */}
                          <span style={{ 
                            fontSize:10, 
                            padding:"2px 8px", 
                            borderRadius:20, 
                            background: r.status === "reviewed" ? "#DCFCE7" : "#FEF9C3",                            color: r.status === "reviewed" ? "#166534" : "#854D0E",
                            fontWeight:700 
                          }}>
                            {r.status === "reviewed" ? "✅ Reviewed" : "⏳ Pending"}
                          </span>
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
                          <div key={lc.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px", borderRadius:10, background:"#F9FAFB", border:"1px solid #E5E7EB" }}>                            <p style={{ fontSize:13, fontWeight:600, color:"#374151", margin:0 }}>{language==="ar"?lc.subjects?.title_ar||lc.subjects?.title:lc.subjects?.title}</p>
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
                        style={{ padding:"8px 14px", borderRadius:9, border:"none", background:G, color:"#fff", cursor:"pointer", fontWeight:700, fontSize:13, opacity:selectedLevel!==level||!selectedSubject?0.5:1 }}>
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
              <p style={{ fontSize:13, color:"#6B7280", margin:0 }}>{questions.length} questions · {totalPoints} total points</p>
              <Button onClick={()=>openEdit()} style={{ background:G, borderRadius:10, gap:6 }}>
                <Plus size={14}/> Add Question
              </Button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {questions.map((q,i)=>(
                <div key={q.id} style={{ background:"#fff", borderRadius:12, border:"1px solid #E5E7EB", padding:"14px 16px", display:"flex", gap:12 }}>
                  {/* Order controls */}
                  <div style={{ display:"flex", flexDirection:"column", gap:2, justifyContent:"center" }}>
                    <button onClick={()=>moveQuestion(i,"up")} disabled={i===0}
                      style={{ padding:3, borderRadius:5, border:"1px solid #E5E7EB", background:i===0?"#F3F4F6":"#fff", cursor:i===0?"not-allowed":"pointer", opacity:i===0?0.4:1 }}>
                      <ArrowUp size={12} color="#374151"/>
                    </button>
                    <span style={{ fontSize:11, fontWeight:800, color:"#9CA3AF", textAlign:"center" }}>{i+1}</span>
                    <button onClick={()=>moveQuestion(i,"down")} disabled={i===questions.length-1}
                      style={{ padding:3, borderRadius:5, border:"1px solid #E5E7EB", background:i===questions.length-1?"#F3F4F6":"#fff", cursor:i===questions.length-1?"not-allowed":"pointer", opacity:i===questions.length-1?0.4:1 }}>
                      <ArrowDown size={12} color="#374151"/>
                    </button>                  </div>
                  {/* Question content */}
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", gap:6, marginBottom:6, flexWrap:"wrap" }}>
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:"#EFF6FF", color:"#1D4ED8", fontWeight:700 }}>
                        {q.question_type?.replace("_"," ")}
                      </span>
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:q.difficulty==="easy"?"#DCFCE7":q.difficulty==="medium"?"#FEF9C3":"#FEE2E2", color:q.difficulty==="easy"?"#166534":q.difficulty==="medium"?"#854D0E":"#991B1B", fontWeight:700 }}>
                        {q.difficulty}
                      </span>
                      <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:"#F3F4F6", color:"#374151", fontWeight:700 }}>
                        {q.points} pts
                      </span>
                    </div>
                    <p style={{ fontSize:14, fontWeight:600, color:"#111", margin:"0 0 4px" }}>{q.question_text}</p>
                    {q.question_text_ar&&<p style={{ fontSize:12, color:"#9CA3AF", margin:0, fontFamily:"'Amiri',serif", direction:"rtl" }}>{q.question_text_ar}</p>}
                  </div>
                  {/* Actions */}
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={()=>openEdit(q)} style={{ padding:"8px 10px", borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer" }}>
                      <Edit2 size={14} color="#6B7280"/>
                    </button>
                    <button onClick={()=>deleteQuestion(q.id!)} style={{ padding:"8px 10px", borderRadius:8, border:"1px solid #FEE2E2", background:"#FFF5F5", cursor:"pointer" }}>
                      <Trash2 size={14} color="#DC2626"/>
                    </button>
                  </div>
                </div>
              ))}
              {questions.length===0&&<div style={{ textAlign:"center", padding:"48px 24px", background:"#fff", borderRadius:16, border:"2px dashed #E5E7EB" }}><p style={{ color:"#9CA3AF" }}>No questions yet — add your first question</p></div>}
            </div>
          </>
        )}
      </div>

      {/* Question Edit Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent style={{ maxWidth:700, maxHeight:"90vh", overflow:"auto" }}>
          <DialogHeader>
            <DialogTitle style={{ fontSize:18, fontWeight:800 }}>
              {editingQuestion ? "Edit Question" : "Add New Question"}
            </DialogTitle>
          </DialogHeader>

          <div style={{ display:"flex", flexDirection:"column", gap:16, paddingTop:16 }}>
            {/* Question Type */}
            <div>
              <label style={{ fontSize:13, fontWeight:700, color:"#374151", marginBottom:6, display:"block" }}>Question Type</label>
              <Select value={form.question_type} onValueChange={(v)=>setForm({...form, question_type:v as QuestionType})}>
                <SelectTrigger style={{ borderRadius:10 }}>
                  <SelectValue />                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mcq">Multiple Choice (MCQ)</SelectItem>
                  <SelectItem value="true_false">True / False</SelectItem>
                  <SelectItem value="essay">Essay (Long Answer)</SelectItem>
                  <SelectItem value="short_answer">Short Answer</SelectItem>
                  <SelectItem value="fill_blank">Fill in the Blank</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Difficulty & Points */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div>
                <label style={{ fontSize:13, fontWeight:700, color:"#374151", marginBottom:6, display:"block" }}>Difficulty</label>
                <Select value={form.difficulty} onValueChange={(v)=>setForm({...form, difficulty:v as Difficulty})}>
                  <SelectTrigger style={{ borderRadius:10 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={{ fontSize:13, fontWeight:700, color:"#374151", marginBottom:6, display:"block" }}>Points</label>
                <Input type="number" value={form.points} onChange={(e)=>setForm({...form, points:parseInt(e.target.value)||0})} style={{ borderRadius:10 }} />
              </div>
            </div>

            {/* Question Text */}
            <div>
              <label style={{ fontSize:13, fontWeight:700, color:"#374151", marginBottom:6, display:"block" }}>Question (English)</label>
              <Textarea value={form.question_text} onChange={(e)=>setForm({...form, question_text:e.target.value})} placeholder="Enter question text..." rows={3} style={{ borderRadius:10, resize:"none" }} />
            </div>
            <div>
              <label style={{ fontSize:13, fontWeight:700, color:"#374151", marginBottom:6, display:"block" }}>Question (Arabic)</label>
              <Textarea value={form.question_text_ar} onChange={(e)=>setForm({...form, question_text_ar:e.target.value})} placeholder="اكتب نص السؤال بالعربية..." rows={3} style={{ borderRadius:10, resize:"none", direction:"rtl" }} />
            </div>

            {/* MCQ Options */}
            {form.question_type==="mcq" && (
              <div>
                <label style={{ fontSize:13, fontWeight:700, color:"#374151", marginBottom:6, display:"block" }}>Answer Options</label>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {form.options?.map((opt,idx)=>(
                    <div key={idx} style={{ display:"flex", gap:8, alignItems:"center" }}>
                      <span style={{ fontSize:13, fontWeight:700, color:"#374151", width:24 }}>{String.fromCharCode(65+idx)}.</span>                      <Input value={opt.text} onChange={(e)=>updateOption(idx,"text",e.target.value)} placeholder="Option text" style={{ flex:1, borderRadius:10 }} />
                      <Input value={opt.text_ar} onChange={(e)=>updateOption(idx,"text_ar",e.target.value)} placeholder="نص الخيار" style={{ flex:1, borderRadius:10, direction:"rtl" }} />
                      <button onClick={()=>removeOption(idx)} style={{ padding:8, borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer" }}>
                        <X size={14} color="#6B7280"/>
                      </button>
                    </div>
                  ))}
                  <Button onClick={addOption} variant="outline" style={{ borderRadius:10, gap:6 }}>
                    <Plus size={14}/> Add Option
                  </Button>
                </div>

                <div style={{ marginTop:12 }}>
                  <label style={{ fontSize:13, fontWeight:700, color:"#374151", marginBottom:6, display:"block" }}>Correct Answer</label>
                  <Select value={form.correct_answer} onValueChange={(v)=>setForm({...form, correct_answer:v})}>
                    <SelectTrigger style={{ borderRadius:10 }}>
                      <SelectValue placeholder="Select correct answer" />
                    </SelectTrigger>
                    <SelectContent>
                      {form.options?.map((opt,idx)=>(
                        <SelectItem key={idx} value={opt.id}>{String.fromCharCode(65+idx)}. {opt.text||"(empty)"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* True/False */}
            {form.question_type==="true_false" && (
              <div>
                <label style={{ fontSize:13, fontWeight:700, color:"#374151", marginBottom:6, display:"block" }}>Correct Answer</label>
                <Select value={form.correct_answer} onValueChange={(v)=>setForm({...form, correct_answer:v})}>
                  <SelectTrigger style={{ borderRadius:10 }}>
                    <SelectValue placeholder="Select correct answer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">True / صحيح</SelectItem>
                    <SelectItem value="false">False / خطأ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Actions */}
            <div style={{ display:"flex", gap:10, paddingTop:8 }}>
              <Button onClick={()=>setEditDialog(false)} variant="outline" style={{ flex:1, borderRadius:10 }}>
                Cancel
              </Button>
              <Button onClick={saveQuestion} disabled={savingQuestion} style={{ flex:1, background:G, borderRadius:10, gap:6 }}>                {savingQuestion ? "Saving..." : <><Save size={16}/> Save Question</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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