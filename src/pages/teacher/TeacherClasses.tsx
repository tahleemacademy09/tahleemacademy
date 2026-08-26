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
import { useSearchParams } from "react-router-dom";
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
import { format, isFuture, isPast, isToday, differenceInMinutes } from "date-fns";
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
        .then(reg => reg.showNotification(title, { body, tag, icon: "/favicon.ico", badge: "/favicon.ico" }))
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
  subjectId?: string,
) {
  try {
    await supabase.from("notifications").insert({
      user_id: userId,
      title,
      message,
      type: "class_reminder",
      // Format: reminder:{sessionId}:{minsAhead}:{subjectId}
      // subjectId lets the notification panel navigate directly without a DB lookup
      link: `reminder:${sessionId}:${minsAhead}${subjectId ? `:${subjectId}` : ""}`,
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
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkHandled = useRef(false);

  const [sessions, setSessions] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    subject_id: "", topic: "", topic_ar: "", date: "", time: "", duration: 60, is_recorded: true,
  });

  // Track which sessions have reminders set (sessionId → true/false)
  const [remindersSet, setRemindersSet] = useState<Record<string, boolean>>({});
  const [expandedPastSubject, setExpandedPastSubject] = useState<string | null>(null);
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
    for (const s of ((ttDirect || []) as any[])) {
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

  // ── Deep-link from notification ─────────────────────────────────────────────
  // schedule-class-reminders / ring-live-class send teachers here with
  // ?subject=<id> so tapping the notification lands on this exact class
  // instead of just the generic classes list. Prefer a session that's
  // actually live right now; fall back to the soonest upcoming one for
  // that subject (covers the 15-min-early tap, before the class goes live).
  useEffect(() => {
    if (deepLinkHandled.current) return;
    if (loading || sessions.length === 0) return;

    const subjectId = searchParams.get("subject");
    if (!subjectId) return;

    const candidates = sessions.filter((s: any) => s.subject_id === subjectId);
    if (candidates.length === 0) { deepLinkHandled.current = true; return; }

    const live = candidates.find((s: any) => s.status === "live");
    const upcoming = candidates
      .filter((s: any) => s.scheduled_at && isFuture(new Date(s.scheduled_at)))
      .sort((a: any, b: any) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];

    const target = live || upcoming;
    deepLinkHandled.current = true;

    if (target) {
      openClassroom(target);
      // Drop the query param so a page refresh doesn't re-trigger the join.
      const next = new URLSearchParams(searchParams);
      next.delete("subject");
      setSearchParams(next, { replace: true });
    }
  }, [loading, sessions, searchParams, setSearchParams]);

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
        await insertDBNotification(user.id, title, body, s.id, mins, s.subject_id);
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
  // "Upcoming Classes" is scoped to TODAY only — a class still shows after its
  // time has passed (faded, not removed) so the teacher can see what already
  // happened today, but tomorrow it drops off entirely.
  const upcoming = sessions
    .filter(s => {
      if (s.status === "active") return true;
      if (s.status === "ended" || s.status === "completed") return false;
      return s.scheduled_at && isToday(new Date(s.scheduled_at));
    })
    .sort((a, b) => {
      const da = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
      const db_ = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
      return da - db_;
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-24">
      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-40 border-b border-white/10 shadow-lg backdrop-blur-md" style={{ background: "linear-gradient(135deg, #064E3B 0%, #083320 100%)" }}>
        <div className="mx-auto max-w-5xl px-3 py-3 sm:px-6 sm:py-5">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 sm:h-11 sm:w-11">
                <Video className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="m-0 truncate text-lg font-black tracking-tight text-white sm:text-xl">{t("Live Classes", "الفصول المباشرة")}</h1>
                <p className="m-0 truncate text-[11px] font-medium text-white/70">{t("Today's schedule and past sessions", "جدول اليوم والحصص السابقة")}</p>
              </div>
            </div>
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <button className="flex shrink-0 items-center gap-1.5 rounded-xl border-0 px-4 py-2.5 text-xs font-black shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-95 sm:gap-2 sm:px-6 sm:text-sm" style={{ background: "#c9a84c", color: "#064E3B" }}>
                  <Plus className="h-4 w-4" />{t("Schedule Class", "جدولة حصة")}
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-md rounded-2xl">
                <DialogHeader><DialogTitle>{t("Schedule New Class", "جدولة حصة جديدة")}</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-bold text-slate-700">{t("Subject", "المادة")}</Label>
                    <Select value={form.subject_id} onValueChange={v => setForm({ ...form, subject_id: v })}>
                      <SelectTrigger className="h-11 rounded-lg"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {subjects.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-sm font-bold text-slate-700">{t("Topic (English)", "الموضوع")}</Label><Input className="h-11 rounded-lg" value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} /></div>
                  <div><Label className="text-sm font-bold text-slate-700">{t("Topic (Arabic)", "الموضوع (عربي)")}</Label><Input dir="rtl" className="h-11 rounded-lg" value={form.topic_ar} onChange={e => setForm({ ...form, topic_ar: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-sm font-bold text-slate-700">{t("Date", "التاريخ")}</Label><Input type="date" className="h-11 rounded-lg" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
                    <div><Label className="text-sm font-bold text-slate-700">{t("Time", "الوقت")}</Label><Input type="time" className="h-11 rounded-lg" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} /></div>
                  </div>
                  <div><Label className="text-sm font-bold text-slate-700">{t("Duration (min)", "المدة (دقائق)")}</Label><Input type="number" className="h-11 rounded-lg" value={form.duration} onChange={e => setForm({ ...form, duration: Number(e.target.value) })} /></div>
                  <div className="flex items-center justify-between rounded-xl border-2 border-slate-200 px-3 py-2.5">
                    <Label className="text-sm font-bold text-slate-700">{t("Record?", "تسجيل؟")}</Label>
                    <Switch checked={form.is_recorded} onCheckedChange={v => setForm({ ...form, is_recorded: v })} />
                  </div>
                  <button onClick={handleCreate} className="w-full rounded-xl py-3 text-sm font-black text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-95" style={{ background: "#064E3B" }}>{t("Schedule", "جدولة")}</button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="mx-auto max-w-5xl space-y-5 px-3 pt-6 sm:px-6 sm:pt-8">

      {/* ── Upcoming / Active ── */}
      <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5 text-emerald-700" />
            {t("Today's Classes", "حصص اليوم")}
            {upcoming.length > 0 && (
              <Badge className="ms-1 rounded-full bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                {upcoming.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 sm:p-6">
          {upcoming.map(s => {
            const isActive = s.status === "active";
            const subInfo = subjects.find(sub => sub.id === s.subject_id) || (s as any).subjects;
            const subTitle = subInfo?.title || "Class";
            const countdown = s.scheduled_at ? getCountdown(s.scheduled_at) : null;
            const hasReminder = remindersSet[s.id];
            const minsUntil = s.scheduled_at ? differenceInMinutes(new Date(s.scheduled_at), new Date()) : Infinity;
            const isImminent = minsUntil <= 15 && minsUntil >= -5;
            // A class whose time has already passed today fades out instead
            // of disappearing — still visible, but visually de-emphasized.
            const isPastToday = !isActive && s.scheduled_at && minsUntil < -5;
            // Only show a topic if it's a real, distinct note from the teacher —
            // not the subject's own name repeated back.
            const topic = (s as any).topic && (s as any).topic !== subTitle ? (s as any).topic : null;

            return (
              <div
                key={s.id}
                className={`rounded-2xl border-2 p-4 space-y-2.5 shadow-sm transition-all ${
                  isActive
                    ? "border-green-500/50 bg-green-50/50 dark:bg-green-950/20"
                    : isImminent
                    ? "border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20"
                    : "border-slate-200 bg-white hover:border-slate-300"
                } ${isPastToday ? "opacity-45" : ""}`}
              >
                {/* Title row: subject name + status badge (if any) */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-sm truncate">{subTitle}</span>
                    {isActive && (
                      <Badge className="bg-green-500 text-white text-xs animate-pulse gap-1 shrink-0">
                        🔴 {t("LIVE", "مباشر")}
                      </Badge>
                    )}
                    {isImminent && !isActive && (
                      <Badge className="bg-amber-500 text-white text-xs gap-1 shrink-0">
                        ⚡ {t("Soon", "قريباً")}
                      </Badge>
                    )}
                  </div>
                  {/* Reminder — small icon-only toggle, doesn't compete with Start */}
                  {!isActive && (
                    <button
                      onClick={() => handleSetReminder(s)}
                      title={hasReminder ? t("Reminder set", "تم ضبط التذكير") : t("Set reminder", "ضبط تذكير")}
                      className={`shrink-0 h-8 w-8 rounded-lg flex items-center justify-center transition-colors ${
                        hasReminder ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground hover:bg-muted/70"
                      }`}
                    >
                      {hasReminder ? <BellRing className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>

                {/* Meta: topic (if distinct) • date/time, with countdown on its own line */}
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {(topic || s.scheduled_at) && (
                    <div className="flex flex-wrap items-center gap-x-1.5">
                      {topic && <span>{topic}</span>}
                      {topic && s.scheduled_at && <span>•</span>}
                      {s.scheduled_at && <span>{format(new Date(s.scheduled_at), "EEE, MMM d 'at' h:mm a")}</span>}
                    </div>
                  )}
                  {countdown && !isActive && !isPastToday && (
                    <div className={`font-bold ${isImminent ? "text-amber-600" : "text-primary"}`}>
                      ⏱ {countdown}
                    </div>
                  )}
                  {isPastToday && (
                    <div className="font-medium text-muted-foreground/70">
                      {t("Ended earlier today", "انتهت اليوم")}
                    </div>
                  )}
                </div>

                {/* Single full-width action */}
                <Button
                  size="sm"
                  className={`w-full gap-1.5 ${
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
              </div>
            );
          })}

          {upcoming.length === 0 && (
            <div className="text-center py-6">
              <Calendar className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">
                {t("No classes scheduled today", "لا توجد حصص مجدولة اليوم")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Past Classes ── */}
      <Card className="overflow-hidden rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-emerald-700" />{t("Past Classes", "الحصص السابقة")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4 sm:p-6">
          {(() => {
            // Group past sessions by subject so the same class run many
            // times doesn't show as a wall of identical-looking rows.
            // Tapping a subject expands its individual past sessions.
            const groups = new Map<string, { subTitle: string; sessions: any[] }>();
            for (const s of past) {
              const subId = (s as any).subject_id || "unknown";
              const subTitle = (s as any).subjects?.title || "Class";
              if (!groups.has(subId)) groups.set(subId, { subTitle, sessions: [] });
              groups.get(subId)!.sessions.push(s);
            }
            const groupList = Array.from(groups.entries())
              .map(([subId, g]) => {
                const sorted = [...g.sessions].sort((a, b) => {
                  const da = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
                  const db_ = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
                  return db_ - da; // most recent first
                });
                return { subId, subTitle: g.subTitle, sessions: sorted, mostRecent: sorted[0] };
              })
              .sort((a, b) => {
                const da = a.mostRecent?.scheduled_at ? new Date(a.mostRecent.scheduled_at).getTime() : 0;
                const db_ = b.mostRecent?.scheduled_at ? new Date(b.mostRecent.scheduled_at).getTime() : 0;
                return db_ - da;
              });

            if (groupList.length === 0) {
              return <p className="text-muted-foreground text-sm">{t("No past classes", "لا توجد حصص سابقة")}</p>;
            }

            return groupList.map(g => {
              const isOpen = expandedPastSubject === g.subId;
              return (
                <div key={g.subId} className="rounded-xl bg-slate-50 border border-slate-200 overflow-hidden">
                  {/* Subject summary row — tap to expand */}
                  <button
                    onClick={() => setExpandedPastSubject(isOpen ? null : g.subId)}
                    className="w-full flex items-center justify-between gap-2 p-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{g.subTitle}</p>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {g.sessions.length} {g.sessions.length === 1 ? t("session", "حصة") : t("sessions", "حصص")}
                        {g.mostRecent?.scheduled_at && ` • ${t("last", "آخر")} ${format(new Date(g.mostRecent.scheduled_at), "MMM d, yyyy")}`}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {isOpen ? t("Hide", "إخفاء") : t("View", "عرض")}
                    </Badge>
                  </button>

                  {/* Expanded: every individual past session for this subject */}
                  {isOpen && (
                    <div className="border-t border-border/60 divide-y divide-border/60">
                      {g.sessions.map(s => {
                        const topic = (s as any).topic && (s as any).topic !== g.subTitle ? (s as any).topic : null;
                        return (
                          <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2.5 bg-background/40">
                            <div className="min-w-0">
                              <p className="text-sm truncate">{topic || g.subTitle}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {s.scheduled_at ? format(new Date(s.scheduled_at), "MMM d, yyyy 'at' h:mm a") : t("No date", "بلا تاريخ")}
                                {typeof s.duration_minutes === "number" && s.duration_minutes > 0 && ` • ${s.duration_minutes}m`}
                                {` • ${s.total_participants || 0} ${t("participants", "مشاركين")}`}
                              </p>
                            </div>
                            <Badge variant="outline" className="shrink-0 text-xs">{t("Ended", "انتهت")}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </CardContent>
      </Card>
      </div>
    </div>
  );
};

export default TeacherClasses;
