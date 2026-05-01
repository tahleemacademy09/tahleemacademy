import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { storageSupabase } from "../../integrations/supabase/storageClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAcademicLevels, getLevelConfig, getLevelDisplay } from "@/hooks/useAcademicLevels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Edit, BookOpen, FileText, Upload, ExternalLink,
  Music, Video, Type, ChevronDown, ChevronUp, GripVertical,
  Save, X, Eye, Download, File, Image, FileSpreadsheet,
  Calendar, Layers, FolderOpen, Check, AlertCircle, Loader2
} from "lucide-react";

const MATERIAL_TYPES = ["PDF", "Video", "Audio", "Link", "Text", "Image", "Document"] as const;

type MatType = typeof MATERIAL_TYPES[number];

// ── Helpers ─────────────────────────────────────────────
const LEVEL_COLORS_STATIC: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  beginner:     { bg: "#F0FDF4", text: "#166534", border: "#86EFAC", dot: "#22C55E" },
  intermediate: { bg: "#EFF6FF", text: "#1E40AF", border: "#93C5FD", dot: "#3B82F6" },
  advanced:     { bg: "#FDF4FF", text: "#6B21A8", border: "#D8B4FE", dot: "#A855F7" },
};

const weekColors = [
  { bg: "#EFF6FF", border: "#BFDBFE", badge: "#1D4ED8", light: "#DBEAFE" },
  { bg: "#F0FDF4", border: "#BBF7D0", badge: "#15803D", light: "#DCFCE7" },
  { bg: "#FDF4FF", border: "#E9D5FF", badge: "#7C3AED", light: "#F3E8FF" },
  { bg: "#FFF7ED", border: "#FED7AA", badge: "#C2410C", light: "#FFEDD5" },
  { bg: "#FFF1F2", border: "#FECDD3", badge: "#BE123C", light: "#FFE4E6" },
  { bg: "#F0FDFA", border: "#99F6E4", badge: "#0F766E", light: "#CCFBF1" },
];

const matTypeConfig: Record<MatType, { icon: React.ElementType; bg: string; text: string; border: string }> = {
  PDF:      { icon: FileText,      bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" },
  Video:    { icon: Video,         bg: "#F0FDF4", text: "#16A34A", border: "#BBF7D0" },
  Audio:    { icon: Music,         bg: "#FDF4FF", text: "#9333EA", border: "#E9D5FF" },
  Link:     { icon: ExternalLink,  bg: "#F0FDFA", text: "#0D9488", border: "#99F6E4" },
  Text:     { icon: Type,          bg: "#FFFBEB", text: "#B45309", border: "#FDE68A" },
  Image:    { icon: Image,         bg: "#EFF6FF", text: "#2563EB", border: "#BFDBFE" },
  Document: { icon: FileSpreadsheet, bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE" },
};

const formatSize = (bytes?: number) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes/1024).toFixed(0)} KB`;
  return `${(bytes/1048576).toFixed(1)} MB`;
};

// ════════════════════════════════════════════════════════
const SyllabusManager = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: academicLevels = [] } = useAcademicLevels();
  const LEVELS = academicLevels.map(l => l.slug);
  const levelColors = Object.fromEntries(academicLevels.map(l => {
    const cfg = getLevelConfig(l.slug, academicLevels);
    return [l.slug, { bg: cfg.bg, text: cfg.color, border: cfg.border, dot: cfg.color }];
  }));
  const defaultLevel = LEVELS[0] || "";

  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [levelFilter, setLevelFilter]         = useState<string>(defaultLevel);
  const [activeTab, setActiveTab]             = useState<"syllabus"|"materials">("syllabus");

  // Syllabus state
  const [syllOpen,   setSyllOpen]   = useState(false);
  const [editSyllId, setEditSyllId] = useState<string|null>(null);
  const [syllForm,   setSyllForm]   = useState({ title: "", description: "", objectives: "", week_number: 1 });
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());

  // Materials state
  const [matOpen,    setMatOpen]    = useState(false);
  const [editMatId,  setEditMatId]  = useState<string|null>(null);
  const [uploadFile, setUploadFile] = useState<File|null>(null);
  const [uploading,  setUploading]  = useState(false);
  const [dragOver,   setDragOver]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [matForm, setMatForm] = useState({
    title: "", material_type: "PDF" as MatType,
    file_url: "", content: "", is_downloadable: true, sort_order: 0,
  });

  // ── Queries ──────────────────────────────────────────
  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("*").order("title");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: syllabusItems = [], isLoading: syllLoading } = useQuery({
    queryKey: ["admin-syllabus", selectedSubject, levelFilter],
    enabled: !!selectedSubject,
    queryFn: async () => {
      const { data, error } = await supabase.from("subject_syllabus")
        .select("*").eq("subject_id", selectedSubject!).order("week_number");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: materialItems = [], isLoading: matLoading } = useQuery({
    queryKey: ["admin-materials", selectedSubject],
    enabled: !!selectedSubject,
    queryFn: async () => {
      const { data, error } = await supabase.from("subject_materials")
        .select("*").eq("subject_id", selectedSubject!).order("sort_order").order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const selectedSubjectData = subjects.find((s: any) => s.id === selectedSubject);

  // ── Syllabus mutations ───────────────────────────────
  const saveSyllabus = useMutation({
    mutationFn: async () => {
      const payload = {
        subject_id: selectedSubject!,
        week_number: syllForm.week_number,
        title: syllForm.title,
        description: syllForm.description || null,
        level: levelFilter,
        objectives: syllForm.objectives ? syllForm.objectives.split("\n").filter(Boolean) : null,
      };
      if (editSyllId) {
        const { error } = await supabase.from("subject_syllabus").update(payload).eq("id", editSyllId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subject_syllabus").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-syllabus"] });
      qc.invalidateQueries({ queryKey: ["syllabus"] });
      setSyllOpen(false); setEditSyllId(null);
      setSyllForm({ title: "", description: "", objectives: "", week_number: syllabusItems.length + 2 });
      toast({ title: t("Saved", "تم الحفظ") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteSyllabus = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subject_syllabus").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-syllabus"] });
      qc.invalidateQueries({ queryKey: ["syllabus"] });
    },
  });

  // ── Material mutations ───────────────────────────────
  const handleFileUpload = async (file: File): Promise<string> => {
    const ext  = file.name.split(".").pop();
    const path = `materials/${selectedSubject}/${crypto.randomUUID()}.${ext}`;
    const { error } = await storageSupabase.storage.from("subject-files").upload(path, file);
    if (error) throw error;
    return path;
  };

  const saveMaterial = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      setUploading(true);
      let fileUrl = matForm.file_url;
      let fileType = "";
      let fileSize = 0;

      if (uploadFile) {
        fileUrl  = await handleFileUpload(uploadFile);
        fileType = uploadFile.type;
        fileSize = uploadFile.size;
      }

      const payload: any = {
        subject_id:      selectedSubject!,
        title:           matForm.title,
        material_type:   matForm.material_type,
        file_url:        fileUrl || null,
        content:         matForm.content || null,
        is_downloadable: matForm.is_downloadable,
        sort_order:      matForm.sort_order,
        level:           levelFilter,
        ...(fileType ? { file_type: fileType } : {}),
        ...(fileSize ? { file_size: fileSize } : {}),
      };

      if (editMatId) {
        const { error } = await supabase.from("subject_materials").update(payload).eq("id", editMatId);
        if (error) throw error;
      } else {
        payload.uploaded_by = user.id;
        const { error } = await supabase.from("subject_materials").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-materials"] });
      qc.invalidateQueries({ queryKey: ["subject-materials-all"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      setMatOpen(false); setEditMatId(null); setUploadFile(null); setUploading(false);
      setMatForm({ title: "", material_type: "PDF", file_url: "", content: "", is_downloadable: true, sort_order: 0 });
      toast({ title: t("Material saved", "تم حفظ المادة") });
    },
    onError: (e: any) => { setUploading(false); toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  const deleteMaterial = useMutation({
    mutationFn: async (mat: any) => {
      if (mat.file_url && !mat.file_url.startsWith("http")) {
        await storageSupabase.storage.from("subject-files").remove([mat.file_url]);
      }
      const { error } = await supabase.from("subject_materials").delete().eq("id", mat.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-materials"] });
      qc.invalidateQueries({ queryKey: ["subject-materials-all"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      toast({ title: t("Deleted", "تم الحذف") });
    },
  });

  const openSignedUrl = async (path: string) => {
    if (path.startsWith("http")) { window.open(path, "_blank"); return; }
    const { data } = await storageSupabase.storage.from("subject-files").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const lc = levelColors[levelFilter];

  // ════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* ── Page Header ─────────────────────────────── */}
      <div className="bg-white border-b px-6 py-5">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-emerald-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{t("Syllabus & Materials", "المنهج والمواد")}</h1>
            <p className="text-sm text-gray-500">{t("Manage weekly content and learning files", "إدارة المحتوى الأسبوعي والملفات التعليمية")}</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5 max-w-5xl mx-auto">

        {/* ── Subject + Level selectors ─────────────── */}
        <div className="bg-white rounded-2xl border p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Select Subject & Level</p>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                <FolderOpen className="h-3.5 w-3.5 inline mr-1" />Subject
              </Label>
              <Select value={selectedSubject || ""} onValueChange={v => setSelectedSubject(v)}>
                <SelectTrigger className="rounded-xl h-11">
                  <SelectValue placeholder="Choose a subject…" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="font-medium">{s.title}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-52">
              <Label className="text-xs font-semibold text-gray-600 mb-1.5 block">
                <Layers className="h-3.5 w-3.5 inline mr-1" />Level
              </Label>
              <Select value={levelFilter} onValueChange={v => setLevelFilter(v as Level)}>
                <SelectTrigger className="rounded-xl h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map(l => (
                    <SelectItem key={l} value={l}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: levelColors[l].dot }} />
                        {l.charAt(0).toUpperCase() + l.slice(1)}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {!selectedSubject ? (
          <div className="bg-white rounded-2xl border p-16 text-center shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <BookOpen className="h-8 w-8 text-gray-300" />
            </div>
            <p className="font-semibold text-gray-500">Select a subject to get started</p>
            <p className="text-sm text-gray-400 mt-1">Choose from the dropdown above</p>
          </div>
        ) : (
          <>
            {/* ── Subject info strip ─────────────────── */}
            <div className="rounded-2xl border p-4 flex items-center gap-3" style={{ background: lc.bg, borderColor: lc.border }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm text-white" style={{ background: lc.dot }}>
                {selectedSubjectData?.title?.[0] || "S"}
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm" style={{ color: lc.text }}>{selectedSubjectData?.title}</p>
                <p className="text-xs" style={{ color: lc.text, opacity: 0.7 }}>{selectedSubjectData?.title_ar}</p>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full text-white" style={{ background: lc.dot }}>
                {levelFilter.charAt(0).toUpperCase() + levelFilter.slice(1)}
              </span>
            </div>

            {/* ── Tab switcher ─────────────────────── */}
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              <div className="flex border-b">
                {(["syllabus", "materials"] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className="flex-1 flex items-center justify-center gap-2 py-4 text-sm font-semibold transition-all"
                    style={{
                      color: activeTab === tab ? "#064E3B" : "#6B7280",
                      borderBottom: activeTab === tab ? "2px solid #064E3B" : "2px solid transparent",
                      background: activeTab === tab ? "#F0FDF4" : "transparent",
                    }}>
                    {tab === "syllabus" ? <Calendar className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    {tab === "syllabus" ? t("Syllabus", "المنهج") : t("Materials", "المواد")}
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: activeTab === tab ? "#D1FAE5" : "#F3F4F6", color: activeTab === tab ? "#065F46" : "#9CA3AF" }}>
                      {tab === "syllabus" ? syllabusItems.length : materialItems.length}
                    </span>
                  </button>
                ))}
              </div>

              <div className="p-5">

                {/* ══════ SYLLABUS TAB ══════ */}
                {activeTab === "syllabus" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-500">{syllabusItems.length} weeks configured</p>
                      <Button size="sm" className="gap-2 rounded-xl"
                        onClick={() => { setEditSyllId(null); setSyllForm({ title: "", description: "", objectives: "", week_number: syllabusItems.length + 1 }); setSyllOpen(true); }}>
                        <Plus className="h-4 w-4" /> Add Week
                      </Button>
                    </div>

                    {syllLoading ? (
                      <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl"/>)}</div>
                    ) : syllabusItems.length === 0 ? (
                      <div className="text-center py-12">
                        <Calendar className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-400 font-medium">No weeks added yet</p>
                        <p className="text-sm text-gray-300 mt-1">Click "Add Week" to build your syllabus</p>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="absolute left-[21px] top-8 bottom-8 w-0.5 bg-gradient-to-b from-emerald-200 to-transparent" />
                        <div className="space-y-3">
                          {syllabusItems.map((s, idx) => {
                            const wc   = weekColors[idx % weekColors.length];
                            const isEx = expanded.has(s.id);
                            const hasDetail = s.description || (s.objectives && (s.objectives as string[]).length > 0);
                            return (
                              <div key={s.id} className="flex gap-3">
                                <div className="relative z-10 shrink-0">
                                  <div className="w-11 h-11 rounded-full flex items-center justify-center font-black text-xs text-white shadow-sm"
                                    style={{ background: wc.badge }}>
                                    W{s.week_number}
                                  </div>
                                </div>
                                <div className="flex-1 rounded-2xl border overflow-hidden shadow-sm"
                                  style={{ background: wc.bg, borderColor: wc.border }}>
                                  <div className="flex items-center gap-2 p-3.5">
                                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => hasDetail && setExpanded(prev => { const n=new Set(prev); n.has(s.id)?n.delete(s.id):n.add(s.id); return n; })}>
                                      <p className="font-bold text-sm" style={{ color: wc.badge }}>{s.title}</p>
                                      {!isEx && s.description && (
                                        <p className="text-xs mt-0.5 truncate" style={{ color: wc.badge, opacity: 0.65 }}>{s.description}</p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg"
                                        onClick={() => { setEditSyllId(s.id); setSyllForm({ title: s.title, description: s.description||"", objectives: s.objectives?(s.objectives as string[]).join("\n"):"", week_number: s.week_number }); setSyllOpen(true); }}>
                                        <Edit className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-red-400"
                                        onClick={() => deleteSyllabus.mutate(s.id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                      {hasDetail && (
                                        <button className="h-7 w-7 flex items-center justify-center" style={{ color: wc.badge }}
                                          onClick={() => setExpanded(prev => { const n=new Set(prev); n.has(s.id)?n.delete(s.id):n.add(s.id); return n; })}>
                                          {isEx ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  {isEx && hasDetail && (
                                    <div className="px-4 pb-4 pt-1 space-y-3 border-t" style={{ borderColor: wc.border }}>
                                      {s.description && <p className="text-sm leading-relaxed" style={{ color: wc.badge, opacity: 0.85 }}>{s.description}</p>}
                                      {s.objectives && (s.objectives as string[]).length > 0 && (
                                        <div>
                                          <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: wc.badge }}>Objectives</p>
                                          <div className="space-y-1.5">
                                            {(s.objectives as string[]).map((obj, i) => (
                                              <div key={i} className="flex items-start gap-2">
                                                <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold mt-0.5" style={{ background: wc.badge }}>{i+1}</div>
                                                <span className="text-sm" style={{ color: wc.badge, opacity: 0.9 }}>{obj}</span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ══════ MATERIALS TAB ══════ */}
                {activeTab === "materials" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-500">{materialItems.length} materials</p>
                      <Button size="sm" className="gap-2 rounded-xl"
                        onClick={() => { setEditMatId(null); setUploadFile(null); setMatForm({ title: "", material_type: "PDF", file_url: "", content: "", is_downloadable: true, sort_order: materialItems.length }); setMatOpen(true); }}>
                        <Upload className="h-4 w-4" /> Upload Material
                      </Button>
                    </div>

                    {matLoading ? (
                      <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl"/>)}</div>
                    ) : materialItems.length === 0 ? (
                      <div className="text-center py-12">
                        <File className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-400 font-medium">No materials yet</p>
                        <p className="text-sm text-gray-300 mt-1">Upload files or paste links for students</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {materialItems.map((mat: any) => {
                          const type = (mat.material_type || "PDF") as MatType;
                          const cfg  = matTypeConfig[type] || matTypeConfig["PDF"];
                          const Icon = cfg.icon;
                          return (
                            <div key={mat.id} className="flex items-center gap-3 p-3.5 rounded-2xl border transition-all hover:shadow-sm"
                              style={{ background: cfg.bg, borderColor: cfg.border }}>
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${cfg.text}18` }}>
                                <Icon className="h-5 w-5" style={{ color: cfg.text }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm truncate">{mat.title}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ background: `${cfg.text}18`, color: cfg.text }}>{type}</span>
                                  {mat.file_size && <span className="text-xs text-gray-400">{formatSize(mat.file_size)}</span>}
                                  {mat.is_downloadable && <span className="text-xs text-gray-400">• Downloadable</span>}
                                  <span className="text-xs text-gray-300">{new Date(mat.created_at).toLocaleDateString()}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {mat.file_url && (
                                  <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg"
                                    onClick={() => openSignedUrl(mat.file_url)}>
                                    <Eye className="h-3.5 w-3.5 text-gray-500" />
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg"
                                  onClick={() => { setEditMatId(mat.id); setUploadFile(null); setMatForm({ title: mat.title, material_type: mat.material_type||"PDF", file_url: mat.file_url||"", content: mat.content||"", is_downloadable: mat.is_downloadable??true, sort_order: mat.sort_order||0 }); setMatOpen(true); }}>
                                  <Edit className="h-3.5 w-3.5 text-gray-500" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg"
                                  onClick={() => deleteMaterial.mutate(mat)}>
                                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ══ SYLLABUS DIALOG ══════════════════════════════ */}
      <Dialog open={syllOpen} onOpenChange={v => { setSyllOpen(v); if (!v) setEditSyllId(null); }}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-emerald-600" />
              {editSyllId ? "Edit Week" : "Add Week"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-semibold text-gray-600">Week #</Label>
                <Input type="number" className="mt-1 rounded-xl" value={syllForm.week_number}
                  onChange={e => setSyllForm({ ...syllForm, week_number: parseInt(e.target.value)||1 })} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs font-semibold text-gray-600">Title *</Label>
                <Input className="mt-1 rounded-xl" value={syllForm.title}
                  onChange={e => setSyllForm({ ...syllForm, title: e.target.value })}
                  placeholder="e.g. Surah Al-Fatiha (1–7)" />
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-600">Description</Label>
              <Textarea className="mt-1 rounded-xl" rows={3} value={syllForm.description}
                onChange={e => setSyllForm({ ...syllForm, description: e.target.value })}
                placeholder="What will students learn this week?" />
            </div>
            <div>
              <Label className="text-xs font-semibold text-gray-600">Learning Objectives <span className="font-normal text-gray-400">(one per line)</span></Label>
              <Textarea className="mt-1 rounded-xl font-mono text-sm" rows={4} value={syllForm.objectives}
                onChange={e => setSyllForm({ ...syllForm, objectives: e.target.value })}
                placeholder={"Listen to the ayah 5 times\nRecite each ayah 10 times"} />
            </div>
            <Button className="w-full rounded-xl h-11 gap-2" onClick={() => saveSyllabus.mutate()}
              disabled={!syllForm.title || saveSyllabus.isPending}>
              {saveSyllabus.isPending ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4"/>}
              {editSyllId ? "Save Changes" : "Add Week"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ MATERIAL DIALOG ══════════════════════════════ */}
      <Dialog open={matOpen} onOpenChange={v => { setMatOpen(v); if (!v) { setEditMatId(null); setUploadFile(null); } }}>
        <DialogContent className="max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-emerald-600" />
              {editMatId ? "Edit Material" : "Upload Material"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-xs font-semibold text-gray-600">Title *</Label>
              <Input className="mt-1 rounded-xl" value={matForm.title}
                onChange={e => setMatForm({ ...matForm, title: e.target.value })}
                placeholder="e.g. Week 1 Worksheet" />
            </div>

            <div>
              <Label className="text-xs font-semibold text-gray-600 block mb-2">Type</Label>
              <div className="grid grid-cols-4 gap-2">
                {MATERIAL_TYPES.map(mt => {
                  const cfg = matTypeConfig[mt];
                  const Icon = cfg.icon;
                  const sel  = matForm.material_type === mt;
                  return (
                    <button key={mt} onClick={() => setMatForm({ ...matForm, material_type: mt })}
                      className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all text-xs font-semibold"
                      style={{ borderColor: sel ? cfg.text : "#E5E7EB", background: sel ? cfg.bg : "#fff", color: sel ? cfg.text : "#6B7280" }}>
                      <Icon className="h-4 w-4" />
                      {mt}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* File upload drop zone */}
            {matForm.material_type !== "Link" && matForm.material_type !== "Text" && (
              <div>
                <Label className="text-xs font-semibold text-gray-600 block mb-2">File Upload</Label>
                <input ref={fileRef} id="sm-syllabus-file" type="file"
                  style={{ position:"absolute",width:1,height:1,opacity:0,overflow:"hidden",pointerEvents:"none" }} accept="*/*"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setUploadFile(f); if (!matForm.title) setMatForm(p => ({ ...p, title: f.name.replace(/\.[^/.]+$/, "") })); } }} />
                <label htmlFor="sm-syllabus-file"
                  className="block relative border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer"
                  style={{ borderColor: dragOver ? "#064E3B" : "#D1D5DB", background: dragOver ? "#F0FDF4" : "#FAFAFA" }}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) { setUploadFile(f); if (!matForm.title) setMatForm(p => ({ ...p, title: f.name.replace(/\.[^/.]+$/, "") })); } }}>
                  {uploadFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                        <Check className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-sm text-gray-700 truncate max-w-[200px]">{uploadFile.name}</p>
                        <p className="text-xs text-gray-400">{formatSize(uploadFile.size)}</p>
                      </div>
                      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0"
                        onClick={e => { e.stopPropagation(); setUploadFile(null); }}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm font-medium text-gray-500">Drop a file here or click to browse</p>
                      <p className="text-xs text-gray-400 mt-1">PDF, Word, Excel, Images, Audio, Video — all formats supported</p>
                    </>
                  )}
                </label>
                <p className="text-xs text-gray-400 mt-2 text-center">— or paste a URL below —</p>
                <Input className="mt-2 rounded-xl" value={matForm.file_url}
                  onChange={e => setMatForm({ ...matForm, file_url: e.target.value })}
                  placeholder="https://..." />
              </div>
            )}

            {matForm.material_type === "Link" && (
              <div>
                <Label className="text-xs font-semibold text-gray-600">URL *</Label>
                <Input className="mt-1 rounded-xl" value={matForm.file_url}
                  onChange={e => setMatForm({ ...matForm, file_url: e.target.value })}
                  placeholder="https://..." />
              </div>
            )}

            {matForm.material_type === "Text" && (
              <div>
                <Label className="text-xs font-semibold text-gray-600">Content</Label>
                <Textarea className="mt-1 rounded-xl" rows={5} value={matForm.content}
                  onChange={e => setMatForm({ ...matForm, content: e.target.value })} />
              </div>
            )}

            <div className="flex items-center justify-between p-3.5 rounded-xl bg-gray-50 border">
              <div>
                <p className="text-sm font-semibold text-gray-700">Allow Download</p>
                <p className="text-xs text-gray-400">Students can download this file</p>
              </div>
              <Switch checked={matForm.is_downloadable}
                onCheckedChange={v => setMatForm({ ...matForm, is_downloadable: v })} />
            </div>

            <Button className="w-full rounded-xl h-11 gap-2" onClick={() => saveMaterial.mutate()}
              disabled={!matForm.title || saveMaterial.isPending || uploading}>
              {(saveMaterial.isPending || uploading)
                ? <><Loader2 className="h-4 w-4 animate-spin"/> Uploading…</>
                : <><Upload className="h-4 w-4"/> {editMatId ? "Save Changes" : "Upload Material"}</>
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SyllabusManager;
