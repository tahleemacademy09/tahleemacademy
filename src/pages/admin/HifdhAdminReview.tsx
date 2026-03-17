/*
  src/pages/admin/HifdhAdminReview.tsx
  ──────────────────────────────────────────────────────────
  Admin panel for reviewing student Hifdh recordings
  - List all student sessions with filters
  - Audio player per recording
  - Word-by-word breakdown display
  - AI score shown
  - Admin can override score + leave feedback
  - Status: pending → reviewed / overridden
*/

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Recording {
  id: string;
  student_id: string;
  surah_name: string;
  surah_num: number;
  ayah_start: number;
  ayah_end: number;
  audio_url: string;
  ai_score: number;
  admin_score: number | null;
  admin_feedback: string | null;
  status: "pending" | "reviewed" | "overridden";
  transcript: string | null;
  word_results: { word: string; result: string }[] | null;
  created_at: string;
  student_name?: string;
  student_email?: string;
}

type FilterStatus = "all" | "pending" | "reviewed" | "overridden";

export default function HifdhAdminReview() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState<FilterStatus>("pending");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [overrides, setOverrides]   = useState<Record<string, { score: string; feedback: string }>>({});
  const [saving, setSaving]         = useState<string | null>(null);
  const [playingId, setPlayingId]   = useState<string | null>(null);
  const [adminId, setAdminId]       = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setAdminId(data.user.id);
    });
    if (typeof window !== "undefined") audioRef.current = new Audio();
    loadRecordings();
  }, []);

  const loadRecordings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("hifdh_recordings")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error || !data) { setLoading(false); return; }

      // Fetch student names from profiles
      const studentIds = [...new Set(data.map((r: any) => r.student_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id,full_name,email")
        .in("id", studentIds);

      const profileMap: Record<string, { name: string; email: string }> = {};
      profiles?.forEach((p: any) => { profileMap[p.id] = { name: p.full_name ?? "Student", email: p.email ?? "" }; });

      const enriched = data.map((r: any) => ({
        ...r,
        student_name:  profileMap[r.student_id]?.name  ?? "Student",
        student_email: profileMap[r.student_id]?.email ?? "",
        word_results:  typeof r.word_results === "string" ? JSON.parse(r.word_results) : r.word_results,
      }));

      setRecordings(enriched);
      // Init overrides state
      const init: Record<string, { score: string; feedback: string }> = {};
      enriched.forEach((r: Recording) => {
        init[r.id] = { score: String(r.admin_score ?? r.ai_score), feedback: r.admin_feedback ?? "" };
      });
      setOverrides(init);
    } catch (_) {}
    setLoading(false);
  };

  const playRecording = (rec: Recording) => {
    if (!audioRef.current) return;
    if (playingId === rec.id) {
      audioRef.current.pause(); setPlayingId(null); return;
    }
    audioRef.current.src = rec.audio_url;
    audioRef.current.play().then(() => setPlayingId(rec.id)).catch(() => setPlayingId(null));
    audioRef.current.onended = () => setPlayingId(null);
  };

  const saveOverride = async (rec: Recording) => {
    const ov = overrides[rec.id];
    if (!ov || !adminId) return;
    setSaving(rec.id);
    try {
      const newScore = parseInt(ov.score);
      const isOverriding = newScore !== rec.ai_score || ov.feedback;
      await supabase.from("hifdh_recordings").update({
        admin_score:        newScore,
        admin_feedback:     ov.feedback,
        admin_id:           adminId,
        admin_reviewed_at:  new Date().toISOString(),
        status:             isOverriding ? "overridden" : "reviewed",
      }).eq("id", rec.id);

      setRecordings(prev => prev.map(r =>
        r.id === rec.id
          ? { ...r, admin_score: newScore, admin_feedback: ov.feedback, status: isOverriding ? "overridden" : "reviewed" }
          : r
      ));
    } catch (_) {}
    setSaving(null);
  };

  const filtered = recordings.filter(r => {
    const matchStatus = filter === "all" || r.status === filter;
    const matchSearch = !search ||
      r.student_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.surah_name?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const statusCounts = {
    pending:    recordings.filter(r => r.status === "pending").length,
    reviewed:   recordings.filter(r => r.status === "reviewed").length,
    overridden: recordings.filter(r => r.status === "overridden").length,
  };

  const scoreColor = (s: number) => s >= 80 ? "#276749" : s >= 60 ? "#b7791f" : "#c0392b";
  const scoreBg    = (s: number) => s >= 80 ? "#f0fff4" : s >= 60 ? "#fffbeb" : "#fff5f5";

  const card = (ex?: React.CSSProperties): React.CSSProperties => ({
    background:"#fff", border:"1px solid #e8f0eb", borderRadius:16,
    boxShadow:"0 1px 6px rgba(0,0,0,.05)", ...ex,
  });

  return (
    <div style={{ fontFamily:"'Cairo',sans-serif", background:"#f8fafb", minHeight:"100vh", color:"#1a202c" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@400;600;700&display=swap');
        * { box-sizing:border-box; }
        @keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:1} }
        input,textarea,button { font-family:'Cairo',sans-serif; }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:#d4e8d4;border-radius:2px}
      `}</style>

      {/* Header */}
      <div style={{ background:"#fff", borderBottom:"1px solid #e8f0eb", padding:"20px 20px 16px", position:"sticky", top:0, zIndex:10 }}>
        <div style={{ maxWidth:900, margin:"0 auto" }}>
          <h1 style={{ fontFamily:"'Amiri',serif", fontSize:26, fontWeight:700, color:"#1a3d24", marginBottom:4 }}>
            Hifdh Admin Review · مراجعة الحِفظ
          </h1>
          <p style={{ fontSize:12, color:"#b7791f", fontStyle:"italic", marginBottom:14 }}>
            Review student recitation recordings and override AI scores
          </p>

          {/* Stats */}
          <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" as const }}>
            {[
              { label:"Pending Review · معلق",     val:statusCounts.pending,    col:"#b7791f", bg:"#fffbeb" },
              { label:"Reviewed · تمت المراجعة",   val:statusCounts.reviewed,   col:"#276749", bg:"#f0fff4" },
              { label:"Overridden · تم التعديل",   val:statusCounts.overridden, col:"#2b6cb0", bg:"#ebf8ff" },
            ].map((s,i)=>(
              <div key={i} style={{ background:s.bg, border:`1px solid ${s.col}33`, borderRadius:10, padding:"8px 14px", display:"flex", gap:8, alignItems:"center" }}>
                <span style={{ fontSize:18, fontWeight:900, color:s.col }}>{s.val}</span>
                <span style={{ fontSize:11, color:s.col }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Search + Filter */}
          <div style={{ display:"flex", gap:10 }}>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search student or surah…"
              style={{ flex:1, background:"#f8fafb", border:"1px solid #e8f0eb", borderRadius:10, padding:"8px 12px", fontSize:13, color:"#1a3d24" }} />
            <div style={{ display:"flex", background:"#f8fafb", border:"1px solid #e8f0eb", borderRadius:10, overflow:"hidden" }}>
              {(["all","pending","reviewed","overridden"] as FilterStatus[]).map(f=>(
                <button key={f} onClick={()=>setFilter(f)}
                  style={{ padding:"8px 12px", border:"none", fontSize:11, fontWeight: filter===f?700:400,
                    background: filter===f?"#1a3d24":"transparent",
                    color: filter===f?"#fff":"#7a9e88",
                  }}>
                  {f.charAt(0).toUpperCase()+f.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth:900, margin:"0 auto", padding:"20px 16px", display:"flex", flexDirection:"column", gap:14 }}>

        {loading && (
          <div style={{ textAlign:"center", padding:"60px 0", fontSize:13, color:"#7a9e88", animation:"pulse 1s infinite" }}>
            Loading recordings…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ ...card({ padding:"50px 20px", textAlign:"center" }) }}>
            <div style={{ fontSize:36, marginBottom:12 }}>📭</div>
            <div style={{ fontFamily:"'Amiri',serif", fontSize:18, color:"#1a3d24" }}>No recordings found</div>
            <div style={{ fontSize:12, color:"#7a9e88", marginTop:4 }}>
              {filter==="pending" ? "All recordings have been reviewed!" : "Try a different filter"}
            </div>
          </div>
        )}

        {filtered.map((rec) => {
          const isExpanded = expanded === rec.id;
          const ov = overrides[rec.id] ?? { score: String(rec.ai_score), feedback: "" };
          const finalScore = rec.admin_score ?? rec.ai_score;
          const wasOverridden = rec.admin_score !== null && rec.admin_score !== rec.ai_score;
          return (
            <div key={rec.id} style={card({ overflow:"hidden" })}>
              {/* Row header */}
              <div
                onClick={() => setExpanded(isExpanded ? null : rec.id)}
                style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", cursor:"pointer", background: isExpanded?"#f8fafb":"#fff", transition:"background .2s" }}>

                {/* Status dot */}
                <div style={{ width:10, height:10, borderRadius:"50%", flexShrink:0,
                  background: rec.status==="pending"?"#b7791f":rec.status==="overridden"?"#2b6cb0":"#276749" }} />

                {/* Student + surah info */}
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:"#1a3d24" }}>
                    {rec.student_name}
                    <span style={{ fontSize:11, fontWeight:400, color:"#7a9e88", marginLeft:8 }}>{rec.student_email}</span>
                  </div>
                  <div style={{ fontSize:12, color:"#7a9e88" }}>
                    {rec.surah_name} · Ayah {rec.ayah_start}
                    {rec.ayah_end !== rec.ayah_start ? `–${rec.ayah_end}` : ""}
                    {" · "}{new Date(rec.created_at).toLocaleDateString()}
                  </div>
                </div>

                {/* Scores */}
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  <div style={{ textAlign:"center", background:scoreBg(rec.ai_score), border:`1px solid ${scoreColor(rec.ai_score)}33`, borderRadius:8, padding:"4px 10px" }}>
                    <div style={{ fontSize:10, color:"#7a9e88" }}>AI</div>
                    <div style={{ fontSize:15, fontWeight:700, color:scoreColor(rec.ai_score) }}>{rec.ai_score}%</div>
                  </div>
                  {rec.admin_score !== null && (
                    <div style={{ textAlign:"center", background:scoreBg(rec.admin_score), border:`1px solid ${scoreColor(rec.admin_score)}33`, borderRadius:8, padding:"4px 10px" }}>
                      <div style={{ fontSize:10, color:"#7a9e88" }}>Admin</div>
                      <div style={{ fontSize:15, fontWeight:700, color:scoreColor(rec.admin_score) }}>{rec.admin_score}%</div>
                    </div>
                  )}
                </div>

                {/* Status badge */}
                <div style={{ fontSize:10, padding:"4px 10px", borderRadius:20, fontWeight:700, whiteSpace:"nowrap" as const,
                  background: rec.status==="pending"?"#fffbeb":rec.status==="overridden"?"#ebf8ff":"#f0fff4",
                  color: rec.status==="pending"?"#b7791f":rec.status==="overridden"?"#2b6cb0":"#276749",
                  border:`1px solid ${rec.status==="pending"?"#f6d860":rec.status==="overridden"?"#90cdf4":"#9ae6b4"}`,
                }}>
                  {rec.status==="pending" ? "Pending · معلق" : rec.status==="overridden" ? "Overridden · معدّل" : "Reviewed · راجع"}
                </div>

                <div style={{ fontSize:14, color:"#7a9e88" }}>{isExpanded?"▲":"▼"}</div>
              </div>

              {/* Expanded panel */}
              {isExpanded && (
                <div style={{ padding:"0 16px 16px", borderTop:"1px solid #e8f0eb", animation:"fadeUp .2s ease" }}>

                  {/* Audio Player */}
                  {rec.audio_url ? (
                    <div style={{ background:"#f8fafb", border:"1px solid #e8f0eb", borderRadius:12, padding:"14px 16px", margin:"14px 0" }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"#1a3d24", marginBottom:10 }}>
                        🎙️ Student Recording · تسجيل الطالب
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                        <button onClick={() => playRecording(rec)}
                          style={{ width:44, height:44, borderRadius:"50%", background: playingId===rec.id?"#c0392b":"#1a3d24", border:"none", color:"#fff", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>
                          {playingId===rec.id ? "⏹" : "▶"}
                        </button>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:12, color:"#7a9e88" }}>
                            {playingId===rec.id ? "● Playing… · جارٍ التشغيل" : "Click to listen · اضغط للاستماع"}
                          </div>
                        </div>
                        <a href={rec.audio_url} download target="_blank" rel="noreferrer"
                          style={{ fontSize:11, color:"#2b6cb0", textDecoration:"none", padding:"5px 10px", border:"1px solid #90cdf4", borderRadius:8 }}>
                          ⬇ Download
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div style={{ background:"#f8fafb", border:"1px dashed #e8f0eb", borderRadius:12, padding:"12px 16px", margin:"14px 0", textAlign:"center", fontSize:12, color:"#7a9e88" }}>
                      No audio recording available · لا يوجد تسجيل صوتي
                    </div>
                  )}

                  {/* Word-by-word breakdown */}
                  {rec.word_results && rec.word_results.length > 0 && (
                    <div style={{ margin:"14px 0" }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"#1a3d24", marginBottom:8 }}>
                        Word Breakdown · تحليل الكلمات
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap" as const, gap:6, direction:"rtl" }}>
                        {rec.word_results.map((w, wi) => (
                          <div key={wi} style={{
                            padding:"4px 10px", borderRadius:20, fontSize:13, fontFamily:"'Amiri',serif",
                            background: w.result==="correct"?"#f0fff4":w.result==="wrong"?"#fff5f5":"#f8fafb",
                            color: w.result==="correct"?"#276749":w.result==="wrong"?"#c0392b":"#1a3d24",
                            border:`1px solid ${w.result==="correct"?"#9ae6b4":w.result==="wrong"?"#fca5a5":"#e8f0eb"}`,
                          }}>
                            {w.word}
                          </div>
                        ))}
                      </div>
                      <div style={{ display:"flex", gap:10, marginTop:8 }}>
                        {[
                          ["#276749","#f0fff4","#9ae6b4","Correct",rec.word_results.filter(w=>w.result==="correct").length],
                          ["#c0392b","#fff5f5","#fca5a5","Wrong",  rec.word_results.filter(w=>w.result==="wrong").length],
                          ["#7a9e88","#f8fafb","#e8f0eb","Other",  rec.word_results.filter(w=>w.result!=="correct"&&w.result!=="wrong").length],
                        ].map(([col,bg,border,label,count],i)=>(
                          <div key={i} style={{ fontSize:11, padding:"3px 10px", borderRadius:10, background:bg as string, color:col as string, border:`1px solid ${border}` }}>
                            {label}: <b>{count}</b>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Transcript */}
                  {rec.transcript && (
                    <div style={{ margin:"14px 0" }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"#1a3d24", marginBottom:6 }}>
                        Transcript · النص المُسجَّل
                      </div>
                      <div style={{ background:"#f8fafb", border:"1px solid #e8f0eb", borderRadius:10, padding:"12px 14px", fontSize:16, color:"#1a3d24", direction:"rtl", fontFamily:"'Amiri',serif", lineHeight:2 }}>
                        {rec.transcript || "—"}
                      </div>
                    </div>
                  )}

                  {/* Admin Override */}
                  <div style={{ background: wasOverridden?"#ebf8ff":"#f8fafb", border:`1px solid ${wasOverridden?"#90cdf4":"#e8f0eb"}`, borderRadius:12, padding:"16px" }}>
                    <div style={{ fontSize:13, fontWeight:700, color:"#1a3d24", marginBottom:12 }}>
                      {wasOverridden ? "✏️ Score Overridden · تم تعديل الدرجة" : "✏️ Override Score · تعديل الدرجة"}
                    </div>

                    {/* AI vs Admin score comparison */}
                    <div style={{ display:"flex", gap:10, marginBottom:14 }}>
                      <div style={{ flex:1, background:scoreBg(rec.ai_score), borderRadius:10, padding:"10px 12px", textAlign:"center", border:`1px solid ${scoreColor(rec.ai_score)}22` }}>
                        <div style={{ fontSize:10, color:"#7a9e88", marginBottom:4 }}>AI Score · درجة الذكاء</div>
                        <div style={{ fontSize:24, fontWeight:900, color:scoreColor(rec.ai_score) }}>{rec.ai_score}%</div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", fontSize:20, color:"#7a9e88" }}>→</div>
                      <div style={{ flex:1, background:scoreBg(parseInt(ov.score)||0), borderRadius:10, padding:"10px 12px", textAlign:"center", border:`1px solid ${scoreColor(parseInt(ov.score)||0)}22` }}>
                        <div style={{ fontSize:10, color:"#7a9e88", marginBottom:4 }}>Admin Score · درجتك</div>
                        <div style={{ fontSize:24, fontWeight:900, color:scoreColor(parseInt(ov.score)||0) }}>{ov.score || "—"}%</div>
                      </div>
                    </div>

                    {/* Score slider + input */}
                    <div style={{ marginBottom:12 }}>
                      <label style={{ fontSize:12, color:"#7a9e88", display:"block", marginBottom:6 }}>
                        Override Score (0–100) · الدرجة المعدَّلة
                      </label>
                      <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                        <input type="range" min={0} max={100} value={ov.score}
                          onChange={e=>setOverrides(prev=>({...prev,[rec.id]:{...ov,score:e.target.value}}))}
                          style={{ flex:1, accentColor:"#1a3d24" }} />
                        <input type="number" min={0} max={100} value={ov.score}
                          onChange={e=>setOverrides(prev=>({...prev,[rec.id]:{...ov,score:e.target.value}}))}
                          style={{ width:60, background:"#fff", border:"1px solid #e8f0eb", borderRadius:8, padding:"6px 8px", fontSize:14, fontWeight:700, textAlign:"center", color:"#1a3d24" }} />
                      </div>
                    </div>

                    {/* Feedback */}
                    <div style={{ marginBottom:14 }}>
                      <label style={{ fontSize:12, color:"#7a9e88", display:"block", marginBottom:6 }}>
                        Feedback for student · ملاحظات للطالب
                      </label>
                      <textarea
                        value={ov.feedback}
                        onChange={e=>setOverrides(prev=>({...prev,[rec.id]:{...ov,feedback:e.target.value}}))}
                        rows={3}
                        placeholder="Write feedback for the student… اكتب ملاحظاتك"
                        style={{ width:"100%", background:"#fff", border:"1px solid #e8f0eb", borderRadius:10, padding:"10px 12px", fontSize:13, color:"#1a3d24", resize:"vertical" as const }} />
                    </div>

                    {/* Save button */}
                    <div style={{ display:"flex", gap:10 }}>
                      <button onClick={()=>saveOverride(rec)} disabled={saving===rec.id}
                        style={{ flex:1, padding:"11px 0", borderRadius:12, background: saving===rec.id?"#f0f4f0":"#1a3d24", border:"none", color: saving===rec.id?"#7a9e88":"#fff", fontSize:13, fontWeight:700, cursor: saving===rec.id?"not-allowed":"pointer" }}>
                        {saving===rec.id ? "Saving… · جارٍ الحفظ" : "Save Review · حفظ المراجعة"}
                      </button>
                      {/* Mark as reviewed without changing score */}
                      <button onClick={()=>{ setOverrides(prev=>({...prev,[rec.id]:{...ov,score:String(rec.ai_score)}})); saveOverride({...rec,admin_score:null}); }}
                        disabled={saving===rec.id}
                        style={{ padding:"11px 14px", borderRadius:12, background:"#f0fff4", border:"1px solid #9ae6b4", color:"#276749", fontSize:12, fontWeight:600, cursor:"pointer" }}>
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
