import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Search, Trash2, Play, Mic } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TeacherRecordings = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const [recordings, setRecordings] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data: subs } = await supabase.from("subjects").select("id, title, title_ar").eq("teacher_id", user.id);
      setSubjects(subs || []);
      const subjectIds = (subs || []).map(s => s.id);
      if (subjectIds.length > 0) {
        const { data } = await supabase.from("session_recordings").select("*, subjects(title, title_ar)").in("subject_id", subjectIds).order("created_at", { ascending: false });
        setRecordings(data || []);
      }
      setLoading(false);
    };
    fetch();
  }, [user]);

  const filtered = recordings.filter(r => {
    if (subjectFilter !== "all" && r.subject_id !== subjectFilter) return false;
    if (search && !(r.teacher_name || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-bold">{t("Recordings", "التسجيلات")}</h1>
      <div className="flex flex-wrap gap-3">
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder={t("All Subjects", "كل المواد")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All Subjects", "كل المواد")}</SelectItem>
            {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("Search...", "ابحث...")} value={search} onChange={e => setSearch(e.target.value)} className="ps-9" />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(r => (
          <Card key={r.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Mic className="h-4 w-4 text-primary" />
                <p className="font-medium text-sm truncate">{r.teacher_name || t("Recording", "تسجيل")}</p>
              </div>
              <p className="text-xs text-muted-foreground">{(r as any).subjects?.title || ""}</p>
              <p className="text-xs text-muted-foreground">
                {r.duration_seconds ? `${Math.round(r.duration_seconds / 60)} min` : ""} • {new Date(r.created_at).toLocaleDateString()}
              </p>
              {r.file_url && <Button size="sm" variant="outline" className="w-full" onClick={() => window.open(r.file_url, "_blank")}><Play className="h-3 w-3 me-1" /> {t("Play", "تشغيل")}</Button>}
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-muted-foreground col-span-full text-center py-8">{t("No recordings found", "لم يتم العثور على تسجيلات")}</p>}
      </div>
    </div>
  );
};

export default TeacherRecordings;
