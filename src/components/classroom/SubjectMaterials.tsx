import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { FileText, Upload, Download, Trash2, Plus, File, Image, Music, FileSpreadsheet } from "lucide-react";

const getFileIcon = (type?: string) => {
  if (!type) return File;
  if (type.includes("image")) return Image;
  if (type.includes("audio")) return Music;
  if (type.includes("spreadsheet") || type.includes("excel")) return FileSpreadsheet;
  return FileText;
};

const SubjectMaterials = ({ subjectId }: { subjectId: string }) => {
  const { t } = useLanguage();
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const isPrivileged = hasRole("admin") || hasRole("teacher");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const { data: materials, isLoading } = useQuery({
    queryKey: ["materials", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("subject_materials")
        .select("*").eq("subject_id", subjectId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || !title || !user) throw new Error("Missing data");
      const path = `materials/${subjectId}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("subject-files").upload(path, file);
      if (uploadError) throw uploadError;
      const { error } = await supabase.from("subject_materials").insert({
        subject_id: subjectId,
        title,
        file_url: path,
        file_type: file.type,
        file_size: file.size,
        topic: topic || null,
        uploaded_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials", subjectId] });
      setUploadOpen(false);
      setTitle("");
      setTopic("");
      setFile(null);
      toast({ title: t("Material uploaded", "تم رفع المادة") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (m: any) => {
      await supabase.storage.from("subject-files").remove([m.file_url]);
      const { error } = await supabase.from("subject_materials").delete().eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials", subjectId] });
      toast({ title: t("Deleted", "تم الحذف") });
    },
  });

  const downloadFile = async (path: string, name: string) => {
    const { data } = await supabase.storage.from("subject-files").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  if (isLoading) return <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}</div>;

  return (
    <div className="space-y-4">
      {isPrivileged && (
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Plus className="h-3 w-3" />{t("Upload Material", "رفع مادة")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("Upload Material", "رفع مادة")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{t("Title", "العنوان")}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              <div><Label>{t("Topic", "الموضوع")}</Label><Input value={topic} onChange={(e) => setTopic(e.target.value)} /></div>
              <div><Label>{t("File", "الملف")}</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
              <Button className="w-full" onClick={() => uploadMutation.mutate()} disabled={!file || !title || uploadMutation.isPending}>
                <Upload className="h-4 w-4 me-2" />{uploadMutation.isPending ? t("Uploading...", "جاري الرفع...") : t("Upload", "رفع")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {!materials?.length ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
          {t("No materials yet", "لا توجد مواد بعد")}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {materials.map((m) => {
            const Icon = getFileIcon(m.file_type || undefined);
            return (
              <Card key={m.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{m.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {m.topic && <span>{m.topic}</span>}
                      {m.file_size && <span>{(m.file_size / 1048576).toFixed(1)} MB</span>}
                      <span>{new Date(m.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => downloadFile(m.file_url, m.title)}>
                      <Download className="h-3 w-3" />
                    </Button>
                    {isPrivileged && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(m)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SubjectMaterials;
