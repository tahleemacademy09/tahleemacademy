// src/pages/admin/StudentsHub.tsx
// ─────────────────────────────────────────────────────────────────────────
// Merges everything about existing students — which used to be four
// separate, independently-navigated pages — into one page with tabs:
//
//   • All Students   (browse, search & manage)   — was /admin/students
//   • Attendance     (mark & view attendance)     — was /admin/attendance
//   • Transcripts    (CGPA, grades & history)     — was /admin/transcripts
//   • Private Sessions (1-on-1 tuition)           — was /admin/private-sessions
//
// Each original route still exists in App.tsx and renders this same hub —
// they just now open the right tab instead of a standalone page, so none of
// the existing links (sidebar, dashboard cards, ViewAsStudent "back" button,
// classroom notifications, etc.) break.
// ─────────────────────────────────────────────────────────────────────────
import { lazy, Suspense } from "react";
import { Loader2, Users, CheckSquare, GraduationCap, UserCheck } from "lucide-react";
import TabbedHub, { HubTab } from "@/components/admin/TabbedHub";
import { useLanguage } from "@/contexts/LanguageContext";

const G = "#064E3B";

const StudentManagement = lazy(() => import("./StudentManagement"));
const AttendanceManagement = lazy(() => import("./AttendanceManagement"));
const TranscriptManagement = lazy(() => import("./TranscriptManagement"));
const PrivateSessions = lazy(() => import("./PrivateSessions"));

const HubLoading = () => (
  <div className="flex items-center justify-center min-h-[40vh]">
    <Loader2 className="w-7 h-7 animate-spin" style={{ color: G }} />
  </div>
);

// Stable module-level wrapper components — see RegistrationHub.tsx for why
// these are defined once here rather than inline in the component body.
const AllStudentsTab = () => (
  <Suspense fallback={<HubLoading />}>
    <StudentManagement />
  </Suspense>
);
const AttendanceTab = () => (
  <Suspense fallback={<HubLoading />}>
    <AttendanceManagement />
  </Suspense>
);
const TranscriptsTab = () => (
  <Suspense fallback={<HubLoading />}>
    <TranscriptManagement />
  </Suspense>
);
const PrivateSessionsTab = () => (
  <Suspense fallback={<HubLoading />}>
    <PrivateSessions />
  </Suspense>
);

export default function StudentsHub() {
  const { t } = useLanguage();

  const tabs: HubTab[] = [
    {
      key: "all",
      path: "/admin/students",
      label: t("All Students", "جميع الطلاب"),
      icon: Users,
      component: AllStudentsTab,
    },
    {
      key: "attendance",
      path: "/admin/attendance",
      label: t("Attendance", "الحضور والغياب"),
      icon: CheckSquare,
      component: AttendanceTab,
    },
    {
      key: "transcripts",
      path: "/admin/transcripts",
      label: t("Transcripts", "السجلات الأكاديمية"),
      icon: GraduationCap,
      component: TranscriptsTab,
    },
    {
      key: "sessions",
      path: "/admin/private-sessions",
      label: t("Private Sessions", "الجلسات الخاصة"),
      icon: UserCheck,
      component: PrivateSessionsTab,
    },
  ];

  return (
    <TabbedHub
      title={t("Students", "الطلاب")}
      subtitle={t(
        "Everything about a student in one place — profile, attendance, transcripts and private sessions.",
        "كل ما يخص الطالب في مكان واحد — الملف الشخصي، الحضور، السجل الأكاديمي، والجلسات الخاصة.",
      )}
      tabs={tabs}
    />
  );
}
