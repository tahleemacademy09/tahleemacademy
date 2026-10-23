// src/pages/student/ProgressHub.tsx
// ─────────────────────────────────────────────────────────────────────────
// "Taqaddumī" (My Progress) — one page for everything a student wants to
// know about how they are doing. It replaces three separate sidebar items:
//
//   • Transcript   (CGPA, grades & history)   — was /student/transcripts  (As-Sijill)
//   • Report Card  (term results)             — was /student/report-card
//   • Attendance   (sessions attended)        — was /student/attendance
//
// Same pattern as the admin StudentsHub: every tab keeps its original route,
// so old links, bookmarks, notification action_urls and the payment gate in
// DashboardLayout keep working — they just open the right tab inside this
// page instead of a standalone screen.
//
// NOTE: /student/report-card/:userId (admin/teacher viewing a student's card)
// is intentionally NOT routed here — it still renders <ReportCard /> directly.
// ─────────────────────────────────────────────────────────────────────────
import { lazy, Suspense } from "react";
import { Loader2, GraduationCap, FileText, CheckSquare } from "lucide-react";
import TabbedHub, { HubTab } from "@/components/admin/TabbedHub";
import { useLanguage } from "@/contexts/LanguageContext";

const G = "#0f2d1f";

const Transcripts       = lazy(() => import("./Transcripts"));
const ReportCard        = lazy(() => import("./ReportCard"));
const StudentAttendance = lazy(() => import("./StudentAttendance"));

const HubLoading = () => (
  <div className="flex items-center justify-center min-h-[40vh]">
    <Loader2 className="w-7 h-7 animate-spin" style={{ color: G }} />
  </div>
);

// Stable module-level wrappers (defined once, not inline in the component
// body) so switching tabs never remounts a tab because of a new identity.
const TranscriptTab = () => (
  <Suspense fallback={<HubLoading />}>
    <Transcripts />
  </Suspense>
);
const ReportCardTab = () => (
  <Suspense fallback={<HubLoading />}>
    <ReportCard />
  </Suspense>
);
const AttendanceTab = () => (
  <Suspense fallback={<HubLoading />}>
    <StudentAttendance />
  </Suspense>
);

export default function ProgressHub() {
  const { t } = useLanguage();

  const tabs: HubTab[] = [
    {
      key: "transcript",
      path: "/student/transcripts",
      label: t("Transcript", "السجل"),
      icon: GraduationCap,
      component: TranscriptTab,
    },
    {
      key: "report-card",
      path: "/student/report-card",
      label: t("Report Card", "الكشف"),
      icon: FileText,
      component: ReportCardTab,
    },
    {
      key: "attendance",
      path: "/student/attendance",
      label: t("Attendance", "الحضور"),
      icon: CheckSquare,
      component: AttendanceTab,
    },
  ];

  return (
    <TabbedHub
      segmented
      title={t("Taqaddumī", "تقدّمي")}
      subtitle={t(
        "My progress — transcript, report card and attendance",
        "السجل الأكاديمي وكشف الدرجات والحضور في مكان واحد",
      )}
      tabs={tabs}
    />
  );
}
