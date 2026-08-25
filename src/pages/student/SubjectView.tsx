import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useLiveClass } from "@/contexts/LiveClassContext";
import SubjectMaterials from "@/components/classroom/SubjectMaterials";
import SubjectAssignments from "@/components/classroom/SubjectAssignments";
import SubjectSyllabus from "@/components/classroom/SubjectSyllabus";
import SubjectRecordings from "@/components/classroom/SubjectRecordings";
import {
  ArrowLeft, BookOpen, FileText, Download, Play, ExternalLink, Video, Clock,
  Calendar, CheckCircle, XCircle, AlertCircle, Plus, Upload, Eye, BarChart3,
  Users, Mic, Link as LinkIcon, StickyNote, ClipboardList, TrendingUp
} from "lucide-react";
import { format, isPast, isFuture, differenceInMinutes } from "date-fns";

const levelColors: Record<string, string> = {
  beginner: "bg-green-100 text-green-800",
  intermediate: "bg-yellow-100 text-yellow-800",
  advanced: "bg-red-100 text-red-800",
};

const SubjectView = () => {
  const { subjectId } = useParams();
  const { t, language } = useLanguage();
  const { user, profile, hasRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { joinClass } = useLiveClass();
  const isTeacher = hasRole("teacher") || hasRole("admin");
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    topic: "", topic_ar: "", date: "", time: "", duration: 60, is_recorded: true, homework: "", homework_ar: "",
  });

  // ─── Data Queries ───
  const { data: subject, isLoading } = useQuery({
    queryKey: ["subject", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("*").eq("id", subjectId!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: teacherProfile } = useQuery({
    queryKey: ["subject-teacher", subject?.teacher_id],
    enabled: !!subject?.teacher_id,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name, full_name_ar, avatar_url").eq("user_id", subject!.teacher_id!).single();
      return data;
    },
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["subject-sessions", subjectId],
    queryFn: async () => {
      const { data } = await supabase.from("live_sessions").select("*").eq("subject_id", subjectId!).order("scheduled_at", { ascending: true, nullsFirst: false });
      return (data || []) as any[];
    },
  });

  const { data: recordings = [] } = useQuery({
    queryKey: ["subject-recordings", subjectId],
    queryFn: async () => {
      const { data } = await supabase.from("session_recordings").select("*").eq("subject_id", subjectId!).order("created_at", { ascending: false });
      return (data || []) as any[];
    },
  });

  const { data: materials = [] } = useQuery({
    queryKey: ["subject-materials-all", subjectId],
    queryFn: async () => {
      const { data } = await supabase.from("subject_materials").select("*").eq("subject_id", subjectId!).order("created_at", { ascending: false });
      return (data || []) as any[];
    },
  });

  const { data: exams = [] } = useQuery({
    queryKey: ["subject-exams", subjectId],
    queryFn: async () => {
      const { data: courses } = await supabase.from("courses").select("id").eq("subject_id", subjectId!);
      if (!courses?.length) return [];
      const { data } = await supabase.from("exams").select("*").in("course_id", courses.map(c => c.id)).eq("is_published", true);
      return (data || []) as any[];
    },
  });

  const { data: myAttempts = [] } = useQuery({
    queryKey: ["subject-attempts", subjectId, user?.id],
    enabled: !!user && exams.length > 0,
    queryFn: async () => {
      const examIds = exams.map((e: any) => e.id);
      const { data } = await supabase.from("exam_attempts").select("*").eq("user_id", user!.id).in("exam_id", examIds);
      return (data || []) as any[];
    },
  });

  const { data: homework = [] } = useQuery({
    queryKey: ["subject-homework", subjectId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase.from("session_homework" as any).select("*").eq("subject_id", subjectId!);
      if (!isTeacher) query = query.eq("student_id", user!.id);
      const { data } = await query.order("created_at", { ascending: false });
      return (data || []) as any[];
    },
  });

  const { data: attendanceLogs = [] } = useQuery({
    queryKey: ["subject-attendance", subjectId, user?.id],
    enabled: !!user && sessions.length > 0,
    queryFn: async () => {
      const sessionIds = sessions.map((s: any) => s.id);
      if (!sessionIds.length) return [];
      let query = supabase.from("attendance_logs").select("*").in("session_id", sessionIds);
      if (!isTeacher) query = query.eq("user_id", user!.id);
      const { data } = await query;
      return (data || []) as any[];
    },
  });

  // ─── Derived Data ───
  const now = new Date();
  const upcomingSessions = sessions.filter((s: any) => s.scheduled_at && isFuture(new Date(s.scheduled_at)) && s.status !== "ended");
  const pastSessions = sessions.filter((s: any) => s.status === "ended" || (s.scheduled_at && isPast(new Date(s.scheduled_at))));
  const nextSession = upcomingSessions[0];
  const canJoin = nextSession && differenceInMinutes(new Date(nextSession.scheduled_at), now) <= 10;

  const examsList = exams.filter((e: any) => (e.type || "exam") === "exam");
  const testsList = exams.filter((e: any) => (e.type || "exam") === "test");

  const attendedSessionIds = new Set(attendanceLogs.map((a: any) => a.session_id));
  const completedSessions = pastSessions.filter((s: any) => attendedSessionIds.has(s.id)).length;
  const totalSessions = (subject as any)?.total_sessions || sessions.length || 1;
  const attendanceRate = pastSessions.length > 0 ? Math.round((completedSessions / pastSessions.length) * 100) : 100;

  const examAttempts = myAttempts.filter((a: any) => {
    const exam = exams.find((e: any) => e.id === a.exam_id);
    return exam && (exam.type || "exam") === "exam" && a.status === "graded";
  });
  const testAttempts = myAttempts.filter((a: any) => {
    const exam = exams.find((e: any) => e.id === a.exam_id);
    return exam && (exam.type || "exam") === "test" && a.status === "graded";
  });
  const avgExam = examAttempts.length > 0 ? examAttempts.reduce((s: number, a: any) => s + (Number(a.percentage) || 0), 0) / examAttempts.length : 0;
  const avgTest = testAttempts.length > 0 ? testAttempts.reduce((s: number, a: any) => s + (Number(a.percentage) || 0), 0) / testAttempts.length : 0;

  const completionPct = Math.round(
    (completedSessions / Math.max(totalSessions, 1)) * 40 +
    (avgExam / 100) * 40 +
    (avgTest / 100) * 20
  );

  const levelLabel = (level: string) => {
    const labels: Record<string, [string, string]> = { beginner: ["Beginner", "مبتدئ"], intermediate: ["Intermediate", "متوسط"], advanced: ["Advanced", "متقدم"] };
    const [en, ar] = labels[level] || [level, level];
    return t(en, ar);
  };

  // ─── Schedule Class ───
  const handleScheduleClass = async () => {
    if (!scheduleForm.date || !scheduleForm.time || !user) return;
    const scheduledAt = new Date(`${scheduleForm.date}T${scheduleForm.time}`).toISOString();
    const sessionNum = sessions.length + 1;

    const { error } = await supabase.from("live_sessions").insert({
      subject_id: subjectId,
      host_id: user.id,
      status: "scheduled",
      scheduled_at: scheduledAt,
      duration_minutes: scheduleForm.duration,
      topic: scheduleForm.topic,
      topic_ar: scheduleForm.topic_ar,
      session_number: sessionNum,
      level: (subject as any)?.level || null,
      is_recorded: scheduleForm.is_recorded,
      homework: scheduleForm.homework || null,
      homework_ar: scheduleForm.homework_ar || null,
    } as any);

    if (!error) {
      await supabase.from("subjects").update({ next_session_at: scheduledAt, total_sessions: sessionNum } as any).eq("id", subjectId!);
      toast({ title: t("Class scheduled!", "تم جدولة الحصة!") });
      setShowSchedule(false);
      setScheduleForm({ topic: "", topic_ar: "", date: "", time: "", duration: 60, is_recorded: true, homework: "", homework_ar: "" });
      queryClient.invalidateQueries({ queryKey: ["subject-sessions", subjectId] });
    } else {
      toast({ title: t("Error", "خطأ"), description: error.message, variant: "destructive" });
    }
  };

  // ─── Join Classroom (global — persists across navigation) ───
  const joinClassroom = () => {
    if (subject) joinClass(subject);
  };

  // If this subject is level-mapped and the student has disenrolled from it
  // (only possible when it's optional), block direct URL access to its
  // materials/assignments/exams — matches the gating on StudentCourses.tsx.
  const { data: myEnrollment, isLoading: loadingEnrollment } = useQuery({
    queryKey: ["subject-enrollment", subjectId, user?.id],
    enabled: !!subjectId && !!user?.id && !isTeacher,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_subject_enrollments" as any)
        .select("status, is_compulsory")
        .eq("subject_id", subjectId!)
        .eq("student_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  if (isLoading || loadingEnrollment) return <div className="container mx-auto px-4 py-8"><Skeleton className="h-64" /></div>;
  if (!subject) return <div className="container mx-auto px-4 py-16 text-center"><h2>{t("Subject not found", "المادة غير موجودة")}</h2></div>;

  if (!isTeacher && myEnrollment?.status === "disenrolled") {
    return (
      <div className="container mx-auto px-4 py-16 text-center max-w-md">
        <XCircle className="mx-auto mb-4 text-amber-500" size={40} />
        <h2 className="text-lg font-bold mb-2">{t("You've disenrolled from this subject", "لقد ألغيت تسجيلك في هذه المادة")}</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {t("Its lessons, assignments and exams are hidden until you re-enroll from My Subjects.",
             "دروسها وواجباتها واختباراتها مخفية حتى تعيد التسجيل من صفحة موادي.")}
        </p>
        <Button onClick={() => navigate("/student/courses")}>{t("Go to My Subjects", "الذهاب إلى موادي")}</Button>
      </div>
    );
  }

  const subjectLevel = (subject as any).level || profile?.level || "beginner";

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 space-y-6">
      <Link to={isTeacher ? "/teacher/subjects" : "/student/courses"} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 me-1" /> {t("Back", "رجوع")}
      </Link>

      {/* Subject Header */}
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl md:text-3xl font-bold" style={{ fontFamily: language === "ar" ? "'Amiri', serif" : "'Playfair Display', serif", color: '#064E3B' }}>
              {language === "ar" ? subject.title_ar || subject.title : subject.title}
            </h1>
            <Badge className={levelColors[subjectLevel] || ""}>{levelLabel(subjectLevel)}</Badge>
          </div>
          {teacherProfile && (
            <p className="text-sm text-muted-foreground">
              {t("Teacher", "المعلم")}: {language === "ar" ? teacherProfile.full_name_ar || teacherProfile.full_name : teacherProfile.full_name}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {(nextSession && canJoin || isTeacher) && (
            <Button onClick={joinClassroom} className="gap-1"><Video className="h-4 w-4" />{t("Join Class", "انضم للحصة")}</Button>
          )}
          {isTeacher && (
            <Dialog open={showSchedule} onOpenChange={setShowSchedule}>
              <DialogTrigger asChild><Button variant="outline" className="gap-1"><Plus className="h-4 w-4" />{t("Schedule Class", "جدولة حصة")}</Button></DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>{t("Schedule New Class", "جدولة حصة جديدة")}</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>{t("Subject", "المادة")}</Label><Input value={subject.title} disabled /></div>
                  <div><Label>{t("Session #", "رقم الحصة")}</Label><Input value={`#${sessions.length + 1}`} disabled /></div>
                  <div><Label>{t("Topic (English)", "الموضوع (إنجليزي)")}</Label><Input value={scheduleForm.topic} onChange={e => setScheduleForm(p => ({ ...p, topic: e.target.value }))} /></div>
                  <div><Label>{t("Topic (Arabic)", "الموضوع (عربي)")}</Label><Input dir="rtl" value={scheduleForm.topic_ar} onChange={e => setScheduleForm(p => ({ ...p, topic_ar: e.target.value }))} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>{t("Date", "التاريخ")}</Label><Input type="date" value={scheduleForm.date} onChange={e => setScheduleForm(p => ({ ...p, date: e.target.value }))} /></div>
                    <div><Label>{t("Time", "الوقت")}</Label><Input type="time" value={scheduleForm.time} onChange={e => setScheduleForm(p => ({ ...p, time: e.target.value }))} /></div>
                  </div>
                  <div><Label>{t("Duration (minutes)", "المدة (دقائق)")}</Label><Input type="number" value={scheduleForm.duration} onChange={e => setScheduleForm(p => ({ ...p, duration: Number(e.target.value) }))} /></div>
                  <div className="flex items-center justify-between">
                    <Label>{t("Record session?", "تسجيل الحصة؟")}</Label>
                    <Switch checked={scheduleForm.is_recorded} onCheckedChange={v => setScheduleForm(p => ({ ...p, is_recorded: v }))} />
                  </div>
                  <div><Label>{t("Homework", "الواجب")}</Label><Textarea value={scheduleForm.homework} onChange={e => setScheduleForm(p => ({ ...p, homework: e.target.value }))} placeholder={t("Optional homework...", "واجب اختياري...")} /></div>
                  <Button onClick={handleScheduleClass} className="w-full">{t("Schedule", "جدولة")}</Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="overview">{t("Overview", "نظرة عامة")}</TabsTrigger>
          <TabsTrigger value="classes">{t("Live Classes", "الفصول")}</TabsTrigger>
          <TabsTrigger value="recordings">{t("Recordings", "التسجيلات")}</TabsTrigger>
          <TabsTrigger value="materials" className="relative" onClick={() => localStorage.setItem(`tahleem-tab-seen-materials-${subjectId}`, new Date().toISOString())}>
            {t("Materials", "المواد")}
            {materials.length > 0 && materials.some((m: any) => { const seen = localStorage.getItem(`tahleem-tab-seen-materials-${subjectId}`); return !seen || new Date(m.created_at) > new Date(seen); }) && <span style={{ position: "absolute", top: 3, right: 3, width: 7, height: 7, borderRadius: "50%", background: "#ef4444", border: "1.5px solid #fff" }} />}
          </TabsTrigger>
          <TabsTrigger value="tasks">{t("Tasks", "المهام")}</TabsTrigger>
          <TabsTrigger value="exams">{t("Exams & Tests", "الاختبارات")}</TabsTrigger>
          <TabsTrigger value="homework">{t("Homework", "الواجبات")}</TabsTrigger>
          <TabsTrigger value="attendance">{t("Attendance", "الحضور")}</TabsTrigger>
          <TabsTrigger value="progress">{t("Progress", "التقدم")}</TabsTrigger>
          <TabsTrigger value="revision">📚 {t("Revision", "المراجعة")}</TabsTrigger>
        </TabsList>

        {/* ═══ TAB 1: Overview ═══ */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-5 space-y-3">
                <h3 className="font-semibold">{t("Subject Info", "معلومات المادة")}</h3>
                {(subject.description || (subject as any).description_ar) && (
                  <div className="space-y-1">
                    {subject.description && (
                      <p className="text-sm text-muted-foreground leading-relaxed">{subject.description}</p>
                    )}
                    {(subject as any).description_ar && (
                      <p className="text-sm text-muted-foreground leading-relaxed text-right"
                         style={{ fontFamily: "'Noto Naskh Arabic', 'Scheherazade New', 'Amiri', serif", fontSize: "0.95rem", direction: "rtl" }}>
                        {(subject as any).description_ar}
                      </p>
                    )}
                  </div>
                )}
                {(subject as any).course_syllabus && <p className="text-sm text-muted-foreground mt-2">{language === "ar" ? (subject as any).course_syllabus_ar || (subject as any).course_syllabus : (subject as any).course_syllabus}</p>}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" />{(subject as any).session_day || t("TBD", "غير محدد")}</div>
                  <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" />{(subject as any).session_time || t("TBD", "غير محدد")}</div>
                  <div className="flex items-center gap-2"><Video className="h-4 w-4 text-muted-foreground" />{(subject as any).sessions_per_week || 1}x/{t("week", "أسبوع")}</div>
                  <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-muted-foreground" />{totalSessions} {t("sessions", "حصص")}</div>
                </div>
                <div className="space-y-1 pt-2">
                  <div className="flex justify-between text-xs text-muted-foreground"><span>{t("Progress", "التقدم")}</span><span>{completionPct}%</span></div>
                  <Progress value={completionPct} className="h-2" />
                </div>
              </CardContent>
            </Card>

            {/* Next Session Card */}
            <Card className={nextSession ? "border-primary/30" : ""}>
              <CardContent className="p-5 space-y-3">
                <h3 className="font-semibold flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" />{t("Next Live Session", "الحصة القادمة")}</h3>
                {nextSession ? (
                  <>
                    <div className="space-y-1">
                      <p className="font-medium">{(nextSession as any).topic || t("Session", "حصة")} #{(nextSession as any).session_number}</p>
                      {(nextSession as any).topic_ar && <p className="text-sm text-muted-foreground font-arabic" dir="rtl">{(nextSession as any).topic_ar}</p>}
                      <p className="text-sm text-muted-foreground">{format(new Date(nextSession.scheduled_at), "EEEE, MMM d 'at' h:mm a")}</p>
                      <p className="text-xs text-muted-foreground">{(nextSession as any).duration_minutes || 60} {t("minutes", "دقيقة")}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={joinClassroom} disabled={!canJoin && !isTeacher} className="gap-1">
                        <Video className="h-4 w-4" />{(canJoin || isTeacher) ? t("Join Class", "انضم") : t("Not yet", "لم يحن الوقت")}
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">{t("No upcoming sessions", "لا توجد حصص قادمة")}</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══ TAB 2: Live Classes ═══ */}
        <TabsContent value="classes" className="space-y-4 mt-4">
          {isTeacher && (
            <div className="flex justify-end">
              <Button onClick={() => setShowSchedule(true)} className="gap-1"><Plus className="h-4 w-4" />{t("Schedule Class", "جدولة حصة")}</Button>
            </div>
          )}

          {/* Upcoming */}
          <div>
            <h3 className="font-semibold mb-3">{t("Upcoming", "القادمة")}</h3>
            {upcomingSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">{t("No upcoming classes", "لا توجد حصص قادمة")}</p>
            ) : (
              <div className="space-y-2">
                {upcomingSessions.map((s: any) => {
                  const canJoinThis = isTeacher || (s.scheduled_at && differenceInMinutes(new Date(s.scheduled_at), now) <= 10) || s.status === "active";
                  return (
                    <Card key={s.id}>
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">#{s.session_number || "?"}</Badge>
                            <span className="font-medium text-sm">{s.topic || t("Session", "حصة")}</span>
                            {s.status === "active" && <Badge className="bg-green-500">LIVE</Badge>}
                          </div>
                          {s.topic_ar && <p className="text-xs text-muted-foreground mt-1 font-arabic" dir="rtl">{s.topic_ar}</p>}
                          <p className="text-xs text-muted-foreground mt-1">
                            {s.scheduled_at ? format(new Date(s.scheduled_at), "EEE, MMM d 'at' h:mm a") : ""} • {s.duration_minutes || 60}m
                          </p>
                        </div>
                        <Button size="sm" onClick={joinClassroom} disabled={!canJoinThis}>
                          <Video className="h-3 w-3 me-1" />{t("Join", "انضم")}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Past */}
          <div>
            <h3 className="font-semibold mb-3">{t("Past Sessions", "الحصص السابقة")}</h3>
            {pastSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">{t("No past sessions", "لا توجد حصص سابقة")}</p>
            ) : (
              <div className="space-y-2">
                {[...pastSessions].reverse().map((s: any) => {
                  const attended = attendedSessionIds.has(s.id);
                  const rec = recordings.find((r: any) => r.session_id === s.id);
                  const sessionMats = materials.filter((m: any) => (m as any).session_id === s.id);
                  return (
                    <Card key={s.id}>
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">#{s.session_number || "?"}</Badge>
                            <span className="font-medium text-sm">{s.topic || t("Session", "حصة")}</span>
                            {attended ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {s.scheduled_at ? format(new Date(s.scheduled_at), "MMM d, yyyy") : s.created_at ? format(new Date(s.created_at), "MMM d, yyyy") : ""}
                            {s.duration_minutes ? ` • ${s.duration_minutes}m` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {rec && <Badge variant="secondary" className="gap-1"><Video className="h-3 w-3" />🎥</Badge>}
                          {sessionMats.length > 0 && <Badge variant="outline">📎 {sessionMats.length}</Badge>}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ═══ TAB 3: Recordings ═══ */}
        <TabsContent value="recordings" className="mt-4">
          <SubjectRecordings subjectId={subjectId!} />
        </TabsContent>

        {/* ═══ TAB 4: Materials ═══ */}
        <TabsContent value="materials" className="mt-4">
          <SubjectMaterials subjectId={subjectId!} subjectTitle={subject?.title} />
        </TabsContent>

        {/* ═══ TAB: Tasks / Assignments ═══ */}
        <TabsContent value="tasks" className="mt-4">
          <SubjectAssignments subjectId={subjectId!} />
        </TabsContent>

        {/* ═══ TAB 5: Exams & Tests ═══ */}
        <TabsContent value="exams" className="mt-4">
          <Tabs defaultValue="exams-sub">
            <TabsList>
              <TabsTrigger value="exams-sub">{t("Exams", "امتحانات")} ({examsList.length})</TabsTrigger>
              <TabsTrigger value="tests-sub">{t("Tests", "تمرينات")} ({testsList.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="exams-sub" className="space-y-2 mt-3">
              {examsList.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">{t("No exams", "لا توجد امتحانات")}</p>
              ) : examsList.map((exam: any) => {
                const attempt = myAttempts.find((a: any) => a.exam_id === exam.id && a.status === "graded");
                return (
                  <Card key={exam.id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{language === "ar" ? exam.title_ar || exam.title : exam.title}</p>
                        <p className="text-xs text-muted-foreground">{exam.time_limit_minutes}m • {t("Passing", "النجاح")}: {exam.passing_score}%</p>
                      </div>
                      {attempt ? (
                        <div className="flex items-center gap-2">
                          {attempt.passed ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
                          <span className="text-sm font-semibold">{Math.round(attempt.percentage || 0)}%</span>
                        </div>
                      ) : (
                        <Button size="sm" onClick={() => navigate(`/student/exam-verify/${exam.id}`)}>{t("Take Exam", "ابدأ الامتحان")}</Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>
            <TabsContent value="tests-sub" className="space-y-2 mt-3">
              {testsList.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">{t("No tests", "لا توجد تمرينات")}</p>
              ) : testsList.map((test: any) => {
                const attempt = myAttempts.find((a: any) => a.exam_id === test.id && a.status === "graded");
                return (
                  <Card key={test.id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{language === "ar" ? test.title_ar || test.title : test.title}</p>
                        <p className="text-xs text-muted-foreground">{test.time_limit_minutes}m</p>
                      </div>
                      {attempt ? (
                        <div className="flex items-center gap-2">
                          {attempt.passed ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
                          <span className="text-sm font-semibold">{Math.round(attempt.percentage || 0)}%</span>
                        </div>
                      ) : (
                        <Button size="sm" onClick={() => navigate(`/student/exam-verify/${test.id}`)}>{t("Take Test", "ابدأ التمرين")}</Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ═══ TAB 6: Homework ═══ */}
        <TabsContent value="homework" className="mt-4">
          {homework.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t("No homework assigned", "لا توجد واجبات")}</p>
          ) : (
            <div className="space-y-2">
              {homework.map((hw: any) => {
                const session = hw.session_id ? sessions.find((s: any) => s.id === hw.session_id) : null;
                const statusColors: Record<string, string> = { pending: "bg-yellow-100 text-yellow-800", submitted: "bg-blue-100 text-blue-800", graded: "bg-green-100 text-green-800" };
                return (
                  <Card key={hw.id}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{hw.description || t("Homework", "واجب")}</p>
                          {hw.description_ar && <p className="text-xs text-muted-foreground font-arabic" dir="rtl">{hw.description_ar}</p>}
                        </div>
                        <Badge className={statusColors[hw.status] || ""}>{hw.status}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {session && <span>{t("Session", "حصة")} #{(session as any).session_number}</span>}
                        {hw.due_date && <span>{t("Due", "الموعد")}: {format(new Date(hw.due_date), "MMM d")}</span>}
                        {hw.grade != null && <span className="font-semibold text-foreground">{t("Grade", "الدرجة")}: {hw.grade}</span>}
                      </div>
                      {hw.teacher_feedback && <p className="text-xs bg-muted/50 rounded p-2">{t("Feedback", "ملاحظات")}: {hw.teacher_feedback}</p>}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══ TAB 7: Attendance ═══ */}
        <TabsContent value="attendance" className="mt-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold" style={{ color: attendanceRate >= 80 ? '#059669' : attendanceRate >= 60 ? '#D97706' : '#DC2626' }}>{attendanceRate}%</p>
              <p className="text-xs text-muted-foreground">{t("Attendance Rate", "نسبة الحضور")}</p>
            </div>
            <Badge className={attendanceRate >= 80 ? "bg-green-100 text-green-800" : attendanceRate >= 60 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}>
              {attendanceRate >= 80 ? t("Good", "جيد") : attendanceRate >= 60 ? t("Average", "متوسط") : t("Poor", "ضعيف")}
            </Badge>
          </div>
          <div className="space-y-2">
            {pastSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t("No sessions yet", "لا توجد حصص بعد")}</p>
            ) : [...pastSessions].reverse().map((s: any) => {
              const attended = attendedSessionIds.has(s.id);
              return (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div>
                    <span className="text-sm font-medium">#{s.session_number || "?"} {s.topic || ""}</span>
                    <p className="text-xs text-muted-foreground">{s.scheduled_at ? format(new Date(s.scheduled_at), "MMM d, yyyy") : ""}</p>
                  </div>
                  {attended ? <Badge className="bg-green-100 text-green-800 gap-1"><CheckCircle className="h-3 w-3" />{t("Present", "حاضر")}</Badge>
                    : <Badge className="bg-red-100 text-red-800 gap-1"><XCircle className="h-3 w-3" />{t("Absent", "غائب")}</Badge>}
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ═══ TAB 8: Progress ═══ */}
        <TabsContent value="progress" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-primary">{Math.round(avgExam * 0.7)}/70</p><p className="text-xs text-muted-foreground">{t("Avg Exam Score", "معدل الامتحانات")}</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-secondary">{Math.round(avgTest * 0.3)}/30</p><p className="text-xs text-muted-foreground">{t("Avg Test Score", "معدل التمرينات")}</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{attendanceRate}%</p><p className="text-xs text-muted-foreground">{t("Attendance", "الحضور")}</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold" style={{ color: '#D4AF37' }}>{completionPct}%</p><p className="text-xs text-muted-foreground">{t("Overall Progress", "التقدم الكلي")}</p></CardContent></Card>
          </div>
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold mb-3">{t("Completion Breakdown", "تفصيل الإنجاز")}</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1"><span>{t("Sessions Attended", "الحصص المحضورة")}</span><span>{completedSessions}/{totalSessions}</span></div>
                  <Progress value={totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1"><span>{t("Exams Completed", "الامتحانات المكتملة")}</span><span>{examAttempts.length}/{examsList.length}</span></div>
                  <Progress value={examsList.length > 0 ? (examAttempts.length / examsList.length) * 100 : 0} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1"><span>{t("Tests Completed", "التمرينات المكتملة")}</span><span>{testAttempts.length}/{testsList.length}</span></div>
                  <Progress value={testsList.length > 0 ? (testAttempts.length / testsList.length) * 100 : 0} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold mb-3">{t("Current Level", "المستوى الحالي")}</h3>
              <Badge className={`text-lg px-4 py-1 ${levelColors[subjectLevel] || ""}`}>{levelLabel(subjectLevel)}</Badge>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB 9: Revision ═══ */}
        <TabsContent value="revision" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-5 space-y-4 text-center">
              <h3 className="font-semibold text-lg" style={{ color: '#064E3B' }}>{t("Revision Room", "غرفة المراجعة")}</h3>
              <p className="text-sm text-muted-foreground">{t("Access flashcards, quizzes, summaries and notes for this subject", "الوصول إلى البطاقات والاختبارات والملخصات والملاحظات لهذه المادة")}</p>
              <div className="flex gap-3 justify-center flex-wrap">
                <Button variant="outline" onClick={() => navigate(`/student/revision/${subjectId}?tab=flashcards`)}>🃏 {t("Flashcards", "بطاقات")}</Button>
                <Button variant="outline" onClick={() => navigate(`/student/revision/${subjectId}?tab=quiz`)}>📝 {t("Quick Quiz", "اختبار سريع")}</Button>
                <Button variant="outline" onClick={() => navigate(`/student/revision/${subjectId}?tab=summaries`)}>📄 {t("Summaries", "ملخصات")}</Button>
              </div>
              <Button onClick={() => navigate(`/student/revision/${subjectId}`)} style={{ backgroundColor: '#c9973a' }} className="text-white">
                {t("Open Full Revision Room →", "افتح غرفة المراجعة الكاملة →")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SubjectView;
