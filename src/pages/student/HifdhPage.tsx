// src/pages/student/HifdhPage.tsx
// Tabbed shell — ALL tabs remain mounted (CSS visibility) so state is never lost on tab switch.
// onSessionSaved callback flows from child tabs → Overview to trigger instant re-fetch.
import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, BookOpen, ClipboardCheck, Brain, Loader2 } from "lucide-react";

// ── Lazy-load each tab so Vite puts them in separate chunks ──────────────────
// This eliminates the TDZ "Cannot access 'Xt' before initialization" crash
// caused by duplicate module-level const names colliding inside one shared chunk.
const HifdhDashboard    = lazy(() => import("@/components/hifdh/HifdhDashboard"));
const HifdhRevision     = lazy(() => import("@/pages/student/HifdhRevision"));
const HifdhTest         = lazy(() => import("@/components/hifdh/HifdhTest"));
const HifdhMemorization = lazy(() => import("@/components/hifdh/HifdhMemorization"));

type Tab = "overview" | "revision" | "test" | "memorization";
const TAB_KEY = "hifdh_active_tab";
const HP_GOLD = "#b7791f";

const HP_TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview",     label: "Overview", icon: <LayoutDashboard size={12} /> },
  { id: "revision",     label: "Revision", icon: <BookOpen        size={12} /> },
  { id: "test",         label: "Test",     icon: <ClipboardCheck  size={12} /> },
  { id: "memorization", label: "Memorize", icon: <Brain           size={12} /> },
];

function TabLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 size={28} className="animate-spin" style={{ color: HP_GOLD }} />
    </div>
  );
}

export default function HifdhPage() {
  const [tab, setTab] = useState<Tab>(() => {
    const s = localStorage.getItem(TAB_KEY) as Tab | null;
    return s && HP_TABS.some(t => t.id === s) ? s : "overview";
  });
  const [userId,      setUserId]      = useState<string | null>(null);
  const [studentName, setStudentName] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const triggerRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const prevTab = useRef<Tab>(tab);
  useEffect(() => {
    if (tab === "overview" && prevTab.current !== "overview") triggerRefresh();
    prevTab.current = tab;
  }, [tab, triggerRefresh]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) return;
      setUserId(data.user.id);
      const { data: pf } = await supabase
        .from("profiles").select("full_name")
        .eq("user_id" as any, data.user.id).maybeSingle();
      if ((pf as any)?.full_name) setStudentName((pf as any).full_name);
    });
  }, []);

  useEffect(() => { localStorage.setItem(TAB_KEY, tab); }, [tab]);

  const navigate = useCallback((target: string) => {
    if (target === "recitation") setTab("revision");
    else if (target === "test")  setTab("test");
    else if (target === "memorize") setTab("memorization");
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ background: "#ffffff" }}>
      {/* ── Tab Bar ── */}
      <div className="flex items-center shrink-0 border-b"
        style={{ background: "#ffffff", borderColor: "#e8ddd0", boxShadow: "0 1px 6px rgba(26,61,36,.06)" }}>
        {HP_TABS.map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id}
              onClick={() => setTab(t.id)}
              className="flex-1 flex flex-row items-center justify-center gap-1 py-1 text-[10px] font-bold transition-all"
              style={{
                color:        active ? HP_GOLD : "#9aab94",
                borderBottom: active ? `2px solid ${HP_GOLD}` : "2px solid transparent",
                background:   active ? "#fdf6e3" : "transparent",
              }}>
              {t.icon}{t.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content — ALL tabs stay mounted, hidden ones use display:none ── */}
      <div className="flex-1 overflow-hidden" style={{ background: "#f5f2ec" }}>

        <div className="h-full overflow-y-auto" style={{ display: tab === "overview" ? "block" : "none" }}>
          <Suspense fallback={<TabLoader />}>
            <HifdhDashboard
              userId={userId}
              studentName={studentName}
              onNavigate={navigate}
              refreshKey={refreshKey}
            />
          </Suspense>
        </div>

        <div className="h-full overflow-hidden" style={{ display: tab === "revision" ? "flex" : "none", flexDirection: "column" }}>
          <Suspense fallback={<TabLoader />}>
            <HifdhRevision userId={userId} autoStart={false} onSessionSaved={triggerRefresh} />
          </Suspense>
        </div>

        <div className="h-full overflow-y-auto" style={{ display: tab === "test" ? "block" : "none" }}>
          <Suspense fallback={<TabLoader />}>
            <HifdhTest onSessionSaved={triggerRefresh} />
          </Suspense>
        </div>

        <div className="h-full overflow-y-auto" style={{ display: tab === "memorization" ? "block" : "none" }}>
          <Suspense fallback={<TabLoader />}>
            <HifdhMemorization onSessionSaved={triggerRefresh} />
          </Suspense>
        </div>

      </div>
    </div>
  );
}
