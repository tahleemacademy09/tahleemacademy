import { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, AlertTriangle, Search, Eye, Trash2, Monitor, Download,
  User, Activity, ShieldAlert, ShieldCheck, Camera, RefreshCw,
  ChevronRight, X,
} from "lucide-react";

/* ── Brand tokens ─────────────────── */
const G = "#0f2d1f", GM = "#1a4731", GOLD = "#c9a84c";
const CREAM = "#faf6ee", BORDER = "rgba(15,45,31,0.1)", TL = "#7a9e88";

const sCol = (lvl: string) => ({
  low:      { bg:"#f0fff4", text:"#065f46", border:"#86efac" },
  medium:   { bg:"#fffbeb", text:"#92400e", border:"#fde68a" },
  high:     { bg:"#fff5f5", text:"#991b1b", border:"#fca5a5" },
  critical: { bg:"#1a0000", text:"#fff",    border:"#dc2626" },
}[lvl] || { bg:"#f8fafb", text:TL, border:"#e5e7eb" });

const iCol = (score: number) =>
  score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";

/* ── Snapshot thumbnail ───────────── */
const Thumb = ({ media, onClick }: { media: any; onClick: () => void }) => {
  const [url, setUrl] = useState<string|null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    storageSupabase.storage.from("proctoring-media").createSignedUrl(media.file_url, 3600)
      .then(({ data }) => data?.signedUrl ? setUrl(data.signedUrl) : setErr(true))
      .catch(() => setErr(true));
  }, [media.file_url]);
  const typeLabel = { face_snapshot:"Face", verification_snapshot:"ID", screen_capture:"Screen" }[media.file_type as string] || media.file_type;
  const typeColor = media.file_type === "face_snapshot" ? "#065f46" : media.file_type === "screen_capture" ? "#0369a1" : "#92400e";
  return (
    <div onClick={onClick} style={{ position:"relative", borderRadius:10, overflow:"hidden", aspectRatio:"1", background:"#111", cursor:"pointer", border:"1.5px solid "+BORDER }}>
      {url && !err
        ? <img src={url} style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={()=>setErr(true)}/>
        : err
        ? <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:TL }}><User style={{width:20,height:20,opacity:.3}}/></div>
        : <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%" }}>
            <div style={{ width:18,height:18,borderRadius:"50%",border:"3px solid "+GOLD,borderTopColor:"transparent",animation:"spin .8s linear infinite" }}/>
          </div>}
      <div style={{ position:"absolute", top:4, left:4, background:typeColor, color:"#fff", fontSize:9, fontWeight:800, padding:"2px 6px", borderRadius:6 }}>{typeLabel}</div>
      <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"rgba(0,0,0,.65)", color:"#fff", fontSize:9, padding:"3px 6px" }}>
        {new Date(media.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
      </div>
      <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0)", transition:"background .2s" }}>
        <Eye style={{width:16,height:16,color:"#fff",opacity:0}}/>
      </div>
    </div>
  );
};

const ProctoringDashboard = () => {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [sessions, setSessions]           = useState<any[]>([]);
  const [selected, setSelected]           = useState<any>(null);
  const [violations, setViolations]       = useState<any[]>([]);
  const [deviceLogs, setDeviceLogs]       = useState<any[]>([]);
  const [media, setMedia]                 = useState<any[]>([]);
  const [search, setSearch]               = useState("");
  const [suspFilter, setSuspFilter]       = useState("all");
  const [examFilter, setExamFilter]       = useState("all");
  const [examsList, setExamsList]         = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const [mediaTab, setMediaTab]           = useState("all");
  const [previewIdx, setPreviewIdx]       = useState<number>(-1);
  const [previewList, setPreviewList]     = useState<any[]>([]); // stable list for lightbox
  const [urlCache, setUrlCache]           = useState<Record<string,string>>({});
  const [touchStartX, setTouchStartX]     = useState<number|null>(null);

  // Computed from stable previewList — never empty when lightbox is open
  const previewMedia = previewIdx >= 0 && previewIdx < previewList.length ? previewList[previewIdx] : null;
  const previewUrl   = previewMedia ? (urlCache[previewMedia.file_url] || null) : null;

  const fetchSessions = async () => {
    setLoading(true);
    const [sRes, pRes, eRes, aRes] = await Promise.all([
      supabase.from("proctoring_sessions").select("*").order("started_at",{ascending:false}),
      supabase.from("profiles").select("user_id,full_name,email"),
      supabase.from("exams").select("id,title,title_ar"),
      supabase.from("exam_attempts").select("id,exam_id,user_id,status,suspicion_level,integrity_score"),
    ]);
    setExamsList(eRes.data||[]);
    const merged = (sRes.data||[]).map((s:any)=>{
      const attempt = (aRes.data||[]).find((a:any)=>a.id===s.attempt_id)||{};
      const profile = (pRes.data||[]).find((p:any)=>p.user_id===(attempt as any).user_id)||{};
      const exam    = (eRes.data||[]).find((e:any)=>e.id===(attempt as any).exam_id)||{};
      return {...s,attempt,profile,exam};
    });
    setSessions(merged); setLoading(false);
  };

  useEffect(()=>{ fetchSessions(); const iv=setInterval(fetchSessions,30000); return()=>clearInterval(iv); },[]);

  const loadDetail = async (session:any) => {
    setSelected(session); setMedia([]); setViolations([]); setDeviceLogs([]);
    const [vRes,dRes,mRes] = await Promise.all([
      supabase.from("violations").select("*").eq("attempt_id",session.attempt_id).order("timestamp",{ascending:true}),
      supabase.from("device_logs").select("*").eq("attempt_id",session.attempt_id),
      supabase.from("proctoring_media").select("*").eq("attempt_id",session.attempt_id).order("created_at",{ascending:true}),
    ]);
    setViolations(vRes.data||[]); setDeviceLogs(dRes.data||[]); setMedia(mRes.data||[]);
  };

  const resolveUrl = async (fileUrl: string): Promise<string|null> => {
    if (urlCache[fileUrl]) return urlCache[fileUrl];
    const { data } = await storageSupabase.storage.from("proctoring-media").createSignedUrl(fileUrl, 3600);
    if (data?.signedUrl) {
      setUrlCache(prev => ({ ...prev, [fileUrl]: data.signedUrl! }));
      return data.signedUrl;
    }
    return null;
  };

  const openPreview = async (idx: number, mediaList: any[]) => {
    setPreviewList(mediaList);   // store stable copy
    setPreviewIdx(idx);
    // Prefetch current + neighbours immediately
    const toLoad = [idx - 1, idx, idx + 1].filter(i => i >= 0 && i < mediaList.length);
    for (const i of toLoad) resolveUrl(mediaList[i].file_url);
  };

  const navPreview = (dir: 1 | -1) => {
    const list = previewList;
    const next = previewIdx + dir;
    if (next >= 0 && next < list.length) {
      setPreviewIdx(next);
      resolveUrl(list[next].file_url);
      const further = next + dir;
      if (further >= 0 && further < list.length) resolveUrl(list[further].file_url);
    }
  };

  const deleteSession = async (sessionId:string, attemptId:string) => {
    await Promise.all([
      supabase.from("violations").delete().eq("attempt_id",attemptId),
      supabase.from("device_logs").delete().eq("attempt_id",attemptId),
      supabase.from("proctoring_media").delete().eq("attempt_id",attemptId),
      supabase.from("proctoring_sessions").delete().eq("id",sessionId),
    ]);
    toast({ title: t("Session deleted","تم حذف الجلسة") });
    fetchSessions(); setSelected(null); setMedia([]);
  };

  const getVerdict = (s:any) => {
    const i=Number(s.integrity_score)||100, v=s.total_violations||0, sl=s.suspicion_level||"low";
    if(sl==="critical"||i<30||v>=8) return {label:"FLAGGED", labelAr:"مُعلّم", bg:"#fff5f5", text:"#991b1b", border:"#fca5a5"};
    if(sl==="high"||i<60||v>=4)     return {label:"REVIEW", labelAr:"مراجعة", bg:"#fffbeb", text:"#92400e", border:"#fde68a"};
    return {label:"CLEAR", labelAr:"واضح", bg:"#f0fff4", text:"#065f46", border:"#86efac"};
  };

  const filtered = sessions.filter(s=>{
    if(suspFilter!=="all"&&s.suspicion_level!==suspFilter) return false;
    if(examFilter!=="all"&&(s.attempt as any)?.exam_id!==examFilter) return false;
    if(search){
      const n=((s.profile as any)?.full_name||"").toLowerCase();
      const e=((s.profile as any)?.email||"").toLowerCase();
      if(!n.includes(search.toLowerCase())&&!e.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const totalSessions  = sessions.length;
  const activeSessions = sessions.filter(s=>!s.ended_at).length;
  const criticalCount  = sessions.filter(s=>["critical","high"].includes(s.suspicion_level)).length;
  const avgIntegrity   = sessions.length ? Math.round(sessions.reduce((s,ss)=>s+(Number(ss.integrity_score)||100),0)/sessions.length) : 100;

  /* ═══ DETAIL VIEW ══════════════════════════════════════════ */
  if (selected) {
    const s = selected;
    const name  = (s.profile as any)?.full_name || (s.profile as any)?.email || "Unknown";
    const email = (s.profile as any)?.email || "";
    const exam  = language==="ar" ? (s.exam as any)?.title_ar||(s.exam as any)?.title : (s.exam as any)?.title;
    const verdict = getVerdict(s);
    const dur = s.ended_at ? Math.round((new Date(s.ended_at).getTime()-new Date(s.started_at).getTime())/60000) : null;
    const device = deviceLogs[0];
    const faceMedia   = media.filter(m=>["face_snapshot","verification_snapshot"].includes(m.file_type));
    const screenMedia = media.filter(m=>m.file_type==="screen_capture");
    const curMedia    = mediaTab==="face" ? faceMedia : mediaTab==="screen" ? screenMedia : media;

    return (
      <div style={{ background:CREAM, minHeight:"100vh", fontFamily:"'Cairo',sans-serif" }}>
        <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>

        {/* Sticky top bar */}
        <div style={{ background:`linear-gradient(135deg,${G},${GM})`, padding:"14px 18px", position:"sticky", top:0, zIndex:50, boxShadow:"0 2px 16px rgba(15,45,31,.3)" }}>
          <div style={{ maxWidth:720, margin:"0 auto", display:"flex", alignItems:"center", gap:12 }}>
            <button onClick={()=>{setSelected(null);setMedia([]);}} style={{ background:"rgba(255,255,255,.15)", border:"none", borderRadius:10, padding:"7px 14px", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
              ← {t("Back","رجوع")}
            </button>
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ fontSize:10, color:"rgba(255,255,255,.55)", fontWeight:700, letterSpacing:1, margin:0, textTransform:"uppercase" as const }}>Proctoring Detail</p>
              <p style={{ fontSize:14, fontWeight:800, color:"#fff", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{name} · {exam}</p>
            </div>
            <button onClick={()=>deleteSession(s.id,s.attempt_id)}
              style={{ background:"rgba(239,68,68,.2)", border:"1px solid rgba(239,68,68,.4)", borderRadius:10, padding:"7px 14px", color:"#fca5a5", fontSize:12, fontWeight:700, cursor:"pointer" }}>
              🗑 {t("Delete","حذف")}
            </button>
          </div>
        </div>

        <div style={{ maxWidth:720, margin:"0 auto", padding:"18px 16px 48px" }}>

          {/* Student card */}
          <div style={{ background:"#fff", borderRadius:18, padding:"16px", marginBottom:14, border:`1px solid ${BORDER}`, boxShadow:"0 2px 12px rgba(15,45,31,.07)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:14 }}>
              <div style={{ width:46, height:46, borderRadius:"50%", background:`linear-gradient(135deg,${G},${GM})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, fontWeight:900, color:GOLD, flexShrink:0 }}>
                {name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:15, fontWeight:800, color:G, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{name}</div>
                <div style={{ fontSize:11, color:TL }}>{email}</div>
                <div style={{ fontSize:11, color:TL }}>{exam}</div>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div style={{ padding:"4px 10px", borderRadius:10, fontSize:11, fontWeight:700, background:!s.ended_at?"#f0fff4":"#f8fafb", color:!s.ended_at?"#065f46":TL, border:`1px solid ${!s.ended_at?"#86efac":BORDER}`, marginBottom:4 }}>
                  {!s.ended_at ? "● "+t("Active","نشط") : t("Ended","منتهي")}
                </div>
                {dur && <div style={{ fontSize:11, color:TL }}>{dur} {t("min","دق")}</div>}
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 }}>
            {[
              { lbl:t("Integrity","النزاهة"), val:`${Math.round(Number(s.integrity_score)||100)}%`, color:iCol(Number(s.integrity_score)||100) },
              { lbl:t("Violations","المخالفات"), val:String(s.total_violations||0), color:"#ef4444" },
              { lbl:t("Warnings","تحذيرات"), val:`${s.warnings_issued||0}/${s.max_warnings||3}`, color:"#f59e0b" },
              { lbl:t("Media","وسائط"), val:String(media.length), color:GOLD },
            ].map((stat,i)=>(
              <div key={i} style={{ background:"#fff", borderRadius:14, padding:"12px 8px", textAlign:"center", border:`1px solid ${BORDER}` }}>
                <div style={{ fontSize:9, color:TL, fontWeight:700, marginBottom:4 }}>{stat.lbl}</div>
                <div style={{ fontSize:20, fontWeight:900, color:stat.color, lineHeight:1 }}>{stat.val}</div>
              </div>
            ))}
          </div>

          {/* Verdict + suspicion */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
            <div style={{ background:verdict.bg, borderRadius:14, padding:"14px", border:`1px solid ${verdict.border}`, display:"flex", alignItems:"center", gap:10 }}>
              <Shield style={{width:22,height:22,color:verdict.text,flexShrink:0}}/>
              <div>
                <div style={{ fontSize:9, color:verdict.text, fontWeight:700, opacity:.7 }}>VERDICT</div>
                <div style={{ fontSize:16, fontWeight:900, color:verdict.text }}>{language==="ar" ? verdict.labelAr : verdict.label}</div>
              </div>
            </div>
            <div style={{ background:sCol(s.suspicion_level||"low").bg, borderRadius:14, padding:"14px", border:`1px solid ${sCol(s.suspicion_level||"low").border}`, display:"flex", alignItems:"center", gap:10 }}>
              <AlertTriangle style={{width:22,height:22,color:sCol(s.suspicion_level||"low").text,flexShrink:0}}/>
              <div>
                <div style={{ fontSize:9, color:sCol(s.suspicion_level||"low").text, fontWeight:700, opacity:.7 }}>SUSPICION</div>
                <div style={{ fontSize:16, fontWeight:900, color:sCol(s.suspicion_level||"low").text, textTransform:"capitalize" as const }}>{s.suspicion_level||"low"}</div>
              </div>
            </div>
          </div>

          {/* Device info */}
          {device && (
            <div style={{ background:"#fff", borderRadius:16, padding:"14px 16px", marginBottom:14, border:`1px solid ${BORDER}` }}>
              <div style={{ fontSize:11, fontWeight:700, color:TL, marginBottom:10, letterSpacing:1 }}>📱 DEVICE</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {[["Device",device.device_type],["Browser",device.browser],["OS",device.os],["Resolution",device.screen_resolution]].filter(([,v])=>v).map(([lbl,val])=>(
                  <div key={lbl} style={{ fontSize:12 }}>
                    <span style={{ color:TL }}>{lbl}: </span>
                    <span style={{ fontWeight:700, color:G }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Violations timeline */}
          <div style={{ background:"#fff", borderRadius:16, marginBottom:14, border:`1px solid ${BORDER}`, overflow:"hidden" }}>
            <div style={{ padding:"14px 16px 12px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:8 }}>
              <AlertTriangle style={{width:14,height:14,color:"#ef4444"}}/>
              <span style={{ fontSize:13, fontWeight:800, color:G }}>{t("Violations","المخالفات")} ({violations.length})</span>
            </div>
            <div style={{ maxHeight:320, overflowY:"auto" }}>
              {violations.length === 0
                ? <div style={{ textAlign:"center", padding:"24px", fontSize:13, color:TL }}>{t("No violations recorded","لم تُسجَّل مخالفات")}</div>
                : violations.map((v,i)=>{
                    const sc = v.severity_score >= 3 ? {bg:"#fff5f5",text:"#991b1b",border:"#fca5a5"} : v.severity_score >= 2 ? {bg:"#fffbeb",text:"#92400e",border:"#fde68a"} : {bg:"#f8fafb",text:TL,border:BORDER};
                    return (
                      <div key={v.id} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"12px 16px", borderBottom:`1px solid ${BORDER}`, background:sc.bg }}>
                        <div style={{ width:24,height:24,borderRadius:8,background:sc.border+"44",border:`1px solid ${sc.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:sc.text,flexShrink:0 }}>{i+1}</div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" as const, marginBottom:3 }}>
                            <span style={{ fontSize:12,fontWeight:800,color:sc.text,textTransform:"capitalize" as const }}>{v.violation_type.replace(/_/g," ")}</span>
                            <span style={{ fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:8,background:sc.border+"33",color:sc.text }}>Severity {v.severity_score}</span>
                          </div>
                          {v.details && <div style={{ fontSize:11, color:TL }}>{v.details}</div>}
                          <div style={{ fontSize:10, color:TL, marginTop:2 }}>{new Date(v.timestamp||v.created_at).toLocaleString()}</div>
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          </div>

          {/* Media gallery */}
          <div style={{ background:"#fff", borderRadius:16, border:`1px solid ${BORDER}`, overflow:"hidden" }}>
            <div style={{ padding:"14px 16px 0", borderBottom:`1px solid ${BORDER}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                <Camera style={{width:14,height:14,color:GOLD}}/>
                <span style={{ fontSize:13, fontWeight:800, color:G }}>{t("Captured Media","الوسائط")} ({media.length})</span>
              </div>
              {/* Tab pills */}
              <div style={{ display:"flex", gap:6, paddingBottom:12 }}>
                {[["all",t("All","الكل"),media.length],["face",t("Face","وجه"),faceMedia.length],["screen",t("Screen","شاشة"),screenMedia.length]].map(([key,lbl,cnt])=>(
                  <button key={key} onClick={()=>setMediaTab(key as string)} style={{
                    padding:"5px 12px", borderRadius:16, fontSize:11, fontWeight:700, cursor:"pointer", border:"none",
                    background: mediaTab===key ? G : "#f8fafb",
                    color: mediaTab===key ? "#fff" : TL,
                  }}>{lbl} {cnt ? `(${cnt})` : ""}</button>
                ))}
              </div>
            </div>
            <div style={{ padding:"14px 16px" }}>
              {curMedia.length === 0
                ? <div style={{ textAlign:"center", padding:"24px", fontSize:13, color:TL }}>{t("No media","لا توجد وسائط")}</div>
                : <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                    {curMedia.map((m:any,i:number)=><Thumb key={m.id} media={m} onClick={()=>openPreview(i,curMedia)}/>)}
                  </div>
              }
            </div>
          </div>
        </div>

        {/* Fullscreen swipeable lightbox */}
        {previewIdx >= 0 && (
          <div
            style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(0,0,0,.97)", display:"flex", flexDirection:"column" as const }}
            onTouchStart={e => setTouchStartX(e.touches[0].clientX)}
            onTouchEnd={e => {
              if (touchStartX === null) return;
              const dx = e.changedTouches[0].clientX - touchStartX;
              if (Math.abs(dx) > 50) navPreview(dx < 0 ? 1 : -1);
              setTouchStartX(null);
            }}
          >
            {/* Top bar */}
            <div style={{ padding:"14px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
              <div style={{ fontSize:12, color:"rgba(255,255,255,.6)" }}>
                {previewMedia?.file_type?.replace(/_/g," ")} · {previewMedia ? new Date(previewMedia.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) : ""}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:12, color:"rgba(255,255,255,.5)", fontWeight:700 }}>{previewIdx+1} / {previewList.length}</span>
                <button onClick={() => setPreviewIdx(-1)} style={{ background:"rgba(255,255,255,.15)", border:"none", borderRadius:"50%", width:34, height:34, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff" }}>
                  ✕
                </button>
              </div>
            </div>

            {/* Image */}
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", position:"relative", minHeight:0 }}>
              {/* Prev arrow */}
              {previewIdx > 0 && (
                <button onClick={() => navPreview(-1)} style={{ position:"absolute", left:10, zIndex:10, background:"rgba(255,255,255,.15)", border:"none", borderRadius:"50%", width:40, height:40, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:20 }}>
                  ‹
                </button>
              )}

              {previewUrl
                ? <img src={previewUrl} style={{ maxWidth:"100%", maxHeight:"100%", objectFit:"contain", borderRadius:8 }} alt="capture"/>
                : <div style={{ display:"flex", flexDirection:"column" as const, alignItems:"center", gap:12 }}>
                    <div style={{ width:40,height:40,borderRadius:"50%",border:`4px solid ${GOLD}`,borderTopColor:"transparent",animation:"spin .8s linear infinite" }}/>
                    <span style={{ color:"rgba(255,255,255,.4)", fontSize:12 }}>Loading…</span>
                  </div>
              }

              {/* Next arrow */}
              {previewIdx < previewList.length - 1 && (
                <button onClick={() => navPreview(1)} style={{ position:"absolute", right:10, zIndex:10, background:"rgba(255,255,255,.15)", border:"none", borderRadius:"50%", width:40, height:40, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:20 }}>
                  ›
                </button>
              )}
            </div>

            {/* Dot indicators */}
            <div style={{ padding:"12px 16px", display:"flex", justifyContent:"center", gap:6, flexShrink:0 }}>
              {previewList.slice(Math.max(0,previewIdx-4), Math.min(previewList.length,previewIdx+5)).map((_,i) => {
                const realIdx = Math.max(0,previewIdx-4)+i;
                return <div key={realIdx} style={{ width:realIdx===previewIdx?20:6, height:6, borderRadius:3, background:realIdx===previewIdx?GOLD:"rgba(255,255,255,.3)", transition:"all .2s" }}/>;
              })}
            </div>

            {/* Download bar */}
            {previewUrl && previewMedia && (
              <div style={{ padding:"0 16px 20px", flexShrink:0 }}>
                <a href={previewUrl} download={previewMedia.file_name||"capture.jpg"} target="_blank" rel="noopener noreferrer"
                  style={{ display:"flex", alignItems:"center", gap:8, padding:"13px", borderRadius:14, background:G, color:"#fff", fontSize:14, fontWeight:700, textDecoration:"none", justifyContent:"center" }}>
                  <Download style={{width:16,height:16}}/> {t("Download","تحميل")}
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ═══ LIST VIEW ════════════════════════════════════════════ */
  return (
    <div style={{ background:CREAM, minHeight:"100vh", fontFamily:"'Cairo',sans-serif" }}>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>

      <div style={{ maxWidth:720, margin:"0 auto", padding:"20px 16px 48px" }}>

        {/* Hero header */}
        <div style={{ background:`linear-gradient(135deg,${G},${GM})`, borderRadius:22, padding:"22px 20px 18px", marginBottom:18, boxShadow:"0 8px 32px rgba(15,45,31,.25)", position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:-40, right:-40, width:120, height:120, borderRadius:"50%", background:"rgba(255,255,255,.03)", pointerEvents:"none" }}/>
          <div style={{ position:"relative", zIndex:1 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <div>
                <p style={{ fontSize:10, color:"rgba(255,255,255,.55)", fontWeight:700, letterSpacing:1, margin:0, textTransform:"uppercase" as const }}>Admin</p>
                <h1 style={{ fontSize:22, fontWeight:900, color:"#fff", margin:0 }}>🛡 {t("Proctoring Dashboard","لوحة المراقبة")}</h1>
              </div>
              <button onClick={fetchSessions} style={{ background:"rgba(255,255,255,.15)", border:"none", borderRadius:10, padding:"8px 14px", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
                <RefreshCw style={{width:13,height:13}}/> {t("Refresh","تحديث")}
              </button>
            </div>
            {/* Stats */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
              {[
                {icon:<Activity style={{width:13,height:13}}/>,  val:String(totalSessions),  lbl:t("Total","إجمالي")},
                {icon:<Shield style={{width:13,height:13}}/>,    val:String(activeSessions), lbl:t("Active","نشط")},
                {icon:<ShieldAlert style={{width:13,height:13}}/>,val:String(criticalCount), lbl:t("Flagged","مُعلّم")},
                {icon:<ShieldCheck style={{width:13,height:13}}/>,val:`${avgIntegrity}%`,  lbl:t("Avg Integrity","معدل النزاهة")},
              ].map((s,i)=>(
                <div key={i} style={{ textAlign:"center", background:"rgba(255,255,255,.1)", borderRadius:12, padding:"10px 4px" }}>
                  <div style={{ display:"flex", justifyContent:"center", color:"rgba(255,255,255,.6)", marginBottom:3 }}>{s.icon}</div>
                  <div style={{ fontSize:18, fontWeight:900, color:"#fff", lineHeight:1 }}>{s.val}</div>
                  <div style={{ fontSize:9, color:"rgba(255,255,255,.5)", fontWeight:600, marginTop:2 }}>{s.lbl}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ background:"#fff", borderRadius:16, padding:"14px 16px", marginBottom:16, border:`1px solid ${BORDER}` }}>
          {/* Search */}
          <div style={{ position:"relative", marginBottom:10 }}>
            <Search style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", width:14, height:14, color:TL }}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("Search by name or email…","ابحث باسم أو بريد…")}
              style={{ width:"100%", padding:"10px 10px 10px 32px", borderRadius:12, border:`1.5px solid ${BORDER}`, fontSize:13, color:G, outline:"none", fontFamily:"'Cairo',sans-serif", boxSizing:"border-box" as const }}/>
          </div>
          {/* Filter chips */}
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const, marginBottom:8 }}>
            <span style={{ fontSize:11, fontWeight:700, color:TL, alignSelf:"center" }}>{t("Suspicion:","الاشتباه:")}</span>
            {["all","low","medium","high","critical"].map(v=>(
              <button key={v} onClick={()=>setSuspFilter(v)} style={{
                padding:"5px 12px", borderRadius:16, fontSize:11, fontWeight:700, border:"none", cursor:"pointer",
                background: suspFilter===v ? G : "#f8fafb", color: suspFilter===v ? "#fff" : TL,
              }}>{v==="all" ? t("All","الكل") : v}</button>
            ))}
          </div>
          {examsList.length > 0 && (
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const }}>
              <span style={{ fontSize:11, fontWeight:700, color:TL, alignSelf:"center" }}>{t("Exam:","امتحان:")}</span>
              <button onClick={()=>setExamFilter("all")} style={{ padding:"5px 12px", borderRadius:16, fontSize:11, fontWeight:700, border:"none", cursor:"pointer", background:examFilter==="all"?G:"#f8fafb", color:examFilter==="all"?"#fff":TL }}>
                {t("All","الكل")}
              </button>
              {examsList.map(e=>(
                <button key={e.id} onClick={()=>setExamFilter(e.id)} style={{ padding:"5px 12px", borderRadius:16, fontSize:11, fontWeight:700, border:"none", cursor:"pointer", background:examFilter===e.id?G:"#f8fafb", color:examFilter===e.id?"#fff":TL, maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>
                  {language==="ar" ? e.title_ar||e.title : e.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Session cards */}
        {loading
          ? <div style={{ display:"flex", justifyContent:"center", padding:48 }}>
              <div style={{ width:44,height:44,border:`4px solid ${G}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin .8s linear infinite" }}/>
            </div>
          : filtered.length === 0
          ? <div style={{ textAlign:"center", padding:"48px 20px", background:"#fff", borderRadius:18, border:`1px dashed ${BORDER}` }}>
              <div style={{ fontSize:40, marginBottom:12, opacity:.4 }}>🛡</div>
              <p style={{ fontSize:14, color:TL, margin:0 }}>{t("No sessions found","لا توجد جلسات")}</p>
            </div>
          : filtered.map(s=>{
              const name    = (s.profile as any)?.full_name || (s.profile as any)?.email || "Unknown";
              const exam    = language==="ar" ? (s.exam as any)?.title_ar||(s.exam as any)?.title : (s.exam as any)?.title;
              const verdict = getVerdict(s);
              const sc      = sCol(s.suspicion_level||"low");
              const integ   = Math.round(Number(s.integrity_score)||100);
              return (
                <div key={s.id} onClick={()=>loadDetail(s)} style={{ background:"#fff", borderRadius:18, marginBottom:10, border:`1.5px solid ${BORDER}`, boxShadow:"0 2px 12px rgba(15,45,31,.07)", cursor:"pointer", overflow:"hidden" }}>
                  <div style={{ height:3, background: s.suspicion_level==="critical"?"#dc2626" : s.suspicion_level==="high"?"#ef4444" : s.suspicion_level==="medium"?"#f59e0b" : "#22c55e" }}/>
                  <div style={{ padding:"14px 16px" }}>
                    <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                      {/* Avatar */}
                      <div style={{ width:40,height:40,borderRadius:"50%",background:`linear-gradient(135deg,${G},${GM})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:900,color:GOLD,flexShrink:0 }}>
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2, flexWrap:"wrap" as const }}>
                          <span style={{ fontSize:14, fontWeight:800, color:G }}>{name}</span>
                          <span style={{ fontSize:10, padding:"2px 8px", borderRadius:8, fontWeight:700, background:!s.ended_at?"#f0fff4":"#f8fafb", color:!s.ended_at?"#065f46":TL, border:`1px solid ${!s.ended_at?"#86efac":BORDER}` }}>
                            {!s.ended_at ? "●"+t("Live","نشط") : t("Ended","منتهي")}
                          </span>
                        </div>
                        <div style={{ fontSize:11, color:TL, marginBottom:8 }}>{exam} · {new Date(s.started_at).toLocaleDateString()}</div>
                        {/* Metrics row */}
                        <div style={{ display:"flex", gap:10, flexWrap:"wrap" as const }}>
                          <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:11 }}>
                            <span style={{ color:TL }}>Integrity:</span>
                            <span style={{ fontWeight:900, color:iCol(integ) }}>{integ}%</span>
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:11 }}>
                            <span style={{ color:TL }}>Violations:</span>
                            <span style={{ fontWeight:900, color: (s.total_violations||0)>0?"#ef4444":TL }}>{s.total_violations||0}</span>
                          </div>
                          <div style={{ padding:"2px 8px", borderRadius:8, fontSize:10, fontWeight:700, background:sc.bg, color:sc.text, border:`1px solid ${sc.border}`, textTransform:"capitalize" as const }}>{s.suspicion_level||"low"}</div>
                          <div style={{ padding:"2px 8px", borderRadius:8, fontSize:10, fontWeight:700, background:verdict.bg, color:verdict.text, border:`1px solid ${verdict.border}` }}>{language==="ar"?verdict.labelAr:verdict.label}</div>
                        </div>
                      </div>
                      <ChevronRight style={{width:16,height:16,color:TL,flexShrink:0,marginTop:4}}/>
                    </div>
                  </div>
                </div>
              );
            })
        }
      </div>
    </div>
  );
};

export default ProctoringDashboard;
