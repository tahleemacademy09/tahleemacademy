import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Video, Download, Play, Search, Clock, User, Loader2, AlertCircle } from "lucide-react";
import { useState, useRef } from "react";

const SubjectRecordings = ({ subjectId }: { subjectId: string }) => {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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

  const filtered = recordings?.filter((r) =>
    (r.teacher_name || "").toLowerCase().includes(search.toLowerCase()) ||
    new Date(r.created_at).toLocaleDateString().includes(search)
  );

  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m ${sec}s`;
  };

  const isFullUrl = (url: string) =>
    url.startsWith("http://") || url.startsWith("https://");

  const streamRecording = async (fileUrl: string, recordingId: string) => {
    if (!fileUrl) return;
    setLoadingId(recordingId);
    setErrorId(null);
    setVideoError(null);
    setPlayingUrl(null);
    try {
      if (isFullUrl(fileUrl)) {
        setPlayingUrl(fileUrl);
        setLoadingId(null);
        return;
      }
      const { data, error } = await supabase.storage
        .from("subject-files")
        .createSignedUrl(fileUrl, 3600);
      if (error || !data?.signedUrl) {
        const { data: data2, error: error2 } = await supabase.storage
          .from("recordings")
          .createSignedUrl(fileUrl, 3600);
        if (error2 || !data2?.signedUrl) throw new Error("Could not generate playback URL");
        setPlayingUrl(data2.signedUrl);
      } else {
        setPlayingUrl(data.signedUrl);
      }
    } catch (err) {
      setErrorId(recordingId);
    } finally {
      setLoadingId(null);
    }
  };

  const downloadRecording = async (fileUrl: string) => {
    if (!fileUrl) return;
    if (isFullUrl(fileUrl)) { window.open(fileUrl, "_blank"); return; }
    const { data } = await supabase.storage.from("subject-files").createSignedUrl(fileUrl, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
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

      {playingUrl && (
        <Card className="overflow-hidden">
          <CardContent className="p-0 bg-black">
            {videoError ? (
              <div className="flex flex-col items-center justify-center h-48 text-white gap-3">
                <AlertCircle className="h-10 w-10 text-red-400" />
                <p className="text-sm text-red-400">{videoError}</p>
                <Button size="sm" variant="outline" className="text-white border-white"
                  onClick={() => { setVideoError(null); setPlayingUrl(null); }}>
                  {t("Close", "إغلاق")}
                </Button>
              </div>
            ) : (
              <video ref={videoRef} key={playingUrl} src={playingUrl}
                controls autoPlay playsInline className="w-full max-h-[400px]"
                controlsList="nodownload"
                onError={() => setVideoError(t(
                  "Unable to play this recording. The file may have expired.",
                  "تعذر تشغيل التسجيل. قد يكون الملف منتهي الصلاحية."
                ))}>
                {t("Your browser does not support video playback", "متصفحك لا يدعم تشغيل الفيديو")}
              </video>
            )}
            <div className="p-2 flex justify-end bg-muted">
              <Button size="sm" variant="ghost"
                onClick={() => { setPlayingUrl(null); setVideoError(null); }} className="text-xs">
                {t("Close Player", "إغلاق المشغل")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
                <div className="h-16 w-24 bg-muted rounded-lg flex items-center justify-center shrink-0 relative group cursor-pointer"
                  onClick={() => r.file_url && streamRecording(r.file_url, r.id)}>
                  {r.thumbnail_url ? (
                    <img src={r.thumbnail_url} className="h-full w-full object-cover rounded-lg" alt="" />
                  ) : (
                    <Play className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
                  )}
                  {loadingId === r.id ? (
                    <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                      <Loader2 className="h-6 w-6 text-white animate-spin" />
                    </div>
                  ) : errorId === r.id ? (
                    <div className="absolute inset-0 bg-red-500/20 rounded-lg flex items-center justify-center">
                      <AlertCircle className="h-6 w-6 text-red-500" />
                    </div>
                  ) : (
                    <div className="absolute inset-0 bg-black/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Play className="h-8 w-8 text-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">
                    {new Date(r.created_at).toLocaleDateString(undefined, {
                      weekday: "short", year: "numeric", month: "short", day: "numeric"
                    })}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                    <span className="flex items-center gap-1"><User className="h-3 w-3" />{r.teacher_name || "Teacher"}</span>
                    {r.duration_seconds && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDuration(r.duration_seconds)}</span>}
                    {r.file_size && <span>{(r.file_size / 1048576).toFixed(1)} MB</span>}
                  </div>
                  {errorId === r.id && (
                    <p className="text-xs text-red-500 mt-1">{t("Failed to load recording", "فشل تحميل التسجيل")}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {r.file_url && (
                    <>
                      <Button size="sm" variant="outline" className="gap-1"
                        disabled={loadingId === r.id}
                        onClick={() => streamRecording(r.file_url!, r.id)}>
                        {loadingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        {t("Stream", "تشغيل")}
                      </Button>
                      <Button size="sm" variant="ghost" className="gap-1"
                        onClick={() => downloadRecording(r.file_url!)}>
                        <Download className="h-3 w-3" />
                      </Button>
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
