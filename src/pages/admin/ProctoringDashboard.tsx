import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, AlertTriangle, Search, Eye, Trash2, Download, Monitor,
  Clock, User, Activity, ShieldAlert, ShieldCheck, ChevronDown
} from "lucide-react";

const severityColor = (level: string) => {
  switch (level) {
    case "critical": return "bg-destructive text-destructive-foreground";
    case "high": return "bg-destructive/80 text-destructive-foreground";
    case "medium": return "bg-secondary text-secondary-foreground";
    default: return "bg-muted text-muted-foreground";
  }
};

const integrityColor = (score: number) => {
  if (score >= 80) return "text-emerald";
  if (score >= 50) return "text-secondary";
  return "text-destructive";
};

// Thumbnail component for face snapshots with signed URL loading
const MediaThumbnail = ({ media, attemptId }: { media: any; attemptId: string }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const loadUrl = async () => {
      // file_url stores the storage path — generate a signed URL
      const { data, error } = await supabase.storage
        .from("proctoring-media")
        .createSignedUrl(media.file_url, 3600); // 1 hour expiry
      if (data?.signedUrl) {
        setImageUrl(data.signedUrl);
      } else {
        setLoadError(true);
      }
    };
    loadUrl();
  }, [media.file_url]);

  return (
    <>
      <div
        className="relative group cursor-pointer rounded-lg overflow-hidden border bg-muted aspect-square"
        onClick={() => !loadError && setExpanded(true)}
      >
        {imageUrl && !loadError ? (
          <img
            src={imageUrl}
            alt="Face capture"
            className="w-full h-full object-cover"
            onError={() => setLoadError(true)}
          />
        ) : loadError ? (
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
            <User className="h-6 w-6 opacity-40" />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1.5 py-0.5 truncate">
          {new Date(media.created_at).toLocaleTimeString()}
        </div>
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <Eye className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* Expanded view dialog */}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" />
              Face Capture — {new Date(media.created_at).toLocaleString()}
            </DialogTitle>
          </DialogHeader>
          {imageUrl && (
            <img src={imageUrl} alt="Face capture full" className="w-full rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

const ProctoringDashboard = () => {
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [violations, setViolations] = useState<any[]>([]);
  const [deviceLogs, setDeviceLogs] = useState<any[]>([]);
  const [media, setMedia] = useState<any[]>([]);
  const [searchFilter, setSearchFilter] = useState("");
  const [suspicionFilter, setSuspicionFilter] = useState("all");
  const [examFilter, setExamFilter] = useState("all");
  const [examsList, setExamsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = async () => {
    setLoading(true);
    const [sessionsRes, profilesRes, examsRes, attemptsRes] = await Promise.all([
      supabase.from("proctoring_sessions").select("*").order("started_at", { ascending: false }),
      supabase.from("profiles").select("user_id, full_name, email"),
      supabase.from("exams").select("id, title, title_ar"),
      supabase.from("exam_attempts").select("id, exam_id, user_id, status, suspicion_level, integrity_score"),
    ]);

    const profiles = profilesRes.data || [];
    const exams = examsRes.data || [];
    const attempts = attemptsRes.data || [];
    setExamsList(exams);

    const merged = (sessionsRes.data || []).map((s: any) => {
      const attempt = attempts.find((a) => a.id === s.attempt_id) || {};
      const profile = profiles.find((p) => p.user_id === (attempt as any).user_id) || {};
      const exam = exams.find((e) => e.id === (attempt as any).exam_id) || {};
      return { ...s, attempt, profile, exam };
    });

    setSessions(merged);
    setLoading(false);
  };

  useEffect(() => { fetchSessions(); }, []);

  const filteredSessions = sessions.filter((s) => {
    if (suspicionFilter !== "all" && s.suspicion_level !== suspicionFilter) return false;
    if (examFilter !== "all" && (s.attempt as any)?.exam_id !== examFilter) return false;
    if (searchFilter) {
      const name = ((s.profile as any)?.full_name || "").toLowerCase();
      const email = ((s.profile as any)?.email || "").toLowerCase();
      if (!name.includes(searchFilter.toLowerCase()) && !email.includes(searchFilter.toLowerCase())) return false;
    }
    return true;
  });

  const loadSessionDetails = async (session: any) => {
    setSelectedSession(session);
    const [violationsRes, deviceRes, mediaRes] = await Promise.all([
      supabase.from("violations").select("*").eq("attempt_id", session.attempt_id).order("timestamp", { ascending: true }),
      supabase.from("device_logs").select("*").eq("attempt_id", session.attempt_id),
      supabase.from("proctoring_media").select("*").eq("attempt_id", session.attempt_id).order("created_at", { ascending: true }),
    ]);
    setViolations(violationsRes.data || []);
    setDeviceLogs(deviceRes.data || []);
    setMedia(mediaRes.data || []);
  };

  const deleteSession = async (sessionId: string, attemptId: string) => {
    await Promise.all([
      supabase.from("violations").delete().eq("attempt_id", attemptId),
      supabase.from("device_logs").delete().eq("attempt_id", attemptId),
      supabase.from("proctoring_media").delete().eq("attempt_id", attemptId),
      supabase.from("proctoring_sessions").delete().eq("id", sessionId),
    ]);
    toast({ title: t("Session deleted", "تم حذف الجلسة") });
    fetchSessions();
    setSelectedSession(null);
  };

  // Stats
  const totalSessions = sessions.length;
  const criticalCount = sessions.filter(s => s.suspicion_level === "critical" || s.suspicion_level === "high").length;
  const avgIntegrity = sessions.length > 0 ? Math.round(sessions.reduce((s, ss) => s + (Number(ss.integrity_score) || 100), 0) / sessions.length) : 100;

  // Detail view
  if (selectedSession) {
    const s = selectedSession;
    const device = deviceLogs[0];
    return (
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              {t("Proctoring Details", "تفاصيل المراقبة")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {(s.profile as any)?.full_name || (s.profile as any)?.email || "Unknown"} •{" "}
              {language === "ar" ? (s.exam as any)?.title_ar || (s.exam as any)?.title : (s.exam as any)?.title}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedSession(null)}>{t("Back", "رجوع")}</Button>
            <Button variant="destructive" size="sm" onClick={() => deleteSession(s.id, s.attempt_id)}>
              <Trash2 className="h-3 w-3 mr-1" />{t("Delete", "حذف")}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid gap-3 md:grid-cols-4 mb-4">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">{t("Integrity Score", "درجة النزاهة")}</p>
              <p className={`text-2xl font-bold ${integrityColor(Number(s.integrity_score) || 100)}`}>{Math.round(Number(s.integrity_score) || 100)}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">{t("Suspicion Level", "مستوى الاشتباه")}</p>
              <Badge className={severityColor(s.suspicion_level || "low")}>{s.suspicion_level || "low"}</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">{t("Total Violations", "إجمالي المخالفات")}</p>
              <p className="text-2xl font-bold text-destructive">{s.total_violations || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">{t("Warnings", "التحذيرات")}</p>
              <p className="text-2xl font-bold text-secondary">{s.warnings_issued || 0}/{s.max_warnings || 3}</p>
            </CardContent>
          </Card>
        </div>

        {/* Device info */}
        {device && (
          <Card className="mb-4">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Monitor className="h-4 w-4" />{t("Device Information", "معلومات الجهاز")}</CardTitle></CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-3 text-sm">
              <div><span className="text-muted-foreground">{t("Device", "الجهاز")}:</span> {device.device_type}</div>
              <div><span className="text-muted-foreground">{t("Browser", "المتصفح")}:</span> {device.browser}</div>
              <div><span className="text-muted-foreground">{t("Resolution", "الدقة")}:</span> {device.screen_resolution}</div>
              <div className="md:col-span-3"><span className="text-muted-foreground">{t("User Agent", "وكيل المستخدم")}:</span> <span className="text-xs break-all">{device.user_agent}</span></div>
            </CardContent>
          </Card>
        )}

        {/* Violations timeline */}
        <Card className="mb-4">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" />{t("Violation Timeline", "الجدول الزمني للمخالفات")} ({violations.length})</CardTitle></CardHeader>
          <CardContent>
            {violations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t("No violations recorded", "لم يتم تسجيل مخالفات")}</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {violations.map((v, i) => (
                  <div key={v.id} className="flex items-start gap-3 rounded-lg border p-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-xs font-bold text-destructive">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{v.violation_type.replace("_", " ")}</Badge>
                        <Badge className={`text-xs ${v.severity_score >= 3 ? "bg-destructive" : v.severity_score >= 2 ? "bg-secondary" : "bg-muted"} text-foreground`}>
                          {t("Severity", "الخطورة")}: {v.severity_score}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{new Date(v.timestamp).toLocaleTimeString()}</span>
                      </div>
                      {v.details && <p className="text-xs text-muted-foreground mt-1">{v.details}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Media files — face snapshots & screenshots */}
        {media.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4" />{t("Captured Media & Face Snapshots", "الوسائط والصور الملتقطة")} ({media.length})</CardTitle></CardHeader>
            <CardContent>
              {/* Image gallery for face snapshots */}
              {media.filter(m => m.file_type === "face_snapshot" || m.file_type === "verification_snapshot").length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2">{t("Face Captures", "صور الوجه")}</p>
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
                    {media.filter(m => m.file_type === "face_snapshot" || m.file_type === "verification_snapshot").map((m) => (
                      <MediaThumbnail key={m.id} media={m} attemptId={s.attempt_id} />
                    ))}
                  </div>
                </div>
              )}
              {/* Other media */}
              {media.filter(m => m.file_type !== "face_snapshot" && m.file_type !== "verification_snapshot").length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">{t("Other Media", "وسائط أخرى")}</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {media.filter(m => m.file_type !== "face_snapshot" && m.file_type !== "verification_snapshot").map((m) => (
                      <div key={m.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                        <Badge variant="outline" className="text-xs shrink-0">{m.file_type}</Badge>
                        <span className="truncate flex-1">{m.file_name || m.file_url}</span>
                        <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            {t("Proctoring Dashboard", "لوحة المراقبة")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("Monitor exam integrity and review violations", "مراقبة نزاهة الامتحان ومراجعة المخالفات")}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <Activity className="h-8 w-8 text-primary" />
            <div>
              <div className="text-2xl font-bold">{totalSessions}</div>
              <div className="text-xs text-muted-foreground">{t("Total Sessions", "إجمالي الجلسات")}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <ShieldAlert className="h-8 w-8 text-destructive" />
            <div>
              <div className="text-2xl font-bold text-destructive">{criticalCount}</div>
              <div className="text-xs text-muted-foreground">{t("High/Critical Cases", "حالات عالية/حرجة")}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <ShieldCheck className="h-8 w-8 text-emerald" />
            <div>
              <div className={`text-2xl font-bold ${integrityColor(avgIntegrity)}`}>{avgIntegrity}%</div>
              <div className="text-xs text-muted-foreground">{t("Average Integrity", "متوسط النزاهة")}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs mb-1 block">{t("Search Student", "البحث عن طالب")}</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 h-9 text-sm w-[200px]" placeholder={t("Name or email...", "الاسم أو البريد...")} value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-xs mb-1 block">{t("Suspicion Level", "مستوى الاشتباه")}</Label>
          <Select value={suspicionFilter} onValueChange={setSuspicionFilter}>
            <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All", "الكل")}</SelectItem>
              <SelectItem value="low">{t("Low", "منخفض")}</SelectItem>
              <SelectItem value="medium">{t("Medium", "متوسط")}</SelectItem>
              <SelectItem value="high">{t("High", "عالي")}</SelectItem>
              <SelectItem value="critical">{t("Critical", "حرج")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">{t("Exam", "الامتحان")}</Label>
          <Select value={examFilter} onValueChange={setExamFilter}>
            <SelectTrigger className="w-[200px] h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All Exams", "جميع الامتحانات")}</SelectItem>
              {examsList.map((e) => (
                <SelectItem key={e.id} value={e.id}>{language === "ar" ? e.title_ar || e.title : e.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Sessions table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filteredSessions.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t("No proctoring sessions found", "لم يتم العثور على جلسات مراقبة")}</CardContent></Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Student", "الطالب")}</TableHead>
                  <TableHead>{t("Exam", "الامتحان")}</TableHead>
                  <TableHead>{t("Integrity", "النزاهة")}</TableHead>
                  <TableHead>{t("Suspicion", "الاشتباه")}</TableHead>
                  <TableHead>{t("Violations", "المخالفات")}</TableHead>
                  <TableHead>{t("Warnings", "التحذيرات")}</TableHead>
                  <TableHead>{t("Date", "التاريخ")}</TableHead>
                  <TableHead>{t("Actions", "إجراءات")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSessions.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer hover:bg-accent/50" onClick={() => loadSessionDetails(s)}>
                    <TableCell className="font-medium text-sm">{(s.profile as any)?.full_name || (s.profile as any)?.email || "Unknown"}</TableCell>
                    <TableCell className="text-sm">{language === "ar" ? (s.exam as any)?.title_ar || (s.exam as any)?.title : (s.exam as any)?.title}</TableCell>
                    <TableCell><span className={`font-bold ${integrityColor(Number(s.integrity_score) || 100)}`}>{Math.round(Number(s.integrity_score) || 100)}%</span></TableCell>
                    <TableCell><Badge className={`text-xs ${severityColor(s.suspicion_level || "low")}`}>{s.suspicion_level || "low"}</Badge></TableCell>
                    <TableCell className="font-bold text-destructive">{s.total_violations || 0}</TableCell>
                    <TableCell>{s.warnings_issued || 0}/{s.max_warnings || 3}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(s.started_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); loadSessionDetails(s); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ProctoringDashboard;
