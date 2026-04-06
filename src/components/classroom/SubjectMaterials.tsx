/*
  SubjectMaterials.tsx
  Used in LearningHub and LiveClasses.
  Fetches materials for a subject and renders them with the inline MaterialsViewer.
  Teachers/admins also see an upload button.
*/
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import MaterialsViewer from "@/components/classroom/MaterialsViewer";
import { Upload, Plus, Loader2, X, Check } from "lucide-react";

const SubjectMaterials = ({ subjectId }: { subjectId: string }) => {
  const { t } = useLanguage();
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const isPrivileged = hasRole("admin") || hasRole("teacher");

  const [open,      setOpen]      = useState(false);
  const [title,     setTitle]     = useState("");
  const [file,      setFile]      = useState<File | null>(null);
  const [dragOver,  setDragOver]  = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Fetch materials ── */
  const { data: materials = [], isLoading } = useQuery({
    queryKey: ["materials", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subject_materials")
        .select("*")
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  /* ── Fetch sessions (for grouping) ── */
  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions-light", subjectId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("class_sessions")
        .select("id, session_number, topic")
        .eq("subject_id", subjectId)
        .order("session_number");
      return data || [];
    },
  });

  /* ── Upload mutation ── */
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !title || !user) throw new Error("Missing data");
      const ext  = file.name.split(".").pop();
      const path = `materials/${subjectId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("subject-files")
        .upload(path, file);
      if (uploadErr) throw uploadErr;
      const { error } = await supabase.from("subject_materials").insert({
        subject_id:  subjectId,
        title,
        file_url:    path,
        file_type:   file.type,
        file_size:   file.size,
        material_type: detectMaterialType(file),
        uploaded_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials", subjectId] });
      qc.invalidateQueries({ queryKey: ["subject-materials-all", subjectId] });
      setOpen(false); setTitle(""); setFile(null);
      toast({ title: t("Uploaded!", "تم الرفع!") });
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const detectMaterialType = (f: File): string => {
    if (f.type.includes("pdf"))   return "PDF";
    if (f.type.includes("video")) return "Video";
    if (f.type.includes("audio")) return "Audio";
    if (f.type.includes("image")) return "Image";
    if (f.type.includes("word") || f.type.includes("document")) return "Document";
    if (f.type.includes("sheet") || f.type.includes("excel"))   return "Document";
    if (f.type.includes("presentation") || f.type.includes("powerpoint")) return "Document";
    return "PDF";
  };

  const handleFileDrop = (f: File) => {
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^/.]+$/, ""));
  };

  const fmtSize = (b: number) =>
    b < 1048576 ? `${(b/1024).toFixed(0)} KB` : `${(b/1048576).toFixed(1)} MB`;

  if (isLoading) return (
    <div className="space-y-3">
      {[1,2,3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />)}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Upload button — teachers/admins only */}
      {isPrivileged && (
        <div className="flex justify-end">
          <Button size="sm" className="gap-2 rounded-xl" onClick={() => setOpen(true)}>
            <Upload className="h-4 w-4" />
            {t("Upload Material", "رفع مادة")}
          </Button>
        </div>
      )}

      {/* Inline viewer — handles all file types */}
      <MaterialsViewer materials={materials as any[]} sessions={sessions as any[]} />

      {/* Upload dialog */}
      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setFile(null); setTitle(""); } }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              {t("Upload Material", "رفع مادة")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">
                {t("Title", "العنوان")} *
              </Label>
              <Input
                className="mt-1 rounded-xl"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={t("e.g. Week 1 Worksheet", "مثال: ورقة عمل الأسبوع الأول")}
              />
            </div>

            {/* Drop zone */}
            <div>
              <Label className="text-xs font-semibold text-muted-foreground block mb-2">
                {t("File", "الملف")}
              </Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="*/*"
                style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileDrop(f); }}
              />
              <div
                className="rounded-2xl border-2 border-dashed transition-all cursor-pointer"
                style={{
                  borderColor: dragOver ? "#064E3B" : "#D1D5DB",
                  background:  dragOver ? "#F0FDF4" : "#FAFAFA",
                  padding: 24,
                }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileDrop(f); }}
              >
                {file ? (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                      <Check className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-700 truncate">{file.name}</p>
                      <p className="text-xs text-gray-400">{fmtSize(file.size)} · {file.type || "file"}</p>
                    </div>
                    <button
                      className="text-gray-400 hover:text-gray-600"
                      onClick={e => { e.preventDefault(); setFile(null); }}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="text-center">
                    <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-500">
                      {t("Drop a file or click to browse", "اسحب ملفًا أو انقر للاختيار")}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      PDF, Word, Excel, Images, Audio, Video — all supported
                    </p>
                  </div>
                )}
              </div>
            </div>

            <Button
              className="w-full rounded-xl h-11 gap-2"
              onClick={() => uploadMutation.mutate()}
              disabled={!file || !title || uploadMutation.isPending}
            >
              {uploadMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("Uploading…", "جاري الرفع…")}</>
                : <><Upload className="h-4 w-4" /> {t("Upload", "رفع")}</>
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubjectMaterials;
