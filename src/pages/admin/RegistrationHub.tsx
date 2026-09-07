// src/pages/admin/RegistrationHub.tsx
// ─────────────────────────────────────────────────────────────────────────
// Merges everything related to getting a new student enrolled — which used
// to be five separate, independently-navigated pages — into one page with
// tabs:
//
//   • New Registrations   (review students & assign a level)   — was /admin/level-assignment
//   • Pipeline Tracker    (full registration state machine)     — was /admin/tasjeel
//   • Student Registration(manage in-progress registrations)    — was /admin/student-registration
//   • Registration Settings (toggle fees, flow & rules)          — was /admin/registration-settings
//   • Subject Registration  (open/close the subject portal)      — was /admin/subject-registration
//
// Each original route still exists in App.tsx and renders this same hub —
// they just now open the right tab instead of a standalone page, so none of
// the existing links (sidebar, dashboard cards, notification action_urls)
// break.
// ─────────────────────────────────────────────────────────────────────────
import { lazy, Suspense } from "react";
import { Loader2, GraduationCap, ClipboardList, UserCheck, Settings, Layers } from "lucide-react";
import TabbedHub, { HubTab } from "@/components/admin/TabbedHub";
import { useLanguage } from "@/contexts/LanguageContext";

const G = "#064E3B";

const LevelAssignment = lazy(() => import("./LevelAssignment"));
const TasjeelAdmin = lazy(() => import("./TasjeelAdmin"));
const StudentRegistration = lazy(() => import("./StudentRegistration"));
const RegistrationSettings = lazy(() => import("./RegistrationSettings"));
const SubjectRegistrationSettings = lazy(() => import("./SubjectRegistrationSettings"));

const HubLoading = () => (
  <div className="flex items-center justify-center min-h-[40vh]">
    <Loader2 className="w-7 h-7 animate-spin" style={{ color: G }} />
  </div>
);

// Stable module-level wrapper components — defined once, not re-created on
// every render, so switching tabs back and forth doesn't force remounts.
const NewRegistrationsTab = () => (
  <Suspense fallback={<HubLoading />}>
    <LevelAssignment />
  </Suspense>
);
const PipelineTrackerTab = () => (
  <Suspense fallback={<HubLoading />}>
    <TasjeelAdmin />
  </Suspense>
);
const StudentRegistrationTab = () => (
  <Suspense fallback={<HubLoading />}>
    <StudentRegistration />
  </Suspense>
);
const RegistrationSettingsTab = () => (
  <Suspense fallback={<HubLoading />}>
    <RegistrationSettings />
  </Suspense>
);
const SubjectRegistrationTab = () => (
  <Suspense fallback={<HubLoading />}>
    <SubjectRegistrationSettings />
  </Suspense>
);

export default function RegistrationHub() {
  const { t } = useLanguage();

  const tabs: HubTab[] = [
    {
      key: "new",
      path: "/admin/level-assignment",
      label: t("New Registrations", "الطلاب الجدد"),
      icon: GraduationCap,
      component: NewRegistrationsTab,
    },
    {
      key: "pipeline",
      path: "/admin/tasjeel",
      label: t("Pipeline Tracker", "متابعة التسجيل"),
      icon: ClipboardList,
      component: PipelineTrackerTab,
    },
    {
      key: "registration",
      path: "/admin/student-registration",
      label: t("Student Registration", "تسجيل الطلاب"),
      icon: UserCheck,
      component: StudentRegistrationTab,
    },
    {
      key: "settings",
      path: "/admin/registration-settings",
      label: t("Registration Settings", "إعدادات التسجيل"),
      icon: Settings,
      component: RegistrationSettingsTab,
    },
    {
      key: "subjects",
      path: "/admin/subject-registration",
      label: t("Subject Registration", "تسجيل المواد"),
      icon: Layers,
      component: SubjectRegistrationTab,
    },
  ];

  return (
    <TabbedHub
      title={t("Registration", "التسجيل")}
      subtitle={t(
        "Everything needed to get a new student enrolled — review, track, and configure, all in one place.",
        "كل ما يلزم لتسجيل طالب جديد — المراجعة والمتابعة والإعدادات في مكان واحد.",
      )}
      tabs={tabs}
    />
  );
}
