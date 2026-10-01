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
  /** Accent colour, used by the icon-only row (iconOnly). */
  color?: string;
  /** Optional pending-count badge, e.g. pendingRegistrations. */
  badge?: number;
  /** Component to render for this tab — should be a stable reference. */
  component: React.ComponentType;
}

interface TabbedHubProps {
  title: string;
  subtitle?: string;
  tabs: HubTab[];
  /** Render the tabs as one row of coloured icons (no text labels). */
  iconOnly?: boolean;
  /** Dark-green Daily-Hifdh-Revision look: gradient header + underline tab strip. */
  hifdh?: boolean;
  /** Arabic line shown under the title in the hifdh variant. */
  subtitleAr?: string;
}

export default function TabbedHub({ title, subtitle, tabs, iconOnly = false, hifdh = false, subtitleAr }: TabbedHubProps) {
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

  if (hifdh) {
    const G0 = "#061409", G1 = "#0f2d1f", G2 = "#1a3d27", GOLD = "#c9a84c";
    return (
      <div className="w-full" style={{ background: "#faf8f4", minHeight: "100dvh", fontFamily: "'Cairo',sans-serif" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ background: `linear-gradient(165deg,${G0} 0%,${G1} 60%,${G2} 100%)`, padding: "16px 16px 18px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", border: `1px solid ${GOLD}18` }} />
            <div style={{ position: "absolute", bottom: -30, left: -30, width: 140, height: 140, borderRadius: "50%", border: `1px solid ${GOLD}10` }} />
            <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative", zIndex: 1 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 900, fontSize: 17, color: "#fff", letterSpacing: -0.2 }}>{title}</p>
                {(subtitleAr || subtitle) && (
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: `${GOLD}cc` }}>{subtitleAr || subtitle}</p>
                )}
              </div>
              <div style={{ fontFamily: "'Amiri',serif", color: GOLD, fontSize: "1.5em" }}>﷽</div>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={handleChange} className="w-full">
            <TabsList
              className="flex flex-nowrap h-auto w-full justify-start rounded-none p-0 overflow-x-auto"
              style={{ background: "#fff", borderBottom: "1px solid #e5ddd3", scrollbarWidth: "none" as any }}
            >
              {tabs.map((tab) => {
                const on = tab.key === activeTab;
                return (
                  <TabsTrigger
                    key={tab.key}
                    value={tab.key}
                    className="flex-1 flex items-center justify-center gap-1.5 whitespace-nowrap rounded-none shadow-none data-[state=active]:shadow-none"
                    style={{
                      padding: "12px 12px", background: "transparent", fontSize: 12,
                      fontWeight: on ? 800 : 600, color: on ? G2 : "#9CA3AF",
                      borderBottom: on ? `2.5px solid ${G2}` : "2.5px solid transparent",
                    }}
                  >
                    {tab.icon && <tab.icon className="w-4 h-4" />}
                    {tab.label}
                    {!!tab.badge && (
                      <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold" style={{ background: "#DC2626" }}>
                        {tab.badge}
                      </span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {tabs.map((tab) => (
              <TabsContent key={tab.key} value={tab.key} className="mt-0">
                <tab.component />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    );
  }

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
          {iconOnly ? (
            <TabsList className="flex flex-nowrap h-auto gap-2 w-full justify-start bg-transparent p-0 overflow-x-auto">
              {tabs.map((tab) => {
                const c = tab.color || G;
                const on = tab.key === activeTab;
                return (
                  <TabsTrigger
                    key={tab.key}
                    value={tab.key}
                    aria-label={tab.label}
                    title={tab.label}
                    className="relative flex items-center justify-center w-12 h-12 p-0 rounded-xl border shadow-none transition-all data-[state=active]:shadow-none"
                    style={{
                      background: on ? c : c + "1a",
                      borderColor: on ? c : c + "33",
                      color: on ? "#fff" : c,
                    }}
                  >
                    {tab.icon && <tab.icon className="w-6 h-6" />}
                    {!!tab.badge && (
                      <span
                        className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold"
                        style={{ background: "#DC2626" }}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          ) : (
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
          )}
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
