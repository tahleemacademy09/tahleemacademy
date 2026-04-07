/*
  SubjectMaterials.tsx - FIXED VERSION
  - Prevents overlay from closing on form interactions
  - Stops event propagation on all interactive elements
  - Better error handling and validation
*/
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import MaterialsViewer from "@/components/classroom/MaterialsViewer";
import {
  Upload, Loader2, X, FileText, Video, Music,
  Image as Img, Link as LinkIcon, AlignLeft, File,
  Download, Plus, AlertCircle, Check,
} from "lucide-react";

/* ─── palette ──────────────────────────────────────── */
const G  = "#064E3B";
const GM = "#065F46";

/* ─── types ─────────────────────────────────────────── */
type MatType = "PDF"|"Video"|"Audio"|"Image"|"Document"|"Link"|"Text";

const TC: Record<MatType,{icon:any;bg:string;border:string;clr:string;accept:string;en:string;ar:string}> = {
  PDF:      {icon:FileText, bg:"#FEF2F2",border:"#FECACA",clr:"#DC2626",accept:".pdf",              en:"PDF",      ar:"PDF"},
  Video:    {icon:Video,    bg:"#F0FDF4",border:"#BBF7D0",clr:"#16A34A",accept:"video/*,.mp4,.webm", en:"Video",    ar:"فيديو"},
  Audio:    {icon:Music,    bg:"#FDF4FF",border:"#E9D5FF",clr:"#9333EA",accept:"audio/*,.mp3,.wav",  en:"Audio",    ar:"صوت"},
  Image:    {icon:Img,      bg:"#EFF6FF",border:"#BFDBFE",clr:"#2563EB",accept:"image/*",            en:"Image",    ar:"صورة"},
  Document: {icon:File,     bg:"#FFFBEB",border:"#FDE68A",clr:"#D97706",accept:".doc,.docx,.xls,.xlsx,.ppt,.pptx", en:"Document", ar:"مستند"},
  Link:     {icon:LinkIcon, bg:"#F0FDFA",border:"#99F6E4",clr:"#0D9488",accept:"",                  en:"Link",     ar:"رابط"},
  Text:     {icon:AlignLeft,bg:"#F9FAFB",border:"#E5E7EB",clr:"#374151",accept:"",                  en:"Text",     ar:"نص"},
};
const TYPES = Object.keys(TC) as MatType[];

/* ─── helpers ────────────────────────────────────────── */
const fmt = (b:number) => b<1048576?`${(b/1024).toFixed(0)} KB`:`${(b/1048576).toFixed(1)} MB`;

function autoType(f:File): MatType {
  const t=f.type.toLowerCase(), e=f.name.split(".").pop()?.toLowerCase()||"";
  if(t.includes("pdf")||e==="pdf")                                            return "PDF";
  if(t.includes("video")||["mp4","webm","mov","m4v"].includes(e))             return "Video";
  if(t.includes("audio")||["mp3","wav","m4a","aac","ogg"].includes(e))        return "Audio";
  if(t.includes("image")||["jpg","jpeg","png","gif","webp","svg"].includes(e))return "Image";
  if(["doc","docx","xls","xlsx","ppt","pptx"].includes(e))                    return "Document";
  return "PDF";
}
/* ══════════════════════════════════════════════════════════
   COMPONENT - FIXED VERSION
══════════════════════════════════════════════════════════ */
const SubjectMaterials = ({subjectId}:{subjectId:string}) => {
  const {t}         = useLanguage();
  const {user,hasRole} = useAuth();
  const qc          = useQueryClient();
  const isPriv      = hasRole("admin")||hasRole("teacher");
  const fileRef     = useRef<HTMLInputElement>(null);

  /* ── form state ─────────────────────────────────── */
  const [open,    setOpen]    = useState(false);
  const [typ,     setTyp]     = useState<MatType>("PDF");
  const [title,   setTitle]   = useState("");
  const [file,    setFile]    = useState<File|null>(null);
  const [url,     setUrl]     = useState("");
  const [body,    setBody]    = useState("");
  const [dl,      setDl]      = useState(true);
  const [drag,    setDrag]    = useState(false);
  const [pct,     setPct]     = useState(0);
  const [err,     setErr]     = useState("");

  const cfg      = TC[typ];
  const Icon     = cfg.icon;
  const needFile = typ!=="Link"&&typ!=="Text";
  const needUrl  = typ==="Link";
  const needText = typ==="Text";

  /* ── queries ─────────────────────────────────────── */
  const {data:materials=[],isLoading} = useQuery({
    queryKey:["materials",subjectId],
    queryFn:async()=>{
      const {data,error}=await supabase.from("subject_materials")
        .select("*").eq("subject_id",subjectId)
        .order("sort_order").order("created_at",{ascending:false});
      if(error) throw error; return data;
    },
  });
  const {data:sessions=[]} = useQuery({
    queryKey:["sessions-light",subjectId],
    queryFn:async()=>{
      const {data}=await (supabase as any).from("class_sessions")
        .select("id,session_number,topic").eq("subject_id",subjectId).order("session_number");
      return data||[];
    },
  });

  /* ── upload mutation ─────────────────────────────── */
  const mut = useMutation({
    mutationFn: async () => {      setErr("");
      
      // Validate
      if (!title.trim()) {
        setErr("Title is required.");
        throw new Error("Title required");
      }
      if (!user) {
        setErr("You must be logged in.");
        throw new Error("Not authenticated");
      }
      if (needFile && !file && !url.trim()) {
        setErr("Please select a file or paste a URL.");
        throw new Error("File or URL required");
      }
      if (needUrl && !url.trim()) {
        setErr("Please enter a URL.");
        throw new Error("URL required");
      }
      if (needText && !body.trim()) {
        setErr("Content cannot be empty.");
        throw new Error("Content required");
      }

      let fileUrl = url.trim();
      let fileType = "";
      let fileSize = 0;

      // Upload file if provided
      if (needFile && file) {
        const ext = file.name.split(".").pop() || "bin";
        const path = `materials/${subjectId}/${crypto.randomUUID()}.${ext}`;
        setPct(15);
        
        const { error: storErr } = await supabase.storage
          .from("subject-files")
          .upload(path, file, { cacheControl: "3600", upsert: false });
          
        if (storErr) {
          console.error("Storage error:", storErr);
          throw new Error(`Storage: ${storErr.message}`);
        }
        setPct(80);
        fileUrl = path;
        fileType = file.type;
        fileSize = file.size;
      }

      setPct(90);
            // Insert into database
      const { error: dbErr } = await supabase
        .from("subject_materials")
        .insert({
          subject_id: subjectId,
          title: title.trim(),
          material_type: typ,
          file_url: fileUrl || null,
          content: needText ? body.trim() : null,
          is_downloadable: dl,
          sort_order: (materials as any[]).length,
          uploaded_by: user?.id,
          ...(fileType ? { file_type: fileType } : {}),
          ...(fileSize ? { file_size: fileSize } : {}),
        });
        
      if (dbErr) {
        console.error("Database error:", dbErr);
        throw new Error(`Database: ${dbErr.message}`);
      }
      
      setPct(100);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials", subjectId] });
      qc.invalidateQueries({ queryKey: ["subject-materials-all", subjectId] });
      close();
      toast({ title: t("Material uploaded!", "تم رفع المادة بنجاح!") });
    },
    onError: (e: any) => {
      setPct(0);
      console.error("Upload error:", e);
      if (e.message && !e.message.includes("Title required") && !e.message.includes("Not authenticated") && !e.message.includes("File or URL required")) {
        setErr(e.message);
      }
    },
  });

  /* ── helpers ─────────────────────────────────────── */
  const pickFile = (f: File) => {
    setFile(f);
    setTyp(autoType(f));
    if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ""));
    setErr("");
  };
  
  const close = () => {
    setOpen(false);
    setTitle("");
    setFile(null);    setUrl("");
    setBody("");
    setTyp("PDF");
    setDl(true);
    setDrag(false);
    setPct(0);
    setErr("");
    if (fileRef.current) fileRef.current.value = "";
  };
  
  const changeType = (tp: MatType) => {
    setTyp(tp);
    setFile(null);
    setErr("");
    if (fileRef.current) fileRef.current.value = "";
  };

  /* ── Prevent body scroll when modal is open ─────── */
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  /* ── input style ─────────────────────────────────── */
  const inp: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    borderRadius: 12,
    border: "1.5px solid #E5E7EB",
    fontSize: 14,
    boxSizing: "border-box",
    background: "#fff",
    color: "#111",
    fontFamily: "inherit",
    outline: "none",
    transition: "border-color .15s",
  };

  if (isLoading) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[1, 2, 3].map(i => <div key={i} style={{ height: 64, background: "#F3F4F6", borderRadius: 16 }} />)}
    </div>
  );

  return (
    <div>      <style>{`
        @keyframes sm-pop{from{opacity:0;transform:scale(.97)translateY(8px)}to{opacity:1;transform:scale(1)translateY(0)}}
        @keyframes sm-spin{to{transform:rotate(360deg)}}
        .sm-tb{transition:all .15s ease;cursor:pointer;}
        .sm-tb:hover{transform:translateY(-2px);box-shadow:0 4px 14px rgba(0,0,0,.1);}
        .sm-zone{transition:all .15s ease;cursor:pointer;}
        .sm-zone:hover{border-color:#064E3B!important;background:#F0FDF4!important;}
        .sm-inp:focus{border-color:#064E3B!important;}
        .sm-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 8px 24px rgba(6,78,59,.4)!important;}
        .sm-btn{transition:all .2s ease;}
      `}</style>

      {/* Trigger button */}
      {isPriv && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <button 
            type="button" 
            onClick={(e) => { e.stopPropagation(); setOpen(true); }} 
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              borderRadius: 12,
              border: "none",
              background: `linear-gradient(135deg,${G},${GM})`,
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(6,78,59,.3)",
            }}
          >
            <Plus size={16} />{t("Upload Material", "رفع مادة")}
          </button>
        </div>
      )}

      <MaterialsViewer materials={materials as any[]} sessions={sessions as any[]} />

      {/* ── OVERLAY MODAL ── */}
      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,.55)",
            display: "flex",
            alignItems: "flex-end",            justifyContent: "center",
            padding: 0,
          }}
          // Only close if clicking directly on the overlay background (not children)
          onClick={(e) => {
            // Only close if the click target is the overlay itself
            if (e.target === e.currentTarget) {
              close();
            }
          }}
        >
          {/* Sheet content - stop propagation to prevent overlay click */}
          <div 
            style={{
              background: "#fff",
              width: "100%",
              maxWidth: 520,
              maxHeight: "93vh",
              overflowY: "auto",
              borderRadius: "24px 24px 0 0",
              animation: "sm-pop .22s ease",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              background: `linear-gradient(135deg,${G},${GM})`,
              padding: "20px 22px",
              borderRadius: "24px 24px 0 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              position: "sticky",
              top: 0,
              zIndex: 2,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Upload size={20} color="#fff" />
                </div>
                <div>
                  <h2 style={{ color: "#fff", fontWeight: 800, fontSize: 17, margin: 0 }}>
                    {t("Upload Material", "رفع مادة تعليمية")}
                  </h2>
                  <p style={{ color: "rgba(255,255,255,.65)", fontSize: 12, margin: "2px 0 0" }}>
                    {t("Files, links or text for students", "ملفات أو روابط للطلاب")}
                  </p>
                </div>
              </div>
              <button                 type="button" 
                onClick={(e) => { e.stopPropagation(); close(); }} 
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  border: "1px solid rgba(255,255,255,.25)",
                  background: "rgba(255,255,255,.12)",
                  color: "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: "22px 22px 32px", display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Error message */}
              {err && (
                <div style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "13px 15px",
                  borderRadius: 12,
                  background: "#FEF2F2",
                  border: "1.5px solid #FECACA",
                }}>
                  <AlertCircle size={16} color="#DC2626" style={{ marginTop: 1, flexShrink: 0 }} />
                  <p style={{ fontSize: 13, color: "#B91C1C", margin: 0, fontWeight: 600 }}>{err}</p>
                </div>
              )}

              {/* Type selection grid */}
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", marginBottom: 10, textTransform: "uppercase", letterSpacing: "1px" }}>
                  {t("Type", "النوع")}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                  {TYPES.map(tp => {
                    const c = TC[tp], Ic = c.icon, sel = typ === tp;
                    return (
                      <button 
                        key={tp} 
                        type="button" 
                        className="sm-tb"
                        onClick={(e) => { e.stopPropagation(); changeType(tp); }}                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 7,
                          padding: "11px 4px",
                          borderRadius: 14,
                          border: `2px solid ${sel ? c.clr : "#EBEBEB"}`,
                          background: sel ? c.bg : "#FAFAFA",
                          boxShadow: sel ? `0 2px 12px ${c.clr}25` : "none",
                        }}
                      >
                        <div style={{
                          width: 34,
                          height: 34,
                          borderRadius: 9,
                          background: sel ? c.clr : "#E5E7EB",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all .15s",
                        }}>
                          <Ic size={17} color={sel ? "#fff" : "#9CA3AF"} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: sel ? 700 : 500, color: sel ? c.clr : "#9CA3AF" }}>
                          {t(c.en, c.ar)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title input */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8 }}>
                  {t("Title", "العنوان")} <span style={{ color: "#EF4444" }}>*</span>
                </label>
                <input
                  className="sm-inp"
                  style={{ ...inp, borderColor: !title && err ? "#FCA5A5" : "#E5E7EB" }}
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); if (err) setErr(""); }}
                  onClick={(e) => e.stopPropagation()}
                  placeholder={t("e.g. Week 1 Worksheet", "مثال: ورقة عمل الأسبوع الأول")}
                  autoFocus
                />
              </div>

              {/* File upload zone */}              {needFile && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8 }}>
                    {t("File", "الملف")}
                    <span style={{ color: "#9CA3AF", fontWeight: 400, marginLeft: 6 }}>
                      {t("(or paste URL below)", "(أو الصق رابطًا أدناه)")}
                    </span>
                  </label>

                  {/* Hidden file input */}
                  <input
                    ref={fileRef}
                    type="file"
                    accept={cfg.accept || "*/*"}
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) pickFile(f);
                    }}
                  />

                  {file ? (
                    /* Selected file display */
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "14px 16px",
                      borderRadius: 14,
                      background: cfg.bg,
                      border: `2px solid ${cfg.border}`,
                    }}>
                      <div style={{ width: 44, height: 44, borderRadius: 11, background: "#fff", border: `1.5px solid ${cfg.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon size={22} color={cfg.clr} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 700, fontSize: 13, color: "#111", margin: "0 0 3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</p>
                        <p style={{ fontSize: 11, color: "#6B7280", margin: 0 }}>{fmt(file.size)} · {typ}</p>
                      </div>
                      <button 
                        type="button"
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setFile(null); 
                          if (fileRef.current) fileRef.current.value = ""; 
                        }}
                        style={{ 
                          background: "#fff", 
                          border: `1px solid ${cfg.border}`, 
                          borderRadius: 8,                           cursor: "pointer", 
                          padding: 6, 
                          display: "flex", 
                          alignItems: "center" 
                        }}
                      >
                        <X size={14} color={cfg.clr} />
                      </button>
                    </div>
                  ) : (
                    /* Drop zone */
                    <div
                      className="sm-zone"
                      onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDrag(true); }}
                      onDragLeave={(e) => { e.stopPropagation(); setDrag(false); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDrag(false);
                        const f = e.dataTransfer.files[0];
                        if (f) pickFile(f);
                      }}
                      style={{
                        padding: "30px 20px",
                        borderRadius: 16,
                        border: `2px dashed ${drag ? G : "#D1D5DB"}`,
                        background: drag ? "#F0FDF4" : "#FAFAFA",
                        textAlign: "center",
                      }}
                    >
                      <div style={{ width: 54, height: 54, borderRadius: 14, margin: "0 auto 14px", background: cfg.bg, border: `2px solid ${cfg.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon size={26} color={cfg.clr} />
                      </div>
                      <p style={{ fontWeight: 700, fontSize: 14, color: "#374151", margin: "0 0 5px" }}>
                        {t("Tap to browse or drag file here", "انقر للاختيار أو اسحب الملف")}
                      </p>
                      <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>
                        {typ === "PDF" && "PDF files"}
                        {typ === "Video" && "MP4, WebM, MOV"}
                        {typ === "Audio" && "MP3, WAV, M4A, AAC"}
                        {typ === "Image" && "JPG, PNG, GIF, WebP, SVG"}
                        {typ === "Document" && "Word, Excel, PowerPoint"}
                      </p>
                    </div>
                  )}

                  {/* URL fallback */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0 8px" }}>
                    <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />                    <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 500, whiteSpace: "nowrap" }}>
                      {t("or paste a URL", "أو الصق رابطًا")}
                    </span>
                    <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
                  </div>
                  <input 
                    className="sm-inp" 
                    style={inp} 
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); if (err) setErr(""); }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="https://..."
                  />
                </div>
              )}

              {/* Link mode */}
              {needUrl && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8 }}>
                    URL <span style={{ color: "#EF4444" }}>*</span>
                  </label>
                  <input 
                    className="sm-inp" 
                    style={inp} 
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); if (err) setErr(""); }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="https://..."
                  />
                </div>
              )}

              {/* Text mode */}
              {needText && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 8 }}>
                    {t("Content", "المحتوى")} <span style={{ color: "#EF4444" }}>*</span>
                  </label>
                  <textarea 
                    className="sm-inp" 
                    rows={6}
                    style={{ ...inp, resize: "vertical" }}
                    value={body}
                    onChange={(e) => { setBody(e.target.value); if (err) setErr(""); }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder={t("Type your text content here…", "اكتب المحتوى هنا…")}
                  />
                </div>
              )}
              {/* Allow download toggle */}
              <div
                onClick={(e) => { e.stopPropagation(); setDl(v => !v); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  borderRadius: 14,
                  cursor: "pointer",
                  background: dl ? "#F0FDF4" : "#F9FAFB",
                  border: `1.5px solid ${dl ? "#A7F3D0" : "#E5E7EB"}`,
                  transition: "all .2s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: dl ? "#D1FAE5" : "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .2s" }}>
                    <Download size={17} color={dl ? G : "#9CA3AF"} />
                  </div>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: 13, color: "#374151", margin: 0 }}>{t("Allow Download", "السماح بالتنزيل")}</p>
                    <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>
                      {dl ? t("Students can save this file", "يمكن للطلاب تنزيل الملف") : t("View only", "مشاهدة فقط")}
                    </p>
                  </div>
                </div>
                {/* Custom toggle switch */}
                <div style={{ width: 44, height: 24, borderRadius: 99, background: dl ? G : "#CBD5E1", position: "relative", transition: "background .2s", flexShrink: 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: 99, background: "#fff", position: "absolute", top: 3, left: dl ? 23 : 3, transition: "left .2s", boxShadow: "0 1px 4px rgba(0,0,0,.2)" }} />
                </div>
              </div>

              {/* Progress bar */}
              {mut.isPending && pct > 0 && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                    <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 600 }}>{t("Uploading…", "جاري الرفع…")}</span>
                    <span style={{ fontSize: 12, color: G, fontWeight: 800 }}>{pct}%</span>
                  </div>
                  <div style={{ height: 7, background: "#E5E7EB", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 99, background: `linear-gradient(90deg,${G},#10B981)`, width: `${pct}%`, transition: "width .5s ease" }} />
                  </div>
                </div>
              )}

              {/* Submit button */}
              <button 
                type="button" 
                className="sm-btn"                onClick={(e) => { e.stopPropagation(); mut.mutate(); }}
                disabled={mut.isPending}
                style={{
                  width: "100%",
                  padding: "15px",
                  borderRadius: 14,
                  border: "none",
                  background: mut.isPending ? "#E5E7EB" : `linear-gradient(135deg,${G},${GM})`,
                  color: mut.isPending ? "#9CA3AF" : "#fff",
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: mut.isPending ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  boxShadow: mut.isPending ? "none" : "0 4px 16px rgba(6,78,59,.3)",
                }}
              >
                {mut.isPending ? (
                  <><Loader2 size={18} style={{ animation: "sm-spin .8s linear infinite" }} />{t("Uploading…", "جاري الرفع…")}</>
                ) : (
                  <><Upload size={18} />{t("Upload Material", "رفع المادة")}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubjectMaterials;