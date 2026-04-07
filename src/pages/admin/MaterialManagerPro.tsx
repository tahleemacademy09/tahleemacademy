/**
 * MaterialManagerPro.tsx
 * ─────────────────────────────────────────────────────────────────
 * Library-only view for managing subject materials.
 * Upload functionality has been removed.
 */

import React, { useState, useCallback, useMemo, memo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

// ─── Constants ────────────────────────────────────────────────────────────────
const SB_URL = "https://wvqeubhupkddtkcdwqcm.supabase.co";
const BUCKET = "subject-files";

/** Brand colours — match existing Tahleem green theme */
const B = {
  green:   "#064E3B",
  green2:  "#065F46",
  greenXL: "#ECFDF5",
  greenL:  "#D1FAE5",
  gold:    "#92700A",
  red:     "#DC2626",
  redL:    "#FEF2F2",
  redB:    "#FECACA",
  blue:    "#2563EB",
  blueL:   "#EFF6FF",
  border:  "#E5E7EB",
  bg:      "#F3F4F6",
  card:    "#FFFFFF",
  text:    "#111827",
  sub:     "#6B7280",
  muted:   "#9CA3AF",
};

// ─── Material-type registry ───────────────────────────────────────────────────
type MatType =
  | "PDF" | "Video" | "Audio" | "Image"
  | "Document" | "Link" | "Text";

interface TypeMeta {
  emoji:  string;
  color:  string;
  light:  string;
  border: string;
  accept: string;
}
const TYPE_META: Record<MatType, TypeMeta> = {
  PDF:      { emoji:"📄", color:"#DC2626", light:"#FEF2F2", border:"#FCA5A5", accept:".pdf,application/pdf" },
  Video:    { emoji:"🎬", color:"#7C3AED", light:"#F5F3FF", border:"#C4B5FD", accept:"video/*,.mp4,.webm,.mov,.avi,.m4v,.mkv" },
  Audio:    { emoji:"🎵", color:"#0D9488", light:"#F0FDFA", border:"#99F6E4", accept:"audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" },
  Image:    { emoji:"🖼️", color:"#2563EB", light:"#EFF6FF", border:"#BFDBFE", accept:"image/*,.heic,.heif" },
  Document: { emoji:"📝", color:"#D97706", light:"#FFFBEB", border:"#FDE68A", accept:".doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.csv" },
  Link:     { emoji:"🔗", color:"#6B7280", light:"#F9FAFB", border:"#D1D5DB", accept:"" },
  Text:     { emoji:"✏️", color:"#374151", light:"#F9FAFB", border:"#D1D5DB", accept:"" },
};

const ALL_TYPES = Object.keys(TYPE_META) as MatType[];

// ─── Supabase DB row type ─────────────────────────────────────────────────────
interface MaterialRow {
  id:             string;
  subject_id:     string;
  title:          string;
  material_type:  string | null;
  file_url:       string;
  file_type:      string | null;
  file_size:      number | null;
  content:        string | null;
  is_downloadable:boolean | null;
  sort_order:     number | null;
  uploaded_by:    string;
  created_at:     string | null;
  topic:          string | null;
  level:          string | null;
  session_id:     string | null;
}

interface SubjectRow {
  id:       string;
  title:    string;
  title_ar: string | null;
  is_active:boolean | null;
  image_url:string | null;
  level:    string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtSize(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1_024)       return `${bytes} B`;
  if (bytes < 1_048_576)   return `${(bytes / 1_024).toFixed(0)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

function timeAgo(iso?: string | null): string {  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s <    60) return "just now";
  if (s <  3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ─── Shared CSS-in-JS helpers ────────────────────────────────────────────────
const pill = (active: boolean, color: string): React.CSSProperties => ({
  padding:      "6px 12px",
  borderRadius: 20,
  fontSize:     11,
  fontWeight:   700,
  cursor:       "pointer",
  border:       `1.5px solid ${active ? color : B.border}`,
  background:   active ? `${color}18` : B.card,
  color:        active ? color : B.sub,
  transition:   "all .14s",
  whiteSpace:   "nowrap",
});

const card: React.CSSProperties = {
  background:   B.card,
  borderRadius: 16,
  border:       `1.5px solid ${B.border}`,
  boxShadow:    "0 2px 10px rgba(0,0,0,.05)",
};

const labelSt: React.CSSProperties = {
  display:       "block",
  fontSize:      11,
  fontWeight:    800,
  color:         "#374151",
  textTransform: "uppercase",
  letterSpacing: ".07em",
  marginBottom:  8,
};

const inputSt: React.CSSProperties = {
  width:       "100%",
  boxSizing:   "border-box",
  fontFamily:  "inherit",
  padding:     "11px 14px",
  fontSize:    14,
  outline:     "none",
  border:      `1.5px solid ${B.border}`,
  borderRadius: 10,
  background:  "#fff",
  color:       B.text,};

// ═════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENT: Subject Picker
// ═════════════════════════════════════════════════════════════════════════════
interface SubjectPickerProps {
  selected: SubjectRow | null;
  onSelect: (s: SubjectRow) => void;
}

const SubjectPicker = memo(({ selected, onSelect }: SubjectPickerProps) => {
  const [search, setSearch] = useState("");

  const { data: subjects = [], isLoading } = useQuery<SubjectRow[]>({
    queryKey: ["mmp-subjects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, title, title_ar, is_active, image_url, level")
        .order("title");
      if (error) throw error;
      return (data ?? []) as SubjectRow[];
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(
    () => subjects.filter(s =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      (s.title_ar ?? "").includes(search)
    ),
    [subjects, search],
  );

  return (
    <div style={{ ...card, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 22 }}>📂</span>
        <div>
          <h3 style={{ fontWeight: 800, fontSize: 15, color: B.text, margin: 0 }}>
            Select Subject
          </h3>
          <p style={{ fontSize: 11, color: B.muted, margin: 0 }}>
            {subjects.length} subject{subjects.length !== 1 ? "s" : ""} available
          </p>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 14 }}>        <span style={{
          position: "absolute", left: 11, top: "50%",
          transform: "translateY(-50%)", fontSize: 14, color: B.muted,
          pointerEvents: "none",
        }}>🔍</span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search subjects…"
          style={{ ...inputSt, paddingLeft: 34, fontSize: 13 }}
        />
      </div>

      {/* Subject grid */}
      {isLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{
              height: 70, borderRadius: 12, background: "#F0F0F0",
              animation: "mmp-pulse 1.4s infinite",
              animationDelay: `${i * 100}ms`,
            }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p style={{ textAlign: "center", color: B.muted, fontSize: 13, padding: "20px 0" }}>
          No subjects found
        </p>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 8,
          maxHeight: 320,
          overflowY: "auto",
          paddingRight: 4,
        }}>
          {filtered.map(s => {
            const active = selected?.id === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelect(s)}
                style={{
                  display:      "flex",
                  alignItems:   "center",
                  gap:          10,
                  padding:      "11px 13px",
                  borderRadius: 12,                  border:       `2px solid ${active ? B.green : B.border}`,
                  background:   active ? B.greenXL : "#FAFAFA",
                  cursor:       "pointer",
                  textAlign:    "left",
                  transition:   "all .14s",
                  boxShadow:    active ? `0 0 0 3px ${B.green}22` : "none",
                }}
              >
                {/* Subject thumbnail / icon */}
                <div style={{
                  width:          36,
                  height:         36,
                  borderRadius:   9,
                  flexShrink:     0,
                  background:     s.image_url ? `url(${s.image_url}) center/cover` : B.greenL,
                  border:         `1.5px solid ${B.border}`,
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  fontSize:       18,
                  overflow:       "hidden",
                }}>
                  {!s.image_url && "📖"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontWeight: 700, fontSize: 12, color: active ? B.green : B.text,
                    margin: "0 0 2px",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{s.title}</p>
                  {s.level && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "1px 6px",
                      borderRadius: 20,
                      background: s.level === "beginner" ? "#F0FDF4"
                        : s.level === "intermediate" ? "#EFF6FF" : "#FDF4FF",
                      color: s.level === "beginner" ? "#166534"
                        : s.level === "intermediate" ? "#1E40AF" : "#6B21A8",
                    }}>{s.level}</span>
                  )}
                </div>
                {active && <span style={{ fontSize: 16, flexShrink: 0 }}>✅</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});SubjectPicker.displayName = "SubjectPicker";

// ═════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENT: Material Card (library item)
// ═════════════════════════════════════════════════════════════════════════════
interface MaterialCardProps {
  material: MaterialRow;
  index:    number;
  onEdit:   (m: MaterialRow) => void;
  onDelete: (m: MaterialRow) => void;
}

const MaterialCard = memo(({ material: m, index, onEdit, onDelete }: MaterialCardProps) => {
  const T = TYPE_META[(m.material_type as MatType) ?? "PDF"];
  const [imgSrc,  setImgSrc]  = useState<string | null>(null);
  const [menuOpen,setMenuOpen]= useState(false);

  // Resolve signed URL for Image thumbnails
  useEffect(() => {
    if (m.material_type !== "Image" || !m.file_url) return;
    if (m.file_url.startsWith("http")) { setImgSrc(m.file_url); return; }
    supabase.storage.from(BUCKET).createSignedUrl(m.file_url, 3600)
      .then(({ data }) => { if (data?.signedUrl) setImgSrc(data.signedUrl); });
  }, [m.file_url, m.material_type]);

  const openFile = async () => {
    if (!m.file_url) return;
    if (m.file_url.startsWith("http")) { window.open(m.file_url, "_blank"); return; }
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(m.file_url, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const downloadFile = async () => {
    let url = m.file_url ?? "";
    const safe = ["_text_", "link", "placeholder", "text-content"];
    if (!url.startsWith("http") && !safe.includes(url)) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(url, 3600);
      url = data?.signedUrl ?? url;
    }
    const a = document.createElement("a");
    a.href = url; a.download = m.title; a.click();
  };

  const hasFileUrl = !!m.file_url && !["_text_","link","placeholder","text-content"].includes(m.file_url);

  return (
    <div
      className="mmp-card"
      style={{
        background:    "#fff",        borderRadius:  16,
        border:        `1.5px solid ${T.border}`,
        overflow:      "hidden",
        animation:     "mmp-slidein .3s ease both",
        animationDelay:`${index * 50}ms`,
        position:      "relative",
      }}
    >
      {/* Colour accent bar */}
      <div style={{ height: 3, background: T.color }} />

      {/* Image thumbnail */}
      {m.material_type === "Image" && imgSrc && (
        <div style={{ height: 110, overflow: "hidden", background: T.light }}>
          <img
            src={imgSrc}
            alt={m.title}
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={() => setImgSrc(null)}
          />
        </div>
      )}

      <div style={{ padding: "14px 16px" }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 11, marginBottom: 10 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0, fontSize: 22,
            background: T.light, border: `1.5px solid ${T.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {T.emoji}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontWeight: 700, fontSize: 13, color: B.text,
              margin: "0 0 4px",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{m.title}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
              <span style={{
                fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 20,
                background: `${T.color}18`, color: T.color,
              }}>{m.material_type}</span>
              {(m.file_size ?? 0) > 0 && (
                <span style={{ fontSize: 10, color: B.muted }}>{fmtSize(m.file_size)}</span>
              )}
              <span style={{ fontSize: 10, color: B.muted }}>{timeAgo(m.created_at)}</span>            </div>
          </div>

          {/* Context menu */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              type="button"
              aria-label="More options"
              onClick={() => setMenuOpen(v => !v)}
              style={{
                width: 30, height: 30, borderRadius: 8,
                border: `1.5px solid ${B.border}`, background: "#fff",
                cursor: "pointer", fontSize: 16, color: B.muted,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >⋮</button>

            {menuOpen && (
              <div
                onMouseLeave={() => setMenuOpen(false)}
                style={{
                  position: "absolute", right: 0, top: 34, zIndex: 50, minWidth: 145,
                  background: "#fff", borderRadius: 12,
                  border: `1.5px solid ${B.border}`,
                  boxShadow: "0 10px 32px rgba(0,0,0,.14)",
                  padding: 6, animation: "mmp-pop .15s ease",
                }}
              >
                {hasFileUrl && (
                  <CtxItem emoji="👁" color={B.sub}
                    onClick={() => { openFile(); setMenuOpen(false); }}>
                    View
                  </CtxItem>
                )}
                {m.is_downloadable && hasFileUrl && (
                  <CtxItem emoji="⬇" color="#0D9488"
                    onClick={() => { downloadFile(); setMenuOpen(false); }}>
                    Download
                  </CtxItem>
                )}
                <CtxItem emoji="✏️" color={B.green}
                  onClick={() => { onEdit(m); setMenuOpen(false); }}>
                  Edit
                </CtxItem>
                <div style={{ height: 1, background: "#F3F4F6", margin: "4px 0" }} />
                <CtxItem emoji="🗑" color={B.red}
                  onClick={() => { onDelete(m); setMenuOpen(false); }}>
                  Delete
                </CtxItem>
              </div>            )}
          </div>
        </div>

        {/* Text content preview */}
        {m.content && (
          <p style={{
            fontSize: 11, color: B.sub, margin: "0 0 8px", lineHeight: 1.5,
            padding: "8px 10px", background: B.bg, borderRadius: 8,
            border: `1px solid ${B.border}`,
            display: "-webkit-box" as React.CSSProperties["display"],
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as React.CSSProperties["WebkitBoxOrient"],
            overflow: "hidden",
          }}>
            {m.content}
          </p>
        )}

        {m.is_downloadable && (
          <span style={{ fontSize: 10, color: B.green, fontWeight: 700 }}>
            ⬇ Downloadable
          </span>
        )}
      </div>
    </div>
  );
});
MaterialCard.displayName = "MaterialCard";

/** Tiny context-menu button */
function CtxItem({ emoji, color, onClick, children }: {
  emoji:    string;
  color:    string;
  onClick:  () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display:    "flex",
        alignItems: "center",
        gap:        8,
        width:      "100%",
        padding:    "9px 10px",
        borderRadius: 8,
        border:     "none",
        background: "none",        cursor:     "pointer",
        fontSize:   12,
        fontWeight: 600,
        color,
        textAlign:  "left",
        minHeight:  36,
      }}
    >
      <span>{emoji}</span> {children}
    </button>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENT: Edit Modal
// ═════════════════════════════════════════════════════════════════════════════
interface EditModalProps {
  material: MaterialRow;
  onClose:  () => void;
  onSaved:  () => void;
}

const EditModal = memo(({ material, onClose, onSaved }: EditModalProps) => {
  const [title, setTitle] = useState(material.title);
  const [dl,    setDl]    = useState(material.is_downloadable ?? true);
  const [busy,  setBusy]  = useState(false);

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const { error } = await supabase
      .from("subject_materials")
      .update({ title: title.trim(), is_downloadable: dl })
      .eq("id", material.id);
    setBusy(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "✅ Updated" });
    onSaved();
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff", borderRadius: 20, width: "100%", maxWidth: 400,
        padding: 24, boxShadow: "0 24px 80px rgba(0,0,0,.2)",
        animation: "mmp-pop .2s ease",
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: 20,
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: B.text, margin: 0 }}>
            Edit Material
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: "none", border: "none", cursor: "pointer", color: B.muted, fontSize: 18 }}
          >✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelSt}>Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
              style={inputSt}
            />
          </div>

          <div
            onClick={() => setDl(v => !v)}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setDl(v => !v); }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 14px", borderRadius: 12, cursor: "pointer",
              background: dl ? B.greenXL : B.bg,
              border: `1.5px solid ${dl ? "#86EFAC" : B.border}`,
              transition: "all .2s", minHeight: 44,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: B.text }}>
              {dl ? "⬇ Download allowed" : "👁 View only"}
            </span>            <div style={{
              width: 42, height: 24, borderRadius: 99,
              background: dl ? B.green : "#CBD5E1",
              position: "relative", transition: "background .2s",
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 99, background: "#fff",
                position: "absolute", top: 3, left: dl ? 21 : 3,
                transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)",
              }} />
            </div>
          </div>

          <button
            type="button"
            onClick={save}
            disabled={busy || !title.trim()}
            style={{
              padding: "13px", borderRadius: 12, border: "none",
              background: busy || !title.trim() ? "#E5E7EB"
                : `linear-gradient(135deg, ${B.green}, ${B.green2})`,
              color: busy || !title.trim() ? B.muted : "#fff",
              fontWeight: 800, fontSize: 14,
              cursor: busy || !title.trim() ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              minHeight: 48,
            }}
          >
            {busy ? "Saving…" : "✓ Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
});
EditModal.displayName = "EditModal";

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE EXPORT — MaterialManagerPro (Library Only)
// ═════════════════════════════════════════════════════════════════════════════
export default function MaterialManagerPro() {
  const qc = useQueryClient();

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedSubject, setSelectedSubject] = useState<SubjectRow | null>(null);
  const [search,           setSearch]          = useState("");
  const [typeFilter,       setTypeFilter]      = useState<MatType | "All">("All");
  const [editTarget,       setEditTarget]      = useState<MaterialRow | null>(null);

  // ── Fetch materials for selected subject ────────────────────────────────────  const { data: materials = [], isLoading: matsLoading } = useQuery<MaterialRow[]>({
    queryKey: ["mmp-materials", selectedSubject?.id],
    enabled:  !!selectedSubject,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subject_materials")
        .select("*")
        .eq("subject_id", selectedSubject!.id)
        .order("sort_order")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MaterialRow[];
    },
  });

  // ── Invalidate all relevant query keys ─────────────────────────────────────
  const invalidateAll = useCallback(() => {
    if (!selectedSubject) return;
    const id = selectedSubject.id;
    qc.invalidateQueries({ queryKey: ["mmp-materials", id] });
    qc.invalidateQueries({ queryKey: ["smh", id] });
    qc.invalidateQueries({ queryKey: ["subject-materials-all", id] });
    qc.invalidateQueries({ queryKey: ["adm-materials", id] });
    qc.invalidateQueries({ queryKey: ["materials", id] });
  }, [qc, selectedSubject]);

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (m: MaterialRow) => {
    if (!confirm(`Delete "${m.title}"?`)) return;

    const safeUrls = ["_text_", "link", "placeholder", "text-content"];
    if (m.file_url && !m.file_url.startsWith("http") && !safeUrls.includes(m.file_url)) {
      await supabase.storage.from(BUCKET).remove([m.file_url]);
    }

    const { error } = await supabase.from("subject_materials").delete().eq("id", m.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "🗑 Deleted" });
    invalidateAll();
  }, [invalidateAll]);

  // ── Filtered materials ─────────────────────────────────────────────────────
  const filtered = useMemo(
    () => materials.filter(m =>
      (typeFilter === "All" || m.material_type === typeFilter) &&
      (!search || m.title.toLowerCase().includes(search.toLowerCase()))
    ),    [materials, typeFilter, search],
  );

  // ── Type counts for filter chips ──────────────────────────────────────────
  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    materials.forEach(m => {
      if (m.material_type) c[m.material_type] = (c[m.material_type] ?? 0) + 1;
    });
    return c;
  }, [materials]);

  return (
    <>
      <style>{`
        @keyframes mmp-pop{
          from{opacity:0;transform:scale(.93)}
          to  {opacity:1;transform:scale(1)}
        }
        @keyframes mmp-slidein{
          from{opacity:0;transform:translateY(16px)}
          to  {opacity:1;transform:translateY(0)}
        }
        @keyframes mmp-pulse{
          0%,100%{opacity:1}
          50%{opacity:.35}
        }
        .mmp-card{
          transition:transform .18s ease, box-shadow .18s ease;
        }
        .mmp-card:hover{
          transform:translateY(-3px);
          box-shadow:0 10px 30px rgba(0,0,0,.09)!important;
        }
        .mmp-pill:hover{
          filter:brightness(.95);
        }
      `}</style>

      <div style={{
        minHeight:   "100vh",
        background:  B.bg,
        fontFamily:  "system-ui, sans-serif",
        padding:     "0 0 40px",
      }}>

        {/* ════ TOP BANNER ════════════════════════════════════════════════ */}
        <div style={{
          background:    `linear-gradient(135deg, ${B.green} 0%, ${B.green2} 100%)`,
          padding:       "22px 20px",          marginBottom:  24,
        }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              flexWrap:       "wrap",
              gap:            12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width:          52,
                  height:         52,
                  borderRadius:   16,
                  background:     "rgba(255,255,255,.15)",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  fontSize:       26,
                }}>📚</div>
                <div>
                  <h1 style={{ color: "#fff", fontWeight: 900, fontSize: 20, margin: 0 }}>
                    Material Manager Pro
                  </h1>
                  <p style={{ color: "rgba(255,255,255,.65)", fontSize: 12, margin: "3px 0 0" }}>
                    {selectedSubject
                      ? `Library: ${selectedSubject.title}`
                      : "Select a subject to view materials"}
                  </p>
                </div>
              </div>

              {selectedSubject && (
                <button
                  type="button"
                  onClick={() => { setSelectedSubject(null); setSearch(""); setTypeFilter("All"); }}
                  style={{
                    padding:    "9px 16px",
                    borderRadius: 11,
                    border:     "1.5px solid rgba(255,255,255,.3)",
                    background: "rgba(255,255,255,.12)",
                    color:      "#fff",
                    fontWeight: 700,
                    fontSize:   13,
                    cursor:     "pointer",
                  }}
                >
                  🔄 Change Subject
                </button>              )}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px" }}>

          {/* ════ SUBJECT PICKER (shown when no subject selected) ════════ */}
          {!selectedSubject ? (
            <div style={{ maxWidth: 700, margin: "0 auto", animation: "mmp-pop .25s ease" }}>
              <SubjectPicker selected={selectedSubject} onSelect={s => {
                setSelectedSubject(s);
                setSearch("");
                setTypeFilter("All");
              }} />
            </div>
          ) : (
            <>
              {/* ════ TYPE STAT CHIPS ══════════════════════════════════════ */}
              {Object.keys(typeCounts).length > 0 && (
                <div style={{
                  display:             "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
                  gap:                 10,
                  marginBottom:        20,
                }}>
                  {(Object.keys(typeCounts) as MatType[]).map(t => {
                    const tm     = TYPE_META[t];
                    const active = typeFilter === t;
                    return (
                      <div
                        key={t}
                        role="button"
                        tabIndex={0}
                        onClick={() => setTypeFilter(typeFilter === t ? "All" : t)}
                        onKeyDown={e => { if (e.key === "Enter") setTypeFilter(typeFilter === t ? "All" : t); }}
                        style={{
                          background:   active ? tm.light  : "#fff",
                          border:       `1.5px solid ${active ? tm.color : tm.border}`,
                          borderRadius: 13,
                          padding:      "12px 14px",
                          cursor:       "pointer",
                          boxShadow:    active ? `0 0 0 3px ${tm.color}33` : "none",
                          transition:   "all .15s",
                        }}
                      >
                        <div style={{ fontSize: 20, marginBottom: 5 }}>{tm.emoji}</div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: active ? tm.color : B.text, lineHeight: 1 }}>
                          {typeCounts[t]}
                        </div>                        <div style={{ fontSize: 10, fontWeight: 700, color: active ? tm.color : B.muted, marginTop: 3 }}>
                          {t}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ════ LIBRARY ONLY ═════════════════════════════════════════ */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                {/* Search + filter bar */}
                <div style={{
                  ...card,
                  padding: "13px 14px",
                  display: "flex", flexDirection: "column", gap: 10,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ position: "relative", flex: 1 }}>
                      <span style={{
                        position: "absolute", left: 11, top: "50%",
                        transform: "translateY(-50%)", fontSize: 14,
                        color: B.muted, pointerEvents: "none",
                      }}>🔍</span>
                      <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search materials…"
                        style={{ ...inputSt, paddingLeft: 34, fontSize: 13 }}
                      />
                    </div>
                    <span style={{
                      fontSize:     11,
                      color:        B.muted,
                      whiteSpace:   "nowrap",
                      padding:      "0 4px",
                    }}>
                      {filtered.length} / {materials.length}
                    </span>
                  </div>

                  {/* Filter chips */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="mmp-pill"
                      onClick={() => setTypeFilter("All")}
                      style={pill(typeFilter === "All", B.green)}
                    >                      All ({materials.length})
                    </button>
                    {(Object.keys(typeCounts) as MatType[]).map(t => (
                      <button
                        key={t}
                        type="button"
                        className="mmp-pill"
                        onClick={() => setTypeFilter(typeFilter === t ? "All" : t)}
                        style={pill(typeFilter === t, TYPE_META[t].color)}
                      >
                        {TYPE_META[t].emoji} {t} ({typeCounts[t]})
                      </button>
                    ))}
                  </div>
                </div>

                {/* Material cards */}
                {matsLoading ? (
                  <div style={{
                    display:             "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                    gap:                 12,
                  }}>
                    {[1,2,3].map(i => (
                      <div key={i} style={{
                        height:         110,
                        borderRadius:   16,
                        background:     "#F0F0F0",
                        animation:      "mmp-pulse 1.4s infinite",
                        animationDelay: `${i * 100}ms`,
                      }} />
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <div style={{
                    ...card,
                    padding:   "52px 24px",
                    textAlign: "center",
                    border:    `2px dashed ${B.border}`,
                    animation: "mmp-pop .3s ease",
                  }}>
                    <div style={{
                      width:          68, height: 68, borderRadius: 20,
                      margin:         "0 auto 18px", fontSize: 32,
                      background:     B.greenXL,
                      display:        "flex",
                      alignItems:     "center",
                      justifyContent: "center",
                    }}>📭</div>
                    <p style={{ fontWeight: 800, color: B.text, margin: "0 0 6px", fontSize: 15 }}>                      {search || typeFilter !== "All" ? "No matches found" : "No materials yet"}
                    </p>
                    <p style={{ fontSize: 13, color: B.muted, margin: 0 }}>
                      {search || typeFilter !== "All"
                        ? "Try a different search or filter"
                        : "Materials will appear here once added"}
                    </p>
                  </div>
                ) : (
                  <div style={{
                    display:             "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                    gap:                 12,
                  }}>
                    {filtered.map((m, i) => (
                      <MaterialCard
                        key={m.id}
                        material={m}
                        index={i}
                        onEdit={setEditTarget}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ════ EDIT MODAL ═══════════════════════════════════════════════════ */}
      {editTarget && (
        <EditModal
          material={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); invalidateAll(); }}
        />
      )}
    </>
  );
}