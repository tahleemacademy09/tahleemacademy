/**
 * SubjectMaterialsHub.tsx — FIXED VERSION
 * 
 * 🔧 CRITICAL FIX: Added e.stopPropagation() to ALL click handlers
 * to prevent event bubbling that caused unwanted navigation to /courses
 * 
 * Root Cause: Click events from upload zone were bubbling to parent 
 * components with navigation handlers (e.g., onClick={() => navigate("/courses")})
 */
import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

// ─── Supabase constants ───────────────────────────────────────────────────────
const SB_URL = "https://wvqeubhupkddtkcdwqcm.supabase.co";
const BUCKET = "subject-files";

// ─── Brand palette ────────────────────────────────────────────────────────────
const C = {
  green:  "#064E3B",
  green2: "#065F46",
  greenL: "#ECFDF5",
  greenM: "#D1FAE5",
  gold:   "#B8860B",
  red:    "#DC2626",
  redL:   "#FEF2F2",
  redB:   "#FECACA",
  gray:   "#6B7280",
  grayL:  "#F9FAFB",
  border: "#E5E7EB",
  text:   "#111827",
  muted:  "#9CA3AF",
};

// ─── Material type config ─────────────────────────────────────────────────────
type MatType = "PDF"|"Video"|"Audio"|"Image"|"Document"|"Link"|"Text";

const TYPES: Record<MatType,{
  color:string; light:string; border:string; emoji:string;
}> = {
  PDF:      { color:"#DC2626", light:"#FEF2F2", border:"#FCA5A5", emoji:"📄" },
  Video:    { color:"#7C3AED", light:"#F5F3FF", border:"#C4B5FD", emoji:"🎬" },
  Audio:    { color:"#0D9488", light:"#F0FDFA", border:"#99F6E4", emoji:"🎵" },
  Image:    { color:"#2563EB", light:"#EFF6FF", border:"#BFDBFE", emoji:"🖼️" },
  Document: { color:"#D97706", light:"#FFFBEB", border:"#FDE68A", emoji:"📝" },
  Link:     { color:"#6B7280", light:"#F9FAFB", border:"#D1D5DB", emoji:"🔗" },
  Text:     { color:"#374151", light:"#F9FAFB", border:"#D1D5DB", emoji:"✏️" },
};
const ALL_TYPES = Object.keys(TYPES) as MatType[];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function autoDetect(file: File): MatType {
  const t = file.type.toLowerCase();
  const e = (file.name.split(".").pop() ?? "").toLowerCase();
  if (t.includes("pdf") || e === "pdf") return "PDF";
  if (t.includes("video") || ["mp4","webm","mov","avi","m4v","mkv"].includes(e)) return "Video";
  if (t.includes("audio") || ["mp3","wav","m4a","aac","ogg","flac","opus"].includes(e)) return "Audio";
  if (t.includes("image") || ["jpg","jpeg","png","gif","webp","svg","avif","heic"].includes(e)) return "Image";
  if (["doc","docx","xls","xlsx","ppt","pptx","odt","ods"].includes(e)) return "Document";
  return "PDF";
}

function fmtBytes(b?: number|null) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1_048_576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1_048_576).toFixed(1)} MB`;
}

function ago(iso?: string|null) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ─── XHR upload for real byte-level progress ──────────────────────────────────
function xhrUpload(path: string, file: File, anonKey: string,
  onPct: (n: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SB_URL}/storage/v1/object/${BUCKET}/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${anonKey}`);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = ev => {
      if (ev.lengthComputable) onPct(Math.round(ev.loaded / ev.total * 88));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onPct(93); resolve(); }
      else {
        try { const j = JSON.parse(xhr.responseText); reject(new Error(j.error ?? j.message ?? "Upload failed")); }
        catch { reject(new Error(`HTTP ${xhr.status}`)); }
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));    xhr.onabort = () => reject(new Error("Aborted"));
    const fd = new FormData();
    fd.append("", file, file.name);
    xhr.send(fd);
  });
}

// shared styles
const labelSt: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 800,
  color: "#374151", textTransform: "uppercase",
  letterSpacing: ".07em", marginBottom: 8,
};
const inputSt: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", fontFamily: "inherit",
  padding: "11px 14px", fontSize: 14, outline: "none",
  border: `1.5px solid ${C.border}`, borderRadius: 10,
  background: "#fff", color: C.text,
};

// ═════════════════════════════════════════════════════════════════════════════
// UPLOAD PANEL — FIXED WITH stopPropagation() ON ALL CLICK HANDLERS
// ═════════════════════════════════════════════════════════════════════════════
function UploadPanel({ subjectId, count, onDone }: {
  subjectId: string; count: number; onDone: () => void;
}) {
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [type,  setType]  = useState<MatType>("PDF");
  const [url,   setUrl]   = useState("");
  const [body,  setBody]  = useState("");
  const [dl,    setDl]    = useState(true);
  const [file,  setFile]  = useState<File|null>(null);
  const [thumb, setThumb] = useState<string|null>(null);
  const [pct,   setPct]   = useState(0);
  const [phase, setPhase] = useState<"idle"|"up"|"db"|"ok"|"err">("idle");
  const [err,   setErr]   = useState("");
  const [drag,  setDrag]  = useState(false);

  const dragCnt = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const busy     = phase === "up" || phase === "db";
  const needFile = type !== "Link" && type !== "Text";
  const T        = TYPES[type];

  const pickFile = useCallback((f: File) => {
    setFile(f);
    const det = autoDetect(f);    setType(det);
    setTitle(prev => prev || f.name.replace(/\.[^/.]+$/, ""));
    setErr(""); setThumb(null);
    if (f.type.startsWith("image/")) {
      const r = new FileReader();
      r.onload = ev => setThumb(ev.target?.result as string);
      r.readAsDataURL(f);
    }
  }, []);

  const clearFile = () => {
    setFile(null); setThumb(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const reset = () => {
    setTitle(""); setType("PDF"); setUrl(""); setBody(""); setDl(true);
    clearFile(); setPct(0); setPhase("idle"); setErr("");
  };

  const onDE = (e: React.DragEvent) => { e.preventDefault(); dragCnt.current++; setDrag(true); };
  const onDL = (e: React.DragEvent) => {
    e.preventDefault(); dragCnt.current--;
    if (dragCnt.current <= 0) { dragCnt.current = 0; setDrag(false); }
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); dragCnt.current = 0; setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  };

  const submit = async () => {
    setErr("");
    if (!title.trim()) { setErr("Title is required"); return; }
    if (needFile && !file && !url.trim()) { setErr("Select a file or paste a URL"); return; }
    if (type === "Link" && !url.trim()) { setErr("Enter a URL"); return; }
    if (type === "Text" && !body.trim()) { setErr("Content cannot be empty"); return; }

    setPhase("up"); setPct(5);

    try {
      let fileUrl = url.trim(), fileType = "", fileSize = 0;

      if (needFile && file) {
        const ext  = (file.name.split(".").pop() ?? "bin");
        const path = `materials/${subjectId}/${crypto.randomUUID()}.${ext}`;
        const key  = (supabase as any).supabaseKey as string ?? "";

        try {
          await xhrUpload(path, file, key, setPct);        } catch {
          setPct(45);
          const { error } = await supabase.storage.from(BUCKET)
            .upload(path, file, { cacheControl: "3600", upsert: false });
          if (error) throw new Error(error.message);
          setPct(90);
        }

        fileUrl = path; fileType = file.type; fileSize = file.size;
      }

      setPct(96); setPhase("db");

      const row: Record<string, unknown> = {
        subject_id:      subjectId,
        title:           title.trim(),
        material_type:   type,
        file_url:        fileUrl || "text-content",
        content:         type === "Text" ? body.trim() : null,
        is_downloadable: dl,
        sort_order:      count,
        uploaded_by:     user!.id,
      };
      if (fileType) row.file_type = fileType;
      if (fileSize) row.file_size = fileSize;

      const { error: dbErr } = await supabase.from("subject_materials").insert(row as any);
      if (dbErr) throw new Error(dbErr.message);

      setPct(100); setPhase("ok");
      toast({ title: "✅ Material uploaded!" });
      setTimeout(() => { onDone(); reset(); }, 700);

    } catch (e: any) {
      setPhase("err"); setPct(0);
      setErr(e.message ?? "Upload failed");
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
  };

  const barColor = phase === "ok" ? "#16A34A" : phase === "db" ? C.gold : C.green;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>

      {err && (
        <div style={{
          display:"flex", gap:10, padding:"12px 14px",
          background:C.redL, border:`1.5px solid ${C.redB}`,
          borderRadius:11, alignItems:"flex-start",          animation:"smh-pop .2s ease",
        }}>
          <span style={{ fontSize:16, flexShrink:0 }}>⚠️</span>
          <p style={{ margin:0, fontSize:13, color:"#991B1B", flex:1, fontWeight:600, lineHeight:1.4 }}>{err}</p>
          <button onClick={(e) => { e.stopPropagation(); setErr(""); }} style={{ background:"none", border:"none", cursor:"pointer", color:C.muted, flexShrink:0, fontSize:14 }}>✕</button>
        </div>
      )}

      <div>
        <label style={labelSt}>Title <span style={{ color:C.red }}>*</span></label>
        <input
          value={title} disabled={busy} autoFocus
          onChange={e => setTitle(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          placeholder="e.g. Week 4 Tajweed Notes"
          style={{ ...inputSt, borderColor: !title && err ? C.redB : C.border }}
        />
      </div>

      <div>
        <label style={labelSt}>Type</label>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
          {ALL_TYPES.map(mt => {
            const tc = TYPES[mt], sel = type === mt;
            return (
              <button key={mt} type="button"
                onClick={(e) => { e?.stopPropagation(); if (!busy) setType(mt); }}
                style={{
                  display:"flex", flexDirection:"column", alignItems:"center", gap:7,
                  padding:"12px 4px", borderRadius:13,
                  border:`2px solid ${sel ? tc.color : "#E9E9E9"}`,
                  background: sel ? tc.light : "#FAFAFA",
                  cursor: busy ? "not-allowed" : "pointer",
                  transition:"all .14s", opacity: busy ? .5 : 1,
                  boxShadow: sel ? `0 0 0 3px ${tc.color}22` : "none",
                }}>
                <span style={{ fontSize:22, lineHeight:1 }}>{tc.emoji}</span>
                <span style={{
                  fontSize:11, fontWeight: sel ? 800 : 500,
                  color: sel ? tc.color : C.muted,
                }}>{mt}</span>
              </button>
            );
          })}
        </div>
      </div>

      {needFile && (
        <div>
          <label style={labelSt}>File</label>          
          {/* 🔧 FIX #1: Hidden file input with stopPropagation on click AND change */}
          <input ref={fileRef} type="file" accept="*/*" style={{ display:"none" }}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              const f = e.target.files?.[0];
              if (f) pickFile(f);
            }} />

          {file ? (
            <div style={{
              borderRadius:14, border:`2px solid ${T.border}`,
              background:T.light, overflow:"hidden",
              animation:"smh-pop .2s ease",
            }}>
              {thumb && (
                <img src={thumb} alt="" style={{
                  width:"100%", maxHeight:150, objectFit:"cover", display:"block",
                }} />
              )}
              <div style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px" }}>
                <div style={{
                  width:46, height:46, borderRadius:13, flexShrink:0, fontSize:24,
                  background:"#fff", border:`1.5px solid ${T.border}`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>{T.emoji}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{
                    fontWeight:700, fontSize:13, color:C.text,
                    margin:"0 0 5px", overflow:"hidden",
                    textOverflow:"ellipsis", whiteSpace:"nowrap",
                  }}>{file.name}</p>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <span style={{
                      fontSize:10, fontWeight:800, padding:"2px 8px",
                      borderRadius:20, background:`${T.color}18`, color:T.color,
                    }}>{type}</span>
                    <span style={{ fontSize:11, color:C.muted }}>{fmtBytes(file.size)}</span>
                  </div>
                </div>
                {!busy && (
                  <button onClick={(e) => { e.stopPropagation(); clearFile(); }} style={{
                    width:30, height:30, borderRadius:8, flexShrink:0,
                    border:`1.5px solid ${T.border}`, background:"#fff",
                    cursor:"pointer", fontSize:14,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    color:C.muted,
                  }}>✕</button>
                )}              </div>
            </div>
          ) : (
            /* 🔧 FIX #2: Drop zone with stopPropagation to prevent bubbling */
            <div
              onDragEnter={onDE} onDragLeave={onDL}
              onDragOver={e => e.preventDefault()} onDrop={onDrop}
              onClick={(e) => {
                e.stopPropagation();  // 🔥 CRITICAL: Stop event from reaching parent
                if (!busy) fileRef.current?.click();
              }}
              style={{
                padding:"36px 20px", borderRadius:18, textAlign:"center",
                cursor: busy ? "not-allowed" : "pointer",
                border:`2.5px dashed ${drag ? C.green : "#CFCFCF"}`,
                background: drag
                  ? `linear-gradient(135deg,${C.greenL},${C.greenM})`
                  : "#FAFAFA",
                transform: drag ? "scale(1.025)" : "scale(1)",
                boxShadow: drag ? `0 0 0 6px ${C.green}18` : "none",
                transition:"all .2s ease",
              }}>

              <div style={{
                width:68, height:68, borderRadius:20, fontSize:30,
                margin:"0 auto 18px", background: drag ? T.light : "#F0F0F0",
                border:`2px solid ${drag ? T.border : "#E0E0E0"}`,
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"all .2s",
              }}>{drag ? T.emoji : "📂"}</div>

              <p style={{
                fontWeight:900, fontSize:16, margin:"0 0 7px",
                color: drag ? C.green : C.text, transition:"color .2s",
              }}>
                {drag ? "Drop it! 🎯" : "Tap to browse or drag any file"}
              </p>
              <p style={{ fontSize:12, color:C.muted, margin:0, lineHeight:1.5 }}>
                PDF · Word · Video · Audio · Image · Excel · PowerPoint<br />
                <strong style={{ color:C.green }}>Any file type accepted</strong>
              </p>
            </div>
          )}

          <div style={{ display:"flex", alignItems:"center", gap:10, margin:"13px 0 9px" }}>
            <div style={{ flex:1, height:1, background:"#E5E7EB" }} />
            <span style={{ fontSize:11, color:C.muted, fontWeight:600, whiteSpace:"nowrap" }}>
              or paste a URL instead
            </span>
            <div style={{ flex:1, height:1, background:"#E5E7EB" }} />          </div>
          <input value={url} disabled={busy}
            onChange={e => setUrl(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="https://…"
            style={inputSt}
          />
        </div>
      )}

      {type === "Link" && (
        <div>
          <label style={labelSt}>URL <span style={{ color:C.red }}>*</span></label>
          <input value={url} disabled={busy}
            onChange={e => { setUrl(e.target.value); setErr(""); }}
            onClick={(e) => e.stopPropagation()}
            placeholder="https://…" style={inputSt} />
        </div>
      )}

      {type === "Text" && (
        <div>
          <label style={labelSt}>Content <span style={{ color:C.red }}>*</span></label>
          <textarea value={body} disabled={busy} rows={6}
            onChange={e => { setBody(e.target.value); setErr(""); }}
            onClick={(e) => e.stopPropagation()}
            placeholder="Write your text content here…"
            style={{ ...inputSt, resize:"vertical" }} />
        </div>
      )}

      {phase !== "idle" && phase !== "err" && (
        <div style={{
          padding:"14px 16px", borderRadius:13,
          background:"#F0FDF4", border:"1.5px solid #BBF7D0",
          animation:"smh-fadein .2s ease",
        }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:9 }}>
            <span style={{ fontSize:13, fontWeight:700, color:"#166534" }}>
              {phase === "up" ? "Uploading file…" : phase === "db" ? "Saving to database…" : "Upload complete ✓"}
            </span>
            <span style={{ fontSize:13, fontWeight:900, color:barColor }}>{pct}%</span>
          </div>
          <div style={{ height:10, background:"#D1FAE5", borderRadius:99, overflow:"hidden" }}>
            <div style={{
              height:"100%", borderRadius:99, width:`${pct}%`,
              background:`linear-gradient(90deg,${barColor},${barColor}99)`,
              transition:"width .35s ease",
            }} />
          </div>          {phase === "up" && file && (
            <p style={{ fontSize:11, color:C.muted, margin:"6px 0 0" }}>
              {fmtBytes(Math.round(pct / 100 * file.size))} / {fmtBytes(file.size)}
            </p>
          )}
        </div>
      )}

      <div onClick={(e) => { e.stopPropagation(); if (!busy) setDl(v => !v); }} style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"13px 16px", borderRadius:13, cursor: busy ? "not-allowed" : "pointer",
        background: dl ? C.greenL : C.grayL,
        border:`1.5px solid ${dl ? "#86EFAC" : C.border}`,
        transition:"all .2s", opacity: busy ? .6 : 1,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{
            width:38, height:38, borderRadius:11, fontSize:20,
            background: dl ? C.greenM : "#E9E9E9",
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>{dl ? "⬇️" : "👁️"}</div>
          <div>
            <p style={{ fontWeight:700, fontSize:13, color:C.text, margin:0 }}>
              {dl ? "Download allowed" : "View only"}
            </p>
            <p style={{ fontSize:11, color:C.muted, margin:"2px 0 0" }}>
              {dl ? "Students can save this file" : "Students can only view it"}
            </p>
          </div>
        </div>
        <div style={{
          width:46, height:26, borderRadius:99, flexShrink:0,
          background: dl ? C.green : "#CBD5E1",
          position:"relative", transition:"background .2s",
        }}>
          <div style={{
            width:20, height:20, borderRadius:99, background:"#fff",
            position:"absolute", top:3, left: dl ? 23 : 3,
            transition:"left .2s", boxShadow:"0 1px 4px rgba(0,0,0,.25)",
          }} />
        </div>
      </div>

      {/* 🔧 FIX #3: Submit button with stopPropagation */}
      <button type="button" onClick={(e) => { e.stopPropagation(); submit(); }}
        disabled={busy || phase === "ok"}
        style={{
          width:"100%", padding:"16px", borderRadius:14, border:"none",
          background: busy || phase === "ok"
            ? "#E5E7EB"            : `linear-gradient(135deg,${C.green} 0%,${C.green2} 100%)`,
          color: busy || phase === "ok" ? C.muted : "#fff",
          fontWeight:900, fontSize:15, letterSpacing:".03em",
          cursor: busy || phase === "ok" ? "not-allowed" : "pointer",
          display:"flex", alignItems:"center", justifyContent:"center", gap:10,
          boxShadow: busy || phase === "ok" ? "none" : `0 6px 24px ${C.green}44`,
          transition:"all .2s",
        }}>
        <span style={{
          display:"inline-flex", fontSize:18,
          animation: busy ? "smh-spin .7s linear infinite" : "none",
        }}>
          {phase === "ok"  ? "✅" : phase === "err" ? "🔄" : busy ? "⟳" : "⬆"}
        </span>
        {phase === "up"  ? `Uploading ${pct}%…`
         : phase === "db" ? "Saving…"
         : phase === "ok" ? "Uploaded!"
         : phase === "err"? "Retry Upload"
         : "Upload Material"}
      </button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MATERIAL CARD — with propagation guards
// ═════════════════════════════════════════════════════════════════════════════
function MatCard({ mat, idx, onEdit, onDelete }: {
  mat:any; idx:number; onEdit:(m:any)=>void; onDelete:(m:any)=>void;
}) {
  const T = TYPES[(mat.material_type as MatType) ?? "PDF"];
  const [imgSrc, setImgSrc] = useState<string|null>(null);
  const [menu,   setMenu]   = useState(false);

  useEffect(() => {
    if (mat.material_type !== "Image" || !mat.file_url) return;
    if (mat.file_url.startsWith("http")) { setImgSrc(mat.file_url); return; }
    supabase.storage.from(BUCKET).createSignedUrl(mat.file_url, 3600)
      .then(({ data }) => { if (data?.signedUrl) setImgSrc(data.signedUrl); });
  }, [mat.file_url, mat.material_type]);

  const openFile = async () => {
    if (!mat.file_url) return;
    if (mat.file_url.startsWith("http")) { window.open(mat.file_url,"_blank"); return; }
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(mat.file_url, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const dlFile = async () => {
    let u = mat.file_url ?? "";    if (!u.startsWith("http")) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(u, 3600);
      u = data?.signedUrl ?? u;
    }
    const a = document.createElement("a"); a.href = u; a.download = mat.title; a.click();
  };

  return (
    <div className="smh-card" style={{
      background:"#fff", borderRadius:16,
      border:`1.5px solid ${T.border}`, overflow:"hidden",
      animation:`smh-slidein .3s ease both`,
      animationDelay:`${idx * 55}ms`,
      position:"relative",
    }}>
      <div style={{ height:3, background:T.color }} />

      {mat.material_type === "Image" && imgSrc && (
        <div style={{ height:110, overflow:"hidden", background:T.light }}>
          <img src={imgSrc} alt={mat.title}
            style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }}
            onError={() => setImgSrc(null)} />
        </div>
      )}

      <div style={{ padding:"14px 16px" }}>
        <div style={{ display:"flex", alignItems:"flex-start", gap:11, marginBottom:10 }}>
          <div style={{
            width:42, height:42, borderRadius:12, flexShrink:0, fontSize:22,
            background:T.light, border:`1.5px solid ${T.border}`,
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>{T.emoji}</div>

          <div style={{ flex:1, minWidth:0 }}>
            <p style={{
              fontWeight:700, fontSize:13, color:C.text, margin:"0 0 4px",
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
            }}>{mat.title}</p>
            <div style={{ display:"flex", flexWrap:"wrap", gap:5, alignItems:"center" }}>
              <span style={{
                fontSize:10, fontWeight:800, padding:"2px 7px",
                borderRadius:20, background:`${T.color}18`, color:T.color,
              }}>{mat.material_type}</span>
              {mat.file_size > 0 && (
                <span style={{ fontSize:10, color:C.muted }}>{fmtBytes(mat.file_size)}</span>
              )}
              <span style={{ fontSize:10, color:C.muted }}>{ago(mat.created_at)}</span>
            </div>
          </div>
          <div style={{ position:"relative", flexShrink:0 }}>
            {/* 🔧 Menu button with stopPropagation */}
            <button onClick={(e) => { e.stopPropagation(); setMenu(v => !v); }} style={{
              width:30, height:30, borderRadius:8,
              border:`1.5px solid ${C.border}`, background:"#fff",
              cursor:"pointer", fontSize:16, color:C.muted,
              display:"flex", alignItems:"center", justifyContent:"center",
            }}>⋮</button>

            {menu && (
              <div
                onMouseLeave={() => setMenu(false)}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position:"absolute", right:0, top:34, zIndex:50, minWidth:140,
                  background:"#fff", borderRadius:12,
                  border:`1.5px solid ${C.border}`,
                  boxShadow:"0 10px 32px rgba(0,0,0,.14)",
                  padding:6, animation:"smh-pop .15s ease",
                }}>
                {mat.file_url && !["text-content"].includes(mat.file_url) && (
                  <MItem emoji="👁" color={C.gray}
                    onClick={(e) => { e?.stopPropagation(); openFile(); setMenu(false); }}>View</MItem>
                )}
                {mat.is_downloadable && mat.file_url && !["text-content"].includes(mat.file_url) && (
                  <MItem emoji="⬇" color="#0D9488"
                    onClick={(e) => { e?.stopPropagation(); dlFile(); setMenu(false); }}>Download</MItem>
                )}
                <MItem emoji="✏️" color={C.green}
                  onClick={(e) => { e?.stopPropagation(); onEdit(mat); setMenu(false); }}>Edit</MItem>
                <div style={{ height:1, background:"#F3F4F6", margin:"4px 0" }} />
                <MItem emoji="🗑" color={C.red}
                  onClick={(e) => { e?.stopPropagation(); onDelete(mat); setMenu(false); }}>Delete</MItem>
              </div>
            )}
          </div>
        </div>

        {mat.content && (
          <p style={{
            fontSize:11, color:C.gray, margin:"0 0 8px", lineHeight:1.5,
            padding:"8px 10px", background:C.grayL,
            borderRadius:8, border:`1px solid ${C.border}`,
            display:"-webkit-box" as any,
            WebkitLineClamp:2, WebkitBoxOrient:"vertical" as any,
            overflow:"hidden",
          }}>{mat.content}</p>
        )}

        {mat.is_downloadable && (          <span style={{ fontSize:10, color:C.green, fontWeight:700 }}>⬇ Downloadable</span>
        )}
      </div>
    </div>
  );
}

function MItem({ emoji, color, onClick, children }: {
  emoji:string; color:string; onClick:(e?: React.MouseEvent)=>void; children:React.ReactNode;
}) {
  return (
    <button onClick={(e) => { e?.stopPropagation(); onClick(e); }} style={{
      display:"flex", alignItems:"center", gap:8, width:"100%",
      padding:"9px 10px", borderRadius:8, border:"none",
      background:"none", cursor:"pointer", fontSize:12,
      fontWeight:600, color, textAlign:"left",
    }}><span>{emoji}</span> {children}</button>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// EDIT MODAL — with propagation guards on overlay
// ═════════════════════════════════════════════════════════════════════════════
function EditModal({ mat, onClose, onSaved }: {
  mat:any; onClose:()=>void; onSaved:()=>void;
}) {
  const [title, setTitle] = useState(mat.title ?? "");
  const [dl,    setDl]    = useState(mat.is_downloadable ?? true);
  const [busy,  setBusy]  = useState(false);

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("subject_materials")
      .update({ title: title.trim(), is_downloadable: dl })
      .eq("id", mat.id);
    setBusy(false);
    if (error) { toast({ title:"Error", description:error.message, variant:"destructive" }); return; }
    toast({ title:"✅ Updated" }); onSaved();
  };

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:200, background:"rgba(0,0,0,.5)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:16,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* 🔧 Modal content with stopPropagation to prevent overlay click */}
      <div style={{
        background:"#fff", borderRadius:20, width:"100%", maxWidth:400, padding:24,
        boxShadow:"0 24px 80px rgba(0,0,0,.2)", animation:"smh-pop .2s ease",      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <h3 style={{ fontSize:16, fontWeight:800, color:C.text, margin:0 }}>Edit Material</h3>
          <button onClick={(e) => { e.stopPropagation(); onClose(); }}
            style={{ background:"none", border:"none", cursor:"pointer", color:C.muted, fontSize:18 }}>✕</button>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <label style={labelSt}>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} autoFocus style={{
              ...inputSt, borderRadius:10,
            }} onClick={(e) => e.stopPropagation()} />
          </div>
          <div onClick={(e) => { e.stopPropagation(); setDl(v => !v); }} style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"12px 14px", borderRadius:12, cursor:"pointer",
            background: dl ? C.greenL : C.grayL,
            border:`1.5px solid ${dl ? "#86EFAC" : C.border}`,
            transition:"all .2s",
          }}>
            <span style={{ fontSize:13, fontWeight:600, color:C.text }}>
              {dl ? "⬇ Download allowed" : "👁 View only"}
            </span>
            <div style={{
              width:42, height:24, borderRadius:99, background: dl ? C.green : "#CBD5E1",
              position:"relative", transition:"background .2s",
            }}>
              <div style={{
                width:18, height:18, borderRadius:99, background:"#fff",
                position:"absolute", top:3, left: dl ? 21 : 3,
                transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,.2)",
              }} />
            </div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); save(); }} disabled={busy || !title.trim()} style={{
            padding:"13px", borderRadius:12, border:"none",
            background: busy || !title.trim() ? "#E5E7EB"
              : `linear-gradient(135deg,${C.green},${C.green2})`,
            color: busy || !title.trim() ? C.muted : "#fff",
            fontWeight:800, fontSize:14,
            cursor: busy || !title.trim() ? "not-allowed" : "pointer",
            display:"flex", alignItems:"center", justifyContent:"center", gap:8,
          }}>{busy ? "Saving…" : "✓ Save Changes"}</button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════// MAIN EXPORT — with propagation guards on all containers
// ═════════════════════════════════════════════════════════════════════════════
export default function SubjectMaterialsHub({
  subjectId, subjectTitle,
}: { subjectId: string; subjectTitle?: string }) {

  const qc = useQueryClient();
  const [search,  setSearch]  = useState("");
  const [filter,  setFilter]  = useState<MatType|"All">("All");
  const [editMat, setEditMat] = useState<any>(null);
  const [showUp,  setShowUp]  = useState(true);

  const {  mats = [], isLoading } = useQuery({
    queryKey: ["smh", subjectId],
    enabled: !!subjectId,
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
  });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["smh", subjectId] });
    qc.invalidateQueries({ queryKey: ["adm-materials", subjectId] });
    qc.invalidateQueries({ queryKey: ["materials", subjectId] });
  }, [qc, subjectId]);

  const deleteMat = useCallback(async (mat: any) => {
    if (!confirm(`Delete "${mat.title}"?`)) return;
    const safeUrls = ["text-content","link","placeholder"];
    if (mat.file_url && !mat.file_url.startsWith("http") && !safeUrls.includes(mat.file_url))
      await supabase.storage.from(BUCKET).remove([mat.file_url]);
    await supabase.from("subject_materials").delete().eq("id", mat.id);
    toast({ title: "🗑 Deleted" });
    invalidate();
  }, [invalidate]);

  const filtered = useMemo(() =>
    mats.filter((m: any) =>
      (filter === "All" || m.material_type === filter) &&
      (!search || m.title.toLowerCase().includes(search.toLowerCase()))
    ),
  [mats, filter, search]);
  const counts = useMemo(() => {
    const c: Record<string,number> = {};
    mats.forEach((m: any) => { c[m.material_type] = (c[m.material_type] ?? 0) + 1; });
    return c;
  }, [mats]);

  return (
    <>
      <style>{`
        @keyframes smh-fadein{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes smh-pop{from{opacity:0;transform:scale(.93)}to{opacity:1;transform:scale(1)}}
        @keyframes smh-slidein{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        @keyframes smh-spin{to{transform:rotate(360deg)}}
        @keyframes smh-pulse{0%,100%{opacity:1}50%{opacity:.38}}
        .smh-card{transition:transform .18s ease,box-shadow .18s ease;}
        .smh-card:hover{transform:translateY(-3px);box-shadow:0 10px 30px rgba(0,0,0,.1)!important;}
      `}</style>

      {/* 🔧 Header container with stopPropagation */}
      <div style={{
        background:`linear-gradient(135deg,${C.green},${C.green2})`,
        borderRadius:20, padding:"20px 24px", marginBottom:20,
        display:"flex", alignItems:"center", justifyContent:"space-between",
        flexWrap:"wrap", gap:12,
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }} onClick={(e) => e.stopPropagation()}>
          <div style={{
            width:48, height:48, borderRadius:16, fontSize:26,
            background:"rgba(255,255,255,.15)",
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>📚</div>
          <div>
            <h2 style={{ color:"#fff", fontWeight:900, fontSize:18, margin:0 }}>
              Materials Library
            </h2>
            <p style={{ color:"rgba(255,255,255,.65)", fontSize:12, margin:"3px 0 0" }}>
              {subjectTitle ? `${subjectTitle} · ` : ""}
              {mats.length} resource{mats.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); setShowUp(v => !v); }} style={{
          padding:"9px 18px", borderRadius:11,
          border:"1.5px solid rgba(255,255,255,.3)",
          background:"rgba(255,255,255,.15)", backdropFilter:"blur(4px)",
          color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer",
          display:"flex", alignItems:"center", gap:8,
        }}>
          {showUp ? "📋 Library only" : "⬆ Upload New"}
        </button>      </div>

      {/* Type stats grid with propagation guard */}
      {Object.keys(counts).length > 0 && (
        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(auto-fill,minmax(96px,1fr))",
          gap:10, marginBottom:20,
        }} onClick={(e) => e.stopPropagation()}>
          {(Object.keys(counts) as MatType[]).map(t => {
            const tc = TYPES[t], active = filter === t;
            return (
              <div key={t} onClick={(e) => { e.stopPropagation(); setFilter(filter === t ? "All" : t); }} style={{
                background: active ? tc.light : "#fff",
                border:`1.5px solid ${active ? tc.color : tc.border}`,
                borderRadius:13, padding:"12px 14px", cursor:"pointer",
                boxShadow: active ? `0 0 0 3px ${tc.color}33` : "none",
                transition:"all .15s",
              }}>
                <div style={{ fontSize:20, marginBottom:5 }}>{tc.emoji}</div>
                <div style={{ fontSize:22, fontWeight:900, color:active?tc.color:C.text, lineHeight:1 }}>
                  {counts[t]}
                </div>
                <div style={{ fontSize:10, fontWeight:700, color:active?tc.color:C.muted, marginTop:3 }}>
                  {t}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Main grid layout with propagation guard */}
      <div style={{
        display:"grid",
        gridTemplateColumns: showUp ? "minmax(0,1fr) minmax(0,1fr)" : "1fr",
        gap:20, alignItems:"start",
      }} onClick={(e) => e.stopPropagation()}>

        {showUp && (
          <div style={{
            background:"#fff", borderRadius:20, padding:24,
            border:`1.5px solid ${C.border}`,
            boxShadow:"0 4px 24px rgba(0,0,0,.06)",
            animation:"smh-fadein .25s ease",
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{
              display:"flex", alignItems:"center", gap:10,
              marginBottom:22, paddingBottom:16,
              borderBottom:`1px solid ${C.border}`,            }} onClick={(e) => e.stopPropagation()}>
              <div style={{
                width:38, height:38, borderRadius:11, fontSize:20,
                background:C.greenL,
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>⬆</div>
              <div>
                <h3 style={{ fontWeight:800, fontSize:15, color:C.text, margin:0 }}>
                  Upload Material
                </h3>
                <p style={{ fontSize:11, color:C.muted, margin:0 }}>
                  Any file, link, or text content
                </p>
              </div>
            </div>
            <UploadPanel subjectId={subjectId} count={mats.length} onDone={invalidate} />
          </div>
        )}

        <div style={{ display:"flex", flexDirection:"column", gap:14 }} onClick={(e) => e.stopPropagation()}>

          {/* Search + filter bar */}
          <div style={{
            background:"#fff", borderRadius:14, padding:"13px 14px",
            border:`1.5px solid ${C.border}`,
            boxShadow:"0 2px 10px rgba(0,0,0,.04)",
            display:"flex", flexDirection:"column", gap:10,
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ position:"relative" }} onClick={(e) => e.stopPropagation()}>
              <span style={{
                position:"absolute", left:11, top:"50%",
                transform:"translateY(-50%)", fontSize:14, pointerEvents:"none",
              }}>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search materials…"
                style={{
                  ...inputSt, paddingLeft:34,
                  borderRadius:10,
                }} onClick={(e) => e.stopPropagation()} />
            </div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }} onClick={(e) => e.stopPropagation()}>
              <Chip active={filter==="All"} color={C.green}
                onClick={(e) => { e?.stopPropagation(); setFilter("All"); }}>
                All ({mats.length})
              </Chip>
              {(Object.keys(counts) as MatType[]).map(t => (
                <Chip key={t} active={filter===t} color={TYPES[t].color}
                  onClick={(e) => { e?.stopPropagation(); setFilter(filter===t ? "All" : t); }}>
                  {TYPES[t].emoji} {t} ({counts[t]})
                </Chip>              ))}
            </div>
          </div>

          {/* Cards grid */}
          {isLoading ? (
            <div style={{
              display:"grid",
              gridTemplateColumns: showUp ? "1fr" : "repeat(auto-fill,minmax(260px,1fr))",
              gap:12,
            }}>
              {[1,2,3].map(i => (
                <div key={i} style={{
                  height:110, borderRadius:16, background:"#F0F0F0",
                  animation:"smh-pulse 1.4s infinite",
                  animationDelay:`${i*110}ms`,
                }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{
              background:"#fff", borderRadius:20,
              border:`2px dashed ${C.border}`,
              padding:"52px 24px", textAlign:"center",
              animation:"smh-fadein .3s ease",
            }} onClick={(e) => e.stopPropagation()}>
              <div style={{
                width:68, height:68, borderRadius:20, fontSize:32,
                margin:"0 auto 18px", background:C.greenL,
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>📭</div>
              <p style={{ fontWeight:800, color:C.text, margin:"0 0 6px", fontSize:15 }}>
                {search || filter !== "All" ? "No matches found" : "No materials yet"}
              </p>
              <p style={{ fontSize:13, color:C.muted, margin:0 }}>
                {search || filter !== "All"
                  ? "Try adjusting your search or filter"
                  : "Upload your first material using the panel"}
              </p>
            </div>
          ) : (
            <div style={{
              display:"grid",
              gridTemplateColumns: showUp ? "1fr" : "repeat(auto-fill,minmax(260px,1fr))",
              gap:12,
            }}>
              {filtered.map((m: any, i: number) => (
                <MatCard key={m.id} mat={m} idx={i}
                  onEdit={setEditMat} onDelete={deleteMat} />
              ))}            </div>
          )}
        </div>
      </div>

      {editMat && (
        <EditModal mat={editMat}
          onClose={() => setEditMat(null)}
          onSaved={() => { setEditMat(null); invalidate(); }} />
      )}
    </>
  );
}

// Chip component with propagation guard
function Chip({ active, color, onClick, children }: {
  active:boolean; color:string; onClick:(e?: React.MouseEvent)=>void; children:React.ReactNode;
}) {
  return (
    <button onClick={(e) => { e?.stopPropagation(); onClick(e); }} style={{
      padding:"6px 12px", borderRadius:20,
      border:`1.5px solid ${active ? color : C.border}`,
      background: active ? `${color}18` : "#fff",
      color: active ? color : C.gray,
      fontSize:11, fontWeight:700, cursor:"pointer",
      transition:"all .15s",
    }}>{children}</button>
  );
}