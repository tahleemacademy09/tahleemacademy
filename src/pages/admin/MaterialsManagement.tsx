import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileText, Video, AudioLines, Image as ImageIcon, Loader2, Trash2, Edit, Plus, X, Eye } from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────
const MATERIAL_TYPES = ["PDF", "Video", "Audio", "Image", "Document"] as const;
const LEVELS = ["beginner", "intermediate", "advanced"] as const;
type MaterialType = typeof MATERIAL_TYPES[number];
type Level = typeof LEVELS[number];

export default function MaterialsManagement() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State - matches SQL schema exactly for subject_materials table
  const [formData, setFormData] = useState({
    title: "",
    title_ar: "",
    description: "",
    material_type: "PDF" as MaterialType,
    content: "",
    file_url: "",
    file_size: 0,
    level: "beginner" as Level,
    sort_order: 0,
    is_downloadable: true,
    session_id: null as string | null, // Optional field from SQL schema
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | ""; message: string }>({ type: "", message: "" });
  // ── Fetch Materials ─────────────────────────────────────────────────────
  useEffect(() => {
    if (subjectId) fetchMaterials();
  }, [subjectId]);

  const fetchMaterials = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("subject_materials")
        .select("*")
        .eq("subject_id", subjectId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      setMaterials(data || []);
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  // ── File Type Detection (Handles PDF edge cases) ────────────────────────
  const getMaterialType = (file: File): MaterialType => {
    const mimeType = file.type.toLowerCase();
    const fileName = file.name.toLowerCase();
    
    // Check MIME type first, then fallback to extension
    if (mimeType === "application/pdf" || mimeType.includes("pdf") || fileName.endsWith(".pdf")) return "PDF";
    if (mimeType.startsWith("video/") || fileName.match(/\.(mp4|webm|mov|avi)$/)) return "Video";
    if (mimeType.startsWith("audio/") || fileName.match(/\.(mp3|wav|ogg|m4a)$/)) return "Audio";
    if (mimeType.startsWith("image/") || fileName.match(/\.(jpg|jpeg|png|gif|webp)$/)) return "Image";
    
    return "Document";
  };

  // ── File Handlers ───────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const processFile = (file: File) => {
    // Validate file size (50MB limit)    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setFeedback({
        type: "error",
        message: `File too large. Maximum size is 50MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)}MB.`,
      });
      return;
    }
    
    setSelectedFile(file);
    setFormData(prev => ({ 
      ...prev, 
      file_size: file.size, 
      material_type: getMaterialType(file)
    }));

    // Create preview for images only
    if (file.type.startsWith("image/") || file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
    
    setFeedback({ type: "", message: "" });
  };

  const clearFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setFormData(prev => ({ ...prev, file_size: 0 }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const resetForm = () => {
    setFormData({
      title: "", title_ar: "", description: "",
      material_type: "PDF", content: "", file_url: "", file_size: 0,
      level: "beginner", sort_order: 0, is_downloadable: true,
      session_id: null,
    });
    setSelectedFile(null);
    setPreviewUrl(null);
    setEditingId(null);
    setShowForm(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Upload Logic ────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {    e.preventDefault();
    if (!subjectId || !user) return;

    setUploading(true);
    setFeedback({ type: "", message: "" });

    try {
      let finalFileUrl = formData.file_url;

      // Upload file if selected
      if (selectedFile) {
        const fileExt = selectedFile.name.split(".").pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `materials/${subjectId}/${fileName}`;

        console.log("📤 Uploading:", {
          bucket: "subject-materials",
          path: filePath,
          fileType: selectedFile.type,
          fileName: selectedFile.name,
        });

        const { error: uploadError, data } = await supabase.storage
          .from("subject-materials")
          .upload(filePath, selectedFile, {
            cacheControl: "3600",
            upsert: false,
            contentType: selectedFile.type || "application/octet-stream",
          });

        if (uploadError) {
          console.error("❌ Upload error:", uploadError);
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        console.log("✅ Upload success:", data);
        
        const { data: { publicUrl } } = supabase.storage
          .from("subject-materials")
          .getPublicUrl(filePath);
        finalFileUrl = publicUrl;
      }

      // Prepare data for database - matches SQL schema exactly
      const materialData = {
        subject_id: subjectId,
        title: formData.title,
        title_ar: formData.title_ar,
        description: formData.description,
        material_type: formData.material_type,  // ✅ Correct column name (not file_type)        content: formData.content,
        file_url: finalFileUrl,
        file_size: formData.file_size,
        level: formData.level,                   // ✅ Single level TEXT column
        sort_order: formData.sort_order,
        is_downloadable: formData.is_downloadable,
        uploaded_by: user.id,                    // ✅ Required by schema
        session_id: formData.session_id,         // ✅ Optional field
      };

      let error;
      if (editingId) {
        ({ error } = await supabase
          .from("subject_materials")
          .update(materialData)
          .eq("id", editingId));
      } else {
        ({ error } = await supabase
          .from("subject_materials")
          .insert([materialData]));
      }

      if (error) {
        console.error("❌ Database error:", error);
        throw error;
      }

      setFeedback({
        type: "success",
        message: editingId ? "Material updated!" : "Material uploaded!",
      });

      await fetchMaterials();
      resetForm();
    } catch (err: any) {
      console.error("💥 Submit error:", err);
      setFeedback({ type: "error", message: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (material: any) => {
    setFormData({
      title: material.title,
      title_ar: material.title_ar,
      description: material.description,
      material_type: material.material_type,
      content: material.content,
      file_url: material.file_url,      file_size: material.file_size,
      level: material.level,
      sort_order: material.sort_order,
      is_downloadable: material.is_downloadable,
      session_id: material.session_id,
    });
    setEditingId(material.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this material?")) return;
    try {
      const { error } = await supabase
        .from("subject_materials")
        .delete()
        .eq("id", id);
      if (error) throw error;
      await fetchMaterials();
      setFeedback({ type: "success", message: "Material deleted." });
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
    }
  };

  const getIcon = (type: MaterialType) => {
    switch (type) {
      case "PDF": return <FileText className="h-6 w-6 text-red-500" />;
      case "Video": return <Video className="h-6 w-6 text-blue-500" />;
      case "Audio": return <AudioLines className="h-6 w-6 text-green-500" />;
      case "Image": return <ImageIcon className="h-6 w-6 text-purple-500" />;
      default: return <FileText className="h-6 w-6 text-gray-500" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Subject Materials</h1>
          <p className="text-muted-foreground">Manage resources for this subject</p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Add Material
        </Button>
      </div>

      {/* Feedback */}
      {feedback.message && (
        <div className={`p-3 rounded-md ${feedback.type === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
          {feedback.message}
        </div>
      )}

      {/* Upload Form */}
      {showForm && (
        <Card className="border-primary/20 shadow-lg">
          <CardHeader className="bg-muted/50 border-b">
            <CardTitle>{editingId ? "Edit Material" : "Upload New Material"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <form onSubmit={handleSubmit}>
              {/* Drag & Drop Area */}
              <div className="space-y-2 mb-4">
                <Label>File Upload</Label>
                <div
                  className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition relative"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                >
                  <input 
                    ref={fileInputRef} 
                    type="file" 
                    className="hidden" 
                    accept="application/pdf,image/*,video/*,audio/*,.pdf,.jpg,.jpeg,.png,.gif,.mp4,.mp3,.wav" 
                    onChange={handleFileChange} 
                  />
                  
                  {previewUrl ? (
                    <div className="relative">
                      <img src={previewUrl} alt="Preview" className="max-h-48 mx-auto rounded-md shadow-sm object-contain" />                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); clearFile(); }}
                        className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-sm hover:bg-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <p className="mt-2 text-sm font-medium text-green-600">Image Selected</p>
                    </div>
                  ) : selectedFile ? (
                    <div className="flex flex-col items-center">
                      {getIcon(formData.material_type)}
                      <p className="font-medium mt-2">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); clearFile(); }}
                        className="mt-2 text-xs text-red-500 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-muted-foreground">
                      <Upload className="h-10 w-10 mb-2 opacity-50" />
                      <p className="font-medium">Click to upload or drag and drop</p>
                      <p className="text-xs">PDF, Video, Audio, or Image (Max 50MB)</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Titles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Title (English) *</Label>
                  <Input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Title (Arabic)</Label>
                  <Input value={formData.title_ar} onChange={e => setFormData({...formData, title_ar: e.target.value})} dir="rtl" />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
              </div>
              {/* Type & Level */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={formData.material_type} onValueChange={(val: any) => setFormData({...formData, material_type: val})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MATERIAL_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Level</Label>
                  <Select value={formData.level} onValueChange={(val: any) => setFormData({...formData, level: val})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEVELS.map(lvl => <SelectItem key={lvl} value={lvl}>{lvl.charAt(0).toUpperCase() + lvl.slice(1)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Sort Order */}
              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input type="number" value={formData.sort_order} onChange={e => setFormData({...formData, sort_order: Number(e.target.value)})} min={0} />
              </div>

              {/* Download Toggle */}
              <div className="flex items-center gap-2">
                <Switch
                  id="downloadable"
                  checked={formData.is_downloadable}
                  onCheckedChange={(checked) => setFormData({...formData, is_downloadable: checked})}
                />
                <Label htmlFor="downloadable">Allow students to download</Label>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4 justify-end">
                <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
                <Button type="submit" disabled={uploading || !formData.title}>
                  {uploading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-2" /> {editingId ? "Update" : "Upload"}</>
                  )}
                </Button>
              </div>
            </form>          </CardContent>
        </Card>
      )}

      {/* Materials List */}
      <div className="grid gap-3">
        {materials.length === 0 ? (
          <div className="text-center py-12 bg-muted/20 rounded-lg">
            <p className="text-muted-foreground">No materials uploaded yet.</p>
          </div>
        ) : (
          materials.map(m => (
            <Card key={m.id} className="hover:shadow-md transition">
              <CardContent className="p-4 flex gap-4 items-center">
                {/* Icon/Preview */}
                <div className="h-14 w-14 rounded bg-muted flex items-center justify-center shrink-0">
                  {m.file_url?.match(/\.(jpeg|jpg|png|gif|webp)$/i) ? (
                    <img src={m.file_url} alt="" className="h-full w-full object-cover rounded" />
                  ) : (
                    getIcon(m.material_type)
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{m.title}</h3>
                  {m.title_ar && <p className="text-sm text-muted-foreground truncate" dir="rtl">{m.title_ar}</p>}
                  <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                    <span className="bg-secondary px-2 py-0.5 rounded-full">{m.material_type}</span>
                    <span>{m.level}</span>
                    {m.file_size > 0 && <span>• {formatFileSize(m.file_size)}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button size="icon" variant="outline" asChild>
                    <a href={m.file_url} target="_blank" rel="noreferrer"><Eye className="h-4 w-4" /></a>
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => handleEdit(m)}><Edit className="h-4 w-4" /></Button>
                  <Button size="icon" variant="destructive" onClick={() => handleDelete(m.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}