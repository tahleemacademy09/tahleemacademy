/**
 * SubjectMaterialsHub.tsx
 * Beautiful standalone materials upload + library section for subjects.
 * Linked to Supabase storage bucket "subject-files".
 */
import React, {
  useState, useRef, useEffect, useCallback, useMemo,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  Upload, FileText, Video, Music, Image as ImgIcon,
  ExternalLink, Type, FileSpreadsheet, Download, Trash2,
  Edit2, Check, X, AlertCircle, Search, Filter,
  Eye, Clock, HardDrive, ChevronDown, GripVertical,
  Folder, Sparkles, ArrowUpFromLine,
} from "lucide-react";

// ─── Brand ────────────────────────────────────────────────────────────────
const G   = "#064E3B";
const G2  = "#065F46";
const G3  = "#ECFDF5";
const GOLD = "#B8973A";

// ─── Types ─────────────────────────────────────────────────────────────────
type MatType = "PDF" | "Video" | "Audio" | "Image" | "Document" | "Link" | "Text";

const TYPE_CFG: Record<MatType, {
  icon: React.ElementType; label: string; accept: string;
  bg: string; border: string; text: string; glow: string;
}> = {
  PDF:      { icon: FileText,      label:"PDF",      accept:".pdf",
               bg:"#FEF2F2", border:"#FCA5A5", text:"#DC2626", glow:"rgba(220,38,38,.15)" },
  Video:    { icon: Video,         label:"Video",    accept:"video/*,.mp4,.webm,.mov",
               bg:"#F0FDF4", border:"#86EFAC", text:"#16A34A", glow:"rgba(22,163,74,.15)" },
  Audio:    { icon: Music,         label:"Audio",    accept:"audio/*,.mp3,.wav,.m4a",
               bg:"#FDF4FF", border:"#D8B4FE", text:"#9333EA", glow:"rgba(147,51,234,.15)" },
  Image:    { icon: ImgIcon,       label:"Image",    accept:"image/*",
               bg:"#EFF6FF", border:"#93C5FD", text:"#2563EB", glow:"rgba(37,99,235,.15)" },
  Document: { icon: FileSpreadsheet,label:"Document",accept:".doc,.docx,.xls,.xlsx,.ppt,.pptx",
               bg:"#FFFBEB", border:"#FDE68A", text:"#B45309", glow:"rgba(180,83,9,.15)" },
  Link:     { icon: ExternalLink,  label:"Link",     accept:"",
               bg:"#F0FDFA", border:"#5EEAD4", text:"#0D9488", glow:"rgba(13,148,136,.15)" },
  Text:     { icon: Type,          label:"Text",     accept:"",
               bg:"#F9FAFB", border:"#D1D5DB", text:"#374151", glow:"rgba(55,65,81,.1)"  },
};

const ALL_TYPES = Object.keys(TYPE_CFG) as MatType[];

function detectType(file: File): MatType {
  const t = file.type.toLowerCase();
  const e = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (t.includes("pdf") || e === "pdf") return "PDF";
  if (t.includes("video") || ["mp4","webm","mov","avi","m4v"].includes(e)) return "Video";
  if (t.includes("audio") || ["mp3","wav","m4a","aac","ogg","flac"].includes(e)) return "Audio";
  if (t.includes("image") || ["jpg","jpeg","png","gif","webp","svg","avif"].includes(e)) return "Image";
  if (["doc","docx","xls","xlsx","ppt","pptx","odt","ods"].includes(e)) return "Document";
  return "PDF";
}

function fmtSize(b?: number | null) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Upload helper (XHR for real progress) ─────────────────────────────────
function xhrUpload(
  supabaseUrl: string, anonKey: string,
  bucket: string, path: string, file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${supabaseUrl}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${anonKey}`);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.addEventListener("progress", ev => {
      if (ev.lengthComputable) onProgress(Math.round(ev.loaded / ev.total * 88));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress(92); resolve(); }
      else {
        try { const e = JSON.parse(xhr.responseText); reject(new Error(e.error ?? e.message ?? "Upload failed")); }
        catch { reject(new Error(`Upload failed (${xhr.status})`)); }
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.addEventListener("abort", () => reject(new Error("Aborted")));
    const fd = new FormData();
    fd.append("", file, file.name);
    xhr.send(fd);
  });
}

// ─── EDIT MODAL ─────────────────────────────────────────────────────────────
const EditModal = React.memo(({ mat, onClose, onSaved }: {
  mat: any; onClose: () => void; onSaved: () => void;
}) => {
  const [title, setTitle] = useState(mat.title ?? "");
  const [downloadable, setDownloadable] = useState(mat.is_downloadable ?? true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("subject_materials")
      .update({ title: title.trim(), is_downloadable: downloadable })
      .eq("id", mat.id);
    setSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "✅ Updated" });
    onSaved();
  };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,.5)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:400, padding:24,
        boxShadow:"0 24px 80px rgba(0,0,0,.2)", animation:"hub-pop .2s ease" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <h3 style={{ fontSize:16, fontWeight:800, color:"#111", margin:0 }}>Edit Material</h3>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#9CA3AF" }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <label style={{ fontSize:12, fontWeight:700, color:"#374151", display:"block", marginBottom:6 }}>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
              style={{ width:"100%", padding:"11px 14px", borderRadius:12, border:"1.5px solid #E5E7EB",
                fontSize:14, outline:"none", boxSizing:"border-box" as const }} />
          </div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"12px 14px", borderRadius:12, background:downloadable?"#F0FDF4":"#F9FAFB",
            border:`1.5px solid ${downloadable?"#86EFAC":"#E5E7EB"}`, cursor:"pointer", transition:"all .2s" }}
            onClick={() => setDownloadable(v => !v)}>
            <div>
              <p style={{ fontWeight:700, fontSize:13, color:"#374151", margin:0 }}>Allow Download</p>
              <p style={{ fontSize:11, color:"#9CA3AF", margin:"2px 0 0" }}>
                {downloadable ? "Students can save this file" : "View only"}
              </p>
            </div>
            <div style={{ width:44, height:24, borderRadius:99, background:downloadable?G:"#CBD5E1",
              position:"relative", transition:"background .2s", flexShrink:0 }}>
              <div style={{ width:18, height:18, borderRadius:99, background:"#fff",
                position:"absolute", top:3, left:downloadable?23:3, transition:"left .2s",
                boxShadow:"0 1px 4px rgba(0,0,0,.2)" }} />
            </div>
          </div>
          <button onClick={save} disabled={saving || !title.trim()}
            style={{ padding:"13px", borderRadius:12, border:"none",
              background:saving||!title.trim()?"#E5E7EB":`linear-gradient(135deg,${G},${G2})`,
              color:saving||!title.trim()?"#9CA3AF":"#fff", fontWeight:800, fontSize:14,
              cursor:saving||!title.trim()?"not-allowed":"pointer",
              display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            {saving ? "Saving…" : <><Check size={15}/> Save Changes</>}
          </button>
        </div>
      </div>
    </div>
  );
});

// ─── MATERIAL CARD ──────────────────────────────────────────────────────────
const MaterialCard = React.memo(({ mat, index, onEdit, onDelete }: {
  mat: any; index: number; onEdit: (m: any) => void; onDelete: (m: any) => void;
}) => {
  const cfg = TYPE_CFG[(mat.material_type as MatType) ?? "PDF"];
  const Icon = cfg.icon;
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgErr, setImgErr] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Resolve image previews
  useEffect(() => {
    if (mat.material_type !== "Image" || !mat.file_url) return;
    if (mat.file_url.startsWith("http")) { setImgSrc(mat.file_url); return; }
    supabase.storage.from("subject-files").createSignedUrl(mat.file_url, 3600)
      .then(({ data }) => { if (data?.signedUrl) setImgSrc(data.signedUrl); });
  }, [mat.file_url, mat.material_type]);

  const openFile = async () => {
    if (!mat.file_url) return;
    if (mat.file_url.startsWith("http")) { window.open(mat.file_url, "_blank"); return; }
    const { data } = await supabase.storage.from("subject-files").createSignedUrl(mat.file_url, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const downloadFile = async () => {
    if (!mat.file_url) return;
    let url = mat.file_url;
    if (!url.startsWith("http")) {
      const { data } = await supabase.storage.from("subject-files").createSignedUrl(mat.file_url, 3600);
      url = data?.signedUrl ?? url;
    }
    const a = document.createElement("a");
    a.href = url; a.download = mat.title; a.click();
  };

  return (
    <div className="mat-card" style={{
      background:"#fff", borderRadius:16, border:`1.5px solid ${cfg.border}`,
      overflow:"hidden", position:"relative", animation:`hub-slidein .3s ease both`,
      animationDelay:`${index * 60}ms`,
    }}>
      {/* Image thumbnail for Image type */}
      {mat.material_type === "Image" && imgSrc && !imgErr && (
        <div style={{ height:110, overflow:"hidden", background:cfg.bg }}>
          <img src={imgSrc} alt={mat.title} onError={() => setImgErr(true)}
            style={{ width:"100%", height:"100%", objectFit:"cover" }} />
        </div>
      )}

      {/* Type stripe */}
      <div style={{ height:4, background:`linear-gradient(90deg,${cfg.text},${cfg.text}88)` }} />

      <div style={{ padding:"14px 16px" }}>
        {/* Header row */}
        <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:10 }}>
          <div style={{ width:40, height:40, borderRadius:11, background:cfg.bg,
            border:`1.5px solid ${cfg.border}`, display:"flex", alignItems:"center",
            justifyContent:"center", flexShrink:0 }}>
            <Icon size={20} color={cfg.text} />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ fontWeight:700, fontSize:13, color:"#111", margin:"0 0 3px",
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{mat.title}</p>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
              <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:20,
                background:cfg.bg, color:cfg.text, border:`1px solid ${cfg.border}` }}>
                {mat.material_type}
              </span>
              {mat.file_size && (
                <span style={{ fontSize:10, color:"#9CA3AF", display:"flex", alignItems:"center", gap:3 }}>
                  <HardDrive size={10}/>{fmtSize(mat.file_size)}
                </span>
              )}
              {mat.created_at && (
                <span style={{ fontSize:10, color:"#9CA3AF", display:"flex", alignItems:"center", gap:3 }}>
                  <Clock size={10}/>{timeAgo(mat.created_at)}
                </span>
              )}
            </div>
          </div>

          {/* Menu */}
          <div style={{ position:"relative" }}>
            <button onClick={() => setMenuOpen(v => !v)}
              style={{ width:28, height:28, borderRadius:8, border:"1.5px solid #E5E7EB",
                background:"#fff", cursor:"pointer", display:"flex", alignItems:"center",
                justifyContent:"center", color:"#9CA3AF" }}>
              <ChevronDown size={13} />
            </button>
            {menuOpen && (
              <div style={{ position:"absolute", right:0, top:34, background:"#fff",
                borderRadius:12, border:"1.5px solid #E5E7EB", padding:6, zIndex:50,
                boxShadow:"0 8px 28px rgba(0,0,0,.12)", minWidth:140,
                animation:"hub-pop .15s ease" }}
                onMouseLeave={() => setMenuOpen(false)}>
                {mat.file_url && (
                  <button onClick={() => { openFile(); setMenuOpen(false); }}
                    style={menuItemStyle("#6B7280")}>
                    <Eye size={13}/> View
                  </button>
                )}
                {mat.is_downloadable && mat.file_url && (
                  <button onClick={() => { downloadFile(); setMenuOpen(false); }}
                    style={menuItemStyle("#0D9488")}>
                    <Download size={13}/> Download
                  </button>
                )}
                <button onClick={() => { onEdit(mat); setMenuOpen(false); }}
                  style={menuItemStyle(G)}>
                  <Edit2 size={13}/> Edit
                </button>
                <div style={{ height:1, background:"#F3F4F6", margin:"4px 0" }} />
                <button onClick={() => { onDelete(mat); setMenuOpen(false); }}
                  style={menuItemStyle("#DC2626")}>
                  <Trash2 size={13}/> Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content preview */}
        {mat.content && (
          <p style={{ fontSize:11, color:"#6B7280", margin:0, lineHeight:1.5,
            display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" as const,
            overflow:"hidden", padding:"8px 10px", background:"#F9FAFB",
            borderRadius:8, border:"1px solid #E5E7EB" }}>
            {mat.content}
          </p>
        )}

        {/* Download badge */}
        {mat.is_downloadable && (
          <div style={{ marginTop:8, display:"flex", alignItems:"center", gap:5,
            fontSize:10, color:G, fontWeight:600 }}>
            <Download size={10}/> Downloadable
          </div>
        )}
      </div>
    </div>
  );
});

function menuItemStyle(color: string): React.CSSProperties {
  return {
    display:"flex", alignItems:"center", gap:8, width:"100%", padding:"8px 10px",
    borderRadius:8, border:"none", background:"none", cursor:"pointer",
    fontSize:12, fontWeight:600, color, textAlign:"left",
  };
}

// ─── UPLOAD ZONE ────────────────────────────────────────────────────────────
type UploadPhase = "idle" | "uploading" | "saving" | "done" | "error";

const UploadZone = ({ subjectId, totalMaterials, onUploaded }: {
  subjectId: string; totalMaterials: number; onUploaded: () => void;
}) => {
  const { user } = useAuth();
  const [form, setForm] = useState({
    title: "", material_type: "PDF" as MatType,
    file_url: "", content: "", is_downloadable: true,
  });
  const [file,    setFile]    = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase,   setPhase]   = useState<UploadPhase>("idle");
  const [pct,     setPct]     = useState(0);
  const [err,     setErr]     = useState("");
  const [drag,    setDrag]    = useState(false);
  const [dc,      setDc]      = useState(0); // drag enter count
  const fileRef = useRef<HTMLInputElement>(null);

  const cfg      = TYPE_CFG[form.material_type];
  const Icon     = cfg.icon;
  const needFile = form.material_type !== "Link" && form.material_type !== "Text";
  const busy     = phase === "uploading" || phase === "saving";

  const pickFile = useCallback((fi: File) => {
    const t = detectType(fi);
    setFile(fi);
    setForm(f => ({ ...f, material_type: t, title: f.title || fi.name.replace(/\.[^/.]+$/, "") }));
    setErr("");
    if (fi.type.startsWith("image/")) {
      const r = new FileReader();
      r.onload = ev => setPreview(ev.target?.result as string);
      r.readAsDataURL(fi);
    } else { setPreview(null); }
  }, []);

  const resetForm = useCallback(() => {
    setForm({ title:"", material_type:"PDF", file_url:"", content:"", is_downloadable:true });
    setFile(null); setPreview(null); setPct(0); setPhase("idle"); setErr("");
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); setDc(c => c + 1); setDrag(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDc(c => { const n = c - 1; if (n <= 0) setDrag(false); return n; });
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false); setDc(0);
    const fi = e.dataTransfer.files?.[0];
    if (fi) pickFile(fi);
  };

  const doUpload = async () => {
    setErr("");
    if (!form.title.trim())                            { setErr("Title is required"); return; }
    if (needFile && !file && !form.file_url.trim())   { setErr("Please select a file or paste a URL"); return; }
    if (form.material_type === "Link" && !form.file_url.trim()) { setErr("Please enter a URL"); return; }
    if (form.material_type === "Text" && !form.content.trim())  { setErr("Content cannot be empty"); return; }

    setPhase("uploading"); setPct(5);
    try {
      let fileUrl = form.file_url.trim(), fileType = "", fileSize = 0;

      if (needFile && file) {
        const ext  = file.name.split(".").pop() ?? "bin";
        const path = `materials/${subjectId}/${crypto.randomUUID()}.${ext}`;

        // Supabase URL/key for XHR
        const sbUrl = (supabase as any).supabaseUrl as string ?? "https://wvqeubhupkddtkcdwqcm.supabase.co";
        const sbKey = (supabase as any).supabaseKey as string ?? "";

        try {
          await xhrUpload(sbUrl, sbKey, "subject-files", path, file, setPct);
        } catch {
          // fallback
          setPct(50);
          const { error } = await supabase.storage
            .from("subject-files")
            .upload(path, file, { cacheControl:"3600", upsert:false });
          if (error) throw new Error("Storage: " + error.message);
        }
        fileUrl = path; fileType = file.type; fileSize = file.size;
      }

      setPct(96); setPhase("saving");

      const payload: Record<string, unknown> = {
        subject_id:      subjectId,
        title:           form.title.trim(),
        material_type:   form.material_type,
        file_url:        fileUrl || "placeholder",
        content:         form.material_type === "Text" ? form.content.trim() : null,
        is_downloadable: form.is_downloadable,
        sort_order:      totalMaterials,
        uploaded_by:     user?.id ?? "",
        ...(fileType ? { file_type: fileType } : {}),
        ...(fileSize ? { file_size: fileSize } : {}),
      };

      const { error: dbErr } = await supabase.from("subject_materials").insert(payload as any);
      if (dbErr) throw new Error("Database: " + dbErr.message);

      setPct(100); setPhase("done");
      toast({ title: "✅ Material uploaded successfully!" });
      setTimeout(() => { onUploaded(); resetForm(); }, 900);
    } catch (e: any) {
      setPhase("error"); setPct(0);
      setErr(e.message ?? "Upload failed");
      toast({ title: "Upload Error", description: e.message, variant: "destructive" });
    }
  };

  const pctLabel = phase === "uploading" ? `Uploading… ${pct}%`
    : phase === "saving" ? "Saving to database…"
    : phase === "done"   ? "Done ✓"
    : "";

  const barColor = phase === "done" ? "#16A34A" : phase === "saving" ? GOLD : G;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* ── Error ── */}
      {err && (
        <div style={{ display:"flex", gap:10, padding:"12px 14px", borderRadius:12,
          background:"#FEF2F2", border:"1.5px solid #FCA5A5", alignItems:"flex-start",
          animation:"hub-pop .2s ease" }}>
          <AlertCircle size={15} color="#DC2626" style={{ marginTop:1, flexShrink:0 }} />
          <p style={{ fontSize:12, color:"#B91C1C", margin:0, fontWeight:600, flex:1 }}>{err}</p>
          <button onClick={() => setErr("")} style={{ background:"none", border:"none",
            cursor:"pointer", color:"#9CA3AF", padding:0 }}><X size={13}/></button>
        </div>
      )}

      {/* ── Title ── */}
      <div>
        <label style={{ fontSize:11, fontWeight:800, color:"#374151", letterSpacing:".06em",
          textTransform:"uppercase", display:"block", marginBottom:7 }}>
          Title <span style={{ color:"#EF4444" }}>*</span>
        </label>
        <input value={form.title} disabled={busy}
          onChange={e => { setForm(f => ({ ...f, title: e.target.value })); setErr(""); }}
          placeholder="e.g. Week 3 Worksheet"
          style={{ width:"100%", padding:"12px 14px", borderRadius:12,
            border:`1.5px solid ${!form.title && err ? "#FCA5A5" : "#E5E7EB"}`,
            fontSize:14, outline:"none", boxSizing:"border-box" as const,
            background:"#FAFAFA", fontFamily:"inherit" }}
        />
      </div>

      {/* ── Type selector ── */}
      <div>
        <label style={{ fontSize:11, fontWeight:800, color:"#374151", letterSpacing:".06em",
          textTransform:"uppercase", display:"block", marginBottom:10 }}>Type</label>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:7 }}>
          {ALL_TYPES.map(mt => {
            const c = TYPE_CFG[mt], Ic = c.icon, sel = form.material_type === mt;
            return (
              <button key={mt} type="button" disabled={busy}
                onClick={() => !busy && setForm(f => ({ ...f, material_type: mt }))}
                className="hub-type-btn"
                style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6,
                  padding:"11px 4px", borderRadius:13,
                  border:`2px solid ${sel ? c.text : "#EBEBEB"}`,
                  background:sel ? c.bg : "#FAFAFA",
                  boxShadow:sel ? `0 2px 14px ${c.glow}` : "none",
                  cursor:busy?"not-allowed":"pointer", transition:"all .15s",
                  opacity:busy ? .6 : 1 }}>
                <div style={{ width:32, height:32, borderRadius:9,
                  background:sel ? c.text : "#E5E7EB",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  transition:"all .15s" }}>
                  <Ic size={15} color={sel ? "#fff" : "#9CA3AF"} />
                </div>
                <span style={{ fontSize:10, fontWeight:sel?800:500,
                  color:sel ? c.text : "#9CA3AF" }}>{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── File zone ── */}
      {needFile && (
        <div>
          <label style={{ fontSize:11, fontWeight:800, color:"#374151", letterSpacing:".06em",
            textTransform:"uppercase", display:"block", marginBottom:10 }}>File</label>

          {file ? (
            /* ── Selected file card ── */
            <div style={{ borderRadius:14, border:`2px solid ${cfg.border}`,
              background:cfg.bg, overflow:"hidden",
              animation:"hub-pop .2s ease" }}>
              {preview && (
                <img src={preview} alt="preview"
                  style={{ width:"100%", maxHeight:130, objectFit:"cover", display:"block" }} />
              )}
              <div style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 16px" }}>
                <div style={{ width:42, height:42, borderRadius:11, background:"#fff",
                  border:`1.5px solid ${cfg.border}`,
                  display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <Icon size={21} color={cfg.text} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontWeight:700, fontSize:13, color:"#111", margin:"0 0 3px",
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{file.name}</p>
                  <div style={{ display:"flex", gap:7, alignItems:"center" }}>
                    <span style={{ fontSize:10, fontWeight:700, padding:"1px 7px", borderRadius:20,
                      background:"#fff", color:cfg.text, border:`1px solid ${cfg.border}` }}>
                      {form.material_type}
                    </span>
                    <span style={{ fontSize:11, color:"#9CA3AF" }}>{fmtSize(file.size)}</span>
                  </div>
                </div>
                {!busy && (
                  <button type="button" onClick={() => { setFile(null); setPreview(null); if(fileRef.current) fileRef.current.value=""; }}
                    style={{ width:30, height:30, borderRadius:8, border:`1px solid ${cfg.border}`,
                      background:"#fff", cursor:"pointer", display:"flex",
                      alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <X size={13} color={cfg.text} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* ── Drop zone ── */
            <div
              onDragEnter={onDragEnter} onDragLeave={onDragLeave}
              onDragOver={e => e.preventDefault()} onDrop={onDrop}
              onClick={() => !busy && fileRef.current?.click()}
              style={{
                padding:"30px 20px", borderRadius:18, textAlign:"center",
                cursor:busy ? "not-allowed" : "pointer",
                border:`2.5px dashed ${drag ? G : "#D1D5DB"}`,
                background:drag
                  ? "linear-gradient(135deg,#ECFDF5,#D1FAE5)"
                  : "#FAFAFA",
                boxShadow:drag ? `0 0 0 5px ${G}18` : "none",
                transform:drag ? "scale(1.015)" : "scale(1)",
                transition:"all .2s ease",
              }}>
              <input ref={fileRef} type="file" style={{ display:"none" }}
                accept={TYPE_CFG[form.material_type].accept || "*/*"}
                onChange={e => { const fi = e.target.files?.[0]; if (fi) pickFile(fi); }} />

              <div style={{ width:58, height:58, borderRadius:17, margin:"0 auto 14px",
                background:drag ? cfg.bg : "#F3F4F6",
                border:`2px solid ${drag ? cfg.border : "#E5E7EB"}`,
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"all .2s" }}>
                {drag
                  ? <Icon size={26} color={cfg.text} />
                  : <ArrowUpFromLine size={26} color="#9CA3AF" />
                }
              </div>
              <p style={{ fontWeight:800, fontSize:14, margin:"0 0 5px",
                color:drag ? G : "#374151", transition:"color .2s" }}>
                {drag ? "Release to upload!" : "Tap to browse or drag file here"}
              </p>
              <p style={{ fontSize:12, color:"#9CA3AF", margin:0 }}>
                {form.material_type === "PDF"      && "PDF files"}
                {form.material_type === "Video"    && "MP4 · WebM · MOV · AVI"}
                {form.material_type === "Audio"    && "MP3 · WAV · M4A · AAC · FLAC"}
                {form.material_type === "Image"    && "JPG · PNG · GIF · WebP · SVG"}
                {form.material_type === "Document" && "Word · Excel · PowerPoint"}
              </p>
            </div>
          )}

          {/* URL fallback */}
          <div style={{ display:"flex", alignItems:"center", gap:10, margin:"12px 0 8px" }}>
            <div style={{ flex:1, height:1, background:"#E5E7EB" }} />
            <span style={{ fontSize:11, color:"#9CA3AF", fontWeight:600, whiteSpace:"nowrap" }}>or paste a URL</span>
            <div style={{ flex:1, height:1, background:"#E5E7EB" }} />
          </div>
          <input value={form.file_url} disabled={busy}
            onChange={e => setForm(f => ({ ...f, file_url: e.target.value }))}
            placeholder="https://…"
            style={{ width:"100%", padding:"11px 14px", borderRadius:12,
              border:"1.5px solid #E5E7EB", fontSize:13, outline:"none",
              boxSizing:"border-box" as const, background:"#FAFAFA", fontFamily:"inherit" }} />
        </div>
      )}

      {/* URL (Link type) */}
      {form.material_type === "Link" && (
        <div>
          <label style={{ fontSize:11, fontWeight:800, color:"#374151", letterSpacing:".06em",
            textTransform:"uppercase", display:"block", marginBottom:7 }}>
            URL <span style={{ color:"#EF4444" }}>*</span>
          </label>
          <input value={form.file_url} disabled={busy}
            onChange={e => { setForm(f => ({ ...f, file_url: e.target.value })); setErr(""); }}
            placeholder="https://…"
            style={{ width:"100%", padding:"12px 14px", borderRadius:12,
              border:"1.5px solid #E5E7EB", fontSize:14, outline:"none",
              boxSizing:"border-box" as const, fontFamily:"inherit" }} />
        </div>
      )}

      {/* Text content */}
      {form.material_type === "Text" && (
        <div>
          <label style={{ fontSize:11, fontWeight:800, color:"#374151", letterSpacing:".06em",
            textTransform:"uppercase", display:"block", marginBottom:7 }}>
            Content <span style={{ color:"#EF4444" }}>*</span>
          </label>
          <textarea value={form.content} disabled={busy} rows={5}
            onChange={e => { setForm(f => ({ ...f, content: e.target.value })); setErr(""); }}
            placeholder="Type your text content here…"
            style={{ width:"100%", padding:"12px 14px", borderRadius:12,
              border:"1.5px solid #E5E7EB", fontSize:14, outline:"none",
              boxSizing:"border-box" as const, resize:"vertical", fontFamily:"inherit" }} />
        </div>
      )}

      {/* Progress */}
      {(phase === "uploading" || phase === "saving" || phase === "done") && (
        <div style={{ padding:"12px 16px", borderRadius:12, background:"#F0FDF4",
          border:"1px solid #BBF7D0", animation:"hub-pop .2s ease" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <span style={{ fontSize:12, fontWeight:700, color:"#166534" }}>{pctLabel}</span>
            <span style={{ fontSize:12, fontWeight:800, color:barColor }}>{pct}%</span>
          </div>
          <div style={{ height:8, background:"#D1FAE5", borderRadius:99, overflow:"hidden" }}>
            <div style={{ height:"100%", borderRadius:99, width:`${pct}%`,
              background:`linear-gradient(90deg,${barColor},${barColor}99)`,
              transition:"width .3s ease",
              ...(phase === "uploading" ? {} : {}) }} />
          </div>
          {phase === "uploading" && file && (
            <p style={{ fontSize:10, color:"#6B7280", margin:"5px 0 0" }}>
              {Math.round(pct / 100 * file.size / 1024)} KB / {Math.round(file.size / 1024)} KB transferred
            </p>
          )}
        </div>
      )}

      {/* Download toggle */}
      <div onClick={() => !busy && setForm(f => ({ ...f, is_downloadable: !f.is_downloadable }))}
        style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"13px 16px", borderRadius:13, cursor:busy?"not-allowed":"pointer",
          background:form.is_downloadable ? "#F0FDF4" : "#F9FAFB",
          border:`1.5px solid ${form.is_downloadable ? "#86EFAC" : "#E5E7EB"}`,
          transition:"all .2s", opacity:busy?.6:1 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:10,
            background:form.is_downloadable ? "#D1FAE5" : "#F3F4F6",
            display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Download size={16} color={form.is_downloadable ? G : "#9CA3AF"} />
          </div>
          <div>
            <p style={{ fontWeight:700, fontSize:13, color:"#374151", margin:0 }}>Allow Download</p>
            <p style={{ fontSize:11, color:"#9CA3AF", margin:"2px 0 0" }}>
              {form.is_downloadable ? "Students can save this file" : "View only"}
            </p>
          </div>
        </div>
        <div style={{ width:44, height:24, borderRadius:99,
          background:form.is_downloadable ? G : "#CBD5E1",
          position:"relative", transition:"background .2s", flexShrink:0 }}>
          <div style={{ width:18, height:18, borderRadius:99, background:"#fff",
            position:"absolute", top:3, left:form.is_downloadable ? 23 : 3,
            transition:"left .2s", boxShadow:"0 1px 4px rgba(0,0,0,.2)" }} />
        </div>
      </div>

      {/* Upload button */}
      <button type="button" onClick={doUpload} disabled={busy || phase === "done"}
        className="hub-upload-btn"
        style={{ width:"100%", padding:"15px", borderRadius:14, border:"none",
          background:busy||phase==="done" ? "#E5E7EB"
            : `linear-gradient(135deg,${G} 0%,${G2} 100%)`,
          color:busy||phase==="done" ? "#9CA3AF" : "#fff",
          fontWeight:800, fontSize:15,
          cursor:busy||phase==="done" ? "not-allowed" : "pointer",
          display:"flex", alignItems:"center", justifyContent:"center", gap:10,
          boxShadow:busy||phase==="done" ? "none" : `0 4px 20px ${G}44`,
          letterSpacing:".02em" }}>
        {phase === "uploading" && <><span style={{ animation:"hub-spin .8s linear infinite", display:"flex" }}><Upload size={18}/></span> Uploading {pct}%…</>}
        {phase === "saving"    && <><span style={{ animation:"hub-spin .8s linear infinite", display:"flex" }}><Sparkles size={18}/></span> Saving…</>}
        {phase === "done"      && <><Check size={18}/> Uploaded!</>}
        {phase === "error"     && <><Upload size={18}/> Retry</>}
        {phase === "idle"      && <><Upload size={18}/> Upload Material</>}
      </button>
    </div>
  );
};

// ─── MAIN HUB COMPONENT ─────────────────────────────────────────────────────
export default function SubjectMaterialsHub({ subjectId, subjectTitle }: {
  subjectId: string; subjectTitle?: string;
}) {
  const qc = useQueryClient();
  const [search,    setSearch]    = useState("");
  const [typeFilter,setTypeFilter]= useState<MatType|"All">("All");
  const [editMat,   setEditMat]   = useState<any>(null);
  const [showUpload,setShowUpload]= useState(true);

  // Fetch materials
  const { data: materials = [], isLoading } = useQuery({
    queryKey: ["hub-materials", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subject_materials")
        .select("*")
        .eq("subject_id", subjectId)
        .order("sort_order")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!subjectId,
  });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["hub-materials", subjectId] });
    qc.invalidateQueries({ queryKey: ["adm-materials", subjectId] });
    qc.invalidateQueries({ queryKey: ["materials", subjectId] });
  }, [qc, subjectId]);

  const deleteMaterial = useCallback(async (mat: any) => {
    if (!confirm(`Delete "${mat.title}"?`)) return;
    if (mat.file_url && !mat.file_url.startsWith("http") && mat.file_url !== "placeholder")
      await supabase.storage.from("subject-files").remove([mat.file_url]);
    const { error } = await supabase.from("subject_materials").delete().eq("id", mat.id);
    if (error) { toast({ title: "Error", description: error.message, variant:"destructive" }); return; }
    toast({ title: "🗑 Material deleted" });
    invalidate();
  }, [invalidate]);

  const filtered = useMemo(() => {
    return materials.filter((m: any) => {
      const matchType  = typeFilter === "All" || m.material_type === typeFilter;
      const matchSearch = !search || m.title.toLowerCase().includes(search.toLowerCase());
      return matchType && matchSearch;
    });
  }, [materials, search, typeFilter]);

  // Count by type for filter badges
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    materials.forEach((m: any) => {
      counts[m.material_type] = (counts[m.material_type] ?? 0) + 1;
    });
    return counts;
  }, [materials]);

  return (
    <>
      <style>{`
        @keyframes hub-slidein{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes hub-pop{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
        @keyframes hub-spin{to{transform:rotate(360deg)}}
        @keyframes hub-pulse{0%,100%{opacity:1}50%{opacity:.45}}
        .hub-type-btn:hover:not(:disabled){transform:translateY(-2px)!important;box-shadow:0 4px 12px rgba(0,0,0,.08)!important;}
        .hub-upload-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 10px 32px rgba(6,78,59,.42)!important;}
        .mat-card{transition:transform .18s ease,box-shadow .18s ease;}
        .mat-card:hover{transform:translateY(-3px);box-shadow:0 8px 28px rgba(0,0,0,.09);}
        .hub-filter-btn:hover{background:#F3F4F6!important;}
      `}</style>

      <div style={{ fontFamily:"system-ui,sans-serif" }}>

        {/* ═══ HEADER ═══════════════════════════════════════════════════════ */}
        <div style={{ background:`linear-gradient(135deg,${G} 0%,${G2} 100%)`,
          borderRadius:20, padding:"22px 24px", marginBottom:20,
          display:"flex", alignItems:"center", justifyContent:"space-between",
          flexWrap:"wrap", gap:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:48, height:48, borderRadius:15,
              background:"rgba(255,255,255,.15)",
              display:"flex", alignItems:"center", justifyContent:"center" }}>
              <Folder size={24} color="#fff" />
            </div>
            <div>
              <h2 style={{ color:"#fff", fontWeight:900, fontSize:18, margin:0 }}>
                Materials Library
              </h2>
              <p style={{ color:"rgba(255,255,255,.65)", fontSize:12, margin:"3px 0 0" }}>
                {subjectTitle ? `${subjectTitle} · ` : ""}{materials.length} resource{materials.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => setShowUpload(v => !v)}
              style={{ display:"flex", alignItems:"center", gap:7, padding:"9px 16px",
                borderRadius:11, border:"1.5px solid rgba(255,255,255,.3)",
                background:"rgba(255,255,255,.15)", color:"#fff", fontWeight:700,
                fontSize:13, cursor:"pointer", backdropFilter:"blur(4px)" }}>
              <ArrowUpFromLine size={14}/>
              {showUpload ? "Hide Upload" : "Upload New"}
            </button>
          </div>
        </div>

        {/* ═══ STATS ROW ════════════════════════════════════════════════════ */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",
          gap:10, marginBottom:20 }}>
          {(["PDF","Video","Audio","Image","Document","Link","Text"] as MatType[])
            .filter(t => (typeCounts[t] ?? 0) > 0)
            .map(t => {
              const c = TYPE_CFG[t], Ic = c.icon;
              return (
                <div key={t} style={{ background:c.bg, borderRadius:13,
                  border:`1.5px solid ${c.border}`, padding:"12px 14px",
                  cursor:"pointer", transition:"all .15s",
                  boxShadow:typeFilter===t?`0 0 0 2px ${c.text}`:"none" }}
                  onClick={() => setTypeFilter(typeFilter === t ? "All" : t)}>
                  <Ic size={18} color={c.text} style={{ marginBottom:6 }} />
                  <p style={{ fontSize:20, fontWeight:900, color:c.text, margin:0 }}>
                    {typeCounts[t]}
                  </p>
                  <p style={{ fontSize:10, color:c.text, opacity:.75, margin:0, fontWeight:700 }}>
                    {c.label}
                  </p>
                </div>
              );
            })}
        </div>

        {/* ═══ MAIN LAYOUT ═════════════════════════════════════════════════ */}
        <div style={{ display:"grid",
          gridTemplateColumns:showUpload ? "1fr 1fr" : "1fr",
          gap:20, alignItems:"start" }}>

          {/* ── UPLOAD PANEL ── */}
          {showUpload && (
            <div style={{ background:"#fff", borderRadius:20, padding:24,
              border:"1.5px solid #E5E7EB",
              boxShadow:"0 4px 24px rgba(0,0,0,.06)",
              animation:"hub-slidein .25s ease" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
                <div style={{ width:36, height:36, borderRadius:10,
                  background:G3, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <Upload size={18} color={G} />
                </div>
                <div>
                  <h3 style={{ fontWeight:800, fontSize:15, color:"#111", margin:0 }}>
                    Upload Material
                  </h3>
                  <p style={{ fontSize:11, color:"#9CA3AF", margin:0 }}>
                    Files, links or text content
                  </p>
                </div>
              </div>
              <UploadZone
                subjectId={subjectId}
                totalMaterials={materials.length}
                onUploaded={invalidate}
              />
            </div>
          )}

          {/* ── LIBRARY PANEL ── */}
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

            {/* Search + filter bar */}
            <div style={{ background:"#fff", borderRadius:16, padding:"12px 14px",
              border:"1.5px solid #E5E7EB",
              boxShadow:"0 2px 10px rgba(0,0,0,.04)",
              display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
              <div style={{ position:"relative", flex:1, minWidth:160 }}>
                <Search size={13} style={{ position:"absolute", left:10, top:"50%",
                  transform:"translateY(-50%)", color:"#9CA3AF" }} />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search materials…"
                  style={{ width:"100%", padding:"9px 12px 9px 30px", borderRadius:10,
                    border:"1.5px solid #E5E7EB", fontSize:13, outline:"none",
                    boxSizing:"border-box" as const }} />
              </div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                <button className="hub-filter-btn"
                  onClick={() => setTypeFilter("All")}
                  style={{ padding:"7px 12px", borderRadius:20,
                    border:`1.5px solid ${typeFilter==="All"?G:"#E5E7EB"}`,
                    background:typeFilter==="All"?G3:"#fff",
                    color:typeFilter==="All"?G:"#6B7280",
                    fontSize:11, fontWeight:700, cursor:"pointer" }}>
                  All ({materials.length})
                </button>
                {(Object.keys(typeCounts) as MatType[]).map(t => (
                  <button key={t} className="hub-filter-btn"
                    onClick={() => setTypeFilter(typeFilter === t ? "All" : t)}
                    style={{ padding:"7px 12px", borderRadius:20,
                      border:`1.5px solid ${typeFilter===t?TYPE_CFG[t].text:TYPE_CFG[t].border}`,
                      background:typeFilter===t?TYPE_CFG[t].bg:"#fff",
                      color:typeFilter===t?TYPE_CFG[t].text:"#6B7280",
                      fontSize:11, fontWeight:700, cursor:"pointer" }}>
                    {t} ({typeCounts[t]})
                  </button>
                ))}
              </div>
            </div>

            {/* Grid */}
            {isLoading ? (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                {[1,2,3,4].map(i => (
                  <div key={i} style={{ height:120, borderRadius:16, background:"#F3F4F6",
                    animation:"hub-pulse 1.4s infinite", animationDelay:`${i*120}ms` }} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ background:"#fff", borderRadius:20,
                border:"2px dashed #E5E7EB", padding:"48px 24px", textAlign:"center" }}>
                <div style={{ width:64, height:64, borderRadius:20, margin:"0 auto 16px",
                  background:G3, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <Folder size={28} color={G} />
                </div>
                <p style={{ fontWeight:800, color:"#374151", margin:"0 0 6px", fontSize:15 }}>
                  {search || typeFilter !== "All" ? "No matches found" : "No materials yet"}
                </p>
                <p style={{ fontSize:13, color:"#9CA3AF", margin:0 }}>
                  {search || typeFilter !== "All"
                    ? "Try adjusting your search or filter"
                    : "Upload your first file using the panel on the left"}
                </p>
              </div>
            ) : (
              <div style={{ display:"grid",
                gridTemplateColumns:showUpload ? "1fr" : "repeat(auto-fill,minmax(260px,1fr))",
                gap:12 }}>
                {filtered.map((mat: any, i: number) => (
                  <MaterialCard key={mat.id} mat={mat} index={i}
                    onEdit={setEditMat} onDelete={deleteMaterial} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Edit modal ── */}
        {editMat && (
          <EditModal mat={editMat} onClose={() => setEditMat(null)}
            onSaved={() => { setEditMat(null); invalidate(); }} />
        )}
      </div>
    </>
  );
}
