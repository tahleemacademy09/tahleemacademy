// src/pages/admin/HifdhHub.tsx
// -------------------------------------------------------------------------
// One tabbed page for everything Hifdh on the admin side:
//
//   o Hifdh Program        -- was /admin/hifdh-program
//   o Daily Tracker        -- was /admin/hifdh-tracker
//   o Recitation Review    -- was /admin/recitation-review
//   o Recitation Settings  -- was /admin/recitation-test-settings
//
// Each original route still exists in App.tsx and renders this hub with the
// matching tab open, so existing links and bookmarks keep working.
// -------------------------------------------------------------------------
import { lazy, Suspense } from "react";
import { Loader2, BookOpen, ClipboardCheck, Mic, Settings } from "lucide-react";
import TabbedHub, { HubTab } from "@/components/admin/TabbedHub";
import { useLanguage } from "@/contexts/LanguageContext";

const G = "#064E3B";

const HifdhProgramAdmin = lazy(() => import("./HifdhProgramAdmin"));
const HifdhRevisionTracker = lazy(() => import("./HifdhRevisionTracker"));
const HifdhAdminReview = lazy(() => import("./HifdhAdminReview"));
const RecitationTestAdmin = lazy(() => import("./RecitationTestAdmin"));

const HubLoading = () => (
  <div className="flex items-center justify-center min-h-[40vh]">
    <Loader2 className="w-7 h-7 animate-spin" style={{ color: G }} />
  </div>
);

// Stable module-level wrappers (same reason as StudentsHub / RegistrationHub).
const ProgramTab = () => (
  <Suspense fallback={<HubLoading />}>
    <HifdhProgramAdmin />
  </Suspense>
);
const TrackerTab = () => (
  <Suspense fallback={<HubLoading />}>
    <HifdhRevisionTracker />
  </Suspense>
);
const ReviewTab = () => (
  <Suspense fallback={<HubLoading />}>
    <HifdhAdminReview />
  </Suspense>
);
const SettingsTab = () => (
  <Suspense fallback={<HubLoading />}>
    <RecitationTestAdmin />
  </Suspense>
);

export default function HifdhHub() {
  const { t } = useLanguage();

  const tabs: HubTab[] = [
    { key: "program", path: "/admin/hifdh-program", label: t("Hifdh Program", "برنامج الحفظ"), icon: BookOpen, component: ProgramTab },
    { key: "tracker", path: "/admin/hifdh-tracker", label: t("Daily Tracker", "المتابعة اليومية"), icon: ClipboardCheck, component: TrackerTab },
    { key: "review", path: "/admin/recitation-review", label: t("Recitation Review", "مراجعة التلاوة"), icon: Mic, component: ReviewTab },
    { key: "settings", path: "/admin/recitation-test-settings", label: t("Recitation Settings", "إعدادات التلاوة"), icon: Settings, component: SettingsTab },
  ];

  return (
    <TabbedHub
      title={t("Hifdh", "الحفظ")}
      subtitle={t(
        "Program, daily tracker, recitation review and recitation settings in one place.",
        "البرنامج والمتابعة اليومية ومراجعة التلاوة وإعداداتها في مكان واحد.",
      )}
      tabs={tabs}
    />
  );
}
