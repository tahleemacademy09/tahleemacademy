// src/pages/admin/HifdhRevisionTracker.tsx
// Also usable as teacher page — role-aware
// Shows all students, their daily assignment, today's completion, and acknowledgment

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen, Check, Clock, AlertTriangle, Search, ChevronDown,
  ChevronUp, Loader2, Plus, X, Edit2, CheckCircle2, Eye
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
  const [ackLoading,  setAckLoading]  = useState<string|null>(null);
  const [ackNote,     setAckNote]     = useState<Record<string,string>>({});
  const [showAssign,  setShowAssign]  = useState<string|null>(null);
  const [assignForm,  setAssignForm]  = useState<Partial<Assignment>>({
    mode:"juz", selected_items:[1], daily_pages:1, reciter_id:"Alafasy_128kbps"
  });
  const [savingAssign, setSavingAssign] = useState(false);

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

  const saveAssignment = async (studentId: string) => {
    if (!userId) return;
    setSavingAssign(true);
    try {
      // Deactivate old assignments
      await (supabase as any).from("hifdh_daily_assignments")
        .update({ active: false }).eq("student_id", studentId).eq("active", true);
      // Create new
      await (supabase as any).from("hifdh_daily_assignments").insert({
        student_id:     studentId,
        assigned_by:    userId,
        mode:           assignForm.mode,
        selected_items: assignForm.selected_items,
        daily_pages:    assignForm.daily_pages,
        reciter_id:     assignForm.reciter_id,
        notes:          assignForm.notes,
        active: true,
      });
      setShowAssign(null);
      load();
    } catch(e) { console.error(e); }
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
  });

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
      </div>

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
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={()=>saveAssignment(s.user_id)} disabled={savingAssign}
                          style={{ flex:1, padding:"9px", borderRadius:8, border:"none",
                            background:`linear-gradient(135deg,${G},${GM})`,
                            color:"#fff", fontWeight:800, fontSize:12, cursor:"pointer" }}>
                          {savingAssign ? "Saving…" : "Save Assignment"}
                        </button>
                        <button onClick={()=>setShowAssign(null)}
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
                      <div style={{ fontSize:10, fontWeight:800, color:GOLD, letterSpacing:1,
                        textTransform:"uppercase", marginBottom:6 }}>Today's Session</div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:10 }}>
                        {[
                          { label:"Pages", value: log.pages_revised ?? "—" },
                          { label:"Score",  value: log.avg_score != null ? `${log.avg_score}%` : "—" },
                          { label:"Time",   value: log.duration_secs ? fmtSecs(log.duration_secs) : "—" },
                        ].map(stat => (
                          <div key={stat.label} style={{ background:W, border:`1px solid ${BRD}`,
                            borderRadius:10, padding:"8px", textAlign:"center" }}>
                            <div style={{ fontSize:16, fontWeight:800, color:G }}>{stat.value}</div>
                            <div style={{ fontSize:9, color:"#9aab94", fontWeight:600 }}>{stat.label}</div>
                          </div>
                        ))}
                      </div>

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
