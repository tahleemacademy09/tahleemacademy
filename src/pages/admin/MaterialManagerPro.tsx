/**
 * MaterialManagerPro.tsx - FIXED IMPORTS
 */

import React, { useState, useCallback, useMemo, memo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

// ─── Constants ───────────────────────────────────────────────────────────────
const BUCKET = "subject-files";

const B = {
  green:   "#064E3B",
  green2:  "#065F46",
  greenXL: "#ECFDF5",
  greenL:  "#D1FAE5",
  red:     "#DC2626",
  redL:    "#FEF2F2",
  border:  "#E5E7EB",
  bg:      "#F3F4F6",
  card:    "#FFFFFF",
  text:    "#111827",
  sub:     "#6B7280",
  muted:   "#9CA3AF",
};

type MatType = "PDF" | "Video" | "Audio" | "Image" | "Document" | "Link" | "Text";

interface TypeMeta {
  emoji:  string;
  color:  string;
  light:  string;
  border: string;
}

const TYPE_META: Record<MatType, TypeMeta> = {
  PDF:      { emoji:"📄", color:"#DC2626", light:"#FEF2F2", border:"#FCA5A5" },
  Video:    { emoji:"🎬", color:"#7C3AED", light:"#F5F3FF", border:"#C4B5FD" },
  Audio:    { emoji:"🎵", color:"#0D9488", light:"#F0FDFA", border:"#99F6E4" },
  Image:    { emoji:"🖼️", color:"#2563EB", light:"#EFF6FF", border:"#BFDBFE" },
  Document: { emoji:"📝", color:"#D97706", light:"#FFFBEB", border:"#FDE68A" },
  Link:     { emoji:"🔗", color:"#6B7280", light:"#F9FAFB", border:"#D1D5DB" },
  Text:     { emoji:"✏️", color:"#374151", light:"#F9FAFB", border:"#D1D5DB" },
};

interface MaterialRow {
  id:             string;
  subject_id:     string;  title:          string;
  material_type:  string | null;
  file_url:       string;
  file_type:      string | null;
  file_size:      number | null;
  content:        string | null;
  is_downloadable:boolean | null;
  sort_order:     number | null;
  uploaded_by:    string;
  created_at:     string | null;
}

interface SubjectRow {
  id:       string;
  title:    string;
  title_ar: string | null;
  is_active:boolean | null;
  image_url:string | null;
  level:    string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtSize(bytes?: number | null): string {
  if (!bytes) return "";
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(0)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function detectMaterialType(file: File): MatType {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (type.includes("pdf") || name.endsWith(".pdf")) return "PDF";
  if (type.startsWith("video/")) return "Video";
  if (type.startsWith("audio/")) return "Audio";
  if (type.startsWith("image/")) return "Image";
  return "Document";
}

function generateFilePath(subjectId: string, file: File): string {  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const ext = file.name.split(".").pop() || "";
  return `${subjectId}/${timestamp}-${randomStr}.${ext}`;
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: B.card,
  borderRadius: 16,
  border: `1.5px solid ${B.border}`,
  boxShadow: "0 2px 10px rgba(0,0,0,.05)",
};

// ═════════════════════════════════════════════════════════════════════════════
// SUBJECT PICKER
// ═════════════════════════════════════════════════════════════════════════════
const SubjectPicker = memo(({ selected, onSelect }: { 
  selected: SubjectRow | null; 
  onSelect: (s: SubjectRow) => void;
}) => {
  const {  subjects = [], isLoading, error, refetch } = useQuery<SubjectRow[]>({
    queryKey: ["mmp-subjects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, title, title_ar, is_active, image_url, level")
        .order("title");
      
      if (error) {
        console.error("❌ Subjects query error:", error);
        throw error;
      }
      
      console.log(`✅ Loaded ${data?.length || 0} subjects`);
      return (data ?? []) as SubjectRow[];
    },
    staleTime: 60_000,
    retry: 2,
  });

  return (
    <div style={{ ...card, padding: 20 }}>
      <h3 style={{ fontWeight: 800, fontSize: 16, color: B.text, margin: "0 0 16px" }}>
        📚 Select a Subject
      </h3>
      
      {error && (
        <div style={{
          background: B.redL,          border: `1px solid ${B.red}`,
          borderRadius: 12,
          padding: 16,
          color: B.red,
          fontSize: 13,
          marginBottom: 16,
        }}>
          <p style={{ fontWeight: 700, margin: "0 0 8px" }}>
            ❌ Failed to Load Subjects
          </p>
          <p style={{ margin: "0 0 8px", fontSize: 12 }}>
            {error.message}
          </p>
          <button
            onClick={() => refetch()}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: B.red,
              color: "#fff",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            🔄 Retry
          </button>
        </div>
      )}

      {isLoading && (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <p style={{ color: B.muted }}>Loading subjects...</p>
        </div>
      )}

      {!isLoading && !error && subjects.length === 0 && (
        <div style={{
          background: B.greenXL,
          border: `1px solid ${B.greenL}`,
          borderRadius: 12,
          padding: 20,
          textAlign: "center",
          marginBottom: 16,
        }}>
          <p style={{ fontWeight: 700, color: B.text, margin: "0 0 8px" }}>
            No Subjects Found
          </p>
          <p style={{ fontSize: 12, color: B.sub, margin: "0 0 12px" }}>            Run SQL setup in Supabase
          </p>
          <button
            onClick={() => refetch()}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: B.green,
              color: "#fff",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            🔄 Refresh
          </button>
        </div>
      )}

      {!isLoading && !error && subjects.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          {subjects.map(s => (
            <button
              key={s.id}
              onClick={() => onSelect(s)}
              style={{
                padding: "14px 16px",
                borderRadius: 12,
                border: `2px solid ${selected?.id === s.id ? B.green : B.border}`,
                background: selected?.id === s.id ? B.greenXL : "#fff",
                cursor: "pointer",
                textAlign: "left",
                width: "100%",
              }}
            >
              <p style={{ fontWeight: 700, fontSize: 14, color: B.text, margin: "0 0 4px" }}>
                {s.title}
              </p>
              {s.level && (
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 10,
                  background: B.greenL,
                  color: B.green,
                }}>
                  {s.level}
                </span>              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// UPLOAD MODAL
// ═════════════════════════════════════════════════════════════════════════════
interface UploadModalProps {
  subject: SubjectRow;
  onClose: () => void;
  onUploaded: () => void;
}

const UploadModal = ({ subject, onClose, onUploaded }: UploadModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage("");
    setSuccessMessage("");
    
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      
      if (selectedFile.size > 50 * 1024 * 1024) {
        setErrorMessage("❌ File too large (max 50MB)");
        return;
      }
      
      setFile(selectedFile);
      setSuccessMessage(`✅ Ready: ${selectedFile.name}`);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setErrorMessage("❌ Please select a file first");
      return;
    }
    if (!user) {
      setErrorMessage("❌ You must be logged in");
      return;
    }

    setUploading(true);
    setErrorMessage("");
    setSuccessMessage("");
    setUploadProgress(10);

    try {
      const filePath = generateFilePath(subject.id, file);
      const materialType = detectMaterialType(file);

      setUploadProgress(30);

      const {  uploadData, error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Storage: ${uploadError.message}`);
      }

      setUploadProgress(60);

      const {  urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase
        .from("subject_materials")
        .insert({
          subject_id: subject.id,
          title: file.name.replace(/\.[^/.]+$/, ""),
          material_type: materialType,
          file_url: urlData.publicUrl,
          file_type: file.type,
          file_size: file.size,
          is_downloadable: true,
          uploaded_by: user.id,
          sort_order: 0,
        });

      if (dbError) {
        throw new Error(`Database: ${dbError.message}`);
      }
      setUploadProgress(100);
      setSuccessMessage("✅ Upload successful!");

      setTimeout(() => {
        onUploaded();
      }, 1500);

    } catch (error: any) {
      setErrorMessage(`❌ ${error.message || "Upload failed"}`);
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,.7)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "20px 20px 0 0",
          width: "100%",
          maxWidth: 500,
          padding: 24,
          paddingBottom: 40,
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: B.text, margin: 0 }}>
            📤 Upload Material
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            style={{
              background: "none",              border: "none",
              cursor: uploading ? "not-allowed" : "pointer",
              color: B.muted,
              fontSize: 24,
              padding: "0 8px",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{
          background: B.greenXL,
          border: `1px solid ${B.greenL}`,
          borderRadius: 12,
          padding: 12,
          marginBottom: 20,
        }}>
          <p style={{ fontSize: 11, color: B.green, fontWeight: 700, margin: "0 0 4px" }}>
            UPLOADING TO:
          </p>
          <p style={{ fontSize: 14, fontWeight: 600, color: B.text, margin: 0 }}>
            {subject.title}
          </p>
        </div>

        {errorMessage && (
          <div style={{
            background: B.redL,
            border: `1px solid ${B.red}`,
            borderRadius: 12,
            padding: 12,
            marginBottom: 20,
            color: B.red,
            fontSize: 13,
            fontWeight: 600,
          }}>
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div style={{
            background: B.greenXL,
            border: `1px solid ${B.greenL}`,
            borderRadius: 12,
            padding: 12,
            marginBottom: 20,
            color: B.green,
            fontSize: 13,            fontWeight: 600,
          }}>
            {successMessage}
          </div>
        )}

        <div
          onClick={() => !uploading && fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${file ? B.green : B.border}`,
            borderRadius: 16,
            padding: "30px 20px",
            textAlign: "center",
            cursor: uploading ? "not-allowed" : "pointer",
            background: file ? B.greenXL : B.bg,
            marginBottom: 20,
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            onChange={handleFileSelect}
            disabled={uploading}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*,video/*,audio/*"
          />
          <div style={{ fontSize: 40, marginBottom: 10 }}>
            {file ? "📎" : "📁"}
          </div>
          <p style={{ fontWeight: 700, color: B.text, margin: "0 0 4px", fontSize: 14 }}>
            {file ? "File Selected" : "Tap to Select File"}
          </p>
          <p style={{ fontSize: 11, color: B.muted, margin: 0 }}>
            {file ? file.name : "PDF, Images, Video, Audio, Documents"}
          </p>
          {file && (
            <p style={{ fontSize: 11, color: B.green, marginTop: 8, fontWeight: 600 }}>
              {fmtSize(file.size)}
            </p>
          )}
        </div>

        {uploading && (
          <div style={{ marginBottom: 20 }}>
            <div style={{
              height: 8,
              background: B.bg,
              borderRadius: 4,
              overflow: "hidden",
              marginBottom: 8,            }}>
              <div style={{
                width: `${uploadProgress}%`,
                height: "100%",
                background: B.green,
                transition: "width .3s",
              }} />
            </div>
            <p style={{ fontSize: 12, color: B.sub, textAlign: "center" }}>
              Uploading... {uploadProgress}%
            </p>
          </div>
        )}

        <div style={{ display: "flex", gap: 12 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            style={{
              flex: 1,
              padding: "14px 20px",
              borderRadius: 12,
              border: `1.5px solid ${B.border}`,
              background: "#fff",
              color: B.text,
              fontWeight: 700,
              fontSize: 15,
              cursor: uploading ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || uploading}
            style={{
              flex: 2,
              padding: "14px 20px",
              borderRadius: 12,
              border: "none",
              background: !file || uploading ? "#E5E7EB" : B.green,
              color: "#fff",
              fontWeight: 800,
              fontSize: 15,
              cursor: !file || uploading ? "not-allowed" : "pointer",
            }}
          >
            {uploading ? "⏳ Uploading..." : `📤 Upload`}          </button>
        </div>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// MATERIAL CARD
// ═════════════════════════════════════════════════════════════════════════════
const MaterialCard = memo(({ material, onDelete }: { 
  material: MaterialRow; 
  onDelete: (m: MaterialRow) => void;
}) => {
  const T = TYPE_META[(material.material_type as MatType) ?? "PDF"];

  return (
    <div style={{
      ...card,
      padding: 16,
      borderTop: `4px solid ${T.color}`,
    }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: T.light,
          border: `1.5px solid ${T.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 20,
          flexShrink: 0,
        }}>
          {T.emoji}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: B.text, margin: "0 0 4px" }}>
            {material.title}
          </p>
          <div style={{ fontSize: 11, color: B.muted }}>
            {material.material_type} • {fmtSize(material.file_size)} • {timeAgo(material.created_at)}
          </div>
        </div>
        <button
          onClick={() => onDelete(material)}
          style={{
            background: "none",
            border: "none",            color: B.red,
            cursor: "pointer",
            fontSize: 20,
            padding: "4px 8px",
            flexShrink: 0,
          }}
        >
          🗑
        </button>
      </div>
    </div>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function MaterialManagerPro() {
  const qc = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();

  const [selectedSubject, setSelectedSubject] = useState<SubjectRow | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const {  materials = [], isLoading: materialsLoading, error: materialsError } = useQuery<MaterialRow[]>({
    queryKey: ["mmp-materials", selectedSubject?.id],
    enabled: !!selectedSubject,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subject_materials")
        .select("*")
        .eq("subject_id", selectedSubject!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MaterialRow[];
    },
  });

  const handleDelete = async (m: MaterialRow) => {
    if (!confirm(`Delete "${m.title}"?`)) return;
    const { error } = await supabase.from("subject_materials").delete().eq("id", m.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "🗑 Deleted" });
    qc.invalidateQueries({ queryKey: ["mmp-materials", selectedSubject?.id] });
  };

  const invalidateAll = useCallback(() => {    if (selectedSubject) {
      qc.invalidateQueries({ queryKey: ["mmp-materials", selectedSubject.id] });
    }
  }, [qc, selectedSubject]);

  return (
    <>
      <div style={{
        minHeight: "100vh",
        background: B.bg,
        fontFamily: "system-ui, sans-serif",
        paddingBottom: 40,
      }}>
        {/* Header */}
        <div style={{
          background: `linear-gradient(135deg, ${B.green} 0%, ${B.green2} 100%)`,
          padding: "24px 20px",
          marginBottom: 20,
        }}>
          <div>
            <h1 style={{ color: "#fff", fontWeight: 900, fontSize: 22, margin: "0 0 4px" }}>
              📚 Material Manager
            </h1>
            <p style={{ color: "rgba(255,255,255,.7)", fontSize: 13, margin: 0 }}>
              {selectedSubject ? `Library: ${selectedSubject.title}` : "Select a subject to begin"}
            </p>
            {authLoading ? (
              <p style={{ color: "rgba(255,255,255,.5)", fontSize: 11, margin: "8px 0 0" }}>
                ⏳ Checking login...
              </p>
            ) : user ? (
              <p style={{ color: "rgba(255,255,255,.5)", fontSize: 11, margin: "8px 0 0" }}>
                👤 {user.email}
              </p>
            ) : (
              <p style={{ color: "rgba(255,255,255,.5)", fontSize: 11, margin: "8px 0 0" }}>
                ⚠️ Not logged in
              </p>
            )}
          </div>
        </div>

        <div style={{ padding: "0 16px" }}>
          {!selectedSubject ? (
            <SubjectPicker 
              selected={selectedSubject} 
              onSelect={(s) => {
                setSelectedSubject(s);
              }} 
            />          ) : (
            <>
              {/* Upload Button */}
              <button
                onClick={() => setShowUpload(true)}
                style={{
                  width: "100%",
                  padding: "16px 20px",
                  borderRadius: 12,
                  border: "none",
                  background: B.green,
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 16,
                  cursor: "pointer",
                  marginBottom: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                }}
              >
                📤 Upload Material
              </button>

              {/* Change Subject Button */}
              <button
                onClick={() => setSelectedSubject(null)}
                style={{
                  width: "100%",
                  padding: "12px 20px",
                  borderRadius: 12,
                  border: `1.5px solid ${B.border}`,
                  background: "#fff",
                  color: B.text,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  marginBottom: 20,
                }}
              >
                🔄 Change Subject
              </button>

              {/* Materials List */}
              {materialsError && (
                <div style={{
                  ...card,
                  padding: 20,
                  background: B.redL,                  border: `1px solid ${B.red}`,
                  color: B.red,
                  marginBottom: 16,
                }}>
                  ❌ Failed to load materials
                </div>
              )}

              {materialsLoading ? (
                <div style={{ ...card, padding: 40, textAlign: "center" }}>
                  <p style={{ color: B.muted }}>Loading...</p>
                </div>
              ) : materials.length === 0 ? (
                <div style={{ ...card, padding: 40, textAlign: "center" }}>
                  <p style={{ fontSize: 48, marginBottom: 16 }}>📭</p>
                  <p style={{ fontWeight: 700, color: B.text, marginBottom: 8 }}>No materials yet</p>
                  <p style={{ fontSize: 13, color: B.muted }}>Tap Upload to add your first material</p>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {materials.map(m => (
                    <MaterialCard 
                      key={m.id} 
                      material={m} 
                      onDelete={handleDelete} 
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUpload && selectedSubject && (
        <UploadModal
          subject={selectedSubject}
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false);
            invalidateAll();
          }}
        />
      )}
    </>
  );
}