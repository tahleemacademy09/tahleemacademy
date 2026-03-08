import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Video, Download, Play, Search, Clock, User, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const SubjectRecordings = ({ subjectId }: { subjectId: string }) => {
  const { t } = useLanguage();
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const isAdmin = hasRole("admin");
  const isTeacher = hasRole("teacher");

  const { data: recordings, isLoading } = useQuery({
    queryKey: ["recordings", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("session_recordings")
        .select("*")
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Load watch progress for current user
  const { data: progressMap } = useQuery({
    queryKey: ["recording-progress", subjectId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const recIds = recordings?.map(r => r.id) || [];
      if (!recIds.length) return {};
      const { data } = await supabase
        .from("recording_watch_progress" as any)
        .select("*")
        .eq("student_id", user!.id)
        .in("recording_id", recIds);
      const map: Record<string, any> = {};
      (data || []).forEach((p: any) => { map[p.recording_id] = p; });
      return map;
    },
  });

  const filtered = recordings?.filter((r) =>
    (r.teacher_name || "").toLowerCase().includes(search.toLowerCase()) ||
    new Date(r.created_at!).toLocaleDateString().includes(search)
  );

  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m} min`;
  };

  if (isLoading) return (
    <div className="space-y-3">
      {[1, 2].map((i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search recordings...", "بحث في التسجيلات...")} className="ps-9" />
        </div>
      </div>

      {!filtered?.length ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">
          <Video className="h-10 w-10 mx-auto mb-2 opacity-50" />
          {t("No recordings yet", "لا توجد تسجيلات بعد")}
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const prog = progressMap?.[r.id];
            const pct = prog && r.duration_seconds
              ? Math.min(100, Math.round((prog.progress_seconds / r.duration_seconds) * 100))
              : 0;
            const completed = prog?.completed;
            const started = prog && prog.progress_seconds > 0;

            return (
              <Card key={r.id} className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/recordings/${r.id}`)}>
                <CardContent className="p-4 flex items-center gap-4">
                  {/* Thumbnail with progress ring */}
                  <div className="h-16 w-24 rounded-lg flex items-center justify-center shrink-0 relative overflow-hidden"
                    style={{ background: "#0f3122" }}>
                    {r.thumbnail_url ? (
                      <img src={r.thumbnail_url} className="h-full w-full object-cover" alt="" />
                    ) : (
                      <Play className="h-6 w-6" style={{ color: "#c9973a" }} />
                    )}
                    {/* Progress bar at bottom of thumbnail */}
                    {started && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                        <div className="h-full rounded-r-full" style={{ width: `${pct}%`, background: completed ? "#22c55e" : "#c9973a" }} />
                      </div>
                    )}
                    {completed && (
                      <div className="absolute top-1 right-1">
                        <CheckCircle className="h-4 w-4 text-green-500 bg-white rounded-full" />
                      </div>
                    )}
                    {!started && !completed && (
                      <div className="absolute top-1 left-1">
                        <Badge className="text-[9px] px-1 py-0" style={{ background: "#c9973a", color: "#fff" }}>NEW</Badge>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">
                      {new Date(r.created_at!).toLocaleDateString(undefined, {
                        weekday: "short", year: "numeric", month: "short", day: "numeric"
                      })}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                      <span className="flex items-center gap-1"><User className="h-3 w-3" />{r.teacher_name || "Teacher"}</span>
                      {r.duration_seconds != null && r.duration_seconds > 0 && (
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(r.duration_seconds)}</span>
                      )}
                      {(isAdmin || isTeacher) && (
                        <span className="text-xs">{(r as any).view_count || 0} views</span>
                      )}
                    </div>
                    {started && !completed && (
                      <p className="text-xs mt-1" style={{ color: "#c9973a" }}>{pct}% watched</p>
                    )}
                  </div>

                  <div className="shrink-0">
                    <Button size="sm" className="gap-1.5" style={{
                      background: completed ? "transparent" : "#c9973a",
                      color: completed ? "#c9973a" : "#fff",
                      border: completed ? "1px solid #c9973a" : "none",
                    }}>
                      <Play className="h-3 w-3" />
                      {completed ? t("Rewatch", "إعادة") : started ? t("Continue", "متابعة") : t("Watch", "مشاهدة")}
                    </Button>
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

export default SubjectRecordings;
