// src/pages/student/HifdhPage.tsx
// Tabbed shell for all Hifdh features:
//   Overview (Dashboard) | Revision (QuranRevisionHub) | Test | Memorization
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, BookOpen, ClipboardCheck, Brain } from "lucide-react";
import HifdhDashboard    from "@/components/hifdh/HifdhDashboard";
import HifdhRevision     from "@/pages/student/HifdhRevision";   // QuranRevisionHub
import HifdhTest         from "@/components/hifdh/HifdhTest";
import HifdhMemorization from "@/components/hifdh/HifdhMemorization";

type Tab = "overview" | "revision" | "test" | "memorization";

const TAB_STORAGE_KEY = "hifdh_active_tab";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview",      label: "Overview",      icon: <LayoutDashboard size={13} /> },
  { id: "revision",      label: "Revision",      icon: <BookOpen        size={13} /> },
  { id: "test",          label: "Test",          icon: <ClipboardCheck  size={13} /> },
  { id: "memorization",  label: "Memorize",      icon: <Brain           size={13} /> },
];

const GOLD = "#b7791f";
const INK  = "#1a3d24";

export default function HifdhPage() {
  const [tab, setTab]               = useState<Tab>(() => {
    const saved = localStorage.getItem(TAB_STORAGE_KEY) as Tab | null;
    return saved && ["overview","revision","test","memorization"].includes(saved) ? saved : "overview";
  });
  const [autoStartRevision, setAutoStartRevision] = useState(false);
  const [userId, setUserId]         = useState<string | null>(null);
  const [studentName, setStudentName] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) return;
      setUserId(data.user.id);
      const { data: pf } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id" as any, data.user.id)
        .maybeSingle();
      if ((pf as any)?.full_name) setStudentName((pf as any).full_name);
    });
  }, []);

  // Persist active tab across refreshes
  useEffect(() => { localStorage.setItem(TAB_STORAGE_KEY, tab); }, [tab]);

  return (
    <div className="flex flex-col h-full" style={{ background: "#ffffff" }}>
      {/* ── Tab Bar ── */}
      <div
        className="flex items-center gap-0 shrink-0 border-b"
        style={{ background: "#ffffff", borderColor: "#e8ddd0", boxShadow: "0 1px 6px rgba(26,61,36,.06)" }}>
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setAutoStartRevision(false); }}
              className="flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[9px] font-bold transition-all"
              style={{
                color:        active ? GOLD : "#9aab94",
                borderBottom: active ? `2.5px solid ${GOLD}` : "2.5px solid transparent",
                background:   active ? "#fdf6e3" : "transparent",
              }}>
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-hidden" style={{ background: "#f5f2ec" }}>
        {tab === "overview" && (
          <div className="h-full overflow-y-auto">
            <HifdhDashboard
              userId={userId}
              studentName={studentName}
              activeTab="overview"
              onNavigate={(target) => {
                if (target === "recitation") { setAutoStartRevision(true); setTab("revision"); }
                else if (target === "test")  { setAutoStartRevision(false); setTab("test"); }
                else if (target === "memorize") { setAutoStartRevision(false); setTab("memorization"); }
              }}
            />
          </div>
        )}

        {tab === "revision" && (
          <div className="h-full overflow-hidden">
            {/* HifdhRevision is QuranRevisionHub — pass userId */}
            <HifdhRevision userId={userId} autoStart={autoStartRevision} />
          </div>
        )}

        {tab === "test" && (
          <div className="h-full overflow-y-auto">
            <HifdhTest />
          </div>
        )}

        {tab === "memorization" && (
          <div className="h-full overflow-y-auto">
            <HifdhMemorization />
          </div>
        )}
      </div>
    </div>
  );
}
