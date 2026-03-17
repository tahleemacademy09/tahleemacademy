/*
  src/components/hifdh/ReviewSection.tsx
  ────────────────────────────────────────
  Spaced repetition review section
  Shows surahs due for review, accuracy history, quick revision mode
*/

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Props { userId: string | null; }

interface ProgressEntry {
  id: string;
  surah_num: number;
  surah_name: string;
  last_reviewed: string;
  best_accuracy: number;
  times_reviewed: number;
}

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

// Spaced repetition intervals: after N reviews, due every X days
const dueInterval = (times: number) => {
  if (times <= 1)  return 1;
  if (times <= 3)  return 3;
  if (times <= 7)  return 7;
  if (times <= 14) return 14;
  return 30;
};

const isDue = (entry: ProgressEntry) => {
  const days = daysSince(entry.last_reviewed);
  return days >= dueInterval(entry.times_reviewed);
};

const priorityColor = (entry: ProgressEntry) => {
  const days = daysSince(entry.last_reviewed);
  const interval = dueInterval(entry.times_reviewed);
  const overdue = days - interval;
  if (overdue >= 7) return "#c0392b";
  if (overdue >= 0) return "#b7791f";
  return "#276749";
};

const priorityBg = (entry: ProgressEntry) => {
  const days = daysSince(entry.last_reviewed);
  const interval = dueInterval(entry.times_reviewed);
  if (days - interval >= 7) return "#fff5f5";
  if (days >= interval)     return "#fffbeb";
  return "#f0fff4";
};

const priorityLabel = (entry: ProgressEntry) => {
  const days = daysSince(entry.last_reviewed);
  const interval = dueInterval(entry.times_reviewed);
  const overdue = days - interval;
  if (overdue >= 7) return "Overdue · متأخر";
  if (overdue >= 0) return "Due Now · حان الوقت";
  return `Due in ${interval - days}d`;
};

export default function ReviewSection({ userId }: Props) {
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [filter, setFilter]     = useState<"all" | "due" | "completed">("due");
  const [loading, setLoading]   = useState(true);
  const [stats, setStats]       = useState({ dueCount: 0, completedToday: 0, totalSurahs: 0 });

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    supabase.from("hifdh_progress")
      .select("id,surah_num,surah_name,last_reviewed,best_accuracy,times_reviewed")
      .eq("user_id", userId)
      .order("last_reviewed", { ascending: true })
      .then(({ data }) => {
        if (!data) { setLoading(false); return; }
        const entries = data as ProgressEntry[];
        setProgress(entries);
        const dueCount = entries.filter(isDue).length;
        const completedToday = entries.filter(e => daysSince(e.last_reviewed) === 0).length;
        setStats({ dueCount, completedToday, totalSurahs: entries.length });
        setLoading(false);
      });
  }, [userId]);

  const filtered = progress.filter(e => {
    if (filter === "due")       return isDue(e);
    if (filter === "completed") return daysSince(e.last_reviewed) === 0;
    return true;
  }).sort((a, b) => {
    const daysA = daysSince(a.last_reviewed) - dueInterval(a.times_reviewed);
    const daysB = daysSince(b.last_reviewed) - dueInterval(b.times_reviewed);
    return daysB - daysA; // most overdue first
  });

  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background:"#fff", border:"1px solid #e8f0eb", borderRadius:16,
    boxShadow:"0 1px 6px rgba(0,0,0,.05)", ...ex,
  });

  if (loading) return (
    <div style={{ textAlign:"center", padding:"60px 20px" }}>
      <div style={{ fontSize:12, color:"#7a9e88", animation:"pulse 1s infinite" }}>Loading…</div>
    </div>
  );

  return (
    <div style={{ padding:"18px 16px", display:"flex", flexDirection:"column", gap:16 }}>

      {/* Stats Row */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
        {[
          { icon:"⏰", val:stats.dueCount,       label:"Due Today",       ar:"مستحق اليوم",  color:"#b7791f" },
          { icon:"✅", val:stats.completedToday,  label:"Done Today",      ar:"أنجزت اليوم",  color:"#276749" },
          { icon:"📚", val:stats.totalSurahs,     label:"Total Surahs",    ar:"إجمالي السور", color:"#1a3d24" },
        ].map((s,i)=>(
          <div key={i} style={card({ textAlign:"center", padding:"14px 10px" })}>
            <div style={{ fontSize:22, marginBottom:6 }}>{s.icon}</div>
            <div style={{ fontSize:24, fontWeight:900, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:11, fontWeight:600, color:"#1a3d24", marginTop:3 }}>{s.label}</div>
            <div style={{ fontSize:9, color:"#7a9e88" }}>{s.ar}</div>
          </div>
        ))}
      </div>

      {/* How SRS Works */}
      <div style={card({ padding:"16px", background:"#fffbeb", border:"1px solid #f6d860" })}>
        <div style={{ fontFamily:"'Amiri',serif", fontSize:15, fontWeight:700, color:"#1a3d24", marginBottom:6 }}>
          📊 How Smart Revision Works · كيف يعمل نظام المراجعة الذكية
        </div>
        <div style={{ fontSize:12, color:"#7a9e88", lineHeight:1.6 }}>
          The more you review a surah, the longer the gap before the next review.
          Surahs with higher accuracy get longer intervals.
        </div>
        <div style={{ display:"flex", gap:6, marginTop:10, flexWrap:"wrap" as const }}>
          {[["1st review","→ 1 day"],["3 reviews","→ 3 days"],["7 reviews","→ 1 week"],["14+ reviews","→ 1 month"]].map(([l,v],i)=>(
            <div key={i} style={{ fontSize:10, padding:"3px 8px", borderRadius:10, background:"#fff", border:"1px solid #f6d860", color:"#b7791f" }}>
              {l} <b>{v}</b>
            </div>
          ))}
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display:"flex", background:"#f8fafb", borderRadius:12, padding:4, border:"1px solid #e8f0eb" }}>
        {([["due","⏰","Due","مستحق"],["all","📚","All","الكل"],["completed","✅","Done Today","أنجزت"]] as const).map(([k,icon,en,ar])=>(
          <button key={k} onClick={()=>setFilter(k)}
            style={{ flex:1, padding:"8px 4px", borderRadius:9, border:"none", fontSize:11,
              background: filter===k ? "#fff" : "transparent",
              color: filter===k ? "#1a3d24" : "#7a9e88",
              fontWeight: filter===k ? 700 : 400,
              boxShadow: filter===k ? "0 1px 4px rgba(0,0,0,.08)" : "none",
            }}>
            {icon} {en} · {ar}
          </button>
        ))}
      </div>

      {/* Surah List */}
      {filtered.length === 0 ? (
        <div style={card({ padding:"40px 20px", textAlign:"center" })}>
          {filter === "due" ? (
            <>
              <div style={{ fontSize:40, marginBottom:12 }}>🎉</div>
              <div style={{ fontFamily:"'Amiri',serif", fontSize:18, color:"#276749", fontWeight:700 }}>All caught up!</div>
              <div style={{ fontSize:12, color:"#7a9e88", marginTop:4 }}>No surahs due for review right now · لا توجد سور مستحقة الآن</div>
            </>
          ) : (
            <>
              <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
              <div style={{ fontFamily:"'Amiri',serif", fontSize:16, color:"#1a3d24" }}>Nothing here yet</div>
              <div style={{ fontSize:12, color:"#7a9e88", marginTop:4 }}>Start reciting to track your surahs · ابدأ التلاوة لتتبع سورك</div>
            </>
          )}
        </div>
      ) : filtered.map((entry, i) => {
        const days = daysSince(entry.last_reviewed);
        const interval = dueInterval(entry.times_reviewed);
        const col = priorityColor(entry);
        const bg  = priorityBg(entry);
        const accuracy = entry.best_accuracy;
        return (
          <div key={i} style={card({ padding:0, overflow:"hidden" })}>
            <div style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", background:bg, borderBottom:"1px solid #e8f0eb" }}>
              <div style={{ width:10, height:10, borderRadius:"50%", background:col, flexShrink:0 }} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:700, color:"#1a3d24" }}>{entry.surah_name}</div>
                <div style={{ fontSize:11, color:"#7a9e88" }}>
                  Reviewed {entry.times_reviewed}× · Last: {days===0?"today":`${days}d ago`}
                </div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:10, padding:"3px 10px", borderRadius:10, fontWeight:700, background:"#fff", color:col, border:`1px solid ${col}44` }}>
                  {priorityLabel(entry)}
                </div>
              </div>
            </div>

            {/* Accuracy + next due */}
            <div style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 16px" }}>
              {/* Accuracy ring */}
              <div style={{ width:52, height:52, borderRadius:"50%", background:`conic-gradient(${accuracy>=80?"#276749":accuracy>=60?"#b7791f":"#c0392b"} 0deg ${Math.round(accuracy*3.6)}deg,#f0f4f0 ${Math.round(accuracy*3.6)}deg)`, display:"flex", alignItems:"center", justifyContent:"center", position:"relative", flexShrink:0 }}>
                <div style={{ position:"absolute", width:38, height:38, borderRadius:"50%", background:"#fff" }} />
                <span style={{ position:"relative", fontSize:11, fontWeight:700, color:"#1a3d24" }}>{accuracy}%</span>
              </div>

              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:"#7a9e88", marginBottom:4 }}>
                  Best accuracy · أفضل دقة
                </div>
                <div style={{ height:4, borderRadius:2, background:"#f0f4f0", overflow:"hidden" }}>
                  <div style={{ width:`${accuracy}%`, height:"100%", borderRadius:2, background:accuracy>=80?"#276749":accuracy>=60?"#b7791f":"#c0392b" }} />
                </div>
              </div>

              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:10, color:"#7a9e88" }}>Review every</div>
                <div style={{ fontSize:14, fontWeight:700, color:"#1a3d24" }}>{interval}d</div>
              </div>
            </div>

            {/* Review button */}
            <div style={{ padding:"0 16px 14px" }}>
              <div style={{ fontSize:11, color:"#7a9e88", marginBottom:8 }}>
                {isDue(entry)
                  ? "⚠️ Due for review — go to Recitation tab to review this surah"
                  : `✅ Next review due in ${Math.max(0, interval - days)} day(s)`}
              </div>
              <div style={{ width:"100%", height:4, borderRadius:2, background:"#f0f4f0", overflow:"hidden" }}>
                <div style={{
                  width:`${Math.min(100,Math.round((days/interval)*100))}%`,
                  height:"100%", borderRadius:2,
                  background: isDue(entry) ? "#c0392b" : "#276749",
                }} />
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:"#7a9e88", marginTop:3 }}>
                <span>Last reviewed</span>
                <span>Due</span>
              </div>
            </div>
          </div>
        );
      })}

    </div>
  );
}
