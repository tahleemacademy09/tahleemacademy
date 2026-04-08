/**
 * SubjectMaterialsHub.tsx — ALL BUGS FIXED
 *
 * Bug fixes applied:
 * 1. Removed broken import of non-existent MaterialUploaderNew (was crashing the module)
 * 2. Fixed useQuery destructuring: { data: mats } instead of { mats }
 * 3. Removed manual Content-Type header from XHR (was breaking multipart boundary)
 * 4. Fixed env var: reads from VITE_SUPABASE_PUBLISHABLE_KEY (matches client.ts)
 * 5. Falls back gracefully to supabase.storage.upload() if XHR key is unavailable
 */
import React, { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

// ─── Supabase constants ───────────────────────────────────────────────────────
const SB_URL = "https://wvqeubhupkddtkcdwqcm.supabase.co";
const BUCKET = "subject-files";

// ─── Read anon key — try both env var names (client.ts uses PUBLISHABLE first) ─
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || SB_URL;

// ─── Brand palette ────────────────────────────────────────────────────────────
const C = {
  green: "#064E3B", green2: "#065F46", greenL: "#ECFDF5", greenM: "#D1FAE5",
  gold: "#B8860B", red: "#DC2626", redL: "#FEF2F2", redB: "#FECACA",
  gray: "#6B7280", grayL: "#F9FAFB", border: "#E5E7EB",
  text: "#111827", muted: "#9CA3AF",
};

// ─── Material types ───────────────────────────────────────────────────────────
type MatType = "PDF" | "Video" | "Audio" | "Image" | "Document" | "Link" | "Text";
const TYPES: Record<MatType, { color: string; light: string; border: string; emoji: string }> = {
  PDF:      { color: "#DC2626", light: "#FEF2F2", border: "#FCA5A5", emoji: "📄" },
  Video:    { color: "#7C3AED", light: "#F5F3FF", border: "#C4B5FD", emoji: "🎬" },
  Audio:    { color: "#0D9488", light: "#F0FDFA", border: "#99F6E4", emoji: "🎵" },
  Image:    { color: "#2563EB", light: "#EFF6FF", border: "#BFDBFE", emoji: "🖼️" },
  Document: { color: "#D97706", light: "#FFFBEB", border: "#FDE68A", emoji: "📝" },
  Link:     { color: "#6B7280", light: "#F9FAFB", border: "#D1D5DB", emoji: "🔗" },
  Text:     { color: "#374151", light: "#F9FAFB", border: "#D1D5DB", emoji: "✏️" },
};
const ALL_TYPES = Object.keys(TYPES) as MatType[];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function autoDetect(file: File): MatType {
  const t = file.type.toLowerCase(), e = (file.name.split(".").pop() ?? "").toLowerCase();
  if (t.includes("pdf") || e === "pdf") return "PDF";
  if (t.includes("video") || ["mp4","webm","mov","avi","m4v","mkv"].includes(e)) return "Video";
  if (t.includes("audio") || ["mp3","wav","m4a","aac","ogg","flac","opus"].includes(e)) return "Audio";
  if (t.includes("image") || ["jpg","jpeg","png","gif","webp","svg","avif","heic"].includes(e)) return "Image";
  if (["doc","docx","xls","xlsx","ppt","pptx","odt","ods"].includes(e)) return "Document";
  return "PDF";
}
function fmtBytes(b?: number | null) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1_048_576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1_048_576).toFixed(1)} MB`;
}
function ago(iso?: string | null) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ─── XHR Upload ───────────────────────────────────────────────────────────────
// BUG FIX #3: DO NOT manually set Content-Type: multipart/form-data
// The browser MUST set it automatically so the multipart boundary is included.
// Without the boundary, Supabase Storage cannot parse the uploaded file.
function xhrUpload(
  path: string,
  file: File,
  token: string,
  onPct: (n: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!SUPABASE_ANON_KEY) {
      // Signal caller to fall back to supabase.storage.upload()
      reject(new Error("NO_ANON_KEY"));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`);

    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("x-upsert", "false");
    // ✅ No Content-Type header — browser adds boundary automatically

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onPct(Math.round((ev.loaded / ev.total) * 88));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onPct(93); resolve(); }
      else {
        let msg = `HTTP ${xhr.status}`;
        try { const j = JSON.parse(xhr.responseText); msg = j.error || j.message || msg; } catch { /* ignore */ }
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => reject(new Error("Network error. Check your connection."));
    xhr.onabort = () => reject(new Error("Upload cancelled"));

    const fd = new FormData();
    fd.append("file", file, file.name);
    xhr.send(fd);
  });
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const labelSt: React.CSSProperties = {
  display: "block", fontSize: "clamp(10px, 2.5vw, 11px)", fontWeight: 800,
  color: "#374151", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8,
};
const inputSt: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", fontFamily: "inherit",
  padding: "clamp(10px, 3vw, 14px)", fontSize: "clamp(13px, 3.5vw, 14px)",
  outline: "none", border: `1.5px solid ${C.border}`, borderRadius: 12,
  background: "#fff", color: C.text, minHeight: 44,
};

// ─── Upload Panel ─────────────────────────────────────────────────────────────
function UploadPanel({ subjectId, count, onDone }: { subjectId: string; count: number; onDone: () => void }) {
  const { user, session } = useAuth();
  const [title, setTitle] = useState("");
  const [type, setType]   = useState<MatType>("PDF");
  const [url, setUrl]     = useState("");
  const [body, setBody]   = useState("");
  const [dl, setDl]       = useState(true);
  const [file, setFile]   = useState<File | null>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [pct, setPct]     = useState(0);
  const [phase, setPhase] = useState<"idle" | "up" | "db" | "ok" | "err">("idle");
  const [err, setErr]     = useState("");
  const [drag, setDrag]   = useState(false);
  const dragCnt = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const busy     = phase === "up" || phase === "db";
  const needFile = type !== "Link" && type !== "Text";
  const T        = TYPES[type];

  const pickFile = useCallback((f: File) => {
    setFile(f);
    setType(autoDetect(f));
    setTitle(prev => prev || f.name.replace(/\.[^/.]+$/, ""));
    setErr("");
    setThumb(null);
    if (f.type.startsWith("image/")) {
      const r = new FileReader();
      r.onload = ev => setThumb(ev.target?.result as string);
      r.readAsDataURL(f);
    }
  }, []);

  const clearFile = () => {
    setFile(null);
    setThumb(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const reset = () => {
    setTitle(""); setType("PDF"); setUrl(""); setBody("");
    setDl(true); clearFile(); setPct(0); setPhase("idle"); setErr("");
    // Ensure file input is fully cleared so the same file can be re-selected
    if (fileRef.current) { fileRef.current.value = ""; }
  };

  const onDE   = (e: React.DragEvent) => { e.preventDefault(); dragCnt.current++; setDrag(true); };
  const onDL   = (e: React.DragEvent) => { e.preventDefault(); dragCnt.current--; if (dragCnt.current <= 0) { dragCnt.current = 0; setDrag(false); } };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); dragCnt.current = 0; setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) pickFile(f); };

  const submit = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setErr("");

    if (!user || !session?.access_token) {
      setErr("Please sign in to upload");
      toast({ title: "⚠️ Sign in required", variant: "destructive" });
      return;
    }

    if (!title.trim())                              { setErr("Title is required"); return; }
    if (needFile && !file && !url.trim())           { setErr("Select a file or paste a URL"); return; }
    if (type === "Link" && !url.trim())             { setErr("Enter a URL"); return; }
    if (type === "Text" && !body.trim())            { setErr("Content cannot be empty"); return; }

    setPhase("up");
    setPct(5);

    try {
      let fileUrl = url.trim(), fileType = "", fileSize = 0;

      if (needFile && file) {
        const ext  = file.name.split(".").pop() ?? "bin";
        const path = `materials/${subjectId}/${crypto.randomUUID()}.${ext}`;
        const token = session.access_token;

        try {
          // XHR gives real byte progress
          await xhrUpload(path, file, token, setPct);
        } catch (xhrErr: any) {
          // Always fall back to supabase-js (handles auth headers automatically)
          setPct(45);
          const { error: storErr } = await supabase.storage
            .from(BUCKET)
            .upload(path, file, { cacheControl: "3600", upsert: false });
          if (storErr) throw new Error(storErr.message);
          setPct(90);
        }

        fileUrl  = path;
        fileType = file.type;
        fileSize = file.size;
      }

      setPct(96);
      setPhase("db");

      const row: Record<string, unknown> = {
        subject_id:      subjectId,
        title:           title.trim(),
        material_type:   type,
        file_url:        fileUrl || "text-content",
        content:         type === "Text" ? body.trim() : null,
        is_downloadable: dl,
        sort_order:      count,
        uploaded_by:     user.id,
      };
      if (fileType) row.file_type = fileType;
      if (fileSize) row.file_size = fileSize;

      const { error: dbErr } = await supabase.from("subject_materials").insert(row as any);
      if (dbErr) throw new Error(dbErr.message);

      setPct(100);
      setPhase("ok");
      toast({ title: "✅ Material uploaded!" });
      setTimeout(() => { onDone(); reset(); }, 700);

    } catch (e: any) {
      setPhase("err");
      setPct(0);
      const msg = e.message || "Upload failed";
      setErr(msg);
      toast({ title: "⚠️ Upload failed", description: msg, variant: "destructive", duration: 5000 });
    }
  };

  const barColor = phase === "ok" ? "#16A34A" : phase === "db" ? C.gold : C.green;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Error */}
      {err && (
        <div role="alert" style={{ display: "flex", gap: 10, padding: "12px 14px", background: C.redL, border: `1.5px solid ${C.redB}`, borderRadius: 12, alignItems: "flex-start" }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
          <p style={{ margin: 0, fontSize: "clamp(12px, 3vw, 13px)", color: "#991B1B", flex: 1, fontWeight: 600, lineHeight: 1.4 }}>{err}</p>
          <button onClick={e => { e.stopPropagation(); setErr(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 16, padding: 4 }}>✕</button>
        </div>
      )}

      {/* Title */}
      <div>
        <label style={labelSt} htmlFor="mat-title">Title <span style={{ color: C.red }}>*</span></label>
        <input id="mat-title" value={title} disabled={busy} autoFocus
          onChange={e => setTitle(e.target.value)}
          onClick={e => e.stopPropagation()}
          placeholder="e.g. Week 4 Tajweed Notes"
          style={{ ...inputSt, borderColor: !title && err ? C.redB : C.border }}
        />
      </div>

      {/* Type selector */}
      <div>
        <label style={labelSt}>Type</label>
        <div role="radiogroup" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          {ALL_TYPES.map(mt => {
            const tc = TYPES[mt], sel = type === mt;
            return (
              <button key={mt} type="button" role="radio" aria-checked={sel}
                onClick={e => { e.stopPropagation(); if (!busy) setType(mt); }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "clamp(8px,2vw,12px) 4px", borderRadius: 12, border: `2px solid ${sel ? tc.color : "#E9E9E9"}`, background: sel ? tc.light : "#FAFAFA", cursor: busy ? "not-allowed" : "pointer", transition: "all .14s", opacity: busy ? .5 : 1, boxShadow: sel ? `0 0 0 3px ${tc.color}22` : "none", minHeight: 44 }}>
                <span style={{ fontSize: "clamp(18px,5vw,22px)", lineHeight: 1 }}>{tc.emoji}</span>
                <span style={{ fontSize: "clamp(9px,2.5vw,11px)", fontWeight: sel ? 800 : 500, color: sel ? tc.color : C.muted }}>{mt}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* File drop zone */}
      {needFile && (
        <div>
          <label style={labelSt}>File</label>
          {/* 
            ANDROID FIX: Use <label htmlFor> instead of programmatic .click().
            Calling fileRef.current?.click() from inside a div's onClick pushes a
            history entry on Android — React Router then fires popstate and navigates
            the user back when the file picker closes.
            A <label htmlFor> is a native browser gesture and does NOT push history.
          */}
          <input
            ref={fileRef}
            id="smh-file-input"
            type="file"
            accept="*/*"
            style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", pointerEvents: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
          />
          {file ? (
            <div style={{ borderRadius: 14, border: `2px solid ${T.border}`, background: T.light, overflow: "hidden" }}>
              {thumb && <img src={thumb} alt="" style={{ width: "100%", maxHeight: 150, objectFit: "cover", display: "block" }} />}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, fontSize: 20, background: "#fff", border: `1.5px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>{T.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: "clamp(12px,3vw,13px)", color: C.text, margin: "0 0 5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: "clamp(9px,2.5vw,10px)", fontWeight: 800, padding: "2px 8px", borderRadius: 20, background: `${T.color}18`, color: T.color }}>{type}</span>
                    <span style={{ fontSize: "clamp(9px,2.5vw,11px)", color: C.muted }}>{fmtBytes(file.size)}</span>
                  </div>
                </div>
                {!busy && (
                  <button type="button" onClick={() => clearFile()}
                    style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, border: `1.5px solid ${T.border}`, background: "#fff", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, padding: 0 }}>✕</button>
                )}
              </div>
            </div>
          ) : (
            /* label htmlFor = native click on the input — no popstate on Android */
            <label
              htmlFor={busy ? undefined : "smh-file-input"}
              onDragEnter={onDE} onDragLeave={onDL} onDragOver={e => e.preventDefault()} onDrop={onDrop}
              style={{ display: "block", padding: "clamp(24px,6vw,36px) clamp(16px,4vw,20px)", borderRadius: 18, textAlign: "center", cursor: busy ? "not-allowed" : "pointer", border: `2.5px dashed ${drag ? C.green : "#CFCFCF"}`, background: drag ? `linear-gradient(135deg,${C.greenL},${C.greenM})` : "#FAFAFA", transform: drag ? "scale(1.025)" : "scale(1)", boxShadow: drag ? `0 0 0 6px ${C.green}18` : "none", transition: "all .2s ease", minHeight: 140 }}>
              <div style={{ width: "clamp(56px,14vw,68px)", height: "clamp(56px,14vw,68px)", borderRadius: 20, fontSize: "clamp(24px,6vw,30px)", margin: "0 auto clamp(12px,3vw,18px)", background: drag ? T.light : "#F0F0F0", border: `2px solid ${drag ? T.border : "#E0E0E0"}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }}>
                {drag ? T.emoji : "📂"}
              </div>
              <p style={{ fontWeight: 900, fontSize: "clamp(14px,4vw,16px)", margin: "0 0 clamp(4px,1vw,7px)", color: drag ? C.green : C.text }}>{drag ? "Drop it! 🎯" : "Tap to browse or drag any file"}</p>
              <p style={{ fontSize: "clamp(10px,2.8vw,12px)", color: C.muted, margin: 0, lineHeight: 1.5 }}>PDF · Word · Video · Audio · Image<br /><strong style={{ color: C.green }}>Any file type</strong></p>
            </label>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "clamp(8px,2vw,13px) 0 clamp(6px,1.5vw,9px)" }}>
            <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
            <span style={{ fontSize: "clamp(10px,2.8vw,11px)", color: C.muted, fontWeight: 600, whiteSpace: "nowrap" }}>or paste URL</span>
            <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
          </div>
          <input value={url} disabled={busy} onChange={e => setUrl(e.target.value)} onClick={e => e.stopPropagation()} placeholder="https://…" style={inputSt} />
        </div>
      )}

      {type === "Link" && (
        <div>
          <label style={labelSt}>URL <span style={{ color: C.red }}>*</span></label>
          <input value={url} disabled={busy} onChange={e => { setUrl(e.target.value); setErr(""); }} onClick={e => e.stopPropagation()} placeholder="https://…" style={inputSt} />
        </div>
      )}

      {type === "Text" && (
        <div>
          <label style={labelSt}>Content <span style={{ color: C.red }}>*</span></label>
          <textarea value={body} disabled={busy} rows={6} onChange={e => { setBody(e.target.value); setErr(""); }} onClick={e => e.stopPropagation()} placeholder="Write your text content here…" style={{ ...inputSt, resize: "vertical", minHeight: 120 }} />
        </div>
      )}

      {/* Progress */}
      {phase !== "idle" && phase !== "err" && (
        <div role="status" aria-live="polite" style={{ padding: "14px 16px", borderRadius: 13, background: "#F0FDF4", border: "1.5px solid #BBF7D0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
            <span style={{ fontSize: "clamp(12px,3vw,13px)", fontWeight: 700, color: "#166534" }}>
              {phase === "up" ? "Uploading…" : phase === "db" ? "Saving to database…" : "Complete ✓"}
            </span>
            <span style={{ fontSize: "clamp(12px,3vw,13px)", fontWeight: 900, color: barColor }}>{pct}%</span>
          </div>
          <div style={{ height: 10, background: "#D1FAE5", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 99, width: `${pct}%`, background: `linear-gradient(90deg,${barColor},${barColor}99)`, transition: "width .35s ease" }} />
          </div>
          {phase === "up" && file && <p style={{ fontSize: "clamp(10px,2.8vw,11px)", color: C.muted, margin: "6px 0 0" }}>{fmtBytes(Math.round(pct / 100 * file.size))} / {fmtBytes(file.size)}</p>}
        </div>
      )}

      {/* Download toggle */}
      <div onClick={e => { e.stopPropagation(); if (!busy) setDl(v => !v); }} role="switch" aria-checked={dl} tabIndex={0}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "clamp(10px,2.5vw,13px) clamp(12px,3vw,16px)", borderRadius: 13, cursor: busy ? "not-allowed" : "pointer", background: dl ? C.greenL : C.grayL, border: `1.5px solid ${dl ? "#86EFAC" : C.border}`, transition: "all .2s", opacity: busy ? .6 : 1, minHeight: 44 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, fontSize: 18, background: dl ? C.greenM : "#E9E9E9", display: "flex", alignItems: "center", justifyContent: "center" }}>{dl ? "⬇️" : "👁️"}</div>
          <div>
            <p style={{ fontWeight: 700, fontSize: "clamp(12px,3vw,13px)", color: C.text, margin: 0 }}>{dl ? "Download allowed" : "View only"}</p>
            <p style={{ fontSize: "clamp(10px,2.8vw,11px)", color: C.muted, margin: "2px 0 0" }}>{dl ? "Students can save" : "View only"}</p>
          </div>
        </div>
        <div style={{ width: 44, height: 24, borderRadius: 99, flexShrink: 0, background: dl ? C.green : "#CBD5E1", position: "relative", transition: "background .2s" }}>
          <div style={{ width: 18, height: 18, borderRadius: 99, background: "#fff", position: "absolute", top: 3, left: dl ? 23 : 3, transition: "left .2s", boxShadow: "0 1px 4px rgba(0,0,0,.25)" }} />
        </div>
      </div>

      {/* Submit */}
      <button type="button" onClick={submit} disabled={busy || phase === "ok"}
        style={{ width: "100%", padding: "clamp(14px,4vw,16px)", borderRadius: 14, border: "none", background: busy || phase === "ok" ? "#E5E7EB" : `linear-gradient(135deg,${C.green} 0%,${C.green2} 100%)`, color: busy || phase === "ok" ? C.muted : "#fff", fontWeight: 900, fontSize: "clamp(14px,4vw,15px)", letterSpacing: ".03em", cursor: busy || phase === "ok" ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: busy || phase === "ok" ? "none" : `0 6px 24px ${C.green}44`, transition: "all .2s", minHeight: 48 }}>
        <span style={{ fontSize: "clamp(16px,4.5vw,18px)", display: "inline-flex", animation: busy ? "smh-spin .7s linear infinite" : "none" }}>
          {phase === "ok" ? "✅" : phase === "err" ? "🔄" : busy ? "⟳" : "⬆"}
        </span>
        {phase === "up"  ? `Uploading ${pct}%…`
         : phase === "db" ? "Saving…"
         : phase === "ok" ? "Uploaded!"
         : phase === "err" ? "Retry"
         : "Upload"}
      </button>
    </div>
  );
}

// ─── Material Card ────────────────────────────────────────────────────────────
function MatCard({ mat, idx, onEdit, onDelete }: { mat: any; idx: number; onEdit: (m: any) => void; onDelete: (m: any) => void }) {
  const T = TYPES[(mat.material_type as MatType) ?? "PDF"];
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (mat.material_type !== "Image" || !mat.file_url) return;
    if (mat.file_url.startsWith("http")) { setImgSrc(mat.file_url); return; }
    supabase.storage.from(BUCKET).createSignedUrl(mat.file_url, 3600)
      .then(({ data }) => { if (data?.signedUrl) setImgSrc(data.signedUrl); });
  }, [mat.file_url, mat.material_type]);

  const openFile = async () => {
    if (!mat.file_url) return;
    if (mat.file_url.startsWith("http")) { window.open(mat.file_url, "_blank"); return; }
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(mat.file_url, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const dlFile = async () => {
    let u = mat.file_url ?? "";
    if (!u.startsWith("http")) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(u, 3600);
      u = data?.signedUrl ?? u;
    }
    const a = document.createElement("a"); a.href = u; a.download = mat.title; a.click();
  };

  return (
    <article className="smh-card" style={{ background: "#fff", borderRadius: 16, border: `1.5px solid ${T.border}`, overflow: "hidden", animation: `smh-slidein .3s ease both`, animationDelay: `${idx * 55}ms`, position: "relative" }}>
      <div style={{ height: 3, background: T.color }} />
      {mat.material_type === "Image" && imgSrc && (
        <div style={{ height: "clamp(90px,25vw,110px)", overflow: "hidden", background: T.light }}>
          <img src={imgSrc} alt={mat.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setImgSrc(null)} />
        </div>
      )}
      <div style={{ padding: "clamp(10px,2.5vw,14px) clamp(12px,3vw,16px)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "clamp(8px,2vw,11px)", marginBottom: 10 }}>
          <div style={{ width: "clamp(36px,9vw,42px)", height: "clamp(36px,9vw,42px)", borderRadius: 12, flexShrink: 0, fontSize: "clamp(18px,5vw,22px)", background: T.light, border: `1.5px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>{T.emoji}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontWeight: 700, fontSize: "clamp(12px,3.2vw,13px)", color: C.text, margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mat.title}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: "clamp(9px,2.5vw,10px)", fontWeight: 800, padding: "1px 6px", borderRadius: 20, background: `${T.color}18`, color: T.color }}>{mat.material_type}</span>
              {mat.file_size > 0 && <span style={{ fontSize: "clamp(9px,2.5vw,10px)", color: C.muted }}>{fmtBytes(mat.file_size)}</span>}
              <span style={{ fontSize: "clamp(9px,2.5vw,10px)", color: C.muted }}>{ago(mat.created_at)}</span>
            </div>
          </div>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button onClick={e => { e.stopPropagation(); setMenu(v => !v); }}
              style={{ width: 32, height: 32, borderRadius: 8, border: `1.5px solid ${C.border}`, background: "#fff", cursor: "pointer", fontSize: 18, color: C.muted, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>⋮</button>
            {menu && (
              <div role="menu" onMouseLeave={() => setMenu(false)} onClick={e => e.stopPropagation()}
                style={{ position: "absolute", right: 0, top: 36, zIndex: 50, minWidth: 130, background: "#fff", borderRadius: 12, border: `1.5px solid ${C.border}`, boxShadow: "0 10px 32px rgba(0,0,0,.14)", padding: 4, animation: "smh-pop .15s ease" }}>
                {mat.file_url && !["text-content"].includes(mat.file_url) && <MItem emoji="👁" color={C.gray} onClick={() => { openFile(); setMenu(false); }}>View</MItem>}
                {mat.is_downloadable && mat.file_url && !["text-content"].includes(mat.file_url) && <MItem emoji="⬇" color="#0D9488" onClick={() => { dlFile(); setMenu(false); }}>Download</MItem>}
                <MItem emoji="✏️" color={C.green} onClick={() => { onEdit(mat); setMenu(false); }}>Edit</MItem>
                <div style={{ height: 1, background: "#F3F4F6", margin: "4px 0" }} />
                <MItem emoji="🗑" color={C.red} onClick={() => { onDelete(mat); setMenu(false); }}>Delete</MItem>
              </div>
            )}
          </div>
        </div>
        {mat.content && <p style={{ fontSize: "clamp(10px,2.8vw,11px)", color: C.gray, margin: "0 0 8px", lineHeight: 1.5, padding: "6px 8px", background: C.grayL, borderRadius: 8, border: `1px solid ${C.border}`, display: "-webkit-box" as any, WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any, overflow: "hidden" }}>{mat.content}</p>}
        {mat.is_downloadable && <span style={{ fontSize: "clamp(9px,2.5vw,10px)", color: C.green, fontWeight: 700 }}>⬇ Downloadable</span>}
      </div>
    </article>
  );
}

function MItem({ emoji, color, onClick, children }: { emoji: string; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick(); }} role="menuitem"
      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", borderRadius: 8, border: "none", background: "none", cursor: "pointer", fontSize: "clamp(11px,3vw,12px)", fontWeight: 600, color, textAlign: "left", minHeight: 36 }}>
      {emoji} {children}
    </button>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({ mat, onClose, onSaved }: { mat: any; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(mat.title ?? "");
  const [dl, setDl]       = useState(mat.is_downloadable ?? true);
  const [busy, setBusy]   = useState(false);

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("subject_materials").update({ title: title.trim(), is_downloadable: dl }).eq("id", mat.id);
    setBusy(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "✅ Updated" });
    onSaved();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 400, padding: "clamp(16px,4vw,24px)", boxShadow: "0 24px 80px rgba(0,0,0,.2)", animation: "smh-pop .2s ease" }}
        onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: "clamp(14px,4vw,16px)", fontWeight: 800, color: C.text, margin: 0 }}>Edit Material</h3>
          <button onClick={e => { e.stopPropagation(); onClose(); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 20, padding: 4 }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelSt} htmlFor="edit-title">Title</label>
            <input id="edit-title" value={title} onChange={e => setTitle(e.target.value)} autoFocus style={{ ...inputSt, borderRadius: 10 }} />
          </div>
          <div onClick={e => { e.stopPropagation(); setDl(v => !v); }} role="switch" aria-checked={dl} tabIndex={0}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "clamp(10px,2.5vw,12px) clamp(12px,3vw,14px)", borderRadius: 12, cursor: "pointer", background: dl ? C.greenL : C.grayL, border: `1.5px solid ${dl ? "#86EFAC" : C.border}`, transition: "all .2s", minHeight: 44 }}>
            <span style={{ fontSize: "clamp(12px,3vw,13px)", fontWeight: 600, color: C.text }}>{dl ? "⬇ Download allowed" : "👁 View only"}</span>
            <div style={{ width: 40, height: 22, borderRadius: 99, background: dl ? C.green : "#CBD5E1", position: "relative", transition: "background .2s" }}>
              <div style={{ width: 16, height: 16, borderRadius: 99, background: "#fff", position: "absolute", top: 3, left: dl ? 21 : 3, transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
            </div>
          </div>
          <button onClick={e => { e.stopPropagation(); save(); }} disabled={busy || !title.trim()}
            style={{ padding: "clamp(12px,3vw,13px)", borderRadius: 12, border: "none", background: busy || !title.trim() ? "#E5E7EB" : `linear-gradient(135deg,${C.green},${C.green2})`, color: busy || !title.trim() ? C.muted : "#fff", fontWeight: 800, fontSize: "clamp(13px,3.5vw,14px)", cursor: busy || !title.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 44 }}>
            {busy ? "Saving…" : "✓ Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Filter chip ──────────────────────────────────────────────────────────────
function Chip({ active, color, onClick, children }: { active: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick(); }} role="tab" aria-selected={active}
      style={{ padding: "clamp(5px,1.5vw,6px) clamp(10px,3vw,12px)", borderRadius: 20, border: `1.5px solid ${active ? color : C.border}`, background: active ? `${color}18` : "#fff", color: active ? color : C.gray, fontSize: "clamp(10px,2.8vw,11px)", fontWeight: 700, cursor: "pointer", transition: "all .15s", minHeight: 32, whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function SubjectMaterialsHub({ subjectId, subjectTitle }: { subjectId: string; subjectTitle?: string }) {
  const qc = useQueryClient();
  const [search, setSearch]   = useState("");
  const [filter, setFilter]   = useState<MatType | "All">("All");
  const [editMat, setEditMat] = useState<any>(null);
  const [showUp, setShowUp]   = useState(true);

  // ✅ BUG FIX #2: was `{ mats = [] }` — useQuery returns `{ data }`, not `{ mats }`
  // This was causing the library to always show empty even when data existed
  const { data: mats = [], isLoading } = useQuery({
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
    const safeUrls = ["text-content", "link", "placeholder"];
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
    const c: Record<string, number> = {};
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
        @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;}}
        @media(max-width:640px){.smh-grid{grid-template-columns:1fr!important;}}
      `}</style>

      {/* Header */}
      <header style={{ background: `linear-gradient(135deg,${C.green},${C.green2})`, borderRadius: "clamp(16px,4vw,20px)", padding: "clamp(16px,4vw,20px) clamp(18px,4.5vw,24px)", marginBottom: "clamp(16px,4vw,20px)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "clamp(10px,2.5vw,14px)" }}>
          <div style={{ width: "clamp(40px,10vw,48px)", height: "clamp(40px,10vw,48px)", borderRadius: "clamp(12px,3vw,16px)", fontSize: "clamp(20px,5.5vw,26px)", background: "rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>📚</div>
          <div>
            <h2 style={{ color: "#fff", fontWeight: 900, fontSize: "clamp(16px,4.5vw,18px)", margin: 0 }}>Materials</h2>
            <p style={{ color: "rgba(255,255,255,.65)", fontSize: "clamp(11px,3vw,12px)", margin: "3px 0 0" }}>
              {subjectTitle ? `${subjectTitle} · ` : ""}{mats.length} item{mats.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <button onClick={e => { e.stopPropagation(); setShowUp(v => !v); }}
          style={{ padding: "clamp(7px,2vw,9px) clamp(14px,3.5vw,18px)", borderRadius: 11, border: "1.5px solid rgba(255,255,255,.3)", background: "rgba(255,255,255,.15)", backdropFilter: "blur(4px)", color: "#fff", fontWeight: 700, fontSize: "clamp(12px,3.2vw,13px)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, minHeight: 36 }}>
          {showUp ? "📋 Library" : "⬆ Upload"}
        </button>
      </header>

      {/* Type chips */}
      {Object.keys(counts).length > 0 && (
        <nav style={{ display: "flex", overflowX: "auto", gap: 8, marginBottom: "clamp(16px,4vw,20px)", paddingBottom: 4, scrollbarWidth: "none" }}>
          {(Object.keys(counts) as MatType[]).map(t => {
            const tc = TYPES[t], active = filter === t;
            return (
              <button key={t} onClick={e => { e.stopPropagation(); setFilter(filter === t ? "All" : t); }}
                style={{ background: active ? tc.light : "#fff", border: `1.5px solid ${active ? tc.color : tc.border}`, borderRadius: 13, padding: "clamp(10px,2.5vw,12px) clamp(12px,3vw,14px)", cursor: "pointer", boxShadow: active ? `0 0 0 3px ${tc.color}33` : "none", transition: "all .15s", flexShrink: 0, minWidth: 72 }}>
                <div style={{ fontSize: "clamp(16px,4.5vw,20px)", marginBottom: 4 }}>{tc.emoji}</div>
                <div style={{ fontSize: "clamp(16px,4.5vw,22px)", fontWeight: 900, color: active ? tc.color : C.text, lineHeight: 1 }}>{counts[t]}</div>
                <div style={{ fontSize: "clamp(9px,2.5vw,10px)", fontWeight: 700, color: active ? tc.color : C.muted, marginTop: 2 }}>{t}</div>
              </button>
            );
          })}
        </nav>
      )}

      {/* Grid */}
      <main className="smh-grid" style={{ display: "grid", gridTemplateColumns: showUp ? "minmax(0,1fr) minmax(0,1fr)" : "1fr", gap: "clamp(16px,4vw,20px)", alignItems: "start" }}>

        {showUp && (
          <section style={{ background: "#fff", borderRadius: "clamp(16px,4vw,20px)", padding: "clamp(18px,4.5vw,24px)", border: `1.5px solid ${C.border}`, boxShadow: "0 4px 24px rgba(0,0,0,.06)", animation: "smh-fadein .25s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "clamp(16px,4vw,22px)", paddingBottom: "clamp(12px,3vw,16px)", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ width: "clamp(32px,8vw,38px)", height: "clamp(32px,8vw,38px)", borderRadius: 11, fontSize: "clamp(16px,4.5vw,20px)", background: C.greenL, display: "flex", alignItems: "center", justifyContent: "center" }}>⬆</div>
              <div>
                <h3 style={{ fontWeight: 800, fontSize: "clamp(14px,4vw,15px)", color: C.text, margin: 0 }}>Upload Material</h3>
                <p style={{ fontSize: "clamp(10px,2.8vw,11px)", color: C.muted, margin: 0 }}>Any file, link, or text</p>
              </div>
            </div>
            <UploadPanel subjectId={subjectId} count={mats.length} onDone={invalidate} />
          </section>
        )}

        <section style={{ display: "flex", flexDirection: "column", gap: "clamp(12px,3vw,14px)" }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "clamp(10px,2.5vw,13px) clamp(12px,3vw,14px)", border: `1.5px solid ${C.border}`, boxShadow: "0 2px 10px rgba(0,0,0,.04)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 16, pointerEvents: "none" }}>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search materials…" style={{ ...inputSt, paddingLeft: 34, borderRadius: 10 }} />
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <Chip active={filter === "All"} color={C.green} onClick={() => setFilter("All")}>All ({mats.length})</Chip>
              {(Object.keys(counts) as MatType[]).map(t => (
                <Chip key={t} active={filter === t} color={TYPES[t].color} onClick={() => setFilter(filter === t ? "All" : t)}>
                  {TYPES[t].emoji} {t} ({counts[t]})
                </Chip>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div style={{ display: "grid", gap: 10 }}>
              {[1, 2, 3].map(i => <div key={i} style={{ height: "clamp(90px,25vw,110px)", borderRadius: 16, background: "#F0F0F0", animation: "smh-pulse 1.4s infinite", animationDelay: `${i * 110}ms` }} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ background: "#fff", borderRadius: "clamp(16px,4vw,20px)", border: `2px dashed ${C.border}`, padding: "clamp(40px,10vw,52px) clamp(18px,4.5vw,24px)", textAlign: "center" }}>
              <div style={{ width: "clamp(56px,14vw,68px)", height: "clamp(56px,14vw,68px)", borderRadius: 20, fontSize: "clamp(28px,7vw,32px)", margin: "0 auto clamp(14px,3.5vw,18px)", background: C.greenL, display: "flex", alignItems: "center", justifyContent: "center" }}>📭</div>
              <p style={{ fontWeight: 800, color: C.text, margin: "0 0 clamp(4px,1vw,6px)", fontSize: "clamp(14px,4vw,15px)" }}>{search || filter !== "All" ? "No matches" : "No materials yet"}</p>
              <p style={{ fontSize: "clamp(12px,3.2vw,13px)", color: C.muted, margin: 0 }}>{search || filter !== "All" ? "Adjust your search" : "Upload your first material"}</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: showUp ? "1fr" : "repeat(auto-fill,minmax(240px,1fr))", gap: "clamp(10px,2.5vw,12px)" }}>
              {filtered.map((m: any, i: number) => (
                <MatCard key={m.id} mat={m} idx={i} onEdit={setEditMat} onDelete={deleteMat} />
              ))}
            </div>
          )}
        </section>
      </main>

      {editMat && <EditModal mat={editMat} onClose={() => setEditMat(null)} onSaved={() => { setEditMat(null); invalidate(); }} />}
    </>
  );
}
