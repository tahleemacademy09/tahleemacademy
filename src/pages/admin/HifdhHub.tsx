// src/pages/admin/HifdhHub.tsx
// -------------------------------------------------------------------------
// One tabbed page for everything Hifdh on the admin side:
//
//   o Hifdh Program        -- was /admin/hifdh-program
//   o Daily Tracker        -- was /admin/hifdh-tracker
//   o Recitation Review    -- was /admin/recitation-review
//
// (Recitation Settings belongs to new-student registration, so it now lives
// in the Registration hub, not here.)
//
// The tabs render as one row of coloured icons. Each original route still
// exists in App.tsx and opens this hub on the matching tab.
// -------------------------------------------------------------------------
import { lazy, Suspense } from "react";
import { Loader2, BookOpen, ClipboardCheck, Mic } from "lucide-react";
import TabbedHub, { HubTab } from "@/components/admin/TabbedHub";
import { useLanguage } from "@/contexts/LanguageContext";

const G = "#064E3B";

const HifdhProgramAdmin = lazy(() => import("./HifdhProgramAdmin"));
const HifdhRevisionTracker = lazy(() => import("./HifdhRevisionTracker"));
const HifdhAdminReview = lazy(() => import("./HifdhAdminReview"));

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

export default function HifdhHub() {
  const { t } = useLanguage();

  const tabs: HubTab[] = [
    { key: "program", path: "/admin/hifdh-program", label: t("Hifdh Program", "برنامج الحفظ"), icon: BookOpen, color: "#059669", component: ProgramTab },
    { key: "tracker", path: "/admin/hifdh-tracker", label: t("Daily Tracker", "المتابعة اليومية"), icon: ClipboardCheck, color: "#2563EB", component: TrackerTab },
    { key: "review", path: "/admin/recitation-review", label: t("Recitation Review", "مراجعة التلاوة"), icon: Mic, color: "#7C3AED", component: ReviewTab },
  ];

  return (
    <TabbedHub
      title={t("Hifdh", "الحفظ")}
      tabs={tabs}
      iconOnly
    />
  );
}
