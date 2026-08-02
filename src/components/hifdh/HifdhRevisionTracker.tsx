// src/pages/admin/HifdhRevisionTracker.tsx
// Admin/Teacher — Hifdh Daily Revision
// Features: sort by name/level, bulk assign by level/all, program scheduling,
//           per-student payment status + history, audio playback, grade override, acknowledge

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "@/integrations/supabase/storageClient";
import {
  BookOpen, Check, Clock, Search, ChevronDown, ChevronUp,
  Loader2, Plus, X, Edit2, CheckCircle2, Play, Pause, Volume2,
  ArrowUpDown, CreditCard, CheckCircle, XCircle, Calendar, Layers,
} from "lucide-react";

const G    = "#1a3d24";
const GM   = "#276749";
const GOLD = "#c9a84c";
const W    = "#ffffff";
const WARM = "#faf8f4";
const BRD  = "#e8ddd0";

const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ── Types ────────────────────────────────────────────────────────────────────
interface Student {
  user_id: string; full_name: string; student_id: string; level: string | null;
  payment_status?: string | null; is_payment_exempt?: boolean;
  assignment?: Assignment; todayLog?: DailyLog;
}
interface Assignment {
  id: string; mode: "juz"|"hizb"|"surah"; selected_items: number[];
  daily_pages: number; reciter_id: string; active: boolean; notes?: string;
  program_start?: string; program_days?: number; days_off?: number[];
}
interface DailyLog {
  id: string; log_date: string; pages_revised: number; avg_score: number | null;
  duration_secs: number; completed: boolean; session_data?: any;
  acknowledged_by: string | null; acknowledged_at: string | null; ack_note: string | null;
}
interface BulkForm {
  target: "all"|"level";
  levelSlug: string;
  mode: "juz"|"hizb"|"surah";
  selectedItems: number[];
  dailyPages: number;
  programStart: string;
  programDays: number;
  daysOff: number[];
  reciterId: string;
  notes: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split("T")[0];
const fmtSecs = (s: number) => `${Math.floor(s/60)}m ${s%60}s`;

function workingDaysElapsed(startDate: string, daysOff: number[]): number {
  const start = new Date(startDate + "T00:00:00");
  const now = new Date();
  let count = 0;
  const cur = new Date(start);
  while (cur < now) {
    if (!daysOff.includes(cur.getDay())) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function currentPage(a: Assignment): number {
  if (!a.program_start) return 1;
  const elapsed = workingDaysElapsed(a.program_start, a.days_off || []);
  return Math.floor(elapsed * a.daily_pages) + 1;
}

// ── Sub-components ───────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize:10, fontWeight:800, color:"#6b7a6b", letterSpacing:.5,
      textTransform:"uppercase" as const, marginBottom:6 }}>
      {children}
    </div>
  );
}

function Pill({ active, onClick, children, style }: {
  active: boolean; onClick: () => void; children: React.ReactNode; style?: React.CSSProperties;
}) {
  return (
    <button onClick={onClick}
      style={{ padding:"6px 12px", borderRadius:20, fontSize:11, fontWeight:700, cursor:"pointer",
        border:`2px solid ${active ? G : BRD}`, background: active ? G : WARM,
        color: active ? "#fff" : "#374151", flex:1, textAlign:"center" as const, ...style }}>
      {children}
    </button>
  );
}

const inp: React.CSSProperties = {
  width:"100%", padding:"9px 12px", borderRadius:8, border:`1.5px solid ${BRD}`,
  fontSize:13, color:"#374151", background:WARM, boxSizing:"border-box" as const,
  fontFamily:"inherit", marginBottom:12,
};

function PayPill({ status, exempt }: { status?: string|null; exempt?: boolean }) {
  if (exempt) return (
    <span style={{ fontSize:9, fontWeight:800, padding:"2px 7px", borderRadius:8,
      background:"#EFF6FF", color:"#1D4ED8" }}>Exempt</span>
  );
  const paid = status === "paid";
  return (
    <span style={{ fontSize:9, fontWeight:800, padding:"2px 7px", borderRadius:8,
      background: paid ? "#F0FDF4" : "#FEF2F2",
      color: paid ? "#15803d" : "#dc2626" }}>
      {paid ? "✓ Paid" : "Unpaid"}
    </span>
  );
}

// ── Bulk Assign Bottom Sheet ──────────────────────────────────────────────────
function BulkAssignModal({
  levels, students, onClose, onDone,
}: {
  levels: string[]; students: Student[];
  onClose: () => void; onDone: () => void;
}) {
  const [form, setForm] = useState<BulkForm>({
    target:"all", levelSlug: levels[0]||"",
    mode:"juz", selectedItems:[1], dailyPages:1,
    programStart: todayStr(), programDays:30, daysOff:[0],
    reciterId:"Alafasy_128kbps", notes:"",
  });
  const [saving,   setSaving]   = useState(false);
  const [progress, setProgress] = useState("");
  const [error,    setError]    = useState<string|null>(null);

  const upd = <K extends keyof BulkForm>(k: K, v: BulkForm[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const toggleDay = (d: number) =>
    setForm(f => ({
      ...f,
      daysOff: f.daysOff.includes(d) ? f.daysOff.filter(x=>x!==d) : [...f.daysOff, d],
    }));

  const targets = students.filter(s =>
    form.target === "all" ? true :
    (s.level||"").toLowerCase() === form.levelSlug.toLowerCase()
  );

  const save = async () => {
    if (!targets.length) { setError("No students match."); return; }
    setSaving(true); setError(null);
    let done = 0, failed = 0;
    const notesJson = JSON.stringify({
      programStart: form.programStart,
      programDays:  form.programDays,
      daysOff:      form.daysOff,
      custom:       form.notes,
    });
    for (const s of targets) {
      setProgress(`Assigning ${s.full_name}… (${done+failed+1}/${targets.length})`);
      try {
        const { error: rpcErr } = await (supabase as any).rpc("save_hifdh_assignment", {
          p_student_id:     s.user_id,
          p_mode:           form.mode,
          p_selected_items: form.selectedItems,
          p_daily_pages:    form.dailyPages,
          p_reciter_id:     form.reciterId,
          p_notes:          notesJson,
        });
        if (rpcErr) throw rpcErr;
        done++;
      } catch { failed++; }
    }
    setSaving(false);
    setProgress(`Done — ${done} assigned${failed ? `, ${failed} failed` : ""}.`);
    setTimeout(() => { onDone(); onClose(); }, 1400);
  };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:100, background:"rgba(0,0,0,.5)",
      display:"flex", alignItems:"flex-end" }}
      onClick={e => { if (e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:W, borderRadius:"20px 20px 0 0", width:"100%",
        maxHeight:"92vh", overflowY:"auto", padding:"24px 18px 40px" }}>

        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:18 }}>
          <div>
            <div style={{ fontWeight:900, fontSize:16, color:G }}>📋 Bulk Assign Program</div>
            <div style={{ fontSize:11, color:"#9aab94", marginTop:2 }}>
              Assign a revision program to multiple students
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer" }}>
            <X size={20} color="#9aab94" />
          </button>
        </div>

        <Label>Assign To</Label>
        <div style={{ display:"flex", gap:8, marginBottom:14 }}>
          <Pill active={form.target==="all"} onClick={() => upd("target","all")}>
            🌍 All Students ({students.length})
          </Pill>
          <Pill active={form.target==="level"} onClick={() => upd("target","level")}>
            🎓 By Level
          </Pill>
        </div>

        {form.target === "level" && (
          <>
            <Label>Level</Label>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:14 }}>
              {levels.map(l => (
                <Pill key={l} active={form.levelSlug===l} onClick={() => upd("levelSlug",l)}
                  style={{ flex:"unset" }}>
                  {l}
                </Pill>
              ))}
            </div>
          </>
        )}

        <div style={{ marginBottom:14, padding:"8px 12px", borderRadius:8,
          background:"#F0FDF4", fontSize:11, color:G, fontWeight:700 }}>
          👥 {targets.length} student{targets.length!==1?"s":""} will be assigned
        </div>

        <Label>Mode</Label>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginBottom:14 }}>
          {(["juz","hizb","surah"] as const).map(m => (
            <Pill key={m} active={form.mode===m} onClick={() => upd("mode",m)}>
              {m==="juz"?"Juz":m==="hizb"?"Hizb":"Surah"}
            </Pill>
          ))}
        </div>

        <Label>
          {form.mode==="juz"?"Juz (1–30)":form.mode==="hizb"?"Hizb (1–60)":"Surah numbers"} — comma separated
        </Label>
        <input value={form.selectedItems.join(",")}
          onChange={e => {
            const nums = e.target.value.split(",").map(n=>parseInt(n.trim())).filter(n=>!isNaN(n));
            upd("selectedItems", nums);
          }}
          placeholder="e.g. 1,2,3" style={inp} />

        <Label>Pages Per Day</Label>
        <div style={{ display:"flex", gap:6, marginBottom:14 }}>
          {[0.5,1,2,3,5].map(p => (
            <Pill key={p} active={form.dailyPages===p} onClick={() => upd("dailyPages",p)}>
              {p===0.5?"½":p}
            </Pill>
          ))}
        </div>

        <Label>Program Start Date</Label>
        <input type="date" value={form.programStart}
          onChange={e => upd("programStart",e.target.value)} style={inp} />

        <Label>Program Duration</Label>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:14 }}>
          {[7,14,30,60,90,180].map(d => (
            <Pill key={d} active={form.programDays===d} onClick={() => upd("programDays",d)}
              style={{ flex:"unset", minWidth:60 }}>
              {d} days
            </Pill>
          ))}
        </div>

        <Label>Rest Days (no revision)</Label>
        <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
          {DAY_NAMES.map((name,i) => (
            <button key={i} onClick={() => toggleDay(i)}
              style={{ padding:"5px 10px", borderRadius:8, fontSize:11, fontWeight:700,
                border:"none", cursor:"pointer",
                background: form.daysOff.includes(i) ? "#FEF2F2" : WARM,
                color:      form.daysOff.includes(i) ? "#dc2626" : "#374151",
                outline:    form.daysOff.includes(i) ? "2px solid #fca5a5" : `1px solid ${BRD}` }}>
              {name}
            </button>
          ))}
        </div>

        <Label>Notes (optional)</Label>
        <textarea value={form.notes} onChange={e => upd("notes",e.target.value)}
          placeholder="Optional note for students…" rows={2}
          style={{ ...inp, resize:"none" as const, minHeight:56 }} />

        {error && (
          <div style={{ padding:"8px 12px", borderRadius:8, background:"#fff5f5",
            border:"1px solid #fca5a5", fontSize:11, color:"#dc2626", marginBottom:10 }}>
            ⚠️ {error}
          </div>
        )}
        {progress && (
          <div style={{ padding:"8px 12px", borderRadius:8, background:"#F0FDF4",
            border:"1px solid #86efac", fontSize:11, color:G, marginBottom:10 }}>
            {progress}
          </div>
        )}

        <button onClick={save} disabled={saving || !form.selectedItems.length}
          style={{ width:"100%", padding:"13px", borderRadius:12, border:"none",
            background: saving || !form.selectedItems.length ? "#E5E7EB"
              : `linear-gradient(135deg,${G},${GM})`,
            color: saving || !form.selectedItems.length ? "#9CA3AF" : "#fff",
            fontWeight:900, fontSize:14, cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
          {saving
            ? <><Loader2 size={16} style={{ animation:"spin 1s linear infinite" }} /> Assigning…</>
            : <><Layers size={16} /> Assign to {targets.length} Students</>}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function HifdhRevisionTracker() {
  const [role,         setRole]         = useState<"admin"|"teacher"|null>(null);
  const [userId,       setUserId]       = useState<string|null>(null);
  const [students,     setStudents]     = useState<Student[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [filter,       setFilter]       = useState<"all"|"done"|"pending"|"unassigned">("all");
  const [sortBy,       setSortBy]       = useState<"name"|"level">("name");
  const [levelFilter,  setLevelFilter]  = useState("all");
  const [expanded,     setExpanded]     = useState<string|null>(null);
  const [showBulk,     setShowBulk]     = useState(false);
  const [ackLoading,   setAckLoading]   = useState<string|null>(null);
  const [ackNote,      setAckNote]      = useState<Record<string,string>>({});
  const [manualGrade,  setManualGrade]  = useState<Record<string,string>>({});
  const [grading,      setGrading]      = useState<string|null>(null);
  const [expandSess,   setExpandSess]   = useState<string|null>(null);
  const [audioPlaying, setAudioPlaying] = useState<string|null>(null);
  const [audioLoading, setAudioLoading] = useState<string|null>(null);
  const audioRef = useRef<HTMLAudioElement|null>(null);
  const [showAssign,   setShowAssign]   = useState<string|null>(null);
  const [assignForm,   setAssignForm]   = useState<Partial<Assignment>>({
    mode:"juz", selected_items:[1], daily_pages:1, reciter_id:"Alafasy_128kbps",
    program_start: todayStr(), program_days:30, days_off:[0],
  });
  const [savingAssign, setSavingAssign] = useState(false);
  const [saveError,    setSaveError]    = useState<string|null>(null);
  const [payHistory,   setPayHistory]   = useState<Record<string,any[]>>({});
  const [loadingPay,   setLoadingPay]   = useState<string|null>(null);
  const [markingPaid,  setMarkingPaid]  = useState<string|null>(null);

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user) return;
      setUserId(data.user.id);
      supabase.from("profiles").select("role").eq("user_id", data.user.id).single()
        .then(({ data: p }) => { if (p) setRole(p.role as any); });
    });
  }, []);

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!userId || !role) return;
    setLoading(true);
    try {
      let studentIds: string[] = [];
      if (role === "teacher") {
        const { data: subs } = await supabase.from("subjects").select("id").eq("teacher_id", userId);
        const subIds = (subs||[]).map((s:any)=>s.id);
        if (subIds.length) {
          const { data: enr } = await (supabase as any).from("enrollments").select("user_id").in("subject_id", subIds);
          studentIds = [...new Set<string>((enr||[]).map((e:any)=>String(e.user_id)))];
        }
      }

      const query = supabase.from("profiles")
        .select("user_id,full_name,student_id,level,payment_status,is_payment_exempt")
        .eq("role","student");

      const { data: profiles } = role === "teacher" && studentIds.length
        ? await query.in("user_id", studentIds)
        : await query;

      if (!profiles) { setLoading(false); return; }
      const ids = profiles.map((p:any) => p.user_id);

      const [{ data: assignments }, { data: logs }] = await Promise.all([
        (supabase as any).from("hifdh_daily_assignments").select("*").eq("active",true).in("student_id",ids),
        (supabase as any).from("hifdh_daily_logs").select("*").eq("log_date",todayStr()).in("student_id",ids),
      ]);

      const aMap: Record<string,Assignment> = {};
      (assignments||[]).forEach((a:any) => {
        let extra: any = {};
        try { extra = JSON.parse(a.notes||"{}"); } catch {}
        aMap[a.student_id] = {
          ...a,
          program_start: extra.programStart ?? a.program_start,
          program_days:  extra.programDays  ?? a.program_days,
          days_off:      extra.daysOff      ?? a.days_off ?? [],
        };
      });
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

  // ── Derived ─────────────────────────────────────────────────────────────────
  const allLevels = [...new Set(students.map(s=>s.level).filter(Boolean) as string[])].sort();

  const filtered = students
    .filter(s => {
      const mq = !search
        || s.full_name?.toLowerCase().includes(search.toLowerCase())
        || s.student_id?.toLowerCase().includes(search.toLowerCase());
      const ml = levelFilter==="all" || (s.level||"").toLowerCase()===levelFilter.toLowerCase();
      const mf = filter==="all"         ? true
        : filter==="unassigned"         ? !s.assignment
        : filter==="done"               ? !!s.todayLog?.completed
        : !!s.assignment && !s.todayLog?.completed;
      return mq && ml && mf;
    })
    .sort((a,b) => {
      if (sortBy==="level") {
        const lc = (a.level||"zzz").localeCompare(b.level||"zzz");
        return lc!==0 ? lc : (a.full_name||"").localeCompare(b.full_name||"");
      }
      return (a.full_name||"").localeCompare(b.full_name||"");
    });

  const stats = {
    total:    students.length,
    assigned: students.filter(s=>s.assignment).length,
    done:     students.filter(s=>s.todayLog?.completed).length,
    acked:    students.filter(s=>s.todayLog?.acknowledged_at).length,
  };

  const scoreColor = (sc:number) => sc>=80?"#16a34a":sc>=60?"#b7791f":"#dc2626";

  // ── Actions ─────────────────────────────────────────────────────────────────
  const acknowledge = async (log: DailyLog, studentId: string) => {
    setAckLoading(log.id);
    try {
      await (supabase as any).rpc("acknowledge_hifdh_log",
        { p_log_id:log.id, p_note:ackNote[log.id]||null });
      setStudents(prev => prev.map(s =>
        s.user_id===studentId
          ? {...s, todayLog:{...s.todayLog!, acknowledged_by:userId!, acknowledged_at:new Date().toISOString(), ack_note:ackNote[log.id]||null}}
          : s
      ));
    } catch(e){ console.error(e); }
    setAckLoading(null);
  };

  const playAudio = async (logId: string, path: string) => {
    if (audioRef.current){ audioRef.current.pause(); audioRef.current=null; }
    if (audioPlaying===logId){ setAudioPlaying(null); return; }
    setAudioLoading(logId);
    try {
      const {data} = await storageSupabase.storage.from("recitation-audio").createSignedUrl(path,3600);
      if (!data?.signedUrl) throw new Error("No URL");
      const el = new Audio(data.signedUrl);
      audioRef.current = el;
      el.onended = () => setAudioPlaying(null);
      el.onerror = () => { setAudioPlaying(null); setAudioLoading(null); };
      await el.play();
      setAudioPlaying(logId);
    } catch(e){ console.error(e); }
    setAudioLoading(null);
  };

  const gradeOverride = async (logId: string, studentId: string, grade: number) => {
    setGrading(logId);
    try {
      await (supabase as any).from("hifdh_daily_logs").update({avg_score:grade}).eq("id",logId);
      setStudents(prev=>prev.map(s=>
        s.user_id===studentId?{...s,todayLog:{...s.todayLog!,avg_score:grade}}:s
      ));
      setManualGrade(m=>({...m,[logId]:""}));
    } catch(e:any){ alert(`Grade failed: ${e?.message}`); }
    setGrading(null);
  };

  const saveAssignment = async (studentId: string) => {
    if (!userId){ return; }
    setSavingAssign(true); setSaveError(null);
    try {
      const notesJson = JSON.stringify({
        programStart: assignForm.program_start,
        programDays:  assignForm.program_days,
        daysOff:      assignForm.days_off ?? [],
        custom:       assignForm.notes || "",
      });
      const {error: rpcErr} = await (supabase as any).rpc("save_hifdh_assignment",{
        p_student_id:     studentId,
        p_mode:           assignForm.mode,
        p_selected_items: assignForm.selected_items,
        p_daily_pages:    assignForm.daily_pages,
        p_reciter_id:     assignForm.reciter_id||"Alafasy_128kbps",
        p_notes:          notesJson,
      });
      if (rpcErr){ setSaveError(`Save failed: ${rpcErr.message}`); setSavingAssign(false); return; }
      setShowAssign(null);
      await load();
    } catch(e:any){ setSaveError(`Unexpected error: ${e?.message??String(e)}`); }
    setSavingAssign(false);
  };

  const loadPayHistory = async (uid: string) => {
    if (payHistory[uid]) return;
    setLoadingPay(uid);
    const {data} = await (supabase as any).from("payments")
      .select("*").eq("user_id",uid).order("created_at",{ascending:false}).limit(10);
    setPayHistory(h=>({...h,[uid]:data||[]}));
    setLoadingPay(null);
  };

  const markPaid = async (s: Student) => {
    setMarkingPaid(s.user_id);
    const end = new Date();
    end.setMonth(end.getMonth()+1);
    try {
      await Promise.all([
        (supabase as any).from("payments").insert({
          user_id:s.user_id, amount:5000, currency:"NGN",
          status:"success", reference:`manual-${Date.now()}`,
          plan:"Monthly Subscription", created_at:new Date().toISOString(),
        }),
        supabase.from("profiles").update({
          payment_status:"paid",
          subscription_end_date: end.toISOString().split("T")[0],
        } as any).eq("user_id",s.user_id),
      ]);
      setStudents(prev=>prev.map(x=>x.user_id===s.user_id?{...x,payment_status:"paid"}:x));
      setPayHistory(h=>({...h,[s.user_id]:undefined as any}));
    } catch(e:any){ alert(`Failed: ${e.message}`); }
    setMarkingPaid(null);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{background:WARM,minHeight:"100%",fontFamily:"system-ui,sans-serif"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {showBulk && (
        <BulkAssignModal
          levels={allLevels} students={students}
          onClose={()=>setShowBulk(false)} onDone={load}
        />
      )}

      {/* Header */}
      <div style={{background:G,padding:"16px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:3,
          background:`linear-gradient(90deg,${GOLD},#e8c97a,${GOLD})`}} />
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:44,height:44,borderRadius:12,background:`${GOLD}22`,
              border:`1.5px solid ${GOLD}44`,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <BookOpen size={22} color={GOLD} />
            </div>
            <div>
              <div style={{color:"#fff",fontWeight:800,fontSize:18}}>Hifdh Daily Revision</div>
              <div style={{color:GOLD,fontSize:11,fontFamily:"'Amiri',serif",marginTop:2}}>
                متابعة مراجعة الحفظ اليومية
              </div>
            </div>
          </div>
          <button onClick={()=>setShowBulk(true)}
            style={{padding:"9px 14px",borderRadius:12,border:`1.5px solid ${GOLD}44`,
              background:`${GOLD}22`,color:GOLD,fontWeight:800,fontSize:12,cursor:"pointer",
              display:"flex",alignItems:"center",gap:6}}>
            <Layers size={14}/> Bulk Assign
          </button>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginTop:14}}>
          {[
            {label:"Students",  value:stats.total,    color:"#93c5fd"},
            {label:"Assigned",  value:stats.assigned, color:GOLD},
            {label:"Done Today",value:stats.done,     color:"#86efac"},
            {label:"Acknowledged",value:stats.acked,  color:"#c4b5fd"},
          ].map(st=>(
            <div key={st.label} style={{background:"rgba(255,255,255,.08)",borderRadius:10,
              padding:"8px 6px",textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:900,color:st.color}}>{st.value}</div>
              <div style={{fontSize:9,color:"rgba(255,255,255,.6)",fontWeight:600}}>{st.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div style={{background:W,borderBottom:`1px solid ${BRD}`,padding:"10px 14px"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,background:WARM,
          border:`1px solid ${BRD}`,borderRadius:10,padding:"8px 12px",marginBottom:10}}>
          <Search size={14} color="#9aab94"/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search by name or student ID…"
            style={{border:"none",background:"transparent",flex:1,fontSize:13,outline:"none",color:"#374151"}}/>
          {search&&<button onClick={()=>setSearch("")} style={{background:"none",border:"none",cursor:"pointer"}}>
            <X size={13} color="#9aab94"/>
          </button>}
        </div>

        {/* Status pills */}
        <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
          {(["all","done","pending","unassigned"] as const).map(f=>(
            <button key={f} onClick={()=>setFilter(f)}
              style={{padding:"5px 12px",borderRadius:20,fontSize:11,fontWeight:700,
                cursor:"pointer",border:"none",
                background:filter===f?G:BRD,color:filter===f?"#fff":"#6b7a6b"}}>
              {f==="all"?"All":f==="done"?"✅ Done":f==="pending"?"⏳ Pending":"⚠ Unassigned"}
            </button>
          ))}
        </div>

        {/* Level filter + sort */}
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={()=>setLevelFilter("all")}
            style={{padding:"4px 10px",borderRadius:20,fontSize:10,fontWeight:700,
              border:"none",cursor:"pointer",
              background:levelFilter==="all"?G:BRD,color:levelFilter==="all"?"#fff":"#6b7a6b"}}>
            All Levels
          </button>
          {allLevels.map(l=>(
            <button key={l} onClick={()=>setLevelFilter(l===levelFilter?"all":l)}
              style={{padding:"4px 10px",borderRadius:20,fontSize:10,fontWeight:700,
                border:"none",cursor:"pointer",
                background:levelFilter===l?GM:BRD,color:levelFilter===l?"#fff":"#6b7a6b"}}>
              {l}
            </button>
          ))}
          <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
            <ArrowUpDown size={12} color="#9aab94"/>
            <button onClick={()=>setSortBy(s=>s==="name"?"level":"name")}
              style={{fontSize:10,fontWeight:700,color:G,background:"none",
                border:`1px solid ${BRD}`,borderRadius:8,padding:"4px 10px",cursor:"pointer"}}>
              Sort: {sortBy==="name"?"A–Z":"Level"}
            </button>
          </div>
        </div>
      </div>

      {/* Student list */}
      <div style={{padding:"12px 12px 40px",display:"flex",flexDirection:"column",gap:10}}>
        {loading?(
          <div style={{display:"flex",justifyContent:"center",padding:40}}>
            <Loader2 size={24} style={{animation:"spin 1s linear infinite",color:G}}/>
          </div>
        ):filtered.length===0?(
          <div style={{textAlign:"center",padding:40,color:"#9aab94",fontSize:13}}>No students found</div>
        ):filtered.map(s=>{
          const log     = s.todayLog;
          const assign  = s.assignment;
          const isDone  = !!log?.completed;
          const isAcked = !!log?.acknowledged_at;
          const isOpen  = expanded===s.user_id;
          const todayPage = assign ? currentPage(assign) : null;

          return(
            <div key={s.user_id} style={{background:W,border:`1px solid ${BRD}`,
              borderRadius:16,overflow:"hidden",
              boxShadow:isDone?`0 0 0 2px #16a34a33`:"0 1px 6px rgba(0,0,0,.05)"}}>

              {/* Row */}
              <div style={{padding:"12px 14px",display:"flex",alignItems:"center",
                gap:10,cursor:"pointer"}}
                onClick={()=>{
                  const next=isOpen?null:s.user_id;
                  setExpanded(next);
                  if(next) loadPayHistory(s.user_id);
                }}>

                <div style={{width:10,height:10,borderRadius:"50%",flexShrink:0,
                  background:isAcked?"#7c3aed":isDone?"#16a34a":assign?"#f59e0b":"#e5e7eb"}}/>

                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#111827",
                    whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {s.full_name}
                  </div>
                  <div style={{fontSize:10,color:"#9aab94",marginTop:1,
                    display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
                    <span>{s.student_id}</span>
                    {s.level&&<span style={{padding:"1px 6px",borderRadius:6,background:BRD,fontWeight:700}}>{s.level}</span>}
                    {todayPage&&<span style={{color:GOLD,fontWeight:700}}>p.{todayPage}</span>}
                    <PayPill status={s.payment_status} exempt={s.is_payment_exempt}/>
                  </div>
                </div>

                {log?.avg_score!=null&&(
                  <div style={{padding:"2px 8px",borderRadius:8,fontSize:11,fontWeight:800,
                    background:`${scoreColor(log.avg_score)}18`,color:scoreColor(log.avg_score)}}>
                    {log.avg_score}%
                  </div>
                )}

                <div style={{padding:"3px 9px",borderRadius:8,fontSize:10,fontWeight:700,
                  background:isAcked?"#7c3aed18":isDone?"#16a34a18":assign?"#f59e0b18":"#f3f4f6",
                  color:isAcked?"#7c3aed":isDone?"#16a34a":assign?"#b45309":"#9aab94"}}>
                  {isAcked?"✓ Acked":isDone?"Done":assign?"Pending":"No task"}
                </div>

                {isOpen?<ChevronUp size={14} color="#9aab94"/>:<ChevronDown size={14} color="#9aab94"/>}
              </div>

              {/* Expanded */}
              {isOpen&&(
                <div style={{borderTop:`1px solid ${BRD}`,padding:"12px 14px",
                  background:WARM,display:"flex",flexDirection:"column",gap:12}}>

                  {/* Assignment info */}
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:10,fontWeight:800,color:GOLD,letterSpacing:1,
                        textTransform:"uppercase" as const,marginBottom:4}}>Assignment</div>
                      {assign?(
                        <div style={{fontSize:12,color:"#374151"}}>
                          <strong>{assign.mode==="juz"?"Juz":assign.mode==="hizb"?"Hizb":"Surah"}</strong>{" "}
                          {assign.selected_items.join(", ")} · {assign.daily_pages} page{assign.daily_pages!==1?"s":""}/day
                          {assign.program_start&&(
                            <div style={{fontSize:10,color:"#9aab94",marginTop:2,display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
                              <Calendar size={9}/> Started {assign.program_start}
                              {assign.program_days?` · ${assign.program_days}-day program`:""}
                              {assign.days_off?.length?` · Off: ${assign.days_off.map(d=>DAY_NAMES[d]).join(",")}`:""}
                            </div>
                          )}
                          {todayPage&&(
                            <div style={{marginTop:5,display:"inline-block",padding:"4px 10px",
                              borderRadius:8,background:`${GOLD}18`,color:GOLD,fontWeight:800,fontSize:11}}>
                              Today's page: {todayPage}
                            </div>
                          )}
                        </div>
                      ):(
                        <div style={{fontSize:12,color:"#9aab94"}}>Not assigned yet</div>
                      )}
                    </div>
                    <button onClick={()=>{
                      setShowAssign(showAssign===s.user_id?null:s.user_id);
                      setAssignForm({
                        mode:assign?.mode??"juz",
                        selected_items:assign?.selected_items??[1],
                        daily_pages:assign?.daily_pages??1,
                        reciter_id:assign?.reciter_id??"Alafasy_128kbps",
                        program_start:assign?.program_start??todayStr(),
                        program_days:assign?.program_days??30,
                        days_off:assign?.days_off??[0],
                        notes:"",
                      });
                    }}
                      style={{padding:"5px 10px",borderRadius:8,border:`1px solid ${BRD}`,
                        background:W,cursor:"pointer",fontSize:11,fontWeight:700,
                        color:G,display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
                      {assign?<Edit2 size={11}/>:<Plus size={11}/>}
                      {assign?"Edit":"Assign"}
                    </button>
                  </div>

                  {/* Individual assign form */}
                  {showAssign===s.user_id&&(
                    <div style={{background:W,border:`1px solid ${BRD}`,borderRadius:12,padding:12}}>
                      <div style={{fontSize:11,fontWeight:800,color:G,marginBottom:10}}>
                        {assign?"Update Assignment":"New Assignment"}
                      </div>

                      <Label>Mode</Label>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:12}}>
                        {(["juz","hizb","surah"] as const).map(m=>(
                          <button key={m} onClick={()=>setAssignForm(f=>({...f,mode:m,selected_items:[1]}))}
                            style={{padding:"7px 4px",borderRadius:8,border:`2px solid ${assignForm.mode===m?G:BRD}`,
                              background:assignForm.mode===m?G:WARM,color:assignForm.mode===m?"#fff":"#374151",
                              fontSize:12,fontWeight:700,cursor:"pointer"}}>
                            {m==="juz"?"Juz":m==="hizb"?"Hizb":"Surah"}
                          </button>
                        ))}
                      </div>

                      <Label>{assignForm.mode==="juz"?"Juz (1-30)":assignForm.mode==="hizb"?"Hizb (1-60)":"Surah numbers"} — comma separated</Label>
                      <input value={(assignForm.selected_items||[]).join(",")}
                        onChange={e=>{
                          const nums=e.target.value.split(",").map(n=>parseInt(n.trim())).filter(n=>!isNaN(n));
                          setAssignForm(f=>({...f,selected_items:nums}));
                        }}
                        style={inp} placeholder="e.g. 1,2,3"/>

                      <Label>Pages per day</Label>
                      <div style={{display:"flex",gap:6,marginBottom:12}}>
                        {[0.5,1,2,3,5].map(p=>(
                          <button key={p} onClick={()=>setAssignForm(f=>({...f,daily_pages:p}))}
                            style={{flex:1,padding:"7px 4px",borderRadius:8,
                              border:`2px solid ${assignForm.daily_pages===p?G:BRD}`,
                              background:assignForm.daily_pages===p?G:WARM,
                              color:assignForm.daily_pages===p?"#fff":"#374151",
                              fontSize:11,fontWeight:800,cursor:"pointer"}}>
                            {p===0.5?"½":p}
                          </button>
                        ))}
                      </div>

                      <Label>Start date</Label>
                      <input type="date" value={assignForm.program_start||todayStr()}
                        onChange={e=>setAssignForm(f=>({...f,program_start:e.target.value}))}
                        style={inp}/>

                      <Label>Duration</Label>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:12}}>
                        {[7,14,30,60,90].map(d=>(
                          <button key={d} onClick={()=>setAssignForm(f=>({...f,program_days:d}))}
                            style={{padding:"5px 10px",borderRadius:8,
                              border:`2px solid ${assignForm.program_days===d?G:BRD}`,
                              background:assignForm.program_days===d?G:WARM,
                              color:assignForm.program_days===d?"#fff":"#374151",
                              fontSize:11,fontWeight:800,cursor:"pointer"}}>
                            {d}d
                          </button>
                        ))}
                      </div>

                      <Label>Rest days</Label>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:12}}>
                        {DAY_NAMES.map((name,i)=>{
                          const off=(assignForm.days_off||[]).includes(i);
                          return(
                            <button key={i}
                              onClick={()=>setAssignForm(f=>({
                                ...f,days_off:off
                                  ?(f.days_off||[]).filter(x=>x!==i)
                                  :[...(f.days_off||[]),i]
                              }))}
                              style={{padding:"5px 9px",borderRadius:8,fontSize:10,fontWeight:700,
                                border:"none",cursor:"pointer",
                                background:off?"#FEF2F2":WARM,color:off?"#dc2626":"#374151",
                                outline:off?"2px solid #fca5a5":`1px solid ${BRD}`}}>
                              {name}
                            </button>
                          );
                        })}
                      </div>

                      {saveError&&(
                        <div style={{padding:"8px 12px",borderRadius:8,background:"#fff5f5",
                          border:"1px solid #fca5a5",fontSize:11,color:"#dc2626",marginBottom:8}}>
                          ⚠️ {saveError}
                        </div>
                      )}
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>{setSaveError(null);saveAssignment(s.user_id);}}
                          disabled={savingAssign||(assignForm.selected_items||[]).length===0}
                          style={{flex:1,padding:"9px",borderRadius:8,border:"none",
                            background:`linear-gradient(135deg,${G},${GM})`,
                            color:"#fff",fontWeight:800,fontSize:12,cursor:"pointer"}}>
                          {savingAssign?"Saving…":"Save Assignment"}
                        </button>
                        <button onClick={()=>{setShowAssign(null);setSaveError(null);}}
                          style={{padding:"9px 14px",borderRadius:8,border:`1px solid ${BRD}`,
                            background:W,cursor:"pointer",fontSize:12}}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Today's session */}
                  {log?(
                    <div>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                        <div style={{fontSize:10,fontWeight:800,color:GOLD,letterSpacing:1,textTransform:"uppercase" as const}}>
                          Today's Session
                        </div>
                        <button onClick={()=>setExpandSess(expandSess===log.id?null:log.id)}
                          style={{fontSize:10,color:G,fontWeight:700,background:"none",border:`1px solid ${BRD}`,
                            padding:"3px 8px",borderRadius:8,cursor:"pointer"}}>
                          {expandSess===log.id?"Hide ▲":"Detail ▼"}
                        </button>
                      </div>

                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
                        {[
                          {label:"Pages",    value:log.pages_revised??"—"},
                          {label:"AI Score", value:log.avg_score!=null?`${log.avg_score}%`:"—",
                            color:log.avg_score!=null?scoreColor(log.avg_score):"#9aab94"},
                          {label:"Time",     value:log.duration_secs?fmtSecs(log.duration_secs):"—"},
                        ].map(st=>(
                          <div key={st.label} style={{background:W,border:`1px solid ${BRD}`,
                            borderRadius:10,padding:"8px",textAlign:"center" as const}}>
                            <div style={{fontSize:16,fontWeight:800,color:(st as any).color||G}}>{st.value}</div>
                            <div style={{fontSize:9,color:"#9aab94",fontWeight:600}}>{st.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Grade override */}
                      <div style={{marginBottom:10,padding:"10px 12px",borderRadius:12,
                        background:"#fff7ed",border:"1px solid #fed7aa"}}>
                        <div style={{fontSize:10,fontWeight:800,color:"#b45309",marginBottom:8}}>
                          ✏️ Grade Override
                        </div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap" as const}}>
                          {[100,90,80,70,60,50,40].map(g=>(
                            <button key={g} onClick={()=>gradeOverride(log.id,s.user_id,g)}
                              disabled={grading===log.id}
                              style={{padding:"5px 10px",borderRadius:8,border:"none",cursor:"pointer",
                                fontWeight:800,fontSize:11,
                                background:log.avg_score===g?"#b45309":"#fed7aa",
                                color:log.avg_score===g?"#fff":"#92400e"}}>
                              {g}%
                            </button>
                          ))}
                          <div style={{display:"flex",gap:4,flex:1,minWidth:100}}>
                            <input type="number" min={0} max={100}
                              value={manualGrade[log.id]||""}
                              onChange={e=>setManualGrade(m=>({...m,[log.id]:e.target.value}))}
                              placeholder="Custom"
                              style={{flex:1,padding:"5px 8px",borderRadius:8,
                                border:`1px solid #fed7aa`,fontSize:12,background:W,color:"#92400e"}}/>
                            <button onClick={()=>gradeOverride(log.id,s.user_id,parseInt(manualGrade[log.id]||"0"))}
                              disabled={!manualGrade[log.id]||grading===log.id}
                              style={{padding:"5px 10px",borderRadius:8,border:"none",cursor:"pointer",
                                background:"#b45309",color:"#fff",fontWeight:800,fontSize:11}}>
                              Set
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Audio + transcript */}
                      {expandSess===log.id&&log.session_data&&(
                        <div style={{marginBottom:10,display:"flex",flexDirection:"column",gap:8}}>
                          {log.session_data.audio_path&&(
                            <div style={{padding:"10px 14px",borderRadius:12,
                              background:`${G}0d`,border:`1px solid ${G}22`,
                              display:"flex",alignItems:"center",gap:10}}>
                              <div style={{width:38,height:38,borderRadius:10,background:G,
                                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                                <Volume2 size={18} color={GOLD}/>
                              </div>
                              <div style={{flex:1}}>
                                <div style={{fontSize:11,fontWeight:800,color:G}}>Student's Recitation</div>
                                <div style={{fontSize:9,color:"#9aab94",marginTop:1}}>Tap to listen</div>
                              </div>
                              <button onClick={()=>playAudio(log.id,log.session_data.audio_path)}
                                disabled={audioLoading===log.id}
                                style={{width:44,height:44,borderRadius:12,border:"none",cursor:"pointer",
                                  display:"flex",alignItems:"center",justifyContent:"center",
                                  background:audioPlaying===log.id?"#dc2626":`linear-gradient(135deg,${G},${GM})`}}>
                                {audioLoading===log.id
                                  ?<Loader2 size={18} color={GOLD} style={{animation:"spin 1s linear infinite"}}/>
                                  :audioPlaying===log.id?<Pause size={18} color={GOLD}/>:<Play size={18} color={GOLD}/>}
                              </button>
                            </div>
                          )}
                          {log.session_data.transcript&&(
                            <div style={{padding:"10px 12px",borderRadius:12,background:"#f8f8f8",border:`1px solid ${BRD}`}}>
                              <div style={{fontSize:10,fontWeight:800,color:G,marginBottom:6}}>🎙 Transcription</div>
                              <p style={{fontSize:14,color:"#1a1a1a",lineHeight:2.2,direction:"rtl" as const,
                                fontFamily:"'Amiri',serif",textAlign:"right" as const,wordBreak:"break-word" as const}}>
                                {log.session_data.transcript}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Acknowledge */}
                      {isAcked?(
                        <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",
                          borderRadius:10,background:"#f3e8ff",border:"1px solid #c4b5fd"}}>
                          <CheckCircle2 size={16} color="#7c3aed"/>
                          <div>
                            <div style={{fontSize:11,fontWeight:700,color:"#7c3aed"}}>Acknowledged ✓</div>
                            {log.ack_note&&<div style={{fontSize:10,color:"#6b7280"}}>{log.ack_note}</div>}
                          </div>
                        </div>
                      ):(
                        <div style={{display:"flex",flexDirection:"column",gap:6}}>
                          <textarea value={ackNote[log.id]||""}
                            onChange={e=>setAckNote(n=>({...n,[log.id]:e.target.value}))}
                            placeholder="Optional note (e.g. MashaAllah, well done!)" rows={2}
                            style={{width:"100%",padding:"8px 10px",borderRadius:8,
                              border:`1.5px solid ${BRD}`,fontSize:12,color:"#374151",
                              background:W,resize:"none" as const,boxSizing:"border-box" as const}}/>
                          <button onClick={()=>acknowledge(log,s.user_id)} disabled={ackLoading===log.id}
                            style={{padding:"10px",borderRadius:10,border:"none",background:"#7c3aed",
                              color:"#fff",fontWeight:800,fontSize:13,cursor:"pointer",
                              display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                            {ackLoading===log.id
                              ?<Loader2 size={14} style={{animation:"spin 1s linear infinite"}}/>
                              :<Check size={14}/>}
                            Acknowledge Session
                          </button>
                        </div>
                      )}
                    </div>
                  ):(
                    <div style={{padding:"10px 12px",borderRadius:10,background:"#fff7ed",
                      border:"1px solid #fed7aa",display:"flex",alignItems:"center",gap:8}}>
                      <Clock size={14} color="#f59e0b"/>
                      <span style={{fontSize:12,color:"#92400e",fontWeight:600}}>
                        {assign?"Not revised yet today":"Assign a task first"}
                      </span>
                    </div>
                  )}

                  {/* Payment section */}
                  <div style={{borderTop:`1px solid ${BRD}`,paddingTop:12}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                      <div style={{fontSize:10,fontWeight:800,color:GOLD,letterSpacing:1,
                        textTransform:"uppercase" as const,display:"flex",alignItems:"center",gap:6}}>
                        <CreditCard size={11}/> Payment
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <PayPill status={s.payment_status} exempt={s.is_payment_exempt}/>
                        {!s.is_payment_exempt&&s.payment_status!=="paid"&&(
                          <button onClick={()=>markPaid(s)} disabled={markingPaid===s.user_id}
                            style={{padding:"4px 10px",borderRadius:8,border:"none",cursor:"pointer",
                              background:`linear-gradient(135deg,${G},${GM})`,color:"#fff",
                              fontWeight:800,fontSize:10,display:"flex",alignItems:"center",gap:4}}>
                            {markingPaid===s.user_id
                              ?<Loader2 size={10} style={{animation:"spin 1s linear infinite"}}/>
                              :<CheckCircle size={10}/>}
                            Mark Paid
                          </button>
                        )}
                      </div>
                    </div>

                    {loadingPay===s.user_id?(
                      <div style={{textAlign:"center",padding:10}}>
                        <Loader2 size={16} style={{animation:"spin 1s linear infinite",color:G}}/>
                      </div>
                    ):(payHistory[s.user_id]||[]).length===0?(
                      <div style={{fontSize:11,color:"#9aab94",padding:"4px 0"}}>No payment records.</div>
                    ):(
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {(payHistory[s.user_id]||[]).map((p:any,i:number)=>(
                          <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                            padding:"8px 10px",borderRadius:10,background:W,
                            border:`1px solid ${p.status==="success"?"#86efac":BRD}`}}>
                            <div>
                              <div style={{fontSize:11,fontWeight:700,color:"#111"}}>
                                ₦{(p.amount||0).toLocaleString()} — {p.plan||"Subscription"}
                              </div>
                              <div style={{fontSize:9,color:"#9aab94"}}>
                                {p.reference} · {new Date(p.created_at).toLocaleDateString()}
                              </div>
                            </div>
                            {p.status==="success"
                              ?<CheckCircle size={14} color="#16a34a"/>
                              :<XCircle size={14} color="#dc2626"/>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
