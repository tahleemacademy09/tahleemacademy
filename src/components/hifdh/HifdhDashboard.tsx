/*  src/components/hifdh/HifdhDashboard.tsx  */
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  userId: string | null;
  studentName: string;
  onNavigate: (tab: string) => void;
}

interface ProgressEntry {
  surah_num: number; surah_name: string;
  last_reviewed: string; best_accuracy: number; times_reviewed: number;
}
interface SessionEntry {
  surah_name: string; ayah_start: number;
  accuracy_score: number; created_at: string; duration: number;
}
interface DailyTask {
  id?: string; user_id: string; task_type: "memorize"|"revise";
  surah_name: string; verses_count: number; completed: boolean;
  target_date: string;
}

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
const urgencyColor = (d: number) => d >= 10 ? "#c0392b" : d >= 5 ? "#b7791f" : "#276749";
const urgencyLabel = (d: number) => d >= 10 ? "Urgent" : d >= 5 ? "Soon" : "On Track";

const JUZ_NAMES = ["الم","سَيَقُول","تِلْكَ","لَن","وَالْمُحْصَنَات","لَا يُحِبُّ","وَإِذَا","وَلَوْ","قَالَ الْمَلَأُ","وَاعْلَمُوا","يَعْتَذِرُون","وَمَا مِن دَابَّة","وَمَا أُبَرِّئُ","رُبَمَا","سُبْحَانَ","قَالَ أَلَمْ","اقْتَرَبَ","قَدْ أَفْلَحَ","وَقَالَ الَّذِينَ","أَمَّنْ خَلَقَ","اتْلُ مَا أُوحِيَ","وَمَن يَقْنُتْ","وَمَا لِيَ","فَمَن أَظْلَمُ","إِلَيْهِ يُرَدُّ","حم","قَالَ فَمَا خَطْبُكُمْ","قَدْ سَمِعَ","تَبَارَكَ","عَمَّ"];

export default function HifdhDashboard({ userId, studentName, onNavigate }: Props) {
  const [progress, setProgress]   = useState<ProgressEntry[]>([]);
  const [sessions, setSessions]   = useState<SessionEntry[]>([]);
  const [juzDone, setJuzDone]     = useState<number[]>([]);
  const [juzPartial, setJuzPartial] = useState<number[]>([]);
  const [stats, setStats]         = useState({ streak: 0, avgAccuracy: 0, totalMins: 0, juzCount: 0 });
  const [tasks, setTasks]         = useState<DailyTask[]>([]);
  const [loading, setLoading]     = useState(true);

  // Collapse state
  const [showJuz, setShowJuz]           = useState(true);
  const [showSchedule, setShowSchedule] = useState(true);
  const [showSessions, setShowSessions] = useState(true);
  const [showTasks, setShowTasks]       = useState(true);

  // Daily task form
  const [taskType, setTaskType]         = useState<"memorize"|"revise">("revise");
  const [taskSurah, setTaskSurah]       = useState("");
  const [taskVerses, setTaskVerses]     = useState("5");
  const [taskPlan, setTaskPlan]         = useState<"daily"|"weekly"|"biweekly"|"monthly">("daily");
  const [savingTask, setSavingTask]     = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([
      supabase.from("hifdh_progress").select("*").eq("user_id", userId).order("last_reviewed", { ascending: true }),
      supabase.from("hifdh_sessions").select("surah_name,ayah_start,accuracy_score,created_at,duration").eq("student_id", userId).order("created_at", { ascending: false }).limit(6),
      supabase.from("hifdh_daily_tasks").select("*").eq("user_id", userId).eq("target_date", new Date().toISOString().split("T")[0]).order("created_at", { ascending: true }),
    ]).then(([prog, sess, taskRes]) => {
      if (prog.data) {
        const entries = prog.data as ProgressEntry[];
        setProgress(entries);
        const done: number[] = []; const partial: number[] = [];
        entries.forEach(p => {
          const j = Math.min(30, Math.ceil(p.surah_num / 4.27));
          if (p.best_accuracy >= 80 && !done.includes(j)) done.push(j);
          else if (!partial.includes(j) && !done.includes(j)) partial.push(j);
        });
        setJuzDone(done); setJuzPartial(partial);
        const scores = entries.map(p => p.best_accuracy).filter(Boolean);
        const avg = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
        setStats(s => ({ ...s, avgAccuracy: avg, juzCount: done.length }));
      }
      if (sess.data) {
        setSessions(sess.data as SessionEntry[]);
        const dates = [...new Set(sess.data.map((s:any) => new Date(s.created_at).toDateString()))];
        let streak = 0;
        for (let i = 0; i < 30; i++) {
          const d = new Date(); d.setDate(d.getDate() - i);
          if (dates.includes(d.toDateString())) streak++;
          else if (i > 0) break;
        }
        const totalMins = Math.round(sess.data.reduce((a:number,s:any)=>a+(s.duration||0),0)/60);
        setStats(prev => ({ ...prev, streak, totalMins }));
      }
      if (taskRes.data) setTasks(taskRes.data as DailyTask[]);
      setLoading(false);
    });
  }, [userId]);

  const addTask = async () => {
    if (!userId || !taskSurah.trim()) return;
    setSavingTask(true);
    const today = new Date().toISOString().split("T")[0];
    const dates: string[] = [];
    const count = taskPlan==="daily"?1:taskPlan==="weekly"?7:taskPlan==="biweekly"?14:30;
    for (let i=0;i<count;i++) {
      const d = new Date(); d.setDate(d.getDate()+i);
      dates.push(d.toISOString().split("T")[0]);
    }
    const inserts = dates.map(d => ({ user_id:userId, task_type:taskType, surah_name:taskSurah.trim(), verses_count:parseInt(taskVerses)||5, completed:false, target_date:d }));
    const { data } = await supabase.from("hifdh_daily_tasks").insert(inserts).select();
    if (data) setTasks(prev => [...prev, ...data.filter((t:any)=>t.target_date===today) as DailyTask[]]);
    setSavingTask(false); setTaskSurah("");
  };

  const toggleTask = async (task: DailyTask) => {
    if (!task.id) return;
    await supabase.from("hifdh_daily_tasks").update({ completed: !task.completed }).eq("id", task.id);
    setTasks(prev => prev.map(t => t.id===task.id ? {...t,completed:!t.completed} : t));
  };

  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16,
    boxShadow: "0 1px 6px rgba(0,0,0,.05)", ...ex,
  });

  const sectionHeader = (title: string, ar: string, open: boolean, toggle: () => void, onClick?: () => void) => (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: open?14:0, cursor:"pointer" }}
      onClick={toggle}>
      <div style={{ textAlign:"center", flex:1 }}>
        <div style={{ fontFamily:"'Amiri',serif", fontSize:17, fontWeight:700, color:"#1a3d24", cursor: onClick?"pointer":"default" }}
          onClick={e => { if(onClick){e.stopPropagation();onClick();} }}>
          {title}
        </div>
        <div style={{ fontSize:11, color:"#b7791f", fontStyle:"italic" }}>{ar}</div>
      </div>
      <div style={{ fontSize:18, color:"#7a9e88", flexShrink:0 }}>{open?"▲":"▼"}</div>
    </div>
  );

  if (loading) return (
    <div style={{ textAlign:"center", padding:"60px 20px" }}>
      <div style={{ fontSize:13, color:"#7a9e88", animation:"pulse 1s infinite" }}>Loading your dashboard…</div>
    </div>
  );

  const completedToday = tasks.filter(t=>t.completed).length;
  const totalToday = tasks.length;

  return (
    <div style={{ padding:"18px 16px", display:"flex", flexDirection:"column", gap:16 }}>

      {/* Stats Grid — all clickable */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {[
          { icon:"📖", val:stats.juzCount||"0", label:"Juz Memorized", ar:"أجزاء محفوظة", color:"#1a3d24", tab:"recitation" as const },
          { icon:"📊", val:`${stats.avgAccuracy}%`, label:"Avg Accuracy", ar:"متوسط الدقة", color:"#276749", tab:"test" as const },
          { icon:"🔥", val:stats.streak, label:"Day Streak", ar:"سلسلة الأيام", color:"#b7791f", tab:"test" as const },
          { icon:"⏱️", val:`${stats.totalMins}m`, label:"Total Time", ar:"إجمالي الوقت", color:"#2b6cb0", tab:"recitation" as const },
        ].map((s,i)=>(
          <div key={i} onClick={()=>onNavigate(s.tab)}
            style={card({ textAlign:"center", padding:"16px 12px", cursor:"pointer", transition:"all .15s" })}>
            <div style={{ fontSize:26, marginBottom:8 }}>{s.icon}</div>
            <div style={{ fontSize:28, fontWeight:900, color:s.color, lineHeight:1 }}>{s.val}</div>
            <div style={{ fontSize:13, fontWeight:700, color:"#1a3d24", marginTop:5 }}>{s.label}</div>
            <div style={{ fontSize:11, color:"#7a9e88", marginTop:2 }}>{s.ar}</div>
          </div>
        ))}
      </div>

      {/* Daily Tasks */}
      <div style={card({ padding:"18px 16px" })}>
        {sectionHeader("Today's Tasks","مهام اليوم", showTasks, ()=>setShowTasks(v=>!v))}
        {showTasks && (
          <>
            {/* Progress bar */}
            {totalToday > 0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#7a9e88", marginBottom:5 }}>
                  <span>{completedToday} of {totalToday} completed</span>
                  <span>{Math.round((completedToday/totalToday)*100)}%</span>
                </div>
                <div style={{ height:8, borderRadius:4, background:"#f0f4f0", overflow:"hidden" }}>
                  <div style={{ width:`${Math.round((completedToday/totalToday)*100)}%`, height:"100%", borderRadius:4, background:"linear-gradient(90deg,#276749,#b7791f)", transition:"width .5s" }} />
                </div>
              </div>
            )}

            {/* Task list */}
            {tasks.length === 0 ? (
              <div style={{ textAlign:"center", padding:"14px 0", fontSize:13, color:"#7a9e88" }}>
                No tasks for today yet
                <div style={{ fontSize:11, marginTop:2 }}>لا توجد مهام اليوم بعد</div>
              </div>
            ) : tasks.map((t,i)=>(
              <div key={i} onClick={()=>toggleTask(t)}
                style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:10, marginBottom:6, cursor:"pointer",
                  background: t.completed ? "#f0fff4" : "#f8fafb",
                  border:`1px solid ${t.completed?"#9ae6b4":"#e2e8f0"}`,
                }}>
                <div style={{ width:22, height:22, borderRadius:"50%", border:`2px solid ${t.completed?"#276749":"#cbd5e0"}`, background:t.completed?"#276749":"#fff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  {t.completed && <span style={{ fontSize:12, color:"#fff" }}>✓</span>}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#1a3d24", textDecoration:t.completed?"line-through":"none" }}>
                    {t.task_type==="memorize"?"📖 Memorize":"🔄 Revise"} · {t.surah_name}
                  </div>
                  <div style={{ fontSize:11, color:"#7a9e88" }}>{t.verses_count} verses · {t.verses_count} آيات</div>
                </div>
                <div style={{ fontSize:11, padding:"3px 9px", borderRadius:10, background:t.completed?"#276749":"#f0f4f0", color:t.completed?"#fff":"#7a9e88", fontWeight:600 }}>
                  {t.completed?"Done":"Pending"}
                </div>
              </div>
            ))}

            {/* Add task form */}
            <div style={{ marginTop:14, borderTop:"1px solid #e2e8f0", paddingTop:14 }}>
              <div style={{ textAlign:"center", marginBottom:12 }}>
                <div style={{ fontSize:14, fontWeight:700, color:"#1a3d24" }}>Add New Task</div>
                <div style={{ fontSize:11, color:"#7a9e88" }}>إضافة مهمة جديدة</div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:11, color:"#7a9e88", marginBottom:4, fontWeight:600 }}>Type</div>
                  <select value={taskType} onChange={e=>setTaskType(e.target.value as any)}
                    style={{ width:"100%", background:"#f8fafb", border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 10px", fontSize:13, color:"#1a3d24" }}>
                    <option value="revise">🔄 Revise</option>
                    <option value="memorize">📖 Memorize</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:11, color:"#7a9e88", marginBottom:4, fontWeight:600 }}>Verses per day</div>
                  <input type="number" min={1} max={50} value={taskVerses} onChange={e=>setTaskVerses(e.target.value)}
                    style={{ width:"100%", background:"#f8fafb", border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 10px", fontSize:13, color:"#1a3d24" }} />
                </div>
              </div>
              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:11, color:"#7a9e88", marginBottom:4, fontWeight:600 }}>Surah name</div>
                <input value={taskSurah} onChange={e=>setTaskSurah(e.target.value)} placeholder="e.g. Al-Baqarah"
                  style={{ width:"100%", background:"#f8fafb", border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 12px", fontSize:13, color:"#1a3d24" }} />
              </div>
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, color:"#7a9e88", marginBottom:6, fontWeight:600 }}>Plan Duration</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6 }}>
                  {([["daily","Daily","يومي"],["weekly","Weekly","أسبوعي"],["biweekly","2 Weeks","أسبوعان"],["monthly","Monthly","شهري"]] as const).map(([k,en,ar])=>(
                    <div key={k} onClick={()=>setTaskPlan(k)}
                      style={{ textAlign:"center", padding:"8px 4px", borderRadius:8, cursor:"pointer",
                        background: taskPlan===k?"#1a3d24":"#f8fafb",
                        border:`1px solid ${taskPlan===k?"#1a3d24":"#e2e8f0"}`,
                      }}>
                      <div style={{ fontSize:11, fontWeight:700, color:taskPlan===k?"#fff":"#1a3d24" }}>{en}</div>
                      <div style={{ fontSize:9, color:taskPlan===k?"rgba(255,255,255,.7)":"#7a9e88" }}>{ar}</div>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={addTask} disabled={savingTask||!taskSurah.trim()}
                style={{ width:"100%", padding:"11px 0", borderRadius:12, background: savingTask||!taskSurah.trim()?"#f0f4f0":"#1a3d24", border:"none", color:savingTask||!taskSurah.trim()?"#7a9e88":"#fff", fontSize:13, fontWeight:700, cursor:savingTask||!taskSurah.trim()?"not-allowed":"pointer" }}>
                {savingTask?"Saving…":"Add Task · إضافة مهمة"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Juz Progress Map */}
      <div style={card({ padding:"18px 16px" })}>
        {sectionHeader("Juz Progress Map","خريطة الأجزاء الثلاثين", showJuz, ()=>setShowJuz(v=>!v), ()=>onNavigate("recitation"))}
        {showJuz && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:6, marginBottom:12 }}>
              {Array.from({length:30},(_,i)=>{
                const juz=i+1, done=juzDone.includes(juz), partial=juzPartial.includes(juz);
                return (
                  <div key={juz} onClick={()=>onNavigate("recitation")} title={JUZ_NAMES[i]}
                    style={{ aspectRatio:"1", borderRadius:10, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", cursor:"pointer",
                      background: done?"#1a3d24":partial?"#f0fdf4":"#f8fafb",
                      border: done?"none":partial?"1.5px solid #9ae6b4":"1px solid #e2e8f0",
                    }}>
                    <div style={{ fontSize:11, fontWeight:700, color:done?"#fff":partial?"#276749":"#718096" }}>{juz}</div>
                    {done && <div style={{ fontSize:8, color:"#b7791f" }}>✓</div>}
                  </div>
                );
              })}
            </div>
            <div style={{ display:"flex", gap:12, flexWrap:"wrap" as const }}>
              {[["#1a3d24","Memorized","محفوظ"],["#9ae6b4","In Progress","جارٍ"],["#e2e8f0","Not Started","لم يبدأ"]].map(([col,en,ar],i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11 }}>
                  <div style={{ width:12, height:12, borderRadius:3, background:col as string }} />
                  <div>
                    <span style={{ fontWeight:600, color:"#1a3d24" }}>{en}</span>
                    <span style={{ color:"#7a9e88", marginLeft:4 }}>{ar}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Revision Schedule */}
      <div style={card({ padding:"18px 16px" })}>
        {sectionHeader("Revision Schedule","جدول المراجعة", showSchedule, ()=>setShowSchedule(v=>!v), ()=>onNavigate("test"))}
        {showSchedule && (
          progress.length === 0 ? (
            <div style={{ textAlign:"center", padding:"16px 0", fontSize:13, color:"#7a9e88" }}>
              Start reciting to build your revision schedule
              <div style={{ fontSize:11, marginTop:2 }}>ابدأ التلاوة لبناء جدول مراجعتك</div>
            </div>
          ) : progress.map((r,i)=>{
            const days=daysSince(r.last_reviewed); const col=urgencyColor(days);
            return (
              <div key={i} onClick={()=>onNavigate("test")}
                style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:10, marginBottom:6, cursor:"pointer",
                  background: days>=10?"#fff5f5":days>=5?"#fffbeb":"#f0fff4",
                  border:`1px solid ${col}22`,
                }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background:col, flexShrink:0 }} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"#1a3d24" }}>{r.surah_name}</div>
                  <div style={{ fontSize:11, color:"#7a9e88" }}>
                    {days===0?"Today":`${days}d ago`} · Best: <b style={{ color:"#b7791f" }}>{r.best_accuracy}%</b>
                  </div>
                </div>
                <div style={{ fontSize:10, padding:"3px 10px", borderRadius:10, fontWeight:700, background:"#fff", color:col, border:`1px solid ${col}44` }}>
                  {urgencyLabel(days)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Recent Sessions */}
      {sessions.length > 0 && (
        <div style={card({ padding:"18px 16px" })}>
          {sectionHeader("Recent Sessions","الجلسات الأخيرة", showSessions, ()=>setShowSessions(v=>!v), ()=>onNavigate("recitation"))}
          {showSessions && sessions.map((s,i)=>(
            <div key={i} onClick={()=>onNavigate("recitation")}
              style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:i<sessions.length-1?"1px solid #f0f4f0":"none", cursor:"pointer" }}>
              <div style={{ width:42, height:42, borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:900, flexShrink:0,
                background: s.accuracy_score>=80?"#f0fff4":s.accuracy_score>=60?"#fffbeb":"#fff5f5",
                color: s.accuracy_score>=80?"#276749":s.accuracy_score>=60?"#b7791f":"#c0392b",
                border:`1px solid ${s.accuracy_score>=80?"#9ae6b4":s.accuracy_score>=60?"#f6d860":"#fca5a5"}`,
              }}>
                {s.accuracy_score}%
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#1a3d24" }}>{s.surah_name}</div>
                <div style={{ fontSize:11, color:"#7a9e88" }}>
                  Ayah {s.ayah_start} · {Math.round((s.duration||0)/60)}m · {new Date(s.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
