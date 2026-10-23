/*  src/components/hifdh/ReviewSection.tsx  */
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Props { userId: string | null; }
interface ProgressEntry { id:string; surah_num:number; surah_name:string; last_reviewed:string; best_accuracy:number; times_reviewed:number; }

const daysSince = (iso:string) => Math.floor((Date.now()-new Date(iso).getTime())/86400000);
const dueInterval = (t:number) => t<=1?1:t<=3?3:t<=7?7:t<=14?14:30;
const isDue = (e:ProgressEntry) => daysSince(e.last_reviewed)>=dueInterval(e.times_reviewed);
const priorityColor = (e:ProgressEntry) => { const ov=daysSince(e.last_reviewed)-dueInterval(e.times_reviewed); return ov>=7?"#c0392b":ov>=0?"#b7791f":"#276749"; };
const priorityBg    = (e:ProgressEntry) => { const ov=daysSince(e.last_reviewed)-dueInterval(e.times_reviewed); return ov>=7?"#fff5f5":ov>=0?"#fffbeb":"#f0fff4"; };
const priorityLabel = (e:ProgressEntry) => { const d=daysSince(e.last_reviewed),iv=dueInterval(e.times_reviewed); return d-iv>=7?"Overdue":d>=iv?"Due Now":`In ${iv-d}d`; };

export default function ReviewSection({ userId }: Props) {
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [filter, setFilter]     = useState<"due"|"all"|"done">("due");
  const [loading, setLoading]   = useState(true);
  const [stats, setStats]       = useState({ due:0, doneToday:0, total:0 });

  useEffect(()=>{
    if (!userId) return;
    setLoading(true);
    supabase.from("hifdh_progress").select("*").eq("user_id",userId).order("last_reviewed",{ascending:true})
      .then(({data})=>{
        if (!data){setLoading(false);return;}
        const entries=data as ProgressEntry[];
        setProgress(entries);
        setStats({ due:entries.filter(isDue).length, doneToday:entries.filter(e=>daysSince(e.last_reviewed)===0).length, total:entries.length });
        setLoading(false);
      });
  },[userId]);

  const filtered = progress.filter(e=>filter==="due"?isDue(e):filter==="done"?daysSince(e.last_reviewed)===0:true)
    .sort((a,b)=>(daysSince(b.last_reviewed)-dueInterval(b.times_reviewed))-(daysSince(a.last_reviewed)-dueInterval(a.times_reviewed)));

  const card=(ex?:React.CSSProperties):React.CSSProperties=>({background:"#fff",border:"1px solid #e2e8f0",borderRadius:16,boxShadow:"0 1px 6px rgba(0,0,0,.05)",...ex});

  if (loading) return <div style={{textAlign:"center",padding:"60px 20px",fontSize:13,color:"#7a9e88",animation:"pulse 1s infinite"}}>Loading…</div>;

  return (
    <div style={{padding:"18px 16px",display:"flex",flexDirection:"column",gap:16}}>

      {/* Header stats */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
        {[{icon:"⏰",val:stats.due,label:"Due Today",ar:"مستحق اليوم",color:"#b7791f"},{icon:"✅",val:stats.doneToday,label:"Done Today",ar:"أنجزت اليوم",color:"#276749"},{icon:"📚",val:stats.total,label:"Total Surahs",ar:"إجمالي السور",color:"#1a3d24"}].map((s,i)=>(
          <div key={i} style={card({textAlign:"center",padding:"14px 10px"})}>
            <div style={{fontSize:22,marginBottom:6}}>{s.icon}</div>
            <div style={{fontSize:24,fontWeight:900,color:s.color}}>{s.val}</div>
            <div style={{fontSize:12,fontWeight:700,color:"#1a3d24",marginTop:3}}>{s.label}</div>
            <div style={{fontSize:10,color:"#7a9e88"}}>{s.ar}</div>
          </div>
        ))}
      </div>

      {/* SRS explanation */}
      <div style={card({padding:"16px",background:"#fffbeb",border:"1px solid #f6d860"})}>
        <div style={{textAlign:"center",marginBottom:8}}>
          <div style={{fontFamily:"'Amiri',serif",fontSize:16,fontWeight:700,color:"#1a3d24"}}>Smart Revision System</div>
          <div style={{fontSize:11,color:"#b7791f"}}>نظام المراجعة الذكية</div>
        </div>
        <div style={{fontSize:12,color:"#718096",lineHeight:1.7,textAlign:"center",marginBottom:10}}>
          The more you review, the longer the gap. Higher accuracy = longer intervals.
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap" as const,justifyContent:"center"}}>
          {[["1st","→ 1 day"],["3×","→ 3 days"],["7×","→ 1 week"],["14×","→ 1 month"]].map(([l,v],i)=>(
            <div key={i} style={{fontSize:11,padding:"4px 10px",borderRadius:10,background:"#fff",border:"1px solid #f6d860",color:"#b7791f",fontWeight:600}}>
              {l} <b>{v}</b>
            </div>
          ))}
        </div>
      </div>

      {/* Filter */}
      <div style={{display:"flex",background:"#f8fafb",borderRadius:12,padding:4,border:"1px solid #e2e8f0"}}>
        {([["due","⏰","Due","مستحق"],["all","📚","All","الكل"],["done","✅","Done Today","أنجزت"]] as const).map(([k,icon,en,ar])=>(
          <button key={k} onClick={()=>setFilter(k)}
            style={{flex:1,padding:"9px 4px",borderRadius:9,border:"none",fontSize:11,background:filter===k?"#fff":"transparent",color:filter===k?"#1a3d24":"#7a9e88",fontWeight:filter===k?700:400,boxShadow:filter===k?"0 1px 4px rgba(0,0,0,.08)":"none"}}>
            <div style={{fontSize:16,marginBottom:2}}>{icon}</div>
            <div style={{fontWeight:700}}>{en}</div>
            <div style={{fontSize:9,color:filter===k?"#b7791f":"#a0aec0"}}>{ar}</div>
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length===0 ? (
        <div style={card({padding:"44px 20px",textAlign:"center"})}>
          {filter==="due"?(
            <>
              <div style={{fontSize:44,marginBottom:12}}>🎉</div>
              <div style={{fontFamily:"'Amiri',serif",fontSize:20,color:"#276749",fontWeight:700}}>All caught up!</div>
              <div style={{fontSize:13,color:"#7a9e88",marginTop:4}}>No surahs due for review right now</div>
              <div style={{fontSize:11,color:"#7a9e88",marginTop:2}}>لا توجد سور مستحقة الآن</div>
            </>
          ):(
            <>
              <div style={{fontSize:44,marginBottom:12}}>📭</div>
              <div style={{fontFamily:"'Amiri',serif",fontSize:18,color:"#1a3d24"}}>Nothing here yet</div>
              <div style={{fontSize:13,color:"#7a9e88",marginTop:4}}>Start reciting to track your surahs</div>
            </>
          )}
        </div>
      ):filtered.map((entry,i)=>{
        const days=daysSince(entry.last_reviewed); const interval=dueInterval(entry.times_reviewed);
        const col=priorityColor(entry); const bg=priorityBg(entry);
        return (
          <div key={i} style={card({padding:0,overflow:"hidden"})}>
            <div style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",background:bg,borderBottom:"1px solid #e2e8f0"}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:col,flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:900,color:"#1a3d24"}}>{entry.surah_name}</div>
                <div style={{fontSize:11,color:"#7a9e88"}}>Reviewed {entry.times_reviewed}× · Last: {days===0?"today":`${days}d ago`}</div>
              </div>
              <div style={{fontSize:11,padding:"4px 10px",borderRadius:10,fontWeight:700,background:"#fff",color:col,border:`1px solid ${col}44`}}>
                {priorityLabel(entry)}
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:14,padding:"12px 16px"}}>
              {/* Accuracy ring */}
              <div style={{width:54,height:54,borderRadius:"50%",background:`conic-gradient(${entry.best_accuracy>=80?"#276749":entry.best_accuracy>=60?"#b7791f":"#c0392b"} 0deg ${Math.round(entry.best_accuracy*3.6)}deg,#f0f4f0 ${Math.round(entry.best_accuracy*3.6)}deg)`,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",flexShrink:0}}>
                <div style={{position:"absolute",width:40,height:40,borderRadius:"50%",background:"#fff"}}/>
                <span style={{position:"relative",fontSize:12,fontWeight:900,color:"#1a3d24"}}>{entry.best_accuracy}%</span>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:700,color:"#1a3d24",marginBottom:5}}>Best Accuracy</div>
                <div style={{height:5,borderRadius:3,background:"#f0f4f0",overflow:"hidden"}}>
                  <div style={{width:`${entry.best_accuracy}%`,height:"100%",borderRadius:3,background:entry.best_accuracy>=80?"#276749":entry.best_accuracy>=60?"#b7791f":"#c0392b"}}/>
                </div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:11,color:"#7a9e88",fontWeight:600}}>Review every</div>
                <div style={{fontSize:16,fontWeight:900,color:"#1a3d24"}}>{interval}d</div>
              </div>
            </div>
            <div style={{padding:"0 16px 14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:10,fontWeight:600,color:"#7a9e88",marginBottom:4}}>
                <span>Last reviewed</span>
                <span>{isDue(entry)?"⚠️ Due now":`Next in ${Math.max(0,interval-days)}d`}</span>
              </div>
              <div style={{height:5,borderRadius:3,background:"#f0f4f0",overflow:"hidden"}}>
                <div style={{width:`${Math.min(100,Math.round((days/interval)*100))}%`,height:"100%",borderRadius:3,background:isDue(entry)?"#c0392b":"#276749"}}/>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
