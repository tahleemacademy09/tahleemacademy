/**
 * MaterialManagerPro.tsx - WITH VISIBLE DEBUG LOGS
 */

import React, { useState, useCallback, useMemo, memo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

// ─── Constants ──────────────────────────────────────────────────────────────
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

interface DebugLog {
  id: number;
  time: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning' | 'query';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
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
  if (type.includes("pdf") || name.endsWith(".pdf")) return "PDF";  if (type.startsWith("video/")) return "Video";
  if (type.startsWith("audio/")) return "Audio";
  if (type.startsWith("image/")) return "Image";
  return "Document";
}

function generateFilePath(subjectId: string, file: File): string {
  const timestamp = Date.now();
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
// DEBUG PANEL COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
const DebugPanel = ({ logs, onClear, showDebug, onToggle }: {
  logs: DebugLog[];
  onClear: () => void;
  showDebug: boolean;
  onToggle: () => void;
}) => {
  if (!showDebug) {
    return (
      <button
        onClick={onToggle}
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          padding: "10px 16px",
          borderRadius: 8,
          border: "none",
          background: B.green,
          color: "#fff",
          fontWeight: 700,
          fontSize: 12,
          cursor: "pointer",
          zIndex: 9999,
          boxShadow: "0 4px 12px rgba(0,0,0,.2)",
        }}
      >        🐛 Show Debug
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      background: "#1a1a2e",
      color: "#fff",
      padding: 12,
      fontSize: 11,
      maxHeight: 250,
      overflowY: "auto",
      zIndex: 10000,
      borderTop: "3px solid #064E3B",
      fontFamily: "monospace",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong style={{ fontSize: 12 }}>🔍 DEBUG LOG ({logs.length})</strong>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onClear}
            style={{
              background: "#6B7280",
              border: "none",
              color: "#fff",
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            CLEAR
          </button>
          <button
            onClick={onToggle}
            style={{
              background: "#DC2626",
              border: "none",
              color: "#fff",
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 10,
              cursor: "pointer",
            }}
          >            HIDE
          </button>
        </div>
      </div>
      {logs.length === 0 ? (
        <p style={{ color: "#6B7280", margin: 0 }}>No logs yet - waiting for actions...</p>
      ) : (
        logs.slice(-15).map((log) => (
          <div
            key={log.id}
            style={{
              padding: "4px 0",
              borderBottom: "1px solid #333",
              color: log.type === 'error' ? '#FCA5A5' 
                   : log.type === 'success' ? '#86EFAC' 
                   : log.type === 'warning' ? '#FDE68A'
                   : log.type === 'query' ? '#93C5FD'
                   : '#fff',
            }}
          >
            <span style={{ color: "#6B7280", marginRight: 8 }}>{log.time}</span>
            {log.message}
          </div>
        ))
      )}
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// SUBJECT PICKER - WITH DEBUG
// ═════════════════════════════════════════════════════════════════════════════
const SubjectPicker = memo(({ selected, onSelect, addLog }: { 
  selected: SubjectRow | null; 
  onSelect: (s: SubjectRow) => void;
  addLog: (message: string, type?: DebugLog['type']) => void;
}) => {
  const {  subjects = [], isLoading, error, refetch, isFetching } = useQuery<SubjectRow[]>({
    queryKey: ["mmp-subjects"],
    queryFn: async () => {
      addLog("📡 QUERY: Fetching subjects from database...", "query");
      addLog("🔍 Checking Supabase connection...", "info");
      
      try {
        const { data, error } = await supabase
          .from("subjects")
          .select("id, title, title_ar, is_active, image_url, level")
          .order("title");
        
        if (error) {          addLog(`❌ QUERY ERROR: ${error.message}`, "error");
          addLog(`📋 Error details: ${error.details || "No details"}`, "error");
          throw error;
        }
        
        const count = data?.length || 0;
        addLog(`✅ QUERY SUCCESS: Loaded ${count} subjects`, "success");
        
        if (count > 0) {
          addLog(`📋 First subject: ${data[0]?.title}`, "info");
        } else {
          addLog("⚠️ WARNING: Table exists but no subjects found", "warning");
          addLog("💡 Run SQL setup script in Supabase SQL Editor", "warning");
        }
        
        return (data ?? []) as SubjectRow[];
      } catch (err: any) {
        addLog(`💥 EXCEPTION: ${err.message}`, "error");
        throw err;
      }
    },
    staleTime: 30_000,
    retry: 2,
  });

  return (
    <div style={{ ...card, padding: 20 }}>
      <h3 style={{ fontWeight: 800, fontSize: 16, color: B.text, margin: "0 0 16px" }}>
        📚 Select a Subject
      </h3>
      
      {/* Query Status */}
      <div style={{
        background: isFetching ? B.blueL : B.bg,
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
        fontSize: 12,
      }}>
        <p style={{ margin: 0, color: B.sub }}>
          {isFetching ? "🔄 Refreshing..." : isLoading ? "⏳ Loading..." : "✅ Ready"}
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div style={{
          background: B.redL,
          border: `2px solid ${B.red}`,
          borderRadius: 12,          padding: 16,
          color: B.red,
          fontSize: 12,
          marginBottom: 16,
        }}>
          <p style={{ fontWeight: 800, margin: "0 0 8px", fontSize: 14 }}>
            ❌ Failed to Load Subjects
          </p>
          <p style={{ margin: "0 0 8px", fontFamily: "monospace" }}>
            {error.message}
          </p>
          {error.details && (
            <p style={{ margin: "0 0 12px", fontSize: 11, opacity: 0.8 }}>
              {error.details}
            </p>
          )}
          <button
            onClick={() => {
              addLog("🔄 User clicked retry button", "info");
              refetch();
            }}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: B.red,
              color: "#fff",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            🔄 Retry Query
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <p style={{ fontSize: 48, marginBottom: 12 }}>⏳</p>
          <p style={{ color: B.muted, fontWeight: 600 }}>Loading subjects...</p>
          <p style={{ fontSize: 11, color: B.sub }}>Querying database</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && subjects.length === 0 && (
        <div style={{
          background: B.greenXL,          border: `2px solid ${B.greenL}`,
          borderRadius: 12,
          padding: 24,
          textAlign: "center",
          marginBottom: 16,
        }}>
          <p style={{ fontSize: 48, marginBottom: 12 }}>📭</p>
          <p style={{ fontWeight: 800, color: B.text, margin: "0 0 8px", fontSize: 16 }}>
            No Subjects Found
          </p>
          <p style={{ fontSize: 12, color: B.sub, margin: "0 0 16px", lineHeight: 1.5 }}>
            The subjects table is empty or doesn't exist.
            <br />
            Run the SQL setup script in Supabase.
          </p>
          
          <div style={{
            background: "#fff",
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            fontSize: 11,
            textAlign: "left",
            fontFamily: "monospace",
          }}>
            <p style={{ margin: "0 0 8px", fontWeight: 700, color: B.green }}>
              📋 Quick Setup:
            </p>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              <li>Go to Supabase Dashboard</li>
              <li>Open SQL Editor</li>
              <li>Run the CREATE TABLE script</li>
              <li>Insert sample subjects</li>
            </ol>
          </div>
          
          <button
            onClick={() => {
              addLog("🔄 User clicked refresh button", "info");
              refetch();
            }}
            style={{
              padding: "12px 24px",
              borderRadius: 10,
              border: "none",
              background: B.green,
              color: "#fff",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            🔄 Refresh
          </button>
        </div>
      )}

      {/* Subjects List */}
      {!isLoading && !error && subjects.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          {subjects.map(s => (
            <button
              key={s.id}
              onClick={() => {
                addLog(`✅ Subject selected: ${s.title}`, "success");
                onSelect(s);
              }}
              style={{
                padding: "16px 16px",
                borderRadius: 12,
                border: `2px solid ${selected?.id === s.id ? B.green : B.border}`,
                background: selected?.id === s.id ? B.greenXL : "#fff",
                cursor: "pointer",
                textAlign: "left",
                width: "100%",
                transition: "all 0.2s",
              }}
            >
              <p style={{ fontWeight: 700, fontSize: 14, color: B.text, margin: "0 0 4px" }}>
                {s.title}
              </p>
              {s.title_ar && (
                <p style={{ fontSize: 12, color: B.sub, margin: "0 0 4px", direction: "rtl" }}>
                  {s.title_ar}
                </p>
              )}
              {s.level && (
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 10,
                  background: B.greenL,
                  color: B.green,
                  display: "inline-block",
                }}>
                  {s.level}                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// UPLOAD MODAL - WITH DEBUG
// ═════════════════════════════════════════════════════════════════════════════
interface UploadModalProps {
  subject: SubjectRow;
  onClose: () => void;
  onUploaded: () => void;
  addLog: (message: string, type?: DebugLog['type']) => void;
}

const UploadModal = ({ subject, onClose, onUploaded, addLog }: UploadModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  useEffect(() => {
    addLog("📦 Upload modal opened", "info");
    addLog(`📚 Subject: ${subject.title}`, "info");
    addLog(`👤 User: ${user?.email || "NOT LOGGED IN"}`, user ? "info" : "error");
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addLog("📁 File input triggered", "info");
    setErrorMessage("");
    setSuccessMessage("");
    
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      addLog(`✅ File selected: ${selectedFile.name}`, "success");
      addLog(`📊 Size: ${fmtSize(selectedFile.size)}`, "info");
      addLog(`📄 Type: ${selectedFile.type || "Unknown"}`, "info");
      
      if (selectedFile.size > 50 * 1024 * 1024) {
        const msg = "❌ File too large (max 50MB)";
        setErrorMessage(msg);
        addLog(msg, "error");        return;
      }
      
      setFile(selectedFile);
      setSuccessMessage(`✅ Ready: ${selectedFile.name}`);
    } else {
      addLog("⚠️ No file selected", "warning");
    }
  };

  const handleUpload = async () => {
    addLog("🚀 Upload button clicked", "info");

    if (!file) {
      const msg = "❌ Please select a file first";
      setErrorMessage(msg);
      addLog(msg, "error");
      return;
    }

    if (!user) {
      const msg = "❌ You must be logged in";
      setErrorMessage(msg);
      addLog(msg, "error");
      return;
    }

    if (!subject?.id) {
      const msg = "❌ No subject selected";
      setErrorMessage(msg);
      addLog(msg, "error");
      return;
    }

    setUploading(true);
    setErrorMessage("");
    setSuccessMessage("");
    setUploadProgress(10);
    addLog("⏳ Starting upload process...", "info");

    try {
      // Step 1: Generate file path
      const filePath = generateFilePath(subject.id, file);
      const materialType = detectMaterialType(file);
      addLog(`📍 Generated path: ${filePath}`, "info");
      addLog(`🏷️ Material type: ${materialType}`, "info");

      setUploadProgress(30);

      // Step 2: Upload to Storage      addLog("📤 Uploading to Supabase Storage...", "query");
      
      const {  uploadData, error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        const msg = `❌ Storage Error: ${uploadError.message}`;
        addLog(msg, "error");
        throw new Error(msg);
      }

      addLog("✅ Storage upload successful", "success");
      addLog(`🔗 Path: ${uploadData?.path}`, "info");
      setUploadProgress(60);

      // Step 3: Get Public URL
      const {  urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(filePath);

      addLog(`🌐 Public URL generated`, "info");

      // Step 4: Insert to Database
      addLog("💾 Inserting record into database...", "query");

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
        const msg = `❌ Database Error: ${dbError.message}`;
        addLog(msg, "error");
        throw new Error(msg);
      }

      addLog("✅ Database insert successful", "success");      setUploadProgress(100);
      setSuccessMessage("✅ Upload successful!");
      addLog("🎉 Upload complete!", "success");

      setTimeout(() => {
        onUploaded();
      }, 1500);

    } catch (error: any) {
      const msg = `❌ ${error.message || "Upload failed"}`;
      setErrorMessage(msg);
      addLog(msg, "error");
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
            onClick={() => {
              addLog("❌ Upload modal closed by user", "warning");              onClose();
            }}
            disabled={uploading}
            style={{
              background: "none",
              border: "none",
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
            border: `1px solid ${B.greenL}`,            borderRadius: 12,
            padding: 12,
            marginBottom: 20,
            color: B.green,
            fontSize: 13,
            fontWeight: 600,
          }}>
            {successMessage}
          </div>
        )}

        <div
          onClick={() => {
            addLog("🖱️ File selection area clicked", "info");
            if (!uploading && fileInputRef.current) {
              fileInputRef.current.click();
            }
          }}
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
            onClick={(e) => {
              e.stopPropagation();
              addLog("🖱️ Native file picker opened", "info");
            }}
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
          {file && (            <p style={{ fontSize: 11, color: B.green, marginTop: 8, fontWeight: 600 }}>
              {fmtSize(file.size)}
            </p>
          )}
        </div>

        {uploading && (
          <div style={{ marginBottom: 20 }}>
            <div style={{
              height: 10,
              background: B.bg,
              borderRadius: 5,
              overflow: "hidden",
              marginBottom: 8,
            }}>
              <div style={{
                width: `${uploadProgress}%`,
                height: "100%",
                background: B.green,
                transition: "width .3s",
              }} />
            </div>
            <p style={{ fontSize: 12, color: B.sub, textAlign: "center", fontWeight: 600 }}>
              Uploading... {uploadProgress}%
            </p>
          </div>
        )}

        <div style={{ display: "flex", gap: 12 }}>
          <button
            type="button"
            onClick={() => {
              addLog("❌ Cancel clicked", "warning");
              onClose();
            }}
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
          </button>          <button
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
            {uploading ? "⏳ Uploading..." : `📤 Upload`}
          </button>
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
          fontSize: 20,          flexShrink: 0,
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
            border: "none",
            color: B.red,
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
  const [showDebug, setShowDebug] = useState(true);
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);
  const logIdCounter = useRef(0);

  const addLog = useCallback((message: string, type: DebugLog['type'] = 'info') => {
    const time = new Date().toLocaleTimeString();
    const newLog: DebugLog = {
      id: logIdCounter.current++,
      time,
      message,      type,
    };
    setDebugLogs(prev => [...prev, newLog]);
    console.log(`[${type.toUpperCase()}] ${message}`);
  }, []);

  const clearLogs = useCallback(() => {
    setDebugLogs([]);
    addLog("️ Debug logs cleared", "info");
  }, [addLog]);

  useEffect(() => {
    addLog("🚀 MaterialManagerPro mounted", "info");
    addLog(`👤 User: ${user?.email || "NOT LOGGED IN"}`, user ? "success" : "error");
  }, [user]);

  useEffect(() => {
    if (user) {
      addLog(`✅ User authenticated: ${user.email}`, "success");
    } else if (!authLoading) {
      addLog(`⚠️ User not authenticated`, "warning");
    }
  }, [user, authLoading]);

  const {  materials = [], isLoading: materialsLoading, error: materialsError } = useQuery<MaterialRow[]>({
    queryKey: ["mmp-materials", selectedSubject?.id],
    enabled: !!selectedSubject,
    queryFn: async () => {
      addLog(`📡 Fetching materials for: ${selectedSubject?.title}`, "query");
      const { data, error } = await supabase
        .from("subject_materials")
        .select("*")
        .eq("subject_id", selectedSubject!.id)
        .order("created_at", { ascending: false });
      if (error) {
        addLog(`❌ Materials error: ${error.message}`, "error");
        throw error;
      }
      addLog(`✅ Loaded ${data?.length || 0} materials`, "success");
      return (data ?? []) as MaterialRow[];
    },
  });

  const handleDelete = async (m: MaterialRow) => {
    if (!confirm(`Delete "${m.title}"?`)) return;
    addLog(`🗑 Deleting: ${m.title}`, "warning");
    const { error } = await supabase.from("subject_materials").delete().eq("id", m.id);
    if (error) {
      addLog(`❌ Delete error: ${error.message}`, "error");
      toast({ title: "Error", description: error.message, variant: "destructive" });      return;
    }
    addLog(`✅ Deleted: ${m.title}`, "success");
    toast({ title: "🗑 Deleted" });
    qc.invalidateQueries({ queryKey: ["mmp-materials", selectedSubject?.id] });
  };

  const invalidateAll = useCallback(() => {
    if (selectedSubject) {
      addLog("🔄 Invalidating queries...", "info");
      qc.invalidateQueries({ queryKey: ["mmp-materials", selectedSubject.id] });
    }
  }, [qc, selectedSubject]);

  return (
    <>
      <div style={{
        minHeight: "100vh",
        background: B.bg,
        fontFamily: "system-ui, sans-serif",
        paddingBottom: showDebug ? 270 : 40,
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
                addLog(`✅ Subject selected: ${s.title}`, "success");
                setSelectedSubject(s);
              }} 
              addLog={addLog}
            />
          ) : (
            <>
              {/* Upload Button */}
              <button
                onClick={() => {
                  addLog("📤 Upload button clicked", "info");
                  setShowUpload(true);
                }}
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
                onClick={() => {
                  addLog("🔄 Changing subject", "info");
                  setSelectedSubject(null);
                }}
                style={{
                  width: "100%",
                  padding: "12px 20px",
                  borderRadius: 12,
                  border: `1.5px solid ${B.border}`,                  background: "#fff",
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
                  background: B.redL,
                  border: `1px solid ${B.red}`,
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
          onClose={() => {
            addLog("❌ Upload modal closed", "warning");
            setShowUpload(false);
          }}
          onUploaded={() => {
            addLog("✅ Upload completed", "success");
            setShowUpload(false);
            invalidateAll();
          }}
          addLog={addLog}
        />
      )}

      {/* Debug Panel */}
      <DebugPanel
        logs={debugLogs}
        onClear={clearLogs}
        showDebug={showDebug}
        onToggle={() => setShowDebug(!showDebug)}
      />
    </>
  );
}