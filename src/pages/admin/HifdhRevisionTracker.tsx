// src/pages/admin/HifdhRevisionTracker.tsx
// Also usable as teacher page — role-aware
// Shows all students, their daily assignment, today's completion, and acknowledgment

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "@/integrations/supabase/storageClient";
import {
  BookOpen, Check, Clock, AlertTriangle, Search, ChevronDown,
  ChevronUp, Loader2, Plus, X, Edit2, CheckCircle2, Eye,
  Play, Pause, Volume2
} from "lucide-react";

const G    = "#1a3d24";
const GM   = "#276749";
const GOLD = "#c9a84c";
const W    = "#ffffff";
const WARM = "#faf8f4";
const BRD  = "#e8ddd0";

interface Student {
  user_id: string; full_name: string; student_id: string; level: string | null;
  assignment?: Assignment; todayLog?: DailyLog;
}
interface Assignment {
  id: string; mode: "juz"|"hizb"|"surah"; selected_items: number[];
  daily_pages: number; reciter_id: string; active: boolean; notes?: string;
}
interface DailyLog {
  id: string; log_date: string; pages_revised: number; avg_score: number | null;
  duration_secs: number; completed: boolean;
  acknowledged_by: string | null; acknowledged_at: string | null; ack_note: string | null;
}

const SURAHS: Record<number,string> = {
  1:"الفاتحة",2:"البقرة",3:"آل عمران",4:"النساء",5:"المائدة",6:"الأنعام",
  7:"الأعراف",8:"الأنفال",9:"التوبة",10:"يونس",36:"يس",55:"الرحمن",
  67:"الملك",78:"النبأ",112:"الإخلاص",113:"الفلق",114:"الناس"
};
const fmtSecs = (s: number) => `${Math.floor(s/60)}m ${s%60}s`;
const today   = () => new Date().toISOString().split("T")[0];

export default function HifdhRevisionTracker() {
  const [role,        setRole]        = useState<"admin"|"teacher"|null>(null);
  const [userId,      setUserId]      = useState<string|null>(null);
  const [students,    setStudents]    = useState<Student[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [filter,      setFilter]      = useState<"all"|"done"|"pending"|"unassigned">("all");
  const [expanded,    setExpanded]    = useState<string|null>(null);
  const [ackLoading,    setAckLoading]    = useState<string|null>(null);
  const [ackNote,       setAckNote]       = useState<Record<string,string>>({});
  const [manualGrade,   setManualGrade]   = useState<Record<string,string>>({});
  const [grading,       setGrading]       = useState<string|null>(null);
  const [expandSession, setExpandSession] = useState<string|null>(null);
  const [audioPlaying,  setAudioPlaying]  = useState<string|null>(null);  // log id being played
  const [audioLoading,  setAudioLoading]  = useState<string|null>(null);
  const audioElRef = useRef<HTMLAudioElement|null>(null);
  const [showAssign,  setShowAssign]  = useState<string|null>(null);
  const [assignForm,  setAssignForm]  = useState<Partial<Assignment>>({
    mode:"juz", selected_items:[1], daily_pages:1, reciter_id:"Alafasy_128kbps"
  });
  const [savingAssign, setSavingAssign] = useState(false);
  const [saveError,    setSaveError]    = useState<string|null>(null);
  // ── Sort + Bulk Assign state ────────────────────────────────────────
  const [sortBy, setSortBy] = useState<"name"|"level"|"student_id">("level");
  const [showBulk, setShowBulk] = useState(false);
  const [bulkForm, setBulkForm] = useState({
    target_scope: "level" as "individual"|"level"|"group"|"all",
    target_value: "beginner",
    mode: "juz" as "juz"|"hizb"|"surah",
    selected_items: [1] as number[],
    daily_pages: 1 as number,
    program_days: 30,
    weekend_off: true,
    auto_progress: true,
    notes: "",
  });
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState<string|null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      setUserId(data.user.id);
      supabase.from("profiles").select("role").eq("user_id", data.user.id).single()
        .then(({ data: p }) => { if (p) setRole(p.role as any); });
    });
  }, []);

  const load = useCallback(async () => {
    if (!userId || !role) return;
    setLoading(true);
    try {
      // Fetch students (teacher: via enrollments; admin: all)
      let studentIds: string[] = [];
      if (role === "teacher") {
        const { data: subs } = await supabase.from("subjects").select("id").eq("teacher_id", userId);
        const subIds = (subs||[]).map((s:any)=>s.id);
        if (subIds.length) {
          const { data: enr } = await supabase.from("enrollments").select("user_id").in("subject_id", subIds);
          studentIds = [...new Set((enr||[]).map((e:any)=>e.user_id))];
        }
      }

      const query = supabase.from("profiles").select("user_id,full_name,student_id,level")
        .eq("role","student").order("full_name");
      const { data: profiles } = role === "teacher" && studentIds.length
        ? await query.in("user_id", studentIds)
        : await query;

      if (!profiles) { setLoading(false); return; }
      const ids = profiles.map((p:any) => p.user_id);

      // Fetch active assignments
      const { data: assignments } = await supabase
        .from("hifdh_daily_assignments" as any)
        .select("*").eq("active", true).in("student_id", ids);

      // Fetch today's logs
      const { data: logs } = await supabase
        .from("hifdh_daily_logs" as any)
        .select("*").eq("log_date", today()).in("student_id", ids);

      const aMap: Record<string,Assignment> = {};
      (assignments||[]).forEach((a:any) => { aMap[a.student_id] = a; });
      const lMap: Record<string,DailyLog> = {};
      (logs||[]).forEach((l:any) => { lMap[l.student_id] = l; });

      setStudents(profiles.map((p:any) => ({
        ...p,
        assignment: aMap[p.user_id],
        todayLog:   lMap[p.user_id],
      })));
    } catch(e) { console.error(e); }
    setLoading(false);
  }, [userId, role]);

  useEffect(() => { load(); }, [load]);

  const acknowledge = async (log: DailyLog, studentId: string) => {
    setAckLoading(log.id);
    try {
      await (supabase as any).rpc("acknowledge_hifdh_log", {
        p_log_id: log.id,
        p_note: ackNote[log.id] || null,
      });
      setStudents(prev => prev.map(s =>
        s.user_id === studentId
          ? { ...s, todayLog: { ...s.todayLog!, acknowledged_by: userId!, acknowledged_at: new Date().toISOString(), ack_note: ackNote[log.id]||null } }
          : s
      ));
    } catch(e) { console.error(e); }
    setAckLoading(null);
  };

  const playAudio = async (logId: string, audioPath: string) => {
    // Stop any current playback
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }
    if (audioPlaying === logId) { setAudioPlaying(null); return; }

    setAudioLoading(logId);
    try {
      const { data } = await storageSupabase.storage
        .from("recitation-audio")
        .createSignedUrl(audioPath, 3600);
      if (!data?.signedUrl) throw new Error("No URL");
      const el = new Audio(data.signedUrl);
      audioElRef.current = el;
      el.onended = () => setAudioPlaying(null);
      el.onerror = () => { setAudioPlaying(null); setAudioLoading(null); };
      await el.play();
      setAudioPlaying(logId);
    } catch(e) { console.error("Audio play error:", e); }
    setAudioLoading(null);
  };

  const gradeOverride = async (logId: string, studentId: string, grade: number) => {
    setGrading(logId);
    try {
      const { error } = await (supabase as any)
        .from("hifdh_daily_logs")
        .update({ avg_score: grade })
        .eq("id", logId);
      if (error) throw error;
      setStudents(prev => prev.map(s =>
        s.user_id === studentId
          ? { ...s, todayLog: { ...s.todayLog!, avg_score: grade } }
          : s
      ));
      setManualGrade(m => ({ ...m, [logId]: "" }));
    } catch(e: any) { alert(`Grade failed: ${e?.message}`); }
    setGrading(null);
  };

  const saveAssignment = async (studentId: string) => {
    if (!userId) return;
    setSavingAssign(true);
    setSaveError(null);
    try {
      // Call SECURITY DEFINER RPC — bypasses RLS, validates role server-side
      const { data: newId, error: rpcErr } = await (supabase as any).rpc(
        "save_hifdh_assignment", {
          p_student_id:     studentId,
          p_mode:           assignForm.mode,
          p_selected_items: assignForm.selected_items,
          p_daily_pages:    assignForm.daily_pages,
          p_reciter_id:     assignForm.reciter_id || "Alafasy_128kbps",
          p_notes:          assignForm.notes || null,
        }
      );

      if (rpcErr) {
        console.error("RPC error:", rpcErr);
        setSaveError(`Save failed: ${rpcErr.message}`);
        setSavingAssign(false);
        return;
      }

      console.log("Assignment saved, id:", newId);
      setShowAssign(null);
      await load();
    } catch(e: any) {
      console.error("Unexpected error:", e);
      setSaveError(`Unexpected error: ${e?.message ?? String(e)}`);
    }
    setSavingAssign(false);
  };

  const filtered = students.filter(s => {
    const mq = !search || s.full_name?.toLowerCase().includes(search.toLowerCase())
                       || s.student_id?.toLowerCase().includes(search.toLowerCase());
    const mf = filter === "all"
      ? true
      : filter === "unassigned" ? !s.assignment
      : filter === "done"      ? !!s.todayLog?.completed
      : /* pending */            !!s.assignment && !s.todayLog?.completed;
    return mq && mf;
  }).sort((a,b) => {
    if (sortBy === "level") {
      const order = ["beginner","intermediate","advanced"];
      const ai = order.indexOf((a.level||"").toLowerCase());
      const bi = order.indexOf((b.level||"").toLowerCase());
      const av = ai === -1 ? 99 : ai;
      const bv = bi === -1 ? 99 : bi;
      if (av !== bv) return av - bv;
      return (a.full_name||"").localeCompare(b.full_name||"");
    }
    if (sortBy === "student_id") {
      return (a.student_id||"").localeCompare(b.student_id||"");
    }
    return (a.full_name||"").localeCompare(b.full_name||"");
  });

  const runBulkAssign = async () => {
    setBulkSaving(true); setBulkResult(null);
    try {
      const { data, error } = await (supabase as any).rpc("admin_bulk_assign_hifdh_revision", {
        p_target_scope:   bulkForm.target_scope,
        p_target_value:   bulkForm.target_value,
        p_mode:           bulkForm.mode,
        p_selected_items: bulkForm.selected_items,
        p_daily_pages:    bulkForm.daily_pages,
        p_program_days:   bulkForm.program_days,
        p_weekend_off:    bulkForm.weekend_off,
        p_auto_progress:  bulkForm.auto_progress,
        p_reciter_id:     "Alafasy_128kbps",
        p_notes:          bulkForm.notes || null,
      });
      if (error) throw error;
      setBulkResult(`✅ Assigned to ${data} student${data===1?"":"s"}.`);
      await load();
    } catch (e:any) {
      setBulkResult(`❌ ${e.message}`);
    }
    setBulkSaving(false);
  };

  const stats = {
    total:      students.length,
    assigned:   students.filter(s => s.assignment).length,
    done:       students.filter(s => s.todayLog?.completed).length,
    acked:      students.filter(s => s.todayLog?.acknowledged_at).length,
  };

  const scoreColor = (sc: number) =>
    sc >= 80 ? "#16a34a" : sc >= 60 ? "#b7791f" : "#dc2626";

  return (
    <div style={{ background: WARM, minHeight: "100%", fontFamily: "system-ui,sans-serif" }}>
      {/* ── Header ── */}
      <div style={{ background: G, padding: "16px", position: "relative", overflow: "hidden" }}>
        <div style={{ position:"absolute", top:0, left:0, right:0, height:3,
          background:`linear-gradient(90deg,${GOLD},#e8c97a,${GOLD})` }} />
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:44, height:44, borderRadius:12, background:`${GOLD}22`,
            border:`1.5px solid ${GOLD}44`, display:"flex", alignItems:"center",
            justifyContent:"center" }}>
            <BookOpen size={22} color={GOLD} />
          </div>
          <div>
            <div style={{ color:"#fff", fontWeight:800, fontSize:18 }}>Hifdh Daily Revision</div>
            <div style={{ color:GOLD, fontSize:11, fontFamily:"'Amiri',serif", marginTop:2 }}>
              متابعة مراجعة الحفظ اليومية
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginTop:14 }}>
          {[
            { label:"Students", value:stats.total,    color:"#93c5fd" },
            { label:"Assigned", value:stats.assigned, color:GOLD },
            { label:"Done Today",value:stats.done,    color:"#86efac" },
            { label:"Acknowledged",value:stats.acked, color:"#c4b5fd" },
          ].map(stat => (
            <div key={stat.label} style={{ background:"rgba(255,255,255,.08)", borderRadius:10,
              padding:"8px 6px", textAlign:"center" }}>
              <div style={{ fontSize:20, fontWeight:900, color:stat.color }}>{stat.value}</div>
              <div style={{ fontSize:9, color:"rgba(255,255,255,.6)", fontWeight:600 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filters ── */}
      <div style={{ background:W, borderBottom:`1px solid ${BRD}`, padding:"10px 14px" }}>
        {/* Search */}
        <div style={{ display:"flex", alignItems:"center", gap:8, background:WARM,
          border:`1px solid ${BRD}`, borderRadius:10, padding:"8px 12px", marginBottom:10 }}>
          <Search size={14} color="#9aab94" />
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search by name or student ID…"
            style={{ border:"none", background:"transparent", flex:1, fontSize:13,
              outline:"none", color:"#374151" }} />
          {search && <button onClick={()=>setSearch("")} style={{background:"none",border:"none",cursor:"pointer"}}>
            <X size={13} color="#9aab94" />
          </button>}
        </div>
        {/* Filter tabs */}
        <div style={{ display:"flex", gap:6 }}>
          {(["all","done","pending","unassigned"] as const).map(f => (
            <button key={f} onClick={()=>setFilter(f)}
              style={{ padding:"5px 12px", borderRadius:20, fontSize:11, fontWeight:700,
                cursor:"pointer", border:"none",
                background: filter===f ? G : BRD,
                color: filter===f ? "#fff" : "#6b7a6b" }}>
              {f==="all"?"All":f==="done"?"✅ Done":f==="pending"?"⏳ Pending":"⚠ Unassigned"}
            </button>
          ))}
        </div>
        {/* Sort + Bulk Assign */}
        <div style={{ display:"flex", gap:6, marginTop:10, alignItems:"center", flexWrap:"wrap" }}>
          <span style={{fontSize:11, color:"#6b7a6b", fontWeight:700}}>Sort:</span>
          {(["level","name","student_id"] as const).map(s => (
            <button key={s} onClick={()=>setSortBy(s)}
              style={{padding:"4px 10px",borderRadius:14,fontSize:10,fontWeight:700,cursor:"pointer",
                border:"none",background:sortBy===s?GOLD:BRD,color:sortBy===s?"#000":"#6b7a6b"}}>
              {s==="level"?"Level":s==="name"?"Name":"Student ID"}
            </button>
          ))}
          {role==="admin" && (
            <button onClick={()=>setShowBulk(true)}
              style={{marginLeft:"auto",padding:"6px 12px",borderRadius:14,fontSize:11,fontWeight:800,
                cursor:"pointer",border:"none",background:G,color:"#fff",
                display:"flex",alignItems:"center",gap:5}}>
              <Plus size={12}/> Bulk Assign
            </button>
          )}
        </div>
      </div>

      {/* ── Bulk Assign Modal ──────────────────────────────────── */}
      {showBulk && (
        <div onClick={()=>!bulkSaving && setShowBulk(false)}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",zIndex:9999,
            display:"flex",alignItems:"center",justifyContent:"center",padding:14}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:W,borderRadius:18,maxWidth:480,width:"100%",maxHeight:"90vh",
              overflow:"auto",border:`2px solid ${GOLD}`,boxShadow:"0 20px 60px rgba(0,0,0,.4)"}}>
            <div style={{padding:"16px 18px",borderBottom:`1px solid ${BRD}`,
              display:"flex",alignItems:"center",justifyContent:"space-between",
              background:G,borderRadius:"16px 16px 0 0"}}>
              <div style={{color:"#fff",fontWeight:800,fontSize:15}}>📋 Assign Daily Revision</div>
              <button onClick={()=>!bulkSaving && setShowBulk(false)}
                style={{background:"none",border:"none",cursor:"pointer",color:"#fff"}}>
                <X size={18}/>
              </button>
            </div>
            <div style={{padding:18,display:"flex",flexDirection:"column",gap:14}}>
              {/* Target audience */}
              <div>
                <label style={{fontSize:11,fontWeight:700,color:"#374151"}}>Assign To</label>
                <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                  {(["all","level","individual"] as const).map(s => (
                    <button key={s} onClick={()=>setBulkForm(f=>({...f,target_scope:s}))}
                      style={{padding:"6px 12px",borderRadius:10,fontSize:11,fontWeight:700,
                        border:`1.5px solid ${bulkForm.target_scope===s?G:BRD}`,
                        background:bulkForm.target_scope===s?G:W,
                        color:bulkForm.target_scope===s?"#fff":"#374151",cursor:"pointer"}}>
                      {s==="all"?"🎓 All Students":s==="level"?"📚 By Level":"👤 Individual"}
                    </button>
                  ))}
                </div>
                {bulkForm.target_scope==="level" && (
                  <select value={bulkForm.target_value}
                    onChange={e=>setBulkForm(f=>({...f,target_value:e.target.value}))}
                    style={{marginTop:8,width:"100%",padding:"8px 10px",borderRadius:8,
                      border:`1px solid ${BRD}`,fontSize:13}}>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                )}
                {bulkForm.target_scope==="individual" && (
                  <select value={bulkForm.target_value}
                    onChange={e=>setBulkForm(f=>({...f,target_value:e.target.value}))}
                    style={{marginTop:8,width:"100%",padding:"8px 10px",borderRadius:8,
                      border:`1px solid ${BRD}`,fontSize:13}}>
                    <option value="">— select student —</option>
                    {students.map(s=>(
                      <option key={s.user_id} value={s.user_id}>{s.full_name} ({s.student_id})</option>
                    ))}
                  </select>
                )}
              </div>
              {/* Mode + items */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:"#374151"}}>Scope</label>
                  <select value={bulkForm.mode}
                    onChange={e=>setBulkForm(f=>({...f,mode:e.target.value as any}))}
                    style={{width:"100%",padding:"8px 10px",borderRadius:8,
                      border:`1px solid ${BRD}`,fontSize:13,marginTop:6}}>
                    <option value="juz">Juz (1–30)</option>
                    <option value="hizb">Hizb (1–60)</option>
                    <option value="surah">Surah (1–114)</option>
                  </select>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:"#374151"}}>Start at</label>
                  <input type="number" min={1}
                    max={bulkForm.mode==="juz"?30:bulkForm.mode==="hizb"?60:114}
                    value={bulkForm.selected_items[0]||1}
                    onChange={e=>setBulkForm(f=>({...f,selected_items:[Number(e.target.value)||1]}))}
                    style={{width:"100%",padding:"8px 10px",borderRadius:8,
                      border:`1px solid ${BRD}`,fontSize:13,marginTop:6}}/>
                </div>
              </div>
              {/* Daily pages + program days */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:"#374151"}}>Pages / day</label>
                  <select value={bulkForm.daily_pages}
                    onChange={e=>setBulkForm(f=>({...f,daily_pages:Number(e.target.value)}))}
                    style={{width:"100%",padding:"8px 10px",borderRadius:8,
                      border:`1px solid ${BRD}`,fontSize:13,marginTop:6}}>
                    <option value={0.5}>½ page (half)</option>
                    <option value={1}>1 page</option>
                    <option value={2}>2 pages</option>
                    <option value={3}>3 pages</option>
                    <option value={5}>5 pages</option>
                  </select>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:"#374151"}}>Program (days)</label>
                  <input type="number" min={1} max={365} value={bulkForm.program_days}
                    onChange={e=>setBulkForm(f=>({...f,program_days:Number(e.target.value)||30}))}
                    style={{width:"100%",padding:"8px 10px",borderRadius:8,
                      border:`1px solid ${BRD}`,fontSize:13,marginTop:6}}/>
                </div>
              </div>
              {/* Toggles */}
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#374151"}}>
                <input type="checkbox" checked={bulkForm.weekend_off}
                  onChange={e=>setBulkForm(f=>({...f,weekend_off:e.target.checked}))}/>
                Weekend off (skip Sundays for revision)
              </label>
              <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#374151"}}>
                <input type="checkbox" checked={bulkForm.auto_progress}
                  onChange={e=>setBulkForm(f=>({...f,auto_progress:e.target.checked}))}/>
                Auto-advance to next page each day
              </label>
              {/* Notes */}
              <div>
                <label style={{fontSize:11,fontWeight:700,color:"#374151"}}>Notes (optional)</label>
                <input value={bulkForm.notes}
                  onChange={e=>setBulkForm(f=>({...f,notes:e.target.value}))}
                  placeholder="e.g. Focus on tajweed"
                  style={{width:"100%",padding:"8px 10px",borderRadius:8,
                    border:`1px solid ${BRD}`,fontSize:13,marginTop:6}}/>
              </div>
              {bulkResult && (
                <div style={{padding:10,borderRadius:8,fontSize:12,fontWeight:700,
                  background:bulkResult.startsWith("✅")?"#dcfce7":"#fee2e2",
                  color:bulkResult.startsWith("✅")?"#166534":"#991b1b"}}>{bulkResult}</div>
              )}
              <button onClick={runBulkAssign} disabled={bulkSaving ||
                  (bulkForm.target_scope==="individual" && !bulkForm.target_value)}
                style={{padding:"12px",borderRadius:10,background:G,color:"#fff",fontWeight:800,
                  fontSize:13,border:"none",cursor:bulkSaving?"not-allowed":"pointer",
                  opacity:bulkSaving?.6:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                {bulkSaving ? <><Loader2 size={14} style={{animation:"spin 1s linear infinite"}}/> Assigning…</> : "✓ Assign Now"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Student list ── */}
      <div style={{ padding:"12px 12px 40px", display:"flex", flexDirection:"column", gap:10 }}>
        {loading ? (
          <div style={{ display:"flex", justifyContent:"center", padding:40 }}>
            <Loader2 size={24} style={{ animation:"spin 1s linear infinite", color:G }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:"center", padding:40, color:"#9aab94", fontSize:13 }}>
            No students found
          </div>
        ) : filtered.map(s => {
          const log     = s.todayLog;
          const assign  = s.assignment;
          const isDone  = !!log?.completed;
          const isAcked = !!log?.acknowledged_at;
          const isOpen  = expanded === s.user_id;

          return (
            <div key={s.user_id} style={{ background:W, border:`1px solid ${BRD}`,
              borderRadius:16, overflow:"hidden",
              boxShadow: isDone ? `0 0 0 2px #16a34a33` : "0 1px 6px rgba(0,0,0,.05)" }}>

              {/* Row header */}
              <div style={{ padding:"12px 14px", display:"flex", alignItems:"center", gap:10,
                cursor:"pointer" }}
                onClick={()=>setExpanded(isOpen ? null : s.user_id)}>

                {/* Status dot */}
                <div style={{ width:10, height:10, borderRadius:"50%", flexShrink:0,
                  background: isAcked ? "#7c3aed"
                    : isDone ? "#16a34a"
                    : assign  ? "#f59e0b"
                    : "#e5e7eb" }} />

                {/* Name + ID */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:"#111827",
                    whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                    {s.full_name}
                  </div>
                  <div style={{ fontSize:10, color:"#9aab94", marginTop:1 }}>
                    {s.student_id} {s.level ? `· ${s.level}` : ""}
                  </div>
                </div>

                {/* Score badge if done */}
                {log?.avg_score != null && (
                  <div style={{ padding:"2px 8px", borderRadius:8, fontSize:11, fontWeight:800,
                    background:`${scoreColor(log.avg_score)}18`,
                    color:scoreColor(log.avg_score) }}>
                    {log.avg_score}%
                  </div>
                )}

                {/* State badge */}
                <div style={{ padding:"3px 9px", borderRadius:8, fontSize:10, fontWeight:700,
                  background: isAcked ? "#7c3aed18" : isDone ? "#16a34a18" : assign ? "#f59e0b18" : "#f3f4f6",
                  color: isAcked ? "#7c3aed" : isDone ? "#16a34a" : assign ? "#b45309" : "#9aab94" }}>
                  {isAcked ? "✓ Acked" : isDone ? "Done" : assign ? "Pending" : "No task"}
                </div>

                {isOpen ? <ChevronUp size={14} color="#9aab94" /> : <ChevronDown size={14} color="#9aab94" />}
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div style={{ borderTop:`1px solid ${BRD}`, padding:"12px 14px",
                  background:WARM, display:"flex", flexDirection:"column", gap:10 }}>

                  {/* Assignment info */}
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
                    <div>
                      <div style={{ fontSize:10, fontWeight:800, color:GOLD, letterSpacing:1,
                        textTransform:"uppercase", marginBottom:4 }}>Assignment</div>
                      {assign ? (
                        <div style={{ fontSize:12, color:"#374151" }}>
                          <strong>{assign.mode === "juz" ? "Juz" : assign.mode === "hizb" ? "Hizb" : "Surah"}</strong>{" "}
                          {assign.selected_items.join(", ")} · {assign.daily_pages} page{assign.daily_pages!==1?"s":""}/day
                          {assign.notes && <div style={{ fontSize:11, color:"#6b7280", marginTop:3 }}>{assign.notes}</div>}
                        </div>
                      ) : (
                        <div style={{ fontSize:12, color:"#9aab94" }}>Not assigned yet</div>
                      )}
                    </div>
                    <button onClick={()=>{
                      setShowAssign(showAssign===s.user_id ? null : s.user_id);
                      setAssignForm({
                        mode: assign?.mode ?? "juz",
                        selected_items: assign?.selected_items ?? [1],
                        daily_pages: assign?.daily_pages ?? 1,
                        reciter_id: assign?.reciter_id ?? "Alafasy_128kbps",
                        notes: assign?.notes,
                      });
                    }}
                      style={{ padding:"5px 10px", borderRadius:8, border:`1px solid ${BRD}`,
                        background:W, cursor:"pointer", fontSize:11, fontWeight:700,
                        color:G, display:"flex", alignItems:"center", gap:4 }}>
                      {assign ? <Edit2 size={11}/> : <Plus size={11}/>}
                      {assign ? "Edit" : "Assign"}
                    </button>
                  </div>

                  {/* Assign form inline */}
                  {showAssign === s.user_id && (
                    <div style={{ background:W, border:`1px solid ${BRD}`, borderRadius:12, padding:12 }}>
                      <div style={{ fontSize:11, fontWeight:800, color:G, marginBottom:10 }}>
                        {assign ? "Update Assignment" : "New Assignment"}
                      </div>
                      {/* Mode */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginBottom:10 }}>
                        {(["juz","hizb","surah"] as const).map(m => (
                          <button key={m} onClick={()=>setAssignForm(f=>({...f,mode:m,selected_items:[1]}))}
                            style={{ padding:"7px 4px", borderRadius:8, border:`2px solid ${assignForm.mode===m?G:BRD}`,
                              background:assignForm.mode===m?G:WARM, color:assignForm.mode===m?"#fff":"#374151",
                              fontSize:12, fontWeight:700, cursor:"pointer" }}>
                            {m==="juz"?"Juz":m==="hizb"?"Hizb":"Surah"}
                          </button>
                        ))}
                      </div>
                      {/* Selection */}
                      <div style={{ marginBottom:10 }}>
                        <div style={{ fontSize:10, color:"#9aab94", fontWeight:700, marginBottom:4 }}>
                          Select {assignForm.mode === "juz" ? "Juz (1-30)" : assignForm.mode === "hizb" ? "Hizb (1-60)" : "Surah numbers"} (comma separated)
                        </div>
                        <input
                          value={(assignForm.selected_items||[]).join(",")}
                          onChange={e => {
                            const nums = e.target.value.split(",").map(n=>parseInt(n.trim())).filter(n=>!isNaN(n));
                            setAssignForm(f=>({...f, selected_items:nums}));
                          }}
                          style={{ width:"100%", padding:"8px 10px", borderRadius:8,
                            border:`1.5px solid ${BRD}`, fontSize:13, color:G,
                            background:WARM, boxSizing:"border-box" as const }}
                          placeholder="e.g. 1,2,3" />
                      </div>
                      {/* Daily pages */}
                      <div style={{ marginBottom:10 }}>
                        <div style={{ fontSize:10, color:"#9aab94", fontWeight:700, marginBottom:4 }}>Pages per day</div>
                        <div style={{ display:"flex", gap:6 }}>
                          {[0.5,1,2,3,5].map(p => (
                            <button key={p} onClick={()=>setAssignForm(f=>({...f,daily_pages:p}))}
                              style={{ flex:1, padding:"7px 4px", borderRadius:8,
                                border:`2px solid ${assignForm.daily_pages===p?G:BRD}`,
                                background:assignForm.daily_pages===p?G:WARM,
                                color:assignForm.daily_pages===p?"#fff":"#374151",
                                fontSize:11, fontWeight:800, cursor:"pointer" }}>
                              {p===0.5?"½":p}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Notes */}
                      <textarea value={assignForm.notes||""} onChange={e=>setAssignForm(f=>({...f,notes:e.target.value}))}
                        placeholder="Optional note for student…" rows={2}
                        style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:`1.5px solid ${BRD}`,
                          fontSize:12, color:"#374151", background:WARM, resize:"none" as const,
                          boxSizing:"border-box" as const, marginBottom:10 }} />
                      {saveError && (
                        <div style={{ padding:"8px 12px", borderRadius:8, background:"#fff5f5",
                          border:"1px solid #fca5a5", fontSize:11, color:"#dc2626", marginBottom:6 }}>
                          ⚠️ {saveError}
                        </div>
                      )}
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={()=>{ setSaveError(null); saveAssignment(s.user_id); }}
                          disabled={savingAssign || (assignForm.selected_items||[]).length === 0}
                          style={{ flex:1, padding:"9px", borderRadius:8, border:"none",
                            background:`linear-gradient(135deg,${G},${GM})`,
                            color:"#fff", fontWeight:800, fontSize:12, cursor:"pointer",
                            opacity: (assignForm.selected_items||[]).length === 0 ? 0.5 : 1 }}>
                          {savingAssign ? "Saving…" : "Save Assignment"}
                        </button>
                        <button onClick={()=>{ setShowAssign(null); setSaveError(null); }}
                          style={{ padding:"9px 14px", borderRadius:8, border:`1px solid ${BRD}`,
                            background:W, cursor:"pointer", fontSize:12 }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Today's session */}
                  {log ? (
                    <div>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                        <div style={{ fontSize:10, fontWeight:800, color:GOLD, letterSpacing:1, textTransform:"uppercase" as const }}>
                          Today's Session
                        </div>
                        <button onClick={()=>setExpandSession(expandSession===log.id?null:log.id)}
                          style={{ fontSize:10, color:G, fontWeight:700, background:"none", border:`1px solid ${BRD}`,
                            padding:"3px 8px", borderRadius:8, cursor:"pointer" }}>
                          {expandSession===log.id ? "Hide detail ▲" : "View detail ▼"}
                        </button>
                      </div>

                      {/* Stats row */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:10 }}>
                        {[
                          { label:"Pages",  value: log.pages_revised ?? "—" },
                          { label:"AI Score",value: log.avg_score != null ? `${log.avg_score}%` : "—",
                            color: log.avg_score != null ? scoreColor(log.avg_score) : "#9aab94" },
                          { label:"Time",   value: log.duration_secs ? fmtSecs(log.duration_secs) : "—" },
                        ].map(stat => (
                          <div key={stat.label} style={{ background:W, border:`1px solid ${BRD}`,
                            borderRadius:10, padding:"8px", textAlign:"center" as const }}>
                            <div style={{ fontSize:16, fontWeight:800, color:(stat as any).color||G }}>{stat.value}</div>
                            <div style={{ fontSize:9, color:"#9aab94", fontWeight:600 }}>{stat.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Manual grade override */}
                      <div style={{ marginBottom:10, padding:"10px 12px", borderRadius:12,
                        background:"#fff7ed", border:"1px solid #fed7aa" }}>
                        <div style={{ fontSize:10, fontWeight:800, color:"#b45309", marginBottom:8 }}>
                          ✏️ Teacher Grade Override
                        </div>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const }}>
                          {[100,90,80,70,60,50,40,30].map(g => (
                            <button key={g} onClick={()=>gradeOverride(log.id, s.user_id, g)}
                              disabled={grading===log.id}
                              style={{ padding:"5px 10px", borderRadius:8, border:"none", cursor:"pointer",
                                fontWeight:800, fontSize:11,
                                background: log.avg_score===g ? "#b45309" : "#fed7aa",
                                color: log.avg_score===g ? "#fff" : "#92400e" }}>
                              {g}%
                            </button>
                          ))}
                          <div style={{ display:"flex", gap:4, flex:1, minWidth:120 }}>
                            <input type="number" min={0} max={100}
                              value={manualGrade[log.id]||""}
                              onChange={e=>setManualGrade(m=>({...m,[log.id]:e.target.value}))}
                              placeholder="Custom"
                              style={{ flex:1, padding:"5px 8px", borderRadius:8, border:`1px solid #fed7aa`,
                                fontSize:12, background:W, color:"#92400e", width:60 }} />
                            <button onClick={()=>gradeOverride(log.id, s.user_id, parseInt(manualGrade[log.id]||"0"))}
                              disabled={!manualGrade[log.id]||grading===log.id}
                              style={{ padding:"5px 10px", borderRadius:8, border:"none", cursor:"pointer",
                                background:"#b45309", color:"#fff", fontWeight:800, fontSize:11 }}>
                              Set
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Expandable detail: transcript + errors */}
                      {expandSession===log.id && log.session_data && (
                        <div style={{ marginBottom:10, display:"flex", flexDirection:"column", gap:8 }}>
                          {/* Audio playback */}
                          {(log.session_data as any).audio_path && (
                            <div style={{ padding:"10px 14px", borderRadius:12,
                              background:`${G}0d`, border:`1px solid ${G}22`,
                              display:"flex", alignItems:"center", gap:10 }}>
                              <div style={{ width:38, height:38, borderRadius:10,
                                background:G, display:"flex", alignItems:"center",
                                justifyContent:"center", flexShrink:0 }}>
                                <Volume2 size={18} color={GOLD} />
                              </div>
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:11, fontWeight:800, color:G }}>
                                  Student's Recitation
                                </div>
                                <div style={{ fontSize:9, color:"#9aab94", marginTop:1 }}>
                                  Tap to listen before grading
                                </div>
                              </div>
                              <button
                                onClick={() => playAudio(log.id, (log.session_data as any).audio_path)}
                                disabled={audioLoading === log.id}
                                style={{ width:44, height:44, borderRadius:12, border:"none",
                                  cursor:"pointer", display:"flex", alignItems:"center",
                                  justifyContent:"center",
                                  background: audioPlaying===log.id ? "#dc2626"
                                    : `linear-gradient(135deg,${G},${GM})`,
                                  boxShadow:`0 2px 8px ${G}40` }}>
                                {audioLoading===log.id
                                  ? <Loader2 size={18} color={GOLD}
                                      style={{ animation:"spin 1s linear infinite" }} />
                                  : audioPlaying===log.id
                                    ? <Pause size={18} color={GOLD} />
                                    : <Play  size={18} color={GOLD} />}
                              </button>
                            </div>
                          )}

                          {/* Transcript */}
                          {(log.session_data as any).transcript && (
                            <div style={{ padding:"10px 12px", borderRadius:12,
                              background:"#f8f8f8", border:`1px solid ${BRD}` }}>
                              <div style={{ fontSize:10, fontWeight:800, color:G, marginBottom:6 }}>
                                🎙 Transcription
                              </div>
                              <p style={{ fontSize:14, color:"#1a1a1a", lineHeight:2.2, direction:"rtl",
                                fontFamily:"'Amiri',serif", textAlign:"right" as const,
                                wordBreak:"break-word" as const }}>
                                {(log.session_data as any).transcript}
                              </p>
                            </div>
                          )}
                          {/* Errors */}
                          {(log.session_data as any).errors?.length > 0 && (
                            <div style={{ padding:"10px 12px", borderRadius:12,
                              background:"#fff5f5", border:"1px solid #fca5a5" }}>
                              <div style={{ fontSize:10, fontWeight:800, color:"#dc2626", marginBottom:8,
                                display:"flex", alignItems:"center", gap:6 }}>
                                <span>⚠️ Error Verses</span>
                                <span style={{ background:"#fee2e2", padding:"1px 8px",
                                  borderRadius:8, fontSize:11 }}>
                                  {(log.session_data as any).errors.length}
                                </span>
                              </div>
                              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                                {(log.session_data as any).errors.map((err:any, i:number) => (
                                  <div key={i} style={{ padding:"8px 10px", borderRadius:8,
                                    background:W, border:"1px solid #fecaca" }}>
                                    <div style={{ fontSize:11, fontWeight:700, color:"#b91c1c", marginBottom:4 }}>
                                      {err.surahAr} — آية {err.ayah}
                                    </div>
                                    <div style={{ display:"flex", flexWrap:"wrap" as const, gap:4 }}>
                                      {(err.missing||[]).map((w:string, j:number) => (
                                        <span key={j} style={{ padding:"2px 8px", borderRadius:6,
                                          background:"#fee2e2", color:"#dc2626",
                                          fontSize:12, fontFamily:"'Amiri',serif" }}>
                                          {w}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Attempts */}
                          {(log.session_data as any).attempts && (
                            <div style={{ fontSize:11, color:"#9aab94", textAlign:"center" as const }}>
                              Revised {(log.session_data as any).attempts} time{(log.session_data as any).attempts!==1?"s":""} on this page
                            </div>
                          )}
                        </div>
                      )}

                      {/* Acknowledge */}
                      {isAcked ? (
                        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px",
                          borderRadius:10, background:"#f3e8ff", border:"1px solid #c4b5fd" }}>
                          <CheckCircle2 size={16} color="#7c3aed" />
                          <div>
                            <div style={{ fontSize:11, fontWeight:700, color:"#7c3aed" }}>Acknowledged ✓</div>
                            {log.ack_note && <div style={{ fontSize:10, color:"#6b7280" }}>{log.ack_note}</div>}
                          </div>
                        </div>
                      ) : (
                        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                          <textarea
                            value={ackNote[log.id]||""}
                            onChange={e=>setAckNote(n=>({...n,[log.id]:e.target.value}))}
                            placeholder="Optional note (e.g. MashaAllah, well done!)"
                            rows={2}
                            style={{ width:"100%", padding:"8px 10px", borderRadius:8,
                              border:`1.5px solid ${BRD}`, fontSize:12, color:"#374151",
                              background:W, resize:"none" as const, boxSizing:"border-box" as const }} />
                          <button onClick={()=>acknowledge(log, s.user_id)}
                            disabled={ackLoading===log.id}
                            style={{ padding:"10px", borderRadius:10, border:"none",
                              background:"#7c3aed", color:"#fff", fontWeight:800, fontSize:13,
                              cursor:"pointer", display:"flex", alignItems:"center",
                              justifyContent:"center", gap:6 }}>
                            {ackLoading===log.id
                              ? <Loader2 size={14} style={{ animation:"spin 1s linear infinite" }} />
                              : <Check size={14} />}
                            Acknowledge Session
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ padding:"10px 12px", borderRadius:10, background:"#fff7ed",
                      border:"1px solid #fed7aa", display:"flex", alignItems:"center", gap:8 }}>
                      <Clock size={14} color="#f59e0b" />
                      <span style={{ fontSize:12, color:"#92400e", fontWeight:600 }}>
                        {assign ? "Not revised yet today" : "Assign a task first"}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
