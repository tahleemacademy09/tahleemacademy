/*  src/pages/student/StudentDashboardV2.tsx
    ── TEST ROUTE — /student/dashboard-v2 ──────────────────────────────────

    Purpose: isolate and test whether a cache-first data layer (React Query +
    localStorage persistence) eliminates the "spinner + stale-looking refetch"
    behaviour students see when reopening the app after minimizing it for a
    few seconds, without touching the existing /student route at all.

    How this differs from StudentDashboard.tsx:
      - StudentDashboard.tsx fetches everything with raw useState/useEffect
        and no cache. Every mount (including a real reload caused by the
        mobile browser discarding the backgrounded tab) starts from
        loading=true and re-runs all 13 queries from scratch, so the user
        always sees a blocking spinner first.
      - This version fetches the exact same data through a single useQuery,
        backed by a LOCAL (page-scoped) QueryClient that persists its cache
        to localStorage. On mount, if a cached copy exists — even after a
        genuine page reload — it paints instantly while silently
        revalidating in the background instead of blocking on a spinner.

    Scope note: this is intentionally a leaner UI than the production
    StudentDashboard (no voice greeting, no calendar widget, no assignment
    preview widget) — the goal here is to validate the data-layer fix first.
    If it resolves the issue, the same pattern gets ported into the full
    dashboard UI and eventually the teacher/admin dashboards.

    Isolation: the QueryClient + persister created here are LOCAL to this
    component tree (via a nested QueryClientProvider), so this experiment
    cannot affect caching behaviour anywhere else in the app.
*/
import { useState, useMemo } from "react";
import {
  QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

import AcademyStatusBanner from "@/components/shared/AcademyStatusBanner";
import NotificationPermissionBanner from "@/components/NotificationPermissionBanner";
import BackgroundRunBanner from "@/components/shared/BackgroundRunBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useImpersonation } from "@/hooks/useImpersonation";
import { usePrivateStudent } from "@/hooks/usePrivateStudent";
import { useVisibleRealtime } from "@/hooks/useVisibleRealtime";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen, ClipboardList, Bell, TrendingUp, GraduationCap,
  Video, AlertTriangle, RefreshCw,
} from "lucide-react";

const DARK_GREEN = "#0f2d1f";
const MID_GREEN  = "#1a4731";
const CREAM      = "#faf6ee";
const TEXT_DARK  = "#0f2d1f";
const TEXT_LIGHT = "#7a9e88";
const BORDER     = "rgba(15,45,31,0.1)";

const gradePoint = (pct: number): number => {
  if (pct >= 85) return 4.0; if (pct >= 75) return 3.5;
  if (pct >= 65) return 3.0; if (pct >= 55) return 2.0;
  if (pct >= 45) return 1.0; return 0.0;
};

const to12hr = (timeStr: string): string => {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
};

/* ── Data shape returned by the single combined query ────────────────── */
interface DashboardData {
  stats: { enrollments: number; attemptsDone: number; avgScore: number; pendingGrading: number; cgpa: number };
  upcomingExams: any[];
  recentResults: any[];
  notifications: any[];
  todayClasses: any[];
}

/* ── The actual fetch — same queries/logic as the production dashboard ── */
async function fetchDashboardData(uid: string, allowGeneralAccess: boolean): Promise<DashboardData> {
  const withTimeout = <T,>(p: Promise<T>, ms = 12000): Promise<T> =>
    Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

  const [
    enrollRes, gradedAttemptsRes, pendingAttemptsRes, notifsRes, assignmentsRes,
    recentRes, allAttemptsRes, calendarExamsRes, ttRes, privateSubjectsRes, studentProfileRes,
  ] = await withTimeout(Promise.all([
    supabase.from("enrollments").select("id").eq("user_id", uid),
    supabase.from("exam_attempts").select("percentage").eq("user_id", uid).eq("status", "graded"),
    supabase.from("exam_attempts").select("id").eq("user_id", uid).eq("status", "submitted"),
    supabase.from("notifications").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(20),
    supabase.from("exam_assignments").select("exam_id, exams(*)").eq("user_id", uid),
    supabase.from("exam_attempts").select("*, exams(title, title_ar)").eq("user_id", uid).in("status", ["graded", "submitted"]).order("submitted_at", { ascending: false }).limit(5),
    supabase.from("exam_attempts").select("exam_id, status, percentage").eq("user_id", uid),
    supabase.from("exams").select("id, title, title_ar, start_date, end_date, time_limit_minutes").eq("is_published", true),
    supabase.from("subject_timetable" as any).select("*, subjects(id, title, title_ar, levels, level, visibility)").eq("day_of_week", new Date().getDay()).eq("is_active", true).order("start_time"),
    (supabase as any).from("private_student_subjects").select("subject_id").eq("student_id", uid),
    supabase.from("profiles").select("level, student_type, assigned_teacher_id").eq("user_id", uid).maybeSingle(),
  ]));

  const gradedAttempts = gradedAttemptsRes.data || [];
  const avg = gradedAttempts.length > 0
    ? gradedAttempts.reduce((s, a) => s + (Number(a.percentage) || 0), 0) / gradedAttempts.length
    : 0;
  const totalGP = gradedAttempts.reduce((sum, a) => sum + gradePoint(Number(a.percentage) || 0), 0);
  const cgpa = gradedAttempts.length > 0 ? totalGP / gradedAttempts.length : 0;

  const attemptCounts: Record<string, number> = {};
  (allAttemptsRes.data || []).forEach((a: any) => {
    if (a.status !== "in_progress") attemptCounts[a.exam_id] = (attemptCounts[a.exam_id] || 0) + 1;
  });
  const allAssigned = (assignmentsRes.data || []).map((a: any) => a.exams).filter((e: any) => e && e.is_published);
  const upcoming = allAssigned.filter((e: any) => (attemptCounts[e.id] || 0) < (e.max_attempts || 1));

  const studentProfileData = studentProfileRes?.data ?? null;
  const studentLevel = (studentProfileData as any)?.level || null;
  const studentType  = (studentProfileData as any)?.student_type || "group";
  const privateIds = new Set<string>((privateSubjectsRes?.data || []).map((r: any) => String(r.subject_id)));

  const allTtSlots: any[] = ttRes.data || [];
  const todayClasses = allTtSlots.filter(slot => {
    const subj = slot.subjects as any;
    if (studentType === "private") {
      const isPrivateSubject = privateIds.has(slot.subject_id);
      if (isPrivateSubject) return true;
      if (!allowGeneralAccess) return false;
    }
    const slotLevels: string[] = slot.levels || [];
    const subjLevels: string[] = subj?.levels || (subj?.level ? [subj.level] : []);
    const allLevels = [...new Set([...slotLevels, ...subjLevels])];
    if (allLevels.length > 0 && studentLevel) return allLevels.includes(studentLevel);
    return true;
  });

  return {
    stats: {
      enrollments: enrollRes.data?.length || 0,
      attemptsDone: gradedAttempts.length,
      avgScore: Math.round(avg),
      pendingGrading: pendingAttemptsRes.data?.length || 0,
      cgpa,
    },
    upcomingExams: upcoming.slice(0, 5),
    recentResults: recentRes.data || [],
    notifications: notifsRes.data || [],
    todayClasses,
  };
}

/* ── Inner content — everything that actually uses useQuery ─────────── */
const DashboardContent = () => {
  const { t, language } = useLanguage();
  const { profile } = useAuth();
  const { effectiveUserId } = useImpersonation();
  const { allowGeneralAccess } = usePrivateStudent();
  const qc = useQueryClient();

  const queryKey = useMemo(
    () => ["student-dashboard-v2", effectiveUserId, allowGeneralAccess] as const,
    [effectiveUserId, allowGeneralAccess],
  );

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchDashboardData(effectiveUserId as string, allowGeneralAccess),
    enabled: !!effectiveUserId,
    staleTime: 5 * 60 * 1000,   // 5 min — data is "fresh enough" to skip a refetch
    gcTime: 24 * 60 * 60 * 1000, // keep in cache (and persisted) for 24h
  });

  // Live notification updates — only while the tab is actually visible,
  // matching the same pattern already used everywhere else in the app.
  useVisibleRealtime(
    () => {
      if (!effectiveUserId) return null;
      return supabase
        .channel("student-notifications-v2")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${effectiveUserId}` },
          (payload) => {
            qc.setQueryData<DashboardData | undefined>(queryKey, (prev) =>
              prev ? { ...prev, notifications: [payload.new as any, ...prev.notifications] } : prev
            );
          }
        )
        .subscribe();
    },
    [effectiveUserId, queryKey],
    () => refetch(),
  );

  // ── First-ever load (nothing cached yet, not even from a previous
  // session) — this is the ONLY time we show a full blocking spinner.
  if (isLoading && !data) {
    return (
      <div style={{ background: CREAM, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", border: "4px solid #064E3B", borderTopColor: "transparent", animation: "spin .7s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div className="container mx-auto flex flex-col items-center justify-center px-4 py-24 text-center">
        <AlertTriangle className="mb-4 h-12 w-12 text-destructive" aria-hidden="true" />
        <h2 className="mb-2 text-xl font-bold">{t("Something went wrong", "حدث خطأ ما")}</h2>
        <p className="mb-6 max-w-sm text-muted-foreground">
          {t("Unable to load your dashboard. Please check your connection and try again.",
             "تعذّر تحميل لوحة التحكم. يرجى التحقق من اتصالك والمحاولة مجدداً.")}
        </p>
        <Button onClick={() => refetch()}>{t("Try Again", "حاول مجدداً")}</Button>
      </div>
    );
  }

  const stats = data?.stats ?? { enrollments: 0, attemptsDone: 0, avgScore: 0, pendingGrading: 0, cgpa: 0 };
  const upcomingExams = data?.upcomingExams ?? [];
  const recentResults = data?.recentResults ?? [];
  const notifications = data?.notifications ?? [];
  const todayClasses = data?.todayClasses ?? [];

  return (
    <div style={{ background: CREAM, minHeight: "100vh", fontFamily: "'Cairo', sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <AcademyStatusBanner />
        <NotificationPermissionBanner />
        <BackgroundRunBanner />

        {/* Test-route banner — tiny, unobtrusive, tells you at a glance
            whether you're looking at cached data or a live refetch. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, color: TEXT_LIGHT, padding: "0 2px" }}>
          <span>Test route — cached dashboard (v2)</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {isFetching && <RefreshCw style={{ width: 11, height: 11 }} className="animate-spin" />}
            {isFetching ? "Syncing…" : "Up to date"}
          </span>
        </div>

        <div style={{
          background: `linear-gradient(160deg, ${DARK_GREEN} 0%, ${MID_GREEN} 50%, #1a5c35 100%)`,
          borderRadius: 22, padding: 20, color: "#fff", boxShadow: "0 8px 32px rgba(15,45,31,0.25)",
        }}>
          <div style={{ fontSize: 13, opacity: 0.85 }}>{t("Welcome back", "أهلاً بعودتك")}</div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Playfair Display', serif" }}>
            {profile?.full_name || t("Student", "طالب")}
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { icon: BookOpen, label: t("Enrollments", "التسجيلات"), value: stats.enrollments },
            { icon: TrendingUp, label: t("Avg Score", "المعدل"), value: `${stats.avgScore}%` },
            { icon: GraduationCap, label: "CGPA", value: stats.cgpa.toFixed(2) },
            { icon: ClipboardList, label: t("Pending Grading", "بانتظار التصحيح"), value: stats.pendingGrading },
          ].map((s, i) => (
            <Card key={i} style={{ border: `1px solid ${BORDER}`, borderRadius: 16 }}>
              <CardContent style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                <s.icon style={{ width: 18, height: 18, color: MID_GREEN }} />
                <div style={{ fontSize: 20, fontWeight: 800, color: TEXT_DARK }}>{s.value}</div>
                <div style={{ fontSize: 11, color: TEXT_LIGHT }}>{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Today's classes */}
        {todayClasses.length > 0 && (
          <Card style={{ border: `1px solid ${BORDER}`, borderRadius: 16 }}>
            <CardHeader style={{ paddingBottom: 8 }}>
              <CardTitle style={{ fontSize: 15 }}>{t("Today's Classes", "حصص اليوم")}</CardTitle>
            </CardHeader>
            <CardContent style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {todayClasses.map((slot: any, i: number) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderTop: i > 0 ? `1px solid ${BORDER}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Video style={{ width: 14, height: 14, color: MID_GREEN }} />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                      {language === "ar" ? (slot.subjects?.title_ar || slot.subjects?.title) : slot.subjects?.title}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: TEXT_LIGHT }}>{to12hr(slot.start_time)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Upcoming exams */}
        <Card style={{ border: `1px solid ${BORDER}`, borderRadius: 16 }}>
          <CardHeader style={{ paddingBottom: 8 }}>
            <CardTitle style={{ fontSize: 15 }}>{t("Upcoming Exams", "الاختبارات القادمة")}</CardTitle>
          </CardHeader>
          <CardContent style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {upcomingExams.length === 0 && (
              <div style={{ fontSize: 13, color: TEXT_LIGHT }}>{t("Nothing upcoming", "لا يوجد شيء قادم")}</div>
            )}
            {upcomingExams.map((exam: any) => (
              <div key={exam.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{language === "ar" ? (exam.title_ar || exam.title) : exam.title}</span>
                <Badge variant="outline" style={{ fontSize: 10 }}>{exam.time_limit_minutes}m</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent results */}
        <Card style={{ border: `1px solid ${BORDER}`, borderRadius: 16 }}>
          <CardHeader style={{ paddingBottom: 8 }}>
            <CardTitle style={{ fontSize: 15 }}>{t("Recent Results", "النتائج الأخيرة")}</CardTitle>
          </CardHeader>
          <CardContent style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recentResults.length === 0 && (
              <div style={{ fontSize: 13, color: TEXT_LIGHT }}>{t("No results yet", "لا توجد نتائج بعد")}</div>
            )}
            {recentResults.map((r: any) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderTop: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{language === "ar" ? (r.exams?.title_ar || r.exams?.title) : r.exams?.title}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: MID_GREEN }}>{r.status === "graded" ? `${Math.round(r.percentage)}%` : t("Pending", "قيد الانتظار")}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card style={{ border: `1px solid ${BORDER}`, borderRadius: 16 }}>
          <CardHeader style={{ paddingBottom: 8 }}>
            <CardTitle style={{ fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
              <Bell style={{ width: 14, height: 14 }} /> {t("Notifications", "الإشعارات")}
            </CardTitle>
          </CardHeader>
          <CardContent style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {notifications.length === 0 && (
              <div style={{ fontSize: 13, color: TEXT_LIGHT }}>{t("No notifications", "لا توجد إشعارات")}</div>
            )}
            {notifications.slice(0, 6).map((n: any) => (
              <div key={n.id} style={{ padding: "8px 0", borderTop: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{n.title}</div>
                {n.message && <div style={{ fontSize: 12, color: TEXT_LIGHT }}>{n.message}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

/* ── Outer wrapper — sets up an isolated, persisted QueryClient ─────────
   Nesting a QueryClientProvider here shadows the app-wide one from App.tsx
   for this subtree only, so this experiment can't change caching behaviour
   anywhere else in the app. */
const StudentDashboardV2 = () => {
  const [{ queryClient, persister }] = useState(() => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000,
          gcTime: 24 * 60 * 60 * 1000,
          retry: 1,
          refetchOnWindowFocus: false,
        },
      },
    });
    const persister = createSyncStoragePersister({
      storage: window.localStorage,
      key: "TAHLEEM_STUDENT_DASHBOARD_V2_CACHE",
      throttleTime: 1000,
    });
    return { queryClient, persister };
  });

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 24 * 60 * 60 * 1000 }}
    >
      <DashboardContent />
    </PersistQueryClientProvider>
  );
};

export default StudentDashboardV2;
