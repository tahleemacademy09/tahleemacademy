// src/components/admin/TabbedHub.tsx
// ─────────────────────────────────────────────────────────────────────────
// Generic "hub" shell for admin pages that used to live as separate,
// independently-routed pages but are really facets of the same job
// (e.g. everything to do with getting a new student enrolled, or
// everything to do with an existing student's record).
//
// Each tab still owns a real route path — so any old link, bookmark,
// sidebar item, or notification action_url that points at one of the
// original URLs keeps working, it just now opens inside the merged page
// with the right tab pre-selected, instead of a standalone screen.
// ─────────────────────────────────────────────────────────────────────────
import { useLocation, useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LucideIcon } from "lucide-react";

const G = "#064E3B";

export interface HubTab {
  /** Stable key used by the Tabs primitive. */
  key: string;
  /** The route path this tab corresponds to (kept for deep-linking). */
  path: string;
  label: string;
  icon?: LucideIcon;
  /** Optional pending-count badge, e.g. pendingRegistrations. */
  badge?: number;
  /** Component to render for this tab — should be a stable reference. */
  component: React.ComponentType;
}

interface TabbedHubProps {
  title: string;
  subtitle?: string;
  tabs: HubTab[];
}

export default function TabbedHub({ title, subtitle, tabs }: TabbedHubProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = tabs.find((tb) => tb.path === location.pathname)?.key ?? tabs[0].key;

  const handleChange = (key: string) => {
    const tab = tabs.find((tb) => tb.key === key);
    if (tab && tab.path !== location.pathname) {
      // Keep the URL in sync with the visible tab so it stays bookmarkable
      // and the browser back button behaves sensibly.
      navigate(tab.path, { replace: false });
    }
  };

  return (
    <div className="w-full">
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2">
        <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: G }}>
          {title}
        </h1>
        {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
      </div>

      <Tabs value={activeTab} onValueChange={handleChange} className="w-full">
        <div className="px-4 sm:px-6">
          <TabsList className="flex flex-wrap h-auto gap-1 w-full sm:w-auto justify-start bg-gray-100 p-1">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className="flex items-center gap-1.5 whitespace-nowrap"
              >
                {tab.icon && <tab.icon className="w-4 h-4" />}
                {tab.label}
                {!!tab.badge && (
                  <span
                    className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold"
                    style={{ background: "#DC2626" }}
                  >
                    {tab.badge}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {tabs.map((tab) => (
          <TabsContent key={tab.key} value={tab.key} className="mt-0">
            <tab.component />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
