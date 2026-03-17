/*  src/pages/admin/HifdhAdminReview.tsx  */
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { audioManager } from "@/components/hifdh/audioManager";

interface Recording {
  id:string; student_id:string; surah_name:string; surah_num:number;
  ayah_start:number; audio_url:string; ai_score:number;
  admin_score:number|null; admin_feedback:string|null;
  status:"pending"|"reviewed"|"overridden"; transcript:string|null;
  word_results:{word:string;result:string}[]|null; created_at:string;
  student_name?:string; student_email?:string;
}
type FilterStatus="all"|"pending"|"reviewed"|"overridden";

export default function HifdhAdminReview() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState<FilterStatus>("pending");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState<string|null>(null);
  const [overrides, setOverrides]   = useState<Record<string,{score:string;feedback:string}>>({});
  const [saving, setSaving]         = useState<string|null>(null);
  const [playingId, setPlayingId]   = useState<string|null>(null);
  const [adminId, setAdminId]       = useState<string|null>(null);

  useEffect(()=>{
    supabase.auth.getUser().then(({data})=>{ if(data?.user) setAdminId(data.user.id); });
    loadRecordings();
    return ()=>{ audioManager.stop(); };
  },[]);

  const loadRecordings = async () => {
    setLoading(true);
    try {
      const {data} = await supabase.from("hifdh_recordings").select("*").order("created_at",{ascending:false}).limit(100);
      if (!data){setLoading(false);return;}
      const ids=[...new Set(data.map((r:any)=>r.student_id))];
      const {data:profiles} = await supabase.from("profiles").select("user_id,full_name,email").in("user_id",ids);
      const pmap:Record<string,{name:string;email:string}>={};
      profiles?.forEach((p:any)=>{ pmap[p.user_id]={name:p.full_name??"Student",email:p.email??""}; });
      const enriched=data.map((r:any)=>({...r,student_name:pmap[r.student_id]?.name??"Student",student_email:pmap[r.student_id]?.email??"",word_results:typeof r.word_results==="string"?JSON.parse(r.word_results):r.word_results}));
      setRecordings(enriched);
      const init:Record<string,{score:string;feedback:string}>={};
      enriched.forEach((r:Recording)=>{ init[r.id]={score:String(r.admin_score??r.ai_score),feedback:r.admin_feedback??""}; });
      setOverrides(init);
    }catch(_){}
    setLoading(false);
  };

  const playRec = (rec:Recording) => {
    if (playingId===rec.id){audioManager.stop();setPlayingId(null);return;}
    audioManager.play(rec.audio_url,()=>setPlayingId(null),()=>setPlayingId(null));
    setPlayingId(rec.id);
  };

  const saveOverride = async (rec:Recording) => {
    const ov=overrides[rec.id]; if(!ov||!adminId) return;
    setSaving(rec.id);
    try {
      const newScore=parseInt(ov.score);
      await supabase.from("hifdh_recordings").update({ admin_score:newScore, admin_feedback:ov.feedback, admin_id:adminId, admin_reviewed_at:new Date().toISOString(), status:newScore!==rec.ai_score||ov.feedback?"overridden":"reviewed" }).eq("id",rec.id);
      setRecordings(prev=>prev.map(r=>r.id===rec.id?{...r,admin_score:newScore,admin_feedback:ov.feedback,status:newScore!==rec.ai_score?"overridden":"reviewed"}:r));
    }catch(_){}
    setSaving(null);
  };

  const filtered=recordings.filter(r=>{
    const ms=filter==="all"||r.status===filter;
    const mq=!search||r.student_name?.toLowerCase().includes(search.toLowerCase())||r.surah_name?.toLowerCase().includes(search.toLowerCase());
    return ms&&mq;
  });

  const counts={pending:recordings.filter(r=>r.status==="pending").length,reviewed:recordings.filter(r=>r.status==="reviewed").length,overridden:recordings.filter(r=>r.status==="overridden").length};
  const sc=(s:number)=>s>=80?"#276749":s>=60?"#b7791f":"#c0392b";
  const sb=(s:number)=>s>=80?"#f0fff4":s>=60?"#fffbeb":"#fff5f5";

  const card=(ex?:React.CSSProperties):React.CSSProperties=>({background:"#fff",border:"1px solid #e2e8f0",borderRadius:16,boxShadow:"0 1px 6px rgba(0,0,0,.05)",...ex});

  return (
    <div style={{fontFamily:"'Cairo',sans-serif",background:"#f8fafb",minHeight:"100vh"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;700;900&display=swap'); *{box-sizing:border-box} @keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}} button,input,textarea{font-family:'Cairo',sans-serif;}`}</style>

      {/* Header */}
      <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"20px 20px 16px",position:"sticky",top:0,zIndex:10}}>
        <div style={{maxWidth:900,margin:"0 auto"}}>
          <div style={{textAlign:"center",marginBottom:14}}>
            <h1 style={{fontFamily:"'Amiri',serif",fontSize:26,fontWeight:700,color:"#1a3d24"}}>Hifdh Admin Review</h1>
            <p style={{fontSize:13,color:"#b7791f",fontStyle:"italic"}}>مراجعة تسجيلات الحِفظ</p>
          </div>
          {/* Stats */}
          <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap" as const,justifyContent:"center"}}>
            {[{l:"Pending",a:"معلق",v:counts.pending,c:"#b7791f",bg:"#fffbeb"},{l:"Reviewed",a:"راجع",v:counts.reviewed,c:"#276749",bg:"#f0fff4"},{l:"Overridden",a:"معدّل",v:counts.overridden,c:"#2b6cb0",bg:"#ebf8ff"}].map((s,i)=>(
              <div key={i} style={{background:s.bg,border:`1px solid ${s.c}33`,borderRadius:10,padding:"8px 16px",display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:20,fontWeight:900,color:s.c}}>{s.v}</span>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:s.c}}>{s.l}</div>
                  <div style={{fontSize:10,color:s.c}}>{s.a}</div>
                </div>
              </div>
            ))}
          </div>
          {/* Search + filter */}
          <div style={{display:"flex",gap:10}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search student or surah…"
              style={{flex:1,background:"#f8fafb",border:"1px solid #e2e8f0",borderRadius:10,padding:"8px 12px",fontSize:13,color:"#1a3d24"}}/>
            <div style={{display:"flex",background:"#f8fafb",border:"1px solid #e2e8f0",borderRadius:10,overflow:"hidden"}}>
              {(["all","pending","reviewed","overridden"] as FilterStatus[]).map(f=>(
                <button key={f} onClick={()=>setFilter(f)}
                  style={{padding:"8px 12px",border:"none",fontSize:11,fontWeight:filter===f?700:400,background:filter===f?"#1a3d24":"transparent",color:filter===f?"#fff":"#7a9e88"}}>
                  {f.charAt(0).toUpperCase()+f.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{maxWidth:900,margin:"0 auto",padding:"20px 16px",display:"flex",flexDirection:"column",gap:12}}>
        {loading && <div style={{textAlign:"center",padding:"60px 0",fontSize:13,color:"#7a9e88",animation:"pulse 1s infinite"}}>Loading recordings…</div>}
        {!loading&&filtered.length===0 && (
          <div style={card({padding:"50px 20px",textAlign:"center"})}>
            <div style={{fontSize:36,marginBottom:12}}>📭</div>
            <div style={{fontFamily:"'Amiri',serif",fontSize:18,color:"#1a3d24"}}>No recordings found</div>
          </div>
        )}
        {filtered.map(rec=>{
          const isExp=expanded===rec.id;
          const ov=overrides[rec.id]??{score:String(rec.ai_score),feedback:""};
          const wasOv=rec.admin_score!==null&&rec.admin_score!==rec.ai_score;
          return (
            <div key={rec.id} style={card({overflow:"hidden"})}>
              <div onClick={()=>setExpanded(isExp?null:rec.id)}
                style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",cursor:"pointer",background:isExp?"#f8fafb":"#fff"}}>
                <div style={{width:10,height:10,borderRadius:"50%",flexShrink:0,background:rec.status==="pending"?"#b7791f":rec.status==="overridden"?"#2b6cb0":"#276749"}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:900,color:"#1a3d24"}}>
                    {rec.student_name}
                    <span style={{fontSize:11,fontWeight:400,color:"#7a9e88",marginLeft:8}}>{rec.student_email}</span>
                  </div>
                  <div style={{fontSize:12,color:"#7a9e88"}}>{rec.surah_name} · Ayah {rec.ayah_start} · {new Date(rec.created_at).toLocaleDateString()}</div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <div style={{textAlign:"center",background:sb(rec.ai_score),border:`1px solid ${sc(rec.ai_score)}33`,borderRadius:8,padding:"4px 10px"}}>
                    <div style={{fontSize:10,fontWeight:600,color:"#7a9e88"}}>AI</div>
                    <div style={{fontSize:15,fontWeight:900,color:sc(rec.ai_score)}}>{rec.ai_score}%</div>
                  </div>
                  {rec.admin_score!==null&&(
                    <div style={{textAlign:"center",background:sb(rec.admin_score),border:`1px solid ${sc(rec.admin_score)}33`,borderRadius:8,padding:"4px 10px"}}>
                      <div style={{fontSize:10,fontWeight:600,color:"#7a9e88"}}>Admin</div>
                      <div style={{fontSize:15,fontWeight:900,color:sc(rec.admin_score)}}>{rec.admin_score}%</div>
                    </div>
                  )}
                </div>
                <div style={{fontSize:10,padding:"4px 10px",borderRadius:20,fontWeight:700,whiteSpace:"nowrap" as const,background:rec.status==="pending"?"#fffbeb":rec.status==="overridden"?"#ebf8ff":"#f0fff4",color:rec.status==="pending"?"#b7791f":rec.status==="overridden"?"#2b6cb0":"#276749",border:`1px solid ${rec.status==="pending"?"#f6d860":rec.status==="overridden"?"#90cdf4":"#9ae6b4"}`}}>
                  {rec.status==="pending"?"Pending":rec.status==="overridden"?"Overridden":"Reviewed"}
                </div>
                <div style={{fontSize:14,color:"#7a9e88"}}>{isExp?"▲":"▼"}</div>
              </div>

              {isExp && (
                <div style={{padding:"0 16px 16px",borderTop:"1px solid #e2e8f0"}}>
                  {/* Audio */}
                  <div style={{background:"#f8fafb",border:"1px solid #e2e8f0",borderRadius:12,padding:"14px 16px",margin:"14px 0"}}>
                    <div style={{textAlign:"center",marginBottom:10}}>
                      <div style={{fontSize:15,fontWeight:900,color:"#1a3d24"}}>🎙️ Student Recording</div>
                      <div style={{fontSize:11,color:"#b7791f"}}>تسجيل الطالب</div>
                    </div>
                    {rec.audio_url ? (
                      <div style={{display:"flex",alignItems:"center",gap:12}}>
                        <button onClick={()=>playRec(rec)}
                          style={{width:46,height:46,borderRadius:"50%",background:playingId===rec.id?"#c0392b":"#1a3d24",border:"none",color:"#fff",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>
                          {playingId===rec.id?"⏹":"▶"}
                        </button>
                        <div style={{flex:1,fontSize:13,fontWeight:700,color:playingId===rec.id?"#b7791f":"#7a9e88"}}>
                          {playingId===rec.id?"● Playing…":"Click to listen"}
                        </div>
                        <a href={rec.audio_url} download target="_blank" rel="noreferrer"
                          style={{fontSize:11,color:"#2b6cb0",textDecoration:"none",padding:"5px 10px",border:"1px solid #90cdf4",borderRadius:8,fontWeight:700}}>
                          ⬇ Download
                        </a>
                      </div>
                    ):(
                      <div style={{textAlign:"center",fontSize:13,color:"#7a9e88"}}>No audio recording available</div>
                    )}
                  </div>

                  {/* Words */}
                  {rec.word_results&&rec.word_results.length>0&&(
                    <div style={{margin:"14px 0"}}>
                      <div style={{textAlign:"center",marginBottom:8}}>
                        <div style={{fontSize:14,fontWeight:900,color:"#1a3d24"}}>Word Breakdown</div>
                        <div style={{fontSize:11,color:"#b7791f"}}>تحليل الكلمات</div>
                      </div>
                      <div style={{display:"flex",flexWrap:"wrap" as const,gap:6,direction:"rtl",marginBottom:8}}>
                        {rec.word_results.map((w,wi)=>(
                          <div key={wi} style={{padding:"4px 10px",borderRadius:20,fontSize:14,fontFamily:"'Amiri',serif",fontWeight:700,background:w.result==="correct"?"#f0fff4":w.result==="wrong"?"#fff5f5":"#f8fafb",color:w.result==="correct"?"#276749":w.result==="wrong"?"#c0392b":"#1a3d24",border:`1px solid ${w.result==="correct"?"#9ae6b4":w.result==="wrong"?"#fca5a5":"#e2e8f0"}`}}>
                            {w.word}
                          </div>
                        ))}
                      </div>
                      <div style={{display:"flex",gap:10}}>
                        {[["#276749","#f0fff4","Correct",rec.word_results.filter(w=>w.result==="correct").length],["#c0392b","#fff5f5","Wrong",rec.word_results.filter(w=>w.result==="wrong").length]].map(([col,bg,label,count],i)=>(
                          <div key={i} style={{fontSize:12,fontWeight:700,padding:"4px 12px",borderRadius:10,background:bg as string,color:col as string}}>
                            {label}: {count}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Transcript */}
                  {rec.transcript&&(
                    <div style={{margin:"14px 0"}}>
                      <div style={{textAlign:"center",marginBottom:6}}>
                        <div style={{fontSize:14,fontWeight:900,color:"#1a3d24"}}>Transcript</div>
                        <div style={{fontSize:11,color:"#b7791f"}}>النص المُسجَّل</div>
                      </div>
                      <div style={{background:"#f8fafb",border:"1px solid #e2e8f0",borderRadius:10,padding:"12px 14px",fontSize:18,fontWeight:700,color:"#1a3d24",direction:"rtl",fontFamily:"'Amiri',serif",lineHeight:2}}>
                        {rec.transcript}
                      </div>
                    </div>
                  )}

                  {/* Override */}
                  <div style={{background:wasOv?"#ebf8ff":"#f8fafb",border:`1px solid ${wasOv?"#90cdf4":"#e2e8f0"}`,borderRadius:12,padding:"16px"}}>
                    <div style={{textAlign:"center",marginBottom:12}}>
                      <div style={{fontSize:15,fontWeight:900,color:"#1a3d24"}}>✏️ Override Score</div>
                      <div style={{fontSize:11,color:"#b7791f"}}>تعديل الدرجة</div>
                    </div>
                    <div style={{display:"flex",gap:10,marginBottom:14}}>
                      <div style={{flex:1,background:sb(rec.ai_score),borderRadius:10,padding:"10px",textAlign:"center"}}>
                        <div style={{fontSize:11,fontWeight:600,color:"#7a9e88",marginBottom:4}}>AI Score</div>
                        <div style={{fontSize:26,fontWeight:900,color:sc(rec.ai_score)}}>{rec.ai_score}%</div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",fontSize:20,color:"#7a9e88"}}>→</div>
                      <div style={{flex:1,background:sb(parseInt(ov.score)||0),borderRadius:10,padding:"10px",textAlign:"center"}}>
                        <div style={{fontSize:11,fontWeight:600,color:"#7a9e88",marginBottom:4}}>Admin Score</div>
                        <div style={{fontSize:26,fontWeight:900,color:sc(parseInt(ov.score)||0)}}>{ov.score||"—"}%</div>
                      </div>
                    </div>
                    <div style={{marginBottom:10}}>
                      <div style={{fontSize:12,fontWeight:700,color:"#1a3d24",marginBottom:6}}>Score (0–100)</div>
                      <div style={{display:"flex",gap:10,alignItems:"center"}}>
                        <input type="range" min={0} max={100} value={ov.score} onChange={e=>setOverrides(p=>({...p,[rec.id]:{...ov,score:e.target.value}}))} style={{flex:1,accentColor:"#1a3d24"}}/>
                        <input type="number" min={0} max={100} value={ov.score} onChange={e=>setOverrides(p=>({...p,[rec.id]:{...ov,score:e.target.value}}))} style={{width:60,background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,padding:"6px",fontSize:15,fontWeight:900,textAlign:"center",color:"#1a3d24"}}/>
                      </div>
                    </div>
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:12,fontWeight:700,color:"#1a3d24",marginBottom:6}}>Feedback for student</div>
                      <textarea value={ov.feedback} onChange={e=>setOverrides(p=>({...p,[rec.id]:{...ov,feedback:e.target.value}}))} rows={3} placeholder="Write feedback…"
                        style={{width:"100%",background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,padding:"10px 12px",fontSize:13,color:"#1a3d24",resize:"vertical" as const}}/>
                    </div>
                    <div style={{display:"flex",gap:10}}>
                      <button onClick={()=>saveOverride(rec)} disabled={saving===rec.id}
                        style={{flex:1,padding:"12px 0",borderRadius:12,background:saving===rec.id?"#f0f4f0":"#1a3d24",border:"none",color:saving===rec.id?"#7a9e88":"#fff",fontSize:14,fontWeight:900,cursor:saving===rec.id?"not-allowed":"pointer"}}>
                        {saving===rec.id?"Saving…":"Save Review"}
                      </button>
                      <button onClick={()=>{setOverrides(p=>({...p,[rec.id]:{...ov,score:String(rec.ai_score)}}));}}
                        style={{padding:"12px 16px",borderRadius:12,background:"#f0fff4",border:"1px solid #9ae6b4",color:"#276749",fontSize:13,fontWeight:700}}>
                        ✓ Approve AI
                      </button>
                    </div>
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
