import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Upload,
  FileText,
  Video,
  AudioLines,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Edit,
  Plus,
  CheckCircle,
  AlertCircle,
  Download,
} from "lucide-react";

// ── Constants matching your SQL schema ──────────────────────────────────────
const MATERIAL_TYPES = [
  { value: "PDF", label: "PDF Document", icon: FileText },
  { value: "Video", label: "Video", icon: Video },
  { value: "Audio", label: "Audio", icon: AudioLines },
  { value: "Image", label: "Image", icon: ImageIcon },
  { value: "Document", label: "Other Document", icon: FileText },
] as const;

const LEVELS = ["beginner", "intermediate", "advanced"] as const;
type MaterialType = (typeof MATERIAL_TYPES)[number]["value"];
type Level = (typeof LEVELS)[number];

interface SubjectMaterial {
  id: string;
  subject_id: string;
  session_id: string | null;
  title: string;
  title_ar: string;
  description: string;
  material_type: MaterialType;
  content: string;
  file_url: string;
  file_size: number;
  level: Level;
  levels: string[];
  sort_order: number;
  is_downloadable: boolean;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

export default function MaterialsManagement() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [materials, setMaterials] = useState<SubjectMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state - matches SQL columns exactly
  const [formData, setFormData] = useState({
    title: "",
    title_ar: "",
    description: "",
    material_type: "PDF" as MaterialType,
    content: "",
    file_url: "",
    file_size: 0,
    level: "beginner" as Level,
    levels: [] as Level[],
    sort_order: 0,
    is_downloadable: true,
    session_id: null as string | null,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "";
    message: string;
  }>({ type: "", message: "" });

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

  // ── File Upload to Supabase Storage ─────────────────────────────────────
  const uploadFile = async (file: File): Promise<string> => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `materials/${subjectId}/${fileName}`;

    const { error: uploadError, data } = await supabase.storage
      .from("subject-materials")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) throw uploadError;

    const {
      data: { publicUrl },
    } = supabase.storage.from("subject-materials").getPublicUrl(filePath);
    return publicUrl;
  };

  // ── Form Handlers ───────────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = [
        "application/pdf",
        "video/mp4",
        "audio/mpeg",
        "audio/wav",
        "image/jpeg",
        "image/png",
        "image/gif",
      ];
      if (!allowedTypes.includes(file.type)) {
        setFeedback({
          type: "error",
          message: "Please upload a PDF, video, audio, or image file.",
        });
        return;
      }
      setSelectedFile(file);
      setFormData((prev) => ({ ...prev, file_size: file.size }));
    }
  };

  const toggleLevel = (level: Level) => {
    setFormData((prev) => ({
      ...prev,
      levels: prev.levels.includes(level)
        ? prev.levels.filter((l) => l !== level)
        : [...prev.levels, level],
    }));
  };

  const resetForm = () => {
    setFormData({
      title: "",
      title_ar: "",
      description: "",
      material_type: "PDF",
      content: "",
      file_url: "",
      file_size: 0,
      level: "beginner",
      levels: [],
      sort_order: 0,      is_downloadable: true,
      session_id: null,
    });
    setSelectedFile(null);
    setEditingId(null);
    setShowForm(false);
    setFeedback({ type: "", message: "" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId || !user) return;

    setUploading(true);
    setFeedback({ type: "", message: "" });

    try {
      let fileUrl = formData.file_url;

      // Upload file if selected
      if (selectedFile) {
        fileUrl = await uploadFile(selectedFile);
      }

      const materialData = {
        subject_id: subjectId,
        title: formData.title,
        title_ar: formData.title_ar,
        description: formData.description,
        material_type: formData.material_type,
        content: formData.content,
        file_url: fileUrl,
        file_size: formData.file_size,
        level: formData.level,
        levels: formData.levels.length > 0 ? formData.levels : [formData.level],
        sort_order: formData.sort_order,
        is_downloadable: formData.is_downloadable,
        uploaded_by: user.id,
        session_id: formData.session_id,
      };

      let error;
      if (editingId) {
        // Update existing
        ({ error } = await supabase
          .from("subject_materials")
          .update(materialData)
          .eq("id", editingId));
      } else {
        // Insert new        ({ error } = await supabase
          .from("subject_materials")
          .insert([materialData]));
      }

      if (error) throw error;

      setFeedback({
        type: "success",
        message: editingId ? "Material updated!" : "Material uploaded!",
      });

      await fetchMaterials();
      resetForm();
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (material: SubjectMaterial) => {
    setFormData({
      title: material.title,
      title_ar: material.title_ar,
      description: material.description,
      material_type: material.material_type,
      content: material.content,
      file_url: material.file_url,
      file_size: material.file_size,
      level: material.level,
      levels: material.levels || [material.level],
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
      await fetchMaterials();      setFeedback({ type: "success", message: "Material deleted" });
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message });
    }
  };

  const getIcon = (type: MaterialType) => {
    const found = MATERIAL_TYPES.find((t) => t.value === type);
    const Icon = found?.icon || FileText;
    return <Icon className="w-5 h-5" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Course Materials</h1>
          <p className="text-muted-foreground">
            Upload PDFs, videos, audio, and documents for this subject
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Add Material
        </Button>
      </div>

      {/* Feedback */}
      {feedback.message && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg ${
            feedback.type === "success"              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          {feedback.message}
        </div>
      )}

      {/* Upload Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>
              {editingId ? "Edit Material" : "Upload New Material"}
            </CardTitle>
            <CardDescription>
              Fill in the details below. File upload is optional if adding text content.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Title Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title (English) *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, title: e.target.value }))
                    }
                    required
                    placeholder="Introduction to Tajweed"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title_ar">Title (Arabic)</Label>
                  <Input
                    id="title_ar"
                    value={formData.title_ar}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        title_ar: e.target.value,
                      }))                    }
                    placeholder="مقدمة في التجويد"
                    dir="rtl"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Brief description of this material..."
                  rows={3}
                />
              </div>

              {/* Material Type & Level */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={formData.material_type}
                    onValueChange={(value: MaterialType) =>
                      setFormData((prev) => ({ ...prev, material_type: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MATERIAL_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <type.icon className="w-4 h-4" />
                            {type.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Primary Level</Label>
                  <Select
                    value={formData.level}
                    onValueChange={(value: Level) =>
                      setFormData((prev) => ({ ...prev, level: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVELS.map((lvl) => (
                        <SelectItem key={lvl} value={lvl}>
                          {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Sort Order</Label>
                  <Input
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        sort_order: parseInt(e.target.value) || 0,
                      }))
                    }
                    min={0}
                  />
                </div>
              </div>

              {/* Multi-Level Checkboxes */}
              <div className="space-y-2">
                <Label>Visible to Levels</Label>
                <div className="flex gap-4">
                  {LEVELS.map((lvl) => (
                    <label key={lvl} className="flex items-center gap-2">
                      <Checkbox
                        checked={formData.levels.includes(lvl)}
                        onCheckedChange={() => toggleLevel(lvl)}
                      />
                      <span className="text-sm capitalize">
                        {lvl}
                      </span>                    </label>
                  ))}
                </div>
              </div>

              {/* File Upload */}
              <div className="space-y-2">
                <Label>Upload File (PDF, Video, Audio, Image)</Label>
                <div className="flex items-center gap-4">
                  <Input
                    type="file"
                    accept=".pdf,.mp4,.mp3,.wav,.jpg,.jpeg,.png,.gif"
                    onChange={handleFileSelect}
                    className="max-w-md"
                  />
                  {selectedFile && (
                    <span className="text-sm text-muted-foreground">
                      {selectedFile.name} ({formatFileSize(selectedFile.size)})
                    </span>
                  )}
                </div>
                {formData.file_url && !selectedFile && (
                  <p className="text-sm text-muted-foreground">
                    Current file:{" "}
                    <a
                      href={formData.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-600 hover:underline"
                    >
                      View
                    </a>
                  </p>
                )}
              </div>

              {/* Text Content (optional) */}
              <div className="space-y-2">
                <Label htmlFor="content">Text Content (Optional)</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, content: e.target.value }))
                  }
                  placeholder="Add notes, instructions, or text content here..."
                  rows={4}
                />
              </div>
              {/* Download Toggle */}
              <div className="flex items-center gap-2">
                <Switch
                  id="downloadable"
                  checked={formData.is_downloadable}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, is_downloadable: checked }))
                  }
                />
                <Label htmlFor="downloadable">Allow students to download</Label>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4">
                <Button type="submit" disabled={uploading || !formData.title}>
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : editingId ? (
                    "Update Material"
                  ) : (
                    "Upload Material"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetForm}
                  disabled={uploading}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Materials List */}
      <div className="space-y-3">
        {materials.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No materials uploaded yet.</p>
              <Button
                variant="link"
                onClick={() => { resetForm(); setShowForm(true); }}                className="mt-2"
              >
                Add your first material
              </Button>
            </CardContent>
          </Card>
        ) : (
          materials.map((material) => (
            <Card key={material.id} className="hover:shadow-md transition">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                      {getIcon(material.material_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{material.title}</h3>
                        {material.title_ar && (
                          <span className="text-sm text-muted-foreground" dir="rtl">
                            ({material.title_ar})
                          </span>
                        )}
                        <span className="px-2 py-0.5 text-xs bg-muted rounded">
                          {material.material_type}
                        </span>
                      </div>
                      {material.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {material.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="capitalize">{material.level}</span>
                        {material.file_size > 0 && (
                          <span>• {formatFileSize(material.file_size)}</span>
                        )}
                        {material.is_downloadable && (
                          <span className="flex items-center gap-1">
                            <Download className="w-3 h-3" /> Downloadable
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {material.file_url && (
                      <Button
                        variant="ghost"
                        size="icon"                        asChild
                        title="View file"
                      >
                        <a
                          href={material.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(material)}
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(material.id)}
                      title="Delete"
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}