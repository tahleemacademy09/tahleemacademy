// src/pages/admin/HifdhRevisionTracker.tsx — FULL REWRITE
// ✅ Sort by Level / Name / Student ID
// ✅ Level filter pills  
// ✅ Bulk Assign (All / By Level) with program scheduler
// ✅ Smart daily page: rest days, auto-advance by working days
// ✅ Individual assign with full program settings

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "@/integrations/supabase/storageClient";
import {
  BookOpen, Check, Clock, Search, ChevronDown, ChevronUp,
  Loader2, Plus, X, Edit2, CheckCircle2, Play, Pause, Volume2,
  ArrowUpDown, Sparkles, Calendar,
} from "lucide-react";

const G    = "#1a3d24";
const GM   = "#276749";
const GOLD = "#c9a84c";
const W    = "#ffffff";
const WARM = "#faf8f4";
const BRD  = "#e8ddd0";

const LEVELS = ["tamhidi","beginner","intermediate","advanced"] as const;
type Level   = typeof LEVELS[number];
const LV_COLOR: Record<string,string> = {
  tamhidi:"#9b59b6", beginner:"#27ae60", intermediate:"#e67e22", advanced:"#e74c3c",
};
const LV_LABEL: Record<string,string> = {
  tamhidi:"Tamhidi", beginner:"Beginner", intermediate:"Intermediate", advanced:"Advanced",
};
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const todayStr = () => new Date().toISOString().split("T")[0];
const fmtSecs  = (s: number) => `${Math.floor(s/60)}m ${s%60}s`;

// ── Types ──────────────────────────────────────────────────
interface Assignment {
  id: string; mode:"juz"|"hizb"|"surah"; selected_items:number[];
  daily_pages:number; reciter_id:string; active:boolean; notes?:string;
  program_start_date?:string; rest_days?:number[];
  program_duration_days?:number; start_page?:number;
}
interface DailyLog {
  id:string; log_date:string; pages_revised:number; avg_score:number|null;
  duration_secs:number; completed:boolean; session_data?:any;
  acknowledged_by:string|null; acknowledged_at:string|null; ack_note:string|null;
}
interface Student {
  user_id:string; full_name:string; student_id:string; level:string|null;
  assignment?:Assignment; todayLog?:DailyLog;
}
interface PForm {
  mode:"juz"|"hizb"|"surah"; selected_items:number[]; daily_pages:number;
  reciter_id:string; notes:string; program_start_date:string;
  rest_days:number[]; program_duration_days:number; start_page:number;
}

const defaultForm = (): PForm => ({
  mode:"juz", selected_items:[1], daily_pages:1,
  reciter_id:"Alafasy_128kbps", notes:"",
  program_start_date:todayStr(), rest_days:[0],
  program_duration_days:30, start_page:1,
});

// ── compute today's sequential page ───────────────────────
function todayPage(a:Assignment): { page:number; total:number; pct:number }|null {
  if (!a.program_start_date) return null;
  const start = new Date(a.program_start_date); start.setHours(0,0,0,0);
  const now   = new Date();                      now.setHours(0,0,0,0);
  if (start > now) return null;
  const rest = a.rest_days ?? [0];
  const dp   = a.daily_pages ?? 1;
  const dur  = a.program_duration_days ?? 30;
  const sp   = a.start_page ?? 1;
  let working = 0;
  const cur = new Date(start);
  while (cur < now) {
    if (!rest.includes(cur.getDay())) working++;
    cur.setDate(cur.getDate()+1);
  }
  const page  = sp + Math.floor(working * dp);
  const total = Math.ceil(dur * dp);
  const pct   = Math.min(100, Math.round((working/dur)*100));
  return { page, total, pct };
}

// ═══════════════════════════════════════════════════════════
export default function HifdhRevisionTracker() {
  const [role,    setRole]    = useState<"admin"|"teacher"|null>(null);
  const [userId,  setUserId]  = useState<string|null>(null);
  const [students,setStudents]= useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  // controls
  const [search,      setSearch]      = useState("");
  const [statusTab,   setStatusTab]   = useState<"all"|"done"|"pending"|"unassigned">("all");
  const [sortKey,     setSortKey]     = useState<"level"|"name"|"id">("level");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [showSortDrop,setShowSortDrop]= useState(false);

  // individual
  const [expanded,    setExpanded]    = useState<string|null>(null);
  const [showAssign,  setShowAssign]  = useState<string|null>(null);
  const [indForm,     setIndForm]     = useState<PForm>(defaultForm());
  const [saving,      setSaving]      = useState(false);
  const [saveErr,     setSaveErr]     = useState<string|null>(null);

  // bulk
  const [showBulk,    setShowBulk]    = useState(false);
  const [bulkTarget,  setBulkTarget]  = useState<"all"|"level">("all");
  const [bulkLevels,  setBulkLevels]  = useState<string[]>([]);
  const [bulkForm,    setBulkForm]    = useState<PForm>(defaultForm());
  const [bulkStep,    setBulkStep]    = useState<"config"|"confirm">("config");
  const [bulkSaving,  setBulkSaving]  = useState(false);
  const [bulkDone,    setBulkDone]    = useState<number|null>(null);

  // ack/grade/audio
  const [ackLoading,   setAckLoading]   = useState<string|null>(null);
  const [ackNote,      setAckNote]      = useState<Record<string,string>>({});
  const [manualGrade,  setManualGrade]  = useState<Record<string,string>>({});
  const [grading,      setGrading]      = useState<string|null>(null);
  const [expandSess,   setExpandSess]   = useState<string|null>(null);
  const [audioPlay,    setAudioPlay]    = useState<string|null>(null);
  const [audioLoad,    setAudioLoad]    = useState<string|null>(null);
  const audioRef = useRef<HTMLAudioElement|null>(null);

  // ── auth ────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      setUserId(data.user.id);
      supabase.from("profiles").select("role").eq("user_id",data.user.id).single()
        .then(({ data:p }) => { if (p) setRole(p.role as any); });
    });
  }, []);

  // ── load ────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!userId||!role) return;
    setLoading(true);
    try {
      let ids:string[] = [];
      if (role==="teacher") {
        const { data:subs } = await supabase.from("subjects").select("id").eq("teacher_id",userId);
        const sids = (subs||[]).map((s:any)=>s.id);
        if (sids.length) {
          const { data:enr } = await supabase.from("enrollments").select("user_id").in("subject_id",sids);
          ids = [...new Set((enr||[]).map((e:any)=>e.user_id))];
        }
      }
      const q = supabase.from("profiles").select("user_id,full_name,student_id,level").eq("role","student");
      const { data:profiles } = role==="teacher"&&ids.length ? await q.in("user_id",ids) : await q;
      if (!profiles) { setLoading(false); return; }

      const pids = profiles.map((p:any)=>p.user_id);
      const { data:asgns } = await (supabase as any).from("hifdh_daily_assignments")
        .select("*").eq("active",true).in("student_id",pids);
      const { data:logs }  = await (supabase as any).from("hifdh_daily_logs")
        .select("*").eq("log_date",todayStr()).in("student_id",pids);

      const aMap:Record<string,Assignment> = {};
      (asgns||[]).forEach((a:any)=>{ aMap[a.student_id]=a; });
      const lMap:Record<string,DailyLog> = {};
      (logs||[]).forEach((l:any)=>{ lMap[l.student_id]=l; });

      setStudents(profiles.map((p:any)=>({ ...p, assignment:aMap[p.user_id], todayLog:lMap[p.user_id] })));
    } catch(e){ console.error(e); }
    setLoading(false);
  },[userId,role]);

  useEffect(()=>{ load(); },[load]);

  // ── sort + filter ───────────────────────────────────────
  const LV_ORDER:Record<string,number> = { tamhidi:0,beginner:1,intermediate:2,advanced:3 };

  const processed = [...students]
    .sort((a,b) => {
      if (sortKey==="level") {
        const d = (LV_ORDER[a.level||""]??99)-(LV_ORDER[b.level||""]??99);
        return d!==0 ? d : (a.full_name||"").localeCompare(b.full_name||"");
      }
      if (sortKey==="name") return (a.full_name||"").localeCompare(b.full_name||"");
      return (a.student_id||"").localeCompare(b.student_id||"");
    })
    .filter(s => {
      const mq = !search
        || s.full_name?.toLowerCase().includes(search.toLowerCase())
        || s.student_id?.toLowerCase().includes(search.toLowerCase());
      const mf = statusTab==="all" ? true
        : statusTab==="unassigned" ? !s.assignment
        : statusTab==="done"       ? !!s.todayLog?.completed
        : !!s.assignment && !s.todayLog?.completed;
      const ml = levelFilter==="all" || s.level===levelFilter;
      return mq&&mf&&ml;
    });

  const stats = {
    total:    students.length,
    assigned: students.filter(s=>s.assignment).length,
    done:     students.filter(s=>s.todayLog?.completed).length,
    acked:    students.filter(s=>s.todayLog?.acknowledged_at).length,
  };

  // ── helpers ─────────────────────────────────────────────
  const scoreColor = (sc:number) => sc>=80?"#16a34a":sc>=60?"#b7791f":"#dc2626";

  const acknowledge = async (log:DailyLog, sid:string) => {
    setAckLoading(log.id);
    try {
      await (supabase as any).rpc("acknowledge_hifdh_log",{ p_log_id:log.id, p_note:ackNote[log.id]||null });
      setStudents(p=>p.map(s=>s.user_id===sid
        ?{...s,todayLog:{...s.todayLog!,acknowledged_by:userId!,acknowledged_at:new Date().toISOString(),ack_note:ackNote[log.id]||null}}:s));
    } catch(e){ console.error(e); }
    setAckLoading(null);
  };

  const playAudio = async (logId:string, path:string) => {
    if (audioRef.current){ audioRef.current.pause(); audioRef.current=null; }
    if (audioPlay===logId){ setAudioPlay(null); return; }
    setAudioLoad(logId);
    try {
      const { data } = await storageSupabase.storage.from("recitation-audio").createSignedUrl(path,3600);
      if (!data?.signedUrl) throw new Error("No URL");
      const el = new Audio(data.signedUrl);
      audioRef.current=el;
      el.onended=()=>setAudioPlay(null);
      el.onerror=()=>{ setAudioPlay(null); setAudioLoad(null); };
      await el.play(); setAudioPlay(logId);
    } catch(e){ console.error(e); }
    setAudioLoad(null);
  };

  const gradeOverride = async (logId:string, sid:string, grade:number) => {
    setGrading(logId);
    try {
      await (supabase as any).from("hifdh_daily_logs").update({avg_score:grade}).eq("id",logId);
      setStudents(p=>p.map(s=>s.user_id===sid?{...s,todayLog:{...s.todayLog!,avg_score:grade}}:s));
      setManualGrade(m=>({...m,[logId]:""}));
    } catch(e:any){ alert(`Grade failed: ${e?.message}`); }
    setGrading(null);
  };


  // ── RPC helper: single clean call (requires SQL migration 20260506000002)
  const callSaveRpc = async (sid: string, form: PForm): Promise<string|null> => {
    const { error } = await (supabase as any).rpc("save_hifdh_assignment", {
      p_student_id:            sid,
      p_mode:                  form.mode,
      p_selected_items:        form.selected_items,
      p_daily_pages:           form.daily_pages,
      p_reciter_id:            form.reciter_id || "Alafasy_128kbps",
      p_notes:                 form.notes || null,
      p_program_start_date:    form.program_start_date || null,
      p_rest_days:             form.rest_days,
      p_program_duration_days: form.program_duration_days,
      p_start_page:            form.start_page,
    });
    return error ? error.message : null;
  };

  const saveIndividual = async (sid:string) => {
    if (!userId) return;
    setSaving(true); setSaveErr(null);
    try {
      const err = await callSaveRpc(sid, indForm);
      if (err) { setSaveErr(`Save failed: ${err}`); setSaving(false); return; }
      setShowAssign(null); await load();
    } catch(e:any){ setSaveErr(`Error: ${e?.message}`); }
    setSaving(false);
  };

  // bulk target students
  const bulkStudents = bulkTarget==="all"
    ? students
    : students.filter(s=>bulkLevels.length===0||bulkLevels.includes(s.level||""));

  const [bulkProgress, setBulkProgress] = useState<{done:number;total:number}|null>(null);
  const [bulkErrors,   setBulkErrors]   = useState<string[]>([]);

  const saveBulk = async () => {
    setBulkSaving(true);
    setBulkErrors([]);
    const targets = bulkTarget==="all"
      ? students
      : students.filter(s=>bulkLevels.length===0||bulkLevels.includes(s.level||""));
    if (!targets.length) { setBulkSaving(false); return; }
    setBulkProgress({done:0, total:targets.length});

    let successCount = 0;
    const errs:string[] = [];

    for (const s of targets) {
      try {
        const errMsg = await callSaveRpc(s.user_id, bulkForm);
        if (errMsg) errs.push(`${s.full_name}: ${errMsg}`);
        else successCount++;
      } catch(e:any){
        errs.push(`${s.full_name}: ${e?.message}`);
      }
      setBulkProgress(p=>p?{...p,done:p.done+1}:null);
    }

    setBulkProgress(null);
    setBulkErrors(errs);
    setBulkDone(successCount);
    await load();
    setBulkSaving(false);
  };

  // ── level counts for bulk picker
  const lvCounts:Record<string,number> = {};
  students.forEach(s=>{ const lv=s.level||"other"; lvCounts[lv]=(lvCounts[lv]||0)+1; });

  // ══════════════ RENDER ═══════════════════════════════════
  return (
    <div style={{ background:WARM, minHeight:"100%", fontFamily:"system-ui,sans-serif" }}
      onClick={()=>setShowSortDrop(false)}>

      {/* ── Header ── */}
      <div style={{ background:G, padding:"16px", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute",top:0,left:0,right:0,height:3,
          background:`linear-gradient(90deg,${GOLD},#e8c97a,${GOLD})` }} />
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:44,height:44,borderRadius:12,background:`${GOLD}22`,
            border:`1.5px solid ${GOLD}44`,display:"flex",alignItems:"center",justifyContent:"center" }}>
            <BookOpen size={22} color={GOLD} />
          </div>
          <div>
            <div style={{ color:W,fontWeight:800,fontSize:18 }}>Hifdh Daily Revision</div>
            <div style={{ color:GOLD,fontSize:11,fontFamily:"'Amiri',serif",marginTop:2 }}>
              متابعة مراجعة الحفظ اليومية
            </div>
          </div>
          <button onClick={e=>{ e.stopPropagation(); setShowBulk(true); setBulkStep("config"); setBulkDone(null); setBulkForm(defaultForm()); }}
            style={{ marginLeft:"auto", padding:"8px 14px", borderRadius:10,
              background:`linear-gradient(135deg,${GOLD},#e8c97a)`,
              border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:6,
              color:G, fontWeight:800, fontSize:11, flexShrink:0 }}>
            <Sparkles size={13}/> Bulk Assign
          </button>
        </div>
        {/* Stats */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginTop:14 }}>
          {[
            { label:"Students",    value:stats.total,    color:"#93c5fd" },
            { label:"Assigned",    value:stats.assigned, color:GOLD },
            { label:"Done Today",  value:stats.done,     color:"#86efac" },
            { label:"Acknowledged",value:stats.acked,    color:"#c4b5fd" },
          ].map(st=>(
            <div key={st.label} style={{ background:"rgba(255,255,255,.08)",borderRadius:10,
              padding:"8px 6px",textAlign:"center" }}>
              <div style={{ fontSize:20,fontWeight:900,color:st.color }}>{st.value}</div>
              <div style={{ fontSize:9,color:"rgba(255,255,255,.6)",fontWeight:600 }}>{st.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Controls ── */}
      <div style={{ background:W, borderBottom:`1px solid ${BRD}`, padding:"10px 14px" }}>
        {/* Bulk Assign prominent button */}
        <button onClick={e=>{ e.stopPropagation(); setShowBulk(true); setBulkStep("config"); setBulkDone(null); setBulkForm(defaultForm()); }}
          style={{ width:"100%", marginBottom:10, padding:"11px", borderRadius:12,
            background:`linear-gradient(135deg,${G},${GM})`,
            border:"none", cursor:"pointer", display:"flex", alignItems:"center",
            justifyContent:"center", gap:8, color:W, fontWeight:800, fontSize:13 }}>
          <Sparkles size={15} color={GOLD}/> Bulk Assign Program
          <span style={{ fontSize:10, fontWeight:500, opacity:0.8 }}>— all / by level / individual</span>
        </button>
        {/* Search */}
        <div style={{ display:"flex",alignItems:"center",gap:8,background:WARM,
          border:`1px solid ${BRD}`,borderRadius:10,padding:"8px 12px",marginBottom:10 }}>
          <Search size={14} color="#9aab94"/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search by name or student ID…"
            style={{ border:"none",background:"transparent",flex:1,fontSize:13,outline:"none",color:"#374151" }}/>
          {search && <button onClick={()=>setSearch("")} style={{background:"none",border:"none",cursor:"pointer"}}>
            <X size={13} color="#9aab94"/></button>}
        </div>

        {/* Status tabs */}
        <div style={{ display:"flex",gap:6,marginBottom:10,overflowX:"auto" }}>
          {(["all","done","pending","unassigned"] as const).map(f=>(
            <button key={f} onClick={()=>setStatusTab(f)}
              style={{ padding:"5px 12px",borderRadius:20,fontSize:11,fontWeight:700,
                cursor:"pointer",border:"none",flexShrink:0,
                background:statusTab===f?G:BRD, color:statusTab===f?W:"#6b7a6b" }}>
              {f==="all"?"All":f==="done"?"✅ Done":f==="pending"?"⏳ Pending":"⚠ Unassigned"}
            </button>
          ))}
        </div>

        {/* Level pills + Sort */}
        <div style={{ display:"flex",gap:6,alignItems:"center" }}>
          <div style={{ display:"flex",gap:5,flex:1,overflowX:"auto" }}>
            <button onClick={()=>setLevelFilter("all")}
              style={{ padding:"4px 10px",borderRadius:14,fontSize:10,fontWeight:700,
                border:"none",cursor:"pointer",flexShrink:0,
                background:levelFilter==="all"?G:BRD, color:levelFilter==="all"?W:"#6b7a6b" }}>
              All
            </button>
            {LEVELS.map(lv=>(
              <button key={lv} onClick={()=>setLevelFilter(lv===levelFilter?"all":lv)}
                style={{ padding:"4px 10px",borderRadius:14,fontSize:10,fontWeight:700,
                  border:"none",cursor:"pointer",flexShrink:0,
                  background:levelFilter===lv?LV_COLOR[lv]:`${LV_COLOR[lv]}22`,
                  color:levelFilter===lv?W:LV_COLOR[lv] }}>
                {LV_LABEL[lv]}
              </button>
            ))}
          </div>
          {/* Sort dropdown */}
          <div style={{ position:"relative",flexShrink:0 }} onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setShowSortDrop(!showSortDrop)}
              style={{ padding:"6px 10px",borderRadius:10,border:`1px solid ${BRD}`,
                background:W,cursor:"pointer",display:"flex",alignItems:"center",gap:4,
                fontSize:11,fontWeight:700,color:G }}>
              <ArrowUpDown size={12}/>
              {sortKey==="level"?"Level":sortKey==="name"?"Name":"ID"}
            </button>
            {showSortDrop && (
              <div style={{ position:"absolute",right:0,top:"110%",background:W,
                border:`1px solid ${BRD}`,borderRadius:12,boxShadow:"0 4px 20px rgba(0,0,0,.12)",
                zIndex:100,minWidth:140,overflow:"hidden" }}>
                {([["level","By Level"],["name","By Name"],["id","By Student ID"]] as const).map(([k,lbl])=>(
                  <button key={k} onClick={()=>{ setSortKey(k); setShowSortDrop(false); }}
                    style={{ display:"block",width:"100%",padding:"10px 16px",border:"none",
                      textAlign:"left",cursor:"pointer",fontSize:12,
                      fontWeight:sortKey===k?800:500,
                      background:sortKey===k?`${G}10`:W, color:sortKey===k?G:"#374151" }}>
                    {sortKey===k?"✓ ":""}{lbl}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Student List ── */}
      <div style={{ padding:"12px 12px 40px",display:"flex",flexDirection:"column",gap:10 }}>
        {loading ? (
          <div style={{ display:"flex",justifyContent:"center",padding:40 }}>
            <Loader2 size={24} style={{ animation:"spin 1s linear infinite",color:G }}/>
          </div>
        ) : processed.length===0 ? (
          <div style={{ textAlign:"center",padding:40,color:"#9aab94",fontSize:13 }}>No students found</div>
        ) : sortKey==="level" ? (
          // ── Grouped by level ──
          renderGroups(processed)
        ) : (
          processed.map(s=><StudentRow key={s.user_id} s={s}/>)
        )}
      </div>

      {/* ── Bulk Assign Sheet ── */}
      {showBulk && (
        <div onClick={()=>setShowBulk(false)}
          style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:200,
            display:"flex",alignItems:"flex-end" }}>
          <div onClick={e=>e.stopPropagation()}
            style={{ width:"100%",maxWidth:520,margin:"0 auto",background:W,
              borderRadius:"20px 20px 0 0",maxHeight:"90vh",overflow:"hidden",
              display:"flex",flexDirection:"column" }}>
            {/* Sheet header */}
            <div style={{ background:G,borderRadius:"20px 20px 0 0",padding:"12px 18px 14px" }}>
              <div style={{ display:"flex",justifyContent:"center",marginBottom:8 }}>
                <div style={{ width:36,height:4,borderRadius:2,background:"rgba(255,255,255,.25)" }}/>
              </div>
              <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
                <div>
                  <div style={{ color:W,fontWeight:800,fontSize:16 }}>Bulk Assign Program</div>
                  <div style={{ color:GOLD,fontSize:10,marginTop:2 }}>تعيين جماعي لطلاب الحفظ</div>
                </div>
                <button onClick={()=>setShowBulk(false)}
                  style={{ background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,
                    width:32,height:32,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>
                  <X size={16} color={W}/>
                </button>
              </div>
            </div>

            <div style={{ flex:1,overflowY:"auto",padding:"16px 18px 28px" }}>
              {bulkDone!==null ? (
                <div style={{ textAlign:"center",padding:"32px 16px" }}>
                  <div style={{ fontSize:52,marginBottom:12 }}>{bulkDone>0?"✅":"⚠️"}</div>
                  <div style={{ fontWeight:800,fontSize:20,color:G,marginBottom:4 }}>
                    Assigned to {bulkDone} students!
                  </div>
                  {bulkErrors.length>0 && (
                    <div style={{ margin:"12px 0",padding:"10px 14px",borderRadius:12,
                      background:"#fff5f5",border:"1px solid #fca5a5",textAlign:"left" }}>
                      <div style={{ fontSize:11,fontWeight:800,color:"#dc2626",marginBottom:6 }}>
                        ⚠️ {bulkErrors.length} failed — run the SQL migration for full scheduling support
                      </div>
                      <div style={{ fontSize:10,color:"#dc2626",maxHeight:120,overflowY:"auto" }}>
                        {bulkErrors.slice(0,5).map((e,i)=><div key={i} style={{marginBottom:2}}>{e}</div>)}
                        {bulkErrors.length>5&&<div>…and {bulkErrors.length-5} more</div>}
                      </div>
                    </div>
                  )}
                  <div style={{ fontSize:13,color:"#9aab94",marginBottom:24 }}>
                    Program starts {bulkForm.program_start_date}
                  </div>
                  <button onClick={()=>setShowBulk(false)}
                    style={{ padding:"12px 32px",borderRadius:12,border:"none",
                      background:G,color:W,fontWeight:800,fontSize:14,cursor:"pointer" }}>
                    Done
                  </button>
                </div>
              ) : bulkStep==="confirm" ? (
                <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
                  <div style={{ padding:"14px 16px",borderRadius:14,background:`${G}0d`,border:`1px solid ${G}20` }}>
                    <div style={{ fontSize:11,fontWeight:800,color:G,marginBottom:10 }}>Confirm Assignment</div>
                    {[
                      ["Target", bulkTarget==="all"
                        ? `All ${bulkStudents.length} students`
                        : `${bulkStudents.length} students — ${bulkLevels.map(l=>LV_LABEL[l]).join(", ")}`],
                      ["Scope",  `${bulkForm.mode==="juz"?"Juz":bulkForm.mode==="hizb"?"Hizb":"Surah"} ${bulkForm.selected_items.join(", ")}`],
                      ["Daily",  `${bulkForm.daily_pages===0.5?"½":bulkForm.daily_pages} page${bulkForm.daily_pages!==1?"s":""}/day`],
                      ["Starts", bulkForm.program_start_date],
                      ["Duration", `${bulkForm.program_duration_days} active days`],
                      ["Rest days", bulkForm.rest_days.length?bulkForm.rest_days.map(d=>DAY_NAMES[d]).join(", "):"None"],
                    ].map(([k,v])=>(
                      <div key={k} style={{ display:"flex",justifyContent:"space-between",
                        fontSize:12,marginBottom:6 }}>
                        <span style={{ color:"#9aab94" }}>{k}</span>
                        <span style={{ fontWeight:700,color:"#374151" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:"flex",gap:10 }}>
                    <button onClick={()=>setBulkStep("config")}
                      style={{ flex:1,padding:12,borderRadius:12,border:`1px solid ${BRD}`,
                        background:W,cursor:"pointer",fontWeight:700,fontSize:13 }}>
                      ← Back
                    </button>
                    <button onClick={saveBulk} disabled={bulkSaving}
                      style={{ flex:2,padding:12,borderRadius:12,border:"none",
                        background:`linear-gradient(135deg,${G},${GM})`,
                        color:W,fontWeight:800,fontSize:13,cursor:"pointer" }}>
                      {bulkSaving
                        ? bulkProgress
                          ? `Saving ${bulkProgress.done}/${bulkProgress.total}…`
                          : "Preparing…"
                        : `✅ Assign to ${bulkStudents.length} Students`}
                    </button>
                  </div>
                </div>
              ) : (
                /* Config form */
                <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
                  {/* Target */}
                  <div>
                    <SectionLabel>ASSIGN TO</SectionLabel>
                    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
                      {([
                        {k:"all",   icon:"👥", title:"All Students",  desc:`${students.length} students`},
                        {k:"level", icon:"🎓", title:"By Level",      desc:"Choose levels below"},
                      ] as {k:"all"|"level";icon:string;title:string;desc:string}[]).map(opt=>(
                        <button key={opt.k} onClick={()=>setBulkTarget(opt.k)}
                          style={{ padding:"10px 12px",borderRadius:12,cursor:"pointer",textAlign:"left",
                            border:`2px solid ${bulkTarget===opt.k?G:BRD}`,
                            background:bulkTarget===opt.k?`${G}0d`:W }}>
                          <div style={{ fontSize:20 }}>{opt.icon}</div>
                          <div style={{ fontSize:12,fontWeight:800,color:G,marginTop:4 }}>{opt.title}</div>
                          <div style={{ fontSize:10,color:"#9aab94" }}>{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                    {bulkTarget==="level" && (
                      <div style={{ marginTop:10,display:"flex",flexDirection:"column",gap:6 }}>
                        {LEVELS.map(lv=>{
                          const active=bulkLevels.includes(lv);
                          return (
                            <button key={lv} onClick={()=>setBulkLevels(
                              active?bulkLevels.filter(x=>x!==lv):[...bulkLevels,lv])}
                              style={{ padding:"10px 14px",borderRadius:12,cursor:"pointer",
                                display:"flex",alignItems:"center",gap:10,
                                border:`2px solid ${active?LV_COLOR[lv]:BRD}`,
                                background:active?`${LV_COLOR[lv]}10`:W }}>
                              <div style={{ width:10,height:10,borderRadius:"50%",
                                background:active?LV_COLOR[lv]:BRD }}/>
                              <span style={{ flex:1,textAlign:"left",fontSize:13,fontWeight:700,
                                color:active?LV_COLOR[lv]:"#374151" }}>{LV_LABEL[lv]}</span>
                              <span style={{ fontSize:11,color:"#9aab94" }}>{lvCounts[lv]||0} students</span>
                              {active&&<span>✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <ProgramFields form={bulkForm} setForm={setBulkForm}/>
                  <button onClick={()=>setBulkStep("confirm")}
                    disabled={bulkForm.selected_items.length===0||bulkStudents.length===0}
                    style={{ padding:14,borderRadius:12,border:"none",
                      background:`linear-gradient(135deg,${G},${GM})`,
                      color:W,fontWeight:800,fontSize:14,cursor:"pointer",
                      opacity:bulkForm.selected_items.length===0||bulkStudents.length===0?0.5:1 }}>
                    Review for {bulkStudents.length} students →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  /* ── Grouped render ── */
  function renderGroups(list:Student[]) {
    const groups:Record<string,Student[]> = {};
    list.forEach(s=>{ const lv=s.level||"other"; (groups[lv]=groups[lv]||[]).push(s); });
    return [...LEVELS,"other"].filter(lv=>groups[lv]?.length).map(lv=>(
      <div key={lv}>
        <div style={{ display:"flex",alignItems:"center",gap:8,margin:"14px 0 6px",paddingLeft:4 }}>
          <div style={{ width:8,height:8,borderRadius:"50%",background:LV_COLOR[lv]||"#9aab94" }}/>
          <span style={{ fontSize:11,fontWeight:800,color:LV_COLOR[lv]||"#9aab94",
            textTransform:"uppercase",letterSpacing:1 }}>
            {LV_LABEL[lv]||lv} ({groups[lv].length})
          </span>
          <div style={{ flex:1,height:1,background:BRD }}/>
        </div>
        {groups[lv].map(s=><StudentRow key={s.user_id} s={s}/>)}
      </div>
    ));
  }

  /* ── StudentRow ── */
  function StudentRow({ s }:{ s:Student }) {
    const log    = s.todayLog;
    const assign = s.assignment;
    const isDone = !!log?.completed;
    const isAcked= !!log?.acknowledged_at;
    const isOpen = expanded===s.user_id;
    const pg     = assign ? todayPage(assign) : null;

    return (
      <div style={{ background:W,border:`1px solid ${BRD}`,borderRadius:16,overflow:"hidden",
        boxShadow:isDone?"0 0 0 2px #16a34a33":"0 1px 6px rgba(0,0,0,.05)" }}>

        {/* Row header */}
        <div style={{ padding:"12px 14px",display:"flex",alignItems:"center",gap:10,cursor:"pointer" }}
          onClick={()=>setExpanded(isOpen?null:s.user_id)}>
          <div style={{ width:10,height:10,borderRadius:"50%",flexShrink:0,
            background:isAcked?"#7c3aed":isDone?"#16a34a":assign?"#f59e0b":"#e5e7eb" }}/>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ fontWeight:700,fontSize:13,color:"#111827",
              whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>
              {s.full_name}
            </div>
            <div style={{ fontSize:10,color:"#9aab94",marginTop:1,display:"flex",gap:5,alignItems:"center" }}>
              <span>{s.student_id}</span>
              {s.level && (
                <span style={{ background:`${LV_COLOR[s.level]||"#888"}18`,
                  color:LV_COLOR[s.level]||"#888",padding:"1px 6px",borderRadius:6,
                  fontWeight:700,fontSize:9 }}>
                  {LV_LABEL[s.level]||s.level}
                </span>
              )}
            </div>
          </div>
          {/* Page badge */}
          {pg && !isDone && (
            <div style={{ padding:"2px 7px",borderRadius:8,fontSize:10,fontWeight:800,
              background:`${GOLD}18`,color:GOLD,flexShrink:0 }}>
              📄 P{pg.page}
            </div>
          )}
          {log?.avg_score!=null && (
            <div style={{ padding:"2px 7px",borderRadius:8,fontSize:11,fontWeight:800,flexShrink:0,
              background:`${scoreColor(log.avg_score)}18`,color:scoreColor(log.avg_score) }}>
              {log.avg_score}%
            </div>
          )}
          <div style={{ padding:"3px 9px",borderRadius:8,fontSize:10,fontWeight:700,flexShrink:0,
            background:isAcked?"#7c3aed18":isDone?"#16a34a18":assign?"#f59e0b18":"#f3f4f6",
            color:isAcked?"#7c3aed":isDone?"#16a34a":assign?"#b45309":"#9aab94" }}>
            {isAcked?"✓ Acked":isDone?"Done":assign?"Pending":"No task"}
          </div>
          {isOpen?<ChevronUp size={14} color="#9aab94"/>:<ChevronDown size={14} color="#9aab94"/>}
        </div>

        {/* Expanded */}
        {isOpen && (
          <div style={{ borderTop:`1px solid ${BRD}`,padding:"12px 14px",
            background:WARM,display:"flex",flexDirection:"column",gap:10 }}>

            {/* Progress bar */}
            {pg && (
              <div style={{ background:W,border:`1px solid ${BRD}`,borderRadius:12,padding:"10px 12px" }}>
                <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:11 }}>
                  <span style={{ fontWeight:800,color:G }}>📅 Program Progress</span>
                  <span style={{ color:"#9aab94" }}>Today: Page <strong style={{color:G}}>{pg.page}</strong> / {pg.total}</span>
                </div>
                <div style={{ height:6,background:BRD,borderRadius:4,overflow:"hidden" }}>
                  <div style={{ height:"100%",width:`${pg.pct}%`,
                    background:`linear-gradient(90deg,${G},${GM})`,borderRadius:4 }}/>
                </div>
                <div style={{ textAlign:"right",fontSize:10,color:"#9aab94",marginTop:3 }}>{pg.pct}% complete</div>
              </div>
            )}

            {/* Assignment header */}
            <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8 }}>
              <div>
                <div style={{ fontSize:10,fontWeight:800,color:GOLD,letterSpacing:1,
                  textTransform:"uppercase",marginBottom:4 }}>Assignment</div>
                {assign ? (
                  <div style={{ fontSize:12,color:"#374151" }}>
                    <strong>{assign.mode==="juz"?"Juz":assign.mode==="hizb"?"Hizb":"Surah"}</strong>{" "}
                    {assign.selected_items.join(", ")} · {assign.daily_pages} page{assign.daily_pages!==1?"s":""}/day
                    {assign.program_start_date && (
                      <div style={{ fontSize:10,color:"#9aab94",marginTop:2 }}>
                        Starts {assign.program_start_date} · {assign.program_duration_days??30} days ·
                        Rest: {(assign.rest_days??[0]).map((d:number)=>DAY_NAMES[d]).join(", ")}
                      </div>
                    )}
                    {assign.notes&&<div style={{ fontSize:11,color:"#6b7280",marginTop:3 }}>{assign.notes}</div>}
                  </div>
                ) : (
                  <div style={{ fontSize:12,color:"#9aab94" }}>Not assigned yet</div>
                )}
              </div>
              <button onClick={()=>{
                setShowAssign(showAssign===s.user_id?null:s.user_id);
                setIndForm({
                  mode:assign?.mode??"juz", selected_items:assign?.selected_items??[1],
                  daily_pages:assign?.daily_pages??1, reciter_id:assign?.reciter_id??"Alafasy_128kbps",
                  notes:assign?.notes??"", program_start_date:assign?.program_start_date??todayStr(),
                  rest_days:assign?.rest_days??[0], program_duration_days:assign?.program_duration_days??30,
                  start_page:assign?.start_page??1,
                });
                setSaveErr(null);
              }}
                style={{ padding:"5px 10px",borderRadius:8,border:`1px solid ${BRD}`,
                  background:W,cursor:"pointer",fontSize:11,fontWeight:700,color:G,
                  display:"flex",alignItems:"center",gap:4,flexShrink:0 }}>
                {assign?<Edit2 size={11}/>:<Plus size={11}/>}
                {assign?"Edit":"Assign"}
              </button>
            </div>

            {/* Individual assign form */}
            {showAssign===s.user_id && (
              <div style={{ background:W,border:`1px solid ${BRD}`,borderRadius:14,padding:14 }}>
                <div style={{ fontSize:12,fontWeight:800,color:G,marginBottom:12 }}>
                  {assign?"Update Assignment":"New Assignment"}
                </div>
                <ProgramFields form={indForm} setForm={setIndForm}/>
                {saveErr && (
                  <div style={{ padding:"8px 12px",borderRadius:8,background:"#fff5f5",
                    border:"1px solid #fca5a5",fontSize:11,color:"#dc2626",marginBottom:8,marginTop:8 }}>
                    ⚠️ {saveErr}
                  </div>
                )}
                <div style={{ display:"flex",gap:8,marginTop:10 }}>
                  <button onClick={()=>saveIndividual(s.user_id)} disabled={saving}
                    style={{ flex:1,padding:10,borderRadius:10,border:"none",
                      background:`linear-gradient(135deg,${G},${GM})`,
                      color:W,fontWeight:800,fontSize:12,cursor:"pointer" }}>
                    {saving?"Saving…":"Save Assignment"}
                  </button>
                  <button onClick={()=>{ setShowAssign(null); setSaveErr(null); }}
                    style={{ padding:"10px 14px",borderRadius:10,border:`1px solid ${BRD}`,
                      background:W,cursor:"pointer",fontSize:12 }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Today's session */}
            {log ? (
              <div>
                <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8 }}>
                  <div style={{ fontSize:10,fontWeight:800,color:GOLD,letterSpacing:1,textTransform:"uppercase" }}>
                    Today's Session
                  </div>
                  <button onClick={()=>setExpandSess(expandSess===log.id?null:log.id)}
                    style={{ fontSize:10,color:G,fontWeight:700,background:"none",
                      border:`1px solid ${BRD}`,padding:"3px 8px",borderRadius:8,cursor:"pointer" }}>
                    {expandSess===log.id?"Hide ▲":"Detail ▼"}
                  </button>
                </div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10 }}>
                  {[
                    { label:"Pages",   value:log.pages_revised??"—" },
                    { label:"AI Score",value:log.avg_score!=null?`${log.avg_score}%`:"—",
                      color:log.avg_score!=null?scoreColor(log.avg_score):"#9aab94" },
                    { label:"Time",    value:log.duration_secs?fmtSecs(log.duration_secs):"—" },
                  ].map(stat=>(
                    <div key={stat.label} style={{ background:W,border:`1px solid ${BRD}`,
                      borderRadius:10,padding:8,textAlign:"center" }}>
                      <div style={{ fontSize:16,fontWeight:800,color:(stat as any).color||G }}>{stat.value}</div>
                      <div style={{ fontSize:9,color:"#9aab94",fontWeight:600 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
                {/* Grade override */}
                <div style={{ marginBottom:10,padding:"10px 12px",borderRadius:12,
                  background:"#fff7ed",border:"1px solid #fed7aa" }}>
                  <div style={{ fontSize:10,fontWeight:800,color:"#b45309",marginBottom:8 }}>✏️ Grade Override</div>
                  <div style={{ display:"flex",gap:5,flexWrap:"wrap" }}>
                    {[100,90,80,70,60,50].map(g=>(
                      <button key={g} onClick={()=>gradeOverride(log.id,s.user_id,g)}
                        disabled={grading===log.id}
                        style={{ padding:"5px 10px",borderRadius:8,border:"none",cursor:"pointer",
                          fontWeight:800,fontSize:11,
                          background:log.avg_score===g?"#b45309":"#fed7aa",
                          color:log.avg_score===g?W:"#92400e" }}>
                        {g}%
                      </button>
                    ))}
                    <div style={{ display:"flex",gap:4,flex:1,minWidth:100 }}>
                      <input type="number" min={0} max={100} value={manualGrade[log.id]||""}
                        onChange={e=>setManualGrade(m=>({...m,[log.id]:e.target.value}))}
                        placeholder="Custom"
                        style={{ flex:1,padding:"5px 8px",borderRadius:8,border:"1px solid #fed7aa",
                          fontSize:12,background:W,color:"#92400e" }}/>
                      <button onClick={()=>gradeOverride(log.id,s.user_id,parseInt(manualGrade[log.id]||"0"))}
                        disabled={!manualGrade[log.id]||grading===log.id}
                        style={{ padding:"5px 10px",borderRadius:8,border:"none",cursor:"pointer",
                          background:"#b45309",color:W,fontWeight:800,fontSize:11 }}>
                        Set
                      </button>
                    </div>
                  </div>
                </div>
                {/* Audio + transcript */}
                {expandSess===log.id && log.session_data && (
                  <div style={{ marginBottom:10,display:"flex",flexDirection:"column",gap:8 }}>
                    {log.session_data.audio_path && (
                      <div style={{ padding:"10px 14px",borderRadius:12,background:`${G}0d`,
                        border:`1px solid ${G}22`,display:"flex",alignItems:"center",gap:10 }}>
                        <div style={{ width:38,height:38,borderRadius:10,background:G,
                          display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                          <Volume2 size={18} color={GOLD}/>
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:11,fontWeight:800,color:G }}>Student's Recitation</div>
                          <div style={{ fontSize:9,color:"#9aab94",marginTop:1 }}>Tap to listen</div>
                        </div>
                        <button onClick={()=>playAudio(log.id,log.session_data.audio_path)}
                          disabled={audioLoad===log.id}
                          style={{ width:44,height:44,borderRadius:12,border:"none",cursor:"pointer",
                            display:"flex",alignItems:"center",justifyContent:"center",
                            background:audioPlay===log.id?"#dc2626":`linear-gradient(135deg,${G},${GM})` }}>
                          {audioLoad===log.id
                            ?<Loader2 size={18} color={GOLD} style={{animation:"spin 1s linear infinite"}}/>
                            :audioPlay===log.id?<Pause size={18} color={GOLD}/>:<Play size={18} color={GOLD}/>}
                        </button>
                      </div>
                    )}
                    {log.session_data.transcript && (
                      <div style={{ padding:"10px 12px",borderRadius:12,background:"#f8f8f8",border:`1px solid ${BRD}` }}>
                        <div style={{ fontSize:10,fontWeight:800,color:G,marginBottom:6 }}>🎙 Transcript</div>
                        <p style={{ fontSize:14,color:"#1a1a1a",lineHeight:2.2,direction:"rtl",
                          fontFamily:"'Amiri',serif",textAlign:"right",wordBreak:"break-word" }}>
                          {log.session_data.transcript}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {/* Acknowledge */}
                {isAcked ? (
                  <div style={{ display:"flex",alignItems:"center",gap:8,padding:"10px 12px",
                    borderRadius:10,background:"#f3e8ff",border:"1px solid #c4b5fd" }}>
                    <CheckCircle2 size={16} color="#7c3aed"/>
                    <div>
                      <div style={{ fontSize:11,fontWeight:700,color:"#7c3aed" }}>Acknowledged ✓</div>
                      {log.ack_note&&<div style={{ fontSize:10,color:"#6b7280" }}>{log.ack_note}</div>}
                    </div>
                  </div>
                ) : (
                  <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                    <textarea value={ackNote[log.id]||""}
                      onChange={e=>setAckNote(n=>({...n,[log.id]:e.target.value}))}
                      placeholder="Optional note (e.g. MashaAllah, well done!)" rows={2}
                      style={{ width:"100%",padding:"8px 10px",borderRadius:8,border:`1.5px solid ${BRD}`,
                        fontSize:12,color:"#374151",background:W,resize:"none",boxSizing:"border-box" }}/>
                    <button onClick={()=>acknowledge(log,s.user_id)} disabled={ackLoading===log.id}
                      style={{ padding:10,borderRadius:10,border:"none",background:"#7c3aed",
                        color:W,fontWeight:800,fontSize:13,cursor:"pointer",
                        display:"flex",alignItems:"center",justifyContent:"center",gap:6 }}>
                      {ackLoading===log.id
                        ?<Loader2 size={14} style={{animation:"spin 1s linear infinite"}}/>
                        :<Check size={14}/>}
                      Acknowledge Session
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding:"10px 12px",borderRadius:10,background:"#fff7ed",
                border:"1px solid #fed7aa",display:"flex",alignItems:"center",gap:8 }}>
                <Clock size={14} color="#f59e0b"/>
                <span style={{ fontSize:12,color:"#92400e",fontWeight:600 }}>
                  {assign?"Not revised yet today":"Assign a task first"}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
}

/* ── Section label ── */
function SectionLabel({ children }:{ children:React.ReactNode }) {
  return <div style={{ fontSize:10,fontWeight:800,color:"#9aab94",marginBottom:6 }}>{children}</div>;
}

/* ════════════════════════════════════════════════════════
   ProgramFields — shared by individual + bulk assign form
   ════════════════════════════════════════════════════════ */
// Pages per unit in standard Madani Mushaf (604 pages total)
const PAGES_PER_JUZ  = 20;   // 30 juz × 20 = 600 ≈ 604
const PAGES_PER_HIZB = 10;   // 60 hizb × 10 = 600

// Approximate pages per surah (Madani Mushaf, rounded to nearest 0.5)
const SURAH_PAGES: Record<number,number> = {
  1:0.5,  2:48,  3:30,  4:29,  5:24,  6:24,  7:25,  8:10,  9:25, 10:18,
  11:18, 12:17, 13:10, 14:10, 15:8,  16:19, 17:16, 18:14, 19:11, 20:14,
  21:13, 22:12, 23:11, 24:13, 25:9,  26:12, 27:11, 28:14, 29:9,  30:8,
  31:6,  32:4,  33:12, 34:8,  35:8,  36:6,  37:9,  38:6,  39:9,  40:9,
  41:7,  42:7,  43:7,  44:4,  45:5,  46:5,  47:5,  48:5,  49:3,  50:3,
  51:3,  52:3,  53:3,  54:3,  55:4,  56:4,  57:5,  58:5,  59:5,  60:4,
  61:3,  62:2,  63:2,  64:3,  65:3,  66:3,  67:3,  68:3,  69:3,  70:2,
  71:2,  72:2,  73:2,  74:3,  75:2,  76:2,  77:2,  78:2,  79:2,  80:1,
  81:1,  82:1,  83:2,  84:1,  85:1,  86:1,  87:1,  88:1,  89:2,  90:1,
  91:1,  92:1,  93:0.5,94:0.5,95:0.5,96:1, 97:0.5,98:1,  99:0.5,100:1,
  101:0.5,102:0.5,103:0.5,104:0.5,105:0.5,106:0.5,107:0.5,108:0.5,
  109:0.5,110:0.5,111:0.5,112:0.5,113:0.5,114:0.5,
};

function calcTotalPages(mode:"juz"|"hizb"|"surah", items:number[]): number {
  if (!items.length) return 0;
  if (mode==="juz")  return items.length * PAGES_PER_JUZ;
  if (mode==="hizb") return items.length * PAGES_PER_HIZB;
  return items.reduce((sum,n)=>sum+(SURAH_PAGES[n]??2),0);
}

function ProgramFields({ form, setForm }:{
  form:PForm; setForm:(f:PForm|((p:PForm)=>PForm))=>void;
}) {
  const G    = "#1a3d24"; const GM="#276749"; const W="#ffffff";
  const WARM = "#faf8f4"; const BRD="#e8ddd0"; const GOLD="#c9a84c";
  const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  const set = (patch:Partial<PForm>) => setForm(f=>({...f,...patch}));
  const toggleRest = (d:number) =>
    set({ rest_days: form.rest_days.includes(d)
      ? form.rest_days.filter(x=>x!==d)
      : [...form.rest_days,d].sort() });

  // Auto-calculate duration whenever mode / items / daily_pages change
  const totalPages  = calcTotalPages(form.mode, form.selected_items);
  const autoDays    = totalPages>0 ? Math.ceil(totalPages/form.daily_pages) : null;

  // Keep form in sync when auto changes
  useEffect(()=>{
    if (autoDays!==null) setForm(f=>({...f,program_duration_days:autoDays}));
  },[autoDays]);

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:12 }}>

      {/* Mode */}
      <div>
        <div style={{ fontSize:10,fontWeight:800,color:"#9aab94",marginBottom:6 }}>SCOPE</div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6 }}>
          {(["juz","hizb","surah"] as const).map(m=>(
            <button key={m} onClick={()=>set({mode:m,selected_items:[1]})}
              style={{ padding:"8px 4px",borderRadius:10,border:`2px solid ${form.mode===m?G:BRD}`,
                background:form.mode===m?G:WARM,color:form.mode===m?W:"#374151",
                fontSize:12,fontWeight:700,cursor:"pointer" }}>
              {m==="juz"?"Juz":m==="hizb"?"Hizb":"Surah"}
            </button>
          ))}
        </div>
      </div>

      {/* Items */}
      <div>
        <div style={{ fontSize:10,fontWeight:800,color:"#9aab94",marginBottom:4 }}>
          {form.mode==="juz"?"Juz (1–30)":form.mode==="hizb"?"Hizb (1–60)":"Surah numbers"} — comma separated
        </div>
        <input value={(form.selected_items||[]).join(",")}
          onChange={e=>{
            const nums=e.target.value.split(",").map(n=>parseInt(n.trim())).filter(n=>!isNaN(n));
            set({selected_items:nums});
          }}
          placeholder="e.g. 1,2,3"
          style={{ width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${BRD}`,
            fontSize:13,color:G,background:WARM,boxSizing:"border-box" }}/>
      </div>

      {/* Daily pages */}
      <div>
        <div style={{ fontSize:10,fontWeight:800,color:"#9aab94",marginBottom:6 }}>PAGES PER DAY</div>
        <div style={{ display:"flex",gap:6 }}>
          {[0.5,1,2,3,5].map(p=>(
            <button key={p} onClick={()=>set({daily_pages:p})}
              style={{ flex:1,padding:"9px 4px",borderRadius:10,
                border:`2px solid ${form.daily_pages===p?G:BRD}`,
                background:form.daily_pages===p?G:WARM,
                color:form.daily_pages===p?W:"#374151",
                fontSize:12,fontWeight:800,cursor:"pointer" }}>
              {p===0.5?"½":p}
            </button>
          ))}
        </div>
      </div>

      {/* Program start */}
      <div>
        <div style={{ fontSize:10,fontWeight:800,color:"#9aab94",marginBottom:4 }}>PROGRAM START DATE</div>
        <input type="date" value={form.program_start_date}
          onChange={e=>set({program_start_date:e.target.value})}
          style={{ width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${BRD}`,
            fontSize:13,color:G,background:WARM,boxSizing:"border-box" }}/>
      </div>

      {/* Start page */}
      <div>
        <div style={{ fontSize:10,fontWeight:800,color:"#9aab94",marginBottom:4 }}>START FROM PAGE #</div>
        <input type="number" min={1} value={form.start_page}
          onChange={e=>set({start_page:parseInt(e.target.value)||1})}
          style={{ width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${BRD}`,
            fontSize:13,color:G,background:WARM,boxSizing:"border-box" }}/>
        <div style={{ fontSize:10,color:"#9aab94",marginTop:3 }}>Page 1 = first page of assigned Juz/Surah</div>
      </div>

      {/* Duration — auto-calculated */}
      <div style={{ background:`${G}08`,border:`1.5px solid ${G}20`,borderRadius:12,padding:"12px 14px" }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6 }}>
          <div style={{ fontSize:10,fontWeight:800,color:G }}>PROGRAM DURATION</div>
          <div style={{ fontSize:10,color:GOLD,fontWeight:700 }}>✨ Auto-calculated</div>
        </div>
        {/* Calculation breakdown */}
        <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:10,
          fontSize:12,color:"#374151",flexWrap:"wrap" }}>
          <span style={{ background:W,border:`1px solid ${BRD}`,borderRadius:8,
            padding:"4px 10px",fontWeight:700,color:G }}>
            {form.selected_items.length} {form.mode==="juz"?"Juz":form.mode==="hizb"?"Hizb":"Surah"}
          </span>
          <span style={{ color:"#9aab94" }}>×</span>
          <span style={{ background:W,border:`1px solid ${BRD}`,borderRadius:8,
            padding:"4px 10px",fontWeight:700,color:G }}>
            {form.mode==="juz"?"20 pages":form.mode==="hizb"?"10 pages":"~"+totalPages+" pages"}
          </span>
          <span style={{ color:"#9aab94" }}>÷</span>
          <span style={{ background:W,border:`1px solid ${BRD}`,borderRadius:8,
            padding:"4px 10px",fontWeight:700,color:G }}>
            {form.daily_pages===0.5?"½":form.daily_pages} page/day
          </span>
          <span style={{ color:"#9aab94" }}>=</span>
          <span style={{ fontWeight:900,fontSize:16,color:G }}>
            {autoDays??form.program_duration_days} days
          </span>
        </div>
        {/* Result display */}
        <div style={{ background:W,border:`1px solid ${BRD}`,borderRadius:10,
          padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:22,fontWeight:900,color:G }}>
              {form.program_duration_days} days
            </div>
            <div style={{ fontSize:10,color:"#9aab94" }}>
              {totalPages} total pages · finishes in ~{Math.ceil(form.program_duration_days/30)} month{form.program_duration_days>30?"s":""}
            </div>
          </div>
          <div style={{ fontSize:28 }}>
            {form.program_duration_days<=30?"📅":form.program_duration_days<=60?"📆":"🗓️"}
          </div>
        </div>
        {/* Manual override */}
        <div style={{ marginTop:8,display:"flex",alignItems:"center",gap:8 }}>
          <span style={{ fontSize:10,color:"#9aab94" }}>Override:</span>
          <input type="number" min={1} value={form.program_duration_days}
            onChange={e=>set({program_duration_days:parseInt(e.target.value)||1})}
            style={{ width:70,padding:"5px 8px",borderRadius:8,border:`1px solid ${BRD}`,
              fontSize:12,color:G,background:WARM,textAlign:"center" }}/>
          <span style={{ fontSize:10,color:"#9aab94" }}>days (optional)</span>
        </div>
      </div>

      {/* Rest days */}
      <div>
        <div style={{ fontSize:10,fontWeight:800,color:"#9aab94",marginBottom:6 }}>REST DAYS (no revision)</div>
        <div style={{ display:"flex",gap:5 }}>
          {[0,1,2,3,4,5,6].map(d=>{
            const on=form.rest_days.includes(d);
            return (
              <button key={d} onClick={()=>toggleRest(d)}
                style={{ flex:1,padding:"7px 0",borderRadius:10,
                  border:`2px solid ${on?"#ef4444":BRD}`,
                  background:on?"#fee2e2":WARM,
                  color:on?"#dc2626":"#374151",
                  fontSize:10,fontWeight:800,cursor:"pointer" }}>
                {DAY_NAMES[d]}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize:10,color:"#9aab94",marginTop:4 }}>
          {form.rest_days.length===0
            ?"Revision every day — no rest"
            :`${form.rest_days.map(d=>DAY_NAMES[d]).join(", ")} off`}
        </div>
      </div>

      {/* Note */}
      <div>
        <div style={{ fontSize:10,fontWeight:800,color:"#9aab94",marginBottom:4 }}>NOTE (OPTIONAL)</div>
        <textarea value={form.notes} onChange={e=>set({notes:e.target.value})}
          placeholder="Note for student…" rows={2}
          style={{ width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${BRD}`,
            fontSize:12,color:"#374151",background:WARM,resize:"none",boxSizing:"border-box" }}/>
      </div>
    </div>
  );
}
