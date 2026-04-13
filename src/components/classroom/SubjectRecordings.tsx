import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Video, Play, Search, Clock, User, CheckCircle, Trash2, Edit, Save, Pause, Volume2, VolumeX, Download } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

const G    = "#0f2d1f";
const GM   = "#1a4731";
const GOLD = "#c9a84c";
const BORDER = "rgba(15,45,31,0.1)";

// ── Built-in audio/video player ──────────────────────────────
const InlinePlayer = ({ recordingId, fileUrl, duration, onClose }: {
  recordingId: string; fileUrl: string; duration: number; onClose: () => void;
}) => {
  const [signedUrl, setSignedUrl] = useState<string|null>(null);
  const [loading, setLoading]     = useState(true);
  const [playing, setPlaying]     = useState(false);
  const [currentTime, setCurrent] = useState(0);
  const [totalDur, setTotalDur]   = useState(duration || 0);
  const [volume, setVolume]       = useState(1);
  const [muted, setMuted]         = useState(false);
  const [isVideo, setIsVideo]     = useState(false);
  const mediaRef = useRef<HTMLAudioElement & HTMLVideoElement>(null);

  useEffect(() => {
    storageSupabase.storage.from("subject-files").createSignedUrl(fileUrl, 7200)
      .then(({ data }) => {
        if (data?.signedUrl) {
          setSignedUrl(data.signedUrl);
          // Detect if it's a video by checking extension or content
          setIsVideo(fileUrl.includes("video") || fileUrl.endsWith(".mp4") || fileUrl.endsWith(".webm"));
        }
        setLoading(false);
      });
  }, [fileUrl]);

  const fmt = (s: number) => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`;

  const togglePlay = () => {
    if (!mediaRef.current) return;
    if (playing) { mediaRef.current.pause(); setPlaying(false); }
    else         { mediaRef.current.play();  setPlaying(true);  }
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    if (mediaRef.current) { mediaRef.current.currentTime = t; setCurrent(t); }
  };

  const changeVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v); setMuted(v===0);
    if (mediaRef.current) mediaRef.current.volume = v;
  };

  const skip = (sec: number) => {
    if (!mediaRef.current) return;
    mediaRef.current.currentTime = Math.max(0, Math.min(totalDur, currentTime+sec));
  };

  const pct = totalDur > 0 ? (currentTime/totalDur)*100 : 0;

  return (
    <div style={{ background:"#0a0a0a", borderRadius:16, overflow:"hidden", marginBottom:16 }}>
      {/* Video element (hidden for audio) */}
      {loading ? (
        <div style={{ height:isVideo?200:80, display:"flex", alignItems:"center", justifyContent:"center", color:"#999", fontSize:13 }}>
          Loading recording…
        </div>
      ) : signedUrl ? (
        <>
          {isVideo ? (
            <video ref={mediaRef as any} src={signedUrl} style={{ width:"100%", maxHeight:280, background:"#000" }}
              onTimeUpdate={()=>setCurrent(mediaRef.current?.currentTime||0)}
              onLoadedMetadata={()=>setTotalDur(mediaRef.current?.duration||duration)}
              onEnded={()=>setPlaying(false)} />
          ) : (
            <audio ref={mediaRef as any} src={signedUrl}
              onTimeUpdate={()=>setCurrent(mediaRef.current?.currentTime||0)}
              onLoadedMetadata={()=>setTotalDur(mediaRef.current?.duration||duration)}
              onEnded={()=>setPlaying(false)} />
          )}

          {/* Controls */}
          <div style={{ padding:"14px 16px", background:"#111" }}>
            {/* Progress bar */}
            <div style={{ marginBottom:12 }}>
              <input type="range" min={0} max={totalDur||100} step={0.5} value={currentTime}
                onChange={seek}
                style={{ width:"100%", accentColor:GOLD, height:4, cursor:"pointer" }} />
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#666", marginTop:3 }}>
                <span>{fmt(currentTime)}</span>
                <span>{fmt(totalDur)}</span>
              </div>
            </div>

            {/* Playback row */}
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              {/* Skip back */}
              <button onClick={()=>skip(-10)}
                style={{ background:"none", border:"none", color:"#aaa", cursor:"pointer", fontSize:11, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                <span style={{ fontSize:16 }}>⟪</span>
                <span>10s</span>
              </button>

              {/* Play/Pause */}
              <button onClick={togglePlay}
                style={{ width:52, height:52, borderRadius:"50%", background:GOLD, border:"none", color:G, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, boxShadow:"0 2px 12px rgba(201,168,76,.4)" }}>
                {playing
                  ? <Pause style={{ width:22, height:22 }} />
                  : <Play  style={{ width:22, height:22, marginLeft:2 }} />}
              </button>

              {/* Skip forward */}
              <button onClick={()=>skip(10)}
                style={{ background:"none", border:"none", color:"#aaa", cursor:"pointer", fontSize:11, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                <span style={{ fontSize:16 }}>⟫</span>
                <span>10s</span>
              </button>

              {/* Volume */}
              <div style={{ display:"flex", alignItems:"center", gap:6, flex:1, marginLeft:8 }}>
                <button onClick={()=>{ setMuted(v=>!v); if(mediaRef.current) mediaRef.current.muted=!muted; }}
                  style={{ background:"none", border:"none", color:"#aaa", cursor:"pointer", padding:0 }}>
                  {muted||volume===0 ? <VolumeX style={{width:16,height:16}}/> : <Volume2 style={{width:16,height:16}}/>}
                </button>
                <input type="range" min={0} max={1} step={0.05} value={muted?0:volume}
                  onChange={changeVolume}
                  style={{ flex:1, accentColor:GOLD, height:3, cursor:"pointer" }} />
              </div>

              {/* Download */}
              <a href={signedUrl} download target="_blank" rel="noreferrer"
                style={{ color:"#666", display:"flex", alignItems:"center" }}>
                <Download style={{ width:16, height:16 }} />
              </a>

              {/* Close */}
              <button onClick={onClose}
                style={{ background:"rgba(255,255,255,0.1)", border:"none", color:"#fff", cursor:"pointer", padding:"4px 12px", borderRadius:8, fontSize:12 }}>
                Close
              </button>
            </div>
          </div>
        </>
      ) : (
        <div style={{ padding:20, textAlign:"center", color:"#EF4444", fontSize:13 }}>
          Failed to load recording
        </div>
      )}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────
const SubjectRecordings = ({ subjectId }: { subjectId: string }) => {
  const { t } = useLanguage();
  const { user, hasRole } = useAuth();
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const [search, setSearch]       = useState("");
  const [editingId, setEditingId] = useState<string|null>(null);
  const [editForm, setEditForm]   = useState({ teacher_name:"", duration_seconds:0 });
  const [deleteId, setDeleteId]   = useState<string|null>(null);
  const [playingId, setPlayingId] = useState<string|null>(null);

  const isPrivileged = hasRole("admin") || hasRole("teacher");

  const { data: recordings, isLoading } = useQuery({
    queryKey: ["recordings", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("session_recordings").select("*").eq("subject_id",subjectId).order("created_at",{ascending:false});
      if (error) throw error;
      return data;
    },
  });

  const { data: progressMap } = useQuery({
    queryKey: ["recording-progress", subjectId, user?.id],
    enabled: !!user && !!recordings?.length,
    queryFn: async () => {
      const ids = recordings?.map(r=>r.id)||[];
      if (!ids.length) return {};
      const { data } = await supabase.from("recording_watch_progress" as any).select("*").eq("student_id",user!.id).in("recording_id",ids);
      const map: Record<string,any> = {};
      (data||[]).forEach((p:any)=>{ map[p.recording_id]=p; });
      return map;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, teacher_name, duration_seconds }: any) => {
      const { error } = await supabase.from("session_recordings").update({ teacher_name, duration_seconds }).eq("id",id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({queryKey:["recordings",subjectId]}); setEditingId(null); toast({title:t("Updated","تم التحديث")}); },
    onError: (e:any) => toast({title:"Error",description:e.message,variant:"destructive"}),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const rec = recordings?.find(r=>r.id===id);
      if (rec?.file_url) await storageSupabase.storage.from("subject-files").remove([rec.file_url]);
      const { error } = await supabase.from("session_recordings").delete().eq("id",id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({queryKey:["recordings",subjectId]}); setDeleteId(null); toast({title:t("Deleted","تم الحذف")}); },
    onError: (e:any) => toast({title:"Error",description:e.message,variant:"destructive"}),
  });

  const filtered = recordings?.filter(r =>
    (r.teacher_name||"").toLowerCase().includes(search.toLowerCase()) ||
    new Date(r.created_at!).toLocaleDateString().includes(search)
  );

  const fmt = (s: number) => {
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
    return h>0 ? `${h}h ${m}m` : `${m} min`;
  };

  if (isLoading) return (
    <div style={{ display:"flex", flexDirection:"column", gap:12, padding:"16px" }}>
      {[1,2].map(i=>(
        <div key={i} style={{ height:100, borderRadius:14, background:"#f0f4f0", animation:"pulse 1.5s infinite" }} />
      ))}
    </div>
  );

  return (
    <div style={{ padding:"16px", display:"flex", flexDirection:"column", gap:14, fontFamily:"'Cairo',sans-serif" }}>
      {/* Search */}
      <div style={{ position:"relative" }}>
        <Search style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", width:15, height:15, color:"#7a9e88" }} />
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder={t("Search recordings…","بحث في التسجيلات…")}
          style={{ width:"100%", paddingLeft:36, paddingRight:14, paddingTop:10, paddingBottom:10, borderRadius:12, border:`1px solid ${BORDER}`, background:"#fff", fontSize:13, outline:"none", color:G, fontFamily:"'Cairo',sans-serif", boxSizing:"border-box" as const }} />
      </div>

      {/* Empty */}
      {!filtered?.length && (
        <div style={{ textAlign:"center", padding:"40px 20px", background:"#fff", borderRadius:16, border:`1px solid ${BORDER}` }}>
          <Video style={{ width:40, height:40, color:"#cbd5e0", margin:"0 auto 12px" }} />
          <div style={{ fontSize:15, fontWeight:700, color:G, marginBottom:4 }}>{t("No recordings yet","لا توجد تسجيلات بعد")}</div>
          <div style={{ fontSize:12, color:"#7a9e88" }}>{t("Recordings will appear here after class","ستظهر التسجيلات هنا بعد الحصة")}</div>
        </div>
      )}

      {/* Recording cards */}
      {filtered?.map(r => {
        const prog      = progressMap?.[r.id];
        const pct       = prog && r.duration_seconds ? Math.min(100, Math.round((prog.progress_seconds/r.duration_seconds)*100)) : 0;
        const completed = prog?.completed;
        const started   = prog && prog.progress_seconds > 0;
        const isPlaying = playingId === r.id;
        const dateStr   = new Date(r.created_at!).toLocaleDateString(undefined, { weekday:"short", year:"numeric", month:"short", day:"numeric" });

        return (
          <div key={r.id} style={{ background:"#fff", borderRadius:16, border:`1px solid ${BORDER}`, overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,.06)" }}>
            {/* Inline player */}
            {isPlaying && r.file_url && (
              <InlinePlayer
                recordingId={r.id}
                fileUrl={r.file_url}
                duration={r.duration_seconds||0}
                onClose={()=>setPlayingId(null)}
              />
            )}

            {/* Card body */}
            <div style={{ display:"flex", gap:14, padding:"14px 14px", alignItems:"flex-start" }}>
              {/* Thumbnail */}
              <div style={{ width:72, height:56, borderRadius:10, background:`linear-gradient(135deg,${G},${GM})`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, position:"relative", cursor:"pointer" }}
                onClick={()=>setPlayingId(isPlaying?null:r.id)}>
                {r.thumbnail_url
                  ? <img src={r.thumbnail_url} style={{ width:"100%", height:"100%", objectFit:"cover", borderRadius:10 }} alt="" />
                  : <Play style={{ width:22, height:22, color:"rgba(255,255,255,.8)", marginLeft:2 }} />}
                {/* Progress bar on thumbnail */}
                {started && (
                  <div style={{ position:"absolute", bottom:0, left:0, right:0, height:3, background:"rgba(255,255,255,.2)", borderRadius:"0 0 10px 10px" }}>
                    <div style={{ height:"100%", width:`${pct}%`, background:completed?"#22c55e":GOLD, borderRadius:3, transition:"width .3s" }} />
                  </div>
                )}
                {completed && (
                  <div style={{ position:"absolute", top:4, right:4, width:18, height:18, borderRadius:"50%", background:"#22c55e", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <CheckCircle style={{ width:12, height:12, color:"#fff" }} />
                  </div>
                )}
              </div>

              {/* Info */}
              <div style={{ flex:1, minWidth:0 }}>
                {/* Date — full width, no wrapping */}
                <div style={{ fontSize:13, fontWeight:700, color:G, marginBottom:5, whiteSpace:"nowrap" as const, overflow:"hidden", textOverflow:"ellipsis" }}>
                  {dateStr}
                </div>
                {/* Teacher + duration row */}
                <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" as const }}>
                  <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:"#7a9e88" }}>
                    <User style={{ width:12, height:12 }} />
                    {r.teacher_name || "Teacher"}
                  </span>
                  {r.duration_seconds != null && r.duration_seconds > 0 && (
                    <span style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:"#7a9e88" }}>
                      <Clock style={{ width:12, height:12 }} />
                      {fmt(r.duration_seconds)}
                    </span>
                  )}
                  {started && !completed && (
                    <span style={{ fontSize:11, fontWeight:700, color:GOLD }}>{pct}% watched</span>
                  )}
                  {completed && (
                    <span style={{ fontSize:11, fontWeight:700, color:"#22c55e" }}>✓ Completed</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display:"flex", flexDirection:"column", gap:6, flexShrink:0 }}>
                {/* Play inline button */}
                <button onClick={()=>setPlayingId(isPlaying?null:r.id)}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:10, background:isPlaying?"#f0f4f0":G, border:"none", color:isPlaying?G:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'Cairo',sans-serif" }}>
                  {isPlaying ? <Pause style={{width:13,height:13}}/> : <Play style={{width:13,height:13}}/>}
                  {isPlaying ? "Pause" : completed ? t("Rewatch","إعادة") : started ? t("Continue","متابعة") : t("Play","تشغيل")}
                </button>

                {/* Admin actions */}
                {isPrivileged && (
                  <div style={{ display:"flex", gap:4 }}>
                    <button onClick={()=>{ setEditForm({teacher_name:r.teacher_name||"",duration_seconds:r.duration_seconds||0}); setEditingId(r.id); }}
                      style={{ flex:1, padding:"6px 0", borderRadius:8, background:"#f8fafb", border:`1px solid ${BORDER}`, color:"#7a9e88", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <Edit style={{width:13,height:13}}/>
                    </button>
                    <button onClick={()=>setDeleteId(r.id)}
                      style={{ flex:1, padding:"6px 0", borderRadius:8, background:"#fff5f5", border:"1px solid #fca5a5", color:"#EF4444", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <Trash2 style={{width:13,height:13}}/>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Edit Dialog */}
      <Dialog open={!!editingId} onOpenChange={v=>!v&&setEditingId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Edit Recording","تعديل التسجيل")}</DialogTitle></DialogHeader>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:G, display:"block", marginBottom:4 }}>{t("Teacher Name","اسم المعلم")}</label>
              <input value={editForm.teacher_name} onChange={e=>setEditForm({...editForm,teacher_name:e.target.value})}
                style={{ width:"100%", padding:"9px 12px", borderRadius:10, border:`1px solid ${BORDER}`, outline:"none", fontSize:14, color:G, boxSizing:"border-box" as const }} />
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:600, color:G, display:"block", marginBottom:4 }}>{t("Duration (seconds)","المدة (ثواني)")}</label>
              <input type="number" value={editForm.duration_seconds} onChange={e=>setEditForm({...editForm,duration_seconds:parseInt(e.target.value)||0})}
                style={{ width:"100%", padding:"9px 12px", borderRadius:10, border:`1px solid ${BORDER}`, outline:"none", fontSize:14, color:G, boxSizing:"border-box" as const }} />
            </div>
            <button onClick={()=>editingId&&updateMutation.mutate({id:editingId,...editForm})} disabled={updateMutation.isPending}
              style={{ width:"100%", padding:"11px 0", borderRadius:12, background:G, border:"none", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, fontFamily:"'Cairo',sans-serif" }}>
              <Save style={{width:15,height:15}}/>
              {updateMutation.isPending?"Saving…":t("Save Changes","حفظ التغييرات")}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={v=>!v&&setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Delete Recording?","حذف التسجيل؟")}</AlertDialogTitle>
            <AlertDialogDescription>{t("This cannot be undone.","لا يمكن التراجع عن هذا.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel","إلغاء")}</AlertDialogCancel>
            <AlertDialogAction onClick={()=>deleteId&&deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground">
              {t("Delete","حذف")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SubjectRecordings;
