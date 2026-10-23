// src/pages/admin/RegistrationHub.tsx
// ─────────────────────────────────────────────────────────────────────────
// One page for everything about getting a new student enrolled:
//
//   • New Registrations   (review students & assign a level)  — /admin/level-assignment
//   • Pipeline Tracker    (read-only view of where everyone is) — /admin/tasjeel
//   • Registration Settings (open/close, enrollment flow, messages) — /admin/registration-settings
//   • Recitation Settings (new-student recitation test)        — /admin/recitation-test-settings
//   • Diagnostics         (pipeline health, stuck students)    — /admin/registration-diagnostics
//
// Student Registration and the Subject Registration portal tabs were removed.
// Their old URLs still resolve here (they fall back to the first tab).
// ─────────────────────────────────────────────────────────────────────────
import { lazy, Suspense } from "react";
import { Loader2, GraduationCap, ClipboardList, Settings, Mic, Activity } from "lucide-react";
import TabbedHub, { HubTab } from "@/components/admin/TabbedHub";
import { useLanguage } from "@/contexts/LanguageContext";

const G = "#064E3B";

const LevelAssignment = lazy(() => import("./LevelAssignment"));
const TasjeelAdmin = lazy(() => import("./TasjeelAdmin"));
const RegistrationSettings = lazy(() => import("./RegistrationSettings"));
const RecitationTestAdmin = lazy(() => import("./RecitationTestAdmin"));
const RegistrationDiagnostics = lazy(() => import("./RegistrationDiagnostics"));

const HubLoading = () => (
  <div className="flex items-center justify-center min-h-[40vh]">
    <Loader2 className="w-7 h-7 animate-spin" style={{ color: G }} />
  </div>
);

// Stable module-level wrappers so switching tabs doesn't remount.
const NewRegistrationsTab = () => (
  <Suspense fallback={<HubLoading />}><LevelAssignment /></Suspense>
);
const PipelineTrackerTab = () => (
  <Suspense fallback={<HubLoading />}><TasjeelAdmin /></Suspense>
);
const RegistrationSettingsTab = () => (
  <Suspense fallback={<HubLoading />}><RegistrationSettings /></Suspense>
);
const RecitationSettingsTab = () => (
  <Suspense fallback={<HubLoading />}><RecitationTestAdmin /></Suspense>
);
const DiagnosticsTab = () => (
  <Suspense fallback={<HubLoading />}><RegistrationDiagnostics /></Suspense>
);

export default function RegistrationHub() {
  const { t } = useLanguage();

  const tabs: HubTab[] = [
    { key: "new", path: "/admin/level-assignment", label: t("New", "الجدد"), icon: GraduationCap, component: NewRegistrationsTab },
    { key: "pipeline", path: "/admin/tasjeel", label: t("Pipeline", "المتابعة"), icon: ClipboardList, component: PipelineTrackerTab },
    { key: "settings", path: "/admin/registration-settings", label: t("Settings", "الإعدادات"), icon: Settings, component: RegistrationSettingsTab },
    { key: "recitation", path: "/admin/recitation-test-settings", label: t("Recitation", "التلاوة"), icon: Mic, component: RecitationSettingsTab },
    { key: "diagnostics", path: "/admin/registration-diagnostics", label: t("Diagnostics", "التشخيص"), icon: Activity, component: DiagnosticsTab },
  ];

  return (
    <TabbedHub
      hifdh
      title={t("Registration", "التسجيل")}
      subtitle="Review, track and configure new students"
      subtitleAr="إدارة تسجيل الطلاب الجدد"
      tabs={tabs}
    />
  );
}
