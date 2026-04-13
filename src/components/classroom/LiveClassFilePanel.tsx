/**
 * LiveClassFilePanel.tsx — Tahleem Academy
 * Fresh build. Zero code from any existing file.
 *
 * Root cause of "goes back on upload" on Android/mobile:
 * Any programmatic input.click() or label-for trick causes Android to push
 * a history entry. When the picker closes React Router sees popstate and
 * navigates back. The only 100% reliable fix: make the <input type="file">
 * the PHYSICAL click target by absolutely positioning it over the drop zone
 * at full opacity:0. The browser opens it as a direct user gesture — no
 * history entry is pushed, no popstate fires.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import { useAuth } from "@/contexts/AuthContext";

/* ── palette ── */
const G    = "#1B4332";
const GOLD = "#C8922A";
const GOLDB= "#FFF8EC";
const BG   = "#F7F4EF";
const SURF = "#FFFFFF";
const BORD = "#DDD8CF";
const MUT  = "#6B7B6E";
const RED  = "#B91C1C";
const REDL = "#FEF2F2";

const BUCKET = "liveclass-files";
const SB_URL = import.meta.env.VITE_STORAGE_SUPABASE_URL || "https://ovgsleayannsxifhiraw.supabase.co";

/* ── types ── */
interface LCFile {
  id:         string;
  subject_id: string;
  file_name:  string;
  file_url:   string;
  file_type:  string | null;
  file_size:  number | null;
  created_at: string | null;
}

/* ── helpers ── */
type Kind = "PDF"|"Image"|"Video"|"Audio"|"Doc"|"File";

function getKind(name: string, mime?: string|null): Kind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const m   = (mime ?? "").toLowerCase();
  if (m.includes("pdf")   || ext === "pdf")                                                 return "PDF";
  if (m.includes("image") || ["jpg","jpeg","png","gif","webp","svg","avif"].includes(ext))  return "Image";
  if (m.includes("video") || ["mp4","webm","mov","mkv","avi"].includes(ext))                return "Video";
  if (m.includes("audio") || ["mp3","wav","m4a","aac","ogg"].includes(ext))                 return "Audio";
  if (["doc","docx","xls","xlsx","ppt","pptx","txt","csv"].includes(ext))                   return "Doc";
  return "File";
}

const ICONS: Record<Kind, {i:string; c:string; bg:string}> = {
  PDF:   { i:"📄", c:"#B91C1C", bg:"#FEF2F2" },
  Image: { i:"🖼️", c:"#1D4ED8", bg:"#EFF6FF" },
  Video: { i:"🎬", c:"#6D28D9", bg:"#F5F3FF" },
  Audio: { i:"🎵", c:"#0E7490", bg:"#ECFEFF" },
  Doc:   { i:"📝", c:"#B45309", bg:"#FFFBEB" },
  File:  { i:"📁", c:"#374151", bg:"#F9FAFB" },
};

function fmtBytes(n?: number|null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n/1024).toFixed(0)} KB`;
  return `${(n/1_048_576).toFixed(1)} MB`;
}

function fmtDate(iso?: string|null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
}

/* ══════════════════════════════════════════════════════════ */
export default function LiveClassFilePanel({ subjectId }: { subjectId: string }) {
  const { user } = useAuth();

  const [files,      setFiles]      = useState<LCFile[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [err,        setErr]        = useState<string|null>(null);
  const [dragging,   setDragging]   = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [pct,        setPct]        = useState(0);
  const [upName,     setUpName]     = useState("");
  const [lightbox,   setLightbox]   = useState<LCFile|null>(null);
  const [delId,      setDelId]      = useState<string|null>(null);

  /* drag counter — more reliable than enter/leave events */
  const dragCnt = useRef(0);

  /* ── fetch ── */
  const fetchFiles = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("liveclass_files")
      .select("*")
      .eq("subject_id", subjectId)
      .order("created_at", { ascending: false });
    if (error) setErr(error.message);
    else setFiles(data ?? []);
    setLoading(false);
  }, [subjectId]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  /* ── upload ── */
  const upload = useCallback(async (file: File) => {
    if (!user) { setErr("Not signed in"); return; }
    setUploading(true); setPct(0); setUpName(file.name); setErr(null);

    try {
      const slug = `${Date.now()}-${Math.random().toString(36).slice(2,7)}.${file.name.split(".").pop()||"bin"}`;
      const path = `${subjectId}/${slug}`;

      /* XHR for real progress */
      await new Promise<void>((res, rej) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${SB_URL}/storage/v1/object/${BUCKET}/${path}`);

        /* auth header */
        const raw = (supabase as any);
        const token = raw?.auth?._session?.access_token
          ?? raw?.supabaseKey
          ?? "";
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("x-upsert", "true");
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

        xhr.upload.onprogress = ev => {
          if (ev.lengthComputable) setPct(Math.round(ev.loaded / ev.total * 85));
        };
        xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300) ? res() : rej(new Error(`Storage error ${xhr.status}`));
        xhr.onerror = () => rej(new Error("Network error"));
        xhr.send(file);
      });

      setPct(90);

      /* DB record */
      const fileUrl = `${SB_URL}/storage/v1/object/public/${BUCKET}/${path}`;
      const { error: dbErr } = await (supabase as any)
        .from("liveclass_files")
        .insert({ subject_id: subjectId, file_name: file.name, file_url: fileUrl, file_type: file.type || null, file_size: file.size, uploaded_by: user.id });

      if (dbErr) throw dbErr;

      setPct(100);
      await fetchFiles();
      setTimeout(() => { setUploading(false); setPct(0); setUpName(""); }, 500);
    } catch (e: any) {
      /* supabase-js fallback */
      try {
        const slug2 = `${Date.now()}.${file.name.split(".").pop()||"bin"}`;
        const path2 = `${subjectId}/${slug2}`;
        const { error: stErr } = await storageSupabase.storage.from(BUCKET).upload(path2, file, { upsert: true });
        if (stErr) throw stErr;
        const url2 = `${SB_URL}/storage/v1/object/public/${BUCKET}/${path2}`;
        await (supabase as any).from("liveclass_files").insert({ subject_id: subjectId, file_name: file.name, file_url: url2, file_type: file.type || null, file_size: file.size, uploaded_by: user.id });
        setPct(100);
        await fetchFiles();
        setTimeout(() => { setUploading(false); setPct(0); setUpName(""); }, 500);
      } catch (e2: any) {
        setErr(e2?.message ?? "Upload failed");
        setUploading(false); setPct(0); setUpName("");
      }
    }
  }, [subjectId, user, fetchFiles]);

  /* ── drag ── */
  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragCnt.current++; setDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); dragCnt.current--; if (dragCnt.current <= 0) { dragCnt.current = 0; setDragging(false); } };
  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); };
  const onDrop      = (e: React.DragEvent) => {
    e.preventDefault(); dragCnt.current = 0; setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f && !uploading) upload(f);
  };

  /* ── file input change ── */
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f && !uploading) upload(f);
  };

  /* ── delete ── */
  const deleteFile = async (f: LCFile) => {
    if (!confirm(`Delete "${f.file_name}"?`)) return;
    setDelId(f.id);
    await (supabase as any).from("liveclass_files").delete().eq("id", f.id);
    if (f.file_url.includes(`/${BUCKET}/`)) {
      const p = f.file_url.split(`/${BUCKET}/`)[1];
      if (p) storageSupabase.storage.from(BUCKET).remove([p]);
    }
    setFiles(prev => prev.filter(x => x.id !== f.id));
    setDelId(null);
  };

  /* ── open ── */
  const openFile = (f: LCFile) => {
    if (getKind(f.file_name, f.file_type) === "Image") { setLightbox(f); return; }
    window.open(f.file_url, "_blank", "noopener,noreferrer");
  };

  /* ═══════════════════ RENDER ═══════════════════ */
  return (
    <div style={{ fontFamily:"system-ui,sans-serif" }}>
      <style>{`
        @keyframes lcfp-spin { to { transform:rotate(360deg); } }
        .lcfp-file-row { display:flex; align-items:center; gap:12px; padding:12px 16px; border-bottom:1px solid ${BORD}; transition:background .12s; cursor:pointer; }
        .lcfp-file-row:last-child { border-bottom:none; }
        .lcfp-file-row:hover { background:${BG}; }
        .lcfp-del-btn { opacity:0; border:none; background:none; cursor:pointer; padding:5px; border-radius:6px; color:${RED}; flex-shrink:0; font-size:16px; }
        .lcfp-file-row:hover .lcfp-del-btn { opacity:1; }
      `}</style>

      {/* ════ DROP ZONE ════
          The <input type="file"> is absolutely positioned to COVER the entire
          zone at opacity:0 so it IS the click target — no .click() call, no
          label, no history push, no popstate, no navigation bug.
      */}
      <div
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        style={{
          position: "relative",
          border: `2px dashed ${dragging ? GOLD : BORD}`,
          borderRadius: 16,
          background: dragging ? GOLDB : BG,
          padding: "28px 20px",
          textAlign: "center",
          transition: "all .18s",
          marginBottom: 16,
          userSelect: "none",
          overflow: "hidden",
        }}
      >
        {/* Visual content */}
        {uploading ? (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10, pointerEvents:"none" }}>
            <div style={{ fontSize:28 }}>⏫</div>
            <p style={{ margin:0, fontSize:13, fontWeight:700, color:G }}>Uploading {upName}</p>
            <div style={{ width:"100%", maxWidth:260, height:6, borderRadius:99, background:BORD, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${pct}%`, background:GOLD, borderRadius:99, transition:"width .25s" }}/>
            </div>
            <p style={{ margin:0, fontSize:11, color:MUT }}>{pct}%</p>
          </div>
        ) : (
          <div style={{ pointerEvents:"none" }}>
            <div style={{ fontSize:36, marginBottom:8 }}>📂</div>
            <p style={{ margin:"0 0 4px", fontSize:14, fontWeight:700, color:G }}>
              Tap to choose a file, or drag and drop
            </p>
            <p style={{ margin:0, fontSize:12, color:MUT }}>
              Images · PDFs · Videos · Documents — any format
            </p>
          </div>
        )}

        {/* The actual <input> — covers the entire zone, transparent.
            Direct user gesture = no Android history push = no navigation. */}
        {!uploading && (
          <input
            type="file"
            accept="*/*"
            onChange={onPick}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              opacity: 0,
              cursor: "pointer",
              margin: 0,
              padding: 0,
            }}
          />
        )}
      </div>

      {/* Error */}
      {err && (
        <div style={{ display:"flex", alignItems:"center", gap:8, background:REDL, border:`1px solid ${RED}30`, borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:13, color:RED }}>
          ⚠️ {err}
          <button onClick={() => setErr(null)} style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", color:RED, fontSize:16 }}>✕</button>
        </div>
      )}

      {/* File list */}
      {loading ? (
        <div style={{ display:"flex", justifyContent:"center", padding:48 }}>
          <div style={{ width:26, height:26, borderRadius:"50%", border:`3px solid ${G}`, borderTopColor:"transparent", animation:"lcfp-spin .7s linear infinite" }}/>
        </div>
      ) : files.length === 0 ? (
        <div style={{ background:SURF, border:`1px solid ${BORD}`, borderRadius:14, padding:"36px 20px", textAlign:"center" }}>
          <div style={{ fontSize:34, marginBottom:8 }}>📭</div>
          <p style={{ margin:0, fontSize:14, fontWeight:600, color:MUT }}>No files yet</p>
          <p style={{ margin:"4px 0 0", fontSize:12, color:MUT }}>Upload one above to get started</p>
        </div>
      ) : (
        <div style={{ background:SURF, border:`1px solid ${BORD}`, borderRadius:14, overflow:"hidden" }}>
          <div style={{ padding:"12px 16px", borderBottom:`1px solid ${BORD}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span style={{ fontSize:13, fontWeight:700, color:G }}>
              Class Files <span style={{ color:MUT, fontWeight:400 }}>({files.length})</span>
            </span>
            <button onClick={fetchFiles} style={{ fontSize:12, color:MUT, background:"none", border:"none", cursor:"pointer" }}>
              ↺ Refresh
            </button>
          </div>

          {files.map(f => {
            const k   = getKind(f.file_name, f.file_type);
            const cfg = ICONS[k];
            return (
              <div key={f.id} className="lcfp-file-row" onClick={() => delId !== f.id && openFile(f)}>
                <div style={{ width:42, height:42, borderRadius:10, background:cfg.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
                  {cfg.i}
                </div>

                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ margin:0, fontSize:13, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {f.file_name}
                  </p>
                  <p style={{ margin:"2px 0 0", fontSize:11, color:MUT }}>
                    {k}{f.file_size ? ` · ${fmtBytes(f.file_size)}` : ""}{f.created_at ? ` · ${fmtDate(f.created_at)}` : ""}
                  </p>
                </div>

                <span style={{ flexShrink:0, fontSize:11, fontWeight:700, color:cfg.c, background:cfg.bg, padding:"3px 9px", borderRadius:20 }}>
                  {k === "Image" ? "Preview" : "Open"}
                </span>

                <button
                  className="lcfp-del-btn"
                  disabled={delId === f.id}
                  onClick={e => { e.stopPropagation(); deleteFile(f); }}
                  title="Delete"
                >
                  {delId === f.id
                    ? <div style={{ width:14, height:14, borderRadius:"50%", border:`2px solid ${RED}`, borderTopColor:"transparent", animation:"lcfp-spin .6s linear infinite" }}/>
                    : "🗑️"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.85)", zIndex:9999, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}
        >
          <div onClick={e => e.stopPropagation()} style={{ width:"94%", maxWidth:700, background:"#111", borderRadius:16, overflow:"hidden" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"#1a1a1a" }}>
              <span style={{ fontSize:13, color:"#fff", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>
                {lightbox.file_name}
              </span>
              <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                <a href={lightbox.file_url} download={lightbox.file_name} target="_blank" rel="noopener"
                  style={{ fontSize:12, color:"#fff", background:"rgba(255,255,255,.15)", borderRadius:8, padding:"5px 12px", textDecoration:"none", fontWeight:600 }}>
                  ⬇ Download
                </a>
                <button onClick={() => setLightbox(null)} style={{ background:"rgba(255,255,255,.15)", border:"none", color:"#fff", borderRadius:8, padding:"5px 12px", cursor:"pointer", fontWeight:700 }}>
                  ✕
                </button>
              </div>
            </div>
            <div style={{ background:"#000", maxHeight:"78vh", display:"flex", alignItems:"center", justifyContent:"center", minHeight:160 }}>
              <img src={lightbox.file_url} alt={lightbox.file_name}
                style={{ maxWidth:"100%", maxHeight:"78vh", objectFit:"contain", display:"block" }}
                onError={e => { (e.target as HTMLImageElement).alt = "Could not load image"; }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

