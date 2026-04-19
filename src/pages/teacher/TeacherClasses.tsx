/*
  TeacherClasses.tsx — Tahleem Academy
  ──────────────────────────────────────
  FIX 1: fetchSessions now also fetches sessions where host_id = teacher's user.id
          so admin-assigned classes are never missed.
  FIX 2: Deduplicates merged session arrays (subject-based + host-based).
  FIX 3: Adds per-class "Remind Me" button using the Browser Notification API
          + inserts into the `notifications` table (15-min + 5-min + at-time).
  FIX 4: Auto-schedules reminders on page load for all future sessions.
  FIX 5: Improved upcoming card UI — prominent Join/Start button, LIVE badge,
          countdown pill, and reminder state feedback.

  Teachers call joinClass() → GlobalClassroomOverlay renders the full classroom
  Teachers call leaveClass() → GlobalClassroomOverlay unmounts it
  Refresh while in class → sessionStorage restores → autoJoin skips lobby
*/

import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Video, Plus, Calendar, Clock, Bell, BellOff, BellRing } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { format, isFuture, isPast, differenceInMinutes } from "date-fns";
import { useLiveClass } from "@/contexts/LiveClassContext";

// ── Reminder helpers ──────────────────────────────────────────────────────────

const REMINDER_THRESHOLDS_MIN = [30, 15, 5, 0] as const;

function reminderKey(sessionId: string, minsAhead: number): string {
  return `teacher-reminder:${sessionId}:${minsAhead}`;
}

function alreadyScheduled(sessionId: string, minsAhead: number): boolean {
  try { return localStorage.getItem(reminderKey(sessionId, minsAhead)) === "1"; }
  catch { return false; }
}

function markScheduled(sessionId: string, minsAhead: number) {
  try { localStorage.setItem(reminderKey(sessionId, minsAhead), "1"); } catch {}
}

async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function fireNotification(title: string, body: string, tag: string) {
  try {
    if (Notification.permission !== "granted") return;
    // Try service worker notification first (works when screen is locked)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then(reg => reg.showNotification(title, { body, tag, icon: "/favicon.ico", badge: "/favicon.ico", vibrate: [200, 100, 200] }))
        .catch(() => new Notification(title, { body, tag, icon: "/favicon.ico" }));
    } else {
      new Notification(title, { body, tag, icon: "/favicon.ico" });
    }
    if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
  } catch {}
}

async function insertDBNotification(
  userId: string,
  title: string,
  message: string,
  sessionId: string,
  minsAhead: number,
) {
  try {
    await supabase.from("notifications").insert({
      user_id: userId,
      title,
      message,
      type: "class_reminder",
      link: `reminder:${sessionId}:${minsAhead}`,
      is_read: false,
    } as any);
  } catch {}
}

// ── Component ─────────────────────────────────────────────────────────────────

const TeacherClasses = () => {
  const { joinClass } = useLiveClass();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();

  const [sessions, setSessions] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    subject_id: "", topic: "", topic_ar: "", date: "", time: "", duration: 60, is_recorded: true,
  });

  // Track which sessions have reminders set (sessionId → true/false)
  const [remindersSet, setRemindersSet] = useState<Record<string, boolean>>({});
  const timerRefs = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({});
  const notifPermission = useRef<boolean>(false);

  // ── Fetch sessions ──────────────────────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    if (!user) return;

    // 1. Subjects the teacher OWNS
    const { data: ownedSubs } = await supabase
      .from("subjects").select("id, title, title_ar").eq("teacher_id", user.id);

    // 2. Subjects from timetable slots assigned to this teacher
    const { data: ttSlots } = await supabase
      .from("subject_timetable" as any).select("subject_id").eq("teacher_id", user.id);
    const ttSubjectIds = [...new Set((ttSlots || []).map((s: any) => s.subject_id).filter(Boolean))];

    let extraSubs: any[] = [];
    if (ttSubjectIds.length > 0) {
      const ownedIds = (ownedSubs || []).map((s: any) => s.id);
      const missingIds = ttSubjectIds.filter((id: string) => !ownedIds.includes(id));
      if (missingIds.length > 0) {
        const { data: es } = await supabase
          .from("subjects").select("id, title, title_ar").in("id", missingIds);
        extraSubs = es || [];
      }
    }
    const allSubs = [...(ownedSubs || []), ...extraSubs];
    setSubjects(allSubs);

    const subjectIds = allSubs.map((s: any) => s.id);

    // 3. Sessions via subject_id
    let subjectSessions: any[] = [];
    if (subjectIds.length > 0) {
      const { data } = await supabase
        .from("live_sessions")
        .select("*, subjects(title, title_ar)")
        .in("subject_id", subjectIds)
        .order("scheduled_at", { ascending: false, nullsFirst: false });
      subjectSessions = data || [];
    }

    // 4. FIX: Also fetch sessions where this teacher is the explicit host
    //    (admin may assign teacher as host without subject ownership)
    const { data: hostSessions } = await supabase
      .from("live_sessions")
      .select("*, subjects(title, title_ar)")
      .eq("host_id", user.id)
      .order("scheduled_at", { ascending: false, nullsFirst: false });

    // 5. Merge + deduplicate by session id
    const seen = new Set<string>();
    const merged: any[] = [];
    for (const s of [...subjectSessions, ...(hostSessions || [])]) {
      if (!seen.has(s.id)) { seen.add(s.id); merged.push(s); }
    }
    // Sort descending by scheduled_at
    merged.sort((a, b) => {
      const da = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
      const db_ = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
      return db_ - da;
    });

    // 6. FIX: Also fetch recurring timetable slots and convert to virtual upcoming sessions
    // This surfaces timetable-based classes that have no explicit live_session yet.
    let timetableSlots: any[] = [];
    if (subjectIds.length > 0) {
      const { data: tt } = await supabase
        .from("subject_timetable" as any)
        .select("id, subject_id, day_of_week, start_time, end_time, live_url, subjects(title, title_ar)")
        .eq("is_active", true)
        .in("subject_id", subjectIds);
      timetableSlots = tt || [];
    }
    // Also fetch timetable where teacher_id = user.id directly
    const { data: ttDirect } = await supabase
      .from("subject_timetable" as any)
      .select("id, subject_id, day_of_week, start_time, end_time, live_url, subjects(title, title_ar)")
      .eq("is_active", true)
      .eq("teacher_id", user.id);
    const seenTT = new Set(timetableSlots.map((s: any) => s.id));
    for (const s of (ttDirect || [])) {
      if (!seenTT.has(s.id)) { seenTT.add(s.id); timetableSlots.push(s); }
    }

    // For each timetable slot compute the next occurrence date within 7 days
    const now = new Date();
    const existingSubjectIds = new Set(merged.filter(s => s.status !== "ended" && s.status !== "completed").map((s: any) => s.subject_id));
    const virtualSessions: any[] = [];

    for (const slot of timetableSlots) {
      // Skip if there's already a live_session for this subject that's upcoming
      if (existingSubjectIds.has(slot.subject_id)) continue;

      const targetDay: number = slot.day_of_week ?? -1;
      if (targetDay < 0) continue;

      // Find next occurrence (today or within next 6 days)
      for (let offset = 0; offset <= 6; offset++) {
        const candidate = new Date(now);
        candidate.setDate(now.getDate() + offset);
        if (candidate.getDay() !== targetDay) continue;

        // Set time from start_time (HH:MM)
        if (slot.start_time) {
          const [h, m] = slot.start_time.split(":").map(Number);
          candidate.setHours(h, m, 0, 0);
        }

        // Don't show if already passed today
        if (candidate.getTime() < now.getTime() - 30 * 60_000) continue;

        virtualSessions.push({
          id: `tt-${slot.id}-${offset}`,
          subject_id: slot.subject_id,
          subjects: slot.subjects,
          scheduled_at: candidate.toISOString(),
          status: "scheduled",
          session_number: "—",
          topic: null,
          duration_minutes: null,
          total_participants: 0,
          _isTimetable: true,
          _timetableId: slot.id,
        });
        break; // only next occurrence per slot
      }
    }

    // Merge virtual sessions with live_sessions (virtual sessions go at the end)
    const allSessions = [...merged, ...virtualSessions];
    setSessions(allSessions);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // ── Create session ──────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.subject_id || !form.date || !form.time || !user) return;
    const scheduledAt = new Date(`${form.date}T${form.time}`).toISOString();
    const subjectSessions = sessions.filter(s => s.subject_id === form.subject_id);
    const sessionNum = subjectSessions.length + 1;

    const { error } = await supabase.from("live_sessions").insert({
      subject_id: form.subject_id,
      host_id: user.id,
      status: "scheduled",
      scheduled_at: scheduledAt,
      duration_minutes: form.duration,
      topic: form.topic,
      topic_ar: form.topic_ar,
      session_number: sessionNum,
      is_recorded: form.is_recorded,
    } as any);

    if (!error) {
      await supabase.from("subjects").update({ next_session_at: scheduledAt } as any).eq("id", form.subject_id);
      toast({ title: t("Class scheduled!", "تم جدولة الحصة!") });
      setShowCreate(false);
      setForm({ subject_id: "", topic: "", topic_ar: "", date: "", time: "", duration: 60, is_recorded: true });
      fetchSessions();
    }
  };

  // ── Join classroom ──────────────────────────────────────────────────────────
  const openClassroom = (s: any) => {
    const sub = subjects.find(sub => sub.id === s.subject_id) || (s as any).subjects;
    joinClass({
      id: s.subject_id,
      title: sub?.title || "Class",
      title_ar: sub?.title_ar || "",
    });
  };

  // ── Reminder scheduling ─────────────────────────────────────────────────────
  const scheduleRemindersForSession = useCallback(async (s: any) => {
    if (!user || !s.scheduled_at) return;
    const hasPermission = await requestNotificationPermission();
    notifPermission.current = hasPermission;

    const classDate = new Date(s.scheduled_at);
    const now = Date.now();
    const subTitle = (s as any).subjects?.title || (s as any).topic || "Class";
    const classLabel = `${subTitle} — ${format(classDate, "EEE, MMM d 'at' h:mm a")}`;

    const timers: ReturnType<typeof setTimeout>[] = [];

    for (const mins of REMINDER_THRESHOLDS_MIN) {
      if (alreadyScheduled(s.id, mins)) continue;
      const fireAt = classDate.getTime() - mins * 60_000;
      const delay = fireAt - now;
      if (delay < -60_000) continue; // already past + 1 min buffer

      const title =
        mins === 0  ? t("🔴 Class Starting Now!", "🔴 الحصة تبدأ الآن!") :
        mins === 5  ? t("⏰ Class in 5 Minutes", "⏰ الحصة بعد 5 دقائق") :
        mins === 15 ? t("🔔 Class in 15 Minutes", "🔔 الحصة بعد 15 دقيقة") :
                     t("📅 Class in 30 Minutes", "📅 الحصة بعد 30 دقيقة");

      const body =
        mins === 0  ? t(`It's time to start "${subTitle}". Tap to join!`, `حان وقت بدء "${subTitle}". اضغط للانضمام!`) :
                     t(`"${classLabel}" starts in ${mins} minutes.`, `"${classLabel}" تبدأ بعد ${mins} دقيقة.`);

      const tag = reminderKey(s.id, mins);

      const timer = setTimeout(async () => {
        if (hasPermission) fireNotification(title, body, tag);
        await insertDBNotification(user.id, title, body, s.id, mins);
        markScheduled(s.id, mins);
      }, Math.max(0, delay));

      timers.push(timer);
      markScheduled(s.id, mins); // prevent duplicate scheduling on re-renders
    }

    if (timers.length > 0) {
      timerRefs.current[s.id] = timers;
      setRemindersSet(prev => ({ ...prev, [s.id]: true }));
      return true;
    }
    return false;
  }, [user, t]);

  const handleSetReminder = async (s: any) => {
    if (remindersSet[s.id]) {
      toast({ title: t("Reminder already set ✓", "تم ضبط التذكير مسبقاً ✓") });
      return;
    }
    const ok = await scheduleRemindersForSession(s);
    if (ok === false) {
      if (Notification.permission === "denied") {
        toast({
          title: t("Notifications blocked", "الإشعارات محظورة"),
          description: t("Enable notifications in your browser settings.", "قم بتمكين الإشعارات في إعدادات المتصفح."),
          variant: "destructive",
        });
      } else {
        toast({ title: t("Reminder set! 🔔", "تم ضبط التذكير! 🔔"), description: t("You'll be notified 30, 15, 5 min before class.", "ستُعلَم قبل 30 و15 و5 دقائق من الحصة.") });
      }
    } else {
      toast({ title: t("Reminder set! 🔔", "تم ضبط التذكير! 🔔"), description: t("You'll be notified 30, 15 & 5 min before class.", "ستُعلَم قبل 30 و15 و5 دقائق.") });
    }
  };

  // Auto-schedule reminders for all future sessions on load
  useEffect(() => {
    if (!user || sessions.length === 0) return;
    const futureSessions = sessions.filter(s =>
      s.scheduled_at && isFuture(new Date(s.scheduled_at)) &&
      (s.status === "scheduled" || s.status === "active")
    );
    futureSessions.forEach(s => scheduleRemindersForSession(s));
  }, [sessions, user, scheduleRemindersForSession]);

  // Cleanup timers on unmount
  useEffect(() => {
    const refs = timerRefs.current;
    return () => { Object.values(refs).flat().forEach(clearTimeout); };
  }, []);

  // ── Split upcoming / past ───────────────────────────────────────────────────
  // Priority: status field wins; fallback to date comparison
  const upcoming = sessions.filter(s => {
    if (s.status === "active") return true;
    if (s.status === "ended" || s.status === "completed") return false;
    if (s.status === "scheduled") return true; // keep regardless of date (admin may set stale)
    return s.scheduled_at && isFuture(new Date(s.scheduled_at));
  });

  const past = sessions.filter(s => {
    if (s.status === "ended" || s.status === "completed") return true;
    if (s.status === "active" || s.status === "scheduled") return false;
    return s.scheduled_at && isPast(new Date(s.scheduled_at));
  });

  // ── Countdown label ─────────────────────────────────────────────────────────
  const getCountdown = (scheduledAt: string) => {
    const diff = new Date(scheduledAt).getTime() - Date.now();
    if (diff < 0) return null;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t("Starting now", "يبدأ الآن");
    if (mins < 60) return t(`in ${mins}m`, `بعد ${mins} دقيقة`);
    const h = Math.floor(mins / 60), m = mins % 60;
    return t(`in ${h}h ${m}m`, `بعد ${h} ساعة ${m} دقيقة`);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("Live Classes", "الفصول المباشرة")}</h1>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 me-2" />{t("Schedule Class", "جدولة حصة")}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{t("Schedule New Class", "جدولة حصة جديدة")}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t("Subject", "المادة")}</Label>
                <Select value={form.subject_id} onValueChange={v => setForm({ ...form, subject_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{t("Topic (English)", "الموضوع")}</Label><Input value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} /></div>
              <div><Label>{t("Topic (Arabic)", "الموضوع (عربي)")}</Label><Input dir="rtl" value={form.topic_ar} onChange={e => setForm({ ...form, topic_ar: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("Date", "التاريخ")}</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
                <div><Label>{t("Time", "الوقت")}</Label><Input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} /></div>
              </div>
              <div><Label>{t("Duration (min)", "المدة (دقائق)")}</Label><Input type="number" value={form.duration} onChange={e => setForm({ ...form, duration: Number(e.target.value) })} /></div>
              <div className="flex items-center justify-between">
                <Label>{t("Record?", "تسجيل؟")}</Label>
                <Switch checked={form.is_recorded} onCheckedChange={v => setForm({ ...form, is_recorded: v })} />
              </div>
              <Button onClick={handleCreate} className="w-full">{t("Schedule", "جدولة")}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Upcoming / Active ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t("Upcoming Classes", "الحصص القادمة")}
            {upcoming.length > 0 && (
              <Badge className="bg-primary/20 text-primary border-primary/30 ms-1">
                {upcoming.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {upcoming.map(s => {
            const isActive = s.status === "active";
            const subInfo = subjects.find(sub => sub.id === s.subject_id) || (s as any).subjects;
            const subTitle = subInfo?.title || "Class";
            const countdown = s.scheduled_at ? getCountdown(s.scheduled_at) : null;
            const hasReminder = remindersSet[s.id];
            const minsUntil = s.scheduled_at ? differenceInMinutes(new Date(s.scheduled_at), new Date()) : Infinity;
            const isImminent = minsUntil <= 15 && minsUntil >= -5;

            return (
              <div
                key={s.id}
                className={`rounded-xl border p-4 space-y-3 transition-all ${
                  isActive
                    ? "border-green-500/50 bg-green-50/50 dark:bg-green-950/20"
                    : isImminent
                    ? "border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20"
                    : "border-border bg-muted/30"
                }`}
              >
                {/* Top row: session number + topic + LIVE badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">#{(s as any).session_number || "?"}</Badge>
                    <span className="font-semibold text-sm">
                      {(s as any).topic || subTitle}
                    </span>
                    {isActive && (
                      <Badge className="bg-green-500 text-white text-xs animate-pulse gap-1">
                        🔴 {t("LIVE", "مباشر")}
                      </Badge>
                    )}
                    {(s as any)._isTimetable && !isActive && (
                      <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">
                        🔁 {t("Recurring", "متكرر")}
                      </Badge>
                    )}
                    {isImminent && !isActive && (
                      <Badge className="bg-amber-500 text-white text-xs gap-1">
                        ⚡ {t("Starting soon", "يبدأ قريباً")}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Meta: subject • date • countdown */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span>{subTitle}</span>
                  {s.scheduled_at && (
                    <>
                      <span>•</span>
                      <span>{format(new Date(s.scheduled_at), "EEE, MMM d 'at' h:mm a")}</span>
                    </>
                  )}
                  {(s as any).duration_minutes && (
                    <>
                      <span>•</span>
                      <span>{(s as any).duration_minutes}m</span>
                    </>
                  )}
                  {countdown && !isActive && (
                    <span className={`font-bold ${isImminent ? "text-amber-600" : "text-primary"}`}>
                      ⏱ {countdown}
                    </span>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  {/* Join / Start button */}
                  <Button
                    size="sm"
                    className={`flex-1 gap-1.5 ${
                      isActive
                        ? "bg-green-600 hover:bg-green-700 text-white"
                        : isImminent
                        ? "bg-amber-600 hover:bg-amber-700 text-white"
                        : ""
                    }`}
                    onClick={() => openClassroom(s)}
                  >
                    <Video className="h-3.5 w-3.5" />
                    {isActive
                      ? t("Join Live", "انضم الآن")
                      : t("Start Class", "ابدأ الحصة")}
                  </Button>

                  {/* Reminder button */}
                  <Button
                    size="sm"
                    variant={hasReminder ? "default" : "outline"}
                    className={`gap-1.5 px-3 ${hasReminder ? "bg-primary/20 text-primary border-primary/30 hover:bg-primary/30" : ""}`}
                    onClick={() => handleSetReminder(s)}
                    title={hasReminder ? t("Reminder set", "تم ضبط التذكير") : t("Set reminder", "ضبط تذكير")}
                  >
                    {hasReminder
                      ? <BellRing className="h-3.5 w-3.5" />
                      : <Bell className="h-3.5 w-3.5" />
                    }
                    <span className="text-xs hidden sm:inline">
                      {hasReminder ? t("Reminded", "تم التذكير") : t("Remind", "تذكير")}
                    </span>
                  </Button>
                </div>
              </div>
            );
          })}

          {upcoming.length === 0 && (
            <p className="text-muted-foreground text-sm py-2">
              {t("No upcoming classes", "لا توجد حصص قادمة")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Past Classes ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />{t("Past Classes", "الحصص السابقة")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {past.slice(0, 20).map(s => (
            <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">#{(s as any).session_number || "?"}</Badge>
                  <p className="font-medium text-sm">{(s as any).topic || (s as any).subjects?.title || "Class"}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {(s as any).subjects?.title} •{" "}
                  {s.scheduled_at ? format(new Date(s.scheduled_at), "MMM d, yyyy") : ""} •{" "}
                  {s.total_participants || 0} {t("participants", "مشاركين")}
                </p>
              </div>
              <Badge variant="outline">{t("Ended", "انتهت")}</Badge>
            </div>
          ))}
          {past.length === 0 && (
            <p className="text-muted-foreground text-sm">{t("No past classes", "لا توجد حصص سابقة")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeacherClasses;
