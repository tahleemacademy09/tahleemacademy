import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Video, Download, Play, Search, Clock, User } from "lucide-react";
import { useState } from "react";

const SubjectRecordings = ({ subjectId }: { subjectId: string }) => {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");

  const { data: recordings, isLoading } = useQuery({
    queryKey: ["recordings", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("session_recordings")
        .select("*").eq("subject_id", subjectId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = recordings?.filter((r) =>
    (r.teacher_name || "").toLowerCase().includes(search.toLowerCase()) ||
    new Date(r.created_at).toLocaleDateString().includes(search)
  );

  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  if (isLoading) return <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search recordings...", "بحث في التسجيلات...")} className="ps-9" />
        </div>
      </div>

      {!filtered?.length ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          <Video className="h-10 w-10 mx-auto mb-2 opacity-50" />
          {t("No recordings yet", "لا توجد تسجيلات بعد")}
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-16 w-24 bg-muted rounded-lg flex items-center justify-center shrink-0">
                  <Play className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{new Date(r.created_at).toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1"><User className="h-3 w-3" />{r.teacher_name || "Teacher"}</span>
                    {r.duration_seconds && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(r.duration_seconds)}</span>}
                    {r.file_size && <span>{(r.file_size / 1048576).toFixed(1)} MB</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  {r.file_url && (
                    <>
                      <Button size="sm" variant="outline" className="gap-1"><Play className="h-3 w-3" />{t("Stream", "تشغيل")}</Button>
                      <Button size="sm" variant="ghost" className="gap-1"><Download className="h-3 w-3" /></Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default SubjectRecordings;
