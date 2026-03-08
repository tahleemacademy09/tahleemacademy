import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, BookOpen, FileText, Download, Upload, ExternalLink, Music, Video, Type } from "lucide-react";
import { Switch } from "@/components/ui/switch";

const LEVELS = ["beginner", "intermediate", "advanced"];
const MATERIAL_TYPES = ["PDF", "Video", "Audio", "Link", "Text"];

const SyllabusManager = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState("beginner");

  // Syllabus dialog
  const [syllOpen, setSyllOpen] = useState(false);
  const [editSyllId, setEditSyllId] = useState<string | null>(null);
  const [syllForm, setSyllForm] = useState({ title: "", description: "", level: "beginner", week_number: 1 });

  // Materials dialog
  const [matOpen, setMatOpen] = useState(false);
  const [editMatId, setEditMatId] = useState<string | null>(null);
  const [matForm, setMatForm] = useState({ title: "", material_type: "PDF", file_url: "", content: "", is_downloadable: true, level: "beginner", sort_order: 0 });

  const { data: subjects } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("*").order("title");
      if (error) throw error;
      return data;
    },
  });

  const { data: syllabusItems } = useQuery({
    queryKey: ["admin-syllabus", selectedSubject, levelFilter],
    enabled: !!selectedSubject,
    queryFn: async () => {
      const { data, error } = await supabase.from("subject_syllabus").select("*").eq("subject_id", selectedSubject!).eq("level", levelFilter).order("week_number");
      if (error) throw error;
      return data;
    },
  });

  const { data: materialItems } = useQuery({
    queryKey: ["admin-materials", selectedSubject, levelFilter],
    enabled: !!selectedSubject,
    queryFn: async () => {
      const { data, error } = await supabase.from("subject_materials").select("*").eq("subject_id", selectedSubject!).eq("level", levelFilter).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  // Syllabus mutations
  const saveSyllabus = useMutation({
    mutationFn: async (values: typeof syllForm) => {
      const payload = { ...values, subject_id: selectedSubject! };
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
      setSyllOpen(false);
      setEditSyllId(null);
      setSyllForm({ title: "", description: "", level: levelFilter, week_number: 1 });
      toast({ title: t("Syllabus saved", "تم حفظ المنهج") });
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
      toast({ title: t("Deleted", "تم الحذف") });
    },
  });

  // Materials mutations
  const saveMaterial = useMutation({
    mutationFn: async (values: typeof matForm) => {
      const payload = { ...values, subject_id: selectedSubject!, uploaded_by: user!.id };
      if (editMatId) {
        const { uploaded_by, ...updatePayload } = payload;
        const { error } = await supabase.from("subject_materials").update(updatePayload).eq("id", editMatId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subject_materials").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-materials"] });
      setMatOpen(false);
      setEditMatId(null);
      setMatForm({ title: "", material_type: "PDF", file_url: "", content: "", is_downloadable: true, level: levelFilter, sort_order: 0 });
      toast({ title: t("Material saved", "تم حفظ المادة") });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMaterial = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subject_materials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-materials"] });
      toast({ title: t("Deleted", "تم الحذف") });
    },
  });

  const materialTypeIcon: Record<string, any> = { PDF: FileText, Video: Video, Audio: Music, Link: ExternalLink, Text: Type };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("Syllabus & Materials", "المنهج والمواد")}</h1>
        <p className="text-muted-foreground text-sm">{t("Manage syllabus and learning materials per subject and level", "إدارة المنهج والمواد التعليمية حسب المادة والمستوى")}</p>
      </div>

      {/* Subject selector + Level filter */}
      <div className="flex flex-wrap gap-3">
        <div className="w-64">
          <Label>{t("Subject", "المادة")}</Label>
          <Select value={selectedSubject || ""} onValueChange={setSelectedSubject}>
            <SelectTrigger><SelectValue placeholder={t("Select subject", "اختر المادة")} /></SelectTrigger>
            <SelectContent>
              {(subjects || []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Label>{t("Level", "المستوى")}</Label>
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LEVELS.map(l => <SelectItem key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedSubject ? (
        <Tabs defaultValue="syllabus">
          <TabsList>
            <TabsTrigger value="syllabus">{t("Syllabus", "المنهج")}</TabsTrigger>
            <TabsTrigger value="materials">{t("Materials", "المواد")}</TabsTrigger>
          </TabsList>

          {/* SYLLABUS TAB */}
          <TabsContent value="syllabus" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Dialog open={syllOpen} onOpenChange={(v) => { setSyllOpen(v); if (!v) { setEditSyllId(null); setSyllForm({ title: "", description: "", level: levelFilter, week_number: 1 }); } }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 me-1" />{t("Add Syllabus Item", "إضافة عنصر منهج")}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{editSyllId ? t("Edit", "تعديل") : t("New Syllabus Item", "عنصر منهج جديد")}</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div><Label>{t("Title", "العنوان")}</Label><Input value={syllForm.title} onChange={(e) => setSyllForm({ ...syllForm, title: e.target.value })} placeholder="e.g. Week 1: Arabic Alphabet" /></div>
                    <div><Label>{t("Description", "الوصف")}</Label><Textarea value={syllForm.description} onChange={(e) => setSyllForm({ ...syllForm, description: e.target.value })} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>{t("Level", "المستوى")}</Label>
                        <Select value={syllForm.level} onValueChange={(v) => setSyllForm({ ...syllForm, level: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{LEVELS.map(l => <SelectItem key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div><Label>{t("Week Number", "رقم الأسبوع")}</Label><Input type="number" value={syllForm.week_number} onChange={(e) => setSyllForm({ ...syllForm, week_number: parseInt(e.target.value) || 1 })} /></div>
                    </div>
                    <Button className="w-full" onClick={() => saveSyllabus.mutate(syllForm)} disabled={!syllForm.title || saveSyllabus.isPending}>
                      {t("Save", "حفظ")}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {(syllabusItems || []).length === 0 ? (
              <p className="text-center text-muted-foreground py-8">{t("No syllabus items", "لا توجد عناصر منهج")}</p>
            ) : (
              <div className="space-y-2">
                {(syllabusItems || []).map((item: any) => (
                  <Card key={item.id}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">{item.week_number || "—"}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{item.title}</p>
                        {item.description && <p className="text-xs text-muted-foreground truncate">{item.description}</p>}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => { setEditSyllId(item.id); setSyllForm({ title: item.title, description: item.description || "", level: item.level || levelFilter, week_number: item.week_number || 1 }); setSyllOpen(true); }}><Edit className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteSyllabus.mutate(item.id)}><Trash2 className="h-3 w-3" /></Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* MATERIALS TAB */}
          <TabsContent value="materials" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Dialog open={matOpen} onOpenChange={(v) => { setMatOpen(v); if (!v) { setEditMatId(null); setMatForm({ title: "", material_type: "PDF", file_url: "", content: "", is_downloadable: true, level: levelFilter, sort_order: 0 }); } }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 me-1" />{t("Add Material", "إضافة مادة")}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{editMatId ? t("Edit", "تعديل") : t("New Material", "مادة جديدة")}</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div><Label>{t("Title", "العنوان")}</Label><Input value={matForm.title} onChange={(e) => setMatForm({ ...matForm, title: e.target.value })} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>{t("Type", "النوع")}</Label>
                        <Select value={matForm.material_type} onValueChange={(v) => setMatForm({ ...matForm, material_type: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{MATERIAL_TYPES.map(mt => <SelectItem key={mt} value={mt}>{mt}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{t("Level", "المستوى")}</Label>
                        <Select value={matForm.level} onValueChange={(v) => setMatForm({ ...matForm, level: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{LEVELS.map(l => <SelectItem key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div><Label>{t("File URL", "رابط الملف")}</Label><Input value={matForm.file_url} onChange={(e) => setMatForm({ ...matForm, file_url: e.target.value })} placeholder="https://..." /></div>
                    {matForm.material_type === "Text" && (
                      <div><Label>{t("Content", "المحتوى")}</Label><Textarea value={matForm.content} onChange={(e) => setMatForm({ ...matForm, content: e.target.value })} /></div>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Switch checked={matForm.is_downloadable} onCheckedChange={(v) => setMatForm({ ...matForm, is_downloadable: v })} />
                        <Label>{t("Downloadable", "قابل للتحميل")}</Label>
                      </div>
                      <div className="flex-1"><Label>{t("Order", "الترتيب")}</Label><Input type="number" value={matForm.sort_order} onChange={(e) => setMatForm({ ...matForm, sort_order: parseInt(e.target.value) || 0 })} /></div>
                    </div>
                    <Button className="w-full" onClick={() => saveMaterial.mutate(matForm)} disabled={!matForm.title || saveMaterial.isPending}>
                      {t("Save", "حفظ")}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {(materialItems || []).length === 0 ? (
              <p className="text-center text-muted-foreground py-8">{t("No materials", "لا توجد مواد")}</p>
            ) : (
              <div className="space-y-2">
                {(materialItems || []).map((mat: any) => {
                  const Icon = materialTypeIcon[mat.material_type] || FileText;
                  return (
                    <Card key={mat.id}>
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{mat.title}</p>
                          <div className="flex gap-2 text-xs text-muted-foreground">
                            <span>{mat.material_type}</span>
                            {mat.is_downloadable && <Badge variant="outline" className="text-[10px]">📥</Badge>}
                          </div>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => { setEditMatId(mat.id); setMatForm({ title: mat.title, material_type: mat.material_type || "PDF", file_url: mat.file_url || "", content: mat.content || "", is_downloadable: mat.is_downloadable ?? true, level: mat.level || levelFilter, sort_order: mat.sort_order || 0 }); setMatOpen(true); }}><Edit className="h-3 w-3" /></Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteMaterial.mutate(mat.id)}><Trash2 className="h-3 w-3" /></Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>{t("Select a subject to manage its syllabus and materials", "اختر مادة لإدارة المنهج والمواد")}</p>
        </div>
      )}
    </div>
  );
};

export default SyllabusManager;
