// src/pages/student/HifdhPage.tsx
// Tabbed shell — ALL tabs remain mounted (CSS visibility) so state is never lost on tab switch.
// onSessionSaved callback flows from child tabs → Overview to trigger instant re-fetch.
//
// Restructured into the classical three-tier Hifdh system:
//   Sabaq  — today's NEW memorization portion (HifdhMemorization)
//   Sabqi  — recent revision, drilled hard for ~3 weeks after memorizing (HifdhRevision, tierFilter="sabqi")
//   Manzil — old revision, long-cycle rotation so it never fades (HifdhRevision, tierFilter="manzil")
//   Live   — join the teacher's live Hifdh class queue (HifdhLiveClass)
//
// NOTE: HifdhRevision's tierFilter prop is a planned follow-up patch (see
// project notes) — passing it now is forward-compatible and a no-op until
// that patch lands, so this file ships safely on its own.
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, BookOpen, Repeat, Layers, ClipboardCheck, Radio } from "lucide-react";
import HifdhDashboard    from "@/components/hifdh/HifdhDashboard";
import HifdhRevision     from "@/pages/student/HifdhRevision";
import HifdhTest         from "@/components/hifdh/HifdhTest";
import HifdhMemorization from "@/components/hifdh/HifdhMemorization";
import HifdhLiveClass    from "@/components/hifdh/HifdhLiveClass";
import { H_GOLD as GOLD } from "@/components/hifdh/hifdhTokens";

type Tab = "overview" | "sabaq" | "sabqi" | "manzil" | "test" | "live";
const TAB_KEY = "hifdh_active_tab";
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard size={12} /> },
  { id: "sabaq",    label: "Sabaq",    icon: <BookOpen        size={12} /> },
  { id: "sabqi",    label: "Sabqi",    icon: <Repeat          size={12} /> },
  { id: "manzil",   label: "Manzil",   icon: <Layers          size={12} /> },
  { id: "test",     label: "Test",     icon: <ClipboardCheck  size={12} /> },
  { id: "live",     label: "Live",     icon: <Radio           size={12} /> },
];

export default function HifdhPage() {
  const [tab, setTab] = useState<Tab>(() => {
    const s = localStorage.getItem(TAB_KEY) as Tab | null;
    return s && TABS.some(t => t.id === s) ? s : "overview";
  });
  const [userId,      setUserId]      = useState<string | null>(null);
  const [studentName, setStudentName] = useState("");
  // Incrementing counter → passed as `refreshKey` prop to HifdhDashboard
  // so it re-fetches data whenever any child tab saves a session.
  const [refreshKey, setRefreshKey] = useState(0);
  const triggerRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  // Also refresh whenever user switches back to Overview tab
  const prevTab = useRef<Tab>(tab);
  useEffect(() => {
    if (tab === "overview" && prevTab.current !== "overview") triggerRefresh();
    prevTab.current = tab;
  }, [tab, triggerRefresh]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) return;
      setUserId(data.user.id);
      const { data: pf } = await (supabase as any)
        .from("profiles").select("full_name")
        .eq("user_id" as any, data.user.id).maybeSingle();
      if ((pf as any)?.full_name) setStudentName((pf as any).full_name);
    });
  }, []);

  useEffect(() => { localStorage.setItem(TAB_KEY, tab); }, [tab]);

  // Dashboard "quick action" cards route here — kept for HifdhDashboard's
  // existing onNavigate contract (recitation → sabqi drill, memorize → sabaq,
  // test → test, live → live queue).
  const navigate = useCallback((target: string) => {
    if (target === "recitation") setTab("sabqi");
    else if (target === "test")  setTab("test");
    else if (target === "memorize") setTab("sabaq");
    else if (target === "live") setTab("live");
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ background: "#ffffff" }}>
      {/* ── Tab Bar ── */}
      <div className="flex items-center shrink-0 border-b"
        style={{ background: "#ffffff", borderColor: "#e8ddd0", boxShadow: "0 1px 6px rgba(26,61,36,.06)" }}>
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id}
              onClick={() => setTab(t.id)}
              className="flex-1 flex flex-row items-center justify-center gap-1 py-1 text-[10px] font-bold transition-all"
              style={{
                color:        active ? GOLD : "#9aab94",
                borderBottom: active ? `2px solid ${GOLD}` : "2px solid transparent",
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
          <HifdhDashboard
            userId={userId}
            studentName={studentName}
            onNavigate={navigate}
            refreshKey={refreshKey}
          />
        </div>

        {/* Sabaq — today's new memorization target */}
        <div className="h-full overflow-y-auto" style={{ display: tab === "sabaq" ? "block" : "none" }}>
          <HifdhMemorization onSessionSaved={triggerRefresh} />
        </div>

        {/* Sabqi — recent revision (memorized within the last ~3 weeks) */}
        <div className="h-full overflow-hidden" style={{ display: tab === "sabqi" ? "flex" : "none", flexDirection: "column" }}>
          <HifdhRevision userId={userId} autoStart={true} onSessionSaved={triggerRefresh} tierFilter="sabqi" />
        </div>

        {/* Manzil — old revision, long-cycle rotation */}
        <div className="h-full overflow-hidden" style={{ display: tab === "manzil" ? "flex" : "none", flexDirection: "column" }}>
          <HifdhRevision userId={userId} autoStart={true} onSessionSaved={triggerRefresh} tierFilter="manzil" />
        </div>

        <div className="h-full overflow-y-auto" style={{ display: tab === "test" ? "block" : "none" }}>
          <HifdhTest onSessionSaved={triggerRefresh} />
        </div>

        {/* Live — join the teacher's live Hifdh class (Sabaq/Sabqi/Manzil recitation queue) */}
        <div className="h-full overflow-hidden" style={{ display: tab === "live" ? "flex" : "none", flexDirection: "column" }}>
          <HifdhLiveClass userId={userId} studentName={studentName} isTeacher={false} />
        </div>

      </div>
    </div>
  );
}
